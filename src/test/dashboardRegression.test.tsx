// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dashboard } from '../components/Dashboard';
import { ConfirmProvider } from '../context/ConfirmContext';
import { haptics } from '../utils/haptics';
import * as useDashboardDataModule from '../hooks/useDashboardData';
import { Workout } from '../types/fitness';
import { parseStrictBodyWeight } from '../hooks/useDashboardData';
import { BODY_WEIGHT_LIMITS } from '../utils/fitnessCalculations';
import { SEMANTIC_COLORS } from '../styles/tokens';

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

vi.mock('../components/Calendar', () => ({
  Calendar: () => <div data-testid="mock-calendar">Calendar</div>
}));

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target: number) => target
}));

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const mockWorkouts: Workout[] = [
  {
    id: 'wo-push',
    name: 'Chest & Triceps Heavy',
    type: 'push',
    badge: 'Push Focus',
    cycleDay: 1,
    isCore: true,
    exercises: [
      { exerciseDefinitionId: 'bench-press', sets: 4, reps: '6' },
      { exerciseDefinitionId: 'incline-db', sets: 3, reps: '8' },
      { exerciseDefinitionId: 'dips', sets: 3, reps: '10' }
    ]
  },
  {
    id: 'wo-pull',
    name: 'Back & Biceps Dense',
    type: 'pull',
    badge: 'Pull Focus',
    cycleDay: 2,
    isCore: true,
    exercises: [
      { exerciseDefinitionId: 'pull-ups', sets: 4, reps: '8' }
    ]
  },
  {
    id: 'wo-rest',
    name: 'Programmed Recovery Day',
    type: 'rest',
    badge: 'Active Recovery',
    cycleDay: 4,
    isCore: true,
    exercises: []
  },
  {
    id: 'wo-bonus',
    name: 'Conditioning Finisher',
    type: 'custom',
    badge: 'Metcon Focus',
    cycleDay: null as any,
    isCore: false,
    exercises: [
      { exerciseDefinitionId: 'kettlebell-swing', sets: 3, reps: '15' }
    ]
  }
];

