// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  extractExerciseDefinitionsFromWorkouts,
  migrateV1ToV2,
  validateAndSanitizeFitnessData
} from '../utils/fitnessMigration';
import {
  buildFitnessIndex,
  selectSortedLogs,
  selectLifetimeStats,
  selectPersonalBests,
  selectMuscleDistribution
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap, resolveExercise } from '../utils/exerciseResolver';

describe('Migration Regression Fixtures Suite (All Supported Legacy Formats)', () => {

  // ---------------------------------------------------------------------------
  // FIXTURE A: Legacy V1 Inline Format (No separate exerciseDefinitions array)
  // ---------------------------------------------------------------------------
  const legacyFixtureA_InlineWorkouts = {
    schemaVersion: 1,
    workouts: [
      {
        id: 'legacy_w1',
        name: 'Upper Body Power',
        badge: 'UPPER',
        type: 'push',
        cycleDay: 1,
        exercises: [
          {
            id: 'legacy_ex_incline_bench',
            name: 'Incline Barbell Bench Press',
            target: 'Upper Chest',
            equipment: 'Barbell',
            sets: 3,
            reps: '8-10',
            rest: '90s',
            note: 'Touch upper chest'
          },
          {
            id: 'legacy_ex_seated_row',
            name: 'Seated Cable Row',
            target: 'Back',
            equipment: 'Cable',
            sets: 4,
            reps: '10-12',
            rest: '60s'
          }
        ]
      },
      {
        id: 'legacy_w2',
        name: 'Lower Quad Day',
        badge: 'LOWER',
        type: 'lower',
        cycleDay: 2,
        exercises: [
          {
            id: 'legacy_ex_hack_squat',
            name: 'Hack Squat Machine',
            target: 'Quads',
            equipment: 'Machine',
            sets: 3,
            reps: '8-10'
          }
        ]
      }
    ],
    logs: {
      'log_v1_1': {
        id: 'log_v1_1',
        workoutId: 'legacy_w1',
        date: '2026-07-20',
        complete: true,
        durationMinutes: 50,
        sets: {
          'legacy_ex_incline_bench': [
            { id: 's1', weight: '85', reps: '8', done: true },
            { id: 's2', weight: '85', reps: '8', done: true },
            { id: 's3', weight: '90', reps: '6', done: true }
          ],
          'legacy_ex_seated_row': [
            { id: 'r1', weight: '70', reps: '10', done: true }
          ]
        }
      }
    },
    appState: {
      cycleStart: '2026-07-20',
      weightLog: { '2026-07-20': 80.5 }
    }
  };

  // ---------------------------------------------------------------------------
  // FIXTURE B: Legacy V1 with exerciseId property instead of exerciseDefinitionId
  // ---------------------------------------------------------------------------
  const legacyFixtureB_ExerciseIdProperty = {
    version: 1,
    workouts: [
      {
        id: 'w_pull_b',
        name: 'Back & Biceps Protocol',
        badge: 'PULL',
        type: 'pull',
        exercises: [
          {
            exerciseId: 'ex_weighted_pullup',
            name: 'Weighted Pull-Up',
            target: 'Lats',
            equipment: 'Bodyweight',
            sets: 3,
            reps: '6-8'
          },
          {
            exerciseId: 'ex_hammer_curl',
            name: 'Dumbbell Hammer Curl',
            target: 'Biceps',
            equipment: 'Dumbbells',
            sets: 3,
            reps: '12'
          }
        ]
      }
    ],
    logs: {
      'log_b_1': {
        id: 'log_b_1',
        workoutId: 'w_pull_b',
        date: '2026-07-25',
        complete: true,
        durationMinutes: 40,
        sets: {
          'ex_weighted_pullup': [{ id: 's1', weight: '20', reps: '6', done: true }],
          'ex_hammer_curl': [{ id: 's2', weight: '16', reps: '12', done: true }]
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // FIXTURE C: Legacy property aliases (weightKg, completed, duration, bodyWeightLogs)
  // ---------------------------------------------------------------------------
  const legacyFixtureC_PropertyAliases = {
    version: 1,
    workouts: [
      {
        id: 'w_leg_c',
        name: 'Leg Ext & Hamstring',
        badge: 'LEGS',
        type: 'lower',
        exercises: [
          {
            id: 'ex_leg_ext',
            name: 'Leg Extension',
            target: 'Quads',
            sets: 3,
            reps: '12-15'
          }
        ]
      }
    ],
    logs: {
      'log_c_1': {
        id: 'log_c_1',
        workoutId: 'w_leg_c',
        date: '2026-07-28',
        complete: true,
        duration: 35, // legacy alias for durationMinutes
        sets: {
          'ex_leg_ext': [
            { id: 's1', weightKg: 65, reps: 15, completed: true }, // weightKg and completed aliases
            { id: 's2', weightKg: 70, reps: 12, completed: true }
          ]
        }
      }
    },
    appState: {
      cycleStart: '2026-07-28',
      bodyWeightLogs: [
        { date: '2026-07-28', weightKg: 81.2, timestamp: 1722124800000 },
        { date: '2026-07-29', weightKg: 81.0, timestamp: 1722211200000 }
      ]
    }
  };

  // ---------------------------------------------------------------------------
  // FIXTURE D: Legacy V1 with orphaned / ad-hoc exercises in logs
  // ---------------------------------------------------------------------------
  const legacyFixtureD_OrphanedLogExercises = {
    schemaVersion: 1,
    workouts: [
      {
        id: 'w_empty',
        name: 'General Training',
        badge: 'GEN',
        type: 'custom',
        exercises: []
      }
    ],
    logs: {
      'log_orphaned': {
        id: 'log_orphaned',
        workoutId: 'w_empty',
        date: '2026-08-01',
        complete: true,
        durationMinutes: 45,
        sets: {
          'custom_unregistered_dip': [
            { id: 'dip_1', weight: '25', reps: '10', done: true }
          ]
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // FIXTURE E: Canonical Modern V2 Schema format
  // ---------------------------------------------------------------------------
  const modernFixtureE_V2Schema = {
    schemaVersion: 2,
    exerciseDefinitions: [
      { id: 'def_ohp', name: 'Overhead Press', target: 'Shoulders', equipment: 'Barbell' }
    ],
    workouts: [
      {
        id: 'w_shoulders',
        name: 'Shoulder Power',
        badge: 'OHP',
        type: 'push',
        exercises: [
          { exerciseDefinitionId: 'def_ohp', sets: 4, reps: '6-8' }
        ]
      }
    ],
    logs: {
      'log_v2_1': {
        id: 'log_v2_1',
        workoutId: 'w_shoulders',
        date: '2026-08-05',
        complete: true,
        durationMinutes: 40,
        sets: {
          'def_ohp': [{ id: 's1', weight: '60', reps: '6', done: true }]
        }
      }
    },
    appState: {
      cycleStart: '2026-08-05',
      weightLog: { '2026-08-05': { weight: 79.8, updatedAt: 1722816000000 } }
    }
  };

  // ---------------------------------------------------------------------------
  // TESTS
  // ---------------------------------------------------------------------------

  it('Fixture A: Migrates inline workouts correctly without losing workouts or turning exercises into unknown "Exercise"', () => {
    const res = validateAndSanitizeFitnessData(legacyFixtureA_InlineWorkouts);
    expect(res.success).toBe(true);
    const data = res.data!;

    // 1. No workout disappears
    expect(data.workouts).toHaveLength(2);
    expect(data.workouts[0].name).toBe('Upper Body Power');
    expect(data.workouts[1].name).toBe('Lower Quad Day');

    // 2. No exercise becomes "Exercise" / unknown incorrectly
    const inclineDef = data.exerciseDefinitions.find(d => d.id === 'legacy_ex_incline_bench');
    expect(inclineDef).toBeDefined();
    expect(inclineDef?.name).toBe('Incline Barbell Bench Press');
    expect(inclineDef?.target).toBe('Upper Chest');
    expect(inclineDef?.equipment).toBe('Barbell');

    const hackSquatDef = data.exerciseDefinitions.find(d => d.id === 'legacy_ex_hack_squat');
    expect(hackSquatDef).toBeDefined();
    expect(hackSquatDef?.name).toBe('Hack Squat Machine');

    // 3. Dates remain unchanged
    expect(data.logs['log_v1_1'].date).toBe('2026-07-20');

    // 4. Sets / reps / load remain unchanged
    const benchSets = data.logs['log_v1_1'].sets['legacy_ex_incline_bench'];
    expect(benchSets).toHaveLength(3);
    expect(benchSets[0].weight).toBe('85');
    expect(benchSets[0].reps).toBe('8');
    expect(benchSets[2].weight).toBe('90');

    // 5. IDs remain resolvable
    const defsMap = createExerciseDefinitionMap(data.exerciseDefinitions);
    const resolved = resolveExercise('legacy_ex_incline_bench', defsMap);
    expect(resolved.name).toBe('Incline Barbell Bench Press');

    // 6. Migrated data enters canonical pipeline identically
    const index = buildFitnessIndex(data.logs, defsMap);
    const stats = selectLifetimeStats(index);
    // (85*8 + 85*8 + 90*6) + (70*10) = (680 + 680 + 540) + 700 = 1900 + 700 = 2600
    expect(stats.totalVolume).toBe(2600);
    expect(stats.totalSets).toBe(4);
    expect(selectPersonalBests(index)[0].exerciseId).toBe('legacy_ex_incline_bench');
  });

  it('Fixture B: Correctly normalizes legacy exerciseId properties to exerciseDefinitionId and preserves names', () => {
    const res = validateAndSanitizeFitnessData(legacyFixtureB_ExerciseIdProperty);
    expect(res.success).toBe(true);
    const data = res.data!;

    expect(data.workouts[0].exercises[0].exerciseDefinitionId).toBe('ex_weighted_pullup');
    expect(data.workouts[0].exercises[1].exerciseDefinitionId).toBe('ex_hammer_curl');

    const pullupDef = data.exerciseDefinitions.find(d => d.id === 'ex_weighted_pullup');
    expect(pullupDef).toBeDefined();
    expect(pullupDef?.name).toBe('Weighted Pull-Up');
    expect(pullupDef?.target).toBe('Lats');

    const defsMap = createExerciseDefinitionMap(data.exerciseDefinitions);
    const index = buildFitnessIndex(data.logs, defsMap);
    const dist = selectMuscleDistribution(index);
    expect(dist.volume.Back).toBe(120); // 20 * 6 = 120
    expect(dist.volume.Biceps).toBe(192); // 16 * 12 = 192
  });

  it('Fixture C: Correctly maps legacy property aliases (weightKg, completed, duration, bodyWeightLogs)', () => {
    const res = validateAndSanitizeFitnessData(legacyFixtureC_PropertyAliases);
    expect(res.success).toBe(true);
    const data = res.data!;

    const log = data.logs['log_c_1'];
    expect(log.durationMinutes).toBe(35);

    const sets = log.sets['ex_leg_ext'];
    expect(sets).toHaveLength(2);
    expect(sets[0].weight).toBe('65');
    expect(sets[0].reps).toBe('15');
    expect(sets[0].done).toBe(true);
    expect(sets[1].weight).toBe('70');
    expect(sets[1].reps).toBe('12');
    expect(sets[1].done).toBe(true);

    // Bodyweight array migration to weightLog object
    expect(data.appState.weightLog).toBeDefined();
    expect(data.appState.weightLog?.['2026-07-28']).toEqual({ weight: 81.2, updatedAt: 1722124800000 });
    expect(data.appState.weightLog?.['2026-07-29']).toEqual({ weight: 81.0, updatedAt: 1722211200000 });
  });

  it('Fixture D: Gracefully handles unmapped / orphan exercise keys in logs by synthesizing valid definitions', () => {
    const res = validateAndSanitizeFitnessData(legacyFixtureD_OrphanedLogExercises);
    expect(res.success).toBe(true);
    const data = res.data!;

    // Synthesized definition should exist
    const orphanDef = data.exerciseDefinitions.find(d => d.id === 'custom_unregistered_dip');
    expect(orphanDef).toBeDefined();
    expect(orphanDef?.id).toBe('custom_unregistered_dip');

    // Index builds cleanly without runtime exception
    const defsMap = createExerciseDefinitionMap(data.exerciseDefinitions);
    const index = buildFitnessIndex(data.logs, defsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(250);
  });

  it('Fixture E: Ingests modern V2 schema natively with zero data mutation', () => {
    const res = validateAndSanitizeFitnessData(modernFixtureE_V2Schema);
    expect(res.success).toBe(true);
    const data = res.data!;

    expect(data.schemaVersion).toBe(2);
    expect(data.exerciseDefinitions[0].id).toBe('def_ohp');
    expect(data.workouts[0].id).toBe('w_shoulders');
    expect(data.logs['log_v2_1'].durationMinutes).toBe(40);
  });

  it('Rejects corrupt or malformed inputs cleanly with descriptive error message', () => {
    expect(validateAndSanitizeFitnessData(null).success).toBe(false);
    expect(validateAndSanitizeFitnessData("invalid string").success).toBe(false);
    expect(validateAndSanitizeFitnessData([]).success).toBe(false);
    expect(validateAndSanitizeFitnessData({ randomKey: 123 }).success).toBe(false);
  });
});
