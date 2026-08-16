import { useState, useEffect, useCallback, useMemo } from 'react';
import { SetLog } from '../types/fitness';

export interface ActiveSession {
  workoutId: string;
  startTime: number;
  sessionSets: Record<string, SetLog[]>;
}

export type RawActiveSession = {
  workoutId?: unknown;
  startTime?: unknown;
  sessionSets?: Record<string, unknown>;
};

interface RawSetItem {
  id?: unknown;
  weight?: unknown;
  reps?: unknown;
  done?: unknown;
  completed?: unknown;
}

/**
 * Normalizes an ActiveSession at the persistence/migration boundary.
 * Guarantees deterministic set IDs, valid timestamps, and consistent types.
 */
export function normalizeActiveSession(raw: unknown): ActiveSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as RawActiveSession;

  if (typeof session.workoutId !== 'string' && typeof session.workoutId !== 'number') {
    return null;
  }
  const workoutId = String(session.workoutId).trim();
  if (!workoutId) return null;

  if (!session.sessionSets || typeof session.sessionSets !== 'object' || Array.isArray(session.sessionSets)) {
    return null;
  }

  const normalizedSets: Record<string, SetLog[]> = {};
  
  for (const [exId, sets] of Object.entries(session.sessionSets)) {
    if (Array.isArray(sets)) {
      normalizedSets[exId] = sets.map((item: unknown, idx: number): SetLog => {
        if (!item || typeof item !== 'object') {
          return {
            id: `set_${exId}_${idx}`,
            weight: '',
            reps: '',
            done: false
          };
        }
        const s = item as RawSetItem;
        const id = typeof s.id === 'string' && s.id.trim() ? s.id : `set_${exId}_${idx}`;
        const weight = typeof s.weight === 'number' || typeof s.weight === 'string' ? String(s.weight) : '';
        const reps = typeof s.reps === 'number' || typeof s.reps === 'string' ? String(s.reps) : '';
        const done = Boolean(s.done ?? s.completed);

        return { id, weight, reps, done };
      });
    }
  }

  const startTime = typeof session.startTime === 'number' && Number.isFinite(session.startTime) && session.startTime > 0
    ? session.startTime
    : Date.now();

  return {
    workoutId,
    startTime,
    sessionSets: normalizedSets
  };
}

export function useActiveSession() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => {
    try {
      const saved = localStorage.getItem('gl_active_session');
      if (!saved) return null;
      return normalizeActiveSession(JSON.parse(saved));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (activeSession) {
        localStorage.setItem('gl_active_session', JSON.stringify(activeSession));
      } else {
        localStorage.removeItem('gl_active_session');
      }
    } catch (e) {
      console.warn("Failed to update gl_active_session in localStorage", e);
    }
  }, [activeSession]);

  const startActiveSession = useCallback((
    workoutId: string, 
    sets: Record<string, SetLog[]>, 
    startTime = Date.now()
  ) => {
    const session: ActiveSession = { workoutId, startTime, sessionSets: sets };
    setActiveSession(session);
  }, []);

  const updateActiveSessionSets = useCallback((sets: Record<string, SetLog[]>) => {
    setActiveSession(prev => {
      if (!prev) return null;
      return { ...prev, sessionSets: sets };
    });
  }, []);

  const clearActiveSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  return useMemo(() => ({
    activeSession,
    startActiveSession,
    updateActiveSessionSets,
    clearActiveSession
  }), [
    activeSession,
    startActiveSession,
    updateActiveSessionSets,
    clearActiveSession
  ]);
}

