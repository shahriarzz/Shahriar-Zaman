import { format, differenceInCalendarDays, parseISO, subDays, isValid } from 'date-fns';
import { SessionLog, SetLog, Workout } from '../types/fitness';

export const CYCLE_LENGTH = 8;

/**
 * Standard date key formatter: YYYY-MM-DD
 */
export function dk(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Formats a YYYY-MM-DD date string to a localized short format (e.g. "Oct 24")
 */
export function formatDateStr(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export interface RawSetLog {
  id?: string;
  weight?: string | number;
  weightKg?: string | number;
  reps?: string | number;
  done?: boolean;
  completed?: boolean;
  rpe?: string | number;
  notes?: string;
  targetReps?: string | number;
  targetWeight?: string | number;
  isWarmup?: boolean;
  warmup?: boolean;
}

export interface RawSessionLogInput {
  id: string;
  workoutId?: string;
  date?: string;
  sets?: Record<string, RawSetLog[] | undefined>;
  complete?: boolean;
  durationMinutes?: number | string;
  duration?: number | string;
  updatedAt?: number;
}

/**
 * Pure helper to sanitize a single SetLog ensuring valid types and defaults.
 * Guaranteed 100% deterministic: NEVER generates random IDs under any circumstances.
 */
export function sanitizeSetLog(set: RawSetLog | null | undefined, fallbackId: string = 'set_0'): SetLog {
  const id = (set?.id && String(set.id).trim().length > 0)
    ? String(set.id).trim()
    : (fallbackId && fallbackId.trim().length > 0 ? fallbackId.trim() : 'set_0');
  const rawWeight = set?.weight !== undefined ? set.weight : (set?.weightKg !== undefined ? set.weightKg : '');
  const weight = typeof rawWeight === 'number' ? String(rawWeight) : String(rawWeight || '');
  const reps = typeof set?.reps === 'number' ? String(set.reps) : String(set?.reps || '');
  const done = Boolean(set?.done ?? set?.completed);

  return {
    id,
    weight: weight.trim(),
    reps: reps.trim(),
    done
  };
}

/**
 * Hardens and sanitizes a complete SessionLog according to the GainLog data contract.
 * Generates deterministic fallback set IDs based on exercise ID + set position.
 * Guaranteed 100% idempotent: sanitizeSessionLog(log) is byte-equivalent across multiple passes.
 */
export function sanitizeSessionLog(rawLog: RawSessionLogInput): SessionLog {
  const sanitizedSets: Record<string, SetLog[]> = {};

  if (rawLog.sets && typeof rawLog.sets === 'object') {
    Object.entries(rawLog.sets).forEach(([exDefId, setsList]) => {
      if (Array.isArray(setsList)) {
        sanitizedSets[exDefId] = setsList.map((s, idx) => sanitizeSetLog(s, `${exDefId}_set_${idx}`));
      }
    });
  }

  const rawDuration = rawLog.durationMinutes !== undefined ? rawLog.durationMinutes : rawLog.duration;
  const durationMin = Number(rawDuration);

  return {
    id: String(rawLog.id),
    workoutId: String(rawLog.workoutId || ''),
    date: String(rawLog.date || dk()),
    sets: sanitizedSets,
    complete: Boolean(rawLog.complete),
    durationMinutes: Number.isFinite(durationMin) && durationMin >= 0 ? Math.floor(durationMin) : 0,
    ...(rawLog.updatedAt ? { updatedAt: rawLog.updatedAt } : {})
  };
}

/**
 * Canonical sorting rule for historical SessionLogs:
 * Primary: Date descending (newest date first)
 * Secondary: ID descending
 */
export function getSortedLogsDescending(logs: Record<string, SessionLog> | SessionLog[] | null | undefined): SessionLog[] {
  if (!logs) return [];
  const logArray = Array.isArray(logs) ? logs : Object.values(logs);
  return [...logArray].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.id || '').localeCompare(a.id || '');
  });
}

/**
 * Canonical filter for completed sets (done === true invariant).
 * Only done === true sets count as performed training data.
 */
export function getCompletedSets(setsOrLog: SetLog[] | SessionLog | null | undefined): SetLog[] {
  if (!setsOrLog) return [];
  if (Array.isArray(setsOrLog)) {
    return setsOrLog.filter(s => s && s.done);
  }
  // If a session log is passed, aggregate all completed sets across exercises
  if (setsOrLog.sets && typeof setsOrLog.sets === 'object') {
    const allSets: SetLog[] = [];
    Object.values(setsOrLog.sets).forEach(exSets => {
      if (Array.isArray(exSets)) {
        exSets.forEach(s => {
          if (s && s.done) allSets.push(s);
        });
      }
    });
    return allSets;
  }
  return [];
}

