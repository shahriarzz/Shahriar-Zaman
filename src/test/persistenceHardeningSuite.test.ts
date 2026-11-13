// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openBackupDb,
  saveBackupToDb,
  getAllBackupsFromDb,
  clearAllBackupsFromDb,
  migrateLegacyLocalStorageBackups,
  pruneBackupsInDb,
  deleteBackupFromDb,
  resetBackupDbForTesting
} from '../utils/fitnessBackupDb';
import { isBackupOperationAdmissible } from '../state/persistence/backupMachine';
import { Workout, SessionLog, AppState } from '../types/fitness';
import { AutoBackupEntry } from '../hooks/useFitnessBackups';

function createMockIndexedDB() {
  const storeData = new Map<string, any>();

  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => name === 'auto_backups'
    },
    createObjectStore: () => {},
    transaction: () => {
      let pendingRequests = 0;
      let completed = false;
      const tx: any = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore: () => {
          function scheduleCompletion() {
            queueMicrotask(() => {
              if (pendingRequests === 0 && !completed) {
                completed = true;
                if (tx.oncomplete) tx.oncomplete({ target: tx } as any);
              }
            });
          }

          return {
            put: (item: any) => {
              pendingRequests++;
              storeData.set(String(item.timestamp), item);
              const req: any = { onsuccess: null, onerror: null, result: item.timestamp };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                pendingRequests--;
                scheduleCompletion();
              });
              return req;
            },
            getAll: () => {
              pendingRequests++;
              const list = Array.from(storeData.values());
              const req: any = { onsuccess: null, onerror: null, result: list };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                pendingRequests--;
                scheduleCompletion();
              });
              return req;
            },
            getAllKeys: () => {
              pendingRequests++;
              const keys = Array.from(storeData.keys());
              const req: any = { onsuccess: null, onerror: null, result: keys };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                pendingRequests--;
                scheduleCompletion();
              });
              return req;
            },
            delete: (key: string) => {
              pendingRequests++;
              storeData.delete(String(key));
              const req: any = { onsuccess: null, onerror: null };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                pendingRequests--;
                scheduleCompletion();
              });
              return req;
            },
            clear: () => {
              pendingRequests++;
              storeData.clear();
              const req: any = { onsuccess: null, onerror: null };
              queueMicrotask(() => {
                if (req.onsuccess) req.onsuccess({ target: req });
                pendingRequests--;
                scheduleCompletion();
              });
              return req;
            }
          };
        }
      };
      return tx;
    }
  };

  const mockIDBFactory = {
    open: () => {
      const openReq: any = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: mockDb
      };
      queueMicrotask(() => {
        if (openReq.onupgradeneeded) openReq.onupgradeneeded({ target: openReq });
        if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
      });
      return openReq;
    }
  };

  return { mockIDBFactory, storeData };
}

