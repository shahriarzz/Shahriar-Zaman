import React, { createContext, useContext, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Workout, SessionLog, AppState, SetLog, ExerciseDefinition, WorkoutExercise } from '../types/fitness';
import { useFitnessData } from '../hooks/useFitnessData';
import { useFitnessSync } from '../hooks/useFitnessSync';
import { useFitnessExercises } from '../hooks/useFitnessExercises';
import { useFitnessWorkouts } from '../hooks/useFitnessWorkouts';
import { useFitnessLogs } from '../hooks/useFitnessLogs';
import { useActiveSession, ActiveSession } from '../hooks/useActiveSession';
import { useFitnessBackups, AutoBackupEntry } from '../hooks/useFitnessBackups';
import { FitnessDerivedProvider } from './FitnessDerivedContext';

export interface FitnessContextType {
  // Auth & Sync state
  user: User | null;
  loading: boolean;
  isInitialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'failed';
  syncError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  retrySync: () => void;

  // Domain State
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;

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
  addLog: (logId: string, logOriginal: SessionLog) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;
  resetLogs: () => Promise<void>;
  updateCycleStart: (date: string) => Promise<void>;

  // Active Session Actions
  activeSession: ActiveSession | null;
  startActiveSession: (workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => void;
  updateActiveSessionSets: (sets: Record<string, SetLog[]>) => void;
  clearActiveSession: () => void;

  // Body Weight Actions
  logBodyWeight: (date: string, weight: number) => Promise<void>;
  deleteBodyWeight: (date: string) => Promise<void>;

  // Backup & Restore Actions
  pushAutoBackup: (w: Workout[], l: Record<string, SessionLog>, s: AppState, changeType: 'auto-session' | 'auto-edit' | 'manual', desc: string, defs?: ExerciseDefinition[]) => void;
  getAutoBackups: () => AutoBackupEntry[];
  restoreAutoBackup: (timestamp: string) => Promise<{ success: boolean; message: string }>;
  createManualBackup: () => Promise<{ success: boolean; message: string }>;
  exportBackup: () => string;
  importBackup: (backupJson: string) => Promise<{ success: boolean; message: string }>;
}

const FitnessContext = createContext<FitnessContextType | undefined>(undefined);

export const FitnessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Core local state store
  const data = useFitnessData();

  // 2. Realtime Firebase sync & Auth
  const sync = useFitnessSync({
    exerciseDefsRef: data.exerciseDefsRef,
    workoutsRef: data.workoutsRef,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    setExerciseDefinitions: data.setExerciseDefinitions,
    setWorkouts: data.setWorkouts,
    setLogs: data.setLogs,
    setAppState: data.setAppState
  });

  // 3. Backups manager
  const backups = useFitnessBackups({
    user: sync.user,
    exerciseDefsRef: data.exerciseDefsRef,
    workoutsRef: data.workoutsRef,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    applyFitnessDatabaseSnapshot: data.applyFitnessDatabaseSnapshot,
    setExerciseDefinitions: data.setExerciseDefinitions,
    setWorkouts: data.setWorkouts,
    setLogs: data.setLogs,
    setAppState: data.setAppState
  });

  // 4. Domain hooks
  const exercises = useFitnessExercises({
    user: sync.user,
    exerciseDefsRef: data.exerciseDefsRef,
    workoutsRef: data.workoutsRef,
    setExerciseDefinitions: data.setExerciseDefinitions,
    setWorkouts: data.setWorkouts,
    pushAutoBackup: backups.pushAutoBackup,
    setSyncStatus: sync.setSyncStatus,
    setSyncError: sync.setSyncError,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef
  });

  const workouts = useFitnessWorkouts({
    user: sync.user,
    workoutsRef: data.workoutsRef,
    setWorkoutsState: data.setWorkouts,
    pushAutoBackup: backups.pushAutoBackup,
    setSyncStatus: sync.setSyncStatus,
    setSyncError: sync.setSyncError,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef
  });

  const logs = useFitnessLogs({
    user: sync.user,
    logsRef: data.logsRef,
    appStateRef: data.appStateRef,
    workoutsRef: data.workoutsRef,
    setLogs: data.setLogs,
    setAppState: data.setAppState,
    pushAutoBackup: backups.pushAutoBackup,
    setSyncStatus: sync.setSyncStatus,
    setSyncError: sync.setSyncError
  });

  // 5. Active session manager
  const activeSession = useActiveSession();

  const value = useMemo<FitnessContextType>(() => ({
    user: sync.user,
    loading: sync.loading,
    isInitialized: data.isInitialized,
    syncStatus: sync.syncStatus,
    syncError: sync.syncError,
    login: sync.login,
    logout: sync.logout,
    retrySync: sync.retrySync,

    exerciseDefinitions: data.exerciseDefinitions,
    workouts: data.workouts,
    logs: data.logs,
    appState: data.appState,

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

    activeSession: activeSession.activeSession,
    startActiveSession: activeSession.startActiveSession,
    updateActiveSessionSets: activeSession.updateActiveSessionSets,
    clearActiveSession: activeSession.clearActiveSession,

    logBodyWeight: logs.logBodyWeight,
    deleteBodyWeight: logs.deleteBodyWeight,

    pushAutoBackup: backups.pushAutoBackup,
    getAutoBackups: backups.getAutoBackups,
    restoreAutoBackup: backups.restoreAutoBackup,
    createManualBackup: backups.createManualBackup,
    exportBackup: backups.exportBackup,
    importBackup: backups.importBackup
  }), [
    sync.user,
    sync.loading,
    sync.syncStatus,
    sync.syncError,
    sync.login,
    sync.logout,
    sync.retrySync,
    data.isInitialized,
    data.exerciseDefinitions,
    data.workouts,
    data.logs,
    data.appState,
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
    activeSession.activeSession,
    activeSession.startActiveSession,
    activeSession.updateActiveSessionSets,
    activeSession.clearActiveSession,
    logs.logBodyWeight,
    logs.deleteBodyWeight,
    backups.pushAutoBackup,
    backups.getAutoBackups,
    backups.restoreAutoBackup,
    backups.createManualBackup,
    backups.exportBackup,
    backups.importBackup
  ]);

  return (
    <FitnessContext.Provider value={value}>
      <FitnessDerivedProvider>
        {children}
      </FitnessDerivedProvider>
    </FitnessContext.Provider>
  );
};

export const useFitness = () => {
  const context = useContext(FitnessContext);
  if (!context) {
    throw new Error('useFitness must be used within a FitnessProvider');
  }
  return context;
};
