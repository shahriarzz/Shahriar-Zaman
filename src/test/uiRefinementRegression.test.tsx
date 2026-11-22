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
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ToggleChip } from '../components/ui/ToggleChip';
import { Dashboard } from '../components/Dashboard';
import { AnalyticsView } from '../components/AnalyticsView';
import { HistoryView } from '../components/HistoryView';
import { Calendar } from '../components/Calendar';
import { MuscleBalanceRecovery } from '../components/MuscleBalanceRecovery';
import { Layout } from '../components/Layout';
import { ExerciseEditor } from '../components/manage/ExerciseEditor';
import { PrivacyPolicyModal } from '../components/manage/PrivacyPolicyModal';
import { SessionView, areAllProgrammedSetsDone, getSessionSetCounts } from '../components/SessionView';
import { ActiveSessionProvider } from '../context/ActiveSessionContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import * as useDashboardDataModule from '../hooks/useDashboardData';
import * as useAnalyticsDataModule from '../hooks/useAnalyticsData';
import * as useFitnessDerivedDataModule from '../hooks/useFitnessDerivedData';
import {
  CHART_THEME,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  SEMANTIC_COLORS,
  DURATION,
  SPACING,
  GAP,
  STACK_SPACING,
  TYPOGRAPHY,
} from '../styles/tokens';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
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

let mockReducedMotion = false;
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    useReducedMotion: () => mockReducedMotion,
  };
});

// Deterministic ResponsiveContainer mock so Recharts SVG children render in JSDOM
// Respects optional global mock width so narrow/wide responsive tests work cleanly.
let mockChartWidth = 320;
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="recharts-responsive-mock" style={{ width: mockChartWidth, height: 240 }}>
        {React.cloneElement(children, { width: mockChartWidth, height: 240 } as any)}
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

function createAnalyticsFixture(overrides: {
  active1RMTrend?: Array<{ date: string; displayDate: string; epley1RM: number; setDetail: string }>;
  muscleChartData?: Array<{ category: string; value: number; formattedVal: string }>;
  workoutPieData?: Array<{ name: string; value: number; color: string; type: string }>;
  heatmapDays?: Date[];
  logVolMap?: Record<string, number>;
  maxDayVol?: number;
  monthStart?: Date;
  heatmapSummary?: {
    activeDaysCount: number;
    missedPastCoreDays: number;
    completedScheduled: number;
    evaluatedScheduledWorkouts: number;
    adherencePct: number;
  };
} = {}) {
  const idx = buildFitnessIndex({});
  return {
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
      active1RMTrend: overrides.active1RMTrend ?? [
        { date: '2026-10-10', displayDate: 'Oct 10', epley1RM: 110, setDetail: '95kg × 5' },
        { date: '2026-10-18', displayDate: 'Oct 18', epley1RM: 115, setDetail: '100kg × 5' },
        { date: '2026-10-25', displayDate: 'Oct 25', epley1RM: 120, setDetail: '105kg × 5' },
      ],
    },
    heatmapData: {
      days: overrides.heatmapDays ?? [],
      logVolMap: overrides.logVolMap ?? {},
      dayDetailMap: {},
      maxDayVol: overrides.maxDayVol ?? 0,
      monthStart: overrides.monthStart ?? new Date('2026-10-01T12:00:00Z'),
      summary: overrides.heatmapSummary ?? {
        activeDaysCount: 5,
        missedPastCoreDays: 0,
        completedScheduled: 5,
        evaluatedScheduledWorkouts: 5,
        adherencePct: 100,
      },
    },
    muscleChartData: overrides.muscleChartData ?? [],
    workoutPieData: overrides.workoutPieData ?? [],
    insightsList: ['Consistent progression.'],
    getCycleDayForDate: () => 1,
    index: idx,
  } as any;
}

