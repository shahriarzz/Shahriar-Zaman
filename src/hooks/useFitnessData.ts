import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Workout, SessionLog, AppState, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { loadInitialFitnessData } from '../utils/fitnessMigration';

export interface FitnessDatabaseSnapshot {
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
}

/**
 * Unified persistence function writing schema version and full snapshot together.
 */
export function persistFitnessDatabase(snapshot: FitnessDatabaseSnapshot): void {
  try {
    localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(snapshot.exerciseDefinitions));
    localStorage.setItem('gl_workouts', JSON.stringify(snapshot.workouts));
    localStorage.setItem('gl_logs', JSON.stringify(snapshot.logs));
    localStorage.setItem('gl_state', JSON.stringify(snapshot.appState));
  } catch (e) {
    console.warn("Failed to persist fitness database snapshot", e);
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

    isInitialized,
    setIsInitialized
  };
}
