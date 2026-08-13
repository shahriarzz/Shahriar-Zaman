import { SessionLog, ExerciseDefinition } from '../../types/fitness';
import { differenceInDays, parseISO } from 'date-fns';

export function calculateSessionVolume(session: SessionLog): number {
  if (!session || !session.sets) return 0;
  let total = 0;
  Object.values(session.sets).forEach(setArray => {
    if (Array.isArray(setArray)) {
      setArray.forEach(set => {
        if (set.done) {
          const w = parseFloat(set.weight) || 0;
          const r = parseFloat(set.reps) || 0;
          total += w * r;
        }
      });
    }
  });
  return total;
}

export function calculateTotalVolume(logs: Record<string, SessionLog>): number {
  let total = 0;
  Object.values(logs || {}).forEach(session => {
    if (session && session.complete) {
      total += calculateSessionVolume(session);
    }
  });
  return total;
}

export function getCompletedSessionsCount(logs: Record<string, SessionLog>): number {
  return Object.values(logs || {}).filter(l => l && l.complete).length;
}

export function getTrainingStreak(logs: Record<string, SessionLog>): number {
  const completedDates = Object.values(logs || {})
    .filter(l => l && l.complete)
    .map(l => l.date)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (completedDates.length === 0) return 0;

  const uniqueDates = Array.from(new Set(completedDates));
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < uniqueDates.length; i++) {
    const d = parseISO(uniqueDates[i]);
    d.setHours(0, 0, 0, 0);
    const diff = differenceInDays(today, d);
    if (i === 0 && diff > 3) {
      return 0; // Streak broken if no workout in past 3 days
    }
    streak++;
  }

  return streak;
}
