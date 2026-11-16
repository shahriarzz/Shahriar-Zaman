// @vitest-environment node
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  setLogLevel,
} from 'firebase/firestore';

describe('firestore.rules Security Matrix (Firestore Emulator)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    setLogLevel('error');
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-gainlog',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('denies unauthenticated read and write on /users/{uid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'userA'), { cycleStart: '2026-01-01' });
    });

    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'users', 'userA')));
    await assertFails(setDoc(doc(anonDb, 'users', 'userA'), { cycleStart: '2026-02-01' }));
  });

  it('requires authentication to read /test/connection and denies unauthenticated writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'test', 'connection'), { ok: true });
    });

    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'test', 'connection')));
    await assertFails(setDoc(doc(anonDb, 'test', 'connection'), { ok: false }));

    const userADb = testEnv.authenticatedContext('userA').firestore();
    await assertSucceeds(getDoc(doc(userADb, 'test', 'connection')));
    await assertFails(setDoc(doc(userADb, 'test', 'connection'), { ok: false }));
  });

  it('allows owner to get/create/update /users/{uid} but denies delete and denies collection list /users', async () => {
    const userADb = testEnv.authenticatedContext('userA').firestore();
    await assertSucceeds(setDoc(doc(userADb, 'users', 'userA'), { cycleStart: '2026-01-01' }));
    await assertSucceeds(getDoc(doc(userADb, 'users', 'userA')));
    await assertSucceeds(setDoc(doc(userADb, 'users', 'userA'), { cycleStart: '2026-01-08' }, { merge: true }));
    await assertFails(deleteDoc(doc(userADb, 'users', 'userA')));
    await assertFails(getDocs(collection(userADb, 'users')));
  });

  it('denies cross-user read, write, and delete on /users/{otherUid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'userB'), { cycleStart: '2026-01-01' });
    });

    const userADb = testEnv.authenticatedContext('userA').firestore();
    await assertFails(getDoc(doc(userADb, 'users', 'userB')));
    await assertFails(setDoc(doc(userADb, 'users', 'userB'), { cycleStart: '2026-03-01' }));
    await assertFails(deleteDoc(doc(userADb, 'users', 'userB')));
  });

  it('allows owner CRUD + collection queries on exerciseDefinitions, workouts, and logs', async () => {
    const userADb = testEnv.authenticatedContext('userA').firestore();

    await assertSucceeds(
      setDoc(doc(userADb, 'users', 'userA', 'exerciseDefinitions', 'ex-1'), {
        id: 'ex-1',
        name: 'Bench Press',
        muscle: 'chest',
      })
    );
    await assertSucceeds(getDoc(doc(userADb, 'users', 'userA', 'exerciseDefinitions', 'ex-1')));
    await assertSucceeds(getDocs(collection(userADb, 'users', 'userA', 'exerciseDefinitions')));
    await assertSucceeds(deleteDoc(doc(userADb, 'users', 'userA', 'exerciseDefinitions', 'ex-1')));

    await assertSucceeds(
      setDoc(doc(userADb, 'users', 'userA', 'workouts', 'wo-1'), {
        id: 'wo-1',
        name: 'Push A',
        exercises: [],
      })
    );
    await assertSucceeds(getDoc(doc(userADb, 'users', 'userA', 'workouts', 'wo-1')));
    await assertSucceeds(getDocs(collection(userADb, 'users', 'userA', 'workouts')));
    await assertSucceeds(deleteDoc(doc(userADb, 'users', 'userA', 'workouts', 'wo-1')));

    await assertSucceeds(
      setDoc(doc(userADb, 'users', 'userA', 'logs', 'log-1'), {
        workoutId: 'wo-1',
        date: '2026-03-01',
        complete: true,
        sets: {},
      })
    );
    await assertSucceeds(getDoc(doc(userADb, 'users', 'userA', 'logs', 'log-1')));
    await assertSucceeds(getDocs(collection(userADb, 'users', 'userA', 'logs')));
    await assertSucceeds(deleteDoc(doc(userADb, 'users', 'userA', 'logs', 'log-1')));
  });

  it('denies cross-user reads, writes, and collection queries on subcollections', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'userB', 'exerciseDefinitions', 'ex-b'), { id: 'ex-b', name: 'Squat' });
      await setDoc(doc(db, 'users', 'userB', 'workouts', 'wo-b'), { id: 'wo-b', name: 'Legs' });
      await setDoc(doc(db, 'users', 'userB', 'logs', 'log-b'), { workoutId: 'wo-b', date: '2026-03-01', complete: true, sets: {} });
    });

    const userADb = testEnv.authenticatedContext('userA').firestore();

    await assertFails(getDoc(doc(userADb, 'users', 'userB', 'exerciseDefinitions', 'ex-b')));
    await assertFails(getDocs(collection(userADb, 'users', 'userB', 'exerciseDefinitions')));
    await assertFails(setDoc(doc(userADb, 'users', 'userB', 'exerciseDefinitions', 'ex-b2'), { id: 'ex-b2' }));
    await assertFails(deleteDoc(doc(userADb, 'users', 'userB', 'exerciseDefinitions', 'ex-b')));

    await assertFails(getDoc(doc(userADb, 'users', 'userB', 'workouts', 'wo-b')));
    await assertFails(getDocs(collection(userADb, 'users', 'userB', 'workouts')));
    await assertFails(setDoc(doc(userADb, 'users', 'userB', 'workouts', 'wo-b2'), { id: 'wo-b2' }));
    await assertFails(deleteDoc(doc(userADb, 'users', 'userB', 'workouts', 'wo-b')));

    await assertFails(getDoc(doc(userADb, 'users', 'userB', 'logs', 'log-b')));
    await assertFails(getDocs(collection(userADb, 'users', 'userB', 'logs')));
    await assertFails(setDoc(doc(userADb, 'users', 'userB', 'logs', 'log-b2'), { complete: true }));
    await assertFails(deleteDoc(doc(userADb, 'users', 'userB', 'logs', 'log-b')));
  });

  it('denies authenticated reads and writes to unknown collections under default deny', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'other', 'doc1'), { secret: true });
    });

    const userADb = testEnv.authenticatedContext('userA').firestore();
    await assertFails(getDoc(doc(userADb, 'other', 'doc1')));
    await assertFails(setDoc(doc(userADb, 'other', 'doc1'), { secret: false }));
  });
});
