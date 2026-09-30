// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExerciseDefinition,
  Workout,
  SessionLog,
  AppState,
  CURRENT_SCHEMA_VERSION
} from '../types/fitness';
import {
  resolveLocalCloudRecord,
  mergeDefinitions,
  mergeWorkouts,
  mergeLogs,
  mergeAppState,
  trackDeletedId,
  getDeletedIdsTracker,
  clearDeletedIdsTracker
} from '../utils/fitnessSyncHelpers';
import {
  sanitizeExerciseDefinition,
  sanitizeWorkout,
  sanitizeSessionLog,
  isCompletedSession
} from '../utils/fitnessCalculations';
import { loadInitialFitnessData } from '../utils/fitnessMigration';

describe('Phase A — High-Priority Data / Sync & Isolation Regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeletedIdsTracker();
  });

  // 1. Tombstone filtering: Failed offline deletion must remain deleted upon reconnect
  describe('1. Tombstone filtering & resurrection prevention', () => {
    it('prevents deleted exercise definitions from resurrecting on cloud reconnect', () => {
      const activeDef: ExerciseDefinition = {
        id: 'def_pushup',
        name: 'Standard Pushup',
        target: 'Chest',
        updatedAt: 1000
      };
      const deletedDef: ExerciseDefinition = {
        id: 'def_dip',
        name: 'Chest Dip',
        target: 'Chest',
        updatedAt: 2000
      };

      // Record offline deletion in tombstone tracker
      trackDeletedId('defs', 'def_dip');
      const tracker = getDeletedIdsTracker();
      expect(tracker.defs).toContain('def_dip');

      // Cloud still has both records (e.g. offline deletion call failed or hadn't synced)
      const rawCloudDefs = [activeDef, deletedDef];
      // Filtering before merge as in syncDataBackground
      const cloudDefs = rawCloudDefs.filter(d => !tracker.defs.includes(d.id));

      const localDefs: ExerciseDefinition[] = [activeDef];
      const { merged } = mergeDefinitions(localDefs, cloudDefs, tracker.defs);

      expect(merged.find(d => d.id === 'def_dip')).toBeUndefined();
      expect(merged.find(d => d.id === 'def_pushup')).toBeDefined();
    });

    it('prevents deleted workouts from resurrecting on cloud reconnect', () => {
      const activeWorkout: Workout = {
        id: 'w_push_a',
        name: 'Push A',
        badge: 'PUSH',
        type: 'push',
        exercises: [],
        updatedAt: 1000
      };
      const deletedWorkout: Workout = {
        id: 'w_pull_b',
        name: 'Pull B',
        badge: 'PULL',
        type: 'pull',
        exercises: [],
        updatedAt: 2000
      };

      trackDeletedId('workouts', 'w_pull_b');
      const tracker = getDeletedIdsTracker();

      const rawCloudWorkouts = [activeWorkout, deletedWorkout];
      const cloudWorkouts = rawCloudWorkouts.filter(w => !tracker.workouts.includes(w.id));

      const localWorkouts: Workout[] = [activeWorkout];
      const { merged } = mergeWorkouts(localWorkouts, cloudWorkouts, tracker.workouts);

      expect(merged.find(w => w.id === 'w_pull_b')).toBeUndefined();
      expect(merged.find(w => w.id === 'w_push_a')).toBeDefined();
    });

    it('prevents deleted logs from resurrecting on cloud reconnect', () => {
      const activeLog: SessionLog = {
        id: 'log_active',
        workoutId: 'w_push_a',
        date: '2026-09-01',
        complete: true,
        durationMinutes: 45,
        sets: {},
        updatedAt: 1000
      };
      const deletedLog: SessionLog = {
        id: 'log_deleted',
        workoutId: 'w_pull_a',
        date: '2026-09-02',
        complete: true,
        durationMinutes: 50,
        sets: {},
        updatedAt: 2000
      };

      trackDeletedId('logs', 'log_deleted');
      const tracker = getDeletedIdsTracker();

      const rawCloudLogs: Record<string, SessionLog> = {
        log_active: activeLog,
        log_deleted: deletedLog
      };

      const cloudLogsMap: Record<string, SessionLog> = {};
      Object.entries(rawCloudLogs).forEach(([id, l]) => {
        if (!tracker.logs.includes(id)) {
          cloudLogsMap[id] = l;
        }
      });

      const localLogs: Record<string, SessionLog> = { log_active: activeLog };
      const { merged } = mergeLogs(localLogs, cloudLogsMap, tracker.logs);

      expect(merged.log_deleted).toBeUndefined();
      expect(merged.log_active).toBeDefined();
    });
  });

  // 2. Deterministic updatedAt conflict resolution
  describe('2. Canonical updatedAt conflict resolution', () => {
    it('local mutation with newer updatedAt wins and triggers upload', () => {
      const localDef: ExerciseDefinition = {
        id: 'def_1',
        name: 'Incline Dumbbell Press (Updated Local)',
        target: 'Chest',
        updatedAt: 5000
      };
      const cloudDef: ExerciseDefinition = {
        id: 'def_1',
        name: 'Incline Dumbbell Press (Stale Cloud)',
        target: 'Chest',
        updatedAt: 3000
      };

      const result = resolveLocalCloudRecord(localDef, cloudDef, false);
      expect(result.winner).toBe('local');
      expect(result.resolved?.name).toBe('Incline Dumbbell Press (Updated Local)');
      expect(result.needsUpload).toBe(true);
    });

    it('cloud mutation with newer updatedAt wins and does not trigger upload', () => {
      const localWorkout: Workout = {
        id: 'w_1',
        name: 'Stale Local Workout',
        badge: 'PUSH',
        type: 'push',
        exercises: [],
        updatedAt: 1000
      };
      const cloudWorkout: Workout = {
        id: 'w_1',
        name: 'Newer Cloud Workout',
        badge: 'PUSH',
        type: 'push',
        exercises: [],
        updatedAt: 2000
      };

      const result = resolveLocalCloudRecord(localWorkout, cloudWorkout, false);
      expect(result.winner).toBe('cloud');
      expect(result.resolved?.name).toBe('Newer Cloud Workout');
      expect(result.needsUpload).toBe(false);
    });
  });

  // 3. Two devices with different cycle starts -> newest update wins
  describe('3. Cycle start synchronization across devices', () => {
    it('device with newer updatedAt wins cycleStart resolution', () => {
      const deviceAState: AppState = {
        cycleStart: '2026-08-01',
        updatedAt: 100000
      };
      const deviceBState: AppState = {
        cycleStart: '2026-09-01',
        updatedAt: 200000
      };

      // Device A merges with Device B's cloud state
      const { merged: mergedOnA, needsUpload: aNeedsUpload } = mergeAppState(deviceAState, deviceBState);
      expect(mergedOnA.cycleStart).toBe('2026-09-01');
      expect(mergedOnA.updatedAt).toBe(200000);
      expect(aNeedsUpload).toBe(false);

      // Device B merges with Device A's stale cloud state
      const { merged: mergedOnB, needsUpload: bNeedsUpload } = mergeAppState(deviceBState, deviceAState);
      expect(mergedOnB.cycleStart).toBe('2026-09-01');
      expect(mergedOnB.updatedAt).toBe(200000);
      expect(bNeedsUpload).toBe(true); // Device B should overwrite Device A's cloud
    });
  });

  // 4. Cloud sanitization boundary: do not trust unverified Firestore records
  describe('4. Cloud records sanitization pipeline', () => {
    it('sanitizes untrusted/malformed cloud session log records', () => {
      const malformedCloudLog = {
        id: 'cloud_log_1',
        workoutId: 12345, // Number instead of string
        date: undefined,
        sets: {
          ex_1: [
            { id: null, weight: 80, reps: '10', completed: true },
            { id: '', weightKg: 85, reps: 8, done: false }
          ]
        },
        complete: 1, // Number instead of boolean
        duration: '45.8'
      };

      const sanitized = sanitizeSessionLog(malformedCloudLog as any);
      expect(sanitized.id).toBe('cloud_log_1');
      expect(sanitized.workoutId).toBe('12345');
      expect(typeof sanitized.date).toBe('string');
      expect(sanitized.complete).toBe(true);
      expect(sanitized.durationMinutes).toBe(45);
      expect(sanitized.sets.ex_1).toHaveLength(2);
      expect(sanitized.sets.ex_1[0].id).toBe('ex_1_set_0');
      expect(sanitized.sets.ex_1[0].weight).toBe('80');
      expect(sanitized.sets.ex_1[0].reps).toBe('10');
      expect(sanitized.sets.ex_1[0].done).toBe(true);
      expect(sanitized.sets.ex_1[1].weight).toBe('85');
    });

    it('sanitizes untrusted/malformed cloud exercise definitions', () => {
      const malformedDef = {
        id: 'def_custom_1',
        name: null,
        target: undefined,
        tags: 'chest,push', // String instead of array
        updatedAt: '12345'
      };

      const sanitized = sanitizeExerciseDefinition(malformedDef, 'fallback_id');
      expect(sanitized.id).toBe('def_custom_1');
      expect(sanitized.name).toBe('Exercise');
      expect(sanitized.target).toBe('General');
      expect(Array.isArray(sanitized.tags)).toBe(true);
      expect(sanitized.tags).toEqual([]);
      expect(sanitized.updatedAt).toBe(12345);
    });

    it('sanitizes untrusted/malformed cloud workouts', () => {
      const malformedWorkout = {
        id: 'w_test',
        name: undefined,
        exercises: [
          { exerciseId: 'ex_1', sets: '4', reps: 10 }
        ],
        cardio: { name: 'Rowing', detail: 'Intervals', duration: '10m' },
        updatedAt: '555'
      };

      const sanitized = sanitizeWorkout(malformedWorkout, 'w_fallback');
      expect(sanitized.id).toBe('w_test');
      expect(sanitized.name).toBe('Workout');
      expect(sanitized.exercises[0].exerciseDefinitionId).toBe('ex_1');
      expect(sanitized.exercises[0].sets).toBe(4);
      expect(sanitized.exercises[0].reps).toBe('10');
      expect(sanitized.cardio?.name).toBe('Rowing');
      expect(sanitized.updatedAt).toBe(555);
    });
  });

  // 5. Strict runtime isCompletedSession invariant
  describe('5. Strict runtime isCompletedSession invariant', () => {
    it('evaluates strictly to true only when complete === true', () => {
      expect(isCompletedSession({ complete: true })).toBe(true);
      expect(isCompletedSession({ complete: false })).toBe(false);
      expect(isCompletedSession(null)).toBe(false);
      expect(isCompletedSession(undefined)).toBe(false);

      // Malformed / legacy un-sanitized records must NOT evaluate to true at runtime
      expect(isCompletedSession({ completed: true } as any)).toBe(false);
      expect(isCompletedSession({ isComplete: true } as any)).toBe(false);
      expect(isCompletedSession({ sets: { ex1: [{ id: 's1', weight: '50', reps: '10', done: true }] } } as any)).toBe(false);
    });
  });

  // 6. User account switching & logout data isolation
  describe('6. Account switching & data isolation', () => {
    it('isolates local storage and tombstones between distinct user sessions', () => {
      // Simulate User A logging in and mutating local data
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
      localStorage.setItem('gl_logs', JSON.stringify({
        userA_log_1: {
          id: 'userA_log_1',
          workoutId: 'w_push_a',
          date: '2026-09-01',
          complete: true,
          durationMinutes: 45,
          sets: {}
        }
      }));
      trackDeletedId('logs', 'userA_deleted_log_99');

      expect(getDeletedIdsTracker().logs).toContain('userA_deleted_log_99');
      expect(localStorage.getItem('gl_logs')).toContain('userA_log_1');

      // User A logs out -> clear user storage and tombstones
      clearDeletedIdsTracker();
      localStorage.removeItem('gl_exercise_definitions');
      localStorage.removeItem('gl_workouts');
      localStorage.removeItem('gl_logs');
      localStorage.removeItem('gl_state');
      localStorage.removeItem('gl_deleted_ids');
      localStorage.removeItem('gl_auto_backups');
      localStorage.removeItem('gl_active_session');

      // Reset to fresh defaults for next session
      const freshData = loadInitialFitnessData();

      expect(getDeletedIdsTracker().logs).toHaveLength(0);
      expect(freshData.logs).toEqual({});
      expect(freshData.workouts.length).toBeGreaterThan(0); // Default templates seeded
    });
  });
});
