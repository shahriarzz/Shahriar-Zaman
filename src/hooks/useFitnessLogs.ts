import React, { useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { SessionLog, AppState, Workout } from '../types/fitness';
import { trackDeletedId, removeDeletedId } from '../utils/fitnessSyncHelpers';
import { saveLog, deleteLog as deleteLogFirestore, saveAppState, deleteLogsBatch } from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { sanitizeSessionLog, BODY_WEIGHT_LIMITS } from '../utils/fitnessCalculations';
import { FitnessDatabaseSnapshot } from './useFitnessData';
import { PushAutoBackup } from './useFitnessBackups';

export interface AddLogResult {
  success: boolean;
  localPersisted: boolean;
  cloudPersisted: boolean;
  cloudAttempted: boolean;
  error?: string;
}

interface UseFitnessLogsProps {
  user: User | null;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  commitFitnessSnapshot: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
  pushAutoBackup: PushAutoBackup;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline') => void;
  setSyncError: (err: string | null) => void;
}

export function useFitnessLogs({
  user,
  logsRef,
  appStateRef,
  workoutsRef,
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

    // 1. Explicit mandatory local durability boundary: persist locally BEFORE publishing or considering success
    try {
      const commitResult = commitFitnessSnapshot({ logs: nextLogs });
      if (!commitResult || !commitResult.success) {
        return {
          success: false,
          localPersisted: false,
          cloudPersisted: false,
          cloudAttempted: !!user,
          error: "Local snapshot commit did not report success."
        };
      }
    } catch (localErr: any) {
      console.error("Failed to commit log to local storage:", localErr);
      const errMsg = localErr?.message || String(localErr);
      return {
        success: false,
        localPersisted: false,
        cloudPersisted: false,
        cloudAttempted: !!user,
        error: errMsg
      };
    }

    // 2. Queue best-effort local backup (non-blocking relative to primary commit)
    void pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-session', `Logged routine: ${logId}`);

    // 3. Cloud synchronization (separate outcome from local commit)
    let cloudPersisted = false;
    const cloudAttempted = !!user;
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
      cloudPersisted,
      cloudAttempted
    };
  }, [user, logsRef, workoutsRef, appStateRef, commitFitnessSnapshot, pushAutoBackup, setSyncStatus, setSyncError]);

  const deleteLog = useCallback(async (logId: string): Promise<void> => {
    const nextLogs = { ...logsRef.current };
    delete nextLogs[logId];

    commitFitnessSnapshot({ logs: nextLogs });
    trackDeletedId('logs', logId, user?.uid);
    void pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-edit', `Deleted log: ${logId}`);

    if (user) {
      try {
        await deleteLogFirestore(user.uid, logId);
        removeDeletedId('logs', logId, user.uid);
      } catch (error) {
        console.error("Failed to delete log from cloud", error);
        const path = `users/${user.uid}/logs/${logId}`;
        handleFirestoreError(error, OperationType.DELETE, path);
        setSyncStatus('failed');
        setSyncError("Deleted log locally, but cloud sync failed.");
      }
    }
  }, [user, logsRef, workoutsRef, appStateRef, commitFitnessSnapshot, pushAutoBackup, setSyncStatus, setSyncError]);

  const resetLogs = useCallback(async (): Promise<void> => {
    const currentLogsSnapshot = logsRef.current;
    const currentLogIds = Object.keys(currentLogsSnapshot);
    void pushAutoBackup(workoutsRef.current, currentLogsSnapshot, appStateRef.current, 'manual', 'Pre-Purge Auto Backup');

    commitFitnessSnapshot({ logs: {} });
    currentLogIds.forEach(id => trackDeletedId('logs', id, user?.uid));

    if (user) {
      try {
        await deleteLogsBatch(user.uid, currentLogIds);
        currentLogIds.forEach(id => removeDeletedId('logs', id, user.uid));
      } catch (error) {
        console.error("Failed to flush logs in cloud", error);
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/logs`);
        setSyncStatus('failed');
        setSyncError("Reset logs locally, but cloud sync failed.");
      }
    }
  }, [user, logsRef, workoutsRef, appStateRef, commitFitnessSnapshot, pushAutoBackup, setSyncStatus, setSyncError]);

  const updateCycleStart = useCallback(async (date: string): Promise<void> => {
    const now = Date.now();
    const nextState = { ...appStateRef.current, cycleStart: date, updatedAt: now };

    commitFitnessSnapshot({ appState: nextState });

    if (user) {
      try {
        await saveAppState(user.uid, { cycleStart: date, updatedAt: now }, true);
      } catch (error) {
        console.error("Failed to update cycle start in cloud", error);
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Updated cycle start locally, but cloud sync failed.");
      }
    }
  }, [user, appStateRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const logBodyWeight = useCallback(async (date: string, weight: number): Promise<void> => {
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

    commitFitnessSnapshot({ appState: nextState });

    if (user) {
      try {
        await saveAppState(user.uid, { weightLog: nextState.weightLog, updatedAt: now }, true);
      } catch (error) {
        console.error("Failed to log body weight in cloud", error);
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Logged body weight locally, but cloud sync failed.");
      }
    }
  }, [user, appStateRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const deleteBodyWeight = useCallback(async (date: string): Promise<void> => {
    const now = Date.now();
    const currentAppState = appStateRef.current;
    const nextLog = { ...(currentAppState.weightLog || {}) };
    delete nextLog[date];
    const nextState = { ...currentAppState, weightLog: nextLog, updatedAt: now };

    commitFitnessSnapshot({ appState: nextState });

    if (user) {
      try {
        await saveAppState(user.uid, { weightLog: nextLog, updatedAt: now }, true);
      } catch (error) {
        console.error("Failed to delete body weight in cloud", error);
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Deleted body weight locally, but cloud sync failed.");
      }
    }
  }, [user, appStateRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

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
