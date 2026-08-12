import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Workout, SessionLog, AppState, SetLog, ExerciseDefinition, WorkoutExercise } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { dk, generateId } from '../utils/fitnessHelpers';
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
  exerciseDefinitions?: ExerciseDefinition[];
  changeType: 'auto-session' | 'auto-edit' | 'manual';
  desc: string;
}

export interface FitnessContextType {
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
  exerciseDefinitions: ExerciseDefinition[];
  user: User | null;
  loading: boolean;
  isInitialized: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'failed';
  syncError: string | null;

  // Exercise Definition actions
  addExerciseDefinition: (def: Omit<ExerciseDefinition, 'id'> & { id?: string }) => Promise<ExerciseDefinition>;
  updateExerciseDefinition: (def: ExerciseDefinition) => Promise<void>;
  deleteExerciseDefinition: (id: string) => Promise<void>;

  // Workout & Programming actions
  assignExerciseToWorkout: (workoutId: string, exerciseDefId: string, programming?: Partial<Omit<WorkoutExercise, 'exerciseDefinitionId'>>) => Promise<void>;
  removeExerciseFromWorkout: (workoutId: string, exerciseDefId: string) => Promise<void>;
  updateWorkoutExerciseProgramming: (workoutId: string, exerciseDefId: string, programming: Partial<WorkoutExercise>) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;

  // Core workout context methods
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

// Extract exercise definitions from workouts if migrating from legacy data
function extractExerciseDefinitionsFromWorkouts(
  rawWorkouts: any[],
  existingDefs?: ExerciseDefinition[]
): { defs: ExerciseDefinition[]; workouts: Workout[] } {
  const defMap = new Map<string, ExerciseDefinition>();
  const nameToIdMap = new Map<string, string>();

  // Pre-seed with INITIAL_EXERCISE_DEFINITIONS
  INITIAL_EXERCISE_DEFINITIONS.forEach(def => {
    defMap.set(def.id, { ...def });
    if (def.name) {
      nameToIdMap.set(def.name.trim().toLowerCase(), def.id);
    }
  });

  // Seed with existingDefs if provided
  if (Array.isArray(existingDefs)) {
    existingDefs.forEach(def => {
      defMap.set(def.id, { ...def });
      if (def.name) {
        nameToIdMap.set(def.name.trim().toLowerCase(), def.id);
      }
    });
  }

  const migratedWorkouts: Workout[] = (rawWorkouts || []).map(w => {
    const migratedExercises: WorkoutExercise[] = (w.exercises || []).map((ex: any) => {
      let defId = ex.exerciseDefinitionId || ex.exerciseId || ex.id;

      // If no explicit ID or if ID not in defMap, check if name matches an existing definition
      if (ex.name && (!defId || !defMap.has(defId))) {
        const lowerName = ex.name.trim().toLowerCase();
        if (nameToIdMap.has(lowerName)) {
          defId = nameToIdMap.get(lowerName)!;
        }
      }

      if (!defId) {
        defId = `ex-${generateId()}`;
      }

      if (!defMap.has(defId)) {
        const defName = ex.name?.trim() || 'Exercise';
        const newDef: ExerciseDefinition = {
          id: defId,
          name: defName,
          target: ex.target || 'General',
          equipment: ex.equipment || '',
          instructions: ex.instructions || '',
          tags: ex.tags || []
        };
        defMap.set(defId, newDef);
        nameToIdMap.set(defName.toLowerCase(), defId);
      }

      return {
        exerciseDefinitionId: defId,
        exerciseId: defId,
        sets: typeof ex.sets === 'number' ? ex.sets : 3,
        reps: ex.reps || '10–12',
        rest: ex.rest || '90s',
        note: ex.note || '',
        tags: Array.isArray(ex.tags) ? ex.tags : []
      };
    });

    return {
      ...w,
      exercises: migratedExercises
    };
  });

  return {
    defs: Array.from(defMap.values()),
    workouts: migratedWorkouts
  };
}

// Chunked batch operations helper to prevent Firestore 500-operation limits
async function commitBatchOperations<T>(
  items: T[],
  op: (batch: ReturnType<typeof writeBatch>, item: T) => void,
  chunkSize = 400
): Promise<void> {
  if (items.length === 0) return;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(item => op(batch, item));
    await batch.commit();
  }
}

// Tracker for offline deletions to prevent deleted items from resurrecting on reconnect
interface DeletedIdsTracker {
  defs: string[];
  workouts: string[];
  logs: string[];
}

function getDeletedIdsTracker(): DeletedIdsTracker {
  try {
    const saved = localStorage.getItem('gl_deleted_ids');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        defs: Array.isArray(parsed.defs) ? parsed.defs : [],
        workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      };
    }
  } catch {}
  return { defs: [], workouts: [], logs: [] };
}

