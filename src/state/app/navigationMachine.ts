import { ActiveTab } from '../../components/Layout';

export type NavigationState =
  | { readonly route: 'dashboard' }
  | { readonly route: 'history' }
  | { readonly route: 'analytics' }
  | { readonly route: 'manage' }
  | { readonly route: 'session'; readonly workoutId: string; readonly pendingLeaveDestination?: ActiveTab };

export type NavigationEvent =
  | { readonly type: 'NAVIGATE'; readonly to: ActiveTab }
  | { readonly type: 'START_SESSION'; readonly workoutId: string }
  | { readonly type: 'RESUME_SESSION'; readonly workoutId: string }
  | { readonly type: 'REQUEST_LEAVE_SESSION'; readonly destination: ActiveTab }
  | { readonly type: 'CONFIRM_LEAVE_SESSION' }
  | { readonly type: 'CANCEL_LEAVE_SESSION' }
  | { readonly type: 'SESSION_COMPLETED' }
  | { readonly type: 'SESSION_ABANDONED' }
  | { readonly type: 'ANDROID_BACK' };

export const initialNavigationState: NavigationState = { route: 'dashboard' };

/**
 * Pure state machine transition function for top-level application navigation.
 * Guarantees no invalid combination of route and workout ID.
 */
export function navigationTransition(state: NavigationState, event: NavigationEvent): NavigationState {
  switch (event.type) {
    case 'NAVIGATE': {
      // If currently in a session, direct navigation to another tab must not silently discard the session.
      if (state.route === 'session') {
        if (event.to === 'session') return state;
        return {
          route: 'session',
          workoutId: state.workoutId,
          pendingLeaveDestination: event.to
        };
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
      return {
        route: 'session',
        workoutId: state.workoutId,
        pendingLeaveDestination: event.destination
      };
    }

    case 'CONFIRM_LEAVE_SESSION': {
      if (state.route !== 'session') return state;
      const target = state.pendingLeaveDestination;
      if (!target || target === 'session') {
        return { route: 'dashboard' };
      }
      return { route: target };
    }

    case 'CANCEL_LEAVE_SESSION': {
      if (state.route !== 'session') return state;
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
        // In session: request exit to dashboard
        return {
          route: 'session',
          workoutId: state.workoutId,
          pendingLeaveDestination: 'dashboard'
        };
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
