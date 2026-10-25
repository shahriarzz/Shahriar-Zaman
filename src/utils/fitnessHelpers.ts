import { WorkoutType } from '../types/fitness';

// Re-export canonical calculations and resolver functions
export {
  CYCLE_LENGTH,
  dk,
  formatDateStr,
  formatCompactWeight,
  getAdjustedCycleStart,
  getCycleDay
} from './fitnessCalculations';

export {
  resolveWorkoutExercise
} from './exerciseResolver';

export { generateId } from './generateId';

export const UNKNOWN_WORKOUT_COLOR = '#71717a';

export const WORKOUT_COLORS: Record<WorkoutType, string> = {
  push: '#facc15',
  pull: '#38bdf8',
  hybrid: '#c026d3',
  rest: '#22c55e',
  date: '#f43f8e',
  upper: '#fb923c',
  lower: '#84cc16',
  custom: '#a78bfa'
};

export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  push: 'Push',
  pull: 'Pull',
  hybrid: 'Hybrid',
  rest: 'Rest',
  date: 'Date Night',
  upper: 'Upper Body',
  lower: 'Lower Body',
  custom: 'Custom'
};

export function getWorkoutBadgeStyle(type: WorkoutType | string) {
  const color = WORKOUT_COLORS[type as WorkoutType] || UNKNOWN_WORKOUT_COLOR;
  return {
    backgroundColor: `${color}22`,
    color: color,
    border: `1px solid ${color}55`
  };
}
