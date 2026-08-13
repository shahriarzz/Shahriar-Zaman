import { SessionLog, SetLog } from '../types/fitness';

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
export function sanitizeSessionLog(rawLog: Partial<SessionLog> & { id: string; workoutId: string; date: string }): SessionLog {
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
 * Calculates Estimated 1RM (e1RM) using the standard Epley formula:
 * e1RM = weight * (1 + reps / 30) for reps > 1, or weight for reps === 1.
 */
export function calculateE1RM(weight: number | string, reps: number | string): number {
  const w = typeof weight === 'number' ? weight : parseFloat(weight) || 0;
  const r = typeof reps === 'number' ? reps : parseInt(reps, 10) || 0;

  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return Math.round(w * 10) / 10;

  // Epley formula capped for realism
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
): { date: string; sets: SetLog[]; logId: string }[] {
  const sorted = getSortedLogsDescending(logs);
  const history: { date: string; sets: SetLog[]; logId: string }[] = [];

  sorted.forEach(l => {
    const sets = getExerciseSets(l, exerciseDefinitionId, true);
    if (sets.length > 0 && sets.some(s => parseFloat(s.weight) > 0)) {
      history.push({
        date: l.date,
        sets,
        logId: l.id
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
): { date: string; sets: SetLog[]; logId: string } | null {
  const history = getExerciseHistory(logs, exerciseDefinitionId);
  return history.length > 0 ? history[0] : null;
}

/**
 * SessionView PR: Finds all-time heaviest completed weight for an exercise.
 */
export function getAllTimeHeaviestSet(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  exerciseDefinitionId: string
): { weight: number; reps: string; date: string } | null {
  const history = getExerciseHistory(logs, exerciseDefinitionId);
  let heaviest: { weight: number; reps: string; date: string } | null = null;

  history.forEach(session => {
    session.sets.forEach(s => {
      const w = parseFloat(s.weight) || 0;
      if (w > 0 && (!heaviest || w > heaviest.weight)) {
        heaviest = { weight: w, reps: s.reps || '0', date: session.date };
      }
    });
  });

  return heaviest;
}

/**
 * Analytics e1RM: Finds all-time best estimated 1RM for an exercise.
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
