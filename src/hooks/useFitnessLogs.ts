import React, { useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { SessionLog, AppState, Workout } from '../types/fitness';
import { trackDeletedId, removeDeletedId } from '../utils/fitnessSyncHelpers';
import { saveLog, deleteLog as deleteLogFirestore, saveAppState, deleteLogsBatch } from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { sanitizeSessionLog } from '../utils/fitnessCalculations';

interface UseFitnessLogsProps {
  user: User | null;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  setLogs: (logs: Record<string, SessionLog> | ((prev: Record<string, SessionLog>) => Record<string, SessionLog>)) => void;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
  pushAutoBackup: (w: Workout[], l: any, s: any, type: any, desc: string) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed') => void;
  setSyncError: (err: string | null) => void;
}

export function useFitnessLogs({
  user,
  logsRef,
  appStateRef,
  workoutsRef,
  setLogs,
  setAppState,
  pushAutoBackup,
  setSyncStatus,
  setSyncError
}: UseFitnessLogsProps) {

  const addLog = useCallback(async (logId: string, logOriginal: SessionLog): Promise<void> => {
    // Single canonical ingestion path: sanitize and validate according to data contract
    const log = sanitizeSessionLog({ ...logOriginal, id: logId });
    try {
      const nextLogs = { ...logsRef.current, [logId]: log };
      // Assign ref synchronously alongside setLogs so ref and state represent the same logical write immediately
      logsRef.current = nextLogs;
      setLogs(nextLogs);
      pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-session', `Logged routine: ${logId}`);

      if (user) {
        await saveLog(user.uid, logId, log);
      }
    } catch (error) {
      console.error("Failed to append log", error);
      if (user) {
        const path = `users/${user.uid}/logs/${logId}`;
        handleFirestoreError(error, OperationType.WRITE, path);
        setSyncStatus('failed');
        setSyncError("Logged workout locally, but cloud sync failed.");
      }
    }
  }, [user, logsRef, workoutsRef, appStateRef, setLogs, pushAutoBackup, setSyncStatus, setSyncError]);

  const deleteLog = useCallback(async (logId: string): Promise<void> => {
    try {
      const nextLogs = { ...logsRef.current };
      delete nextLogs[logId];
      logsRef.current = nextLogs;
      trackDeletedId('logs', logId);
      setLogs(nextLogs);
      pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-edit', `Deleted log: ${logId}`);

      if (user) {
        await deleteLogFirestore(user.uid, logId);
        removeDeletedId('logs', logId);
      }
    } catch (error) {
      console.error("Failed to delete log", error);
      if (user) {
        const path = `users/${user.uid}/logs/${logId}`;
        handleFirestoreError(error, OperationType.DELETE, path);
        setSyncStatus('failed');
        setSyncError("Deleted log locally, but cloud sync failed.");
      }
    }
  }, [user, logsRef, workoutsRef, appStateRef, setLogs, pushAutoBackup, setSyncStatus, setSyncError]);

  const resetLogs = useCallback(async (): Promise<void> => {
    try {
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Pre-Purge Auto Backup');
      const currentLogIds = Object.keys(logsRef.current);
      currentLogIds.forEach(id => trackDeletedId('logs', id));

      logsRef.current = {};
      setLogs({});

      if (user) {
        await deleteLogsBatch(user.uid, currentLogIds);
        currentLogIds.forEach(id => removeDeletedId('logs', id));
      }
    } catch (error) {
      console.error("Failed to flush logs", error);
      if (user) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/logs`);
        setSyncStatus('failed');
        setSyncError("Reset logs locally, but cloud sync failed.");
      }
    }
  }, [user, logsRef, workoutsRef, appStateRef, setLogs, pushAutoBackup, setSyncStatus, setSyncError]);

  const updateCycleStart = useCallback(async (date: string): Promise<void> => {
    try {
      const nextState = { ...appStateRef.current, cycleStart: date };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        await saveAppState(user.uid, { cycleStart: date }, true);
      }
    } catch (error) {
      console.error("Failed to update cycle start", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Updated cycle start locally, but cloud sync failed.");
      }
    }
  }, [user, appStateRef, setAppState, setSyncStatus, setSyncError]);

  const logBodyWeight = useCallback(async (date: string, weight: number): Promise<void> => {
    try {
      const currentAppState = appStateRef.current;
      const nextState = { 
        ...currentAppState, 
        weightLog: { ...(currentAppState.weightLog || {}), [date]: weight }
      };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        await saveAppState(user.uid, { weightLog: nextState.weightLog }, true);
      }
    } catch (error) {
      console.error("Failed to log body weight", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Logged body weight locally, but cloud sync failed.");
      }
    }
  }, [user, appStateRef, setAppState, setSyncStatus, setSyncError]);

  const deleteBodyWeight = useCallback(async (date: string): Promise<void> => {
    try {
      const currentAppState = appStateRef.current;
      const nextLog = { ...(currentAppState.weightLog || {}) };
      delete nextLog[date];
      const nextState = { ...currentAppState, weightLog: nextLog };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        await saveAppState(user.uid, { weightLog: nextLog }, true);
      }
    } catch (error) {
      console.error("Failed to delete body weight", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Deleted body weight locally, but cloud sync failed.");
      }
    }
  }, [user, appStateRef, setAppState, setSyncStatus, setSyncError]);

  return useMemo(() => ({
    addLog,
    deleteLog,
    resetLogs,
    updateCycleStart,
    logBodyWeight,
    deleteBodyWeight
  }), [
    addLog,
    deleteLog,
    resetLogs,
    updateCycleStart,
    logBodyWeight,
    deleteBodyWeight
  ]);
}
