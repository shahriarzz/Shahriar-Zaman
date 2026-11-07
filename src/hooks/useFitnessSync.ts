import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { auth, signInWithGoogle, onAuthStateChanged, getRedirectResult, User } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { 
  sanitizeExerciseDefinition, 
  sanitizeWorkout, 
  sanitizeSessionLog 
} from '../utils/fitnessCalculations';
import { 
  getDeletedIdsTracker, 
  removeDeletedId,
  clearDeletedIdsTracker, 
  resolveLocalCloudRecord,
  mergeDefinitions,
  mergeWorkouts,
  mergeLogs,
  mergeAppState
} from '../utils/fitnessSyncHelpers';
import { 
  getExerciseDefinitions, 
  getWorkouts, 
  getLogs, 
  getAppState, 
  saveExerciseDefinitionsBatch, 
  saveWorkoutsBatch, 
  saveLogsBatch, 
  saveAppState, 
  deleteExerciseDefinition, 
  deleteWorkout, 
  deleteLog,
  subscribeExerciseDefinitions,
  subscribeWorkouts,
  subscribeLogs,
  subscribeAppState
} from '../services/fitnessFirestore';

interface UseFitnessSyncProps {
  exerciseDefsRef: React.MutableRefObject<ExerciseDefinition[]>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  setExerciseDefinitions: (defs: ExerciseDefinition[] | ((prev: ExerciseDefinition[]) => ExerciseDefinition[])) => void;
  setWorkouts: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => void;
  setLogs: (logs: Record<string, SessionLog> | ((prev: Record<string, SessionLog>) => Record<string, SessionLog>)) => void;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
  resetToDefaultData?: () => void;
  setSyncStatus?: (status: 'idle' | 'syncing' | 'synced' | 'failed') => void;
}

