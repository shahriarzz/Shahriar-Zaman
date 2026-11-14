// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openBackupDb,
  saveBackupToDb,
  getAllBackupsFromDb,
  clearBackupCheckpointsFromDb,
  clearAllPendingCloudReconciliationsFromDb,
  migrateLegacyLocalStorageBackups,
  pruneBackupsInDb,
  deleteBackupFromDb,
  savePendingCloudReconciliationToDb,
  getPendingCloudReconciliationFromDb,
  clearPendingCloudReconciliationFromDb,
  resetBackupDbForTesting,
  PendingCloudReconciliation
} from '../utils/fitnessBackupDb';
import { isBackupOperationAdmissible, backupTransition } from '../state/persistence/backupMachine';
import { useFitnessBackups, AutoBackupEntry } from '../hooks/useFitnessBackups';
import { useFitnessData } from '../hooks/useFitnessData';
import { useFitnessLogs } from '../hooks/useFitnessLogs';
import { useFitnessSync } from '../hooks/useFitnessSync';
import { FitnessProvider, FitnessContext, FitnessContextType, useFitness } from '../context/FitnessContext';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import { ConfirmContext } from '../context/ConfirmContext';
import { SessionView } from '../components/SessionView';
import { Layout } from '../components/Layout';
import { AccountSection } from '../components/manage/AccountSection';
import { Workout, SessionLog, AppState } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import {
  trackDeletedId,
  getDeletedIdsTracker,
  filterTombstonesExcludingSnapshot
} from '../utils/fitnessSyncHelpers';
import * as backupDb from '../utils/fitnessBackupDb';
import * as syncHelpers from '../utils/fitnessSyncHelpers';
import * as firestoreService from '../services/fitnessFirestore';

vi.mock('../utils/haptics', () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    selection: vi.fn(),
    selectionChanged: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    destructive: vi.fn(),
    vibrate: vi.fn()
  }
}));

interface MockIdbControls {
  mockIDBFactory: any;
  autoBackupsStore: Map<string, any>;
  pendingCloudStore: Map<string, any>;
  getOpenCallCount: () => number;
  getClosedDbCount: () => number;
  getWriteOpCount: () => number;
  resetWriteOpCount: () => void;
  setBlockNextOpen: (triggerLateSuccess?: boolean) => void;
  setFailNextOpen: (err: Error) => void;
  setFailNextPut: (err: Error | null) => void;
  setFailNextGet: (err: Error | null) => void;
  setFailNextGetAll: (err: Error | null) => void;
  setFailNextGetAllKeys: (err: Error | null) => void;
  setFailNextDelete: (err: Error | null) => void;
  setFailNextClear: (err: Error | null) => void;
  setAbortNextTx: (abort: boolean) => void;
}

/**
 * Transaction-aware IndexedDB mock:
 * Mutations buffer inside each transaction and commit ONLY on `tx.oncomplete`.
 * `tx.onabort` or `tx.onerror` discards all buffered changes.
 */
function createTransactionAwareMockIndexedDB(): MockIdbControls {
  const autoBackupsStore = new Map<string, any>();
  const pendingCloudStore = new Map<string, any>();

  let openCallCount = 0;
  let closedDbCount = 0;
  let writeOpCount = 0;
  let blockNextOpen = false;
  let triggerLateSuccessOnBlock = false;
  let failNextOpen: Error | null = null;
  let failNextPut: Error | null = null;
  let failNextGet: Error | null = null;
  let failNextGetAll: Error | null = null;
  let failNextGetAllKeys: Error | null = null;
  let failNextDelete: Error | null = null;
  let failNextClear: Error | null = null;
  let abortNextTx = false;

  const getBackingStore = (name: string) =>
    name === 'pending_cloud_sync' ? pendingCloudStore : autoBackupsStore;

  const createDbInstance = () => {
    const dbObj: any = {
      objectStoreNames: {
        contains: (name: string) => name === 'auto_backups' || name === 'pending_cloud_sync'
      },
      createObjectStore: vi.fn(),
      close: () => {
        closedDbCount++;
      },
      onversionchange: null,
      onclose: null,
      transaction: (storeNames: string | string[]) => {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        // Snapshot staging buffer per transaction
        const stagedSnapshots = new Map<string, Map<string, any>>();
        for (const n of names) {
          stagedSnapshots.set(n, new Map(getBackingStore(n)));
        }

        let pendingRequests = 0;
        let finalized = false;
        const shouldAbortThisTx = abortNextTx;
        abortNextTx = false;

        const tx: any = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          error: null,
          objectStore: (storeName: string) => {
            if (!stagedSnapshots.has(storeName)) {
              stagedSnapshots.set(storeName, new Map(getBackingStore(storeName)));
            }
            const staged = stagedSnapshots.get(storeName)!;

            const finalizeIfDone = () => {
              queueMicrotask(() => {
                if (pendingRequests > 0 || finalized) return;
                finalized = true;
                if (shouldAbortThisTx) {
                  tx.error = new Error('Simulated transaction abort');
                  if (tx.onabort) tx.onabort({ target: tx });
                  return;
                }
                // Commit staged mutations into backing stores ONLY on tx completion
                stagedSnapshots.forEach((stagedMap, name) => {
                  const target = getBackingStore(name);
                  target.clear();
                  stagedMap.forEach((val, key) => target.set(key, val));
                });
                if (tx.oncomplete) tx.oncomplete({ target: tx });
              });
            };

            const keyFor = (item: any) =>
              storeName === 'pending_cloud_sync' ? String(item.uid) : String(item.timestamp);

            return {
              put: (item: any) => {
                writeOpCount++;
                pendingRequests++;
                const req: any = { onsuccess: null, onerror: null, result: keyFor(item) };
                queueMicrotask(() => {
                  if (failNextPut) {
                    const err = failNextPut;
                    failNextPut = null;
                    req.error = err;
                    tx.error = err;
                    finalized = true;
                    if (req.onerror) req.onerror({ target: req });
                    if (tx.onerror) tx.onerror({ target: tx });
                    return;
                  }
                  staged.set(keyFor(item), item);
                  if (req.onsuccess) req.onsuccess({ target: req });
                  pendingRequests--;
                  finalizeIfDone();
                });
                return req;
              },
              get: (key: string) => {
                pendingRequests++;
                const val = staged.get(String(key));
                const req: any = { onsuccess: null, onerror: null, result: val };
                queueMicrotask(() => {
                  if (failNextGet) {
                    const err = failNextGet;
                    failNextGet = null;
                    req.error = err;
                    tx.error = err;
                    finalized = true;
                    if (req.onerror) req.onerror({ target: req });
                    if (tx.onerror) tx.onerror({ target: tx });
                    return;
                  }
                  if (req.onsuccess) req.onsuccess({ target: req });
                  pendingRequests--;
                  finalizeIfDone();
                });
                return req;
              },
              getAll: () => {
                pendingRequests++;
                const list = Array.from(staged.values());
                const req: any = { onsuccess: null, onerror: null, result: list };
                queueMicrotask(() => {
                  if (failNextGetAll) {
                    const err = failNextGetAll;
                    failNextGetAll = null;
                    req.error = err;
                    tx.error = err;
                    finalized = true;
                    if (req.onerror) req.onerror({ target: req });
                    if (tx.onerror) tx.onerror({ target: tx });
                    return;
                  }
                  if (req.onsuccess) req.onsuccess({ target: req });
                  pendingRequests--;
                  finalizeIfDone();
                });
                return req;
              },
              getAllKeys: () => {
                pendingRequests++;
                const keys = Array.from(staged.keys());
                const req: any = { onsuccess: null, onerror: null, result: keys };
                queueMicrotask(() => {
                  if (failNextGetAllKeys) {
                    const err = failNextGetAllKeys;
                    failNextGetAllKeys = null;
                    req.error = err;
                    tx.error = err;
                    finalized = true;
                    if (req.onerror) req.onerror({ target: req });
                    if (tx.onerror) tx.onerror({ target: tx });
                    return;
                  }
                  if (req.onsuccess) req.onsuccess({ target: req });
                  pendingRequests--;
                  finalizeIfDone();
                });
                return req;
              },
              delete: (key: string) => {
                writeOpCount++;
                pendingRequests++;
                const req: any = { onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  if (failNextDelete) {
                    const err = failNextDelete;
                    failNextDelete = null;
                    req.error = err;
                    tx.error = err;
                    finalized = true;
                    if (req.onerror) req.onerror({ target: req });
                    if (tx.onerror) tx.onerror({ target: tx });
                    return;
                  }
                  staged.delete(String(key));
                  if (req.onsuccess) req.onsuccess({ target: req });
                  pendingRequests--;
                  finalizeIfDone();
                });
                return req;
              },
              clear: () => {
                writeOpCount++;
                pendingRequests++;
                const req: any = { onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  if (failNextClear) {
                    const err = failNextClear;
                    failNextClear = null;
                    req.error = err;
                    tx.error = err;
                    finalized = true;
                    if (req.onerror) req.onerror({ target: req });
                    if (tx.onerror) tx.onerror({ target: tx });
                    return;
                  }
                  staged.clear();
                  if (req.onsuccess) req.onsuccess({ target: req });
                  pendingRequests--;
                  finalizeIfDone();
                });
                return req;
              }
            };
          }
        };
        return tx;
      }
    };
    return dbObj;
  };

  const mockIDBFactory = {
    open: vi.fn().mockImplementation(() => {
      openCallCount++;
      const dbObj = createDbInstance();
      const openReq: any = {
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
        result: dbObj
      };

      const shouldBlock = blockNextOpen;
      const shouldLateSuccess = triggerLateSuccessOnBlock;
      const openErr = failNextOpen;
      blockNextOpen = false;
      triggerLateSuccessOnBlock = false;
      failNextOpen = null;

      queueMicrotask(() => {
        if (openErr) {
          openReq.error = openErr;
          if (openReq.onerror) openReq.onerror({ target: openReq });
          return;
        }
        if (shouldBlock) {
          if (openReq.onblocked) openReq.onblocked({ target: openReq });
          if (shouldLateSuccess) {
            queueMicrotask(() => {
              if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
            });
          }
          return;
        }
        if (openReq.onupgradeneeded) openReq.onupgradeneeded({ target: openReq });
        if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
      });

      return openReq;
    })
  };

  return {
    mockIDBFactory,
    autoBackupsStore,
    pendingCloudStore,
    getOpenCallCount: () => openCallCount,
    getClosedDbCount: () => closedDbCount,
    getWriteOpCount: () => writeOpCount,
    resetWriteOpCount: () => { writeOpCount = 0; },
    setBlockNextOpen: (late = false) => {
      blockNextOpen = true;
      triggerLateSuccessOnBlock = late;
    },
    setFailNextOpen: (err: Error) => {
      failNextOpen = err;
    },
    setFailNextPut: (err: Error | null) => {
      failNextPut = err;
    },
    setFailNextGet: (err: Error | null) => {
      failNextGet = err;
    },
    setFailNextGetAll: (err: Error | null) => {
      failNextGetAll = err;
    },
    setFailNextGetAllKeys: (err: Error | null) => {
      failNextGetAllKeys = err;
    },
    setFailNextDelete: (err: Error | null) => {
      failNextDelete = err;
    },
    setFailNextClear: (err: Error | null) => {
      failNextClear = err;
    },
    setAbortNextTx: (abort: boolean) => {
      abortNextTx = abort;
    }
  };
}

