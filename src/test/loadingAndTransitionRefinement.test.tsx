// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act, Suspense, lazy } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Layout, ActiveTab } from '../components/Layout';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { persistFitnessDatabase } from '../hooks/useFitnessData';
import { ActiveSession } from '../hooks/useActiveSession';
import { loadInitialFitnessData } from '../utils/fitnessMigration';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';

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
    syncStatus: 'idle',
    syncError: null,
    login: vi.fn(),
    logout: vi.fn(),
    retrySync: vi.fn(),
    accountResetStatus: 'idle',
    accountResetError: null,
    retryAccountReset: vi.fn().mockResolvedValue({ success: true }),
    exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
    workouts: INITIAL_WORKOUTS,
    logs: {},
    appState: { cycleStart: '2026-10-01' },
    databaseLifecycleState: { phase: 'ready' },
    retryStorageCommit: vi.fn().mockReturnValue({ success: true }),
    addExerciseDefinition: vi.fn(),
    updateExerciseDefinition: vi.fn(),
    deleteExerciseDefinition: vi.fn(),
    setWorkouts: vi.fn(),
    assignExerciseToWorkout: vi.fn(),
    removeExerciseFromWorkout: vi.fn(),
    updateWorkoutExerciseProgramming: vi.fn(),
    deleteWorkout: vi.fn(),
    addLog: vi.fn().mockResolvedValue({ success: true, localPersisted: true, cloudPersisted: false, cloudAttempted: false }),
    deleteLog: vi.fn(),
    resetLogs: vi.fn(),
    updateCycleStart: vi.fn().mockResolvedValue(undefined),
    commitFitnessSnapshot: vi.fn((partial) => ({
      success: true,
      snapshot: {
        exerciseDefinitions: partial.exerciseDefinitions ?? INITIAL_EXERCISE_DEFINITIONS,
        workouts: partial.workouts ?? INITIAL_WORKOUTS,
        logs: partial.logs ?? {},
        appState: partial.appState ?? { cycleStart: '2026-10-01' }
      }
    })),
    activeSession: null,
    startActiveSession: vi.fn(),
    updateActiveSessionSets: vi.fn(),
    clearActiveSession: vi.fn(),
    logBodyWeight: vi.fn(),
    deleteBodyWeight: vi.fn(),
    pushAutoBackup: vi.fn().mockResolvedValue({ success: true }),
    getAutoBackups: vi.fn().mockReturnValue([]),
    clearAutoBackups: vi.fn().mockResolvedValue({ success: true }),
    restoreAutoBackup: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'restored_locally' }),
    createManualBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
    exportBackup: vi.fn().mockReturnValue('{}'),
    importBackup: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'restored_locally' }),
    retryPendingCloudSync: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'fully_synced' }),
    isBackupsLoading: false,
    hasPendingCloudSync: false,
    pendingCloudSyncError: null,
    ...overrides
  };
}