export function useFitnessSync({
  exerciseDefsRef,
  workoutsRef,
  logsRef,
  appStateRef,
  setExerciseDefinitions,
  setWorkouts,
  setLogs,
  setAppState,
  resetToDefaultData,
  setSyncStatus: externalSetSyncStatus
}: UseFitnessSyncProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setInternalSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
  const externalSetSyncStatusRef = useRef(externalSetSyncStatus);
  externalSetSyncStatusRef.current = externalSetSyncStatus;
  const setSyncStatus = useCallback((status: 'idle' | 'syncing' | 'synced' | 'failed') => {
    setInternalSyncStatus(status);
    externalSetSyncStatusRef.current?.(status);
  }, []);
  const [syncError, setSyncError] = useState<string | null>(null);

  const isSyncingRef = useRef(false);
  const queuedSyncUidRef = useRef<string | null>(null);
  const previousUidRef = useRef<string | null>(null);
  const currentUidRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);

  // Auth listener
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.warn("Auth redirect notice:", err?.message || err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      const prevUid = previousUidRef.current;
      const currentUid = u ? u.uid : null;
      currentUidRef.current = currentUid;

      // Invalidate any in-flight syncs immediately on account change or logout
      if (prevUid !== currentUid) {
        authGenerationRef.current += 1;
        isSyncingRef.current = false;
        queuedSyncUidRef.current = null;
      }

      // When switching accounts or logging out from an existing account, isolate data by resetting local state
      // This strictly prevents Account A's workout data or tombstones from being merged or uploaded into Account B
      if (prevUid && prevUid !== currentUid) {
        clearDeletedIdsTracker(prevUid);
        clearDeletedIdsTracker();
        if (resetToDefaultData) {
          resetToDefaultData();
        }
      } else if (!prevUid && currentUid) {
        // First login: check if local state already has local/anonymous workouts/logs that shouldn't leak
        // Tombstones from anonymous mode are cleared to avoid purging the new account's cloud records
        clearDeletedIdsTracker();
      }
      previousUidRef.current = currentUid;

      setUser(u);
      setLoading(false);
      if (!u) {
        setSyncStatus('idle');
        setSyncError(null);
      }
    });
    return unsubscribeAuth;
  }, [resetToDefaultData]);

  const login = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/not-configured') {
        console.warn("Sign-in notice:", e?.message || e);
      }
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      authGenerationRef.current += 1;
      isSyncingRef.current = false;
      queuedSyncUidRef.current = null;
      currentUidRef.current = null;
      setSyncStatus('idle');
      setSyncError(null);
      const currentUid = auth.currentUser?.uid || previousUidRef.current;
      await auth.signOut();
      clearDeletedIdsTracker(currentUid);
      clearDeletedIdsTracker();
      if (resetToDefaultData) {
        resetToDefaultData();
      }
    } catch (e) {
      console.error("Sign out error:", e);
    }
  }, [resetToDefaultData, setSyncStatus]);

  // Sync logic with guaranteed queued follow-up execution
  const syncDataBackground = useCallback(async (uid: string) => {
    // If auth generation changes or user has switched/logged out, do not start
    if (currentUidRef.current !== uid) {
      return;
    }
    const currentGen = authGenerationRef.current;

    if (isSyncingRef.current) {
      // Queue a follow-up sync specifically for this UID
      queuedSyncUidRef.current = uid;
      return;
    }
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);

    const isStale = () => authGenerationRef.current !== currentGen || currentUidRef.current !== uid;

    try {
      // 0. Purge offline deleted items for this UID (failed deletions stay in queue for retry)
      const deletedTracker = getDeletedIdsTracker(uid);
      if (deletedTracker.defs.length > 0) {
        for (const defId of [...deletedTracker.defs]) {
          if (isStale()) return;
          try {
            await deleteExerciseDefinition(uid, defId);
            removeDeletedId('defs', defId, uid);
          } catch (e) {
            console.warn(`Cloud deletion failed for def ${defId}, retaining in retry queue:`, e);
          }
        }
      }
      if (deletedTracker.workouts.length > 0) {
        for (const woId of [...deletedTracker.workouts]) {
          if (isStale()) return;
          try {
            await deleteWorkout(uid, woId);
            removeDeletedId('workouts', woId, uid);
          } catch (e) {
            console.warn(`Cloud deletion failed for workout ${woId}, retaining in retry queue:`, e);
          }
        }
      }
      if (deletedTracker.logs.length > 0) {
        for (const logId of [...deletedTracker.logs]) {
          if (isStale()) return;
          try {
            await deleteLog(uid, logId);
            removeDeletedId('logs', logId, uid);
          } catch (e) {
            console.warn(`Cloud deletion failed for log ${logId}, retaining in retry queue:`, e);
          }
        }
      }

      if (isStale()) return;

      // Parallel download
      const [rawCloudDefs, rawCloudWorkouts, rawCloudLogs, cloudState] = await Promise.all([
        getExerciseDefinitions(uid),
        getWorkouts(uid),
        getLogs(uid),
        getAppState(uid)
      ]);

      if (isStale()) return;

      // Filter cloud records against active tombstones to prevent resurrection
      const activeTracker = getDeletedIdsTracker(uid);
      const cloudDefs = rawCloudDefs.filter(d => !activeTracker.defs.includes(d.id));
      const cloudWorkouts = rawCloudWorkouts.filter(w => !activeTracker.workouts.includes(w.id));
      const cloudLogsMap: Record<string, SessionLog> = {};
      Object.entries(rawCloudLogs || {}).forEach(([id, l]) => {
        if (!activeTracker.logs.includes(id)) {
          cloudLogsMap[id] = l as SessionLog;
        }
      });

      // 1. Deterministic App State Sync
      const { merged: mergedState, needsUpload: stateNeedsUpload } = mergeAppState(appStateRef.current, cloudState);
      if (stateNeedsUpload) {
        if (isStale()) return;
        await saveAppState(uid, mergedState, true);
      }
      if (isStale()) return;
      setAppState(mergedState);

      // 2. Deterministic Defs Sync
      const { merged: mergedDefs, toUpload: defsToUpload } = mergeDefinitions(
        exerciseDefsRef.current,
        cloudDefs,
        activeTracker.defs
      );
      if (defsToUpload.length > 0) {
        if (isStale()) return;
        await saveExerciseDefinitionsBatch(uid, defsToUpload);
      }
      if (isStale()) return;
      setExerciseDefinitions(mergedDefs);

      // 3. Deterministic Workouts Sync
      const { merged: mergedWorkouts, toUpload: workoutsToUpload } = mergeWorkouts(
        workoutsRef.current,
        cloudWorkouts,
        activeTracker.workouts
      );
      if (workoutsToUpload.length > 0) {
        if (isStale()) return;
        await saveWorkoutsBatch(uid, workoutsToUpload);
      }
      if (isStale()) return;
      setWorkouts(mergedWorkouts);

      // 4. Deterministic Logs Sync
      const { merged: mergedLogs, toUpload: logsToUpload } = mergeLogs(
        logsRef.current,
        cloudLogsMap,
        activeTracker.logs
      );
      if (Object.keys(logsToUpload).length > 0) {
        if (isStale()) return;
        await saveLogsBatch(uid, logsToUpload);
      }
      if (isStale()) return;
      setLogs(mergedLogs);

      if (!isStale()) {
        setSyncStatus('synced');
      }
    } catch (err: any) {
      if (isStale()) {
        // Stale sync error must never update current sync status or UI
        return;
      }
      console.error("Background sync error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      setSyncStatus('failed');
      setSyncError("Cloud synchronization failed. Operating in offline mode.");
      throw err;
    } finally {
      if (authGenerationRef.current === currentGen) {
        isSyncingRef.current = false;
      }
      // If a concurrent sync request was queued while this sync was in progress, execute the follow-up only if it matches current UID and generation
      const nextUid = queuedSyncUidRef.current;
      queuedSyncUidRef.current = null;
      if (nextUid && nextUid === currentUidRef.current && authGenerationRef.current === currentGen) {
        setTimeout(() => {
          syncDataBackground(nextUid).catch(() => {});
        }, 50);
      }
    }
  }, [exerciseDefsRef, workoutsRef, logsRef, appStateRef, setExerciseDefinitions, setWorkouts, setLogs, setAppState, setSyncStatus]);

  // Realtime Listeners
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let retryTimeoutId: any = null;

    const isListenerValid = () => isMounted && currentUidRef.current === user.uid;

    const executeWithRetry = async (retriesLeft = 3, delayMs = 2000) => {
      if (!isListenerValid()) return;
      try {
        await syncDataBackground(user.uid);
      } catch (err: any) {
        if (!isListenerValid()) return;

        const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || 
                          err?.code === 'unavailable' || 
                          (err?.message || '').toLowerCase().includes('offline');

        if (isOffline) {
          if (isListenerValid()) {
            setSyncStatus('failed');
            setSyncError("Working offline. Synchronization will resume when connection is restored.");
          }
          return;
        }

        if (retriesLeft > 1 && isMounted) {
          retryTimeoutId = setTimeout(() => executeWithRetry(retriesLeft - 1, delayMs * 2), delayMs);
        } else if (isListenerValid()) {
          setSyncStatus('failed');
          setSyncError("Cloud synchronization failed.");
        }
      }
    };

    executeWithRetry();

    const unsubDefs = subscribeExerciseDefinitions(
      user.uid,
      (changes) => {
        if (!isListenerValid()) return;
        let hasChanges = false;
        const current = [...exerciseDefsRef.current];
        const tombstones = getDeletedIdsTracker(user.uid).defs;
        changes.forEach(change => {
          const id = change.doc.id;
          const isTombstoned = tombstones.includes(id);
          if (change.type === 'added' || change.type === 'modified') {
            const cloudDef = sanitizeExerciseDefinition(change.doc.data(), id);
            const idx = current.findIndex(d => d.id === id);
            const localDef = idx !== -1 ? current[idx] : null;
            const result = resolveLocalCloudRecord(localDef, cloudDef, isTombstoned);

            if (result.winner === 'cloud' && result.resolved) {
              if (idx === -1) {
                current.push(result.resolved);
              } else {
                current[idx] = result.resolved;
              }
              hasChanges = true;
            } else if (result.winner === 'tombstone') {
              if (idx !== -1) {
                current.splice(idx, 1);
                hasChanges = true;
              }
            }
          } else if (change.type === 'removed') {
            const idx = current.findIndex(d => d.id === id);
            if (idx !== -1 && !change.doc.metadata.hasPendingWrites) {
              current.splice(idx, 1);
              hasChanges = true;
            }
          }
        });
        if (hasChanges) setExerciseDefinitions(current);
      },
      (err) => {
        if (!isListenerValid()) return;
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/exerciseDefinitions`);
      }
    );

    const unsubWorkouts = subscribeWorkouts(
      user.uid,
      (changes) => {
        if (!isListenerValid()) return;
        let hasChanges = false;
        const current = [...workoutsRef.current];
        const tombstones = getDeletedIdsTracker(user.uid).workouts;
        changes.forEach(change => {
          const id = change.doc.id;
          const isTombstoned = tombstones.includes(id);
          if (change.type === 'added' || change.type === 'modified') {
            const cloudW = sanitizeWorkout(change.doc.data(), id);
            const idx = current.findIndex(w => w.id === id);
            const localW = idx !== -1 ? current[idx] : null;
            const result = resolveLocalCloudRecord(localW, cloudW, isTombstoned);

            if (result.winner === 'cloud' && result.resolved) {
              if (idx === -1) {
                current.push(result.resolved);
              } else {
                current[idx] = result.resolved;
              }
              hasChanges = true;
            } else if (result.winner === 'tombstone') {
              if (idx !== -1) {
                current.splice(idx, 1);
                hasChanges = true;
              }
            }
          } else if (change.type === 'removed') {
            const idx = current.findIndex(w => w.id === id);
            if (idx !== -1 && !change.doc.metadata.hasPendingWrites) {
              current.splice(idx, 1);
              hasChanges = true;
            }
          }
        });
        if (hasChanges) setWorkouts(current);
      },
      (err) => {
        if (!isListenerValid()) return;
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/workouts`);
      }
    );

    const unsubLogs = subscribeLogs(
      user.uid,
      (changes) => {
        if (!isListenerValid()) return;
        let hasChanges = false;
        const current = { ...logsRef.current };
        const tombstones = getDeletedIdsTracker(user.uid).logs;
        changes.forEach(change => {
          const id = change.doc.id;
          const isTombstoned = tombstones.includes(id);
          if (change.type === 'added' || change.type === 'modified') {
            const cloudVal: SessionLog = sanitizeSessionLog({ ...change.doc.data(), id });
            const localL = current[id] || null;
            const result = resolveLocalCloudRecord(localL, cloudVal, isTombstoned);

            if (result.winner === 'cloud' && result.resolved) {
              current[id] = result.resolved;
              hasChanges = true;
            } else if (result.winner === 'tombstone') {
              if (current[id]) {
                delete current[id];
                hasChanges = true;
              }
            }
          } else if (change.type === 'removed') {
            if (current[id] && !change.doc.metadata.hasPendingWrites) {
              delete current[id];
              hasChanges = true;
            }
          }
        });
        if (hasChanges) setLogs(current);
      },
      (err) => {
        if (!isListenerValid()) return;
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/logs`);
      }
    );

    const unsubState = subscribeAppState(
      user.uid,
      (cloudState, hasPendingWrites) => {
        if (!isListenerValid()) return;
        if (!hasPendingWrites && cloudState) {
          const localState = appStateRef.current;
          const { merged } = mergeAppState(localState, cloudState);
          if (JSON.stringify(localState) !== JSON.stringify(merged)) {
            setAppState(merged);
          }
        }
      },
      (err) => {
        if (!isListenerValid()) return;
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    );

    const handleOnline = () => executeWithRetry();
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      if (unsubDefs) unsubDefs();
      if (unsubWorkouts) unsubWorkouts();
      if (unsubLogs) unsubLogs();
      if (unsubState) unsubState();
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, [user, syncDataBackground, exerciseDefsRef, workoutsRef, logsRef, appStateRef, setExerciseDefinitions, setWorkouts, setLogs, setAppState]);

  const retrySync = useCallback(() => {
    if (user) {
      syncDataBackground(user.uid).catch(() => {});
    }
  }, [user, syncDataBackground]);

  return useMemo(() => ({
    user,
    loading,
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    login,
    logout,
    retrySync
  }), [
    user,
    loading,
    syncStatus,
    syncError,
    login,
    logout,
    retrySync
  ]);
}
