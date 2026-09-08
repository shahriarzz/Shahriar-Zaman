import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { useFitness } from './FitnessContext';
import { SessionLog, Workout, ExerciseDefinition } from '../types/fitness';
import {
  buildFitnessIndex,
  selectWeightSummary,
  selectMuscleDistribution,
  selectNextCycleDay,
  selectCycleDayForDate,
  FitnessIndex,
  ExerciseIndexEntry,
  WeightPRRecord,
  E1RMPRRecord,
  MuscleDistributionStats,
  ExerciseFrequencyStat,
  LifetimeStats,
  WeightSummaryData,
  ExerciseSessionHistoryEntry
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  EMPTY_RESOLVED_EXERCISE,
  getPriorityExercises,
  ResolvedExerciseMeta
} from '../utils/exerciseResolver';
import {
  calculateTrainingStreak,
  calculateTrainingFrequency,
  calculateAdherence,
  calculateStrengthTrend,
  calculatePerformanceScore,
  calculatePREvents,
  selectVolumeForRange,
  StreakInsight,
  TrainingFrequencyInsight,
  AdherenceInsight,
  StrengthTrendInsight,
  PerformanceScoreInsight,
  PREvent,
  DateRange
} from '../utils/trainingIntelligence';

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
  trainingStreak: StreakInsight;
  trainingFrequency: TrainingFrequencyInsight;
  strengthTrend: StrengthTrendInsight;
  adherenceInsight: AdherenceInsight;
  performanceScore: PerformanceScoreInsight;
  weightPRs: WeightPRRecord[];
  e1RMPRs: E1RMPRRecord[];
  prEvents: PREvent[];
  muscleDistribution: MuscleDistributionStats;
  exerciseFrequency: ExerciseFrequencyStat[];
  lifetimeStats: LifetimeStats;
  weightSummary: WeightSummaryData;
  nextCycleDay: number;
  getCycleDayForDate: (targetDate: Date | string) => number;
  resolveExerciseMeta: (exerciseDefinitionId: string) => ResolvedExerciseMeta;
  getHistoryForExercise: (exerciseDefinitionId: string) => ExerciseSessionHistoryEntry[];
  getLatestForExercise: (exerciseDefinitionId: string) => ExerciseSessionHistoryEntry | null;
  getWeightPRForExercise: (exerciseDefinitionId: string) => WeightPRRecord | null;
  getE1RMPRForExercise: (exerciseDefinitionId: string) => E1RMPRRecord | null;
  getStrengthTrendForRange: (currentRange: DateRange, comparisonRange: DateRange) => StrengthTrendInsight;
  getVolumeForRange: (startDate: Date | string, endDate: Date | string) => number;
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

  // 8. Canonical Cycle Day Calculations
  const nextCycleDay = useMemo(() => {
    return selectNextCycleDay(index, workoutMap, appState?.cycleStart);
  }, [index, workoutMap, appState?.cycleStart]);

  const getCycleDayForDate = useCallback((targetDate: Date | string): number => {
    return selectCycleDayForDate(targetDate, index, workoutMap, appState?.cycleStart);
  }, [index, workoutMap, appState?.cycleStart]);

  // 9. Canonical Training Intelligence Calculations
  const [currentDate, setCurrentDate] = React.useState<Date>(() => new Date());

  React.useEffect(() => {
    // Check and update if calendar day has changed
    const checkDayChange = () => {
      const latest = new Date();
      setCurrentDate(prev => {
        if (format(latest, 'yyyy-MM-dd') !== format(prev, 'yyyy-MM-dd')) {
          return latest;
        }
        return prev;
      });
    };

    // 1. Window focus & visibility listener
    const onVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkDayChange();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', onVisibilityOrFocus);
      window.addEventListener('focus', onVisibilityOrFocus);
    }

    // 2. Midnight scheduler: calculate ms until next midnight + 1 second
    let timerId: NodeJS.Timeout | null = null;
    const scheduleNextMidnight = () => {
      const current = new Date();
      const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 1);
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - current.getTime());

      timerId = setTimeout(() => {
        checkDayChange();
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    scheduleNextMidnight();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', onVisibilityOrFocus);
        window.removeEventListener('focus', onVisibilityOrFocus);
      }
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  const todayStr = useMemo(() => format(currentDate, 'yyyy-MM-dd'), [currentDate]);

  const trainingStreak = useMemo(() => {
    return calculateTrainingStreak({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart: appState?.cycleStart,
      now: currentDate
    });
  }, [index, coreWorkoutByCycleDayMap, appState?.cycleStart, currentDate]);

  const trainingFrequency = useMemo(() => {
    return calculateTrainingFrequency({
      index,
      now: currentDate,
      windowDays: 28
    });
  }, [index, currentDate]);

  const adherenceInsight = useMemo(() => {
    return calculateAdherence({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart: appState?.cycleStart,
      now: currentDate
    });
  }, [index, coreWorkoutByCycleDayMap, appState?.cycleStart, currentDate]);

  const strengthTrend = useMemo(() => {
    const currentEndStr = todayStr;
    const currentStartStr = format(subDays(currentDate, 29), 'yyyy-MM-dd');
    const comparisonEndStr = format(subDays(currentDate, 30), 'yyyy-MM-dd');
    const comparisonStartStr = format(subDays(currentDate, 59), 'yyyy-MM-dd');

    return calculateStrengthTrend({
      index,
      currentRange: { start: currentStartStr, end: currentEndStr },
      comparisonRange: { start: comparisonStartStr, end: comparisonEndStr }
    });
  }, [index, currentDate, todayStr]);

  const performanceScore = useMemo(() => {
    const start28Str = format(subDays(currentDate, 27), 'yyyy-MM-dd');
    let sumCompleted = 0;
    let sumPlanned = 0;
    Object.entries(index.plannedSetsByDate).forEach(([d, p]) => {
      if (d >= start28Str && d <= todayStr) {
        sumPlanned += (typeof p === 'number' ? p : Number(p) || 0);
        sumCompleted += (index.completedSetsByDate[d] || 0);
      }
    });
    const completionRate = sumPlanned > 0 ? sumCompleted / sumPlanned : undefined;

    return calculatePerformanceScore({
      adherence: adherenceInsight,
      completionRate,
      strengthTrend,
      index,
      now: currentDate
    });
  }, [adherenceInsight, strengthTrend, index, currentDate, todayStr]);

  // Helper callbacks querying the indexed structures
  const resolveExerciseMeta = useCallback((exerciseDefinitionId: string): ResolvedExerciseMeta => {
    return index.exerciseMetaById.get(exerciseDefinitionId) || {
      ...EMPTY_RESOLVED_EXERCISE,
      id: exerciseDefinitionId || 'unknown'
    };
  }, [index]);

  const getHistoryForExercise = useCallback((exerciseDefinitionId: string): ExerciseSessionHistoryEntry[] => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry) return [];
    return [...entry.sessions];
  }, [index]);

  const getLatestForExercise = useCallback((exerciseDefinitionId: string): ExerciseSessionHistoryEntry | null => {
    const entry = index.exerciseIndex.get(exerciseDefinitionId);
    if (!entry || entry.sessions.length === 0) return null;
    return entry.sessions[0];
  }, [index]);

  const getWeightPRForExercise = useCallback((exerciseDefinitionId: string): WeightPRRecord | null => {
    return index.weightPRsMap.get(exerciseDefinitionId) || null;
  }, [index]);

  const getE1RMPRForExercise = useCallback((exerciseDefinitionId: string): E1RMPRRecord | null => {
    return index.e1RMPRsMap.get(exerciseDefinitionId) || null;
  }, [index]);

  const getStrengthTrendForRange = useCallback((currentRange: DateRange, comparisonRange: DateRange): StrengthTrendInsight => {
    return calculateStrengthTrend({ index, currentRange, comparisonRange });
  }, [index]);

  const getVolumeForRange = useCallback((startDate: Date | string, endDate: Date | string): number => {
    return selectVolumeForRange(index, startDate, endDate);
  }, [index]);

  const prEvents = useMemo(() => {
    return calculatePREvents(index);
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
    streak: trainingStreak.currentStreak,
    longestStreak: trainingStreak.longestStreak,
    trainingStreak,
    trainingFrequency,
    strengthTrend,
    adherenceInsight,
    performanceScore,
    weightPRs: index.weightPRs,
    e1RMPRs: index.e1RMPRs,
    prEvents,
    muscleDistribution,
    exerciseFrequency: index.frequencyByExercise,
    lifetimeStats: index.lifetimeStats,
    weightSummary,
    nextCycleDay,
    getCycleDayForDate,
    resolveExerciseMeta,
    getHistoryForExercise,
    getLatestForExercise,
    getWeightPRForExercise,
    getE1RMPRForExercise,
    getStrengthTrendForRange,
    getVolumeForRange
  }), [
    index,
    defsMap,
    workoutMap,
    coreWorkoutByCycleDayMap,
    priorityExercises,
    trainingStreak,
    trainingFrequency,
    strengthTrend,
    adherenceInsight,
    performanceScore,
    prEvents,
    muscleDistribution,
    weightSummary,
    nextCycleDay,
    getCycleDayForDate,
    resolveExerciseMeta,
    getHistoryForExercise,
    getLatestForExercise,
    getWeightPRForExercise,
    getE1RMPRForExercise,
    getStrengthTrendForRange,
    getVolumeForRange
  ]);

  return (
    <FitnessDerivedContext.Provider value={value}>
      {children}
    </FitnessDerivedContext.Provider>
  );
};
