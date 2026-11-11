import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { auth, signInWithGoogle, onAuthStateChanged, getRedirectResult, User } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { authTransition, initialAuthState, AuthState } from '../state/sync/authMachine';
import { syncTransition, initialSyncPhase, SyncPhase, selectSyncStatus, selectSyncError } from '../state/sync/syncMachine';
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
  const [authState, dispatchAuth] = useReducer(authTransition, initialAuthState);
  const [syncPhase, dispatchSync] = useReducer(syncTransition, initialSyncPhase);
  const [user, setUser] = useState<User | null>(null);

  // Canonical derived state from state machines
  const loading = authState.status === 'initializing';
  const syncStatus = selectSyncStatus(syncPhase);
  const syncError = selectSyncError(syncPhase);

  const externalSetSyncStatusRef = useRef(externalSetSyncStatus);
  externalSetSyncStatusRef.current = externalSetSyncStatus;

  // Sync external status listener if provided
  useEffect(() => {
    externalSetSyncStatusRef.current?.(syncStatus);
  }, [syncStatus]);

  const isSyncingRef = useRef(false);
  const queuedSyncRef = useRef<{ uid: string; generation: number } | null>(null);
  const previousUidRef = useRef<string | null>(null);
  const currentUidRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);

  // Auth listener
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.warn("Auth redirect notice:", err?.message || err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      const prevUid = previousUidRef.current;
      const currentUid = u ? u.uid : null;
      currentUidRef.current = currentUid;

      if (u) {
        dispatchAuth({ type: 'AUTH_RESOLVED', user: { uid: u.uid, email: u.email } });
      } else {
        dispatchAuth({ type: 'AUTH_RESOLVED', user: null });
      }

      // Invalidate any in-flight syncs immediately on account change or logout
      if (prevUid !== currentUid) {
        dispatchSync({ type: 'ACCOUNT_CHANGED' });
        authGenerationRef.current += 1;
        isSyncingRef.current = false;
        queuedSyncRef.current = null;
      }

      // When switching accounts or logging out from an existing account, isolate data by resetting local state
      // This strictly prevents Account A's workout data or tombstones from being merged or uploaded into Account B
      if (prevUid && prevUid !== currentUid) {
        clearDeletedIdsTracker(prevUid);
        clearDeletedIdsTracker();
        if (resetToDefaultData) {
          await resetToDefaultData();
        }
      } else if (!prevUid && currentUid) {
        // First login: check if local state already has local/anonymous workouts/logs that shouldn't leak
        // Tombstones from anonymous mode are cleared to avoid purging the new account's cloud records
        clearDeletedIdsTracker();
      }
      previousUidRef.current = currentUid;
      setUser(u);
    });
    return unsubscribeAuth;
  }, [resetToDefaultData]);

  const login = useCallback(async () => {
    dispatchAuth({ type: 'LOGIN_REQUESTED' });
    try {
      await signInWithGoogle();
    } catch (e: any) {
      dispatchAuth({ type: 'LOGIN_FAILED', error: e?.message || String(e) });
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/not-configured') {
        console.warn("Sign-in notice:", e?.message || e);
      }
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      dispatchAuth({ type: 'LOGOUT_REQUESTED' });
      authGenerationRef.current += 1;
      isSyncingRef.current = false;
      queuedSyncRef.current = null;
      currentUidRef.current = null;
      dispatchSync({ type: 'RESET' });
      const currentUid = auth.currentUser?.uid || previousUidRef.current;
      await auth.signOut();
      dispatchAuth({ type: 'LOGOUT_COMPLETED' });
      clearDeletedIdsTracker(currentUid);
      clearDeletedIdsTracker();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  }, []);

  // Sync logic with guaranteed queued follow-up execution
  const syncDataBackground = useCallback(async (uid: string) => {
    // If auth generation changes or user has switched/logged out, do not start
    if (currentUidRef.current !== uid) {
      return;
    }
    const currentGen = authGenerationRef.current;

    if (isSyncingRef.current) {
      // Queue a follow-up sync specifically for this UID and generation
      queuedSyncRef.current = { uid, generation: currentGen };
      return;
    }
    isSyncingRef.current = true;
    dispatchSync({ type: 'SYNC_STARTED', uid, generation: currentGen, isInitial: false });

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
        dispatchSync({ type: 'SYNC_SUCCEEDED', uid, generation: currentGen, timestamp: Date.now() });
      }
    } catch (err: any) {
      if (isStale()) {
        // Stale sync error must never update current sync status or UI
        return;
      }
      console.error("Background sync error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        (err?.code === 'unavailable' || String(err?.message || '').toLowerCase().includes('offline'));
      dispatchSync({
        type: 'SYNC_FAILED',
        uid,
        generation: currentGen,
        error: isOffline
          ? "Operating in offline mode (local-first)."
          : (err?.message || "Cloud synchronization failed. Operating in offline mode."),
        isOffline
      });
      throw err;
    } finally {
      if (authGenerationRef.current === currentGen) {
        isSyncingRef.current = false;
        // Only the finishing sync whose generation is still current may drain the queue
        const queued = queuedSyncRef.current;
        if (queued && queued.generation === currentGen && queued.uid === currentUidRef.current) {
          queuedSyncRef.current = null;
          const nextUid = queued.uid;
          const nextGen = queued.generation;
          setTimeout(() => {
            if (authGenerationRef.current === nextGen && currentUidRef.current === nextUid) {
              syncDataBackground(nextUid).catch(() => {});
            }
          }, 50);
        }
      }
    }
  }, [exerciseDefsRef, workoutsRef, logsRef, appStateRef, setExerciseDefinitions, setWorkouts, setLogs, setAppState]);

  // Realtime Listeners
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let retryTimeoutId: any = null;

    const isListenerValid = () => isMounted && currentUidRef.current === user.uid;

    const executeWithRetry = async (retriesLeft = 3, delayMs = 2000, attempt = 1) => {
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
            dispatchSync({
              type: 'SYNC_FAILED',
              uid: user.uid,
              generation: authGenerationRef.current,
              error: "Working offline. Synchronization will resume when connection is restored.",
              isOffline: true
            });
          }
          return;
        }

        if (retriesLeft > 1 && isMounted) {
          const nextRetryAt = Date.now() + delayMs;
          dispatchSync({
            type: 'RETRY_SCHEDULED',
            uid: user.uid,
            attempt,
            nextRetryAt
          });
          retryTimeoutId = setTimeout(() => executeWithRetry(retriesLeft - 1, delayMs * 2, attempt + 1), delayMs);
        } else if (isListenerValid()) {
          dispatchSync({
            type: 'SYNC_FAILED',
            uid: user.uid,
            generation: authGenerationRef.current,
            error: "Cloud synchronization failed."
          });
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
    syncError,
    login,
    logout,
    retrySync,
    authState,
    syncPhase
  }), [
    user,
    loading,
    syncStatus,
    syncError,
    login,
    logout,
    retrySync,
    authState,
    syncPhase
  ]);
}
