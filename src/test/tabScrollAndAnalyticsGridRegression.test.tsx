// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Layout, ActiveTab } from '../components/Layout';
import { AnalyticsView } from '../components/AnalyticsView';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { SessionLog } from '../types/fitness';
import * as useAnalyticsDataModule from '../hooks/useAnalyticsData';
import * as useFitnessDerivedDataModule from '../hooks/useFitnessDerivedData';

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

  describe('1. Tab Scroll Reset Behavior (Layout.tsx)', () => {
    it('resets scroll position to top when activeTab changes (Dashboard -> Analytics)', () => {
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
      document.documentElement.scrollTop = 500;
      document.body.scrollTop = 500;
      window.scrollY = 500;

      expect(document.documentElement.scrollTop).toBe(500);

      // Navigate from Dashboard to Analytics
      act(() => {
        currentTab = 'analytics';
        root.render(<TestHarness tab={currentTab} />);
      });

      // Assert that window.scrollTo(0, 0) was invoked immediately
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
      // Assert that documentElement and body scroll tops are reset to 0
      expect(document.documentElement.scrollTop).toBe(0);
      expect(document.body.scrollTop).toBe(0);
    });

    it('resets scroll position across multiple navigation transitions (Analytics -> History, Dashboard -> History)', () => {
      let currentTab: ActiveTab = 'analytics';
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

      // Transition 1: Analytics -> History
      document.documentElement.scrollTop = 350;
      act(() => {
        currentTab = 'history';
        root.render(<TestHarness tab={currentTab} />);
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
      expect(document.documentElement.scrollTop).toBe(0);
      scrollToSpy.mockClear();

      // Transition 2: History -> Dashboard
      document.documentElement.scrollTop = 600;
      act(() => {
        currentTab = 'dashboard';
        root.render(<TestHarness tab={currentTab} />);
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
      expect(document.documentElement.scrollTop).toBe(0);
      scrollToSpy.mockClear();

      // Transition 3: Dashboard -> History directly (simulating onNavigateToHistory link)
      document.documentElement.scrollTop = 420;
      act(() => {
        currentTab = 'history';
        root.render(<TestHarness tab={currentTab} />);
      });
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
      expect(document.documentElement.scrollTop).toBe(0);
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
      document.documentElement.scrollTop = 300;
      document.body.scrollTop = 300;

      // Re-render with counter=2 but activeTab="dashboard" (same identity)
      act(() => {
        root.render(<TestHarness tab="dashboard" counter={2} />);
      });

      // Assert scrollTo was NOT called again
      expect(scrollToSpy).not.toHaveBeenCalled();
      // Scroll position remains unchanged
      expect(document.documentElement.scrollTop).toBe(300);
      expect(document.body.scrollTop).toBe(300);
    });

    it('resets document.body.scrollTop for Android WebView scrolling compatibility', () => {
      const mockFitness = createMockFitnessContext();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab="dashboard" onTabChange={() => {}}>
              <div>Content</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });
      scrollToSpy.mockClear();

      // In Android WebView, document.body may act as the scrolling element
      document.body.scrollTop = 750;
      expect(document.body.scrollTop).toBe(750);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <Layout activeTab="manage" onTabChange={() => {}}>
              <div>Content</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });

      expect(document.body.scrollTop).toBe(0);
    });
  });

  describe('2. Mobile 2-Column Summary Grid: Average Session Length & Biggest Week Ever', () => {
    it('configures Average Session Length and Biggest Week Ever in a 2-column grid at mobile breakpoint', () => {
      const mockFitness = createMockFitnessContext();

      // Mock useFitnessDerivedData
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 3, longestStreak: 7, lastCompletedDate: '2026-10-25' },
        adherenceInsight: { adherencePct: 85, completedScheduledCore: 6, scheduledCoreDays: 7, status: 'On Track' },
        performanceScore: { score: 92, status: 'Excellent' },
        strengthTrend: { currentE1RM: 140, previousE1RM: 135, changePct: 3.7, movementName: 'Bench Press' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [{ id: 'ex-bench', name: 'Barbell Bench Press', target: 'Chest' }] as any,
        getCycleDayForDate: () => 1
      } as any);

      // Mock useAnalyticsData with populated session and biggest week data
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue({
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [{ id: 'ex-bench', name: 'Barbell Bench Press', target: 'Chest' }] as any,
        active1RMExerciseId: 'ex-bench',
        aggregated: {
          totalLogsCount: 24,
          rangeLogsCount: 12,
          rangeVolume: 45000,
          priorVolume: 40000,
          volumePeriodChangePct: 12,
          activeDaysCount: 10,
          avgDuration: 52,
          biggestWeek: { weekStr: 'Week 41 (Oct 2026)', volume: 18500 },
          recordsList: [],
          rangeMuscleVolume: {} as any,
          rangeMuscleSets: {} as any,
          rangeMuscleFrequency: {} as any,
          mostFrequentExercises: [],
          workoutTypeDistribution: {},
          firstLogDate: '2026-08-01',
          lastLogDate: '2026-10-25',
          daysSinceLast: 1,
          avgGapDays: 1.8,
          lifetimeVolume: 120000,
          lifetimeSets: 420,
          lifetimeHours: 36.5,
          scheduledCoreWorkouts: 8,
          completedScheduledCore: 7,
          scheduledRestDays: 4,
          missedPastCoreDays: 1,
          bonusCompletedSessions: 2,
          isTodayCorePending: false,
          adherencePct: 88,
          active1RMTrend: []
        } as any,
        heatmapData: {
          days: [],
          logVolMap: {},
          dayDetailMap: {},
          maxDayVol: 5000,
          monthStart: new Date('2026-10-01')
        } as any,
        muscleChartData: [],
        workoutPieData: [],
        insightsList: ['Great training cadence.'],
        getCycleDayForDate: () => 1
      } as any);

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

      const gridContainer = avgCard!.parentElement;
      expect(gridContainer).toBeTruthy();
      expect(gridContainer).toBe(biggestWeekCard!.parentElement);

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

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 3, longestStreak: 7, lastCompletedDate: '2026-10-25' },
        adherenceInsight: { adherencePct: 85, completedScheduledCore: 6, scheduledCoreDays: 7, status: 'On Track' },
        performanceScore: { score: 92, status: 'Excellent' },
        strengthTrend: { currentE1RM: 140, previousE1RM: 135, changePct: 3.7, movementName: 'Bench' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        getCycleDayForDate: () => 1
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue({
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        active1RMExerciseId: '',
        aggregated: {
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
          active1RMTrend: []
        } as any,
        heatmapData: {
          days: [],
          logVolMap: {},
          dayDetailMap: {},
          maxDayVol: 4000,
          monthStart: new Date('2026-10-01')
        } as any,
        muscleChartData: [],
        workoutPieData: [],
        insightsList: [],
        getCycleDayForDate: () => 1
      } as any);

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

      const cadenceGrid = card!.parentElement;
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
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 0, longestStreak: 2, lastCompletedDate: '2026-08-01' },
        adherenceInsight: { adherencePct: 0, completedScheduledCore: 0, scheduledCoreDays: 4, status: 'Needs Attention' },
        performanceScore: { score: 40, status: 'Needs Focus' },
        strengthTrend: { currentE1RM: null, previousE1RM: null, changePct: null, movementName: null },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        getCycleDayForDate: () => 1
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue({
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        active1RMExerciseId: '',
        aggregated: {
          totalLogsCount: 5,
          rangeLogsCount: 0, // 0 in this window
          rangeVolume: 0,
          priorVolume: 0,
          volumePeriodChangePct: null,
          activeDaysCount: 0,
          avgDuration: 0,
          biggestWeek: { weekStr: 'Week 32', volume: 8000 },
          recordsList: [],
          rangeMuscleVolume: {} as any,
          rangeMuscleSets: {} as any,
          rangeMuscleFrequency: {} as any,
          mostFrequentExercises: [],
          workoutTypeDistribution: {},
          firstLogDate: '2026-08-01',
          lastLogDate: '2026-08-10',
          daysSinceLast: 77,
          avgGapDays: 2.5,
          lifetimeVolume: 25000,
          lifetimeSets: 80,
          lifetimeHours: 6,
          scheduledCoreWorkouts: 4,
          completedScheduledCore: 0,
          scheduledRestDays: 2,
          missedPastCoreDays: 4,
          bonusCompletedSessions: 0,
          isTodayCorePending: false,
          adherencePct: 0,
          active1RMTrend: []
        } as any,
        heatmapData: { days: [], logVolMap: {}, dayDetailMap: {}, maxDayVol: 0, monthStart: new Date('2026-10-01') } as any,
        muscleChartData: [],
        workoutPieData: [],
        insightsList: [],
        getCycleDayForDate: () => 1
      } as any);

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
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue({
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        active1RMExerciseId: '',
        aggregated: {
          totalLogsCount: 0,
          rangeLogsCount: 0,
          rangeVolume: 0,
          priorVolume: 0,
          volumePeriodChangePct: null,
          activeDaysCount: 0,
          avgDuration: 0,
          biggestWeek: { weekStr: '', volume: 0 },
          recordsList: [],
          rangeMuscleVolume: {} as any,
          rangeMuscleSets: {} as any,
          rangeMuscleFrequency: {} as any,
          mostFrequentExercises: [],
          workoutTypeDistribution: {},
          firstLogDate: null, // No lifetime logs
          lastLogDate: null,
          daysSinceLast: 0,
          avgGapDays: 0,
          lifetimeVolume: 0,
          lifetimeSets: 0,
          lifetimeHours: 0,
          scheduledCoreWorkouts: 0,
          completedScheduledCore: 0,
          scheduledRestDays: 0,
          missedPastCoreDays: 0,
          bonusCompletedSessions: 0,
          isTodayCorePending: false,
          adherencePct: 0,
          active1RMTrend: []
        } as any,
        heatmapData: { days: [], logVolMap: {}, dayDetailMap: {}, maxDayVol: 0, monthStart: new Date('2026-10-01') } as any,
        muscleChartData: [],
        workoutPieData: [],
        insightsList: [],
        getCycleDayForDate: () => 1
      } as any);

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

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 1, longestStreak: 1, lastCompletedDate: '2026-10-26' },
        adherenceInsight: { adherencePct: 100, completedScheduledCore: 1, scheduledCoreDays: 1, status: 'On Track' },
        performanceScore: { score: 90, status: 'Strong' },
        strengthTrend: { currentE1RM: 100, previousE1RM: 95, changePct: 5.2, movementName: 'Squat' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        getCycleDayForDate: () => 1
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue({
        index: buildFitnessIndex({}),
        workoutMap: new Map(),
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [] as any,
        active1RMExerciseId: '',
        aggregated: {
          totalLogsCount: 1,
          rangeLogsCount: 1, // exactly 1 session
          rangeVolume: 2500,
          priorVolume: 0,
          volumePeriodChangePct: null,
          activeDaysCount: 1,
          avgDuration: 40,
          biggestWeek: { weekStr: 'Week 43', volume: 2500 },
          recordsList: [],
          rangeMuscleVolume: {} as any,
          rangeMuscleSets: {} as any,
          rangeMuscleFrequency: {} as any,
          mostFrequentExercises: [],
          workoutTypeDistribution: {},
          firstLogDate: '2026-10-26',
          lastLogDate: '2026-10-26',
          daysSinceLast: 0,
          avgGapDays: 0,
          lifetimeVolume: 2500,
          lifetimeSets: 12,
          lifetimeHours: 0.7,
          scheduledCoreWorkouts: 1,
          completedScheduledCore: 1,
          scheduledRestDays: 0,
          missedPastCoreDays: 0,
          bonusCompletedSessions: 0,
          isTodayCorePending: false,
          adherencePct: 100,
          active1RMTrend: []
        } as any,
        heatmapData: { days: [], logVolMap: {}, dayDetailMap: {}, maxDayVol: 2500, monthStart: new Date('2026-10-01') } as any,
        muscleChartData: [],
        workoutPieData: [],
        insightsList: [],
        getCycleDayForDate: () => 1
      } as any);

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
});
