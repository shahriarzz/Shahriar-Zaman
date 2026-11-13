import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { auth, signInWithGoogle, onAuthStateChanged, getRedirectResult, User } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { authTransition, initialAuthState, AuthState } from '../state/sync/authMachine';
import { syncTransition, initialSyncPhase, SyncPhase, selectSyncStatus, selectSyncError } from '../state/sync/syncMachine';
import { FitnessDatabaseSnapshot } from './useFitnessData';
import {
  sanitizeExerciseDefinition,
  sanitizeWorkout,
  sanitizeSessionLog
} from '../utils/fitnessCalculations';
import {
  getDeletedIdsTracker,
  removeDeletedId,
  clearDeletedIdsTracker,
  filterTombstonesExcludingSnapshot,
  resolveLocalCloudRecord,
  mergeDefinitions,
  mergeWorkouts,
  mergeLogs,
  mergeAppState
} from '../utils/fitnessSyncHelpers';
import {
  getPendingCloudReconciliationFromDb,
  PendingCloudReconciliation
} from '../utils/fitnessBackupDb';
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

export type AccountResetStatus = 'idle' | 'resetting' | 'failed';

interface UseFitnessSyncProps {
  exerciseDefsRef: React.MutableRefObject<ExerciseDefinition[]>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  setExerciseDefinitions: (defs: ExerciseDefinition[] | ((prev: ExerciseDefinition[]) => ExerciseDefinition[])) => void;
  setWorkouts: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => void;
  setLogs: (logs: Record<string, SessionLog> | ((prev: Record<string, SessionLog>) => Record<string, SessionLog>)) => void;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
  commitFitnessSnapshot?: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
  resetToDefaultData?: (prevUid?: string) => void | Promise<void>;
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
  commitFitnessSnapshot,
  resetToDefaultData,
  setSyncStatus: externalSetSyncStatus
}: UseFitnessSyncProps) {
  const [authState, dispatchAuth] = useReducer(authTransition, initialAuthState);
  const [syncPhase, dispatchSync] = useReducer(syncTransition, initialSyncPhase);
  const [user, setUser] = useState<User | null>(null);
  const [accountResetStatus, setAccountResetStatus] = useState<AccountResetStatus>('idle');
  const [accountResetError, setAccountResetError] = useState<string | null>(null);
  const [domainSyncOverride, setDomainSyncOverride] = useState<{ status: 'failed' | 'offline'; error: string | null } | null>(null);

  const loading = authState.status === 'initializing';
  const baseSyncStatus = selectSyncStatus(syncPhase);
  const baseSyncError = selectSyncError(syncPhase);
  const syncStatus = domainSyncOverride ? domainSyncOverride.status : baseSyncStatus;
  const syncError = domainSyncOverride ? domainSyncOverride.error : baseSyncError;

  const externalSetSyncStatusRef = useRef(externalSetSyncStatus);
  externalSetSyncStatusRef.current = externalSetSyncStatus;

  useEffect(() => {
    const mapped = syncStatus === 'offline' ? 'failed' : syncStatus;
    externalSetSyncStatusRef.current?.(mapped);
  }, [syncStatus]);

  const setDomainSyncStatus = useCallback((status: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline') => {
    if (status === 'failed' || status === 'offline') {
      setDomainSyncOverride(prev => ({ status, error: prev?.error ?? null }));
    } else {
      setDomainSyncOverride(null);
    }
  }, []);

  const setDomainSyncError = useCallback((err: string | null) => {
    if (err === null) {
      setDomainSyncOverride(null);
    } else {
      setDomainSyncOverride(prev => ({ status: prev?.status ?? 'failed', error: err }));
    }
  }, []);

  const isSyncingRef = useRef(false);
  const queuedSyncRef = useRef<{ uid: string; generation: number } | null>(null);
  const committedUidRef = useRef<string | null>(null);
  const currentUidRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);
  const authEventSeqRef = useRef(0);
  const resetFencedRef = useRef(false);
  const pendingAuthUserRef = useRef<User | null>(null);
  const pendingReconciliationRef = useRef<PendingCloudReconciliation | null>(null);

  const commitOrSet = useCallback((partial: Partial<FitnessDatabaseSnapshot>) => {
    if (commitFitnessSnapshot) {
      commitFitnessSnapshot(partial);
    } else {
      if (partial.exerciseDefinitions !== undefined) setExerciseDefinitions(partial.exerciseDefinitions);
      if (partial.workouts !== undefined) setWorkouts(partial.workouts);
      if (partial.logs !== undefined) setLogs(partial.logs);
      if (partial.appState !== undefined) setAppState(partial.appState);
    }
  }, [commitFitnessSnapshot, setExerciseDefinitions, setWorkouts, setLogs, setAppState]);

  const resetToDefaultDataRef = useRef(resetToDefaultData);
  resetToDefaultDataRef.current = resetToDefaultData;

  const publishResolvedAuthUser = useCallback((u: User | null) => {
    const nextUid = u ? u.uid : null;
    if (!committedUidRef.current && nextUid) {
      // Entering an authenticated account from anonymous mode: clear only anonymous tombstones
      clearDeletedIdsTracker();
    }
    committedUidRef.current = nextUid;
    currentUidRef.current = nextUid;
    resetFencedRef.current = false;
    pendingAuthUserRef.current = null;
    setAccountResetStatus('idle');
    setAccountResetError(null);
    if (u) {
      dispatchAuth({ type: 'AUTH_RESOLVED', user: { uid: u.uid, email: u.email } });
    } else {
      dispatchAuth({ type: 'AUTH_RESOLVED', user: null });
    }
    setUser(u);
  }, []);

  // Auth listener with strict sequence tokens and fenced error handling
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.warn("Auth redirect notice:", err?.message || err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      const eventSeq = ++authEventSeqRef.current;
      const nextUid = u ? u.uid : null;
      const prevCommittedUid = committedUidRef.current;
      const accountChanged = prevCommittedUid !== nextUid || resetFencedRef.current;

      if (accountChanged) {
        // Invalidate in-flight syncs immediately and fence old dataset from new user
        dispatchSync({ type: 'ACCOUNT_CHANGED' });
        setDomainSyncOverride(null);
        authGenerationRef.current += 1;
        isSyncingRef.current = false;
        queuedSyncRef.current = null;
        pendingReconciliationRef.current = null;
        currentUidRef.current = null;
      }

      const needsReset = Boolean((prevCommittedUid && prevCommittedUid !== nextUid) || resetFencedRef.current);

      if (needsReset && resetToDefaultDataRef.current) {
        // Fence React user until isolation reset succeeds
        resetFencedRef.current = true;
        pendingAuthUserRef.current = u;
        setUser(null);
        setAccountResetStatus('resetting');
        setAccountResetError(null);

        try {
          await resetToDefaultDataRef.current(prevCommittedUid ?? undefined);
        } catch (err: any) {
          if (authEventSeqRef.current !== eventSeq) {
            return;
          }
          const msg = err?.message || 'Failed to clear previous account local backups. Please retry.';
          resetFencedRef.current = true;
          currentUidRef.current = null;
          setUser(null);
          setAccountResetStatus('failed');
          setAccountResetError(msg);
          dispatchAuth({ type: 'LOGIN_FAILED', error: msg });
          return;
        }

        if (authEventSeqRef.current !== eventSeq) {
          // Superseded by a newer auth transition while reset was running
          return;
        }
      }

      if (authEventSeqRef.current !== eventSeq) {
        return;
      }

      publishResolvedAuthUser(u);
    });
    return unsubscribeAuth;
  }, [publishResolvedAuthUser]);

  const retryAccountReset = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const seq = ++authEventSeqRef.current;
    const targetUser = pendingAuthUserRef.current ?? auth.currentUser ?? null;
    const prevCommittedUid = committedUidRef.current;

    currentUidRef.current = null;
    setAccountResetStatus('resetting');
    setAccountResetError(null);

    try {
      if (resetToDefaultDataRef.current) {
        await resetToDefaultDataRef.current(prevCommittedUid ?? undefined);
      }
      if (authEventSeqRef.current !== seq) {
        return { success: false, error: 'Superseded by a newer authentication change.' };
      }
      publishResolvedAuthUser(targetUser);
      return { success: true };
    } catch (err: any) {
      if (authEventSeqRef.current !== seq) {
        return { success: false, error: 'Superseded by a newer authentication change.' };
      }
      const msg = err?.message || 'Account isolation retry failed.';
      resetFencedRef.current = true;
      currentUidRef.current = null;
      setUser(null);
      setAccountResetStatus('failed');
      setAccountResetError(msg);
      return { success: false, error: msg };
    }
  }, [publishResolvedAuthUser]);

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
      setDomainSyncOverride(null);
      dispatchSync({ type: 'RESET' });
      await auth.signOut();
      dispatchAuth({ type: 'LOGOUT_COMPLETED' });
    } catch (e) {
      console.error("Sign out error:", e);
    }
  }, []);

  // Keep cached pending reconciliation ref synced for active user
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (!uid) {
      pendingReconciliationRef.current = null;
      return;
    }
    let active = true;
    getPendingCloudReconciliationFromDb(uid)
      .then((rec) => {
        if (active && currentUidRef.current === uid) {
          pendingReconciliationRef.current = rec;
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // Sync logic with guaranteed queued follow-up execution
  const syncDataBackground = useCallback(async (uid: string) => {
    if (currentUidRef.current !== uid || resetFencedRef.current) {
      return;
    }
    const currentGen = authGenerationRef.current;

    if (isSyncingRef.current) {
      queuedSyncRef.current = { uid, generation: currentGen };
      return;
    }
    isSyncingRef.current = true;
    setDomainSyncOverride(null);
    dispatchSync({ type: 'SYNC_STARTED', uid, generation: currentGen, isInitial: false });

    const isStale = () => authGenerationRef.current !== currentGen || currentUidRef.current !== uid || resetFencedRef.current;

    try {
      // Load any pending cloud restore/import reconciliation for this UID so old tombstones
      // do not delete records belonging to the pending restored snapshot.
      let pendingReconciliation: PendingCloudReconciliation | null = null;
      try {
        pendingReconciliation = await getPendingCloudReconciliationFromDb(uid);
      } catch {
        pendingReconciliation = pendingReconciliationRef.current;
      }
      if (isStale()) return;
      pendingReconciliationRef.current = pendingReconciliation;

      // 0. Purge offline deleted items for this UID (excluding pending restored snapshot items)
      const rawDeletedTracker = getDeletedIdsTracker(uid);
      const deletedTracker = filterTombstonesExcludingSnapshot(
        rawDeletedTracker,
        pendingReconciliation?.snapshot
      );
      const purgedDefs = new Set<string>();
      const purgedWorkouts = new Set<string>();
      const purgedLogs = new Set<string>();

      if (deletedTracker.defs.length > 0) {
        for (const defId of [...deletedTracker.defs]) {
          if (isStale()) return;
          try {
            await deleteExerciseDefinition(uid, defId);
            purgedDefs.add(defId);
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
            purgedWorkouts.add(woId);
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
            purgedLogs.add(logId);
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

      // Re-read pending reconciliation & tombstones, excluding records in pending snapshot
      try {
        pendingReconciliation = await getPendingCloudReconciliationFromDb(uid);
      } catch {
        // retain prior pendingReconciliation
      }
      if (isStale()) return;
      pendingReconciliationRef.current = pendingReconciliation;

      const baseActiveTracker = filterTombstonesExcludingSnapshot(
        getDeletedIdsTracker(uid),
        pendingReconciliation?.snapshot
      );
      const activeTracker = {
        defs: Array.from(new Set([...baseActiveTracker.defs, ...purgedDefs])),
        workouts: Array.from(new Set([...baseActiveTracker.workouts, ...purgedWorkouts])),
        logs: Array.from(new Set([...baseActiveTracker.logs, ...purgedLogs]))
      };
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

      // Commit all synced state through canonical local persistence boundary
      commitOrSet({
        appState: mergedState,
        exerciseDefinitions: mergedDefs,
        workouts: mergedWorkouts,
        logs: mergedLogs
      });

      if (!isStale()) {
        dispatchSync({ type: 'SYNC_SUCCEEDED', uid, generation: currentGen, timestamp: Date.now() });
      }
    } catch (err: any) {
      if (isStale()) {
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
  }, [exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitOrSet]);

  // Realtime Listeners
  useEffect(() => {
    if (!user || resetFencedRef.current) return;

    let isMounted = true;
    let retryTimeoutId: any = null;

    const isListenerValid = () => isMounted && currentUidRef.current === user.uid && !resetFencedRef.current;

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
        const tombstones = filterTombstonesExcludingSnapshot(
          getDeletedIdsTracker(user.uid),
          pendingReconciliationRef.current?.snapshot
        ).defs;
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
        if (hasChanges) {
          try {
            commitOrSet({ exerciseDefinitions: current });
          } catch (err) {
            console.error("Failed persisting realtime exercise definitions:", err);
          }
        }
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
        const tombstones = filterTombstonesExcludingSnapshot(
          getDeletedIdsTracker(user.uid),
          pendingReconciliationRef.current?.snapshot
        ).workouts;
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
        if (hasChanges) {
          try {
            commitOrSet({ workouts: current });
          } catch (err) {
            console.error("Failed persisting realtime workouts:", err);
          }
        }
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
        const tombstones = filterTombstonesExcludingSnapshot(
          getDeletedIdsTracker(user.uid),
          pendingReconciliationRef.current?.snapshot
        ).logs;
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
        if (hasChanges) {
          try {
            commitOrSet({ logs: current });
          } catch (err) {
            console.error("Failed persisting realtime logs:", err);
          }
        }
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
            try {
              commitOrSet({ appState: merged });
            } catch (err) {
              console.error("Failed persisting realtime appState:", err);
            }
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
  }, [user, syncDataBackground, exerciseDefsRef, workoutsRef, logsRef, appStateRef, commitOrSet]);

  const retrySync = useCallback(() => {
    if (user && !resetFencedRef.current) {
      syncDataBackground(user.uid).catch(() => {});
    }
  }, [user, syncDataBackground]);

  return useMemo(() => ({
    user,
    loading,
    syncStatus,
    syncError,
    setSyncStatus: setDomainSyncStatus,
    setSyncError: setDomainSyncError,
    login,
    logout,
    retrySync,
    authState,
    syncPhase,
    accountResetStatus,
    accountResetError,
    retryAccountReset
  }), [
    user,
    loading,
    syncStatus,
    syncError,
    setDomainSyncStatus,
    setDomainSyncError,
    login,
    logout,
    retrySync,
    authState,
    syncPhase,
    accountResetStatus,
    accountResetError,
    retryAccountReset
  ]);
}
