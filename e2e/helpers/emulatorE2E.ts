import fs from 'fs';
import path from 'path';
import { expect, Page } from '@playwright/test';

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
    throw new Error(`Failed to set Firestore emulator rules (${res.status}): ${await res.text()}`);
  }
}

export async function resetBrowserStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise<void>((resolve) => {
      const req = window.indexedDB.deleteDatabase('gainlog_vault');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

export async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByRole('navigation').first()).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Active Target' })).toBeVisible();
}

export async function gotoCleanApp(page: Page): Promise<void> {
  await page.goto('');
  await waitForAppReady(page);
  await resetBrowserStorage(page);
  await page.reload();
  await waitForAppReady(page);
}

export async function signInWithEmulatorHarness(
  page: Page,
  email: string,
  password = 'e2e-password-123'
): Promise<{ uid: string; email: string | null }> {
  const userInfo = await page.evaluate(
    async ({ email, password }) => {
      const harness = (window as any).__GAINLOG_E2E__;
      if (!harness) throw new Error('__GAINLOG_E2E__ harness missing');
      return harness.auth.signInOrCreate(email, password);
    },
    { email, password }
  );

  await expect(page.locator('button[title="Training data fully synced"]')).toBeVisible({ timeout: 15000 });
  return userInfo;
}

export async function waitForCloudSynced(page: Page): Promise<void> {
  await expect(page.locator('button[title="Training data fully synced"]')).toBeVisible({ timeout: 15000 });
}

export async function navigateToTab(page: Page, tab: 'dashboard' | 'history' | 'analytics' | 'manage'): Promise<void> {
  await page.locator(`#nav-item-${tab}`).click();
}

export async function readCanonicalSnapshot(page: Page): Promise<any> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('gl_database_snapshot');
    if (!raw) return null;
    return JSON.parse(raw);
  });
}

export async function readStagingKey(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('gl_snapshot_staging'));
}

export async function readActiveSessionStorage(page: Page): Promise<any> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('gl_active_session');
    return raw ? JSON.parse(raw) : null;
  });
}

export async function readIndexedDbStore(
  page: Page,
  storeName: 'auto_backups' | 'pending_cloud_sync'
): Promise<any[]> {
  return page.evaluate(async (storeName) => {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open('gainlog_vault', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('auto_backups')) {
          db.createObjectStore('auto_backups', { keyPath: 'timestamp' });
        }
        if (!db.objectStoreNames.contains('pending_cloud_sync')) {
          db.createObjectStore('pending_cloud_sync', { keyPath: 'uid' });
        }
      };
      req.onerror = () => reject(req.error || new Error('Failed to open gainlog_vault in E2E inspect'));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const getAllReq = store.getAll();
        let data: any[] = [];
        getAllReq.onsuccess = () => {
          data = getAllReq.result || [];
        };
        tx.oncomplete = () => {
          db.close();
          resolve(data);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error(`Failed reading ${storeName}`));
        };
      };
    });
  }, storeName);
}

/**
 * Queries Firestore Emulator REST API with owner privileges to independently verify
 * persisted server-side state without trusting the app's in-memory state.
 */
export async function listFirestoreDocsAdmin(collectionPath: string): Promise<Array<{ id: string; fields: Record<string, any> }>> {
  const url = `${FIRESTORE_EMULATOR_URL}/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents/${collectionPath}`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Failed listing Firestore path ${collectionPath} (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
  return (json.documents || []).map((d) => ({
    id: d.name.split('/').pop()!,
    fields: d.fields || {},
  }));
}

export async function getFirestoreDocAdmin(docPath: string): Promise<{ exists: boolean; fields?: Record<string, any> }> {
  const url = `${FIRESTORE_EMULATOR_URL}/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return { exists: false };
  if (!res.ok) {
    throw new Error(`Failed reading Firestore doc ${docPath} (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { fields?: Record<string, any> };
  return { exists: true, fields: json.fields || {} };
}

export function decodeFirestoreStringField(field: any): string | undefined {
  return field?.stringValue;
}

export async function patchFirestoreWorkoutNameAdmin(uid: string, workoutId: string, name: string, updatedAt: number): Promise<void> {
  const getRes = await fetch(
    `${FIRESTORE_EMULATOR_URL}/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents/users/${uid}/workouts/${workoutId}`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  if (!getRes.ok) {
    throw new Error(`Workout ${workoutId} not found in Firestore for ${uid}: ${getRes.status}`);
  }
  const existing = (await getRes.json()) as { fields?: Record<string, any> };
  const mergedFields = {
    ...(existing.fields || {}),
    name: { stringValue: name },
    updatedAt: { integerValue: String(updatedAt) },
  };
  const patchRes = await fetch(
    `${FIRESTORE_EMULATOR_URL}/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents/users/${uid}/workouts/${workoutId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: mergedFields }),
    }
  );
  if (!patchRes.ok) {
    throw new Error(`Failed patching workout in Firestore (${patchRes.status}): ${await patchRes.text()}`);
  }
}
