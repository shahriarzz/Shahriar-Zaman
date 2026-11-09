export interface ConfirmationRequest {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly isDanger?: boolean;
  readonly confirmText?: string;
  readonly cancelText?: string;
}

export type ConfirmationState =
  | { readonly status: 'closed'; readonly queue: readonly ConfirmationRequest[] }
  | { readonly status: 'open'; readonly active: ConfirmationRequest; readonly queue: readonly ConfirmationRequest[] };

export type ConfirmationEvent =
  | { readonly type: 'ENQUEUE'; readonly request: ConfirmationRequest }
  | { readonly type: 'RESOLVE'; readonly requestId: string }
  | { readonly type: 'RESET' };

export const initialConfirmationState: ConfirmationState = {
  status: 'closed',
  queue: []
};

/**
 * Pure state machine transition function for Confirmation and Dialog workflows.
 * Implements a FIFO serialized queue so concurrent confirmation requests are never
 * silently discarded, and transitions deterministically on resolve.
 */
export function confirmationTransition(
  state: ConfirmationState,
  event: ConfirmationEvent
): ConfirmationState {
  switch (event.type) {
    case 'ENQUEUE': {
      if (state.status === 'closed') {
        return {
          status: 'open',
          active: event.request,
          queue: []
        };
      }
      // If already open, append to serialized queue
      return {
        status: 'open',
        active: state.active,
        queue: [...state.queue, event.request]
      };
    }

    case 'RESOLVE': {
      if (state.status === 'closed') return state;
      // Invariant: Resolution must match active request ID or be an unmount sweep
      if (state.active.id !== event.requestId && event.requestId !== '*') {
        return state;
      }

      if (state.queue.length > 0) {
        const [nextActive, ...remainingQueue] = state.queue;
        return {
          status: 'open',
          active: nextActive,
          queue: remainingQueue
        };
      }

      return {
        status: 'closed',
        queue: []
      };
    }

    case 'RESET': {
      return {
        status: 'closed',
        queue: []
      };
    }

    default:
      return state;
  }
}
