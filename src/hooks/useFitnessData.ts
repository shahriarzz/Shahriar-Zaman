import React, { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import { Workout, SessionLog, AppState, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { loadInitialFitnessData } from '../utils/fitnessMigration';
import { DatabaseState, databaseTransition } from '../state/persistence/databaseMachine';

export interface FitnessDatabaseSnapshot {
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
}

export interface VersionedFitnessSnapshot {
  schemaVersion: number;
  timestamp: number;
  data: FitnessDatabaseSnapshot;
}

/**
 * Unified persistence function writing a single versioned snapshot payload
 * with staged commit protection against interrupted writes or quota exhaustion.
 *
 * Staged-Write & Recovery Policy:
 * 1. Write the new versioned payload to `gl_snapshot_staging`.
 * 2. Write the canonical payload to `gl_database_snapshot`.
 * 3. Verify that `gl_database_snapshot` was written successfully and matches serialized.
 * 4. Only once the canonical write is verified, remove `gl_snapshot_staging`.
 * 5. On failure (e.g. quota exhaustion during step 2): do NOT delete `gl_snapshot_staging`.
 *    Startup recovery (`loadInitialFitnessData`) detects `gl_snapshot_staging` if the canonical
 *    snapshot was corrupted or interrupted mid-write, and safely promotes it.
 *
 * Legacy Discrete Storage Mirrors:
 * The discrete keys (`gl_exercise_definitions`, `gl_workouts`, `gl_logs`, `gl_state`, `gl_schema_version`)
 * are maintained as a best-effort mirror for backward compatibility with v1.x loaders,
 * external backup scripts, and offline recovery if snapshot corruption occurs.
 */
export function persistFitnessDatabase(snapshot: FitnessDatabaseSnapshot): { success: boolean; error?: string } {
  const versionedPayload: VersionedFitnessSnapshot = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    timestamp: Date.now(),
    data: snapshot
  };

  const serialized = JSON.stringify(versionedPayload);

  // 1. Stage the write first
  try {
    localStorage.setItem('gl_snapshot_staging', serialized);
  } catch (e: any) {
    const errorMsg = `Staging write failure: ${e?.message || String(e)}`;
    console.warn(errorMsg);
    throw new Error(errorMsg);
  }

  // 2. Commit the canonical snapshot atomically
  try {
    localStorage.setItem('gl_database_snapshot', serialized);
  } catch (e: any) {
    const errorMsg = `Canonical snapshot write failure: ${e?.message || String(e)}`;
    console.warn(errorMsg, "; preserving staging copy for recovery");
    throw new Error(errorMsg);
  }

  // 3. Verify canonical write succeeded before removing staging
  const readBack = localStorage.getItem('gl_database_snapshot');
  if (readBack !== serialized) {
    const errorMsg = "Read-back verification failed: written snapshot does not match serialized payload";
    console.warn(errorMsg);
    throw new Error(errorMsg);
  }

  // Only remove staging once the canonical write has been fully committed and verified
  try {
    localStorage.removeItem('gl_snapshot_staging');
  } catch {
    // Non-fatal if removal fails
  }

  // 4. Best-effort mirror to lightweight legacy discrete keys (without duplicating full logs history)
  try {
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(snapshot.exerciseDefinitions));
    localStorage.setItem('gl_workouts', JSON.stringify(snapshot.workouts));
    localStorage.setItem('gl_state', JSON.stringify(snapshot.appState));
    localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    localStorage.removeItem('gl_logs');
  } catch {
    // Discrete key mirroring failure is non-fatal; gl_database_snapshot is authoritative
  }

  return { success: true };
}

