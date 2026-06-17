import { format, differenceInCalendarDays, parseISO, subDays } from 'date-fns';

export function dk(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

export function getAdjustedCycleStart(workoutCycleDay: number): string {
  const adjusted = subDays(new Date(), workoutCycleDay - 1);
  return format(adjusted, 'yyyy-MM-dd');
}

export function getCycleDay(cycleStart: string | undefined | null): number {
  const start = parseISO(cycleStart || dk());
  const now = new Date();
  const diff = differenceInCalendarDays(now, start);
  return (((diff % 8) + 8) % 8) + 1;
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
