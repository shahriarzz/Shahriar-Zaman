import { format, differenceInCalendarDays, parseISO, subDays, isValid } from 'date-fns';
import { 
  SessionLog, 
  SetLog, 
  Workout, 
  ExerciseDefinition, 
  WorkoutExercise, 
  CardioFinisher, 
  WorkoutType,
  AppState,
  WeightLogEntry
} from '../types/fitness';

export const CYCLE_LENGTH = 8;

export const BODY_WEIGHT_LIMITS = {
  min: 20,
  max: 300,
} as const;

/**
 * Sanitizes a millisecond timestamp into a non-negative finite integer.
 */
export function sanitizeTimestamp(raw: any, fallback: number = 0): number {
  if (raw === null || raw === undefined || raw === false) return fallback;
  if (typeof raw === 'string' && raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

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

/**
 * Strictly validates that a value is a valid YYYY-MM-DD calendar date string.
 * Enforces:
 * - Must be string.
 * - Must match exact /^\d{4}-\d{2}-\d{2}$/ format.
 * - Must parse to a valid Date object.
 * - Re-formatting must match input exactly (rejects calendar rollovers like '2026-02-31').
 */
export function isValidCalendarDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const parsed = parseISO(trimmed);
  if (!isValid(parsed)) return false;
  return format(parsed, 'yyyy-MM-dd') === trimmed;
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
 * Shared strict parser for weight values.
 * - Accepts finite positive numbers or numeric strings representing valid integers/decimals.
 * - Rejects non-numeric characters (e.g. "12abc"), negative values, and extreme out-of-range values.
 * - Default range: min = 0, max = 5000 (kg/lbs)
 */
export function parseStrictWeight(val: unknown, min: number = 0, max: number = 5000): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return (Number.isFinite(val) && val >= min && val <= max) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return (Number.isFinite(num) && num >= min && num <= max) ? num : null;
  }
  return null;
}

/**
 * Shared strict parser for repetitions (reps).
 * - Reps must be strictly WHOLE positive numbers (integers).
 * - Rejects decimals (e.g. "5.5"), non-numeric strings (e.g. "12abc"), negative values, and non-finite values.
 * - Default range: min = 0, max = 1000
 */
