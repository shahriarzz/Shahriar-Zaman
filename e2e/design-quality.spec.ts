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
const FROZEN_NOW_ISO = '2026-10-15T12:00:00.000Z';

async function installFrozenClock(page: Page, isoDate = FROZEN_NOW_ISO): Promise<void> {
  const fixedMs = new Date(isoDate).getTime();
  await page.addInitScript((ts: number) => {
    const RealDate = window.Date;
    class FrozenDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(ts);
        } else {
          // @ts-expect-error variadic Date forwarding
          super(...args);
        }
      }
      static now(): number {
        return ts;
      }
    }
    window.Date = FrozenDate as DateConstructor;
  }, fixedMs);
}

async function seedDeterministicTrainingHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('gl_database_snapshot');
    if (!raw) throw new Error('Expected initialized gl_database_snapshot before seeding');
    const env = JSON.parse(raw);

    const seededLogs = {
      'seed-sep-12': {
        id: 'seed-sep-12',
        workoutId: 'push-a',
        date: '2026-09-12',
        complete: true,
        durationMinutes: 46,
        sets: {
          e1: [
            { id: 's-sep-1', weight: '80', reps: '8', done: true },
            { id: 's-sep-2', weight: '80', reps: '8', done: true },
          ],
          e2: [{ id: 's-sep-3', weight: '24', reps: '10', done: true }],
        },
      },
      'seed-sep-20': {
        id: 'seed-sep-20',
        workoutId: 'pull-a',
        date: '2026-09-20',
        complete: true,
        durationMinutes: 42,
        sets: {
          e7: [
            { id: 's-sep-4', weight: '75', reps: '10', done: true },
            { id: 's-sep-5', weight: '75', reps: '10', done: true },
          ],
        },
      },
      'seed-oct-07': {
        id: 'seed-oct-07',
        workoutId: 'push-a',
        date: '2026-10-07',
        complete: true,
        durationMinutes: 48,
        sets: {
          e1: [
            { id: 's-oct-1', weight: '85', reps: '8', done: true },
            { id: 's-oct-2', weight: '85', reps: '8', done: true },
          ],
          e2: [{ id: 's-oct-3', weight: '26', reps: '10', done: true }],
        },
      },
      'seed-oct-08': {
        id: 'seed-oct-08',
        workoutId: 'pull-a',
        date: '2026-10-08',
        complete: true,
        durationMinutes: 44,
        sets: {
          e7: [
            { id: 's-oct-4', weight: '80', reps: '10', done: true },
            { id: 's-oct-5', weight: '80', reps: '10', done: true },
          ],
        },
      },
      'seed-oct-09': {
        id: 'seed-oct-09',
        workoutId: 'hybrid-a',
        date: '2026-10-09',
        complete: true,
        durationMinutes: 40,
        sets: {
          e14: [{ id: 's-oct-6', weight: '36', reps: '12', done: true }],
        },
      },
      // 2026-10-10 is Day 4 Rest (natural advancement, no log -> '—' Rest)
      // 2026-10-11 is Day 5 Push B logged INCOMPLETE -> '◐' Incomplete
      'seed-oct-11': {
        id: 'seed-oct-11',
        workoutId: 'push-b',
        date: '2026-10-11',
        complete: false,
        durationMinutes: 20,
        sets: {
          e17: [
            { id: 's-oct-7', weight: '70', reps: '10', done: true },
            { id: 's-oct-8', weight: '70', reps: '10', done: false },
          ],
        },
      },
      // 2026-10-12 skipped Day 5 -> '!' Missed
      // 2026-10-13 completed Day 5 Push B -> '✓'
      'seed-oct-13': {
        id: 'seed-oct-13',
        workoutId: 'push-b',
        date: '2026-10-13',
        complete: true,
        durationMinutes: 45,
        sets: {
          e17: [{ id: 's-oct-9', weight: '75', reps: '10', done: true }],
        },
      },
      // 2026-10-14 completed Day 6 Pull B -> '✓'
      // 2026-10-15 (Today) = Day 7 Hybrid B ('·' Scheduled), 2026-10-16 = Day 8 Rest ('—')
      'seed-oct-14': {
        id: 'seed-oct-14',
        workoutId: 'pull-b',
        date: '2026-10-14',
        complete: true,
        durationMinutes: 47,
        sets: {
          e23: [{ id: 's-oct-10', weight: '65', reps: '10', done: true }],
        },
      },
    };

    env.timestamp = Date.now();
    env.data.logs = seededLogs;
    env.data.appState = {
      ...(env.data.appState || {}),
      cycleStart: '2026-10-07',
      weightLog: {
        '2026-09-28': { weight: 79.4, updatedAt: Date.now() - 86400000 * 17 },
        '2026-10-05': { weight: 79.0, updatedAt: Date.now() - 86400000 * 10 },
        '2026-10-12': { weight: 78.8, updatedAt: Date.now() - 86400000 * 3 },
        '2026-10-15': { weight: 78.6, updatedAt: Date.now() },
      },
    };

    window.localStorage.setItem('gl_database_snapshot', JSON.stringify(env));
    window.localStorage.removeItem('gl_active_session');
  });

  await page.reload();
  await waitForAppReady(page);
}

