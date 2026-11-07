// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act, StrictMode, useState, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Layout, ActiveTab } from '../components/Layout';
import { Dashboard } from '../components/Dashboard';
import { SessionView, ExerciseCard } from '../components/SessionView';
import { FitnessContext, FitnessContextType, FitnessProvider, useFitness } from '../context/FitnessContext';
import { FitnessDerivedProvider } from '../context/FitnessDerivedContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { ActiveSessionProvider, useActiveSessionContext } from '../context/ActiveSessionContext';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { useFitnessSync } from '../hooks/useFitnessSync';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import * as firestoreService from '../services/fitnessFirestore';
import * as firestoreErrorHandler from '../lib/firestoreErrorHandler';

vi.mock('../utils/haptics', () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    selection: vi.fn(),
    selectionChanged: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    destructive: vi.fn(),
    vibrate: vi.fn(),
  }
}));

function createMockFitnessContext(overrides: Partial<FitnessContextType> = {}): FitnessContextType {
  return {
    user: null,
    loading: false,
    isInitialized: true,
    syncStatus: 'idle',
    syncError: null,
    login: vi.fn(),
    logout: vi.fn(),
    retrySync: vi.fn(),
    exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
    workouts: INITIAL_WORKOUTS,
    logs: {},
    appState: { cycleStart: '2026-10-01' },
    addExerciseDefinition: vi.fn(),
    updateExerciseDefinition: vi.fn(),
    deleteExerciseDefinition: vi.fn(),
    setWorkouts: vi.fn(),
    assignExerciseToWorkout: vi.fn(),
    removeExerciseFromWorkout: vi.fn(),
    updateWorkoutExerciseProgramming: vi.fn(),
    deleteWorkout: vi.fn(),
    addLog: vi.fn().mockResolvedValue(undefined),
    deleteLog: vi.fn(),
    resetLogs: vi.fn(),
    updateCycleStart: vi.fn().mockResolvedValue(undefined),
    activeSession: null,
    startActiveSession: vi.fn(),
    updateActiveSessionSets: vi.fn(),
    clearActiveSession: vi.fn(),
    logBodyWeight: vi.fn(),
    deleteBodyWeight: vi.fn(),
    pushAutoBackup: vi.fn(),
    getAutoBackups: vi.fn().mockReturnValue([]),
    restoreAutoBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
    createManualBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
    exportBackup: vi.fn().mockReturnValue('{}'),
    importBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
    ...overrides
  };
}

