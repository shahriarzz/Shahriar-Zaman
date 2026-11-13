import React, { createContext, useContext, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, SetLog, ExerciseDefinition, WorkoutExercise } from '../types/fitness';
import { useFitnessData, FitnessDatabaseSnapshot } from '../hooks/useFitnessData';
import { useFitnessSync, AccountResetStatus } from '../hooks/useFitnessSync';
import { useFitnessExercises } from '../hooks/useFitnessExercises';
import { useFitnessWorkouts } from '../hooks/useFitnessWorkouts';
import { useFitnessLogs, AddLogResult } from '../hooks/useFitnessLogs';
import { ActiveSession } from '../hooks/useActiveSession';
import {
  useFitnessBackups,
  AutoBackupEntry,
  AutoBackupResult,
  PushAutoBackup,
  RestoreOperationResult
} from '../hooks/useFitnessBackups';
import { clearDeletedIdsTracker } from '../utils/fitnessSyncHelpers';
import { DatabaseState } from '../state/persistence/databaseMachine';
import { FitnessDerivedProvider } from './FitnessDerivedContext';
import { ActiveSessionProvider, useActiveSessionMeta, registerFitnessContextForFallback } from './ActiveSessionContext';

export interface FitnessContextType {
  // Auth & Sync state
  user: User | null;
  loading: boolean;
  isInitialized?: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline';
  syncError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  retrySync: () => void;
  accountResetStatus?: AccountResetStatus;
  accountResetError?: string | null;
  retryAccountReset?: () => Promise<{ success: boolean; error?: string }>;

  // Domain State
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
  databaseLifecycleState?: DatabaseState;
  retryStorageCommit?: () => { success: boolean; error?: string };

  // Exercise Definitions Actions
  addExerciseDefinition: (def: Omit<ExerciseDefinition, 'id'> & { id?: string }) => Promise<ExerciseDefinition>;
  updateExerciseDefinition: (def: ExerciseDefinition) => Promise<void>;
  deleteExerciseDefinition: (id: string) => Promise<void>;

  // Workout Actions
  setWorkouts: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => Promise<void>;
  assignExerciseToWorkout: (workoutId: string, exerciseDefId: string, programming?: Partial<Omit<WorkoutExercise, 'exerciseDefinitionId'>>) => Promise<void>;
  removeExerciseFromWorkout: (workoutId: string, exerciseDefId: string) => Promise<void>;
  updateWorkoutExerciseProgramming: (
    workoutId: string,
    exerciseDefId: string,
    programming: Partial<WorkoutExercise>
  ) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;

  // Log Actions
  addLog: (logId: string, logOriginal: SessionLog) => Promise<AddLogResult>;
  deleteLog: (logId: string) => Promise<void>;
  resetLogs: () => Promise<void>;
  updateCycleStart: (date: string) => Promise<void>;
  commitFitnessSnapshot?: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };

  // Active Session Actions (Optional on FitnessContextType for mock compatibility; canonical home is ActiveSessionContext)
  activeSession?: ActiveSession | null;
  startActiveSession?: (workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => void;
  updateActiveSessionSets?: (sets: Record<string, SetLog[]>) => void;
  clearActiveSession?: () => void;

  // Body Weight Actions
  logBodyWeight: (date: string, weight: number) => Promise<void>;
  deleteBodyWeight: (date: string) => Promise<void>;

  // Backup & Restore Actions
  pushAutoBackup: PushAutoBackup;
  getAutoBackups: () => AutoBackupEntry[];
  clearAutoBackups?: () => Promise<AutoBackupResult>;
  restoreAutoBackup: (timestamp: string) => Promise<RestoreOperationResult>;
  createManualBackup: () => Promise<{ success: boolean; message: string }>;
  exportBackup: () => string;
  importBackup: (backupJson: string) => Promise<RestoreOperationResult>;
  retryPendingCloudSync: () => Promise<RestoreOperationResult>;
  isBackupsLoading?: boolean;
  hasPendingCloudSync?: boolean;
  pendingCloudSyncError?: string | null;
}

