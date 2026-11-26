import fs from 'fs';
import { defineConfig, chromium } from '@playwright/test';

const FALLBACK_CHROMIUM_PATH = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
const defaultChromiumPath = chromium.executablePath();
const resolvedExecutablePath =
  !fs.existsSync(defaultChromiumPath) && fs.existsSync(FALLBACK_CHROMIUM_PATH)
    ? FALLBACK_CHROMIUM_PATH
    : undefined;

export default defineConfig({
  testDir: './e2e-runtime',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-runtime' }]]
    : 'list',
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: resolvedExecutablePath ? { executablePath: resolvedExecutablePath } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1280, height: 900 },
  },
});
