import { ActiveTab } from '../../types/navigation';

export interface LeaveSessionRequest {
  readonly id: string;
  readonly destination: ActiveTab;
}

export type NavigationState =
  | { readonly route: 'dashboard' }
  | { readonly route: 'history' }
  | { readonly route: 'analytics' }
  | { readonly route: 'manage' }
  | { readonly route: 'session'; readonly workoutId: string; readonly pendingLeaveRequest?: LeaveSessionRequest };

export type NavigationEvent =
  | { readonly type: 'NAVIGATE'; readonly to: ActiveTab }
  | { readonly type: 'START_SESSION'; readonly workoutId: string }
  | { readonly type: 'RESUME_SESSION'; readonly workoutId: string }
  | { readonly type: 'REQUEST_LEAVE_SESSION'; readonly requestId: string; readonly destination: ActiveTab }
  | { readonly type: 'CONFIRM_LEAVE_SESSION'; readonly requestId: string }
  | { readonly type: 'CANCEL_LEAVE_SESSION'; readonly requestId: string }
  | { readonly type: 'SESSION_COMPLETED' }
  | { readonly type: 'SESSION_ABANDONED' }
  | { readonly type: 'ANDROID_BACK'; readonly requestId?: string };

export const initialNavigationState: NavigationState = { route: 'dashboard' };

/**
 * Pure state machine transition function for top-level application navigation.
 * Guarantees no invalid combination of route and workout ID.
 * Safely serializes leave requests with unique IDs to prevent race conditions.
 */
export function navigationTransition(state: NavigationState, event: NavigationEvent): NavigationState {
  switch (event.type) {
    case 'NAVIGATE': {
      // If currently in a session, direct navigation to another tab must not silently discard the session.
      if (state.route === 'session') {
        return state;
      }
      if (event.to === 'session') {
        // Cannot navigate to bare session without a workout ID
        return state;
      }
      return { route: event.to };
    }

    case 'START_SESSION':
    case 'RESUME_SESSION': {
      if (!event.workoutId) return state;
      return {
        route: 'session',
        workoutId: event.workoutId
      };
    }

    case 'REQUEST_LEAVE_SESSION': {
      if (state.route !== 'session') return state;
      // If an exit request is already open, do not overwrite it with a concurrent tap
      if (state.pendingLeaveRequest) return state;
      return {
        route: 'session',
        workoutId: state.workoutId,
        pendingLeaveRequest: {
          id: event.requestId,
          destination: event.destination
        }
      };
    }

    case 'CONFIRM_LEAVE_SESSION': {
      if (state.route !== 'session') return state;
      // Stale or mismatched confirmation event: ignore
      if (!state.pendingLeaveRequest || state.pendingLeaveRequest.id !== event.requestId) {
        return state;
      }
      const target = state.pendingLeaveRequest.destination;
      if (!target || target === 'session') {
        return { route: 'dashboard' };
      }
      return { route: target };
    }

    case 'CANCEL_LEAVE_SESSION': {
      if (state.route !== 'session') return state;
      // Stale or mismatched cancellation event: ignore
      if (!state.pendingLeaveRequest || state.pendingLeaveRequest.id !== event.requestId) {
        return state;
      }
      return {
        route: 'session',
        workoutId: state.workoutId
      };
    }

    case 'SESSION_COMPLETED':
    case 'SESSION_ABANDONED': {
      return { route: 'dashboard' };
    }

    case 'ANDROID_BACK': {
      if (state.route === 'session') {
        // In session: if confirmation already open, ignore repeated back events
        if (state.pendingLeaveRequest) return state;
        if (event.requestId) {
          return {
            route: 'session',
            workoutId: state.workoutId,
            pendingLeaveRequest: {
              id: event.requestId,
              destination: 'dashboard'
            }
          };
        }
        return state;
      }
      if (state.route !== 'dashboard') {
        return { route: 'dashboard' };
      }
      return state; // In dashboard, minimization handled by native layer
    }

    default:
      return state;
  }
}

export function getActiveTabFromRoute(state: NavigationState): ActiveTab {
  return state.route;
}

export function getSelectedWorkoutId(state: NavigationState): string | null {
  return state.route === 'session' ? state.workoutId : null;
}