export function useFitnessData() {
  const [initialData] = useState(() => loadInitialFitnessData());

  const [exerciseDefinitions, setExerciseDefinitionsState] = useState<ExerciseDefinition[]>(initialData.defs);
  const [workouts, setWorkoutsState] = useState<Workout[]>(initialData.workouts);
  const [logs, setLogsState] = useState<Record<string, SessionLog>>(initialData.logs);
  const [appState, setAppStateState] = useState<AppState>(initialData.appState);

  // Synchronous refs for async & subscription operations
  const exerciseDefsRef = useRef<ExerciseDefinition[]>(exerciseDefinitions);
  const workoutsRef = useRef<Workout[]>(workouts);
  const logsRef = useRef<Record<string, SessionLog>>(logs);
  const appStateRef = useRef<AppState>(appState);

  // Setters that keep refs updated immediately
  const setExerciseDefinitions = useCallback((action: React.SetStateAction<ExerciseDefinition[]>) => {
    setExerciseDefinitionsState(prev => {
      const next = typeof action === 'function' ? (action as (p: ExerciseDefinition[]) => ExerciseDefinition[])(prev) : action;
      exerciseDefsRef.current = next;
      return next;
    });
  }, []);

  const setWorkouts = useCallback((action: React.SetStateAction<Workout[]>) => {
    setWorkoutsState(prev => {
      const next = typeof action === 'function' ? (action as (p: Workout[]) => Workout[])(prev) : action;
      workoutsRef.current = next;
      return next;
    });
  }, []);

  const setLogs = useCallback((action: React.SetStateAction<Record<string, SessionLog>>) => {
    setLogsState(prev => {
      const next = typeof action === 'function' ? (action as (p: Record<string, SessionLog>) => Record<string, SessionLog>)(prev) : action;
      logsRef.current = next;
      return next;
    });
  }, []);

  const setAppState = useCallback((action: React.SetStateAction<AppState>) => {
    setAppStateState(prev => {
      const next = typeof action === 'function' ? (action as (p: AppState) => AppState)(prev) : action;
      appStateRef.current = next;
      return next;
    });
  }, []);

  // Atomic snapshot setter to apply full state without intermediate inconsistent states
  const applyFitnessDatabaseSnapshot = useCallback((snapshot: FitnessDatabaseSnapshot) => {
    exerciseDefsRef.current = snapshot.exerciseDefinitions;
    workoutsRef.current = snapshot.workouts;
    logsRef.current = snapshot.logs;
    appStateRef.current = snapshot.appState;

    setExerciseDefinitionsState(snapshot.exerciseDefinitions);
    setWorkoutsState(snapshot.workouts);
    setLogsState(snapshot.logs);
    setAppStateState(snapshot.appState);
  }, []);

  // Isolate and reset local state to fresh defaults on logout or user switch
  // IndexedDB backup clearing is separated to its authoritative manager/coordinator
  const resetToDefaultData = useCallback((): FitnessDatabaseSnapshot => {
    localStorage.removeItem('gl_database_snapshot');
    localStorage.removeItem('gl_snapshot_staging');
    localStorage.removeItem('gl_exercise_definitions');
    localStorage.removeItem('gl_workouts');
    localStorage.removeItem('gl_logs');
    localStorage.removeItem('gl_state');
    localStorage.removeItem('gl_deleted_ids');

    const fresh = loadInitialFitnessData();
    const snapshot: FitnessDatabaseSnapshot = {
      exerciseDefinitions: fresh.defs,
      workouts: fresh.workouts,
      logs: fresh.logs,
      appState: fresh.appState
    };
    applyFitnessDatabaseSnapshot(snapshot);
    return snapshot;
  }, [applyFitnessDatabaseSnapshot]);

  const [databaseLifecycleState, dispatchDb] = useReducer(databaseTransition, { phase: 'ready' });

  // Explicit confirmation-confirmed local commit boundary for domain snapshots
  const lastPersistedSerializedRef = useRef<string>('');
  const lastPersistedRevisionRef = useRef<number>(0);

  const commitFitnessSnapshot = useCallback((partialSnapshot: Partial<FitnessDatabaseSnapshot>): { success: boolean; snapshot: FitnessDatabaseSnapshot } => {
    const nextSnapshot: FitnessDatabaseSnapshot = {
      exerciseDefinitions: partialSnapshot.exerciseDefinitions ?? exerciseDefsRef.current,
      workouts: partialSnapshot.workouts ?? workoutsRef.current,
      logs: partialSnapshot.logs ?? logsRef.current,
      appState: partialSnapshot.appState ?? appStateRef.current
    };

    dispatchDb({ type: 'WRITE_STARTED' });
    try {
      persistFitnessDatabase(nextSnapshot);
      lastPersistedSerializedRef.current = JSON.stringify(nextSnapshot);
      lastPersistedRevisionRef.current += 1;
      dispatchDb({ type: 'WRITE_COMMITTED' });
    } catch (err: any) {
      dispatchDb({ type: 'WRITE_FAILED', error: err?.message || String(err) });
      throw err;
    }

    // Synchronously update refs to represent committed data immediately
    exerciseDefsRef.current = nextSnapshot.exerciseDefinitions;
    workoutsRef.current = nextSnapshot.workouts;
    logsRef.current = nextSnapshot.logs;
    appStateRef.current = nextSnapshot.appState;

    // Publish committed state to React consumers
    if (partialSnapshot.exerciseDefinitions) setExerciseDefinitionsState(nextSnapshot.exerciseDefinitions);
    if (partialSnapshot.workouts) setWorkoutsState(nextSnapshot.workouts);
    if (partialSnapshot.logs) setLogsState(nextSnapshot.logs);
    if (partialSnapshot.appState) setAppStateState(nextSnapshot.appState);

    return { success: true, snapshot: nextSnapshot };
  }, []);

  // Background persistence effect with deduplication to prevent racing with explicit commits
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    const currentSnapshot: FitnessDatabaseSnapshot = {
      exerciseDefinitions,
      workouts,
      logs,
      appState
    };
    const currentSerialized = JSON.stringify(currentSnapshot);
    // Skip redundant persistence if this exact snapshot payload was already committed explicitly
    if (currentSerialized === lastPersistedSerializedRef.current) {
      return;
    }

    dispatchDb({ type: 'WRITE_STARTED' });
    try {
      persistFitnessDatabase(currentSnapshot);
      lastPersistedSerializedRef.current = currentSerialized;
      lastPersistedRevisionRef.current += 1;
      dispatchDb({ type: 'WRITE_COMMITTED' });
    } catch (err: any) {
      dispatchDb({ type: 'WRITE_FAILED', error: err?.message || String(err) });
    }
  }, [exerciseDefinitions, workouts, logs, appState]);

  return {
    exerciseDefinitions,
    setExerciseDefinitions,
    exerciseDefsRef,

    workouts,
    setWorkouts,
    workoutsRef,

    logs,
    setLogs,
    logsRef,

    appState,
    setAppState,
    appStateRef,

    databaseLifecycleState,
    applyFitnessDatabaseSnapshot,
    resetToDefaultData,
    commitFitnessSnapshot
  };
}
