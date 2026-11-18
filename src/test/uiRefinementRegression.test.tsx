// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Dumbbell } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { Dashboard } from '../components/Dashboard';
import { AnalyticsView } from '../components/AnalyticsView';
import { HistoryView } from '../components/HistoryView';
import { Calendar } from '../components/Calendar';
import { ConfirmProvider } from '../context/ConfirmContext';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import * as useDashboardDataModule from '../hooks/useDashboardData';
import * as useAnalyticsDataModule from '../hooks/useAnalyticsData';
import * as useFitnessDerivedDataModule from '../hooks/useFitnessDerivedData';
import { CHART_THEME, SEMANTIC_COLORS, DURATION } from '../styles/tokens';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { Workout } from '../types/fitness';

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
  },
}));

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target: number) => target,
}));

// Deterministic ResponsiveContainer mock so Recharts SVG children render in JSDOM
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="recharts-responsive-mock" style={{ width: 320, height: 240 }}>
        {React.cloneElement(children, { width: 320, height: 240 } as any)}
      </div>
    ),
  };
});

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
    commitFitnessSnapshot: vi.fn(),
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
    ...overrides,
  };
}

describe('Targeted UI Refinement Regression Suite', () => {
  const rootDir = process.cwd();
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('1. Shared Primitive Defaults & Semantic States', () => {
    it('defaults StatCard accent to neutral zinc rather than emerald', () => {
      const html = renderToString(
        <StatCard
          label="Neutral Stat"
          value={42}
          icon={Dumbbell}
          disableAnimation
        />
      );
      expect(html).toContain(SEMANTIC_COLORS.zinc);
      expect(html).not.toContain(SEMANTIC_COLORS.emerald);
    });

    it('does not retain generic emerald workout tone in Badge', () => {
      const badgeSrc = fs.readFileSync(path.join(rootDir, 'src/components/ui/Badge.tsx'), 'utf8');
      expect(badgeSrc).not.toContain("workout: { color: 'emerald'");
      expect(badgeSrc).not.toContain("'workout'");

      const html = renderToString(
        <Badge label="PUSH" colorOverride={WORKOUT_COLORS.push} variant="subtle" />
      );
      expect(html).toContain(WORKOUT_COLORS.push);
    });
  });

  describe('2. Calendar Selection & Today Semantics', () => {
    const calWorkouts: Workout[] = [
      { id: 'wo-push', name: 'Push Protocol', badge: 'PUSH', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
    ];
    const calWorkoutMap = new Map(calWorkouts.map((w) => [w.id, w]));
    const calCoreMap = new Map(calWorkouts.map((w) => [w.cycleDay, w]));
    const calLogsMap = new Map<string, any[]>([
      ['2026-10-15', [{ id: 'log-today', workoutId: 'wo-push', date: '2026-10-15', complete: true, sets: { 'ex-1': [{ weight: '100', reps: '5', done: true }] }, durationMinutes: 45 }]],
    ]);

    it('uses brand orange/neutral styling for selected & today dates and reserves emerald for completed state badges', () => {
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        currentDate: new Date('2026-10-15T12:00:00Z'),
        todayStr: '2026-10-15',
        index: {
          logsByDate: calLogsMap,
          volumeByDate: { '2026-10-15': 500 },
          completedSetsByDate: { '2026-10-15': 1 },
          plannedSetsByDate: { '2026-10-15': 1 },
        } as any,
        workoutMap: calWorkoutMap,
        coreWorkoutByCycleDayMap: calCoreMap,
        getCycleDayForDate: () => 1,
        resolveExerciseMeta: () => ({ name: 'Bench Press', target: 'Chest' }),
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={{ workouts: calWorkouts } as any}>
            <Calendar />
          </FitnessContext.Provider>
        );
      });

      const todayBtn = container.querySelector('[data-testid="calendar-day-2026-10-15"]') as HTMLButtonElement;
      expect(todayBtn).toBeTruthy();
      expect(todayBtn.className).not.toContain('border-emerald');
      expect(todayBtn.className).not.toContain('bg-emerald');
      expect(todayBtn.className).toContain('border-zinc-500');

      const todayNumBadge = todayBtn.querySelector('span.rounded-full') as HTMLElement;
      expect(todayNumBadge.className).toContain('text-orange-400');
      expect(todayNumBadge.className).not.toContain('text-emerald-400');

      // Select today to inspect header, COMPLETED SESSION (emerald), and TODAY (orange, not emerald)
      act(() => {
        todayBtn.click();
      });

      expect(todayBtn.className).toContain('border-orange-500/70');
      expect(todayBtn.className).toContain('ring-orange-500/40');
      expect(todayBtn.className).not.toContain('border-emerald');

      const badges = Array.from(container.querySelectorAll('div')).filter((el) =>
        el.textContent === 'TODAY' || el.textContent === 'COMPLETED SESSION'
      );
      const todayTag = badges.find((el) => el.textContent === 'TODAY' && el.style.color);
      const completedTag = badges.find((el) => el.textContent === 'COMPLETED SESSION' && el.style.color);
      expect(todayTag?.style.color).not.toContain('16, 185, 129');
      expect(completedTag?.style.color).toContain('16, 185, 129');
    });
  });

  describe('3. Chart Design & Readability Contracts', () => {
    it('renders Analytics Estimated 1RM Progression with indigo strength-trend semantics and subtle area gradient', () => {
      const mockFitness = createMockFitnessContext();
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 3, longestStreak: 5 },
        adherenceInsight: { percent: 85, completedScheduled: 6, evaluatedScheduledWorkouts: 7, pendingScheduledWorkouts: 0 },
        performanceScore: { score: 88, status: 'Strong' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue({
        coreWorkoutByCycleDayMap: new Map(),
        priorityExercises: [{ id: 'ex-bench', name: 'Barbell Bench Press', target: 'Chest' }],
        active1RMExerciseId: 'ex-bench',
        aggregated: {
          totalLogsCount: 10,
          rangeLogsCount: 5,
          rangeVolume: 12000,
          priorVolume: 10000,
          volumePeriodChangePct: 20,
          activeDaysCount: 5,
          avgDuration: 45,
          biggestWeek: { weekStr: 'W42', volume: 8000 },
          recordsList: [],
          mostFrequentExercises: [],
          firstLogDate: '2026-09-01',
          lastLogDate: '2026-10-25',
          daysSinceLast: 1,
          avgGapDays: 2.0,
          lifetimeVolume: 50000,
          lifetimeSets: 180,
          lifetimeHours: 14,
          missedPastCoreDays: 0,
          adherencePct: 85,
          active1RMTrend: [
            { date: '2026-10-10', displayDate: 'Oct 10', epley1RM: 110, setDetail: '95kg × 5' },
            { date: '2026-10-18', displayDate: 'Oct 18', epley1RM: 115, setDetail: '100kg × 5' },
            { date: '2026-10-25', displayDate: 'Oct 25', epley1RM: 120, setDetail: '105kg × 5' },
          ],
        },
        heatmapData: { days: [], logVolMap: {}, dayDetailMap: {}, maxDayVol: 0, monthStart: new Date('2026-10-01') },
        muscleChartData: [],
        workoutPieData: [],
        insightsList: ['Consistent progression.'],
        getCycleDayForDate: () => 1,
        index: buildFitnessIndex({}),
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const eyebrow = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'Strength Progression');
      expect(eyebrow).toBeTruthy();
      expect(eyebrow?.style.color).toBe('rgb(99, 102, 241)'); // SEMANTIC_COLORS.indigo

      const areaGradient = container.querySelector('#e1rmAreaFill');
      expect(areaGradient).toBeTruthy();
      const areaPath = container.querySelector('.recharts-area-curve');
      expect(areaPath?.getAttribute('stroke')).toBe(CHART_THEME.indigo);

      const analyticsSrc = fs.readFileSync(path.join(rootDir, 'src/components/AnalyticsView.tsx'), 'utf8');
      expect(analyticsSrc).toContain('isAnimationActive={false}');
      expect(analyticsSrc).toContain('ChartTooltip');
    });

    it('renders HistoryView progression chart with shared ChartTooltip, indigo trend, and 10px non-colliding axes', () => {
      const historySrc = fs.readFileSync(path.join(rootDir, 'src/components/HistoryView.tsx'), 'utf8');
      expect(historySrc).toContain('<ChartTooltip>');
      expect(historySrc).not.toContain('contentStyle={{');
      expect(historySrc).toContain('fontSize={10}');
      expect(historySrc).not.toContain('fontSize={9}');
      expect(historySrc).toContain('interval="preserveStartEnd"');
      expect(historySrc).toContain('CHART_THEME.indigo');

      const mockFitness = createMockFitnessContext({
        logs: {
          l1: {
            id: 'l1',
            workoutId: 'push-a',
            date: '2026-10-10',
            complete: true,
            durationMinutes: 40,
            sets: { 'bench-press': [{ id: 's1', weight: '100', reps: '5', done: true }] },
          },
          l2: {
            id: 'l2',
            workoutId: 'push-a',
            date: '2026-10-18',
            complete: true,
            durationMinutes: 45,
            sets: { 'bench-press': [{ id: 's2', weight: '105', reps: '5', done: true }] },
          },
        },
      });
      const idx = buildFitnessIndex(mockFitness.logs);

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        sortedLogs: Object.values(mockFitness.logs).sort((a, b) => b.date.localeCompare(a.date)),
        workoutMap: new Map(INITIAL_WORKOUTS.map((w) => [w.id, w])),
        index: idx,
        prEvents: [],
        getStrengthTrendForRange: () => ({
          percentChange: 5,
          comparableExercises: 1,
          confidence: 'medium',
          currentValue: 120,
          previousValue: 114,
          exerciseBreakdown: [],
        }),
        getVolumeForRange: () => 1025,
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <HistoryView />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      // Expand first session, then expand first exercise to render the progression LineChart
      const sessionToggle = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-controls')?.startsWith('history-session-panel-')
      );
      expect(sessionToggle).toBeTruthy();
      act(() => {
        sessionToggle!.click();
      });

      const exToggle = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-controls')?.startsWith('history-ex-panel-')
      );
      expect(exToggle).toBeTruthy();
      act(() => {
        exToggle!.click();
      });

      const lineCurve = container.querySelector('.recharts-line-curve');
      expect(lineCurve?.getAttribute('stroke')).toBe(CHART_THEME.indigo);
    });

    it('thins Dashboard body weight sparkline markers for dense histories while keeping endpoints and polyline intact', () => {
      const denseSorted: [string, number][] = Array.from({ length: 12 }, (_, idx) => [
        `2026-10-${String(idx + 1).padStart(2, '0')}`,
        78 + idx * 0.2,
      ]);

      vi.spyOn(useDashboardDataModule, 'useDashboardData').mockReturnValue({
        heroDateStr: 'Monday, October 12',
        stats: { totalWeight: 10000 },
        trainingStreak: { currentStreak: 2, longestStreak: 4, streakStartDate: '2026-10-10', streakEndDate: '2026-10-12' },
        trainingFrequency: { sessionsPerWeek: 3.5, completedSessions: 10, previousSessions: 9, change: 0.5, sessionsChange: 1 },
        strengthTrend: { percentChange: null, currentValue: 0, previousValue: 0, comparableExercises: 0, confidence: 'low', exerciseBreakdown: [] },
        unfinishedSession: null,
        todayWorkout: INITIAL_WORKOUTS[0],
        currentCycleDay: 1,
        hasWorkouts: true,
        workouts: INITIAL_WORKOUTS,
        weightSummary: {
          currentWeight: denseSorted[denseSorted.length - 1][1],
          weightEntries: denseSorted,
          recentWeightLogs: [...denseSorted].reverse(),
          sparklineData: {
            sorted: denseSorted,
            weights: denseSorted.map((d) => d[1]),
            min: 77.5,
            max: 81.0,
            observedMin: denseSorted[0][1],
            observedMax: denseSorted[denseSorted.length - 1][1],
            range: 3.5,
            w: 100 / (denseSorted.length - 1),
          },
          logWeight: vi.fn(),
          deleteWeight: vi.fn(),
        },
        recentMilestones: {
          recentVolume: { volume: 5000, startDateStr: '2026-10-06', endDateStr: '2026-10-12', dateRangeLabel: 'Oct 6 – Oct 12' },
          recentPREvents: [],
        },
        isTodayCompleted: false,
        todayCompletedSummary: null,
        nextScheduledWorkout: null,
        adherence: {
          rate: 1,
          percent: 100,
          completedScheduled: 4,
          scheduledCoreWorkouts: 4,
          evaluatedScheduledWorkouts: 4,
          pendingScheduledWorkouts: 0,
          missedPastCoreDays: 0,
          scheduledRestDays: 1,
          bonusCompletedSessions: 0,
          isTodayPending: true,
        },
        clearActiveSession: vi.fn(),
        resetToCycleDay1: vi.fn(),
        reloadInitialWorkouts: vi.fn(),
      });

      act(() => {
        root.render(
          <FitnessContext.Provider value={{ workouts: INITIAL_WORKOUTS } as any}>
            <FitnessDerivedContext.Provider
              value={{
                currentDate: new Date('2026-10-12T12:00:00Z'),
                todayStr: '2026-10-12',
                index: { logsByDate: new Map(), volumeByDate: {}, completedSetsByDate: {}, plannedSetsByDate: {} },
                workoutMap: new Map(),
                coreWorkoutByCycleDayMap: new Map(),
                getCycleDayForDate: () => 1,
                resolveExerciseMeta: () => null,
              } as any}
            >
              <ConfirmProvider>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmProvider>
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const markers = Array.from(container.querySelectorAll('[data-testid="bodyweight-marker"]')) as HTMLElement[];
      expect(markers.length).toBeLessThanOrEqual(6);
      expect(parseFloat(markers[0].style.left)).toBeCloseTo(0, 5);
      expect(parseFloat(markers[markers.length - 1].style.left)).toBeCloseTo(100, 5);

      const polyline = container.querySelector('[aria-label*="Body weight trend"] polyline');
      expect(polyline?.getAttribute('stroke')).toBe(SEMANTIC_COLORS.emerald);
      expect(polyline?.getAttribute('points')?.trim().split(/\s+/).length).toBe(12);
    });
  });

  describe('4. SessionView Feedback & Public Assets Cleanliness', () => {
    it('keeps SessionView completed-set emerald fill/border and amber warning inputs without decorative glow shadows', () => {
      const sessionSrc = fs.readFileSync(path.join(rootDir, 'src/components/SessionView.tsx'), 'utf8');
      expect(sessionSrc).not.toContain('SHADOW.emeraldGlow');
      expect(sessionSrc).not.toContain('SHADOW.amberWarning');
      expect(sessionSrc).toContain('bg-emerald-500 border-emerald-400 text-black');
      expect(sessionSrc).toContain('border-amber-500/80 text-amber-400');
      expect(DURATION.slow).toBe(300);
    });

    it('ensures internal Paste brief does not remain in public/assets', () => {
      const pastePath = path.join(rootDir, 'public/assets/aistudio/Paste_November_16__2026_-_3_11PM_9d51c0de');
      expect(fs.existsSync(pastePath)).toBe(false);
    });
  });
});
