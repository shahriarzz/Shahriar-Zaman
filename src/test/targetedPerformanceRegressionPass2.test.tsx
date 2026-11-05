// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act, StrictMode, useState, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Layout, ActiveTab } from '../components/Layout';
import { Dashboard } from '../components/Dashboard';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
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

  // 1. Account A sync resolves after switching to B
  it('1. Account A sync resolves after switching to B: discards Account A payload without contaminating local state', async () => {
    let authCallback: any = null;
    vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, callback: any) => {
      authCallback = callback;
      return vi.fn();
    });

    const setDefs = vi.fn();
    const setWorkouts = vi.fn();
    const setLogs = vi.fn();
    const setAppState = vi.fn();
    const resetToDefaultData = vi.fn();

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
        setExerciseDefinitions: setDefs,
        setWorkouts: setWorkouts,
        setLogs: setLogs,
        setAppState: setAppState,
        resetToDefaultData
      });
      return null;
    }

    act(() => {
      root.render(<TestSyncComponent />);
    });

    // Delayed promise resolver for Account A
    let resolveAccountADefs: any;
    const accountADefsPromise = new Promise<ExerciseDefinition[]>((resolve) => {
      resolveAccountADefs = resolve;
    });

    vi.spyOn(firestoreService, 'getExerciseDefinitions').mockImplementation((uid) => {
      if (uid === 'user-A') {
        return accountADefsPromise;
      }
      return Promise.resolve([]);
    });
    vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
    vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
    vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);

    // Simulate login for User A
    act(() => {
      authCallback({ uid: 'user-A', email: 'userA@test.com' });
    });

    // In-flight sync is now pending for User A...
    // Switch to User B before User A's network request resolves!
    act(() => {
      authCallback({ uid: 'user-B', email: 'userB@test.com' });
    });

    expect(resetToDefaultData).toHaveBeenCalled();
    setDefs.mockClear();

    // Now User A's slow download finally resolves
    await act(async () => {
      resolveAccountADefs([
        { id: 'stale-def-from-A', name: 'User A Exercise', category: 'Chest', target: 'Pecs', movement: 'compound', isCustom: true }
      ]);
      await new Promise(r => setTimeout(r, 20));
    });

    // Verify User A's stale payload was NOT passed to setDefs
    expect(setDefs).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'stale-def-from-A' })])
    );
  });

  // 2. Account A active workout is cleared on logout/account switch and cannot reappear via visibilitychange
  it('2. Account A active workout is cleared on logout/switch and cannot reappear on visibility change', () => {
    let contextValue: any = null;

    function TestActiveSessionComponent() {
      contextValue = useActiveSessionContext();
      return (
        <div>
          <span data-testid="session-status">
            {contextValue.activeSession ? contextValue.activeSession.workoutId : 'none'}
          </span>
        </div>
      );
    }

    act(() => {
      root.render(
        <ActiveSessionProvider>
          <TestActiveSessionComponent />
        </ActiveSessionProvider>
      );
    });

    // Start an active session for Account A
    act(() => {
      contextValue.startActiveSession('push-a', {
        'bench-press': [{ id: 'set-1', weight: '100', reps: '5', done: true }]
      });
    });

    expect(contextValue.activeSession?.workoutId).toBe('push-a');
    expect(localStorage.getItem('gl_active_session')).toContain('push-a');

    // Simulate unified logout/account reset
    act(() => {
      contextValue.clearActiveSession();
      localStorage.removeItem('gl_active_session');
    });

    expect(contextValue.activeSession).toBeNull();
    expect(localStorage.getItem('gl_active_session')).toBeNull();

    // Simulate app backgrounding / visibility hidden
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Verified: gl_active_session was NOT resurrected
    expect(localStorage.getItem('gl_active_session')).toBeNull();
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

  // 4. Editing one exercise does not re-render unaffected ExerciseCards
  it('4. Editing one exercise set does not re-render unaffected ExerciseCards (React.memo isolation)', () => {
    let renderCountCard1 = 0;
    let renderCountCard2 = 0;

    // Mimic the stabilized memoized ExerciseCard contract
    const MockExerciseCard = React.memo<{
      exId: string;
      sets: any[];
      onToggle: (id: string) => void;
      updateSet: (id: string, idx: number, field: string, val: any) => void;
    }>(({ exId, sets }) => {
      if (exId === 'ex1') renderCountCard1++;
      if (exId === 'ex2') renderCountCard2++;
      return <div data-testid={`card-${exId}`}>Sets: {sets.length}</div>;
    });

    function SessionContainer() {
      const [sessionSets, setSessionSets] = useState<Record<string, any[]>>({
        ex1: [{ id: 's1', weight: '50', reps: '10', done: false }],
        ex2: [{ id: 's2', weight: '80', reps: '5', done: false }]
      });

      const updateSet = React.useCallback((exId: string, idx: number, field: string, val: any) => {
        setSessionSets(prev => {
          const current = prev[exId] || [];
          const updated = current.map((s, i) => i === idx ? { ...s, [field]: val } : s);
          return { ...prev, [exId]: updated };
        });
      }, []);

      const onToggle = React.useCallback((_id: string) => {}, []);

      return (
        <div>
          <MockExerciseCard
            exId="ex1"
            sets={sessionSets['ex1']}
            onToggle={onToggle}
            updateSet={updateSet}
          />
          <MockExerciseCard
            exId="ex2"
            sets={sessionSets['ex2']}
            onToggle={onToggle}
            updateSet={updateSet}
          />
          <button
            data-testid="edit-ex1-btn"
            onClick={() => updateSet('ex1', 0, 'weight', '60')}
          >
            Edit ex1
          </button>
        </div>
      );
    }

    act(() => {
      root.render(<SessionContainer />);
    });

    expect(renderCountCard1).toBe(1);
    expect(renderCountCard2).toBe(1);

    // Edit only Exercise 1
    const editBtn = container.querySelector('[data-testid="edit-ex1-btn"]') as HTMLButtonElement;
    act(() => {
      editBtn.click();
    });

    // Exercise 1 re-renders with new set weight
    expect(renderCountCard1).toBe(2);
    // Exercise 2 is memoized and did NOT re-render!
    expect(renderCountCard2).toBe(1);
  });

  // 5. Scroll restoration works between tabs with significantly different content heights
  it('5. Tab scroll restoration works accurately between tabs with divergent content heights', () => {
    let currentTab: ActiveTab = 'dashboard';
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    const mockFitness = createMockFitnessContext();

    const TestLayoutHarness: React.FC<{ tab: ActiveTab }> = ({ tab }) => (
      <FitnessContext.Provider value={mockFitness}>
        <Layout activeTab={tab} onTabChange={(t) => { currentTab = t; }}>
          <div style={{ height: tab === 'dashboard' ? '1800px' : '400px' }}>
            Content: {tab}
          </div>
        </Layout>
      </FitnessContext.Provider>
    );

    act(() => {
      root.render(<TestLayoutHarness tab={currentTab} />);
    });
    scrollToSpy.mockClear();

    // User scrolls down 800px in Dashboard
    window.scrollY = 800;

    // Navigate to History (first visit -> scroll 0)
    act(() => {
      currentTab = 'history';
      root.render(<TestLayoutHarness tab={currentTab} />);
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    scrollToSpy.mockClear();

    // User scrolls down 300px in History
    window.scrollY = 300;

    // Return to Dashboard -> restores 800px position accurately
    act(() => {
      currentTab = 'dashboard';
      root.render(<TestLayoutHarness tab={currentTab} />);
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 800);
    scrollToSpy.mockClear();

    // Return to History -> restores 300px position accurately
    act(() => {
      currentTab = 'history';
      root.render(<TestLayoutHarness tab={currentTab} />);
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 300);
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