function saveDeletedIdsTracker(tracker: DeletedIdsTracker): void {
  try {
    localStorage.setItem('gl_deleted_ids', JSON.stringify(tracker));
  } catch (e) {
    console.warn("Failed to save deleted ids tracker", e);
  }
}

function trackDeletedId(type: 'defs' | 'workouts' | 'logs', id: string): void {
  const tracker = getDeletedIdsTracker();
  if (!tracker[type].includes(id)) {
    tracker[type].push(id);
    saveDeletedIdsTracker(tracker);
  }
}

function clearDeletedIdsTracker(): void {
  try {
    localStorage.removeItem('gl_deleted_ids');
  } catch {}
}

const syncCloudDataWithRestored = async (
  uid: string,
  restoredDefs: ExerciseDefinition[],
  restoredWorkouts: Workout[],
  restoredLogs: Record<string, SessionLog>
) => {
  // 1. Query current cloud exercise definitions & purge orphans
  const defsColRef = collection(db, 'users', uid, 'exerciseDefinitions');
  const cloudDefsSnap = await getDocs(defsColRef);
  const restoredDefIds = new Set(restoredDefs.map(d => d.id));
  const orphanedDefDocs = cloudDefsSnap.docs.filter(d => !restoredDefIds.has(d.id));
  await commitBatchOperations(orphanedDefDocs, (batch, docSnap) => {
    batch.delete(docSnap.ref);
  });

  // 2. Query all current cloud workouts & purge orphans
  const workoutsColRef = collection(db, 'users', uid, 'workouts');
  const cloudWorkoutsSnap = await getDocs(workoutsColRef);
  const restoredWorkoutIds = new Set(restoredWorkouts.map(w => w.id));
  const orphanedWorkoutDocs = cloudWorkoutsSnap.docs.filter(d => !restoredWorkoutIds.has(d.id));
  await commitBatchOperations(orphanedWorkoutDocs, (batch, docSnap) => {
    batch.delete(docSnap.ref);
  });

  // 3. Query all current cloud logs & purge orphans
  const logsColRef = collection(db, 'users', uid, 'logs');
  const cloudLogsSnap = await getDocs(logsColRef);
  const restoredLogIds = new Set(Object.keys(restoredLogs));
  const orphanedLogDocs = cloudLogsSnap.docs.filter(d => !restoredLogIds.has(d.id));
  await commitBatchOperations(orphanedLogDocs, (batch, docSnap) => {
    batch.delete(docSnap.ref);
  });
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

function loadInitialFitnessData(): {
  defs: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
} {
  let savedDefs: ExerciseDefinition[] | null = null;
  try {
    const raw = localStorage.getItem('gl_exercise_definitions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) savedDefs = parsed;
    }
  } catch (e) {
    console.error("Failed to parse gl_exercise_definitions", e);
  }

  let rawWorkouts: any[] | null = null;
  try {
    const raw = localStorage.getItem('gl_workouts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) rawWorkouts = parsed;
    }
  } catch (e) {
    console.error("Failed to parse gl_workouts", e);
  }

  const { defs: finalDefs, workouts: migratedWorkouts } = extractExerciseDefinitionsFromWorkouts(
    rawWorkouts || INITIAL_WORKOUTS,
    savedDefs || undefined
  );

  try {
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(finalDefs));
    localStorage.setItem('gl_workouts', JSON.stringify(migratedWorkouts));
  } catch (e) {
    console.warn("Failed to set initial localStorage state", e);
  }

  let logs: Record<string, SessionLog> = {};
  try {
    const raw = localStorage.getItem('gl_logs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([id, logVal]: [string, any]) => {
          logs[id] = {
            ...logVal,
            durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
          };
        });
      }
    }
  } catch {}

  let appState: AppState = { cycleStart: dk() };
  try {
    const raw = localStorage.getItem('gl_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.cycleStart === 'string') {
        appState = parsed;
      }
    }
  } catch {}

  return {
    defs: finalDefs,
    workouts: migratedWorkouts,
    logs,
    appState
  };
}

