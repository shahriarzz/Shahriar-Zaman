import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Workout, SessionLog, AppState, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { loadInitialFitnessData } from '../utils/fitnessMigration';

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
export function persistFitnessDatabase(snapshot: FitnessDatabaseSnapshot): void {
  const versionedPayload: VersionedFitnessSnapshot = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    timestamp: Date.now(),
    data: snapshot
  };

  try {
    const serialized = JSON.stringify(versionedPayload);
    // 1. Stage the write first
    localStorage.setItem('gl_snapshot_staging', serialized);
    // 2. Commit the canonical snapshot atomically
    localStorage.setItem('gl_database_snapshot', serialized);
    // 3. Verify canonical write succeeded before removing staging
    if (localStorage.getItem('gl_database_snapshot') === serialized) {
      localStorage.removeItem('gl_snapshot_staging');
    }

    // 4. Best-effort mirror to legacy discrete keys
    try {
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(snapshot.exerciseDefinitions));
      localStorage.setItem('gl_workouts', JSON.stringify(snapshot.workouts));
      localStorage.setItem('gl_logs', JSON.stringify(snapshot.logs));
      localStorage.setItem('gl_state', JSON.stringify(snapshot.appState));
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    } catch {
      // Discrete key mirroring failure is non-fatal; gl_database_snapshot is authoritative
    }
  } catch (e) {
    console.warn("Storage write failure; preserving previous valid snapshot / staging copy for recovery:", e);
    // Do NOT delete gl_snapshot_staging here! If gl_database_snapshot write failed or threw
    // (e.g. quota exceeded), gl_snapshot_staging may contain a valid recoverable snapshot.
  }
}

export function useFitnessData() {
  const [initialData] = useState(() => loadInitialFitnessData());

  const [exerciseDefinitions, setExerciseDefinitionsState] = useState<ExerciseDefinition[]>(initialData.defs);
  const [workouts, setWorkoutsState] = useState<Workout[]>(initialData.workouts);
  const [logs, setLogsState] = useState<Record<string, SessionLog>>(initialData.logs);
  const [appState, setAppStateState] = useState<AppState>(initialData.appState);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

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
  const resetToDefaultData = useCallback((): FitnessDatabaseSnapshot => {
    localStorage.removeItem('gl_database_snapshot');
    localStorage.removeItem('gl_snapshot_staging');
    localStorage.removeItem('gl_exercise_definitions');
    localStorage.removeItem('gl_workouts');
    localStorage.removeItem('gl_logs');
    localStorage.removeItem('gl_state');
    localStorage.removeItem('gl_deleted_ids');
    localStorage.removeItem('gl_auto_backups');
    localStorage.removeItem('gl_active_session');

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

  // Unified single-point persistence to localStorage
  useEffect(() => {
    if (!isInitialized) return;
    persistFitnessDatabase({
      exerciseDefinitions,
      workouts,
      logs,
      appState
    });
  }, [exerciseDefinitions, workouts, logs, appState, isInitialized]);

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

    applyFitnessDatabaseSnapshot,
    resetToDefaultData,

    isInitialized,
    setIsInitialized
  };
}