export function parseStrictReps(val: unknown, min: number = 0, max: number = 1000): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return (Number.isFinite(val) && Number.isInteger(val) && val >= min && val <= max) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return (Number.isFinite(num) && Number.isInteger(num) && num >= min && num <= max) ? num : null;
  }
  return null;
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
  const parsedW = parseStrictWeight(rawWeight, 0, 5000);
  const weightStr = parsedW !== null ? String(rawWeight).trim() : '';

  const parsedR = parseStrictReps(set?.reps, 0, 1000);
  const repsStr = parsedR !== null ? String(set?.reps).trim() : '';
  const done = Boolean(set?.done ?? set?.completed);

  return {
    id,
    weight: weightStr,
    reps: repsStr,
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
    ...(rawLog?.updatedAt !== undefined ? { updatedAt: sanitizeTimestamp(rawLog.updatedAt, 0) } : {})
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
    updatedAt: sanitizeTimestamp(raw?.updatedAt, 0)
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
    sets: (() => {
      const numSets = Number(e?.sets);
      return Number.isFinite(numSets) && numSets >= 1 && numSets <= 50 ? Math.floor(numSets) : 3;
    })(),
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
  if (typeof raw?.cycleDay === 'number' && Number.isInteger(raw.cycleDay) && raw.cycleDay >= 1 && raw.cycleDay <= CYCLE_LENGTH) {
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
    updatedAt: sanitizeTimestamp(raw?.updatedAt, 0)
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
  const w = parseStrictWeight(set.weight, 0.0001, 5000);
  const r = parseStrictReps(set.reps, 1, 1000);
  if (w === null || r === null) return 0;
  const vol = w * r;
  return Number.isFinite(vol) ? vol : 0;
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
 * Invariant: weight and reps must be strictly positive and finite.
 */
export function calculateE1RM(weight: number | string, reps: number | string): number {
  const w = parseStrictWeight(weight, 0.0001, 5000);
  const r = parseStrictReps(reps, 1, 1000);

  if (w === null || r === null) return 0;
  if (r === 1) return Math.round(w * 10) / 10;

  const effectiveReps = Math.min(r, 30);
  const e1rm = w * (1 + effectiveReps / 30);
  return Number.isFinite(e1rm) ? Math.round(e1rm * 10) / 10 : 0;
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
  if (isValidCalendarDate(cycleStart)) {
    start = parseISO(cycleStart);
  } else {
    // Deterministic fallback: anchor to supplied targetDate
    start = target;
  }
  
  const diff = differenceInCalendarDays(target, start);
  return (((diff % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;
}

export interface CycleScheduleDayState {
  /** Scheduled / carried-forward cycle day for this calendar date (1..8) */
  scheduledCycleDay: number;
  /** Effective cycle day for selectors/UI (matches scheduledCycleDay unless overridden today by a completed out-of-order core workout) */
  effectiveCycleDay: number;
  isScheduledRest: boolean;
  isExpectedCore: boolean;
  completedCoreLogs: SessionLog[];
  expectedWorkout: Workout | undefined;
}

export interface CycleScheduleResolver {
  effectiveStart: string;
  todayStr: string;
  nextDayAfterToday: number;
  getCycleDayForDate: (targetDate: Date | string) => number;
  getDayState: (targetDate: Date | string) => CycleScheduleDayState | null;
}

export interface BuildCycleScheduleOptions {
  cycleStart?: string | null;
  referenceToday?: Date | string;
  coreWorkoutByCycleDayMap?: Map<number, Workout> | Map<string, Workout> | Workout[] | null;
  logsByDate?: Map<string, SessionLog[]> | SessionLog[] | Record<string, SessionLog> | null;
  excludeLogId?: string;
}

const EMPTY_SESSION_LOGS: SessionLog[] = [];

function parseYMDParts(dateStr: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return [y, m, d];
}

function addDaysToYMD(dateStr: string, days: number): string {
  const parts = parseYMDParts(dateStr);
  if (!parts) return dateStr;
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function diffCalendarDaysYMD(targetStr: string, baseStr: string): number {
  const t = parseYMDParts(targetStr);
  const b = parseYMDParts(baseStr);
  if (!t || !b) return 0;
  const utcT = Date.UTC(t[0], t[1] - 1, t[2]);
  const utcB = Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.round((utcT - utcB) / 86400000);
}

function normalizeToDateStr(input: Date | string | undefined): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (isValidCalendarDate(trimmed)) return trimmed;
    const parsed = parseISO(trimmed);
    return isValid(parsed) ? dk(parsed) : dk();
  }
  if (input instanceof Date && isValid(input)) {
    return dk(input);
  }
  return dk();
}

/**
 * Canonical completion-aware 8-day cycle schedule resolver.
 *
 * Rules:
 * - Distinguishes calendar progression from core training completion state.
 * - Missed core training days carry forward the incomplete core workout to the following calendar day.
 * - Scheduled recovery days (type === 'rest') advance naturally without requiring a log.
 * - Completing any core training workout (including out-of-order) advances the next day to (K % 8) + 1.
 * - Bonus workouts (isCore !== true) and incomplete sessions (complete !== true) never advance or alter the cycle.
 * - Historical dates (< todayStr) are deterministic and never rewritten by today's completion state.
 */
export function buildCycleScheduleResolver({
  cycleStart,
  referenceToday = new Date(),
  coreWorkoutByCycleDayMap,
  logsByDate,
  excludeLogId
}: BuildCycleScheduleOptions): CycleScheduleResolver {
  const todayStr = normalizeToDateStr(referenceToday);
  const effectiveStart = isValidCalendarDate(cycleStart) ? cycleStart.trim() : todayStr;

  const coreWorkoutByDay = new Map<number, Workout>();
  const coreWorkoutById = new Map<string, Workout>();

  if (coreWorkoutByCycleDayMap) {
    const registerCoreWorkout = (w: Workout | undefined | null, explicitDay?: number) => {
      if (!w || w.isCore !== true) return;
      const day = explicitDay !== undefined ? explicitDay : w.cycleDay;
      if (typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= CYCLE_LENGTH) {
        if (!coreWorkoutByDay.has(day)) {
          coreWorkoutByDay.set(day, w);
        }
        if (w.id) {
          coreWorkoutById.set(w.id, w);
        }
      }
    };

    if (Array.isArray(coreWorkoutByCycleDayMap)) {
      coreWorkoutByCycleDayMap.forEach(w => registerCoreWorkout(w));
    } else if (coreWorkoutByCycleDayMap instanceof Map) {
      coreWorkoutByCycleDayMap.forEach((w, key) => {
        if (typeof key === 'number') {
          registerCoreWorkout(w, key);
        } else {
          registerCoreWorkout(w);
        }
      });
    }
  }

  const isExplicitCoreMap = coreWorkoutByDay.size > 0;

  // Normalize completed core training logs per calendar date
  const completedCoreByDate = new Map<string, SessionLog[]>();
  const addLogIfCompletedCore = (log: SessionLog | null | undefined) => {
    if (!log || !isCompletedSession(log) || !log.date || log.date < effectiveStart || log.date > todayStr) {
      return;
    }
    if (excludeLogId && log.id === excludeLogId) return;
    const coreWo = log.workoutId ? coreWorkoutById.get(log.workoutId) : undefined;
    if (!coreWo || coreWo.isCore !== true || coreWo.type === 'rest') return;
    const list = completedCoreByDate.get(log.date);
    if (list) {
      list.push(log);
    } else {
      completedCoreByDate.set(log.date, [log]);
    }
  };

  if (logsByDate instanceof Map) {
    logsByDate.forEach(dayLogs => {
      if (Array.isArray(dayLogs)) {
        dayLogs.forEach(addLogIfCompletedCore);
      }
    });
  } else if (Array.isArray(logsByDate)) {
    logsByDate.forEach(addLogIfCompletedCore);
  } else if (logsByDate && typeof logsByDate === 'object') {
    Object.values(logsByDate).forEach(addLogIfCompletedCore);
  }

  completedCoreByDate.forEach(list => {
    if (list.length > 1) {
      list.sort((a, b) => {
        const ua = Number(a.updatedAt) || 0;
        const ub = Number(b.updatedAt) || 0;
        if (ua !== ub) return ua - ub;
        return (a.id || '').localeCompare(b.id || '');
      });
    }
  });

  const sortedActiveCoreDates = Array.from(completedCoreByDate.keys()).sort();
  let activeDatePtr = 0;

  const dayStatesMap = new Map<string, CycleScheduleDayState>();
  const carrySegments: { start: string; endBefore: string; state: CycleScheduleDayState }[] = [];

  let scheduledDay = 1;
  let nextDayAfterToday = 1;

  if (effectiveStart <= todayStr) {
    let curStr = effectiveStart;

    while (curStr <= todayStr) {
      const scheduledWo = coreWorkoutByDay.get(scheduledDay);
      const isScheduledRest = scheduledWo
        ? scheduledWo.type === 'rest'
        : (!isExplicitCoreMap && (scheduledDay === 4 || scheduledDay === 8));
      const isExpectedCore = scheduledWo
        ? (scheduledWo.isCore === true && scheduledWo.type !== 'rest')
        : (!isExplicitCoreMap && !isScheduledRest);

      const completedCoreLogs = completedCoreByDate.get(curStr) || EMPTY_SESSION_LOGS;

      if (curStr === todayStr) {
        let effectiveCycleDay = scheduledDay;
        if (completedCoreLogs.length > 0) {
          const lastCoreLog = completedCoreLogs[completedCoreLogs.length - 1];
          const lastCoreWo = coreWorkoutById.get(lastCoreLog.workoutId);
          if (lastCoreWo?.cycleDay) {
            effectiveCycleDay = lastCoreWo.cycleDay;
          }
        }
        dayStatesMap.set(curStr, {
          scheduledCycleDay: scheduledDay,
          effectiveCycleDay,
          isScheduledRest,
          isExpectedCore,
          completedCoreLogs,
          expectedWorkout: scheduledWo
        });
        nextDayAfterToday = (effectiveCycleDay % CYCLE_LENGTH) + 1;
        break;
      }

      // curStr < todayStr (historical date)
      if (completedCoreLogs.length > 0) {
        dayStatesMap.set(curStr, {
          scheduledCycleDay: scheduledDay,
          effectiveCycleDay: scheduledDay,
          isScheduledRest,
          isExpectedCore,
          completedCoreLogs,
          expectedWorkout: scheduledWo
        });
        const lastCoreLog = completedCoreLogs[completedCoreLogs.length - 1];
        const lastCoreWo = coreWorkoutById.get(lastCoreLog.workoutId);
        const completedDay = lastCoreWo?.cycleDay || scheduledDay;
        scheduledDay = (completedDay % CYCLE_LENGTH) + 1;
        curStr = addDaysToYMD(curStr, 1);
      } else if (isScheduledRest || !isExpectedCore) {
        // Recovery / unmapped slots advance naturally without requiring a log
        dayStatesMap.set(curStr, {
          scheduledCycleDay: scheduledDay,
          effectiveCycleDay: scheduledDay,
          isScheduledRest,
          isExpectedCore,
          completedCoreLogs: EMPTY_SESSION_LOGS,
          expectedWorkout: scheduledWo
        });
        scheduledDay = (scheduledDay % CYCLE_LENGTH) + 1;
        curStr = addDaysToYMD(curStr, 1);
      } else {
        // Missed core training day -> carries forward unchanged until next completed core log date (< todayStr) or todayStr
        while (activeDatePtr < sortedActiveCoreDates.length && sortedActiveCoreDates[activeDatePtr] <= curStr) {
          activeDatePtr++;
        }
        const nextActive =
          activeDatePtr < sortedActiveCoreDates.length && sortedActiveCoreDates[activeDatePtr] < todayStr
            ? sortedActiveCoreDates[activeDatePtr]
            : todayStr;

        carrySegments.push({
          start: curStr,
          endBefore: nextActive,
          state: {
            scheduledCycleDay: scheduledDay,
            effectiveCycleDay: scheduledDay,
            isScheduledRest: false,
            isExpectedCore: true,
            completedCoreLogs: EMPTY_SESSION_LOGS,
            expectedWorkout: scheduledWo
          }
        });
        curStr = nextActive;
      }
    }
  }

  const getDayState = (targetDate: Date | string): CycleScheduleDayState | null => {
    const targetStr = normalizeToDateStr(targetDate);
    if (targetStr < effectiveStart || targetStr > todayStr) return null;

    const direct = dayStatesMap.get(targetStr);
    if (direct) return direct;

    // Binary search carrySegments (sorted, non-overlapping [start, endBefore))
    let lo = 0;
    let hi = carrySegments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const seg = carrySegments[mid];
      if (targetStr < seg.start) {
        hi = mid - 1;
      } else if (targetStr >= seg.endBefore) {
        lo = mid + 1;
      } else {
        return seg.state;
      }
    }
    return null;
  };

  const getCycleDayForDate = (targetDate: Date | string): number => {
    const targetStr = normalizeToDateStr(targetDate);
    if (targetStr < effectiveStart) {
      return 0;
    }
    if (targetStr <= todayStr) {
      return getDayState(targetStr)?.effectiveCycleDay ?? 0;
    }
    // Future date projection
    if (effectiveStart > todayStr) {
      const diffFromFutureStart = diffCalendarDaysYMD(targetStr, effectiveStart);
      return ((diffFromFutureStart % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH + 1;
    }
    const daysBeyondToday = diffCalendarDaysYMD(targetStr, todayStr);
    return ((nextDayAfterToday - 1 + (daysBeyondToday - 1)) % CYCLE_LENGTH) + 1;
  };

  return {
    effectiveStart,
    todayStr,
    nextDayAfterToday,
    getCycleDayForDate,
    getDayState
  };
}

export function normalizeWeightEntry(
  entry: number | { weight: number; updatedAt?: number } | undefined | null,
  defaultTimestamp = 0
): { weight: number; updatedAt: number } | null {
  if (entry === undefined || entry === null) return null;
  const safeDefault = sanitizeTimestamp(defaultTimestamp, 0);
  if (typeof entry === 'number') {
    return Number.isFinite(entry) ? { weight: entry, updatedAt: safeDefault } : null;
  }
  if (typeof entry === 'object' && typeof entry.weight === 'number' && Number.isFinite(entry.weight)) {
    return {
      weight: entry.weight,
      updatedAt: entry.updatedAt !== undefined ? sanitizeTimestamp(entry.updatedAt, safeDefault) : safeDefault
    };
  }
  return null;
}

/**
 * Sanitizes and validates AppState loaded from remote sync or external imports.
 */
export function sanitizeAppState(raw: any): AppState {
  const rawCycleStart = typeof raw?.cycleStart === 'string' ? raw.cycleStart.trim() : '';
  const cycleStart = isValidCalendarDate(rawCycleStart) ? rawCycleStart : '';

  const rawWeightLog = raw?.weightLog;
  const hasWeightLog = Boolean(rawWeightLog && typeof rawWeightLog === 'object' && !Array.isArray(rawWeightLog));
  const sanitizedWeightLog: Record<string, number | WeightLogEntry> = {};

  if (hasWeightLog) {
    Object.entries(rawWeightLog).forEach(([date, entry]) => {
      if (!isValidCalendarDate(date)) return;
      const norm = normalizeWeightEntry(entry as any, 0);
      if (!norm || !Number.isFinite(norm.weight)) return;
      if (norm.weight < BODY_WEIGHT_LIMITS.min || norm.weight > BODY_WEIGHT_LIMITS.max) return;
      if (typeof entry === 'number') {
        sanitizedWeightLog[date] = norm.weight;
      } else {
        sanitizedWeightLog[date] = {
          weight: norm.weight,
          updatedAt: norm.updatedAt
        };
      }
    });
  }

  return {
    cycleStart,
    ...(hasWeightLog ? { weightLog: sanitizedWeightLog } : {}),
    ...(raw?.updatedAt !== undefined ? { updatedAt: sanitizeTimestamp(raw.updatedAt, 0) } : {})
  };
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
  observedMin: number;
  observedMax: number;
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
  const observedMin = Math.min(...weights);
  const observedMax = Math.max(...weights);
  const min = observedMin - 0.5;
  const max = observedMax + 0.5;
  const range = max - min || 1;
  const w = sorted.length > 1 ? 100 / (sorted.length - 1) : 100;
  return { sorted, weights, min, max, observedMin, observedMax, range, w };
}

export function getRelativeTimeString(startTime: number, now: number = Date.now()): string {
  if (!Number.isFinite(startTime) || startTime <= 0) return 'recently';
  // Clamp or explicitly handle future timestamps so it cannot display negative minutes ago
  if (startTime > now) return 'just now';
  const elapsedMin = Math.floor((now - startTime) / 60000);
  if (elapsedMin < 1) return 'just now';
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
  if (!Number.isFinite(value) || value <= 0) return '0';
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