export const FitnessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialData] = useState(() => loadInitialFitnessData());

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

  const [exerciseDefinitions, setExerciseDefinitionsState] = useState<ExerciseDefinition[]>(initialData.defs);
  const [workouts, setWorkoutsState] = useState<Workout[]>(initialData.workouts);
  const [logs, setLogs] = useState<Record<string, SessionLog>>(initialData.logs);
  const [appState, setAppState] = useState<AppState>(initialData.appState);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  const exerciseDefsRef = useRef(exerciseDefinitions);
  const workoutsRef = useRef(workouts);
  const logsRef = useRef(logs);
  const appStateRef = useRef(appState);

  useEffect(() => {
    exerciseDefsRef.current = exerciseDefinitions;
  }, [exerciseDefinitions]);

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
  const pushAutoBackup = (
    w: Workout[], 
    l: Record<string, SessionLog>, 
    s: AppState, 
    changeType: 'auto-session' | 'auto-edit' | 'manual', 
    desc: string,
    defs?: ExerciseDefinition[]
  ) => {
    try {
      const saved = localStorage.getItem('gl_auto_backups');
      let list: AutoBackupEntry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(list)) list = [];

      const entry: AutoBackupEntry = {
        timestamp: new Date().toISOString(),
        workouts: w,
        logs: l,
        appState: s,
        exerciseDefinitions: defs || exerciseDefsRef.current,
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

      const restoredDefs = match.exerciseDefinitions || INITIAL_EXERCISE_DEFINITIONS;

      // Checkpoint overwrite
      const sanitizedLogs: Record<string, SessionLog> = {};
      Object.entries(match.logs).forEach(([id, logVal]: [string, any]) => {
        sanitizedLogs[id] = {
          ...logVal,
          durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
        };
      });

      clearDeletedIdsTracker();

      localStorage.setItem('gl_exercise_definitions', JSON.stringify(restoredDefs));
      localStorage.setItem('gl_workouts', JSON.stringify(match.workouts));
      localStorage.setItem('gl_logs', JSON.stringify(sanitizedLogs));
      localStorage.setItem('gl_state', JSON.stringify(match.appState));

      exerciseDefsRef.current = restoredDefs;
      workoutsRef.current = match.workouts;
      logsRef.current = sanitizedLogs;
      appStateRef.current = match.appState;

      setExerciseDefinitionsState(restoredDefs);
      setWorkoutsState(match.workouts);
      setLogs(sanitizedLogs);
      setAppState(match.appState);

      // Save to cloud in background if user exists
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid), match.appState, { merge: true });

          // Delete cloud orphans
          await syncCloudDataWithRestored(user.uid, restoredDefs, match.workouts, sanitizedLogs);

          // Upload restored defs in chunked batches
          const defsCol = collection(db, 'users', user.uid, 'exerciseDefinitions');
          await commitBatchOperations<ExerciseDefinition>(restoredDefs, (batch, d) => {
            batch.set(doc(defsCol, d.id), d);
          });

          // Upload restored workouts in chunked batches
          const workoutsCol = collection(db, 'users', user.uid, 'workouts');
          await commitBatchOperations<Workout>(match.workouts, (batch, wo) => {
            batch.set(doc(workoutsCol, wo.id), { ...wo, exercises: wo.exercises || [] });
          });

          // Upload restored logs in chunked batches
          const logsCol = collection(db, 'users', user.uid, 'logs');
          const logEntries = Object.entries(sanitizedLogs);
          await commitBatchOperations(logEntries, (batch, [id, val]) => {
            const { id: _, ...firebaseLog } = val as any;
            batch.set(doc(logsCol, id), firebaseLog);
          });
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
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Manual Vault Savepoint', exerciseDefsRef.current);
      return { success: true, message: 'Manual restore savepoint created successfully.' };
    } catch (e: any) {
      return { success: false, message: `Savepoint failed: ${e.message || String(e)}` };
    }
  };

  // Exercise Definition Actions
  const addExerciseDefinition = useCallback(async (defData: Omit<ExerciseDefinition, 'id'> & { id?: string }): Promise<ExerciseDefinition> => {
    const id = defData.id || `ex-${generateId()}`;
    const newDef: ExerciseDefinition = {
      id,
      name: defData.name.trim(),
      target: defData.target.trim() || 'General',
      equipment: defData.equipment?.trim() || '',
      instructions: defData.instructions?.trim() || '',
      tags: defData.tags || []
    };

    const currentDefs = exerciseDefsRef.current;
    const existingIdx = currentDefs.findIndex(d => d.id === id);
    let nextDefs: ExerciseDefinition[];
    if (existingIdx !== -1) {
      nextDefs = [...currentDefs];
      nextDefs[existingIdx] = newDef;
    } else {
      nextDefs = [...currentDefs, newDef];
    }

    try {
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(nextDefs));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    exerciseDefsRef.current = nextDefs;
    setExerciseDefinitionsState(nextDefs);

    if (user) {
      try {
        const path = `users/${user.uid}/exerciseDefinitions/${id}`;
        await setDoc(doc(db, path), newDef);
      } catch (e) {
        console.error("Failed to add exercise definition to cloud", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/exerciseDefinitions/${id}`);
        setSyncStatus('failed');
        setSyncError("Saved exercise definition locally, but cloud sync failed.");
      }
    }

    return newDef;
  }, [user]);

  const updateExerciseDefinition = useCallback(async (def: ExerciseDefinition): Promise<void> => {
    const currentDefs = exerciseDefsRef.current;
    const nextDefs = currentDefs.map(d => d.id === def.id ? def : d);

    exerciseDefsRef.current = nextDefs;
    setExerciseDefinitionsState(nextDefs);
    try {
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(nextDefs));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    if (user) {
      try {
        const path = `users/${user.uid}/exerciseDefinitions/${def.id}`;
        await setDoc(doc(db, path), def);
      } catch (e) {
        console.error("Failed to update exercise definition in cloud", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/exerciseDefinitions/${def.id}`);
        setSyncStatus('failed');
        setSyncError("Updated exercise definition locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const deleteExerciseDefinition = useCallback(async (id: string): Promise<void> => {
    const currentDefs = exerciseDefsRef.current;
    const nextDefs = currentDefs.filter(d => d.id !== id);

    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => ({
      ...w,
      exercises: (w.exercises || []).filter(e => (e.exerciseDefinitionId || e.exerciseId) !== id)
    }));

    trackDeletedId('defs', id);

    exerciseDefsRef.current = nextDefs;
    workoutsRef.current = nextWorkouts;

    setExerciseDefinitionsState(nextDefs);
    setWorkoutsState(nextWorkouts);

    try {
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(nextDefs));
      localStorage.setItem('gl_workouts', JSON.stringify(nextWorkouts));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    pushAutoBackup(nextWorkouts, logsRef.current, appStateRef.current, 'auto-edit', `Deleted exercise definition: ${id}`, nextDefs);

    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/exerciseDefinitions/${id}`));
        const colRef = collection(db, 'users', user.uid, 'workouts');
        await commitBatchOperations<Workout>(nextWorkouts, (batch, wo) => {
          batch.set(doc(colRef, wo.id), wo);
        });
      } catch (e) {
        console.error("Failed to sync deletions to cloud", e);
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/exerciseDefinitions/${id}`);
        setSyncStatus('failed');
        setSyncError("Deleted exercise definition locally, but cloud sync failed.");
      }
    }
  }, [user]);

  // Workout Exercises Actions
  const assignExerciseToWorkout = useCallback(async (
    workoutId: string, 
    exerciseDefId: string, 
    programming?: Partial<Omit<WorkoutExercise, 'exerciseDefinitionId'>>
  ) => {
    const currentWorkouts = workoutsRef.current;
    const targetW = currentWorkouts.find(w => w.id === workoutId);
    if (!targetW) return;

    // Prevent duplicate assignment
    const exists = (targetW.exercises || []).some(
      e => (e.exerciseDefinitionId || e.exerciseId) === exerciseDefId
    );
    if (exists) return;

    const newExEntry: WorkoutExercise = {
      exerciseDefinitionId: exerciseDefId,
      exerciseId: exerciseDefId,
      sets: programming?.sets ?? 3,
      reps: programming?.reps ?? '10–12',
      rest: programming?.rest ?? '90s',
      note: programming?.note ?? '',
      tags: programming?.tags ?? []
    };

    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: [...(w.exercises || []), newExEntry]
        };
      }
      return w;
    });

    try {
      localStorage.setItem('gl_workouts', JSON.stringify(nextWorkouts));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    workoutsRef.current = nextWorkouts;
    setWorkoutsState(nextWorkouts);

    if (user) {
      const updatedW = nextWorkouts.find(w => w.id === workoutId);
      if (updatedW) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'workouts', workoutId), updatedW);
        } catch (e) {
          console.error("Failed to sync assigned exercise to cloud", e);
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workouts/${workoutId}`);
          setSyncStatus('failed');
          setSyncError("Assigned exercise locally, but cloud sync failed.");
        }
      }
    }
  }, [user]);

  const removeExerciseFromWorkout = useCallback(async (workoutId: string, exerciseDefId: string) => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: (w.exercises || []).filter(e => (e.exerciseDefinitionId || e.exerciseId) !== exerciseDefId)
        };
      }
      return w;
    });

    workoutsRef.current = nextWorkouts;
    setWorkoutsState(nextWorkouts);
    try {
      localStorage.setItem('gl_workouts', JSON.stringify(nextWorkouts));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    if (user) {
      const updatedW = nextWorkouts.find(w => w.id === workoutId);
      if (updatedW) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'workouts', workoutId), updatedW);
        } catch (e) {
          console.error("Failed to sync removed exercise to cloud", e);
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workouts/${workoutId}`);
          setSyncStatus('failed');
          setSyncError("Removed exercise locally, but cloud sync failed.");
        }
      }
    }
  }, [user]);

  const updateWorkoutExerciseProgramming = useCallback(async (
    workoutId: string, 
    exerciseDefId: string, 
    programming: Partial<WorkoutExercise>
  ) => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: (w.exercises || []).map(e => {
            if ((e.exerciseDefinitionId || e.exerciseId) === exerciseDefId) {
              return {
                ...e,
                ...programming,
                exerciseDefinitionId: exerciseDefId,
                exerciseId: exerciseDefId
              };
            }
            return e;
          })
        };
      }
      return w;
    });

    workoutsRef.current = nextWorkouts;
    setWorkoutsState(nextWorkouts);
    try {
      localStorage.setItem('gl_workouts', JSON.stringify(nextWorkouts));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    if (user) {
      const updatedW = nextWorkouts.find(w => w.id === workoutId);
      if (updatedW) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'workouts', workoutId), updatedW);
        } catch (e) {
          console.error("Failed to sync updated programming to cloud", e);
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workouts/${workoutId}`);
          setSyncStatus('failed');
          setSyncError("Updated programming locally, but cloud sync failed.");
        }
      }
    }
  }, [user]);

  const deleteWorkout = useCallback(async (workoutId: string) => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.filter(w => w.id !== workoutId);

    trackDeletedId('workouts', workoutId);

    workoutsRef.current = nextWorkouts;
    setWorkoutsState(nextWorkouts);
    try {
      localStorage.setItem('gl_workouts', JSON.stringify(nextWorkouts));
    } catch (e) {
      console.warn("localStorage write warn", e);
    }

    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'workouts', workoutId));
      } catch (e) {
        console.error("Failed to delete workout from cloud", e);
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/workouts/${workoutId}`);
        setSyncStatus('failed');
        setSyncError("Deleted workout locally, but cloud sync failed.");
      }
    }
  }, [user]);

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
    getRedirectResult(auth).catch((err) => {
      console.warn("Auth redirect notice:", err?.message || err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsInitialized(true);
      setLoading(false);
    });
    return unsubscribeAuth;
  }, []);

  // Background Sync & Cloud Subscriptions Manager
  useEffect(() => {
    let unsubDefs: (() => void) | null = null;
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
      const defsColRef = collection(db, 'users', u.uid, 'exerciseDefinitions');
      const workoutsColRef = collection(db, 'users', u.uid, 'workouts');
      const logsColRef = collection(db, 'users', u.uid, 'logs');

      // 0. Purge locally deleted items from cloud first
      const deletedIds = getDeletedIdsTracker();
      if (deletedIds.defs.length > 0) {
        await commitBatchOperations(deletedIds.defs, (batch, id) => {
          batch.delete(doc(defsColRef, id));
        });
      }
      if (deletedIds.workouts.length > 0) {
        await commitBatchOperations(deletedIds.workouts, (batch, id) => {
          batch.delete(doc(workoutsColRef, id));
        });
      }
      if (deletedIds.logs.length > 0) {
        await commitBatchOperations(deletedIds.logs, (batch, id) => {
          batch.delete(doc(logsColRef, id));
        });
      }
      clearDeletedIdsTracker();

      // Download completely in parallel
      const [userDocSnap, defsSnap, workoutsSnap, logsSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(defsColRef),
        getDocs(workoutsColRef),
        getDocs(logsColRef)
      ]);

      let mergedDefs = [...exerciseDefsRef.current];
      let mergedWorkouts = [...workoutsRef.current];
      let mergedLogs = { ...logsRef.current };
      let mergedState = { ...appStateRef.current };

      // 1. App State Sync
      if (userDocSnap.exists()) {
        const data = userDocSnap.data() as AppState;
        mergedState = {
          cycleStart: appStateRef.current.cycleStart || data.cycleStart || dk(),
          weightLog: { ...(data.weightLog || {}), ...(appStateRef.current.weightLog || {}) }
        };
        await setDoc(userDocRef, mergedState, { merge: true });
      } else {
        await setDoc(userDocRef, appStateRef.current);
      }

      // 2. Exercise Definitions Sync
      const cloudDefsMap = new Map<string, ExerciseDefinition>();
      defsSnap.docs.forEach(d => {
        cloudDefsMap.set(d.id, d.data() as ExerciseDefinition);
      });

      // Upload local defs missing or changed in cloud
      const defsToUpload = exerciseDefsRef.current.filter(d => !cloudDefsMap.has(d.id) || JSON.stringify(cloudDefsMap.get(d.id)) !== JSON.stringify(d));
      if (defsToUpload.length > 0) {
        await commitBatchOperations<ExerciseDefinition>(defsToUpload, (batch, d) => {
          batch.set(doc(defsColRef, d.id), d);
        });
      }

      // Pull cloud defs missing in local
      defsSnap.docs.forEach(d => {
        const cloudDef = d.data() as ExerciseDefinition;
        const idx = mergedDefs.findIndex(def => def.id === cloudDef.id);
        if (idx === -1) {
          mergedDefs.push(cloudDef);
        }
      });

      // 3. Workouts Sync
      const cloudWorkoutsMap = new Map<string, Workout>();
      workoutsSnap.docs.forEach(d => {
        cloudWorkoutsMap.set(d.id, d.data() as Workout);
      });

      const workoutsToUpload = workoutsRef.current.filter(w => !cloudWorkoutsMap.has(w.id) || JSON.stringify(cloudWorkoutsMap.get(w.id)) !== JSON.stringify(w));
      if (workoutsToUpload.length > 0) {
        await commitBatchOperations<Workout>(workoutsToUpload, (batch, w) => {
          batch.set(doc(workoutsColRef, w.id), {
            ...w,
            exercises: w.exercises || []
          });
        });
      }

      workoutsSnap.docs.forEach(d => {
        const cloudW = d.data() as Workout;
        const idx = mergedWorkouts.findIndex(w => w.id === cloudW.id);
        if (idx === -1) {
          mergedWorkouts.push(cloudW);
        }
      });

      // 4. Training Logs Sync
      const cloudLogsMap = new Map<string, SessionLog>();
      logsSnap.docs.forEach(d => {
        const raw = d.data() as any;
        const mappedLog: SessionLog = {
          id: d.id,
          workoutId: raw.workoutId,
          date: raw.date,
          sets: raw.sets || {},
          complete: !!raw.complete,
          durationMinutes: Number(raw.durationMinutes !== undefined ? raw.durationMinutes : raw.duration) || 0
        };
        cloudLogsMap.set(d.id, mappedLog);
      });

      const logsToUpload = Object.entries(logsRef.current).filter(([id, l]) => {
        const cloudL = cloudLogsMap.get(id);
        return !cloudL || !areLogsEqual(cloudL, l as SessionLog);
      });
      if (logsToUpload.length > 0) {
        await commitBatchOperations(logsToUpload, (batch, [id, l]) => {
          const { id: _, ...firebaseLog } = l as any;
          batch.set(doc(logsColRef, id), firebaseLog);
        });
      }

      cloudLogsMap.forEach((cloudLog, logId) => {
        if (!mergedLogs[logId]) {
          mergedLogs[logId] = cloudLog;
        }
      });

      // Update refs synchronously alongside state updates
      exerciseDefsRef.current = mergedDefs;
      workoutsRef.current = mergedWorkouts;
      logsRef.current = mergedLogs;
      appStateRef.current = mergedState;

      // Apply merged states
      setExerciseDefinitionsState(mergedDefs);
      setWorkoutsState(mergedWorkouts);
      setLogs(mergedLogs);
      setAppState(mergedState);

      localStorage.setItem('gl_exercise_definitions', JSON.stringify(mergedDefs));
      localStorage.setItem('gl_workouts', JSON.stringify(mergedWorkouts));
      localStorage.setItem('gl_logs', JSON.stringify(mergedLogs));
      localStorage.setItem('gl_state', JSON.stringify(mergedState));

      // Subscriptions
      unsubDefs = onSnapshot(defsColRef, (span) => {
        let hasChanges = false;
        setExerciseDefinitionsState(prev => {
          let updated = [...prev];
          span.docChanges().forEach(change => {
            const id = change.doc.id;
            if (change.type === 'added' || change.type === 'modified') {
              const cloudDef = change.doc.data() as ExerciseDefinition;
              const idx = updated.findIndex(d => d.id === id);
              if (idx === -1) {
                updated.push(cloudDef);
                hasChanges = true;
              } else if (!change.doc.metadata.hasPendingWrites && JSON.stringify(updated[idx]) !== JSON.stringify(cloudDef)) {
                updated[idx] = cloudDef;
                hasChanges = true;
              }
            } else if (change.type === 'removed') {
              const idx = updated.findIndex(d => d.id === id);
              if (idx !== -1) {
                updated.splice(idx, 1);
                hasChanges = true;
              }
            }
          });

          if (hasChanges) {
            exerciseDefsRef.current = updated;
            try {
              localStorage.setItem('gl_exercise_definitions', JSON.stringify(updated));
            } catch (e) {
              console.warn("localStorage write failed", e);
            }
            return updated;
          }
          return prev;
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${u.uid}/exerciseDefinitions`);
      });

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
              if (!localVal || (!change.doc.metadata.hasPendingWrites && !areLogsEqual(localVal, cloudVal))) {
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
            logsRef.current = updated;
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
                if (!change.doc.metadata.hasPendingWrites && JSON.stringify(localW) !== JSON.stringify(cloudW)) {
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
            workoutsRef.current = updated;
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
              if (!snap.metadata.hasPendingWrites && JSON.stringify(prev) !== JSON.stringify(cloudState)) {
                appStateRef.current = cloudState;
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
        const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || 
                          error?.code === 'unavailable' || 
                          (error?.message || '').toLowerCase().includes('offline') ||
                          (error?.message || '').includes('Failed to get document') ||
                          (error?.message || '').includes('Could not reach Cloud Firestore backend');

        if (isOffline) {
          console.log(`Cloud sync paused (working offline): ${error?.message || error}`);
          if (isMounted) {
            setSyncStatus('failed');
            setSyncError("Working offline. Synchronization will resume when connection is restored.");
          }
          return;
        }

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

    const handleOnline = () => {
      console.log('Network signal restored: Initiating background cloud synchronization.');
      executeSyncWithRetry();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      if (unsubDefs) unsubDefs();
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
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(exerciseDefinitions));
      localStorage.setItem('gl_workouts', JSON.stringify(workouts));
      localStorage.setItem('gl_logs', JSON.stringify(logs));
      localStorage.setItem('gl_state', JSON.stringify(appState));
    } catch (e) {
      console.warn("localStorage quota warn", e);
    }
  }, [exerciseDefinitions, workouts, logs, appState, isInitialized]);

  const addLog = useCallback(async (logId: string, logOriginal: SessionLog) => {
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
      logsRef.current = nextLogs;
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
        setSyncStatus('failed');
        setSyncError("Logged workout locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const deleteLog = useCallback(async (logId: string) => {
    try {
      const nextLogs = { ...logsRef.current };
      delete nextLogs[logId];
      trackDeletedId('logs', logId);
      logsRef.current = nextLogs;
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
        setSyncStatus('failed');
        setSyncError("Deleted log locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const setWorkouts = useCallback(async (w: Workout[] | ((prev: Workout[]) => Workout[])) => {
    try {
      const currentWorkouts = workoutsRef.current;
      const rawNext = typeof w === 'function' ? w(currentWorkouts) : w;
      const { defs, workouts: migrated } = extractExerciseDefinitionsFromWorkouts(rawNext);

      workoutsRef.current = migrated;
      setWorkoutsState(migrated);
      pushAutoBackup(migrated, logsRef.current, appStateRef.current, 'auto-edit', 'Modified Routine Architecture');

      if (user) {
        const colRef = collection(db, 'users', user.uid, 'workouts');
        await commitBatchOperations<Workout>(migrated, (batch, wo) => {
          batch.set(doc(colRef, wo.id), wo);
        });
      }
    } catch (error) {
      console.error("Failed to update workouts", error);
      if (user) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts`);
        setSyncStatus('failed');
        setSyncError("Saved workouts locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const updateCycleStart = useCallback(async (date: string) => {
    try {
      const nextState = { ...appStateRef.current, cycleStart: date };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, path), { cycleStart: date }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to update cycle start", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Updated cycle start locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const logBodyWeight = useCallback(async (date: string, weight: number) => {
    try {
      const currentAppState = appStateRef.current;
      const nextState = { 
        ...currentAppState, 
        weightLog: { ...(currentAppState.weightLog || {}), [date]: weight }
      };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, path), { weightLog: nextState.weightLog }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to log body weight", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Logged body weight locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const deleteBodyWeight = useCallback(async (date: string) => {
    try {
      const currentAppState = appStateRef.current;
      const nextLog = { ...(currentAppState.weightLog || {}) };
      delete nextLog[date];
      const nextState = { ...currentAppState, weightLog: nextLog };
      appStateRef.current = nextState;
      setAppState(nextState);

      if (user) {
        const path = `users/${user.uid}`;
        await setDoc(doc(db, path), { weightLog: nextLog }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to delete body weight", error);
      if (user) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        setSyncStatus('failed');
        setSyncError("Deleted body weight locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const resetLogs = useCallback(async () => {
    try {
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'manual', 'Pre-Purge Auto Backup');
      logsRef.current = {};
      setLogs({});

      if (user) {
        const colRef = collection(db, 'users', user.uid, 'logs');
        const snap = await getDocs(colRef);
        await commitBatchOperations(snap.docs, (batch, d) => {
          batch.delete(d.ref);
        });
      }
    } catch (error) {
      console.error("Failed to flush logs", error);
      if (user) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/logs`);
        setSyncStatus('failed');
        setSyncError("Reset logs locally, but cloud sync failed.");
      }
    }
  }, [user]);

  const login = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/not-configured') {
        console.warn("Identity provider sign-in notice:", e?.message || e);
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

  const exportBackup = useCallback((): string => {
    const backupObj = {
      version: 2,
      exportDate: new Date().toISOString(),
      exerciseDefinitions,
      workouts,
      logs,
      appState
    };
    return JSON.stringify(backupObj, null, 2);
  }, [exerciseDefinitions, workouts, logs, appState]);

  const importBackup = useCallback(async (backupJson: string): Promise<{ success: boolean; message: string }> => {
    try {
      const parsed = JSON.parse(backupJson);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, message: 'Invalid format: Parse failed.' };
      }

      const rawWorkouts = parsed.workouts;
      const rawLogs = parsed.logs;
      const importedAppState = parsed.appState;
      const rawDefs = parsed.exerciseDefinitions;

      if (!Array.isArray(rawWorkouts)) {
        return { success: false, message: 'Invalid backup: Missing or invalid workouts structure.' };
      }
      if (!rawLogs || typeof rawLogs !== 'object') {
        return { success: false, message: 'Invalid backup: Missing or invalid training logs.' };
      }

      let importedDefs: ExerciseDefinition[] = [];
      let importedWorkouts: Workout[] = [];

      if (Array.isArray(rawDefs) && rawDefs.length > 0) {
        importedDefs = rawDefs;
        importedWorkouts = rawWorkouts.map((w: any) => ({
          ...w,
          exercises: (w.exercises || []).map((ex: any) => ({
            exerciseDefinitionId: ex.exerciseDefinitionId || ex.exerciseId || ex.id,
            exerciseId: ex.exerciseId || ex.exerciseDefinitionId || ex.id,
            sets: ex.sets || 3,
            reps: ex.reps || '10–12',
            rest: ex.rest || '90s',
            note: ex.note || '',
            tags: ex.tags || []
          }))
        }));
      } else {
        // Legacy v1 backup migration
        const { defs, workouts: migrated } = extractExerciseDefinitionsFromWorkouts(rawWorkouts);
        importedDefs = defs;
        importedWorkouts = migrated;
      }

      // Sanitize durationMinutes on imported logs
      const importedLogs: Record<string, SessionLog> = {};
      Object.entries(rawLogs).forEach(([id, logVal]: [string, any]) => {
        importedLogs[id] = {
          ...logVal,
          durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
        };
      });

      // Clear deleted IDs tracker as backup represents full target state
      clearDeletedIdsTracker();

      // 1. Create automatic backup of current state BEFORE applying import!
      pushAutoBackup(workoutsRef.current, logsRef.current, appStateRef.current, 'auto-edit', 'Injected data replacement backup', exerciseDefsRef.current);

      // 2. Write to local storage immediately
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(importedDefs));
      localStorage.setItem('gl_workouts', JSON.stringify(importedWorkouts));
      localStorage.setItem('gl_logs', JSON.stringify(importedLogs));
      if (importedAppState && typeof importedAppState.cycleStart === 'string') {
        localStorage.setItem('gl_state', JSON.stringify(importedAppState));
      }

      // Update refs synchronously
      exerciseDefsRef.current = importedDefs;
      workoutsRef.current = importedWorkouts;
      logsRef.current = importedLogs;
      if (importedAppState && typeof importedAppState.cycleStart === 'string') {
        appStateRef.current = importedAppState;
      }

      // 3. Update memory react states
      setExerciseDefinitionsState(importedDefs);
      setWorkoutsState(importedWorkouts);
      setLogs(importedLogs);
      if (importedAppState && typeof importedAppState.cycleStart === 'string') {
        setAppState(importedAppState);
      }

      // 4. Overwrite cloud in background chunks if logged in
      if (user) {
        try {
          if (importedAppState && typeof importedAppState.cycleStart === 'string') {
            await setDoc(doc(db, 'users', user.uid), importedAppState, { merge: true });
          }

          // Delete orphaned documents
          await syncCloudDataWithRestored(user.uid, importedDefs, importedWorkouts, importedLogs);

          // Upload defs in chunked batches
          const defsColRef = collection(db, 'users', user.uid, 'exerciseDefinitions');
          await commitBatchOperations<ExerciseDefinition>(importedDefs, (batch, def) => {
            batch.set(doc(defsColRef, def.id), def);
          });

          // Upload workouts in chunked batches
          const workoutsColRef = collection(db, 'users', user.uid, 'workouts');
          await commitBatchOperations<Workout>(importedWorkouts, (batch, wo) => {
            batch.set(doc(workoutsColRef, wo.id), {
              ...wo,
              exercises: wo.exercises || []
            });
          });

          // Upload logs in chunked batches
          const logsColRef = collection(db, 'users', user.uid, 'logs');
          const logEntries = Object.entries(importedLogs);
          await commitBatchOperations(logEntries, (batch, [logId, logValue]) => {
            const { id: _, ...firebaseLog } = logValue as any;
            batch.set(doc(logsColRef, logId), firebaseLog);
          });
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
  }, [user]);

  const contextValue = React.useMemo(() => ({
    workouts,
    logs,
    appState,
    exerciseDefinitions,
    user,
    loading,
    isInitialized,
    syncStatus,
    syncError,
    addExerciseDefinition,
    updateExerciseDefinition,
    deleteExerciseDefinition,
    assignExerciseToWorkout,
    removeExerciseFromWorkout,
    updateWorkoutExerciseProgramming,
    deleteWorkout,
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
  }), [
    workouts,
    logs,
    appState,
    exerciseDefinitions,
    user,
    loading,
    isInitialized,
    syncStatus,
    syncError,
    addExerciseDefinition,
    updateExerciseDefinition,
    deleteExerciseDefinition,
    assignExerciseToWorkout,
    removeExerciseFromWorkout,
    updateWorkoutExerciseProgramming,
    deleteWorkout,
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
  ]);

  return (
    <FitnessContext.Provider value={contextValue}>
      {children}
    </FitnessContext.Provider>
  );
};

export const useFitness = () => {
  const context = useContext(FitnessContext);
  if (!context) throw new Error('useFitness must be used within a FitnessProvider');
  return context;
};
