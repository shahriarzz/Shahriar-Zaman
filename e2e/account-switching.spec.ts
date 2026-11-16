import { test, expect } from '@playwright/test';
import {
  clearAllEmulators,
  gotoCleanApp,
  listFirestoreDocsAdmin,
  loadProjectFirestoreRules,
  navigateToTab,
  readCanonicalSnapshot,
  setFirestoreEmulatorRules,
  signInWithEmulatorHarness,
  waitForCloudSynced,
} from './helpers/emulatorE2E';

test.describe('Account Switching & Data Isolation E2E (Real Auth + Firestore Emulators)', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllEmulators();
    await setFirestoreEmulatorRules(loadProjectFirestoreRules());
    await gotoCleanApp(page);
  });

  test('isolates UI, local snapshot, and Firestore paths cleanly across A -> sign out UI -> B -> reload -> sign out UI -> A', async ({
    page,
  }) => {
    // 1. Authenticate as Account A and create A-specific body weight + completed session
    const { uid: uidA } = await signInWithEmulatorHarness(page, 'account-a@example.com');
    await waitForCloudSynced(page);

    await page.locator('#quick-body-weight-input').fill('75.5');
    await page.getByRole('button', { name: 'Log', exact: true }).click();

    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.getByLabel('Set 1 weight').first().fill('90');
    await page.getByLabel('Set 1 reps').first().fill('5');
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss Summary' }).click();

    await waitForCloudSynced(page);
    const snapA = await readCanonicalSnapshot(page);
    const logIdA = Object.keys(snapA.data.logs)[0];
    expect(logIdA).toBeTruthy();

    // 2. Sign out through the real AccountSection UI
    await navigateToTab(page, 'manage');
    await expect(page.getByText('account-a@example.com')).toBeVisible();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Sync with Google' })).toBeVisible();

    // After sign-out reset, Account A's log & body weight must be gone from local snapshot
    const snapAfterSignOut = await readCanonicalSnapshot(page);
    expect(Object.keys(snapAfterSignOut?.data?.logs || {})).toHaveLength(0);
    expect(Object.keys(snapAfterSignOut?.data?.appState?.weightLog || {})).toHaveLength(0);

    // 3. Sign in as Account B
    const { uid: uidB } = await signInWithEmulatorHarness(page, 'account-b@example.com');
    expect(uidB).not.toBe(uidA);
    await waitForCloudSynced(page);
    await expect(page.getByText('account-b@example.com')).toBeVisible();

    // Account B UI and Firestore paths must NEVER contain Account A's records
    await navigateToTab(page, 'dashboard');
    await expect(page.getByText('COMPLETED TODAY')).not.toBeVisible();
    await expect(page.getByText('75.5')).not.toBeVisible();

    // Create B-specific body weight
    await page.locator('#quick-body-weight-input').fill('92.1');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await waitForCloudSynced(page);

    const snapB = await readCanonicalSnapshot(page);
    expect(Object.keys(snapB.data.logs || {})).toHaveLength(0);
    expect(
      Object.values(snapB.data.appState.weightLog || {}).map((v: any) => (typeof v === 'number' ? v : v?.weight))
    ).toEqual([92.1]);

    // Reload while signed in as B -> B's data stays isolated
    await page.reload();
    await expect(page.getByText('92.1', { exact: true })).toBeVisible();
    await expect(page.getByText('75.5')).not.toBeVisible();
    expect(await listFirestoreDocsAdmin(`users/${uidB}/logs`)).toHaveLength(0);
    expect((await listFirestoreDocsAdmin(`users/${uidA}/logs`)).map((d) => d.id)).toEqual([logIdA]);

    // 4. Sign out B via UI and sign back in as A
    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Sync with Google' })).toBeVisible();

    await signInWithEmulatorHarness(page, 'account-a@example.com');
    await waitForCloudSynced(page);
    await navigateToTab(page, 'dashboard');

    await expect(page.getByText('75.5').first()).toBeVisible();
    await expect(page.getByText('92.1')).not.toBeVisible();
    await expect(page.getByText('COMPLETED TODAY')).toBeVisible();

    const snapRestoredA = await readCanonicalSnapshot(page);
    expect(Object.keys(snapRestoredA.data.logs || {})).toEqual([logIdA]);
  });
});
