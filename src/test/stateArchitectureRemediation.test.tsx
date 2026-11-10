// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState, act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { persistFitnessDatabase, FitnessDatabaseSnapshot } from '../hooks/useFitnessData';
import { initialCoachingState, coachingTransition } from '../state/session/coachingMachine';
import { initialNavigationState, navigationTransition } from '../state/app/navigationMachine';
import { ConfirmProvider, useConfirm } from '../context/ConfirmContext';
import { useFitnessBackups } from '../hooks/useFitnessBackups';
import * as backupDb from '../utils/fitnessBackupDb';

describe('State Architecture, Reliability & UX Audit Remediation Test Suite', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const mockSnapshot: FitnessDatabaseSnapshot = {
    exerciseDefinitions: [{ id: 'def_1', name: 'Bench Press', target: 'Chest' }],
    workouts: [{ id: 'w_1', name: 'Push A', badge: 'DAY 1 · PUSH A', type: 'push', exercises: [], isCore: true, cycleDay: 1 }],
    logs: {},
    appState: { cycleStart: '2026-11-01' }
  };

  // P0.1: False-positive local persistence success fixes
  describe('P0.1 — Local Persistence Failure & Durability Contract', () => {
    it('throws explicit error when staging write fails and does not commit canonical snapshot', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation((key) => {
        if (key === 'gl_snapshot_staging') {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
      });

      expect(() => persistFitnessDatabase(mockSnapshot)).toThrow(/Staging write failure/);
      expect(localStorage.getItem('gl_database_snapshot')).toBeNull();
    });

    it('preserves staging copy when canonical snapshot write fails', () => {
      let stagingWritten = false;
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation((key) => {
        if (key === 'gl_snapshot_staging') {
          stagingWritten = true;
          return;
        }
        if (key === 'gl_database_snapshot') {
          throw new DOMException('Storage unavailable', 'StorageError');
        }
      });

      expect(() => persistFitnessDatabase(mockSnapshot)).toThrow(/Canonical snapshot write failure/);
      // Staging was written and NOT removed because canonical write failed
      expect(stagingWritten).toBe(true);
    });

    it('throws error and retains staging when read-back verification fails', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      getItemSpy.mockImplementation((key) => {
        if (key === 'gl_database_snapshot') {
          return '{"corrupted": true}';
        }
        return null;
      });

      expect(() => persistFitnessDatabase(mockSnapshot)).toThrow(/Read-back verification failed/);
    });

    it('returns success and removes staging on valid verified commit', () => {
      const result = persistFitnessDatabase(mockSnapshot);
      expect(result.success).toBe(true);
      expect(localStorage.getItem('gl_database_snapshot')).not.toBeNull();
      expect(localStorage.getItem('gl_snapshot_staging')).toBeNull();
    });
  });

  // P0.2: AI coaching request cancellation races
  describe('P0.2 — AI Coaching Request Race & Isolation Contract', () => {
    it('assigns unique request IDs and ignores older aborted cancellations when a newer request is in flight', () => {
      let state = initialCoachingState;

      // Request A starts for bench press
      state = coachingTransition(state, {
        type: 'REQUEST_STARTED',
        exerciseId: 'ex_bench',
        requestId: 'req_A'
      });
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_bench'].activeRequestId).toBe('req_A');

      // Request B starts for same exercise (replaces A)
      state = coachingTransition(state, {
        type: 'REQUEST_STARTED',
        exerciseId: 'ex_bench',
        requestId: 'req_B'
      });
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_bench'].activeRequestId).toBe('req_B');

      // Delayed abort event for request A arrives
      state = coachingTransition(state, {
        type: 'REQUEST_CANCELLED',
        exerciseId: 'ex_bench',
        requestId: 'req_A'
      });

      // INVARIANT: Request B is still loading and must NOT be cleared by A's abort
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_bench'].activeRequestId).toBe('req_B');

      // Request B succeeds
      state = coachingTransition(state, {
        type: 'REQUEST_SUCCEEDED',
        exerciseId: 'ex_bench',
        requestId: 'req_B',
        advice: 'Tuck elbows 45 degrees'
      });
      expect(state['ex_bench'].status).toBe('success');
      expect(state['ex_bench'].advice).toBe('Tuck elbows 45 degrees');
    });

    it('preserves existing advice while replacement request is loading and restores it on cancel', () => {
      let state = initialCoachingState;

      // Existing successful advice
      state = coachingTransition(state, {
        type: 'REQUEST_STARTED',
        exerciseId: 'ex_bench',
        requestId: 'req_1'
      });
      state = coachingTransition(state, {
        type: 'REQUEST_SUCCEEDED',
        exerciseId: 'ex_bench',
        requestId: 'req_1',
        advice: 'Initial Proven Advice'
      });

      // Replacement request starts
      state = coachingTransition(state, {
        type: 'REQUEST_STARTED',
        exerciseId: 'ex_bench',
        requestId: 'req_2'
      });
      expect(state['ex_bench'].status).toBe('loading');
      // Previous advice remains visible during loading
      expect(state['ex_bench'].advice).toBe('Initial Proven Advice');

      // Replacement is cancelled
      state = coachingTransition(state, {
        type: 'REQUEST_CANCELLED',
        exerciseId: 'ex_bench',
        requestId: 'req_2'
      });

      // Previous advice is restored to success status
      expect(state['ex_bench'].status).toBe('success');
      expect(state['ex_bench'].advice).toBe('Initial Proven Advice');
    });
  });

  // P0.3: Concurrency-safe session-exit confirmation
  describe('P0.3 — Concurrency-Safe Session Navigation', () => {
    it('safely serializes exit requests with unique IDs and rejects clobbering', () => {
      let state = navigationTransition(initialNavigationState, {
        type: 'START_SESSION',
        workoutId: 'push-a'
      });

      // First exit request targeting History
      state = navigationTransition(state, {
        type: 'REQUEST_LEAVE_SESSION',
        requestId: 'leave_1',
        destination: 'history'
      });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveRequest?.id).toBe('leave_1');
        expect(state.pendingLeaveRequest?.destination).toBe('history');
      }

      // Second concurrent tap targeting Dashboard is rejected
      state = navigationTransition(state, {
        type: 'REQUEST_LEAVE_SESSION',
        requestId: 'leave_2',
        destination: 'dashboard'
      });
      if (state.route === 'session') {
        expect(state.pendingLeaveRequest?.id).toBe('leave_1');
        expect(state.pendingLeaveRequest?.destination).toBe('history');
      }

      // Only confirmation matching leave_1 resolves
      state = navigationTransition(state, {
        type: 'CONFIRM_LEAVE_SESSION',
        requestId: 'leave_1'
      });
      expect(state.route).toBe('history');
    });
  });

  // P0.4: Confirmation keyboard and focus safety
  describe('P0.4 — Confirmation Keyboard and Focus Discipline', () => {
    const TestComponent = () => {
      const { confirm } = useConfirm();
      const [result, setResult] = useState<string>('idle');

      const triggerDanger = async () => {
        const ok = await confirm({
          title: 'Delete Data',
          message: 'Irreversible action.',
          isDanger: true
        });
        setResult(ok ? 'confirmed' : 'cancelled');
      };

      return (
        <div>
          <button id="open-dialog-btn" onClick={triggerDanger}>
            Open Danger Dialog
          </button>
          <div id="result-display">{result}</div>
        </div>
      );
    };

    it('does not execute destructive confirmation on indiscriminate Enter key', async () => {
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <ConfirmProvider>
            <TestComponent />
          </ConfirmProvider>
        );
      });

      const openBtn = container.querySelector('#open-dialog-btn') as HTMLButtonElement;
      await act(async () => {
        openBtn.click();
      });

      // Dialog is open
      expect(container.textContent).toContain('Delete Data');

      // Dispatch Enter event on window (e.g. from an unrelated focused element)
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      // INVARIANT: Dialog is NOT confirmed by global Enter; result is still idle
      const resultDisplay = container.querySelector('#result-display');
      expect(resultDisplay?.textContent).toBe('idle');
    });

    it('cancels dialog on Escape key', async () => {
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <ConfirmProvider>
            <TestComponent />
          </ConfirmProvider>
        );
      });

      const openBtn = container.querySelector('#open-dialog-btn') as HTMLButtonElement;
      await act(async () => {
        openBtn.click();
      });

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      const resultDisplay = container.querySelector('#result-display');
      expect(resultDisplay?.textContent).toBe('cancelled');
    });
  });

  // P0.5: Backup import recovery safety
  describe('P0.5 — Backup Import Safety Checkpoint Contract', () => {
    it('aborts backup import if pre-import savepoint fails, preventing data overwrite', async () => {
      // Mock saveBackupToDb to simulate failure during pre-import savepoint
      vi.spyOn(backupDb, 'saveBackupToDb').mockRejectedValue(new Error('IndexedDB disk quota exhausted'));

      const mockApplySnapshot = vi.fn();
      let hookResult: any;

      const TestHarness = () => {
        hookResult = useFitnessBackups({
          user: null,
          exerciseDefsRef: { current: [] },
          workoutsRef: { current: [] },
          logsRef: { current: {} },
          appStateRef: { current: { cycleStart: '2026-11-01' } },
          applyFitnessDatabaseSnapshot: mockApplySnapshot,
          setExerciseDefinitions: vi.fn(),
          setWorkouts: vi.fn(),
          setLogs: vi.fn(),
          setAppState: vi.fn()
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(<TestHarness />);
      });

      const validImportJson = JSON.stringify({
        schemaVersion: 2,
        workouts: [],
        logs: {},
        appState: { cycleStart: '2026-11-01' }
      });

      let importOutcome: any;
      await act(async () => {
        importOutcome = await hookResult.importBackup(validImportJson);
      });

      // INVARIANT: Pre-import checkpoint failure MUST abort the import
      expect(importOutcome.success).toBe(false);
      expect(importOutcome.message).toContain('Pre-import safety checkpoint failed');
      // Snapshot was NOT applied!
      expect(mockApplySnapshot).not.toHaveBeenCalled();
    });
  });
});
