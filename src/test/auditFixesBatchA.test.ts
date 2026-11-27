// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_EXERCISE_DEFINITIONS, INITIAL_WORKOUTS } from '../types/initialData';
import { Workout } from '../types/fitness';

const mockBatchOps: Array<{ kind: 'set' | 'delete'; path: string; data?: any }>[] = [];
let activeBatchOps: Array<{ kind: 'set' | 'delete'; path: string; data?: any }> = [];

const {
  mockGetRedirectResult,
  mockOnAuthStateChanged,
  mockSignInWithGoogle,
} = vi.hoisted(() => ({
  mockGetRedirectResult: vi.fn().mockRejectedValue(new Error('OAuth redirect session expired')),
  mockOnAuthStateChanged: vi.fn((_auth: any, cb: (user: any) => void) => {
    cb(null);
    return () => {};
  }),
  mockSignInWithGoogle: vi.fn().mockRejectedValue(
    Object.assign(
      new Error('Google Sign-In inside the Android WebView requires a native OAuth plugin not bundled in this release.'),
      { code: 'auth/operation-not-supported-in-this-environment' }
    )
  ),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}));

vi.mock('../lib/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firebase')>();
  return {
    ...actual,
    db: {},
    auth: { currentUser: null },
    doc: (first: any, ...segments: string[]) => ({
      path: typeof first?.path === 'string'
        ? [first.path, ...segments].join('/')
        : segments.join('/'),
    }),
    collection: (_db: any, ...segments: string[]) => ({ path: segments.join('/') }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    getRedirectResult: mockGetRedirectResult,
    onAuthStateChanged: mockOnAuthStateChanged,
    signInWithGoogle: mockSignInWithGoogle,
    writeBatch: () => {
      const ops: Array<{ kind: 'set' | 'delete'; path: string; data?: any }> = [];
      return {
        set: (ref: any, data: any) => ops.push({ kind: 'set', path: ref.path, data }),
        delete: (ref: any) => ops.push({ kind: 'delete', path: ref.path }),
        commit: async () => {
          activeBatchOps = ops;
          mockBatchOps.push(ops);
        },
      };
    },
  };
});

import { deleteExerciseDefinitionWithWorkouts } from '../services/fitnessFirestore';
import { useFitnessExercises } from '../hooks/useFitnessExercises';
import { useFitnessWorkouts } from '../hooks/useFitnessWorkouts';
import { useFitnessSync } from '../hooks/useFitnessSync';
import { AccountSection } from '../components/manage/AccountSection';
import { FitnessContext } from '../context/FitnessContext';
import { ConfirmProvider } from '../context/ConfirmContext';

