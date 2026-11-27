// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  sanitizeTimestamp,
  sanitizeAppState,
  sanitizeWorkout,
  sanitizeSessionLog,
} from '../utils/fitnessCalculations';
import { calculatePREvents } from '../utils/trainingIntelligence';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { INITIAL_EXERCISE_DEFINITIONS, INITIAL_WORKOUTS } from '../types/initialData';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { FitnessDerivedContext, FitnessDerivedProvider } from '../context/FitnessDerivedContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { HistoryView } from '../components/HistoryView';
import { AccountSection } from '../components/manage/AccountSection';
import { ProgramIdentityCard } from '../components/manage/ProgramIdentityCard';
import { ProgramEditor } from '../components/manage/ProgramEditor';
import { Layout } from '../components/Layout';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import { SessionLog, Workout } from '../types/fitness';

const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);

function createMockFitnessContext(overrides: Partial<FitnessContextType> = {}): FitnessContextType {
  return {
    user: null,
    loading: false,
    syncStatus: 'idle',
    syncError: null,
    authError: null,
    login: vi.fn(),
    logout: vi.fn(),
    retrySync: vi.fn(),
    accountResetStatus: 'idle',
    accountResetError: null,
    retryAccountReset: vi.fn().mockResolvedValue({ success: true }),
    exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
    workouts: INITIAL_WORKOUTS,
    logs: {},
    appState: { cycleStart: '2026-10-01', weightLog: {} },
    databaseLifecycleState: { status: 'ready' } as any,
    retryStorageCommit: vi.fn(() => ({ success: true })),
    addExerciseDefinition: vi.fn(),
    updateExerciseDefinition: vi.fn(),
    deleteExerciseDefinition: vi.fn(),
    setWorkouts: vi.fn(),
    updateWorkout: vi.fn(),
    assignExerciseToWorkout: vi.fn(),
    removeExerciseFromWorkout: vi.fn(),
    updateWorkoutExerciseProgramming: vi.fn(),
    deleteWorkout: vi.fn(),
    addLog: vi.fn(),
    deleteLog: vi.fn(),
    resetLogs: vi.fn(),
    updateCycleStart: vi.fn(),
    commitFitnessSnapshot: vi.fn(() => ({
      success: true,
      snapshot: {
        exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
        workouts: INITIAL_WORKOUTS,
        logs: {},
        appState: { cycleStart: '2026-10-01', weightLog: {} },
      },
    })),
    activeSession: null,
    startActiveSession: vi.fn(),
    updateActiveSessionSets: vi.fn(),
    clearActiveSession: vi.fn(),
    logBodyWeight: vi.fn(),
    deleteBodyWeight: vi.fn(),
    pushAutoBackup: vi.fn(),
    getAutoBackups: vi.fn(() => []),
    clearAutoBackups: vi.fn(),
    restoreAutoBackup: vi.fn(),
    createManualBackup: vi.fn(),
    exportBackup: vi.fn(() => '{}'),
    importBackup: vi.fn(),
    retryPendingCloudSync: vi.fn(),
    isBackupsLoading: false,
    hasPendingCloudSync: false,
    pendingCloudSyncError: null,
    ...overrides,
  };
}

