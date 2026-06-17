import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { Workout, SessionLog, AppState, SetLog } from '../types/fitness';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { dk } from '../utils/fitnessHelpers';
import { auth, db, signInWithGoogle } from '../lib/firebase';
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
}

const FitnessContext = createContext<FitnessContextType | undefined>(undefined);

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
        const cleanLogs: Record<string, SessionLog> = {};
        const mockIds = ['push-a', 'pull-a', 'push-b', 'pull-b', 'hybrid-a', 'hybrid-b'];
        let hasMock = false;
        Object.entries(parsed).forEach(([dateStr, log]: [string, any]) => {
          if (mockIds.includes(log?.workoutId)) {
            hasMock = true;
          } else {
            cleanLogs[dateStr] = log;
          }
        });
        if (hasMock) {
          localStorage.setItem('gl_logs', JSON.stringify(cleanLogs));
          return cleanLogs;
        }
        return parsed;
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

  const getAutoBackups = (): AutoBackupEntry[] => {
    try {
      const saved = localStorage.getItem('gl_auto_backups');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  };

  const restoreAutoBackup = async (timestamp: string): Promise<{ success: boolean; message: string }> => {
    try {
      const backups = getAutoBackups();
      const match = backups.find(b => b.timestamp === timestamp);
      if (!match) {
        return { success: false, message: 'Could not find backup checkpoint matching timestamp' };
      }

      // Checkpoint overwrite
      localStorage.setItem('gl_workouts', JSON.stringify(match.workouts));
      localStorage.setItem('gl_logs', JSON.stringify(match.logs));
      localStorage.setItem('gl_state', JSON.stringify(match.appState));

      setWorkoutsState(match.workouts);
      setLogs(match.logs);
      setAppState(match.appState);

      // Save to cloud in background if user exists
      if (user) {
        await setDoc(doc(db, 'users', user.uid), match.appState, { merge: true });

        const workoutsCol = collection(db, 'users', user.uid, 'workouts');
        const workoutsBatch = writeBatch(db);
        match.workouts.forEach(wo => {
          workoutsBatch.set(doc(workoutsCol, wo.id), wo);
        });
        await workoutsBatch.commit();

        const logsCol = collection(db, 'users', user.uid, 'logs');
        const logEntries = Object.entries(match.logs);
        for (let i = 0; i < logEntries.length; i += 40) {
          const chunk = logEntries.slice(i, i + 40);
          const logsBatch = writeBatch(db);
          chunk.forEach(([id, val]) => {
            logsBatch.set(doc(logsCol, id), val);
          });
          await logsBatch.commit();
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
      pushAutoBackup(workouts, logs, appState, 'manual', 'Manual Vault Savepoint');
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

  // Firebase Auth & Background Sync Controller
  useEffect(() => {
    let unsubLogs: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        // App is already loaded instantly, so the UI is unblocked.
        // We now execute the smart bidirectional cloud sync completely in the background.
        setIsInitialized(true);
        setLoading(false);

        const syncDataBackground = async () => {
          try {
            const userDocRef = doc(db, 'users', u.uid);
            const workoutsColRef = collection(db, 'users', u.uid, 'workouts');
            const logsColRef = collection(db, 'users', u.uid, 'logs');

            // Download everything in parallel
            const [userDocSnap, workoutsSnap, logsSnap] = await Promise.all([
              getDoc(userDocRef),
              getDocs(workoutsColRef),
              getDocs(logsColRef)
            ]);

            let mergedWorkouts = [...workouts];
            let mergedLogs = { ...logs };
            let mergedState = { ...appState };

            // 1. App State Sync
            if (userDocSnap.exists()) {
              const data = userDocSnap.data() as AppState;
              if (data?.cycleStart) {
                mergedState = data;
              }
            } else {
              // Write initial local state config up to cloud
              await setDoc(userDocRef, appState);
            }

            // 2. Workouts Sync
            const cloudWorkoutsMap = new Map<string, Workout>();
            workoutsSnap.docs.forEach(doc => {
              cloudWorkoutsMap.set(doc.id, doc.data() as Workout);
            });

            // Local edits not in cloud: Upload
            const localToUpload = workouts.filter(w => !cloudWorkoutsMap.has(w.id));
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
            let workoutsChanged = false;
            workoutsSnap.docs.forEach(doc => {
              const cloudW = doc.data() as Workout;
              const hasIdx = mergedWorkouts.findIndex(w => w.id === cloudW.id);
              if (hasIdx === -1) {
                mergedWorkouts.push(cloudW);
                workoutsChanged = true;
              }
            });

            // 3. Training Logs Sync
            const cloudLogsMap = new Map<string, SessionLog>();
            logsSnap.docs.forEach(doc => {
              cloudLogsMap.set(doc.id, doc.data() as SessionLog);
            });

            // Local logs not in cloud: Upload in chunks
            const logsToUpload = Object.entries(logs).filter(([id]) => !cloudLogsMap.has(id));
            if (logsToUpload.length > 0) {
              for (let i = 0; i < logsToUpload.length; i += 40) {
                const chunk = logsToUpload.slice(i, i + 40);
                const batch = writeBatch(db);
                chunk.forEach(([id, l]) => {
                  batch.set(doc(logsColRef, id), l);
                });
                await batch.commit();
              }
            }

            // Cloud logs not in local: Pull
            let logsChanged = false;
            cloudLogsMap.forEach((cloudLog, logId) => {
              if (!mergedLogs[logId]) {
                mergedLogs[logId] = cloudLog;
                logsChanged = true;
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
              const liveLogs = { ...mergedLogs };
              let syncLogTick = false;
              span.docs.forEach(d => {
                const cloudVal = d.data() as SessionLog;
                if (JSON.stringify(liveLogs[d.id]) !== JSON.stringify(cloudVal)) {
                  liveLogs[d.id] = {
                    ...cloudVal,
                    sets: cloudVal.sets || {}
                  };
                  syncLogTick = true;
                }
              });

              if (syncLogTick) {
                setLogs(liveLogs);
                localStorage.setItem('gl_logs', JSON.stringify(liveLogs));
              }
            }, (error) => {
              handleFirestoreError(error, OperationType.LIST, `users/${u.uid}/logs`);
            });

          } catch (error) {
            console.error("Background loading / database sync catch error:", error);
          }
        };

        syncDataBackground();
      } else {
        // Logged out: clean subscription
        if (unsubLogs) {
          unsubLogs();
          unsubLogs = null;
        }
        setIsInitialized(true);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubLogs) unsubLogs();
    };
  }, []);

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

  const addLog = async (logId: string, log: SessionLog) => {
    try {
      const nextLogs = { ...logs, [logId]: log };
      setLogs(nextLogs);
      pushAutoBackup(workouts, nextLogs, appState, 'auto-session', `Logged routine: ${logId}`);

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
      const nextLogs = { ...logs };
      delete nextLogs[logId];
      setLogs(nextLogs);
      pushAutoBackup(workouts, nextLogs, appState, 'auto-edit', `Deleted log: ${logId}`);

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
      const nextWorkouts = typeof w === 'function' ? w(workouts) : w;
      setWorkoutsState(nextWorkouts);
      pushAutoBackup(nextWorkouts, logs, appState, 'auto-edit', 'Modified Routine Architecture');

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
      const nextState = { ...appState, cycleStart: date };
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

  const resetLogs = async () => {
    try {
      setLogs({});
      pushAutoBackup(workouts, {}, appState, 'auto-edit', 'Flushed all history logs');

      if (user) {
        const colRef = collection(db, 'users', user.uid, 'logs');
        const snap = await getDocs(colRef);
        const batch = writeBatch(db);
        snap.docs.forEach(d => {
          batch.delete(d.ref);
        });
        await batch.commit();
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
      const importedLogs = parsed.logs;
      const importedAppState = parsed.appState;

      if (!Array.isArray(importedWorkouts)) {
        return { success: false, message: 'Invalid backup: Missing or invalid workouts structure.' };
      }
      if (!importedLogs || typeof importedLogs !== 'object') {
        return { success: false, message: 'Invalid backup: Missing or invalid training logs.' };
      }

      // 1. Create automatic backup of current state BEFORE applying import, so users can undo imports instantly!
      pushAutoBackup(workouts, logs, appState, 'auto-edit', 'Injected data replacement backup');

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

      // 4. Overwrite cloud in background chunks if logged in
      if (user) {
        if (importedAppState && typeof importedAppState.cycleStart === 'string') {
          await setDoc(doc(db, 'users', user.uid), importedAppState, { merge: true });
        }

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
            logsBatch.set(doc(logsColRef, logId), logValue as SessionLog);
          }
          await logsBatch.commit();
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
      createManualBackup
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
