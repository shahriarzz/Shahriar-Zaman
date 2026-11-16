import { test, expect } from '@playwright/test';
import {
  clearAllEmulators,
  gotoCleanApp,
  loadProjectFirestoreRules,
  navigateToTab,
  readActiveSessionStorage,
  readCanonicalSnapshot,
  readIndexedDbStore,
  readStagingKey,
  setFirestoreEmulatorRules,
} from './helpers/emulatorE2E';

test.describe('Browser Persistence & IndexedDB Recovery (Real Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    await gotoCleanApp(page);
  });

  test('persists canonical snapshot cleanly without stale staging, restores active session draft across reload, and restores IndexedDB savepoint via UI', async ({
    page,
  }) => {
    // 1. Canonical snapshot persists cleanly and gl_snapshot_staging is cleaned after two-phase commit
    const bodyWeightInput = page.locator('#quick-body-weight-input');
    const logWeightBtn = page.getByRole('button', { name: 'Log', exact: true });

    await bodyWeightInput.fill('82.4');
    await logWeightBtn.click();

    await expect.poll(async () => {
      const snap = await readCanonicalSnapshot(page);
      const entries = Object.values(snap?.data?.appState?.weightLog || {});
      return entries.some((v: any) => (typeof v === 'number' ? v : v?.weight) === 82.4);
    }).toBe(true);
    expect(await readStagingKey(page)).toBeNull();

    // Create savepoint BEFORE later workout draft / mutation so restoring reverts to 82.4 without post-savepoint changes
    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: 'Create Savepoint' }).click();
    await expect(page.getByText('Manual restore savepoint created successfully.')).toBeVisible();

    await expect.poll(async () => (await readIndexedDbStore(page, 'auto_backups')).length).toBeGreaterThanOrEqual(1);

    // Mutate body weight to a different value after the savepoint
    await navigateToTab(page, 'dashboard');
    await bodyWeightInput.fill('99.9');
    await logWeightBtn.click();
    await expect.poll(async () => {
      const snap = await readCanonicalSnapshot(page);
      const entries = Object.values(snap?.data?.appState?.weightLog || {});
      return entries.some((v: any) => (typeof v === 'number' ? v : v?.weight) === 99.9);
    }).toBe(true);

    // 2. Active session draft persists in gl_active_session across reload and clears cleanly on finish
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    const firstWeightInput = page.getByLabel('Set 1 weight').first();
    const firstRepsInput = page.getByLabel('Set 1 reps').first();
    await firstWeightInput.fill('105');
    await firstRepsInput.fill('6');
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();

    await expect.poll(async () => {
      const draft = await readActiveSessionStorage(page);
      if (!draft?.sessionSets) return false;
      const firstExSets = Object.values(draft.sessionSets)[0] as any[];
      return firstExSets?.[0]?.weight === '105' && firstExSets?.[0]?.reps === '6' && firstExSets?.[0]?.done === true;
    }).toBe(true);

    // Reload browser page: Dashboard restores "UNFINISHED SESSION RESTORED" banner and resuming keeps 105 x 6
    await page.reload();
    await expect(page.getByText('UNFINISHED SESSION RESTORED')).toBeVisible();
    await page.getByRole('button', { name: 'Resume Session' }).click();

    await expect(page.getByLabel('Set 1 weight').first()).toHaveValue('105');
    await expect(page.getByLabel('Set 1 reps').first()).toHaveValue('6');

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    expect(await readActiveSessionStorage(page)).toBeNull();
    await page.getByRole('button', { name: 'Dismiss Summary' }).click();

    // 3. Reload after IndexedDB checkpoint creation: checkpoints survive reload in real Chromium IndexedDB and restore via UI
    await page.reload();
    await navigateToTab(page, 'manage');
    await expect(page.getByText('Manual Vault Savepoint').first()).toBeVisible();

    const manualRestoreBtn = page
      .getByText('Manual Vault Savepoint', { exact: true })
      .first()
      .locator('xpath=ancestor::div[.//button][1]')
      .getByRole('button', { name: 'Restore', exact: true });
    await manualRestoreBtn.click();

    await expect(page.getByRole('heading', { name: 'Restore Savepoint' })).toBeVisible();
    await page.getByRole('button', { name: 'EXECUTE' }).click();

    await expect(page.getByText(/Successfully restored database checkpoint/i)).toBeVisible();

    // Verify canonical snapshot reverted to 82.4 (not 99.9) and cleared the post-savepoint log
    const restoredSnap = await readCanonicalSnapshot(page);
    const bodyWeights = Object.values(restoredSnap.data.appState.weightLog || {}).map((v: any) =>
      typeof v === 'number' ? v : v?.weight
    );
    expect(bodyWeights).toContain(82.4);
    expect(bodyWeights).not.toContain(99.9);
    expect(Object.keys(restoredSnap.data.logs || {})).toHaveLength(0);
    expect(await readStagingKey(page)).toBeNull();
  });
});
