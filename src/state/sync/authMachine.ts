export type AuthState =
  | { readonly status: 'initializing' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticating' }
  | { readonly status: 'authenticated'; readonly uid: string; readonly email: string | null }
  | { readonly status: 'signing_out' }
  | { readonly status: 'error'; readonly message: string };

export type AuthEvent =
  | { readonly type: 'AUTH_RESOLVED'; readonly user: { uid: string; email: string | null } | null }
  | { readonly type: 'LOGIN_REQUESTED' }
  | { readonly type: 'LOGIN_SUCCEEDED'; readonly user: { uid: string; email: string | null } }
  | { readonly type: 'LOGIN_FAILED'; readonly error: string }
  | { readonly type: 'LOGOUT_REQUESTED' }
  | { readonly type: 'LOGOUT_COMPLETED' }
  | { readonly type: 'CLEAR_ERROR' };

export const initialAuthState: AuthState = { status: 'initializing' };

/**
 * Pure transition function for the Authentication lifecycle.
 * Isolates account credentials and enforces single-pass sign-out.
 */
export function authTransition(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'AUTH_RESOLVED': {
      if (event.user) {
        return {
          status: 'authenticated',
          uid: event.user.uid,
          email: event.user.email
        };
      }
      return { status: 'anonymous' };
    }

    case 'LOGIN_REQUESTED': {
      if (state.status === 'authenticating') return state;
      return { status: 'authenticating' };
    }

    case 'LOGIN_SUCCEEDED': {
      return {
        status: 'authenticated',
        uid: event.user.uid,
        email: event.user.email
      };
    }

    case 'LOGIN_FAILED': {
      return {
        status: 'error',
        message: event.error
      };
    }

    case 'LOGOUT_REQUESTED': {
      if (state.status === 'signing_out') return state;
      return { status: 'signing_out' };
    }

    case 'LOGOUT_COMPLETED': {
      return { status: 'anonymous' };
    }

    case 'CLEAR_ERROR': {
      if (state.status !== 'error') return state;
      return { status: 'anonymous' };
    }

    default:
      return state;
  }
}
