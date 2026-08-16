import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useFitness } from './FitnessContext';
import { SessionLog, Workout, ExerciseDefinition } from '../types/fitness';
import {
  buildFitnessIndex,
  selectWeightSummary,
  selectMuscleDistribution,
  FitnessIndex,
  ExerciseIndexEntry,
  PersonalBestRecord,
  MuscleDistributionStats,
  ExerciseFrequencyStat,
  LifetimeStats,
  WeightSummaryData,
  ExerciseSessionHistoryEntry
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise,
  getPriorityExercises,
  ResolvedExerciseMeta
} from '../utils/exerciseResolver';

export interface FitnessDerivedData {
  index: FitnessIndex;
  defsMap: Map<string, ExerciseDefinition>;
  workoutMap: Map<string, Workout>;
  coreWorkoutByCycleDayMap: Map<number, Workout>;
  priorityExercises: ResolvedExerciseMeta[];
  exerciseIndex: Map<string, ExerciseIndexEntry>;
  sortedLogs: SessionLog[];
  totalVolume: number;
  totalSets: number;
  sessionCount: number;
  streak: number;
  longestStreak: number;
  personalBests: PersonalBestRecord[];
  muscleDistribution: MuscleDistributionStats;
  exerciseFrequency: ExerciseFrequencyStat[];
  lifetimeStats: LifetimeStats;
  weightSummary: WeightSummaryData;
  resolveExerciseMeta: (exerciseDefinitionId: string) => ResolvedExerciseMeta;
  getHistoryForExercise: (exerciseDefinitionId: string) => ExerciseSessionHistoryEntry[];
  getLatestForExercise: (exerciseDefinitionId: string) => ExerciseSessionHistoryEntry | null;
  getHeaviestForExercise: (exerciseDefinitionId: string) => { weight: number; reps: string; date: string } | null;
  getBestE1RMForExercise: (exerciseDefinitionId: string) => { e1rm: number; weight: number; reps: string; date: string } | null;
}

export const FitnessDerivedContext = createContext<FitnessDerivedData | null>(null);

export const FitnessDerivedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logs, workouts, exerciseDefinitions, appState } = useFitness();

  // 1. Canonical Definition Map
  const defsMap = useMemo(() => {
    return createExerciseDefinitionMap(exerciseDefinitions);
  }, [exerciseDefinitions]);

  // 2. Workout Lookup Map
  const workoutMap = useMemo(() => {
    const map = new Map<string, Workout>();
    (workouts || []).forEach(w => map.set(w.id, w));
    return map;
  }, [workouts]);

  // 3. Core Workout by Cycle Day Map
  const coreWorkoutByCycleDayMap = useMemo(() => {
    const map = new Map<number, Workout>();
    (workouts || []).forEach(w => {
      if (w.isCore && typeof w.cycleDay === 'number') {
        map.set(w.cycleDay, w);
      }
    });
    return map;
  }, [workouts]);

  // 4. Priority & Compound Exercises for Strength Progression
  const priorityExercises = useMemo(() => {
    return getPriorityExercises(exerciseDefinitions || [], workouts || [], defsMap);
  }, [exerciseDefinitions, workouts, defsMap]);

  // 5. Canonical FitnessIndex (Single O(N) pass on logs/definitions change)
  const index = useMemo(() => {
    return buildFitnessIndex(logs, defsMap);
  }, [logs, defsMap]);

  // 6. Body Weight Biometrics summary
  const weightSummary = useMemo(() => {
    return selectWeightSummary(appState?.weightLog);
  }, [appState?.weightLog]);

  // 7. Muscle Distribution summary
  const muscleDistribution = useMemo(() => {
    return selectMuscleDistribution(index);
  }, [index]);

  // Helper callbacks querying the indexed structures
  const resolveExerciseMeta = useCallback((exerciseDefinitionId: string): ResolvedExerciseMeta => {
    return index.exerciseMetaById.get(exerciseDefinitionId) || resolveExercise(exerciseDefinitionId, defsMap);
  }, [index, defsMap]);

  const getHistoryForExercise = useCallback((exerciseDefinitionId: string): ExerciseSessionHistoryEntry[] => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry) return [];
    return [...entry.sessions].reverse();
  }, [index]);

  const getLatestForExercise = useCallback((exerciseDefinitionId: string): ExerciseSessionHistoryEntry | null => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry || entry.sessions.length === 0) return null;
    return entry.sessions[entry.sessions.length - 1];
  }, [index]);

  const getHeaviestForExercise = useCallback((exerciseDefinitionId: string) => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry || !entry.heaviestSet) return null;
    return entry.heaviestSet;
  }, [index]);

  const getBestE1RMForExercise = useCallback((exerciseDefinitionId: string) => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry || !entry.bestE1RM) return null;
    return {
      e1rm: entry.bestE1RM.maxEpley,
      weight: entry.bestE1RM.maxWeight,
      reps: String(entry.bestE1RM.repsAtMax),
      date: entry.bestE1RM.date
    };
  }, [index]);

  const value: FitnessDerivedData = useMemo(() => ({
    index,
    defsMap,
    workoutMap,
    coreWorkoutByCycleDayMap,
    priorityExercises,
    exerciseIndex: index.exerciseIndex,
    sortedLogs: index.sortedLogsDescending,
    totalVolume: index.lifetimeStats.totalVolume,
    totalSets: index.lifetimeStats.totalSets,
    sessionCount: index.lifetimeStats.totalSessions,
    streak: index.lifetimeStats.currentStreak,
    longestStreak: index.lifetimeStats.longestStreak,
    personalBests: index.personalBests,
    muscleDistribution,
    exerciseFrequency: index.frequencyByExercise,
    lifetimeStats: index.lifetimeStats,
    weightSummary,
    resolveExerciseMeta,
    getHistoryForExercise,
    getLatestForExercise,
    getHeaviestForExercise,
    getBestE1RMForExercise
  }), [
    index,
    defsMap,
    workoutMap,
    coreWorkoutByCycleDayMap,
    priorityExercises,
    muscleDistribution,
    weightSummary,
    resolveExerciseMeta,
    getHistoryForExercise,
    getLatestForExercise,
    getHeaviestForExercise,
    getBestE1RMForExercise
  ]);

  return (
    <FitnessDerivedContext.Provider value={value}>
      {children}
    </FitnessDerivedContext.Provider>
  );
};
