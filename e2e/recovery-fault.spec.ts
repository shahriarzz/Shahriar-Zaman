import { test, expect } from '@playwright/test';
import {
  clearAllEmulators,
  gotoCleanApp,
  loadProjectFirestoreRules,
  navigateToTab,
  readCanonicalSnapshot,
  readIndexedDbStore,
  setFirestoreEmulatorRules,
  signInWithEmulatorHarness,
  waitForCloudSynced,
} from './helpers/emulatorE2E';

const DENY_ALL_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

test.describe('Deterministic Backup Restore & Cloud Reconciliation Fault Recovery (Real Browser + Emulators)', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    await gotoCleanApp(page);
  });

  test.afterEach(async () => {
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
  });

  test('persists durable pending_cloud_sync record on Firestore deny, survives reload, and reconciles cleanly via Retry Cloud Sync UI', async ({
    page,
  }) => {
    const { uid } = await signInWithEmulatorHarness(page, 'fault-recovery@example.com');
    await waitForCloudSynced(page);

    // 1. Establish baseline state (body weight 78.2) & save manual restore point in IndexedDB
    await page.locator('#quick-body-weight-input').fill('78.2');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await waitForCloudSynced(page);

    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: 'Create Savepoint' }).click();
    await expect(page.getByText('Manual restore savepoint created successfully.')).toBeVisible();

    // 2. Diverge state after checkpoint (log weight 95.0 & complete a workout)
    await navigateToTab(page, 'dashboard');
    await page.locator('#quick-body-weight-input').fill('95.0');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await waitForCloudSynced(page);

    // 3. Inject deterministic Firestore rules fault while restoring checkpoint via UI
    try {
      await setFirestoreEmulatorRules(DENY_ALL_FIRESTORE_RULES);

      await navigateToTab(page, 'manage');
      const restoreBtn = page
        .getByText('Manual Vault Savepoint', { exact: true })
        .first()
        .locator('xpath=ancestor::div[.//button][1]')
        .getByRole('button', { name: 'Restore', exact: true });
      await restoreBtn.click();
      await expect(page.getByRole('heading', { name: 'Restore Savepoint' })).toBeVisible();
      await page.getByRole('button', { name: 'EXECUTE' }).click();

      // Local state must revert to 78.2 AND pending cloud reconciliation banner + IndexedDB record must appear
      await expect(page.getByText('Cloud restore reconciliation pending')).toBeVisible({ timeout: 15000 });

      const snapAfterFaultRestore = await readCanonicalSnapshot(page);
      expect(
        Object.values(snapAfterFaultRestore.data.appState.weightLog || {}).map((v: any) =>
          typeof v === 'number' ? v : v?.weight
        )
      ).toEqual([78.2]);

      const pendingRecords = await readIndexedDbStore(page, 'pending_cloud_sync');
      expect(pendingRecords).toHaveLength(1);
      expect(pendingRecords[0].uid).toBe(uid);
      expect(pendingRecords[0].status).toBe('failed');

      // Reload page while fault is active: pending reconciliation must persist across reload
      await page.reload();
      await navigateToTab(page, 'manage');
      await expect(page.getByText('Cloud restore reconciliation pending')).toBeVisible({ timeout: 15000 });
      expect(await readIndexedDbStore(page, 'pending_cloud_sync')).toHaveLength(1);
    } finally {
      // Always restore real rules before retrying sync and ending test
      await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    }

    // 4. Trigger Retry Cloud Sync via real UI button -> clears pending store and reconciles cloud
    await page.getByRole('button', { name: 'Retry Cloud Sync' }).click();
    await expect(page.getByText('Cloud restore reconciliation pending')).not.toBeVisible({ timeout: 15000 });

    await expect.poll(async () => (await readIndexedDbStore(page, 'pending_cloud_sync')).length).toBe(0);

    // Reload and verify UI, canonical snapshot, and IndexedDB all agree on restored state (78.2)
    await page.reload();
    await waitForCloudSynced(page);
    await expect(page.getByText('78.2').first()).toBeVisible();
    await expect(page.getByText('95')).not.toBeVisible();

    const finalSnap = await readCanonicalSnapshot(page);
    expect(
      Object.values(finalSnap.data.appState.weightLog || {}).map((v: any) =>
        typeof v === 'number' ? v : v?.weight
      )
    ).toEqual([78.2]);
    expect(await readIndexedDbStore(page, 'pending_cloud_sync')).toHaveLength(0);
  });
});
