import { Workout } from '../../types/fitness';

export function calculateWorkoutEstimatedDuration(workout: Workout): number {
  if (!workout || !workout.exercises || workout.exercises.length === 0) return 30;
  let totalMinutes = 0;

  workout.exercises.forEach(ex => {
    const setNum = typeof ex.sets === 'number' ? ex.sets : 3;
    // Estimate 45s per set + rest interval (default ~90s)
    const setTimeMin = (setNum * 2.25);
    totalMinutes += setTimeMin;
  });

  if (workout.cardio) {
    totalMinutes += 20;
  }

  return Math.max(15, Math.round(totalMinutes));
}
