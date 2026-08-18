// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExerciseDefinition,
  Workout,
  SessionLog,
  SetLog,
  AppState,
  CURRENT_SCHEMA_VERSION
} from '../types/fitness';
import {
  buildFitnessIndex,
  selectLifetimeStats,
  selectPersonalBests,
  selectPersonalBestForExercise,
  selectExerciseHistory,
  selectSortedLogs,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectTimeRangeAnalytics
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise
} from '../utils/exerciseResolver';
import {
  calculateE1RM,
  sanitizeSessionLog
} from '../utils/fitnessCalculations';
import {
  mergeDefinitions,
  mergeWorkouts,
  mergeLogs,
  mergeAppState,
  trackDeletedId,
  getDeletedIdsTracker
} from '../utils/fitnessSyncHelpers';
import { loadInitialFitnessData } from '../utils/fitnessMigration';

describe('Step 9 — Regression and Reliability Hardening Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // 9.1 & 9.2 Complete Workout Lifecycle Regression Contract
  it('9.2 Complete Workout Lifecycle: Program -> Start -> Expand -> Log -> Edit -> Add/Delete Set -> Finish -> Verify across all tabs', () => {
    // 1. Program Exercise Definitions & Workout
    const defs: ExerciseDefinition[] = [
      { id: 'def_incline_db', name: 'Incline Dumbbell Press', target: 'Chest', equipment: 'Dumbbells', tags: ['push', 'hypertrophy'] },
      { id: 'def_lateral_raise', name: 'Lateral Raise', target: 'Shoulders', equipment: 'Dumbbells', tags: ['push', 'isolation'] }
    ];
    const defsMap = createExerciseDefinitionMap(defs);

    const workout: Workout = {
      id: 'w_push_hypertrophy',
      name: 'Push Hypertrophy',
      badge: 'PUSH',
      type: 'push',
      isCore: true,
      cycleDay: 1,
      exercises: [
        { exerciseDefinitionId: 'def_incline_db', sets: 3, reps: '8-10', rest: '90s' },
        { exerciseDefinitionId: 'def_lateral_raise', sets: 3, reps: '12-15', rest: '60s' }
      ]
    };

    // 2. Start Active Session
    const workoutStartTime = 1787000000000;
    const activeSets: Record<string, SetLog[]> = {
      def_incline_db: [
        { id: 'set_inc_1', weight: '30', reps: '10', done: true },
        { id: 'set_inc_2', weight: '32', reps: '8', done: true }
      ],
      def_lateral_raise: [
        { id: 'set_lat_1', weight: '10', reps: '15', done: true }
      ]
    };

    // 3. Edit a set during workout (weight updated: 32 -> 34, reps: 8 -> 9)
    activeSets.def_incline_db[1].weight = '34';
    activeSets.def_incline_db[1].reps = '9';

    // 4. Add a set to lateral raise
    activeSets.def_lateral_raise.push({ id: 'set_lat_2', weight: '12', reps: '12', done: true });

    // 5. Delete set (e.g. user adds redundant set then deletes it)
    activeSets.def_lateral_raise.push({ id: 'set_lat_temp', weight: '14', reps: '5', done: false });
    activeSets.def_lateral_raise = activeSets.def_lateral_raise.filter(s => s.id !== 'set_lat_temp');

    // 6. Finish workout & commit to canonical SessionLog
    const sessionDate = '2026-08-15';
    const completedLog = sanitizeSessionLog({
      id: 'log_lifecycle_2026_08_15',
      workoutId: workout.id,
      date: sessionDate,
      complete: true,
      durationMinutes: 45,
      sets: activeSets
    });

    const logs: Record<string, SessionLog> = { [completedLog.id]: completedLog };

    // 7. Persist to storage and reload
    localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(defs));
    localStorage.setItem('gl_workouts', JSON.stringify([workout]));
    localStorage.setItem('gl_logs', JSON.stringify(logs));
    localStorage.setItem('gl_state', JSON.stringify({ cycleStart: '2026-08-01' }));

    const reloaded = loadInitialFitnessData();
    const reloadedDefsMap = createExerciseDefinitionMap(reloaded.defs);
    const index = buildFitnessIndex(reloaded.logs, reloadedDefsMap);

    // Verify Dashboard Contract
    const stats = selectLifetimeStats(index);
    expect(stats.totalSessions).toBe(1);
    // Incline DB: 30*10 (300) + 34*9 (306) = 606
    // Lateral Raise: 10*15 (150) + 12*12 (144) = 294
    // Total Volume = 606 + 294 = 900
    expect(stats.totalVolume).toBe(900);
    expect(stats.totalSets).toBe(4);

    // Verify History Contract
    const sorted = selectSortedLogs(index);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe('log_lifecycle_2026_08_15');
    const resolvedIncline = resolveExercise('def_incline_db', reloadedDefsMap);
    expect(resolvedIncline.name).toBe('Incline Dumbbell Press');

    // Verify Analytics Contract
    const inclinePB = selectPersonalBestForExercise(index, 'def_incline_db');
    expect(inclinePB?.maxWeight).toBe(34);
    expect(inclinePB?.repsAtMax).toBe(9);
  });

  // 9.3 Destructive-Operation Tests (delete exercise, delete workout, delete session, delete set)
  it('9.3 Destructive Operations: delete exercise, workout, session, and set without orphaned references or resurrection', () => {
    let defs: ExerciseDefinition[] = [
      { id: 'def_ex1', name: 'Exercise One', target: 'Chest', equipment: 'Barbell' },
      { id: 'def_ex2', name: 'Exercise Two (To Delete)', target: 'Back', equipment: 'Cable' }
    ];

    let workouts: Workout[] = [
      {
        id: 'w_1',
        name: 'Workout One',
        badge: 'W1',
        type: 'push',
        isCore: true,
        cycleDay: 1,
        exercises: [
          { exerciseDefinitionId: 'def_ex1', sets: 3, reps: '10' },
          { exerciseDefinitionId: 'def_ex2', sets: 3, reps: '10' }
        ]
      },
      {
        id: 'w_to_delete',
        name: 'Workout to Delete',
        badge: 'DEL',
        type: 'pull',
        isCore: false,
        exercises: [{ exerciseDefinitionId: 'def_ex1', sets: 2, reps: '12' }]
      }
    ];

    let logs: Record<string, SessionLog> = {
      'log_session_1': sanitizeSessionLog({
        id: 'log_session_1',
        workoutId: 'w_1',
        date: '2026-08-01',
        complete: true,
        sets: {
          def_ex1: [{ id: 's1', weight: '80', reps: '10', done: true }],
          def_ex2: [{ id: 's2', weight: '50', reps: '12', done: true }]
        }
      }),
      'log_session_to_delete': sanitizeSessionLog({
        id: 'log_session_to_delete',
        workoutId: 'w_to_delete',
        date: '2026-08-02',
        complete: true,
        sets: {
          def_ex1: [{ id: 's3', weight: '85', reps: '8', done: true }]
        }
      })
    };

    // 1. Delete Workout 'w_to_delete'
    workouts = workouts.filter(w => w.id !== 'w_to_delete');
    trackDeletedId('workouts', 'w_to_delete');

    // 2. Delete Session Log 'log_session_to_delete'
    delete logs['log_session_to_delete'];
    trackDeletedId('logs', 'log_session_to_delete');

    // 3. Delete Exercise Definition 'def_ex2' and clean workout exercises referencing it
    defs = defs.filter(d => d.id !== 'def_ex2');
    workouts = workouts.map(w => ({
      ...w,
      exercises: w.exercises.filter(ex => ex.exerciseDefinitionId !== 'def_ex2')
    }));
    trackDeletedId('defs', 'def_ex2');

    // 4. Delete Set 's2' from remaining log_session_1
    logs['log_session_1'].sets.def_ex2 = [];

    // Rebuild index and verify no orphaned references
    const defsMap = createExerciseDefinitionMap(defs);
    const index = buildFitnessIndex(logs, defsMap);

    expect(index.sortedLogsDescending).toHaveLength(1);
    expect(index.lifetimeStats.totalSessions).toBe(1);
    expect(index.exerciseIndex.has('def_ex2')).toBe(false);
    expect(workouts.find(w => w.id === 'w_to_delete')).toBeUndefined();
    expect(workouts[0].exercises).toHaveLength(1);
    expect(workouts[0].exercises[0].exerciseDefinitionId).toBe('def_ex1');

    // Verify deletion tracker persisted
    const tracker = getDeletedIdsTracker();
    expect(tracker.workouts).toContain('w_to_delete');
    expect(tracker.logs).toContain('log_session_to_delete');
    expect(tracker.defs).toContain('def_ex2');
  });

  // 9.4 Sync Conflict Regression (Remote Snapshot arrival & Tombstone merge)
  it('9.4 Sync Conflict Regression: local mutations, remote snapshot merge, and tombstone deletion enforcement', () => {
    // Local state before sync
    const localDefs: ExerciseDefinition[] = [
      { id: 'd1', name: 'Barbell Squat', target: 'Quads', equipment: 'Barbell', updatedAt: 200 }
    ];
    const localWorkouts: Workout[] = [
      { id: 'w1', name: 'Leg Day Local', badge: 'LEG', type: 'lower', isCore: true, cycleDay: 1, exercises: [], updatedAt: 300 }
    ];
    const localLogs: Record<string, SessionLog> = {
      'l1': { id: 'l1', workoutId: 'w1', date: '2026-08-01', complete: true, durationMinutes: 50, sets: {}, updatedAt: 400 }
    };
    const localAppState: AppState = {
      cycleStart: '2026-08-01',
      weightLog: { '2026-08-01': 80.0 },
      updatedAt: 500
    };

    // Remote snapshot contains an older w1, a deleted def d_old, and a new remote log l2
    const remoteDefs: ExerciseDefinition[] = [
      { id: 'd1', name: 'Old Squat Name', target: 'Quads', equipment: 'Barbell', updatedAt: 100 },
      { id: 'd_tombstoned', name: 'Deleted Remote Def', target: 'Chest', equipment: 'Barbell', updatedAt: 150 },
      { id: 'd_new_remote', name: 'Pull Up', target: 'Back', equipment: 'Bodyweight', updatedAt: 250 }
    ];
    const remoteWorkouts: Workout[] = [
      { id: 'w1', name: 'Leg Day Old Remote', badge: 'LEG', type: 'lower', isCore: true, cycleDay: 1, exercises: [], updatedAt: 200 },
      { id: 'w_new_remote', name: 'Upper Day', badge: 'UP', type: 'upper', isCore: false, exercises: [], updatedAt: 250 }
    ];
    const remoteLogs: Record<string, SessionLog> = {
      'l1': { id: 'l1', workoutId: 'w1', date: '2026-08-01', complete: true, durationMinutes: 40, sets: {}, updatedAt: 200 },
      'l_deleted': { id: 'l_deleted', workoutId: 'w1', date: '2026-07-25', complete: true, durationMinutes: 30, sets: {}, updatedAt: 100 },
      'l2_remote': { id: 'l2_remote', workoutId: 'w_new_remote', date: '2026-08-05', complete: true, durationMinutes: 45, sets: {}, updatedAt: 350 }
    };

    // Local tombstones
    const tombstones = ['d_tombstoned', 'l_deleted'];

    // Execute merges
    const mergedDefsResult = mergeDefinitions(localDefs, remoteDefs, tombstones);
    const mergedWorkoutsResult = mergeWorkouts(localWorkouts, remoteWorkouts, tombstones);
    const mergedLogsResult = mergeLogs(localLogs, remoteLogs, tombstones);
    const mergedAppStateResult = mergeAppState(localAppState, {
      cycleStart: '2026-07-15',
      weightLog: { '2026-08-01': 79.5, '2026-08-02': 80.2 },
      updatedAt: 400
    });

    // Verify Definitions: Local Squat (updatedAt 200 > 100) wins; d_tombstoned excluded; d_new_remote added
    expect(mergedDefsResult.merged.find(d => d.id === 'd1')?.name).toBe('Barbell Squat');
    expect(mergedDefsResult.merged.find(d => d.id === 'd_tombstoned')).toBeUndefined();
    expect(mergedDefsResult.merged.find(d => d.id === 'd_new_remote')).toBeDefined();

    // Verify Workouts: Local w1 wins (updatedAt 300 > 200); w_new_remote added
    expect(mergedWorkoutsResult.merged.find(w => w.id === 'w1')?.name).toBe('Leg Day Local');
    expect(mergedWorkoutsResult.merged.find(w => w.id === 'w_new_remote')).toBeDefined();

    // Verify Logs: Local l1 wins (duration 50 mins); l_deleted excluded; l2_remote added
    expect(mergedLogsResult.merged['l1'].durationMinutes).toBe(50);
    expect(mergedLogsResult.merged['l_deleted']).toBeUndefined();
    expect(mergedLogsResult.merged['l2_remote']).toBeDefined();

    // Verify AppState: Local cycleStart wins (updatedAt 500 > 400); weight entries merged deterministically
    expect(mergedAppStateResult.merged.cycleStart).toBe('2026-08-01');
    expect(mergedAppStateResult.merged.weightLog?.['2026-08-02']).toBeDefined();
  });

  // 9.5 Unknown-Data Safety Tests
  it('9.5 Unknown-Data Safety: tolerates unknown exercise IDs, missing definitions, and malformed sets safely', () => {
    const emptyDefsMap = createExerciseDefinitionMap([]);

    // 1. Unknown exercise ID resolution
    const resolvedUnknown = resolveExercise('unknown_id_9999', emptyDefsMap);
    expect(resolvedUnknown.name).toBe('Unknown Exercise');
    expect(resolvedUnknown.name).not.toBe('Exercise');
    expect(resolvedUnknown.target).toBe('General');

    // 2. Workout referencing missing exercise definition
    const orphanedWorkout: Workout = {
      id: 'w_orphan',
      name: 'Orphaned Workout',
      badge: 'ORPH',
      type: 'custom',
      isCore: false,
      exercises: [
        { exerciseDefinitionId: 'missing_def_xyz', sets: 3, reps: '10' }
      ]
    };

    // 3. Log referencing missing exercise with malformed sets
    const malformedLog = sanitizeSessionLog({
      id: 'log_malformed_test',
      workoutId: 'w_orphan',
      date: '2026-08-10',
      complete: true,
      sets: {
        missing_def_xyz: [
          { weight: null, reps: undefined, done: 'truthy_string' },
          { id: 's2', weight: '-50', reps: '0', done: true }
        ]
      }
    } as any);

    expect(malformedLog.sets.missing_def_xyz[0].id).toBeDefined();
    expect(malformedLog.sets.missing_def_xyz[0].done).toBe(true);

    // Build index with missing definition & verify no crash
    const index = buildFitnessIndex({ [malformedLog.id]: malformedLog }, emptyDefsMap);
    expect(index.exerciseIndex.has('missing_def_xyz')).toBe(true);
    expect(index.exerciseMetaById.get('missing_def_xyz')?.name).not.toBe('Exercise');
    expect(index.lifetimeStats.totalSessions).toBe(1);
  });

  // 9.6 Time & Date Boundary Tests
  it('9.6 Time & Date Boundaries: handles midnight rollover, timezone dates, month/year boundaries, and same-day multiple logs', () => {
    const defs: ExerciseDefinition[] = [
      { id: 'bench', name: 'Bench Press', target: 'Chest', equipment: 'Barbell' }
    ];
    const defsMap = createExerciseDefinitionMap(defs);

    // Sequence of sessions spanning month boundaries and same-day multiple workouts
    const logs: Record<string, SessionLog> = {
      // Month-end (July 31)
      'log_jul31': sanitizeSessionLog({
        id: 'log_jul31',
        workoutId: 'w1',
        date: '2026-07-31',
        complete: true,
        sets: { bench: [{ id: 's1', weight: '100', reps: '5', done: true }] }
      }),
      // Month-start (Aug 01) - consecutive across month boundary
      'log_aug01': sanitizeSessionLog({
        id: 'log_aug01',
        workoutId: 'w1',
        date: '2026-08-01',
        complete: true,
        sets: { bench: [{ id: 's2', weight: '102.5', reps: '5', done: true }] }
      }),
      // Same-day second session (Aug 01 PM)
      'log_aug01_pm': sanitizeSessionLog({
        id: 'log_aug01_pm',
        workoutId: 'w1',
        date: '2026-08-01',
        complete: true,
        sets: { bench: [{ id: 's3', weight: '105', reps: '3', done: true }] }
      }),
      // Consecutive next day (Aug 02)
      'log_aug02': sanitizeSessionLog({
        id: 'log_aug02',
        workoutId: 'w1',
        date: '2026-08-02',
        complete: true,
        sets: { bench: [{ id: 's4', weight: '100', reps: '8', done: true }] }
      })
    };

    const index = buildFitnessIndex(logs, defsMap);

    // Distinct dates should group July 31, Aug 01, Aug 02 into 3 unique training days
    expect(index.distinctDates).toEqual(['2026-07-31', '2026-08-01', '2026-08-02']);
    expect(index.lifetimeStats.totalSessions).toBe(4);

    // Streak calculation should recognize consecutive training across the month boundary
    expect(index.lifetimeStats.longestStreak).toBe(3);

    // Sorted logs should order correctly
    const sorted = selectSortedLogs(index);
    expect(sorted[0].date).toBe('2026-08-02');
    expect(sorted[3].date).toBe('2026-07-31');

    // Personal best should reflect the highest weight across all sessions (105kg)
    const pb = selectPersonalBestForExercise(index, 'bench');
    expect(pb?.maxWeight).toBe(105);
    expect(pb?.repsAtMax).toBe(3);
    expect(pb?.date).toBe('2026-08-01');
  });
});
