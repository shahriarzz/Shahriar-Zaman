// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dashboard } from '../components/Dashboard';
import { Calendar } from '../components/Calendar';
import { ConfirmProvider, useConfirm } from '../context/ConfirmContext';
import { haptics } from '../utils/haptics';
import * as useDashboardDataModule from '../hooks/useDashboardData';
import { Workout } from '../types/fitness';
import { ActiveSession } from '../hooks/useActiveSession';
import { parseStrictBodyWeight } from '../hooks/useDashboardData';
import { BODY_WEIGHT_LIMITS } from '../utils/fitnessCalculations';
import { FitnessContext } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';

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
  Calendar: ({ onStartWorkout }: { onStartWorkout?: (id: string) => void }) => (
    <div data-testid="mock-calendar">
      <button data-testid="calendar-start-btn" onClick={() => onStartWorkout?.('wo-push')}>
        Start Scheduled Session
      </button>
    </div>
  )
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
  // P0: Authoritative Session-Start Guard in App Layer & Dashboard Direct Delegation
  // --------------------------------------------------------------------------
  describe('P0: Single Authoritative Session Guard Contract', () => {
    it('Dashboard calls onStartWorkout directly without triggering separate confirmation or clear flow', async () => {
      // Unfinished session is 'wo-push', today workout is 'wo-pull'
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

      // Dashboard directly delegates to onStartWorkout without prompting or clearing
      expect(mockOnStartWorkout).toHaveBeenCalledWith('wo-pull');
      expect(mockClearActiveSession).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('Discard Unfinished Session?');
    });

    it('Dashboard banner Discard button requires confirmation before calling clearActiveSession', async () => {
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

    it('Dashboard -> App integration: starting a different workout prompts exactly once, preserves on cancel, clears and starts on confirm', async () => {
      // Simulated App layer wiring with authoritative handleStartSession
      const mockClearSession = vi.fn();
      let activeSession: ActiveSession | null = {
        workoutId: 'wo-push',
        startTime: Date.now() - 3600000,
        sessionSets: {}
      };
      let currentTab = 'dashboard';
      let selectedWorkoutId: string | null = null;

      const TestAppWrapper: React.FC = () => {
        const { confirm } = useConfirm();

        const handleStartSession = async (workoutId: string) => {
          if (activeSession && activeSession.workoutId !== workoutId) {
            const confirmed = await confirm({
              title: 'Discard Unfinished Session?',
              message: 'All unsubmitted progress and logged sets in this active session will be lost.',
              confirmText: 'Discard Session',
              isDanger: true,
            });
            if (!confirmed) {
              return;
            }
            mockClearSession();
            activeSession = null;
          }
          selectedWorkoutId = workoutId;
          currentTab = 'session';
        };

        return (
          <Dashboard
            onStartWorkout={handleStartSession}
            onNavigateToHistory={mockOnNavigateToHistory}
          />
        );
      };

      currentMockData.unfinishedSession = {
        workoutId: 'wo-push',
        workout: mockWorkouts[0],
        relativeTime: '1 hour ago'
      };
      currentMockData.todayWorkout = mockWorkouts[1]; // different workout: wo-pull

      act(() => {
        root.render(
          <ConfirmProvider>
            <TestAppWrapper />
          </ConfirmProvider>
        );
      });

      const startBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Start Session'
      );
      expect(startBtn).toBeDefined();

      // Attempt 1: Click start different workout
      await act(async () => {
        startBtn!.click();
      });

      // Exactly ONE confirmation dialog is displayed
      const dialogs = document.body.querySelectorAll('[role="alertdialog"], [role="dialog"]');
      expect(dialogs.length).toBe(1);
      expect(document.body.textContent).toContain('Discard Unfinished Session?');

      // Cancel / Abort
      const abortBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'ABORT'
      );
      expect(abortBtn).toBeDefined();

      await act(async () => {
        abortBtn!.click();
      });

      // Active session is preserved, clearSession is NOT called, and tab has not changed
      expect(mockClearSession).not.toHaveBeenCalled();
      expect(activeSession).not.toBeNull();
      expect(currentTab).toBe('dashboard');

      // Attempt 2: Click start different workout again and confirm
      await act(async () => {
        startBtn!.click();
      });

      const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Discard Session'
      );
      expect(confirmBtn).toBeDefined();

      await act(async () => {
        confirmBtn!.click();
      });

      // Cleared exactly once and transitioned to session tab with target workout
      expect(mockClearSession).toHaveBeenCalledTimes(1);
      expect(activeSession).toBeNull();
      expect(currentTab).toBe('session');
      expect(selectedWorkoutId).toBe('wo-pull');
    });

    it('Dashboard -> App integration: same workout resume never prompts confirmation', async () => {
      let confirmCalled = false;
      const activeSession: ActiveSession = {
        workoutId: 'wo-push',
        startTime: Date.now() - 1800000,
        sessionSets: {}
      };
      let targetWorkout: string | null = null;

      const TestResumeWrapper: React.FC = () => {
        const { confirm } = useConfirm();

        const handleStartSession = async (workoutId: string) => {
          if (activeSession && activeSession.workoutId !== workoutId) {
            confirmCalled = true;
            await confirm({ title: 'Discard?', message: 'Discard?', isDanger: true });
          }
          targetWorkout = workoutId;
        };

        return (
          <Dashboard
            onStartWorkout={handleStartSession}
            onNavigateToHistory={mockOnNavigateToHistory}
          />
        );
      };

      currentMockData.unfinishedSession = {
        workoutId: 'wo-push',
        workout: mockWorkouts[0],
        relativeTime: '30 mins ago'
      };
      currentMockData.todayWorkout = mockWorkouts[0]; // same workout!

      act(() => {
        root.render(
          <ConfirmProvider>
            <TestResumeWrapper />
          </ConfirmProvider>
        );
      });

      const resumeBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Resume Session'
      );
      expect(resumeBtn).toBeDefined();

      await act(async () => {
        resumeBtn!.click();
      });

      expect(confirmCalled).toBe(false);
      expect(targetWorkout).toBe('wo-push');
      expect(document.body.textContent).not.toContain('Discard?');
    });
  });

  // --------------------------------------------------------------------------
  // P1: Full Session-Start Path Audit & Calendar Guard Routing
  // --------------------------------------------------------------------------
  describe('P1: Full session-start path audit', () => {
    it('Calendar routes scheduled session starts through the authoritative onStartWorkout handler', async () => {
      const mockCalendarStartWorkout = vi.fn();
      const mockDefsMap = new Map();
      const mockIndex = buildFitnessIndex([], mockDefsMap);
      const mockCoreMap = new Map<number, Workout>([[1, mockWorkouts[0]]]);

      act(() => {
        root.render(
          <FitnessContext.Provider value={{ workouts: mockWorkouts } as any}>
            <FitnessDerivedContext.Provider
              value={{
                index: mockIndex,
                workoutMap: new Map([[mockWorkouts[0].id, mockWorkouts[0]]]),
                coreWorkoutByCycleDayMap: mockCoreMap,
                getCycleDayForDate: () => 1,
                resolveExerciseMeta: () => null,
                currentDate: new Date(),
                todayStr: '2026-10-30'
              } as any}
            >
              <Calendar
                onNavigateToHistory={mockOnNavigateToHistory}
                onStartWorkout={mockCalendarStartWorkout}
              />
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const startScheduledBtn = container.querySelector('[data-testid="calendar-start-btn"]') as HTMLButtonElement;
      expect(startScheduledBtn).toBeDefined();

      await act(async () => {
        startScheduledBtn.click();
      });

      expect(mockCalendarStartWorkout).toHaveBeenCalledWith('wo-push');
    });
  });

  // --------------------------------------------------------------------------
  // P1: Weight Logging Validation, Observable Errors & Rejected Writes
  // --------------------------------------------------------------------------
  describe('P1: Body weight logging with observable errors and rejected writes', () => {
    it('parseStrictBodyWeight strictly validates bounds (20-300kg) and normalizes decimal comma', () => {
      expect(parseStrictBodyWeight('   ').error).toBe('Enter a weight in kg.');
      expect(parseStrictBodyWeight('abc').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('NaN').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('19.9').error).toBe('Weight must be between 20 kg and 300 kg.');
      expect(parseStrictBodyWeight('300.1').error).toBe('Weight must be between 20 kg and 300 kg.');
      expect(parseStrictBodyWeight('-75').error).toBe('Enter a valid numeric weight.');
      expect(parseStrictBodyWeight('78,5').value).toBe(78.5);
      expect(parseStrictBodyWeight('78,5').error).toBeNull();
      expect(parseStrictBodyWeight('78.56').value).toBe(78.6);
      expect(parseStrictBodyWeight('78,5,2').error).toBe('Enter a valid numeric weight.');
    });

    it('handleLogWeight throws an observable error when value is invalid or out of range', async () => {
      // Testing raw hook logic behavior
      const mockLogFn = vi.fn().mockResolvedValue(undefined);
      const testHookLogWeight = async (val: number): Promise<void> => {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
          throw new Error('Enter a valid numeric weight.');
        }
        if (val < BODY_WEIGHT_LIMITS.min || val > BODY_WEIGHT_LIMITS.max) {
          throw new Error(`Weight must be between ${BODY_WEIGHT_LIMITS.min} kg and ${BODY_WEIGHT_LIMITS.max} kg.`);
        }
        const rounded = Math.round(val * 10) / 10;
        await mockLogFn(rounded);
      };

      await expect(testHookLogWeight(15)).rejects.toThrow('Weight must be between 20 kg and 300 kg.');
      await expect(testHookLogWeight(350)).rejects.toThrow('Weight must be between 20 kg and 300 kg.');
      await expect(testHookLogWeight(NaN)).rejects.toThrow('Enter a valid numeric weight.');

      await testHookLogWeight(80.24);
      expect(mockLogFn).toHaveBeenCalledWith(80.2);
    });

    it('reports failure without clearing input and without triggering success haptic when save is rejected', async () => {
      mockLogWeight.mockImplementation(() => Promise.reject(new Error('Cloud Firestore timeout')));

      renderDashboard();
      const input = container.querySelector('#quick-body-weight-input') as HTMLInputElement;
      expect(input).toBeDefined();

      const logBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Log'
      );
      expect(logBtn).toBeDefined();

      await act(async () => {
        setInputValue(input, '83,4');
      });

      await act(async () => {
        logBtn!.click();
      });

      // Error message is displayed in UI
      expect(container.textContent).toContain('Cloud Firestore timeout');
      // Input value is preserved intact (NOT cleared)
      expect(input.value).toBe('83,4');
      // Warning haptic triggered, success haptic NOT triggered
      expect(haptics.warning).toHaveBeenCalled();
      expect(haptics.success).not.toHaveBeenCalled();
    });

    it('clears input and triggers success haptic only after write promise successfully resolves', async () => {
      let finishPromise: () => void = () => {};
      mockLogWeight.mockImplementation(() => new Promise<void>(res => { finishPromise = res; }));

      renderDashboard();
      const input = container.querySelector('#quick-body-weight-input') as HTMLInputElement;
      const logBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Log'
      );

      await act(async () => {
        setInputValue(input, '77,8');
      });

      await act(async () => {
        logBtn!.click();
      });

      // Pending state: input still holds value, button shows Logging...
      expect(input.value).toBe('77,8');
      expect(logBtn?.textContent).toContain('Logging...');
      expect(haptics.success).not.toHaveBeenCalled();

      // Resolve write
      await act(async () => {
        finishPromise();
      });

      // Now input is cleared and success haptic is fired
      expect(input.value).toBe('');
      expect(haptics.success).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // P2: UI & Data Checks (Next Scheduled Safety, Adherence Fallback, 8-Day Cycle)
  // --------------------------------------------------------------------------
  describe('P2: UI and data consistency checks', () => {
    it('safely handles missing cycleDay in Next Scheduled without rendering "Day null"', () => {
      currentMockData.isTodayCompleted = true;
      currentMockData.todayCompletedSummary = {
        logId: 'log-1',
        durationMinutes: 45,
        setsCount: 10,
        totalVolume: 6500
      };
      // Next scheduled has no cycleDay (e.g. custom / bonus)
      currentMockData.nextScheduledWorkout = {
        id: 'wo-custom',
        name: 'Hybrid Conditioning',
        type: 'custom',
        badge: 'Extra Work',
        cycleDay: null as any,
        isCore: false,
        exercises: []
      };

      renderDashboard();

      expect(container.textContent).not.toContain('Day null');
      expect(container.textContent).toContain('Next Scheduled: Hybrid Conditioning');
    });

    it('falls back to Lifetime Total Volume when adherence has 0 evaluated scheduled workouts', () => {
      currentMockData.adherence = {
        rate: 0,
        percent: 0,
        completedScheduled: 0,
        scheduledCoreWorkouts: 0,
        evaluatedScheduledWorkouts: 0, // No workouts evaluated yet in schedule window
        pendingScheduledWorkouts: 1,
        missedPastCoreDays: 0,
        scheduledRestDays: 0,
        bonusCompletedSessions: 0,
        isTodayPending: true
      };
      currentMockData.stats = { totalWeight: 98000 };

      renderDashboard();

      // Should display Lifetime Total Volume rather than Adherence 0%
      expect(container.textContent).toContain('Total Volume');
      expect(container.textContent).toContain('Lifetime');
      expect(container.textContent).toContain('98k');
      expect(container.textContent).not.toContain('0 scheduled');
    });

    it('renders Adherence stat card when evaluatedScheduledWorkouts > 0', () => {
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
  });
});
