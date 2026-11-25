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

/**
 * Waits for finite Web Animations (including Framer Motion entrance/layout transitions)
 * to finish and flushes paint frames without relying on fixed arbitrary sleeps.
 */
async function waitForAnimationsToSettle(page: Page, rootSelector?: string): Promise<void> {
  await page.evaluate(async (sel) => {
    const scopeEl = sel ? document.querySelector(sel) : document;
    const finiteFinishedPromises: Promise<unknown>[] = [];

    if (typeof document.getAnimations === 'function') {
      const animations = document.getAnimations();
      for (const anim of animations) {
        if (scopeEl && scopeEl !== document) {
          const target = (anim.effect as KeyframeEffect | null)?.target as Node | null;
          if (target && !scopeEl.contains(target)) {
            continue;
          }
        }
        const computed = anim.effect?.getComputedTiming();
        const iterations = computed?.iterations ?? 1;
        if (Number.isFinite(iterations) && iterations !== Infinity) {
          finiteFinishedPromises.push(anim.finished.catch(() => {}));
        }
      }
    }

    if (finiteFinishedPromises.length > 0) {
      await Promise.allSettled(finiteFinishedPromises);
    }

    const countUpTimeoutMs = 3000;
    const countUpStart = performance.now();
    while (true) {
      const pendingCountUps = Array.from(
        (scopeEl || document).querySelectorAll('[data-countup-animating="true"]')
      );
      if (pendingCountUps.length === 0) break;
      if (performance.now() - countUpStart > countUpTimeoutMs) {
        const sample = pendingCountUps
          .slice(0, 3)
          .map((el) => (el.textContent || '').trim())
          .join(', ');
        throw new Error(
          `Timed out after ${countUpTimeoutMs}ms waiting for ${pendingCountUps.length} StatCard count-up animation(s) to settle (${sample || 'unknown'}).`
        );
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, rootSelector ?? null);
}

/**
 * Explicitly waits until modal dialog & backdrop have completed entrance transitions
 * and both reach computed opacity "1" before accessibility scanning or screenshots.
 */
async function waitForDialogReady(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
        if (!dlg) return false;
        const container = dlg.parentElement;
        const backdrop = container?.querySelector('[aria-hidden="true"]') as HTMLElement | null;
        const dlgStyle = window.getComputedStyle(dlg);
        const bgStyle = backdrop ? window.getComputedStyle(backdrop) : null;
        return dlgStyle.opacity === '1' && (!bgStyle || bgStyle.opacity === '1');
      })
    )
    .toBe(true);

  await waitForAnimationsToSettle(page, '[role="dialog"]');
}

async function scrollElementBelowStickyNav(page: Page, locatorSelector: string, textFilter?: string): Promise<void> {
  await page.evaluate(
    ({ sel, text }) => {
      const candidates = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const target = text
        ? candidates.find((el) => (el.textContent || '').includes(text))
        : candidates[0];
      if (!target) {
        throw new Error(`Could not find scroll target: ${sel} (${text || 'any'})`);
      }
      const rect = target.getBoundingClientRect();
      const y = Math.max(0, Math.round(rect.top + window.scrollY - 76));
      window.scrollTo(0, y);
    },
    { sel: locatorSelector, text: textFilter ?? null }
  );
  await waitForAnimationsToSettle(page);
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
  await waitForAnimationsToSettle(page);
}

async function assertZeroAxeViolations(page: Page, contextLabel: string): Promise<void> {
  await waitForAnimationsToSettle(page);
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
      await waitForAnimationsToSettle(page);
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
  const expectedHeading: Record<'dashboard' | 'history' | 'analytics' | 'manage', string> = {
    dashboard: 'Stay Aggressive',
    history: 'History',
    analytics: 'Analytics',
    manage: 'Manage',
  };
  await expect(page.getByRole('heading', { level: 1, name: expectedHeading[tab] })).toBeVisible();
  await waitForAnimationsToSettle(page);
}

