import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, ExerciseDefinition, FitnessDatabase, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { validateAndSanitizeFitnessData } from '../utils/fitnessMigration';
import { clearDeletedIdsTracker, syncCloudDataWithRestored } from '../utils/fitnessSyncHelpers';
import { saveAppState } from '../services/fitnessFirestore';
import { FitnessDatabaseSnapshot } from './useFitnessData';
import {
  backupTransition,
  initialBackupPhase,
  BackupPhase,
  BackupEvent,
  isBackupOperationAdmissible
} from '../state/persistence/backupMachine';

import {
  saveBackupToDb,
  getAllBackupsFromDb,
  pruneBackupsInDb,
  clearAllBackupsFromDb,
  migrateLegacyLocalStorageBackups,
  savePendingCloudReconciliationToDb,
  getPendingCloudReconciliationFromDb,
  clearPendingCloudReconciliationFromDb,
  PendingCloudReconciliation
} from '../utils/fitnessBackupDb';

export type AutoBackupChangeType = 'auto-session' | 'auto-edit' | 'manual';

export interface AutoBackupEntry {
  timestamp: string;
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
  exerciseDefinitions?: ExerciseDefinition[];
  changeType: AutoBackupChangeType;
  desc: string;
}

export interface AutoBackupResult {
  success: boolean;
  message?: string;
}

export type PushAutoBackup = (
  w: Workout[],
  l: Record<string, SessionLog>,
  s: AppState,
  changeType: AutoBackupChangeType,
  desc: string,
  defs?: ExerciseDefinition[]
) => Promise<AutoBackupResult>;

export type RestoreStatus = 'restored_locally' | 'cloud_sync_pending' | 'fully_synced' | 'restore_failed';

export interface RestoreOperationResult {
  success: boolean;
  message: string;
  restoreStatus: RestoreStatus;
}

interface UseFitnessBackupsProps {
  user: User | null;
  exerciseDefsRef: React.MutableRefObject<ExerciseDefinition[]>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  commitFitnessSnapshot: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
}