describe('GAINLOG Dashboard Audit & Regression Test Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockClearActiveSession = vi.fn();
  const mockResetToCycleDay1 = vi.fn();
  const mockReloadInitialWorkouts = vi.fn();
  const mockLogWeight = vi.fn().mockImplementation(() => Promise.resolve());
  const mockDeleteWeight = vi.fn().mockImplementation(() => Promise.resolve());
  const mockOnStartWorkout = vi.fn();
  const mockOnNavigateToHistory = vi.fn();

  function getDefaultMockData(): useDashboardDataModule.DashboardData {
    return {
      heroDateStr: 'Friday, October 30',
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
      unfinishedSession: {
        workoutId: 'wo-push',
        workout: mockWorkouts[0],
        relativeTime: '2 hours ago'
      },
      todayWorkout: mockWorkouts[0],
      currentCycleDay: 1,
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
        logWeight: mockLogWeight,
        deleteWeight: mockDeleteWeight
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
          }
        ]
      },
      isTodayCompleted: false,
      todayCompletedSummary: null,
      nextScheduledWorkout: null,
      adherence: null,
      clearActiveSession: mockClearActiveSession,
      resetToCycleDay1: mockResetToCycleDay1,
      reloadInitialWorkouts: mockReloadInitialWorkouts
    };
  }

  let currentMockData = getDefaultMockData();

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    currentMockData = getDefaultMockData();
    vi.spyOn(useDashboardDataModule, 'useDashboardData').mockImplementation(() => currentMockData);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderDashboard() {
    act(() => {
      root.render(
        <ConfirmProvider>
          <Dashboard
            onStartWorkout={mockOnStartWorkout}
            onNavigateToHistory={mockOnNavigateToHistory}
          />
        </ConfirmProvider>
      );
    });
  }

  // --------------------------------------------------------------------------
  // P0: Unfinished Session Protection & Discard Confirmation
  // --------------------------------------------------------------------------
  describe('P0: Unfinished session protection & discard confirmation', () => {
    it('opens destructive confirmation dialog when Discard is clicked and triggers destructive feedback on confirm', async () => {
      renderDashboard();

      const discardBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard'
      );
      expect(discardBtn).toBeDefined();

      await act(async () => {
        discardBtn!.click();
      });

      // Dialog is rendered into DOM with title and message
      expect(document.body.textContent).toContain('Discard Unfinished Session?');
      expect(document.body.textContent).toContain('All unsubmitted progress and logged sets in this active session will be lost.');

      const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard Session'
      );
      expect(confirmBtn).toBeDefined();

      await act(async () => {
        confirmBtn!.click();
      });

      expect(haptics.destructive).toHaveBeenCalled();
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1);
    });

    it('cancelling discard leaves draft active and clearActiveSession is not invoked', async () => {
      renderDashboard();

      const discardBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard'
      );
      await act(async () => {
        discardBtn!.click();
      });

      const abortBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'ABORT'
      );
      expect(abortBtn).toBeDefined();

      await act(async () => {
        abortBtn!.click();
      });

      expect(mockClearActiveSession).not.toHaveBeenCalled();
      expect(haptics.destructive).not.toHaveBeenCalled();
    });

    it('starting a different workout while unfinished session exists requires confirmation and discards on confirm', async () => {
      // unfinished session is 'wo-push', today workout is 'wo-pull'
      currentMockData.unfinishedSession = {
        workoutId: 'wo-push',
        workout: mockWorkouts[0],
        relativeTime: '1 hour ago'
      };
      currentMockData.todayWorkout = mockWorkouts[1]; // wo-pull
      renderDashboard();

      const startBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Start Session'
      );
      expect(startBtn).toBeDefined();

      await act(async () => {
        startBtn!.click();
      });

      // Confirmation prompt opened
      expect(document.body.textContent).toContain('Discard Unfinished Session?');
      expect(mockOnStartWorkout).not.toHaveBeenCalled();

      // Confirm discard and start new
      const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard Session'
      );
      await act(async () => {
        confirmBtn!.click();
      });

      expect(mockClearActiveSession).toHaveBeenCalledTimes(1);
      expect(haptics.destructive).toHaveBeenCalled();
      expect(mockOnStartWorkout).toHaveBeenCalledWith('wo-pull');
    });

    it('resuming same workout does not prompt confirmation', async () => {
      currentMockData.unfinishedSession = {
        workoutId: 'wo-push',
        workout: mockWorkouts[0],
        relativeTime: '1 hour ago'
      };
      currentMockData.todayWorkout = mockWorkouts[0]; // same workout!
      renderDashboard();

      const startBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Start Session'
      );
      await act(async () => {
        startBtn!.click();
      });

      // No confirmation modal opened
      expect(document.body.textContent).not.toContain('Discard Unfinished Session?');
      expect(mockOnStartWorkout).toHaveBeenCalledWith('wo-push');
    });
  });

  // --------------------------------------------------------------------------
  // P1: Duplicate Interactions & Single Haptic Per Click
  // --------------------------------------------------------------------------
  describe('P1: Interaction haptics discipline', () => {
    it('fires exactly one haptic on Resume Session click', async () => {
      renderDashboard();

      const resumeBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Resume Session'
      );
      expect(resumeBtn).toBeDefined();

      vi.clearAllMocks();
      await act(async () => {
        resumeBtn!.click();
      });

      const totalHapticCalls =
        (haptics.light as any).mock.calls.length +
        (haptics.medium as any).mock.calls.length +
        (haptics.selection as any).mock.calls.length +
        (haptics.success as any).mock.calls.length +
        (haptics.warning as any).mock.calls.length +
        (haptics.destructive as any).mock.calls.length;

      expect(totalHapticCalls).toBe(1);
      expect(mockOnStartWorkout).toHaveBeenCalledWith('wo-push');
    });
  });

  // --------------------------------------------------------------------------
  // P1: Body Weight Logging & Decimal Comma Normalization
  // --------------------------------------------------------------------------
  describe('P1: Body weight logging with comma normalization and limits', () => {
    it('accepts single decimal comma and normalizes to dot (78,5 -> 78.5)', () => {
      const parsed = parseStrictBodyWeight('78,5');
      expect(parsed.value).toBe(78.5);
      expect(parsed.error).toBeNull();
    });

    it('rounds accepted values to one decimal place (78.56 -> 78.6)', () => {
      const parsed = parseStrictBodyWeight('78.56');
      expect(parsed.value).toBe(78.6);
      expect(parsed.error).toBeNull();
    });

    it('rejects multiple commas or mixed periods and commas', () => {
      expect(parseStrictBodyWeight('78,5,2').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('78.5,2').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('78,5.2').error).toBe('Enter a valid numeric weight.');
    });

    it('enforces shared BODY_WEIGHT_LIMITS [20, 300]', () => {
      expect(parseStrictBodyWeight(String(BODY_WEIGHT_LIMITS.min - 0.1)).error).toBe('Weight must be between 20 kg and 300 kg.');
      expect(parseStrictBodyWeight(String(BODY_WEIGHT_LIMITS.max + 0.1)).error).toBe('Weight must be between 20 kg and 300 kg.');
      expect(parseStrictBodyWeight(String(BODY_WEIGHT_LIMITS.min)).value).toBe(BODY_WEIGHT_LIMITS.min);
      expect(parseStrictBodyWeight(String(BODY_WEIGHT_LIMITS.max)).value).toBe(BODY_WEIGHT_LIMITS.max);
    });

    it('associates input with an accessible label visible across all viewports', () => {
      renderDashboard();
      const label = container.querySelector('label[for="quick-body-weight-input"]');
      expect(label).not.toBeNull();
      expect(label?.textContent).toContain('Body Weight');
      expect(label?.className).not.toContain('hidden');
    });

    it('disables submit button while pending and triggers success haptic only on save success', async () => {
      let resolvePromise: () => void = () => {};
      mockLogWeight.mockImplementation(() => new Promise<void>(res => { resolvePromise = res; }));

      renderDashboard();
      const input = container.querySelector('#quick-body-weight-input') as HTMLInputElement;
      const logBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Log'
      );

      await act(async () => {
        setInputValue(input, '79,2');
      });

      await act(async () => {
        logBtn!.click();
      });

      // While pending, button is disabled and text is Logging...
      expect(logBtn?.hasAttribute('disabled')).toBe(true);
      expect(logBtn?.textContent).toContain('Logging...');

      // Finish log
      await act(async () => {
        resolvePromise();
      });

      expect(mockLogWeight).toHaveBeenCalledWith(79.2);
      expect(haptics.success).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // P1: Today's Completed Workout Prevention & Summary
  // --------------------------------------------------------------------------
  describe('P1: Today completed workout handling', () => {
    it('shows completed badge, summary, and disabled button when today workout is completed', () => {
      currentMockData.isTodayCompleted = true;
      currentMockData.todayCompletedSummary = {
        logId: 'log-1',
        durationMinutes: 48,
        setsCount: 12,
        totalVolume: 8500
      };
      currentMockData.nextScheduledWorkout = {
        id: 'wo-pull',
        name: 'Back & Biceps Dense',
        type: 'pull',
        badge: 'Pull Focus',
        cycleDay: 2,
        isCore: true,
        exercises: []
      };

      renderDashboard();

      expect(container.textContent).toContain('COMPLETED TODAY');
      expect(container.textContent).toContain('12 sets');
      expect(container.textContent).toContain('48 min');
      expect(container.textContent).toContain('8.5k kg');
      expect(container.textContent).toContain('Next Scheduled: Day 2 · Back & Biceps Dense');

      const completedBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Completed'
      );
      expect(completedBtn).toBeDefined();
      expect(completedBtn?.hasAttribute('disabled')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // P1: Routine Library Disabled Semantics & Subtitle
  // --------------------------------------------------------------------------
  describe('P1: Routine library disabled semantics and bonus subtitle', () => {
    it('disables rest routines with aria-disabled="true" and prevents click activation', async () => {
      renderDashboard();

      const triggerBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Browse All Routines')
      );
      await act(async () => {
        triggerBtn!.click();
      });

      const restRow = Array.from(container.querySelectorAll('#routine-library-dropdown div[role="button"]')).find(
        el => el.textContent?.includes('Programmed Recovery Day')
      );
      expect(restRow).toBeDefined();
      expect(restRow?.getAttribute('aria-disabled')).toBe('true');

      await act(async () => {
        (restRow as HTMLElement).click();
      });

      expect(mockOnStartWorkout).not.toHaveBeenCalled();
    });

    it('renders bonus routine without "Day null"', async () => {
      renderDashboard();

      const triggerBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Browse All Routines')
      );
      await act(async () => {
        triggerBtn!.click();
      });

      expect(container.textContent).not.toContain('Day null');
      expect(container.textContent).toContain('Metcon Focus');
    });
  });

  // --------------------------------------------------------------------------
  // P2: Metric & Milestone Clarity (Streak, Adherence, Sparkline)
  // --------------------------------------------------------------------------
  describe('P2: Metric clarity, adherence, and sparkline bounds', () => {
    it('labels streak metric as compact Streak with session / sessions unit and best sessions', () => {
      currentMockData.trainingStreak = {
        currentStreak: 3,
        longestStreak: 7,
        streakStartDate: '2026-10-28',
        streakEndDate: '2026-10-30'
      };
      renderDashboard();

      expect(container.textContent).toContain('Streak');
      expect(container.textContent).toContain('sessions');
      expect(container.textContent).toContain('Best: 7 sessions');
    });

    it('renders canonical weekly adherence when available', () => {
      currentMockData.adherence = {
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
      };
      renderDashboard();

      expect(container.textContent).toContain('Adherence');
      expect(container.textContent).toContain('85');
      expect(container.textContent).toContain('%');
      expect(container.textContent).toContain('6/7 scheduled');
    });

    it('renders sparkline with emerald accent and observed min/max in aria-label', () => {
      currentMockData.weightSummary.sparklineData = {
        weights: [77.5, 78.5],
        min: 75.0, // padded bound
        max: 80.0, // padded bound
        observedMin: 77.5, // true observed min
        observedMax: 78.5, // true observed max
        range: 5.0,
        w: 50,
        sorted: [['2026-10-28', 77.5], ['2026-10-30', 78.5]]
      };
      renderDashboard();

      const sparklineImg = container.querySelector('[role="img"]');
      expect(sparklineImg).not.toBeNull();
      expect(sparklineImg?.getAttribute('aria-label')).toContain('ranging from 77.5 kg to 78.5 kg');

      const polyline = container.querySelector('polyline');
      expect(polyline?.getAttribute('stroke')).toBe(SEMANTIC_COLORS.emerald);
    });
  });
});
