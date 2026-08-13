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

/**
 * Pure helper to sanitize a single SetLog ensuring valid types and defaults.
 */
export function sanitizeSetLog(set: Partial<SetLog> | null | undefined, fallbackId?: string): SetLog {
  const id = set?.id || fallbackId || `set_${Math.random().toString(36).substring(2, 9)}`;
  const weight = typeof set?.weight === 'number' ? String(set.weight) : (set?.weight || '');
  const reps = typeof set?.reps === 'number' ? String(set.reps) : (set?.reps || '');
  const done = Boolean(set?.done);

  return {
    id,
    weight: weight.trim(),
    reps: reps.trim(),
    done
  };
}

/**
 * Hardens and sanitizes a complete SessionLog according to the GainLog data contract.
 */
export function sanitizeSessionLog(
  rawLog: Partial<Omit<SessionLog, 'sets'>> & { id: string; workoutId: string; date: string; sets?: Record<string, any[]> }
): SessionLog {
  const sanitizedSets: Record<string, SetLog[]> = {};

  if (rawLog.sets && typeof rawLog.sets === 'object') {
    Object.entries(rawLog.sets).forEach(([exDefId, setsList]) => {
      if (Array.isArray(setsList)) {
        sanitizedSets[exDefId] = setsList.map((s, idx) => sanitizeSetLog(s, `${exDefId}_set_${idx}`));
      }
    });
  }

  const durationMin = Number(rawLog.durationMinutes);

  return {
    id: String(rawLog.id),
    workoutId: String(rawLog.workoutId),
    date: String(rawLog.date),
    sets: sanitizedSets,
    complete: Boolean(rawLog.complete),
    durationMinutes: Number.isFinite(durationMin) && durationMin >= 0 ? Math.floor(durationMin) : 0
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
 * Returns all sets for a given exercise from a session log (raw or completed).
 */
export function getExerciseSets(
  log: SessionLog | null | undefined,
  exerciseDefinitionId: string,
  onlyDone = false
): SetLog[] {
  if (!log || !log.sets || !log.sets[exerciseDefinitionId]) return [];
  const sets = log.sets[exerciseDefinitionId] || [];
  return onlyDone ? sets.filter(s => s && s.done) : sets;
}

/**
 * Calculates total volume (weight × reps in kg) for a specific exercise within a session.
 * Invariant: only done === true sets count.
 */
export function getExerciseVolume(log: SessionLog | null | undefined, exerciseDefinitionId: string): number {
  const sets = getExerciseSets(log, exerciseDefinitionId, true);
  return sets.reduce((total, s) => {
    const w = parseFloat(s.weight) || 0;
    const r = parseInt(s.reps, 10) || 0;
    return total + (w * r);
  }, 0);
}

/**
 * Calculates total volume across all completed exercises in a session.
 * Invariant: only done === true sets count.
 */
export function getSessionVolume(log: SessionLog | null | undefined): number {
  if (!log || !log.sets) return 0;
  let total = 0;
  Object.keys(log.sets).forEach(exDefId => {
    total += getExerciseVolume(log, exDefId);
  });
  return total;
}

/**
 * Canonical general volume calculator (for SessionLog or raw sets record)
 */
export function calculateVolume(log: SessionLog | { sets: Record<string, SetLog[]> } | null | undefined): number {
  if (!log || !log.sets) return 0;
  let total = 0;
  Object.values(log.sets).forEach(sets => {
    (sets || []).forEach(s => {
      if (s && s.done && s.weight && s.reps) {
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

/**
 * Calculates total volume lifted across a collection of logs
 */
export function calculateTotalWeightLifted(logs: Record<string, SessionLog> | SessionLog[] | null | undefined): number {
  if (!logs) return 0;
  const logArray = Array.isArray(logs) ? logs : Object.values(logs);
  return logArray.reduce((acc, log) => acc + calculateVolume(log), 0);
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

/**
 * Finds the heaviest completed set for an exercise in a single session.
 */
export function getHeaviestSet(
  log: SessionLog | null | undefined,
  exerciseDefinitionId: string
): { weight: number; reps: string; set: SetLog } | null {
  const completed = getExerciseSets(log, exerciseDefinitionId, true);
  let best: { weight: number; reps: string; set: SetLog } | null = null;

  completed.forEach(s => {
    const w = parseFloat(s.weight) || 0;
    if (w > 0 && (!best || w > best.weight)) {
      best = { weight: w, reps: s.reps || '0', set: s };
    }
  });

  return best;
}

/**
 * Extracts chronologically sorted history for a specific exercise definition.
 * [0] is newest session, remaining are older.
 */
export function getExerciseHistory(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  exerciseDefinitionId: string
): { date: string; sets: SetLog[]; logId: string; maxW: number }[] {
  const sorted = getSortedLogsDescending(logs);
  const history: { date: string; sets: SetLog[]; logId: string; maxW: number }[] = [];

  sorted.forEach(l => {
    const sets = getExerciseSets(l, exerciseDefinitionId, true);
    if (sets.length > 0) {
      const weights = sets.map(s => parseFloat(s.weight) || 0);
      const maxW = weights.length > 0 ? Math.max(...weights) : 0;
      history.push({
        date: l.date,
        sets,
        logId: l.id,
        maxW
      });
    }
  });

  return history;
}

/**
 * Retrieves the latest completed session record for an exercise definition.
 */
export function getLatestExerciseSession(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  exerciseDefinitionId: string
): { date: string; sets: SetLog[]; logId: string; maxW: number } | null {
  const history = getExerciseHistory(logs, exerciseDefinitionId);
  return history.length > 0 ? history[0] : null;
}

/**
 * Finds all-time heaviest completed weight for an exercise.
 */
export function getAllTimeHeaviestSet(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  exerciseDefinitionId: string
): { weight: number; reps: string; date: string } | null {
  const history = getExerciseHistory(logs, exerciseDefinitionId);
  let heaviest: { weight: number; reps: string; date: string } | null = null;

  history.forEach(session => {
    session.sets.forEach(s => {
      const w = parseFloat(s.weight);
      if (!isNaN(w) && w >= 0) {
        if (!heaviest || w > heaviest.weight) {
          heaviest = { weight: w, reps: s.reps || '0', date: session.date };
        }
      }
    });
  });

  return heaviest;
}

/**
 * Finds all-time best estimated 1RM for an exercise.
 */
export function getAllTimeBestE1RM(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  exerciseDefinitionId: string
): { e1rm: number; weight: number; reps: string; date: string } | null {
  const history = getExerciseHistory(logs, exerciseDefinitionId);
  let best: { e1rm: number; weight: number; reps: string; date: string } | null = null;

  history.forEach(session => {
    session.sets.forEach(s => {
      const w = parseFloat(s.weight) || 0;
      const r = parseInt(s.reps, 10) || 0;
      const e1rm = calculateE1RM(w, r);
      if (e1rm > 0 && (!best || e1rm > best.e1rm)) {
        best = { e1rm, weight: w, reps: s.reps || '0', date: session.date };
      }
    });
  });

  return best;
}

/**
 * Calculates current consecutive workout day streak.
 */
export function calculateStreak(
  logs: Record<string, SessionLog> | SessionLog[] | undefined | null,
  referenceDate: Date = new Date()
): number {
  const logArray = Array.isArray(logs) ? logs : Object.values(logs || {});
  const datesSet = new Set(logArray.map(l => l?.date).filter(Boolean));
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
 * Calculates longest consecutive workout day streak across all history.
 */
export function calculateLongestStreak(
  logs: Record<string, SessionLog> | SessionLog[] | undefined | null
): number {
  const logArray = Array.isArray(logs) ? logs : Object.values(logs || {});
  const distinctDates = Array.from(new Set(logArray.map(l => l?.date).filter(Boolean) as string[])).sort();
  if (distinctDates.length === 0) return 0;

  let longestStreak = 0;
  let tempStreak = 0;
  let prevDateObj: Date | null = null;

  distinctDates.forEach(dateStr => {
    const curDateObj = parseISO(dateStr);
    if (isValid(curDateObj)) {
      if (!prevDateObj) {
        tempStreak = 1;
      } else {
        const diff = differenceInCalendarDays(curDateObj, prevDateObj);
        if (diff === 1) {
          tempStreak++;
        } else if (diff > 1) {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDateObj = curDateObj;
    }
  });

  return longestStreak;
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

export function getRelativeTimeString(startTime: number, now: number = Date.now()): string {
  const elapsedMin = Math.floor((now - startTime) / 60000);
  return elapsedMin < 60 
    ? `${elapsedMin} min ago` 
    : `${Math.floor(elapsedMin / 60)}h ago`;
}
