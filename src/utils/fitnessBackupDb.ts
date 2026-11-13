import { AutoBackupEntry } from '../hooks/useFitnessBackups';
export type { AutoBackupEntry };
import * as backupDbSelf from './fitnessBackupDb';

const DB_NAME = 'gainlog_vault';
const STORE_NAME = 'auto_backups';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

// In-memory fallback cache for fast synchronous reads when IndexedDB is populated
const memoryFallbackMap = new Map<string, AutoBackupEntry>();

export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function resetBackupDbForTesting(): void {
  dbInstance = null;
  dbPromise = null;
  memoryFallbackMap.clear();
}

export type BackupDbOpenResult = {
  success: boolean;
  db?: IDBDatabase;
  reason?: 'unavailable' | 'blocked' | 'failed';
  error?: Error;
};

export async function openBackupDb(): Promise<BackupDbOpenResult> {
  if (!isIndexedDBAvailable()) {
    return { success: false, reason: 'unavailable', error: new Error('IndexedDB unavailable in runtime') };
  }
  if (dbInstance) {
    return { success: true, db: dbInstance };
  }

  return new Promise<BackupDbOpenResult>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        console.warn("IndexedDB open blocked by existing connection; resetting for retry");
        dbInstance = null;
        dbPromise = null;
        resolve({ success: false, reason: 'blocked', error: new Error('IndexedDB open blocked by existing connection') });
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        dbInstance = db;
        db.onversionchange = () => {
          db.close();
          dbInstance = null;
          dbPromise = null;
        };
        db.onclose = () => {
          dbInstance = null;
          dbPromise = null;
        };
        resolve({ success: true, db });
      };

      request.onerror = (e) => {
        console.warn("Failed to open gainlog_vault IndexedDB; resetting for retry:", e);
        dbInstance = null;
        dbPromise = null;
        const err = request.error || new Error('Failed to open gainlog_vault IndexedDB');
        resolve({ success: false, reason: 'failed', error: err });
      };
    } catch (err) {
      console.warn("IndexedDB initialization threw error; resetting for retry:", err);
      dbInstance = null;
      dbPromise = null;
      resolve({ success: false, reason: 'failed', error: err instanceof Error ? err : new Error(String(err)) });
    }
  });
}

export async function getBackupDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) return null;
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = openBackupDb().then(res => {
    if (res.success && res.db) {
      return res.db;
    }
    dbPromise = null;
    return null;
  });

  return dbPromise;
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

      tx.oncomplete = () => {
        memoryFallbackMap.set(entry.timestamp, entry);
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error || new Error('Transaction failed while saving backup'));
      };
      tx.onabort = () => {
        reject(new Error('Transaction aborted while saving backup'));
      };
      req.onerror = () => {
        reject(req.error || new Error('Request error saving backup'));
      };
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
        // Mirror to cache map
        resultData.forEach(item => memoryFallbackMap.set(item.timestamp, item));
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
      store.delete(timestamp);
      tx.oncomplete = () => {
        memoryFallbackMap.delete(timestamp);
        resolve();
      };
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
            store.delete(k);
          }
        });
      };
      req.onerror = () => reject(req.error || new Error('Failed to read keys during prune'));
      tx.oncomplete = () => {
        for (const ts of Array.from(memoryFallbackMap.keys())) {
          if (!keepSet.has(ts)) {
            memoryFallbackMap.delete(ts);
          }
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error || new Error('Prune transaction failed'));
      tx.onabort = () => reject(new Error('Prune transaction aborted'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function clearAllBackupsFromDb(): Promise<void> {
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
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        memoryFallbackMap.clear();
        resolve();
      };
      tx.onerror = () => reject(tx.error || new Error('Failed to clear backups'));
      tx.onabort = () => reject(new Error('Clear transaction aborted'));
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

    const db = await backupDbSelf.getBackupDb();
    if (!db) {
      // If IndexedDB is unavailable, retain the original localStorage backup
      return [];
    }

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
          // Legacy records merged (newer record wins if duplicate timestamp)
          for (const item of legacyEntries) {
            if (!map.has(item.timestamp)) {
              map.set(item.timestamp, item);
            }
          }
          const allMerged = Array.from(map.values());
          allMerged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          mergedRetained = allMerged.slice(0, 8);
          const keepSet = new Set(mergedRetained.map(m => m.timestamp));

          // Put retained legacy entries into store
          for (const entry of mergedRetained) {
            store.put(entry);
          }
          // Delete any older entries beyond the 8 limit
          for (const item of existingList) {
            if (!keepSet.has(item.timestamp)) {
              store.delete(item.timestamp);
            }
          }
        };

        getAllReq.onerror = () => reject(getAllReq.error || new Error('Failed to read existing records during migration'));

        tx.oncomplete = () => {
          mergedRetained.forEach(entry => memoryFallbackMap.set(entry.timestamp, entry));
          resolve(mergedRetained);
        };
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