describe('Persistence, Account Isolation & Lifecycle Hardening Suite', () => {
  const dummyWorkouts: Workout[] = [{ id: 'w1', name: 'Push', badge: 'PUSH', type: 'push', exercises: [] }];
  const dummyLogs: Record<string, SessionLog> = {
    l1: { id: 'l1', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 45, sets: {} }
  };
  const dummyAppState: AppState = { cycleStart: '2026-01-01' };

  const createCheckpoint = (timestamp: number, desc = 'Checkpoint'): AutoBackupEntry => ({
    timestamp: new Date(timestamp).toISOString(),
    workouts: dummyWorkouts,
    logs: dummyLogs,
    appState: dummyAppState,
    exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
    changeType: 'manual',
    desc
  });

  let container: HTMLDivElement;
  let root: Root | null = null;
  let idb: MockIdbControls;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    idb = createTransactionAwareMockIndexedDB();
    (window as any).indexedDB = idb.mockIDBFactory;
    (globalThis as any).indexedDB = idb.mockIDBFactory;
    resetBackupDbForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    container.remove();
    resetBackupDbForTesting();
    vi.restoreAllMocks();
    delete (window as any).indexedDB;
    delete (globalThis as any).indexedDB;
  });

  describe('P0.2 & Item 7 — Single-Flight IndexedDB Opening & Connection Safety', () => {
    it('never converts an unavailable IndexedDB runtime into an apparently successful empty read', async () => {
      delete (window as any).indexedDB;
      delete (globalThis as any).indexedDB;
      resetBackupDbForTesting();

      await expect(getAllBackupsFromDb()).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(clearBackupCheckpointsFromDb()).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(clearAllPendingCloudReconciliationsFromDb()).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(saveBackupToDb(createCheckpoint(Date.now()))).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(pruneBackupsInDb(['123'])).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(deleteBackupFromDb('123')).rejects.toThrow(/IndexedDB unavailable/i);
    });

    it('coalesces simultaneous openBackupDb() calls into a single connection and closes late blocked success handles', async () => {
      const [r1, r2, r3] = await Promise.all([openBackupDb(), openBackupDb(), openBackupDb()]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);
      expect(r1.db).toBe(r2.db);
      expect(idb.getOpenCallCount()).toBe(1);

      // Reset connection and simulate blocked open followed by late onsuccess
      resetBackupDbForTesting();
      idb.setBlockNextOpen(true);
      const blockedRes = await openBackupDb();
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.reason).toBe('blocked');

      await new Promise(r => setTimeout(r, 15));
      expect(idb.getClosedDbCount()).toBeGreaterThanOrEqual(1);

      // Next call retries cleanly rather than reusing failed/blocked state
      const recovered = await openBackupDb();
      expect(recovered.success).toBe(true);
    });
  });

  describe('P0.3 & Item 9 — Transaction-Aware Migration Contract', () => {
    it('merges legacy localStorage with 8 existing IDB records, preserves DB values on duplicate timestamps, prunes to newest 8, and retains keys on tx abort', async () => {
      const baseTime = 1700000000000;
      // 1. Pre-seed 8 records in IndexedDB (t=1..8)
      for (let i = 1; i <= 8; i++) {
        const entry = createCheckpoint(baseTime + i * 1000, `DB Existing ${i}`);
        idb.autoBackupsStore.set(entry.timestamp, entry);
      }

      // 2. Seed legacy localStorage overlapping on t=5 with DIFFERENT payload, plus newer t=9 and t=10
      const legacyEntries: AutoBackupEntry[] = [
        createCheckpoint(baseTime + 2 * 1000, 'Legacy Duplicate Old 2'),
        createCheckpoint(baseTime + 5 * 1000, 'Legacy Conflicting Payload 5'),
        createCheckpoint(baseTime + 9 * 1000, 'Legacy New 9'),
        createCheckpoint(baseTime + 10 * 1000, 'Legacy New 10')
      ];
      localStorage.setItem('gl_auto_backups', JSON.stringify(legacyEntries));

      // 3. First attempt aborts -> resolves [] safely while retaining legacy localStorage and keeping IDB untouched
      idb.setAbortNextTx(true);
      await expect(migrateLegacyLocalStorageBackups()).resolves.toEqual([]);
      expect(localStorage.getItem('gl_auto_backups')).not.toBeNull();
      expect(idb.autoBackupsStore.size).toBe(8);

      // 4. Retry migration cleanly
      const migrated = await migrateLegacyLocalStorageBackups();
      expect(migrated).toHaveLength(8);
      // LocalStorage removed ONLY after committed migration
      expect(localStorage.getItem('gl_auto_backups')).toBeNull();

      // Verify newest 8 retained (t=3..10), sorted descending
      const timestamps = migrated.map(m => new Date(m.timestamp).getTime());
      expect(timestamps[0]).toBe(baseTime + 10 * 1000);
      expect(timestamps[7]).toBe(baseTime + 3 * 1000);

      // Verify DB entry on conflicting timestamp t=5 was NOT overwritten by legacy
      const entry5 = migrated.find(m => new Date(m.timestamp).getTime() === baseTime + 5 * 1000);
      expect(entry5?.desc).toBe('DB Existing 5');
      expect(idb.autoBackupsStore.size).toBe(8);
    });
  });

  describe('Item 1 — Hydration Barrier Prevents Checkpoint Loss Before Hydration Completes', () => {
    it('queues pushAutoBackup during pending hydration and preserves newest 8 checkpoints (7 old + 1 new)', async () => {
      const baseTime = 1700000100000;
      for (let i = 1; i <= 8; i++) {
        const entry = createCheckpoint(baseTime + i * 1000, `Old Checkpoint ${i}`);
        idb.autoBackupsStore.set(entry.timestamp, entry);
      }

      // Defer initial hydration read so hydration remains pending while backup & restore are called
      let resolveHydrationRead!: (entries: AutoBackupEntry[]) => void;
      const deferredHydration = new Promise<AutoBackupEntry[]>((res) => {
        resolveHydrationRead = res;
      });
      const existingList = Array.from(idb.autoBackupsStore.values());
      const getAllSpy = vi.spyOn(backupDb, 'getAllBackupsFromDb').mockImplementationOnce(() => deferredHydration);

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: null,
          exerciseDefsRef: { current: INITIAL_EXERCISE_DEFINITIONS },
          workoutsRef: { current: dummyWorkouts },
          logsRef: { current: dummyLogs },
          appStateRef: { current: dummyAppState },
          commitFitnessSnapshot: vi.fn((partial) => ({
            success: true,
            snapshot: {
              exerciseDefinitions: partial.exerciseDefinitions ?? [],
              workouts: partial.workouts ?? dummyWorkouts,
              logs: partial.logs ?? dummyLogs,
              appState: partial.appState ?? dummyAppState
            }
          }))
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });

      expect(hookResult.backupPhaseRef.current.status).toBe('loading');

      // Restore while still unhydrated MUST reject cleanly without mutating DB
      const earlyRestoreRes = await hookResult.restoreAutoBackup(existingList[0].timestamp);
      expect(earlyRestoreRes.success).toBe(false);
      expect(earlyRestoreRes.message).toMatch(/loading/i);

      // Request a new backup BEFORE hydration finishes
      const queuedSavePromise = hookResult.pushAutoBackup(
        dummyWorkouts,
        dummyLogs,
        dummyAppState,
        'auto-session',
        'New Checkpoint 9'
      );

      // Complete hydration now
      await act(async () => {
        resolveHydrationRead(existingList);
        await queuedSavePromise;
      });

      expect(getAllSpy).toHaveBeenCalledTimes(1);
      // Verify 8 newest checkpoints survive in IndexedDB (Old 2..8 + New 9; only Old 1 pruned)
      expect(idb.autoBackupsStore.size).toBe(8);
      const storedDescs = Array.from(idb.autoBackupsStore.values()).map(v => v.desc);
      expect(storedDescs).toContain('New Checkpoint 9');
      expect(storedDescs).not.toContain('Old Checkpoint 1');
      for (let i = 2; i <= 8; i++) {
        expect(storedDescs).toContain(`Old Checkpoint ${i}`);
      }
    });
  });

  describe('Item 2 & Item 6 — Authoritative Account Reset Clear vs UI Clear & Cache Preservation', () => {
    it('clearAutoBackupsForAccountReset clears reliably during loading, creation, restore/import, late hydration, concurrent calls, and preserves cache on IDB error', async () => {
      const baseTime = 1700000200000;
      const c1 = createCheckpoint(baseTime + 1000, 'C1');
      const c2 = createCheckpoint(baseTime + 2000, 'C2');
      idb.autoBackupsStore.set(c1.timestamp, c1);
      idb.autoBackupsStore.set(c2.timestamp, c2);

      // 1. Reset while loading + hydration resolves AFTER reset started -> stale hydration does NOT repopulate cache
      let resolveLateHydration!: (entries: AutoBackupEntry[]) => void;
      vi.spyOn(backupDb, 'getAllBackupsFromDb').mockImplementationOnce(
        () => new Promise(res => { resolveLateHydration = res; })
      );

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: null,
          exerciseDefsRef: { current: INITIAL_EXERCISE_DEFINITIONS },
          workoutsRef: { current: dummyWorkouts },
          logsRef: { current: dummyLogs },
          appStateRef: { current: dummyAppState },
          commitFitnessSnapshot: vi.fn((partial) => ({
            success: true,
            snapshot: {
              exerciseDefinitions: partial.exerciseDefinitions ?? [],
              workouts: partial.workouts ?? dummyWorkouts,
              logs: partial.logs ?? dummyLogs,
              appState: partial.appState ?? dummyAppState
            }
          }))
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });

      // Normal UI clear during loading MUST return explicit failure (not silent no-op success)
      const uiClearWhileLoading = await hookResult.clearAutoBackups();
      expect(uiClearWhileLoading.success).toBe(false);

      // Two simultaneous authoritative resets await the same cleanup
      let resetRes1: any;
      let resetRes2: any;
      await act(async () => {
        const p1 = hookResult.clearAutoBackupsForAccountReset();
        const p2 = hookResult.clearAutoBackupsForAccountReset();
        [resetRes1, resetRes2] = await Promise.all([p1, p2]);
      });
      expect(resetRes1.success).toBe(true);
      expect(resetRes2.success).toBe(true);
      expect(idb.autoBackupsStore.size).toBe(0);

      // Late hydration completes after reset -> must NOT repopulate cache
      await act(async () => {
        resolveLateHydration([c1, c2]);
        await new Promise(r => setTimeout(r, 15));
      });
      expect(hookResult.getAutoBackups()).toHaveLength(0);

      // 2. Reset while backup creation is running
      let resolvePut!: () => void;
      const saveSpy = vi.spyOn(backupDb, 'saveBackupToDb').mockImplementationOnce(
        () => new Promise<void>(res => { resolvePut = res; })
      );
      let createPromise!: Promise<any>;
      let resetDuringCreatePromise!: Promise<any>;
      await act(async () => {
        createPromise = hookResult.pushAutoBackup(dummyWorkouts, dummyLogs, dummyAppState, 'manual', 'InFlight');
        await new Promise(r => setTimeout(r, 5));
        resetDuringCreatePromise = hookResult.clearAutoBackupsForAccountReset();
        resolvePut();
        const [, resetRes] = await Promise.all([createPromise, resetDuringCreatePromise]);
        expect(resetRes.success).toBe(true);
      });
      saveSpy.mockRestore();
      expect(idb.autoBackupsStore.size).toBe(0);
      expect(hookResult.getAutoBackups()).toHaveLength(0);

      // 3. Reset while import is running
      let resolvePreImport!: () => void;
      vi.spyOn(backupDb, 'saveBackupToDb').mockImplementationOnce(
        () => new Promise<void>(res => { resolvePreImport = res; })
      );
      const validJson = JSON.stringify({
        schemaVersion: 2,
        workouts: dummyWorkouts,
        logs: dummyLogs,
        appState: dummyAppState
      });
      await act(async () => {
        const importPromise = hookResult.importBackup(validJson);
        await new Promise(r => setTimeout(r, 5));
        const resetDuringImport = hookResult.clearAutoBackupsForAccountReset();
        resolvePreImport();
        const [, resetRes] = await Promise.all([importPromise, resetDuringImport]);
        expect(resetRes.success).toBe(true);
      });
      expect(idb.autoBackupsStore.size).toBe(0);

      // 4. IDB clear failure retains previous cache & legacy metadata cleanly
      await act(async () => {
        await hookResult.pushAutoBackup(dummyWorkouts, dummyLogs, dummyAppState, 'manual', 'Keep Me');
      });
      expect(hookResult.getAutoBackups()).toHaveLength(1);
      expect(localStorage.getItem('gl_auto_backups_meta')).not.toBeNull();

      idb.setFailNextClear(new Error('IndexedDB clear transaction aborted'));
      let failedUiClear: any;
      await act(async () => {
        failedUiClear = await hookResult.clearAutoBackups();
      });
      expect(failedUiClear.success).toBe(false);
      expect(failedUiClear.message).toContain('IndexedDB clear transaction aborted');
      expect(hookResult.getAutoBackups()).toHaveLength(1);
      expect(hookResult.getAutoBackups()[0].desc).toBe('Keep Me');
      expect(localStorage.getItem('gl_auto_backups_meta')).not.toBeNull();

      // Same cache preservation for failed authoritative reset clear
      idb.setFailNextClear(new Error('Forced reset clear IO error'));
      let failedResetClear: any;
      await act(async () => {
        failedResetClear = await hookResult.clearAutoBackupsForAccountReset();
      });
      expect(failedResetClear.success).toBe(false);
      expect(hookResult.getAutoBackups()).toHaveLength(1);
    });
  });

  describe('Item 5 — Synchronous Backup Admission & Queue Serialization Before Rerender', () => {
    it('enforces admission guards across backupTransition & isBackupOperationAdmissible and rejects conflicting ops without DB writes', () => {
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'create')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'restore')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'import')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'clear')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'initialize')).toBe(true);

      // CLEAR_STARTED guard blocks invalid transitions when loading or busy
      const loadingState = { status: 'loading' as const };
      expect(backupTransition(loadingState, { type: 'CLEAR_STARTED' })).toBe(loadingState);
      expect(backupTransition(loadingState, { type: 'BACKUP_STARTED', desc: 'x' })).toBe(loadingState);
      expect(backupTransition(loadingState, { type: 'RESTORE_STARTED', timestamp: 't' })).toBe(loadingState);
      expect(backupTransition(loadingState, { type: 'IMPORT_STARTED' })).toBe(loadingState);

      // FORCE_CLEAR_STARTED is allowed from loading for account resets
      expect(backupTransition(loadingState, { type: 'FORCE_CLEAR_STARTED' }).status).toBe('clearing');
    });

    it('serializes conflicting queued operations synchronously before React rerender and keeps ref/reducer/cache/DB aligned', async () => {
      const c1 = createCheckpoint(1700000300000, 'Initial Checkpoint');
      idb.autoBackupsStore.set(c1.timestamp, c1);

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: null,
          exerciseDefsRef: { current: INITIAL_EXERCISE_DEFINITIONS },
          workoutsRef: { current: dummyWorkouts },
          logsRef: { current: dummyLogs },
          appStateRef: { current: dummyAppState },
          commitFitnessSnapshot: vi.fn((partial) => ({
            success: true,
            snapshot: {
              exerciseDefinitions: partial.exerciseDefinitions ?? [],
              workouts: partial.workouts ?? dummyWorkouts,
              logs: partial.logs ?? dummyLogs,
              appState: partial.appState ?? dummyAppState
            }
          }))
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));
      expect(hookResult.backupPhaseRef.current.status).toBe('ready');

      // Enqueue conflicting operations synchronously in a single turn without awaiting between them
      idb.resetWriteOpCount();
      let rRejectedRestore: any;
      let rCreate: any;
      let rClear: any;
      await act(async () => {
        // Invalid restore targeting non-existent checkpoint while ready runs cleanly -> fails restore -> recovers error -> next queued ops execute
        const pCreate = hookResult.pushAutoBackup(dummyWorkouts, dummyLogs, dummyAppState, 'manual', 'Queued 1');
        const pClear = hookResult.clearAutoBackups();
        const pRestoreAfterClear = hookResult.restoreAutoBackup(c1.timestamp); // Will fail because checkpoint was cleared, zero DB writes
        [rCreate, rClear, rRejectedRestore] = await Promise.all([pCreate, pClear, pRestoreAfterClear]);
      });

      expect(rCreate.success).toBe(true);
      expect(rClear.success).toBe(true);
      expect(rRejectedRestore.success).toBe(false);
      // Error state from rejected/missing restore preserves cleared count and agrees with ref/cache/DB
      expect(hookResult.getAutoBackups()).toHaveLength(0);
      expect(idb.autoBackupsStore.size).toBe(0);
      expect(hookResult.backupPhaseRef.current.status).toBe(hookResult.backupPhase.status);
    });
  });

  describe('Item 3, Item 4, Item 13 & Item 14 — UID Tombstones, Pending Cloud Reconciliation & Auth Reset Fencing', () => {
    it('preserves UID-A tombstones across logout, flushes before normal merge on re-login, and isolates from UID-B', async () => {
      const uidA = 'user-A-tomb';
      const uidB = 'user-B-iso';

      // Track offline deletion for UID-A
      trackDeletedId('logs', 'log_deleted_offline_A', uidA);

      let authCallback: any = null;
      vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, cb: any) => {
        authCallback = cb;
        return vi.fn();
      });

      const deleteLogSpy = vi.spyOn(firestoreService, 'deleteLog').mockResolvedValue(undefined);
      const getLogsSpy = vi.spyOn(firestoreService, 'getLogs').mockImplementation(async (uid) => {
        if (uid === uidA) {
          return {
            log_deleted_offline_A: { id: 'log_deleted_offline_A', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 30, sets: {} },
            log_keep_A: { id: 'log_keep_A', workoutId: 'w1', date: '2026-03-02', complete: true, durationMinutes: 35, sets: {} }
          };
        }
        return {
          log_deleted_offline_A: { id: 'log_deleted_offline_A', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 30, sets: {} }
        };
      });
      vi.spyOn(firestoreService, 'getExerciseDefinitions').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'subscribeExerciseDefinitions').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeWorkouts').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeLogs').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeAppState').mockReturnValue(vi.fn());

      let ctx: FitnessContextType | null = null;
      const Consumer = () => {
        ctx = useFitness();
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(
          React.createElement(
            FitnessProvider,
            null,
            React.createElement(Consumer)
          )
        );
      });

      // Sign in UID-B first: UID-A's tombstone must NOT affect UID-B or get deleted
      await act(async () => {
        await authCallback({ uid: uidB, email: 'b@test.com' });
        await new Promise(r => setTimeout(r, 20));
      });
      expect(getDeletedIdsTracker(uidA).logs).toContain('log_deleted_offline_A');
      expect(deleteLogSpy).not.toHaveBeenCalledWith(uidB, 'log_deleted_offline_A');
      expect(ctx!.logs['log_deleted_offline_A']).toBeDefined();

      // Switch UID-B -> null (logout): UID-A tombstones remain untouched
      await act(async () => {
        await authCallback(null);
        await new Promise(r => setTimeout(r, 20));
      });
      expect(getDeletedIdsTracker(uidA).logs).toContain('log_deleted_offline_A');

      // Sign back into UID-A: tombstone flushes BEFORE normal merge, and record is excluded from local merge
      await act(async () => {
        await authCallback({ uid: uidA, email: 'a@test.com' });
        await new Promise(r => setTimeout(r, 25));
      });
      expect(deleteLogSpy).toHaveBeenCalledWith(uidA, 'log_deleted_offline_A');
      expect(ctx!.logs['log_deleted_offline_A']).toBeUndefined();
      expect(ctx!.logs['log_keep_A']).toBeDefined();
      expect(getLogsSpy).toHaveBeenCalledWith(uidA);
    });

    it('retains UID tombstones while cloud restore reconciliation is pending without deleting restored snapshot records, then clears on retryPendingCloudSync', async () => {
      const uid = 'user-pending-reconcile';
      trackDeletedId('logs', 'log_restored_1', uid);
      trackDeletedId('logs', 'log_still_deleted_2', uid);

      // Verify filterTombstonesExcludingSnapshot protects records present in snapshot
      const filtered = filterTombstonesExcludingSnapshot(getDeletedIdsTracker(uid), {
        exerciseDefinitions: [],
        workouts: [],
        logs: { log_restored_1: { id: 'log_restored_1', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 40, sets: {} } }
      });
      expect(filtered.logs).toEqual(['log_still_deleted_2']);

      // Persist pending record directly to v2 IDB store and verify round-trip
      const pending: PendingCloudReconciliation = {
        uid,
        kind: 'restore',
        snapshot: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: dummyWorkouts,
          logs: { log_restored_1: { id: 'log_restored_1', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 40, sets: {} } },
          appState: dummyAppState
        },
        sourceTimestamp: '2026-03-01T10:00:00.000Z',
        sourceId: '2026-03-01T10:00:00.000Z',
        createdAt: 1000,
        status: 'failed',
        lastError: 'Simulated offline'
      };
      await savePendingCloudReconciliationToDb(pending);
      const loaded = await getPendingCloudReconciliationFromDb(uid);
      expect(loaded?.kind).toBe('restore');
      expect(loaded?.uid).toBe(uid);

      // Simulate cloud failure during restoreAutoBackup -> pending saved + UID tombstones preserved
      vi.spyOn(firestoreService, 'saveAppState').mockRejectedValueOnce(new Error('Cloud down'));
      const c1 = createCheckpoint(1700000400000, 'Restore Point');
      c1.logs = {
        log_restored_1: { id: 'log_restored_1', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 40, sets: {} }
      };
      idb.autoBackupsStore.set(c1.timestamp, c1);

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: { uid } as any,
          exerciseDefsRef: { current: INITIAL_EXERCISE_DEFINITIONS },
          workoutsRef: { current: dummyWorkouts },
          logsRef: { current: dummyLogs },
          appStateRef: { current: dummyAppState },
          commitFitnessSnapshot: vi.fn((partial) => ({
            success: true,
            snapshot: {
              exerciseDefinitions: partial.exerciseDefinitions ?? INITIAL_EXERCISE_DEFINITIONS,
              workouts: partial.workouts ?? dummyWorkouts,
              logs: partial.logs ?? dummyLogs,
              appState: partial.appState ?? dummyAppState
            }
          }))
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));

      let restoreRes: any;
      await act(async () => {
        restoreRes = await hookResult.restoreAutoBackup(c1.timestamp);
      });
      expect(restoreRes.restoreStatus).toBe('cloud_sync_pending');
      // Tombstones MUST still exist while cloud sync is pending
      expect(getDeletedIdsTracker(uid).logs).toContain('log_restored_1');
      expect(await getPendingCloudReconciliationFromDb(uid)).not.toBeNull();

      // Now retryPendingCloudSync succeeds -> clears pending record + UID tombstones
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);

      // Stub firestore getDocs/collection for syncCloudDataWithRestored
      vi.spyOn(await import('../utils/fitnessSyncHelpers'), 'syncCloudDataWithRestored').mockResolvedValue(undefined);

      let retryRes: any;
      await act(async () => {
        retryRes = await hookResult.retryPendingCloudSync();
      });
      expect(retryRes.success).toBe(true);
      expect(retryRes.restoreStatus).toBe('fully_synced');
      expect(await getPendingCloudReconciliationFromDb(uid)).toBeNull();
      expect(getDeletedIdsTracker(uid).logs).toEqual([]);
      await clearPendingCloudReconciliationFromDb(uid);
    });

    it('fences account on reset failure, allows retryAccountReset(), and ignores stale callbacks on rapid A->B->C and logout during reset', async () => {
      let authCallback: any = null;
      vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, cb: any) => {
        authCallback = cb;
        return vi.fn();
      });
      vi.spyOn(firestoreService, 'getExerciseDefinitions').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
      vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'subscribeExerciseDefinitions').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeWorkouts').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeLogs').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeAppState').mockReturnValue(vi.fn());

      let resetAttempts = 0;
      const resetResolvers: Array<() => void> = [];
      let shouldHoldReset = false;
      let shouldFailReset = true;

      const flushResetGates = () => {
        while (resetResolvers.length > 0) {
          const resolve = resetResolvers.shift()!;
          resolve();
        }
      };

      const resetFn = vi.fn().mockImplementation(async () => {
        resetAttempts++;
        if (shouldHoldReset) {
          await new Promise<void>(res => { resetResolvers.push(res); });
        }
        if (shouldFailReset) {
          throw new Error('IDB wipe failed');
        }
      });

      const setDefsMock = vi.fn();
      const setWorkoutsMock = vi.fn();
      const setLogsMock = vi.fn();
      const setAppStateMock = vi.fn();
      const exerciseDefsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
      const workoutsRef = { current: dummyWorkouts };
      const logsRef = { current: dummyLogs };
      const appStateRef = { current: dummyAppState };

      const commitSnapshotMock = (partial: any) => {
        if (partial.exerciseDefinitions !== undefined) setDefsMock(partial.exerciseDefinitions);
        if (partial.workouts !== undefined) setWorkoutsMock(partial.workouts);
        if (partial.logs !== undefined) setLogsMock(partial.logs);
        if (partial.appState !== undefined) setAppStateMock(partial.appState);
        return {
          success: true,
          snapshot: {
            exerciseDefinitions: partial.exerciseDefinitions ?? exerciseDefsRef.current,
            workouts: partial.workouts ?? workoutsRef.current,
            logs: partial.logs ?? logsRef.current,
            appState: partial.appState ?? appStateRef.current
          }
        };
      };

      let syncResult: any;
      const SyncHarness = () => {
        syncResult = useFitnessSync({
          exerciseDefsRef,
          workoutsRef,
          logsRef,
          appStateRef,
          commitFitnessSnapshot: commitSnapshotMock,
          resetToDefaultData: resetFn
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(SyncHarness));
      });

      // 1. Login A cleanly
      await act(async () => {
        await authCallback({ uid: 'uid-A', email: 'a@test.com' });
      });
      expect(syncResult.user?.uid).toBe('uid-A');

      // 2. Switch A -> B while reset FAILS -> B must remain fenced (user === null, accountResetStatus === 'failed')
      await act(async () => {
        await authCallback({ uid: 'uid-B', email: 'b@test.com' });
      });
      expect(syncResult.user).toBeNull();
      expect(syncResult.accountResetStatus).toBe('failed');
      expect(syncResult.accountResetError).toContain('IDB wipe failed');

      // 3. Retry succeeds -> B is now published cleanly
      shouldFailReset = false;
      await act(async () => {
        const retryOut = await syncResult.retryAccountReset();
        expect(retryOut.success).toBe(true);
      });
      expect(syncResult.user?.uid).toBe('uid-B');
      expect(syncResult.accountResetStatus).toBe('idle');

      // 4. Rapid B -> C -> D while reset is pending -> resolve D before C so stale C callback completes last and must NOT overwrite D!
      shouldHoldReset = true;
      await act(async () => {
        const pC = authCallback({ uid: 'uid-C', email: 'c@test.com' });
        const pD = authCallback({ uid: 'uid-D', email: 'd@test.com' });
        await new Promise(r => setTimeout(r, 5));
        expect(resetResolvers.length).toBe(2);
        // Resolve newer D first, then stale C later
        resetResolvers[1]();
        await new Promise(r => setTimeout(r, 5));
        resetResolvers[0]();
        resetResolvers.length = 0;
        await Promise.all([pC, pD]);
      });
      expect(syncResult.user?.uid).toBe('uid-D');

      // 5. Logout during reset (D -> E -> null) -> resolve logout first, then stale E later -> final user stays null
      await act(async () => {
        const pE = authCallback({ uid: 'uid-E', email: 'e@test.com' });
        const pLogout = authCallback(null);
        await new Promise(r => setTimeout(r, 5));
        flushResetGates();
        await Promise.all([pE, pLogout]);
      });
      expect(syncResult.user).toBeNull();
      expect(resetAttempts).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Item 10, 11, 12 & 17 — Real useFitnessLogs.addLog() & SessionView Local Durability Gate', () => {
    it('exercises real useFitnessLogs.addLog() across local failure, cloud failure, unauthenticated success, and authenticated success', async () => {
      const sampleLog: SessionLog = {
        id: 'log_real_1',
        workoutId: 'push-a',
        date: '2026-04-01',
        durationMinutes: 45,
        complete: true,
        sets: { e1: [{ id: 's-real-1', reps: '8', weight: '100', done: true }] }
      };

      const logsRef = { current: {} as Record<string, SessionLog> };
      const workoutsRef = { current: INITIAL_WORKOUTS };
      const appStateRef = { current: dummyAppState };
      const pushBackupSpy = vi.fn().mockResolvedValue({ success: true });
      const setSyncStatusSpy = vi.fn();
      const setSyncErrorSpy = vi.fn();

      // Case A: Local commit fails
      let hookLogs: any;
      let userVal: any = null;
      let commitMock: any = vi.fn(() => {
        throw new Error('localStorage quota exceeded');
      });

      const Harness = () => {
        hookLogs = useFitnessLogs({
          user: userVal,
          logsRef,
          appStateRef,
          workoutsRef,
          commitFitnessSnapshot: commitMock,
          pushAutoBackup: pushBackupSpy,
          setSyncStatus: setSyncStatusSpy,
          setSyncError: setSyncErrorSpy
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });

      const localFailRes = await hookLogs.addLog('log_real_1', sampleLog);
      expect(localFailRes).toEqual({
        success: false,
        localPersisted: false,
        cloudPersisted: false,
        cloudAttempted: false,
        error: 'localStorage quota exceeded'
      });
      expect(pushBackupSpy).not.toHaveBeenCalled();

      // Case B: Unauthenticated local success
      commitMock = vi.fn((partial: any) => ({
        success: true,
        snapshot: {
          exerciseDefinitions: [],
          workouts: INITIAL_WORKOUTS,
          logs: partial.logs ?? {},
          appState: dummyAppState
        }
      }));
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      const unauthOk = await hookLogs.addLog('log_real_1', sampleLog);
      expect(unauthOk).toEqual({
        success: true,
        localPersisted: true,
        cloudPersisted: false,
        cloudAttempted: false
      });

      // Case C: Authenticated local ok + cloud fails -> localPersisted: true, cloudPersisted: false, setSyncStatus('failed')
      userVal = { uid: 'u-auth-1' };
      vi.spyOn(firestoreService, 'saveLog').mockRejectedValueOnce(new Error('Network offline'));
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      const cloudFailRes = await hookLogs.addLog('log_real_1', sampleLog);
      expect(cloudFailRes).toEqual({
        success: true,
        localPersisted: true,
        cloudPersisted: false,
        cloudAttempted: true
      });
      expect(setSyncStatusSpy).toHaveBeenCalledWith('failed');

      // Case D: Authenticated local + cloud succeed
      vi.spyOn(firestoreService, 'saveLog').mockResolvedValueOnce(undefined);
      const authOk = await hookLogs.addLog('log_real_1', sampleLog);
      expect(authOk).toEqual({
        success: true,
        localPersisted: true,
        cloudPersisted: true,
        cloudAttempted: true
      });
    });

    it('SessionView rejects undefined addLog() return value and preserves the active workout draft', async () => {
      const clearActiveSessionSpy = vi.fn();
      const undefinedAddLog = vi.fn().mockResolvedValue(undefined);
      const mockContext: FitnessContextType = {
        user: null,
        loading: false,
        syncStatus: 'idle',
        syncError: null,
        login: vi.fn(),
        logout: vi.fn(),
        retrySync: vi.fn(),
        accountResetStatus: 'idle',
        accountResetError: null,
        retryAccountReset: vi.fn().mockResolvedValue({ success: true }),
        exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
        workouts: INITIAL_WORKOUTS,
        logs: {},
        appState: { cycleStart: '2026-04-01' },
        databaseLifecycleState: { phase: 'ready' },
        retryStorageCommit: vi.fn().mockReturnValue({ success: true }),
        addExerciseDefinition: vi.fn(),
        updateExerciseDefinition: vi.fn(),
        deleteExerciseDefinition: vi.fn(),
        setWorkouts: vi.fn(),
        assignExerciseToWorkout: vi.fn(),
        removeExerciseFromWorkout: vi.fn(),
        updateWorkoutExerciseProgramming: vi.fn(),
        deleteWorkout: vi.fn(),
        addLog: undefinedAddLog as any,
        deleteLog: vi.fn(),
        resetLogs: vi.fn(),
        updateCycleStart: vi.fn(),
        commitFitnessSnapshot: vi.fn((partial) => ({
          success: true,
          snapshot: {
            exerciseDefinitions: partial.exerciseDefinitions ?? INITIAL_EXERCISE_DEFINITIONS,
            workouts: partial.workouts ?? INITIAL_WORKOUTS,
            logs: partial.logs ?? {},
            appState: partial.appState ?? { cycleStart: '2026-04-01' }
          }
        })),
        clearActiveSession: clearActiveSessionSpy,
        logBodyWeight: vi.fn(),
        deleteBodyWeight: vi.fn(),
        pushAutoBackup: vi.fn().mockResolvedValue({ success: true }),
        getAutoBackups: vi.fn().mockReturnValue([]),
        clearAutoBackups: vi.fn().mockResolvedValue({ success: true }),
        restoreAutoBackup: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'restored_locally' }),
        createManualBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
        exportBackup: vi.fn().mockReturnValue('{}'),
        importBackup: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'restored_locally' }),
        retryPendingCloudSync: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'fully_synced' }),
        isBackupsLoading: false,
        hasPendingCloudSync: false,
        pendingCloudSyncError: null
      };

      const derivedIndex = buildFitnessIndex([], new Map(INITIAL_EXERCISE_DEFINITIONS.map(d => [d.id, d])), '2026-04-01');

      root = createRoot(container);
      await act(async () => {
        root!.render(
          React.createElement(
            FitnessContext.Provider,
            { value: mockContext },
            React.createElement(
              FitnessDerivedContext.Provider,
              {
                value: {
                  index: derivedIndex,
                  getLatestForExercise: () => null,
                  getWeightPRForExercise: () => null,
                  getE1RMPRForExercise: () => null,
                  getHistoryForExercise: () => []
                } as any
              },
              React.createElement(
                ConfirmContext.Provider,
                { value: { confirm: vi.fn().mockResolvedValue(true) } },
                React.createElement(SessionView, { workoutId: 'push-a', onExit: vi.fn() })
              )
            )
          )
        );
      });

      const finishBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Finish'));
      expect(finishBtn).toBeDefined();

      await act(async () => {
        finishBtn!.click();
      });

      expect(undefinedAddLog).toHaveBeenCalledTimes(1);
      expect(clearActiveSessionSpy).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('Session Cleared');
    });
  });

  describe('Closure Pass P0 — Crash-Safe Write-Ahead Pending Reconciliation, Read/Write Error Discipline & UID Isolation', () => {
    it('Item 14 & 15 — rejects on IndexedDB request errors (get/getAll/getAllKeys/delete/put/clear) and transaction aborts', async () => {
      const c1 = createCheckpoint(1700000500000, 'IDB Error Test');
      await saveBackupToDb(c1);
      const pending: PendingCloudReconciliation = {
        uid: 'u-idb-err',
        kind: 'restore',
        snapshot: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: dummyWorkouts,
          logs: dummyLogs,
          appState: dummyAppState
        },
        sourceTimestamp: c1.timestamp,
        sourceId: c1.timestamp,
        createdAt: 1000,
        status: 'pending'
      };
      await savePendingCloudReconciliationToDb(pending);

      idb.setFailNextGetAll(new Error('getAll request error'));
      await expect(getAllBackupsFromDb()).rejects.toThrow('getAll request error');

      idb.setFailNextGet(new Error('get request error'));
      await expect(getPendingCloudReconciliationFromDb('u-idb-err')).rejects.toThrow('get request error');

      idb.setFailNextGetAllKeys(new Error('getAllKeys request error'));
      await expect(pruneBackupsInDb([c1.timestamp])).rejects.toThrow('getAllKeys request error');

      idb.setFailNextDelete(new Error('delete request error'));
      await expect(deleteBackupFromDb(c1.timestamp)).rejects.toThrow('delete request error');
      expect(idb.autoBackupsStore.has(c1.timestamp)).toBe(true);

      idb.setFailNextDelete(new Error('pending delete request error'));
      await expect(clearPendingCloudReconciliationFromDb('u-idb-err')).rejects.toThrow('pending delete request error');
      expect(idb.pendingCloudStore.has('u-idb-err')).toBe(true);

      idb.setFailNextPut(new Error('put request error'));
      await expect(saveBackupToDb(createCheckpoint(1700000501000, 'Should Not Persist'))).rejects.toThrow('put request error');

      idb.setAbortNextTx(true);
      await expect(deleteBackupFromDb(c1.timestamp)).rejects.toThrow(/aborted/i);
      expect(idb.autoBackupsStore.has(c1.timestamp)).toBe(true);
    });

    it('Item 1 — persists pending record BEFORE cloud writes across restore & import, recovers after interruption at every cloud stage, and handles pre-write DB failures', async () => {
      const uid = 'u-crash-safe';
      const c1 = createCheckpoint(1700000600000, 'Crash Recovery Checkpoint');
      c1.logs = {
        log_restored_crash: { id: 'log_restored_crash', workoutId: 'w1', date: '2026-04-02', complete: true, durationMinutes: 50, sets: {} }
      };
      idb.autoBackupsStore.set(c1.timestamp, c1);

      const exerciseDefsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
      const workoutsRef = { current: dummyWorkouts };
      const logsRef = { current: dummyLogs };
      const appStateRef = { current: dummyAppState };
      const commitFn = vi.fn((partial: any) => ({
        success: true,
        snapshot: {
          exerciseDefinitions: partial.exerciseDefinitions ?? exerciseDefsRef.current,
          workouts: partial.workouts ?? workoutsRef.current,
          logs: partial.logs ?? logsRef.current,
          appState: partial.appState ?? appStateRef.current
        }
      }));

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: { uid } as any,
          exerciseDefsRef,
          workoutsRef,
          logsRef,
          appStateRef,
          commitFitnessSnapshot: commitFn
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));

      // Case A: Interruption immediately after local commit (during saveAppState cloud write)
      let pendingAtCloudStart: PendingCloudReconciliation | undefined;
      let releaseSaveAppState!: () => void;
      vi.spyOn(firestoreService, 'saveAppState').mockImplementationOnce(async () => {
        // Pending record MUST already be durable in IndexedDB with status: 'pending' BEFORE cloud writes execute!
        pendingAtCloudStart = idb.pendingCloudStore.get(uid);
        await new Promise<void>(res => { releaseSaveAppState = res; });
        throw new Error('App terminated during saveAppState');
      });
      const syncCloudSpy = vi.spyOn(syncHelpers, 'syncCloudDataWithRestored').mockResolvedValue(undefined);

      const interruptedRestore = hookResult.restoreAutoBackup(c1.timestamp);
      await new Promise(r => setTimeout(r, 15));
      expect(pendingAtCloudStart).toBeDefined();
      expect(pendingAtCloudStart?.status).toBe('pending');
      expect(pendingAtCloudStart?.uid).toBe(uid);

      // Simulate app restart/unmount while saveAppState is still mid-flight
      await act(async () => {
        root!.unmount();
        releaseSaveAppState();
        await interruptedRestore;
      });

      // On restart/remount, the 'pending' record is loaded and retryable (not overwritten or lost!)
      expect(idb.pendingCloudStore.get(uid)?.status).toBe('pending');
      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));
      expect(hookResult.hasPendingCloudSync).toBe(true);
      expect(hookResult.pendingCloudSync?.status).toBe('pending');

      // Case B: Interruption during syncCloudDataWithRestored (orphan cleanup / upload stage) on importBackup
      const importJson = JSON.stringify({
        schemaVersion: 2,
        workouts: dummyWorkouts,
        logs: c1.logs,
        appState: dummyAppState
      });
      // First clear previous pending record via successful retry
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      let retryOk: any;
      await act(async () => {
        retryOk = await hookResult.retryPendingCloudSync();
      });
      expect(retryOk.success).toBe(true);
      expect(idb.pendingCloudStore.has(uid)).toBe(false);

      let pendingDuringSyncCloud: PendingCloudReconciliation | undefined;
      let releaseSyncCloud!: () => void;
      syncCloudSpy.mockImplementationOnce(async () => {
        pendingDuringSyncCloud = idb.pendingCloudStore.get(uid);
        await new Promise<void>(res => { releaseSyncCloud = res; });
        throw new Error('App terminated during syncCloudDataWithRestored');
      });

      const interruptedImport = hookResult.importBackup(importJson);
      await new Promise(r => setTimeout(r, 20));
      expect(pendingDuringSyncCloud?.status).toBe('pending');
      expect(pendingDuringSyncCloud?.kind).toBe('import');

      await act(async () => {
        root!.unmount();
        releaseSyncCloud();
        await interruptedImport;
      });
      expect(idb.pendingCloudStore.get(uid)?.status).toBe('pending');

      // Remount and verify import reconciliation succeeds via retryPendingCloudSync()
      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));
      expect(hookResult.hasPendingCloudSync).toBe(true);
      await act(async () => {
        retryOk = await hookResult.retryPendingCloudSync();
      });
      expect(retryOk.restoreStatus).toBe('fully_synced');
      expect(idb.pendingCloudStore.has(uid)).toBe(false);

      // Case C: Pending record IDB write failure BEFORE cloud writes -> no cloud writes, local committed, distinct message, retry recovers
      const saveStateSpy = vi.spyOn(firestoreService, 'saveAppState').mockClear();
      syncCloudSpy.mockClear();
      // 1st put = pre-restore checkpoint succeeds; 2nd put = pending cloud record fails
      vi.spyOn(backupDb, 'savePendingCloudReconciliationToDb').mockRejectedValueOnce(new Error('IDB pending store full'));

      let writeFailRes: any;
      await act(async () => {
        writeFailRes = await hookResult.restoreAutoBackup(c1.timestamp);
      });
      expect(writeFailRes.success).toBe(false);
      expect(writeFailRes.restoreStatus).toBe('restore_failed');
      expect(writeFailRes.message).toMatch(/durable cloud recovery metadata could not be saved/i);
      expect(saveStateSpy).not.toHaveBeenCalled();
      expect(syncCloudSpy).not.toHaveBeenCalled();
      expect(commitFn).toHaveBeenCalled();
      expect(hookResult.hasPendingCloudSync).toBe(true);

      // Recovery retry works once IDB is writable again
      let recoveredRes: any;
      await act(async () => {
        recoveredRes = await hookResult.retryPendingCloudSync();
      });
      expect(recoveredRes.success).toBe(true);
      expect(recoveredRes.restoreStatus).toBe('fully_synced');
      expect(saveStateSpy).toHaveBeenCalled();
      expect(syncCloudSpy).toHaveBeenCalled();

      // Case D: Local commit failure after write-ahead pending record succeeded -> cleans up pending record, preserves pre-op checkpoint
      commitFn.mockImplementationOnce(() => {
        throw new Error('localStorage QuotaExceededError');
      });
      const countBeforeLocalFail = idb.autoBackupsStore.size;
      let localCommitFailRes: any;
      await act(async () => {
        localCommitFailRes = await hookResult.restoreAutoBackup(c1.timestamp);
      });
      expect(localCommitFailRes.success).toBe(false);
      expect(localCommitFailRes.restoreStatus).toBe('restore_failed');
      expect(idb.pendingCloudStore.has(uid)).toBe(false);
      expect(idb.autoBackupsStore.size).toBeGreaterThanOrEqual(countBeforeLocalFail);
    });

    it('Item 2 — retryPendingCloudSync never interprets failed DB read as empty queue and handles empty/foreign UID reads cleanly', async () => {
      const uid = 'u-retry-read';
      trackDeletedId('logs', 'log_keep_tomb', uid);

      const exerciseDefsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
      const workoutsRef = { current: dummyWorkouts };
      const logsRef = { current: dummyLogs };
      const appStateRef = { current: dummyAppState };
      const commitFn = vi.fn((partial: any) => ({
        success: true,
        snapshot: {
          exerciseDefinitions: partial.exerciseDefinitions ?? exerciseDefsRef.current,
          workouts: partial.workouts ?? workoutsRef.current,
          logs: partial.logs ?? logsRef.current,
          appState: partial.appState ?? appStateRef.current
        }
      }));

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: { uid } as any,
          exerciseDefsRef,
          workoutsRef,
          logsRef,
          appStateRef,
          commitFitnessSnapshot: commitFn
        });
        return null;
      };

      // 1. Read failure with NO cached record
      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));

      idb.setFailNextGet(new Error('IndexedDB read blocked (no cache)'));
      let res1: any;
      await act(async () => {
        res1 = await hookResult.retryPendingCloudSync();
      });
      expect(res1.success).toBe(false);
      expect(res1.restoreStatus).toBe('cloud_sync_pending');
      expect(res1.message).toContain('IndexedDB read blocked');
      expect(res1.message).not.toContain('No pending cloud restore reconciliation required');
      expect(getDeletedIdsTracker(uid).logs).toContain('log_keep_tomb');

      // 2. Read failure WITH cached record -> preserves cached record & tombstones
      const pending: PendingCloudReconciliation = {
        uid,
        kind: 'restore',
        snapshot: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: dummyWorkouts,
          logs: dummyLogs,
          appState: dummyAppState
        },
        sourceTimestamp: '2026-04-02T10:00:00.000Z',
        sourceId: '2026-04-02T10:00:00.000Z',
        createdAt: 1000,
        status: 'failed',
        lastError: 'Previous cloud failure'
      };
      idb.pendingCloudStore.set(uid, pending);

      await act(async () => {
        root!.unmount();
      });
      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));
      expect(hookResult.hasPendingCloudSync).toBe(true);

      idb.setFailNextGet(new Error('IndexedDB transient IO read failure'));
      let res2: any;
      await act(async () => {
        res2 = await hookResult.retryPendingCloudSync();
      });
      expect(res2.success).toBe(false);
      expect(res2.restoreStatus).toBe('cloud_sync_pending');
      expect(res2.message).toContain('IndexedDB transient IO read failure');
      expect(hookResult.hasPendingCloudSync).toBe(true);
      expect(hookResult.pendingCloudSyncError).toBe('Previous cloud failure');
      expect(getDeletedIdsTracker(uid).logs).toContain('log_keep_tomb');

      // 3. Successful read returning a pending record for ANOTHER UID -> rejects without clearing
      vi.spyOn(backupDb, 'getPendingCloudReconciliationFromDb').mockResolvedValueOnce({
        ...pending,
        uid: 'other-uid-999'
      });
      let resForeign: any;
      await act(async () => {
        resForeign = await hookResult.retryPendingCloudSync();
      });
      expect(resForeign.success).toBe(false);
      expect(resForeign.restoreStatus).toBe('cloud_sync_pending');
      expect(resForeign.message).toMatch(/different account/i);
      expect(getDeletedIdsTracker(uid).logs).toContain('log_keep_tomb');

      // 4. Successful read returning NO record -> ONLY case returning "No pending cloud restore reconciliation required."
      idb.pendingCloudStore.delete(uid);
      let resEmpty: any;
      await act(async () => {
        resEmpty = await hookResult.retryPendingCloudSync();
      });
      expect(resEmpty).toEqual({
        success: true,
        message: 'No pending cloud restore reconciliation required.',
        restoreStatus: 'fully_synced'
      });
    });

    it('Item 3 — syncDataBackground aborts before calling any cloud delete when pending reconciliation read fails without valid same-UID cache, then protects restored record on recovery', async () => {
      const uid = 'u-tomb-guard';
      const restoredLogId = 'log_restored_tombstoned';
      trackDeletedId('logs', restoredLogId, uid);
      trackDeletedId('workouts', 'wo_restored_tombstoned', uid);
      trackDeletedId('defs', 'def_restored_tombstoned', uid);

      await savePendingCloudReconciliationToDb({
        uid,
        kind: 'restore',
        snapshot: {
          exerciseDefinitions: [{ id: 'def_restored_tombstoned', name: 'Bench', target: 'Chest', tags: ['compound'] }],
          workouts: [{ id: 'wo_restored_tombstoned', name: 'Push', badge: 'PUSH', type: 'push', exercises: [] }],
          logs: {
            [restoredLogId]: { id: restoredLogId, workoutId: 'wo_restored_tombstoned', date: '2026-04-03', complete: true, durationMinutes: 45, sets: {} }
          },
          appState: dummyAppState
        },
        sourceTimestamp: '2026-04-03T10:00:00.000Z',
        sourceId: '2026-04-03T10:00:00.000Z',
        createdAt: 2000,
        status: 'pending'
      });

      let authCallback: any = null;
      vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, cb: any) => {
        authCallback = cb;
        return vi.fn();
      });

      const delDefSpy = vi.spyOn(firestoreService, 'deleteExerciseDefinition').mockResolvedValue(undefined);
      const delWoSpy = vi.spyOn(firestoreService, 'deleteWorkout').mockResolvedValue(undefined);
      const delLogSpy = vi.spyOn(firestoreService, 'deleteLog').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'getExerciseDefinitions').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
      vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'subscribeExerciseDefinitions').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeWorkouts').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeLogs').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeAppState').mockReturnValue(vi.fn());

      // Fail ALL pending-reconciliation IDB reads on initial sign-in so cache is null AND Step 0 read fails
      const getPendingSpy = vi.spyOn(backupDb, 'getPendingCloudReconciliationFromDb').mockRejectedValue(
        new Error('IDB pending read failure during sync')
      );

      const exerciseDefsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
      const workoutsRef = { current: dummyWorkouts };
      const logsRef = { current: dummyLogs };
      const appStateRef = { current: dummyAppState };
      const commitSnapshot = vi.fn((partial: any) => ({
        success: true,
        snapshot: {
          exerciseDefinitions: partial.exerciseDefinitions ?? exerciseDefsRef.current,
          workouts: partial.workouts ?? workoutsRef.current,
          logs: partial.logs ?? logsRef.current,
          appState: partial.appState ?? appStateRef.current
        }
      }));

      let syncHook: any;
      const SyncHarness = () => {
        syncHook = useFitnessSync({
          exerciseDefsRef,
          workoutsRef,
          logsRef,
          appStateRef,
          commitFitnessSnapshot: commitSnapshot
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(SyncHarness));
      });

      await act(async () => {
        await authCallback({ uid, email: 'guard@test.com' });
        await new Promise(r => setTimeout(r, 25));
      });

      // CRITICAL: ZERO cloud deletion functions may execute when pending state is unknown!
      expect(delDefSpy).not.toHaveBeenCalled();
      expect(delWoSpy).not.toHaveBeenCalled();
      expect(delLogSpy).not.toHaveBeenCalled();
      expect(syncHook.syncStatus).toBe('failed');
      expect(syncHook.syncError).toContain('Aborted background sync before tombstone purge');

      // Restore IndexedDB access and trigger retry -> pending snapshot protects tombstoned IDs
      getPendingSpy.mockRestore();
      await act(async () => {
        syncHook.retrySync();
        await new Promise(r => setTimeout(r, 25));
      });

      expect(delDefSpy).not.toHaveBeenCalled();
      expect(delWoSpy).not.toHaveBeenCalled();
      expect(delLogSpy).not.toHaveBeenCalled();
      expect(syncHook.syncStatus).toBe('synced');
    });

    it('Item 4 & 6 — preserves pending state and tombstones if clearPendingCloudReconciliationFromDb fails, reports status update storage errors separately, and recovers on later retry', async () => {
      const uid = 'u-clear-fail';
      trackDeletedId('logs', 'log_keep_until_clear', uid);
      const pending: PendingCloudReconciliation = {
        uid,
        kind: 'restore',
        snapshot: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: dummyWorkouts,
          logs: dummyLogs,
          appState: dummyAppState
        },
        sourceTimestamp: '2026-04-04T10:00:00.000Z',
        sourceId: '2026-04-04T10:00:00.000Z',
        createdAt: 3000,
        status: 'pending'
      };
      await savePendingCloudReconciliationToDb(pending);

      const exerciseDefsRef = { current: INITIAL_EXERCISE_DEFINITIONS };
      const workoutsRef = { current: dummyWorkouts };
      const logsRef = { current: dummyLogs };
      const appStateRef = { current: dummyAppState };
      const commitFn = vi.fn((partial: any) => ({
        success: true,
        snapshot: {
          exerciseDefinitions: partial.exerciseDefinitions ?? exerciseDefsRef.current,
          workouts: partial.workouts ?? workoutsRef.current,
          logs: partial.logs ?? logsRef.current,
          appState: partial.appState ?? appStateRef.current
        }
      }));

      let hookResult: any;
      const Harness = () => {
        hookResult = useFitnessBackups({
          user: { uid } as any,
          exerciseDefsRef,
          workoutsRef,
          logsRef,
          appStateRef,
          commitFitnessSnapshot: commitFn
        });
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });
      await new Promise(r => setTimeout(r, 15));

      // Cloud writes fail AND updating status to 'failed' fails -> preserves last durable record and reports BOTH errors separately
      vi.spyOn(firestoreService, 'saveAppState').mockRejectedValueOnce(new Error('Cloud write 503'));
      vi.spyOn(syncHelpers, 'syncCloudDataWithRestored').mockResolvedValue(undefined);
      const savePendingSpy = vi.spyOn(backupDb, 'savePendingCloudReconciliationToDb');
      savePendingSpy.mockResolvedValueOnce(undefined); // 'retrying' write ok
      savePendingSpy.mockRejectedValueOnce(new Error('IDB quota during error save')); // 'failed' write fails

      let failBothRes: any;
      await act(async () => {
        failBothRes = await hookResult.retryPendingCloudSync();
      });
      expect(failBothRes.success).toBe(false);
      expect(failBothRes.restoreStatus).toBe('cloud_sync_pending');
      expect(failBothRes.message).toContain('Cloud write 503');
      expect(failBothRes.message).toContain('IDB quota during error save');
      expect(hookResult.hasPendingCloudSync).toBe(true);
      expect(idb.pendingCloudStore.has(uid)).toBe(true);
      expect(getDeletedIdsTracker(uid).logs).toContain('log_keep_until_clear');

      // Now cloud writes succeed, but clearPendingCloudReconciliationFromDb throws -> MUST NOT report fully_synced or clear tombstones
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      idb.setFailNextDelete(new Error('Pending delete blocked'));

      let deleteFailRes: any;
      await act(async () => {
        deleteFailRes = await hookResult.retryPendingCloudSync();
      });
      expect(deleteFailRes.success).toBe(false);
      expect(deleteFailRes.restoreStatus).toBe('cloud_sync_pending');
      expect(deleteFailRes.message).toContain('Pending delete blocked');
      expect(hookResult.hasPendingCloudSync).toBe(true);
      expect(idb.pendingCloudStore.has(uid)).toBe(true);
      expect(getDeletedIdsTracker(uid).logs).toContain('log_keep_until_clear');

      // Subsequent retry succeeds cleanly once storage delete recovers
      let finalRes: any;
      await act(async () => {
        finalRes = await hookResult.retryPendingCloudSync();
      });
      expect(finalRes.success).toBe(true);
      expect(finalRes.restoreStatus).toBe('fully_synced');
      expect(hookResult.hasPendingCloudSync).toBe(false);
      expect(idb.pendingCloudStore.has(uid)).toBe(false);
      expect(getDeletedIdsTracker(uid).logs).toEqual([]);
    });

    it('Item 5 — preserves Account A pending cloud reconciliation across A -> B -> A account switches', async () => {
      const uidA = 'uid-switch-A';
      const uidB = 'uid-switch-B';
      await saveBackupToDb(createCheckpoint(1700000700000, 'Account A Checkpoint'));
      await savePendingCloudReconciliationToDb({
        uid: uidA,
        kind: 'restore',
        snapshot: {
          exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
          workouts: dummyWorkouts,
          logs: dummyLogs,
          appState: dummyAppState
        },
        sourceTimestamp: '2026-04-05T10:00:00.000Z',
        sourceId: '2026-04-05T10:00:00.000Z',
        createdAt: 4000,
        status: 'pending'
      });

      let authCallback: any = null;
      vi.spyOn(await import('../lib/firebase'), 'onAuthStateChanged').mockImplementation((_auth, cb: any) => {
        authCallback = cb;
        return vi.fn();
      });
      vi.spyOn(firestoreService, 'getExerciseDefinitions').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getWorkouts').mockResolvedValue([]);
      vi.spyOn(firestoreService, 'getLogs').mockResolvedValue({});
      vi.spyOn(firestoreService, 'getAppState').mockResolvedValue(null);
      vi.spyOn(firestoreService, 'saveAppState').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveExerciseDefinitionsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveWorkoutsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'saveLogsBatch').mockResolvedValue(undefined);
      vi.spyOn(firestoreService, 'subscribeExerciseDefinitions').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeWorkouts').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeLogs').mockReturnValue(vi.fn());
      vi.spyOn(firestoreService, 'subscribeAppState').mockReturnValue(vi.fn());
      vi.spyOn(syncHelpers, 'syncCloudDataWithRestored').mockResolvedValue(undefined);

      let ctx!: FitnessContextType;
      const Consumer = () => {
        ctx = useFitness();
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(FitnessProvider, null, React.createElement(Consumer)));
      });

      // Sign in A -> sees pending cloud sync
      await act(async () => {
        await authCallback({ uid: uidA, email: 'a@test.com' });
        await new Promise(r => setTimeout(r, 20));
      });
      expect(ctx.hasPendingCloudSync).toBe(true);

      // Switch A -> B: checkpoint store cleared, B sees false, A's IDB pending record survives
      await act(async () => {
        await authCallback({ uid: uidB, email: 'b@test.com' });
        await new Promise(r => setTimeout(r, 20));
      });
      expect(ctx.user?.uid).toBe(uidB);
      expect(ctx.hasPendingCloudSync).toBe(false);
      expect(idb.autoBackupsStore.size).toBe(0);
      expect(idb.pendingCloudStore.has(uidA)).toBe(true);

      // Switch B -> A: A re-hydrates pending record and reconciles cleanly
      await act(async () => {
        await authCallback({ uid: uidA, email: 'a@test.com' });
        await new Promise(r => setTimeout(r, 20));
      });
      expect(ctx.user?.uid).toBe(uidA);
      expect(ctx.hasPendingCloudSync).toBe(true);
      let reconcileRes: any;
      await act(async () => {
        reconcileRes = await ctx.retryPendingCloudSync();
      });
      expect(reconcileRes.success).toBe(true);
      expect(ctx.hasPendingCloudSync).toBe(false);
      expect(idb.pendingCloudStore.has(uidA)).toBe(false);
    });
  });

  describe('Closure Pass P1 — Single Tombstone Owner, Snapshot Dedupe & Single Global Reset Banner', () => {
    it('Item 11 & 13 — useFitnessData leaves gl_deleted_ids_anon to FitnessContext and avoids redundant JSON.stringify on commitFitnessSnapshot', async () => {
      trackDeletedId('logs', 'anon_tomb_1');

      const stringifySpy = vi.spyOn(JSON, 'stringify');
      let dataHook: any;
      const Harness = () => {
        dataHook = useFitnessData();
        return null;
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(Harness));
      });

      // resetToDefaultData in useFitnessData must NOT remove gl_deleted_ids_anon (owned by resetAccountCoordinator)
      act(() => {
        dataHook.resetToDefaultData();
      });
      expect(localStorage.getItem('gl_deleted_ids_anon')).not.toBeNull();

      // commitFitnessSnapshot persists once and subsequent effect with same refs skips redundant serialization
      stringifySpy.mockClear();
      const nextAppState: AppState = { cycleStart: '2026-06-01', updatedAt: 555 };
      await act(async () => {
        dataHook.commitFitnessSnapshot({ appState: nextAppState });
      });
      const callsRightAfterCommit = stringifySpy.mock.calls.length;
      // 1 payload + 3 mirror keys = 4 calls total (NOT double-serialized in useEffect!)
      expect(callsRightAfterCommit).toBe(4);

      // Unrelated state setter update triggers single persistence pass cleanly
      stringifySpy.mockClear();
      await act(async () => {
        dataHook.setAppState({ cycleStart: '2026-06-02', updatedAt: 556 });
      });
      expect(stringifySpy.mock.calls.length).toBe(4);
      expect(JSON.parse(localStorage.getItem('gl_database_snapshot')!).data.appState.cycleStart).toBe('2026-06-02');

      // Rapid consecutive commits persist latest snapshot cleanly
      await act(async () => {
        dataHook.commitFitnessSnapshot({ appState: { cycleStart: '2026-06-03', updatedAt: 557 } });
        dataHook.commitFitnessSnapshot({ appState: { cycleStart: '2026-06-04', updatedAt: 558 } });
      });
      expect(JSON.parse(localStorage.getItem('gl_database_snapshot')!).data.appState.cycleStart).toBe('2026-06-04');

      // Failed commit transitions databaseLifecycleState to storage_error
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      await act(async () => {
        expect(() => dataHook.commitFitnessSnapshot({ appState: { cycleStart: '2026-06-05' } })).toThrow('QuotaExceededError');
      });
      expect(dataHook.databaseLifecycleState.phase).toBe('storage_error');
      setItemSpy.mockRestore();
    });

    it('Item 12 — AccountSection does not render duplicate account-reset banner while Layout renders the global reset banner', async () => {
      const mockCtx: FitnessContextType = {
        user: null,
        loading: false,
        syncStatus: 'idle',
        syncError: null,
        login: vi.fn(),
        logout: vi.fn(),
        retrySync: vi.fn(),
        accountResetStatus: 'failed',
        accountResetError: 'Backup wipe blocked',
        retryAccountReset: vi.fn().mockResolvedValue({ success: true }),
        exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
        workouts: INITIAL_WORKOUTS,
        logs: {},
        appState: { cycleStart: '2026-04-01' },
        databaseLifecycleState: { phase: 'ready' },
        retryStorageCommit: vi.fn().mockReturnValue({ success: true }),
        addExerciseDefinition: vi.fn(),
        updateExerciseDefinition: vi.fn(),
        deleteExerciseDefinition: vi.fn(),
        setWorkouts: vi.fn(),
        assignExerciseToWorkout: vi.fn(),
        removeExerciseFromWorkout: vi.fn(),
        updateWorkoutExerciseProgramming: vi.fn(),
        deleteWorkout: vi.fn(),
        addLog: vi.fn(),
        deleteLog: vi.fn(),
        resetLogs: vi.fn(),
        updateCycleStart: vi.fn(),
        commitFitnessSnapshot: vi.fn(),
        clearActiveSession: vi.fn(),
        logBodyWeight: vi.fn(),
        deleteBodyWeight: vi.fn(),
        pushAutoBackup: vi.fn().mockResolvedValue({ success: true }),
        getAutoBackups: vi.fn().mockReturnValue([]),
        clearAutoBackups: vi.fn().mockResolvedValue({ success: true }),
        restoreAutoBackup: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'restored_locally' }),
        createManualBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
        exportBackup: vi.fn().mockReturnValue('{}'),
        importBackup: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'restored_locally' }),
        retryPendingCloudSync: vi.fn().mockResolvedValue({ success: true, message: '', restoreStatus: 'fully_synced' }),
        isBackupsLoading: false,
        hasPendingCloudSync: false,
        pendingCloudSyncError: null
      };

      root = createRoot(container);
      await act(async () => {
        root!.render(
          React.createElement(
            FitnessContext.Provider,
            { value: mockCtx },
            React.createElement(
              ConfirmContext.Provider,
              { value: { confirm: vi.fn().mockResolvedValue(true) } },
              React.createElement(
                Layout,
                { activeTab: 'manage', onTabChange: vi.fn() },
                React.createElement(AccountSection)
              )
            )
          )
        );
      });

      expect(container.textContent).toContain('Account switch paused — backup cleanup failed');
      expect(container.textContent).not.toContain('Account isolation reset incomplete');
    });
  });
});
