import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, ExerciseDefinition, FitnessDatabase, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { validateAndSanitizeFitnessData, readCanonicalSnapshotEnvelope } from '../utils/fitnessMigration';
import { clearDeletedIdsTracker, syncCloudDataWithRestored } from '../utils/fitnessSyncHelpers';
import { saveAppState } from '../services/fitnessFirestore';
import { FitnessDatabaseSnapshot, CommitFitnessSnapshotOptions } from './useFitnessData';
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
  clearBackupCheckpointsFromDb,
  migrateLegacyLocalStorageBackups,
  savePendingCloudReconciliationToDb,
  getPendingCloudReconciliationFromDb,
  clearPendingCloudReconciliationFromDb,
  computeSnapshotFingerprint,
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
  commitFitnessSnapshot: (
    partialSnapshot: Partial<FitnessDatabaseSnapshot>,
    options?: CommitFitnessSnapshotOptions
  ) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
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
  // Track in-memory fallback ONLY when durable IndexedDB persistence of pending record failed
  const unsavedPendingCloudRestoreRef = useRef<PendingCloudReconciliation | null>(null);

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
    unsavedPendingCloudRestoreRef.current = null;
    pendingCloudRestoreRef.current = null;
    setPendingCloudSync(null);
    if (!uid) {
      return;
    }

    let active = true;
    const epochAtStart = resetEpochRef.current;
    getPendingCloudReconciliationFromDb(uid)
      .then((record) => {
        if (!active || userUidRef.current !== uid || resetEpochRef.current !== epochAtStart) return;
        const validRecord = record && record.uid === uid ? record : null;
        pendingCloudRestoreRef.current = validRecord;
        setPendingCloudSync(validRecord);
      })
      .catch(() => {
        // Retry path queries DB directly without treating read error as empty queue
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

  // Normal UI clear path: clears checkpoint backups only, leaves pending cloud reconciliation untouched,
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
      try {
        await clearBackupCheckpointsFromDb();

        // Update cache and legacy storage ONLY after durable IndexedDB clearing succeeds
        backupsCacheRef.current = [];
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
        transitionBackupPhase({ type: 'CLEAR_FAILED', error: errorMsg });
        setBackupsVersion(v => v + 1);
        return { success: false, message: errorMsg };
      }
    });
  }, [runSerializedBackupOp, transitionBackupPhase]);

  // Authoritative account-boundary clear path: always enqueues a forced clear, waits for active mutations
  // and in-flight legacy migrations, invalidates pending hydration via resetEpochRef, clears auto_backups ONLY
  // (preserving UID-partitioned pending_cloud_sync records across account switches), clears in-memory pending
  // refs so the next user starts clean, retains previous state on failure, and exposes explicit failure.
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
          // Ignore migration failure; authoritative clear below wipes IndexedDB checkpoints
        }
      }

      const nextPhase = transitionBackupPhase({ type: 'FORCE_CLEAR_STARTED' });
      if (nextPhase.status !== 'clearing') {
        const msg = 'Authoritative backup clear could not enter clearing phase.';
        return { success: false, message: msg };
      }

      const previousCache = [...backupsCacheRef.current];
      const previousPending = pendingCloudRestoreRef.current;
      const previousUnsavedPending = unsavedPendingCloudRestoreRef.current;
      try {
        await clearBackupCheckpointsFromDb();

        backupsCacheRef.current = [];
        pendingCloudRestoreRef.current = null;
        unsavedPendingCloudRestoreRef.current = null;
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
        unsavedPendingCloudRestoreRef.current = previousUnsavedPending;
        setPendingCloudSync(previousPending);
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

  const executeWriteAheadCloudReconciliation = useCallback(async (
    opUid: string,
    opEpoch: number,
    kind: 'restore' | 'import',
    restoredSnapshot: FitnessDatabaseSnapshot,
    sourceTimestamp: string,
    sourceId: string,
    successMessage: string
  ): Promise<RestoreOperationResult> => {
    const failPhase = (error: string) => {
      if (kind === 'import') {
        transitionBackupPhase({ type: 'IMPORT_FAILED', error });
      } else {
        transitionBackupPhase({ type: 'RESTORE_FAILED', error });
      }
    };
    const succeedPhase = () => {
      if (kind === 'import') {
        transitionBackupPhase({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
      } else {
        transitionBackupPhase({ type: 'RESTORE_SUCCEEDED', count: backupsCacheRef.current.length });
      }
    };
    const actionLabel = kind === 'import' ? 'Imported backup locally' : 'Restored locally';
    const operationId = `reconcile-${kind}-${opUid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const canonicalBaselineEnv = readCanonicalSnapshotEnvelope();
    const baselineSnapshot: FitnessDatabaseSnapshot =
      canonicalBaselineEnv.status === 'ok'
        ? {
            exerciseDefinitions: canonicalBaselineEnv.snapshot.exerciseDefinitions,
            workouts: canonicalBaselineEnv.snapshot.workouts,
            logs: canonicalBaselineEnv.snapshot.logs,
            appState: canonicalBaselineEnv.snapshot.appState
          }
        : {
            exerciseDefinitions: exerciseDefsRef.current,
            workouts: workoutsRef.current,
            logs: logsRef.current,
            appState: appStateRef.current
          };
    const baselineFingerprint = computeSnapshotFingerprint(baselineSnapshot);

    // 1. Create pending reconciliation record with status: 'pending' and durable identity/baseline
    const pendingRecord: PendingCloudReconciliation = {
      uid: opUid,
      kind,
      operationId,
      baselineFingerprint,
      snapshot: restoredSnapshot,
      sourceTimestamp,
      sourceId,
      createdAt: Date.now(),
      status: 'pending'
    };

    // 2. Persist pending record to IndexedDB BEFORE local commit or cloud writes
    let durablePendingPersisted = false;
    let pendingPersistErrorMsg: string | null = null;
    try {
      await savePendingCloudReconciliationToDb(pendingRecord);
      durablePendingPersisted = true;
    } catch (persistErr: any) {
      pendingPersistErrorMsg = persistErr?.message || String(persistErr);
    }

    // 3. Commit restored snapshot locally (keeping pre-operation checkpoint in IndexedDB)
    try {
      const commitRes = commitFitnessSnapshot(restoredSnapshot, {
        reconciliationOperationId: operationId,
        resetOrigin: false
      });
      if (!commitRes || commitRes.success !== true) {
        throw new Error('Local snapshot commit returned unsuccessful result.');
      }
    } catch (localCommitErr: any) {
      const commitMsg = localCommitErr?.message || String(localCommitErr);
      let cleanupNote = '';
      if (durablePendingPersisted) {
        try {
          await clearPendingCloudReconciliationFromDb(opUid);
          pendingCloudRestoreRef.current = null;
          setPendingCloudSync(null);
        } catch (cleanupErr: any) {
          cleanupNote = ` Pending reconciliation cleanup also failed: ${cleanupErr?.message || String(cleanupErr)}.`;
          pendingCloudRestoreRef.current = pendingRecord;
          setPendingCloudSync(pendingRecord);
        }
      }
      const errMsg = `Failed to commit ${kind === 'import' ? 'imported' : 'restored'} data locally: ${commitMsg}.${cleanupNote}`;
      failPhase(errMsg);
      return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
    }

    // If pending-record write-ahead persistence failed, DO NOT start cloud writes,
    // DO NOT report fully_synced or durable cloud_sync_pending; expose recovery retry action cleanly.
    if (!durablePendingPersisted) {
      const recoveryFallback: PendingCloudReconciliation = {
        ...pendingRecord,
        status: 'failed',
        lastError: `Durable cloud recovery metadata could not be saved: ${pendingPersistErrorMsg}. Retry cloud sync once IndexedDB is available.`
      };
      if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
        unsavedPendingCloudRestoreRef.current = recoveryFallback;
        pendingCloudRestoreRef.current = null;
        setPendingCloudSync(recoveryFallback);
      }
      const distinctMsg = `${actionLabel}, but durable cloud recovery metadata could not be saved (${pendingPersistErrorMsg}). Cloud writes were not started; retry reconciliation after storage becomes available.`;
      if (mountedRef.current) {
        failPhase(distinctMsg);
      }
      return {
        success: false,
        restoreStatus: 'restore_failed',
        message: distinctMsg
      };
    }

    // Pending record is now durably stored in IndexedDB before starting cloud writes
    if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
      unsavedPendingCloudRestoreRef.current = null;
      pendingCloudRestoreRef.current = pendingRecord;
      setPendingCloudSync(pendingRecord);
    }

    // 4. Execute cloud writes
    try {
      await saveAppState(opUid, restoredSnapshot.appState, true);
      await syncCloudDataWithRestored(
        opUid,
        restoredSnapshot.exerciseDefinitions,
        restoredSnapshot.workouts,
        restoredSnapshot.logs
      );
    } catch (cloudError: any) {
      console.error(`Cloud synchronization failed during ${kind}:`, cloudError);
      const cloudMsg = cloudError?.message || String(cloudError);
      let finalMsg = `${actionLabel}, but cloud synchronization failed: ${cloudMsg}. Local and cloud states currently differ.`;

      if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
        const failedPending: PendingCloudReconciliation = {
          ...pendingRecord,
          status: 'failed',
          lastError: cloudMsg
        };
        try {
          await savePendingCloudReconciliationToDb(failedPending);
          if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
            pendingCloudRestoreRef.current = failedPending;
            setPendingCloudSync(failedPending);
          }
        } catch (persistPendingErr: any) {
          const storageMsg = persistPendingErr?.message || String(persistPendingErr);
          if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === opUid) {
            // Preserve last known durable pending record (status: 'pending') in ref, surface storage error separately
            pendingCloudRestoreRef.current = pendingRecord;
            setPendingCloudSync({
              ...pendingRecord,
              lastError: `Cloud error: ${cloudMsg}. Storage update error: ${storageMsg}`
            });
          }
          finalMsg = `${actionLabel}, but cloud synchronization failed: ${cloudMsg}. Additionally, saving failure metadata to IndexedDB failed: ${storageMsg}.`;
        }
        if (mountedRef.current) {
          failPhase(finalMsg);
        }
      }

      return {
        success: false,
        restoreStatus: 'cloud_sync_pending',
        message: finalMsg
      };
    }

    // Re-check lifecycle, account & epoch after async cloud writes
    if (!mountedRef.current || resetEpochRef.current !== opEpoch || userUidRef.current !== opUid) {
      const supersededMsg = `${kind === 'import' ? 'Import' : 'Restore'} completed locally before account change or unmount.`;
      if (mountedRef.current) {
        failPhase(supersededMsg);
      }
      return {
        success: false,
        message: supersededMsg,
        restoreStatus: 'restore_failed'
      };
    }

    // 5. Durably remove the pending record ONLY after cloud writes succeed; never swallow clear errors
    try {
      await clearPendingCloudReconciliationFromDb(opUid);
    } catch (clearErr: any) {
      const clearMsg = clearErr?.message || String(clearErr);
      const retainedMsg = `Cloud synchronization completed, but removing pending reconciliation metadata from IndexedDB failed: ${clearMsg}. Retry reconciliation once storage is writable to finalize cleanup.`;
      const retainedPending: PendingCloudReconciliation = {
        ...pendingRecord,
        lastError: retainedMsg
      };
      pendingCloudRestoreRef.current = pendingRecord;
      setPendingCloudSync(retainedPending);
      failPhase(retainedMsg);
      return {
        success: false,
        restoreStatus: 'cloud_sync_pending',
        message: retainedMsg
      };
    }

    pendingCloudRestoreRef.current = null;
    unsavedPendingCloudRestoreRef.current = null;
    setPendingCloudSync(null);

    // Clear old UID tombstones ONLY after durable deletion of pending record succeeds
    clearDeletedIdsTracker(opUid);
    clearDeletedIdsTracker();

    succeedPhase();
    return {
      success: true,
      restoreStatus: 'fully_synced',
      message: successMessage
    };
  }, [exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitFitnessSnapshot, transitionBackupPhase]);

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

        const successMessage = `Successfully restored database checkpoint: "${match.desc}"`;

        if (opUid) {
          return await executeWriteAheadCloudReconciliation(
            opUid,
            opEpoch,
            'restore',
            restoredSnapshot,
            timestamp,
            timestamp,
            successMessage
          );
        }

        // Unauthenticated restore: commit locally and clear anonymous tombstones only
        try {
          const commitRes = commitFitnessSnapshot(restoredSnapshot);
          if (!commitRes || commitRes.success !== true) {
            throw new Error('Local snapshot commit returned unsuccessful result.');
          }
        } catch (localCommitErr: any) {
          const errMsg = `Failed to commit restored data locally: ${localCommitErr?.message || String(localCommitErr)}`;
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: errMsg });
          return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
        }
        clearDeletedIdsTracker();
        transitionBackupPhase({ type: 'RESTORE_SUCCEEDED', count: backupsCacheRef.current.length });
        return {
          success: true,
          restoreStatus: 'restored_locally',
          message: successMessage
        };
      } catch (e: any) {
        console.error("Failed to restore checkpoint", e);
        const errMsg = `Failed to restore checkpoint: ${e?.message || String(e)}`;
        transitionBackupPhase({ type: 'RESTORE_FAILED', error: errMsg });
        return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
      }
    });
  }, [user, performSaveBackup, workoutsRef, logsRef, appStateRef, exerciseDefsRef, commitFitnessSnapshot, executeWriteAheadCloudReconciliation, runSerializedBackupOp, transitionBackupPhase]);

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

        const successMessage = 'Backup imported successfully. Data restored.';

        if (opUid) {
          const nowTs = Date.now();
          const sourceTimestamp = new Date(nowTs).toISOString();
          return await executeWriteAheadCloudReconciliation(
            opUid,
            opEpoch,
            'import',
            restoredSnapshot,
            sourceTimestamp,
            `import:${nowTs}`,
            successMessage
          );
        }

        try {
          const commitRes = commitFitnessSnapshot(restoredSnapshot);
          if (!commitRes || commitRes.success !== true) {
            throw new Error('Local snapshot commit returned unsuccessful result.');
          }
        } catch (localCommitErr: any) {
          const errMsg = `Failed to commit imported data locally: ${localCommitErr?.message || String(localCommitErr)}`;
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: errMsg });
          return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
        }
        clearDeletedIdsTracker();
        transitionBackupPhase({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
        return {
          success: true,
          restoreStatus: 'restored_locally',
          message: successMessage
        };
      } catch (e: any) {
        console.error("Import backup error", e);
        const errMsg = `Failed to import backup: ${e?.message || String(e)}`;
        transitionBackupPhase({ type: 'IMPORT_FAILED', error: errMsg });
        return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
      }
    });
  }, [user, ensureHydrated, performSaveBackup, exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitFitnessSnapshot, executeWriteAheadCloudReconciliation, runSerializedBackupOp, transitionBackupPhase]);

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

      // Always verify authoritative IndexedDB pending record state; NEVER interpret DB read failure as empty queue
      let dbPending: PendingCloudReconciliation | null;
      try {
        dbPending = await getPendingCloudReconciliationFromDb(activeUid);
      } catch (readErr: any) {
        const readMsg = `Storage read error while checking pending cloud reconciliation: ${readErr?.message || String(readErr)}`;
        // Preserve any previously loaded pending record and tombstones untouched
        return {
          success: false,
          message: readMsg,
          restoreStatus: 'cloud_sync_pending'
        };
      }

      if (dbPending && dbPending.uid !== activeUid) {
        return {
          success: false,
          message: 'Cannot reconcile cloud restore: stored pending record belongs to a different account.',
          restoreStatus: 'cloud_sync_pending'
        };
      }

      const unsavedFallback =
        !dbPending &&
        unsavedPendingCloudRestoreRef.current &&
        unsavedPendingCloudRestoreRef.current.uid === activeUid
          ? unsavedPendingCloudRestoreRef.current
          : null;

      const pending = dbPending ?? unsavedFallback;

      if (!pending) {
        if (pendingCloudRestoreRef.current?.uid === activeUid) {
          pendingCloudRestoreRef.current = null;
          setPendingCloudSync(null);
        }
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

      const failRetryPhase = (errText: string) => {
        if (pending.kind === 'import') {
          transitionBackupPhase({ type: 'IMPORT_FAILED', error: errText });
        } else {
          transitionBackupPhase({ type: 'RESTORE_FAILED', error: errText });
        }
      };

      // Idempotent local-recovery step before starting cloud writes
      const canonicalEnv = readCanonicalSnapshotEnvelope();
      const pendingOpId = pending.operationId;
      let needsLocalCommit = false;

      if (canonicalEnv.status === 'corrupt') {
        const corruptMsg = 'Cannot recover pending cloud restore: local canonical snapshot is corrupted. Resolve local snapshot corruption before retrying.';
        const conflictRecord: PendingCloudReconciliation = {
          ...pending,
          status: 'failed',
          lastError: corruptMsg
        };
        try {
          await savePendingCloudReconciliationToDb(conflictRecord);
          pendingCloudRestoreRef.current = conflictRecord;
          setPendingCloudSync(conflictRecord);
        } catch {
          pendingCloudRestoreRef.current = pending;
          setPendingCloudSync({ ...pending, lastError: corruptMsg });
        }
        failRetryPhase(corruptMsg);
        return {
          success: false,
          message: corruptMsg,
          restoreStatus: 'cloud_sync_pending'
        };
      }

      if (pendingOpId) {
        if (canonicalEnv.status === 'ok') {
          if (canonicalEnv.lastReconciliationOperationId === pendingOpId) {
            needsLocalCommit = false;
          } else {
            const currentFingerprint = computeSnapshotFingerprint({
              exerciseDefinitions: canonicalEnv.snapshot.exerciseDefinitions,
              workouts: canonicalEnv.snapshot.workouts,
              logs: canonicalEnv.snapshot.logs,
              appState: canonicalEnv.snapshot.appState
            });
            const matchesBaseline = Boolean(pending.baselineFingerprint) && currentFingerprint === pending.baselineFingerprint;
            if (canonicalEnv.resetOrigin || matchesBaseline) {
              needsLocalCommit = true;
            } else {
              const conflictMsg = 'Local data changed after restore/import started. Newer local changes were preserved; resolve conflict before retrying cloud reconciliation.';
              const conflictRecord: PendingCloudReconciliation = {
                ...pending,
                status: 'failed',
                lastError: conflictMsg
              };
              try {
                await savePendingCloudReconciliationToDb(conflictRecord);
                pendingCloudRestoreRef.current = conflictRecord;
                setPendingCloudSync(conflictRecord);
              } catch {
                pendingCloudRestoreRef.current = pending;
                setPendingCloudSync({ ...pending, lastError: conflictMsg });
              }
              failRetryPhase(conflictMsg);
              return {
                success: false,
                message: conflictMsg,
                restoreStatus: 'cloud_sync_pending'
              };
            }
          }
        } else {
          // Canonical envelope missing (e.g. unit test with mocked commitFitnessSnapshot or clean storage)
          const inMemFingerprint = computeSnapshotFingerprint({
            exerciseDefinitions: exerciseDefsRef.current,
            workouts: workoutsRef.current,
            logs: logsRef.current,
            appState: appStateRef.current
          });
          const pendingFingerprint = computeSnapshotFingerprint(pending.snapshot);
          if (inMemFingerprint === pendingFingerprint) {
            needsLocalCommit = false;
          } else if (!pending.baselineFingerprint || inMemFingerprint === pending.baselineFingerprint) {
            needsLocalCommit = true;
          } else {
            const conflictMsg = 'Local data changed after restore/import started. Newer local changes were preserved; resolve conflict before retrying cloud reconciliation.';
            const conflictRecord: PendingCloudReconciliation = {
              ...pending,
              status: 'failed',
              lastError: conflictMsg
            };
            try {
              await savePendingCloudReconciliationToDb(conflictRecord);
              pendingCloudRestoreRef.current = conflictRecord;
              setPendingCloudSync(conflictRecord);
            } catch {
              pendingCloudRestoreRef.current = pending;
              setPendingCloudSync({ ...pending, lastError: conflictMsg });
            }
            failRetryPhase(conflictMsg);
            return {
              success: false,
              message: conflictMsg,
              restoreStatus: 'cloud_sync_pending'
            };
          }
        }
      } else if (canonicalEnv.status === 'ok' && canonicalEnv.resetOrigin) {
        // Legacy pending record without operationId after an account switch reset (A -> B -> A)
        needsLocalCommit = true;
      }

      if (needsLocalCommit) {
        try {
          const commitRes = commitFitnessSnapshot(pending.snapshot, {
            reconciliationOperationId: pendingOpId ?? `reconcile-${pending.kind}-${activeUid}-${pending.createdAt}`,
            resetOrigin: false
          });
          if (!commitRes || commitRes.success !== true) {
            throw new Error('Local snapshot commit returned unsuccessful result.');
          }
        } catch (localRecoveryErr: any) {
          const localErrMsg = `Failed to recover restored data locally: ${localRecoveryErr?.message || String(localRecoveryErr)}`;
          const failedRecord: PendingCloudReconciliation = {
            ...pending,
            status: 'failed',
            lastError: localErrMsg
          };
          try {
            await savePendingCloudReconciliationToDb(failedRecord);
            pendingCloudRestoreRef.current = failedRecord;
            setPendingCloudSync(failedRecord);
          } catch {
            pendingCloudRestoreRef.current = pending;
            setPendingCloudSync({ ...pending, lastError: localErrMsg });
          }
          failRetryPhase(localErrMsg);
          return {
            success: false,
            message: localErrMsg,
            restoreStatus: 'cloud_sync_pending'
          };
        }
      }

      const durableBaseline = dbPending ?? pendingCloudRestoreRef.current;
      const retryingRecord: PendingCloudReconciliation = { ...pending, status: 'retrying' };
      try {
        await savePendingCloudReconciliationToDb(retryingRecord);
        pendingCloudRestoreRef.current = retryingRecord;
        unsavedPendingCloudRestoreRef.current = null;
        setPendingCloudSync(retryingRecord);
      } catch (saveRetryErr: any) {
        const storageMsg = `Storage write error updating pending reconciliation status: ${saveRetryErr?.message || String(saveRetryErr)}`;
        // Keep last known durable pending record intact
        if (durableBaseline) {
          pendingCloudRestoreRef.current = durableBaseline;
          setPendingCloudSync({
            ...durableBaseline,
            lastError: storageMsg
          });
        }
        failRetryPhase(storageMsg);
        return {
          success: false,
          message: storageMsg,
          restoreStatus: 'cloud_sync_pending'
        };
      }

      try {
        await saveAppState(activeUid, pending.snapshot.appState, true);
        await syncCloudDataWithRestored(
          activeUid,
          pending.snapshot.exerciseDefinitions,
          pending.snapshot.workouts,
          pending.snapshot.logs
        );
      } catch (err: any) {
        console.error("Retry cloud sync failed:", err);
        const cloudErrMsg = `Retry failed: ${err?.message || String(err)}`;
        let combinedMsg = cloudErrMsg;

        if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === activeUid) {
          const failedRecord: PendingCloudReconciliation = {
            ...pending,
            status: 'failed',
            lastError: cloudErrMsg
          };
          try {
            await savePendingCloudReconciliationToDb(failedRecord);
            if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === activeUid) {
              pendingCloudRestoreRef.current = failedRecord;
              setPendingCloudSync(failedRecord);
            }
          } catch (persistErr: any) {
            const storageErrMsg = persistErr?.message || String(persistErr);
            if (mountedRef.current && resetEpochRef.current === opEpoch && userUidRef.current === activeUid) {
              // Keep last known durable retryingRecord intact and report storage error separately
              pendingCloudRestoreRef.current = retryingRecord;
              setPendingCloudSync({
                ...retryingRecord,
                lastError: `${cloudErrMsg}; storage status update error: ${storageErrMsg}`
              });
            }
            combinedMsg = `${cloudErrMsg} (Additionally, failed to persist retry error state to IndexedDB: ${storageErrMsg})`;
          }
          if (mountedRef.current) {
            failRetryPhase(combinedMsg);
          }
        }
        return {
          success: false,
          message: combinedMsg,
          restoreStatus: 'cloud_sync_pending'
        };
      }

      // Re-check lifecycle, account & epoch after async cloud writes
      if (!mountedRef.current || resetEpochRef.current !== opEpoch || userUidRef.current !== activeUid) {
        const msg = 'Cloud reconciliation superseded by account change or unmount.';
        if (mountedRef.current) {
          failRetryPhase(msg);
        }
        return {
          success: false,
          message: msg,
          restoreStatus: 'restore_failed'
        };
      }

      // Durably delete pending record ONLY after cloud reconciliation succeeds
      try {
        await clearPendingCloudReconciliationFromDb(activeUid);
      } catch (clearErr: any) {
        const storageDeleteMsg = `Cloud reconciliation writes succeeded, but removing the pending record from IndexedDB failed: ${clearErr?.message || String(clearErr)}. Retry once storage is writable to finish cleanup.`;
        // Do NOT clear in-memory pending state or UID tombstones when delete fails
        pendingCloudRestoreRef.current = retryingRecord;
        setPendingCloudSync({
          ...retryingRecord,
          lastError: storageDeleteMsg
        });
        failRetryPhase(storageDeleteMsg);
        return {
          success: false,
          message: storageDeleteMsg,
          restoreStatus: 'cloud_sync_pending'
        };
      }

      pendingCloudRestoreRef.current = null;
      unsavedPendingCloudRestoreRef.current = null;
      setPendingCloudSync(null);

      // Clear corresponding UID tombstone tracker ONLY after durable pending record deletion succeeds
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
    });
  }, [user, exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitFitnessSnapshot, runSerializedBackupOp, transitionBackupPhase]);

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
