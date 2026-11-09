export type DatabaseState =
  | { readonly phase: 'ready' }
  | { readonly phase: 'persisting'; readonly pendingWrites: number }
  | { readonly phase: 'recovering' }
  | { readonly phase: 'storage_error'; readonly error: string; readonly canRetry: boolean };

export type DatabaseEvent =
  | { readonly type: 'WRITE_STARTED' }
  | { readonly type: 'WRITE_COMMITTED' }
  | { readonly type: 'WRITE_FAILED'; readonly error: string }
  | { readonly type: 'RECOVERY_STARTED' }
  | { readonly type: 'RECOVERY_SUCCEEDED' }
  | { readonly type: 'RESET' };

export const initialDatabaseState: DatabaseState = { phase: 'ready' };

/**
 * Pure transition function for the local storage database lifecycle.
 * Prevents silent persistence failures and verifies storage durability.
 */
export function databaseTransition(state: DatabaseState, event: DatabaseEvent): DatabaseState {
  switch (event.type) {
    case 'WRITE_STARTED': {
      if (state.phase === 'persisting') {
        return {
          phase: 'persisting',
          pendingWrites: state.pendingWrites + 1
        };
      }
      return {
        phase: 'persisting',
        pendingWrites: 1
      };
    }

    case 'WRITE_COMMITTED': {
      if (state.phase === 'persisting') {
        const remaining = Math.max(0, state.pendingWrites - 1);
        if (remaining === 0) {
          return { phase: 'ready' };
        }
        return {
          phase: 'persisting',
          pendingWrites: remaining
        };
      }
      // Never let an unrelated or stale WRITE_COMMITTED clear a storage_error or overwrite recovery
      return state;
    }

    case 'WRITE_FAILED': {
      return {
        phase: 'storage_error',
        error: event.error,
        canRetry: true
      };
    }

    case 'RECOVERY_STARTED': {
      return { phase: 'recovering' };
    }

    case 'RECOVERY_SUCCEEDED': {
      return { phase: 'ready' };
    }

    case 'RESET': {
      return { phase: 'ready' };
    }

    default:
      return state;
  }
}
