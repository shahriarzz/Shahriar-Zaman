import fs from 'fs';
import path from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  Auth,
  User,
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  Firestore,
  initializeFirestore,
  connectFirestoreEmulator,
  terminate,
} from 'firebase/firestore';

export const DEMO_PROJECT_ID = 'demo-gainlog';
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
export const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8080';

export function loadProjectFirestoreRules(): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
}

export async function clearAuthEmulator(): Promise<void> {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/emulator/v1/projects/${DEMO_PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear Auth emulator (${res.status}): ${await res.text()}`);
  }
}

export async function clearFirestoreEmulator(): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR_URL}/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear Firestore emulator (${res.status}): ${await res.text()}`);
  }
}

export async function clearAllEmulators(): Promise<void> {
  await Promise.all([clearAuthEmulator(), clearFirestoreEmulator()]);
}

export async function setFirestoreEmulatorRules(rulesSource: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR_URL}/emulator/v1/projects/${DEMO_PROJECT_ID}:securityRules`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rules: {
          files: [{ name: 'firestore.rules', content: rulesSource }],
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to update Firestore emulator rules (${res.status}): ${await res.text()}`);
  }
}

export async function createOrSignInUser(
  auth: Auth,
  email: string,
  password = 'test-password-123'
): Promise<User> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user;
    }
    throw err;
  }
}

export async function signOutSafe(auth: Auth): Promise<void> {
  if (auth.currentUser) {
    await fbSignOut(auth);
  }
}

export interface SecondaryEmulatorClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  cleanup: () => Promise<void>;
}

/**
 * Creates a second independent Firebase client app connected to the same emulators.
 * Used exclusively inside integration tests to simulate another device/remote writer.
 */
export function createSecondaryEmulatorClient(nameSuffix: string): SecondaryEmulatorClient {
  const app = initializeApp(
    {
      apiKey: 'demo-gainlog-api-key',
      authDomain: 'demo-gainlog.firebaseapp.com',
      projectId: DEMO_PROJECT_ID,
      appId: '1:000000000000:web:demogainlog',
    },
    `secondary-test-client-${nameSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  return {
    app,
    auth,
    db,
    cleanup: async () => {
      try {
        await fbSignOut(auth);
      } catch {}
      try {
        await terminate(db);
      } catch {}
      try {
        await deleteApp(app);
      } catch {}
    },
  };
}

export async function waitForCondition<T>(
  predicate: () => T | Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {}
): Promise<Exclude<T, false | null | undefined | 0 | ''>> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const intervalMs = options.intervalMs ?? 50;
  const description = options.description ?? 'condition';
  const start = Date.now();
  let lastError: unknown = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const value = await predicate();
      if (value) {
        return value as Exclude<T, false | null | undefined | 0 | ''>;
      }
      lastError = null;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const suffix = lastError ? ` (last error: ${String((lastError as any)?.message || lastError)})` : '';
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}${suffix}`);
}
