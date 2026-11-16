import { beforeEach, afterEach } from 'vitest';
import { resetBackupDbForTesting } from '../../utils/fitnessBackupDb';

interface StoreEntry {
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  seq: number;
  data: Map<string, any>;
}

interface DbEntry {
  version: number;
  stores: Map<string, StoreEntry>;
}

class FakeIDBRequest {
  onsuccess: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  result: any = undefined;
  error: any = null;
}

class FakeIDBOpenDBRequest extends FakeIDBRequest {
  onblocked: ((ev: any) => void) | null = null;
  onupgradeneeded: ((ev: any) => void) | null = null;
  transaction: any = null;
}

function createInMemoryIndexedDB() {
  const databases = new Map<string, DbEntry>();

  const extractKey = (store: StoreEntry, item: any, explicitKey?: any): string => {
    if (explicitKey !== undefined) return String(explicitKey);
    if (typeof store.keyPath === 'string' && item && typeof item === 'object') {
      const val = item[store.keyPath];
      if (val !== undefined) return String(val);
    }
    if (Array.isArray(store.keyPath) && item && typeof item === 'object') {
      return JSON.stringify(store.keyPath.map((k) => item[k]));
    }
    store.seq += 1;
    return String(store.seq);
  };

  const makeStoreNamesList = (namesIter: () => Iterable<string>) => {
    const arr = () => Array.from(namesIter());
    return {
      contains: (name: string) => arr().includes(name),
      get length() {
        return arr().length;
      },
      item: (index: number) => arr()[index] ?? null,
      [Symbol.iterator]: () => arr()[Symbol.iterator](),
    };
  };

  const createDbConnection = (dbEntry: DbEntry) => {
    const dbObj: any = {
      get name() {
        return '';
      },
      get version() {
        return dbEntry.version;
      },
      objectStoreNames: makeStoreNamesList(() => dbEntry.stores.keys()),
      createObjectStore: (
        name: string,
        options?: { keyPath?: string | string[] | null; autoIncrement?: boolean }
      ) => {
        if (!dbEntry.stores.has(name)) {
          dbEntry.stores.set(name, {
            keyPath: options?.keyPath ?? null,
            autoIncrement: Boolean(options?.autoIncrement),
            seq: 0,
            data: new Map(),
          });
        }
        return {
          createIndex: () => ({}),
          name,
          keyPath: options?.keyPath ?? null,
        };
      },
      deleteObjectStore: (name: string) => {
        dbEntry.stores.delete(name);
      },
      close: () => {},
      onversionchange: null,
      onclose: null,
      transaction: (storeNames: string | string[]) => {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const stagedSnapshots = new Map<string, Map<string, any>>();
        for (const n of names) {
          const store = dbEntry.stores.get(n);
          stagedSnapshots.set(n, new Map(store ? store.data : []));
        }

        let pendingRequests = 0;
        let finalized = false;

        const finalizeIfDone = () => {
          queueMicrotask(() => {
            if (pendingRequests > 0 || finalized) return;
            finalized = true;
            stagedSnapshots.forEach((stagedMap, name) => {
              const store = dbEntry.stores.get(name);
              if (store) {
                store.data.clear();
                stagedMap.forEach((val, key) => store.data.set(key, val));
              }
            });
            if (tx.oncomplete) tx.oncomplete({ target: tx });
          });
        };

        const tx: any = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          error: null,
          abort: () => {
            finalized = true;
            if (tx.onabort) tx.onabort({ target: tx });
          },
          objectStore: (storeName: string) => {
            const storeMeta = dbEntry.stores.get(storeName) ?? {
              keyPath: null,
              autoIncrement: false,
              seq: 0,
              data: new Map(),
            };
            if (!stagedSnapshots.has(storeName)) {
              stagedSnapshots.set(storeName, new Map(storeMeta.data));
            }
            const staged = stagedSnapshots.get(storeName)!;

            const enqueue = (fn: (req: any) => void) => {
              pendingRequests++;
              const req: any = new FakeIDBRequest();
              queueMicrotask(() => {
                try {
                  fn(req);
                  if (req.onsuccess) req.onsuccess({ target: req });
                } catch (err) {
                  req.error = err;
                  if (req.onerror) req.onerror({ target: req });
                } finally {
                  pendingRequests--;
                  finalizeIfDone();
                }
              });
              return req;
            };

            return {
              put: (item: any, key?: any) =>
                enqueue((req) => {
                  const k = extractKey(storeMeta, item, key);
                  staged.set(k, structuredClone(item));
                  req.result = k;
                }),
              add: (item: any, key?: any) =>
                enqueue((req) => {
                  const k = extractKey(storeMeta, item, key);
                  if (staged.has(k)) {
                    throw new Error(`Key ${k} already exists in ${storeName}`);
                  }
                  staged.set(k, structuredClone(item));
                  req.result = k;
                }),
              get: (key: any) =>
                enqueue((req) => {
                  const val = staged.get(String(key));
                  req.result = val !== undefined ? structuredClone(val) : undefined;
                }),
              getAll: () =>
                enqueue((req) => {
                  req.result = Array.from(staged.values()).map((v) => structuredClone(v));
                }),
              getAllKeys: () =>
                enqueue((req) => {
                  req.result = Array.from(staged.keys());
                }),
              count: () =>
                enqueue((req) => {
                  req.result = staged.size;
                }),
              delete: (key: any) =>
                enqueue(() => {
                  staged.delete(String(key));
                }),
              clear: () =>
                enqueue(() => {
                  staged.clear();
                }),
              openCursor: () =>
                enqueue((req) => {
                  const entries = Array.from(staged.entries());
                  let idx = 0;
                  const makeCursor = (): any => {
                    if (idx >= entries.length) return null;
                    const [k, v] = entries[idx];
                    return {
                      key: k,
                      value: structuredClone(v),
                      continue: () => {
                        idx++;
                        queueMicrotask(() => {
                          req.result = makeCursor();
                          if (req.onsuccess) req.onsuccess({ target: req });
                        });
                      },
                    };
                  };
                  req.result = makeCursor();
                }),
            };
          },
        };
        queueMicrotask(() => {
          finalizeIfDone();
        });
        return tx;
      },
    };
    return dbObj;
  };

  const factory = {
    open: (name: string, version?: number) => {
      const requestedVersion = version ?? 1;
      const existing = databases.get(name);
      const previousVersion = existing ? existing.version : 0;
      const needsUpgrade = !existing || requestedVersion > existing.version;
      const dbEntry: DbEntry = existing ?? { version: requestedVersion, stores: new Map() };
      if (!existing) {
        databases.set(name, dbEntry);
      } else if (requestedVersion > existing.version) {
        existing.version = requestedVersion;
      }

      const dbObj = createDbConnection(dbEntry);
      const openReq: any = new FakeIDBOpenDBRequest();
      openReq.result = dbObj;
      queueMicrotask(() => {
        if (needsUpgrade && openReq.onupgradeneeded) {
          openReq.onupgradeneeded({ target: openReq, oldVersion: previousVersion, newVersion: requestedVersion });
        }
        if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
      });
      return openReq;
    },
    deleteDatabase: (name: string) => {
      const delReq: any = new FakeIDBOpenDBRequest();
      queueMicrotask(() => {
        databases.delete(name);
        if (delReq.onsuccess) delReq.onsuccess({ target: delReq });
      });
      return delReq;
    },
  };

  return {
    factory,
    resetStores: () => {
      databases.clear();
    },
  };
}

const idbHarness = createInMemoryIndexedDB();

if (typeof window !== 'undefined') {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof (globalThis as any).IDBRequest === 'undefined') {
    (globalThis as any).IDBRequest = FakeIDBRequest;
    (window as any).IDBRequest = FakeIDBRequest;
  }
  if (typeof (globalThis as any).IDBOpenDBRequest === 'undefined') {
    (globalThis as any).IDBOpenDBRequest = FakeIDBOpenDBRequest;
    (window as any).IDBOpenDBRequest = FakeIDBOpenDBRequest;
  }
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    writable: true,
    value: idbHarness.factory,
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: idbHarness.factory,
  });
}

beforeEach(() => {
  idbHarness.resetStores();
  resetBackupDbForTesting();
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
});

afterEach(() => {
  resetBackupDbForTesting();
  idbHarness.resetStores();
});