describe('Audit Batch A & Native Auth Boundary Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    mockBatchOps.length = 0;
    activeBatchOps = [];
    vi.clearAllMocks();
  });

  it('deleteExerciseDefinitionWithWorkouts orders setWorkouts before deleteDef and chunks cleanly > 400 ops (AUD-P1-001)', async () => {
    const workouts: Workout[] = Array.from({ length: 405 }, (_, i) => ({
      id: `wo-${i}`,
      name: `Workout ${i}`,
      badge: 'PUSH',
      type: 'push',
      exercises: [],
    }));

    await deleteExerciseDefinitionWithWorkouts('uid-123', 'ex-del', workouts);

    expect(mockBatchOps.length).toBe(2);
    expect(mockBatchOps[0].length).toBe(400);
    expect(mockBatchOps[0].every(op => op.kind === 'set')).toBe(true);

    expect(mockBatchOps[1].length).toBe(6);
    expect(mockBatchOps[1].slice(0, 5).every(op => op.kind === 'set')).toBe(true);
    expect(mockBatchOps[1][5]).toEqual({ kind: 'delete', path: 'users/uid-123/exerciseDefinitions/ex-del' });
    expect(activeBatchOps.length).toBe(6);
  });

  it('useFitnessExercises.deleteExerciseDefinition stamps updatedAt ONLY on modified workouts', async () => {
    const unmodifiedUpdatedAt = 12345;
    const initialWos: Workout[] = [
      {
        id: 'wo-affected',
        name: 'Affected',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'e1', sets: 3, reps: '8' }],
        updatedAt: unmodifiedUpdatedAt,
      },
      {
        id: 'wo-untouched',
        name: 'Untouched',
        badge: 'PULL',
        type: 'pull',
        exercises: [{ exerciseDefinitionId: 'e2', sets: 3, reps: '8' }],
        updatedAt: unmodifiedUpdatedAt,
      },
    ];

    const exerciseDefsRef = { current: [...INITIAL_EXERCISE_DEFINITIONS] };
    const workoutsRef = { current: [...initialWos] };
    const logsRef = { current: {} };
    const appStateRef = { current: { cycleStart: '2026-10-01' } };
    let committedWorkouts: Workout[] = [];
    const commitFitnessSnapshot = vi.fn((partial: any) => {
      if (partial.workouts) committedWorkouts = partial.workouts;
      return {
        success: true,
        snapshot: {
          exerciseDefinitions: partial.exerciseDefinitions ?? exerciseDefsRef.current,
          workouts: partial.workouts ?? workoutsRef.current,
          logs: logsRef.current,
          appState: appStateRef.current,
        },
      };
    });

    let hookApi: ReturnType<typeof useFitnessExercises> | null = null;
    const container = document.createElement('div');
    const root = createRoot(container);

    const Harness = () => {
      hookApi = useFitnessExercises({
        user: { uid: 'uid-abc' } as any,
        exerciseDefsRef,
        workoutsRef,
        logsRef,
        appStateRef,
        commitFitnessSnapshot,
        pushAutoBackup: vi.fn().mockResolvedValue(undefined),
        setSyncStatus: vi.fn(),
        setSyncError: vi.fn(),
      });
      return null;
    };

    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });

      await act(async () => {
        await hookApi!.deleteExerciseDefinition('e1');
      });

      const affected = committedWorkouts.find(w => w.id === 'wo-affected')!;
      const untouched = committedWorkouts.find(w => w.id === 'wo-untouched')!;
      expect(affected.exercises).toHaveLength(0);
      expect(affected.updatedAt).not.toBe(unmodifiedUpdatedAt);
      expect(untouched.updatedAt).toBe(unmodifiedUpdatedAt);

      // Cloud batch wrote ONLY the 1 modified workout + 1 deleteDef (not wo-untouched!)
      expect(mockBatchOps).toHaveLength(1);
      expect(mockBatchOps[0]).toHaveLength(2);
      expect(mockBatchOps[0][0].path).toBe('users/uid-abc/workouts/wo-affected');
      expect(mockBatchOps[0][1]).toEqual({ kind: 'delete', path: 'users/uid-abc/exerciseDefinitions/e1' });
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('useFitnessWorkouts.updateWorkout updates only the single target workout (AUD-P2-004)', async () => {
    const initialWos = INITIAL_WORKOUTS.slice(0, 2);
    const exerciseDefsRef = { current: [...INITIAL_EXERCISE_DEFINITIONS] };
    const workoutsRef = { current: [...initialWos] };
    const logsRef = { current: {} };
    const appStateRef = { current: { cycleStart: '2026-10-01' } };
    const commitFitnessSnapshot = vi.fn((partial: any) => ({
      success: true,
      snapshot: {
        exerciseDefinitions: exerciseDefsRef.current,
        workouts: partial.workouts ?? workoutsRef.current,
        logs: logsRef.current,
        appState: appStateRef.current,
      },
    }));
    const pushAutoBackup = vi.fn().mockResolvedValue(undefined);

    let hookApi: ReturnType<typeof useFitnessWorkouts> | null = null;
    const container = document.createElement('div');
    const root = createRoot(container);

    const Harness = () => {
      hookApi = useFitnessWorkouts({
        user: null,
        workoutsRef,
        logsRef,
        appStateRef,
        commitFitnessSnapshot,
        pushAutoBackup,
        setSyncStatus: vi.fn(),
        setSyncError: vi.fn(),
      });
      return null;
    };

    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });

      const modifiedTarget: Workout = { ...initialWos[0], name: 'Renamed Push A' };
      await act(async () => {
        await hookApi!.updateWorkout(modifiedTarget, { syncCloud: false, recordBackup: false });
      });

      expect(commitFitnessSnapshot).toHaveBeenCalledTimes(1);
      const passedWorkouts = commitFitnessSnapshot.mock.calls[0][0].workouts as Workout[];
      expect(passedWorkouts[0].name).toBe('Renamed Push A');
      expect(passedWorkouts[1]).toBe(initialWos[1]);
      expect(pushAutoBackup).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('useFitnessSync preserves getRedirectResult error across AUTH_RESOLVED(null) and renders Android notice in AccountSection (AUD-P0-003)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let syncState: ReturnType<typeof useFitnessSync> | null = null;

    const Probe: React.FC = () => {
      syncState = useFitnessSync({
        exerciseDefsRef: { current: INITIAL_EXERCISE_DEFINITIONS },
        workoutsRef: { current: INITIAL_WORKOUTS },
        logsRef: { current: {} },
        appStateRef: { current: { cycleStart: '2026-10-01' } },
        commitFitnessSnapshot: vi.fn(() => ({
          success: true,
          snapshot: {
            exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
            workouts: INITIAL_WORKOUTS,
            logs: {},
            appState: { cycleStart: '2026-10-01' },
          },
        })),
      });

      return React.createElement(
        FitnessContext.Provider,
        {
          value: {
            user: null,
            syncStatus: 'idle',
            syncError: null,
            authError: syncState.authError,
            login: syncState.login,
            logout: syncState.logout,
            accountResetStatus: 'idle',
            retryAccountReset: vi.fn(),
            retrySync: vi.fn(),
          } as any,
        },
        React.createElement(
          ConfirmProvider,
          null,
          React.createElement(AccountSection, { onSyncData: vi.fn() })
        )
      );
    };

    try {
      await act(async () => {
        root.render(React.createElement(Probe));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(syncState!.authError).toContain('OAuth redirect session expired');
      expect(container.textContent).toContain('Android Sign-In Notice');
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('OAuth redirect session expired');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
