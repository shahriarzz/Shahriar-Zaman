// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildFitnessIndex,
  selectSortedLogs,
  selectLifetimeStats,
  selectPersonalBests,
  selectPersonalBestForExercise,
  selectExerciseHistory,
  selectExercise1RMProgression,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectWeightSummary
} from '../utils/fitnessDerivedSelectors';
import {
  calculateVolume,
  calculateSetVolume,
  calculateSetsVolume,
  calculateE1RM,
  calculateStreak,
  calculateLongestStreak,
  sanitizeSessionLog,
  sanitizeSetLog
} from '../utils/fitnessCalculations';
import {
  createExerciseDefinitionMap,
  resolveExercise,
  mapTargetToCategory
} from '../utils/exerciseResolver';
import {
  validateAndSanitizeFitnessData,
  extractExerciseDefinitionsFromWorkouts
} from '../utils/fitnessMigration';
import {
  areLogsEqual,
  trackDeletedId,
  getDeletedIdsTracker,
  clearDeletedIdsTracker
} from '../utils/fitnessSyncHelpers';
import { ExerciseDefinition, SessionLog, SetLog } from '../types/fitness';
import { ActiveSession } from '../hooks/useActiveSession';

const createMockLog = (partial: Partial<SessionLog> & { id: string; date: string; workoutId: string; sets: Record<string, SetLog[]> }): SessionLog => ({
  complete: true,
  durationMinutes: 45,
  ...partial
});

