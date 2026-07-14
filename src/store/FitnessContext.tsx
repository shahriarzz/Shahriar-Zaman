import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Workout, SessionLog, AppState, SetLog } from '../types/fitness';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { dk } from '../utils/fitnessHelpers';
import { 
  auth, 
  db, 
  signInWithGoogle,
  onAuthStateChanged, 
  getRedirectResult, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  onSnapshot,
  writeBatch
} from '../lib/firebase';
import type { User } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';

export interface AutoBackupEntry {
  timestamp: string;
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
  changeType: 'auto-session' | 'auto-edit' | 'manual';
  desc: string;
}

export interface FitnessContextType {
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
  user: User | null;
  loading: boolean;
  isInitialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'failed';
  syncError: string | null;
  addLog: (date: string, log: SessionLog) => Promise<void>;
  deleteLog: (date: string) => Promise<void>;
  setWorkouts: (w: Workout[] | ((prev: Workout[]) => Workout[])) => Promise<void>;
  updateCycleStart: (date: string) => Promise<void>;
  resetLogs: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  
  // Active/unfinished session tracking
  activeSession: { workoutId: string; startTime: number; sessionSets: Record<string, SetLog[]> } | null;
  startActiveSession: (workoutId: string, sets: Record<string, SetLog[]>, startTime?: number) => void;
  updateActiveSessionSets: (sets: Record<string, SetLog[]>) => void;
  clearActiveSession: () => void;

  // Resilient backup & restore protocols
  exportBackup: () => string;
  importBackup: (backupJson: string) => Promise<{ success: boolean; message: string }>;
  getAutoBackups: () => AutoBackupEntry[];
  restoreAutoBackup: (timestamp: string) => Promise<{ success: boolean; message: string }>;
  createManualBackup: () => Promise<{ success: boolean; message: string }>;
  logBodyWeight: (date: string, weight: number) => Promise<void>;
  deleteBodyWeight: (date: string) => Promise<void>;
}

const FitnessContext = createContext<FitnessContextType | undefined>(undefined);

