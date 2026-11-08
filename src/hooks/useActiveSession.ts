import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

export interface ActiveSessionMeta {
  workoutId: string;
  startTime: number;
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

  const latestSessionRef = useRef<ActiveSession | null>(activeSession);
  latestSessionRef.current = activeSession;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushActiveSession = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    try {
      if (latestSessionRef.current) {
        localStorage.setItem('gl_active_session', JSON.stringify(latestSessionRef.current));
      } else {
        localStorage.removeItem('gl_active_session');
      }
    } catch (e) {
      console.warn("Failed to flush gl_active_session to localStorage", e);
    }
  }, []);

  const scheduleDebouncedSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      try {
        if (latestSessionRef.current) {
          localStorage.setItem('gl_active_session', JSON.stringify(latestSessionRef.current));
        } else {
          localStorage.removeItem('gl_active_session');
        }
      } catch (e) {
        console.warn("Failed to save debounced gl_active_session", e);
      }
    }, 250);
  }, []);

  // Flush synchronously on page hide, before unload, and visibility change to hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushActiveSession();
      }
    };

    window.addEventListener('beforeunload', flushActiveSession);
    window.addEventListener('pagehide', flushActiveSession);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flushActiveSession);
      window.removeEventListener('pagehide', flushActiveSession);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [flushActiveSession]);

  const startActiveSession = useCallback((
    workoutId: string, 
    sets: Record<string, SetLog[]>, 
    startTime = Date.now()
  ) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const session: ActiveSession = { workoutId, startTime, sessionSets: sets };
    latestSessionRef.current = session;
    setActiveSession(session);
    try {
      localStorage.setItem('gl_active_session', JSON.stringify(session));
    } catch (e) {
      console.warn("Failed to synchronously initialize gl_active_session", e);
    }
  }, []);

  const updateActiveSessionSets = useCallback((
    updater: Record<string, SetLog[]> | ((prev: Record<string, SetLog[]>) => Record<string, SetLog[]>)
  ) => {
    setActiveSession(prev => {
      if (!prev) return null;
      const nextSets = typeof updater === 'function' ? updater(prev.sessionSets) : updater;
      const updated: ActiveSession = { ...prev, sessionSets: nextSets };
      latestSessionRef.current = updated;
      return updated;
    });
    scheduleDebouncedSave();
  }, [scheduleDebouncedSave]);

  const clearActiveSession = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    latestSessionRef.current = null;
    setActiveSession(null);
    try {
      localStorage.removeItem('gl_active_session');
    } catch {}
  }, []);

  const activeSessionMeta = useMemo<ActiveSessionMeta | null>(() => {
    if (!activeSession) return null;
    return {
      workoutId: activeSession.workoutId,
      startTime: activeSession.startTime
    };
  }, [activeSession?.workoutId, activeSession?.startTime]);

  return useMemo(() => ({
    activeSession,
    activeSessionMeta,
    startActiveSession,
    updateActiveSessionSets,
    clearActiveSession,
    flushActiveSession
  }), [
    activeSession,
    activeSessionMeta,
    startActiveSession,
    updateActiveSessionSets,
    clearActiveSession,
    flushActiveSession
  ]);
}

