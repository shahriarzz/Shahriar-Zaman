import { useMemo } from 'react';
import { SessionLog, ExerciseDefinition, Workout } from '../types/fitness';
import {
  createExerciseDefinitionMap,
  calculateVolumeByTimeframe,
  calculateMuscleGroupVolumeDistribution,
  calculateMostFrequentExercises,
  calculatePersonalBests,
  generatePerformanceInsights,
  calculateExercise1RMTimeline
} from '../domain';

export function useFitnessAnalytics(
  exerciseDefs: ExerciseDefinition[],
  workouts: Workout[],
  logs: Record<string, SessionLog>
) {
  const defsMap = useMemo(() => createExerciseDefinitionMap(exerciseDefs), [exerciseDefs]);

  const volumeTimeline30d = useMemo(() => calculateVolumeByTimeframe(logs, 30), [logs]);
  const muscleDistribution = useMemo(() => calculateMuscleGroupVolumeDistribution(logs, defsMap), [logs, defsMap]);
  const frequentExercises = useMemo(() => calculateMostFrequentExercises(logs, defsMap, 8), [logs, defsMap]);
  const personalBests = useMemo(() => calculatePersonalBests(logs, defsMap), [logs, defsMap]);
  const performanceInsights = useMemo(() => generatePerformanceInsights(logs, defsMap, workouts), [logs, defsMap, workouts]);

  const getExerciseTimeline = (exerciseId: string) => {
    return calculateExercise1RMTimeline(logs, exerciseId, defsMap);
  };

  return {
    defsMap,
    volumeTimeline30d,
    muscleDistribution,
    frequentExercises,
    personalBests,
    performanceInsights,
    getExerciseTimeline
  };
}
