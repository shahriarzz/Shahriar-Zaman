import React, { useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { SessionLog, AppState, Workout } from '../types/fitness';
import { trackDeletedId, removeDeletedId } from '../utils/fitnessSyncHelpers';
import { saveLog, deleteLog as deleteLogFirestore, saveAppState, deleteLogsBatch } from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { sanitizeSessionLog, BODY_WEIGHT_LIMITS } from '../utils/fitnessCalculations';

import { FitnessDatabaseSnapshot } from './useFitnessData';

export interface AddLogResult {
  success: boolean;
  localPersisted: boolean;
  cloudPersisted: boolean;
  error?: string;
}

interface UseFitnessLogsProps {
  user: User | null;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  setLogs: (logs: Record<string, SessionLog> | ((prev: Record<string, SessionLog>) => Record<string, SessionLog>)) => void;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
  commitFitnessSnapshot?: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
  pushAutoBackup: (w: Workout[], l: any, s: any, type: any, desc: string) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline') => void;
  setSyncError: (err: string | null) => void;
}

export function useFitnessLogs({
  user,
  logsRef,
  appStateRef,
  workoutsRef,
  setLogs,
  setAppState,
  commitFitnessSnapshot,
  pushAutoBackup,
  setSyncStatus,
  setSyncError
}: UseFitnessLogsProps) {

  const addLog = useCallback(async (logId: string, logOriginal: SessionLog): Promise<AddLogResult> => {
    const now = Date.now();
    // Single canonical ingestion path: sanitize and validate according to data contract with canonical timestamp
    const log = sanitizeSessionLog({ ...logOriginal, id: logId, updatedAt: now });
    const nextLogs = { ...logsRef.current, [logId]: log };

    // 1. Explicit local durability boundary: persist locally BEFORE publishing or considering success
    try {
      if (commitFitnessSnapshot) {
        commitFitnessSnapshot({ logs: nextLogs });
      } else {
        logsRef.current = nextLogs;
        setLogs(nextLogs);
      }
    } catch (localErr: any) {
      console.error("Failed to commit log to local storage:", localErr);
      const errMsg = localErr?.message || String(localErr);
      return {
        success: false,
        localPersisted: false,
        cloudPersisted: false,
        error: errMsg
      };
    }

    // 2. Queue local backup
    pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-session', `Logged routine: ${logId}`);

    // 3. Cloud synchronization (separate outcome from local commit)
    let cloudPersisted = false;
    if (user) {
      try {
        await saveLog(user.uid, logId, log);
        cloudPersisted = true;
      } catch (cloudErr: any) {
        console.error("Cloud synchronization failed for log:", cloudErr);
        const path = `users/${user.uid}/logs/${logId}`;
        handleFirestoreError(cloudErr, OperationType.WRITE, path);
        setSyncStatus('failed');
        setSyncError("Logged workout locally, but cloud sync failed.");
      }
    }

    return {
      success: true,
      localPersisted: true,
      cloudPersisted
    };
  }, [user, logsRef, workoutsRef, appStateRef, setLogs, commitFitnessSnapshot, pushAutoBackup, setSyncStatus, setSyncError]);

  const deleteLog = useCallback(async (logId: string): Promise<void> => {
    try {
      const nextLogs = { ...logsRef.current };
      delete nextLogs[logId];
      if (commitFitnessSnapshot) {
        commitFitnessSnapshot({ logs: nextLogs });
      } else {
        logsRef.current = nextLogs;
        setLogs(nextLogs);
      }
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
      const now = Date.now();
      const nextState = { ...appStateRef.current, cycleStart: date, updatedAt: now };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        await saveAppState(user.uid, { cycleStart: date, updatedAt: now }, true);
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
      if (!Number.isFinite(weight) || weight < BODY_WEIGHT_LIMITS.min || weight > BODY_WEIGHT_LIMITS.max) {
        return;
      }
      const roundedWeight = Math.round(weight * 10) / 10;
      const now = Date.now();
      const currentAppState = appStateRef.current;
      const weightEntry = { weight: roundedWeight, updatedAt: now };
      const nextState = { 
        ...currentAppState, 
        weightLog: { ...(currentAppState.weightLog || {}), [date]: weightEntry },
        updatedAt: now
      };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        await saveAppState(user.uid, { weightLog: nextState.weightLog, updatedAt: now }, true);
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
      const now = Date.now();
      const currentAppState = appStateRef.current;
      const nextLog = { ...(currentAppState.weightLog || {}) };
      delete nextLog[date];
      const nextState = { ...currentAppState, weightLog: nextLog, updatedAt: now };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        await saveAppState(user.uid, { weightLog: nextLog, updatedAt: now }, true);
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
