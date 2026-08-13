import { Workout, SessionLog } from '../../types/fitness';
import { differenceInDays, parseISO } from 'date-fns';

export function getCycleDayForDate(dateStr: string, cycleStartStr: string, totalCycleDays: number = 4): number {
  if (!dateStr || !cycleStartStr) return 1;
  try {
    const target = parseISO(dateStr);
    const start = parseISO(cycleStartStr);
    const diff = differenceInDays(target, start);
    if (isNaN(diff)) return 1;
    const modulo = diff % totalCycleDays;
    return modulo < 0 ? ((modulo + totalCycleDays) % totalCycleDays) + 1 : modulo + 1;
  } catch {
    return 1;
  }
}

export function getNextCycleDayFromLogs(
  logs: Record<string, SessionLog>,
  cycleStartStr: string,
  totalCycleDays: number = 4
): number {
  const sortedLogs = Object.values(logs || {})
    .filter(l => l && l.complete && l.workoutId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sortedLogs.length === 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    return getCycleDayForDate(todayStr, cycleStartStr, totalCycleDays);
  }

  const lastLog = sortedLogs[0];
  const lastCycleDay = lastLog.cycleDay || getCycleDayForDate(lastLog.date, cycleStartStr, totalCycleDays);
  return (lastCycleDay % totalCycleDays) + 1;
}

export function getWorkoutForCycleDay(workouts: Workout[], cycleDay: number): Workout | undefined {
  return workouts.find(w => w.cycleDay === cycleDay);
}