/**
 * Calculates volume (weight × reps in kg) for a single set.
 * Invariant: only done === true sets count.
 */
export function calculateSetVolume(set: Partial<SetLog> | null | undefined): number {
  if (!set || !set.done) return 0;
  const w = parseFloat(String(set.weight)) || 0;
  let r = parseInt(String(set.reps), 10);
  if (Number.isNaN(r) || r < 0) r = 0;
  return w * r;
}

/**
 * Calculates total volume across an array of sets.
 * Invariant: only done === true sets count.
 */
export function calculateSetsVolume(sets: (Partial<SetLog> | null | undefined)[] | null | undefined): number {
  if (!Array.isArray(sets) || sets.length === 0) return 0;
  return sets.reduce((total, s) => total + calculateSetVolume(s), 0);
}

/**
 * Calculates Estimated 1RM (e1RM) using the standard Epley formula:
 * e1RM = weight * (1 + reps / 30) for reps > 1, or weight for reps === 1.
 * Capped at 30 reps for realism.
 */
export function calculateE1RM(weight: number | string, reps: number | string): number {
  const w = typeof weight === 'number' ? weight : parseFloat(weight) || 0;
  const r = typeof reps === 'number' ? reps : parseInt(reps, 10) || 0;

  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return Math.round(w * 10) / 10;

  const effectiveReps = Math.min(r, 30);
  const e1rm = w * (1 + effectiveReps / 30);
  return Math.round(e1rm * 10) / 10;
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

  completedCoreLogs.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.id || '').localeCompare(a.id || '');
  });

  const latestLog = completedCoreLogs[0];
  const lastWorkout = workoutMap.get(latestLog.workoutId);
  const lastCycleDay = lastWorkout?.cycleDay || 1;

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
  const todayCycleDay = getNextCycleDayFromLogs(logs, workouts, cycleStart);
  const diffDays = differenceInCalendarDays(validTarget, new Date());
  return ((((todayCycleDay - 1 + diffDays) % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;
}

export function normalizeWeightEntry(
  entry: number | { weight: number; updatedAt?: number } | undefined | null,
  defaultTimestamp = 0
): { weight: number; updatedAt: number } | null {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'number') {
    return { weight: entry, updatedAt: defaultTimestamp };
  }
  if (typeof entry === 'object' && typeof entry.weight === 'number') {
    return { weight: entry.weight, updatedAt: Number(entry.updatedAt) || defaultTimestamp };
  }
  return null;
}

export function getSortedWeightEntries(
  weightLog: Record<string, number | { weight: number; updatedAt?: number }> | undefined | null
): [string, number][] {
  if (!weightLog) return [];
  const entries: [string, number][] = [];
  Object.entries(weightLog).forEach(([date, val]) => {
    const norm = normalizeWeightEntry(val);
    if (norm && !isNaN(norm.weight)) {
      entries.push([date, norm.weight]);
    }
  });
  return entries.sort((a, b) => b[0].localeCompare(a[0]));
}

export interface SparklineData {
  sorted: [string, number][];
  weights: number[];
  min: number;
  max: number;
  range: number;
  w: number;
}

export function getWeightSparklineData(
  weightLog: Record<string, number | { weight: number; updatedAt?: number }> | undefined | null
): SparklineData | null {
  if (!weightLog) return null;
  const raw: [string, number][] = [];
  Object.entries(weightLog).forEach(([date, val]) => {
    const norm = normalizeWeightEntry(val);
    if (norm && !isNaN(norm.weight)) {
      raw.push([date, norm.weight]);
    }
  });
  if (raw.length <= 1) return null;
  const sorted = [...raw].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  const weights = sorted.map(e => e[1]);
  const min = Math.min(...weights) - 0.5;
  const max = Math.max(...weights) + 0.5;
  const range = max - min || 1;
  const w = 100 / (sorted.length - 1);
  return { sorted, weights, min, max, range, w };
}

export function getRelativeTimeString(startTime: number, now: number = Date.now()): string {
  const elapsedMin = Math.floor((now - startTime) / 60000);
  return elapsedMin < 60 
    ? `${elapsedMin} min ago` 
    : `${Math.floor(elapsedMin / 60)}h ago`;
}
