export type BackupPhase =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly checkpointCount: number }
  | { readonly status: 'migrating' }
  | { readonly status: 'creating'; readonly desc: string; readonly previousCheckpointCount: number }
  | { readonly status: 'restoring'; readonly timestamp: string; readonly previousCheckpointCount: number }
  | { readonly status: 'importing'; readonly previousCheckpointCount: number }
  | { readonly status: 'clearing'; readonly previousCheckpointCount: number }
  | { readonly status: 'error'; readonly error: string; readonly previousStatus?: 'ready' | 'loading'; readonly previousCheckpointCount: number };

export type BackupEvent =
  | { readonly type: 'INIT_STARTED' }
  | { readonly type: 'INIT_SUCCEEDED'; readonly count: number }
  | { readonly type: 'MIGRATION_STARTED' }
  | { readonly type: 'MIGRATION_SUCCEEDED'; readonly count: number }
  | { readonly type: 'BACKUP_STARTED'; readonly desc: string }
  | { readonly type: 'BACKUP_SUCCEEDED'; readonly newCount?: number }
  | { readonly type: 'BACKUP_FAILED'; readonly error: string }
  | { readonly type: 'RESTORE_STARTED'; readonly timestamp: string }
  | { readonly type: 'RESTORE_SUCCEEDED'; readonly count?: number }
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
      return { status: 'creating', desc: event.desc, previousCheckpointCount: state.checkpointCount };
    }

    case 'BACKUP_SUCCEEDED': {
      if (state.status !== 'creating') return state;
      return {
        status: 'ready',
        checkpointCount: event.newCount !== undefined ? event.newCount : state.previousCheckpointCount + 1
      };
    }

    case 'BACKUP_FAILED': {
      const prevCount = 'checkpointCount' in state
        ? state.checkpointCount
        : ('previousCheckpointCount' in state ? state.previousCheckpointCount : 0);
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready',
        previousCheckpointCount: prevCount
      };
    }

    case 'RESTORE_STARTED': {
      if (state.status !== 'ready') return state;
      return { status: 'restoring', timestamp: event.timestamp, previousCheckpointCount: state.checkpointCount };
    }

    case 'RESTORE_SUCCEEDED': {
      if (state.status !== 'restoring') return state;
      return {
        status: 'ready',
        checkpointCount: event.count !== undefined ? event.count : state.previousCheckpointCount
      };
    }

    case 'RESTORE_FAILED': {
      const prevCount = 'checkpointCount' in state
        ? state.checkpointCount
        : ('previousCheckpointCount' in state ? state.previousCheckpointCount : 0);
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready',
        previousCheckpointCount: prevCount
      };
    }

    case 'IMPORT_STARTED': {
      if (state.status !== 'ready' && state.status !== 'loading') return state;
      const count = state.status === 'ready' ? state.checkpointCount : 0;
      return { status: 'importing', previousCheckpointCount: count };
    }

    case 'IMPORT_SUCCEEDED': {
      if (state.status !== 'importing') return state;
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'IMPORT_FAILED': {
      const prevCount = 'checkpointCount' in state
        ? state.checkpointCount
        : ('previousCheckpointCount' in state ? state.previousCheckpointCount : 0);
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready',
        previousCheckpointCount: prevCount
      };
    }

    case 'CLEAR_STARTED': {
      const count = state.status === 'ready' ? state.checkpointCount : 0;
      return { status: 'clearing', previousCheckpointCount: count };
    }

    case 'CLEAR_SUCCEEDED': {
      if (state.status !== 'clearing') return state;
      return { status: 'ready', checkpointCount: 0 };
    }

    case 'CLEAR_FAILED': {
      const prevCount = 'checkpointCount' in state
        ? state.checkpointCount
        : ('previousCheckpointCount' in state ? state.previousCheckpointCount : 0);
      return {
        status: 'error',
        error: event.error,
        previousStatus: 'ready',
        previousCheckpointCount: prevCount
      };
    }

    case 'DISMISS_ERROR': {
      if (state.status === 'error') {
        return {
          status: state.previousStatus || 'ready',
          checkpointCount: state.previousCheckpointCount
        };
      }
      return state;
    }

    default:
      return state;
  }
}