describe('Targeted Performance & Regression Fixes Suite (Pass 2)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    localStorage.clear();
  });

  // 1a. Account A sync resolves after switching to B
  it('1a. Account A sync resolves after switching to B: performs no later Firestore writes or state updates', async () => {
    let authCallback: any = null;
    vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, callback: any) => {
      authCallback = callback;
      return vi.fn();
    });

    const setDefsSpy = vi.fn();
    const setWorkoutsSpy = vi.fn();
    const setLogsSpy = vi.fn();
    const setAppStateSpy = vi.fn();
    const setSyncStatusSpy = vi.fn();
    const resetToDefaultDataSpy = vi.fn();

    const saveAppStateSpy = vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
    const saveDefsSpy = vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
    const saveWorkoutsSpy = vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
    const saveLogsSpy = vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);

    const defsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
    const workoutsRef = { current: INITIAL_WORKOUTS };
    const logsRef = { current: {} };
    const appStateRef = { current: { cycleStart: '2026-10-01' } };

    let hookResult: any = null;
    function TestSyncComponent() {
      hookResult = useFitnessSync({
        exerciseDefsRef: defsRef as any,
        workoutsRef: workoutsRef as any,
        logsRef: logsRef as any,
        appStateRef: appStateRef as any,
        setExerciseDefinitions: setDefsSpy,
        setWorkouts: setWorkoutsSpy,
        setLogs: setLogsSpy,
        setAppState: setAppStateSpy,
        setSyncStatus: setSyncStatusSpy,
        resetToDefaultData: resetToDefaultDataSpy
      });
      return null;
    }

    act(() => {
      root.render(<TestSyncComponent />);
    });

    // Account A slow promises
    let resolveAccountADefs: any;
    let resolveAccountAWorkouts: any;
    let resolveAccountALogs: any;
    let resolveAccountAState: any;

    const accountADefsPromise = new Promise<ExerciseDefinition[]>((resolve) => { resolveAccountADefs = resolve; });
    const accountAWorkoutsPromise = new Promise<Workout[]>((resolve) => { resolveAccountAWorkouts = resolve; });
    const accountALogsPromise = new Promise<Record<string, SessionLog>>((resolve) => { resolveAccountALogs = resolve; });
    const accountAStatePromise = new Promise<AppState | null>((resolve) => { resolveAccountAState = resolve; });

    // Account B legitimate definitions, workouts, logs, and state
    const defsB: ExerciseDefinition[] = [
      { id: 'b-def-1', name: 'User B Bench', target: 'Pecs', tags: ['compound'] }
    ];
    const workoutsB: Workout[] = [
      { id: 'b-wo-1', name: 'User B Workout', badge: 'PUSH B', type: 'push', exercises: [] }
    ];
    const logsB: Record<string, SessionLog> = {
      'b-log-1': { id: 'b-log-1', workoutId: 'b-wo-1', date: '2026-11-05', durationMinutes: 60, sets: {}, complete: true }
    };
    const stateB: AppState = { cycleStart: '2026-11-01', updatedAt: 1000 };

    vi.spyOn(firestoreService, 'getExerciseDefinitions').mockImplementation((uid) => {
      return uid === 'user-A' ? accountADefsPromise : Promise.resolve(defsB);
    });
    vi.spyOn(firestoreService, 'getWorkouts').mockImplementation((uid) => {
      return uid === 'user-A' ? accountAWorkoutsPromise : Promise.resolve(workoutsB);
    });
    vi.spyOn(firestoreService, 'getLogs').mockImplementation((uid) => {
      return uid === 'user-A' ? accountALogsPromise : Promise.resolve(logsB);
    });
    vi.spyOn(firestoreService, 'getAppState').mockImplementation((uid) => {
      return uid === 'user-A' ? accountAStatePromise : Promise.resolve(stateB);
    });

    // 1. Log in as User A
    act(() => {
      authCallback({ uid: 'user-A', email: 'userA@test.com' });
    });

    expect(setSyncStatusSpy).toHaveBeenCalledWith('syncing');

    // In-flight sync is now pending for User A...
    // 2. Switch auth to User B before User A's promises resolve
    await act(async () => {
      authCallback({ uid: 'user-B', email: 'userB@test.com' });
      await new Promise(r => setTimeout(r, 10));
    });

    expect(resetToDefaultDataSpy).toHaveBeenCalled();

    // Verify legitimate Account B sync executed and updated local state
    expect(setDefsSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'b-def-1' })]));
    expect(setWorkoutsSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'b-wo-1' })]));
    expect(setLogsSpy).toHaveBeenCalledWith(expect.objectContaining({ 'b-log-1': expect.anything() }));
    expect(setAppStateSpy).toHaveBeenCalledWith(expect.objectContaining({ cycleStart: '2026-11-01' }));
    expect(setSyncStatusSpy).toHaveBeenCalledWith('synced');
    expect(hookResult.syncStatus).toBe('synced');

    // Clear spies to verify stale Account A resolution cannot perform ANY later writes or state updates
    saveAppStateSpy.mockClear();
    saveDefsSpy.mockClear();
    saveWorkoutsSpy.mockClear();
    saveLogsSpy.mockClear();
    setDefsSpy.mockClear();
    setWorkoutsSpy.mockClear();
    setLogsSpy.mockClear();
    setAppStateSpy.mockClear();
    setSyncStatusSpy.mockClear();

    // 3. User A's slow downloads finally resolve with stale Account A data
    await act(async () => {
      resolveAccountADefs([
        { id: 'stale-def-A', name: 'User A Def', target: 'Pecs', tags: ['compound'] }
      ]);
      resolveAccountAWorkouts([
        { id: 'stale-wo-A', name: 'User A Workout', badge: 'PUSH A', type: 'push', exercises: [] }
      ]);
      resolveAccountALogs({
        'stale-log-A': { id: 'stale-log-A', workoutId: 'stale-wo-A', date: '2026-11-01', durationMinutes: 60, sets: {}, complete: true }
      });
      resolveAccountAState({ cycleStart: '2026-08-01' });
      await new Promise(r => setTimeout(r, 30));
    });

    // 4. Assert: Stale Account A performed ZERO Firestore writes
    expect(saveAppStateSpy).not.toHaveBeenCalled();
    expect(saveDefsSpy).not.toHaveBeenCalled();
    expect(saveWorkoutsSpy).not.toHaveBeenCalled();
    expect(saveLogsSpy).not.toHaveBeenCalled();

    // 5. Assert: Stale Account A performed ZERO state updates into Account B's state
    expect(setDefsSpy).not.toHaveBeenCalled();
    expect(setWorkoutsSpy).not.toHaveBeenCalled();
    expect(setLogsSpy).not.toHaveBeenCalled();
    expect(setAppStateSpy).not.toHaveBeenCalled();

    // 6. Assert: Stale Account A did NOT mutate Account B's sync status
    expect(setSyncStatusSpy).not.toHaveBeenCalled();
    expect(hookResult.syncStatus).toBe('synced');
  });

  // 1b. Logout while a sync is pending
  it('1b. Logout while a sync is pending: performs no later Firestore writes or state updates after resolution', async () => {
    let authCallback: any = null;
    vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, callback: any) => {
      authCallback = callback;
      return vi.fn();
    });

    const setDefsSpy = vi.fn();
    const setWorkoutsSpy = vi.fn();
    const setLogsSpy = vi.fn();
    const setAppStateSpy = vi.fn();
    const setSyncStatusSpy = vi.fn();
    const resetToDefaultDataSpy = vi.fn();

    const saveAppStateSpy = vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
    const saveDefsSpy = vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
    const saveWorkoutsSpy = vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
    const saveLogsSpy = vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);

    const defsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
    const workoutsRef = { current: INITIAL_WORKOUTS };
    const logsRef = { current: {} };
    const appStateRef = { current: { cycleStart: '2026-10-01' } };

    let hookResult: any = null;
    function TestSyncComponent() {
      hookResult = useFitnessSync({
        exerciseDefsRef: defsRef as any,
        workoutsRef: workoutsRef as any,
        logsRef: logsRef as any,
        appStateRef: appStateRef as any,
        setExerciseDefinitions: setDefsSpy,
        setWorkouts: setWorkoutsSpy,
        setLogs: setLogsSpy,
        setAppState: setAppStateSpy,
        setSyncStatus: setSyncStatusSpy,
        resetToDefaultData: resetToDefaultDataSpy
      });
      return null;
    }

    act(() => {
      root.render(<TestSyncComponent />);
    });

    let resolvePendingDefs: any;
    let resolvePendingState: any;
    const defsPromise = new Promise<ExerciseDefinition[]>((res) => { resolvePendingDefs = res; });
    const statePromise = new Promise<AppState | null>((res) => { resolvePendingState = res; });

    vi.spyOn(firestoreService, 'getExerciseDefinitions').mockReturnValue(defsPromise);
    vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
    vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
    vi.spyOn(firestoreService, 'getAppState').mockReturnValue(statePromise);

    // 1. Log in
    act(() => {
      authCallback({ uid: 'user-logout-test', email: 'logout@test.com' });
    });

    expect(setSyncStatusSpy).toHaveBeenCalledWith('syncing');

    // 2. User logs out while sync is still pending
    act(() => {
      hookResult.logout();
    });

    expect(hookResult.syncStatus).toBe('idle');
    expect(setSyncStatusSpy).toHaveBeenCalledWith('idle');

    saveAppStateSpy.mockClear();
    saveDefsSpy.mockClear();
    setDefsSpy.mockClear();
    setAppStateSpy.mockClear();
    setSyncStatusSpy.mockClear();

    // 3. Pending sync resolves
    await act(async () => {
      resolvePendingDefs([{ id: 'unwanted-def', name: 'Def', target: 'Lats', tags: ['compound'] }]);
      resolvePendingState({ cycleStart: '2026-01-01' });
      await new Promise(r => setTimeout(r, 20));
    });

    // 4. Assert: No Firestore writes or state updates occurred after logout
    expect(saveAppStateSpy).not.toHaveBeenCalled();
    expect(saveDefsSpy).not.toHaveBeenCalled();
    expect(saveWorkoutsSpy).not.toHaveBeenCalled();
    expect(saveLogsSpy).not.toHaveBeenCalled();
    expect(setDefsSpy).not.toHaveBeenCalled();
    expect(setAppStateSpy).not.toHaveBeenCalled();
    expect(setSyncStatusSpy).not.toHaveBeenCalled();
    expect(hookResult.syncStatus).toBe('idle');
  });

  // 1c. Captured Account A Firestore listener callbacks invoked after switching to Account B
  it('1c. Captured Account A Firestore listener callbacks invoked after switching to Account B: no Account A data or errors enter Account B state', async () => {
    let authCallback: any = null;
    vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, callback: any) => {
      authCallback = callback;
      return vi.fn();
    });

    const setDefsSpy = vi.fn();
    const setWorkoutsSpy = vi.fn();
    const setLogsSpy = vi.fn();
    const setAppStateSpy = vi.fn();
    const setSyncStatusSpy = vi.fn();
    const resetToDefaultDataSpy = vi.fn();

    const errorHandlerSpy = vi.spyOn(firestoreErrorHandler, 'handleFirestoreError');

    let capturedDefsCbA: any = null;
    let capturedDefsErrA: any = null;
    let capturedWorkoutsCbA: any = null;
    let capturedWorkoutsErrA: any = null;
    let capturedLogsCbA: any = null;
    let capturedLogsErrA: any = null;
    let capturedStateCbA: any = null;
    let capturedStateErrA: any = null;

    vi.spyOn(firestoreService, 'subscribeExerciseDefinitions').mockImplementation((uid, onNext, onError) => {
      if (uid === 'user-A') {
        capturedDefsCbA = onNext;
        capturedDefsErrA = onError;
      }
      return vi.fn();
    });
    vi.spyOn(firestoreService, 'subscribeWorkouts').mockImplementation((uid, onNext, onError) => {
      if (uid === 'user-A') {
        capturedWorkoutsCbA = onNext;
        capturedWorkoutsErrA = onError;
      }
      return vi.fn();
    });
    vi.spyOn(firestoreService, 'subscribeLogs').mockImplementation((uid, onNext, onError) => {
      if (uid === 'user-A') {
        capturedLogsCbA = onNext;
        capturedLogsErrA = onError;
      }
      return vi.fn();
    });
    vi.spyOn(firestoreService, 'subscribeAppState').mockImplementation((uid, onNext, onError) => {
      if (uid === 'user-A') {
        capturedStateCbA = onNext;
        capturedStateErrA = onError;
      }
      return vi.fn();
    });

    vi.spyOn(firestoreService, 'getExerciseDefinitions').mockResolvedValue([]);
    vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
    vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
    vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);

    const defsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
    const workoutsRef = { current: INITIAL_WORKOUTS };
    const logsRef = { current: {} };
    const appStateRef = { current: { cycleStart: '2026-10-01' } };

    function TestSyncComponent() {
      useFitnessSync({
        exerciseDefsRef: defsRef as any,
        workoutsRef: workoutsRef as any,
        logsRef: logsRef as any,
        appStateRef: appStateRef as any,
        setExerciseDefinitions: setDefsSpy,
        setWorkouts: setWorkoutsSpy,
        setLogs: setLogsSpy,
        setAppState: setAppStateSpy,
        setSyncStatus: setSyncStatusSpy,
        resetToDefaultData: resetToDefaultDataSpy
      });
      return null;
    }

    act(() => {
      root.render(<TestSyncComponent />);
    });

    // 1. Log in as Account A
    await act(async () => {
      authCallback({ uid: 'user-A', email: 'userA@test.com' });
    });

    expect(capturedDefsCbA).toBeTruthy();
    expect(capturedDefsErrA).toBeTruthy();
    expect(capturedWorkoutsCbA).toBeTruthy();
    expect(capturedWorkoutsErrA).toBeTruthy();
    expect(capturedLogsCbA).toBeTruthy();
    expect(capturedLogsErrA).toBeTruthy();
    expect(capturedStateCbA).toBeTruthy();
    expect(capturedStateErrA).toBeTruthy();

    // 2. Switch auth to Account B
    await act(async () => {
      authCallback({ uid: 'user-B', email: 'userB@test.com' });
    });

    setDefsSpy.mockClear();
    setWorkoutsSpy.mockClear();
    setLogsSpy.mockClear();
    setAppStateSpy.mockClear();
    setSyncStatusSpy.mockClear();
    errorHandlerSpy.mockClear();

    // 3. Stale Account A snapshot callbacks fire with Account A changes
    act(() => {
      capturedDefsCbA([
        {
          type: 'added',
          doc: {
            id: 'stale-def-A',
            data: () => ({ name: 'Stale A Def', target: 'Pecs', tags: ['compound'] }),
            metadata: { hasPendingWrites: false }
          }
        }
      ]);
      capturedWorkoutsCbA([
        {
          type: 'added',
          doc: {
            id: 'stale-wo-A',
            data: () => ({ name: 'Stale A Workout', badge: 'PUSH A', type: 'push', exercises: [] }),
            metadata: { hasPendingWrites: false }
          }
        }
      ]);
      capturedLogsCbA([
        {
          type: 'added',
          doc: {
            id: 'stale-log-A',
            data: () => ({ workoutId: 'stale-wo-A', date: '2026-11-01', durationMinutes: 60, sets: {}, complete: true }),
            metadata: { hasPendingWrites: false }
          }
        }
      ]);
      capturedStateCbA({ cycleStart: '2020-01-01', updatedAt: 999999999999 }, false);
    });

    // Assert: No Account A data entered Account B's state
    expect(setDefsSpy).not.toHaveBeenCalled();
    expect(setWorkoutsSpy).not.toHaveBeenCalled();
    expect(setLogsSpy).not.toHaveBeenCalled();
    expect(setAppStateSpy).not.toHaveBeenCalled();

    // 4. Stale Account A error callbacks fire with Account A errors
    act(() => {
      capturedDefsErrA(new Error('Stale A Defs Error'));
      capturedWorkoutsErrA(new Error('Stale A Workouts Error'));
      capturedLogsErrA(new Error('Stale A Logs Error'));
      capturedStateErrA(new Error('Stale A State Error'));
    });

    // Assert: No Account A error entered error reporting or updated sync status
    expect(errorHandlerSpy).not.toHaveBeenCalled();
    expect(setSyncStatusSpy).not.toHaveBeenCalled();
  });

  // 2. Strengthened active-session isolation test: switch auth from Account A to Account B through the actual FitnessContext/auth flow
  it('2. Account A active workout is cleared on auth switch through real FitnessContext flow and cannot reappear on visibility change', async () => {
    let authCallback: any = null;
    vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, callback: any) => {
      authCallback = callback;
      return vi.fn();
    });

    vi.spyOn(firestoreService, 'getExerciseDefinitions').mockResolvedValue([]);
    vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
    vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
    vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);

    let activeSessionContextVal: any = null;
    let fitnessContextVal: any = null;

    function RealContextConsumer() {
      activeSessionContextVal = useActiveSessionContext();
      fitnessContextVal = useFitness();
      return (
        <div>
          <span data-testid="user-id">{fitnessContextVal.user?.uid || 'anon'}</span>
          <span data-testid="session-workout">{activeSessionContextVal.activeSession?.workoutId || 'none'}</span>
        </div>
      );
    }

    act(() => {
      root.render(
        <FitnessProvider>
          <RealContextConsumer />
        </FitnessProvider>
      );
    });

    // 1. Authenticate Account A through the real auth callback
    await act(async () => {
      authCallback({ uid: 'account-A', email: 'accountA@test.com' });
      await new Promise(r => setTimeout(r, 20));
    });
    expect(container.querySelector('[data-testid="user-id"]')?.textContent).toBe('account-A');

    // 2. Start an active workout in Account A
    act(() => {
      activeSessionContextVal.startActiveSession('push-a', {
        'bench-press': [{ id: 's1', weight: '100', reps: '5', done: true }]
      });
    });

    expect(activeSessionContextVal.activeSession?.workoutId).toBe('push-a');
    expect(localStorage.getItem('gl_active_session')).toContain('push-a');
    expect(container.querySelector('[data-testid="session-workout"]')?.textContent).toBe('push-a');

    // 3. Switch auth from Account A to Account B through the actual FitnessContext/auth flow
    await act(async () => {
      authCallback({ uid: 'account-B', email: 'accountB@test.com' });
      await new Promise(r => setTimeout(r, 20));
    });

    expect(container.querySelector('[data-testid="user-id"]')?.textContent).toBe('account-B');
    // Account A's active session is cleared from React state immediately
    expect(activeSessionContextVal.activeSession).toBeNull();
    expect(container.querySelector('[data-testid="session-workout"]')?.textContent).toBe('none');
    expect(localStorage.getItem('gl_active_session')).toBeNull();

    // 4. Dispatch visibilitychange (app backgrounded or tab hidden, which flushes active session)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 5. Assert: Account A's session is NEITHER restored to localStorage NOR exposed in Account B's context
    expect(localStorage.getItem('gl_active_session')).toBeNull();
    expect(activeSessionContextVal.activeSession).toBeNull();
    expect(container.querySelector('[data-testid="session-workout"]')?.textContent).toBe('none');

    // Also dispatch visible
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(localStorage.getItem('gl_active_session')).toBeNull();
    expect(activeSessionContextVal.activeSession).toBeNull();
  });

  // 3. Active-session event listeners do not leak under StrictMode
  it('3. Active-session event listeners do not leak under React StrictMode', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    act(() => {
      root.render(
        <StrictMode>
          <ActiveSessionProvider>
            <div>Test Children</div>
          </ActiveSessionProvider>
        </StrictMode>
      );
    });

    // Unmount root
    act(() => {
      root.unmount();
    });

    // Find visibilitychange calls
    const visibilityAdds = addEventListenerSpy.mock.calls.filter(c => c[0] === 'visibilitychange').length;
    const visibilityRemoves = removeEventListenerSpy.mock.calls.filter(c => c[0] === 'visibilitychange').length;

    expect(visibilityAdds).toBeGreaterThan(0);
    expect(visibilityRemoves).toBe(visibilityAdds);
  });

  // 4. Real ExerciseCard / SessionView implementation React.memo isolation test without mutating ExerciseCard.type
  it('4. Editing one exercise set does not re-render unaffected real ExerciseCards (SessionView React.memo isolation)', () => {
    const mockFitness = createMockFitnessContext();
    const commitCounts: Record<string, number> = {};

    // Standard supported instrumentation callback reporting committed renders only
    const onCardCommit = vi.fn((exDefId: string) => {
      commitCounts[exDefId] = (commitCounts[exDefId] || 0) + 1;
    });

    act(() => {
      root.render(
        <FitnessContext.Provider value={mockFitness}>
          <FitnessDerivedProvider>
            <ActiveSessionProvider>
              <ConfirmProvider>
                <SessionView
                  workoutId="push-a"
                  onExit={vi.fn()}
                  onCardCommit={onCardCommit}
                />
              </ConfirmProvider>
            </ActiveSessionProvider>
          </FitnessDerivedProvider>
        </FitnessContext.Provider>
      );
    });

    // Workout push-a has exercises with definitions e1, e2, e3, e4, e5, e6
    // Capture baseline committed render counts after mount
    const initialE1Commits = commitCounts['e1'];
    const initialE2Commits = commitCounts['e2'];
    expect(initialE1Commits).toBeGreaterThan(0);
    expect(initialE2Commits).toBeGreaterThan(0);

    // Find real "Mark set complete" buttons in the rendered SessionView
    const markDoneButtons = container.querySelectorAll('button[aria-label="Mark set complete"]');
    expect(markDoneButtons.length).toBeGreaterThan(0);

    // Click "Mark set complete" for Exercise e1 (Incline DB Press) first set
    act(() => {
      (markDoneButtons[0] as HTMLButtonElement).click();
    });

    // The edited card (e1) committed an update to its set state and row animation
    expect(commitCounts['e1']).toBeGreaterThan(initialE1Commits);

    // The unaffected real card (e2) did NOT commit another render (React.memo bailout)
    expect(commitCounts['e2']).toBe(initialE2Commits);
  });

  // 5. Real Layout tab controls scroll restoration test (including tab with asynchronous content height expansion)
  it('5. Tab scroll restoration works accurately between tabs with divergent/async content heights via real Layout controls', () => {
    vi.useFakeTimers();

    const origScrollTo = window.scrollTo;
    const origRAF = window.requestAnimationFrame;
    const origScrollYDesc = Object.getOwnPropertyDescriptor(window, 'scrollY');

    let rafQueue: FrameRequestCallback[] = [];
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    // Helper that drains nested animation-frame callbacks until the restoration sequence completely settles
    function flushAllRaf(maxIterations = 20) {
      let iterations = 0;
      while (rafQueue.length > 0 && iterations < maxIterations) {
        iterations++;
        const currentBatch = [...rafQueue];
        rafQueue = [];
        currentBatch.forEach(cb => cb(performance.now()));
      }
      expect(rafQueue.length).toBe(0);
    }

    try {
      let mockScrollY = 0;
      Object.defineProperty(window, 'scrollY', {
        get: () => mockScrollY,
        set: (val: number) => { mockScrollY = val; },
        configurable: true
      });
      window.scrollTo = vi.fn((x: any, y?: any) => {
        if (typeof x === 'object') {
          mockScrollY = x.top ?? 0;
        } else {
          mockScrollY = y ?? 0;
        }
        window.dispatchEvent(new Event('scroll'));
      });

      const mockFitness = createMockFitnessContext();

      function RealLayoutTestApp() {
        const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
        const [analyticsExpanded, setAnalyticsExpanded] = useState(false);

        useEffect(() => {
          if (activeTab === 'analytics' && !analyticsExpanded) {
            // Simulate asynchronous content loading / chart expansion
            const timer = setTimeout(() => {
              setAnalyticsExpanded(true);
            }, 50);
            return () => clearTimeout(timer);
          }
        }, [activeTab, analyticsExpanded]);

        return (
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab={activeTab} onTabChange={setActiveTab}>
              {activeTab === 'dashboard' && (
                <div data-testid="dash-page" style={{ height: '3200px' }}>Dashboard (3200px)</div>
              )}
              {activeTab === 'history' && (
                <div data-testid="hist-page" style={{ height: '400px' }}>History (400px)</div>
              )}
              {activeTab === 'analytics' && (
                <div
                  data-testid="analytics-page"
                  data-expanded={analyticsExpanded ? 'true' : 'false'}
                  style={{ height: analyticsExpanded ? '2800px' : '200px' }}
                >
                  Analytics ({analyticsExpanded ? '2800px' : '200px'})
                </div>
              )}
              {activeTab === 'manage' && (
                <div data-testid="manage-page" style={{ height: '600px' }}>Manage (600px)</div>
              )}
            </Layout>
          </FitnessContext.Provider>
        );
      }

      act(() => {
        root.render(<RealLayoutTestApp />);
      });

      // 1. Initial view is Dashboard; scroll position starts at 0
      expect(mockScrollY).toBe(0);

      // User scrolls down 950px in Dashboard
      act(() => {
        window.scrollY = 950;
        window.dispatchEvent(new Event('scroll'));
      });
      expect(mockScrollY).toBe(950);

      // 2. Navigate to History via actual Layout mobile navigation button
      const historyBtn = container.querySelector('#mobile-nav-item-history') as HTMLButtonElement;
      expect(historyBtn).toBeTruthy();
      act(() => {
        historyBtn.click();
      });
      act(() => {
        flushAllRaf();
      });

      // First visit to History -> reset to top (0px)
      expect(mockScrollY).toBe(0);
      expect(container.querySelector('[data-testid="hist-page"]')).toBeTruthy();

      // User scrolls down 220px in History
      act(() => {
        window.scrollY = 220;
        window.dispatchEvent(new Event('scroll'));
      });
      expect(mockScrollY).toBe(220);

      // 3. Navigate to Analytics via actual Layout navigation button
      const analyticsBtn = container.querySelector('#mobile-nav-item-analytics') as HTMLButtonElement;
      expect(analyticsBtn).toBeTruthy();
      act(() => {
        analyticsBtn.click();
      });
      act(() => {
        flushAllRaf();
      });

      // First visit to Analytics -> reset to top (0px)
      expect(mockScrollY).toBe(0);
      const analyticsEl = container.querySelector('[data-testid="analytics-page"]');
      expect(analyticsEl).toBeTruthy();

      // Verify the asynchronous content-height scenario is initially unexpanded
      expect(analyticsEl?.getAttribute('data-expanded')).toBe('false');

      // Trigger async content expansion and verify it actually completes
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(container.querySelector('[data-testid="analytics-page"]')?.getAttribute('data-expanded')).toBe('true');

      // In Analytics (now fully expanded to 2800px), user scrolls down 1400px
      act(() => {
        window.scrollY = 1400;
        window.dispatchEvent(new Event('scroll'));
      });
      expect(mockScrollY).toBe(1400);

      // 4. Navigate back to Dashboard via actual Layout button
      const dashBtn = container.querySelector('#mobile-nav-item-dashboard') as HTMLButtonElement;
      expect(dashBtn).toBeTruthy();
      act(() => {
        dashBtn.click();
      });
      act(() => {
        flushAllRaf();
      });

      // Real navigation commit restored Dashboard position accurately (950px)
      expect(mockScrollY).toBe(950);
      expect(container.querySelector('[data-testid="dash-page"]')).toBeTruthy();

      // 5. Navigate back to History via actual button
      act(() => {
        historyBtn.click();
      });
      act(() => {
        flushAllRaf();
      });

      // Restores History position accurately (220px)
      expect(mockScrollY).toBe(220);

      // 6. Navigate back to Analytics (tab whose content height changed asynchronously)
      act(() => {
        analyticsBtn.click();
      });
      act(() => {
        flushAllRaf();
      });

      // Restores Analytics position accurately (1400px) after complete restoration sequence
      expect(mockScrollY).toBe(1400);
    } finally {
      // Restore window.scrollTo, window.requestAnimationFrame, and window.scrollY descriptor, including on failure
      window.scrollTo = origScrollTo;
      window.requestAnimationFrame = origRAF;
      if (origScrollYDesc) {
        Object.defineProperty(window, 'scrollY', origScrollYDesc);
      } else {
        delete (window as any).scrollY;
      }
      vi.useRealTimers();
    }
  });

  // 6. SessionView chunk prewarming occurs before the first workout navigation
  it('6. SessionView chunk prewarming triggers on pointer interactions before workout navigation', () => {
    const onPrewarmSessionSpy = vi.fn();
    const onStartWorkoutSpy = vi.fn();
    const mockFitness = createMockFitnessContext({
      appState: { cycleStart: '2026-11-05' }
    });

    act(() => {
      root.render(
        <FitnessContext.Provider value={mockFitness}>
          <FitnessDerivedProvider>
            <ConfirmProvider>
              <Dashboard
                onStartWorkout={onStartWorkoutSpy}
                onNavigateToHistory={vi.fn()}
                onPrewarmSession={onPrewarmSessionSpy}
              />
            </ConfirmProvider>
          </FitnessDerivedProvider>
        </FitnessContext.Provider>
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const startBtn = buttons.find(b => b.textContent?.includes('Start Session')) || buttons[0];
    expect(startBtn).toBeTruthy();

    // User touches or hovers on "Start Session" button
    act(() => {
      startBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    // Chunk prewarm was triggered before workout navigation committed
    expect(onPrewarmSessionSpy).toHaveBeenCalledTimes(1);
    expect(onStartWorkoutSpy).not.toHaveBeenCalled();

    // Now click to start workout
    act(() => {
      startBtn.click();
    });

    expect(onStartWorkoutSpy).toHaveBeenCalled();
  });
});
