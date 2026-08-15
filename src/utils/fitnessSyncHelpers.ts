import { db, writeBatch, collection, getDocs } from '../lib/firebase';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';

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

// ==========================================
// DETERMINISTIC SYNC MERGE UTILITIES
// ==========================================

export type ConflictWinner = 'local' | 'cloud' | 'equal' | 'tombstone';

export interface ResolveRecordResult<T> {
  winner: ConflictWinner;
  resolved: T | null;
  needsUpload: boolean;
}

/**
 * Canonical conflict resolution function between local and cloud records.
 * Follows strict updatedAt rules and offline deletion tombstones.
 */
export function resolveLocalCloudRecord<T extends { id?: string; updatedAt?: number }>(
  local: T | undefined | null,
  cloud: T | undefined | null,
  isTombstoned = false
): ResolveRecordResult<T> {
  if (isTombstoned) {
    return { winner: 'tombstone', resolved: null, needsUpload: false };
  }

  if (local && !cloud) {
    return { winner: 'local', resolved: local, needsUpload: true };
  }

  if (!local && cloud) {
    return { winner: 'cloud', resolved: cloud, needsUpload: false };
  }

  if (!local && !cloud) {
    return { winner: 'equal', resolved: null, needsUpload: false };
  }

  const localUpdated = local!.updatedAt || 0;
  const cloudUpdated = cloud!.updatedAt || 0;

  if (localUpdated > cloudUpdated) {
    return { winner: 'local', resolved: local!, needsUpload: true };
  }

  if (cloudUpdated > localUpdated) {
    return { winner: 'cloud', resolved: cloud!, needsUpload: false };
  }

  // Same timestamp: compare content
  if (JSON.stringify(local) !== JSON.stringify(cloud)) {
    // If content differs at equal timestamps, local is preferred and uploaded
    return { winner: 'local', resolved: local!, needsUpload: true };
  }

  return { winner: 'equal', resolved: local!, needsUpload: false };
}

export function mergeDefinitions(
  localDefs: ExerciseDefinition[],
  cloudDefs: ExerciseDefinition[],
  tombstones: string[] = []
): { merged: ExerciseDefinition[]; toUpload: ExerciseDefinition[] } {
  const tombstoneSet = new Set(tombstones);
  const cloudMap = new Map<string, ExerciseDefinition>();
  (cloudDefs || []).forEach(d => {
    if (d && d.id && !tombstoneSet.has(d.id)) {
      cloudMap.set(d.id, d);
    }
  });

  const mergedMap = new Map<string, ExerciseDefinition>();
  const toUpload: ExerciseDefinition[] = [];

  (localDefs || []).forEach(localDef => {
    if (!localDef || !localDef.id || tombstoneSet.has(localDef.id)) return;
    const cloudDef = cloudMap.get(localDef.id);
    const result = resolveLocalCloudRecord(localDef, cloudDef, false);

    if (result.winner === 'local' && result.resolved) {
      mergedMap.set(localDef.id, result.resolved);
      if (result.needsUpload) toUpload.push(result.resolved);
    } else if (result.winner === 'cloud' && result.resolved) {
      mergedMap.set(localDef.id, result.resolved);
    } else if (result.resolved) {
      mergedMap.set(localDef.id, result.resolved);
    }
    cloudMap.delete(localDef.id);
  });

  cloudMap.forEach(cloudDef => {
    mergedMap.set(cloudDef.id, cloudDef);
  });

  return {
    merged: Array.from(mergedMap.values()),
    toUpload
  };
}

export function mergeWorkouts(
  localWorkouts: Workout[],
  cloudWorkouts: Workout[],
  tombstones: string[] = []
): { merged: Workout[]; toUpload: Workout[] } {
  const tombstoneSet = new Set(tombstones);
  const cloudMap = new Map<string, Workout>();
  (cloudWorkouts || []).forEach(w => {
    if (w && w.id && !tombstoneSet.has(w.id)) {
      cloudMap.set(w.id, w);
    }
  });

  const mergedMap = new Map<string, Workout>();
  const toUpload: Workout[] = [];

  (localWorkouts || []).forEach(localW => {
    if (!localW || !localW.id || tombstoneSet.has(localW.id)) return;
    const cloudW = cloudMap.get(localW.id);
    const result = resolveLocalCloudRecord(localW, cloudW, false);

    if (result.winner === 'local' && result.resolved) {
      mergedMap.set(localW.id, result.resolved);
      if (result.needsUpload) toUpload.push(result.resolved);
    } else if (result.winner === 'cloud' && result.resolved) {
      mergedMap.set(localW.id, result.resolved);
    } else if (result.resolved) {
      mergedMap.set(localW.id, result.resolved);
    }
    cloudMap.delete(localW.id);
  });

  cloudMap.forEach(cloudW => {
    mergedMap.set(cloudW.id, cloudW);
  });

  return {
    merged: Array.from(mergedMap.values()),
    toUpload
  };
}

export function mergeLogs(
  localLogs: Record<string, SessionLog>,
  cloudLogs: Record<string, SessionLog>,
  tombstones: string[] = []
): { merged: Record<string, SessionLog>; toUpload: Record<string, SessionLog> } {
  const tombstoneSet = new Set(tombstones);
  const cloudMap = new Map<string, SessionLog>();
  Object.entries(cloudLogs || {}).forEach(([id, l]) => {
    if (l && !tombstoneSet.has(id)) {
      cloudMap.set(id, l);
    }
  });

  const merged: Record<string, SessionLog> = {};
  const toUpload: Record<string, SessionLog> = {};

  Object.entries(localLogs || {}).forEach(([id, localL]) => {
    if (!localL || tombstoneSet.has(id)) return;
    const cloudL = cloudMap.get(id);
    const result = resolveLocalCloudRecord(localL, cloudL, false);

    if (result.winner === 'local' && result.resolved) {
      merged[id] = result.resolved;
      if (result.needsUpload) toUpload[id] = result.resolved;
    } else if (result.winner === 'cloud' && result.resolved) {
      merged[id] = result.resolved;
    } else if (result.resolved) {
      merged[id] = result.resolved;
    }
    cloudMap.delete(id);
  });

  cloudMap.forEach((cloudL, id) => {
    merged[id] = cloudL;
  });

  return {
    merged,
    toUpload
  };
}

export function mergeAppState(
  localState: AppState,
  cloudState: AppState | null
): { merged: AppState; needsUpload: boolean } {
  if (!cloudState) {
    return { merged: localState, needsUpload: true };
  }

  const localUpdated = localState.updatedAt || 0;
  const cloudUpdated = cloudState.updatedAt || 0;

  const cycleStart = (localUpdated >= cloudUpdated)
    ? (localState.cycleStart || cloudState.cycleStart)
    : (cloudState.cycleStart || localState.cycleStart);

  const mergedWeight: Record<string, number> = {
    ...(cloudState.weightLog || {}),
    ...(localState.weightLog || {})
  };

  const merged: AppState = {
    cycleStart,
    weightLog: mergedWeight,
    updatedAt: Math.max(localUpdated, cloudUpdated)
  };

  const needsUpload = JSON.stringify(merged) !== JSON.stringify(cloudState);

  return { merged, needsUpload };
}

