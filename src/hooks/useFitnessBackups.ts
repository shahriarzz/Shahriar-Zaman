import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, ExerciseDefinition, FitnessDatabase, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { validateAndSanitizeFitnessData } from '../utils/fitnessMigration';
import { clearDeletedIdsTracker, syncCloudDataWithRestored } from '../utils/fitnessSyncHelpers';
import { saveAppState } from '../services/fitnessFirestore';
import { FitnessDatabaseSnapshot, persistFitnessDatabase } from './useFitnessData';
import {
  backupTransition,
  initialBackupPhase,
  BackupPhase,
  isBackupOperationAdmissible
} from '../state/persistence/backupMachine';

import { 
  saveBackupToDb, 
  getAllBackupsFromDb, 
  pruneBackupsInDb, 
  clearAllBackupsFromDb, 
  migrateLegacyLocalStorageBackups 
} from '../utils/fitnessBackupDb';

export interface AutoBackupEntry {
  timestamp: string;
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
  exerciseDefinitions?: ExerciseDefinition[];
  changeType: 'auto-session' | 'auto-edit' | 'manual';
  desc: string;
}

interface UseFitnessBackupsProps {
  user: User | null;
  exerciseDefsRef: React.MutableRefObject<ExerciseDefinition[]>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  applyFitnessDatabaseSnapshot: (snapshot: FitnessDatabaseSnapshot) => void;
  commitFitnessSnapshot?: (snapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
  setExerciseDefinitions?: (defs: ExerciseDefinition[] | ((prev: ExerciseDefinition[]) => ExerciseDefinition[])) => void;
  setWorkouts?: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => void;
  setLogs?: (logs: Record<string, SessionLog> | ((prev: Record<string, SessionLog>) => Record<string, SessionLog>)) => void;
  setAppState?: (state: AppState | ((prev: AppState) => AppState)) => void;
}

export function useFitnessBackups({
  user,
  exerciseDefsRef,
  workoutsRef,
  logsRef,
  appStateRef,
  applyFitnessDatabaseSnapshot,
  commitFitnessSnapshot
}: UseFitnessBackupsProps) {
  const backupsCacheRef = useRef<AutoBackupEntry[]>([]);
  const [backupPhase, dispatchBackup] = useReducer(backupTransition, initialBackupPhase);
  const [backupsVersion, setBackupsVersion] = useState(0);
  const resetEpochRef = useRef(0);

  // Serialized operation queue to prevent overlapping backup mutations
  const operationLockRef = useRef<Promise<any>>(Promise.resolve());
  const runSerializedBackupOp = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const next = operationLockRef.current.then(op, op);
    operationLockRef.current = next;
    return next;
  }, []);

  // Controlled one-time asynchronous initialization and legacy migration effect
  useEffect(() => {
    let isCurrent = true;
    const currentEpoch = resetEpochRef.current;

    const initializeBackups = async () => {
      try {
        dispatchBackup({ type: 'INIT_STARTED' });
        // 1. Asynchronously migrate legacy localStorage if present
        const migrated = await migrateLegacyLocalStorageBackups();
        if (!isCurrent || resetEpochRef.current !== currentEpoch) return;

        if (migrated.length > 0) {
          // Safe merge with any backups created while hydration was in flight
          const existingTimestamps = new Set(backupsCacheRef.current.map(b => b.timestamp));
          const merged = [...backupsCacheRef.current];
          for (const item of migrated) {
            if (!existingTimestamps.has(item.timestamp)) {
              merged.push(item);
            }
          }
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          backupsCacheRef.current = merged.slice(0, 8);
          dispatchBackup({ type: 'INIT_SUCCEEDED', count: backupsCacheRef.current.length });
        } else {
          // 2. Load from IndexedDB
          const items = await getAllBackupsFromDb();
          if (!isCurrent || resetEpochRef.current !== currentEpoch) return;
          // Safe merge: preserve any newer checkpoints created during hydration
          const existingTimestamps = new Set(backupsCacheRef.current.map(b => b.timestamp));
          const merged = [...backupsCacheRef.current];
          for (const item of items) {
            if (!existingTimestamps.has(item.timestamp)) {
              merged.push(item);
            }
          }
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          backupsCacheRef.current = merged.slice(0, 8);
          dispatchBackup({ type: 'INIT_SUCCEEDED', count: backupsCacheRef.current.length });
        }
      } catch (err: any) {
        console.warn("Error during backup hydration from IndexedDB:", err);
        if (isCurrent && resetEpochRef.current === currentEpoch) {
          dispatchBackup({ type: 'BACKUP_FAILED', error: err?.message || String(err) });
        }
      } finally {
        if (isCurrent && resetEpochRef.current === currentEpoch) {
          setBackupsVersion(v => v + 1);
        }
      }
    };

    initializeBackups();

    return () => {
      isCurrent = false;
    };
  }, []);

  // Track pending cloud reconciliation for restore/import
  const pendingCloudRestoreRef = useRef<{
    uid: string;
    snapshot: FitnessDatabaseSnapshot;
    timestamp: string;
  } | null>(null);

  const performSaveBackup = useCallback(async (
    w: Workout[], 
    l: Record<string, SessionLog>, 
    s: AppState, 
    changeType: 'auto-session' | 'auto-edit' | 'manual', 
    desc: string,
    defs?: ExerciseDefinition[],
    isInternalCheckpoint: boolean = false
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!isInternalCheckpoint) {
        dispatchBackup({ type: 'BACKUP_STARTED', desc });
      }
      const entry: AutoBackupEntry = {
        timestamp: new Date().toISOString(),
        workouts: w,
        logs: l,
        appState: s,
        exerciseDefinitions: defs || exerciseDefsRef.current,
        changeType,
        desc
      };

      const updated = [entry, ...backupsCacheRef.current.filter(b => b.timestamp !== entry.timestamp)].slice(0, 8);

      // Persist full snapshot to IndexedDB and await genuine transaction completion
      await saveBackupToDb(entry);
      // Await pruning and propagate errors instead of swallowing
      await pruneBackupsInDb(updated.map(u => u.timestamp));

      // Update in-memory cache ONLY after both durable transaction and pruning succeed
      backupsCacheRef.current = updated;

      // Keep lightweight metadata in localStorage
      try {
        const meta = updated.map(u => ({ timestamp: u.timestamp, desc: u.desc, changeType: u.changeType }));
        localStorage.setItem('gl_auto_backups_meta', JSON.stringify(meta));
      } catch {}

      if (!isInternalCheckpoint) {
        dispatchBackup({ type: 'BACKUP_SUCCEEDED', newCount: updated.length });
      }
      setBackupsVersion(v => v + 1);
      return { success: true };
    } catch (e: any) {
      console.error("Failed to persist checkpoint auto backup:", e);
      const errorMsg = e?.message || String(e);
      if (!isInternalCheckpoint) {
        dispatchBackup({ type: 'BACKUP_FAILED', error: errorMsg });
      }
      return { success: false, message: errorMsg };
    }
  }, [exerciseDefsRef]);

  const pushAutoBackup = useCallback((
    w: Workout[], 
    l: Record<string, SessionLog>, 
    s: AppState, 
    changeType: 'auto-session' | 'auto-edit' | 'manual', 
    desc: string,
    defs?: ExerciseDefinition[]
  ): Promise<{ success: boolean; message?: string }> => {
    if (!isBackupOperationAdmissible(backupPhase, 'create')) {
      return Promise.resolve({ success: false, message: 'Backup creation is not allowed in current state.' });
    }
    return runSerializedBackupOp(() => performSaveBackup(w, l, s, changeType, desc, defs));
  }, [performSaveBackup, runSerializedBackupOp, backupPhase]);

  const getAutoBackups = useCallback((): AutoBackupEntry[] => {
    return backupsCacheRef.current;
  }, [backupsVersion]);

  const clearAutoBackups = useCallback((): Promise<void> => {
    if (!isBackupOperationAdmissible(backupPhase, 'clear')) {
      return Promise.resolve();
    }
    return runSerializedBackupOp(async () => {
      resetEpochRef.current += 1;
      backupsCacheRef.current = [];
      dispatchBackup({ type: 'CLEAR_STARTED' });
      try {
        localStorage.removeItem('gl_auto_backups');
        localStorage.removeItem('gl_auto_backups_meta');
        await clearAllBackupsFromDb();
        dispatchBackup({ type: 'CLEAR_SUCCEEDED' });
      } catch (err: any) {
        console.warn("Failed clearing backups from IndexedDB:", err);
        dispatchBackup({ type: 'CLEAR_FAILED', error: err?.message || String(err) });
        throw err;
      } finally {
        setBackupsVersion(v => v + 1);
      }
    });
  }, [runSerializedBackupOp, backupPhase]);

  const restoreAutoBackup = useCallback((timestamp: string): Promise<{ success: boolean; message: string; restoreStatus?: 'restored_locally' | 'cloud_sync_pending' | 'fully_synced' | 'restore_failed' }> => {
    if (!isBackupOperationAdmissible(backupPhase, 'restore')) {
      return Promise.resolve({
        success: false,
        message: 'Restore operation is not allowed in current state.',
        restoreStatus: 'restore_failed'
      });
    }
    return runSerializedBackupOp(async () => {
      try {
        dispatchBackup({ type: 'RESTORE_STARTED', timestamp });
        const backups = getAutoBackups();
        const match = backups.find(b => b.timestamp === timestamp);
        if (!match) {
          const notFoundMsg = 'Could not find backup checkpoint matching timestamp';
          dispatchBackup({ type: 'RESTORE_FAILED', error: notFoundMsg });
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
          dispatchBackup({ type: 'RESTORE_FAILED', error: valMsg });
          return {
            success: false,
            message: valMsg,
            restoreStatus: 'restore_failed'
          };
        }

        // 1. Create and verify durable pre-restore recovery checkpoint BEFORE modifying existing data
        // Must use low-level savepoint so it does NOT dispatch BACKUP_STARTED / BACKUP_SUCCEEDED
        const preRestoreSave = await performSaveBackup(
          workoutsRef.current,
          logsRef.current,
          appStateRef.current,
          'manual',
          'Pre-Restore Savepoint',
          exerciseDefsRef.current,
          true
        );

        if (!preRestoreSave.success) {
          const abortMsg = `Pre-restore safety checkpoint failed: ${preRestoreSave.message || 'Storage write failed'}. Restore aborted to protect existing data.`;
          dispatchBackup({ type: 'RESTORE_FAILED', error: abortMsg });
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

        // 2. Durably commit the restored snapshot locally BEFORE publishing or clearing tombstones
        try {
          if (commitFitnessSnapshot) {
            commitFitnessSnapshot(restoredSnapshot);
          } else {
            persistFitnessDatabase(restoredSnapshot);
            applyFitnessDatabaseSnapshot(restoredSnapshot);
          }
        } catch (localCommitErr: any) {
          const errMsg = `Failed to commit restored data locally: ${localCommitErr?.message || String(localCommitErr)}`;
          dispatchBackup({ type: 'RESTORE_FAILED', error: errMsg });
          return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
        }

        // 3. Clear tombstones ONLY after local commit succeeds
        clearDeletedIdsTracker();

        // 4. Synchronize cloud data after local commit
        if (user) {
          try {
            await saveAppState(user.uid, restoredAppState, true);
            await syncCloudDataWithRestored(user.uid, restoredDefs, restoredWorkouts, restoredLogs);
            pendingCloudRestoreRef.current = null;
          } catch (cloudError: any) {
            console.error("Cloud synchronization failed during restore:", cloudError);
            pendingCloudRestoreRef.current = {
              uid: user.uid,
              snapshot: restoredSnapshot,
              timestamp
            };
            // Do NOT dispatch RESTORE_SUCCEEDED when cloud sync is incomplete
            dispatchBackup({ type: 'RESTORE_FAILED', error: `Cloud sync failed: ${cloudError?.message || String(cloudError)}` });
            return {
              success: false,
              restoreStatus: 'cloud_sync_pending',
              message: `Restored locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. Local and cloud states currently differ.`
            };
          }
        }

        dispatchBackup({ type: 'RESTORE_SUCCEEDED', count: backupsCacheRef.current.length });
        return {
          success: true,
          restoreStatus: user ? 'fully_synced' : 'restored_locally',
          message: `Successfully restored database checkpoint: "${match.desc}"`
        };
      } catch (e: any) {
        console.error("Failed to restore checkpoint", e);
        const errMsg = `Failed to restore checkpoint: ${e.message || String(e)}`;
        dispatchBackup({ type: 'RESTORE_FAILED', error: errMsg });
        return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
      }
    });
  }, [user, getAutoBackups, performSaveBackup, workoutsRef, logsRef, appStateRef, exerciseDefsRef, commitFitnessSnapshot, applyFitnessDatabaseSnapshot, runSerializedBackupOp, backupPhase]);

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
      return { success: false, message: `Savepoint failed: ${e.message || String(e)}` };
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

  const importBackup = useCallback((backupJson: string): Promise<{ success: boolean; message: string; restoreStatus?: 'restored_locally' | 'cloud_sync_pending' | 'fully_synced' | 'restore_failed' }> => {
    if (!isBackupOperationAdmissible(backupPhase, 'import')) {
      return Promise.resolve({
        success: false,
        message: 'Import operation is not allowed in current state.',
        restoreStatus: 'restore_failed'
      });
    }
    return runSerializedBackupOp(async () => {
      try {
        dispatchBackup({ type: 'IMPORT_STARTED' });
        let parsed: any;
        try {
          parsed = JSON.parse(backupJson);
        } catch {
          const parseErr = 'Invalid JSON format. Could not parse file.';
          dispatchBackup({ type: 'IMPORT_FAILED', error: parseErr });
          return { success: false, message: parseErr, restoreStatus: 'restore_failed' };
        }

        const validation = validateAndSanitizeFitnessData(parsed);
        if (!validation.success || !validation.data) {
          const valErr = validation.message || 'Failed to validate backup structure.';
          dispatchBackup({ type: 'IMPORT_FAILED', error: valErr });
          return {
            success: false,
            message: valErr,
            restoreStatus: 'restore_failed'
          };
        }

        const { exerciseDefinitions: restoredDefs, workouts: restoredWorkouts, logs: restoredLogs, appState: restoredAppState } = validation.data;

        // Strict safety checkpoint: Await persistence of pre-import savepoint BEFORE touching application data
        const preImportSave = await performSaveBackup(
          workoutsRef.current,
          logsRef.current,
          appStateRef.current,
          'manual',
          'Pre-Import Savepoint',
          exerciseDefsRef.current,
          true
        );

        if (!preImportSave.success) {
          const abortMsg = `Pre-import safety checkpoint failed: ${preImportSave.message || 'Storage write failed'}. Import aborted to prevent data loss.`;
          dispatchBackup({ type: 'IMPORT_FAILED', error: abortMsg });
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
          if (commitFitnessSnapshot) {
            commitFitnessSnapshot(restoredSnapshot);
          } else {
            persistFitnessDatabase(restoredSnapshot);
            applyFitnessDatabaseSnapshot(restoredSnapshot);
          }
        } catch (localCommitErr: any) {
          const errMsg = `Failed to commit imported data locally: ${localCommitErr?.message || String(localCommitErr)}`;
          dispatchBackup({ type: 'IMPORT_FAILED', error: errMsg });
          return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
        }

        // 3. Clear tombstones ONLY after local commit succeeds
        clearDeletedIdsTracker();

        // 4. Synchronize cloud data after local commit
        if (user) {
          try {
            await saveAppState(user.uid, restoredAppState, true);
            await syncCloudDataWithRestored(user.uid, restoredDefs, restoredWorkouts, restoredLogs);
            pendingCloudRestoreRef.current = null;
          } catch (cloudError: any) {
            console.error("Cloud synchronization failed during import:", cloudError);
            pendingCloudRestoreRef.current = {
              uid: user.uid,
              snapshot: restoredSnapshot,
              timestamp: new Date().toISOString()
            };
            // Do NOT dispatch IMPORT_SUCCEEDED when cloud sync is incomplete
            dispatchBackup({ type: 'IMPORT_FAILED', error: `Cloud sync failed: ${cloudError?.message || String(cloudError)}` });
            return {
              success: false,
              restoreStatus: 'cloud_sync_pending',
              message: `Imported backup locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. Local and cloud states currently differ.`
            };
          }
        }

        dispatchBackup({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
        return {
          success: true,
          restoreStatus: user ? 'fully_synced' : 'restored_locally',
          message: 'Backup imported successfully. Data restored.'
        };
      } catch (e: any) {
        console.error("Import backup error", e);
        const errMsg = `Failed to import backup: ${e.message || String(e)}`;
        dispatchBackup({ type: 'IMPORT_FAILED', error: errMsg });
        return { success: false, message: errMsg, restoreStatus: 'restore_failed' };
      }
    });
  }, [user, performSaveBackup, exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitFitnessSnapshot, applyFitnessDatabaseSnapshot, runSerializedBackupOp, backupPhase]);

  // Real retry and reconciliation path for cloud-pending restore/import
  const retryPendingCloudSync = useCallback(async (): Promise<{ success: boolean; message: string; restoreStatus: 'fully_synced' | 'cloud_sync_pending' | 'restore_failed' }> => {
    const pending = pendingCloudRestoreRef.current;
    if (!pending) {
      return { success: true, message: 'No pending cloud restore reconciliation required.', restoreStatus: 'fully_synced' };
    }
    if (!user || user.uid !== pending.uid) {
      return {
        success: false,
        message: 'Cannot reconcile cloud restore: active user does not match original account.',
        restoreStatus: 'cloud_sync_pending'
      };
    }

    try {
      dispatchBackup({ type: 'RESTORE_STARTED', timestamp: pending.timestamp });
      await saveAppState(user.uid, pending.snapshot.appState, true);
      await syncCloudDataWithRestored(
        user.uid,
        pending.snapshot.exerciseDefinitions,
        pending.snapshot.workouts,
        pending.snapshot.logs
      );
      pendingCloudRestoreRef.current = null;
      dispatchBackup({ type: 'RESTORE_SUCCEEDED', count: backupsCacheRef.current.length });
      return { success: true, message: 'Cloud reconciliation completed successfully.', restoreStatus: 'fully_synced' };
    } catch (err: any) {
      console.error("Retry cloud sync failed:", err);
      const errMsg = `Retry failed: ${err?.message || String(err)}`;
      dispatchBackup({ type: 'RESTORE_FAILED', error: errMsg });
      return {
        success: false,
        message: errMsg,
        restoreStatus: 'cloud_sync_pending'
      };
    }
  }, [user]);

  const isBackupsLoading = backupPhase.status === 'loading' || backupPhase.status === 'migrating';

  return useMemo(() => ({
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
    retryPendingCloudSync,
    isBackupsLoading,
    backupPhase
  }), [
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
    retryPendingCloudSync,
    isBackupsLoading,
    backupPhase
  ]);
}
