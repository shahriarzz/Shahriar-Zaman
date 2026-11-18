import { test, expect } from '@playwright/test';
import {
  clearAllEmulators,
  decodeFirestoreStringField,
  getFirestoreDocAdmin,
  gotoCleanApp,
  listFirestoreDocsAdmin,
  loadProjectFirestoreRules,
  navigateToTab,
  readActiveSessionStorage,
  readCanonicalSnapshot,
  setFirestoreEmulatorRules,
  signInWithEmulatorHarness,
  waitForAppReady,
  waitForCloudSynced,
} from './helpers/emulatorE2E';

test.describe('Workout Session Completion E2E Flow (Real UI + Firestore Emulator)', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    await gotoCleanApp(page);
  });

  test('completes a workout through SessionView UI, writes 1 log locally & to Firestore, updates History/Dashboard, and reloads without duplicating', async ({
    page,
  }) => {
    const { uid } = await signInWithEmulatorHarness(page, 'session-flow@example.com');
    await waitForCloudSynced(page);

    // 1. Start today's protocol from Dashboard
    await expect(page.getByRole('button', { name: 'Start Session' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Session' }).click();

    // 2. Enter weight, reps, and mark sets completed
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await page.getByLabel('Set 1 weight').first().fill('100');
    await page.getByLabel('Set 1 reps').first().fill('8');
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();

    // 3. Finish the workout and verify summary screen
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await expect(page.getByText('800')).toBeVisible();

    // 4. Verify exactly 1 local log & active draft cleared
    const localSnap = await readCanonicalSnapshot(page);
    const localLogIds = Object.keys(localSnap?.data?.logs || {});
    expect(localLogIds).toHaveLength(1);
    const createdLogId = localLogIds[0];
    expect(localSnap.data.logs[createdLogId].complete).toBe(true);
    expect(await readActiveSessionStorage(page)).toBeNull();

    // 5. Verify Firestore /users/{uid}/logs/{id} and cycleStart consistency
    await expect.poll(async () => (await listFirestoreDocsAdmin(`users/${uid}/logs`)).length).toBe(1);
    const cloudLogs = await listFirestoreDocsAdmin(`users/${uid}/logs`);
    expect(cloudLogs[0].id).toBe(createdLogId);

    const cloudUserDoc = await getFirestoreDocAdmin(`users/${uid}`);
    expect(cloudUserDoc.exists).toBe(true);
    expect(decodeFirestoreStringField(cloudUserDoc.fields?.cycleStart)).toBe(localSnap.data.appState.cycleStart);

    // 6. Dismiss summary -> Dashboard shows Completed Today & Streak >= 1
    await page.getByRole('button', { name: 'Dismiss Summary' }).click();
    await expect(page.getByText('COMPLETED TODAY')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Completed' })).toBeDisabled();

    // 7. Navigate to History and verify the completed session appears
    await navigateToTab(page, 'history');
    await expect(page.getByText(localSnap.data.logs[createdLogId].date).first()).toBeVisible();

    // 8. Reload browser page and verify no duplicate logs exist locally or in Firestore
    await page.reload();
    await waitForAppReady(page);
    await waitForCloudSynced(page);

    const snapAfterReload = await readCanonicalSnapshot(page);
    expect(Object.keys(snapAfterReload?.data?.logs || {})).toEqual([createdLogId]);
    expect(snapAfterReload.data.appState.cycleStart).toBe(localSnap.data.appState.cycleStart);

    const cloudLogsAfterReload = await listFirestoreDocsAdmin(`users/${uid}/logs`);
    expect(cloudLogsAfterReload.map((d) => d.id)).toEqual([createdLogId]);
  });
});
