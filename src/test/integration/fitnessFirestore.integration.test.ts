// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { doc as fbDoc, getDoc as fbGetDoc, setDoc as fbSetDoc, deleteDoc as fbDeleteDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import {
  saveExerciseDefinition,
  saveExerciseDefinitionsBatch,
  deleteExerciseDefinition,
  deleteExerciseDefinitionWithWorkouts,
  getExerciseDefinitions,
  subscribeExerciseDefinitions,
  saveWorkout,
  saveWorkoutsBatch,
  deleteWorkout,
  getWorkouts,
  subscribeWorkouts,
  saveLog,
  saveLogsBatch,
  deleteLog,
  deleteLogsBatch,
  getLogs,
  subscribeLogs,
  saveAppState,
  getAppState,
  subscribeAppState,
} from '../../services/fitnessFirestore';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../../types/fitness';
import {
  clearAllEmulators,
  createOrSignInUser,
  signOutSafe,
  createSecondaryEmulatorClient,
  loadProjectFirestoreRules,
  setFirestoreEmulatorRules,
  waitForCondition,
  SecondaryEmulatorClient,
} from './emulatorHelpers';

describe('fitnessFirestore.ts Real Firestore Emulator Integration', () => {
  const secondaryClients: SecondaryEmulatorClient[] = [];

  beforeEach(async () => {
    await signOutSafe(auth);
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
  });

  afterEach(async () => {
    while (secondaryClients.length > 0) {
      const client = secondaryClients.pop()!;
      await client.cleanup();
    }
    await signOutSafe(auth);
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
  });

  it('performs ExerciseDefinition, Workout, Log, and AppState CRUD with sanitization and log ID round-trip', async () => {
    const user = await createOrSignInUser(auth, 'crud-user@example.com');
    const uid = user.uid;

    const def: ExerciseDefinition = {
      id: 'def-incline',
      name: 'Incline Dumbbell Press',
      target: 'Upper Chest',
      updatedAt: 1000,
    };
    await saveExerciseDefinition(uid, def);
    const defs = await getExerciseDefinitions(uid);
    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe('def-incline');
    expect(defs[0].name).toBe('Incline Dumbbell Press');

    const wo: Workout = {
      id: 'wo-push',
      name: 'Push A',
      type: 'push',
      badge: 'DAY 1 · PUSH',
      cycleDay: 1,
      isCore: true,
      exercises: [{ exerciseDefinitionId: 'def-incline', sets: 3, reps: '8-10', rest: '90s' }],
      updatedAt: 2000,
    };
    await saveWorkout(uid, wo);
    const workouts = await getWorkouts(uid);
    expect(workouts).toHaveLength(1);
    expect(workouts[0].id).toBe('wo-push');

    const logId = '2026-04-01_wo-push_1';
    const log: SessionLog = {
      id: logId,
      workoutId: 'wo-push',
      date: '2026-04-01',
      complete: true,
      durationMinutes: 42,
      sets: {
        'def-incline': [{ id: 's1', weight: '32', reps: '10', done: true }],
      },
      updatedAt: 3000,
    };
    await saveLog(uid, logId, log);

    // Raw Firestore document body must omit redundant `id`, while getLogs() restores it from doc.id
    const rawSnap = await fbGetDoc(fbDoc(db, 'users', uid, 'logs', logId));
    expect(rawSnap.exists()).toBe(true);
    expect(rawSnap.data()?.id).toBeUndefined();

    const loadedLogs = await getLogs(uid);
    expect(loadedLogs[logId]).toBeDefined();
    expect(loadedLogs[logId].id).toBe(logId);
    expect(loadedLogs[logId].sets['def-incline'][0].weight).toBe('32');

    // AppState merge behavior
    await saveAppState(uid, { cycleStart: '2026-04-01', weightLog: { '2026-04-01': 80 } });
    await saveAppState(uid, { cycleStart: '2026-04-02' }, true);
    const loadedState = await getAppState(uid);
    expect(loadedState?.cycleStart).toBe('2026-04-02');
    expect(loadedState?.weightLog?.['2026-04-01']).toBe(80);

    // Single deletions
    await deleteLog(uid, logId);
    expect(Object.keys(await getLogs(uid))).toHaveLength(0);
    await deleteWorkout(uid, 'wo-push');
    expect(await getWorkouts(uid)).toHaveLength(0);
    await deleteExerciseDefinition(uid, 'def-incline');
    expect(await getExerciseDefinitions(uid)).toHaveLength(0);
  });

  it('atomically deletes an exercise definition and updates affected workouts, rolling back on batch rejection', async () => {
    const user = await createOrSignInUser(auth, 'atomic-user@example.com');
    const uid = user.uid;

    const def: ExerciseDefinition = { id: 'def-row', name: 'Barbell Row', target: 'Upper Back', updatedAt: 1000 };
    const wo: Workout = {
      id: 'wo-pull',
      name: 'Pull A',
      type: 'pull',
      badge: 'PULL',
      exercises: [
        { exerciseDefinitionId: 'def-row', sets: 3, reps: '8', rest: '90s' },
        { exerciseDefinitionId: 'def-curl', sets: 3, reps: '12', rest: '60s' },
      ],
      updatedAt: 1000,
    };
    await saveExerciseDefinition(uid, def);
    await saveWorkout(uid, wo);

    // Force failure on workouts write while exerciseDefinitions delete would otherwise be allowed
    const partialDenyRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/exerciseDefinitions/{id} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/workouts/{id} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
  }
}`;
    try {
      await setFirestoreEmulatorRules(partialDenyRules);
      await expect(
        deleteExerciseDefinitionWithWorkouts(uid, 'def-row', [
          { ...wo, exercises: wo.exercises.filter((e) => e.exerciseDefinitionId !== 'def-row'), updatedAt: 2000 },
        ])
      ).rejects.toThrow();
    } finally {
      await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    }

    // Both definition and original workout must still exist untouched due to batch atomicity
    const defsAfterAbort = await getExerciseDefinitions(uid);
    const workoutsAfterAbort = await getWorkouts(uid);
    expect(defsAfterAbort.some((d) => d.id === 'def-row')).toBe(true);
    expect(workoutsAfterAbort[0].exercises).toHaveLength(2);

    // Valid atomic execution commits both together
    await deleteExerciseDefinitionWithWorkouts(uid, 'def-row', [
      { ...wo, exercises: wo.exercises.filter((e) => e.exerciseDefinitionId !== 'def-row'), updatedAt: 3000 },
    ]);
    expect(await getExerciseDefinitions(uid)).toHaveLength(0);
    const workoutsAfterCommit = await getWorkouts(uid);
    expect(workoutsAfterCommit[0].exercises).toHaveLength(1);
    expect(workoutsAfterCommit[0].exercises[0].exerciseDefinitionId).toBe('def-curl');
  });

  it('commits and deletes batches >= 405 documents across multiple chunks', async () => {
    const user = await createOrSignInUser(auth, 'batch-user@example.com');
    const uid = user.uid;

    const defs: ExerciseDefinition[] = Array.from({ length: 405 }, (_, i) => ({
      id: `def-${i}`,
      name: `Exercise ${i}`,
      target: 'Chest',
      updatedAt: 1000 + i,
    }));
    await saveExerciseDefinitionsBatch(uid, defs);
    expect(await getExerciseDefinitions(uid)).toHaveLength(405);

    const workouts: Workout[] = Array.from({ length: 405 }, (_, i) => ({
      id: `wo-${i}`,
      name: `Workout ${i}`,
      type: 'push',
      badge: 'PUSH',
      exercises: [],
      updatedAt: 2000 + i,
    }));
    await saveWorkoutsBatch(uid, workouts);
    expect(await getWorkouts(uid)).toHaveLength(405);

    const logs: Record<string, SessionLog> = {};
    const logIds: string[] = [];
    for (let i = 0; i < 405; i++) {
      const id = `2026-04-01_wo_${i}`;
      logIds.push(id);
      logs[id] = {
        id,
        workoutId: `wo-${i}`,
        date: '2026-04-01',
        complete: true,
        durationMinutes: 20,
        sets: {},
        updatedAt: 3000 + i,
      };
    }
    await saveLogsBatch(uid, logs);
    expect(Object.keys(await getLogs(uid))).toHaveLength(405);

    await deleteLogsBatch(uid, logIds);
    expect(Object.keys(await getLogs(uid))).toHaveLength(0);
  });

  it('delivers realtime updates across all 4 subscriptions from a second client and stops after unsubscribe', async () => {
    const email = 'realtime-sub@example.com';
    const user = await createOrSignInUser(auth, email);
    const uid = user.uid;

    const remote = createSecondaryEmulatorClient('sub');
    secondaryClients.push(remote);
    await createOrSignInUser(remote.auth, email);

    const defEvents: string[] = [];
    const workoutEvents: string[] = [];
    const logEvents: string[] = [];
    const stateEvents: AppState[] = [];

    const unsubDefs = subscribeExerciseDefinitions(uid, (changes) => {
      changes.forEach((c) => defEvents.push(`${c.type}:${c.doc.id}`));
    });
    const unsubWorkouts = subscribeWorkouts(uid, (changes) => {
      changes.forEach((c) => workoutEvents.push(`${c.type}:${c.doc.id}`));
    });
    const unsubLogs = subscribeLogs(uid, (changes) => {
      changes.forEach((c) => logEvents.push(`${c.type}:${c.doc.id}`));
    });
    const unsubState = subscribeAppState(uid, (state, hasPendingWrites) => {
      if (!hasPendingWrites) stateEvents.push(state);
    });

    await fbSetDoc(fbDoc(remote.db, 'users', uid, 'exerciseDefinitions', 'ex-rt'), {
      id: 'ex-rt',
      name: 'RT Bench',
      muscle: 'Chest',
      updatedAt: 1000,
    });
    await fbSetDoc(fbDoc(remote.db, 'users', uid, 'workouts', 'wo-rt'), {
      id: 'wo-rt',
      name: 'RT Workout',
      type: 'push',
      badge: 'PUSH',
      exercises: [],
      updatedAt: 1000,
    });
    await fbSetDoc(fbDoc(remote.db, 'users', uid, 'logs', 'log-rt'), {
      workoutId: 'wo-rt',
      date: '2026-04-02',
      complete: true,
      durationMinutes: 30,
      sets: {},
      updatedAt: 1000,
    });
    await fbSetDoc(fbDoc(remote.db, 'users', uid), {
      cycleStart: '2026-04-02',
      updatedAt: 1000,
    });

    await waitForCondition(
      () =>
        defEvents.includes('added:ex-rt') &&
        workoutEvents.includes('added:wo-rt') &&
        logEvents.includes('added:log-rt') &&
        stateEvents.some((s) => s.cycleStart === '2026-04-02'),
      { description: 'all 4 realtime subscription callbacks' }
    );

    unsubDefs();
    unsubWorkouts();
    unsubLogs();
    unsubState();

    const prevCounts = {
      defs: defEvents.length,
      workouts: workoutEvents.length,
      logs: logEvents.length,
      state: stateEvents.length,
    };

    await fbDeleteDoc(fbDoc(remote.db, 'users', uid, 'exerciseDefinitions', 'ex-rt'));
    await fbDeleteDoc(fbDoc(remote.db, 'users', uid, 'workouts', 'wo-rt'));
    await fbDeleteDoc(fbDoc(remote.db, 'users', uid, 'logs', 'log-rt'));
    await fbSetDoc(fbDoc(remote.db, 'users', uid), { cycleStart: '2026-04-09', updatedAt: 2000 }, { merge: true });

    await new Promise((r) => setTimeout(r, 400));
    expect(defEvents.length).toBe(prevCounts.defs);
    expect(workoutEvents.length).toBe(prevCounts.workouts);
    expect(logEvents.length).toBe(prevCounts.logs);
    expect(stateEvents.length).toBe(prevCounts.state);
  });
});
