// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { Component, ReactNode, act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  SafeStorageError,
  isStorageUnavailableError,
  probeLocalStorageWritable,
  safeGetItem,
  safeSetItem,
} from '../lib/safeStorage';
import {
  classifyStartupFailure,
  getStartupDiagnosticsSnapshot,
  installStartupDiagnostics,
  markStartupMounted,
  recordStartupFailure,
  resetStartupDiagnosticsForTest,
  sanitizeDiagnosticMessage,
} from '../lib/startupDiagnostics';
import {
  inspectLocalFitnessStorage,
  loadInitialFitnessData,
  readCanonicalSnapshotEnvelope,
} from '../utils/fitnessMigration';
import { useFitnessData } from '../hooks/useFitnessData';
import { ErrorFallback } from '../components/ui/ErrorFallback';
import { CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_EXERCISE_DEFINITIONS, INITIAL_WORKOUTS } from '../types/initialData';
import {
  resolveAppMode,
  resolveProductionDistDir,
  resolveServerRuntimeConfig,
  validateProductionAssets,
} from '../../server';

describe('Browser Storage Hardening, Startup Diagnostics & Server Mode Contract', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let originalLocalStorageDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalLocalStorageDesc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    try {
      window.localStorage.clear();
    } catch {
      // ignore if overridden
    }
    vi.restoreAllMocks();
    resetStartupDiagnosticsForTest();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (originalLocalStorageDesc) {
      Object.defineProperty(window, 'localStorage', originalLocalStorageDesc);
    }
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  describe('1. Server Runtime Mode & Production Asset Validation Contract', () => {
    it('selects development or production strictly from APP_MODE regardless of NODE_ENV', () => {
      const devWithProdNodeEnv = resolveServerRuntimeConfig(
        { APP_MODE: 'development', NODE_ENV: 'production', PORT: '4182' },
        '/repo'
      );
      expect(devWithProdNodeEnv.appMode).toBe('development');
      expect(devWithProdNodeEnv.servingMode).toBe('vite-middleware');
      expect(devWithProdNodeEnv.webDir).toBe(path.resolve('/repo'));
      expect(devWithProdNodeEnv.port).toBe(4182);

      const prodWithDevNodeEnv = resolveServerRuntimeConfig(
        { APP_MODE: 'production', NODE_ENV: 'development', PORT: '4181' },
        '/repo'
      );
      expect(prodWithDevNodeEnv.appMode).toBe('production');
      expect(prodWithDevNodeEnv.servingMode).toBe('compiled-static');
      expect(prodWithDevNodeEnv.webDir).toBe(path.resolve('/repo', 'dist'));
    });

    it('rejects missing or invalid APP_MODE instead of falling back to NODE_ENV', () => {
      expect(() => resolveAppMode(undefined)).toThrow(/Invalid or missing APP_MODE/);
      expect(() => resolveAppMode('')).toThrow(/Invalid or missing APP_MODE/);
      expect(() => resolveAppMode('staging')).toThrow(/Invalid or missing APP_MODE/);
    });

    it('resolves production static root strictly to dist or WEB_DIST_DIR without project-root fallback', () => {
      expect(resolveProductionDistDir({}, '/app')).toBe(path.resolve('/app', 'dist'));
      expect(resolveProductionDistDir({ WEB_DIST_DIR: 'custom-dist' }, '/app')).toBe(
        path.resolve('/app', 'custom-dist')
      );
    });

    it('rejects missing dist/index.html and untransformed source index.html', () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gainlog-dist-check-'));
      try {
        const missingDir = path.join(tmpRoot, 'missing-dist');
        expect(() => validateProductionAssets(missingDir)).toThrow(/does not exist/);

        const emptyDir = path.join(tmpRoot, 'empty-dist');
        fs.mkdirSync(emptyDir);
        expect(() => validateProductionAssets(emptyDir)).toThrow(/Missing compiled production entry HTML/);

        const rawSourceDir = path.join(tmpRoot, 'raw-source');
        fs.mkdirSync(rawSourceDir);
        fs.writeFileSync(
          path.join(rawSourceDir, 'index.html'),
          '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>'
        );
        expect(() => validateProductionAssets(rawSourceDir)).toThrow(/untransformed source files/);

        const noAssetsDir = path.join(tmpRoot, 'no-assets');
        fs.mkdirSync(noAssetsDir);
        fs.writeFileSync(
          path.join(noAssetsDir, 'index.html'),
          '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
        );
        expect(() => validateProductionAssets(noAssetsDir)).toThrow(/does not reference compiled "\/assets\/\.\.\."/);

        const validDir = path.join(tmpRoot, 'valid-dist');
        fs.mkdirSync(validDir);
        const validIndexPath = path.join(validDir, 'index.html');
        fs.writeFileSync(
          validIndexPath,
          '<!doctype html><html><head><link rel="stylesheet" href="/assets/index-abc.css"></head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>'
        );
        expect(validateProductionAssets(validDir)).toBe(validIndexPath);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('2. SafeStorage & Local Initialization States', () => {
    it('handles window.localStorage getter throw cleanly without falling back to empty first-install', () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError');
        },
      });

      const readRes = safeGetItem('gl_database_snapshot');
      expect(readRes.ok).toBe(false);
      if (!readRes.ok) {
        expect(readRes.error).toBeInstanceOf(SafeStorageError);
        expect(readRes.error.kind).toBe('security_error');
        expect(isStorageUnavailableError(readRes.error)).toBe(true);
      }

      const inspection = inspectLocalFitnessStorage();
      expect(inspection.state).toBe('storage_unavailable');

      const envelope = readCanonicalSnapshotEnvelope();
      expect(envelope.status).toBe('storage_unavailable');

      expect(() => loadInitialFitnessData()).toThrowError(SafeStorageError);
    });

    it('handles localStorage.getItem() SecurityError without treating storage as missing or overwriting data', () => {
      const existingData = JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        timestamp: Date.now(),
        data: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: INITIAL_WORKOUTS,
          logs: {
            log_existing: {
              id: 'log_existing',
              workoutId: INITIAL_WORKOUTS[0].id,
              date: '2026-10-10',
              complete: true,
              durationMinutes: 40,
              sets: {},
            },
          },
          appState: { cycleStart: '2026-10-01' },
        },
      });
      localStorage.setItem('gl_database_snapshot', existingData);

      const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Blocked by tracking prevention', 'SecurityError');
      });
      const setSpy = vi.spyOn(Storage.prototype, 'setItem');

      expect(inspectLocalFitnessStorage().state).toBe('storage_unavailable');
      expect(readCanonicalSnapshotEnvelope().status).toBe('storage_unavailable');
      expect(() => loadInitialFitnessData()).toThrowError(SafeStorageError);
      expect(setSpy).not.toHaveBeenCalled();

      getSpy.mockRestore();
      // Existing data remains completely untouched
      expect(localStorage.getItem('gl_database_snapshot')).toBe(existingData);
    });

    it('rejects first-install silent memory-only fallback when storage write fails', () => {
      expect(localStorage.getItem('gl_database_snapshot')).toBeNull();

      const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage disabled in restricted context', 'SecurityError');
      });

      const probe = probeLocalStorageWritable();
      expect(probe.ok).toBe(false);
      expect(inspectLocalFitnessStorage().state).toBe('storage_unavailable');
      expect(() => loadInitialFitnessData()).toThrowError(SafeStorageError);

      setSpy.mockRestore();
      expect(localStorage.getItem('gl_database_snapshot')).toBeNull();
    });

    it('distinguishes missing, valid, corrupt, and staging_recoverable states accurately', () => {
      // 1. Missing (true first install)
      expect(inspectLocalFitnessStorage().state).toBe('missing');

      const seeded = loadInitialFitnessData();
      expect(seeded.defs.length).toBeGreaterThan(0);
      expect(inspectLocalFitnessStorage().state).toBe('valid');

      // 2. Corrupt snapshot with no staging recovery
      localStorage.setItem('gl_database_snapshot', '{corrupt-json');
      expect(inspectLocalFitnessStorage().state).toBe('corrupt');

      const recoveredFromCorrupt = loadInitialFitnessData();
      expect(recoveredFromCorrupt.defs.length).toBeGreaterThan(0);
      expect(localStorage.getItem('gl_corrupt_snapshot_backup')).toBe('{corrupt-json');

      // 3. Staging recovery takes precedence when canonical snapshot is corrupt or missing
      const stagedPayload = JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        timestamp: Date.now(),
        data: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: INITIAL_WORKOUTS,
          logs: {
            log_staged_recovery: {
              id: 'log_staged_recovery',
              workoutId: INITIAL_WORKOUTS[0].id,
              date: '2026-10-12',
              complete: true,
              durationMinutes: 35,
              sets: {},
            },
          },
          appState: { cycleStart: '2026-10-01' },
        },
      });
      localStorage.setItem('gl_database_snapshot', '{broken');
      localStorage.setItem('gl_snapshot_staging', stagedPayload);
      expect(inspectLocalFitnessStorage().state).toBe('staging_recoverable');

      const promoted = loadInitialFitnessData();
      expect(promoted.logs['log_staged_recovery']).toBeDefined();
      expect(localStorage.getItem('gl_snapshot_staging')).toBeNull();
      expect(inspectLocalFitnessStorage().state).toBe('valid');
    });

    it('surfaces actionable Browser Storage Unavailable UI via ErrorFallback without silent memory fallback, and recovers on retry', async () => {
      let blockStorage = true;
      const origGetItem = Storage.prototype.getItem;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
        if (blockStorage) {
          throw new DOMException('Blocked localStorage access', 'SecurityError');
        }
        return origGetItem.call(this, k);
      });

      class TestBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
        public props!: { children: ReactNode };
        public setState!: (state: Partial<{ error: Error | null }>) => void;
        public state = { error: null as Error | null };
        public static getDerivedStateFromError(error: Error) {
          return { error };
        }
        public render() {
          if (this.state.error) {
            return (
              <ErrorFallback
                error={this.state.error}
                onReset={() => this.setState({ error: null })}
              />
            );
          }
          return this.props.children;
        }
      }

      let dataRef: ReturnType<typeof useFitnessData> | null = null;
      const Consumer = () => {
        dataRef = useFitnessData();
        return <div data-testid="mounted-cycle">{dataRef.appState.cycleStart}</div>;
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <TestBoundary>
            <Consumer />
          </TestBoundary>
        );
      });

      expect(container.textContent).toContain('Browser Storage Unavailable');
      expect(container.textContent).toContain('was not overwritten');
      expect(container.querySelector('[data-testid="mounted-cycle"]')).toBeNull();

      // Unblock storage and retry
      blockStorage = false;
      const retryBtn = container.querySelector('button');
      expect(retryBtn?.textContent).toContain('Reload GainLog');
      await act(async () => {
        retryBtn?.click();
      });

      expect(container.querySelector('[data-testid="mounted-cycle"]')?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dataRef?.databaseLifecycleState.phase).toBe('ready');

      // Also verify persistence write failure + retryStorageCommit() recovery
      const origSetItem = Storage.prototype.setItem;
      const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
        if (k === 'gl_snapshot_staging') {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      });

      await act(async () => {
        expect(() =>
          dataRef!.commitFitnessSnapshot({ appState: { cycleStart: '2026-10-15' } })
        ).toThrow(/Staging write failure/);
      });
      expect(dataRef!.databaseLifecycleState.phase).toBe('storage_error');

      setSpy.mockRestore();
      let retryResult: { success: boolean; error?: string } = { success: false };
      await act(async () => {
        retryResult = dataRef!.retryStorageCommit();
      });
      expect(retryResult.success).toBe(true);
      expect(dataRef!.databaseLifecycleState.phase).toBe('ready');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('3. Startup Diagnostics Classification & Sanitization', () => {
    it('distinguishes all 6 startup failure categories and redacts sensitive substrings', () => {
      expect(classifyStartupFailure(new SafeStorageError('security_error', 'access', 'denied'))).toBe(
        'storage_unavailable'
      );
      expect(classifyStartupFailure(new Error('Failed to fetch dynamically imported module /assets/x.js'))).toBe(
        'module_load_error'
      );
      expect(classifyStartupFailure(new Error('Application mount root "#root" not found'))).toBe(
        'react_mount_error'
      );
      expect(classifyStartupFailure(new Error('TypeError: x is undefined'), 'error')).toBe('runtime_error');
      expect(classifyStartupFailure(new Error('Promise rejected'), 'rejection')).toBe('unhandled_rejection');
      expect(classifyStartupFailure(new Error('Boot failure'), 'bootstrap')).toBe('bootstrap_error');

      const sanitized = sanitizeDiagnosticMessage(
        'Failed with Bearer secret-jwt-123 for user@example.com token=abc123'
      );
      expect(sanitized).not.toContain('secret-jwt-123');
      expect(sanitized).not.toContain('user@example.com');
      expect(sanitized).not.toContain('abc123');

      installStartupDiagnostics();
      markStartupMounted();
      expect(getStartupDiagnosticsSnapshot().phase).toBe('mounted');

      recordStartupFailure('module_load_error', new Error('ChunkLoadError: /assets/app.js'), 'test');
      expect(getStartupDiagnosticsSnapshot().phase).toBe('failed');
      expect(getStartupDiagnosticsSnapshot().entries).toHaveLength(1);
      expect(safeSetItem('gl_diag_check', 'ok').ok).toBe(true);
    });
  });
});
