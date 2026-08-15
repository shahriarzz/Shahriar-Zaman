import { useState, useEffect, useCallback, useMemo } from 'react';
import { SetLog } from '../types/fitness';

export interface ActiveSession {
  workoutId: string;
  startTime: number;
  sessionSets: Record<string, SetLog[]>;
}

export function useActiveSession() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => {
    try {
      const saved = localStorage.getItem('gl_active_session');
      return saved ? JSON.parse(saved) : null;
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
