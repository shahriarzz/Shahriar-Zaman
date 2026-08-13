import { format, differenceInCalendarDays, parseISO, subDays, isValid } from 'date-fns';
import { SessionLog, SetLog, Workout, WorkoutType, WorkoutExercise, ExerciseDefinition, Exercise } from '../types/fitness';
import { generateId as genId } from './generateId';

// Re-export canonical calculations and resolver functions
export {
  CYCLE_LENGTH,
  dk,
  formatDateStr,
  getAdjustedCycleStart,
  getCycleDay,
  getNextCycleDayFromLogs,
  getCycleDayForDate,
  calculateVolume
} from './fitnessCalculations';

export {
  resolveWorkoutExercise
} from './exerciseResolver';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export const WORKOUT_COLORS: Record<WorkoutType, string> = {
  push: '#f59e0b',
  pull: '#38bdf8',
  hybrid: '#c026d3',
  rest: '#22c55e',
  date: '#f43f8e',
  upper: '#fb923c',
  lower: '#4ade80',
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
  const color = WORKOUT_COLORS[type as WorkoutType] || '#f59e0b';
  return {
    backgroundColor: `${color}22`,
    color: color,
    border: `1px solid ${color}55`
  };
}
