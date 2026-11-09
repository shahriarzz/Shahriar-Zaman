export type SyncPhase =
  | { readonly status: 'idle' }
  | { readonly status: 'initial_sync'; readonly uid: string; readonly generation: number }
  | { readonly status: 'syncing'; readonly uid: string; readonly generation: number }
  | { readonly status: 'synced'; readonly uid: string; readonly lastSyncedAt: number }
  | { readonly status: 'offline'; readonly uid?: string }
  | { readonly status: 'retrying'; readonly uid: string; readonly attempt: number; readonly nextRetryAt: number }
  | { readonly status: 'failed'; readonly uid?: string; readonly error: string };

export type SyncEvent =
  | { readonly type: 'SYNC_REQUESTED'; readonly uid: string }
  | { readonly type: 'SYNC_STARTED'; readonly uid: string; readonly generation: number; readonly isInitial?: boolean }
  | { readonly type: 'SYNC_SUCCEEDED'; readonly uid: string; readonly generation: number; readonly timestamp?: number }
  | { readonly type: 'SYNC_FAILED'; readonly uid: string; readonly generation: number; readonly error: string; readonly isOffline?: boolean }
  | { readonly type: 'RETRY_SCHEDULED'; readonly uid: string; readonly attempt: number; readonly delayMs: number }
  | { readonly type: 'RETRY_CANCELLED' }
  | { readonly type: 'NETWORK_ONLINE' }
  | { readonly type: 'NETWORK_OFFLINE' }
  | { readonly type: 'ACCOUNT_CHANGED' }
  | { readonly type: 'RESET' };

export const initialSyncPhase: SyncPhase = { status: 'idle' };

/**
 * Pure state machine transition function for Cloud Synchronization.
 * Enforces generation and UID guards, preventing stale in-flight sync completions
 * from mutating newer account state.
 */
export function syncTransition(state: SyncPhase, event: SyncEvent): SyncPhase {
  switch (event.type) {
    case 'SYNC_STARTED': {
      if (event.isInitial) {
        return {
          status: 'initial_sync',
          uid: event.uid,
          generation: event.generation
        };
      }
      return {
        status: 'syncing',
        uid: event.uid,
        generation: event.generation
      };
    }

    case 'SYNC_SUCCEEDED': {
      // Invariant: Only matching UID and generation can transition to synced
      if (
        (state.status === 'syncing' || state.status === 'initial_sync') &&
        state.uid === event.uid &&
        state.generation === event.generation
      ) {
        return {
          status: 'synced',
          uid: event.uid,
          lastSyncedAt: event.timestamp || Date.now()
        };
      }
      // If generation or UID does not match, drop stale completion
      return state;
    }

    case 'SYNC_FAILED': {
      // Invariant: Only matching UID and generation can register failure
      if (
        (state.status === 'syncing' || state.status === 'initial_sync') &&
        state.uid === event.uid &&
        state.generation === event.generation
      ) {
        if (event.isOffline) {
          return { status: 'offline', uid: event.uid };
        }
        return {
          status: 'failed',
          uid: event.uid,
          error: event.error
        };
      }
      return state;
    }

    case 'RETRY_SCHEDULED': {
      return {
        status: 'retrying',
        uid: event.uid,
        attempt: event.attempt,
        nextRetryAt: Date.now() + event.delayMs
      };
    }

    case 'RETRY_CANCELLED': {
      if (state.status === 'retrying') {
        return { status: 'idle' };
      }
      return state;
    }

    case 'NETWORK_OFFLINE': {
      const uid = 'uid' in state ? state.uid : undefined;
      return { status: 'offline', uid };
    }

    case 'NETWORK_ONLINE': {
      if (state.status === 'offline') {
        return { status: 'idle' };
      }
      return state;
    }

    case 'ACCOUNT_CHANGED':
    case 'RESET': {
      return { status: 'idle' };
    }

    default:
      return state;
  }
}