test.describe('@design-quality GAINLOG Design Quality, Accessibility & Visual Gate', () => {
  test.beforeEach(async ({ page }) => {
    await installFrozenClock(page);
    await gotoCleanApp(page);
    await waitForAnimationsToSettle(page);
  });

  test('axe-core WCAG 2.1 AA: Dashboard', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('Stay Aggressive');
    const kpiGrid = page.getByTestId('dashboard-overview-stats');
    await expect(kpiGrid).toBeVisible();
    await expect(kpiGrid.getByText('Adherence')).toBeVisible();
    await expect(kpiGrid.getByText('Complete 1 scheduled workout')).toBeVisible();
    await expect(page.getByText('Total Volume (Lifetime)')).toBeVisible();

    await assertZeroAxeViolations(page, 'Dashboard');
    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: Session (incomplete, ready, manual extra set & summary)', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await page.getByRole('button', { name: 'Start Session' }).click();
    await waitForAnimationsToSettle(page);

    const finishBtn = page.getByTestId('session-finish-button');
    const headerControls = page.getByTestId('session-header-controls');
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
    await expect(finishBtn).toHaveAttribute('data-finish-animating', 'false', { timeout: 2000 });
    await assertZeroAxeViolations(page, 'SessionView Active (All Sets Complete)');

    const initialRatioText = await headerControls.getByText(/\/\d+\s+SETS/).textContent();
    const initialMatch = initialRatioText?.match(/(\d+)\/(\d+)\s+SETS/);
    expect(initialMatch, `Expected X/Y SETS badge, got ${initialRatioText}`).toBeTruthy();
    const programmedCount = Number(initialMatch![2]);

    // Add manual extra set -> updates SETS denominator (N -> N+1) and reverts Finish to incomplete
    await page.getByRole('button', { name: 'Add Additional Set' }).first().click();
    await expect(headerControls.getByText(`${programmedCount}/${programmedCount + 1} SETS`)).toBeVisible();
    await expect(finishBtn).toBeEnabled();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'false');

    // Complete manually added set -> returns Finish to primary ready (count 2)
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect(headerControls.getByText(`${programmedCount + 1}/${programmedCount + 1} SETS`)).toBeVisible();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animation-count', '2');

    // Uncheck -> resets ready cleanly; recheck -> triggers animation count 3
    await page.getByRole('button', { name: 'Mark set incomplete' }).first().click();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'false');
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animation-count', '3');

    await finishBtn.click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await assertZeroAxeViolations(page, 'SessionView Summary');
    await page.getByRole('button', { name: 'Dismiss Summary' }).click();

    const postFinishSnap = await readCanonicalSnapshot(page);
    expect(Object.keys(postFinishSnap?.data?.logs || {}).length).toBeGreaterThanOrEqual(1);
    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: History (preview & expanded Monthly Reports)', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await seedDeterministicTrainingHistory(page);
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

    await page.getByRole('button', { name: /Monthly Reports/i }).click();
    await expect(page.getByText(/Completed Runs/i).first()).toBeVisible();
    await page.locator('[aria-pressed]').first().click();
    await expect(page.getByText('Window Volume')).toBeVisible();
    await assertZeroAxeViolations(page, 'HistoryView Monthly Reports Expanded');

    await searchInput.fill('zzzznonexistent');
    await expect(page.getByText('No Matching Sessions')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Filters' }).click();
    await expect(page.getByText('No Matching Sessions')).toHaveCount(0);

    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: Analytics', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await seedDeterministicTrainingHistory(page);
    await navigateToTab(page, 'analytics');

    await expect(page.getByText('01 · Training Activity & Consistency')).toBeVisible();
    await expect(page.getByText('Daily Training Volume')).toBeVisible();
    await expect(page.getByText('04 · Training Patterns & Insights')).toBeVisible();
    await assertZeroAxeViolations(page, 'AnalyticsView (Top)');

    await scrollElementBelowStickyNav(page, 'h2,h3', 'Monthly Intensity Heatmap');
    await assertZeroAxeViolations(page, 'AnalyticsView (Heatmap)');

    await scrollElementBelowStickyNav(page, 'p', '02 · Training Distribution & Anatomical Load');
    await expect(page.getByRole('heading', { name: 'Muscle Group Targeting' })).toBeVisible();
    await scrollElementBelowStickyNav(page, 'h3', 'Workload & Recency');
    await assertZeroAxeViolations(page, 'AnalyticsView (Muscle Balance & Recovery)');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Previous Month' }).click();
    await page.getByRole('button', { name: 'Next Month' }).click();

    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: Manage', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await navigateToTab(page, 'manage');
    await assertZeroAxeViolations(page, 'ManageView Landing');
    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: PrivacyPolicyModal', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: /Privacy Policy & Data Safety/i }).click();
    await waitForDialogReady(page);

    await assertZeroAxeViolations(page, 'PrivacyPolicyModal');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: CycleEditor', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: 'Edit Program' }).click();
    await expect(page.getByTestId('cycle-list')).toBeVisible();
    await assertZeroAxeViolations(page, 'CycleEditor');

    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: WorkoutEditor', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: 'Edit Program' }).click();
    await page.getByTestId('cycle-slot-1').click();
    await expect(page.locator('button[aria-controls^="workout-ex-panel-"]').first()).toBeVisible();
    await assertZeroAxeViolations(page, 'WorkoutEditor');

    expect(diag.pageErrors).toEqual([]);
    expect(diag.consoleErrors).toEqual([]);
  });

  test('axe-core WCAG 2.1 AA: ExerciseEditor', async ({ page }) => {
    const diag = ensurePageStartupDiagnostics(page);
    await navigateToTab(page, 'manage');
    await page.getByRole('button', { name: 'Edit Program' }).click();
    await page.getByTestId('cycle-slot-1').click();

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
    await waitForAnimationsToSettle(page);

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
    await waitForDialogReady(page);

    // Wait for Dialog's focus handoff
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]');
          return Boolean(dlg && dlg.contains(document.activeElement));
        })
      )
      .toBe(true);

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

  test('verifies selective StatCard count-up, rapid tab responsiveness, overlay/dialog layering, reduced-motion, and 48dp mobile hit targets', async ({
    page,
  }) => {
    // 1. Seed deterministic training history and reload on Dashboard to inspect initial count-up behavior
    await seedDeterministicTrainingHistory(page);

    // Wait for count-up to settle and inspect which Dashboard StatCards support count-up vs stay static
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Stay Aggressive' })).toBeVisible();

    const kpiLabelsAfterLoad = await page.evaluate(async () => {
      const seenAnimating = new Set<string>();
      for (let frame = 0; frame < 35; frame++) {
        document.querySelectorAll('[data-countup-animating="true"]').forEach((el) => {
          const cardText = el.closest('[class*="border"]')?.textContent || el.parentElement?.textContent || '';
          for (const lbl of ['Streak', 'Training Frequency', 'Adherence', 'Strength Progress']) {
            if (cardText.includes(lbl)) seenAnimating.add(lbl);
          }
        });
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      return Array.from(seenAnimating);
    });

    // Streak and Strength Progress may finish rapidly if target unchanged/cached or animate briefly;
    // Training Frequency and Adherence MUST NEVER animate
    expect(kpiLabelsAfterLoad).not.toContain('Training Frequency');
    expect(kpiLabelsAfterLoad).not.toContain('Adherence');
    await waitForAnimationsToSettle(page);

    // 2 & 3. Sequential + rapid tab transitions stay responsive with zero blank frames and static History/Analytics StatCards
    for (const tab of ['history', 'analytics', 'manage', 'dashboard'] as const) {
      await clickPrimaryTab(page, tab);
      expect(await page.locator('[data-countup-animating="true"]').count()).toBe(0);
    }

    // Rapid repeated clicks without settling between tabs
    await page.locator('#nav-item-history').click();
    await page.locator('#nav-item-analytics').click();
    await page.locator('#nav-item-manage').click();
    await page.locator('#nav-item-dashboard').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Stay Aggressive' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Session' })).toBeEnabled();

    // 4 & 5 & 6. Mobile viewport (360x844): Dialog stacking, Confirm Dialog, Session flow & 48dp hit targets
    await page.setViewportSize({ width: 360, height: 844 });
    await clickPrimaryTab(page, 'manage');

    // Immediately click Privacy Policy upon tab switch and verify Dialog layers ABOVE sticky nav and mobile bottom bar from frame 0
    await page.getByRole('button', { name: /Privacy Policy & Data Safety/i }).click();
    const layeringCheck = await page.evaluate(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const topEl = document.elementFromPoint(180, 20);
      const botEl = document.elementFromPoint(180, 815);
      return {
        hasDialog: Boolean(document.querySelector('[role="dialog"]')),
        topHitNav: Boolean(topEl?.closest('nav')),
        botHitMobileBar: Boolean(botEl?.closest('.fixed.bottom-0')),
      };
    });
    expect(layeringCheck.hasDialog).toBe(true);
    expect(layeringCheck.topHitNav, 'Dialog backdrop must cover sticky top nav').toBe(false);
    expect(layeringCheck.botHitMobileBar, 'Dialog backdrop must cover mobile bottom bar').toBe(false);
    await waitForDialogReady(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Header cloud popover layering
    await page.locator('button.group\\/sync').click();
    await expect(page.locator('#cloud-status-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cloud-status-popover')).toHaveCount(0);

    // Mobile bottom nav & header sync 48dp container verification
    for (const tab of ['dashboard', 'history', 'analytics', 'manage'] as const) {
      await assertMinTouchTarget(page, `#mobile-nav-item-${tab}`, `Mobile bottom nav ${tab} (48dp)`, 48);
    }
    await assertMinTouchTarget(page, 'button.group\\/sync', 'Header sync trigger (48dp)', 48);

    // WorkoutEditor 48dp hit expansion check
    await page.getByRole('button', { name: 'Edit Program' }).click();
    await expect(page.getByTestId('cycle-list')).toBeVisible();
    await waitForAnimationsToSettle(page);
    await page.getByTestId('cycle-slot-1').click();
    await expect(page.locator('button[aria-controls^="workout-ex-panel-"]').first()).toBeVisible();
    await waitForAnimationsToSettle(page);
    const editorHits = await page.evaluate(() => {
      const selectors = [
        'button[aria-label^="Move "][aria-label$=" up"]',
        'button[aria-label^="Move "][aria-label$=" down"]',
        'button[aria-controls^="workout-ex-panel-"]',
      ];
      return selectors.map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const afterStyle = window.getComputedStyle(el, '::after');
        const extraTop = parseFloat(afterStyle.top) || 0;
        const extraBottom = parseFloat(afterStyle.bottom) || 0;
        const effectiveHeight = r.height - extraTop - extraBottom;
        return { sel, rectHeight: r.height, effectiveHeight, width: r.width };
      });
    });
    for (const item of editorHits) {
      expect(item).toBeTruthy();
      expect(item!.effectiveHeight, `${item!.sel} effective hit height`).toBeGreaterThanOrEqual(48);
    }

    // Enter SessionView on mobile (360x844), check 48dp hit boxes & elementFromPoint separation
    await clickPrimaryTab(page, 'dashboard');
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByTestId('session-finish-button')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark set complete' }).first()).toBeVisible();
    await waitForAnimationsToSettle(page);

    const sessionHits = await page.evaluate(() => {
      const doneBtn = document.querySelector('button[aria-label="Mark set complete"]') as HTMLElement | null;
      const delBtn = document.querySelector('button[aria-label="Delete this set"]') as HTMLElement | null;
      const exitBtn = document.querySelector('button[aria-label="Exit session"]') as HTMLElement | null;
      const finishBtn = document.querySelector('[data-testid="session-finish-button"]') as HTMLElement | null;
      const measure = (el: HTMLElement | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const elCs = window.getComputedStyle(el);
        const bl = parseFloat(elCs.borderLeftWidth) || 0;
        const br = parseFloat(elCs.borderRightWidth) || 0;
        const bt = parseFloat(elCs.borderTopWidth) || 0;
        const bb = parseFloat(elCs.borderBottomWidth) || 0;
        const cs = window.getComputedStyle(el, '::after');
        const top = parseFloat(cs.top) || 0;
        const bottom = parseFloat(cs.bottom) || 0;
        const left = parseFloat(cs.left) || 0;
        const right = parseFloat(cs.right) || 0;
        const hitLeft = Math.min(r.left, r.left + bl + left);
        const hitRight = Math.max(r.right, r.right - br - right);
        const hitTop = Math.min(r.top, r.top + bt + top);
        const hitBottom = Math.max(r.bottom, r.bottom - bb - bottom);
        return {
          rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
          hitWidth: hitRight - hitLeft,
          hitHeight: hitBottom - hitTop,
          hitLeft,
          hitRight,
          hitTop,
          hitBottom,
        };
      };
      const done = measure(doneBtn);
      const del = measure(delBtn);
      const exit = measure(exitBtn);
      const finish = measure(finishBtn);
      const doneEdgeHit = done ? document.elementFromPoint(done.hitLeft + 1, (done.hitTop + done.hitBottom) / 2) : null;
      const delEdgeHit = del ? document.elementFromPoint(del.hitRight - 1, (del.hitTop + del.hitBottom) / 2) : null;
      return {
        done,
        del,
        exit,
        finish,
        doneEdgeTag: doneEdgeHit?.outerHTML?.slice(0, 120) || null,
        delEdgeTag: delEdgeHit?.outerHTML?.slice(0, 120) || null,
        doneEdgeBelongsToDone: Boolean(doneBtn && doneEdgeHit && doneBtn.contains(doneEdgeHit)),
        delEdgeBelongsToDel: Boolean(delBtn && delEdgeHit && delBtn.contains(delEdgeHit)),
      };
    });

    expect(sessionHits.exit?.hitHeight).toBeGreaterThanOrEqual(48);
    expect(sessionHits.exit?.hitWidth).toBeGreaterThanOrEqual(48);
    expect(sessionHits.finish?.hitHeight).toBeGreaterThanOrEqual(48);
    expect(sessionHits.done?.hitHeight).toBeGreaterThanOrEqual(48);
    expect(sessionHits.done?.hitWidth).toBeGreaterThanOrEqual(48);
    expect(sessionHits.del?.hitHeight).toBeGreaterThanOrEqual(48);
    expect(sessionHits.del?.hitWidth).toBeGreaterThanOrEqual(48);
    expect(sessionHits.done!.hitRight).toBeLessThanOrEqual(sessionHits.del!.hitLeft);
    expect(sessionHits.doneEdgeBelongsToDone, JSON.stringify({ done: sessionHits.done, doneEdgeTag: sessionHits.doneEdgeTag })).toBe(true);
    expect(sessionHits.delEdgeBelongsToDel, JSON.stringify({ del: sessionHits.del, delEdgeTag: sessionHits.delEdgeTag })).toBe(true);

    // Complete session, observe summary, and return to Dashboard
    await completeAllSetsInActiveSession(page);
    await page.getByTestId('session-finish-button').click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await waitForAnimationsToSettle(page);
    await expect(page.getByText('Total Volume')).toBeVisible();
    await page.getByRole('button', { name: /Dismiss Summary/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Stay Aggressive' })).toBeVisible();

    // 8. Reduced-motion verification: reload with reducedMotion and ensure zero count-up animation frames
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Stay Aggressive' })).toBeVisible();
    expect(await page.locator('[data-countup-animating="true"]').count()).toBe(0);
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
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('dashboard-desktop.png', snapOpts);

    await clickPrimaryTab(page, 'analytics');
    await expect(page).toHaveScreenshot('analytics-desktop.png', snapOpts);

    await clickPrimaryTab(page, 'manage');
    await expect(page).toHaveScreenshot('manage-desktop.png', snapOpts);

    // Manage signed-out Account & Empty Data Maintenance (0 restore points) — Desktop
    await scrollElementBelowStickyNav(page, 'h2', 'Cloud Account');
    await expect(page).toHaveScreenshot('manage-account-signed-out-desktop.png', snapOpts);

    await expect(page.getByText('No restore points available.')).toBeVisible();
    await scrollElementBelowStickyNav(page, 'h2', 'Data & Maintenance');
    await expect(page).toHaveScreenshot('manage-data-maintenance-empty-desktop.png', snapOpts);

    // Mobile clean baselines
    await page.setViewportSize({ width: 390, height: 844 });
    await clickPrimaryTab(page, 'manage');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-mobile.png', snapOpts);

    await scrollElementBelowStickyNav(page, 'h2', 'Cloud Account');
    await expect(page).toHaveScreenshot('manage-account-signed-out-mobile.png', snapOpts);

    await scrollElementBelowStickyNav(page, 'h2', 'Data & Maintenance');
    await expect(page).toHaveScreenshot('manage-data-maintenance-empty-mobile.png', snapOpts);

    await clickPrimaryTab(page, 'analytics');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('analytics-mobile.png', snapOpts);

    await clickPrimaryTab(page, 'dashboard');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('dashboard-mobile.png', snapOpts);

    // 2. Seed rich deterministic logs & 8-day cycle (2026-10-07 start; clock = 2026-10-15)
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedDeterministicTrainingHistory(page);

    // Calendar states (completed ✓, incomplete ◐, missed !, scheduled ·, rest —)
    await scrollElementBelowStickyNav(page, 'h2,h3', 'Calendar');
    await expect(page).toHaveScreenshot('calendar-states-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await scrollElementBelowStickyNav(page, 'h2,h3', 'Calendar');
    await expect(page).toHaveScreenshot('calendar-states-mobile.png', snapOpts);

    // Seeded Analytics scrolled sections (Heatmap + Muscle Balance & Recovery)
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickPrimaryTab(page, 'analytics');
    await scrollElementBelowStickyNav(page, 'h2', 'Monthly Intensity Heatmap');
    await expect(page).toHaveScreenshot('analytics-heatmap-desktop.png', snapOpts);

    await scrollElementBelowStickyNav(page, 'p', '02 · Training Distribution & Anatomical Load');
    await expect(page.getByRole('heading', { name: 'Muscle Group Targeting' })).toBeVisible();
    await scrollElementBelowStickyNav(page, 'h2', 'Muscle Balance & Recovery');
    await expect(page).toHaveScreenshot('analytics-muscle-balance-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await scrollElementBelowStickyNav(page, 'h2', 'Monthly Intensity Heatmap');
    await expect(page).toHaveScreenshot('analytics-heatmap-mobile.png', snapOpts);

    await scrollElementBelowStickyNav(page, 'p', '02 · Training Distribution & Anatomical Load');
    await expect(page.getByRole('heading', { name: 'Muscle Group Targeting' })).toBeVisible();
    await scrollElementBelowStickyNav(page, 'h2', 'Muscle Balance & Recovery');
    await expect(page).toHaveScreenshot('analytics-muscle-balance-mobile.png', snapOpts);

    // History with latest-month preview above sessions
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickPrimaryTab(page, 'history');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page.getByTestId('latest-month-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('history-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page.getByTestId('latest-month-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('history-mobile.png', snapOpts);

    // History with Monthly Reports expanded and month selected
    await page.getByRole('button', { name: /Monthly Reports/i }).click();
    await page.locator('[aria-pressed]').first().click();
    await expect(page.getByText('Window Volume')).toBeVisible();
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('history-reports-expanded-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('history-reports-expanded-desktop.png', snapOpts);

    // Manage Authenticated + Pending Cloud Sync banner display states (emulator preview override)
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        '__GAINLOG_E2E_UI_STATE__',
        JSON.stringify({
          user: { uid: 'e2e-user-1', email: 'athlete@gainlog.app', displayName: 'Alex Lifter', photoURL: null },
          syncStatus: 'synced',
          hasPendingCloudSync: true,
          pendingCloudSyncError: 'Local backup restored; retry cloud reconciliation when online.',
        })
      );
    });
    await page.reload();
    await waitForAppReady(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickPrimaryTab(page, 'manage');
    await scrollElementBelowStickyNav(page, 'h2', 'Cloud Account');
    await expect(page.getByText('athlete@gainlog.app')).toBeVisible();
    await expect(page).toHaveScreenshot('manage-account-authenticated-desktop.png', snapOpts);

    await scrollElementBelowStickyNav(page, 'h2', 'Data & Maintenance');
    await expect(page.getByText('Cloud restore reconciliation pending')).toBeVisible();
    await expect(page).toHaveScreenshot('manage-data-maintenance-pending-sync-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await scrollElementBelowStickyNav(page, 'h2', 'Cloud Account');
    await expect(page).toHaveScreenshot('manage-account-authenticated-mobile.png', snapOpts);

    await scrollElementBelowStickyNav(page, 'h2', 'Data & Maintenance');
    await expect(page).toHaveScreenshot('manage-data-maintenance-pending-sync-mobile.png', snapOpts);

    // Clear emulator UI state override before remaining Manage & Session baselines
    await page.evaluate(() => {
      window.sessionStorage.removeItem('__GAINLOG_E2E_UI_STATE__');
    });
    await page.reload();
    await waitForAppReady(page);

    // PrivacyPolicyModal (wait for backdrop & dialog opacity === 1 before capture)
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickPrimaryTab(page, 'manage');
    await page.getByRole('button', { name: /Privacy Policy & Data Safety/i }).click();
    await waitForDialogReady(page);
    await expect(page).toHaveScreenshot('privacy-modal-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await waitForDialogReady(page);
    await expect(page).toHaveScreenshot('privacy-modal-mobile.png', snapOpts);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Manage ProgramEditor -> CycleEditor -> ExerciseLibrary -> WorkoutEditor -> ExerciseEditor
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Edit Program' }).click();
    await expect(page.getByTestId('cycle-list')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-cycle-editor-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-cycle-editor-mobile.png', snapOpts);

    // ExerciseLibrary populated & search-empty states
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Exercises', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Exercise Library/i })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-exercise-library-populated-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-exercise-library-populated-mobile.png', snapOpts);

    const librarySearch = page.getByPlaceholder('Search exercises by name, muscle group, or tag...');
    await librarySearch.fill('zzzznonexistent');
    await expect(page.getByText('No exercises match your search')).toBeVisible();
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-exercise-library-empty-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-exercise-library-empty-desktop.png', snapOpts);
    await librarySearch.fill('');

    // Switch back to Cycle -> WorkoutEditor -> ExerciseEditor
    await page.getByRole('button', { name: 'Cycle', exact: true }).click();
    await page.getByTestId('cycle-slot-1').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-editor-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-editor-mobile.png', snapOpts);

    await page.locator('button[aria-controls^="workout-ex-panel-"]').first().click();
    await page.getByRole('button', { name: /Edit Prescription/i }).first().click();
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-exercise-editor-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('manage-exercise-editor-desktop.png', snapOpts);

    // SessionView incomplete, all-programmed-sets-complete, and completion summary states
    await clickPrimaryTab(page, 'dashboard');
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByTestId('session-finish-button')).toHaveAttribute('data-finish-ready', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('session-incomplete-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('session-incomplete-mobile.png', snapOpts);

    await completeAllSetsInActiveSession(page);
    const finishBtn = page.getByTestId('session-finish-button');
    await expect(finishBtn).toHaveAttribute('data-finish-ready', 'true');
    await expect(finishBtn).toHaveAttribute('data-finish-animating', 'false', { timeout: 2000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('session-ready-mobile.png', snapOpts);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('session-ready-desktop.png', snapOpts);

    await finishBtn.click();
    await expect(page.getByText('Session Cleared')).toBeVisible();
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('session-summary-desktop.png', snapOpts);

    await page.setViewportSize({ width: 390, height: 844 });
    await waitForAnimationsToSettle(page);
    await expect(page).toHaveScreenshot('session-summary-mobile.png', snapOpts);
  });
});
