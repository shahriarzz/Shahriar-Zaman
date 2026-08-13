import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, signInWithGoogle, onAuthStateChanged, getRedirectResult, User } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { dk } from '../utils/fitnessHelpers';
import { 
  getDeletedIdsTracker, 
  clearDeletedIdsTracker, 
  areLogsEqual 
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
      // 0. Purge offline deleted items
      const deletedTracker = getDeletedIdsTracker();
      if (deletedTracker.defs.length > 0) {
        for (const defId of deletedTracker.defs) {
          try { await deleteExerciseDefinition(uid, defId); } catch (e) { console.warn(e); }
        }
      }
      if (deletedTracker.workouts.length > 0) {
        for (const woId of deletedTracker.workouts) {
          try { await deleteWorkout(uid, woId); } catch (e) { console.warn(e); }
        }
      }
      if (deletedTracker.logs.length > 0) {
        for (const logId of deletedTracker.logs) {
          try { await deleteLog(uid, logId); } catch (e) { console.warn(e); }
        }
      }
      clearDeletedIdsTracker();

      // Parallel download
      const [cloudDefs, cloudWorkouts, cloudLogs, cloudState] = await Promise.all([
        getExerciseDefinitions(uid),
        getWorkouts(uid),
        getLogs(uid),
        getAppState(uid)
      ]);

      // 1. App State Sync
      let mergedState = { ...appStateRef.current };
      if (cloudState) {
        mergedState = {
          cycleStart: appStateRef.current.cycleStart || cloudState.cycleStart || dk(),
          weightLog: { ...(cloudState.weightLog || {}), ...(appStateRef.current.weightLog || {}) }
        };
        await saveAppState(uid, mergedState, true);
      } else {
        await saveAppState(uid, appStateRef.current, true);
      }
      setAppState(mergedState);

      // 2. Defs Sync
      const cloudDefsMap = new Map<string, ExerciseDefinition>();
      cloudDefs.forEach(d => cloudDefsMap.set(d.id, d));

      const defsToUpload = exerciseDefsRef.current.filter(d => !cloudDefsMap.has(d.id) || JSON.stringify(cloudDefsMap.get(d.id)) !== JSON.stringify(d));
      if (defsToUpload.length > 0) {
        await saveExerciseDefinitionsBatch(uid, defsToUpload);
      }

      const mergedDefs = [...exerciseDefsRef.current];
      cloudDefs.forEach(d => {
        if (!mergedDefs.some(local => local.id === d.id)) {
          mergedDefs.push(d);
        }
      });
      setExerciseDefinitions(mergedDefs);

      // 3. Workouts Sync
      const cloudWorkoutsMap = new Map<string, Workout>();
      cloudWorkouts.forEach(w => cloudWorkoutsMap.set(w.id, w));

      const workoutsToUpload = workoutsRef.current.filter(w => !cloudWorkoutsMap.has(w.id) || JSON.stringify(cloudWorkoutsMap.get(w.id)) !== JSON.stringify(w));
      if (workoutsToUpload.length > 0) {
        await saveWorkoutsBatch(uid, workoutsToUpload);
      }

      const mergedWorkouts = [...workoutsRef.current];
      cloudWorkouts.forEach(w => {
        if (!mergedWorkouts.some(local => local.id === w.id)) {
          mergedWorkouts.push(w);
        }
      });
      setWorkouts(mergedWorkouts);

      // 4. Logs Sync
      const cloudLogsMap: Record<string, SessionLog> = cloudLogs || {};
      const logsToUploadEntries = Object.entries(logsRef.current).filter(([id, l]) => {
        const cloudL = cloudLogsMap[id];
        return !cloudL || !areLogsEqual(cloudL, l as SessionLog);
      });
      if (logsToUploadEntries.length > 0) {
        const logsMapToUpload: Record<string, SessionLog> = {};
        logsToUploadEntries.forEach(([id, l]) => logsMapToUpload[id] = l as SessionLog);
        await saveLogsBatch(uid, logsMapToUpload);
      }

      const mergedLogs: Record<string, SessionLog> = { ...logsRef.current, ...cloudLogsMap };
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
        changes.forEach(change => {
          const id = change.doc.id;
          if (change.type === 'added' || change.type === 'modified') {
            const cloudDef = change.doc.data() as ExerciseDefinition;
            const idx = current.findIndex(d => d.id === id);
            if (idx === -1) {
              current.push(cloudDef);
              hasChanges = true;
            } else if (!change.doc.metadata.hasPendingWrites && JSON.stringify(current[idx]) !== JSON.stringify(cloudDef)) {
              current[idx] = cloudDef;
              hasChanges = true;
            }
          } else if (change.type === 'removed') {
            const idx = current.findIndex(d => d.id === id);
            if (idx !== -1) {
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
        changes.forEach(change => {
          const id = change.doc.id;
          if (change.type === 'added' || change.type === 'modified') {
            const cloudW = change.doc.data() as Workout;
            const idx = current.findIndex(w => w.id === id);
            if (idx === -1) {
              current.push(cloudW);
              hasChanges = true;
            } else if (!change.doc.metadata.hasPendingWrites && JSON.stringify(current[idx]) !== JSON.stringify(cloudW)) {
              current[idx] = cloudW;
              hasChanges = true;
            }
          } else if (change.type === 'removed') {
            const idx = current.findIndex(w => w.id === id);
            if (idx !== -1) {
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
        changes.forEach(change => {
          const id = change.doc.id;
          if (change.type === 'added' || change.type === 'modified') {
            const raw = change.doc.data() as any;
            const cloudVal: SessionLog = {
              id,
              workoutId: raw.workoutId,
              date: raw.date,
              sets: raw.sets || {},
              complete: !!raw.complete,
              durationMinutes: Number(raw.durationMinutes !== undefined ? raw.durationMinutes : raw.duration) || 0
            };
            if (!current[id] || (!change.doc.metadata.hasPendingWrites && !areLogsEqual(current[id], cloudVal))) {
              current[id] = cloudVal;
              hasChanges = true;
            }
          } else if (change.type === 'removed') {
            if (current[id]) {
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
        if (!hasPendingWrites && cloudState && JSON.stringify(appStateRef.current) !== JSON.stringify(cloudState)) {
          setAppState(cloudState);
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

  return {
    user,
    loading,
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    login,
    logout,
    retrySync
  };
}
