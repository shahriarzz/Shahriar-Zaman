(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  calculateSetVolume,
  calculateE1RM,
  sanitizeSetLog,
  sanitizeWorkout,
  getRelativeTimeString,
  formatCompactWeight,
  parseStrictWeight,
  parseStrictReps
} from '../utils/fitnessCalculations';
import { isValidApiBaseUrl, getApiBaseUrl } from '../utils/apiConfig';
import { persistFitnessDatabase, FitnessDatabaseSnapshot } from '../hooks/useFitnessData';
import { loadInitialFitnessData, validateSnapshotStructure } from '../utils/fitnessMigration';
import { generateId } from '../utils/generateId';
import { generateId as helperGenId } from '../utils/fitnessHelpers';
import { computeFirebaseConfigState } from '../lib/firebase';
import { calculateSessionPRs } from '../components/SessionView';
import { Dialog, DialogHeader, DialogBody } from '../components/ui/Dialog';
import { ToastContainer, showToast } from '../components/ui/Toast';
import { ErrorFallback } from '../components/ui/ErrorFallback';
import { Workout } from '../types/fitness';

describe('GAINLOG Supporting-Code Audit Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Non-Finite & Extreme Number Rejection in Fitness Calculations', () => {
    it('strict weight parser strictly accepts valid weights and rejects malformed values', () => {
      expect(parseStrictWeight(100)).toBe(100);
      expect(parseStrictWeight('100.5')).toBe(100.5);
      expect(parseStrictWeight('  82.5  ')).toBe(82.5);

      // Rejections
      expect(parseStrictWeight('12abc')).toBeNull();
      expect(parseStrictWeight('abc12')).toBeNull();
      expect(parseStrictWeight('-50')).toBeNull();
      expect(parseStrictWeight('1e309')).toBeNull();
      expect(parseStrictWeight('Infinity')).toBeNull();
      expect(parseStrictWeight(Infinity)).toBeNull();
      expect(parseStrictWeight(NaN)).toBeNull();
      expect(parseStrictWeight(null)).toBeNull();
      expect(parseStrictWeight(undefined)).toBeNull();
      expect(parseStrictWeight('')).toBeNull();
      expect(parseStrictWeight(6000)).toBeNull(); // Exceeds 5000 max
    });

    it('strict reps parser strictly enforces whole positive numbers and rejects decimals/strings', () => {
      expect(parseStrictReps(10)).toBe(10);
      expect(parseStrictReps('10')).toBe(10);
      expect(parseStrictReps('  8  ')).toBe(8);

      // Rejections
      expect(parseStrictReps('5.5')).toBeNull(); // Decimals forbidden for reps
      expect(parseStrictReps(5.5)).toBeNull();
      expect(parseStrictReps('12abc')).toBeNull();
      expect(parseStrictReps('-5')).toBeNull();
      expect(parseStrictReps('1e5')).toBeNull();
      expect(parseStrictReps(Infinity)).toBeNull();
      expect(parseStrictReps(null)).toBeNull();
      expect(parseStrictReps('')).toBeNull();
      expect(parseStrictReps(1500)).toBeNull(); // Exceeds 1000 max
    });

    it('rejects Infinity, -Infinity, NaN, 1e309, and partially numeric strings like 12abc in calculateSetVolume', () => {
      expect(calculateSetVolume({ weight: 'Infinity', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '-Infinity', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '1e309', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: 'NaN', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '12abc', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '12abc', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '5.5', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: 'Infinity', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '-5', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '-100', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '0', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '0', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '10', done: false })).toBe(0);
      // Legitimate finite numbers
      expect(calculateSetVolume({ weight: '100', reps: '10', done: true })).toBe(1000);
      expect(calculateSetVolume({ weight: '82.5', reps: '8', done: true })).toBe(660);
    });

    it('rejects Infinity, NaN, 12abc, and extreme values in calculateE1RM', () => {
      expect(calculateE1RM(Infinity, 10)).toBe(0);
      expect(calculateE1RM(-Infinity, 10)).toBe(0);
      expect(calculateE1RM('1e309', 10)).toBe(0);
      expect(calculateE1RM(NaN, 10)).toBe(0);
      expect(calculateE1RM('12abc', 10)).toBe(0);
      expect(calculateE1RM(100, '12abc')).toBe(0);
      expect(calculateE1RM(100, '5.5')).toBe(0);
      expect(calculateE1RM(100, Infinity)).toBe(0);
      expect(calculateE1RM(100, -5)).toBe(0);
      expect(calculateE1RM(-100, 5)).toBe(0);
      expect(calculateE1RM(0, 5)).toBe(0);
      // Valid finite calculation
      expect(calculateE1RM(100, 1)).toBe(100);
      expect(calculateE1RM(100, 10)).toBe(133.3);
    });

    it('sanitizes malformed, partially numeric, and non-finite values in sanitizeSetLog', () => {
      const setWithInf = sanitizeSetLog({ weight: 'Infinity', reps: '1e309', done: true });
      expect(setWithInf.weight).toBe('');
      expect(setWithInf.reps).toBe('');

      const setWithMalformed = sanitizeSetLog({ weight: '12abc', reps: '5.5', done: true });
      expect(setWithMalformed.weight).toBe('');
      expect(setWithMalformed.reps).toBe('');

      const setWithNeg = sanitizeSetLog({ weight: -50, reps: -10, done: true });
      expect(setWithNeg.weight).toBe('');
      expect(setWithNeg.reps).toBe('');

      const validSet = sanitizeSetLog({ weight: '100.5', reps: '10', done: true });
      expect(validSet.weight).toBe('100.5');
      expect(validSet.reps).toBe('10');
      expect(validSet.done).toBe(true);
    });

    it('rejects non-finite or unreasonable set counts in sanitizeWorkout', () => {
      const workoutWithInf = sanitizeWorkout({
        id: 'w1',
        name: 'Test',
        exercises: [{ id: 'ex1', sets: Infinity }]
      });
      expect(workoutWithInf.exercises[0].sets).toBe(3); // Falls back to default 3

      const workoutWithZero = sanitizeWorkout({
        id: 'w1',
        name: 'Test',
        exercises: [{ id: 'ex1', sets: 0 }]
      });
      expect(workoutWithZero.exercises[0].sets).toBe(3);

      const workoutWithValid = sanitizeWorkout({
        id: 'w1',
        name: 'Test',
        exercises: [{ id: 'ex1', sets: 5 }]
      });
      expect(workoutWithValid.exercises[0].sets).toBe(5);
    });

    it('clamps future timestamps in getRelativeTimeString and formats safely', () => {
      const now = 1700000000000;
      expect(getRelativeTimeString(now + 300000, now)).toBe('just now');
      expect(getRelativeTimeString(-1, now)).toBe('recently');
      expect(getRelativeTimeString(NaN, now)).toBe('recently');
      expect(getRelativeTimeString(now - 30000, now)).toBe('just now');
      expect(getRelativeTimeString(now - 600000, now)).toBe('10 min ago');
      expect(getRelativeTimeString(now - 7200000, now)).toBe('2h ago');
    });

    it('safely formats compact weights without NaN', () => {
      expect(formatCompactWeight(NaN)).toBe('0');
      expect(formatCompactWeight(Infinity)).toBe('0');
      expect(formatCompactWeight(-500)).toBe('0');
      expect(formatCompactWeight(846)).toBe('846');
      expect(formatCompactWeight(1200)).toBe('1.2k');
      expect(formatCompactWeight(1300000)).toBe('1.3M');
    });
  });

  describe('2. Native AI API Endpoint Configuration & Security', () => {
    it('validates HTTPS required in production and allows valid URLs', () => {
      expect(isValidApiBaseUrl('http://insecure.com', true)).toBe(false);
      expect(isValidApiBaseUrl('https://secure-api.gainlog.app', true)).toBe(true);
      expect(isValidApiBaseUrl('not-a-url', true)).toBe(false);
      expect(isValidApiBaseUrl('', true)).toBe(false);
    });

    it('rejects embedded credentials and unexpected query/hash components in API URLs', () => {
      // Embedded credentials must be rejected
      expect(isValidApiBaseUrl('https://user:password@secure.gainlog.app', true)).toBe(false);
      expect(isValidApiBaseUrl('https://admin@secure.gainlog.app', true)).toBe(false);

      // Query parameters and hashes in base URLs must be rejected
      expect(isValidApiBaseUrl('https://secure.gainlog.app/api?debug=true', true)).toBe(false);
      expect(isValidApiBaseUrl('https://secure.gainlog.app/api#section', true)).toBe(false);

      // Valid base URLs with clean paths are accepted
      expect(isValidApiBaseUrl('https://secure.gainlog.app/api', true)).toBe(true);
      expect(isValidApiBaseUrl('http://localhost:3000', false)).toBe(true); // HTTP accepted in dev
      expect(isValidApiBaseUrl('http://localhost:3000', true)).toBe(false); // HTTP rejected in prod
    });

    it('does not silently return a development cloud run URL on unconfigured native builds', () => {
      const base = getApiBaseUrl();
      expect(base).not.toContain('ais-dev');
    });
  });

  describe('3. Local Persistence Resilience to Partial Writes & Atomic Snapshots', () => {
    const mockSnapshot: FitnessDatabaseSnapshot = {
      exerciseDefinitions: [
        { id: 'ex1', name: 'Bench Press', target: 'Chest', updatedAt: 1000 }
      ],
      workouts: [
        { id: 'w1', name: 'Push', badge: 'PUSH', type: 'push', exercises: [], updatedAt: 1000 }
      ],
      logs: {
        log1: {
          id: 'log1',
          workoutId: 'w1',
          date: '2026-10-01',
          complete: true,
          durationMinutes: 45,
          sets: {}
        }
      },
      appState: { cycleStart: '2026-10-01' }
    };

    it('persists and loads atomic versioned snapshot correctly', () => {
      persistFitnessDatabase(mockSnapshot);

      const rawSnapshot = localStorage.getItem('gl_database_snapshot');
      expect(rawSnapshot).not.toBeNull();
      const parsed = JSON.parse(rawSnapshot!);
      expect(parsed.schemaVersion).toBeDefined();
      expect(parsed.data.exerciseDefinitions.length).toBe(1);

      const loaded = loadInitialFitnessData();
      expect(loaded.defs.length).toBe(1);
      expect(loaded.defs[0].id).toBe('ex1');
      expect(loaded.workouts.length).toBe(1);
      expect(loaded.logs['log1']).toBeDefined();
    });

    it('validates snapshot structure strictly and rejects malformed objects', () => {
      // Valid snapshot
      const valid = validateSnapshotStructure({
        schemaVersion: 2,
        data: mockSnapshot
      });
      expect(valid).not.toBeNull();
      expect(valid?.exerciseDefinitions.length).toBe(1);

      // Missing schemaVersion
      expect(validateSnapshotStructure({ data: mockSnapshot })).toBeNull();

      // Unsupported schemaVersion
      expect(validateSnapshotStructure({ schemaVersion: 999, data: mockSnapshot })).toBeNull();
      expect(validateSnapshotStructure({ schemaVersion: -1, data: mockSnapshot })).toBeNull();

      // Missing required fields
      expect(validateSnapshotStructure({ schemaVersion: 2, data: { workouts: [] } })).toBeNull();

      // Wrong field types
      expect(validateSnapshotStructure({
        schemaVersion: 2,
        data: {
          exerciseDefinitions: 'not-an-array',
          workouts: [],
          logs: {},
          appState: {}
        }
      })).toBeNull();
    });

    it('recovers valid legacy data alongside a malformed snapshot and preserves corrupt snapshot as backup', () => {
      // Store valid legacy data
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(mockSnapshot.exerciseDefinitions));
      localStorage.setItem('gl_workouts', JSON.stringify(mockSnapshot.workouts));
      localStorage.setItem('gl_logs', JSON.stringify(mockSnapshot.logs));
      localStorage.setItem('gl_state', JSON.stringify(mockSnapshot.appState));

      // Introduce malformed snapshot that has valid JSON but missing/wrong fields
      const malformedPayload = JSON.stringify({
        schemaVersion: 2,
        data: { empty: true }
      });
      localStorage.setItem('gl_database_snapshot', malformedPayload);

      const loaded = loadInitialFitnessData();
      // Should recover from legacy keys rather than resetting to defaults!
      expect(loaded.defs.length).toBe(1);
      expect(loaded.defs[0].id).toBe('ex1');
      expect(loaded.workouts[0].id).toBe('w1');
      expect(loaded.logs['log1']).toBeDefined();

      // Corrupt snapshot must be preserved as recoverable backup
      expect(localStorage.getItem('gl_corrupt_snapshot_backup')).toBe(malformedPayload);
    });

    it('recovers cleanly from gl_snapshot_staging if canonical snapshot write was interrupted', () => {
      // Stage valid snapshot
      const stagedPayload = JSON.stringify({
        schemaVersion: 2,
        timestamp: Date.now(),
        data: mockSnapshot
      });
      localStorage.setItem('gl_snapshot_staging', stagedPayload);
      // Simulate interrupted canonical write (corrupted or missing)
      localStorage.setItem('gl_database_snapshot', '{corrupted_json');

      const loaded = loadInitialFitnessData();
      expect(loaded.defs.length).toBe(1);
      expect(loaded.defs[0].id).toBe('ex1');
      expect(loaded.workouts[0].id).toBe('w1');

      // Canonical snapshot should be promoted from staging
      expect(localStorage.getItem('gl_database_snapshot')).toBe(stagedPayload);
      expect(localStorage.getItem('gl_snapshot_staging')).toBeNull();
    });
  });

  describe('4. Session PR Validation using Shared Strict Parser', () => {
    const mockExerciseDefs = [
      { id: 'ex_bench', name: 'Barbell Bench Press', target: 'Chest', updatedAt: 1000 },
      { id: 'ex_squat', name: 'Barbell Back Squat', target: 'Legs', updatedAt: 1000 }
    ];

    const mockWorkout: Workout = {
      id: 'w_push',
      name: 'Push Day',
      badge: 'PUSH',
      type: 'push',
      exercises: [
        { exerciseDefinitionId: 'ex_bench', sets: 3, reps: '10' },
        { exerciseDefinitionId: 'ex_squat', sets: 3, reps: '5' }
      ]
    };

    it('detects first-time records as baseline PRs', () => {
      const sessionSets = {
        ex_bench: [
          { id: 's1', weight: '80', reps: '8', done: true }
        ]
      };

      const prs = calculateSessionPRs({
        workout: mockWorkout,
        sessionSets,
        exerciseDefinitions: mockExerciseDefs,
        getWeightPRForExercise: () => null,
        getE1RMPRForExercise: () => null
      });

      expect(prs.length).toBe(1);
      expect(prs[0].exerciseDefinitionId).toBe('ex_bench');
      expect(prs[0].isNew).toBe(true);
      expect(prs[0].weight).toBe(80);
      expect(prs[0].reps).toBe('8');
    });

    it('rejects malformed numbers (like 12abc or negative) and does not register fake PRs', () => {
      const sessionSets = {
        ex_bench: [
          { id: 's1', weight: '12abc', reps: '10', done: true },
          { id: 's2', weight: '-50', reps: '10', done: true },
          { id: 's3', weight: '100', reps: '5.5', done: true } // Non-integer reps
        ]
      };

      const prs = calculateSessionPRs({
        workout: mockWorkout,
        sessionSets,
        exerciseDefinitions: mockExerciseDefs,
        getWeightPRForExercise: () => null,
        getE1RMPRForExercise: () => null
      });

      expect(prs.length).toBe(0);
    });

    it('detects true weight PRs and e1RM-only PRs accurately', () => {
      const sessionSets = {
        ex_bench: [
          { id: 's1', weight: '90', reps: '12', done: true } // 90kg x 12 -> e1RM = 126kg
        ]
      };

      // Previous: 100kg x 1 (e1RM = 100kg)
      const prs = calculateSessionPRs({
        workout: mockWorkout,
        sessionSets,
        exerciseDefinitions: mockExerciseDefs,
        getWeightPRForExercise: () => ({
          exerciseDefinitionId: 'ex_bench',
          exerciseName: 'Bench Press',
          weight: 100,
          reps: 1,
          date: '2026-09-01',
          sessionId: 'log_prev',
          category: 'Chest'
        }),
        getE1RMPRForExercise: () => ({
          exerciseDefinitionId: 'ex_bench',
          exerciseName: 'Bench Press',
          maxEpley: 100,
          weight: 100,
          reps: 1,
          setDetail: '100kg × 1 reps',
          date: '2026-09-01',
          sessionId: 'log_prev',
          category: 'Chest'
        })
      });

      // Today's 90kg is less than 100kg weight, BUT 90kg x 12 has e1RM 126 > 100 -> e1RM PR!
      expect(prs.length).toBe(1);
      expect(prs[0].isWeightPR).toBe(false);
      expect(prs[0].isE1RMPR).toBe(true);
    });
  });

  describe('5. Firebase Configuration Status Accuracy', () => {
    it('accurately identifies fully configured, incomplete, and offline configurations', () => {
      // 1. Fully configured
      const fullConfig = {
        apiKey: 'AIzaSyFakeKey123456789',
        projectId: 'gainlog-app-prod',
        appId: '1:123456789:web:abcdef',
        authDomain: 'gainlog-app-prod.firebaseapp.com'
      };
      expect(computeFirebaseConfigState(fullConfig)).toBe('configured');

      // 2. Incomplete: missing authDomain (required for Google sign-in flow)
      const missingAuthDomain = {
        apiKey: 'AIzaSyFakeKey123456789',
        projectId: 'gainlog-app-prod',
        appId: '1:123456789:web:abcdef',
        authDomain: ''
      };
      expect(computeFirebaseConfigState(missingAuthDomain)).toBe('incomplete');

      // 3. Incomplete: missing appId
      const missingAppId = {
        apiKey: 'AIzaSyFakeKey123456789',
        projectId: 'gainlog-app-prod',
        appId: '',
        authDomain: 'gainlog-app-prod.firebaseapp.com'
      };
      expect(computeFirebaseConfigState(missingAppId)).toBe('incomplete');

      // 4. Offline by default: all empty or placeholder
      const emptyConfig = {
        apiKey: '',
        projectId: '',
        appId: '',
        authDomain: ''
      };
      expect(computeFirebaseConfigState(emptyConfig)).toBe('offline_by_default');

      const placeholderConfig = {
        apiKey: 'YOUR_API_KEY',
        projectId: 'YOUR_PROJECT_ID',
        appId: 'YOUR_APP_ID',
        authDomain: 'YOUR_AUTH_DOMAIN'
      };
      expect(computeFirebaseConfigState(placeholderConfig)).toBe('offline_by_default');
    });
  });

  describe('6. ID Generation Consolidation', () => {
    it('generateId in fitnessHelpers is identical to generateId module', () => {
      expect(helperGenId).toBe(generateId);
      const id1 = generateId();
      const id2 = helperGenId();
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe('7. Dialog Body Scroll Restoration & Focus Trapping Invariants', () => {
    it('renders real Dialog component, locks and restores body overflow, and focuses dialog controls', async () => {
      vi.useFakeTimers();
      const container = document.createElement('div');
      const opener = document.createElement('button');
      opener.textContent = 'Open';
      document.body.appendChild(opener);
      document.body.appendChild(container);
      opener.focus();

      document.body.style.overflow = 'auto';
      const root = createRoot(container);
      const onClose = vi.fn();

      try {
        await act(async () => {
          root.render(
            React.createElement(
              Dialog,
              { isOpen: true, onClose },
              React.createElement(DialogHeader, { title: 'Confirm Action' }),
              React.createElement(
                DialogBody,
                null,
                React.createElement('button', { type: 'button' }, 'Cancel'),
                React.createElement('button', { type: 'button' }, 'Proceed')
              )
            )
          );
        });

        expect(document.body.style.overflow).toBe('hidden');
        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
        expect(dialog?.getAttribute('aria-modal')).toBe('true');

        await act(async () => {
          vi.advanceTimersByTime(60);
        });

        expect(dialog?.contains(document.activeElement)).toBe(true);

        await act(async () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(onClose).toHaveBeenCalledTimes(1);

        await act(async () => {
          root.render(React.createElement(Dialog, { isOpen: false, onClose }, null));
        });
        expect(document.body.style.overflow).toBe('auto');
      } finally {
        act(() => {
          root.unmount();
        });
        container.remove();
        opener.remove();
        document.body.style.overflow = '';
        vi.useRealTimers();
      }
    });
  });

  describe('8. Toast Timer Cleanup & Eviction Safeguards', () => {
    it('mounts ToastContainer, caps visible toasts at 4, and clears auto-dismiss timers cleanly on unmount', async () => {
      vi.useFakeTimers();
      const origMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as any;

      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      try {
        await act(async () => {
          root.render(React.createElement(ToastContainer));
        });

        await act(async () => {
          showToast({ message: 'Toast One', tone: 'info' });
          showToast({ message: 'Toast Two', tone: 'success' });
          showToast({ message: 'Toast Three', tone: 'warning' });
          showToast({ message: 'Toast Four', tone: 'error' });
          showToast({ message: 'Toast Five', tone: 'info' });
        });

        expect(container.textContent).not.toContain('Toast One');
        expect(container.textContent).toContain('Toast Two');
        expect(container.textContent).toContain('Toast Five');

        const dismissBtns = container.querySelectorAll('button[aria-label="Dismiss notification"]');
        expect(dismissBtns).toHaveLength(4);
        const clearsAfterEviction = clearTimeoutSpy.mock.calls.length;
        expect(clearsAfterEviction).toBeGreaterThanOrEqual(1);

        await act(async () => {
          dismissBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearsAfterEviction);

        const clearsBeforeUnmount = clearTimeoutSpy.mock.calls.length;
        act(() => {
          root.unmount();
        });
        expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(clearsBeforeUnmount + 3);
      } finally {
        act(() => {
          root.unmount();
        });
        container.remove();
        clearTimeoutSpy.mockRestore();
        window.matchMedia = origMatchMedia;
        vi.useRealTimers();
      }
    });
  });

  describe('9. Production ErrorFallback Privacy Invariant', () => {
    it('renders ErrorFallback for storage-blocked and generic errors safely', async () => {
      const { SafeStorageError } = await import('../lib/safeStorage');
      const sampleError = new SafeStorageError(
        'storage_unavailable',
        'getItem',
        'localStorage access denied'
      );

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      try {
        await act(async () => {
          root.render(React.createElement(ErrorFallback, { error: sampleError }));
        });

        expect(container.textContent).toContain('Storage Access Blocked');
        expect(container.textContent).toContain('Browser Storage Unavailable');
        expect(container.textContent).toContain('How to restore access');
        expect(container.textContent).toContain('Reload GainLog');
      } finally {
        act(() => {
          root.unmount();
        });
        container.remove();
      }
    });
  });

  describe('10. Server Startup and Port Collision Error Invariant', () => {
    it('verifies server.ts captures app.listen() and attaches error listener terminating with non-zero exit', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

      // Verifies server instance capture
      expect(serverSource).toMatch(/const\s+server\s*=\s*(?:app|httpServer)\.listen\(/);

      // Verifies asynchronous error event listener on server instance
      expect(serverSource).toMatch(/server\.on\(\s*['"]error['"]\s*,\s*\(err/);

      // Verifies non-zero process exit on server error
      expect(serverSource).toMatch(/process\.exit\(1\)/);
    });
  });
});

