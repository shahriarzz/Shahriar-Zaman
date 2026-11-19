import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/e2e.html',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npx vite --mode integration --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/e2e.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      VITE_FIREBASE_USE_EMULATOR: 'true',
      VITE_FIREBASE_API_KEY: 'demo-gainlog-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-gainlog.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-gainlog',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-gainlog.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:demogainlog',
      VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    },
  },
});
