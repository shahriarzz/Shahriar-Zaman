import { useState, useEffect, useCallback, useMemo } from 'react';
import { SetLog } from '../types/fitness';
import { generateId } from '../utils/fitnessHelpers';

export interface ActiveSession {
  workoutId: string;
  startTime: number;
  sessionSets: Record<string, SetLog[]>;
}

/**
 * Normalizes an ActiveSession at the persistence/migration boundary.
 * Guarantees deterministic set IDs, valid timestamps, and consistent types.
 */
export function normalizeActiveSession(raw: any): ActiveSession | null {
  if (!raw || typeof raw !== 'object' || !raw.workoutId || !raw.sessionSets) return null;
  const normalizedSets: Record<string, SetLog[]> = {};
  
  Object.entries(raw.sessionSets).forEach(([exId, sets]) => {
    if (Array.isArray(sets)) {
      normalizedSets[exId] = sets.map((s: any, idx: number) => ({
        id: s?.id || `set_${exId}_${idx}_${generateId()}`,
        weight: typeof s?.weight === 'number' || typeof s?.weight === 'string' ? String(s.weight) : '',
        reps: typeof s?.reps === 'number' || typeof s?.reps === 'string' ? String(s.reps) : '',
        done: Boolean(s?.done || s?.completed)
      }));
    }
  });

  return {
    workoutId: String(raw.workoutId),
    startTime: typeof raw.startTime === 'number' ? raw.startTime : Date.now(),
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

