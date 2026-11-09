import { Workout, SessionLog } from '../../types/fitness';
import { getCycleDay, getAdjustedCycleStart, dk } from '../../utils/fitnessCalculations';

export type ScheduleDayOutcome =
  | { readonly type: 'scheduled_core'; readonly cycleDay: number; readonly workout: Workout; readonly completed: boolean }
  | { readonly type: 'recovery_day'; readonly cycleDay: number; readonly isCompletedSessionPresent: boolean }
  | { readonly type: 'missed_scheduled_day'; readonly cycleDay: number; readonly workout: Workout }
  | { readonly type: 'bonus_workout'; readonly workout: Workout; readonly advancesCycleAnchor: false }
  | { readonly type: 'invalid_configuration'; readonly cycleDay: number; readonly reason: string };

export interface CycleScheduleEvaluation {
  readonly cycleDay: number;
  readonly date: string;
  readonly isRestDay: boolean;
  readonly scheduledWorkout: Workout | null;
  readonly outcome: ScheduleDayOutcome;
}

/**
 * Pure evaluation of the training schedule contract for a specific calendar date.
 * Reuses the canonical cycle anchor (appState.cycleStart) and ensures 8-day modulo arithmetic.
 */
export function evaluateCycleSchedule(params: {
  cycleStart: string | null | undefined;
  targetDate: string;
  workouts: Workout[];
  logsForDate?: SessionLog[];
}): CycleScheduleEvaluation {
  const { cycleStart, targetDate, workouts, logsForDate = [] } = params;
  const cycleDay = getCycleDay(cycleStart, targetDate);
  const isRestDay = cycleDay === 4 || cycleDay === 8;

  // Identify core workouts configured for this cycle day
  const coreWorkouts = workouts.filter(w => w.isCore && w.cycleDay === cycleDay);

  if (isRestDay) {
    const hasLog = logsForDate.some(l => l.complete);
    return {
      cycleDay,
      date: targetDate,
      isRestDay: true,
      scheduledWorkout: null,
      outcome: {
        type: 'recovery_day',
        cycleDay,
        isCompletedSessionPresent: hasLog
      }
    };
  }

  if (coreWorkouts.length === 0) {
    return {
      cycleDay,
      date: targetDate,
      isRestDay: false,
      scheduledWorkout: null,
      outcome: {
        type: 'invalid_configuration',
        cycleDay,
        reason: `No core workout configured for Cycle Day ${cycleDay}`
      }
    };
  }

  const scheduledWorkout = coreWorkouts[0];
  const completedLog = logsForDate.find(l => l.workoutId === scheduledWorkout.id && l.complete);
  const todayStr = dk();

  if (completedLog) {
    return {
      cycleDay,
      date: targetDate,
      isRestDay: false,
      scheduledWorkout,
      outcome: {
        type: 'scheduled_core',
        cycleDay,
        workout: scheduledWorkout,
        completed: true
      }
    };
  }

  // If in the past and uncompleted, it was missed
  if (targetDate < todayStr) {
    return {
      cycleDay,
      date: targetDate,
      isRestDay: false,
      scheduledWorkout,
      outcome: {
        type: 'missed_scheduled_day',
        cycleDay,
        workout: scheduledWorkout
      }
    };
  }

  return {
    cycleDay,
    date: targetDate,
    isRestDay: false,
    scheduledWorkout,
    outcome: {
      type: 'scheduled_core',
      cycleDay,
      workout: scheduledWorkout,
      completed: false
    }
  };
}

/**
 * Determines cycle anchor adjustment when a workout is completed.
 * Rule: Only out-of-order CORE workouts adjust the cycle anchor. Bonus workouts NEVER adjust the anchor.
 */
export function calculateCycleAnchorOnCompletion(params: {
  completedWorkout: Workout;
  currentCycleStart: string;
  completionDate?: Date | string;
}): { shouldUpdate: boolean; nextCycleStart?: string } {
  const { completedWorkout, currentCycleStart, completionDate = new Date() } = params;

  if (!completedWorkout.isCore || typeof completedWorkout.cycleDay !== 'number') {
    // Invariant: Bonus workouts do NOT advance or adjust the anchor
    return { shouldUpdate: false };
  }

  const currentExpectedDay = getCycleDay(currentCycleStart, completionDate);
  if (completedWorkout.cycleDay !== currentExpectedDay) {
    const nextAnchor = getAdjustedCycleStart(completedWorkout.cycleDay, completionDate);
    return {
      shouldUpdate: true,
      nextCycleStart: nextAnchor
    };
  }

  return { shouldUpdate: false };
}
