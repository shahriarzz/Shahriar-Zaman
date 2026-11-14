// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Layout, ActiveTab } from '../components/Layout';
import { AnalyticsView } from '../components/AnalyticsView';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { FitnessDerivedProvider } from '../context/FitnessDerivedContext';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import * as useAnalyticsDataModule from '../hooks/useAnalyticsData';
import * as useFitnessDerivedDataModule from '../hooks/useFitnessDerivedData';
import { useCalendarGrid } from '../hooks/useCalendarGrid';

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

function createMockAggregatedData(overrides: Partial<any> = {}) {
  return {
    totalLogsCount: 20,
    rangeLogsCount: 14,
    rangeVolume: 35000,
    priorVolume: 30000,
    volumePeriodChangePct: 16,
    activeDaysCount: 11,
    avgDuration: 48,
    biggestWeek: { weekStr: 'Week 40', volume: 15000 },
    recordsList: [],
    rangeMuscleVolume: {} as any,
    rangeMuscleSets: {} as any,
    rangeMuscleFrequency: {} as any,
    mostFrequentExercises: [],
    workoutTypeDistribution: {},
    firstLogDate: '2026-07-15',
    lastLogDate: '2026-10-25',
    daysSinceLast: 1,
    avgGapDays: 2.1,
    lifetimeVolume: 95000,
    lifetimeSets: 350,
    lifetimeHours: 28,
    scheduledCoreWorkouts: 8,
    completedScheduledCore: 7,
    scheduledRestDays: 4,
    missedPastCoreDays: 1,
    bonusCompletedSessions: 2,
    isTodayCorePending: false,
    adherencePct: 88,
    active1RMTrend: [],
    ...overrides
  };
}

function createMockAnalyticsReturn(aggregatedOverrides: Partial<any> = {}, extraOverrides: Partial<any> = {}) {
  return {
    index: buildFitnessIndex({}),
    workoutMap: new Map(),
    coreWorkoutByCycleDayMap: new Map(),
    priorityExercises: [{ id: 'ex-bench', name: 'Barbell Bench Press', target: 'Chest' }] as any,
    active1RMExerciseId: 'ex-bench',
    aggregated: createMockAggregatedData(aggregatedOverrides),
    heatmapData: {
      days: [],
      logVolMap: {},
      dayDetailMap: {},
      maxDayVol: 4000,
      monthStart: new Date('2026-10-01')
    } as any,
    muscleChartData: [],
    workoutPieData: [],
    insightsList: ['Great training cadence.'],
    getCycleDayForDate: () => 1,
    ...extraOverrides
  } as any;
}

function createMockFitnessDerivedReturn(overrides: Partial<any> = {}) {
  return {
    trainingStreak: { currentStreak: 3, longestStreak: 7, lastCompletedDate: '2026-10-25' },
    adherenceInsight: { percent: 85, completedScheduled: 6, evaluatedScheduledWorkouts: 7, pendingScheduledWorkouts: 0, status: 'On Track' },
    performanceScore: { score: 92, status: 'Excellent' },
    strengthTrend: { currentE1RM: 140, previousE1RM: 135, changePct: 3.7, movementName: 'Bench Press' },
    currentDate: new Date('2026-10-26T12:00:00Z'),
    todayStr: '2026-10-26',
    index: buildFitnessIndex({}),
    workoutMap: new Map(),
    coreWorkoutByCycleDayMap: new Map(),
    priorityExercises: [{ id: 'ex-bench', name: 'Barbell Bench Press', target: 'Chest' }] as any,
    getCycleDayForDate: () => 1,
    ...overrides
  } as any;
}

