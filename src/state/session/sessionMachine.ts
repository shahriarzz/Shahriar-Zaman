export type SessionLifecycleState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running'; readonly workoutId: string; readonly startTime: number }
  | { readonly phase: 'validating'; readonly workoutId: string; readonly startTime: number }
  | { readonly phase: 'committing'; readonly workoutId: string; readonly startTime: number }
  | { readonly phase: 'completed'; readonly workoutId: string; readonly logId: string }
  | { readonly phase: 'error'; readonly workoutId: string; readonly startTime: number; readonly message: string; readonly recoverable: boolean };

export type SessionLifecycleEvent =
  | { readonly type: 'START'; readonly workoutId: string; readonly startTime: number }
  | { readonly type: 'RESTORE_DRAFT'; readonly workoutId: string; readonly startTime: number }
  | { readonly type: 'REQUEST_FINISH'; readonly workoutId: string; readonly startTime: number }
  | { readonly type: 'VALIDATION_PASSED' }
  | { readonly type: 'VALIDATION_FAILED'; readonly reason: string }
  | { readonly type: 'COMMIT_SUCCEEDED'; readonly logId: string }
  | { readonly type: 'COMMIT_FAILED'; readonly error: string }
  | { readonly type: 'RESET' };

export const initialSessionLifecycleState: SessionLifecycleState = { phase: 'idle' };

/**
 * Pure transition function for active workout session lifecycle.
 * Prevents double-completion, enforces validation gates, and keeps drafts safe on failure.
 * Zero environmental reads or side effects.
 */
export function sessionLifecycleTransition(
  state: SessionLifecycleState,
  event: SessionLifecycleEvent
): SessionLifecycleState {
  switch (event.type) {
    case 'START': {
      if (state.phase === 'committing' || state.phase === 'validating') {
        // Cannot overwrite a session in the middle of validation or commit
        return state;
      }
      return {
        phase: 'running',
        workoutId: event.workoutId,
        startTime: event.startTime
      };
    }

    case 'RESTORE_DRAFT': {
      if (state.phase === 'committing' || state.phase === 'validating') {
        return state;
      }
      return {
        phase: 'running',
        workoutId: event.workoutId,
        startTime: event.startTime
      };
    }

    case 'REQUEST_FINISH': {
      if (state.phase !== 'running' && state.phase !== 'error' && state.phase !== 'idle') {
        return state;
      }
      const workoutId = state.phase === 'idle' ? event.workoutId : state.workoutId;
      const startTime = state.phase === 'idle' ? event.startTime : state.startTime;
      return {
        phase: 'validating',
        workoutId,
        startTime
      };
    }

    case 'VALIDATION_PASSED': {
      if (state.phase !== 'validating') return state;
      return {
        phase: 'committing',
        workoutId: state.workoutId,
        startTime: state.startTime
      };
    }

    case 'VALIDATION_FAILED': {
      if (state.phase !== 'validating') return state;
      return {
        phase: 'error',
        workoutId: state.workoutId,
        startTime: state.startTime,
        message: event.reason,
        recoverable: true
      };
    }

    case 'COMMIT_SUCCEEDED': {
      if (state.phase !== 'committing') return state;
      return {
        phase: 'completed',
        workoutId: state.workoutId,
        logId: event.logId
      };
    }

    case 'COMMIT_FAILED': {
      if (state.phase !== 'committing') return state;
      return {
        phase: 'error',
        workoutId: state.workoutId,
        startTime: state.startTime,
        message: event.error,
        recoverable: true // Preserves draft for retry
      };
    }

    case 'RESET': {
      return { phase: 'idle' };
    }

    default:
      return state;
  }
}
