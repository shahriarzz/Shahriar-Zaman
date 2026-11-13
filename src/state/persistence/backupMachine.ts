export type BackupPhase =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly checkpointCount: number }
  | { readonly status: 'migrating' }
  | { readonly status: 'creating'; readonly desc: string; readonly previousCheckpointCount: number }
  | { readonly status: 'restoring'; readonly timestamp: string; readonly previousCheckpointCount: number }
  | { readonly status: 'importing'; readonly previousCheckpointCount: number }
  | { readonly status: 'clearing'; readonly previousCheckpointCount: number; readonly originStatus?: 'ready' | 'loading' }
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
  | { readonly type: 'FORCE_CLEAR_STARTED' }
  | { readonly type: 'CLEAR_SUCCEEDED' }
  | { readonly type: 'CLEAR_FAILED'; readonly error: string }
  | { readonly type: 'DISMISS_ERROR' };

export const initialBackupPhase: BackupPhase = { status: 'loading' };

function getCount(state: BackupPhase): number {
  if ('checkpointCount' in state) return state.checkpointCount;
  if ('previousCheckpointCount' in state) return state.previousCheckpointCount;
  return 0;
}

function getOriginStatus(state: BackupPhase): 'ready' | 'loading' {
  if (state.status === 'loading' || state.status === 'migrating') return 'loading';
  if (state.status === 'clearing') return state.originStatus || 'ready';
  if (state.status === 'error') return state.previousStatus || 'ready';
  return 'ready';
}

/**
 * Pure state machine transition function for backups and recovery.
 * Serializes mutations, ensures atomic savepoints, and protects against
 * corrupting states across account switches.
 */
export function backupTransition(state: BackupPhase, event: BackupEvent): BackupPhase {
  switch (event.type) {
    case 'INIT_STARTED': {
      if (state.status !== 'loading' && state.status !== 'error') return state;
      return { status: 'loading' };
    }

    case 'INIT_SUCCEEDED': {
      if (state.status !== 'loading' && state.status !== 'migrating') return state;
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'MIGRATION_STARTED': {
      if (state.status !== 'loading' && state.status !== 'error') return state;
      return { status: 'migrating' };
    }

    case 'MIGRATION_SUCCEEDED': {
      if (state.status !== 'migrating' && state.status !== 'loading') return state;
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'BACKUP_STARTED': {
      if (state.status !== 'ready' && state.status !== 'error') return state;
      return { status: 'creating', desc: event.desc, previousCheckpointCount: getCount(state) };
    }

    case 'BACKUP_SUCCEEDED': {
      if (state.status !== 'creating') return state;
      return {
        status: 'ready',
        checkpointCount: event.newCount !== undefined ? event.newCount : state.previousCheckpointCount + 1
      };
    }

    case 'BACKUP_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: getOriginStatus(state),
        previousCheckpointCount: getCount(state)
      };
    }

    case 'RESTORE_STARTED': {
      if (state.status !== 'ready' && state.status !== 'error') return state;
      return { status: 'restoring', timestamp: event.timestamp, previousCheckpointCount: getCount(state) };
    }

    case 'RESTORE_SUCCEEDED': {
      if (state.status !== 'restoring') return state;
      return {
        status: 'ready',
        checkpointCount: event.count !== undefined ? event.count : state.previousCheckpointCount
      };
    }

    case 'RESTORE_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: getOriginStatus(state),
        previousCheckpointCount: getCount(state)
      };
    }

    case 'IMPORT_STARTED': {
      if (state.status !== 'ready' && state.status !== 'error') return state;
      return { status: 'importing', previousCheckpointCount: getCount(state) };
    }

    case 'IMPORT_SUCCEEDED': {
      if (state.status !== 'importing') return state;
      return { status: 'ready', checkpointCount: event.count };
    }

    case 'IMPORT_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: getOriginStatus(state),
        previousCheckpointCount: getCount(state)
      };
    }

    case 'CLEAR_STARTED': {
      if (state.status !== 'ready' && state.status !== 'error') return state;
      return {
        status: 'clearing',
        previousCheckpointCount: getCount(state),
        originStatus: getOriginStatus(state)
      };
    }

    case 'FORCE_CLEAR_STARTED': {
      if (
        state.status !== 'loading' &&
        state.status !== 'migrating' &&
        state.status !== 'ready' &&
        state.status !== 'error'
      ) {
        return state;
      }
      return {
        status: 'clearing',
        previousCheckpointCount: getCount(state),
        originStatus: getOriginStatus(state)
      };
    }

    case 'CLEAR_SUCCEEDED': {
      if (state.status !== 'clearing') return state;
      return { status: 'ready', checkpointCount: 0 };
    }

    case 'CLEAR_FAILED': {
      return {
        status: 'error',
        error: event.error,
        previousStatus: getOriginStatus(state),
        previousCheckpointCount: getCount(state)
      };
    }

    case 'DISMISS_ERROR': {
      if (state.status === 'error') {
        if (state.previousStatus === 'loading') {
          return { status: 'loading' };
        }
        return {
          status: 'ready',
          checkpointCount: state.previousCheckpointCount
        };
      }
      return state;
    }

    default:
      return state;
  }
}

export type BackupOperationKind = 'create' | 'restore' | 'import' | 'clear' | 'initialize';

/**
 * Pure state machine admission guard.
 * Determines synchronously whether an operation is legally allowed to execute side effects
 * given the current synchronous machine phase.
 */
export function isBackupOperationAdmissible(state: BackupPhase, op: BackupOperationKind): boolean {
  switch (op) {
    case 'initialize':
      return state.status === 'loading' || state.status === 'error';
    case 'create':
      return state.status === 'ready' || state.status === 'error';
    case 'restore':
      return state.status === 'ready' || state.status === 'error';
    case 'import':
      return state.status === 'ready' || state.status === 'error';
    case 'clear':
      return state.status === 'ready' || state.status === 'error';
    default:
      return false;
  }
}
