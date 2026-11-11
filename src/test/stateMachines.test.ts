import { describe, it, expect } from 'vitest';
import {
  initialNavigationState,
  navigationTransition,
  getActiveTabFromRoute,
  getSelectedWorkoutId
} from '../state/app/navigationMachine';
import {
  initialSessionLifecycleState,
  sessionLifecycleTransition
} from '../state/session/sessionMachine';
import {
  initialCoachingState,
  coachingTransition
} from '../state/session/coachingMachine';
import {
  initialAuthState,
  authTransition
} from '../state/sync/authMachine';
import {
  initialSyncPhase,
  syncTransition
} from '../state/sync/syncMachine';
import {
  initialDatabaseState,
  databaseTransition
} from '../state/persistence/databaseMachine';
import {
  initialBackupPhase,
  backupTransition
} from '../state/persistence/backupMachine';
import {
  initialConfirmationState,
  confirmationTransition
} from '../state/dialogs/confirmationMachine';

describe('State Machine Architecture Test Suite (Canonical Machines)', () => {
  describe('1. Navigation State Machine', () => {
    it('starts on dashboard and transitions between standard tabs', () => {
      let state = initialNavigationState;
      expect(state.route).toBe('dashboard');

      state = navigationTransition(state, { type: 'NAVIGATE', to: 'history' });
      expect(state.route).toBe('history');
      expect(getActiveTabFromRoute(state)).toBe('history');

      state = navigationTransition(state, { type: 'NAVIGATE', to: 'analytics' });
      expect(state.route).toBe('analytics');

      state = navigationTransition(state, { type: 'NAVIGATE', to: 'manage' });
      expect(state.route).toBe('manage');
    });

    it('serializes leave requests with unique IDs and protects against destination clobbering', () => {
      let state = navigationTransition(initialNavigationState, {
        type: 'START_SESSION',
        workoutId: 'push-a'
      });
      expect(state.route).toBe('session');
      expect(getSelectedWorkoutId(state)).toBe('push-a');

      // Request leave to history with requestId 'req_1'
      state = navigationTransition(state, {
        type: 'REQUEST_LEAVE_SESSION',
        requestId: 'req_1',
        destination: 'history'
      });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveRequest?.id).toBe('req_1');
        expect(state.pendingLeaveRequest?.destination).toBe('history');
      }

      // Concurrent request to dashboard while req_1 is open is rejected
      state = navigationTransition(state, {
        type: 'REQUEST_LEAVE_SESSION',
        requestId: 'req_2',
        destination: 'dashboard'
      });
      if (state.route === 'session') {
        expect(state.pendingLeaveRequest?.id).toBe('req_1');
        expect(state.pendingLeaveRequest?.destination).toBe('history');
      }

      // Mismatched confirm ID is ignored
      state = navigationTransition(state, {
        type: 'CONFIRM_LEAVE_SESSION',
        requestId: 'req_wrong'
      });
      expect(state.route).toBe('session');

      // Matching cancel clears request and preserves session
      state = navigationTransition(state, {
        type: 'CANCEL_LEAVE_SESSION',
        requestId: 'req_1'
      });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveRequest).toBeUndefined();
      }

      // Fresh leave request can now be opened and confirmed to dashboard
      state = navigationTransition(state, {
        type: 'REQUEST_LEAVE_SESSION',
        requestId: 'req_3',
        destination: 'dashboard'
      });
      state = navigationTransition(state, {
        type: 'CONFIRM_LEAVE_SESSION',
        requestId: 'req_3'
      });
      expect(state.route).toBe('dashboard');
    });

    it('implements deterministic Android hardware-back semantics', () => {
      // In sub-tab -> back navigates to dashboard
      let state = navigationTransition(initialNavigationState, { type: 'NAVIGATE', to: 'analytics' });
      state = navigationTransition(state, { type: 'ANDROID_BACK' });
      expect(state.route).toBe('dashboard');

      // In session -> back requests leaving session to dashboard with requestId
      state = navigationTransition(state, { type: 'START_SESSION', workoutId: 'pull-a' });
      state = navigationTransition(state, { type: 'ANDROID_BACK', requestId: 'req_back_1' });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveRequest?.id).toBe('req_back_1');
        expect(state.pendingLeaveRequest?.destination).toBe('dashboard');
      }

      // Repeated back event while confirmation is open is ignored
      const repeated = navigationTransition(state, { type: 'ANDROID_BACK', requestId: 'req_back_2' });
      if (repeated.route === 'session') {
        expect(repeated.pendingLeaveRequest?.id).toBe('req_back_1');
      }
    });
  });

  describe('2. Active Workout Session Machine', () => {
    it('progresses linearly: idle -> running -> validating -> committing -> completed', () => {
      let state = initialSessionLifecycleState;
      expect(state.phase).toBe('idle');

      state = sessionLifecycleTransition(state, { type: 'START', workoutId: 'push-a', startTime: 1000 });
      expect(state.phase).toBe('running');

      state = sessionLifecycleTransition(state, { type: 'REQUEST_FINISH', workoutId: 'push-a', startTime: 1000 });
      expect(state.phase).toBe('validating');

      state = sessionLifecycleTransition(state, { type: 'VALIDATION_PASSED' });
      expect(state.phase).toBe('committing');

      state = sessionLifecycleTransition(state, { type: 'COMMIT_SUCCEEDED', logId: 'log_123' });
      expect(state.phase).toBe('completed');
      if (state.phase === 'completed') {
        expect(state.logId).toBe('log_123');
      }

      // Invariant: cannot finish twice
      const afterDuplicateFinish = sessionLifecycleTransition(state, { type: 'REQUEST_FINISH', workoutId: 'push-a', startTime: 1000 });
      expect(afterDuplicateFinish.phase).toBe('completed');
    });

    it('preserves draft in recoverable error state on commit failure', () => {
      let state = sessionLifecycleTransition(initialSessionLifecycleState, {
        type: 'START',
        workoutId: 'push-a',
        startTime: 1000
      });
      state = sessionLifecycleTransition(state, { type: 'REQUEST_FINISH', workoutId: 'push-a', startTime: 1000 });
      state = sessionLifecycleTransition(state, { type: 'VALIDATION_PASSED' });
      state = sessionLifecycleTransition(state, { type: 'COMMIT_FAILED', error: 'Disk write failed' });

      expect(state.phase).toBe('error');
      if (state.phase === 'error') {
        expect(state.recoverable).toBe(true);
        expect(state.workoutId).toBe('push-a');
        expect(state.startTime).toBe(1000);
      }

      // Restoring draft or restarting preserves recovery
      state = sessionLifecycleTransition(state, { type: 'RESTORE_DRAFT', workoutId: 'push-a', startTime: 1000 });
      expect(state.phase).toBe('running');
    });

    it('handles explicit reset workflow', () => {
      let state = sessionLifecycleTransition(initialSessionLifecycleState, {
        type: 'START',
        workoutId: 'push-a',
        startTime: 1000
      });
      expect(state.phase).toBe('running');

      state = sessionLifecycleTransition(state, { type: 'RESET' });
      expect(state.phase).toBe('idle');
    });
  });

  describe('3. AI Coaching Request Machine', () => {
    it('isolates per-exercise request state with unique request IDs', () => {
      let state = initialCoachingState;

      // Exercise 1 requests advice
      state = coachingTransition(state, { type: 'REQUEST_STARTED', exerciseId: 'ex_bench', requestId: 'req_1' });
      expect(state['ex_bench'].status).toBe('loading');

      // Exercise 2 requests advice simultaneously
      state = coachingTransition(state, { type: 'REQUEST_STARTED', exerciseId: 'ex_squat', requestId: 'req_2' });
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_squat'].status).toBe('loading');

      // Exercise 1 succeeds
      state = coachingTransition(state, {
        type: 'REQUEST_SUCCEEDED',
        exerciseId: 'ex_bench',
        requestId: 'req_1',
        advice: 'Control descent'
      });
      expect(state['ex_bench'].status).toBe('success');
      expect(state['ex_bench'].advice).toBe('Control descent');
      expect(state['ex_squat'].status).toBe('loading');

      // Exercise 2 receives fallback
      state = coachingTransition(state, {
        type: 'REQUEST_FALLBACK',
        exerciseId: 'ex_squat',
        requestId: 'req_2',
        advice: 'Stay upright'
      });
      expect(state['ex_squat'].status).toBe('fallback');
    });

    it('prevents older aborted request from clearing newer request loading state and restores previous advice', () => {
      let state = initialCoachingState;

      // Request 1 succeeds
      state = coachingTransition(state, { type: 'REQUEST_STARTED', exerciseId: 'ex_bench', requestId: 'req_1' });
      state = coachingTransition(state, {
        type: 'REQUEST_SUCCEEDED',
        exerciseId: 'ex_bench',
        requestId: 'req_1',
        advice: 'Old Advice'
      });
      expect(state['ex_bench'].status).toBe('success');
      expect(state['ex_bench'].advice).toBe('Old Advice');

      // Request 2 starts for same exercise (replaces request 1)
      state = coachingTransition(state, { type: 'REQUEST_STARTED', exerciseId: 'ex_bench', requestId: 'req_2' });
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_bench'].advice).toBe('Old Advice'); // Preserved while loading!

      // Delayed cancel/abort from older request 1 arrives -> MUST NOT clear request 2's loading state!
      state = coachingTransition(state, { type: 'REQUEST_CANCELLED', exerciseId: 'ex_bench', requestId: 'req_1' });
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_bench'].activeRequestId).toBe('req_2');

      // Now cancel request 2 -> restores previous advice 'Old Advice'
      state = coachingTransition(state, { type: 'REQUEST_CANCELLED', exerciseId: 'ex_bench', requestId: 'req_2' });
      expect(state['ex_bench'].status).toBe('success');
      expect(state['ex_bench'].advice).toBe('Old Advice');
    });
  });

  describe('4. Auth and Sync State Machines', () => {
    it('auth machine handles full login, resolve and logout lifecycle', () => {
      let state = initialAuthState;
      expect(state.status).toBe('initializing');

      state = authTransition(state, { type: 'AUTH_RESOLVED', user: null });
      expect(state.status).toBe('anonymous');

      state = authTransition(state, { type: 'LOGIN_REQUESTED' });
      expect(state.status).toBe('authenticating');

      state = authTransition(state, {
        type: 'LOGIN_SUCCEEDED',
        user: { uid: 'user_1', email: 'test@gainlog.app' }
      });
      expect(state.status).toBe('authenticated');

      state = authTransition(state, { type: 'LOGOUT_REQUESTED' });
      expect(state.status).toBe('signing_out');

      state = authTransition(state, { type: 'LOGOUT_COMPLETED' });
      expect(state.status).toBe('anonymous');
    });

    it('sync machine distinguishes offline from generic failed and enforces generation guards', () => {
      let state = initialSyncPhase;

      // Start sync for User A, Generation 1
      state = syncTransition(state, {
        type: 'SYNC_STARTED',
        uid: 'user_A',
        generation: 1
      });
      expect(state.status).toBe('syncing');

      // Stale callback from older generation 0 arrives -> dropped
      state = syncTransition(state, {
        type: 'SYNC_SUCCEEDED',
        uid: 'user_A',
        generation: 0,
        timestamp: 5000
      });
      expect(state.status).toBe('syncing');

      // Valid callback transitions to synced
      state = syncTransition(state, {
        type: 'SYNC_SUCCEEDED',
        uid: 'user_A',
        generation: 1,
        timestamp: 6000
      });
      expect(state.status).toBe('synced');
      if (state.status === 'synced') {
        expect(state.lastSyncedAt).toBe(6000);
      }

      // Offline failure cleanly sets offline status, not generic failed
      state = syncTransition(state, {
        type: 'SYNC_STARTED',
        uid: 'user_A',
        generation: 1
      });
      state = syncTransition(state, {
        type: 'SYNC_FAILED',
        uid: 'user_A',
        generation: 1,
        error: 'Network unreachable',
        isOffline: true
      });
      expect(state.status).toBe('offline');

      // Coming online transitions back to idle for sync retry
      state = syncTransition(state, { type: 'NETWORK_ONLINE' });
      expect(state.status).toBe('idle');
    });
  });

  describe('5. Persistence and Backup Machines', () => {
    it('database machine tracks concurrent write queue and protects storage errors', () => {
      let state = initialDatabaseState;
      expect(state.phase).toBe('ready');

      // Two writes start in close succession
      state = databaseTransition(state, { type: 'WRITE_STARTED' });
      expect(state.phase).toBe('persisting');
      if (state.phase === 'persisting') expect(state.pendingWrites).toBe(1);

      state = databaseTransition(state, { type: 'WRITE_STARTED' });
      if (state.phase === 'persisting') expect(state.pendingWrites).toBe(2);

      // First commits
      state = databaseTransition(state, { type: 'WRITE_COMMITTED' });
      if (state.phase === 'persisting') expect(state.pendingWrites).toBe(1);

      // Second commits -> ready
      state = databaseTransition(state, { type: 'WRITE_COMMITTED' });
      expect(state.phase).toBe('ready');

      // Write failure sets storage_error
      state = databaseTransition(state, { type: 'WRITE_FAILED', error: 'Quota exceeded' });
      expect(state.phase).toBe('storage_error');

      // Stale write committed does NOT clear storage_error
      const staleCommit = databaseTransition(state, { type: 'WRITE_COMMITTED' });
      expect(staleCommit.phase).toBe('storage_error');
    });

    it('backup machine serializes operations and protects against duplicate mutations', () => {
      let state = initialBackupPhase;
      state = backupTransition(state, { type: 'INIT_SUCCEEDED', count: 3 });
      expect(state.status).toBe('ready');

      state = backupTransition(state, { type: 'BACKUP_STARTED', desc: 'Pre-session savepoint' });
      expect(state.status).toBe('creating');

      // Second backup attempt while first is creating is blocked
      const blocked = backupTransition(state, { type: 'BACKUP_STARTED', desc: 'Conflict' });
      expect(blocked.status).toBe('creating');

      state = backupTransition(state, { type: 'BACKUP_SUCCEEDED', newCount: 4 });
      expect(state.status).toBe('ready');
      if (state.status === 'ready') expect(state.checkpointCount).toBe(4);
    });
  });

  describe('6. Confirmation State Machine', () => {
    it('confirmation machine serializes concurrent requests without dropping them', () => {
      let state = initialConfirmationState;
      expect(state.status).toBe('closed');

      const req1 = { id: 'r1', title: 'Confirm 1', message: 'First' };
      const req2 = { id: 'r2', title: 'Confirm 2', message: 'Second' };

      // Enqueue first request
      state = confirmationTransition(state, { type: 'ENQUEUE', request: req1 });
      expect(state.status).toBe('open');
      if (state.status === 'open') {
        expect(state.active.id).toBe('r1');
        expect(state.queue.length).toBe(0);
      }

      // Enqueue second concurrent request while first is open
      state = confirmationTransition(state, { type: 'ENQUEUE', request: req2 });
      expect(state.status).toBe('open');
      if (state.status === 'open') {
        expect(state.active.id).toBe('r1');
        expect(state.queue.length).toBe(1);
        expect(state.queue[0].id).toBe('r2');
      }

      // Resolve first request -> immediately promotes second request from queue
      state = confirmationTransition(state, { type: 'RESOLVE', requestId: 'r1' });
      expect(state.status).toBe('open');
      if (state.status === 'open') {
        expect(state.active.id).toBe('r2');
        expect(state.queue.length).toBe(0);
      }

      // Resolve second request -> closes
      state = confirmationTransition(state, { type: 'RESOLVE', requestId: 'r2' });
      expect(state.status).toBe('closed');
    });
  });
});