async function assertZeroAxeViolations(page: Page, contextLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  expect(
    results.violations,
    `Axe WCAG A/AA violations on ${contextLabel}: ${JSON.stringify(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        targets: v.nodes.map((n) => n.target),
      })),
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

async function assertMinTouchTarget(page: Page, selectorOrTestId: string, label: string, minSize = 44): Promise<void> {
  const loc = page.locator(selectorOrTestId).first();
  await expect(loc, `${label} should be visible`).toBeVisible();
  const box = await loc.boundingBox();
  expect(box, `${label} boundingBox missing`).toBeTruthy();
  expect(box!.height, `${label} height (${box!.height}px) < ${minSize}px`).toBeGreaterThanOrEqual(minSize);
  expect(box!.width, `${label} width (${box!.width}px) < ${minSize}px`).toBeGreaterThanOrEqual(minSize);
}

async function assertSingleRowSessionHeader(page: Page, widthLabel: string): Promise<void> {
  const finishBtn = page.getByTestId('session-finish-button');
  await expect(finishBtn).toBeVisible();
  const finishBox = await finishBtn.boundingBox();
  expect(finishBox, `Finish button boundingBox missing at ${widthLabel}`).toBeTruthy();
  expect(
    finishBox!.height,
    `Finish button height (${finishBox!.height}px) < 44px at ${widthLabel}`
  ).toBeGreaterThanOrEqual(44);

  const layout = await page.evaluate(() => {
    const controls = document.querySelector('[data-testid="session-header-controls"]') as HTMLElement | null;
    if (!controls) return null;
    const controlsRect = controls.getBoundingClientRect();
    const children = Array.from(controls.children) as HTMLElement[];
    const childBoxes = children.map((c) => {
      const r = c.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        height: r.height,
        width: r.width,
        centerY: r.top + r.height / 2,
      };
    });
    return {
      controlsRect: {
        left: controlsRect.left,
        right: controlsRect.right,
        height: controlsRect.height,
        scrollWidth: controls.scrollWidth,
        clientWidth: controls.clientWidth,
      },
      viewportWidth: document.documentElement.clientWidth,
      childBoxes,
    };
  });

  expect(layout, `Session header controls missing at ${widthLabel}`).toBeTruthy();
  expect(layout!.childBoxes.length).toBe(3);
  expect(
    layout!.controlsRect.scrollWidth,
    `Session header controls horizontal overflow at ${widthLabel}`
  ).toBeLessThanOrEqual(layout!.controlsRect.clientWidth + 1);
  expect(layout!.controlsRect.right).toBeLessThanOrEqual(layout!.viewportWidth + 1);
  expect(
    layout!.controlsRect.height,
    `Session header controls wrapped onto multiple lines (height=${layout!.controlsRect.height}) at ${widthLabel}`
  ).toBeLessThanOrEqual(52);

  const [timerBox, setsBox, finishWrapBox] = layout!.childBoxes;
  expect(Math.abs(timerBox.centerY - finishWrapBox.centerY)).toBeLessThanOrEqual(3);
  expect(Math.abs(setsBox.centerY - finishWrapBox.centerY)).toBeLessThanOrEqual(3);
  expect(timerBox.right).toBeLessThanOrEqual(setsBox.left + 1);
  expect(setsBox.right).toBeLessThanOrEqual(finishWrapBox.left + 1);
}

async function completeAllSetsInActiveSession(page: Page): Promise<void> {
  const accordions = page.locator('button[aria-controls^="exercise-panel-"]');
  await expect(accordions.first()).toBeVisible();
  const exCount = await accordions.count();
  for (let i = 0; i < exCount; i++) {
    const acc = accordions.nth(i);
    if ((await acc.getAttribute('aria-expanded')) !== 'true') {
      await acc.click();
      await expect(acc).toHaveAttribute('aria-expanded', 'true');
    }
    while ((await page.getByRole('button', { name: 'Mark set complete' }).count()) > 0) {
      await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    }
  }
}

async function clickPrimaryTab(page: Page, tab: 'dashboard' | 'history' | 'analytics' | 'manage'): Promise<void> {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  const selector = isMobile ? `#mobile-nav-item-${tab}` : `#nav-item-${tab}`;
  await page.locator(selector).click();
}

test.describe('@design-quality GAINLOG Design Quality, Accessibility & Visual Gate', () => {
  test.beforeEach(async ({ page }) => {
    await installFrozenClock(page);
    await gotoCleanApp(page);
  });

  test('passes WCAG 2.1 AA axe-core scans (all impact levels) across Dashboard, Session, History, Analytics, Manage, Editors, and Dialogs with zero console/page errors', async ({
    page,
  }) => {
    const diag = ensurePageStartupDiagnostics(page);

    // 1. Dashboard order & KPI verification + full axe scan
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('Stay Aggressive');
    const kpiGrid = page.getByTestId('dashboard-overview-stats');
    await expect(kpiGrid).toBeVisible();
    await expect(kpiGrid.getByText('Adherence')).toBeVisible();
    await expect(kpiGrid.getByText('Complete 1 scheduled workout')).toBeVisible();
    await expect(page.getByText('Total Volume (Lifetime)')).toBeVisible();
    await assertZeroAxeViolations(page, 'Dashboard');

    // 2. SessionView lifecycle: incomplete secondary -> complete all sets -> ready primary + count -> uncheck/recheck -> finish
    await page.getByRole('button', { name: 'Start Session' }).click();
    const finishBtn = page.getByTestId('session-finish-button');
    await expect(finishBtn).toBeVisible();
    await expect(finishBtn).toBeEnabled();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'false');
    await expect(finishBtn).toHaveAttribute('data-finish-animation-count', '0');

    await page.getByLabel('Set 1 weight').first().fill('100');
    await page.getByLabel('Set 1 reps').first().fill('8');
    await assertZeroAxeViolations(page, 'SessionView Active (Incomplete)');

    await completeAllSetsInActiveSession(page);
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animation-count', '1');
    await assertZeroAxeViolations(page, 'SessionView Active (All Sets Complete)');

    // Uncheck one set -> resets ready cleanly; recheck -> triggers animation count 2
    await page.getByRole('button', { name: 'Mark set incomplete' }).first().click();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'false');
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animation-count', '2');

    await finishBtn.click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await assertZeroAxeViolations(page, 'SessionView Summary');
    await page.getByRole('button', { name: 'Dismiss Summary' }).click();

    // Verify completed session log was durably saved
    const postFinishSnap = await readCanonicalSnapshot(page);
    expect(Object.keys(postFinishSnap?.data?.logs || {}).length).toBeGreaterThanOrEqual(1);

    // 3. History: Monthly Analytics & compact preview ABOVE Training Sessions + axe scans
    await navigateToTab(page, 'history');
    const searchInput = page.getByPlaceholder('Search date, routine or exercise…');
    await expect(searchInput).toBeVisible();
    const analyticsHeading = page.getByRole('heading', { name: 'Monthly Training Analytics' });
    const sessionsHeading = page.getByRole('heading', { name: 'Training Sessions' });
    const previewCard = page.getByTestId('latest-month-preview');
    await expect(analyticsHeading).toBeVisible();
    await expect(previewCard).toBeVisible();
    await expect(sessionsHeading).toBeVisible();
    const previewBox = await previewCard.boundingBox();
    const sessionsBox = await sessionsHeading.boundingBox();
    expect(previewBox!.y).toBeLessThan(sessionsBox!.y);
    await assertZeroAxeViolations(page, 'HistoryView');

    // Open Monthly Reports accordion & select month
    await page.getByRole('button', { name: /Monthly Reports/i }).click();
    await expect(page.getByText(/Completed Runs/i).first()).toBeVisible();
    await page.locator('[aria-pressed]').first().click();
    await expect(page.getByText('Window Volume')).toBeVisible();
    await assertZeroAxeViolations(page, 'HistoryView Monthly Reports Expanded');

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

  test('verifies responsive geometry, zero horizontal overflow, single-row Session header, and >=44px touch targets across all 7 viewport widths including SessionView', async ({
    page,
  }) => {
    await seedDeterministicTrainingHistory(page);

    for (const width of VIEWPORT_WIDTHS) {
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });

      for (const tab of ['dashboard', 'history', 'analytics', 'manage'] as const) {
        await clickPrimaryTab(page, tab);
        await assertNoHorizontalOverflow(page, `${tab} @ ${width}px`);

        if (width < 768) {
          await assertMinTouchTarget(page, `#mobile-nav-item-${tab}`, `Mobile nav ${tab} @ ${width}px`);

          if (tab === 'dashboard') {
            await assertMinTouchTarget(page, 'button:has-text("Start Session")', `Start Session @ ${width}px`);
          } else if (tab === 'history') {
            await assertMinTouchTarget(page, 'button:has-text("Monthly Reports")', `Monthly Reports toggle @ ${width}px`);
          } else if (tab === 'manage') {
            await assertMinTouchTarget(page, 'button:has-text("Edit Program")', `Edit Program @ ${width}px`);
          }
        }
      }
    }

    // Enter active SessionView and verify all 7 widths for overflow, single-row header, and >=44px controls
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickPrimaryTab(page, 'dashboard');
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByTestId('session-finish-button')).toBeVisible();

    for (const width of VIEWPORT_WIDTHS) {
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });
      await assertNoHorizontalOverflow(page, `SessionView @ ${width}px`);
      await assertSingleRowSessionHeader(page, `${width}px`);

      if (width < 768) {
        await assertMinTouchTarget(page, 'input[aria-label="Set 1 weight"]', `Set 1 weight @ ${width}px`);
        await assertMinTouchTarget(page, 'input[aria-label="Set 1 reps"]', `Set 1 reps @ ${width}px`);
        await assertMinTouchTarget(page, 'button[aria-label="Mark set complete"]', `Mark set complete @ ${width}px`);
        await assertMinTouchTarget(page, 'button[aria-label="Delete this set"]', `Delete set @ ${width}px`);
      }
    }
  });

  test('verifies Tab/Shift+Tab focus containment in PrivacyPolicyModal, Escape focus restoration, live reduced-motion Session compliance, and corrupt snapshot recovery', async ({
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

    // Tab / Shift+Tab containment and Escape focus restoration on Privacy Policy Modal
    await navigateToTab(page, 'manage');
    const privacyBtn = page.getByRole('button', { name: /Privacy Policy & Data Safety/i });
    await privacyBtn.focus();
    await privacyBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Wait for Dialog's initial 50ms focus handoff
    await expect.poll(async () => page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return Boolean(dlg && dlg.contains(document.activeElement));
    })).toBe(true);

    // Cycle Tab across all focusables + wrap cleanly within dialog without escaping
    const focusableLabels: string[] = [];
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const active = document.activeElement as HTMLElement | null;
        return {
          insideDialog: Boolean(dlg && active && dlg.contains(active)),
          label: active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 24) || active?.tagName || '',
        };
      });
      expect(state.insideDialog, `Tab step ${step} escaped dialog onto ${state.label}`).toBe(true);
      focusableLabels.push(state.label);
    }
    expect(focusableLabels.length).toBeGreaterThanOrEqual(3);

    // Reverse Shift+Tab from wrapped/current position stays contained inside dialog
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Shift+Tab');
      const inside = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return Boolean(dlg && document.activeElement && dlg.contains(document.activeElement));
      });
      expect(inside, `Shift+Tab step ${step} escaped dialog`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(privacyBtn).toBeFocused();

    // Reduced-motion verification on live SessionView Finish button transition
    await navigateToTab(page, 'dashboard');
    await page.getByRole('button', { name: 'Start Session' }).click();
    await completeAllSetsInActiveSession(page);
    const finishBtn = page.getByTestId('session-finish-button');
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animating', 'false');
    await expect(finishBtn).toHaveAttribute('data-finish-animation-count', '0');

    // Abandon back to clean state before testing corrupt snapshot recovery
    await page.getByRole('button', { name: 'Exit session' }).click();
    await page.getByRole('button', { name: 'EXECUTE' }).click();

    // Corrupt local storage snapshot recovery on reload
    await page.evaluate(() => {
      window.localStorage.setItem('gl_database_snapshot', '{CORRUPT_JSON_PAYLOAD');
    });
    await page.reload();
    await waitForAppReady(page);
    const repairedSnap = await readCanonicalSnapshot(page);
    expect(repairedSnap?.schemaVersion).toBeGreaterThanOrEqual(2);
  });

  test('captures deterministic visual regression baselines across desktop (1280x900) and mobile (390x844)', async ({
    page,
  }) => {
    const snapOpts = {
      fullPage: false,
      animations: 'disabled' as const,
      maxDiffPixelRatio: 0.002,
    };

    // 1. Clean initial baselines (Desktop 1280x900 & Mobile 390x844)
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot('dashboard-desktop.png', snapOpts);

    await clickPrimaryTab(page, 'analytics');
    await expect(page).toHaveScreenshot('analytics-desktop.png', snapOpts);

    await clickPrimaryTab(page, 'manage');
    await expect(page).toHaveScreenshot('manage-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await clickPrimaryTab(page, 'dashboard');
    await expect(page).toHaveScreenshot('dashboard-mobile.png', snapOpts);

    // 2. Seed rich deterministic logs & 8-day cycle (2026-10-07 start; clock = 2026-10-15)
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedDeterministicTrainingHistory(page);

    // Calendar states (completed ✓, incomplete ◐, missed !, scheduled ·, rest —)
    await page.getByRole('heading', { name: 'Calendar' }).scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot('calendar-states-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Calendar' }).scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot('calendar-states-mobile.png', snapOpts);

    // History with latest-month preview above sessions
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickPrimaryTab(page, 'history');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('latest-month-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('history-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('latest-month-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('history-mobile.png', snapOpts);

    // History with Monthly Reports expanded and month selected
    await page.getByRole('button', { name: /Monthly Reports/i }).click();
    await page.locator('[aria-pressed]').first().click();
    await expect(page.getByText('Window Volume')).toBeVisible();
    await expect(page).toHaveScreenshot('history-reports-expanded-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot('history-reports-expanded-desktop.png', snapOpts);

    // Manage editor state (WorkoutEditor opened from ProgramEditor) & PrivacyPolicyModal
    await clickPrimaryTab(page, 'manage');
    await page.getByRole('button', { name: /Privacy Policy & Data Safety/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('privacy-modal-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot('privacy-modal-mobile.png', snapOpts);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit Program' }).click();
    await page.getByTestId('cycle-slot-1').click();
    await expect(page).toHaveScreenshot('manage-editor-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot('manage-editor-desktop.png', snapOpts);

    // SessionView incomplete, all-programmed-sets-complete, and completion summary states
    await clickPrimaryTab(page, 'dashboard');
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByTestId('session-finish-button')).toHaveAttribute('data-finish-ready', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('session-incomplete-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('session-incomplete-mobile.png', snapOpts);

    await completeAllSetsInActiveSession(page);
    const finishBtn = page.getByTestId('session-finish-button');
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animating', 'false', { timeout: 2000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('session-ready-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('session-ready-desktop.png', snapOpts);

    await finishBtn.click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await expect(page).toHaveScreenshot('session-summary-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot('session-summary-mobile.png', snapOpts);
  });
});
