import { format, differenceInCalendarDays, parseISO, subDays } from 'date-fns';
import { SessionLog, SetLog } from '../types/fitness';

export function dk(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

export function getAdjustedCycleStart(workoutCycleDay: number): string {
  const adjusted = subDays(new Date(), workoutCycleDay - 1);
  return format(adjusted, 'yyyy-MM-dd');
}

export function getCycleDay(cycleStart: string | undefined | null, targetDate: Date | string = new Date()): number {
  const start = parseISO(cycleStart || dk());
  const target = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
  const diff = differenceInCalendarDays(target, start);
  return (((diff % 8) + 8) % 8) + 1;
}

export function calculateVolume(log: SessionLog | { sets: Record<string, SetLog[]> }): number {
  let total = 0;
  if (!log || !log.sets) return total;
  Object.values(log.sets).forEach(sets => {
    (sets || []).forEach(s => {
      if (s.done && s.weight && s.reps) {
        const weightVal = parseFloat(s.weight) || 0;
        let repsVal = parseInt(s.reps, 10);
        if (isNaN(repsVal)) {
          repsVal = 1;
        }
        total += weightVal * repsVal;
      }
    });
  });
  return total;
}

export const WORKOUT_COLORS: Record<string, string> = {
  push: '#f97316',
  pull: '#38bdf8',
  hybrid: '#a78bfa',
  rest: '#34d399',
  date: '#f43f8e',
  upper: '#fb923c',
  lower: '#4ade80',
  custom: '#a78bfa'
};

export const WORKOUT_LABELS: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  hybrid: 'Hybrid',
  rest: 'Rest',
  date: 'Date Night',
  upper: 'Upper Body',
  lower: 'Lower Body',
  custom: 'Custom'
};