describe('Tab Scroll Reset & Analytics Stat Grid Regression Suite', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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

    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as any;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('1. Tab Scroll Policy: Single Reset & Position Preservation (Layout.tsx)', () => {
    it('resets scroll position to top when switching to a new tab for the first time', () => {
      let currentTab: ActiveTab = 'dashboard';
      const mockFitness = createMockFitnessContext();

      const TestHarness: React.FC<{ tab: ActiveTab }> = ({ tab }) => (
        <FitnessContext.Provider value={mockFitness}>
          <Layout activeTab={tab} onTabChange={(t) => { currentTab = t; }}>
            <div style={{ height: '2000px' }}>Tab Content: {tab}</div>
          </Layout>
        </FitnessContext.Provider>
      );

      // Mount initial dashboard tab
      act(() => {
        root.render(<TestHarness tab={currentTab} />);
      });

      // Clear spy calls from initial mount
      scrollToSpy.mockClear();

      // Simulate user scrolling down 500px in Dashboard
      window.scrollY = 500;

      // Navigate from Dashboard to Analytics (new tab, not visited yet)
      act(() => {
        currentTab = 'analytics';
        root.render(<TestHarness tab={currentTab} />);
      });

      // Assert that window.scrollTo was called with (0, 0) once after destination committed
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });

    it('preserves scroll position when returning to a previously scrolled tab', () => {
      let currentTab: ActiveTab = 'dashboard';
      const mockFitness = createMockFitnessContext();

      const TestHarness: React.FC<{ tab: ActiveTab }> = ({ tab }) => (
        <FitnessContext.Provider value={mockFitness}>
          <Layout activeTab={tab} onTabChange={(t) => { currentTab = t; }}>
            <div>Content: {tab}</div>
          </Layout>
        </FitnessContext.Provider>
      );

      act(() => {
        root.render(<TestHarness tab={currentTab} />);
      });
      scrollToSpy.mockClear();

      // User scrolls down 500px in Dashboard
      window.scrollY = 500;

      // Navigate to History (new tab -> scroll 0)
      act(() => {
        currentTab = 'history';
        root.render(<TestHarness tab={currentTab} />);
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
      scrollToSpy.mockClear();

      // In History, user scrolls down 200px
      window.scrollY = 200;

      // Navigate back to Dashboard -> restores Dashboard's 500px scroll position!
      act(() => {
        currentTab = 'dashboard';
        root.render(<TestHarness tab={currentTab} />);
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 500);
      scrollToSpy.mockClear();

      // Navigate back to History -> restores History's 200px scroll position!
      act(() => {
        currentTab = 'history';
        root.render(<TestHarness tab={currentTab} />);
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 200);
    });

    it('does NOT reset scroll when component rerenders without changing activeTab identity', () => {
      const mockFitness = createMockFitnessContext();

      const TestHarness: React.FC<{ tab: ActiveTab; counter: number }> = ({ tab, counter }) => (
        <FitnessContext.Provider value={mockFitness}>
          <Layout activeTab={tab} onTabChange={() => {}}>
            <div>Render Count: {counter}</div>
          </Layout>
        </FitnessContext.Provider>
      );

      // Mount initial dashboard
      act(() => {
        root.render(<TestHarness tab="dashboard" counter={1} />);
      });
      scrollToSpy.mockClear();

      // Set scroll position
      window.scrollY = 300;

      // Re-render with counter=2 but activeTab="dashboard" (same identity)
      act(() => {
        root.render(<TestHarness tab="dashboard" counter={2} />);
      });

      // Assert scrollTo was NOT called again
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(window.scrollY).toBe(300);
    });
  });

  describe('2. Mobile 2-Column Summary Grid: Average Session Length & Biggest Week Ever', () => {
    it('configures Average Session Length and Biggest Week Ever in a 2-column grid at mobile breakpoint', () => {
      const mockFitness = createMockFitnessContext();

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue(
        createMockFitnessDerivedReturn()
      );

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createMockAnalyticsReturn({
          avgDuration: 52,
          biggestWeek: { weekStr: 'Week 41 (Oct 2026)', volume: 18500 }
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      // Find the card for "Average Session Length"
      const avgLenLabel = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent?.trim() === 'Average Session Length'
      );
      expect(avgLenLabel).toBeTruthy();

      // Find the card for "Biggest Week Ever"
      const biggestWeekLabel = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent?.trim() === 'Biggest Week Ever'
      );
      expect(biggestWeekLabel).toBeTruthy();

      // Both cards must share the same parent Grid container
      const avgCard = avgLenLabel!.closest('[class*="rounded"]');
      const biggestWeekCard = biggestWeekLabel!.closest('[class*="rounded"]');
      expect(avgCard).toBeTruthy();
      expect(biggestWeekCard).toBeTruthy();

      // Assert via structural grid container rather than brittle single-level parentElement
      const gridContainer = avgCard!.closest('.grid');
      expect(gridContainer).toBeTruthy();
      expect(gridContainer).toBe(biggestWeekCard!.closest('.grid'));

      // Verify the grid container uses grid-cols-2 at mobile and desktop (cols={2} without colsMd restriction)
      expect(gridContainer!.classList.contains('grid-cols-2')).toBe(true);
      expect(gridContainer!.classList.contains('grid-cols-1')).toBe(false);
      expect(gridContainer!.classList.contains('md:grid-cols-2')).toBe(false);

      // Verify values rendered
      expect(container.textContent).toContain('52');
      expect(container.textContent).toContain('min');
      expect(container.textContent).toContain('18.5k kg');
      expect(container.textContent).toContain('Week 41 (Oct 2026)');
    });
  });

  describe('3. Training Cadence 2x2 Grid & Sessions in Window Metric', () => {
    it('arranges Training Cadence in a 2x2 grid containing all four metrics with accurate data', () => {
      const mockFitness = createMockFitnessContext();

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue(
        createMockFitnessDerivedReturn()
      );

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createMockAnalyticsReturn({
          rangeLogsCount: 14,
          firstLogDate: '2026-07-15'
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      // Find the Training Cadence section
      const cadenceTitle = Array.from(container.querySelectorAll('h2, h3, span, div')).find(
        el => el.textContent?.trim() === 'Training Cadence'
      );
      expect(cadenceTitle).toBeTruthy();

      // Find all four metrics in Training Cadence
      const metricLabels = [
        'Last Session',
        'Average Training Gap',
        'Active Days in Window',
        'Sessions in Window'
      ];

      metricLabels.forEach(label => {
        const found = Array.from(container.querySelectorAll('span')).find(
          el => el.textContent?.trim() === label
        );
        expect(found, `Expected Training Cadence metric "${label}" to be rendered`).toBeTruthy();
      });

      // Verify the grid container uses grid-cols-2 (2x2 grid)
      const sessionsInWindowLabel = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent?.trim() === 'Sessions in Window'
      )!;
      const card = sessionsInWindowLabel.closest('[class*="rounded"]');
      expect(card).toBeTruthy();

      const cadenceGrid = card!.closest('.grid');
      expect(cadenceGrid).toBeTruthy();
      expect(cadenceGrid!.classList.contains('grid-cols-2')).toBe(true);
      expect(cadenceGrid!.classList.contains('grid-cols-1')).toBe(false);
      expect(cadenceGrid!.classList.contains('md:grid-cols-3')).toBe(false);

      // Verify that "Sessions in Window" displays 14 sessions
      expect(card!.textContent).toContain('14');
      expect(card!.textContent).toContain('sessions');
      // Sublabel matches time range convention (default 30d => 30D window)
      expect(card!.textContent).toContain('Logged in 30D window');
    });

    it('renders zero-data and unavailable states cleanly for Sessions in Window', () => {
      const mockFitness = createMockFitnessContext();

      // Case A: User has 0 sessions in window but has lifetime logs
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue(
        createMockFitnessDerivedReturn({
          trainingStreak: { currentStreak: 0, longestStreak: 2, lastCompletedDate: '2026-08-01' },
          adherenceInsight: { percent: 0, completedScheduled: 0, evaluatedScheduledWorkouts: 4, pendingScheduledWorkouts: 0, status: 'Needs Attention' },
          performanceScore: { score: 40, status: 'Needs Focus' }
        })
      );

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createMockAnalyticsReturn({
          totalLogsCount: 5,
          rangeLogsCount: 0, // 0 in this window
          firstLogDate: '2026-08-01',
          lastLogDate: '2026-08-10',
          daysSinceLast: 77
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const sessionsInWindowLabel = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent?.trim() === 'Sessions in Window'
      )!;
      const cardA = sessionsInWindowLabel.closest('[class*="rounded"]')!;
      expect(cardA.textContent).toContain('0');
      expect(cardA.textContent).toContain('sessions');
      expect(cardA.textContent).toContain('No sessions in 30D window');

      // Case B: Brand new user with zero lifetime logs (firstLogDate is null)
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createMockAnalyticsReturn({
          totalLogsCount: 0,
          rangeLogsCount: 0,
          firstLogDate: null, // No lifetime logs
          lastLogDate: null,
          daysSinceLast: 0,
          avgGapDays: 0
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const sessionsLabelB = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent?.trim() === 'Sessions in Window'
      )!;
      const cardB = sessionsLabelB.closest('[class*="rounded"]')!;
      expect(cardB.textContent).toContain('—');
      expect(cardB.textContent).toContain('No sessions recorded');
    });

    it('ensures singular unit "session" is displayed when rangeLogsCount is exactly 1', () => {
      const mockFitness = createMockFitnessContext();

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue(
        createMockFitnessDerivedReturn()
      );

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createMockAnalyticsReturn({
          totalLogsCount: 1,
          rangeLogsCount: 1, // exactly 1 session
          rangeVolume: 2500,
          firstLogDate: '2026-10-26',
          lastLogDate: '2026-10-26'
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const sessionsLabel = Array.from(container.querySelectorAll('span')).find(
        el => el.textContent?.trim() === 'Sessions in Window'
      )!;
      const card = sessionsLabel.closest('[class*="rounded"]')!;
      expect(card.textContent).toContain('1');
      expect(card.textContent).toContain('session');
      expect(card.textContent).not.toContain('sessions');
    });
  });

  describe('4. useCalendarGrid Simplification & Analytics Heatmap Preservation', () => {
    it('returns strictly monthStart, days, logsByDateMap, and dayDetailMap without dead fields while Analytics computes heatmap intensities', () => {
      const idx = buildFitnessIndex({
        log_1: {
          id: 'log_1',
          workoutId: 'push-a',
          date: '2026-10-15',
          complete: true,
          durationMinutes: 45,
          sets: {
            'ex-bench': [{ id: 's1', weight: '100', reps: '5', done: true }]
          }
        }
      });
      const workoutMap = new Map(INITIAL_WORKOUTS.map(w => [w.id, w]));

      let gridResult: any;
      const GridProbe: React.FC = () => {
        gridResult = useCalendarGrid({
          monthDate: new Date('2026-10-15T12:00:00Z'),
          index: idx,
          workoutMap,
          weekStartsOn: 0
        });
        return null;
      };

      act(() => {
        root.render(<GridProbe />);
      });

      expect(Object.keys(gridResult).sort()).toEqual(['dayDetailMap', 'days', 'logsByDateMap', 'monthStart']);
      expect(gridResult.monthEnd).toBeUndefined();
      expect(gridResult.startDate).toBeUndefined();
      expect(gridResult.endDate).toBeUndefined();
      expect(gridResult.logVolMap).toBeUndefined();
      expect(gridResult.maxDayVol).toBeUndefined();
      expect(gridResult.isCurrentMonth).toBeUndefined();
      expect(gridResult.isToday).toBeUndefined();
      expect(gridResult.isFuture).toBeUndefined();
      expect(gridResult.logsByDateMap.get('2026-10-15')?.id).toBe('log_1');
      expect(gridResult.dayDetailMap['2026-10-15']?.volume).toBe(500);

      // Analytics useAnalyticsData composes logVolMap and maxDayVol for Monthly Intensity Heatmap
      const mockFitness = createMockFitnessContext({
        logs: {
          log_1: {
            id: 'log_1',
            workoutId: 'push-a',
            date: '2026-10-15',
            complete: true,
            durationMinutes: 45,
            sets: {
              'ex-bench': [{ id: 's1', weight: '100', reps: '5', done: true }]
            }
          }
        }
      });

      let analyticsRes: any;
      const AnalyticsProbe: React.FC = () => {
        analyticsRes = useAnalyticsDataModule.useAnalyticsData({
          timeRange: '30d',
          muscleMetric: 'volume',
          selected1RMExerciseId: null,
          currentHeatmapMonth: new Date('2026-10-15T12:00:00Z')
        });
        return null;
      };

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <FitnessDerivedProvider>
              <AnalyticsProbe />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      expect(analyticsRes.heatmapData.logVolMap['2026-10-15']).toBe(500);
      expect(analyticsRes.heatmapData.maxDayVol).toBe(500);
      expect(analyticsRes.heatmapData.days.length).toBeGreaterThanOrEqual(28);
    });
  });
});
