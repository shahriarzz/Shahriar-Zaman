import { test, expect } from '@playwright/test';
import {
  clearAllEmulators,
  gotoCleanApp,
  loadProjectFirestoreRules,
  readCanonicalSnapshot,
  setFirestoreEmulatorRules,
  signInWithEmulatorHarness,
  waitForCloudSynced,
} from './helpers/emulatorE2E';

test.describe('Multi-Tab Realtime Firestore Synchronization (Real Browser + Emulators)', () => {
  test.beforeEach(async () => {
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
  });

  test('replicates cloud-backed updates from Tab B into Tab A via Firestore onSnapshot and persists across reload', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await gotoCleanApp(pageA);
      await gotoCleanApp(pageB);

      const email = 'multi-tab@example.com';
      await signInWithEmulatorHarness(pageA, email);
      await waitForCloudSynced(pageA);

      await signInWithEmulatorHarness(pageB, email);
      await waitForCloudSynced(pageB);

      // Mutate data through Tab B's UI (complete a workout session in Tab B)
      await pageB.getByRole('button', { name: 'Start Session' }).click();
      await expect(pageB.getByRole('button', { name: 'Finish' })).toBeVisible();
      await pageB.getByLabel('Set 1 weight').first().fill('110');
      await pageB.getByLabel('Set 1 reps').first().fill('5');
      await pageB.getByRole('button', { name: 'Mark set complete' }).first().click();
      await pageB.getByRole('button', { name: 'Finish' }).click();
      await expect(pageB.getByText('Session Cleared')).toBeVisible();
      await pageB.getByRole('button', { name: 'Dismiss Summary' }).click();
      await waitForCloudSynced(pageB);

      const snapB = await readCanonicalSnapshot(pageB);
      const completedLogId = Object.keys(snapB.data.logs || {})[0];
      expect(completedLogId).toBeTruthy();

      // Tab A has isolated browser storage; receiving the log proves live Firestore onSnapshot replication
      await expect.poll(async () => {
        const snapA = await readCanonicalSnapshot(pageA);
        return Boolean(snapA?.data?.logs?.[completedLogId]);
      }, { timeout: 15000 }).toBe(true);

      await expect(pageA.getByText('COMPLETED TODAY')).toBeVisible({ timeout: 15000 });

      // Reload Tab A and confirm replicated record remains persisted locally & in cloud
      await pageA.reload();
      await waitForCloudSynced(pageA);
      await expect(pageA.getByText('COMPLETED TODAY')).toBeVisible();

      const snapAReloaded = await readCanonicalSnapshot(pageA);
      expect(snapAReloaded.data.logs[completedLogId]).toBeDefined();
      expect(snapAReloaded.data.logs[completedLogId].complete).toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
