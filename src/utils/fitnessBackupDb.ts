import { AutoBackupEntry } from '../hooks/useFitnessBackups';

const DB_NAME = 'gainlog_vault';
const STORE_NAME = 'auto_backups';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

// In-memory fallback if IndexedDB is not supported in the runtime (e.g. some CI/test environments)
const memoryFallbackMap = new Map<string, AutoBackupEntry>();

export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export async function getBackupDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) return null;
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
        }
      };
      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(dbInstance);
      };
      request.onerror = (e) => {
        console.warn("Failed to open gainlog_vault IndexedDB; falling back to in-memory/metadata storage:", e);
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB initialization threw error; falling back:", err);
      resolve(null);
    }
  });

  return dbPromise;
}

export async function saveBackupToDb(entry: AutoBackupEntry): Promise<void> {
  memoryFallbackMap.set(entry.timestamp, entry);
  const db = await getBackupDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      console.warn("Failed to write backup entry to IndexedDB:", err);
      resolve(); // Graceful degradation
    }
  });
}

export async function getAllBackupsFromDb(): Promise<AutoBackupEntry[]> {
  const db = await getBackupDb();
  if (!db) {
    return Array.from(memoryFallbackMap.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: AutoBackupEntry[] = req.result || [];
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        // Mirror to fallback map
        list.forEach(item => memoryFallbackMap.set(item.timestamp, item));
        resolve(list);
      };
      req.onerror = () => {
        resolve(Array.from(memoryFallbackMap.values()).sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));
      };
    } catch {
      resolve(Array.from(memoryFallbackMap.values()).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    }
  });
}

export async function deleteBackupFromDb(timestamp: string): Promise<void> {
  memoryFallbackMap.delete(timestamp);
  const db = await getBackupDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(timestamp);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function pruneBackupsInDb(keepTimestamps: string[]): Promise<void> {
  // Prune memory map
  const keepSet = new Set(keepTimestamps);
  for (const ts of Array.from(memoryFallbackMap.keys())) {
    if (!keepSet.has(ts)) {
      memoryFallbackMap.delete(ts);
    }
  }

  const db = await getBackupDb();
  if (!db) return;

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
  } catch (err) {
    console.warn("Failed to prune backups in IndexedDB:", err);
  }
}

export async function clearAllBackupsFromDb(): Promise<void> {
  memoryFallbackMap.clear();
  const db = await getBackupDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Migrates legacy localStorage gl_auto_backups data into IndexedDB safely without discarding existing backups.
 * Removes the heavy duplicate gl_auto_backups key from localStorage once migrated.
 */
export function migrateLegacyLocalStorageBackups(): AutoBackupEntry[] {
  try {
    const legacy = localStorage.getItem('gl_auto_backups');
    if (!legacy) return [];
    const parsed = JSON.parse(legacy);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    parsed.forEach((entry: AutoBackupEntry) => {
      if (entry && entry.timestamp) {
        memoryFallbackMap.set(entry.timestamp, entry);
        saveBackupToDb(entry).catch(() => {});
      }
    });

    // Remove the bulky complete history from localStorage
    localStorage.removeItem('gl_auto_backups');

    return parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn("Failed migrating legacy localStorage backups:", err);
    return [];
  }
}
