export type StorageErrorKind =
  | 'storage_unavailable'
  | 'security_error'
  | 'quota_exceeded'
  | 'unknown';

export type StorageOperation = 'access' | 'probe' | 'getItem' | 'setItem' | 'removeItem';

export class SafeStorageError extends Error {
  public readonly kind: StorageErrorKind;
  public readonly operation: StorageOperation;
  public readonly key?: string;

  constructor(
    kind: StorageErrorKind,
    operation: StorageOperation,
    message: string,
    key?: string,
    cause?: unknown
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SafeStorageError';
    this.kind = kind;
    this.operation = operation;
    this.key = key;
  }
}

export type StorageReadResult =
  | { ok: true; value: string | null; error?: undefined }
  | { ok: false; value?: undefined; error: SafeStorageError };

export type StorageWriteResult =
  | { ok: true; error?: undefined }
  | { ok: false; error: SafeStorageError };

export function classifyStorageError(
  err: unknown,
  fallbackKind: StorageErrorKind = 'storage_unavailable'
): StorageErrorKind {
  if (err instanceof SafeStorageError) {
    return err.kind;
  }
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name?: unknown }).name || '')
      : '';
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = `${name} ${message}`.toLowerCase();

  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    lower.includes('quota')
  ) {
    return 'quota_exceeded';
  }
  if (
    name === 'SecurityError' ||
    lower.includes('securityerror') ||
    lower.includes('access is denied') ||
    lower.includes('insecure')
  ) {
    return 'security_error';
  }
  if (
    lower.includes('unavailable') ||
    lower.includes('not defined') ||
    lower.includes('disabled') ||
    lower.includes('storage')
  ) {
    return 'storage_unavailable';
  }
  return fallbackKind;
}

export function isStorageUnavailableError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof SafeStorageError) {
    return (
      err.kind === 'storage_unavailable' ||
      err.kind === 'security_error' ||
      (err.operation === 'access' || err.operation === 'probe' || err.operation === 'getItem')
    );
  }
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name?: unknown }).name || '')
      : '';
  return name === 'SafeStorageError' || name === 'SecurityError';
}

function toSafeStorageError(
  err: unknown,
  operation: StorageOperation,
  fallbackKind: StorageErrorKind,
  key?: string
): SafeStorageError {
  if (err instanceof SafeStorageError) {
    return err;
  }
  const kind = classifyStorageError(err, fallbackKind);
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown storage error');
  return new SafeStorageError(
    kind,
    operation,
    rawMessage || `Browser localStorage ${operation} failed`,
    key,
    err
  );
}

/**
 * Safely resolves the localStorage host object while catching getter throws
 * (e.g. SecurityError in sandboxed/restricted origin browsers).
 */
export function getSafeLocalStorage(): Storage {
  let storage: unknown;
  try {
    const scope: Record<string, unknown> | undefined =
      typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>)
        : typeof globalThis !== 'undefined'
          ? (globalThis as unknown as Record<string, unknown>)
          : undefined;
    storage = scope?.localStorage;
  } catch (err) {
    throw toSafeStorageError(err, 'access', 'security_error');
  }

  if (
    !storage ||
    typeof (storage as Storage).getItem !== 'function' ||
    typeof (storage as Storage).setItem !== 'function' ||
    typeof (storage as Storage).removeItem !== 'function'
  ) {
    throw new SafeStorageError(
      'storage_unavailable',
      'access',
      'Browser localStorage API is unavailable in this environment.'
    );
  }

  return storage as Storage;
}

export function safeGetItem(key: string): StorageReadResult {
  try {
    const storage = getSafeLocalStorage();
    const value = storage.getItem(key);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: toSafeStorageError(err, 'getItem', 'storage_unavailable', key),
    };
  }
}

export function safeSetItem(key: string, value: string): StorageWriteResult {
  try {
    const storage = getSafeLocalStorage();
    storage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: toSafeStorageError(err, 'setItem', 'storage_unavailable', key),
    };
  }
}

export function safeRemoveItem(key: string): StorageWriteResult {
  try {
    const storage = getSafeLocalStorage();
    storage.removeItem(key);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: toSafeStorageError(err, 'removeItem', 'storage_unavailable', key),
    };
  }
}

const STORAGE_PROBE_KEY = '__gl_storage_probe__';

/**
 * Probes whether localStorage permits reading, writing, and removing a sentinel key
 * without reading or mutating any GAINLOG domain keys.
 */
export function probeLocalStorageWritable(): StorageWriteResult {
  try {
    const storage = getSafeLocalStorage();
    storage.setItem(STORAGE_PROBE_KEY, '1');
    const verified = storage.getItem(STORAGE_PROBE_KEY);
    storage.removeItem(STORAGE_PROBE_KEY);
    if (verified !== '1') {
      return {
        ok: false,
        error: new SafeStorageError(
          'storage_unavailable',
          'probe',
          'Browser localStorage write verification probe failed.'
        ),
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: toSafeStorageError(err, 'probe', 'storage_unavailable'),
    };
  }
}