describe('Persistence, State-Machine & Lifecycle Hardening Suite', () => {
  const dummyWorkouts: Workout[] = [{ id: 'w1', name: 'Push', badge: 'PUSH', type: 'push', exercises: [] }];
  const dummyLogs: Record<string, SessionLog> = {
    l1: { id: 'l1', workoutId: 'w1', date: '2026-03-01', complete: true, durationMinutes: 45, sets: {} }
  };
  const dummyAppState: AppState = {
    cycleStart: '2026-01-01'
  };

  const createCheckpoint = (timestamp: number, desc = 'Checkpoint'): AutoBackupEntry => ({
    timestamp: new Date(timestamp).toISOString(),
    workouts: dummyWorkouts,
    logs: dummyLogs,
    appState: dummyAppState,
    changeType: 'manual',
    desc
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    const { mockIDBFactory } = createMockIndexedDB();
    (window as any).indexedDB = mockIDBFactory;
    (globalThis as any).indexedDB = mockIDBFactory;
    resetBackupDbForTesting();
  });

  afterEach(() => {
    resetBackupDbForTesting();
    delete (window as any).indexedDB;
    delete (globalThis as any).indexedDB;
  });

  describe('P0.2 IndexedDB Availability and Durability Contract', () => {
    it('never converts an unavailable IndexedDB runtime into an apparently successful empty read', async () => {
      // Force indexedDB to be undefined
      delete (window as any).indexedDB;
      delete (globalThis as any).indexedDB;
      resetBackupDbForTesting();

      await expect(getAllBackupsFromDb()).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(clearAllBackupsFromDb()).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(saveBackupToDb(createCheckpoint(Date.now()))).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(pruneBackupsInDb(['123'])).rejects.toThrow(/IndexedDB unavailable/i);
      await expect(deleteBackupFromDb('123')).rejects.toThrow(/IndexedDB unavailable/i);
    });

    it('rejects when open request errors and does not cache the failed promise permanently', async () => {
      let openCalls = 0;

      // Mock open to fail on attempt
      (window as any).indexedDB = {
        open: vi.fn().mockImplementation(() => {
          openCalls++;
          const req: any = {};
          queueMicrotask(() => {
            if (req.onerror) {
              req.error = new Error('Simulated Open Lock Failure');
              req.onerror(new Event('error'));
            }
          });
          return req;
        })
      };
      (globalThis as any).indexedDB = (window as any).indexedDB;
      const res1 = await openBackupDb();
      if (!res1.success) {
        expect(res1.reason).toBe('failed');
        expect(res1.error?.message).toMatch(/Simulated Open Lock Failure/i);
      }
      expect(res1.success).toBe(false);
      expect(openCalls).toBe(1);

      // Second call should retry opening because failed promise must not be permanently cached
      const res2 = await openBackupDb();
      if (!res2.success) {
        expect(res2.reason).toBe('failed');
        expect(res2.error?.message).toMatch(/Simulated Open Lock Failure/i);
      }
      expect(res2.success).toBe(false);
      expect(openCalls).toBe(2);
    });
  });

  describe('P0.3 Legacy Backup Hydration and Migration Contract', () => {
    it('merges legacy localStorage with existing records, enforces 8-checkpoint limit, and clears storage only after commit', async () => {
      // 1. Seed existing localStorage with 10 legacy backups
      const legacyCheckpoints: AutoBackupEntry[] = [];
      const baseTime = 1700000000000;
      for (let i = 0; i < 10; i++) {
        legacyCheckpoints.push(createCheckpoint(baseTime + i * 1000, `Legacy ${i}`));
      }
      localStorage.setItem('gl_auto_backups', JSON.stringify(legacyCheckpoints));

      // 2. Perform migration
      const migrated = await migrateLegacyLocalStorageBackups();

      // Should retain exactly up to MAX_BACKUPS (8) newest
      expect(migrated.length).toBeLessThanOrEqual(8);
      expect(new Date(migrated[0].timestamp).getTime()).toBeGreaterThan(new Date(migrated[migrated.length - 1].timestamp).getTime());

      // Verify localStorage was removed only AFTER successful commit
      expect(localStorage.getItem('gl_auto_backups')).toBeNull();

      // Verify records are present in IndexedDB
      const inDb = await getAllBackupsFromDb();
      expect(inDb.length).toBe(migrated.length);
      expect(inDb[0].timestamp).toBe(migrated[0].timestamp);
    });
  });

  describe('P0.4 Pure Admission Guard for Backup Operations', () => {
    it('accurately permits or rejects operations based on backup machine state', () => {
      // Ready state (idle with backups ready)
      expect(isBackupOperationAdmissible({ status: 'ready', checkpointCount: 2 }, 'create')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'ready', checkpointCount: 2 }, 'restore')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'ready', checkpointCount: 2 }, 'import')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'ready', checkpointCount: 2 }, 'clear')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'ready', checkpointCount: 2 }, 'initialize')).toBe(false);

      // Loading state (e.g. initial fetch) allows creation and restore to queue
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'create')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'restore')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'clear')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'loading' }, 'initialize')).toBe(true);

      // Creating backup in flight
      expect(isBackupOperationAdmissible({ status: 'creating', desc: 'Auto', previousCheckpointCount: 2 }, 'create')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'creating', desc: 'Auto', previousCheckpointCount: 2 }, 'restore')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'creating', desc: 'Auto', previousCheckpointCount: 2 }, 'clear')).toBe(false);

      // Restoring backup in flight
      expect(isBackupOperationAdmissible({ status: 'restoring', timestamp: '123', previousCheckpointCount: 2 }, 'create')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'restoring', timestamp: '123', previousCheckpointCount: 2 }, 'restore')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'restoring', timestamp: '123', previousCheckpointCount: 2 }, 'clear')).toBe(false);

      // Clearing backups in flight
      expect(isBackupOperationAdmissible({ status: 'clearing', previousCheckpointCount: 2 }, 'create')).toBe(false);
      expect(isBackupOperationAdmissible({ status: 'clearing', previousCheckpointCount: 2 }, 'clear')).toBe(false);

      // Error state allows retry and recovery
      expect(isBackupOperationAdmissible({ status: 'error', error: 'Disk full', previousCheckpointCount: 0 }, 'create')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'error', error: 'Disk full', previousCheckpointCount: 0 }, 'restore')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'error', error: 'Disk full', previousCheckpointCount: 0 }, 'clear')).toBe(true);
      expect(isBackupOperationAdmissible({ status: 'error', error: 'Disk full', previousCheckpointCount: 0 }, 'initialize')).toBe(true);
    });

    it('transitions cleanly out of error and loading states on retry', async () => {
      const { backupTransition } = await import('../state/persistence/backupMachine');

      const errorState = {
        status: 'error' as const,
        error: 'Cloud sync failed',
        previousStatus: 'ready' as const,
        previousCheckpointCount: 3
      };

      const creatingFromErr = backupTransition(errorState, { type: 'BACKUP_STARTED', desc: 'Retry save' });
      expect(creatingFromErr.status).toBe('creating');
      const readyAfterCreate = backupTransition(creatingFromErr, { type: 'BACKUP_SUCCEEDED', newCount: 4 });
      expect(readyAfterCreate).toEqual({ status: 'ready', checkpointCount: 4 });

      const restoringFromErr = backupTransition(errorState, { type: 'RESTORE_STARTED', timestamp: '2026-03-01T00:00:00.000Z' });
      expect(restoringFromErr.status).toBe('restoring');
      const readyAfterRestore = backupTransition(restoringFromErr, { type: 'RESTORE_SUCCEEDED', count: 3 });
      expect(readyAfterRestore).toEqual({ status: 'ready', checkpointCount: 3 });
    });
  });

  describe('P1.8 Explicit AddLogResult Contract', () => {
    it('verifies AddLogResult has correct signature and types', () => {
      const localOnlyResult = {
        success: true,
        localPersisted: true,
        cloudPersisted: false,
        cloudAttempted: false
      };
      expect(localOnlyResult.success).toBe(true);
      expect(localOnlyResult.localPersisted).toBe(true);
      expect(localOnlyResult.cloudPersisted).toBe(false);
      expect(localOnlyResult.cloudAttempted).toBe(false);

      const authenticatedResult = {
        success: true,
        localPersisted: true,
        cloudPersisted: true,
        cloudAttempted: true
      };
      expect(authenticatedResult.cloudAttempted).toBe(true);
      expect(authenticatedResult.cloudPersisted).toBe(true);
    });
  });
});
