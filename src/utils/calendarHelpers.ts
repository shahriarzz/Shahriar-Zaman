import { isAfter, startOfDay, isSameDay } from 'date-fns';
import { WORKOUT_COLORS, UNKNOWN_WORKOUT_COLOR } from './fitnessHelpers';
import { SEMANTIC_COLORS } from '../styles/tokens';
import { SessionLog, Workout } from '../types/fitness';

export interface CalendarDayStatusContext {
  date: Date;
  dateStr?: string;
  today?: Date;
  log?: SessionLog | null;
  dayDetail?: { doneSets: number; totalSets: number } | null;
  workout?: Workout | null;
  expectedWorkout?: Workout | null;
}

export interface CalendarDayStatus {
  color: string;
  label: string;
  isPartial?: boolean;
  isComplete?: boolean;
  isFuture?: boolean;
  isRest?: boolean;
  isMissed?: boolean;
  log?: SessionLog;
  expectedWo?: Workout;
}

/**
 * Pure production resolver for Calendar day indicator colors and status.
 * Evaluates completed, partial, future scheduled, rest, and missed days.
 */
export function resolveCalendarDayStatus({
  date,
  today = new Date(),
  log,
  dayDetail,
  workout,
  expectedWorkout,
}: CalendarDayStatusContext): CalendarDayStatus | null {
  const isFuture = isAfter(startOfDay(date), startOfDay(today));

  if (log) {
    const doneSets = dayDetail?.doneSets ?? 0;
    const totalSets = dayDetail?.totalSets ?? 0;

    if (!log.complete) {
      return {
        color: SEMANTIC_COLORS.amber,
        label: totalSets > 0 ? `${doneSets}/${totalSets} sets` : 'partial',
        isPartial: true,
        log
      };
    }
    const woTypeColor = workout?.type ? WORKOUT_COLORS[workout.type] : undefined;
    return {
      color: woTypeColor || UNKNOWN_WORKOUT_COLOR,
      label: workout?.type || 'session',
      isComplete: true,
      log
    };
  }

  if (isFuture) {
    if (expectedWorkout) {
      if (expectedWorkout.type === 'rest') {
        return { color: WORKOUT_COLORS.rest, label: 'rest', isFuture: true, expectedWo: expectedWorkout };
      }
      return {
        color: WORKOUT_COLORS[expectedWorkout.type] || UNKNOWN_WORKOUT_COLOR,
        label: expectedWorkout.name,
        isFuture: true,
        expectedWo: expectedWorkout
      };
    }
    return null;
  }

  if (expectedWorkout) {
    if (expectedWorkout.type === 'rest') {
      return { color: WORKOUT_COLORS.rest, label: 'rest', isRest: true, expectedWo: expectedWorkout };
    }
    if (!isSameDay(date, today)) {
      return { color: SEMANTIC_COLORS.red, label: 'missed', isMissed: true, expectedWo: expectedWorkout };
    }
  }

  return null;
}
