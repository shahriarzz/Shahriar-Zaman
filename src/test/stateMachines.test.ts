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
  evaluateCycleSchedule,
  calculateCycleAnchorOnCompletion
} from '../state/training/cycleContract';
import {
  initialEditorMode,
  editorTransition
} from '../state/editing/editorMachine';
import {
  initialConfirmationState,
  confirmationTransition
} from '../state/dialogs/confirmationMachine';
import { INITIAL_WORKOUTS } from '../types/initialData';

describe('State Machine Architecture Test Suite (Phase 1)', () => {
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

    it('manages session lifecycle and protects against accidental discard', () => {
      let state = navigationTransition(initialNavigationState, {
        type: 'START_SESSION',
        workoutId: 'push-a'
      });
      expect(state.route).toBe('session');
      expect(getSelectedWorkoutId(state)).toBe('push-a');

      // Direct tab navigation while in session requests confirmation rather than discarding immediately
      state = navigationTransition(state, { type: 'NAVIGATE', to: 'dashboard' });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveDestination).toBe('dashboard');
      }

      // Cancelling preserves the session
      state = navigationTransition(state, { type: 'CANCEL_LEAVE_SESSION' });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveDestination).toBeUndefined();
      }

      // Confirming leave exits to destination
      state = navigationTransition(state, { type: 'REQUEST_LEAVE_SESSION', destination: 'history' });
      state = navigationTransition(state, { type: 'CONFIRM_LEAVE_SESSION' });
      expect(state.route).toBe('history');
    });

    it('implements deterministic Android hardware-back semantics', () => {
      // In sub-tab -> back navigates to dashboard
      let state = navigationTransition(initialNavigationState, { type: 'NAVIGATE', to: 'analytics' });
      state = navigationTransition(state, { type: 'ANDROID_BACK' });
      expect(state.route).toBe('dashboard');

      // In session -> back requests leaving session to dashboard
      state = navigationTransition(state, { type: 'START_SESSION', workoutId: 'pull-a' });
      state = navigationTransition(state, { type: 'ANDROID_BACK' });
      expect(state.route).toBe('session');
      if (state.route === 'session') {
        expect(state.pendingLeaveDestination).toBe('dashboard');
      }
    });
  });

  describe('2. Active Workout Session Machine', () => {
    it('progresses linearly: idle -> running -> validating -> committing -> completed', () => {
      let state = initialSessionLifecycleState;
      expect(state.phase).toBe('idle');

      state = sessionLifecycleTransition(state, { type: 'START', workoutId: 'push-a', startTime: 1000 });
      expect(state.phase).toBe('running');

      state = sessionLifecycleTransition(state, { type: 'REQUEST_FINISH' });
      expect(state.phase).toBe('validating');

      state = sessionLifecycleTransition(state, { type: 'VALIDATION_PASSED' });
      expect(state.phase).toBe('committing');

      state = sessionLifecycleTransition(state, { type: 'COMMIT_SUCCEEDED', logId: 'log_123' });
      expect(state.phase).toBe('completed');
      if (state.phase === 'completed') {
        expect(state.logId).toBe('log_123');
      }

      // Invariant: cannot finish twice
      const afterDuplicateFinish = sessionLifecycleTransition(state, { type: 'REQUEST_FINISH' });
      expect(afterDuplicateFinish.phase).toBe('completed');
    });

    it('preserves draft in recoverable error state on commit failure', () => {
      let state = sessionLifecycleTransition(initialSessionLifecycleState, {
        type: 'START',
        workoutId: 'push-a',
        startTime: 1000
      });
      state = sessionLifecycleTransition(state, { type: 'REQUEST_FINISH' });
      state = sessionLifecycleTransition(state, { type: 'VALIDATION_PASSED' });
      state = sessionLifecycleTransition(state, { type: 'COMMIT_FAILED', error: 'Disk write failed' });

      expect(state.phase).toBe('error');
      if (state.phase === 'error') {
        expect(state.recoverable).toBe(true);
        expect(state.workoutId).toBe('push-a');
        expect(state.startTime).toBe(1000);
      }

      // Editing set clears error back to running for recovery
      state = sessionLifecycleTransition(state, { type: 'UPDATE_SET' });
      expect(state.phase).toBe('running');
    });

    it('handles explicit abandonment workflow', () => {
      let state = sessionLifecycleTransition(initialSessionLifecycleState, {
        type: 'START',
        workoutId: 'push-a',
        startTime: 1000
      });
      state = sessionLifecycleTransition(state, { type: 'REQUEST_ABANDON' });
      expect(state.phase).toBe('abandoning');

      // Cancel returns to running
      state = sessionLifecycleTransition(state, { type: 'CANCEL_ABANDON' });
      expect(state.phase).toBe('running');

      // Confirm clears to idle
      state = sessionLifecycleTransition(state, { type: 'REQUEST_ABANDON' });
      state = sessionLifecycleTransition(state, { type: 'CONFIRM_ABANDON' });
      expect(state.phase).toBe('idle');
    });
  });

  describe('3. AI Coaching Request Machine', () => {
    it('isolates per-exercise request state so one exercise does not clear another', () => {
      let state = initialCoachingState;

      // Exercise 1 requests advice
      state = coachingTransition(state, { type: 'REQUEST_STARTED', exerciseId: 'ex_bench' });
      expect(state['ex_bench'].status).toBe('loading');

      // Exercise 2 requests advice simultaneously
      state = coachingTransition(state, { type: 'REQUEST_STARTED', exerciseId: 'ex_squat' });
      expect(state['ex_bench'].status).toBe('loading');
      expect(state['ex_squat'].status).toBe('loading');

      // Exercise 1 succeeds
      state = coachingTransition(state, {
        type: 'REQUEST_SUCCEEDED',
        exerciseId: 'ex_bench',
        advice: 'Control descent'
      });
      expect(state['ex_bench'].status).toBe('success');
      expect(state['ex_bench'].advice).toBe('Control descent');
      expect(state['ex_squat'].status).toBe('loading'); // Exercise 2 remains loading

      // Exercise 2 receives client fallback
      state = coachingTransition(state, {
        type: 'REQUEST_FALLBACK',
        exerciseId: 'ex_squat',
        advice: 'Stay upright'
      });
      expect(state['ex_squat'].status).toBe('fallback');
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

    it('sync machine enforces generation and UID isolation against stale callbacks', () => {
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
        generation: 0
      });
      expect(state.status).toBe('syncing');

      // Stale callback from different account User B arrives -> dropped
      state = syncTransition(state, {
        type: 'SYNC_SUCCEEDED',
        uid: 'user_B',
        generation: 1
      });
      expect(state.status).toBe('syncing');

      // Genuine callback matching User A, Generation 1 arrives -> transitions to synced
      state = syncTransition(state, {
        type: 'SYNC_SUCCEEDED',
        uid: 'user_A',
        generation: 1,
        timestamp: 12345
      });
      expect(state.status).toBe('synced');
    });
  });

  describe('5. Persistence and Backup Machines', () => {
    it('database machine tracks concurrent write queue', () => {
      let state = initialDatabaseState;
      state = databaseTransition(state, { type: 'HYDRATION_SUCCEEDED' });
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

  describe('6. Training Cycle Schedule Contract', () => {
    it('evaluates recovery days without requiring logs', () => {
      const evalDay4 = evaluateCycleSchedule({
        cycleStart: '2026-11-01',
        targetDate: '2026-11-04', // Day 4 (Recovery)
        workouts: INITIAL_WORKOUTS,
        logsForDate: []
      });
      expect(evalDay4.cycleDay).toBe(4);
      expect(evalDay4.isRestDay).toBe(true);
      expect(evalDay4.outcome.type).toBe('recovery_day');
    });

    it('does not advance cycle anchor on bonus workouts', () => {
      const bonusWorkout = {
        ...INITIAL_WORKOUTS[0],
        id: 'bonus_arms',
        isCore: false,
        cycleDay: null
      };
      const result = calculateCycleAnchorOnCompletion({
        completedWorkout: bonusWorkout,
        currentCycleStart: '2026-11-01',
        completionDate: '2026-11-05'
      });
      expect(result.shouldUpdate).toBe(false);
    });

    it('calculates cycle anchor update on out-of-order core workout', () => {
      const coreWorkoutDay1 = INITIAL_WORKOUTS.find(w => w.cycleDay === 1)!;
      // On Day 3 (2026-11-03 with cycleStart 2026-11-01), completing Day 1 out of order
      const result = calculateCycleAnchorOnCompletion({
        completedWorkout: coreWorkoutDay1,
        currentCycleStart: '2026-11-01',
        completionDate: '2026-11-03'
      });
      expect(result.shouldUpdate).toBe(true);
      expect(result.nextCycleStart).toBe('2026-11-03');
    });
  });

  describe('7. Editor & Confirmation State Machines', () => {
    it('editor guards dirty drafts against unconfirmed navigation', () => {
      let state = initialEditorMode;
      state = editorTransition(state, { type: 'OPEN_PROGRAM_EDITOR', workoutId: 'push-a' });
      expect(state.view).toBe('program_editor');
      if (state.view === 'program_editor') expect(state.draftState).toBe('clean');

      state = editorTransition(state, { type: 'EDIT_DRAFT' });
      if (state.view === 'program_editor') expect(state.draftState).toBe('dirty');

      // Attempt to close dirty editor triggers pendingExit rather than discarding
      state = editorTransition(state, { type: 'CLOSE_EDITOR' });
      expect(state.view).toBe('program_editor');
      if (state.view === 'program_editor') expect(state.pendingExit).toBe(true);

      // Confirm discard exits back to manage
      state = editorTransition(state, { type: 'CONFIRM_DISCARD' });
      expect(state.view).toBe('manage');
    });

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
