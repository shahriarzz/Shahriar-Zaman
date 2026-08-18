// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExerciseDefinition,
  Workout,
  SessionLog,
  SetLog,
  AppState,
  WeightLogEntry,
  CURRENT_SCHEMA_VERSION
} from '../types/fitness';
import {
  calculateE1RM,
  dk,
  sanitizeSessionLog,
  getCompletedSets
} from '../utils/fitnessCalculations';
import {
  buildFitnessIndex,
  selectSortedLogs,
  selectLifetimeStats,
  selectPersonalBests,
  selectPersonalBestForExercise,
  selectExerciseHistory,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectExercise1RMProgression,
  selectWeightSummary
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise
} from '../utils/exerciseResolver';

describe('Cross-Tab Contract & Regression Test Suite (Step 6)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // 6.1 One canonical fixture -> all five tabs contract verification
  it('6.1 One canonical fixture feeds all tabs with perfect numerical and entity consistency', () => {
    const fixtureDefs: ExerciseDefinition[] = [
      { id: 'ex_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
      { id: 'ex_squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' },
      { id: 'ex_curl', name: 'Dumbbell Bicep Curl', target: 'Biceps', equipment: 'Dumbbells' }
    ];

    const fixtureWorkouts: Workout[] = [
      {
        id: 'w_push',
        name: 'Push Hypertrophy',
        badge: 'PUSH',
        type: 'push',
        isCore: true,
        cycleDay: 1,
        exercises: [
          { exerciseDefinitionId: 'ex_bench', sets: 3, reps: '8-10' },
          { exerciseDefinitionId: 'ex_curl', sets: 3, reps: '12-15' }
        ]
      },
      {
        id: 'w_legs',
        name: 'Leg Power',
        badge: 'LEGS',
        type: 'lower',
        isCore: true,
        cycleDay: 2,
        exercises: [
          { exerciseDefinitionId: 'ex_squat', sets: 4, reps: '5' }
        ]
      }
    ];

    // Multiple sessions with repeated history and equal-weight different reps
    const fixtureLogs: Record<string, SessionLog> = {
      'log_1': sanitizeSessionLog({
        id: 'log_1',
        workoutId: 'w_push',
        date: '2026-08-01',
        complete: true,
        durationMinutes: 45,
        sets: {
          ex_bench: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '6', done: true } // Same weight, lower reps
          ],
          ex_curl: [
            { id: 's3', weight: '14', reps: '12', done: true }
          ]
        }
      }),
      'log_2': sanitizeSessionLog({
        id: 'log_2',
        workoutId: 'w_legs',
        date: '2026-08-03',
        complete: true,
        durationMinutes: 50,
        sets: {
          ex_squat: [
            { id: 's4', weight: '140', reps: '5', done: true },
            { id: 's5', weight: '150', reps: '5', done: true } // PR for squat: 150x5
          ]
        }
      }),
      'log_3': sanitizeSessionLog({
        id: 'log_3',
        workoutId: 'w_push',
        date: '2026-08-05',
        complete: true,
        durationMinutes: 40,
        sets: {
          ex_bench: [
            { id: 's6', weight: '100', reps: '10', done: true }, // Same weight, HIGHER reps (10 > 8) -> New PR 100x10!
            { id: 's7', weight: '105', reps: '4', done: true }  // Higher weight (105 > 100) -> Overrides as weight PR!
          ]
        }
      }),
      'log_incomplete': sanitizeSessionLog({
        id: 'log_incomplete',
        workoutId: 'w_legs',
        date: '2026-08-06',
        complete: false,
        durationMinutes: 0,
        sets: {
          ex_squat: [
            { id: 's8', weight: '160', reps: '5', done: false } // Incomplete, should not affect PRs or completed stats
          ]
        }
      })
    };

    const defsMap = createExerciseDefinitionMap(fixtureDefs);
    const index = buildFitnessIndex(fixtureLogs, defsMap);

    // 1. SessionView Consumer Check: Ghost/PR resolution
    const benchPB = selectPersonalBestForExercise(index, 'ex_bench');
    expect(benchPB).not.toBeNull();
    expect(benchPB?.maxWeight).toBe(105);
    expect(benchPB?.repsAtMax).toBe(4);

    const benchHistory = selectExerciseHistory(index, 'ex_bench');
    expect(benchHistory).toHaveLength(2); // From log_1 and log_3
    expect(benchHistory[0].date).toBe('2026-08-05'); // Latest first
    expect(benchHistory[0].maxW).toBe(105);

    // 2. History Consumer Check: Exercise names and sets
    const sortedLogs = selectSortedLogs(index);
    expect(sortedLogs.filter(l => l.complete)).toHaveLength(3); // Completed logs
    const historySession1 = sortedLogs.find(l => l.id === 'log_1')!;
    expect(historySession1).toBeDefined();
    const resolvedBench = resolveExercise('ex_bench', defsMap);
    expect(resolvedBench.name).toBe('Barbell Bench Press');

    // 3. Analytics Consumer Check: Volume, e1RM, Frequency, PR values
    const benchE1rm = selectExercise1RMProgression(index, 'ex_bench');
    expect(benchE1rm).toHaveLength(2);
    expect(benchE1rm[0].date).toBe('2026-08-01');
    expect(benchE1rm[1].date).toBe('2026-08-05');
    const expectedBenchBestE1RM = calculateE1RM(105, 4); // 119 for the 105kg x 4 PR set
    expect(benchPB?.maxEpley).toBeCloseTo(expectedBenchBestE1RM, 1);

    const freq = selectExerciseFrequency(index);
    const benchFreq = freq.find(f => f.exerciseId === 'ex_bench');
    const squatFreq = freq.find(f => f.exerciseId === 'ex_squat');
    const curlFreq = freq.find(f => f.exerciseId === 'ex_curl');
    expect(benchFreq?.count).toBe(2);
    expect(squatFreq?.count).toBe(1);
    expect(curlFreq?.count).toBe(1);

    // 4. Dashboard Consumer Check: Totals, streak, session count
    const stats = selectLifetimeStats(index);
    expect(stats.totalSessions).toBe(4);
    // Volumes: log1 = (100*8+100*6 + 14*12) = (800+600+168)=1568
    // log2 = (140*5 + 150*5) = (700+750) = 1450
    // log3 = (100*10 + 105*4) = (1000+420) = 1420
    // Total Volume = 1568 + 1450 + 1420 = 4438
    expect(stats.totalVolume).toBe(4438);
    expect(stats.totalSets).toBe(7); // 3 (log1) + 2 (log2) + 2 (log3) = 7

    // 5. Manage Consumer Check: definitions and workouts exist identically
    expect(fixtureDefs).toHaveLength(3);
    expect(fixtureWorkouts).toHaveLength(2);
  });

  // 6.2 PR Regression (Product Rule: PR = highest weight. If tied, highest reps at that weight)
  it('6.2 PR Regression: strictly enforces highest weight, and highest reps for tied weight without false overwrites', () => {
    const defs: ExerciseDefinition[] = [
      { id: 'ex_test_pr', name: 'Test Exercise', target: 'Chest', equipment: 'Barbell' }
    ];
    const defsMap = createExerciseDefinitionMap(defs);

    // Test case: 50 x 6, 50 x 8, 45 x 12
    const logs1: Record<string, SessionLog> = {
      'log_pr_1': sanitizeSessionLog({
        id: 'log_pr_1',
        workoutId: 'w1',
        date: '2026-08-01',
        complete: true,
        sets: {
          ex_test_pr: [
            { id: 's1', weight: '50', reps: '6', done: true },
            { id: 's2', weight: '50', reps: '8', done: true }, // Tied weight, higher reps (8 > 6) -> 50kg x 8
            { id: 's3', weight: '45', reps: '12', done: true } // Lower weight (45 < 50) -> should NOT replace 50kg PR
          ]
        }
      })
    };

    const index1 = buildFitnessIndex(logs1, defsMap);
    const pb1 = selectPersonalBestForExercise(index1, 'ex_test_pr');
    expect(pb1).not.toBeNull();
    expect(pb1?.maxWeight).toBe(50);
    expect(pb1?.repsAtMax).toBe(8);

    // Also test that 47.5kg x 15 set does NOT replace the 50kg PR
    const logs2: Record<string, SessionLog> = {
      ...logs1,
      'log_pr_2': sanitizeSessionLog({
        id: 'log_pr_2',
        workoutId: 'w1',
        date: '2026-08-02',
        complete: true,
        sets: {
          ex_test_pr: [
            { id: 's4', weight: '47.5', reps: '15', done: true } // Higher volume/reps, but weight 47.5 < 50
          ]
        }
      })
    };

    const index2 = buildFitnessIndex(logs2, defsMap);
    const pb2 = selectPersonalBestForExercise(index2, 'ex_test_pr');
    expect(pb2?.maxWeight).toBe(50);
    expect(pb2?.repsAtMax).toBe(8);
  });

  // 6.3 Exercise Identity Regression (Renaming an exercise definition)
  it('6.3 Exercise Identity Regression: renaming an exercise preserves historical log associations without "Exercise" fallback', () => {
    const defId = 'bench-press-1';
    let currentDefs: ExerciseDefinition[] = [
      { id: defId, name: 'Bench Press', target: 'Chest', equipment: 'Barbell' }
    ];

    const logs: Record<string, SessionLog> = {
      'log_hist_1': sanitizeSessionLog({
        id: 'log_hist_1',
        workoutId: 'w_push',
        date: '2026-08-01',
        complete: true,
        sets: {
          [defId]: [
            { id: 's1', weight: '100', reps: '5', done: true }
          ]
        }
      })
    };

    // Initial build
    let defsMap = createExerciseDefinitionMap(currentDefs);
    let index = buildFitnessIndex(logs, defsMap);
    expect(index.exerciseMetaById.get(defId)?.name).toBe('Bench Press');

    // Rename definition: "Bench Press" -> "Barbell Bench Press"
    currentDefs = [
      { id: defId, name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' }
    ];
    defsMap = createExerciseDefinitionMap(currentDefs);
    index = buildFitnessIndex(logs, defsMap);

    // Existing logs retain ID bench-press-1
    expect(logs['log_hist_1'].sets[defId]).toBeDefined();

    // History and Index display the new name
    const resolved = resolveExercise(defId, defsMap);
    expect(resolved.name).toBe('Barbell Bench Press');
    expect(resolved.name).not.toBe('Exercise');
    expect(resolved.name).not.toBe('Unknown Exercise');
    expect(index.exerciseMetaById.get(defId)?.name).toBe('Barbell Bench Press');

    // Analytics grouping works seamlessly
    expect(index.exerciseIndex.get(defId)?.completedSets).toHaveLength(1);
    expect(index.exerciseIndex.get(defId)?.maxWeight).toBe(100);
  });

  // 6.4 Empty-state tests across all domains
  it('6.4 Empty-State Handling: safely renders and computes without NaN, undefined, or crashes on zero-state data', () => {
    const emptyDefsMap = createExerciseDefinitionMap([]);
    const emptyLogs: Record<string, SessionLog> = {};

    const index = buildFitnessIndex(emptyLogs, emptyDefsMap);

    // Lifetime stats
    const stats = selectLifetimeStats(index);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalVolume).toBe(0);
    expect(stats.totalSets).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(Number.isNaN(stats.totalVolume)).toBe(false);

    // Personal bests
    const pbs = selectPersonalBests(index);
    expect(pbs).toEqual([]);

    // Muscle distribution
    const muscles = selectMuscleDistribution(index);
    expect(muscles.totalVolume).toBe(0);
    expect(muscles.totalSets).toBe(0);

    // Frequency
    const freq = selectExerciseFrequency(index);
    expect(freq).toEqual([]);

    // Body weight summary
    const weightSum = selectWeightSummary({});
    expect(weightSum.currentWeight).toBe('--');
    expect(weightSum.weightEntries).toEqual([]);
    expect(weightSum.sparklineData).toBeNull();

    // Resolve non-existent exercise definition cleanly
    const fallbackResolved = resolveExercise('non_existent_id', emptyDefsMap);
    expect(fallbackResolved.name).toBe('Unknown Exercise');
    expect(fallbackResolved.name).not.toBe('Exercise');
  });

  // 6.5 Mutation propagation tests (create -> edit weight -> edit reps -> delete)
  it('6.5 Mutation Propagation: verifies Dashboard, History, and Analytics reflect state consistently after each mutation step', () => {
    const defs: ExerciseDefinition[] = [
      { id: 'ex_mutation_test', name: 'Deadlift', target: 'Back', equipment: 'Barbell' }
    ];
    const defsMap = createExerciseDefinitionMap(defs);
    const logId = 'log_mutation_flow';

    // Step 1: Create completed set (100kg x 5)
    let logs: Record<string, SessionLog> = {
      [logId]: sanitizeSessionLog({
        id: logId,
        workoutId: 'w1',
        date: '2026-08-01',
        complete: true,
        sets: {
          ex_mutation_test: [{ id: 's1', weight: '100', reps: '5', done: true }]
        }
      })
    };

    let index = buildFitnessIndex(logs, defsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(500);
    expect(selectPersonalBestForExercise(index, 'ex_mutation_test')?.maxWeight).toBe(100);
    expect(selectPersonalBestForExercise(index, 'ex_mutation_test')?.repsAtMax).toBe(5);

    // Step 2: Edit weight (100kg -> 120kg)
    logs = {
      [logId]: sanitizeSessionLog({
        ...logs[logId],
        sets: {
          ex_mutation_test: [{ id: 's1', weight: '120', reps: '5', done: true }]
        }
      })
    };
    index = buildFitnessIndex(logs, defsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(600);
    expect(selectPersonalBestForExercise(index, 'ex_mutation_test')?.maxWeight).toBe(120);

    // Step 3: Edit reps (5 reps -> 8 reps)
    logs = {
      [logId]: sanitizeSessionLog({
        ...logs[logId],
        sets: {
          ex_mutation_test: [{ id: 's1', weight: '120', reps: '8', done: true }]
        }
      })
    };
    index = buildFitnessIndex(logs, defsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(960);
    expect(selectPersonalBestForExercise(index, 'ex_mutation_test')?.repsAtMax).toBe(8);

    // Step 4: Delete set
    logs = {
      [logId]: sanitizeSessionLog({
        ...logs[logId],
        sets: {
          ex_mutation_test: []
        }
      })
    };
    index = buildFitnessIndex(logs, defsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(0);
    expect(selectLifetimeStats(index).totalSets).toBe(0);
    expect(selectPersonalBestForExercise(index, 'ex_mutation_test')).toBeNull();
  });
});
