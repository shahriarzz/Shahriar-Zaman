import { format, differenceInCalendarDays, parseISO, subDays, isValid } from 'date-fns';
import { 
  SessionLog, 
  SetLog, 
  Workout, 
  ExerciseDefinition, 
  WorkoutExercise, 
  CardioFinisher, 
  WorkoutType 
} from '../types/fitness';

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

export interface DateRange {
  start: string;
  end: string;
}

/**
 * Returns a rolling date range [today - (days - 1), today]
 */
export function getRollingDateRange(now: Date | string = new Date(), days: number): DateRange {
  const nowDate = typeof now === 'string' ? parseISO(now) : now;
  const validNow = isValid(nowDate) ? nowDate : new Date();
  const endStr = dk(validNow);
  const startStr = dk(subDays(validNow, Math.max(1, days) - 1));
  return { start: startStr, end: endStr };
}

/**
 * Returns the preceding date range of identical length prior to currentRangeStart
 */
export function getPreviousDateRange(currentRangeStart: string, days: number): DateRange {
  const startDate = parseISO(currentRangeStart);
  const validStart = isValid(startDate) ? startDate : new Date();
  const prevEnd = subDays(validStart, 1);
  const prevStart = subDays(validStart, Math.max(1, days));
  return { start: dk(prevStart), end: dk(prevEnd) };
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
 * Strict parsing:
 * - true boolean -> true
 * - false boolean -> false
 * - legacy boolean -> normalized
 * - non-boolean / invalid -> false
 * - missing or invalid date -> preserved as empty/invalid string, never silently defaulting to today's date.
 */
export function sanitizeSessionLog(rawLog: RawSessionLogInput): SessionLog {
  const rawId = String(rawLog?.id || '').trim();
  const rawWorkoutId = String(rawLog?.workoutId || '').trim();

  // Validate date format strictly: YYYY-MM-DD
  const rawDateStr = typeof rawLog?.date === 'string' ? rawLog.date.trim() : '';
  let validDate = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
    const parsed = parseISO(rawDateStr);
    if (isValid(parsed)) {
      validDate = rawDateStr;
    }
  }

  const sanitizedSets: Record<string, SetLog[]> = {};

  if (rawLog?.sets && typeof rawLog.sets === 'object') {
    Object.entries(rawLog.sets).forEach(([exDefId, setsList]) => {
      if (Array.isArray(setsList)) {
        sanitizedSets[exDefId] = setsList.map((s, idx) => sanitizeSetLog(s, `${exDefId}_set_${idx}`));
      }
    });
  }

  const rawDuration = rawLog?.durationMinutes !== undefined ? rawLog.durationMinutes : rawLog?.duration;
  const durationMin = Number(rawDuration);

  // Strict boolean completion parsing
  let isComplete = false;
  if (typeof rawLog?.complete === 'boolean') {
    isComplete = rawLog.complete;
  } else if (rawLog?.complete === undefined) {
    if (typeof (rawLog as any)?.completed === 'boolean') {
      isComplete = (rawLog as any).completed;
    } else if (typeof (rawLog as any)?.isComplete === 'boolean') {
      isComplete = (rawLog as any).isComplete;
    } else {
      // If completion flag is omitted in legacy session log, infer true if there are completed sets
      const hasAnyDoneSet = Object.values(sanitizedSets).some(sets =>
        Array.isArray(sets) && sets.some(s => s && s.done)
      );
      isComplete = hasAnyDoneSet;
    }
  } else {
    // Non-boolean value provided for complete (e.g. "false", 1) -> strictly false
    isComplete = false;
  }

  // Completed sessions strictly require valid id, valid workoutId, and valid calendar date
  if (isComplete && (!rawId || !rawWorkoutId || !validDate)) {
    isComplete = false;
  }

  return {
    id: rawId,
    workoutId: rawWorkoutId,
    date: validDate,
    sets: sanitizedSets,
    complete: isComplete,
    durationMinutes: Number.isFinite(durationMin) && durationMin >= 0 ? Math.floor(durationMin) : 0,
    ...(rawLog?.updatedAt ? { updatedAt: Number(rawLog.updatedAt) || 0 } : {})
  };
}

/**
 * Sanitizes and validates an ExerciseDefinition ensuring non-null types and defaults.
 */
export function sanitizeExerciseDefinition(raw: any, fallbackId: string = ''): ExerciseDefinition {
  const id = String(raw?.id || fallbackId || '').trim();
  return {
    id,
    name: String(raw?.name || '').trim() || 'Exercise',
    target: String(raw?.target || '').trim() || 'General',
    equipment: String(raw?.equipment || '').trim(),
    instructions: String(raw?.instructions || '').trim(),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String) : [],
    updatedAt: Number(raw?.updatedAt) || 0
  };
}

const VALID_WORKOUT_TYPES: Set<WorkoutType> = new Set([
  'push', 'pull', 'hybrid', 'rest', 'date', 'upper', 'lower', 'custom'
]);

/**
 * Sanitizes and validates a Workout template ensuring valid exercises and properties.
 */
