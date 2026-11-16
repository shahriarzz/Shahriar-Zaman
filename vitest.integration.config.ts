import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  mode: 'integration',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/test/integration/**/*.integration.test.{ts,tsx}'],
    setupFiles: ['src/test/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
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
