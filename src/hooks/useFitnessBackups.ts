import React, { useCallback } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, ExerciseDefinition, FitnessDatabase, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { extractExerciseDefinitionsFromWorkouts, validateAndSanitizeFitnessData } from '../utils/fitnessMigration';
import { clearDeletedIdsTracker, syncCloudDataWithRestored } from '../utils/fitnessSyncHelpers';
import { saveExerciseDefinitionsBatch, saveWorkoutsBatch, saveLogsBatch, saveAppState } from '../services/fitnessFirestore';

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
  setExerciseDefinitions,
  setWorkouts,
  setLogs,
  setAppState
}: UseFitnessBackupsProps) {

  const pushAutoBackup = useCallback((
    w: Workout[], 
    l: Record<string, SessionLog>, 
    s: AppState, 
    changeType: 'auto-session' | 'auto-edit' | 'manual', 
    desc: string,
    defs?: ExerciseDefinition[]
  ) => {
    try {
      const saved = localStorage.getItem('gl_auto_backups');
      let list: AutoBackupEntry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(list)) list = [];

      const entry: AutoBackupEntry = {
        timestamp: new Date().toISOString(),
        workouts: w,
        logs: l,
        appState: s,
        exerciseDefinitions: defs || exerciseDefsRef.current,
        changeType,
        desc
      };

      list.unshift(entry);
      if (list.length > 8) {
        list = list.slice(0, 8);
      }
      localStorage.setItem('gl_auto_backups', JSON.stringify(list));
    } catch (e) {
      console.error("Failed to push checkpoint auto backup", e);
    }
  }, [exerciseDefsRef]);

  const getAutoBackups = useCallback((): AutoBackupEntry[] => {
    try {
      const saved = localStorage.getItem('gl_auto_backups');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, []);

  const restoreAutoBackup = useCallback(async (timestamp: string): Promise<{ success: boolean; message: string }> => {
    try {
      const backups = getAutoBackups();
      const match = backups.find(b => b.timestamp === timestamp);
      if (!match) {
        return { success: false, message: 'Could not find backup checkpoint matching timestamp' };
      }

      const restoredDefs = match.exerciseDefinitions || INITIAL_EXERCISE_DEFINITIONS;

      const sanitizedLogs: Record<string, SessionLog> = {};
      Object.entries(match.logs || {}).forEach(([id, logVal]: [string, any]) => {
        sanitizedLogs[id] = {
          ...logVal,
          durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
        };
      });

      clearDeletedIdsTracker();

      setExerciseDefinitions(restoredDefs);
      setWorkouts(match.workouts || []);
      setLogs(sanitizedLogs);
      setAppState(match.appState);

      if (user) {
        try {
          await saveAppState(user.uid, match.appState, true);
          await syncCloudDataWithRestored(user.uid, restoredDefs, match.workouts || [], sanitizedLogs);
          await saveExerciseDefinitionsBatch(user.uid, restoredDefs);
          await saveWorkoutsBatch(user.uid, match.workouts || []);
          await saveLogsBatch(user.uid, sanitizedLogs);
        } catch (cloudError: any) {
          console.error("Cloud synchronization failed during restore:", cloudError);
          return {
            success: true,
            message: `Restored locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}.`
          };
        }
      }

      return { success: true, message: `Successfully restored database checkpoint: "${match.desc}"` };
    } catch (e: any) {
      console.error("Failed to restore checkpoint", e);
      return { success: false, message: `Failed to restore checkpoint: ${e.message || String(e)}` };
    }
  }, [user, getAutoBackups, setExerciseDefinitions, setWorkouts, setLogs, setAppState]);

  const createManualBackup = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Manual Vault Savepoint', exerciseDefsRef.current);
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

      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Pre-Import Savepoint', exerciseDefsRef.current);

      clearDeletedIdsTracker();

      setExerciseDefinitions(restoredDefs);
      setWorkouts(restoredWorkouts);
      setLogs(restoredLogs);
      setAppState(restoredAppState);

      if (user) {
        try {
          await saveAppState(user.uid, restoredAppState, true);
          await syncCloudDataWithRestored(user.uid, restoredDefs, restoredWorkouts, restoredLogs);
          await saveExerciseDefinitionsBatch(user.uid, restoredDefs);
          await saveWorkoutsBatch(user.uid, restoredWorkouts);
          await saveLogsBatch(user.uid, restoredLogs);
        } catch (cloudError: any) {
          console.error("Cloud synchronization failed during import:", cloudError);
          return {
            success: true,
            message: `Imported backup locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}.`
          };
        }
      }

      return { success: true, message: 'Backup imported successfully. Data restored.' };
    } catch (e: any) {
      console.error("Import backup error", e);
      return { success: false, message: `Failed to import backup: ${e.message || String(e)}` };
    }
  }, [user, pushAutoBackup, exerciseDefsRef, workoutsRef, logsRef, appStateRef, setExerciseDefinitions, setWorkouts, setLogs, setAppState]);

  return {
    pushAutoBackup,
    getAutoBackups,
    restoreAutoBackup,
    createManualBackup,
    exportBackup,
    importBackup
  };
}