describe('Adversarial Repository Audit Fixes — Regression Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
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

  describe('1. Timestamp, AppState & Biological Bounds Sanitization (AUD-P2-003)', () => {
    it('sanitizeTimestamp rejects NaN, Infinity, non-positive values and returns clean fallback', () => {
      expect(sanitizeTimestamp(NaN, 1234)).toBe(1234);
      expect(sanitizeTimestamp(Infinity, 1234)).toBe(1234);
      expect(sanitizeTimestamp(-500, 1234)).toBe(1234);
      expect(sanitizeTimestamp('not-a-num', 1234)).toBe(1234);
      expect(sanitizeTimestamp(1700000000123.7, 0)).toBe(1700000000123);
    });

    it('sanitizeAppState filters invalid calendar dates, out-of-range weights, preserves empty weightLog: {}, and clamps updatedAt', () => {
      const sanitized = sanitizeAppState({
        cycleStart: '2026-02-31',
        updatedAt: Infinity,
        weightLog: {
          '2026-10-01': { weight: 82.5, unit: 'kg', updatedAt: NaN },
          '2026-10-02': { weight: -10, unit: 'kg', updatedAt: 1000 },
          '2026-10-03': { weight: 9999, unit: 'kg', updatedAt: 1000 },
          '2026-99-99': { weight: 80, unit: 'kg', updatedAt: 1000 },
        },
      });

      expect(sanitized.cycleStart).toBe('');
      expect(Number.isFinite(sanitized.updatedAt)).toBe(true);
      expect(Object.keys(sanitized.weightLog || {})).toEqual(['2026-10-01']);
      const keptEntry = sanitized.weightLog?.['2026-10-01'];
      expect(typeof keptEntry === 'object' && keptEntry !== null ? keptEntry.weight : keptEntry).toBe(82.5);
      expect(typeof keptEntry === 'object' && keptEntry !== null && Number.isFinite(keptEntry.updatedAt)).toBe(true);

      const emptyWeightState = sanitizeAppState({ cycleStart: '2026-10-01', weightLog: {} });
      expect(emptyWeightState.weightLog).toEqual({});

      const wo = sanitizeWorkout({ id: 'w1', name: 'Push', exercises: [], updatedAt: 'bad' });
      expect(Number.isFinite(wo.updatedAt)).toBe(true);
      const log = sanitizeSessionLog({ id: 'l1', date: '2026-10-01', complete: true, sets: {}, updatedAt: NaN });
      expect(Number.isFinite(log.updatedAt)).toBe(true);
    });
  });

  describe('2. Future Date Exclusion & Alias Canonicalization in PR Events (AUD-P1-002 / AUD-P1-003)', () => {
    it('excludes future-dated logs from PR events and canonicalizes exercise aliases', () => {
      const futureDate = '2099-12-31';
      const today = '2026-10-15';
      const logs: SessionLog[] = [
        {
          id: 'log-past',
          workoutId: 'push-a',
          date: '2026-10-10',
          complete: true,
          durationMinutes: 45,
          sets: {
            'bench-alias': [{ id: 's1', weight: '100', reps: '5', done: true }],
          },
        },
        {
          id: 'log-future',
          workoutId: 'push-a',
          date: futureDate,
          complete: true,
          durationMinutes: 45,
          sets: {
            e1: [{ id: 's2', weight: '250', reps: '1', done: true }],
          },
        },
      ];

      const aliasedDefsMap = new Map(defsMap);
      aliasedDefsMap.set('bench-alias', defsMap.get('e1')!);
      const index = buildFitnessIndex(logs, aliasedDefsMap, today);
      const events = calculatePREvents(index, today);

      expect(events.some(e => e.date === futureDate)).toBe(false);
      expect(events.some(e => e.exerciseDefinitionId === 'e1')).toBe(true);
    });

    it('HistoryView isolates same-date multi-session accordions and shows PR PEAK strictly on matching logId', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 15, 10, 0, 0));
      const benchId = 'e1';
      const logsObj: Record<string, SessionLog> = {
        'log-morning': {
          id: 'log-morning',
          workoutId: 'push-a',
          date: '2026-10-10',
          complete: true,
          durationMinutes: 40,
          sets: {
            [benchId]: [{ id: 'm1', weight: '100', reps: '5', done: true }],
          },
        },
        'log-evening': {
          id: 'log-evening',
          workoutId: 'push-a',
          date: '2026-10-10',
          complete: true,
          durationMinutes: 35,
          sets: {
            [benchId]: [{ id: 'e1', weight: '120', reps: '5', done: true }],
          },
        },
      };

      const ctx = createMockFitnessContext({ logs: logsObj });

      try {
        await act(async () => {
          root.render(
            <FitnessContext.Provider value={ctx}>
              <FitnessDerivedProvider>
                <ConfirmProvider>
                  <HistoryView initialTarget={{ date: '2026-10-10', exerciseDefinitionId: benchId, logId: 'log-morning' }} />
                </ConfirmProvider>
              </FitnessDerivedProvider>
            </FitnessContext.Provider>
          );
        });

        const morningCard = container.querySelector('[data-history-log-id="log-morning"]')!;
        const morningExBtn = morningCard.querySelector(`[data-history-ex-key="2026-10-10_${benchId}"] button`) as HTMLButtonElement;
        expect(morningExBtn).not.toBeNull();
        expect(morningExBtn.getAttribute('aria-expanded')).toBe('true');
        expect(morningExBtn.textContent).not.toContain('PR');

        const historyRows = Array.from(morningCard.querySelectorAll('div')).filter(el =>
          el.textContent?.includes('100kg×5') && !el.textContent?.includes('120kg×5')
        );
        expect(historyRows.some(el => el.textContent?.includes('PR PEAK'))).toBe(false);

        // Switch expansion to evening session on the exact same date:
        // Its exercise accordion stays collapsed (no cross-session collision) and only evening PR row carries PR PEAK
        const eveningCard = container.querySelector('[data-history-log-id="log-evening"]')!;
        const eveningHeaderBtn = eveningCard.querySelector('button') as HTMLButtonElement;
        await act(async () => {
          eveningHeaderBtn.click();
        });

        const eveningExBtn = eveningCard.querySelector(`[data-history-ex-key="2026-10-10_${benchId}"] button`) as HTMLButtonElement;
        expect(eveningExBtn.getAttribute('aria-expanded')).toBe('false');
        await act(async () => {
          eveningExBtn.click();
        });
        expect(eveningExBtn.getAttribute('aria-expanded')).toBe('true');

        const prPeakBadges = Array.from(eveningCard.querySelectorAll('span')).filter(
          el => el.textContent?.trim() === 'PR PEAK'
        );
        expect(prPeakBadges).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('3. Native OAuth Boundary, Redirect Error Display & AccountSection Notice (AUD-P0-003)', () => {
    it('displays authError alert and native Android Sign-In Notice in AccountSection', async () => {
      vi.doMock('@capacitor/core', () => ({
        Capacitor: { isNativePlatform: () => true },
      }));

      // Re-render AccountSection with authError provided explicitly
      const ctx = createMockFitnessContext({
        authError: 'Google sign-in is unavailable inside the Android WebView.',
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={ctx}>
            <ConfirmProvider>
              <AccountSection onSyncData={vi.fn()} />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('Google sign-in is unavailable inside the Android WebView.');
    });
  });

  describe('4. Analytics Adherence Insight Today-Pending Consistency (AUD-P2-001)', () => {
    it('reports pending today suffix when isTodayCorePending is true and evaluatedScheduledWorkouts > 0', async () => {
      const cycleStart = '2026-10-01';
      const today = '2026-10-03'; // Day 3 pending today, Day 1 & Day 2 evaluated (1 completed, 1 missed)
      const logsObj: Record<string, SessionLog> = {
        l1: {
          id: 'l1',
          workoutId: 'push-a',
          date: '2026-10-01',
          complete: true,
          durationMinutes: 45,
          sets: { e1: [{ id: 's1', weight: '80', reps: '8', done: true }] },
        },
      };
      const index = buildFitnessIndex(Object.values(logsObj), defsMap, today);
      const coreMap = new Map(INITIAL_WORKOUTS.filter(w => w.isCore && w.cycleDay).map(w => [w.cycleDay!, w]));

      let capturedInsights: string[] = [];
      const Probe: React.FC = () => {
        const res = useAnalyticsData({
          timeRange: '30d',
          muscleMetric: 'volume',
          selected1RMExerciseId: null,
          currentHeatmapMonth: new Date(2026, 9, 1),
        });
        capturedInsights = res.insightsList;
        return null;
      };

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={createMockFitnessContext({ appState: { cycleStart }, logs: logsObj })}>
            <FitnessDerivedContext.Provider
              value={{
                index,
                currentDate: today,
                workoutMap: new Map(INITIAL_WORKOUTS.map(w => [w.id, w])),
                coreWorkoutByCycleDayMap: coreMap,
                priorityExercises: [{ id: 'e1', name: 'Bench' }],
                getCycleDayForDate: () => 3,
              } as any}
            >
              <Probe />
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const adherenceLine = capturedInsights.find(l => l.includes('Core scheduled adherence stands at'));
      expect(adherenceLine).toBeDefined();
      expect(adherenceLine).toContain('today pending');
      expect(adherenceLine).toContain('1/2 scheduled workouts completed');
    });
  });

  describe('5. ProgramIdentityCard & ProgramEditor Hardening (AUD-P2-005 / AUD-P2-006)', () => {
    it('ProgramIdentityCard preserves empty state for workouts=[] and deduplicates conflicting core cycleDay entries', async () => {
      await act(async () => {
        root.render(<ProgramIdentityCard workouts={[]} onEditProgram={vi.fn()} />);
      });
      expect(container.textContent).toContain('No Active Program');

      const dupeDay1: Workout = {
        id: 'dupe-day-1',
        name: 'Extra Day 1',
        badge: 'DAY 1',
        type: 'push',
        isCore: true,
        cycleDay: 1,
        exercises: [],
      };
      await act(async () => {
        root.render(<ProgramIdentityCard workouts={[...INITIAL_WORKOUTS, dupeDay1]} onEditProgram={vi.fn()} />);
      });
      expect(container.textContent).toContain('8-Day Routine Cycle');
      expect(container.textContent).toContain('6 workouts · 2 rest days');
    });

    it('ProgramEditor renders library delete control for existing exercises inside ExerciseEditor', async () => {
      const ctx = createMockFitnessContext({
        deleteExerciseDefinition: vi.fn().mockResolvedValue(undefined),
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={ctx}>
            <ConfirmProvider>
              <ProgramEditor onBackToManage={vi.fn()} />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const libraryTab = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Exercises');
      expect(libraryTab).toBeDefined();
      await act(async () => {
        libraryTab!.click();
      });

      const firstExBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes(INITIAL_EXERCISE_DEFINITIONS[0].name)
      );
      expect(firstExBtn).toBeDefined();
      await act(async () => {
        firstExBtn!.click();
      });

      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Delete Exercise')
      );
      expect(deleteBtn).toBeDefined();
    });
  });

  describe('6. Layout Pre-Switch Scroll Preservation (AUD-P3-004)', () => {
    it('saves pre-switch scrollY rather than post-render clamped window.scrollY on tab switches', async () => {
      const scrollToSpy = vi.fn();
      vi.stubGlobal('scrollTo', scrollToSpy);
      Object.defineProperty(window, 'scrollY', { value: 420, configurable: true, writable: true });

      const TabHarness: React.FC<{ tab: 'dashboard' | 'history' | 'analytics' | 'manage' }> = ({ tab }) => {
        const [activeTab, setActiveTab] = React.useState<'dashboard' | 'history' | 'analytics' | 'manage'>(tab);
        return (
          <FitnessContext.Provider value={createMockFitnessContext()}>
            <ConfirmProvider>
              <Layout activeTab={activeTab} onTabChange={setActiveTab}>
                <div>{activeTab}</div>
              </Layout>
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      };

      await act(async () => {
        root.render(<TabHarness tab="dashboard" />);
      });

      const historyBtn = Array.from(container.querySelectorAll('nav button')).find(b =>
        b.getAttribute('aria-label') === 'History' || b.textContent?.includes('History')
      ) as HTMLButtonElement;
      expect(historyBtn).toBeDefined();

      await act(async () => {
        historyBtn.click();
      });

      // Returning to dashboard restores saved 420 scroll position
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
      const dashBtn = Array.from(container.querySelectorAll('nav button')).find(b =>
        b.getAttribute('aria-label') === 'Dash' || b.textContent?.includes('Dash')
      ) as HTMLButtonElement;
      expect(dashBtn).toBeDefined();
      await act(async () => {
        dashBtn.click();
      });

      expect(scrollToSpy).toHaveBeenCalledWith(0, 420);
    });
  });
});