const syncCloudDataWithRestored = async (
  uid: string,
  restoredWorkouts: Workout[],
  restoredLogs: Record<string, SessionLog>
) => {
  // 1. Query all current cloud workouts
  const workoutsColRef = collection(db, 'users', uid, 'workouts');
  const cloudWorkoutsSnap = await getDocs(workoutsColRef);
  const restoredWorkoutIds = new Set(restoredWorkouts.map(w => w.id));
  
  // Find orphans
  const orphanedWorkoutDocs = cloudWorkoutsSnap.docs.filter(d => !restoredWorkoutIds.has(d.id));
  if (orphanedWorkoutDocs.length > 0) {
    const batch = writeBatch(db);
    orphanedWorkoutDocs.forEach(d => {
      batch.delete(d.ref);
    });
    await batch.commit();
  }

  // 2. Query all current cloud logs
  const logsColRef = collection(db, 'users', uid, 'logs');
  const cloudLogsSnap = await getDocs(logsColRef);
  const restoredLogIds = new Set(Object.keys(restoredLogs));
  
  // Find orphans
  const orphanedLogDocs = cloudLogsSnap.docs.filter(d => !restoredLogIds.has(d.id));
  if (orphanedLogDocs.length > 0) {
    for (let i = 0; i < orphanedLogDocs.length; i += 40) {
      const chunk = orphanedLogDocs.slice(i, i + 40);
      const batch = writeBatch(db);
      chunk.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  }
};

const areLogsEqual = (a: SessionLog, b: SessionLog): boolean => {
  if (!a || !b) return false;
  if (a.workoutId !== b.workoutId) return false;
  if (a.date !== b.date) return false;
  if (a.complete !== b.complete) return false;
  if (a.durationMinutes !== b.durationMinutes) return false;

  const aSets = a.sets || {};
  const bSets = b.sets || {};
  const aKeys = Object.keys(aSets);
  const bKeys = Object.keys(bSets);
  if (aKeys.length !== bKeys.length) return false;

  for (const k of aKeys) {
    const aSetList = aSets[k] || [];
    const bSetList = bSets[k] || [];
    if (aSetList.length !== bSetList.length) return false;
    for (let i = 0; i < aSetList.length; i++) {
      const sA = aSetList[i];
      const sB = bSetList[i];
      if (sA.reps !== sB.reps || sA.weight !== sB.weight || !!sA.done !== !!sB.done) return false;
    }
  }
  return true;
};

export const FitnessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // Loaded instantly from cache to ensure 0ms UI load
  const [activeSession, setActiveSession] = useState<{ workoutId: string; startTime: number; sessionSets: Record<string, SetLog[]> } | null>(() => {
    try {
      const saved = localStorage.getItem('gl_active_session');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [workouts, setWorkoutsState] = useState<Workout[]>(() => {
    try {
      const savedWorkouts = localStorage.getItem('gl_workouts');
      if (savedWorkouts) {
        const parsed = JSON.parse(savedWorkouts);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Failed to load workouts from localStorage", e);
    }
    return INITIAL_WORKOUTS;
  });

  const [logs, setLogs] = useState<Record<string, SessionLog>>(() => {
    try {
      const savedLogs = localStorage.getItem('gl_logs');
      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        if (parsed && typeof parsed === 'object') {
          const sanitized: Record<string, SessionLog> = {};
          Object.entries(parsed).forEach(([id, logVal]: [string, any]) => {
            sanitized[id] = {
              ...logVal,
              durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
            };
          });
          return sanitized;
        }
      }
    } catch { }
    return {};
  });

  const [appState, setAppState] = useState<AppState>(() => {
    try {
      const savedState = localStorage.getItem('gl_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed && typeof parsed.cycleStart === 'string') {
          return parsed;
        }
      }
      return { cycleStart: dk() };
    } catch { return { cycleStart: dk() }; }
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  const workoutsRef = useRef(workouts);
  const logsRef = useRef(logs);
  const appStateRef = useRef(appState);

  useEffect(() => {
    workoutsRef.current = workouts;
  }, [workouts]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // Rolling Checkpoints Controller
  const pushAutoBackup = (w: Workout[], l: Record<string, SessionLog>, s: AppState, changeType: 'auto-session' | 'auto-edit' | 'manual', desc: string) => {
    try {
      const saved = localStorage.getItem('gl_auto_backups');
      let list: AutoBackupEntry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(list)) list = [];

      const entry: AutoBackupEntry = {
        timestamp: new Date().toISOString(),
        workouts: w,
        logs: l,
        appState: s,
        changeType,
        desc
      };

      list.unshift(entry);
      if (list.length > 8) {
        list = list.slice(0, 8);
      }
      localStorage.setItem('gl_auto_backups', JSON.stringify(list));
    } catch (e) {
      console.error("Failed to push checkpoint auto backup", e);
    }
  };

  const getAutoBackups = useCallback((): AutoBackupEntry[] => {
    try {
      const saved = localStorage.getItem('gl_auto_backups');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }, []);

  const restoreAutoBackup = async (timestamp: string): Promise<{ success: boolean; message: string }> => {
    try {
      const backups = getAutoBackups();
      const match = backups.find(b => b.timestamp === timestamp);
      if (!match) {
        return { success: false, message: 'Could not find backup checkpoint matching timestamp' };
      }

      // Checkpoint overwrite
      const sanitizedLogs: Record<string, SessionLog> = {};
      Object.entries(match.logs).forEach(([id, logVal]: [string, any]) => {
        sanitizedLogs[id] = {
          ...logVal,
          durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
        };
      });

      localStorage.setItem('gl_workouts', JSON.stringify(match.workouts));
      localStorage.setItem('gl_logs', JSON.stringify(sanitizedLogs));
      localStorage.setItem('gl_state', JSON.stringify(match.appState));

      setWorkoutsState(match.workouts);
      setLogs(sanitizedLogs);
      setAppState(match.appState);

      // Save to cloud in background if user exists
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid), match.appState, { merge: true });

          // Delete any cloud entries (workouts or logs) that are NOT present in the restored backup
          await syncCloudDataWithRestored(user.uid, match.workouts, sanitizedLogs);

          const workoutsCol = collection(db, 'users', user.uid, 'workouts');
          const workoutsBatch = writeBatch(db);
          match.workouts.forEach(wo => {
            workoutsBatch.set(doc(workoutsCol, wo.id), wo);
          });
          await workoutsBatch.commit();

          const logsCol = collection(db, 'users', user.uid, 'logs');
          const logEntries = Object.entries(sanitizedLogs);
          for (let i = 0; i < logEntries.length; i += 40) {
            const chunk = logEntries.slice(i, i + 40);
            const logsBatch = writeBatch(db);
            chunk.forEach(([id, val]) => {
              const { id: _, ...firebaseLog } = val as any;
              logsBatch.set(doc(logsCol, id), firebaseLog);
            });
            await logsBatch.commit();
          }
        } catch (cloudError: any) {
          console.error("Cloud synchronization failed during restore - cloud may be in partial state:", cloudError);
          return {
            success: true,
            message: `Restored locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. The cloud may be in a partially-migrated state. Please try restoring again to retry cloud sync.`
          };
        }
      }

      return { success: true, message: `Successfully restored database checkpoint: "${match.desc}"` };
    } catch (e: any) {
      console.error("Failed to restore checkpoint", e);
      return { success: false, message: `Failed to restore checkpoint: ${e.message || String(e)}` };
    }
  };

  const createManualBackup = async (): Promise<{ success: boolean; message: string }> => {
    try {
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Manual Vault Savepoint');
      return { success: true, message: 'Manual restore savepoint created successfully.' };
    } catch (e: any) {
      return { success: false, message: `Savepoint failed: ${e.message || String(e)}` };
    }
  };

  // Active Session hooks
  const startActiveSession = (workoutId: string, sets: Record<string, SetLog[]>, startTime = Date.now()) => {
    const session = { workoutId, startTime, sessionSets: sets };
    setActiveSession(session);
    try {
      localStorage.setItem('gl_active_session', JSON.stringify(session));
    } catch (e) {
      console.warn("localStorage write failed", e);
    }
  };

  const updateActiveSessionSets = (sets: Record<string, SetLog[]>) => {
    setActiveSession(prev => {
      if (!prev) return null;
      const updated = { ...prev, sessionSets: sets };
      try {
        localStorage.setItem('gl_active_session', JSON.stringify(updated));
      } catch (e) {
        console.warn("localStorage write failed", e);
      }
      return updated;
    });
  };

  const clearActiveSession = () => {
    setActiveSession(null);
    try {
      localStorage.removeItem('gl_active_session');
    } catch (e) {
      console.warn("localStorage remove failed", e);
    }
  };

  // Firebase Auth Controller
  useEffect(() => {
    getRedirectResult(auth).catch(console.error);

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsInitialized(true);
      setLoading(false);
    });
    return unsubscribeAuth;
  }, []);

  // Background Sync & Cloud Subscriptions Manager
  useEffect(() => {
    let unsubLogs: (() => void) | null = null;
    let unsubWorkouts: (() => void) | null = null;
    let unsubAppState: (() => void) | null = null;
    let isMounted = true;
    let retryTimeoutId: any = null;

    if (!user) {
      setSyncStatus('idle');
      setSyncError(null);
      return;
    }

    const syncDataBackground = async () => {
      const u = user;
      const userDocRef = doc(db, 'users', u.uid);
      const workoutsColRef = collection(db, 'users', u.uid, 'workouts');
      const logsColRef = collection(db, 'users', u.uid, 'logs');

      // Download completely in parallel
      const [userDocSnap, workoutsSnap, logsSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(workoutsColRef),
        getDocs(logsColRef)
      ]);

      let mergedWorkouts = [...workoutsRef.current];
      let mergedLogs = { ...logsRef.current };
      let mergedState = { ...appStateRef.current };

      // 1. App State Sync
      if (userDocSnap.exists()) {
        const data = userDocSnap.data() as AppState;
        if (data?.cycleStart) {
          mergedState = data;
        }
      } else {
        // Write initial local state config up to cloud
        await setDoc(userDocRef, appStateRef.current);
      }

      // 2. Workouts Sync
      const cloudWorkoutsMap = new Map<string, Workout>();
      workoutsSnap.docs.forEach(doc => {
        cloudWorkoutsMap.set(doc.id, doc.data() as Workout);
      });

      // Local edits not in cloud: Upload
      const localToUpload = workoutsRef.current.filter(w => !cloudWorkoutsMap.has(w.id));
      if (localToUpload.length > 0) {
        const batch = writeBatch(db);
        localToUpload.forEach(w => {
          batch.set(doc(workoutsColRef, w.id), {
            ...w,
            exercises: w.exercises || []
          });
        });
        await batch.commit();
      }

      // Cloud workouts not in local: Pull
      workoutsSnap.docs.forEach(doc => {
        const cloudW = doc.data() as Workout;
        const hasIdx = mergedWorkouts.findIndex(w => w.id === cloudW.id);
        if (hasIdx === -1) {
          mergedWorkouts.push(cloudW);
        }
      });

      // 3. Training Logs Sync
      const cloudLogsMap = new Map<string, SessionLog>();
      logsSnap.docs.forEach(doc => {
        const raw = doc.data() as any;
        const mappedLog: SessionLog = {
          id: doc.id,
          workoutId: raw.workoutId,
          date: raw.date,
          sets: raw.sets || {},
          complete: !!raw.complete,
          durationMinutes: Number(raw.durationMinutes !== undefined ? raw.durationMinutes : raw.duration) || 0
        };
        cloudLogsMap.set(doc.id, mappedLog);
      });

      // Local logs not in cloud: Upload in chunks
      const logsToUpload = Object.entries(logsRef.current).filter(([id]) => !cloudLogsMap.has(id));
      if (logsToUpload.length > 0) {
        for (let i = 0; i < logsToUpload.length; i += 40) {
          const chunk = logsToUpload.slice(i, i + 40);
          const batch = writeBatch(db);
          chunk.forEach(([id, l]) => {
            const { id: _, ...firebaseLog } = l as any;
            batch.set(doc(logsColRef, id), firebaseLog);
          });
          await batch.commit();
        }
      }

      // Cloud logs not in local: Pull
      cloudLogsMap.forEach((cloudLog, logId) => {
        if (!mergedLogs[logId]) {
          mergedLogs[logId] = cloudLog;
        }
      });

      // Apply merged states
      setWorkoutsState(mergedWorkouts);
      setLogs(mergedLogs);
      setAppState(mergedState);

      localStorage.setItem('gl_workouts', JSON.stringify(mergedWorkouts));
      localStorage.setItem('gl_logs', JSON.stringify(mergedLogs));
      localStorage.setItem('gl_state', JSON.stringify(mergedState));

      // Start reactive subscription for real-time multiplayer or cloud mutations
      unsubLogs = onSnapshot(logsColRef, (span) => {
        let hasChanges = false;
        setLogs(prev => {
          let updated = null;
          span.docChanges().forEach(change => {
            const id = change.doc.id;
            if (change.type === 'added' || change.type === 'modified') {
              const cloudValRaw = change.doc.data() as any;
              const cloudVal: SessionLog = {
                id,
                workoutId: cloudValRaw.workoutId,
                date: cloudValRaw.date,
                sets: cloudValRaw.sets || {},
                complete: !!cloudValRaw.complete,
                durationMinutes: Number(cloudValRaw.durationMinutes !== undefined ? cloudValRaw.durationMinutes : cloudValRaw.duration) || 0
              };
              const localVal = prev[id];
              if (!localVal || !areLogsEqual(localVal, cloudVal)) {
                if (!updated) updated = { ...prev };
                updated[id] = cloudVal;
                hasChanges = true;
              }
            } else if (change.type === 'removed') {
              if (prev[id]) {
                if (!updated) updated = { ...prev };
                delete updated[id];
                hasChanges = true;
              }
            }
          });

          if (hasChanges && updated) {
            try {
              localStorage.setItem('gl_logs', JSON.stringify(updated));
            } catch (e) {
              console.warn("localStorage write failed", e);
            }
            return updated;
          }
          return prev;
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${u.uid}/logs`);
      });

      unsubWorkouts = onSnapshot(workoutsColRef, (span) => {
        let hasChanges = false;
        setWorkoutsState(prev => {
          let updated = [...prev];
          span.docChanges().forEach(change => {
            const id = change.doc.id;
            if (change.type === 'added' || change.type === 'modified') {
              const cloudW = change.doc.data() as Workout;
              const idx = updated.findIndex(w => w.id === id);
              if (idx === -1) {
                updated.push(cloudW);
                hasChanges = true;
              } else {
                const localW = updated[idx];
                if (JSON.stringify(localW) !== JSON.stringify(cloudW)) {
                  updated[idx] = cloudW;
                  hasChanges = true;
                }
              }
            } else if (change.type === 'removed') {
              const idx = updated.findIndex(w => w.id === id);
              if (idx !== -1) {
                updated.splice(idx, 1);
                hasChanges = true;
              }
            }
          });

          if (hasChanges) {
            try {
              localStorage.setItem('gl_workouts', JSON.stringify(updated));
            } catch (e) {
              console.warn("localStorage write failed", e);
            }
            return updated;
          }
          return prev;
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${u.uid}/workouts`);
      });

      unsubAppState = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) {
          const cloudState = snap.data() as AppState;
          if (cloudState) {
            setAppState(prev => {
              if (JSON.stringify(prev) !== JSON.stringify(cloudState)) {
                try {
                  localStorage.setItem('gl_state', JSON.stringify(cloudState));
                } catch (e) {
                  console.warn("localStorage write failed", e);
                }
                return cloudState;
              }
              return prev;
            });
          }
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
      });
    };

    const executeSyncWithRetry = async (retriesLeft = 3, delayMs = 2000) => {
      if (!isMounted) return;
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        await syncDataBackground();
        if (isMounted) {
          setSyncStatus('synced');
        }
      } catch (error: any) {
        console.error(`Sync attempt failed (${4 - retriesLeft}/3):`, error);
        if (retriesLeft > 1 && isMounted) {
          retryTimeoutId = setTimeout(() => {
            executeSyncWithRetry(retriesLeft - 1, delayMs * 2);
          }, delayMs);
        } else if (isMounted) {
          setSyncStatus('failed');
          setSyncError(error?.message || "Cloud background synchronization failed. Will retry on next activity.");
        }
      }
    };

    executeSyncWithRetry();

    // Trigger instant background sync when network status changes to online
    const handleOnline = () => {
      console.log('Network signal restored: Initiating background cloud synchronization.');
      executeSyncWithRetry();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      if (unsubLogs) unsubLogs();
      if (unsubWorkouts) unsubWorkouts();
      if (unsubAppState) unsubAppState();
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, [user]);

  // Safe Debounced write-back for offline interactions
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem('gl_workouts', JSON.stringify(workouts));
      localStorage.setItem('gl_logs', JSON.stringify(logs));
      localStorage.setItem('gl_state', JSON.stringify(appState));
    } catch (e) {
      console.warn("localStorage quota warn", e);
    }
  }, [workouts, logs, appState, isInitialized]);

  const addLog = async (logId: string, logOriginal: SessionLog) => {
    const log: SessionLog = {
      id: logId,
      workoutId: logOriginal.workoutId,
      date: logOriginal.date,
      sets: logOriginal.sets || {},
      complete: !!logOriginal.complete,
      durationMinutes: Number(logOriginal.durationMinutes) || 0
    };
    try {
      const nextLogs = { ...logsRef.current, [logId]: log };
      setLogs(nextLogs);
      pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-session', `Logged routine: ${logId}`);

      if (user) {
        const path = `users/${user.uid}/logs/${logId}`;
        await setDoc(doc(db, path), log);
      }
    } catch (error) {
      console.error("Failed to append log", error);
      if (user) {
        const path = `users/${user.uid}/logs/${logId}`;
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  };

  const deleteLog = async (logId: string) => {
    try {
      const nextLogs = { ...logsRef.current };
      delete nextLogs[logId];
      setLogs(nextLogs);
      pushAutoBackup(workoutsRef.current, nextLogs, appStateRef.current, 'auto-edit', `Deleted log: ${logId}`);

      if (user) {
        const path = `users/${user.uid}/logs/${logId}`;
        await deleteDoc(doc(db, path));
      }
    } catch (error) {
      console.error("Failed to delete log", error);
      if (user) {
        const path = `users/${user.uid}/logs/${logId}`;
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  const setWorkouts = async (w: Workout[] | ((prev: Workout[]) => Workout[])) => {
    try {
      const currentWorkouts = workoutsRef.current;
      const nextWorkouts = typeof w === 'function' ? w(currentWorkouts) : w;
      setWorkoutsState(nextWorkouts);
      pushAutoBackup(nextWorkouts, logsRef.current, appStateRef.current, 'auto-edit', 'Modified Routine Architecture');

      if (user) {
        const colRef = collection(db, 'users', user.uid, 'workouts');
        const batch = writeBatch(db);
        for (const wo of nextWorkouts) {
          batch.set(doc(colRef, wo.id), wo);
        }
        await batch.commit();
      }
    } catch (error) {
      console.error("Failed to update workouts", error);
      if (user) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts`);
      }
    }
  };

  const updateCycleStart = async (date: string) => {
    try {
      const nextState = { ...appStateRef.current, cycleStart: date };
      setAppState(nextState);

      if (user) {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, path), { cycleStart: date }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to update cycle start", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const logBodyWeight = async (date: string, weight: number) => {
    try {
      const currentAppState = appStateRef.current;
      const nextState = { 
        ...currentAppState, 
        weightLog: { ...(currentAppState.weightLog || {}), [date]: weight }
      };
      setAppState(nextState);

      if (user) {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, path), { weightLog: nextState.weightLog }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to log body weight", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const deleteBodyWeight = async (date: string) => {
    try {
      const currentAppState = appStateRef.current;
      const nextLog = { ...(currentAppState.weightLog || {}) };
      delete nextLog[date];
      const nextState = { ...currentAppState, weightLog: nextLog };
      setAppState(nextState);

      if (user) {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, path), { weightLog: nextLog }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to delete body weight", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const resetLogs = async () => {
    try {
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Pre-Purge Auto Backup');
      setLogs({});

      if (user) {
        const colRef = collection(db, 'users', user.uid, 'logs');
        const snap = await getDocs(colRef);
        // Chunk deletions 40 at a time to prevent exceeding Firestore's 500 operation limit
        for (let i = 0; i < snap.docs.length; i += 40) {
          const chunk = snap.docs.slice(i, i + 40);
          const batch = writeBatch(db);
          chunk.forEach(d => {
            batch.delete(d.ref);
          });
          await batch.commit();
        }
      }
    } catch (error) {
      console.error("Failed to flush logs", error);
      if (user) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/logs`);
      }
    }
  };

  const login = async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error("Identity provider error:", e);
      throw e;
    }
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const exportBackup = (): string => {
    const backupObj = {
      version: 1,
      exportDate: new Date().toISOString(),
      workouts,
      logs,
      appState
    };
    return JSON.stringify(backupObj, null, 2);
  };

  const importBackup = async (backupJson: string): Promise<{ success: boolean; message: string }> => {
    try {
      const parsed = JSON.parse(backupJson);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, message: 'Invalid format: Parse failed.' };
      }

      const importedWorkouts = parsed.workouts;
      const rawLogs = parsed.logs;
      const importedAppState = parsed.appState;

      if (!Array.isArray(importedWorkouts)) {
        return { success: false, message: 'Invalid backup: Missing or invalid workouts structure.' };
      }
      if (!rawLogs || typeof rawLogs !== 'object') {
        return { success: false, message: 'Invalid backup: Missing or invalid training logs.' };
      }

      // Sanitize durationMinutes on imported logs
      const importedLogs: Record<string, SessionLog> = {};
      Object.entries(rawLogs).forEach(([id, logVal]: [string, any]) => {
        importedLogs[id] = {
          ...logVal,
          durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
        };
      });

      // 1. Create automatic backup of current state BEFORE applying import, so users can undo imports instantly!
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'auto-edit', 'Injected data replacement backup');

      // 2. Write to local storage immediately
      localStorage.setItem('gl_workouts', JSON.stringify(importedWorkouts));
      localStorage.setItem('gl_logs', JSON.stringify(importedLogs));
      if (importedAppState && typeof importedAppState.cycleStart === 'string') {
        localStorage.setItem('gl_state', JSON.stringify(importedAppState));
      }

      // 3. Update memory react states
      setWorkoutsState(importedWorkouts);
      setLogs(importedLogs);
      if (importedAppState && typeof importedAppState.cycleStart === 'string') {
        setAppState(importedAppState);
      }

      // 4. Overwrite cloud in background chunks if logged in with atomic/partial failure warnings
      if (user) {
        try {
          if (importedAppState && typeof importedAppState.cycleStart === 'string') {
            await setDoc(doc(db, 'users', user.uid), importedAppState, { merge: true });
          }

          // Delete any cloud entries (workouts or logs) that are NOT present in the restored backup
          await syncCloudDataWithRestored(user.uid, importedWorkouts, importedLogs);

          const workoutsColRef = collection(db, 'users', user.uid, 'workouts');
          const workoutsBatch = writeBatch(db);
          for (const wo of importedWorkouts) {
            workoutsBatch.set(doc(workoutsColRef, wo.id), {
              ...wo,
              exercises: wo.exercises || []
            });
          }
          await workoutsBatch.commit();

          const logsColRef = collection(db, 'users', user.uid, 'logs');
          const logEntries = Object.entries(importedLogs);
          for (let i = 0; i < logEntries.length; i += 40) {
            const chunk = logEntries.slice(i, i + 40);
            const logsBatch = writeBatch(db);
            for (const [logId, logValue] of chunk) {
              const { id: _, ...firebaseLog } = logValue as any;
              logsBatch.set(doc(logsColRef, logId), firebaseLog);
            }
            await logsBatch.commit();
          }
        } catch (cloudError: any) {
          console.error("Cloud synchronization failed during import - cloud may be in partial state:", cloudError);
          return {
            success: true,
            message: `Injected backup locally, but cloud synchronization failed: ${cloudError.message || String(cloudError)}. The cloud may be in a partially-migrated state. Please try importing again to retry cloud sync.`
          };
        }
      }

      return { success: true, message: 'Resilient backup restored and synced everywhere successfully.' };
    } catch (e: any) {
      console.error('Failed to import backup file', e);
      return { success: false, message: `Failed to restore: ${e.message || String(e)}` };
    }
  };

  return (
    <FitnessContext.Provider value={{
      workouts,
      logs,
      appState,
      user,
      loading,
      isInitialized,
      syncStatus,
      syncError,
      addLog,
      deleteLog,
      setWorkouts,
      updateCycleStart,
      resetLogs,
      login,
      logout,
      activeSession,
      startActiveSession,
      updateActiveSessionSets,
      clearActiveSession,
      exportBackup,
      importBackup,
      getAutoBackups,
      restoreAutoBackup,
      createManualBackup,
      logBodyWeight,
      deleteBodyWeight
    }}>
      {children}
    </FitnessContext.Provider>
  );
};

export const useFitness = () => {
  const context = useContext(FitnessContext);
  if (!context) throw new Error('useFitness must be used within a FitnessProvider');
  return context;
};
