import { useMemo } from 'react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from './useFitnessDerivedData';
import { SessionLog, Workout, ExerciseDefinition, AppState, WorkoutType } from '../types/fitness';
import {
  selectTimeRangeAnalytics,
  FitnessIndex
} from '../utils/fitnessDerivedSelectors';
import {
  MUSCLE_CATEGORIES,
  MuscleCategory
} from '../utils/exerciseResolver';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { SEMANTIC_COLORS } from '../components/ui';
import { useCalendarGrid } from './useCalendarGrid';

export type TimeRange = '7d' | '30d' | '90d' | 'all';
export type MuscleMetric = 'volume' | 'sets' | 'frequency';

export interface UseAnalyticsDataParams {
  timeRange: TimeRange;
  muscleMetric: MuscleMetric;
  selected1RMExerciseId: string | null;
  currentHeatmapMonth: Date;
  logs?: Record<string, SessionLog>;
  workouts?: Workout[];
  exerciseDefinitions?: ExerciseDefinition[];
  appState?: AppState | null;
}

export function useAnalyticsData({
  logs: propLogs,
  workouts: propWorkouts,
  appState: propAppState,
  timeRange,
  muscleMetric,
  selected1RMExerciseId,
  currentHeatmapMonth
}: UseAnalyticsDataParams) {
  const fitnessContext = useFitness();
  const derivedData = useFitnessDerivedData();

  const logs = propLogs ?? fitnessContext.logs;
  const workouts = propWorkouts ?? fitnessContext.workouts;
  const appState = propAppState ?? fitnessContext.appState;

  const {
    index,
    defsMap,
    workoutMap,
    coreWorkoutByCycleDayMap,
    priorityExercises
  } = derivedData;

  // Active 1RM selection
  const active1RMExerciseId = selected1RMExerciseId || priorityExercises[0]?.id || '';

  // 1. Time Range Slice & Aggregated Metrics via selector over canonical index
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

  // 2. Heatmap calendar data
  const heatmapData = useCalendarGrid({
    monthDate: currentHeatmapMonth,
    logs,
    workouts,
    weekStartsOn: 1
  });

  // 3. Muscle chart data formatted for Recharts
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

  // 4. Workout Distribution Pie Chart Data
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

  // 5. Data-derived Insights
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
