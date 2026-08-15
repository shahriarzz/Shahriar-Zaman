import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { auth, signInWithGoogle, onAuthStateChanged, getRedirectResult, User } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { dk } from '../utils/fitnessHelpers';
import { 
  getDeletedIdsTracker, 
  removeDeletedId,
  clearDeletedIdsTracker, 
  areLogsEqual,
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
}

export function useFitnessSync({
  exerciseDefsRef,
  workoutsRef,
  logsRef,
  appStateRef,
  setExerciseDefinitions,
  setWorkouts,
  setLogs,
  setAppState
}: UseFitnessSyncProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  const isSyncingRef = useRef(false);

  // Auth listener
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.warn("Auth redirect notice:", err?.message || err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        setSyncStatus('idle');
        setSyncError(null);
      }
    });
    return unsubscribeAuth;
  }, []);

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
      await auth.signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  }, []);

  // Sync logic
  const syncDataBackground = useCallback(async (uid: string) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      // 0. Purge offline deleted items (failed deletions stay in queue for retry)
      const deletedTracker = getDeletedIdsTracker();
      if (deletedTracker.defs.length > 0) {
        for (const defId of [...deletedTracker.defs]) {
          try {
            await deleteExerciseDefinition(uid, defId);
            removeDeletedId('defs', defId);
          } catch (e) {
            console.warn(`Cloud deletion failed for def ${defId}, retaining in retry queue:`, e);
          }
        }
      }
      if (deletedTracker.workouts.length > 0) {
        for (const woId of [...deletedTracker.workouts]) {
          try {
            await deleteWorkout(uid, woId);
            removeDeletedId('workouts', woId);
          } catch (e) {
            console.warn(`Cloud deletion failed for workout ${woId}, retaining in retry queue:`, e);
          }
        }
      }
      if (deletedTracker.logs.length > 0) {
        for (const logId of [...deletedTracker.logs]) {
          try {
            await deleteLog(uid, logId);
            removeDeletedId('logs', logId);
          } catch (e) {
            console.warn(`Cloud deletion failed for log ${logId}, retaining in retry queue:`, e);
          }
        }
      }

      // Parallel download
      const [rawCloudDefs, rawCloudWorkouts, rawCloudLogs, cloudState] = await Promise.all([
        getExerciseDefinitions(uid),
        getWorkouts(uid),
        getLogs(uid),
        getAppState(uid)
      ]);

      // Filter cloud records against active tombstones to prevent resurrection
      const activeTracker = getDeletedIdsTracker();
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
        await saveAppState(uid, mergedState, true);
      }
      setAppState(mergedState);

      // 2. Deterministic Defs Sync
      const { merged: mergedDefs, toUpload: defsToUpload } = mergeDefinitions(
        exerciseDefsRef.current,
        rawCloudDefs,
        activeTracker.defs
      );
      if (defsToUpload.length > 0) {
        await saveExerciseDefinitionsBatch(uid, defsToUpload);
      }
      setExerciseDefinitions(mergedDefs);

      // 3. Deterministic Workouts Sync
      const { merged: mergedWorkouts, toUpload: workoutsToUpload } = mergeWorkouts(
        workoutsRef.current,
        rawCloudWorkouts,
        activeTracker.workouts
      );
      if (workoutsToUpload.length > 0) {
        await saveWorkoutsBatch(uid, workoutsToUpload);
      }
      setWorkouts(mergedWorkouts);

      // 4. Deterministic Logs Sync
      const { merged: mergedLogs, toUpload: logsToUpload } = mergeLogs(
        logsRef.current,
        rawCloudLogs || {},
        activeTracker.logs
      );
      if (Object.keys(logsToUpload).length > 0) {
        await saveLogsBatch(uid, logsToUpload);
      }
      setLogs(mergedLogs);

      setSyncStatus('synced');
    } catch (err: any) {
      console.error("Background sync error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      setSyncStatus('failed');
      setSyncError("Cloud synchronization failed. Operating in offline mode.");
    } finally {
      isSyncingRef.current = false;
    }
  }, [exerciseDefsRef, workoutsRef, logsRef, appStateRef, setExerciseDefinitions, setWorkouts, setLogs, setAppState]);

  // Realtime Listeners
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let retryTimeoutId: any = null;

    const executeWithRetry = async (retriesLeft = 3, delayMs = 2000) => {
      if (!isMounted) return;
      try {
        await syncDataBackground(user.uid);
      } catch (err: any) {
        const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || 
                          err?.code === 'unavailable' || 
                          (err?.message || '').toLowerCase().includes('offline');

        if (isOffline) {
          if (isMounted) {
            setSyncStatus('failed');
            setSyncError("Working offline. Synchronization will resume when connection is restored.");
          }
          return;
        }

        if (retriesLeft > 1 && isMounted) {
          retryTimeoutId = setTimeout(() => executeWithRetry(retriesLeft - 1, delayMs * 2), delayMs);
        } else if (isMounted) {
          setSyncStatus('failed');
          setSyncError("Cloud synchronization failed.");
        }
      }
    };

    executeWithRetry();

    const unsubDefs = subscribeExerciseDefinitions(
      user.uid,
      (changes) => {
        let hasChanges = false;
        const current = [...exerciseDefsRef.current];
        const tombstones = getDeletedIdsTracker().defs;
        changes.forEach(change => {
          const id = change.doc.id;
          const isTombstoned = tombstones.includes(id);
          if (change.type === 'added' || change.type === 'modified') {
            const cloudDef = change.doc.data() as ExerciseDefinition;
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
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/exerciseDefinitions`)
    );

    const unsubWorkouts = subscribeWorkouts(
      user.uid,
      (changes) => {
        let hasChanges = false;
        const current = [...workoutsRef.current];
        const tombstones = getDeletedIdsTracker().workouts;
        changes.forEach(change => {
          const id = change.doc.id;
          const isTombstoned = tombstones.includes(id);
          if (change.type === 'added' || change.type === 'modified') {
            const cloudW = change.doc.data() as Workout;
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
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/workouts`)
    );

    const unsubLogs = subscribeLogs(
      user.uid,
      (changes) => {
        let hasChanges = false;
        const current = { ...logsRef.current };
        const tombstones = getDeletedIdsTracker().logs;
        changes.forEach(change => {
          const id = change.doc.id;
          const isTombstoned = tombstones.includes(id);
          if (change.type === 'added' || change.type === 'modified') {
            const raw = change.doc.data() as any;
            const cloudVal: SessionLog = {
              id,
              workoutId: raw.workoutId,
              date: raw.date,
              sets: raw.sets || {},
              complete: !!raw.complete,
              durationMinutes: Number(raw.durationMinutes !== undefined ? raw.durationMinutes : raw.duration) || 0,
              updatedAt: Number(raw.updatedAt) || 0
            };
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
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/logs`)
    );

    const unsubState = subscribeAppState(
      user.uid,
      (cloudState, hasPendingWrites) => {
        if (!hasPendingWrites && cloudState) {
          const localState = appStateRef.current;
          const { merged } = mergeAppState(localState, cloudState);
          if (JSON.stringify(localState) !== JSON.stringify(merged)) {
            setAppState(merged);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
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
    if (user) syncDataBackground(user.uid);
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
