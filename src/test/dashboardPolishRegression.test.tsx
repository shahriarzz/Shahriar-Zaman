// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dashboard } from '../components/Dashboard';
import { Calendar } from '../components/Calendar';
import { ConfirmProvider } from '../context/ConfirmContext';
import * as useDashboardDataModule from '../hooks/useDashboardData';
import { Workout } from '../types/fitness';
import { FitnessContext } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';

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

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target: number) => target
}));

const mockWorkouts: Workout[] = [
  {
    id: 'wo-push',
    name: 'Chest & Triceps Heavy',
    type: 'push',
    badge: 'Push Focus',
    cycleDay: 1,
    isCore: true,
    exercises: [
      { exerciseDefinitionId: 'bench-press', sets: 4, reps: '6' }
    ]
  },
  {
    id: 'wo-rest',
    name: 'Programmed Recovery Day',
    type: 'rest',
    badge: 'DAY 8 · REST',
    cycleDay: 8,
    isCore: true,
    exercises: []
  }
];

function getMockDashboardData(isRest: boolean = false): useDashboardDataModule.DashboardData {
  return {
    heroDateStr: 'Sunday, November 1',
    stats: { totalWeight: 125000 },
    trainingStreak: {
      currentStreak: 4,
      longestStreak: 12,
      streakStartDate: '2026-10-26',
      streakEndDate: '2026-10-30'
    },
    trainingFrequency: {
      sessionsPerWeek: 4.2,
      completedSessions: 17,
      previousSessions: 15,
      change: 0.5,
      sessionsChange: 2
    },
    strengthTrend: {
      percentChange: 3.5,
      currentValue: 125,
      previousValue: 120.8,
      comparableExercises: 4,
      confidence: 'high',
      exerciseBreakdown: []
    },
    unfinishedSession: null,
    todayWorkout: isRest ? mockWorkouts[1] : mockWorkouts[0],
    currentCycleDay: isRest ? 8 : 1,
    hasWorkouts: true,
    workouts: mockWorkouts,
    weightSummary: {
      currentWeight: 78.5,
      weightEntries: [['2026-10-28', 78.2], ['2026-10-30', 78.5]],
      recentWeightLogs: [['2026-10-30', 78.5], ['2026-10-28', 78.2]],
      sparklineData: {
        weights: [78.2, 78.5],
        min: 78.2,
        max: 78.5,
        observedMin: 78.2,
        observedMax: 78.5,
        range: 0.3,
        w: 50,
        sorted: [['2026-10-28', 78.2], ['2026-10-30', 78.5]]
      },
      logWeight: vi.fn(),
      deleteWeight: vi.fn()
    },
    recentMilestones: {
      recentVolume: {
        volume: 18500,
        startDateStr: '2026-10-24',
        endDateStr: '2026-10-30',
        dateRangeLabel: 'Last 7 Days (Oct 24 – Oct 30)'
      },
      recentPREvents: [
        {
          id: 'pr-1',
          exerciseDefinitionId: 'bench-press',
          exerciseName: 'Barbell Bench Press',
          date: '2026-10-29',
          monthKey: '2026-10',
          weight: 120,
          reps: 5,
          e1rm: 139.5,
          isWeightPR: true,
          isE1RMPR: true
        },
        {
          id: 'pr-2',
          exerciseDefinitionId: 'incline-db',
          exerciseName: 'Incline Dumbbell Press',
          date: '2026-10-27',
          monthKey: '2026-10',
          weight: 42,
          reps: 8,
          e1rm: 53.2,
          isWeightPR: false,
          isE1RMPR: true
        },
        {
          id: 'pr-3',
          exerciseDefinitionId: 'dips',
          exerciseName: 'Weighted Chest Dips',
          date: '2026-10-25',
          monthKey: '2026-10',
          weight: 25,
          reps: 6,
          e1rm: 30.0,
          isWeightPR: true,
          isE1RMPR: false
        },
        {
          id: 'pr-4',
          exerciseDefinitionId: 'overhead-press',
          exerciseName: 'Standing Military Press',
          date: '2026-10-22',
          monthKey: '2026-10',
          weight: 70,
          reps: 5,
          e1rm: 81.4,
          isWeightPR: true,
          isE1RMPR: true
        }
      ]
    },
    isTodayCompleted: false,
    todayCompletedSummary: null,
    nextScheduledWorkout: null,
    adherence: {
      rate: 0.85,
      percent: 85,
      completedScheduled: 6,
      scheduledCoreWorkouts: 7,
      evaluatedScheduledWorkouts: 7,
      pendingScheduledWorkouts: 0,
      missedPastCoreDays: 1,
      scheduledRestDays: 1,
      bonusCompletedSessions: 0,
      isTodayPending: false
    },
    clearActiveSession: vi.fn(),
    resetToCycleDay1: vi.fn(),
    reloadInitialWorkouts: vi.fn()
  };
}

