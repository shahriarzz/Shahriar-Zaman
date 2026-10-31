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
  }
];

describe('GAINLOG Dashboard Audit & Regression Test Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockClearActiveSession = vi.fn();
  const mockResetToCycleDay1 = vi.fn();
  const mockReloadInitialWorkouts = vi.fn();
  const mockLogWeight = vi.fn();
  const mockDeleteWeight = vi.fn();
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
  // Scenarios 1, 2, 3: Unfinished-Session Discard Confirmation
  // --------------------------------------------------------------------------
  describe('1. Unfinished session discard confirmation protocol', () => {
    it('opens destructive confirmation dialog with exact title and message when Discard is clicked', async () => {
      renderDashboard();
      
      const discardBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard'
      );
      expect(discardBtn).toBeDefined();

      await act(async () => {
        discardBtn!.click();
      });

      // Warning haptic triggered upon clicking Discard
      expect(haptics.warning).toHaveBeenCalled();

      // Dialog is rendered into DOM with title and message
      expect(document.body.textContent).toContain('Discard Unfinished Session?');
      expect(document.body.textContent).toContain('All unsubmitted progress and logged sets in this active session will be lost.');
      
      // Destructive button label is rendered
      const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard Session'
      );
      expect(confirmBtn).toBeDefined();
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

    it('confirming discard invokes clearActiveSession and triggers destructive haptic feedback', async () => {
      renderDashboard();

      const discardBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard'
      );
      await act(async () => {
        discardBtn!.click();
      });

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
  });

  // --------------------------------------------------------------------------
  // Scenarios 4 & 5: 8-Day Cycle Indicator in Today's Protocol
  // --------------------------------------------------------------------------
  describe('2. 8-Day cycle indicator and training vs recovery designation', () => {
    it('displays explicit DAY X / 8 cycle position matching currentCycleDay and TRAINING DAY badge', () => {
      currentMockData.currentCycleDay = 1;
      currentMockData.todayWorkout = mockWorkouts[0]; // push workout
      renderDashboard();

      expect(container.textContent).toContain('DAY 1 / 8');
      expect(container.textContent).toContain('TRAINING DAY');
      expect(container.textContent).toContain('Chest & Triceps Heavy');
    });

    it('designates programmed rest day as RECOVERY DAY with disabled action', () => {
      currentMockData.currentCycleDay = 4;
      currentMockData.todayWorkout = mockWorkouts[2]; // rest workout
      renderDashboard();

      expect(container.textContent).toContain('DAY 4 / 8');
      expect(container.textContent).toContain('RECOVERY DAY');
      expect(container.textContent).toContain('Programmed Recovery Day');

      const restDayBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Rest Day'
      );
      expect(restDayBtn).toBeDefined();
      expect(restDayBtn?.hasAttribute('disabled')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Unsupported Workout Duration Claims
  // --------------------------------------------------------------------------
  describe('3. Unsupported workout-duration claim removal', () => {
    it('removes Approx 60 min while strictly retaining exercise count', () => {
      currentMockData.todayWorkout = mockWorkouts[0]; // 3 exercises
      renderDashboard();

      expect(container.textContent).not.toContain('Approx 60 min');
      expect(container.textContent).toContain('3 Exercises');
    });
  });

  // --------------------------------------------------------------------------
  // Scenarios 7 & 8: Scheduled Training Streak Semantics
  // --------------------------------------------------------------------------
  describe('4. Scheduled training streak semantics', () => {
    it('labels streak metric as Scheduled Training Streak with session / sessions unit and Best sessions sublabel', () => {
      currentMockData.trainingStreak = {
        currentStreak: 3,
        longestStreak: 7,
        streakStartDate: '2026-10-28',
        streakEndDate: '2026-10-30'
      };
      renderDashboard();

      expect(container.textContent).toContain('Scheduled Training Streak');
      expect(container.textContent).toContain('sessions');
      expect(container.textContent).toContain('Best: 7 sessions');
      expect(container.textContent).not.toContain('Best: 7d');
    });

    it('uses singular session when streak is 1', () => {
      currentMockData.trainingStreak = {
        currentStreak: 1,
        longestStreak: 1,
        streakStartDate: '2026-10-30',
        streakEndDate: '2026-10-30'
      };
      renderDashboard();

      expect(container.textContent).toContain('1');
      expect(container.textContent).toContain('session');
      expect(container.textContent).toContain('Best: 1 session');
    });
  });

  // --------------------------------------------------------------------------
  // Scenarios 9 & 10: Strength Progress & Training Frequency Semantics
  // --------------------------------------------------------------------------
  describe('5. Strength progress & training frequency metric semantics', () => {
    it('displays comparable exercise count and confidence when baseline exists', () => {
      currentMockData.strengthTrend = {
        percentChange: 4.8,
        currentValue: 140,
        previousValue: 133.6,
        comparableExercises: 3,
        confidence: 'high',
        exerciseBreakdown: []
      };
      renderDashboard();

      expect(container.textContent).toContain('+4.8');
      expect(container.textContent).toContain('3 exercises (high confidence)');
    });

    it('displays Insufficient 28d baseline and dash when unavailable without rendering 0%', () => {
      currentMockData.strengthTrend = {
        percentChange: null,
        currentValue: null,
        previousValue: null,
        comparableExercises: 0,
        confidence: 'low',
        exerciseBreakdown: []
      };
      renderDashboard();

      expect(container.textContent).toContain('Insufficient 28d baseline');
      expect(container.textContent).toContain('—');
      expect(container.textContent).not.toContain('0%');
    });

    it('formats training frequency with prev 28d comparison', () => {
      currentMockData.trainingFrequency = {
        sessionsPerWeek: 3.5,
        completedSessions: 14,
        previousSessions: 12,
        change: 0.5,
        sessionsChange: 2
      };
      renderDashboard();

      expect(container.textContent).toContain('Training Frequency');
      expect(container.textContent).toContain('3.5');
      expect(container.textContent).toContain('/ week');
      expect(container.textContent).toContain('+0.5 vs prev 28d');
    });
  });

  // --------------------------------------------------------------------------
  // Scenarios 11, 12, 13: Recent Milestones Section
  // --------------------------------------------------------------------------
  describe('6. Recent milestones section', () => {
    it('renders rolling 7-day training volume with exact date range label', () => {
      renderDashboard();

      expect(container.textContent).toContain('Training Volume');
      expect(container.textContent).toContain('18.5k');
      expect(container.textContent).toContain('Last 7 Days (Oct 24 – Oct 30)');
    });

    it('renders recent PR events with exercise name, achieved load, e1RM and PR tags', () => {
      renderDashboard();

      expect(container.textContent).toContain('Barbell Bench Press');
      expect(container.textContent).toContain('120 kg × 5 reps');
      expect(container.textContent).toContain('e1RM: 139.5 kg');
      expect(container.textContent).toContain('WEIGHT PR');
      expect(container.textContent).toContain('E1RM PR');

      expect(container.textContent).toContain('Incline Dumbbell Press');
      expect(container.textContent).toContain('42 kg × 8 reps');
      expect(container.textContent).toContain('e1RM: 53.2 kg');
    });

    it('renders restrained empty state when no PR events exist', () => {
      currentMockData.recentMilestones.recentPREvents = [];
      renderDashboard();

      expect(container.textContent).toContain('No Recent Personal Records');
      expect(container.textContent).toContain('Personal records appear automatically as you log qualifying lifts.');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Routine Library Dropdown Semantics & Accessibility
  // --------------------------------------------------------------------------
  describe('7. Routine library dropdown semantics & keyboard navigation', () => {
    it('sets aria-expanded, aria-controls="routine-library-dropdown", and closes on Escape while restoring focus', async () => {
      renderDashboard();

      const triggerBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Browse All Routines')
      );
      expect(triggerBtn).toBeDefined();
      expect(triggerBtn?.getAttribute('aria-expanded')).toBe('false');
      expect(triggerBtn?.getAttribute('aria-controls')).toBe('routine-library-dropdown');

      // Open dropdown
      await act(async () => {
        triggerBtn!.click();
      });

      expect(triggerBtn?.getAttribute('aria-expanded')).toBe('true');
      const dropdown = container.querySelector('#routine-library-dropdown');
      expect(dropdown).not.toBeNull();

      // Focus should be restorable on Escape
      const focusSpy = vi.spyOn(triggerBtn!, 'focus');
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(container.querySelector('#routine-library-dropdown')).toBeNull();
      expect(triggerBtn?.getAttribute('aria-expanded')).toBe('false');
      expect(focusSpy).toHaveBeenCalled();
    });

    it('closes on pointerdown outside the dropdown container', async () => {
      renderDashboard();

      const triggerBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Browse All Routines')
      );
      await act(async () => {
        triggerBtn!.click();
      });
      expect(container.querySelector('#routine-library-dropdown')).not.toBeNull();

      // Click outside
      await act(async () => {
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });

      expect(container.querySelector('#routine-library-dropdown')).toBeNull();
    });

    it('renders rest routines as non-interactive with disabled styling and no selection haptic', async () => {
      renderDashboard();

      const triggerBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Browse All Routines')
      );
      await act(async () => {
        triggerBtn!.click();
      });

      const restRoutine = Array.from(container.querySelectorAll('#routine-library-dropdown div')).find(
        el => el.textContent?.includes('Programmed Recovery Day')
      );
      expect(restRoutine).toBeDefined();

      // Rest routine row has cursor-not-allowed and grayscale/opacity classes
      expect(restRoutine?.className).toContain('cursor-not-allowed');

      // Clicking rest routine does not invoke onStartWorkout
      await act(async () => {
        (restRoutine as HTMLElement).click();
      });

      expect(mockOnStartWorkout).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Body-Weight Entry Strict Validation & Sparkline Durability
  // --------------------------------------------------------------------------
  describe('8. Body-weight entry strict validation and sparkline arithmetic safety', () => {
    it('parseStrictBodyWeight strictly validates bounds (20-300kg) and rejects malformed values', () => {
      expect(parseStrictBodyWeight('   ').error).toBe('Enter a weight in kg.');
      expect(parseStrictBodyWeight('abc').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('NaN').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('19.9').error).toBe('Weight must be between 20 kg and 300 kg.');
      expect(parseStrictBodyWeight('300.1').error).toBe('Weight must be between 20 kg and 300 kg.');
      expect(parseStrictBodyWeight('-75').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('78.5').value).toBe(78.5);
      expect(parseStrictBodyWeight('78.5').error).toBeNull();
    });

    it('shows inline validation error on invalid input without submitting duplicate requests', async () => {
      renderDashboard();

      const input = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(input).toBeDefined();

      const logBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Log'
      );
      expect(logBtn).toBeDefined();

      // Submit out of bounds value: 15 kg
      await act(async () => {
        setInputValue(input, '15');
      });

      await act(async () => {
        logBtn!.click();
      });

      expect(container.textContent).toContain('Weight must be between 20 kg and 300 kg.');
      expect(mockLogWeight).not.toHaveBeenCalled();
      expect(haptics.warning).toHaveBeenCalled();

      // Now enter valid weight 82.5 kg
      await act(async () => {
        setInputValue(input, '82.5');
      });

      // Error message is cleared on typing
      expect(container.textContent).not.toContain('Weight must be between 20 kg and 300 kg.');

      await act(async () => {
        logBtn!.click();
      });

      expect(mockLogWeight).toHaveBeenCalledWith(82.5);
      expect(haptics.success).toHaveBeenCalled();
    });

    it('safely renders sparkline when weights are equal without division by zero or NaN coordinates', () => {
      currentMockData.weightSummary.sparklineData = {
        weights: [80, 80, 80],
        min: 80,
        max: 80,
        range: 0, // range is 0 when all recorded weights are identical!
        w: 50,
        sorted: [['2026-10-28', 80], ['2026-10-29', 80], ['2026-10-30', 80]]
      };

      renderDashboard();

      const sparklineImg = container.querySelector('[role="img"]');
      expect(sparklineImg).not.toBeNull();
      expect(sparklineImg?.getAttribute('aria-label')).toContain('Body weight trend');
      expect(sparklineImg?.getAttribute('aria-label')).toContain('ranging from 80 kg to 80 kg');

      const polyline = container.querySelector('polyline');
      expect(polyline).not.toBeNull();
      const points = polyline?.getAttribute('points');
      expect(points).not.toContain('NaN');
      expect(points).not.toContain('Infinity');

      // The points must have valid numeric coordinates
      expect(points).toMatch(/^\d+(\.\d+)?,32 \d+(\.\d+)?,32 \d+(\.\d+)?,32$/);
    });

    it('renders clean flat recent weight logs with delete confirmation prompt', async () => {
      renderDashboard();

      const deleteBtn = container.querySelector('button[aria-label="Delete Entry"]');
      expect(deleteBtn).toBeDefined();

      await act(async () => {
        (deleteBtn as HTMLButtonElement).click();
      });

      // Confirmation dialog opens
      expect(document.body.textContent).toContain('Delete Weight Log');
      expect(document.body.textContent).toContain('Are you sure you want to delete your weight log for');

      const executeBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'EXECUTE'
      );
      expect(executeBtn).toBeDefined();

      await act(async () => {
        executeBtn!.click();
      });

      expect(mockDeleteWeight).toHaveBeenCalledWith('2026-10-30');
    });
  });
});
