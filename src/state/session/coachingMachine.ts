export type CoachingStatus = 'idle' | 'loading' | 'success' | 'fallback' | 'error';

export interface ExerciseCoachingState {
  readonly status: CoachingStatus;
  readonly activeRequestId?: string;
  readonly advice?: string;
  readonly previousAdvice?: string;
  readonly error?: string;
}

export type CoachingMap = Record<string, ExerciseCoachingState>;

export type CoachingEvent =
  | { readonly type: 'REQUEST_STARTED'; readonly exerciseId: string; readonly requestId: string }
  | { readonly type: 'REQUEST_SUCCEEDED'; readonly exerciseId: string; readonly requestId: string; readonly advice: string }
  | { readonly type: 'REQUEST_FALLBACK'; readonly exerciseId: string; readonly requestId: string; readonly advice: string }
  | { readonly type: 'REQUEST_FAILED'; readonly exerciseId: string; readonly requestId: string; readonly error: string }
  | { readonly type: 'REQUEST_CANCELLED'; readonly exerciseId: string; readonly requestId: string }
  | { readonly type: 'CLEAR_ALL' };

export const initialCoachingState: CoachingMap = {};

/**
 * Pure state machine transition function for per-exercise AI coaching requests.
 * Uses monotonically generated request IDs to guarantee that stale responses or
 * cancellations from older aborted requests never overwrite or clear a newer request.
 * Preserves previously rendered advice while a replacement request is loading,
 * and restores previous advice if the in-flight replacement is aborted.
 */
export function coachingTransition(state: CoachingMap, event: CoachingEvent): CoachingMap {
  switch (event.type) {
    case 'REQUEST_STARTED': {
      const prev = state[event.exerciseId];
      const existingAdvice = prev?.advice || prev?.previousAdvice;
      return {
        ...state,
        [event.exerciseId]: {
          status: 'loading',
          activeRequestId: event.requestId,
          advice: existingAdvice, // Keep previous advice visible during replacement loading
          previousAdvice: existingAdvice
        }
      };
    }

    case 'REQUEST_SUCCEEDED': {
      const current = state[event.exerciseId];
      if (current?.activeRequestId && current.activeRequestId !== event.requestId) {
        // Drop stale completion from an older request
        return state;
      }
      return {
        ...state,
        [event.exerciseId]: {
          status: 'success',
          advice: event.advice,
          activeRequestId: undefined,
          previousAdvice: undefined
        }
      };
    }

    case 'REQUEST_FALLBACK': {
      const current = state[event.exerciseId];
      if (current?.activeRequestId && current.activeRequestId !== event.requestId) {
        // Drop stale completion from an older request
        return state;
      }
      return {
        ...state,
        [event.exerciseId]: {
          status: 'fallback',
          advice: event.advice,
          activeRequestId: undefined,
          previousAdvice: undefined
        }
      };
    }

    case 'REQUEST_FAILED': {
      const current = state[event.exerciseId];
      if (current?.activeRequestId && current.activeRequestId !== event.requestId) {
        // Drop stale failure from an older request
        return state;
      }
      return {
        ...state,
        [event.exerciseId]: {
          status: 'error',
          error: event.error,
          activeRequestId: undefined,
          previousAdvice: undefined
        }
      };
    }

    case 'REQUEST_CANCELLED': {
      const current = state[event.exerciseId];
      if (!current) return state;
      if (current.activeRequestId && current.activeRequestId !== event.requestId) {
        // Newer request already in-flight: do NOT clear its loading state!
        return state;
      }
      // If previous valid advice existed, restore it instead of destroying valid results
      if (current.previousAdvice) {
        return {
          ...state,
          [event.exerciseId]: {
            status: 'success',
            advice: current.previousAdvice,
            activeRequestId: undefined,
            previousAdvice: undefined
          }
        };
      }
      return {
        ...state,
        [event.exerciseId]: {
          status: 'idle',
          activeRequestId: undefined
        }
      };
    }

    case 'CLEAR_ALL': {
      return {};
    }

    default:
      return state;
  }
}
