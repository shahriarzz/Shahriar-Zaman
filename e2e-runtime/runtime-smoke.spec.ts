import { test, expect, Page } from '@playwright/test';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';

async function allocateFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(port);
      });
    });
  });
}

async function waitForServerReady(baseUrl: string, proc: ChildProcess, logs: () => string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Server exited early with code ${proc.exitCode}.\nLogs:\n${logs()}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for server at ${baseUrl}/api/health.\nLogs:\n${logs()}`);
}

async function stopServer(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => proc.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
  if (proc.exitCode === null) {
    proc.kill('SIGKILL');
  }
}

interface RuntimeTelemetry {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  httpErrors: Array<{ url: string; status: number }>;
  assetResponses: Array<{ url: string; status: number; contentType: string }>;
}

function attachRuntimeListeners(page: Page): RuntimeTelemetry {
  const telemetry: RuntimeTelemetry = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    assetResponses: [],
  };

  page.on('pageerror', (err) => {
    telemetry.pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      telemetry.consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', (req) => {
    telemetry.failedRequests.push(`${req.method()} ${req.url()} (${req.failure()?.errorText || 'failed'})`);
  });

  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    const contentType = res.headers()['content-type'] || '';
    if (status >= 400 && !url.includes('__intentional_check__')) {
      telemetry.httpErrors.push({ url, status });
    }
    if (url.includes('/assets/') || url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.woff2')) {
      telemetry.assetResponses.push({ url, status, contentType });
    }
  });

  return telemetry;
}

async function assertDashboardMountedCleanly(page: Page, baseUrl: string, telemetry: RuntimeTelemetry): Promise<void> {
  const rootResponse = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  expect(rootResponse).not.toBeNull();
  expect(rootResponse!.status()).toBe(200);

  await expect(page.locator('#root')).toBeAttached();
  const rootHtmlLength = await page.locator('#root').evaluate((el) => el.innerHTML.trim().length);
  expect(rootHtmlLength).toBeGreaterThan(0);

  await expect(page.locator('nav')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Stay Aggressive' })).toBeVisible();
  await expect(page.getByText("Today's Protocol")).toBeVisible();

  const diagPhase = await page.evaluate(() => (window as any).__GAINLOG_STARTUP_DIAGNOSTICS__?.phase);
  expect(diagPhase).toBe('mounted');

  const healthRes = await fetch(`${baseUrl}/api/health`);
  expect(healthRes.status).toBe(200);
  const healthJson = (await healthRes.json()) as { status: string; timestamp: string };
  expect(healthJson.status).toBe('ok');

  expect(telemetry.pageErrors).toEqual([]);
  expect(telemetry.consoleErrors).toEqual([]);
  expect(telemetry.failedRequests).toEqual([]);
  expect(telemetry.httpErrors).toEqual([]);
}

test.describe('Real Server Runtime Browser Smoke Suite', () => {
  test('Production server (dist-server/server.cjs, APP_MODE=production) serves compiled assets only and mounts Dashboard cleanly', async ({
    page,
  }) => {
    const distIndex = path.join(process.cwd(), 'dist', 'index.html');
    const serverBundle = path.join(process.cwd(), 'dist-server', 'server.cjs');
    expect(fs.existsSync(distIndex), 'Run npm run build before runtime smoke tests').toBe(true);
    expect(fs.existsSync(serverBundle), 'Run npm run build before runtime smoke tests').toBe(true);

    const port = await allocateFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let output = '';

    const proc = spawn(process.execPath, [serverBundle], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_MODE: 'production',
        NODE_ENV: 'production',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.on('data', (d) => {
      output += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      output += d.toString();
    });

    try {
      await waitForServerReady(baseUrl, proc, () => output);

      expect(output).toContain('APP_MODE=production');
      expect(output).toContain('serving=compiled-static');
      expect(output).toContain(`port=${port}`);
      expect(output).toContain(path.resolve(process.cwd(), 'dist'));

      // Verify raw HTML served for / references compiled /assets/ and NOT /src/main.tsx
      const rawHtmlRes = await fetch(`${baseUrl}/`);
      expect(rawHtmlRes.status).toBe(200);
      const rawHtml = await rawHtmlRes.text();
      expect(rawHtml).not.toContain('/src/main.tsx');
      expect(rawHtml).toMatch(/\/assets\/[^"']+\.js/);

      // Verify production server never serves source .tsx files as application entry assets
      const rawTsxRes = await fetch(`${baseUrl}/src/main.tsx`);
      expect(rawTsxRes.status).toBe(404);
      const rawTsxBody = await rawTsxRes.text();
      expect(rawTsxBody).not.toContain('createRoot');

      const telemetry = attachRuntimeListeners(page);
      await assertDashboardMountedCleanly(page, baseUrl, telemetry);

      // Confirm compiled JS/CSS/font assets returned HTTP 200
      expect(telemetry.assetResponses.length).toBeGreaterThan(0);
      expect(telemetry.assetResponses.some((r) => r.url.includes('/assets/') && r.status === 200)).toBe(true);
      expect(telemetry.assetResponses.every((r) => r.status >= 200 && r.status < 400)).toBe(true);
    } finally {
      await stopServer(proc);
    }
  });

  test('Production server fails fast on missing dist/index.html or untransformed source HTML instead of falling back to repo root', async () => {
    const serverBundle = path.join(process.cwd(), 'dist-server', 'server.cjs');
    expect(fs.existsSync(serverBundle)).toBe(true);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gainlog-missing-dist-'));
    try {
      const missingDistDir = path.join(tmpDir, 'does-not-exist');
      const port = await allocateFreePort();
      const missingResult = spawnSync(process.execPath, [serverBundle], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_MODE: 'production',
          WEB_DIST_DIR: missingDistDir,
          PORT: String(port),
        },
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(missingResult.status).not.toBe(0);
      expect(missingResult.stderr + missingResult.stdout).toContain('Production web directory does not exist');

      // Also test directory containing untransformed source index.html
      const uncompiledDir = path.join(tmpDir, 'uncompiled');
      fs.mkdirSync(uncompiledDir);
      fs.copyFileSync(path.join(process.cwd(), 'index.html'), path.join(uncompiledDir, 'index.html'));
      const uncompiledResult = spawnSync(process.execPath, [serverBundle], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_MODE: 'production',
          WEB_DIST_DIR: uncompiledDir,
          PORT: String(port),
        },
        encoding: 'utf8',
        timeout: 10000,
      });

      expect(uncompiledResult.status).not.toBe(0);
      expect(uncompiledResult.stderr + uncompiledResult.stdout).toContain('untransformed source files');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Development server (npm run dev) initializes Vite middleware and mounts Dashboard cleanly', async ({
    page,
  }) => {
    const port = await allocateFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let output = '';

    const proc = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        DISABLE_HMR: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.on('data', (d) => {
      output += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      output += d.toString();
    });

    try {
      await waitForServerReady(baseUrl, proc, () => output);
      expect(output).toContain('APP_MODE=development');
      expect(output).toContain('serving=vite-middleware');

      const telemetry = attachRuntimeListeners(page);
      await assertDashboardMountedCleanly(page, baseUrl, telemetry);
    } finally {
      await stopServer(proc);
    }
  });

  test('Development server (npm run dev) STILL selects Vite middleware even when ambient NODE_ENV=production', async ({
    page,
  }) => {
    const port = await allocateFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let output = '';

    const proc = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        DISABLE_HMR: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.on('data', (d) => {
      output += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      output += d.toString();
    });

    try {
      await waitForServerReady(baseUrl, proc, () => output);
      expect(output).toContain('APP_MODE=development');
      expect(output).toContain('NODE_ENV=production');
      expect(output).toContain('serving=vite-middleware');

      const telemetry = attachRuntimeListeners(page);
      await assertDashboardMountedCleanly(page, baseUrl, telemetry);
    } finally {
      await stopServer(proc);
    }
  });
});