export function sanitizeWorkout(raw: any, fallbackId: string = ''): Workout {
  const id = String(raw?.id || fallbackId || '').trim();
  const rawExercises = Array.isArray(raw?.exercises) ? raw.exercises : [];
  const exercises: WorkoutExercise[] = rawExercises.map((e: any) => ({
    exerciseDefinitionId: String(e?.exerciseDefinitionId || e?.exerciseId || e?.id || '').trim(),
    sets: Number(e?.sets) > 0 ? Number(e.sets) : 3,
    reps: String(e?.reps || '10–12').trim(),
    rest: String(e?.rest || '90s').trim(),
    note: String(e?.note || '').trim(),
    tags: Array.isArray(e?.tags) ? e.tags.map(String) : []
  }));

  let cardio: CardioFinisher | null = null;
  if (raw?.cardio && typeof raw.cardio === 'object') {
    cardio = {
      name: String(raw.cardio.name || '').trim(),
      detail: String(raw.cardio.detail || '').trim(),
      duration: String(raw.cardio.duration || '').trim()
    };
  }

  const rawType = String(raw?.type || '').toLowerCase();
  const type: WorkoutType = VALID_WORKOUT_TYPES.has(rawType as WorkoutType) ? (rawType as WorkoutType) : 'custom';

  let cycleDay: number | null = null;
  if (typeof raw?.cycleDay === 'number' && Number.isInteger(raw.cycleDay) && raw.cycleDay >= 1 && raw.cycleDay <= 8) {
    cycleDay = raw.cycleDay;
  }

  return {
    id,
    name: String(raw?.name || '').trim() || 'Workout',
    badge: String(raw?.badge || '').trim(),
    type,
    exercises,
    cardio,
    cycleDay,
    isCore: Boolean(raw?.isCore),
    restNotes: Array.isArray(raw?.restNotes) ? raw.restNotes.map(String) : [],
    updatedAt: Number(raw?.updatedAt) || 0
  };
}

/**
 * Single canonical predicate determining if a SessionLog is a completed workout session.
 * Used consistently across all analytics, adherence, streaks, frequencies, and lifetime summaries.
 * Strict invariant: runtime predicate checks exclusively for complete === true.
 * Legacy inferencing is performed exclusively in migration/sanitization.
 */
export function isCompletedSession(log: Partial<SessionLog> | null | undefined): boolean {
  return log?.complete === true;
}

/** Alias for isCompletedSession */
export const isCompletedLog = isCompletedSession;

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
 * Strict protection: weight and reps must be strictly positive (> 0).
 */
export function calculateSetVolume(set: Partial<SetLog> | null | undefined): number {
  if (!set || !set.done) return 0;
  const w = parseFloat(String(set.weight));
  const r = parseInt(String(set.reps), 10);
  if (Number.isNaN(w) || w <= 0 || Number.isNaN(r) || r <= 0) return 0;
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
 * Invariant: weight and reps must be strictly positive.
 */
export function calculateE1RM(weight: number | string, reps: number | string): number {
  const w = typeof weight === 'number' ? weight : parseFloat(weight);
  const r = typeof reps === 'number' ? reps : parseInt(reps, 10);

  if (Number.isNaN(w) || w <= 0 || Number.isNaN(r) || r <= 0) return 0;
  if (r === 1) return Math.round(w * 10) / 10;

  const effectiveReps = Math.min(r, 30);
  const e1rm = w * (1 + effectiveReps / 30);
  return Math.round(e1rm * 10) / 10;
}

export function getAdjustedCycleStart(workoutCycleDay: number, referenceDate: Date | string = new Date()): string {
  const ref = typeof referenceDate === 'string' ? parseISO(referenceDate) : referenceDate;
  const validRef = isValid(ref) ? ref : new Date();
  const adjusted = subDays(validRef, workoutCycleDay - 1);
  return format(adjusted, 'yyyy-MM-dd');
}

/**
 * Calculates the protocol cycle day (1-8) for a given target date based on canonical cycleStart anchor.
 * Fallback is fully deterministic: if cycleStart is missing or invalid, anchors to target date (Day 1).
 */
export function getCycleDay(cycleStart: string | undefined | null, targetDate: Date | string = new Date()): number {
  const targetParsed = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
  const target = isValid(targetParsed) ? targetParsed : new Date();
  
  let start: Date;
  if (cycleStart && isValid(parseISO(cycleStart))) {
    start = parseISO(cycleStart);
  } else {
    // Deterministic fallback: anchor to supplied targetDate
    start = target;
  }
  
  const diff = differenceInCalendarDays(target, start);
  return (((diff % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;
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
  weightLog: Record<string, number | { weight: number; updatedAt?: number }> | undefined | null,
  maxDateStr?: string
): [string, number][] {
  if (!weightLog) return [];
  const entries: [string, number][] = [];
  const capDate = maxDateStr || dk();
  Object.entries(weightLog).forEach(([date, val]) => {
    if (capDate && date > capDate) return;
    const norm = normalizeWeightEntry(val);
    if (norm && !isNaN(norm.weight) && norm.weight > 0) {
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
  weightLog: Record<string, number | { weight: number; updatedAt?: number }> | undefined | null,
  maxDateStr?: string
): SparklineData | null {
  if (!weightLog) return null;
  const raw: [string, number][] = [];
  const capDate = maxDateStr || dk();
  Object.entries(weightLog).forEach(([date, val]) => {
    if (capDate && date > capDate) return;
    const norm = normalizeWeightEntry(val);
    if (norm && !isNaN(norm.weight) && norm.weight > 0) {
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

/**
 * Compact weight formatter for tonnage and volume metrics.
 * 846 -> "846"
 * 1200 -> "1.2k"
 * 124600 -> "124.6k"
 * 1300000 -> "1.3M"
 */
export function formatCompactWeight(value: number): string {
  if (!value || isNaN(value) || value <= 0) return '0';
  if (value < 1000) {
    return Math.round(value).toLocaleString();
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = millions.toFixed(1);
    return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted}M`;
  }
  const thousands = value / 1000;
  const formatted = thousands.toFixed(1);
  return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted}k`;
}