describe('GAINLOG Dashboard & Calendar Polish Regression Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockWorkoutMap = new Map();
  const mockCoreMap = new Map();
  const mockLogsMap = new Map();

  function renderDashboard(data: useDashboardDataModule.DashboardData) {
    vi.spyOn(useDashboardDataModule, 'useDashboardData').mockReturnValue(data);

    act(() => {
      root.render(
        <FitnessContext.Provider value={{ workouts: mockWorkouts } as any}>
          <FitnessDerivedContext.Provider
            value={{
              currentDate: new Date('2026-10-15'),
              todayStr: '2026-10-15',
              index: {
                logsByDate: mockLogsMap,
                volumeByDate: {},
                completedSetsByDate: {},
                plannedSetsByDate: {}
              },
              workoutMap: mockWorkoutMap,
              coreWorkoutByCycleDayMap: mockCoreMap,
              getCycleDayForDate: () => 1,
              resolveExerciseMeta: () => null
            } as any}
          >
            <ConfirmProvider>
              <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
            </ConfirmProvider>
          </FitnessDerivedContext.Provider>
        </FitnessContext.Provider>
      );
    });
  }

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
  });

  describe('1. Today\'s Protocol: remove duplicate status', () => {
    it('on a Rest Day: removes RECOVERY DAY badge and redundant DAY 8 · REST badge, keeping DAY 8 / 8', () => {
      renderDashboard(getMockDashboardData(true));

      // Contains cycle indicator
      expect(container.textContent).toContain('DAY 8 / 8');
      // Does NOT contain duplicate recovery / rest badges
      expect(container.textContent).not.toContain('RECOVERY DAY');
      expect(container.textContent).not.toContain('DAY 8 · REST');
      // Subtitle uses concise label without repeating "Rest & Recovery Protocol"
      expect(container.textContent).toContain('Scheduled recovery');
      expect(container.textContent).not.toContain('Rest & Recovery Protocol');
      // Button displays Rest Day
      expect(container.textContent).toContain('Rest Day');
    });

    it('on a Training Day: preserves cycle indicator, TRAINING DAY badge, and distinct focus badge', () => {
      renderDashboard(getMockDashboardData(false));

      expect(container.textContent).toContain('DAY 1 / 8');
      expect(container.textContent).toContain('TRAINING DAY');
      expect(container.textContent).toContain('Push Focus');
      expect(container.textContent).toContain('1 Exercises');
      expect(container.textContent).toContain('Start Session');
    });
  });

  describe('2. Recent Achievements: 2x2 PR grid layout', () => {
    it('renders up to 4 PRs in a responsive 2-column grid with compact cards without truncation', () => {
      renderDashboard(getMockDashboardData(false));

      // Verified 4 PRs rendered
      expect(container.textContent).toContain('Barbell Bench Press');
      expect(container.textContent).toContain('Incline Dumbbell Press');
      expect(container.textContent).toContain('Weighted Chest Dips');
      expect(container.textContent).toContain('Standing Military Press');

      // Grid classes include cols-1 and colsSm-2 (sm:grid-cols-2)
      const prGrid = container.querySelector('.grid.sm\\:grid-cols-2');
      expect(prGrid).toBeTruthy();

      // Check card metrics are properly rendered
      expect(container.textContent).toContain('120 kg × 5 reps');
      expect(container.textContent).toContain('139.5');
      expect(container.textContent).toContain('42 kg × 8 reps');
      expect(container.textContent).toContain('53.2');
    });
  });

  describe('3. Body Weight chart: circular point markers matching E1RM point style', () => {
    it('renders circular HTML marker dots with equal width/height, emerald fill, and dark border', () => {
      renderDashboard(getMockDashboardData(false));

      const markers = container.querySelectorAll('[data-testid="bodyweight-marker"]');
      expect(markers.length).toBe(2);

      markers.forEach(marker => {
        const classList = marker.className;
        // Equal width and height (w-2 h-2)
        expect(classList).toContain('w-2');
        expect(classList).toContain('h-2');
        // Fully rounded circle (never oval/egg)
        expect(classList).toContain('rounded-full');
        // Matches E1RM chart point styling: emerald fill with dark border
        expect(classList).toContain('bg-emerald-500');
        expect(classList).toContain('border-zinc-950');
      });

      // Sparkline SVG should NOT contain stretched circle elements
      const sparklineSvg = container.querySelector('[aria-label*="Body weight trend"] svg');
      expect(sparklineSvg?.querySelectorAll('circle').length).toBe(0);
    });
  });

  describe('4. Calendar: fits available width without horizontal overflow or scrollbar', () => {
    it('does not impose min-w-[344px] or overflow-x-auto on calendar grid', () => {
      act(() => {
        root.render(
          <FitnessContext.Provider value={{ workouts: mockWorkouts } as any}>
            <FitnessDerivedContext.Provider
              value={{
                currentDate: new Date('2026-10-15'),
                todayStr: '2026-10-15',
                index: {
                  logsByDate: mockLogsMap,
                  volumeByDate: {},
                  completedSetsByDate: {},
                  plannedSetsByDate: {}
                },
                workoutMap: mockWorkoutMap,
                coreWorkoutByCycleDayMap: mockCoreMap,
                getCycleDayForDate: () => 1,
                resolveExerciseMeta: () => null
              } as any}
            >
              <Calendar />
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      // Calendar days grid container does NOT have min-w-[344px]
      const daysGrid = container.querySelector('.grid-cols-7');
      expect(daysGrid).toBeTruthy();
      expect(daysGrid?.className).not.toContain('min-w-[344px]');

      // Calendar days grid parent does NOT have horizontal scrollbar wrapper
      expect(daysGrid?.parentElement?.className).not.toContain('overflow-x-auto');

      // Grid is full width
      expect(daysGrid?.className).toContain('w-full');
    });
  });

  describe('5. Calendar: replaces white selected-day fill with dark selected state', () => {
    it('renders selected day with dark bg-zinc-800 instead of bright bg-white', () => {
      act(() => {
        root.render(
          <FitnessContext.Provider value={{ workouts: mockWorkouts } as any}>
            <FitnessDerivedContext.Provider
              value={{
                currentDate: new Date('2026-10-15'),
                todayStr: '2026-10-15',
                index: {
                  logsByDate: mockLogsMap,
                  volumeByDate: {},
                  completedSetsByDate: {},
                  plannedSetsByDate: {}
                },
                workoutMap: mockWorkoutMap,
                coreWorkoutByCycleDayMap: mockCoreMap,
                getCycleDayForDate: () => 1,
                resolveExerciseMeta: () => null
              } as any}
            >
              <Calendar />
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      // Click a day to select it (e.g. 2026-10-20)
      const day20 = container.querySelector('[data-testid="calendar-day-2026-10-20"]') as HTMLButtonElement;
      expect(day20).toBeTruthy();

      act(() => {
        day20.click();
      });

      // Verify selected state on the date badge inside
      const dateBadge = day20.querySelector('span.rounded-full');
      expect(dateBadge).toBeTruthy();
      // Should NOT have bg-white or text-black
      expect(dateBadge?.className).not.toContain('bg-white');
      expect(dateBadge?.className).not.toContain('text-black');
      // Should have dark background treatment
      expect(dateBadge?.className).toContain('bg-zinc-800');
      expect(dateBadge?.className).toContain('text-white');
    });
  });
});