describe('Canonical Fitness Derived Data Contract Suite (15 Critical Invariants)', () => {
  const sampleDefinitions: ExerciseDefinition[] = [
    { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'def_incline', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
    { id: 'def_squat', name: 'Barbell Squat', target: 'Quads', equipment: 'Barbell' },
    { id: 'def_pullup', name: 'Pull Ups', target: 'Lats', equipment: 'Bodyweight' },
    { id: 'def_curl', name: 'Barbell Bicep Curl', target: 'Biceps', equipment: 'Barbell' }
  ];

  const defsMap = createExerciseDefinitionMap(sampleDefinitions);

  beforeEach(() => {
    localStorage.clear();
    clearDeletedIdsTracker();
  });

  // -------------------------------------------------------------------------
  // 1. Session → History consistency
  // -------------------------------------------------------------------------
  it('1. Session → History consistency: newly logged workout appears identically in History', () => {
    const rawSession = createMockLog({
      id: 'session_2026_08_14',
      date: '2026-08-14',
      workoutId: 'w_push',
      durationMinutes: 45,
      sets: {
        def_bench: [
          { id: 's1', weight: '100', reps: '5', done: true },
          { id: 's2', weight: '100', reps: '5', done: true },
          { id: 's3', weight: '100', reps: '5', done: false } // Incomplete
        ]
      }
    });

    const sanitized = sanitizeSessionLog(rawSession);
    const logs = { [sanitized.id]: sanitized };
    const index = buildFitnessIndex(logs, defsMap);

    const sortedLogs = selectSortedLogs(index);
    expect(sortedLogs).toHaveLength(1);
    expect(sortedLogs[0].id).toBe('session_2026_08_14');
    expect(sortedLogs[0].date).toBe('2026-08-14');

    // Volume in history
    const historyVolume = calculateVolume(sortedLogs[0]);
    expect(historyVolume).toBe(1000); // 2 completed sets of 100x5 = 1000kg
  });

  // -------------------------------------------------------------------------
  // 2. Session → Analytics consistency
  // -------------------------------------------------------------------------
  it('2. Session → Analytics consistency: session data produces identical volume and stats in Analytics', () => {
    const rawSession = createMockLog({
      id: 'session_2026_08_14',
      date: '2026-08-14',
      workoutId: 'w_push',
      durationMinutes: 45,
      sets: {
        def_bench: [
          { id: 's1', weight: '100', reps: '5', done: true },
          { id: 's2', weight: '100', reps: '5', done: true }
        ]
      }
    });

    const logs = { [rawSession.id]: rawSession };
    const index = buildFitnessIndex(logs, defsMap);
    const stats = selectLifetimeStats(index);

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalVolume).toBe(1000);
    expect(stats.totalSets).toBe(2);
    expect(stats.totalMinutes).toBe(45);
    expect(stats.currentStreak).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 3. Same exercise identity across all tabs
  // -------------------------------------------------------------------------
  it('3. Same exercise identity across all tabs: exercise identity resolves consistently', () => {
    const resolvedDirect = resolveExercise('def_bench', defsMap);
    expect(resolvedDirect.id).toBe('def_bench');
    expect(resolvedDirect.name).toBe('Barbell Bench Press');
    expect(resolvedDirect.category).toBe('Chest');

    const rawSession = createMockLog({
      id: 's_identity',
      date: '2026-08-14',
      workoutId: 'w1',
      sets: {
        def_bench: [{ id: 's1', weight: '80', reps: '8', done: true }]
      }
    });

    const index = buildFitnessIndex([rawSession], defsMap);
    const exerciseHistory = selectExerciseHistory(index, 'def_bench');
    expect(exerciseHistory).toHaveLength(1);
    expect(exerciseHistory[0].sets).toHaveLength(1);
    expect(index.volumeByExercise.get('def_bench')).toBe(640);
    const pb = selectPersonalBestForExercise(index, 'def_bench');
    expect(pb?.exerciseName).toBe('Barbell Bench Press');
    expect(pb?.category).toBe('Chest');
  });

  // -------------------------------------------------------------------------
  // 4. PB calculation
  // -------------------------------------------------------------------------
  it('4. PB calculation: calculates personal bests across multiple sessions with highest e1RM', () => {
    const logs: SessionLog[] = [
      createMockLog({
        id: 'log1',
        date: '2026-08-01',
        workoutId: 'w1',
        sets: {
          def_bench: [{ id: 's1', weight: '100', reps: '5', done: true }] // e1RM = 100 * (1 + 5/30) = 116.7
        }
      }),
      createMockLog({
        id: 'log2',
        date: '2026-08-10',
        workoutId: 'w1',
        sets: {
          def_bench: [{ id: 's2', weight: '110', reps: '3', done: true }] // e1RM = 110 * (1 + 3/30) = 121
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const benchPB = selectPersonalBestForExercise(index, 'def_bench');
    expect(benchPB).toBeDefined();
    expect(benchPB?.maxWeight).toBe(110);
    expect(benchPB?.repsAtMax).toBe(3);
    expect(benchPB?.maxEpley).toBe(121);
    expect(benchPB?.date).toBe('2026-08-10');
  });

  // -------------------------------------------------------------------------
  // 5. e1RM progression
  // -------------------------------------------------------------------------
  it('5. e1RM progression: calculates chronological estimated 1RM progression points accurately', () => {
    const logs: SessionLog[] = [
      createMockLog({
        id: 'log1',
        date: '2026-08-01',
        workoutId: 'w1',
        sets: {
          def_squat: [{ id: 's1', weight: '100', reps: '10', done: true }] // 100 * (1 + 10/30) = 133.3
        }
      }),
      createMockLog({
        id: 'log2',
        date: '2026-08-08',
        workoutId: 'w1',
        sets: {
          def_squat: [{ id: 's2', weight: '120', reps: '5', done: true }] // 120 * (1 + 5/30) = 140
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const progression = selectExercise1RMProgression(index, 'def_squat');
    expect(progression).toHaveLength(2);
    expect(progression[0].date).toBe('2026-08-01');
    expect(progression[0].epley1RM).toBe(133.3);
    expect(progression[1].date).toBe('2026-08-08');
    expect(progression[1].epley1RM).toBe(140);
  });

  // -------------------------------------------------------------------------
  // 6. Muscle distribution
  // -------------------------------------------------------------------------
  it('6. Muscle distribution: aggregates volume and sets by muscle category correctly', () => {
    const logs: SessionLog[] = [
      createMockLog({
        id: 'log1',
        date: '2026-08-10',
        workoutId: 'w_push',
        sets: {
          def_bench: [{ id: 's1', weight: '100', reps: '10', done: true }], // 1000kg Chest
          def_curl: [{ id: 's2', weight: '30', reps: '10', done: true }]    // 300kg Biceps
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const distribution = selectMuscleDistribution(index);

    expect(distribution.volume.Chest).toBe(1000);
    expect(distribution.sets.Chest).toBe(1);
    expect(distribution.volume.Biceps).toBe(300);
    expect(distribution.sets.Biceps).toBe(1);
    expect(distribution.volume.Legs).toBe(0);
    expect(distribution.totalVolume).toBe(1300);
    expect(distribution.totalSets).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 7. Exercise frequency
  // -------------------------------------------------------------------------
  it('7. Exercise frequency: correctly orders exercise occurrences and totals', () => {
    const logs: SessionLog[] = [
      createMockLog({
        id: 'log1',
        date: '2026-08-01',
        workoutId: 'w1',
        sets: {
          def_bench: [{ id: 's1', weight: '100', reps: '5', done: true }],
          def_curl: [{ id: 's2', weight: '30', reps: '10', done: true }]
        }
      }),
      createMockLog({
        id: 'log2',
        date: '2026-08-03',
        workoutId: 'w2',
        sets: {
          def_bench: [{ id: 's3', weight: '100', reps: '5', done: true }]
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const frequency = selectExerciseFrequency(index);

    expect(frequency).toHaveLength(2);
    expect(frequency[0].exerciseId).toBe('def_bench');
    expect(frequency[0].count).toBe(2);
    expect(frequency[1].exerciseId).toBe('def_curl');
    expect(frequency[1].count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 8. Bodyweight exercise
  // -------------------------------------------------------------------------
  it('8. Bodyweight exercise: handles bodyweight exercise sets properly', () => {
    const logs: SessionLog[] = [
      createMockLog({
        id: 'log1',
        date: '2026-08-10',
        workoutId: 'w1',
        sets: {
          def_pullup: [
            { id: 's1', weight: '0', reps: '10', done: true }, // Bodyweight only
            { id: 's2', weight: '15', reps: '8', done: true }  // Weighted pull-up
          ]
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const pullupHistory = selectExerciseHistory(index, 'def_pullup');
    expect(pullupHistory).toHaveLength(1);
    expect(pullupHistory[0].sets).toHaveLength(2);
    expect(pullupHistory[0].maxW).toBe(15);
    expect(index.volumeByExercise.get('def_pullup')).toBe(120); // 0*10 + 15*8 = 120
  });

  // -------------------------------------------------------------------------
  // 9. Zero-weight/bodyweight set
  // -------------------------------------------------------------------------
  it('9. Zero-weight set: produces 0 volume and does not yield NaN in e1RM', () => {
    const set: SetLog = { id: 's0', weight: '0', reps: '15', done: true };
    const vol = calculateSetVolume(set);
    expect(vol).toBe(0);

    const e1rm = calculateE1RM(0, 15);
    expect(e1rm).toBe(0);
    expect(Number.isNaN(e1rm)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. Deleted exercise definition
  // -------------------------------------------------------------------------
  it('10. Deleted exercise definition: resolves missing definition ID gracefully without crash', () => {
    const deletedDefId = 'def_non_existent_exercise';
    const resolved = resolveExercise(deletedDefId, defsMap);
    expect(resolved).toBeDefined();
    expect(resolved.id).toBe(deletedDefId);
    expect(resolved.name).toBe('Unknown Exercise');
    expect(resolved.category).toBe('Core');

    const logWithDeletedEx = createMockLog({
      id: 'log_orphan',
      date: '2026-08-10',
      workoutId: 'w1',
      sets: {
        [deletedDefId]: [{ id: 's1', weight: '50', reps: '10', done: true }]
      }
    });

    const index = buildFitnessIndex([logWithDeletedEx], defsMap);
    expect(index.lifetimeStats.totalVolume).toBe(500);
    expect(index.lifetimeStats.totalSets).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 11. Legacy exercise ID migration
  // -------------------------------------------------------------------------
  it('11. Legacy exercise ID migration: extracts exercise definitions from legacy workout structures', () => {
    const legacyWorkouts = [
      {
        id: 'legacy_w1',
        name: 'Legacy Upper',
        type: 'push',
        exercises: [
          { name: 'Barbell Bench Press', target: 'Chest', sets: 3, reps: '8-10' },
          { name: 'Overhead Press', target: 'Shoulders', sets: 3, reps: '8-10' }
        ]
      }
    ];

    const { defs, workouts } = extractExerciseDefinitionsFromWorkouts(legacyWorkouts);
    expect(defs).toHaveLength(2);
    expect(defs[0].name).toBe('Barbell Bench Press');
    expect(defs[1].name).toBe('Overhead Press');
    expect(workouts[0].exercises[0].exerciseDefinitionId).toBe(defs[0].id);
  });

  // -------------------------------------------------------------------------
  // 12. Incomplete sets excluded from analytics
  // -------------------------------------------------------------------------
  it('12. Incomplete sets excluded from analytics: done:false sets are completely omitted from stats', () => {
    const log = createMockLog({
      id: 'log_partial',
      date: '2026-08-12',
      workoutId: 'w1',
      sets: {
        def_bench: [
          { id: 's1', weight: '100', reps: '5', done: true },
          { id: 's2', weight: '100', reps: '5', done: false },
          { id: 's3', weight: '200', reps: '10', done: false } // Huge weight but incomplete!
        ]
      }
    });

    const index = buildFitnessIndex([log], defsMap);
    expect(index.lifetimeStats.totalSets).toBe(1);
    expect(index.lifetimeStats.totalVolume).toBe(500);
    const pb = selectPersonalBestForExercise(index, 'def_bench');
    expect(pb?.maxWeight).toBe(100); // 200 was ignored because done: false
  });

  // -------------------------------------------------------------------------
  // 13. Multiple logs on the same date
  // -------------------------------------------------------------------------
  it('13. Multiple logs on the same date: supports morning and evening logs without collision', () => {
    const logs: SessionLog[] = [
      createMockLog({
        id: 'log_morning',
        date: '2026-08-14',
        workoutId: 'w_push',
        sets: {
          def_bench: [{ id: 's1', weight: '80', reps: '8', done: true }] // 640kg
        }
      }),
      createMockLog({
        id: 'log_evening',
        date: '2026-08-14',
        workoutId: 'w_pull',
        sets: {
          def_pullup: [{ id: 's2', weight: '20', reps: '5', done: true }] // 100kg
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    expect(index.lifetimeStats.totalSessions).toBe(2);
    expect(index.lifetimeStats.totalVolume).toBe(740);
    expect(index.logsByDate.get('2026-08-14')).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 14. Active-session data surviving refresh
  // -------------------------------------------------------------------------
  it('14. Active-session data surviving refresh: active session structure serializes and deserializes accurately', () => {
    const activeSession: ActiveSession = {
      workoutId: 'w_push',
      startTime: 1723650000000,
      sessionSets: {
        def_bench: [
          { id: 's1', weight: '100', reps: '5', done: true },
          { id: 's2', weight: '100', reps: '', done: false }
        ]
      }
    };

    const serialized = JSON.stringify(activeSession);
    const restored: ActiveSession = JSON.parse(serialized);

    expect(restored.workoutId).toBe('w_push');
    expect(restored.startTime).toBe(1723650000000);
    expect(restored.sessionSets.def_bench[0].done).toBe(true);
    expect(restored.sessionSets.def_bench[0].weight).toBe('100');
    expect(restored.sessionSets.def_bench[1].done).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 15. Firebase/local data reconciliation
  // -------------------------------------------------------------------------
  it('15. Firebase/local data reconciliation: deleted IDs tracking and log equality check', () => {
    const logA = createMockLog({
      id: 'log_1',
      date: '2026-08-10',
      workoutId: 'w1',
      sets: { def_bench: [{ id: 's1', weight: '100', reps: '5', done: true }] }
    });
    const logB = createMockLog({
      id: 'log_1',
      date: '2026-08-10',
      workoutId: 'w1',
      sets: { def_bench: [{ id: 's1', weight: '100', reps: '5', done: true }] }
    });

    expect(areLogsEqual(logA, logB)).toBe(true);

    trackDeletedId('logs', 'log_1');
    const deletedTracker = getDeletedIdsTracker();
    expect(deletedTracker.logs).toContain('log_1');
  });
});
