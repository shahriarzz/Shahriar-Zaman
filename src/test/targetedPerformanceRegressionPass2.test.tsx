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
        resetToDefaultData: resetToDefaultDataSpy
      });
      return null;
    }

    act(() => {
      root.render(<TestSyncComponent />);
    });

    // Delayed promise resolvers for Account A
    let resolveAccountADefs: any;
    let resolveAccountAWorkouts: any;
    let resolveAccountALogs: any;
    let resolveAccountAState: any;

    const accountADefsPromise = new Promise<ExerciseDefinition[]>((resolve) => { resolveAccountADefs = resolve; });
    const accountAWorkoutsPromise = new Promise<Workout[]>((resolve) => { resolveAccountAWorkouts = resolve; });
    const accountALogsPromise = new Promise<Record<string, SessionLog>>((resolve) => { resolveAccountALogs = resolve; });
    const accountAStatePromise = new Promise<AppState | null>((resolve) => { resolveAccountAState = resolve; });

    vi.spyOn(firestoreService, 'getExerciseDefinitions').mockImplementation((uid) => {
      return uid === 'user-A' ? accountADefsPromise : Promise.resolve([]);
    });
    vi.spyOn(firestoreService, 'getWorkouts').mockImplementation((uid) => {
      return uid === 'user-A' ? accountAWorkoutsPromise : Promise.resolve([]);
    });
    vi.spyOn(firestoreService, 'getLogs').mockImplementation((uid) => {
      return uid === 'user-A' ? accountALogsPromise : Promise.resolve({});
    });
    vi.spyOn(firestoreService, 'getAppState').mockImplementation((uid) => {
      return uid === 'user-A' ? accountAStatePromise : Promise.resolve(null);
    });

    // 1. Log in as User A
    act(() => {
      authCallback({ uid: 'user-A', email: 'userA@test.com' });
    });

    // In-flight sync is now running for User A...
    // 2. Switch auth to User B before User A's promises resolve
    act(() => {
      authCallback({ uid: 'user-B', email: 'userB@test.com' });
    });

    expect(resetToDefaultDataSpy).toHaveBeenCalled();
    // Clear all spies after switch
    saveAppStateSpy.mockClear();
    saveDefsSpy.mockClear();
    saveWorkoutsSpy.mockClear();
    saveLogsSpy.mockClear();
    setDefsSpy.mockClear();
    setWorkoutsSpy.mockClear();
    setLogsSpy.mockClear();
    setAppStateSpy.mockClear();

    // 3. User A's slow downloads finally resolve with Account A data
    await act(async () => {
      resolveAccountADefs([
        { id: 'stale-def-A', name: 'User A Def', category: 'Chest', target: 'Pecs', movement: 'compound', isCustom: true }
      ]);
      resolveAccountAWorkouts([
        { id: 'stale-wo-A', name: 'User A Workout', type: 'push', exercises: [] }
      ]);
      resolveAccountALogs({
        'log-A': { id: 'log-A', workoutId: 'stale-wo-A', date: '2026-11-01', startTime: '10:00', endTime: '11:00', durationMinutes: 60, exercises: [] }
      });
      resolveAccountAState({ cycleStart: '2026-09-01' });
      await new Promise(r => setTimeout(r, 20));
    });

    // 4. Assert: Stale Account A performed ZERO Firestore writes and ZERO local state updates
    expect(saveAppStateSpy).not.toHaveBeenCalled();
    expect(saveDefsSpy).not.toHaveBeenCalled();
    expect(saveWorkoutsSpy).not.toHaveBeenCalled();
    expect(saveLogsSpy).not.toHaveBeenCalled();

    expect(setDefsSpy).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'stale-def-A' })])
    );
    expect(setWorkoutsSpy).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'stale-wo-A' })])
    );
    expect(setLogsSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ 'log-A': expect.anything() })
    );
    expect(setAppStateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ cycleStart: '2026-09-01' })
    );
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

    // 2. User logs out while sync is still pending
    act(() => {
      hookResult.logout();
    });

    saveAppStateSpy.mockClear();
    saveDefsSpy.mockClear();
    setDefsSpy.mockClear();
    setAppStateSpy.mockClear();

    // 3. Pending sync resolves
    await act(async () => {
      resolvePendingDefs([{ id: 'unwanted-def', name: 'Def', category: 'Back', target: 'Lats', movement: 'compound', isCustom: true }]);
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
    act(() => {
      authCallback({ uid: 'account-A', email: 'accountA@test.com' });
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
    act(() => {
      authCallback({ uid: 'account-B', email: 'accountB@test.com' });
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

  // 4. Real ExerciseCard / SessionView implementation React.memo isolation test
  it('4. Editing one exercise set does not re-render unaffected real ExerciseCards (SessionView React.memo isolation)', () => {
    const mockFitness = createMockFitnessContext();
    const renderCounts: Record<string, number> = {};

    // Intercept real ExerciseCard component execution
    const origType = (ExerciseCard as any).type;
    (ExerciseCard as any).type = function InterceptedExerciseCard(props: any) {
      const id = props.ex.exerciseDefinitionId || props.ex.id;
      renderCounts[id] = (renderCounts[id] || 0) + 1;
      return origType(props);
    };

    try {
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <FitnessDerivedProvider>
              <ActiveSessionProvider>
                <ConfirmProvider>
                  <SessionView
                    workoutId="push-a"
                    onFinish={vi.fn()}
                    onDiscard={vi.fn()}
                    onBack={vi.fn()}
                  />
                </ConfirmProvider>
              </ActiveSessionProvider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      // Workout push-a has exercises with definitions e1, e2, e3, e4, e5, e6
      // Assert real ExerciseCards mounted
      const initialE1Renders = renderCounts['e1'];
      const initialE2Renders = renderCounts['e2'];
      expect(initialE1Renders).toBeGreaterThan(0);
      expect(initialE2Renders).toBeGreaterThan(0);

      // Find real "Mark set complete" buttons in the rendered SessionView
      const markDoneButtons = container.querySelectorAll('button[aria-label="Mark set complete"]');
      expect(markDoneButtons.length).toBeGreaterThan(0);

      // Click "Mark set complete" for Exercise e1 (Incline DB Press) first set
      act(() => {
        (markDoneButtons[0] as HTMLButtonElement).click();
      });

      // The edited card (e1) re-rendered to update its set state and row animation
      expect(renderCounts['e1']).toBeGreaterThan(initialE1Renders);

      // The unaffected real card (e2) did NOT re-render (React.memo bailout)
      expect(renderCounts['e2']).toBe(initialE2Renders);
    } finally {
      (ExerciseCard as any).type = origType;
    }
  });

  // 5. Real Layout tab controls scroll restoration test (including tab with asynchronous content height expansion)
  it('5. Tab scroll restoration works accurately between tabs with divergent/async content heights via real Layout controls', () => {
    vi.useFakeTimers();
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

    let rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    function flushRaf() {
      const cbs = [...rafCallbacks];
      rafCallbacks = [];
      cbs.forEach(cb => cb(performance.now()));
    }

    const mockFitness = createMockFitnessContext();

    function RealLayoutTestApp() {
      const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
      const [analyticsExpanded, setAnalyticsExpanded] = useState(false);

      useEffect(() => {
        if (activeTab === 'analytics' && !analyticsExpanded) {
          // Simulate asynchronous content loading / chart expansion
          const timer = setTimeout(() => {
            setAnalyticsExpanded(true);
          }, 30);
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
              <div data-testid="analytics-page" style={{ height: analyticsExpanded ? '2800px' : '200px' }}>
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

    // First visit to Analytics -> reset to top (0px)
    expect(mockScrollY).toBe(0);
    expect(container.querySelector('[data-testid="analytics-page"]')).toBeTruthy();

    // Trigger async content expansion (height expands to 2800px)
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // In Analytics, user scrolls down 1400px
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
    flushRaf();

    // Real navigation commit restored Dashboard position accurately (950px)
    expect(mockScrollY).toBe(950);
    expect(container.querySelector('[data-testid="dash-page"]')).toBeTruthy();

    // 5. Navigate back to History via actual button
    act(() => {
      historyBtn.click();
    });
    flushRaf();

    // Restores History position accurately (220px)
    expect(mockScrollY).toBe(220);

    // 6. Navigate back to Analytics (tab whose content height changed asynchronously)
    act(() => {
      analyticsBtn.click();
    });
    flushRaf();

    // Restores Analytics position accurately (1400px)
    expect(mockScrollY).toBe(1400);
  } finally {
    vi.useRealTimers();
  }
  });

  // 6. SessionView prewarming occurs before the first workout navigation
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
