import { db, writeBatch, collection, getDocs } from '../lib/firebase';
import { ExerciseDefinition, Workout, SessionLog } from '../types/fitness';

// Chunked batch operations helper to prevent Firestore 500-operation limits
export async function commitBatchOperations<T>(
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
export interface DeletedIdsTracker {
  defs: string[];
  workouts: string[];
  logs: string[];
}

export function getDeletedIdsTracker(): DeletedIdsTracker {
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

export function saveDeletedIdsTracker(tracker: DeletedIdsTracker): void {
  try {
    localStorage.setItem('gl_deleted_ids', JSON.stringify(tracker));
  } catch (e) {
    console.warn("Failed to save deleted ids tracker", e);
  }
}

export function trackDeletedId(type: 'defs' | 'workouts' | 'logs', id: string): void {
  const tracker = getDeletedIdsTracker();
  if (!tracker[type].includes(id)) {
    tracker[type].push(id);
    saveDeletedIdsTracker(tracker);
  }
}

export function removeDeletedId(type: 'defs' | 'workouts' | 'logs', id: string): void {
  const tracker = getDeletedIdsTracker();
  if (tracker[type].includes(id)) {
    tracker[type] = tracker[type].filter(item => item !== id);
    saveDeletedIdsTracker(tracker);
  }
}

export function clearDeletedIdsTracker(): void {
  try {
    localStorage.removeItem('gl_deleted_ids');
  } catch {}
}

export const syncCloudDataWithRestored = async (
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

export const areLogsEqual = (a: SessionLog, b: SessionLog): boolean => {
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
