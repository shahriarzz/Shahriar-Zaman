import { isStorageUnavailableError } from './safeStorage';

export type StartupFailureCategory =
  | 'storage_unavailable'
  | 'module_load_error'
  | 'react_mount_error'
  | 'runtime_error'
  | 'unhandled_rejection'
  | 'bootstrap_error';

export type StartupPhase = 'booting' | 'mounted' | 'failed';

export interface StartupDiagnosticEntry {
  category: StartupFailureCategory;
  message: string;
  source: string;
  timestamp: number;
}

export interface StartupDiagnosticsState {
  initializedAt: number;
  phase: StartupPhase;
  entries: StartupDiagnosticEntry[];
}

const MAX_DIAGNOSTIC_ENTRIES = 20;
const MAX_MESSAGE_LENGTH = 240;

let listenersInstalled = false;

const diagnosticsState: StartupDiagnosticsState = {
  initializedAt: Date.now(),
  phase: 'booting',
  entries: [],
};

function syncWindowDiagnostics(): void {
  if (typeof window === 'undefined') return;
  try {
    (window as unknown as Record<string, unknown>).__GAINLOG_STARTUP_DIAGNOSTICS__ = {
      initializedAt: diagnosticsState.initializedAt,
      phase: diagnosticsState.phase,
      entries: diagnosticsState.entries.map((entry) => ({ ...entry })),
    };
  } catch {
    // Never fail startup due to read-only window property
  }
}

export function sanitizeDiagnosticMessage(raw: unknown): string {
  const str = raw instanceof Error ? raw.message : String(raw ?? 'Unknown error');
  return str
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function classifyStartupFailure(
  error: unknown,
  hint?: 'storage' | 'module' | 'react' | 'error' | 'rejection' | 'bootstrap'
): StartupFailureCategory {
  if (hint === 'storage' || isStorageUnavailableError(error)) {
    return 'storage_unavailable';
  }
  const msg = sanitizeDiagnosticMessage(error).toLowerCase();
  if (
    hint === 'module' ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading css chunk')
  ) {
    return 'module_load_error';
  }
  if (hint === 'react' || msg.includes('mount root') || msg.includes('#root')) {
    return 'react_mount_error';
  }
  if (hint === 'rejection') {
    return 'unhandled_rejection';
  }
  if (hint === 'error') {
    return 'runtime_error';
  }
  return 'bootstrap_error';
}

export function recordStartupFailure(
  category: StartupFailureCategory,
  error: unknown,
  source: string
): StartupDiagnosticEntry {
  const entry: StartupDiagnosticEntry = {
    category,
    message: sanitizeDiagnosticMessage(error),
    source,
    timestamp: Date.now(),
  };

  if (diagnosticsState.entries.length >= MAX_DIAGNOSTIC_ENTRIES) {
    diagnosticsState.entries.shift();
  }
  diagnosticsState.entries.push(entry);
  diagnosticsState.phase = 'failed';
  syncWindowDiagnostics();
  return entry;
}

export function markStartupMounted(): void {
  if (diagnosticsState.phase === 'booting') {
    diagnosticsState.phase = 'mounted';
    syncWindowDiagnostics();
  }
}

export function getStartupDiagnosticsSnapshot(): StartupDiagnosticsState {
  return {
    initializedAt: diagnosticsState.initializedAt,
    phase: diagnosticsState.phase,
    entries: diagnosticsState.entries.map((entry) => ({ ...entry })),
  };
}

export function resetStartupDiagnosticsForTest(): void {
  diagnosticsState.initializedAt = Date.now();
  diagnosticsState.phase = 'booting';
  diagnosticsState.entries = [];
  syncWindowDiagnostics();
}

export function installStartupDiagnostics(): void {
  syncWindowDiagnostics();
  if (typeof window === 'undefined' || listenersInstalled) {
    return;
  }
  listenersInstalled = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    const err = event.error ?? event.message;
    const category = classifyStartupFailure(err, 'error');
    const entry = recordStartupFailure(category, err, 'window.error');
    console.error(`[StartupDiagnostics:${entry.category}]`, entry.message);
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? '');
    if (msg === 'WebSocket closed without opened.') {
      return;
    }
    const category = classifyStartupFailure(reason, 'rejection');
    const entry = recordStartupFailure(category, reason, 'window.unhandledrejection');
    console.error(`[StartupDiagnostics:${entry.category}]`, entry.message);
  });
}
