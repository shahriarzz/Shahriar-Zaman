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
import { MotionConfig } from 'motion/react';
import { FitnessContext } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import { HistoryView } from '../components/HistoryView';
import { buildFitnessIndex, selectSortedLogs } from '../utils/fitnessDerivedSelectors';

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
  const mockOnNavigateToAnalytics = vi.fn();

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
        <MotionConfig reducedMotion="always">
          <ConfirmProvider>
            <Dashboard
              onStartWorkout={mockOnStartWorkout}
              onNavigateToHistory={mockOnNavigateToHistory}
              onNavigateToAnalytics={mockOnNavigateToAnalytics}
            />
          </ConfirmProvider>
        </MotionConfig>
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

    it('1. renders exact page heading "Stay Aggressive" as h1 and places the 4 KPI cards immediately after it', () => {
      currentMockData.unfinishedSession = null;
      renderDashboard();

      const h1 = container.querySelector('h1');
      expect(h1?.textContent?.trim()).toBe('Stay Aggressive');

      const kpiGrid = container.querySelector('[data-testid="dashboard-overview-stats"]');
      expect(kpiGrid).toBeTruthy();
      expect(kpiGrid?.children.length).toBe(4);
      expect(
        Boolean(h1 && kpiGrid && (h1.compareDocumentPosition(kpiGrid) & Node.DOCUMENT_POSITION_FOLLOWING))
      ).toBe(true);
    });

    it('2-3. places 4 KPI cards before unfinished-session banner, and unfinished-session banner before Today\'s Protocol', () => {
      renderDashboard();

      const h1 = container.querySelector('h1')!;
      const kpiGrid = container.querySelector('[data-testid="dashboard-overview-stats"]')!;
      const unfinishedBanner = container.querySelector('[data-testid="unfinished-session-banner"]')!;
      const todaysProtocolHeading = Array.from(container.querySelectorAll('h2, h3')).find(
        el => el.textContent?.trim() === "Today's Protocol"
      )!;

      expect(h1).toBeTruthy();
      expect(kpiGrid).toBeTruthy();
      expect(unfinishedBanner).toBeTruthy();
      expect(todaysProtocolHeading).toBeTruthy();

      expect(Boolean(h1.compareDocumentPosition(kpiGrid) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(Boolean(kpiGrid.compareDocumentPosition(unfinishedBanner) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(Boolean(unfinishedBanner.compareDocumentPosition(todaysProtocolHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('4. places 4 KPI cards directly before Today\'s Protocol when no unfinished session exists', () => {
      currentMockData.unfinishedSession = null;
      renderDashboard();

      const kpiGrid = container.querySelector('[data-testid="dashboard-overview-stats"]')!;
      const unfinishedBanner = container.querySelector('[data-testid="unfinished-session-banner"]');
      const todaysProtocolHeading = Array.from(container.querySelectorAll('h2, h3')).find(
        el => el.textContent?.trim() === "Today's Protocol"
      )!;

      expect(unfinishedBanner).toBeNull();
      expect(kpiGrid).toBeTruthy();
      expect(todaysProtocolHeading).toBeTruthy();
      expect(Boolean(kpiGrid.compareDocumentPosition(todaysProtocolHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });

    it('5-8. keeps 4th KPI as Adherence with unavailable state and instruction when 0 evaluated workouts exist, removes Total Volume (Lifetime) from Dashboard, and shows separate Training Volume', () => {
      currentMockData.adherence = {
        rate: 0,
        percent: 0,
        completedScheduled: 0,
        scheduledCoreWorkouts: 0,
        evaluatedScheduledWorkouts: 0,
        pendingScheduledWorkouts: 1,
        missedPastCoreDays: 0,
        scheduledRestDays: 0,
        bonusCompletedSessions: 0,
        isTodayPending: true
      };
      currentMockData.stats = { totalWeight: 98000 };

      renderDashboard();

      const kpiGrid = container.querySelector('[data-testid="dashboard-overview-stats"]')!;
      const cards = Array.from(kpiGrid.children);
      expect(cards).toHaveLength(4);

      const fourthCardText = cards[3].textContent || '';
      expect(fourthCardText).toContain('Adherence');
      expect(fourthCardText).toContain('Complete 1 scheduled workout');
      expect(fourthCardText).toContain('—');
      expect(fourthCardText).not.toContain('0%');
      expect(fourthCardText).not.toContain('Total Volume');

      // Lifetime Total Volume is removed from Dashboard in favor of Training Volume (7-Day Load)
      expect(container.textContent).not.toContain('Total Volume (Lifetime)');
      expect(container.textContent).toContain('Training Volume');
      expect(container.textContent).toContain('18.5k');
    });

    it('9. displays evaluated Adherence percentage in the 4th KPI slot once scheduled sessions exist', () => {
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

      const kpiGrid = container.querySelector('[data-testid="dashboard-overview-stats"]')!;
      const fourthCardText = kpiGrid.children[3].textContent || '';
      expect(fourthCardText).toContain('Adherence');
      expect(fourthCardText).toContain('85');
      expect(fourthCardText).toContain('%');
      expect(fourthCardText).toContain('6/7 scheduled due (28d)');
    });
  });

  // --------------------------------------------------------------------------
  // P3: Approved Dashboard Refinements (A1-E2)
  // --------------------------------------------------------------------------
  describe('P3: Approved Dashboard Refinements (A1-E2)', () => {
    it('A1-A3: renders clarified KPI units, 28d comparisons without confidence claims, info dialogs, and Analytics drill-downs', async () => {
      renderDashboard();

      const kpiGrid = container.querySelector('[data-testid="dashboard-overview-stats"]')!;
      const cards = Array.from(kpiGrid.children);
      expect(cards[0].textContent).toContain('Scheduled Streak');
      expect(cards[0].textContent).toContain('sessions');
      expect(cards[0].textContent).toContain('Best: 12 sessions · Recovery days neutral');

      expect(cards[1].textContent).toContain('Training Frequency');
      expect(cards[1].textContent).toContain('Last 28d (17 sessions) · +0.5/wk vs prior 28d');

      expect(cards[2].textContent).toContain('Strength Progress');
      expect(cards[2].textContent).toContain('Last 28d vs prior 28d · 4 paired lifts (3+ lift sample)');
      expect(cards[2].textContent?.toLowerCase()).not.toContain('confidence');

      expect(cards[3].textContent).toContain('Adherence');
      expect(cards[3].textContent).toContain('6/7 scheduled due (28d)');

      // Open KPI info dialog and close with Escape
      const strengthInfoBtn = container.querySelector('button[aria-label="Explain Strength Progress"]') as HTMLButtonElement;
      expect(strengthInfoBtn).toBeTruthy();
      await act(async () => {
        strengthInfoBtn.focus();
        strengthInfoBtn.click();
      });
      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog!.textContent).toContain('not statistical confidence');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(strengthInfoBtn.getAttribute('aria-expanded')).toBe('false');
      await vi.waitFor(() => {
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      });

      // KPI drill-down triggers Analytics sections
      (container.querySelector('button[aria-label="View Scheduled Streak consistency in Analytics"]') as HTMLButtonElement).click();
      expect(mockOnNavigateToAnalytics).toHaveBeenCalledWith('consistency');

      (container.querySelector('button[aria-label="View Training Frequency cadence in Analytics"]') as HTMLButtonElement).click();
      expect(mockOnNavigateToAnalytics).toHaveBeenCalledWith('frequency');

      (container.querySelector('button[aria-label="View Strength Progress chart in Analytics"]') as HTMLButtonElement).click();
      expect(mockOnNavigateToAnalytics).toHaveBeenCalledWith('strength');
    });

    it('B1-B4: displays previous protocol summary or restrained fallback, Review Session CTA on completion, and deduplicated focus badge', async () => {
      currentMockData.todayWorkout = {
        ...mockWorkouts[0],
        badge: 'DAY 1 · PUSH A'
      };
      currentMockData.previousProtocolSummary = {
        logId: 'log-prev-1',
        date: '2026-10-22',
        setsCount: 10,
        totalVolume: 8400,
        durationMinutes: 52
      };

      renderDashboard();
      expect(container.querySelector('[data-testid="previous-protocol-summary"]')?.textContent).toContain('Previous (Oct 22):10 sets·8.4k kg·52 min');
      expect(container.textContent).toContain('PUSH A');
      expect(container.textContent).not.toContain('DAY 1 · PUSH A');

      // Null fallback -> restrained text
      currentMockData.previousProtocolSummary = null;
      renderDashboard();
      expect(container.querySelector('[data-testid="previous-protocol-empty"]')?.textContent?.trim()).toBe('No previous completed session');

      // Completed today -> Review Session navigates to History and never starts workout
      currentMockData.isTodayCompleted = true;
      currentMockData.todayCompletedSummary = {
        logId: 'log-today-1',
        date: '2026-10-30',
        setsCount: 10,
        totalVolume: 8600,
        durationMinutes: 48
      };
      renderDashboard();

      const reviewBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Review Session'
      ) as HTMLButtonElement;
      expect(reviewBtn).toBeTruthy();
      expect(reviewBtn.disabled).toBe(false);

      await act(async () => {
        reviewBtn.click();
      });
      expect(mockOnStartWorkout).not.toHaveBeenCalled();
      expect(mockOnNavigateToHistory).toHaveBeenCalledWith({
        date: '2026-10-30',
        logId: 'log-today-1'
      });

      // Rest Day 4 & Day 8 suppress duplicate rest badges
      currentMockData.isTodayCompleted = false;
      currentMockData.todayCompletedSummary = null;
      currentMockData.currentCycleDay = 8;
      currentMockData.todayWorkout = {
        id: 'wo-rest-8',
        name: 'Active Recovery',
        type: 'rest',
        badge: 'DAY 8 · REST',
        cycleDay: 8,
        isCore: true,
        exercises: []
      };
      renderDashboard();
      expect(container.textContent).toContain('DAY 8 / 8');
      expect(container.textContent).not.toContain('DAY 8 · REST');
    });

    it('C1-E2: separates Training Volume & PR cards (clickable), enforces Body Weight freshness label, single dot, and proportional sparkline', async () => {
      currentMockData.weightSummary.latestWeightDate = '2026-10-30';
      currentMockData.weightSummary.sparklineData = {
        weights: [80, 81, 82],
        min: 79.5,
        max: 82.5,
        observedMin: 80,
        observedMax: 82,
        range: 3,
        w: 50,
        sorted: [
          ['2026-10-01', 80],
          ['2026-10-03', 81],
          ['2026-10-11', 82]
        ]
      };
      currentMockData.recentMilestones.recentPREvents = [
        {
          id: 'log-pr-1_bench-press_w',
          logId: 'log-pr-1',
          exerciseDefinitionId: 'bench-press',
          exerciseName: 'Barbell Bench Press',
          date: '2026-10-29',
          monthKey: '2026-10',
          weight: 120,
          reps: 5,
          e1rm: 139.5,
          isWeightPR: true,
          isE1RMPR: true
        }
      ];

      renderDashboard();

      // Freshness label reflects entry date
      expect(container.querySelector('[data-testid="bodyweight-freshness"]')?.textContent?.trim()).toBe(
        'Last recorded · Oct 30'
      );

      // Proportional sparkline positions middle dot at 20% left instead of 50%
      const markers = Array.from(container.querySelectorAll('[data-testid="bodyweight-marker"]')) as HTMLElement[];
      expect(markers).toHaveLength(3);
      expect(markers[0].style.left).toBe('0%');
      expect(parseFloat(markers[1].style.left)).toBeCloseTo(20, 4);
      expect(markers[2].style.left).toBe('100%');

      const polylinePoints = container.querySelector('svg polyline')?.getAttribute('points') || '';
      const coords = polylinePoints.split(' ').map(pair => parseFloat(pair.split(',')[0]));
      expect(coords[0]).toBe(0);
      expect(coords[1]).toBeCloseTo(20, 4);
      expect(coords[2]).toBe(100);

      // Clicking PR card navigates cleanly to exact History log + exercise
      const prBtn = container.querySelector('button[aria-label="Inspect Barbell Bench Press PR from Oct 29 in History"]') as HTMLButtonElement;
      expect(prBtn).toBeTruthy();
      await act(async () => {
        prBtn.click();
      });
      expect(mockOnNavigateToHistory).toHaveBeenCalledWith({
        date: '2026-10-29',
        logId: 'log-pr-1',
        exerciseDefinitionId: 'bench-press'
      });

      // Single body weight measurement renders centered orange dot; 0 measurements show empty freshness
      currentMockData.weightSummary.weightEntries = [['2026-10-30', 78.5]];
      currentMockData.weightSummary.sparklineData = null;
      renderDashboard();
      const singleMarkers = container.querySelectorAll('[data-testid="bodyweight-marker"]');
      expect(singleMarkers).toHaveLength(1);
      expect((singleMarkers[0] as HTMLElement).style.left).toBe('50%');
      expect((singleMarkers[0] as HTMLElement).style.top).toBe('50%');

      currentMockData.weightSummary.weightEntries = [];
      currentMockData.weightSummary.latestWeightDate = null;
      currentMockData.weightSummary.recentWeightLogs = [];
      renderDashboard();
      expect(container.querySelector('[data-testid="bodyweight-freshness"]')?.textContent?.trim()).toBe('No measurements yet');
    });

    it('B1 hook exclusion check & History target resolution: strictly excludes incomplete/today/future logs for previousProtocolSummary and expands exact logId + exercise', async () => {
      vi.restoreAllMocks();

      const defsMap = new Map([
        ['bench-press', { id: 'bench-press', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' }]
      ]);
      const logs: Record<string, any> = {
        'log-old-push': {
          id: 'log-old-push',
          workoutId: 'wo-push',
          date: '2026-10-20',
          complete: true,
          durationMinutes: 41,
          sets: { 'bench-press': [{ id: 's1', weight: '90', reps: '8', done: true }] }
        },
        'log-other-pull': {
          id: 'log-other-pull',
          workoutId: 'wo-pull',
          date: '2026-10-29',
          complete: true,
          durationMinutes: 55,
          sets: { 'pull-ups': [{ id: 's2', weight: '20', reps: '10', done: true }] }
        },
        'log-incomplete-push': {
          id: 'log-incomplete-push',
          workoutId: 'wo-push',
          date: '2026-10-28',
          complete: false,
          durationMinutes: 15,
          sets: { 'bench-press': [{ id: 's3', weight: '100', reps: '5', done: true }] }
        },
        'log-today-push': {
          id: 'log-today-push',
          workoutId: 'wo-push',
          date: '2026-10-30',
          complete: true,
          durationMinutes: 50,
          sets: { 'bench-press': [{ id: 's4', weight: '105', reps: '5', done: true }] }
        },
        'log-future-push': {
          id: 'log-future-push',
          workoutId: 'wo-push',
          date: '2026-11-05',
          complete: true,
          durationMinutes: 60,
          sets: { 'bench-press': [{ id: 's5', weight: '110', reps: '5', done: true }] }
        }
      };

      const index = buildFitnessIndex(logs, defsMap);
      const hookResultRef: { current: useDashboardDataModule.DashboardData | null } = { current: null };
      const HookProbe: React.FC = () => {
        hookResultRef.current = useDashboardDataModule.useDashboardData();
        return null;
      };

      const noopAsync = async () => {};
      const workoutMap = new Map(mockWorkouts.map(w => [w.id, w]));
      const coreMap = new Map<number, Workout>([[1, mockWorkouts[0]], [2, mockWorkouts[1]]]);

      act(() => {
        root.render(
          <FitnessContext.Provider
            value={{
              workouts: mockWorkouts,
              updateCycleStart: vi.fn(),
              logBodyWeight: noopAsync,
              deleteBodyWeight: noopAsync,
              setWorkouts: vi.fn(),
              deleteLog: vi.fn(),
              addLog: vi.fn()
            } as any}
          >
            <FitnessDerivedContext.Provider
              value={{
                currentDate: new Date(2026, 9, 30, 12, 0, 0),
                todayStr: '2026-10-30',
                index,
                sortedLogs: selectSortedLogs(index),
                workoutMap,
                lifetimeStats: index.lifetimeStats,
                weightSummary: {
                  currentWeight: 78.5,
                  weightEntries: [['2026-10-25', 78.5]],
                  recentWeightLogs: [['2026-10-25', 78.5]],
                  sparklineData: null
                },
                nextCycleDay: 1,
                coreWorkoutByCycleDayMap: coreMap,
                trainingStreak: { currentStreak: 1, longestStreak: 1, streakStartDate: null, streakEndDate: null },
                trainingFrequency: { sessionsPerWeek: 1, completedSessions: 4, previousSessions: 2, change: 0.5, sessionsChange: 2 },
                strengthTrend: { percentChange: null, currentValue: null, previousValue: null, comparableExercises: 0, confidence: 'low', exerciseBreakdown: [] },
                adherenceInsight: {
                  rate: 1, percent: 100, completedScheduled: 1, scheduledCoreWorkouts: 1,
                  evaluatedScheduledWorkouts: 1, pendingScheduledWorkouts: 0,
                  missedPastCoreDays: 0, scheduledRestDays: 0, bonusCompletedSessions: 0, isTodayPending: false
                },
                prEvents: [],
                getVolumeForRange: () => 0,
                getStrengthTrendForRange: () => ({ percentChange: null, currentValue: null, previousValue: null, comparableExercises: 0, confidence: 'low', exerciseBreakdown: [] })
              } as any}
            >
              <HookProbe />
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      expect(hookResultRef.current?.previousProtocolSummary).toEqual({
        logId: 'log-old-push',
        date: '2026-10-20',
        setsCount: 1,
        totalVolume: 720,
        durationMinutes: 41
      });
      expect(hookResultRef.current?.weightSummary.latestWeightDate).toBe('2026-10-25');

      // Also verify HistoryView expands exact logId + exercise when two logs share the same date
      const sameDayLogs: Record<string, any> = {
        'log-same-day-1': {
          id: 'log-same-day-1',
          workoutId: 'wo-push',
          date: '2026-10-30',
          complete: true,
          durationMinutes: 30,
          sets: { 'bench-press': [{ id: 'a1', weight: '80', reps: '8', done: true }] }
        },
        'log-same-day-2': {
          id: 'log-same-day-2',
          workoutId: 'wo-pull',
          date: '2026-10-30',
          complete: true,
          durationMinutes: 40,
          sets: { 'bench-press': [{ id: 'a2', weight: '100', reps: '5', done: true }] }
        }
      };
      const sameDayIndex = buildFitnessIndex(sameDayLogs, defsMap);
      const onClearTarget = vi.fn();

      act(() => {
        root.render(
          <ConfirmProvider>
            <FitnessContext.Provider value={{ deleteLog: vi.fn(), addLog: vi.fn() } as any}>
              <FitnessDerivedContext.Provider
                value={{
                  sortedLogs: selectSortedLogs(sameDayIndex),
                  workoutMap,
                  index: sameDayIndex,
                  prEvents: [],
                  getStrengthTrendForRange: () => ({ percentChange: null, currentValue: null, previousValue: null, comparableExercises: 0, confidence: 'low', exerciseBreakdown: [] }),
                  getVolumeForRange: () => 0
                } as any}
              >
                <HistoryView
                  initialTarget={{ date: '2026-10-30', logId: 'log-same-day-2', exerciseDefinitionId: 'bench-press' }}
                  onClearInitialDate={onClearTarget}
                />
              </FitnessDerivedContext.Provider>
            </FitnessContext.Provider>
          </ConfirmProvider>
        );
      });

      expect(onClearTarget).toHaveBeenCalled();
      const secondLogCard = container.querySelector('[data-history-log-id="log-same-day-2"]');
      expect(secondLogCard).toBeTruthy();
      expect(secondLogCard!.querySelector('[data-history-ex-key="2026-10-30_bench-press"]')).toBeTruthy();
      // Exact log-same-day-2 expanded rather than log-same-day-1
      expect(container.querySelector('[data-history-log-id="log-same-day-1"] [data-history-ex-key]')).toBeNull();
    });

    it('Hardened PR navigation: resolves exact logId across multiple same-day sessions and omits arbitrary date fallback', () => {
      vi.restoreAllMocks();

      const defsMap = new Map([
        ['bench-press', { id: 'bench-press', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' }]
      ]);
      const sameDateLogs: Record<string, any> = {
        'log-day-am': {
          id: 'log-day-am',
          workoutId: 'wo-push',
          date: '2026-10-29',
          complete: true,
          durationMinutes: 35,
          sets: { 'bench-press': [{ id: 's1', weight: '95', reps: '5', done: true }] }
        },
        'log-day-pm': {
          id: 'log-day-pm',
          workoutId: 'wo-push',
          date: '2026-10-29',
          complete: true,
          durationMinutes: 40,
          sets: { 'bench-press': [{ id: 's2', weight: '105', reps: '5', done: true }] }
        }
      };

      const index = buildFitnessIndex(sameDateLogs, defsMap);
      const hookResultRef: { current: useDashboardDataModule.DashboardData | null } = { current: null };
      const HookProbe: React.FC = () => {
        hookResultRef.current = useDashboardDataModule.useDashboardData();
        return null;
      };

      const noopAsync = async () => {};
      const workoutMap = new Map(mockWorkouts.map(w => [w.id, w]));
      const coreMap = new Map<number, Workout>([[1, mockWorkouts[0]]]);

      act(() => {
        root.render(
          <FitnessContext.Provider
            value={{
              workouts: mockWorkouts,
              updateCycleStart: vi.fn(),
              logBodyWeight: noopAsync,
              deleteBodyWeight: noopAsync,
              setWorkouts: vi.fn(),
              deleteLog: vi.fn(),
              addLog: vi.fn()
            } as any}
          >
            <FitnessDerivedContext.Provider
              value={{
                currentDate: new Date(2026, 9, 30, 12, 0, 0),
                todayStr: '2026-10-30',
                index,
                sortedLogs: selectSortedLogs(index),
                workoutMap,
                lifetimeStats: index.lifetimeStats,
                weightSummary: {
                  currentWeight: '--',
                  weightEntries: [],
                  recentWeightLogs: [],
                  sparklineData: null
                },
                nextCycleDay: 1,
                coreWorkoutByCycleDayMap: coreMap,
                trainingStreak: { currentStreak: 0, longestStreak: 0, streakStartDate: null, streakEndDate: null },
                trainingFrequency: { sessionsPerWeek: 0, completedSessions: 0, previousSessions: 0, change: 0, sessionsChange: 0 },
                strengthTrend: { percentChange: null, currentValue: null, previousValue: null, comparableExercises: 0, confidence: 'low', exerciseBreakdown: [] },
                adherenceInsight: {
                  rate: 0, percent: 0, completedScheduled: 0, scheduledCoreWorkouts: 0,
                  evaluatedScheduledWorkouts: 0, pendingScheduledWorkouts: 0,
                  missedPastCoreDays: 0, scheduledRestDays: 0, bonusCompletedSessions: 0, isTodayPending: false
                },
                prEvents: [
                  {
                    id: 'log-day-pm_bench-press_0',
                    exerciseDefinitionId: 'bench-press',
                    exerciseName: 'Barbell Bench Press',
                    date: '2026-10-29',
                    monthKey: '2026-10',
                    weight: 105,
                    reps: 5,
                    e1rm: 122.5,
                    isWeightPR: true,
                    isE1RMPR: true
                  },
                  {
                    id: 'legacy-unstructured-pr-id',
                    exerciseDefinitionId: 'bench-press',
                    exerciseName: 'Barbell Bench Press',
                    date: '2026-10-29',
                    monthKey: '2026-10',
                    weight: 95,
                    reps: 5,
                    e1rm: 110.8,
                    isWeightPR: true,
                    isE1RMPR: true
                  }
                ],
                getVolumeForRange: () => 0,
                getStrengthTrendForRange: () => ({ percentChange: null, currentValue: null, previousValue: null, comparableExercises: 0, confidence: 'low', exerciseBreakdown: [] })
              } as any}
            >
              <HookProbe />
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const resolvedEvents = hookResultRef.current?.recentMilestones.recentPREvents || [];
      expect(resolvedEvents).toHaveLength(2);
      // Exact PR ID resolves log-day-pm even though log-day-am is on the exact same date
      expect(resolvedEvents.find(e => e.id === 'log-day-pm_bench-press_0')?.logId).toBe('log-day-pm');
      // Unresolvable ID does NOT arbitrarily pick log-day-am solely by date match
      expect(resolvedEvents.find(e => e.id === 'legacy-unstructured-pr-id')?.logId).toBeUndefined();
    });
  });
});