export const FitnessContext = createContext<FitnessContextType | undefined>(undefined);
registerFitnessContextForFallback(FitnessContext);

const FitnessProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { clearActiveSession } = useActiveSessionMeta();
  // 1. Core local state store
  const data = useFitnessData();
  const clearAutoBackupsForResetRef = useRef<() => Promise<AutoBackupResult>>(() =>
    Promise.resolve({ success: false, message: 'Backup manager unavailable during reset.' })
  );
  const activeResetPromiseRef = useRef<Promise<void> | null>(null);

  // Authoritative account-boundary reset coordinator:
  // Executes forced backup clearing (not UI-gated clear), resets local domain snapshot,
  // clears in-flight draft, and clears ONLY anonymous tombstones (UID tombstones remain
  // partitioned by UID so offline deletions survive logout and flush on re-login).
  const resetAccountCoordinator = React.useCallback((): Promise<void> => {
    if (activeResetPromiseRef.current) {
      return activeResetPromiseRef.current;
    }

    const resetPromise = (async () => {
      try {
        const clearRes = await clearAutoBackupsForResetRef.current();
        if (!clearRes || !clearRes.success) {
          throw new Error(clearRes?.message || 'Failed to clear previous account backups cleanly.');
        }
        data.resetToDefaultData();
        clearActiveSession();
        clearDeletedIdsTracker();
      } catch (err) {
        console.error("Account boundary reset coordinator error:", err);
        throw err;
      } finally {
        activeResetPromiseRef.current = null;
      }
    })();

    activeResetPromiseRef.current = resetPromise;
    return resetPromise;
  }, [data.resetToDefaultData, clearActiveSession]);

  // 2. Realtime Firebase sync & Auth
  const sync = useFitnessSync({
    exerciseDefsRef: data.exerciseDefsRef,
    workoutsRef: data.workoutsRef,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    setExerciseDefinitions: data.setExerciseDefinitions,
    setWorkouts: data.setWorkouts,
    setLogs: data.setLogs,
    setAppState: data.setAppState,
    commitFitnessSnapshot: data.commitFitnessSnapshot,
    resetToDefaultData: resetAccountCoordinator
  });

  // 3. Backups manager
  const backups = useFitnessBackups({
    user: sync.user,
    exerciseDefsRef: data.exerciseDefsRef,
    workoutsRef: data.workoutsRef,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    commitFitnessSnapshot: data.commitFitnessSnapshot
  });
  clearAutoBackupsForResetRef.current = backups.clearAutoBackupsForAccountReset;

  // 4. Domain hooks
  const exercises = useFitnessExercises({
    user: sync.user,
    exerciseDefsRef: data.exerciseDefsRef,
    workoutsRef: data.workoutsRef,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    commitFitnessSnapshot: data.commitFitnessSnapshot,
    pushAutoBackup: backups.pushAutoBackup,
    setSyncStatus: sync.setSyncStatus,
    setSyncError: sync.setSyncError
  });

  const workouts = useFitnessWorkouts({
    user: sync.user,
    workoutsRef: data.workoutsRef,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    commitFitnessSnapshot: data.commitFitnessSnapshot,
    pushAutoBackup: backups.pushAutoBackup,
    setSyncStatus: sync.setSyncStatus,
    setSyncError: sync.setSyncError
  });

  const logs = useFitnessLogs({
    user: sync.user,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    workoutsRef: data.workoutsRef,
    commitFitnessSnapshot: data.commitFitnessSnapshot,
    pushAutoBackup: backups.pushAutoBackup,
    setSyncStatus: sync.setSyncStatus,
    setSyncError: sync.setSyncError
  });

  const value = useMemo<FitnessContextType>(() => ({
    user: sync.user,
    loading: sync.loading,
    syncStatus: sync.syncStatus,
    syncError: sync.syncError,
    login: sync.login,
    logout: sync.logout,
    retrySync: sync.retrySync,
    accountResetStatus: sync.accountResetStatus,
    accountResetError: sync.accountResetError,
    retryAccountReset: sync.retryAccountReset,

    exerciseDefinitions: data.exerciseDefinitions,
    workouts: data.workouts,
    logs: data.logs,
    appState: data.appState,
    databaseLifecycleState: data.databaseLifecycleState,
    retryStorageCommit: data.retryStorageCommit,

    addExerciseDefinition: exercises.addExerciseDefinition,
    updateExerciseDefinition: exercises.updateExerciseDefinition,
    deleteExerciseDefinition: exercises.deleteExerciseDefinition,

    setWorkouts: workouts.setWorkouts,
    assignExerciseToWorkout: workouts.assignExerciseToWorkout,
    removeExerciseFromWorkout: workouts.removeExerciseFromWorkout,
    updateWorkoutExerciseProgramming: workouts.updateWorkoutExerciseProgramming,
    deleteWorkout: workouts.deleteWorkout,

    addLog: logs.addLog,
    deleteLog: logs.deleteLog,
    resetLogs: logs.resetLogs,
    updateCycleStart: logs.updateCycleStart,

    logBodyWeight: logs.logBodyWeight,
    deleteBodyWeight: logs.deleteBodyWeight,

    commitFitnessSnapshot: data.commitFitnessSnapshot,
    pushAutoBackup: backups.pushAutoBackup,
    getAutoBackups: backups.getAutoBackups,
    clearAutoBackups: backups.clearAutoBackups,
    restoreAutoBackup: backups.restoreAutoBackup,
    createManualBackup: backups.createManualBackup,
    exportBackup: backups.exportBackup,
    importBackup: backups.importBackup,
    retryPendingCloudSync: backups.retryPendingCloudSync,
    isBackupsLoading: backups.isBackupsLoading,
    hasPendingCloudSync: backups.hasPendingCloudSync,
    pendingCloudSyncError: backups.pendingCloudSyncError
  }), [
    sync.user,
    sync.loading,
    sync.syncStatus,
    sync.syncError,
    sync.login,
    sync.logout,
    sync.retrySync,
    sync.accountResetStatus,
    sync.accountResetError,
    sync.retryAccountReset,
    data.exerciseDefinitions,
    data.workouts,
    data.logs,
    data.appState,
    data.databaseLifecycleState,
    data.retryStorageCommit,
    data.commitFitnessSnapshot,
    exercises.addExerciseDefinition,
    exercises.updateExerciseDefinition,
    exercises.deleteExerciseDefinition,
    workouts.setWorkouts,
    workouts.assignExerciseToWorkout,
    workouts.removeExerciseFromWorkout,
    workouts.updateWorkoutExerciseProgramming,
    workouts.deleteWorkout,
    logs.addLog,
    logs.deleteLog,
    logs.resetLogs,
    logs.updateCycleStart,
    logs.logBodyWeight,
    logs.deleteBodyWeight,
    backups.pushAutoBackup,
    backups.getAutoBackups,
    backups.clearAutoBackups,
    backups.restoreAutoBackup,
    backups.createManualBackup,
    backups.exportBackup,
    backups.importBackup,
    backups.retryPendingCloudSync,
    backups.isBackupsLoading,
    backups.hasPendingCloudSync,
    backups.pendingCloudSyncError
  ]);

  return (
    <FitnessContext.Provider value={value}>
      <FitnessDerivedProvider>
        {children}
      </FitnessDerivedProvider>
    </FitnessContext.Provider>
  );
};

export const FitnessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ActiveSessionProvider>
      <FitnessProviderInner>
        {children}
      </FitnessProviderInner>
    </ActiveSessionProvider>
  );
};

export const useFitness = () => {
  const context = useContext(FitnessContext);
  if (!context) {
    throw new Error('useFitness must be used within a FitnessProvider');
  }
  return context;
};
