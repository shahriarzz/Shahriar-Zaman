import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, ExerciseDefinition, FitnessDatabase, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { validateAndSanitizeFitnessData } from '../utils/fitnessMigration';
import { clearDeletedIdsTracker, syncCloudDataWithRestored } from '../utils/fitnessSyncHelpers';
import { saveExerciseDefinitionsBatch, saveWorkoutsBatch, saveLogsBatch, saveAppState } from '../services/fitnessFirestore';
import { FitnessDatabaseSnapshot } from './useFitnessData';

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
  const [isBackupsLoading, setIsBackupsLoading] = useState(true);
  const [backupsVersion, setBackupsVersion] = useState(0);
  const resetEpochRef = useRef(0);

  // Controlled one-time asynchronous initialization and legacy migration effect
  useEffect(() => {
    let isCurrent = true;
    const currentEpoch = resetEpochRef.current;

    const initializeBackups = async () => {
      try {
        setIsBackupsLoading(true);
        // 1. Asynchronously migrate legacy localStorage if present
        const migrated = await migrateLegacyLocalStorageBackups();
        if (!isCurrent || resetEpochRef.current !== currentEpoch) return;

        if (migrated.length > 0) {
          backupsCacheRef.current = migrated.slice(0, 8);
        } else {
          // 2. Load from IndexedDB
          const items = await getAllBackupsFromDb();
          if (!isCurrent || resetEpochRef.current !== currentEpoch) return;
          backupsCacheRef.current = items.slice(0, 8);
        }
      } catch (err) {
        console.warn("Error during backup hydration from IndexedDB:", err);
      } finally {
        if (isCurrent && resetEpochRef.current === currentEpoch) {
          setIsBackupsLoading(false);
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

      setBackupsVersion(v => v + 1);
      return { success: true };
    } catch (e: any) {
      console.error("Failed to persist checkpoint auto backup:", e);
      return { success: false, message: e?.message || String(e) };
    }
  }, [exerciseDefsRef]);

  const getAutoBackups = useCallback((): AutoBackupEntry[] => {
    return backupsCacheRef.current;
  }, [backupsVersion]);

  const clearAutoBackups = useCallback((): void => {
    resetEpochRef.current += 1;
    backupsCacheRef.current = [];
    try {
      localStorage.removeItem('gl_auto_backups');
      localStorage.removeItem('gl_auto_backups_meta');
      clearAllBackupsFromDb().catch(() => {});
    } catch {}
    setBackupsVersion(v => v + 1);
  }, []);

  const restoreAutoBackup = useCallback(async (timestamp: string): Promise<{ success: boolean; message: string }> => {
    try {
      const backups = getAutoBackups();
      const match = backups.find(b => b.timestamp === timestamp);
      if (!match) {
        return { success: false, message: 'Could not find backup checkpoint matching timestamp' };
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
        return {
          success: false,
          message: validation.message || 'Failed to validate checkpoint structure.'
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
          return {
            success: false,
            message: `Restored locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. Local and cloud states currently differ.`
          };
        }
      }

      return { success: true, message: `Successfully restored database checkpoint: "${match.desc}"` };
    } catch (e: any) {
      console.error("Failed to restore checkpoint", e);
      return { success: false, message: `Failed to restore checkpoint: ${e.message || String(e)}` };
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
      let parsed: any;
      try {
        parsed = JSON.parse(backupJson);
      } catch {
        return { success: false, message: 'Invalid JSON format. Could not parse file.' };
      }

      const validation = validateAndSanitizeFitnessData(parsed);
      if (!validation.success || !validation.data) {
        return {
          success: false,
          message: validation.message || 'Failed to validate backup structure.'
        };
      }

      const { exerciseDefinitions: restoredDefs, workouts: restoredWorkouts, logs: restoredLogs, appState: restoredAppState } = validation.data;

      // Await persistence of pre-import savepoint before applying new data
      await pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Pre-Import Savepoint', exerciseDefsRef.current);

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
          return {
            success: false,
            message: `Imported backup locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. Local and cloud states currently differ.`
          };
        }
      }

      return { success: true, message: 'Backup imported successfully. Data restored.' };
    } catch (e: any) {
      console.error("Import backup error", e);
      return { success: false, message: `Failed to import backup: ${e.message || String(e)}` };
    }
  }, [user, pushAutoBackup, exerciseDefsRef, workoutsRef, logsRef, appStateRef, applyFitnessDatabaseSnapshot]);

  return useMemo(() => ({
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
    isBackupsLoading
  }), [
    pushAutoBackup,
    getAutoBackups,
    clearAutoBackups,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup,
    isBackupsLoading
  ]);
}
