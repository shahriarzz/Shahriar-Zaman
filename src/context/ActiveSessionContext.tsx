import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useActiveSession, ActiveSession } from '../hooks/useActiveSession';
import { SetLog } from '../types/fitness';

export interface ActiveSessionContextType {
  activeSession: ActiveSession | null;
  startActiveSession: (workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => void;
  updateActiveSessionSets: (sets: Record<string, SetLog[]>) => void;
  clearActiveSession: () => void;
}

export const ActiveSessionContext = createContext<ActiveSessionContextType | undefined>(undefined);

// Registration for test mocks that provide FitnessContext directly without ActiveSessionProvider
let fallbackFitnessContextRef: React.Context<any> | null = null;
export function registerFitnessContextForFallback(ctx: React.Context<any>) {
  fallbackFitnessContextRef = ctx;
}

export const ActiveSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sessionManager = useActiveSession();
  const sessionRef = useRef(sessionManager.activeSession);

  useEffect(() => {
    sessionRef.current = sessionManager.activeSession;
  }, [sessionManager.activeSession]);

  // Flush in-flight active session state on visibility change / before unload for robust durability
  useEffect(() => {
    const handleFlush = () => {
      try {
        if (sessionRef.current) {
          localStorage.setItem('gl_active_session', JSON.stringify(sessionRef.current));
        }
      } catch (err) {
        console.warn('Failed to flush gl_active_session during unload/backgrounding', err);
      }
    };

    window.addEventListener('beforeunload', handleFlush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    });

    return () => {
      window.removeEventListener('beforeunload', handleFlush);
    };
  }, []);

  return (
    <ActiveSessionContext.Provider value={sessionManager}>
      {children}
    </ActiveSessionContext.Provider>
  );
};

export const useActiveSessionContext = (): ActiveSessionContextType => {
  const context = useContext(ActiveSessionContext);
  if (context) return context;

  // Fallback for tests that render components inside a mock FitnessContext.Provider
  if (fallbackFitnessContextRef) {
    try {
      const fitness = useContext(fallbackFitnessContextRef);
      if (fitness && (fitness.activeSession !== undefined || fitness.startActiveSession !== undefined)) {
        return {
          activeSession: fitness.activeSession ?? null,
          startActiveSession: fitness.startActiveSession ?? (() => {}),
          updateActiveSessionSets: fitness.updateActiveSessionSets ?? (() => {}),
          clearActiveSession: fitness.clearActiveSession ?? (() => {})
        };
      }
    } catch {
      // Fall through to default
    }
  }

  return {
    activeSession: null,
    startActiveSession: () => {},
    updateActiveSessionSets: () => {},
    clearActiveSession: () => {}
  };
};
