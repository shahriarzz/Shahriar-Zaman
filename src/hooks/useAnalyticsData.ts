import { useMemo } from 'react';
import { SessionLog, Workout, ExerciseDefinition, AppState, WorkoutType } from '../types/fitness';
import {
  buildFitnessIndex,
  selectTimeRangeAnalytics,
  FitnessIndex
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  getPriorityExercises,
  MUSCLE_CATEGORIES,
  MuscleCategory
} from '../utils/exerciseResolver';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { SEMANTIC_COLORS } from '../components/ui';
import { useCalendarGrid } from './useCalendarGrid';

export type TimeRange = '7d' | '30d' | '90d' | 'all';
export type MuscleMetric = 'volume' | 'sets' | 'frequency';

export interface UseAnalyticsDataParams {
  logs: Record<string, SessionLog>;
  workouts: Workout[];
  exerciseDefinitions: ExerciseDefinition[];
  appState: AppState | null;
  timeRange: TimeRange;
  muscleMetric: MuscleMetric;
  selected1RMExerciseId: string | null;
  currentHeatmapMonth: Date;
}

export function useAnalyticsData({
  logs,
  workouts,
  exerciseDefinitions,
  appState,
  timeRange,
  muscleMetric,
  selected1RMExerciseId,
  currentHeatmapMonth
}: UseAnalyticsDataParams) {
  // Fast workout maps
  const workoutMap = useMemo(() => {
    const map = new Map<string, Workout>();
    (workouts || []).forEach(w => map.set(w.id, w));
    return map;
  }, [workouts]);

  const coreWorkoutByCycleDayMap = useMemo(() => {
    const map = new Map<number, Workout>();
    (workouts || []).forEach(w => {
      if (w.isCore && typeof w.cycleDay === 'number') {
        map.set(w.cycleDay, w);
      }
    });
    return map;
  }, [workouts]);

  // 1. Memoized canonical definitions map
  const defsMap = useMemo(() => {
    return createExerciseDefinitionMap(exerciseDefinitions || []);
  }, [exerciseDefinitions]);

  // 2. Priority & Compound Exercises for Strength Progression
  const priorityExercises = useMemo(() => {
    return getPriorityExercises(exerciseDefinitions || [], workouts || [], defsMap);
  }, [exerciseDefinitions, workouts, defsMap]);

  // Active 1RM selection
  const active1RMExerciseId = selected1RMExerciseId || priorityExercises[0]?.id || '';

  // 3. High-Performance Canonical FitnessIndex
  const index: FitnessIndex = useMemo(() => {
    return buildFitnessIndex(logs, defsMap);
  }, [logs, defsMap]);

  // 4. Time Range Slice & Aggregated Metrics
  const aggregated = useMemo(() => {
    return selectTimeRangeAnalytics(
      index,
      defsMap,
      workouts,
      timeRange,
      appState?.cycleStart,
      active1RMExerciseId
    );
  }, [index, defsMap, workouts, timeRange, appState?.cycleStart, active1RMExerciseId]);

  // 5. Heatmap calendar data
  const heatmapData = useCalendarGrid({
    monthDate: currentHeatmapMonth,
    logs,
    workouts,
    weekStartsOn: 1
  });

  // 6. Muscle chart data formatted for Recharts
  const muscleChartData = useMemo(() => {
    return MUSCLE_CATEGORIES.map(cat => {
      let val = 0;
      if (muscleMetric === 'volume') {
        val = aggregated.rangeMuscleVolume[cat] || 0;
      } else if (muscleMetric === 'sets') {
        val = aggregated.rangeMuscleSets[cat] || 0;
      } else {
        val = aggregated.rangeMuscleFrequency[cat]?.size || (typeof aggregated.rangeMuscleFrequency[cat] === 'number' ? aggregated.rangeMuscleFrequency[cat] as number : 0);
      }
      return {
        category: cat,
        value: val,
        formattedVal: muscleMetric === 'volume' ? `${(val / 1000).toFixed(1)}k kg` : `${val}`
      };
    });
  }, [muscleMetric, aggregated.rangeMuscleVolume, aggregated.rangeMuscleSets, aggregated.rangeMuscleFrequency]);

  // 7. Workout Distribution Pie Chart Data
  const workoutPieData = useMemo(() => {
    return (Object.entries(aggregated.workoutTypeDistribution) as [string, number][])
      .map(([type, count]) => ({
        name: type.toUpperCase(),
        type,
        value: count,
        color: WORKOUT_COLORS[type as WorkoutType] || SEMANTIC_COLORS.zinc
      }))
      .sort((a, b) => b.value - a.value);
  }, [aggregated.workoutTypeDistribution]);

  // 8. Data-derived Insights
  const insightsList = useMemo(() => {
    const list: string[] = [];

    if (aggregated.rangeLogsCount === 0) {
      return ['No completed training logs in this window. Complete a session to generate performance analytics.'];
    }

    // Top muscle volume
    const topMuscle = (Object.entries(aggregated.rangeMuscleVolume) as [MuscleCategory, number][])
      .sort((a, b) => b[1] - a[1])[0];
    if (topMuscle && topMuscle[1] > 0 && aggregated.rangeVolume > 0) {
      const pct = Math.round((topMuscle[1] / aggregated.rangeVolume) * 100);
      list.push(`${topMuscle[0]} volume represents ${pct}% of total tonnage (${(topMuscle[1] / 1000).toFixed(1)}k kg) during this period.`);
    }

    // Routine focus
    if (workoutPieData.length > 0) {
      const topRoutine = workoutPieData[0];
      list.push(`${topRoutine.name} routines account for the highest session frequency (${topRoutine.value} sessions).`);
    }

    // Scheduled adherence
    if (aggregated.scheduledCoreWorkouts > 0) {
      list.push(`Core scheduled adherence stands at ${aggregated.adherencePct}% (${aggregated.completedScheduledCore}/${aggregated.scheduledCoreWorkouts} core workouts completed).`);
    }

    // Most frequent movement
    if (aggregated.mostFrequentExercises.length > 0) {
      const topEx = aggregated.mostFrequentExercises[0];
      list.push(`${topEx.name} is the most frequently performed exercise with ${topEx.count} logged sessions.`);
    }

    // Measured duration
    if (aggregated.avgDuration > 0) {
      list.push(`Workouts averaged ${aggregated.avgDuration} minutes of active training duration.`);
    }

    return list;
  }, [
    aggregated.rangeLogsCount,
    aggregated.rangeMuscleVolume,
    aggregated.rangeVolume,
    aggregated.scheduledCoreWorkouts,
    aggregated.adherencePct,
    aggregated.completedScheduledCore,
    aggregated.mostFrequentExercises,
    aggregated.avgDuration,
    workoutPieData
  ]);

  return {
    index,
    defsMap,
    workoutMap,
    coreWorkoutByCycleDayMap,
    priorityExercises,
    active1RMExerciseId,
    aggregated,
    heatmapData,
    muscleChartData,
    workoutPieData,
    insightsList
  };
}