export function useFitnessBackups({
  user,
  exerciseDefsRef,
  workoutsRef,
  logsRef,
  appStateRef,
  commitFitnessSnapshot
}: UseFitnessBackupsProps) {
  const backupsCacheRef = useRef<AutoBackupEntry[]>([]);
  const [backupPhase, dispatchBackup] = useReducer(backupTransition, initialBackupPhase);
  const backupPhaseRef = useRef<BackupPhase>(initialBackupPhase);
  const [backupsVersion, setBackupsVersion] = useState(0);
  const [pendingCloudSync, setPendingCloudSync] = useState<PendingCloudReconciliation | null>(null);

  const resetEpochRef = useRef(0);
  const hasHydratedRef = useRef(false);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);
  const inFlightMigrationRef = useRef<Promise<AutoBackupEntry[]> | null>(null);
  const mountedRef = useRef(true);
  const userUidRef = useRef<string | null>(user?.uid ?? null);
  userUidRef.current = user?.uid ?? null;

  // Coalesce concurrent authoritative account-boundary resets onto the same cleanup promise
  const activeForceClearPromiseRef = useRef<Promise<AutoBackupResult> | null>(null);

  // Single authoritative transition helper: evaluates pure backupTransition against synchronous ref,
  // updates the ref immediately, and dispatches to React reducer only on actual transition.
  const transitionBackupPhase = useCallback((event: BackupEvent): BackupPhase => {
    const prev = backupPhaseRef.current;
    const next = backupTransition(prev, event);
    if (next !== prev) {
      backupPhaseRef.current = next;
      dispatchBackup(event);
    }
    return next;
  }, []);

  // Serialized operation queue to prevent overlapping backup mutations
  const operationLockRef = useRef<Promise<any>>(Promise.resolve());
  const runSerializedBackupOp = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const next = operationLockRef.current.then(op, op);
    operationLockRef.current = next;
    return next;
  }, []);

  // Track pending cloud reconciliation for restore/import (backed durably in IndexedDB)
  const pendingCloudRestoreRef = useRef<PendingCloudReconciliation | null>(null);

  const ensureHydrated = useCallback((): Promise<void> => {
    if (hasHydratedRef.current) {
      return Promise.resolve();
    }
    if (initializationPromiseRef.current) {
      return initializationPromiseRef.current;
    }

    const currentEpoch = resetEpochRef.current;
    const promise = (async () => {
      try {
        if (backupPhaseRef.current.status === 'error') {
          transitionBackupPhase({ type: 'INIT_STARTED' });
        }

        // 1. Asynchronously migrate legacy localStorage if present
        const migrationPromise = migrateLegacyLocalStorageBackups();
        inFlightMigrationRef.current = migrationPromise;
        const migrated = await migrationPromise;
        inFlightMigrationRef.current = null;

        if (!mountedRef.current || resetEpochRef.current !== currentEpoch) {
          return;
        }

        let authoritativeItems: AutoBackupEntry[] = migrated;
        if (migrated.length === 0) {
          // 2. Load authoritative list from IndexedDB
          authoritativeItems = await getAllBackupsFromDb();
          if (!mountedRef.current || resetEpochRef.current !== currentEpoch) {
            return;
          }
        }

        const existingTimestamps = new Set(authoritativeItems.map(b => b.timestamp));
        const merged = [...authoritativeItems];
        for (const cached of backupsCacheRef.current) {
          if (!existingTimestamps.has(cached.timestamp)) {
            merged.push(cached);
          }
        }
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        backupsCacheRef.current = merged.slice(0, 8);
        hasHydratedRef.current = true;
        transitionBackupPhase({ type: 'INIT_SUCCEEDED', count: backupsCacheRef.current.length });
      } catch (err: any) {
        inFlightMigrationRef.current = null;
        console.warn("Error during backup hydration from IndexedDB:", err);
        if (mountedRef.current && resetEpochRef.current === currentEpoch) {
          hasHydratedRef.current = false;
          initializationPromiseRef.current = null;
          transitionBackupPhase({ type: 'BACKUP_FAILED', error: err?.message || String(err) });
        }
      } finally {
        inFlightMigrationRef.current = null;
        if (mountedRef.current && resetEpochRef.current === currentEpoch) {
          setBackupsVersion(v => v + 1);
        }
      }
    })();

    initializationPromiseRef.current = promise;
    return promise;
  }, [transitionBackupPhase]);

  // Controlled one-time asynchronous initialization and legacy migration effect
  useEffect(() => {
    mountedRef.current = true;
    ensureHydrated();
    return () => {
      mountedRef.current = false;
    };
  }, [ensureHydrated]);

  // Hydrate per-UID pending cloud reconciliation record on account resolution/change
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (!uid) {
      pendingCloudRestoreRef.current = null;
      setPendingCloudSync(null);
      return;
    }

    let active = true;
    const epochAtStart = resetEpochRef.current;
    getPendingCloudReconciliationFromDb(uid)
      .then((record) => {
        if (!active || userUidRef.current !== uid || resetEpochRef.current !== epochAtStart) return;
        pendingCloudRestoreRef.current = record;
        setPendingCloudSync(record);
      })
      .catch(() => {
        // Non-fatal read warning; retry path still queries DB directly
      });

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const createMonotonicTimestamp = useCallback((existing: AutoBackupEntry[]): string => {
    const nowMs = Date.now();
    let latestMs = 0;
    for (const item of existing) {
      const parsed = new Date(item.timestamp).getTime();
      if (Number.isFinite(parsed) && parsed > latestMs) {
        latestMs = parsed;
      }
    }
    return new Date(Math.max(nowMs, latestMs + 1)).toISOString();
  }, []);

  const performSaveBackup = useCallback(async (
    w: Workout[],
    l: Record<string, SessionLog>,
    s: AppState,
    changeType: AutoBackupChangeType,
    desc: string,
    defs?: ExerciseDefinition[],
    isInternalCheckpoint: boolean = false,
    expectedEpoch?: number
  ): Promise<AutoBackupResult> => {
    try {
      // Hydration barrier: ensure authoritative IndexedDB list is loaded before calculating retained set & pruning
      if (!hasHydratedRef.current) {
        await ensureHydrated();
        if (expectedEpoch !== undefined && resetEpochRef.current !== expectedEpoch) {
          if (!isInternalCheckpoint && backupPhaseRef.current.status === 'creating') {
            transitionBackupPhase({ type: 'BACKUP_FAILED', error: 'Backup cancelled due to account reset.' });
          }
          return { success: false, message: 'Backup cancelled due to account reset.' };
        }
        if (!hasHydratedRef.current) {
          // Last-chance direct read from IndexedDB; do NOT treat empty cache as proof IndexedDB is empty
          const directItems = await getAllBackupsFromDb();
          if (expectedEpoch !== undefined && resetEpochRef.current !== expectedEpoch) {
            if (!isInternalCheckpoint && backupPhaseRef.current.status === 'creating') {
              transitionBackupPhase({ type: 'BACKUP_FAILED', error: 'Backup cancelled due to account reset.' });
            }
            return { success: false, message: 'Backup cancelled due to account reset.' };
          }
          directItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          backupsCacheRef.current = directItems.slice(0, 8);
          hasHydratedRef.current = true;
        }
      }

      const entry: AutoBackupEntry = {
        timestamp: createMonotonicTimestamp(backupsCacheRef.current),
        workouts: w,
        logs: l,
        appState: s,
        exerciseDefinitions: defs || exerciseDefsRef.current,
        changeType,
        desc
      };

      const combined = [entry, ...backupsCacheRef.current.filter(b => b.timestamp !== entry.timestamp)];
      combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const updated = combined.slice(0, 8);

      // Persist full snapshot to IndexedDB and await genuine transaction completion
      await saveBackupToDb(entry);
      // Await pruning and propagate errors instead of swallowing
      await pruneBackupsInDb(updated.map(u => u.timestamp));

      if (expectedEpoch !== undefined && resetEpochRef.current !== expectedEpoch) {
        if (!isInternalCheckpoint && backupPhaseRef.current.status === 'creating') {
          transitionBackupPhase({ type: 'BACKUP_FAILED', error: 'Backup invalidated by account reset.' });
        }
        return { success: false, message: 'Backup invalidated by account reset.' };
      }

      // Update in-memory cache ONLY after both durable transaction and pruning succeed
      backupsCacheRef.current = updated;

      // Keep lightweight metadata in localStorage
      try {
        const meta = updated.map(u => ({ timestamp: u.timestamp, desc: u.desc, changeType: u.changeType }));
        localStorage.setItem('gl_auto_backups_meta', JSON.stringify(meta));
      } catch {}

      if (!isInternalCheckpoint) {
        transitionBackupPhase({ type: 'BACKUP_SUCCEEDED', newCount: updated.length });
      }
      setBackupsVersion(v => v + 1);
      return { success: true };
    } catch (e: any) {
      console.error("Failed to persist checkpoint auto backup:", e);
      const errorMsg = e?.message || String(e);
      if (!isInternalCheckpoint) {
        transitionBackupPhase({ type: 'BACKUP_FAILED', error: errorMsg });
      }
      return { success: false, message: errorMsg };
    }
  }, [exerciseDefsRef, ensureHydrated, createMonotonicTimestamp, transitionBackupPhase]);

  const pushAutoBackup: PushAutoBackup = useCallback((
    w,
    l,
    s,
    changeType,
    desc,
    defs
  ) => {
    const opEpoch = resetEpochRef.current;
    return runSerializedBackupOp(async () => {
      if (!hasHydratedRef.current) {
        await ensureHydrated();
      }
      if (resetEpochRef.current !== opEpoch) {
        return { success: false, message: 'Backup cancelled due to account reset.' };
      }
      if (!isBackupOperationAdmissible(backupPhaseRef.current, 'create')) {
        return { success: false, message: 'Backup creation is not allowed in current state.' };
      }
      const nextPhase = transitionBackupPhase({ type: 'BACKUP_STARTED', desc });
      if (nextPhase.status !== 'creating') {
        return { success: false, message: 'Backup creation transition rejected.' };
      }
      return performSaveBackup(w, l, s, changeType, desc, defs, false, opEpoch);
    });
  }, [ensureHydrated, performSaveBackup, runSerializedBackupOp, transitionBackupPhase]);

  const getAutoBackups = useCallback((): AutoBackupEntry[] => {
    return backupsCacheRef.current;
  }, [backupsVersion]);

  // Normal UI clear path: validates synchronous phase inside queue, preserves cache & metadata on failure,
  // and returns an explicit result instead of reporting false success.
  const clearAutoBackups = useCallback((): Promise<AutoBackupResult> => {
    return runSerializedBackupOp(async () => {
      if (!isBackupOperationAdmissible(backupPhaseRef.current, 'clear')) {
        return { success: false, message: 'Cannot clear backups while backups are loading or another operation is active.' };
      }
      const nextPhase = transitionBackupPhase({ type: 'CLEAR_STARTED' });
      if (nextPhase.status !== 'clearing') {
        return { success: false, message: 'Backup clear transition rejected.' };
      }

      const previousCache = [...backupsCacheRef.current];
      const previousPending = pendingCloudRestoreRef.current;
      try {
        await clearAllBackupsFromDb();

        // Update cache and legacy storage ONLY after durable IndexedDB clearing succeeds
        backupsCacheRef.current = [];
        pendingCloudRestoreRef.current = null;
        setPendingCloudSync(null);
        hasHydratedRef.current = true;
        initializationPromiseRef.current = Promise.resolve();
        try {
          localStorage.removeItem('gl_auto_backups');
          localStorage.removeItem('gl_auto_backups_meta');
        } catch {}

        transitionBackupPhase({ type: 'CLEAR_SUCCEEDED' });
        setBackupsVersion(v => v + 1);
        return { success: true };
      } catch (err: any) {
        console.warn("Failed clearing backups from IndexedDB:", err);
        const errorMsg = err?.message || String(err);
        backupsCacheRef.current = previousCache;
        pendingCloudRestoreRef.current = previousPending;
        transitionBackupPhase({ type: 'CLEAR_FAILED', error: errorMsg });
        setBackupsVersion(v => v + 1);
        return { success: false, message: errorMsg };
      }
    });
  }, [runSerializedBackupOp, transitionBackupPhase]);

  // Authoritative account-boundary clear path: always enqueues a forced clear, waits for active mutations
  // and in-flight legacy migrations, invalidates pending hydration via resetEpochRef, clears IndexedDB BEFORE
  // updating cache/legacy keys, retains previous cache on failure, and exposes explicit failure.
  const clearAutoBackupsForAccountReset = useCallback((): Promise<AutoBackupResult> => {
    if (activeForceClearPromiseRef.current) {
      return activeForceClearPromiseRef.current;
    }

    resetEpochRef.current += 1;

    const clearPromise = runSerializedBackupOp(async (): Promise<AutoBackupResult> => {
      if (inFlightMigrationRef.current) {
        try {
          await inFlightMigrationRef.current;
        } catch {
          // Ignore migration failure; authoritative clear below wipes IndexedDB
        }
      }

      const nextPhase = transitionBackupPhase({ type: 'FORCE_CLEAR_STARTED' });
      if (nextPhase.status !== 'clearing') {
        const msg = 'Authoritative backup clear could not enter clearing phase.';
        return { success: false, message: msg };
      }

      const previousCache = [...backupsCacheRef.current];
      const previousPending = pendingCloudRestoreRef.current;
      try {
        await clearAllBackupsFromDb();

        backupsCacheRef.current = [];
        pendingCloudRestoreRef.current = null;
        setPendingCloudSync(null);
        hasHydratedRef.current = true;
        initializationPromiseRef.current = Promise.resolve();
        try {
          localStorage.removeItem('gl_auto_backups');
          localStorage.removeItem('gl_auto_backups_meta');
        } catch {}

        transitionBackupPhase({ type: 'CLEAR_SUCCEEDED' });
        setBackupsVersion(v => v + 1);
        return { success: true };
      } catch (err: any) {
        console.error("Authoritative account-boundary backup clear failed:", err);
        const errorMsg = err?.message || String(err);
        backupsCacheRef.current = previousCache;
        pendingCloudRestoreRef.current = previousPending;
        hasHydratedRef.current = false;
        initializationPromiseRef.current = null;
        transitionBackupPhase({ type: 'CLEAR_FAILED', error: errorMsg });
        setBackupsVersion(v => v + 1);
        return { success: false, message: errorMsg };
      } finally {
        activeForceClearPromiseRef.current = null;
      }
    });

    activeForceClearPromiseRef.current = clearPromise;
    return clearPromise;
  }, [runSerializedBackupOp, transitionBackupPhase]);

  const restoreAutoBackup = useCallback((timestamp: string): Promise<RestoreOperationResult> => {
    const opEpoch = resetEpochRef.current;
    const opUid = user?.uid ?? null;

    return runSerializedBackupOp(async () => {
      try {
        if (resetEpochRef.current !== opEpoch) {
          return {
            success: false,
            message: 'Restore cancelled due to account reset.',
            restoreStatus: 'restore_failed'
          };
        }
        if (!hasHydratedRef.current || backupPhaseRef.current.status === 'loading' || backupPhaseRef.current.status === 'migrating') {
          return {
            success: false,
            message: 'Backup history is still loading. Please wait a moment and try again.',
            restoreStatus: 'restore_failed'
          };
        }
        if (!isBackupOperationAdmissible(backupPhaseRef.current, 'restore')) {
          return {
            success: false,
            message: 'Restore operation is not allowed in current state.',
            restoreStatus: 'restore_failed'
          };
        }

        const startedPhase = transitionBackupPhase({ type: 'RESTORE_STARTED', timestamp });
        if (startedPhase.status !== 'restoring') {
          return {
            success: false,
            message: 'Restore transition rejected.',
            restoreStatus: 'restore_failed'
          };
        }

        const backups = backupsCacheRef.current;
        const match = backups.find(b => b.timestamp === timestamp);
        if (!match) {
          const notFoundMsg = 'Could not find backup checkpoint matching timestamp';
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: notFoundMsg });
          return { success: false, message: notFoundMsg, restoreStatus: 'restore_failed' };
        }

        // Canonical validation & sanitization pipeline
        const validation = validateAndSanitizeFitnessData({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exerciseDefinitions: match.exerciseDefinitions,
          workouts: match.workouts,
          logs: match.logs,
          appState: match.appState
        });

        if (!validation.success || !validation.data) {
          const valMsg = validation.message || 'Failed to validate checkpoint structure.';
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: valMsg });
          return {
            success: false,
            message: valMsg,
            restoreStatus: 'restore_failed'
          };
        }

        // 1. Create and verify durable pre-restore recovery checkpoint BEFORE modifying existing data
        const preRestoreSave = await performSaveBackup(
          workoutsRef.current,
          logsRef.current,
          appStateRef.current,
          'manual',
          'Pre-Restore Savepoint',
          exerciseDefsRef.current,
          true,
          opEpoch
        );

        if (!preRestoreSave.success) {
          const abortMsg = `Pre-restore safety checkpoint failed: ${preRestoreSave.message || 'Storage write failed'}. Restore aborted to protect existing data.`;
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: abortMsg });
          return {
            success: false,
            message: abortMsg,
            restoreStatus: 'restore_failed'
          };
        }

        const { exerciseDefinitions: restoredDefs, workouts: restoredWorkouts, logs: restoredLogs, appState: restoredAppState } = validation.data;
        const restoredSnapshot: FitnessDatabaseSnapshot = {
          exerciseDefinitions: restoredDefs,
          workouts: restoredWorkouts,
          logs: restoredLogs,
          appState: restoredAppState
        };

        // 2. Durably commit the restored snapshot locally BEFORE modifying tombstones or cloud
        try {
          commitFitnessSnapshot(restoredSnapshot);
        } catch (localCommitErr: any) {
          const errMsg = `Failed to commit restored data locally: ${localCommitErr?.message || String(localCommitErr)}`;
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: errMsg });
          return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
        }

        // 3. Synchronize cloud data if authenticated; retain UID tombstones while pending, clear only after full success
        if (opUid) {
          const pendingRecord: PendingCloudReconciliation = {
            uid: opUid,
            kind: 'restore',
            snapshot: restoredSnapshot,
            sourceTimestamp: timestamp,
            sourceId: timestamp,
            createdAt: Date.now(),
            status: 'pending'
          };

          try {
            await saveAppState(opUid, restoredAppState, true);
            await syncCloudDataWithRestored(opUid, restoredDefs, restoredWorkouts, restoredLogs);

            if (resetEpochRef.current !== opEpoch || userUidRef.current !== opUid) {
              transitionBackupPhase({ type: 'RESTORE_FAILED', error: 'Restore completed locally before account change.' });
              return {
                success: false,
                message: 'Restore completed locally before account change.',
                restoreStatus: 'restore_failed'
              };
            }

            try {
              await clearPendingCloudReconciliationFromDb(opUid);
            } catch {}
            pendingCloudRestoreRef.current = null;
            setPendingCloudSync(null);

            // Clear old UID tombstones ONLY after full cloud reconciliation succeeds
            clearDeletedIdsTracker(opUid);
            clearDeletedIdsTracker();
          } catch (cloudError: any) {
            console.error("Cloud synchronization failed during restore:", cloudError);
            const cloudMsg = cloudError?.message || String(cloudError);
            if (resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
              const failedPending: PendingCloudReconciliation = {
                ...pendingRecord,
                status: 'failed',
                lastError: cloudMsg
              };
              try {
                await savePendingCloudReconciliationToDb(failedPending);
              } catch (persistPendingErr) {
                console.warn("Failed saving pending cloud reconciliation to IndexedDB:", persistPendingErr);
              }
              pendingCloudRestoreRef.current = failedPending;
              setPendingCloudSync(failedPending);
            }
            transitionBackupPhase({ type: 'RESTORE_FAILED', error: `Cloud sync failed: ${cloudMsg}` });
            return {
              success: false,
              restoreStatus: 'cloud_sync_pending',
              message: `Restored locally, but cloud synchronization failed: ${cloudMsg}. Local and cloud states currently differ.`
            };
          }
        } else {
          // Unauthenticated restore: clear anonymous tombstones only
          clearDeletedIdsTracker();
        }

        transitionBackupPhase({ type: 'RESTORE_SUCCEEDED', count: backupsCacheRef.current.length });
        return {
          success: true,
          restoreStatus: opUid ? 'fully_synced' : 'restored_locally',
          message: `Successfully restored database checkpoint: "${match.desc}"`
        };
      } catch (e: any) {
        console.error("Failed to restore checkpoint", e);
        const errMsg = `Failed to restore checkpoint: ${e?.message || String(e)}`;
        transitionBackupPhase({ type: 'RESTORE_FAILED', error: errMsg });
        return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
      }
    });
  }, [user, performSaveBackup, workoutsRef, logsRef, appStateRef, exerciseDefsRef, commitFitnessSnapshot, runSerializedBackupOp, transitionBackupPhase]);

  const createManualBackup = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await pushAutoBackup(
        workoutsRef.current,
        logsRef.current,
        appStateRef.current,
        'manual',
        'Manual Vault Savepoint',
        exerciseDefsRef.current
      );
      if (!res.success) {
        return { success: false, message: `Savepoint failed: ${res.message || 'Could not persist to durable storage.'}` };
      }
      return { success: true, message: 'Manual restore savepoint created successfully.' };
    } catch (e: any) {
      return { success: false, message: `Savepoint failed: ${e?.message || String(e)}` };
    }
  }, [pushAutoBackup, workoutsRef, logsRef, appStateRef, exerciseDefsRef]);

  const exportBackup = useCallback((): string => {
    const backupObj: FitnessDatabase = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      exerciseDefinitions: exerciseDefsRef.current,
      workouts: workoutsRef.current,
      logs: logsRef.current,
      appState: appStateRef.current
    };
    return JSON.stringify(backupObj, null, 2);
  }, [exerciseDefsRef, workoutsRef, logsRef, appStateRef]);

  const importBackup = useCallback((backupJson: string): Promise<RestoreOperationResult> => {
    const opEpoch = resetEpochRef.current;
    const opUid = user?.uid ?? null;

    return runSerializedBackupOp(async () => {
      try {
        // Hydration barrier: import waits for hydration before creating its pre-import checkpoint
        if (!hasHydratedRef.current) {
          await ensureHydrated();
        }
        if (resetEpochRef.current !== opEpoch) {
          return {
            success: false,
            message: 'Import cancelled due to account reset.',
            restoreStatus: 'restore_failed'
          };
        }
        if (!isBackupOperationAdmissible(backupPhaseRef.current, 'import')) {
          return {
            success: false,
            message: 'Import operation is not allowed in current state.',
            restoreStatus: 'restore_failed'
          };
        }

        const startedPhase = transitionBackupPhase({ type: 'IMPORT_STARTED' });
        if (startedPhase.status !== 'importing') {
          return {
            success: false,
            message: 'Import transition rejected.',
            restoreStatus: 'restore_failed'
          };
        }

        let parsed: any;
        try {
          parsed = JSON.parse(backupJson);
        } catch {
          const parseErr = 'Invalid JSON format. Could not parse file.';
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: parseErr });
          return { success: false, message: parseErr, restoreStatus: 'restore_failed' };
        }

        const validation = validateAndSanitizeFitnessData(parsed);
        if (!validation.success || !validation.data) {
          const valErr = validation.message || 'Failed to validate backup structure.';
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: valErr });
          return {
            success: false,
            message: valErr,
            restoreStatus: 'restore_failed'
          };
        }

        const { exerciseDefinitions: restoredDefs, workouts: restoredWorkouts, logs: restoredLogs, appState: restoredAppState } = validation.data;

        // Strict safety checkpoint: await persistence of pre-import savepoint BEFORE touching application data
        const preImportSave = await performSaveBackup(
          workoutsRef.current,
          logsRef.current,
          appStateRef.current,
          'manual',
          'Pre-Import Savepoint',
          exerciseDefsRef.current,
          true,
          opEpoch
        );

        if (!preImportSave.success) {
          const abortMsg = `Pre-import safety checkpoint failed: ${preImportSave.message || 'Storage write failed'}. Import aborted to prevent data loss.`;
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: abortMsg });
          return {
            success: false,
            message: abortMsg,
            restoreStatus: 'restore_failed'
          };
        }

        const restoredSnapshot: FitnessDatabaseSnapshot = {
          exerciseDefinitions: restoredDefs,
          workouts: restoredWorkouts,
          logs: restoredLogs,
          appState: restoredAppState
        };

        // 2. Durably commit the imported snapshot locally BEFORE clearing tombstones
        try {
          commitFitnessSnapshot(restoredSnapshot);
        } catch (localCommitErr: any) {
          const errMsg = `Failed to commit imported data locally: ${localCommitErr?.message || String(localCommitErr)}`;
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: errMsg });
          return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
        }

        // 3. Synchronize cloud data if authenticated; retain UID tombstones while pending
        if (opUid) {
          const nowTs = Date.now();
          const sourceTimestamp = new Date(nowTs).toISOString();
          const pendingRecord: PendingCloudReconciliation = {
            uid: opUid,
            kind: 'import',
            snapshot: restoredSnapshot,
            sourceTimestamp,
            sourceId: `import:${nowTs}`,
            createdAt: nowTs,
            status: 'pending'
          };

          try {
            await saveAppState(opUid, restoredAppState, true);
            await syncCloudDataWithRestored(opUid, restoredDefs, restoredWorkouts, restoredLogs);

            if (resetEpochRef.current !== opEpoch || userUidRef.current !== opUid) {
              transitionBackupPhase({ type: 'IMPORT_FAILED', error: 'Import completed locally before account change.' });
              return {
                success: false,
                message: 'Import completed locally before account change.',
                restoreStatus: 'restore_failed'
              };
            }

            try {
              await clearPendingCloudReconciliationFromDb(opUid);
            } catch {}
            pendingCloudRestoreRef.current = null;
            setPendingCloudSync(null);

            clearDeletedIdsTracker(opUid);
            clearDeletedIdsTracker();
          } catch (cloudError: any) {
            console.error("Cloud synchronization failed during import:", cloudError);
            const cloudMsg = cloudError?.message || String(cloudError);
            if (resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
              const failedPending: PendingCloudReconciliation = {
                ...pendingRecord,
                status: 'failed',
                lastError: cloudMsg
              };
              try {
                await savePendingCloudReconciliationToDb(failedPending);
              } catch (persistPendingErr) {
                console.warn("Failed saving pending cloud reconciliation to IndexedDB:", persistPendingErr);
              }
              pendingCloudRestoreRef.current = failedPending;
              setPendingCloudSync(failedPending);
            }
            transitionBackupPhase({ type: 'IMPORT_FAILED', error: `Cloud sync failed: ${cloudMsg}` });
            return {
              success: false,
              restoreStatus: 'cloud_sync_pending',
              message: `Imported backup locally, but cloud synchronization failed: ${cloudMsg}. Local and cloud states currently differ.`
            };
          }
        } else {
          clearDeletedIdsTracker();
        }

        transitionBackupPhase({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
        return {
          success: true,
          restoreStatus: opUid ? 'fully_synced' : 'restored_locally',
          message: 'Backup imported successfully. Data restored.'
        };
      } catch (e: any) {
        console.error("Import backup error", e);
        const errMsg = `Failed to import backup: ${e?.message || String(e)}`;
        transitionBackupPhase({ type: 'IMPORT_FAILED', error: errMsg });
        return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
      }
    });
  }, [user, ensureHydrated, performSaveBackup, exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitFitnessSnapshot, runSerializedBackupOp, transitionBackupPhase]);

  // Real serialized retry and reconciliation path for cloud-pending restore/import
  const retryPendingCloudSync = useCallback((): Promise<RestoreOperationResult> => {
    const activeUid = user?.uid ?? null;
    const opEpoch = resetEpochRef.current;

    return runSerializedBackupOp(async (): Promise<RestoreOperationResult> => {
      if (!activeUid) {
        return {
          success: false,
          message: 'Cannot reconcile cloud restore: no authenticated account is active.',
          restoreStatus: 'cloud_sync_pending'
        };
      }

      let pending = pendingCloudRestoreRef.current;
      if (!pending || pending.uid !== activeUid) {
        try {
          pending = await getPendingCloudReconciliationFromDb(activeUid);
        } catch {
          pending = null;
        }
      }

      if (!pending) {
        return {
          success: true,
          message: 'No pending cloud restore reconciliation required.',
          restoreStatus: 'fully_synced'
        };
      }

      if (resetEpochRef.current !== opEpoch || userUidRef.current !== activeUid || pending.uid !== activeUid) {
        return {
          success: false,
          message: 'Cannot reconcile cloud restore: active user does not match original account.',
          restoreStatus: 'cloud_sync_pending'
        };
      }

      const opKind = pending.kind === 'import' ? 'import' : 'restore';
      if (!isBackupOperationAdmissible(backupPhaseRef.current, opKind)) {
        return {
          success: false,
          message: 'Backup manager is busy; please retry cloud reconciliation in a moment.',
          restoreStatus: 'cloud_sync_pending'
        };
      }

      const started = pending.kind === 'import'
        ? transitionBackupPhase({ type: 'IMPORT_STARTED' })
        : transitionBackupPhase({ type: 'RESTORE_STARTED', timestamp: pending.sourceTimestamp });

      if (
        (pending.kind === 'import' && started.status !== 'importing') ||
        (pending.kind === 'restore' && started.status !== 'restoring')
      ) {
        return {
          success: false,
          message: 'Cloud reconciliation transition rejected.',
          restoreStatus: 'cloud_sync_pending'
        };
      }

      const retryingRecord: PendingCloudReconciliation = { ...pending, status: 'retrying' };
      pendingCloudRestoreRef.current = retryingRecord;
      setPendingCloudSync(retryingRecord);
      try {
        await savePendingCloudReconciliationToDb(retryingRecord);
      } catch {}

      try {
        await saveAppState(activeUid, pending.snapshot.appState, true);
        await syncCloudDataWithRestored(
          activeUid,
          pending.snapshot.exerciseDefinitions,
          pending.snapshot.workouts,
          pending.snapshot.logs
        );

        // Re-check account & epoch after async cloud writes
        if (resetEpochRef.current !== opEpoch || userUidRef.current !== activeUid) {
          const msg = 'Cloud reconciliation superseded by account change.';
          if (pending.kind === 'import') {
            transitionBackupPhase({ type: 'IMPORT_FAILED', error: msg });
          } else {
            transitionBackupPhase({ type: 'RESTORE_FAILED', error: msg });
          }
          return {
            success: false,
            message: msg,
            restoreStatus: 'restore_failed'
          };
        }

        await clearPendingCloudReconciliationFromDb(activeUid);
        pendingCloudRestoreRef.current = null;
        setPendingCloudSync(null);

        // Clear corresponding UID tombstone tracker ONLY after full cloud reconciliation succeeds
        clearDeletedIdsTracker(activeUid);
        clearDeletedIdsTracker();

        if (pending.kind === 'import') {
          transitionBackupPhase({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
        } else {
          transitionBackupPhase({ type: 'RESTORE_SUCCEEDED', count: backupsCacheRef.current.length });
        }

        return {
          success: true,
          message: 'Cloud reconciliation completed successfully.',
          restoreStatus: 'fully_synced'
        };
      } catch (err: any) {
        console.error("Retry cloud sync failed:", err);
        const errMsg = `Retry failed: ${err?.message || String(err)}`;
        if (resetEpochRef.current === opEpoch && userUidRef.current === activeUid) {
          const failedRecord: PendingCloudReconciliation = {
            ...pending,
            status: 'failed',
            lastError: errMsg
          };
          try {
            await savePendingCloudReconciliationToDb(failedRecord);
          } catch {}
          pendingCloudRestoreRef.current = failedRecord;
          setPendingCloudSync(failedRecord);
        }
        if (pending.kind === 'import') {
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: errMsg });
        } else {
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: errMsg });
        }
        return {
          success: false,
          message: errMsg,
          restoreStatus: 'cloud_sync_pending'
        };
      }
    });
  }, [user, runSerializedBackupOp, transitionBackupPhase]);

  const isBackupsLoading = backupPhase.status === 'loading' || backupPhase.status === 'migrating';

  return useMemo(() => ({
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    clearAutoBackupsForAccountReset,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
    retryPendingCloudSync,
    isBackupsLoading,
    backupPhase,
    backupPhaseRef,
    pendingCloudSync,
    hasPendingCloudSync: pendingCloudSync !== null,
    pendingCloudSyncError: pendingCloudSync?.lastError ?? null
  }), [
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    clearAutoBackupsForAccountReset,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
    retryPendingCloudSync,
    isBackupsLoading,
    backupPhase,
    pendingCloudSync
  ]);
}