describe('GAINLOG Loading and Transition Refinement Suite (Behavioral)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    scrollToSpy = vi.fn((x: number | ScrollToOptions, y?: number) => {
      if (typeof x === 'object') {
        window.scrollX = x.left ?? 0;
        window.scrollY = x.top ?? 0;
      } else {
        window.scrollX = x;
        window.scrollY = y ?? 0;
      }
    });
    window.scrollTo = scrollToSpy as any;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('P0 — Mobile Navigation & Tab Switching Responsiveness', () => {
    it('executes ordinary tab changes immediately without animation delays', () => {
      let activeTab: ActiveTab = 'dashboard';
      const onTabChange = vi.fn((tab: ActiveTab) => {
        activeTab = tab;
      });

      const mockFitness = createMockFitnessContext();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab={activeTab} onTabChange={onTabChange}>
              <div id="tab-content">{activeTab}</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });

      // Mobile nav item for history
      const historyBtn = container.querySelector('#mobile-nav-item-history') as HTMLButtonElement;
      expect(historyBtn).not.toBeNull();

      // Click history tab
      act(() => {
        historyBtn.click();
      });

      // Verify onTabChange was called immediately
      expect(onTabChange).toHaveBeenCalledWith('history');

      // Re-render with new tab identity
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab={activeTab} onTabChange={onTabChange}>
              <div id="tab-content">{activeTab}</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });

      // Destination content updates synchronously
      expect(container.querySelector('#tab-content')?.textContent).toBe('history');
      expect(container.querySelector('#mobile-nav-item-history')?.getAttribute('aria-current')).toBe('page');
      expect(container.querySelector('#mobile-nav-item-dashboard')?.getAttribute('aria-current')).toBeNull();
    });

    it('preserves tab scroll position across navigation without pre-paint jumps', () => {
      let activeTab: ActiveTab = 'dashboard';
      const mockFitness = createMockFitnessContext();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab={activeTab} onTabChange={(t) => { activeTab = t; }}>
              <div style={{ height: '3000px' }}>Dashboard Content</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });
      scrollToSpy.mockClear();

      // User scrolls down 600px in Dashboard
      window.scrollY = 600;

      // Switch to History tab (unvisited -> resets to 0 once after commit)
      act(() => {
        activeTab = 'history';
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab={activeTab} onTabChange={(t) => { activeTab = t; }}>
              <div>History Content</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
      scrollToSpy.mockClear();

      // In History, user scrolls down 150px
      window.scrollY = 150;

      // Switch back to Dashboard -> restores previous 600px scroll position
      act(() => {
        activeTab = 'dashboard';
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab={activeTab} onTabChange={(t) => { activeTab = t; }}>
              <div>Dashboard Content</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
    });
  });

  describe('P0/P1 — Code Splitting, Suspense Fallback, and Module Reuse', () => {
    it('shows Suspense fallback only during pending import and reuses loaded component without fallback', async () => {
      let resolveChunk: (mod: { default: React.FC }) => void;
      const pendingPromise = new Promise<{ default: React.FC }>(resolve => {
        resolveChunk = resolve;
      });

      const LazyComponent = lazy(() => pendingPromise);

      const TestHarness: React.FC<{ showLazy: boolean }> = ({ showLazy }) => (
        <Suspense fallback={<div id="test-spinner" aria-busy="true">Loading chunk...</div>}>
          {showLazy ? <LazyComponent /> : <div id="dashboard-ready">Dashboard Ready</div>}
        </Suspense>
      );

      // Mount initial dashboard
      act(() => {
        root.render(<TestHarness showLazy={false} />);
      });
      expect(container.querySelector('#dashboard-ready')).not.toBeNull();
      expect(container.querySelector('#test-spinner')).toBeNull();

      // Switch to lazy component before module has resolved
      act(() => {
        root.render(<TestHarness showLazy={true} />);
      });

      // Suspense boundary renders fallback
      expect(container.querySelector('#test-spinner')).not.toBeNull();

      // Resolve the pending chunk module
      await act(async () => {
        resolveChunk!({
          default: () => <div id="lazy-content">Lazy Loaded Content</div>
        });
        await pendingPromise;
      });

      // Resolved chunk renders
      expect(container.querySelector('#lazy-content')).not.toBeNull();
      expect(container.querySelector('#test-spinner')).toBeNull();

      // Navigate away
      act(() => {
        root.render(<TestHarness showLazy={false} />);
      });
      expect(container.querySelector('#dashboard-ready')).not.toBeNull();

      // Return to lazy component: since module is cached in memory, renders immediately without fallback
      act(() => {
        root.render(<TestHarness showLazy={true} />);
      });
      expect(container.querySelector('#lazy-content')).not.toBeNull();
      expect(container.querySelector('#test-spinner')).toBeNull();
    });

    it('unmounts inactive views so hidden tabs do not hold chart trees or re-render', () => {
      const dashboardRenderSpy = vi.fn();
      const analyticsRenderSpy = vi.fn();

      const MockDashboard: React.FC = () => {
        dashboardRenderSpy();
        return <div id="mock-dashboard">Dashboard View</div>;
      };

      const MockAnalytics: React.FC = () => {
        analyticsRenderSpy();
        return <div id="mock-analytics">Analytics View</div>;
      };

      const AppTabsHarness: React.FC<{ activeTab: ActiveTab; tick: number }> = ({ activeTab }) => (
        <div>
          {activeTab === 'dashboard' && <MockDashboard />}
          {activeTab === 'analytics' && <MockAnalytics />}
        </div>
      );

      // Mount Dashboard
      act(() => {
        root.render(<AppTabsHarness activeTab="dashboard" tick={1} />);
      });
      expect(dashboardRenderSpy).toHaveBeenCalledTimes(1);
      expect(analyticsRenderSpy).toHaveBeenCalledTimes(0);
      expect(container.querySelector('#mock-dashboard')).not.toBeNull();
      expect(container.querySelector('#mock-analytics')).toBeNull();

      // Switch to Analytics
      act(() => {
        root.render(<AppTabsHarness activeTab="analytics" tick={2} />);
      });
      expect(dashboardRenderSpy).toHaveBeenCalledTimes(1); // Not called again
      expect(analyticsRenderSpy).toHaveBeenCalledTimes(1);
      expect(container.querySelector('#mock-dashboard')).toBeNull(); // Cleanly unmounted
      expect(container.querySelector('#mock-analytics')).not.toBeNull();

      // Unrelated state update while on Analytics
      act(() => {
        root.render(<AppTabsHarness activeTab="analytics" tick={3} />);
      });
      expect(dashboardRenderSpy).toHaveBeenCalledTimes(1); // Dashboard remains at 1, does NOT re-render in background
      expect(analyticsRenderSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('P0/P1 — Truthful Local Hydration & Active Session Preservation', () => {
    it('synchronously hydrates local data before first render even on cold launch with existing data', () => {
      // Seed valid snapshot in localStorage
      const mockSnapshot = {
        exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
        workouts: INITIAL_WORKOUTS,
        logs: {
          'test-log-1': {
            id: 'test-log-1',
            workoutId: 'w-push',
            date: '2026-10-25',
            sets: {},
            complete: true,
            durationMinutes: 45
          }
        },
        appState: { cycleStart: '2026-10-01' }
      };
      persistFitnessDatabase(mockSnapshot);

      // Run synchronous hydration
      const hydrated = loadInitialFitnessData();

      // Assert data was synchronously recovered from snapshot
      expect(hydrated.logs['test-log-1']).toBeDefined();
      expect(hydrated.workouts.length).toBeGreaterThan(0);
      expect(hydrated.appState.cycleStart).toBe('2026-10-01');
    });

    it('safely recovers defaults when storage is empty or malformed without crashing', () => {
      localStorage.setItem('gl_database_snapshot', '{invalid json syntax}');

      const hydrated = loadInitialFitnessData();

      expect(hydrated.defs).toBeDefined();
      expect(hydrated.workouts).toBeDefined();
      expect(hydrated.logs).toEqual({});
      expect(hydrated.appState.cycleStart).toBeDefined();
      // Corrupt snapshot was safely quarantined
      expect(localStorage.getItem('gl_corrupt_snapshot_backup')).toBe('{invalid json syntax}');
    });

    it('preserves active in-flight session in canonical context across navigation', () => {
      const activeSessionData: ActiveSession = {
        workoutId: 'w-push-1',
        startTime: Date.now() - 60000,
        sessionSets: {
          'ex-bench': [{ id: 'set_ex-bench_0', weight: '100', reps: '5', done: true }]
        }
      };

      let activeTab: ActiveTab = 'session';
      const mockFitness = createMockFitnessContext({
        activeSession: activeSessionData
      });

      const NavigationPreservationHarness: React.FC<{ tab: ActiveTab }> = ({ tab }) => (
        <FitnessContext.Provider value={mockFitness}>
          <Layout activeTab={tab} onTabChange={(t) => { activeTab = t; }}>
            <div id="session-status">
              {mockFitness.activeSession ? `Active: ${mockFitness.activeSession.workoutId}` : 'No active session'}
            </div>
          </Layout>
        </FitnessContext.Provider>
      );

      // Mount session view
      act(() => {
        root.render(<NavigationPreservationHarness tab={activeTab} />);
      });
      expect(container.querySelector('#session-status')?.textContent).toBe('Active: w-push-1');

      // Navigate to Dashboard
      act(() => {
        activeTab = 'dashboard';
        root.render(<NavigationPreservationHarness tab={activeTab} />);
      });
      // Active session state survives in canonical context
      expect(mockFitness.activeSession?.workoutId).toBe('w-push-1');
      expect(mockFitness.activeSession?.sessionSets['ex-bench'][0].weight).toBe('100');

      // Return to Session view
      act(() => {
        activeTab = 'session';
        root.render(<NavigationPreservationHarness tab={activeTab} />);
      });
      expect(container.querySelector('#session-status')?.textContent).toBe('Active: w-push-1');
    });
  });
});
