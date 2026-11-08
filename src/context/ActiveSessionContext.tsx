import React, { createContext, useContext, useMemo, useState, useCallback, useRef } from 'react';
import { useActiveSession, ActiveSession, ActiveSessionMeta } from '../hooks/useActiveSession';
import { SetLog } from '../types/fitness';

export interface ActiveSessionMetaContextType {
  activeSession: ActiveSessionMeta | null;
  activeSessionMeta: ActiveSessionMeta | null;
  startActiveSession: (workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => void;
  clearActiveSession: () => void;
  flushActiveSession: () => void;
}

export interface ActiveSessionDataContextType {
  activeSession: ActiveSession | null;
  updateActiveSessionSets: (updater: Record<string, SetLog[]> | ((prev: Record<string, SetLog[]>) => Record<string, SetLog[]>)) => void;
}

export interface ActiveSessionContextType {
  activeSession: ActiveSession | null;
  activeSessionMeta: ActiveSessionMeta | null;
  startActiveSession: (workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => void;
  updateActiveSessionSets: (updater: Record<string, SetLog[]> | ((prev: Record<string, SetLog[]>) => Record<string, SetLog[]>)) => void;
  clearActiveSession: () => void;
  flushActiveSession: () => void;
}

export const ActiveSessionMetaContext = createContext<ActiveSessionMetaContextType | undefined>(undefined);
export const ActiveSessionDataContext = createContext<ActiveSessionDataContextType | undefined>(undefined);
export const ActiveSessionContext = createContext<ActiveSessionContextType | undefined>(undefined);

// Registration for test mocks that provide FitnessContext directly without ActiveSessionProvider
let fallbackFitnessContextRef: React.Context<any> | null = null;
export function registerFitnessContextForFallback(ctx: React.Context<any>) {
  fallbackFitnessContextRef = ctx;
}

export const ActiveSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sessionManager = useActiveSession();

  const metaValue = useMemo<ActiveSessionMetaContextType>(() => ({
    activeSession: sessionManager.activeSessionMeta,
    activeSessionMeta: sessionManager.activeSessionMeta,
    startActiveSession: sessionManager.startActiveSession,
    clearActiveSession: sessionManager.clearActiveSession,
    flushActiveSession: sessionManager.flushActiveSession
  }), [
    sessionManager.activeSessionMeta,
    sessionManager.startActiveSession,
    sessionManager.clearActiveSession,
    sessionManager.flushActiveSession
  ]);

  const dataValue = useMemo<ActiveSessionDataContextType>(() => ({
    activeSession: sessionManager.activeSession,
    updateActiveSessionSets: sessionManager.updateActiveSessionSets
  }), [
    sessionManager.activeSession,
    sessionManager.updateActiveSessionSets
  ]);

  const combinedValue = useMemo<ActiveSessionContextType>(() => ({
    activeSession: sessionManager.activeSession,
    activeSessionMeta: sessionManager.activeSessionMeta,
    startActiveSession: sessionManager.startActiveSession,
    updateActiveSessionSets: sessionManager.updateActiveSessionSets,
    clearActiveSession: sessionManager.clearActiveSession,
    flushActiveSession: sessionManager.flushActiveSession
  }), [
    sessionManager.activeSession,
    sessionManager.activeSessionMeta,
    sessionManager.startActiveSession,
    sessionManager.updateActiveSessionSets,
    sessionManager.clearActiveSession,
    sessionManager.flushActiveSession
  ]);

