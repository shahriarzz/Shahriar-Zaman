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
  BackupPhase
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
  setExerciseDefinitions: (defs: ExerciseDefinition[] | ((prev: ExerciseDefinition[]) => ExerciseDefinition[])) => void;
  setWorkouts: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => void;
  setLogs: (logs: Record<string, SessionLog> | ((prev: Record<string, SessionLog>) => Record<string, SessionLog>)) => void;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
}

export function useFitnessBackups({
  user,
  exerciseDefsRef,
  workoutsRef,
  logsRef,
  appStateRef,
  applyFitnessDatabaseSnapshot
}: UseFitnessBackupsProps) {
  const backupsCacheRef = useRef<AutoBackupEntry[]>([]);
  const [backupPhase, dispatchBackup] = useReducer(backupTransition, initialBackupPhase);
  const [backupsVersion, setBackupsVersion] = useState(0);
  const resetEpochRef = useRef(0);

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
          backupsCacheRef.current = migrated.slice(0, 8);
          dispatchBackup({ type: 'INIT_SUCCEEDED', count: migrated.length });
        } else {
          // 2. Load from IndexedDB
          const items = await getAllBackupsFromDb();
          if (!isCurrent || resetEpochRef.current !== currentEpoch) return;
          backupsCacheRef.current = items.slice(0, 8);
          dispatchBackup({ type: 'INIT_SUCCEEDED', count: items.length });
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

  const pushAutoBackup = useCallback(async (
    w: Workout[], 
    l: Record<string, SessionLog>, 
    s: AppState, 
    changeType: 'auto-session' | 'auto-edit' | 'manual', 
    desc: string,
    defs?: ExerciseDefinition[]
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      dispatchBackup({ type: 'BACKUP_STARTED', desc });
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
      await pruneBackupsInDb(updated.map(u => u.timestamp)).catch(() => {});

      backupsCacheRef.current = updated;

      // Keep lightweight metadata in localStorage
      try {
        const meta = updated.map(u => ({ timestamp: u.timestamp, desc: u.desc, changeType: u.changeType }));
        localStorage.setItem('gl_auto_backups_meta', JSON.stringify(meta));
      } catch {}

      dispatchBackup({ type: 'BACKUP_SUCCEEDED', newCount: updated.length });
      setBackupsVersion(v => v + 1);
      return { success: true };
    } catch (e: any) {
      console.error("Failed to persist checkpoint auto backup:", e);
      const errorMsg = e?.message || String(e);
      dispatchBackup({ type: 'BACKUP_FAILED', error: errorMsg });
      return { success: false, message: errorMsg };
    }
  }, [exerciseDefsRef]);

  const getAutoBackups = useCallback((): AutoBackupEntry[] => {
    return backupsCacheRef.current;
  }, [backupsVersion]);

  const clearAutoBackups = useCallback(async (): Promise<void> => {
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
    }
    setBackupsVersion(v => v + 1);
  }, []);

  const restoreAutoBackup = useCallback(async (timestamp: string): Promise<{ success: boolean; message: string }> => {
    try {
      dispatchBackup({ type: 'RESTORE_STARTED', timestamp });
      const backups = getAutoBackups();
      const match = backups.find(b => b.timestamp === timestamp);
      if (!match) {
        const notFoundMsg = 'Could not find backup checkpoint matching timestamp';
        dispatchBackup({ type: 'RESTORE_FAILED', error: notFoundMsg });
        return { success: false, message: notFoundMsg };
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
          message: valMsg
        };
      }

      const { exerciseDefinitions: restoredDefs, workouts: restoredWorkouts, logs: restoredLogs, appState: restoredAppState } = validation.data;

      clearDeletedIdsTracker();

      // Atomic snapshot restore
      applyFitnessDatabaseSnapshot({
        exerciseDefinitions: restoredDefs,
        workouts: restoredWorkouts,
        logs: restoredLogs,
        appState: restoredAppState
      });

      if (user) {
        try {
          await saveAppState(user.uid, restoredAppState, true);
          await syncCloudDataWithRestored(user.uid, restoredDefs, restoredWorkouts, restoredLogs);
        } catch (cloudError: any) {
          console.error("Cloud synchronization failed during restore:", cloudError);
          dispatchBackup({ type: 'RESTORE_SUCCEEDED' });
          return {
            success: false,
            message: `Restored locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. Local and cloud states currently differ.`
          };
        }
      }

      dispatchBackup({ type: 'RESTORE_SUCCEEDED' });
      return { success: true, message: `Successfully restored database checkpoint: "${match.desc}"` };
    } catch (e: any) {
      console.error("Failed to restore checkpoint", e);
      const errMsg = `Failed to restore checkpoint: ${e.message || String(e)}`;
      dispatchBackup({ type: 'RESTORE_FAILED', error: errMsg });
      return { success: false, message: errMsg };
    }
  }, [user, getAutoBackups, applyFitnessDatabaseSnapshot]);

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

  const importBackup = useCallback(async (backupJson: string): Promise<{ success: boolean; message: string }> => {
    try {
      dispatchBackup({ type: 'IMPORT_STARTED' });
      let parsed: any;
      try {
        parsed = JSON.parse(backupJson);
      } catch {
        const parseErr = 'Invalid JSON format. Could not parse file.';
        dispatchBackup({ type: 'IMPORT_FAILED', error: parseErr });
        return { success: false, message: parseErr };
      }

      const validation = validateAndSanitizeFitnessData(parsed);
      if (!validation.success || !validation.data) {
        const valErr = validation.message || 'Failed to validate backup structure.';
        dispatchBackup({ type: 'IMPORT_FAILED', error: valErr });
        return {
          success: false,
          message: valErr
        };
      }

      const { exerciseDefinitions: restoredDefs, workouts: restoredWorkouts, logs: restoredLogs, appState: restoredAppState } = validation.data;

      // Strict safety checkpoint: Await persistence of pre-import savepoint BEFORE touching application data
      const preImportSave = await pushAutoBackup(
        workoutsRef.current,
        logsRef.current,
        appStateRef.current,
        'manual',
        'Pre-Import Savepoint',
        exerciseDefsRef.current
      );

      if (!preImportSave.success) {
        const abortMsg = `Pre-import safety checkpoint failed: ${preImportSave.message || 'Storage write failed'}. Import aborted to prevent data loss.`;
        dispatchBackup({ type: 'IMPORT_FAILED', error: abortMsg });
        return {
          success: false,
          message: abortMsg
        };
      }

      clearDeletedIdsTracker();

      // Atomic snapshot restore
      applyFitnessDatabaseSnapshot({
        exerciseDefinitions: restoredDefs,
        workouts: restoredWorkouts,
        logs: restoredLogs,
        appState: restoredAppState
      });

      if (user) {
        try {
          await saveAppState(user.uid, restoredAppState, true);
          await syncCloudDataWithRestored(user.uid, restoredDefs, restoredWorkouts, restoredLogs);
        } catch (cloudError: any) {
          console.error("Cloud synchronization failed during import:", cloudError);
          dispatchBackup({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
          return {
            success: false,
            message: `Imported backup locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. Local and cloud states currently differ.`
          };
        }
      }

      dispatchBackup({ type: 'IMPORT_SUCCEEDED', count: backupsCacheRef.current.length });
      return { success: true, message: 'Backup imported successfully. Data restored.' };
    } catch (e: any) {
      console.error("Import backup error", e);
      const errMsg = `Failed to import backup: ${e.message || String(e)}`;
      dispatchBackup({ type: 'IMPORT_FAILED', error: errMsg });
      return { success: false, message: errMsg };
    }
  }, [user, pushAutoBackup, exerciseDefsRef, workoutsRef, logsRef, appStateRef, applyFitnessDatabaseSnapshot]);

  const isBackupsLoading = backupPhase.status === 'loading' || backupPhase.status === 'migrating';

  return useMemo(() => ({
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
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
    isBackupsLoading,
    backupPhase
  ]);
}
