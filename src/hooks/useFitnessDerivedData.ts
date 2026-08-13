import { useMemo, useCallback } from 'react';
import { useFitness } from '../context/FitnessContext';
import { SessionLog, SetLog } from '../types/fitness';
import {
  calculateVolume,
  calculateTotalWeightLifted,
  calculateStreak,
  calculateLongestStreak,
  getSortedLogsDescending,
  getExerciseHistory,
  getLatestExerciseSession,
  getAllTimeHeaviestSet,
  getAllTimeBestE1RM,
  getNextCycleDayFromLogs
} from '../utils/fitnessCalculations';
import {
  createExerciseDefinitionMap,
  resolveExercise,
  ResolvedExerciseMeta
} from '../utils/exerciseResolver';
import {
  selectPersonalBests,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectLifetimeStats,
  selectWeightSummary,
  PersonalBestRecord,
  MuscleDistributionStats,
  ExerciseFrequencyStat,
  LifetimeStats,
  WeightSummaryData
} from '../utils/fitnessSelectors';

export interface FitnessDerivedData {
  defsMap: Map<string, any>;
  workoutMap: Map<string, any>;
  sortedLogs: SessionLog[];
  totalVolume: number;
  streak: number;
  longestStreak: number;
  personalBests: PersonalBestRecord[];
  muscleDistribution: MuscleDistributionStats;
  exerciseFrequency: ExerciseFrequencyStat[];
  lifetimeStats: LifetimeStats;
  weightSummary: WeightSummaryData;
  resolveExerciseMeta: (exerciseDefinitionId: string) => ResolvedExerciseMeta;
  getHistoryForExercise: (exerciseDefinitionId: string) => { date: string; sets: SetLog[]; logId: string; maxW: number }[];
  getLatestForExercise: (exerciseDefinitionId: string) => { date: string; sets: SetLog[]; logId: string; maxW: number } | null;
  getHeaviestForExercise: (exerciseDefinitionId: string) => { weight: number; reps: string; date: string } | null;
  getBestE1RMForExercise: (exerciseDefinitionId: string) => { e1rm: number; weight: number; reps: string; date: string } | null;
}

export function useFitnessDerivedData(): FitnessDerivedData {
  const { logs, workouts, exerciseDefinitions, appState } = useFitness();

  // 1. Canonical Definition Map (memoized strictly on exerciseDefinitions)
  const defsMap = useMemo(() => {
    return createExerciseDefinitionMap(exerciseDefinitions);
  }, [exerciseDefinitions]);

  // 2. Workout Lookup Map (memoized strictly on workouts)
  const workoutMap = useMemo(() => {
    const map = new Map<string, any>();
    (workouts || []).forEach(w => map.set(w.id, w));
    return map;
  }, [workouts]);

  // 3. Chronologically sorted logs descending (memoized on logs)
  const sortedLogs = useMemo(() => {
    return getSortedLogsDescending(logs);
  }, [logs]);

  // 4. Lifetime & Aggregate Metrics (memoized on logs)
  const totalVolume = useMemo(() => {
    return calculateTotalWeightLifted(logs);
  }, [logs]);

  const streak = useMemo(() => {
    return calculateStreak(logs);
  }, [logs]);

  const longestStreak = useMemo(() => {
    return calculateLongestStreak(logs);
  }, [logs]);

  const lifetimeStats = useMemo(() => {
    return selectLifetimeStats(logs);
  }, [logs]);

  // 5. Personal Bests across definitions (memoized on logs + defsMap)
  const personalBests = useMemo(() => {
    return selectPersonalBests(logs, defsMap);
  }, [logs, defsMap]);

  // 6. Muscle load distribution (memoized on logs + defsMap)
  const muscleDistribution = useMemo(() => {
    return selectMuscleDistribution(logs, defsMap);
  }, [logs, defsMap]);

  // 7. Exercise frequency ranking (memoized on logs + defsMap)
  const exerciseFrequency = useMemo(() => {
    return selectExerciseFrequency(logs, defsMap);
  }, [logs, defsMap]);

  // 8. Body Weight Biometrics summary (memoized on appState?.weightLog)
  const weightSummary = useMemo(() => {
    return selectWeightSummary(appState?.weightLog);
  }, [appState?.weightLog]);

  // Helper callbacks
  const resolveExerciseMeta = useCallback((exerciseDefinitionId: string): ResolvedExerciseMeta => {
    return resolveExercise(exerciseDefinitionId, defsMap);
  }, [defsMap]);

  const getHistoryForExercise = useCallback((exerciseDefinitionId: string) => {
    return getExerciseHistory(logs, exerciseDefinitionId);
  }, [logs]);

  const getLatestForExercise = useCallback((exerciseDefinitionId: string) => {
    return getLatestExerciseSession(logs, exerciseDefinitionId);
  }, [logs]);

  const getHeaviestForExercise = useCallback((exerciseDefinitionId: string) => {
    return getAllTimeHeaviestSet(logs, exerciseDefinitionId);
  }, [logs]);

  const getBestE1RMForExercise = useCallback((exerciseDefinitionId: string) => {
    return getAllTimeBestE1RM(logs, exerciseDefinitionId);
  }, [logs]);

  return {
    defsMap,
    workoutMap,
    sortedLogs,
    totalVolume,
    streak,
    longestStreak,
    personalBests,
    muscleDistribution,
    exerciseFrequency,
    lifetimeStats,
    weightSummary,
    resolveExerciseMeta,
    getHistoryForExercise,
    getLatestForExercise,
    getHeaviestForExercise,
    getBestE1RMForExercise
  };
}