  return (
    <ActiveSessionMetaContext.Provider value={metaValue}>
      <ActiveSessionDataContext.Provider value={dataValue}>
        <ActiveSessionContext.Provider value={combinedValue}>
          {children}
        </ActiveSessionContext.Provider>
      </ActiveSessionDataContext.Provider>
    </ActiveSessionMetaContext.Provider>
  );
};

/**
 * Lightweight hook for components that only need session metadata (workoutId, startTime)
 * or session lifecycle actions (clear, start, flush).
 * Will NOT trigger re-renders when sets, reps, weights, or done flags change.
 */
export const useActiveSessionMeta = (): ActiveSessionMetaContextType => {
  const meta = useContext(ActiveSessionMetaContext);
  if (meta) return meta;

  if (fallbackFitnessContextRef) {
    try {
      const fitness = useContext(fallbackFitnessContextRef);
      if (fitness && (fitness.activeSession !== undefined || fitness.startActiveSession !== undefined)) {
        const metaObj: ActiveSessionMeta | null = fitness.activeSession
          ? { workoutId: fitness.activeSession.workoutId, startTime: fitness.activeSession.startTime }
          : null;
        return {
          activeSession: metaObj,
          activeSessionMeta: metaObj,
          startActiveSession: fitness.startActiveSession ?? (() => {}),
          clearActiveSession: fitness.clearActiveSession ?? (() => {}),
          flushActiveSession: () => {}
        };
      }
    } catch {}
  }

  return {
    activeSession: null,
    activeSessionMeta: null,
    startActiveSession: () => {},
    clearActiveSession: () => {},
    flushActiveSession: () => {}
  };
};

/**
 * Full session context for components that need active set data (e.g. SessionView).
 */
export const useActiveSessionContext = (): ActiveSessionContextType => {
  const context = useContext(ActiveSessionContext);
  const fallbackFitness = fallbackFitnessContextRef ? useContext(fallbackFitnessContextRef) : null;
  const [localFallbackSession, setLocalFallbackSession] = useState<ActiveSession | null>(
    () => fallbackFitness?.activeSession ?? null
  );
  const localFallbackSessionRef = useRef(localFallbackSession);
  localFallbackSessionRef.current = localFallbackSession;

  const fallbackStartActiveSession = useCallback((workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => {
    fallbackFitness?.startActiveSession?.(workoutId, sets, startTime);
    setLocalFallbackSession({
      workoutId,
      sessionSets: sets,
      startTime: startTime || Date.now()
    });
  }, [fallbackFitness]);

  const fallbackUpdateActiveSessionSets = useCallback((updater: Record<string, SetLog[]> | ((prev: Record<string, SetLog[]>) => Record<string, SetLog[]>)) => {
    const prevSets = localFallbackSessionRef.current?.sessionSets || fallbackFitness?.activeSession?.sessionSets || {};
    const nextSets = typeof updater === 'function' ? updater(prevSets) : updater;
    fallbackFitness?.updateActiveSessionSets?.(nextSets);
    setLocalFallbackSession(prev => prev ? { ...prev, sessionSets: nextSets } : { workoutId: '', startTime: Date.now(), sessionSets: nextSets });
  }, [fallbackFitness]);

  const fallbackClearActiveSession = useCallback(() => {
    fallbackFitness?.clearActiveSession?.();
    setLocalFallbackSession(null);
  }, [fallbackFitness]);

  if (context) return context;

  // Fallback for tests that render components inside a mock FitnessContext.Provider without ActiveSessionProvider
  if (fallbackFitness) {
    const currentSession = localFallbackSession ?? fallbackFitness.activeSession ?? null;
    const metaObj: ActiveSessionMeta | null = currentSession
      ? { workoutId: currentSession.workoutId, startTime: currentSession.startTime }
      : null;

    return {
      activeSession: currentSession,
      activeSessionMeta: metaObj,
      startActiveSession: fallbackStartActiveSession,
      updateActiveSessionSets: fallbackUpdateActiveSessionSets,
      clearActiveSession: fallbackClearActiveSession,
      flushActiveSession: () => {}
    };
  }

  return {
    activeSession: null,
    activeSessionMeta: null,
    startActiveSession: () => {},
    updateActiveSessionSets: () => {},
    clearActiveSession: () => {},
    flushActiveSession: () => {}
  };
};
