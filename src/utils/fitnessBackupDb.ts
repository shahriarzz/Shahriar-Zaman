import type { AutoBackupEntry } from '../hooks/useFitnessBackups';
import type { FitnessDatabaseSnapshot } from '../hooks/useFitnessData';
export type { AutoBackupEntry };

const DB_NAME = 'gainlog_vault';
const STORE_NAME = 'auto_backups';
const PENDING_SYNC_STORE = 'pending_cloud_sync';
const DB_VERSION = 2;

export interface PendingCloudReconciliation {
  uid: string;
  kind: 'restore' | 'import';
  operationId?: string;
  baselineFingerprint?: string;
  snapshot: FitnessDatabaseSnapshot;
  sourceTimestamp: string;
  sourceId: string;
  createdAt: number;
  status: 'pending' | 'retrying' | 'failed';
  lastError?: string;
}

function writeCanonicalJson(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    out.push('null');
    return;
  }
  const type = typeof value;
  if (type === 'boolean' || type === 'string') {
    out.push(JSON.stringify(value));
    return;
  }
  if (type === 'number') {
    out.push(Number.isFinite(value as number) ? JSON.stringify(Object.is(value, -0) ? 0 : value) : 'null');
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out.push(',');
      writeCanonicalJson(value[i], out);
    }
    out.push(']');
    return;
  }
  if (type === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    out.push('{');
    let wroteFirst = false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const propVal = record[k];
      if (propVal === undefined || typeof propVal === 'function' || typeof propVal === 'symbol') {
        continue;
      }
      if (wroteFirst) out.push(',');
      wroteFirst = true;
      out.push(JSON.stringify(k));
      out.push(':');
      writeCanonicalJson(propVal, out);
    }
    out.push('}');
    return;
  }
  out.push('null');
}

/**
 * Computes a deterministic, key-order-independent fingerprint for a canonical fitness snapshot.
 * Identical across pre-serialization in-memory objects and parsed JSON from localStorage.
 */
export function computeSnapshotFingerprint(snapshot: FitnessDatabaseSnapshot): string {
  const parts: string[] = [];
  writeCanonicalJson(
    {
      exerciseDefinitions: snapshot.exerciseDefinitions,
      workouts: snapshot.workouts,
      logs: snapshot.logs,
      appState: snapshot.appState
    },
    parts
  );
  const canonical = parts.join('');
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < canonical.length; i++) {
    const code = canonical.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (code + (i & 0xff));
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `fnv1a64:${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}:${canonical.length}`;
}

let dbInstance: IDBDatabase | null = null;
let inFlightOpenPromise: Promise<BackupDbOpenResult> | null = null;

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function resetBackupDbForTesting(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
  }
  dbInstance = null;
  inFlightOpenPromise = null;
}

export type BackupDbOpenResult = {
  success: boolean;
  db?: IDBDatabase;
  reason?: 'unavailable' | 'blocked' | 'failed';
  error?: Error;
};

export async function openBackupDb(): Promise<BackupDbOpenResult> {
  if (!isIndexedDBAvailable()) {
    dbInstance = null;
    inFlightOpenPromise = null;
    return { success: false, reason: 'unavailable', error: new Error('IndexedDB unavailable in runtime') };
  }
  if (dbInstance) {
    return { success: true, db: dbInstance };
  }
  if (inFlightOpenPromise) {
    return inFlightOpenPromise;
  }

  inFlightOpenPromise = new Promise<BackupDbOpenResult>((resolve) => {
    let settled = false;
    const settle = (result: BackupDbOpenResult) => {
      if (settled) return;
      settled = true;
      inFlightOpenPromise = null;
      resolve(result);
    };

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        console.warn("IndexedDB open blocked by existing connection; resetting for retry");
        dbInstance = null;
        settle({ success: false, reason: 'blocked', error: new Error('IndexedDB open blocked by existing connection') });
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
        }
        if (!db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
          db.createObjectStore(PENDING_SYNC_STORE, { keyPath: 'uid' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (settled) {
          // A blocked open attempt already settled; close the orphaned late connection cleanly.
          try {
            db.close();
          } catch {}
          return;
        }
        dbInstance = db;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          if (dbInstance === db) {
            dbInstance = null;
          }
          inFlightOpenPromise = null;
        };
        db.onclose = () => {
          if (dbInstance === db) {
            dbInstance = null;
          }
          inFlightOpenPromise = null;
        };
        settle({ success: true, db });
      };

      request.onerror = (e) => {
        console.warn("Failed to open gainlog_vault IndexedDB; resetting for retry:", e);
        dbInstance = null;
        const err = request.error || new Error('Failed to open gainlog_vault IndexedDB');
        settle({ success: false, reason: 'failed', error: err });
      };
    } catch (err) {
      console.warn("IndexedDB initialization threw error; resetting for retry:", err);
      dbInstance = null;
      settle({ success: false, reason: 'failed', error: err instanceof Error ? err : new Error(String(err)) });
    }
  });

  return inFlightOpenPromise;
}

