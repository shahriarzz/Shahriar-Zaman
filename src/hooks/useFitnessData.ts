import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Workout, SessionLog, AppState, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { loadInitialFitnessData } from '../utils/fitnessMigration';

export function useFitnessData() {
  const [initialData] = useState(() => loadInitialFitnessData());

  const [exerciseDefinitions, setExerciseDefinitionsState] = useState<ExerciseDefinition[]>(initialData.defs);
  const [workouts, setWorkoutsState] = useState<Workout[]>(initialData.workouts);
  const [logs, setLogsState] = useState<Record<string, SessionLog>>(initialData.logs);
  const [appState, setAppStateState] = useState<AppState>(initialData.appState);
  const [isInitialized, setIsInitialized] = useState(true);

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

  // Safe debounced persistence to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(exerciseDefinitions));
    } catch (e) {
      console.warn("Failed to persist gl_exercise_definitions", e);
    }
  }, [exerciseDefinitions]);

  useEffect(() => {
    try {
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
      localStorage.setItem('gl_workouts', JSON.stringify(workouts));
    } catch (e) {
      console.warn("Failed to persist gl_workouts", e);
    }
  }, [workouts]);

  useEffect(() => {
    try {
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
      localStorage.setItem('gl_logs', JSON.stringify(logs));
    } catch (e) {
      console.warn("Failed to persist gl_logs", e);
    }
  }, [logs]);

  useEffect(() => {
    try {
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
      localStorage.setItem('gl_state', JSON.stringify(appState));
    } catch (e) {
      console.warn("Failed to persist gl_state", e);
    }
  }, [appState]);


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

    isInitialized,
    setIsInitialized
  };
}
