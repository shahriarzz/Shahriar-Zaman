import { useMemo, useCallback } from 'react';
import { useFitness } from '../context/FitnessContext';
import { SessionLog, SetLog, Workout } from '../types/fitness';
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
  ResolvedExerciseMeta
} from '../utils/exerciseResolver';

export interface FitnessDerivedData {
  index: FitnessIndex;
  defsMap: Map<string, any>;
  workoutMap: Map<string, Workout>;
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

/**
 * Lean, high-performance consumer hook backed entirely by the canonical FitnessIndex.
 */
export function useFitnessDerivedData(): FitnessDerivedData {
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

  // 3. High-Performance Canonical FitnessIndex (Single O(N) pass on logs/definitions change)
  const index = useMemo(() => {
    return buildFitnessIndex(logs, defsMap);
  }, [logs, defsMap]);

  // 4. Body Weight Biometrics summary
  const weightSummary = useMemo(() => {
    return selectWeightSummary(appState?.weightLog);
  }, [appState?.weightLog]);

  // Helper callbacks querying the indexed structures in O(1) time
  const resolveExerciseMeta = useCallback((exerciseDefinitionId: string): ResolvedExerciseMeta => {
    return resolveExercise(exerciseDefinitionId, defsMap);
  }, [defsMap]);

  const getHistoryForExercise = useCallback((exerciseDefinitionId: string): ExerciseSessionHistoryEntry[] => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry) return [];
    return [...entry.sessions].reverse(); // Newest first
  }, [index]);

  const getLatestForExercise = useCallback((exerciseDefinitionId: string): ExerciseSessionHistoryEntry | null => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry || entry.sessions.length === 0) return null;
    return entry.sessions[entry.sessions.length - 1]; // Newest entry in chronological array
  }, [index]);

  const getHeaviestForExercise = useCallback((exerciseDefinitionId: string) => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry || entry.completedSets.length === 0) return null;
    let heaviest: { weight: number; reps: string; date: string } | null = null;
    entry.completedSets.forEach(cs => {
      const w = parseFloat(cs.set.weight) || 0;
      if (w > 0 && (!heaviest || w > heaviest.weight)) {
        heaviest = { weight: w, reps: cs.set.reps || '0', date: cs.date };
      }
    });
    return heaviest;
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

  return {
    index,
    defsMap,
    workoutMap,
    exerciseIndex: index.exerciseIndex,
    sortedLogs: index.sortedLogsDescending,
    totalVolume: index.lifetimeStats.totalVolume,
    totalSets: index.lifetimeStats.totalSets,
    sessionCount: index.lifetimeStats.totalSessions,
    streak: index.lifetimeStats.currentStreak,
    longestStreak: index.lifetimeStats.longestStreak,
    personalBests: index.personalBests,
    muscleDistribution: selectMuscleDistribution(index),
    exerciseFrequency: index.frequencyByExercise,
    lifetimeStats: index.lifetimeStats,
    weightSummary,
    resolveExerciseMeta,
    getHistoryForExercise,
    getLatestForExercise,
    getHeaviestForExercise,
    getBestE1RMForExercise
  };
}