/**
 * Genuinely durable backup persistence:
 * Resolves ONLY on transaction completion (tx.oncomplete).
 * Rejects on request error, transaction error, transaction abort, or transaction creation failure.
 */
export async function saveBackupToDb(entry: AutoBackupEntry): Promise<void> {
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable for durable backup storage (${reason || 'unknown'})`);
  }
  const db = openRes.db;

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed while saving backup'));
      tx.onabort = () => reject(new Error('Transaction aborted while saving backup'));
      req.onerror = () => reject(req.error || new Error('Request error saving backup'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function getAllBackupsFromDb(): Promise<AutoBackupEntry[]> {
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB is not available to read backups (${reason || 'unknown'})`);
  }
  const db = openRes.db;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      let resultData: AutoBackupEntry[] = [];

      req.onsuccess = () => {
        resultData = req.result || [];
      };
      req.onerror = () => {
        reject(req.error || new Error('Failed to read backups from IndexedDB'));
      };
      tx.oncomplete = () => {
        resultData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(resultData.slice(0, 8));
      };
      tx.onerror = () => {
        reject(tx.error || new Error('Transaction failed while reading backups from IndexedDB'));
      };
      tx.onabort = () => {
        reject(new Error('Transaction aborted while reading backups from IndexedDB'));
      };
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function deleteBackupFromDb(timestamp: string): Promise<void> {
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to delete backup (${reason || 'unknown'})`);
  }
  const db = openRes.db;

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(timestamp);
      req.onerror = () => reject(req.error || new Error('Request error deleting backup'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to delete backup'));
      tx.onabort = () => reject(new Error('Delete transaction aborted'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function pruneBackupsInDb(keepTimestamps: string[]): Promise<void> {
  const keepSet = new Set(keepTimestamps);

  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to prune backups (${reason || 'unknown'})`);
  }
  const db = openRes.db;

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result || []) as string[];
        keys.forEach(k => {
          if (!keepSet.has(k)) {
            const delReq = store.delete(k);
            delReq.onerror = () => reject(delReq.error || new Error('Request error deleting pruned backup'));
          }
        });
      };
      req.onerror = () => reject(req.error || new Error('Failed to read keys during prune'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Prune transaction failed'));
      tx.onabort = () => reject(new Error('Prune transaction aborted'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Clears ONLY the auto_backups checkpoint store, leaving per-UID pending_cloud_sync
 * reconciliation records intact across account switches and resets.
 */
export async function clearBackupCheckpointsFromDb(): Promise<void> {
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to clear backups (${reason || 'unknown'})`);
  }
  const db = openRes.db;

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const backupStore = tx.objectStore(STORE_NAME);
      const req = backupStore.clear();
      req.onerror = () => reject(req.error || new Error('Failed to clear backups store'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to clear backups'));
      tx.onabort = () => reject(new Error('Clear transaction aborted'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Explicitly clears all pending cloud reconciliation records across all UIDs.
 */
export async function clearAllPendingCloudReconciliationsFromDb(): Promise<void> {
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to clear pending cloud reconciliations (${reason || 'unknown'})`);
  }
  const db = openRes.db;
  if (typeof db.objectStoreNames?.contains === 'function' && !db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
    return;
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(PENDING_SYNC_STORE, 'readwrite');
      const pendingStore = tx.objectStore(PENDING_SYNC_STORE);
      const req = pendingStore.clear();
      req.onerror = () => reject(req.error || new Error('Failed to clear pending cloud sync store'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to clear pending cloud sync store'));
      tx.onabort = () => reject(new Error('Clear pending cloud sync transaction aborted'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function savePendingCloudReconciliationToDb(record: PendingCloudReconciliation): Promise<void> {
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to save pending cloud reconciliation (${reason || 'unknown'})`);
  }
  const db = openRes.db;
  if (typeof db.objectStoreNames?.contains === 'function' && !db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
    throw new Error('Pending cloud sync store is missing in IndexedDB');
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(PENDING_SYNC_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_SYNC_STORE);
      const req = store.put(record);
      req.onerror = () => reject(req.error || new Error('Request error saving pending cloud reconciliation'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed saving pending cloud reconciliation'));
      tx.onabort = () => reject(new Error('Transaction aborted saving pending cloud reconciliation'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function getPendingCloudReconciliationFromDb(uid: string): Promise<PendingCloudReconciliation | null> {
  if (!uid) return null;
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to read pending cloud reconciliation (${reason || 'unknown'})`);
  }
  const db = openRes.db;
  if (typeof db.objectStoreNames?.contains === 'function' && !db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
    return null;
  }

  return new Promise<PendingCloudReconciliation | null>((resolve, reject) => {
    try {
      const tx = db.transaction(PENDING_SYNC_STORE, 'readonly');
      const store = tx.objectStore(PENDING_SYNC_STORE);
      const req = store.get(uid);
      let result: PendingCloudReconciliation | null = null;
      req.onsuccess = () => {
        result = (req.result as PendingCloudReconciliation | undefined) ?? null;
      };
      req.onerror = () => reject(req.error || new Error('Request error reading pending cloud reconciliation'));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Transaction failed reading pending cloud reconciliation'));
      tx.onabort = () => reject(new Error('Transaction aborted reading pending cloud reconciliation'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function clearPendingCloudReconciliationFromDb(uid: string): Promise<void> {
  if (!uid) return;
  const openRes = await openBackupDb();
  if (!openRes.success || !openRes.db) {
    const error = openRes.error;
    const reason = openRes.reason;
    throw error || new Error(`IndexedDB unavailable to clear pending cloud reconciliation (${reason || 'unknown'})`);
  }
  const db = openRes.db;
  if (typeof db.objectStoreNames?.contains === 'function' && !db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
    return;
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(PENDING_SYNC_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_SYNC_STORE);
      const req = store.delete(uid);
      req.onerror = () => reject(req.error || new Error('Request error clearing pending cloud reconciliation'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed clearing pending cloud reconciliation'));
      tx.onabort = () => reject(new Error('Transaction aborted clearing pending cloud reconciliation'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Asynchronously migrates legacy localStorage gl_auto_backups data into IndexedDB.
 * Removes gl_auto_backups ONLY after all retained backups have committed successfully.
 * If IndexedDB is unavailable or migration fails, retains the original localStorage backup.
 * Preserves the 8-checkpoint limit.
 */
export async function migrateLegacyLocalStorageBackups(): Promise<AutoBackupEntry[]> {
  try {
    const legacy = localStorage.getItem('gl_auto_backups');
    if (!legacy) return [];
    let parsed: any;
    try {
      parsed = JSON.parse(legacy);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const openRes = await openBackupDb();
    if (!openRes.success || !openRes.db) {
      // If IndexedDB is unavailable, retain the original localStorage backup
      return [];
    }
    const db = openRes.db;

    const legacyEntries = [...parsed]
      .filter((entry: AutoBackupEntry) => entry && entry.timestamp);

    if (legacyEntries.length === 0) return [];

    // Atomically read existing IndexedDB entries, merge with legacy, sort newest-first, slice to 8, write and prune
    const retained = await new Promise<AutoBackupEntry[]>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getAllReq = store.getAll();

        let mergedRetained: AutoBackupEntry[] = [];

        getAllReq.onsuccess = () => {
          const existingList: AutoBackupEntry[] = getAllReq.result || [];
          const map = new Map<string, AutoBackupEntry>();
          // Existing records in IndexedDB
          for (const item of existingList) {
            if (item && item.timestamp) map.set(item.timestamp, item);
          }
          // Legacy records merged without overwriting newer/existing IndexedDB entries for duplicate timestamps
          for (const item of legacyEntries) {
            if (!map.has(item.timestamp)) {
              map.set(item.timestamp, item);
            }
          }
          const allMerged = Array.from(map.values());
          allMerged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          mergedRetained = allMerged.slice(0, 8);
          const keepSet = new Set(mergedRetained.map(m => m.timestamp));

          // Write only retained entries belonging in top 8 (preserve existing DB values on key conflict)
          const existingTimestamps = new Set(existingList.map(i => i.timestamp));
          for (const entry of mergedRetained) {
            if (!existingTimestamps.has(entry.timestamp)) {
              const putReq = store.put(entry);
              putReq.onerror = () => reject(putReq.error || new Error('Request error writing migrated backup'));
            }
          }
          // Delete any older entries beyond the 8 limit
          for (const item of existingList) {
            if (!keepSet.has(item.timestamp)) {
              const delReq = store.delete(item.timestamp);
              delReq.onerror = () => reject(delReq.error || new Error('Request error pruning old backup during migration'));
            }
          }
        };

        getAllReq.onerror = () => reject(getAllReq.error || new Error('Failed to read existing records during migration'));

        tx.oncomplete = () => resolve(mergedRetained);
        tx.onerror = () => reject(tx.error || new Error('Migration transaction failed'));
        tx.onabort = () => reject(new Error('Migration transaction aborted'));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // Remove gl_auto_backups ONLY after every retained backup has committed successfully
    localStorage.removeItem('gl_auto_backups');

    try {
      const meta = retained.map(u => ({ timestamp: u.timestamp, desc: u.desc, changeType: u.changeType }));
      localStorage.setItem('gl_auto_backups_meta', JSON.stringify(meta));
    } catch {}

    return retained;
  } catch (err) {
    console.warn("Failed migrating legacy localStorage backups; retaining localStorage data:", err);
    return [];
  }
}
