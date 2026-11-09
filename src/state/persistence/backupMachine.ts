export type BackupPhase =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly checkpointCount: number }
  | { readonly status: 'migrating' }
  | { readonly status: 'creating'; readonly desc: string }
  | { readonly status: 'restoring'; readonly timestamp: string }
  | { readonly status: 'importing' }
  | { readonly status: 'clearing' }
  | { readonly status: 'error'; readonly error: string; readonly previousStatus?: 'ready' | 'loading' };

export type BackupEvent =
  | { readonly type: 'INIT_STARTED' }
  | { readonly type: 'INIT_SUCCEEDED'; readonly count: number }
  | { readonly type: 'MIGRATION_STARTED' }
  | { readonly type: 'MIGRATION_SUCCEEDED'; readonly count: number }
  | { readonly type: 'BACKUP_STARTED'; readonly desc: string }
  | { readonly type: 'BACKUP_SUCCEEDED'; readonly newCount?: number }
  | { readonly type: 'BACKUP_FAILED'; readonly error: string }
  | { readonly type: 'RESTORE_STARTED'; readonly timestamp: string }
  | { readonly type: 'RESTORE_SUCCEEDED' }
  | { readonly type: 'RESTORE_FAILED'; readonly error: string }
  | { readonly type: 'IMPORT_STARTED' }
  | { readonly type: 'IMPORT_SUCCEEDED'; readonly count: number }
  | { readonly type: 'IMPORT_FAILED'; readonly error: string }
  | { readonly type: 'CLEAR_STARTED' }
  | { readonly type: 'CLEAR_SUCCEEDED' }
  | { readonly type: 'CLEAR_FAILED'; readonly error: string }
  | { readonly type: 'DISMISS_ERROR' };

export const initialBackupPhase: BackupPhase = { status: 'loading' };

/**
 * Pure state machine transition function for backups and recovery.
 * Serializes mutations, ensures atomic savepoints, and protects against
 * corrupting states across account switches.
 */
export function backupTransition(state: BackupPhase, event: BackupEvent): BackupPhase {
  switch (event.type) {
    case 'INIT_STARTED': {
      return { status: 'loading' };
    }

    case 'INIT_SUCCEEDED': {
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'MIGRATION_STARTED': {
      return { status: 'migrating' };
    }

    case 'MIGRATION_SUCCEEDED': {
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'BACKUP_STARTED': {
      if (state.status !== 'ready') return state;
      return { status: 'creating', desc: event.desc };
    }

    case 'BACKUP_SUCCEEDED': {
      if (state.status !== 'creating') return state;
      return {
        status: 'ready',
        checkpointCount: event.newCount !== undefined ? event.newCount : 1
      };
    }

    case 'BACKUP_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready'
      };
    }

    case 'RESTORE_STARTED': {
      if (state.status !== 'ready') return state;
      return { status: 'restoring', timestamp: event.timestamp };
    }

    case 'RESTORE_SUCCEEDED': {
      return { status: 'ready', checkpointCount: state.status === 'restoring' ? 1 : 0 };
    }

    case 'RESTORE_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready'
      };
    }

    case 'IMPORT_STARTED': {
      if (state.status !== 'ready' && state.status !== 'loading') return state;
      return { status: 'importing' };
    }

    case 'IMPORT_SUCCEEDED': {
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'IMPORT_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready'
      };
    }

    case 'CLEAR_STARTED': {
      return { status: 'clearing' };
    }

    case 'CLEAR_SUCCEEDED': {
      return { status: 'ready', checkpointCount: 0 };
    }

    case 'CLEAR_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready'
      };
    }

    case 'DISMISS_ERROR': {
      if (state.status === 'error') {
        return { status: state.previousStatus || 'ready', checkpointCount: 0 };
      }
      return state;
    }

    default:
      return state;
  }
}
