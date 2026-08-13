import { format, differenceInCalendarDays, parseISO, subDays, isValid } from 'date-fns';
import { SessionLog, SetLog, Workout, WorkoutType, WorkoutExercise, ExerciseDefinition, Exercise } from '../types/fitness';

export const CYCLE_LENGTH = 8;

export function dk(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function getAdjustedCycleStart(workoutCycleDay: number): string {
  const adjusted = subDays(new Date(), workoutCycleDay - 1);
  return format(adjusted, 'yyyy-MM-dd');
}

export function getCycleDay(cycleStart: string | undefined | null, targetDate: Date | string = new Date()): number {
  const todayStr = dk();
  let start = parseISO(cycleStart || todayStr);
  if (!isValid(start)) {
    start = parseISO(todayStr);
  }
  const targetParsed = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
  const target = isValid(targetParsed) ? targetParsed : new Date();
  const diff = differenceInCalendarDays(target, start);
  return (((diff % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;
}

export function getNextCycleDayFromLogs(
  logs: Record<string, SessionLog> | undefined | null,
  workouts: Workout[] | undefined | null,
  cycleStart?: string | null
): number {
  if (!logs || !workouts || workouts.length === 0) {
    return getCycleDay(cycleStart || dk());
  }

  const workoutMap = new Map<string, Workout>();
  workouts.forEach(w => workoutMap.set(w.id, w));

  const completedCoreLogs = Object.values(logs).filter(log => {
    if (!log || !log.complete) return false;
    const wo = workoutMap.get(log.workoutId);
    return wo && wo.isCore && typeof wo.cycleDay === 'number';
  });

  if (completedCoreLogs.length === 0) {
    return getCycleDay(cycleStart || dk());
  }

  // Find the most recent completed log where workout.isCore === true, using the log with the latest date
  completedCoreLogs.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.id || '').localeCompare(a.id || '');
  });

  const latestLog = completedCoreLogs[0];
  const lastWorkout = workoutMap.get(latestLog.workoutId);
  const lastCycleDay = lastWorkout?.cycleDay || 1;

  // Next cycle day is one position after the last completed core workout (wrapping 8 -> 1)
  return ((lastCycleDay % CYCLE_LENGTH) + 1);
}

export function getCycleDayForDate(
  targetDate: Date | string,
  logs: Record<string, SessionLog> | undefined | null,
  workouts: Workout[] | undefined | null,
  cycleStart?: string | null
): number {
  const target = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
  const validTarget = isValid(target) ? target : new Date();
  
  // Base today's cycle day on the completed workout progression (matching Dashboard)
  const todayCycleDay = getNextCycleDayFromLogs(logs, workouts, cycleStart);
  
  // Calculate day difference relative to today
  const diffDays = differenceInCalendarDays(validTarget, new Date());
  return ((((todayCycleDay - 1 + diffDays) % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;
}

export function calculateVolume(log: SessionLog | { sets: Record<string, SetLog[]> }): number {
  let total = 0;
  if (!log || !log.sets) return total;
  Object.values(log.sets).forEach(sets => {
    (sets || []).forEach(s => {
      if (s.done && s.weight && s.reps) {
        const weightVal = parseFloat(s.weight) || 0;
        let repsVal = parseInt(s.reps, 10);
        if (Number.isNaN(repsVal)) {
          repsVal = 0;
        }
        total += weightVal * repsVal;
      }
    });
  });
  return total;
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

export function resolveWorkoutExercise(
  we: WorkoutExercise | any,
  definitions: ExerciseDefinition[] = []
): Exercise {
  const defId = we.exerciseDefinitionId || we.exerciseId || we.id;
  const def = definitions.find(d => d.id === defId) || {
    id: defId || generateId(),
    name: we.name || 'Exercise',
    target: we.target || 'General',
    equipment: we.equipment || '',
    instructions: we.instructions || '',
    tags: we.tags || []
  };

  return {
    ...def,
    exerciseDefinitionId: def.id,
    id: def.id,
    sets: we.sets || 3,
    reps: we.reps || '10–12',
    rest: we.rest || '90s',
    note: we.note || '',
    tags: Array.from(new Set([...(def.tags || []), ...(we.tags || [])]))
  };
}
