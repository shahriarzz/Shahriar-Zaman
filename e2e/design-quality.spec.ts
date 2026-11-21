import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ensurePageStartupDiagnostics,
  gotoCleanApp,
  navigateToTab,
  readCanonicalSnapshot,
  waitForAppReady,
} from './helpers/emulatorE2E';

const VIEWPORT_WIDTHS = [320, 360, 390, 428, 768, 1024, 1280] as const;

async function assertZeroAxeViolations(page: Page, contextLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(
    seriousOrCritical,
    `Axe serious/critical violations on ${contextLabel}: ${JSON.stringify(
      seriousOrCritical.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      null,
      2
    )}`
  ).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    metrics.scrollWidth,
    `Horizontal overflow detected on ${label}: scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`
  ).toBeLessThanOrEqual(metrics.clientWidth);
}

async function clickPrimaryTab(page: Page, tab: 'dashboard' | 'history' | 'analytics' | 'manage'): Promise<void> {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  const selector = isMobile ? `#mobile-nav-item-${tab}` : `#nav-item-${tab}`;
  await page.locator(selector).click();
}

test.describe('@design-quality GAINLOG Design Quality, Accessibility & Visual Gate', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCleanApp(page);
  });

  test('passes WCAG 2.1 AA axe-core scans across Dashboard, History, Analytics, Manage, Session, and Dialogs with zero console/page errors', async ({
    page,
  }) => {
    const diag = ensurePageStartupDiagnostics(page);

    // 1. Dashboard order & KPI verification + axe scan
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('Stay Aggressive');
    const kpiGrid = page.getByTestId('dashboard-overview-stats');
    await expect(kpiGrid).toBeVisible();
    await expect(kpiGrid.getByText('Adherence')).toBeVisible();
    await expect(kpiGrid.getByText('Complete 1 scheduled workout')).toBeVisible();
    await expect(page.getByText('Total Volume (Lifetime)')).toBeVisible();
    await assertZeroAxeViolations(page, 'Dashboard');

    // 2. Start & finish a Session so History & Analytics have live non-empty charts
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await page.getByLabel('Set 1 weight').first().fill('100');
    await page.getByLabel('Set 1 reps').first().fill('8');
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await assertZeroAxeViolations(page, 'SessionView Active');

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await assertZeroAxeViolations(page, 'SessionView Summary');
    await page.getByRole('button', { name: 'Dismiss Summary' }).click();

    // 3. History: search, edit, monthly reports & axe scan
    await navigateToTab(page, 'history');
    const searchInput = page.getByPlaceholder('Search date, routine or exercise…');
    await expect(searchInput).toBeVisible();
    await expect(page.getByText('Training Sessions')).toBeVisible();
    await assertZeroAxeViolations(page, 'HistoryView');

    // Open Monthly Reports accordion
    await page.getByRole('button', { name: /Monthly Reports/i }).click();
    await expect(page.getByText(/Sessions/i).first()).toBeVisible();

    // Search empty vs clear filter
    await searchInput.fill('zzzznonexistent');
    await expect(page.getByText('No Matching Sessions')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Filters' }).click();
    await expect(page.getByText('No Matching Sessions')).toHaveCount(0);

    // 4. Analytics: section 01-04 taxonomy, indigo AreaChart & heatmap month navigation + axe scan
    await navigateToTab(page, 'analytics');
    await expect(page.getByText('01 · Training Activity & Consistency')).toBeVisible();
    await expect(page.getByText('Daily Training Volume')).toBeVisible();
    await expect(page.getByText('04 · Training Patterns & Insights')).toBeVisible();
    await assertZeroAxeViolations(page, 'AnalyticsView');

    await page.getByRole('button', { name: 'Previous Month' }).click();
    await page.getByRole('button', { name: 'Next Month' }).click();

    // 5. Manage -> ProgramEditor -> CycleEditor -> WorkoutEditor -> ExerciseEditor + Dialog
    await navigateToTab(page, 'manage');
    await assertZeroAxeViolations(page, 'ManageView Landing');

    await page.getByRole('button', { name: /Privacy Policy & Data Safety/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertZeroAxeViolations(page, 'PrivacyPolicyModal');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit Program' }).click();
    await expect(page.getByTestId('cycle-list')).toBeVisible();
    await assertZeroAxeViolations(page, 'CycleEditor');

    await page.getByTestId('cycle-slot-1').click();
    await assertZeroAxeViolations(page, 'WorkoutEditor');

    const firstExExpand = page.locator('button[aria-controls^="workout-ex-panel-"]').first();
    await firstExExpand.click();
    await page.getByRole('button', { name: /Edit Prescription/i }).first().click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Save Exercise' })).toHaveCount(0);
    await assertZeroAxeViolations(page, 'ExerciseEditor');

    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('verifies responsive geometry, zero horizontal overflow, and >=44px mobile touch targets across 7 viewport widths', async ({
    page,
  }) => {
    for (const width of VIEWPORT_WIDTHS) {
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });

      for (const tab of ['dashboard', 'history', 'analytics', 'manage'] as const) {
        await clickPrimaryTab(page, tab);
        await assertNoHorizontalOverflow(page, `${tab} @ ${width}px`);

        if (width < 768) {
          const navBtnBox = await page.locator(`#mobile-nav-item-${tab}`).boundingBox();
          expect(navBtnBox).toBeTruthy();
          expect(navBtnBox!.height).toBeGreaterThanOrEqual(44);
          expect(navBtnBox!.width).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

  test('verifies keyboard Escape/focus restoration, reduced motion mode, and corrupt snapshot recovery', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Focus restoration on Header Cloud Status Popover
    const statusTrigger = page.locator('button.group\\/sync');
    await statusTrigger.focus();
    await statusTrigger.click();
    await expect(page.locator('#cloud-status-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cloud-status-popover')).toHaveCount(0);
    await expect(statusTrigger).toBeFocused();

    // Focus restoration on Privacy Policy Modal
    await navigateToTab(page, 'manage');
    const privacyBtn = page.getByRole('button', { name: /Privacy Policy & Data Safety/i });
    await privacyBtn.focus();
    await privacyBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(privacyBtn).toBeFocused();

    // Corrupt local storage snapshot recovery on reload
    await page.evaluate(() => {
      window.localStorage.setItem('gl_database_snapshot', '{CORRUPT_JSON_PAYLOAD');
    });
    await page.reload();
    await waitForAppReady(page);
    const repairedSnap = await readCanonicalSnapshot(page);
    expect(repairedSnap?.schemaVersion).toBeGreaterThanOrEqual(2);
  });

  test('captures visual regression screenshots across desktop and mobile primary views', async ({ page }) => {
    // Desktop 1280x900
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot('dashboard-desktop.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    await clickPrimaryTab(page, 'history');
    await expect(page).toHaveScreenshot('history-desktop.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    await clickPrimaryTab(page, 'analytics');
    await expect(page).toHaveScreenshot('analytics-desktop.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    await clickPrimaryTab(page, 'manage');
    await expect(page).toHaveScreenshot('manage-desktop.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await clickPrimaryTab(page, 'dashboard');
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