describe('Targeted UI Refinement Regression Suite', () => {
  const rootDir = process.cwd();
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChartWidth = 320;
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

  describe('1. Shared Primitive Defaults, Spacing, Typography & Semantic States', () => {
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

    it('enforces 4px-aligned spacing tokens, shared chart defaults, and removes unused emeraldLight', () => {
      expect(SPACING.compact).toBe('py-2 px-3');
      expect(GAP.xs).toBe('gap-2');
      expect(GAP.sm).toBe('gap-3');
      expect(STACK_SPACING.xs).toBe('space-y-2');
      expect(STACK_SPACING.sm).toBe('space-y-3');

      expect((CHART_THEME as Record<string, unknown>).emeraldLight).toBeUndefined();
      expect(CHART_GRID_PROPS.stroke).toBe(CHART_THEME.grid);
      expect(CHART_GRID_PROPS.strokeDasharray).toBe('3 3');
      expect(CHART_AXIS_PROPS.stroke).toBe(CHART_THEME.axisText);
      expect(CHART_AXIS_PROPS.fontSize).toBe(10);
      expect(CHART_AXIS_PROPS.tickLine).toBe(false);
      expect(CHART_AXIS_PROPS.axisLine).toBe(false);
    });

    it('uses readable 12px normal-case bodySecondary typography for EmptyState default and hero descriptions', () => {
      act(() => {
        root.render(
          <>
            <EmptyState
              size="default"
              title="No Data"
              description="Default empty description should be comfortable to read."
            />
            <EmptyState
              size="hero"
              title="Hero Empty"
              description="Hero empty description should also use bodySecondary."
            />
          </>
        );
      });

      const paragraphs = Array.from(container.querySelectorAll('p')).filter((p) =>
        p.textContent?.includes('description')
      );
      expect(paragraphs).toHaveLength(2);
      paragraphs.forEach((p) => {
        expect(p.className).toContain('text-xs');
        expect(p.className).not.toContain('uppercase');
        expect(p.className).not.toContain('text-[10px]');
      });
      expect(TYPOGRAPHY.bodySecondary).toContain('text-xs');
    });

    it('keeps Layout mobile active nav label opacity transition at 150ms with reduced-motion guard and zero layout/scale animation', () => {
      const layoutSrc = fs.readFileSync(path.join(rootDir, 'src/components/Layout.tsx'), 'utf8');
      expect(layoutSrc).toContain('TRANSITION.opacity');
      expect(layoutSrc).toContain('DURATION.fast / 1000');
      expect(layoutSrc).not.toContain('layoutId=');
      expect(layoutSrc).not.toContain('width: 0');
    });
  });

  describe('2. ProgressBar & ToggleChip UI Primitives', () => {
    it('renders ProgressBar with accessible progressbar role, 0-100 visual clamping, and semantic or custom colors', () => {
      act(() => {
        root.render(
          <>
            <ProgressBar value={150} max={100} aria-label="Over max progress" color="emerald" />
            <ProgressBar value={-25} max={100} aria-label="Under min progress" color="orange" />
            <ProgressBar value={2} max={100} minVisiblePercent={5} aria-label="Sliver progress" colorOverride={WORKOUT_COLORS.pull} />
          </>
        );
      });

      const bars = Array.from(container.querySelectorAll('[role="progressbar"]')) as HTMLElement[];
      expect(bars).toHaveLength(3);

      // Over max clamped to 100
      expect(bars[0].getAttribute('aria-valuemin')).toBe('0');
      expect(bars[0].getAttribute('aria-valuemax')).toBe('100');
      expect(bars[0].getAttribute('aria-valuenow')).toBe('100');
      expect((bars[0].firstElementChild as HTMLElement)?.style.width).toBe('100%');

      // Under min clamped to 0 (no inner fill bar)
      expect(bars[1].getAttribute('aria-valuenow')).toBe('0');
      expect(bars[1].firstElementChild).toBeNull();

      // Custom workout color + minVisiblePercent
      expect(bars[2].getAttribute('aria-valuenow')).toBe('2');
      const fill2 = bars[2].firstElementChild as HTMLElement;
      expect(fill2.style.width).toBe('5%');
      expect(fill2.style.backgroundColor).toBeTruthy();
    });

    it('renders MuscleBalanceRecovery progress meters using canonical ProgressBar primitive', () => {
      const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);
      const idx = buildFitnessIndex(
        [
          {
            id: 'l1',
            workoutId: 'push-a',
            date: '2026-10-15',
            complete: true,
            durationMinutes: 40,
            sets: { e1: [{ id: 's1', weight: '100', reps: '5', done: true }] },
          },
        ],
        defsMap,
        '2026-10-16'
      );

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        index: idx,
        currentDate: new Date('2026-10-16T12:00:00Z'),
      } as any);

      act(() => {
        root.render(
          <MuscleBalanceRecovery
            startDate="2026-10-01"
            endDate="2026-10-16"
            timeRangeLabel="Oct 1 – Oct 16"
            referenceDate="2026-10-16"
          />
        );
      });

      const bars = container.querySelectorAll('[role="progressbar"]');
      expect(bars.length).toBeGreaterThan(0);
    });

    it('renders ToggleChip with aria-pressed, keyboard operability, 44px mobile touch target, and orange/amber variants', () => {
      const onToggleA = vi.fn();
      const onToggleB = vi.fn();
      act(() => {
        root.render(
          <>
            <ToggleChip selected={true} color="orange" onClick={onToggleA}>
              ★ Priority Item
            </ToggleChip>
            <ToggleChip selected={false} color="amber" onClick={onToggleB}>
              + Mark Daily
            </ToggleChip>
          </>
        );
      });

      const chips = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
      expect(chips).toHaveLength(2);
      expect(chips[0].getAttribute('type')).toBe('button');
      expect(chips[0].getAttribute('aria-pressed')).toBe('true');
      expect(chips[0].className).toContain('bg-orange-500/15');
      expect(chips[0].className).toContain('min-h-[44px]');
      expect(chips[0].className).toContain('focus-visible:ring-2');

      expect(chips[1].getAttribute('aria-pressed')).toBe('false');
      expect(chips[1].className).toContain('border-zinc-800');

      act(() => {
        chips[0].click();
        chips[1].click();
      });
      expect(onToggleA).toHaveBeenCalledTimes(1);
      expect(onToggleB).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Calendar Selection & Today Semantics & Important State Badges', () => {
    const calWorkouts: Workout[] = [
      { id: 'wo-push', name: 'Push Protocol', badge: 'PUSH', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
    ];
    const calWorkoutMap = new Map(calWorkouts.map((w) => [w.id, w]));
    const calCoreMap = new Map(calWorkouts.map((w) => [w.cycleDay, w]));
    const calLogsMap = new Map<string, any[]>([
      ['2026-10-15', [{ id: 'log-today', workoutId: 'wo-push', date: '2026-10-15', complete: true, sets: { 'ex-1': [{ weight: '100', reps: '5', done: true }] }, durationMinutes: 45 }]],
    ]);

    it('uses brand orange/neutral styling for selected & today dates, emerald for completed state, and size="md" on TODAY', () => {
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
      expect(todayBtn.className).toContain('border-zinc-500');

      const todayNumBadge = todayBtn.querySelector('span.rounded-full') as HTMLElement;
      expect(todayNumBadge.className).toContain('text-orange-400');

      act(() => {
        todayBtn.click();
      });

      expect(todayBtn.className).toContain('border-orange-500/70');
      expect(todayBtn.className).toContain('ring-orange-500/40');

      const badges = Array.from(container.querySelectorAll('div')).filter((el) =>
        el.textContent === 'TODAY' || el.textContent === 'COMPLETED SESSION'
      );
      const todayTag = badges.find((el) => el.textContent === 'TODAY' && el.style.color);
      const completedTag = badges.find((el) => el.textContent === 'COMPLETED SESSION' && el.style.color);
      expect(todayTag?.style.color).not.toContain('16, 185, 129');
      expect(todayTag?.className).toContain('text-[10px]'); // size="md"
      expect(completedTag?.style.color).toContain('16, 185, 129');
      expect(completedTag?.className).toContain('text-[10px]'); // size="md"
    });
  });

  describe('4. Complete Chart System Coverage (Analytics, History, Dashboard)', () => {
    it('renders Analytics Estimated 1RM AreaChart with unique useId() gradient, indigo trend, accessible label, dense points, and empty state', () => {
      const mockFitness = createMockFitnessContext();
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 3, longestStreak: 5 },
        adherenceInsight: { percent: 85, completedScheduled: 6, evaluatedScheduledWorkouts: 7, pendingScheduledWorkouts: 0 },
        performanceScore: { score: 88, status: 'Strong' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      const dense1RM = Array.from({ length: 24 }, (_, idx) => ({
        date: `2026-10-${String(idx + 1).padStart(2, '0')}`,
        displayDate: `Oct ${idx + 1}`,
        epley1RM: 100 + idx,
        setDetail: `${85 + idx}kg × 5`,
      }));

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({ active1RMTrend: dense1RM })
      );

      // Render two instances side-by-side to prove React useId() emits distinct SVG gradient IDs
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const gradients = Array.from(container.querySelectorAll('linearGradient[id^="e1rmAreaFill-"]'));
      expect(gradients).toHaveLength(2);
      const id0 = gradients[0].getAttribute('id')!;
      const id1 = gradients[1].getAttribute('id')!;
      expect(id0).not.toBe(id1);

      const areaPaths = Array.from(container.querySelectorAll('.recharts-area-curve'));
      expect(areaPaths[0]?.getAttribute('stroke')).toBe(CHART_THEME.indigo);
      const areaFills = Array.from(container.querySelectorAll('.recharts-area-area'));
      expect(areaFills[0]?.getAttribute('fill')).toBe(`url(#${id0})`);

      const e1rmChartWrapper = container.querySelector('[role="img"][aria-label*="Estimated 1RM progression chart"]');
      expect(e1rmChartWrapper?.getAttribute('aria-label')).toContain('Barbell Bench Press');
      expect(e1rmChartWrapper?.getAttribute('aria-label')).toContain('24 sessions');

      // Empty E1RM state
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({ active1RMTrend: [] })
      );
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });
      expect(container.textContent).toContain('No lift progression data');
    });

    it('renders Muscle distribution horizontal bars with emerald fill, long-name handling at narrow width, and empty state', () => {
      const mockFitness = createMockFitnessContext();
      mockChartWidth = 280; // narrow mobile container width
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 2, longestStreak: 4 },
        adherenceInsight: { percent: 90, completedScheduled: 9, evaluatedScheduledWorkouts: 10, pendingScheduledWorkouts: 0 },
        performanceScore: { score: 84, status: 'Strong' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({
          muscleChartData: [
            { category: 'Posterior Deltoids & Traps', value: 4200, formattedVal: '4,200 kg' },
            { category: 'Chest', value: 3800, formattedVal: '3,800 kg' },
            { category: 'Quadriceps & Vastus', value: 3100, formattedVal: '3,100 kg' },
          ],
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const barWrapper = container.querySelector('[role="img"][aria-label*="Muscle group targeting bar chart"]');
      expect(barWrapper).toBeTruthy();

      const rects = Array.from(container.querySelectorAll('.recharts-bar-rectangle path'));
      expect(rects.length).toBe(3);
      rects.forEach((rect) => {
        expect(rect.getAttribute('fill')).toBe(CHART_THEME.emerald);
      });

      // Long category name truncated gracefully on Y-axis so bars still have room at narrow widths
      const tickTexts = Array.from(container.querySelectorAll('.recharts-cartesian-axis-tick-value'))
        .map((n) => n.textContent || '');
      expect(tickTexts.some((t) => t.endsWith('…'))).toBe(true);

      // Empty muscle chart state
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({ muscleChartData: [] })
      );
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });
      expect(container.textContent).toContain('No muscle targeting data');
    });

    it('renders Routine distribution pie with WORKOUT_COLORS mapping, accessible label, and empty state', () => {
      const mockFitness = createMockFitnessContext();
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 2, longestStreak: 4 },
        adherenceInsight: { percent: 90, completedScheduled: 9, evaluatedScheduledWorkouts: 10, pendingScheduledWorkouts: 0 },
        performanceScore: { score: 84, status: 'Strong' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({
          workoutPieData: [
            { name: 'Push', value: 4, color: WORKOUT_COLORS.push, type: 'push' },
            { name: 'Pull', value: 3, color: WORKOUT_COLORS.pull, type: 'pull' },
            { name: 'Lower', value: 2, color: WORKOUT_COLORS.lower, type: 'lower' },
          ],
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const pieWrapper = container.querySelector('[role="img"][aria-label*="Routine distribution pie chart"]');
      expect(pieWrapper).toBeTruthy();

      const sectors = Array.from(container.querySelectorAll('.recharts-pie-sector path'));
      expect(sectors).toHaveLength(3);
      const sectorFills = sectors.map((s) => s.getAttribute('fill'));
      expect(sectorFills).toContain(WORKOUT_COLORS.push);
      expect(sectorFills).toContain(WORKOUT_COLORS.pull);
      expect(sectorFills).toContain(WORKOUT_COLORS.lower);

      // Empty pie state
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({ workoutPieData: [] })
      );
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });
      expect(container.textContent).toContain('No session data in range');
    });

    it('renders Monthly Intensity Heatmap across all 5 emerald intensity tiers with accessible region label', () => {
      const mockFitness = createMockFitnessContext();
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 4, longestStreak: 6 },
        adherenceInsight: { percent: 90, completedScheduled: 9, evaluatedScheduledWorkouts: 10, pendingScheduledWorkouts: 0 },
        performanceScore: { score: 88, status: 'Strong' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      const days = [1, 2, 3, 4, 5].map((d) => new Date(`2026-10-0${d}T12:00:00Z`));
      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(
        createAnalyticsFixture({
          heatmapDays: days,
          logVolMap: {
            '2026-10-01': 0,     // level 0
            '2026-10-02': 1000,  // level 1 (0.1)
            '2026-10-03': 3000,  // level 2 (0.3)
            '2026-10-04': 6000,  // level 3 (0.6)
            '2026-10-05': 10000, // level 4 (1.0)
          },
          maxDayVol: 10000,
        })
      );

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      const heatmapRegion = container.querySelector('[role="region"][aria-label*="Monthly volume intensity heatmap"]');
      expect(heatmapRegion).toBeTruthy();
      expect(heatmapRegion?.innerHTML).toContain('bg-zinc-900/60');
      expect(heatmapRegion?.innerHTML).toContain('bg-emerald-500/20');
      expect(heatmapRegion?.innerHTML).toContain('bg-emerald-500/45');
      expect(heatmapRegion?.innerHTML).toContain('bg-emerald-500/75');
      expect(heatmapRegion?.innerHTML).toContain('bg-emerald-500 ');
    });

    it('renders HistoryView progression LineChart via lazy HistoryProgressionChart with shared ChartTooltip, indigo trend, 10px axes, and accessible label', async () => {
      const historySrc = fs.readFileSync(path.join(rootDir, 'src/components/HistoryView.tsx'), 'utf8');
      expect(historySrc).not.toContain("from 'recharts'");
      expect(historySrc).toContain('HistoryProgressionChart');

      const chartSrc = fs.readFileSync(path.join(rootDir, 'src/components/HistoryProgressionChart.tsx'), 'utf8');
      expect(chartSrc).toContain('<ChartTooltip>');
      expect(chartSrc).not.toContain('contentStyle={{');
      expect(chartSrc).toContain('CHART_GRID_PROPS');
      expect(chartSrc).toContain('CHART_AXIS_PROPS');
      expect(chartSrc).not.toContain('fontSize={9}');
      expect(chartSrc).toContain('interval="preserveStartEnd"');
      expect(chartSrc).toContain('CHART_THEME.indigo');

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

      const sessionToggle = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-controls')?.startsWith('history-session-panel-')
      );
      expect(sessionToggle).toBeTruthy();
      act(() => {
        sessionToggle!.click();
      });

      // Progression chart is not mounted until the exercise panel is expanded
      expect(container.querySelector('.recharts-line-curve')).toBeNull();

      const exToggle = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-controls')?.startsWith('history-ex-panel-')
      );
      expect(exToggle).toBeTruthy();
      await act(async () => {
        exToggle!.click();
        await import('../components/HistoryProgressionChart');
        await Promise.resolve();
      });

      const lineCurve = container.querySelector('.recharts-line-curve');
      expect(lineCurve?.getAttribute('stroke')).toBe(CHART_THEME.indigo);

      const lineChartWrapper = container.querySelector('[role="img"][aria-label*="Weight progression line chart"]');
      expect(lineChartWrapper).toBeTruthy();
    });

    it('renders Dashboard Body Weight sparkline as neutral zinc with orange latest marker, thinned dense markers, and size="md" active badge', () => {
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

      // Verify TRAINING DAY state badge uses size="md" (10px)
      const trainingBadge = Array.from(container.querySelectorAll('div')).find((el) =>
        el.textContent === 'TRAINING DAY' && el.style.color
      );
      expect(trainingBadge?.className).toContain('text-[10px]');

      const markers = Array.from(container.querySelectorAll('[data-testid="bodyweight-marker"]')) as HTMLElement[];
      expect(markers.length).toBeLessThanOrEqual(6);
      expect(parseFloat(markers[0].style.left)).toBeCloseTo(0, 5);
      expect(parseFloat(markers[markers.length - 1].style.left)).toBeCloseTo(100, 5);

      // Earlier markers neutral zinc; only latest marker orange
      expect(markers[0].className).toContain('bg-zinc-400');
      expect(markers[markers.length - 1].className).toContain('bg-orange-500');
      expect(markers[markers.length - 1].getAttribute('data-latest')).toBe('true');

      const polyline = container.querySelector('[aria-label*="Body weight trend"] polyline');
      expect(polyline?.getAttribute('stroke')).toBe(SEMANTIC_COLORS.zinc);
      expect(polyline?.getAttribute('points')?.trim().split(/\s+/).length).toBe(12);
    });
  });

  describe('5. SessionView Feedback & Public Assets Cleanliness', () => {
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

  describe('6. Post-Audit UI Clarity, Hierarchy & Accessibility Regressions', () => {
    it('renders AnalyticsView Adherence Rate and Average Training Gap unavailable states cleanly when baseline data is missing', () => {
      const mockFitness = createMockFitnessContext();
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 0, longestStreak: 0 },
        adherenceInsight: { percent: 100, completedScheduled: 0, evaluatedScheduledWorkouts: 0, pendingScheduledWorkouts: 1 },
        performanceScore: { score: null, status: 'Building baseline' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      const baseFixture = createAnalyticsFixture({
        heatmapDays: [new Date('2026-10-01T12:00:00Z')],
        logVolMap: { '2026-10-01': 1200 },
        maxDayVol: 1200,
      });
      baseFixture.aggregated.totalLogsCount = 1;
      baseFixture.aggregated.avgGapDays = 0;

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockReturnValue(baseFixture);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView />
          </FitnessContext.Provider>
        );
      });

      expect(container.textContent).toContain('Complete 1 scheduled workout');
      expect(container.textContent).toContain('Need 2+ sessions');
      expect(container.textContent).toContain('01 · Training Activity & Consistency');
      expect(container.textContent).toContain('Daily Training Volume');
      expect(container.textContent).toContain('Daily completed training volume by date (kg).');

      // Training Cadence now lives under 04 · Training Patterns & Insights (after section 03)
      const analyticsText = container.textContent || '';
      expect(analyticsText.indexOf('04 · Training Patterns & Insights')).toBeGreaterThan(-1);
      expect(analyticsText.indexOf('Training Cadence')).toBeGreaterThan(
        analyticsText.indexOf('04 · Training Patterns & Insights')
      );

      const heatmapCell = container.querySelector('[role="region"][aria-label*="Monthly volume intensity heatmap"] [aria-label*="2026-10-01"]');
      expect(heatmapCell).toBeTruthy();
    });

    it('derives AnalyticsView Monthly Intensity Heatmap summary & aria-label from displayed month rather than global timeRange', () => {
      const mockFitness = createMockFitnessContext();
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        trainingStreak: { currentStreak: 2, longestStreak: 4 },
        adherenceInsight: { percent: 80, completedScheduled: 4, evaluatedScheduledWorkouts: 5, pendingScheduledWorkouts: 0 },
        performanceScore: { score: 85, status: 'Strong' },
        currentDate: new Date('2026-10-26T12:00:00Z'),
        todayStr: '2026-10-26',
        index: buildFitnessIndex({}),
      } as any);

      vi.spyOn(useAnalyticsDataModule, 'useAnalyticsData').mockImplementation(({ currentHeatmapMonth }) => {
        const monthKey = currentHeatmapMonth.getMonth(); // Oct = 9, Nov = 10, Sep = 8
        const isNovFuture = monthKey === 10;
        const summary = isNovFuture
          ? { activeDaysCount: 0, missedPastCoreDays: 0, completedScheduled: 0, evaluatedScheduledWorkouts: 0, adherencePct: 0 }
          : monthKey === 8
          ? { activeDaysCount: 9, missedPastCoreDays: 1, completedScheduled: 9, evaluatedScheduledWorkouts: 10, adherencePct: 90 }
          : { activeDaysCount: 4, missedPastCoreDays: 2, completedScheduled: 4, evaluatedScheduledWorkouts: 6, adherencePct: 67 };

        const fixture = createAnalyticsFixture({
          monthStart: new Date(currentHeatmapMonth.getFullYear(), currentHeatmapMonth.getMonth(), 1),
          heatmapSummary: summary,
        });
        // Set conflicting global aggregated stats to ensure footer ignores global timeRange
        fixture.aggregated.activeDaysCount = 99;
        fixture.aggregated.missedPastCoreDays = 88;
        fixture.aggregated.adherencePct = 11;
        return fixture;
      });

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <AnalyticsView savedState={{ timeRange: '30d', muscleMetric: 'volume', selected1RMExerciseId: null, currentHeatmapMonth: new Date('2026-10-15T12:00:00Z') }} />
          </FitnessContext.Provider>
        );
      });

      const heatmapSection = Array.from(container.querySelectorAll('h2, h3'))
        .find((h) => h.textContent?.trim() === 'Monthly Intensity Heatmap')
        ?.closest('.rounded-2xl') as HTMLElement;
      expect(heatmapSection).toBeTruthy();
      expect(heatmapSection.textContent).toContain('4 Active Days · 2 Skipped · 67% Adherence');
      expect(heatmapSection.textContent).not.toContain('99 Active Days');
      expect(
        heatmapSection.querySelector('[role="region"]')?.getAttribute('aria-label')
      ).toContain('4 active days');

      // Switch global timeRange to ALL -> monthly heatmap footer stays locked to October counts
      const allBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'ALL')!;
      act(() => {
        allBtn.click();
      });
      expect(heatmapSection.textContent).toContain('4 Active Days · 2 Skipped · 67% Adherence');

      // Navigate to September (previous month) -> reflects September summary
      const prevBtn = container.querySelector('button[aria-label="Previous Month"]') as HTMLButtonElement;
      act(() => {
        prevBtn.click();
      });
      expect(heatmapSection.textContent).toContain('9 Active Days · 1 Skipped · 90% Adherence');

      // Navigate forward twice to November (future month) -> shows unavailable — Adherence
      const nextBtn = container.querySelector('button[aria-label="Next Month"]') as HTMLButtonElement;
      act(() => {
        nextBtn.click();
      });
      act(() => {
        nextBtn.click();
      });
      expect(heatmapSection.textContent).toContain('0 Active Days · 0 Skipped · — Adherence');
    });

    it('orders Monthly Training Analytics & compact latest-month preview before Training Sessions, supports report expand/select/close & saved tab state, hides panel when empty, distinguishes empty vs search-empty states, and binds verification checkbox label', async () => {
      // 1. Empty state: no monthly summaries -> must NOT render an empty analytics panel
      const mockFitnessEmpty = createMockFitnessContext({ logs: {} });
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        sortedLogs: [],
        workoutMap: new Map(INITIAL_WORKOUTS.map((w) => [w.id, w])),
        index: buildFitnessIndex({}),
        prEvents: [],
        getStrengthTrendForRange: () => ({ percentChange: null, comparableExercises: 0, confidence: 'low', currentValue: 0, previousValue: 0, exerciseBreakdown: [] }),
        getVolumeForRange: () => 0,
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitnessEmpty}>
            <ConfirmProvider>
              <HistoryView />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });
      expect(container.textContent).toContain('No Workouts Logged Yet');
      expect(container.textContent).not.toContain('Monthly Training Analytics');
      expect(container.querySelector('[data-testid="latest-month-preview"]')).toBeNull();

      // 2. Populated multi-month logs (Sep 2026 & Oct 2026, passed unsorted by date)
      const multiMonthLogs = [
        {
          id: 'l-sep',
          workoutId: 'push-a',
          date: '2026-09-12',
          complete: true,
          durationMinutes: 45,
          sets: { e1: [{ id: 's-sep', weight: '80', reps: '5', done: true }] },
        },
        {
          id: 'l-oct-1',
          workoutId: 'push-a',
          date: '2026-10-10',
          complete: true,
          durationMinutes: 40,
          sets: { e1: [{ id: 's-oct-1', weight: '100', reps: '5', done: true }] },
        },
        {
          id: 'l-oct-2',
          workoutId: 'pull-a',
          date: '2026-10-14',
          complete: true,
          durationMinutes: 50,
          sets: { e7: [{ id: 's-oct-2', weight: '90', reps: '10', done: true }] },
        },
      ];
      const mockFitnessWithLogs = createMockFitnessContext({
        logs: Object.fromEntries(multiMonthLogs.map((l) => [l.id, l])),
      });
      const idx = buildFitnessIndex(mockFitnessWithLogs.logs);
      const prEventsFixture = [
        { id: 'pr-1', exerciseDefinitionId: 'e1', exerciseName: 'Incline DB Press', date: '2026-10-10', monthKey: '2026-10', weight: 100, reps: 5, e1rm: 116.7, isWeightPR: true, isE1RMPR: true },
        { id: 'pr-2', exerciseDefinitionId: 'e7', exerciseName: 'Lat Pulldown', date: '2026-10-14', monthKey: '2026-10', weight: 90, reps: 10, e1rm: 120, isWeightPR: true, isE1RMPR: true },
        { id: 'pr-sep', exerciseDefinitionId: 'e1', exerciseName: 'Incline DB Press', date: '2026-09-12', monthKey: '2026-09', weight: 80, reps: 5, e1rm: 93.3, isWeightPR: true, isE1RMPR: true },
      ];
      const onSaveState = vi.fn();

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        sortedLogs: multiMonthLogs,
        workoutMap: new Map(INITIAL_WORKOUTS.map((w) => [w.id, w])),
        index: idx,
        prEvents: prEventsFixture,
        getStrengthTrendForRange: () => ({ percentChange: 12.5, comparableExercises: 1, confidence: 'low', currentValue: 116.7, previousValue: 93.3, exerciseBreakdown: [] }),
        getVolumeForRange: (start: string) => (start.startsWith('2026-10') ? 1400 : 400),
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitnessWithLogs}>
            <ConfirmProvider>
              <HistoryView onSaveState={onSaveState} />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const html = container.innerHTML;
      expect(html.indexOf('Monthly Training Analytics')).toBeLessThan(html.indexOf('Training Sessions'));
      expect(html.indexOf('data-testid="latest-month-preview"')).toBeLessThan(html.indexOf('Training Sessions'));

      const preview = container.querySelector('[data-testid="latest-month-preview"]') as HTMLElement;
      expect(preview).toBeTruthy();
      expect(preview.textContent).toContain('October 2026');
      expect(preview.textContent).toContain('2');
      expect(preview.textContent).toContain('1.4k');
      expect(preview.textContent).toContain('kg');

      const reportsToggle = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Monthly Reports')
      ) as HTMLButtonElement;
      expect(reportsToggle).toBeTruthy();
      expect(reportsToggle.getAttribute('aria-expanded')).toBe('false');

      // Open Monthly Reports, select September, verify details, Close Report
      act(() => {
        reportsToggle.click();
      });
      expect(reportsToggle.getAttribute('aria-expanded')).toBe('true');

      const sepCard = Array.from(container.querySelectorAll('[aria-pressed]')).find((el) =>
        el.textContent?.includes('2026-09')
      ) as HTMLElement;
      expect(sepCard).toBeTruthy();
      act(() => {
        sepCard.click();
      });
      expect(sepCard.getAttribute('aria-pressed')).toBe('true');
      expect(container.textContent).toContain('Window Volume');
      expect(container.textContent).toContain('400');

      const closeReportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim() === 'Close Report'
      ) as HTMLButtonElement;
      expect(closeReportBtn).toBeTruthy();
      await act(async () => {
        closeReportBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
      expect(sepCard.getAttribute('aria-pressed')).toBe('false');
      expect(container.textContent).not.toContain('Window Volume');

      // Restore savedState with preselected month tab -> remounts cleanly like switching back to History tab
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitnessWithLogs}>
            <ConfirmProvider>
              <HistoryView
                key="restored-history-tab"
                savedState={{ search: '', expandedDate: null, selectedExKey: null, activeMonthTab: '2026-10' }}
                onSaveState={onSaveState}
              />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });
      expect(container.textContent).toContain('Hide Monthly Reports');
      expect(container.textContent).toContain('Window Volume');

      // Open editor and check verification checkbox htmlFor -> id binding
      const editBtn = container.querySelector('button[aria-label="Edit session logs"]') as HTMLButtonElement;
      act(() => {
        editBtn.click();
      });
      const verifyInput = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const verifyLabel = verifyInput?.closest('label');
      expect(verifyInput?.id).toBeTruthy();
      expect(verifyLabel?.getAttribute('for')).toBe(verifyInput?.id);

      // Filter search placeholder uses accessible phrasing and distinguishes empty search state & Clear Filters action
      const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
      expect(searchInput.getAttribute('placeholder')).toBe('Search date, routine or exercise…');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      act(() => {
        nativeSetter?.call(searchInput, 'zzzznonexistent');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.textContent).toContain('No Matching Sessions');
      const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Clear Filters')
      ) as HTMLButtonElement;
      expect(clearBtn).toBeTruthy();
      act(() => {
        clearBtn.click();
      });
      expect(container.textContent).not.toContain('No Matching Sessions');
    });

    it('renders complete non-color status glyphs across past/today/future cells and separates Status vs Routines legends', () => {
      const calWorkouts: Workout[] = [
        { id: 'wo-push', name: 'Push A', badge: 'PUSH A', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
        { id: 'wo-rest', name: 'Rest Day', badge: 'REST', type: 'rest', isCore: true, cycleDay: 2, exercises: [] },
      ];
      const calWorkoutMap = new Map(calWorkouts.map((w) => [w.id, w]));
      const calCoreMap = new Map(calWorkouts.map((w) => [w.cycleDay, w]));
      const calLogsMap = new Map<string, any[]>([
        ['2026-10-10', [{ id: 'l1', workoutId: 'wo-push', date: '2026-10-10', complete: true, sets: {}, durationMinutes: 40 }]],
        ['2026-10-11', [{ id: 'l2', workoutId: 'wo-push', date: '2026-10-11', complete: false, sets: {}, durationMinutes: 15 }]],
      ]);

      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        currentDate: new Date('2026-10-15T12:00:00Z'),
        todayStr: '2026-10-15',
        index: {
          logsByDate: calLogsMap,
          volumeByDate: {},
          completedSetsByDate: {},
          plannedSetsByDate: {},
        } as any,
        workoutMap: calWorkoutMap,
        coreWorkoutByCycleDayMap: calCoreMap,
        getCycleDayForDate: (d: Date) => {
          const dayNum = d.getDate();
          // 12: past missed push; 13: past rest; 15: today scheduled push; 16: future rest; 17: future scheduled push
          if (dayNum === 13 || dayNum === 16) return 2;
          if (dayNum === 18) return 99; // off-protocol day
          return 1;
        },
        resolveExerciseMeta: () => ({ name: 'Bench Press', target: 'Chest' }),
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={{ workouts: calWorkouts } as any}>
            <Calendar />
          </FitnessContext.Provider>
        );
      });

      const completedDay = container.querySelector('[data-testid="calendar-day-2026-10-10"]');
      const partialDay = container.querySelector('[data-testid="calendar-day-2026-10-11"]');
      const missedDay = container.querySelector('[data-testid="calendar-day-2026-10-12"]');
      const pastRestDay = container.querySelector('[data-testid="calendar-day-2026-10-13"]');
      const todayScheduledDay = container.querySelector('[data-testid="calendar-day-2026-10-15"]');
      const futureRestDay = container.querySelector('[data-testid="calendar-day-2026-10-16"]');
      const futureScheduledDay = container.querySelector('[data-testid="calendar-day-2026-10-17"]');
      const offProtocolDay = container.querySelector('[data-testid="calendar-day-2026-10-18"]');

      expect(completedDay?.textContent).toContain('✓');
      expect(partialDay?.textContent).toContain('◐');
      expect(missedDay?.textContent).toContain('!');
      expect(pastRestDay?.textContent).toContain('—');
      expect(todayScheduledDay?.textContent).toContain('·');
      expect(todayScheduledDay?.textContent).not.toContain('!');
      expect(futureRestDay?.textContent).toContain('—');
      expect(futureRestDay?.textContent).not.toContain('·');
      expect(futureScheduledDay?.textContent).toContain('·');
      expect(offProtocolDay?.querySelector('span[aria-hidden="true"]')?.textContent?.trim() || '').not.toMatch(/[✓◐!·—]/);

      const text = container.textContent || '';
      const statusIdx = text.indexOf('Status:');
      const routinesIdx = text.indexOf('Routines:');
      expect(statusIdx).toBeGreaterThan(-1);
      expect(routinesIdx).toBeGreaterThan(statusIdx);

      const statusLegendText = text.slice(statusIdx, routinesIdx);
      const routinesLegendText = text.slice(routinesIdx);

      expect(statusLegendText).toContain('✓ Completed');
      expect(statusLegendText).toContain('◐ Incomplete');
      expect(statusLegendText).toContain('! Missed');
      expect(statusLegendText).toContain('· Scheduled');
      expect(statusLegendText).toContain('— Rest');

      expect(routinesLegendText).not.toContain('Missed');
      expect(routinesLegendText).not.toContain('Incomplete');
    });

    it('shows scope banners, Unsaved Changes badge, inline validation, and single bottom Cancel/Save Changes actions in ExerciseEditor', () => {
      act(() => {
        root.render(
          <ExerciseEditor
            exercise={{
              id: 'bench-press',
              exerciseDefinitionId: 'bench-press',
              name: 'Barbell Bench Press',
              target: 'Chest',
              sets: 3,
              reps: '8',
            }}
            workout={{
              id: 'push-a',
              name: 'Push Protocol Alpha',
              badge: 'PUSH A',
              cycleDay: 1,
              type: 'push',
              exercises: [],
            } as any}
            onSave={vi.fn()}
            onCancel={vi.fn()}
          />
        );
      });

      expect(container.textContent).toContain('Workout-Specific Prescription');
      expect(container.textContent).not.toContain('Unsaved Changes');

      // Single Cancel and single primary Save Changes action (no duplicate top actions or "Save Exercise")
      const cancelButtonsProg = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === 'Cancel'
      );
      const saveButtonsProg = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === 'Save Changes'
      );
      expect(cancelButtonsProg).toHaveLength(1);
      expect(saveButtonsProg).toHaveLength(1);
      expect(container.textContent).not.toContain('Save Exercise');

      const defTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Exercise Definition')
      ) as HTMLButtonElement;
      act(() => {
        defTabBtn.click();
      });
      expect(container.textContent).toContain('Viewing Global Definition inside Push Protocol Alpha');
      expect(
        Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Save Changes')
      ).toHaveLength(1);

      const nameInput = container.querySelector('input[required]') as HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      act(() => {
        nativeSetter?.call(nameInput, '');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.textContent).toContain('Unsaved Changes');
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Exercise name is required.');
    });

    it('restores focus to status trigger when closing Layout cloud popover via Escape and preserves Finish text in SessionView', () => {
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

      const statusBtn = container.querySelector('button.group\\/sync') as HTMLButtonElement;
      act(() => {
        statusBtn.focus();
        statusBtn.click();
      });
      expect(container.querySelector('#cloud-status-popover')).toBeTruthy();

      const otherEl = document.createElement('button');
      container.appendChild(otherEl);
      act(() => {
        otherEl.focus();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(statusBtn.getAttribute('aria-expanded')).toBe('false');
      expect(statusBtn.hasAttribute('aria-controls')).toBe(false);
      expect(document.activeElement).toBe(statusBtn);

      const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        index: buildFitnessIndex([], defsMap),
        getLatestForExercise: () => null,
        getWeightPRForExercise: () => null,
        getE1RMPRForExercise: () => null,
        getHistoryForExercise: () => [],
      } as any);

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <SessionView workoutId={INITIAL_WORKOUTS[0].id} onExit={vi.fn()} />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const finishBtn = container.querySelector('button[aria-label="Finish Session"]') as HTMLButtonElement;
      expect(finishBtn).toBeTruthy();
      expect(finishBtn.textContent).toContain('Finish');
    });

    it('renders PrivacyPolicyModal explanatory paragraphs with legible bodySecondary scale rather than micro/caption uppercase', () => {
      act(() => {
        root.render(<PrivacyPolicyModal isOpen={true} onClose={vi.fn()} />);
      });

      const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).toBeTruthy();

      const expectedParagraphSnippets = [
        'GAINLOG is architected as an offline-first fitness protocol tracker.',
        'GAINLOG collects only the fitness and account data necessary',
        'When you request AI Coaching for an exercise,',
        'Cloud synchronization is powered by Google Firebase Firestore.',
        'You retain complete ownership over your data at all times:',
      ];

      const paragraphs = Array.from(dialog.querySelectorAll('p'));
      expectedParagraphSnippets.forEach((snippet) => {
        const match = paragraphs.find((p) => p.textContent?.includes(snippet));
        expect(match, `Missing paragraph containing "${snippet}"`).toBeTruthy();
        expect(match!.className).toContain('text-xs');
        expect(match!.className).not.toContain('text-[9px]');
        expect(match!.className).not.toContain('text-[10px]');
        expect(match!.className).not.toContain('uppercase');
      });
    });

    it('verifies SessionView Finish readiness states, manual extra sets, shorter-than-programmed set validation, one-time animation lifecycle, reduced-motion compliance, and completion persistence', async () => {
      vi.useFakeTimers();
      mockReducedMotion = false;
      window.localStorage.clear();

      const customWorkout: Workout = {
        id: 'wo-finish-test',
        name: 'Push Short Protocol',
        badge: 'DAY 1 · PUSH',
        type: 'push',
        cycleDay: 1,
        isCore: true,
        exercises: [
          { exerciseDefinitionId: 'e1', sets: 2, reps: '8', note: '' },
        ],
      };

      // Pure helper invariant checks: missing/shorter-than-programmed AND uncompleted manual extra sets must NOT count as complete
      expect(areAllProgrammedSetsDone(customWorkout, {})).toBe(false);
      expect(getSessionSetCounts(customWorkout, {})).toEqual({ completedSets: 0, targetSets: 2 });
      expect(
        areAllProgrammedSetsDone(customWorkout, {
          e1: [{ id: 'only-one', weight: '100', reps: '8', done: true }],
        })
      ).toBe(false);
      expect(
        getSessionSetCounts(customWorkout, {
          e1: [{ id: 'only-one', weight: '100', reps: '8', done: true }],
        })
      ).toEqual({ completedSets: 1, targetSets: 2 });
      expect(
        areAllProgrammedSetsDone(customWorkout, {
          e1: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '8', done: false },
          ],
        })
      ).toBe(false);
      expect(
        areAllProgrammedSetsDone(customWorkout, {
          e1: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '8', done: true },
          ],
        })
      ).toBe(true);
      expect(
        getSessionSetCounts(customWorkout, {
          e1: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '8', done: true },
            { id: 's3', weight: '100', reps: '8', done: false },
          ],
        })
      ).toEqual({ completedSets: 2, targetSets: 3 });
      expect(
        areAllProgrammedSetsDone(customWorkout, {
          e1: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '8', done: true },
            { id: 's3', weight: '100', reps: '8', done: false },
          ],
        })
      ).toBe(false);
      expect(
        areAllProgrammedSetsDone(customWorkout, {
          e1: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '8', done: true },
            { id: 's3', weight: '100', reps: '8', done: true },
          ],
        })
      ).toBe(true);
      expect(
        areAllProgrammedSetsDone({ ...customWorkout, exercises: [{ exerciseDefinitionId: 'e1', sets: 0, reps: '8' }] }, {})
      ).toBe(false);

      const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);
      vi.spyOn(useFitnessDerivedDataModule, 'useFitnessDerivedData').mockReturnValue({
        index: buildFitnessIndex([], defsMap),
        getLatestForExercise: () => null,
        getWeightPRForExercise: () => null,
        getE1RMPRForExercise: () => null,
        getHistoryForExercise: () => [],
      } as any);

      const addLog = vi.fn().mockResolvedValue({ success: true, localPersisted: true });
      const baseFitness = createMockFitnessContext({
        workouts: [customWorkout],
        addLog,
      });

      const renderSession = (fitnessOverride = baseFitness) => {
        act(() => {
          root.render(
            <FitnessContext.Provider value={fitnessOverride}>
              <ActiveSessionProvider>
                <ConfirmProvider>
                  <SessionView workoutId="wo-finish-test" onExit={vi.fn()} />
                </ConfirmProvider>
              </ActiveSessionProvider>
            </FitnessContext.Provider>
          );
        });
      };

      renderSession();

      // 1. Initially incomplete: restrained secondary styling, stays enabled, >=44px height, no glow ring
      let finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn).toBeTruthy();
      expect(finishBtn.disabled).toBe(false);
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('false');
      expect(finishBtn.getAttribute('data-finish-animating')).toBe('false');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('0');
      expect(finishBtn.className).not.toContain('bg-orange-500');
      expect(finishBtn.className).not.toContain('ring-1');
      expect(finishBtn.className).toContain('min-h-[44px]');
      expect(finishBtn.className).toContain('h-11');

      // 2. Complete first set only -> still incomplete
      let markDoneBtns = Array.from(
        container.querySelectorAll('button[aria-label="Mark set complete"]')
      ) as HTMLButtonElement[];
      expect(markDoneBtns).toHaveLength(2);
      const weightInputs = Array.from(container.querySelectorAll('input[aria-label$="weight"]')) as HTMLInputElement[];
      const repInputs = Array.from(container.querySelectorAll('input[aria-label$="reps"]')) as HTMLInputElement[];
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      act(() => {
        nativeSetter?.call(weightInputs[0], '100');
        weightInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter?.call(repInputs[0], '5');
        repInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter?.call(weightInputs[1], '100');
        weightInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        nativeSetter?.call(repInputs[1], '5');
        repInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => {
        markDoneBtns[0].click();
      });
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('false');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('0');

      // 3. Complete final programmed set -> promotes to primary orange + Check icon & triggers ONE animation
      markDoneBtns = Array.from(
        container.querySelectorAll('button[aria-label="Mark set complete"]')
      ) as HTMLButtonElement[];
      expect(markDoneBtns).toHaveLength(1);
      act(() => {
        markDoneBtns[0].click();
      });

      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animating')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('1');
      expect(finishBtn.className).toContain('bg-orange-500');
      expect(finishBtn.querySelector('svg')).toBeTruthy();

      // Advance past 520ms animation timeout -> stops animating, stays ready
      act(() => {
        vi.advanceTimersByTime(600);
      });
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animating')).toBe('false');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('1');

      // 4. Unrelated rerender while still complete -> does NOT restart animation
      renderSession({ ...baseFitness });
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-animating')).toBe('false');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('1');

      // 5. Unchecking a set clears ready state; re-completing triggers ONE new animation
      const uncheckBtns = Array.from(
        container.querySelectorAll('button[aria-label="Mark set incomplete"]')
      ) as HTMLButtonElement[];
      expect(uncheckBtns).toHaveLength(2);
      act(() => {
        uncheckBtns[1].click();
      });
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('false');
      expect(finishBtn.className).not.toContain('bg-orange-500');

      const recheckBtn = container.querySelector('button[aria-label="Mark set complete"]') as HTMLButtonElement;
      act(() => {
        recheckBtn.click();
      });
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animating')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('2');

      act(() => {
        vi.advanceTimersByTime(600);
      });

      // 5b. Adding a manual set updates sticky header & card denominator (2/3) and reverts Finish to incomplete; completing it promotes Finish back
      const addExtraSetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Additional Set')
      ) as HTMLButtonElement;
      expect(addExtraSetBtn).toBeTruthy();
      act(() => {
        addExtraSetBtn.click();
      });

      expect(container.textContent).toContain('2/3 SETS');
      expect(container.textContent).toContain('2/3 Done');
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.disabled).toBe(false);
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('false');
      expect(finishBtn.className).not.toContain('bg-orange-500');
      expect(addLog).not.toHaveBeenCalled();

      // Completing the manually added 3rd set promotes Finish to ready with count 3
      const thirdSetDoneBtn = container.querySelector('button[aria-label="Mark set complete"]') as HTMLButtonElement;
      expect(thirdSetDoneBtn).toBeTruthy();
      act(() => {
        thirdSetDoneBtn.click();
      });

      expect(container.textContent).toContain('3/3 SETS');
      expect(container.textContent).toContain('3/3 Done');
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('3');
      expect(finishBtn.className).toContain('bg-orange-500');
      expect(addLog).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(600);
      });

      // 5c. Deleting sets below ex.sets (from 3 -> 2 -> uncheck 1 -> delete down to 1 done row when ex.sets === 2) keeps Finish incomplete
      const allUncheckBtns = Array.from(
        container.querySelectorAll('button[aria-label="Mark set incomplete"]')
      ) as HTMLButtonElement[];
      act(() => {
        allUncheckBtns[2].click();
      });
      let deleteBtns = Array.from(
        container.querySelectorAll('button[aria-label="Delete this set"]')
      ) as HTMLButtonElement[];
      await act(async () => {
        deleteBtns[2].click();
      });
      const remainingUncheckBtns = Array.from(
        container.querySelectorAll('button[aria-label="Mark set incomplete"]')
      ) as HTMLButtonElement[];
      act(() => {
        remainingUncheckBtns[1].click();
      });
      deleteBtns = Array.from(
        container.querySelectorAll('button[aria-label="Delete this set"]')
      ) as HTMLButtonElement[];
      await act(async () => {
        deleteBtns[1].click();
      });
      expect(container.textContent).toContain('1/2 SETS');
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('false');
      expect(finishBtn.disabled).toBe(false);
      expect(addLog).not.toHaveBeenCalled();

      // 6. Reduced motion skips animation while preserving static ready styling
      mockReducedMotion = true;
      window.localStorage.clear();
      act(() => {
        root.unmount();
        root = createRoot(container);
      });
      renderSession();
      const rmMarks = Array.from(
        container.querySelectorAll('button[aria-label="Mark set complete"]')
      ) as HTMLButtonElement[];
      act(() => {
        rmMarks[0].click();
      });
      act(() => {
        (container.querySelector('button[aria-label="Mark set complete"]') as HTMLButtonElement).click();
      });
      finishBtn = container.querySelector('[data-testid="session-finish-button"]') as HTMLButtonElement;
      expect(finishBtn.getAttribute('data-finish-ready')).toBe('true');
      expect(finishBtn.getAttribute('data-finish-animating')).toBe('false');
      expect(finishBtn.getAttribute('data-finish-animation-count')).toBe('0');
      expect(finishBtn.className).toContain('bg-orange-500');

      // 7. Finishing persists via addLog & displays summary cleanly
      vi.useRealTimers();
      await act(async () => {
        finishBtn.click();
      });
      expect(addLog).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Session Cleared');

      mockReducedMotion = false;
      window.localStorage.clear();
    });
  });
});
