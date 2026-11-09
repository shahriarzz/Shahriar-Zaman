export type CoachingStatus = 'idle' | 'loading' | 'success' | 'fallback' | 'error';

export interface ExerciseCoachingState {
  readonly status: CoachingStatus;
  readonly advice?: string;
  readonly error?: string;
}

export type CoachingMap = Record<string, ExerciseCoachingState>;

export type CoachingEvent =
  | { readonly type: 'REQUEST_STARTED'; readonly exerciseId: string }
  | { readonly type: 'REQUEST_SUCCEEDED'; readonly exerciseId: string; readonly advice: string }
  | { readonly type: 'REQUEST_FALLBACK'; readonly exerciseId: string; readonly advice: string }
  | { readonly type: 'REQUEST_FAILED'; readonly exerciseId: string; readonly error: string }
  | { readonly type: 'REQUEST_CANCELLED'; readonly exerciseId: string }
  | { readonly type: 'CLEAR_ALL' };

export const initialCoachingState: CoachingMap = {};

/**
 * Pure state machine transition function for per-exercise AI coaching requests.
 * Ensures a request for one exercise never overwrites or clears another exercise's loading state.
 */
export function coachingTransition(state: CoachingMap, event: CoachingEvent): CoachingMap {
  switch (event.type) {
    case 'REQUEST_STARTED': {
      return {
        ...state,
        [event.exerciseId]: { status: 'loading' }
      };
    }

    case 'REQUEST_SUCCEEDED': {
      return {
        ...state,
        [event.exerciseId]: {
          status: 'success',
          advice: event.advice
        }
      };
    }

    case 'REQUEST_FALLBACK': {
      return {
        ...state,
        [event.exerciseId]: {
          status: 'fallback',
          advice: event.advice
        }
      };
    }

    case 'REQUEST_FAILED': {
      return {
        ...state,
        [event.exerciseId]: {
          status: 'error',
          error: event.error
        }
      };
    }

    case 'REQUEST_CANCELLED': {
      const prev = state[event.exerciseId];
      if (!prev || prev.status !== 'loading') return state;
      return {
        ...state,
        [event.exerciseId]: { status: 'idle' }
      };
    }

    case 'CLEAR_ALL': {
      return {};
    }

    default:
      return state;
  }
}
