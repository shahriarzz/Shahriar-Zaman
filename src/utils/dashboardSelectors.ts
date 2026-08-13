import { SessionLog, SetLog } from '../types/fitness';

/**
 * Formats a YYYY-MM-DD date string to a localized short format (e.g. "Oct 24")
 */
export const formatDateStr = (dateStr: string): string => {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

/**
 * Calculates current consecutive workout day streak.
 * Looks back from today or yesterday to sustain active streak.
 */
export function calculateStreak(
  logs: Record<string, SessionLog> | undefined | null,
  referenceDate: Date = new Date()
): number {
  const datesSet = new Set((Object.values(logs || {}) as SessionLog[]).map(l => l?.date).filter(Boolean));
  if (datesSet.size === 0) return 0;

  let streak = 0;
  const checkDate = new Date(referenceDate);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  let checkStr = formatDate(checkDate);

  // If today is not in the set, check yesterday to sustain the current active streak
  if (!datesSet.has(checkStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    checkStr = formatDate(checkDate);
    if (!datesSet.has(checkStr)) {
      return 0;
    }
  }

  while (datesSet.has(formatDate(checkDate))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

/**
 * Calculates the total weight/volume lifted (kg) across all completed set logs.
 */
export function calculateTotalWeightLifted(
  logs: Record<string, SessionLog> | undefined | null
): number {
  return (Object.values(logs || {}) as SessionLog[]).reduce((acc: number, log) => {
    let logVol = 0;
    Object.values(log?.sets || {}).forEach((exSets) => {
      (exSets as SetLog[] || []).forEach((s: SetLog) => {
        if (s && s.done && s.weight && s.reps) {
          logVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        }
      });
    });
    return acc + logVol;
  }, 0);
}

/**
 * Sorts weight entries in descending date order (most recent first).
 */
export function getSortedWeightEntries(
  weightLog: Record<string, number> | undefined | null
): [string, number][] {
  return (Object.entries(weightLog || {}) as [string, number][])
    .sort((a, b) => b[0].localeCompare(a[0]));
}

export interface SparklineData {
  sorted: [string, number][];
  weights: number[];
  min: number;
  max: number;
  range: number;
  w: number;
}

/**
 * Computes sparkline visualization data for body weight trend.
 */
export function getWeightSparklineData(
  weightLog: Record<string, number> | undefined | null
): SparklineData | null {
  const raw = Object.entries(weightLog || {}) as [string, number][];
  if (raw.length <= 1) return null;
  const sorted = [...raw].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  const weights = sorted.map(e => e[1]);
  const min = Math.min(...weights) - 0.5;
  const max = Math.max(...weights) + 0.5;
  const range = max - min || 1;
  const w = 100 / (sorted.length - 1);
  return { sorted, weights, min, max, range, w };
}

/**
 * Formats elapsed time for an unfinished session.
 */
export function getRelativeTimeString(startTime: number, now: number = Date.now()): string {
  const elapsedMin = Math.floor((now - startTime) / 60000);
  return elapsedMin < 60 
    ? `${elapsedMin} min ago` 
    : `${Math.floor(elapsedMin / 60)}h ago`;
}
