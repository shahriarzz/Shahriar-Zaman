// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { doc as fbDoc, setDoc as fbSetDoc, getDoc as fbGetDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { FitnessProvider, useFitness } from '../../context/FitnessContext';
import {
  getExerciseDefinitions,
  getWorkouts,
  getLogs,
  saveWorkout,
  saveLog,
} from '../../services/fitnessFirestore';
import { readCanonicalSnapshotEnvelope } from '../../utils/fitnessMigration';
import { trackDeletedId, getDeletedIdsTracker } from '../../utils/fitnessSyncHelpers';
import { INITIAL_WORKOUTS } from '../../types/initialData';
import { SessionLog, Workout } from '../../types/fitness';
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

describe('FitnessProvider & useFitnessSync Real Auth + Firestore Emulator Integration', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestCtx: ReturnType<typeof useFitness> | null = null;
  const secondaryClients: SecondaryEmulatorClient[] = [];

  const ContextProbe: React.FC = () => {
    latestCtx = useFitness();
    return null;
  };

  const mountProvider = () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <FitnessProvider>
          <ContextProbe />
        </FitnessProvider>
      );
    });
  };

  beforeEach(async () => {
    latestCtx = null;
    await signOutSafe(auth);
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    while (secondaryClients.length > 0) {
      const c = secondaryClients.pop()!;
      await c.cleanup();
    }
    await signOutSafe(auth);
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
  });

  it('authenticates User A via Auth Emulator, performs initial merge/upload, and receives realtime updates from another client', async () => {
    const emailA = 'sync-a@example.com';
    const userA = await createOrSignInUser(auth, emailA);
    const uidA = userA.uid;

    // Seed an existing remote log and custom workout for User A before mounting provider
    const remoteWorkout: Workout = {
      ...INITIAL_WORKOUTS[0],
      id: 'wo-remote-a',
      name: 'User A Remote Push',
      isCore: false,
      updatedAt: Date.now() + 5000,
    };
    const remoteLog: SessionLog = {
      id: '2026-04-01_wo-remote-a_1',
      workoutId: 'wo-remote-a',
      date: '2026-04-01',
      complete: true,
      durationMinutes: 40,
      sets: {},
      updatedAt: Date.now() + 5000,
    };
    await saveWorkout(uidA, remoteWorkout);
    await saveLog(uidA, remoteLog.id, remoteLog);

    mountProvider();

    await waitForCondition(
      () =>
        latestCtx &&
        latestCtx.user?.uid === uidA &&
        latestCtx.syncStatus === 'synced' &&
        latestCtx.workouts.some((w) => w.id === 'wo-remote-a') &&
        Boolean(latestCtx.logs[remoteLog.id]),
      { description: 'User A initial Auth + Firestore sync' }
    );

    // Canonical local snapshot persists User A records
    const snapA = readCanonicalSnapshotEnvelope();
    expect(snapA.status).toBe('ok');
    if (snapA.status === 'ok') {
      expect(snapA.snapshot.workouts.some((w) => w.id === 'wo-remote-a')).toBe(true);
      expect(snapA.snapshot.logs[remoteLog.id]?.complete).toBe(true);
    }

    // Realtime mutation from second authenticated client as User A updates mounted provider
    const remoteClient = createSecondaryEmulatorClient('sync-rt');
    secondaryClients.push(remoteClient);
    await createOrSignInUser(remoteClient.auth, emailA);

    const rtLogId = '2026-04-03_wo-remote-a_2';
    await fbSetDoc(fbDoc(remoteClient.db, 'users', uidA, 'logs', rtLogId), {
      workoutId: 'wo-remote-a',
      date: '2026-04-03',
      complete: true,
      durationMinutes: 55,
      sets: {},
      updatedAt: Date.now() + 10000,
    });

    await waitForCondition(
      () => Boolean(latestCtx?.logs[rtLogId]),
      { description: 'realtime Firestore update reaching mounted FitnessProvider' }
    );
    const snapAUpdated = readCanonicalSnapshotEnvelope();
    expect(snapAUpdated.status).toBe('ok');
    if (snapAUpdated.status === 'ok') {
      expect(snapAUpdated.snapshot.logs[rtLogId]?.durationMinutes).toBe(55);
    }
  });

  it('enforces A -> B -> A account isolation across Auth transitions and unsubscribes stale listeners', async () => {
    const emailA = 'iso-a@example.com';
    const emailB = 'iso-b@example.com';

    const userA = await createOrSignInUser(auth, emailA);
    const uidA = userA.uid;
    await signOutSafe(auth);

    const userB = await createOrSignInUser(auth, emailB);
    const uidB = userB.uid;
    await signOutSafe(auth);

    // Sign back in as A and mount
    await createOrSignInUser(auth, emailA);
    mountProvider();

    await waitForCondition(
      () => latestCtx && latestCtx.user?.uid === uidA && latestCtx.syncStatus === 'synced',
      { description: 'Account A ready' }
    );

    // Create User A exclusive log through real domain action addLog()
    const logAId = '2026-04-05_push-a_100';
    await act(async () => {
      const res = await latestCtx!.addLog(logAId, {
        id: logAId,
        workoutId: 'push-a',
        date: '2026-04-05',
        complete: true,
        durationMinutes: 45,
        sets: {},
        updatedAt: Date.now(),
      });
      expect(res.success).toBe(true);
    });

    expect((await getLogs(uidA))[logAId]).toBeDefined();

    // Sign out A, then sign in as B (simulates account switch via real Firebase Auth)
    await act(async () => {
      await latestCtx!.logout();
    });
    await waitForCondition(() => latestCtx?.user === null, { description: 'User A signed out' });
    expect(latestCtx!.logs[logAId]).toBeUndefined();

    await createOrSignInUser(auth, emailB);
    await waitForCondition(
      () => latestCtx && latestCtx.user?.uid === uidB && latestCtx.syncStatus === 'synced',
      { description: 'Account B ready after A -> B switch' }
    );

    // Account B must NEVER inherit A's log locally or upload A's log into /users/uidB/logs
    expect(latestCtx!.logs[logAId]).toBeUndefined();
    const snapB = readCanonicalSnapshotEnvelope();
    if (snapB.status === 'ok') {
      expect(snapB.snapshot.logs[logAId]).toBeUndefined();
    }
    const cloudLogsB = await getLogs(uidB);
    expect(cloudLogsB[logAId]).toBeUndefined();

    // While signed in as B, remote writes to User A must NOT reach B's state (listeners unsubscribed)
    const remoteA = createSecondaryEmulatorClient('stale-listener-check');
    secondaryClients.push(remoteA);
    await createOrSignInUser(remoteA.auth, emailA);
    const leakedCandidateId = '2026-04-06_push-a_leak';
    await fbSetDoc(fbDoc(remoteA.db, 'users', uidA, 'logs', leakedCandidateId), {
      workoutId: 'push-a',
      date: '2026-04-06',
      complete: true,
      durationMinutes: 30,
      sets: {},
      updatedAt: Date.now() + 20000,
    });

    await new Promise((r) => setTimeout(r, 400));
    expect(latestCtx!.logs[leakedCandidateId]).toBeUndefined();

    // Switch back to A -> A receives all of A's cloud logs cleanly
    await act(async () => {
      await latestCtx!.logout();
    });
    await createOrSignInUser(auth, emailA);
    await waitForCondition(
      () =>
        latestCtx &&
        latestCtx.user?.uid === uidA &&
        latestCtx.syncStatus === 'synced' &&
        Boolean(latestCtx.logs[logAId]) &&
        Boolean(latestCtx.logs[leakedCandidateId]),
      { description: 'Account A reloaded after B -> A switch' }
    );
  });

  it('scopes offline tombstones strictly by UID and flushes deletions only for the owning account', async () => {
    const emailA = 'tomb-a@example.com';
    const emailB = 'tomb-b@example.com';

    const userA = await createOrSignInUser(auth, emailA);
    const uidA = userA.uid;
    const sharedDocId = 'shared-log-id-across-uids';
    await saveLog(uidA, sharedDocId, {
      id: sharedDocId,
      workoutId: 'push-a',
      date: '2026-04-07',
      complete: true,
      durationMinutes: 35,
      sets: {},
      updatedAt: 1000,
    });
    await signOutSafe(auth);

    const userB = await createOrSignInUser(auth, emailB);
    const uidB = userB.uid;
    await saveLog(uidB, sharedDocId, {
      id: sharedDocId,
      workoutId: 'push-a',
      date: '2026-04-07',
      complete: true,
      durationMinutes: 50,
      sets: {},
      updatedAt: 1000,
    });

    // Queue tombstone specifically under uidA while signed in as B (simulating uidA offline deletion)
    trackDeletedId('logs', sharedDocId, uidA);
    expect(getDeletedIdsTracker(uidB).logs).not.toContain(sharedDocId);

    mountProvider();
    await waitForCondition(
      () => latestCtx && latestCtx.user?.uid === uidB && latestCtx.syncStatus === 'synced',
      { description: 'Account B synced without deleting sharedDocId' }
    );

    // Account B's copy must remain intact in UI and Firestore
    expect(latestCtx!.logs[sharedDocId]).toBeDefined();
    expect((await getLogs(uidB))[sharedDocId]).toBeDefined();
    expect(getDeletedIdsTracker(uidA).logs).toContain(sharedDocId);

    // Switching to A flushes uidA's tombstone in /users/uidA/logs
    await act(async () => {
      await latestCtx!.logout();
    });
    await createOrSignInUser(auth, emailA);

    await waitForCondition(
      async () => {
        if (!latestCtx || latestCtx.user?.uid !== uidA || latestCtx.syncStatus !== 'synced') return false;
        const cloudA = await getLogs(uidA);
        return !cloudA[sharedDocId];
      },
      { description: 'Account A tombstone flushed to Firestore' }
    );
    expect(latestCtx!.logs[sharedDocId]).toBeUndefined();
    expect(getDeletedIdsTracker(uidA).logs).not.toContain(sharedDocId);
    // Account B's cloud record remains untouched (verified via client authenticated as Account B)
    const clientB = createSecondaryEmulatorClient('verify-tombstone-b');
    secondaryClients.push(clientB);
    await createOrSignInUser(clientB.auth, emailB);
    const bDocSnap = await fbGetDoc(fbDoc(clientB.db, 'users', uidB, 'logs', sharedDocId));
    expect(bDocSnap.exists()).toBe(true);
  });

  it('persists workout/exercise/appState mutations cleanly to /users/{uid}', async () => {
    const user = await createOrSignInUser(auth, 'mutations@example.com');
    const uid = user.uid;

    mountProvider();
    await waitForCondition(
      () => latestCtx && latestCtx.user?.uid === uid && latestCtx.syncStatus === 'synced',
      { description: 'initial sync for mutations test' }
    );

    await act(async () => {
      await latestCtx!.addExerciseDefinition({
        id: 'ex-custom-e2e',
        name: 'Paused Bench',
        target: 'Chest',
      });
      await latestCtx!.logBodyWeight('2026-04-08', 81.5);
    });

    const cloudDefs = await getExerciseDefinitions(uid);
    const cloudWorkouts = await getWorkouts(uid);
    const cloudUserSnap = await fbGetDoc(fbDoc(db, 'users', uid));
    expect(cloudDefs.some((d) => d.id === 'ex-custom-e2e')).toBe(true);
    expect(cloudWorkouts.length).toBeGreaterThanOrEqual(INITIAL_WORKOUTS.length);
    const storedWeight = cloudUserSnap.data()?.weightLog?.['2026-04-08'];
    expect(typeof storedWeight === 'number' ? storedWeight : storedWeight?.weight).toBe(81.5);
  });
});
