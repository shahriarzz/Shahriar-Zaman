import { describe, it, expect } from 'vitest';
import { SessionLog, Workout, ExerciseDefinition } from '../types/fitness';
import { buildFitnessIndex, selectTimeRangeAnalytics, computeConsecutiveDaysStreak } from '../utils/fitnessDerivedSelectors';
import {
  calculateAdherence,
  calculatePerformanceScore,
  calculateTrainingStreak
} from '../utils/trainingIntelligence';

function createTestLog(overrides: Partial<SessionLog> & { id: string; workoutId: string; date: string }): SessionLog {
  return {
    id: overrides.id,
    workoutId: overrides.workoutId,
    date: overrides.date,
    durationMinutes: 45,
    complete: true,
    sets: {},
    ...overrides
  };
}

describe('Analytics Adherence, Performance Score Consistency & Canonical Streaks', () => {
  const defsMap = new Map<string, ExerciseDefinition>([
    ['bench', { id: 'bench', name: 'Bench Press', target: 'Chest' }],
    ['squat', { id: 'squat', name: 'Squat', target: 'Legs' }],
    ['pullup', { id: 'pullup', name: 'Pull-up', target: 'Back' }]
  ]);

  const coreWorkoutByCycleDayMap = new Map<number, Workout>([
    [1, { id: 'wo_push_a', name: 'Push A', type: 'push', badge: 'Push A', cycleDay: 1, isCore: true, exercises: [{ exerciseDefinitionId: 'bench', sets: 3, reps: '10' }] }],
    [2, { id: 'wo_pull_a', name: 'Pull A', type: 'pull', badge: 'Pull A', cycleDay: 2, isCore: true, exercises: [{ exerciseDefinitionId: 'pullup', sets: 3, reps: '10' }] }],
    [3, { id: 'wo_hybrid_a', name: 'Hybrid A', type: 'hybrid', badge: 'Hybrid A', cycleDay: 3, isCore: true, exercises: [{ exerciseDefinitionId: 'squat', sets: 3, reps: '10' }] }],
    [4, { id: 'wo_recovery_1', name: 'Recovery', type: 'rest', badge: 'Recovery', cycleDay: 4, isCore: true, exercises: [] }],
    [5, { id: 'wo_push_b', name: 'Push B', type: 'push', badge: 'Push B', cycleDay: 5, isCore: true, exercises: [{ exerciseDefinitionId: 'bench', sets: 3, reps: '10' }] }],
    [6, { id: 'wo_pull_b', name: 'Pull B', type: 'pull', badge: 'Pull B', cycleDay: 6, isCore: true, exercises: [{ exerciseDefinitionId: 'pullup', sets: 3, reps: '10' }] }],
    [7, { id: 'wo_hybrid_b', name: 'Hybrid B', type: 'hybrid', badge: 'Hybrid B', cycleDay: 7, isCore: true, exercises: [{ exerciseDefinitionId: 'squat', sets: 3, reps: '10' }] }],
    [8, { id: 'wo_recovery_2', name: 'Recovery', type: 'rest', badge: 'Recovery', cycleDay: 8, isCore: true, exercises: [] }]
  ]);

  const workoutMap = new Map<string, Workout>([
    ['wo_push_a', coreWorkoutByCycleDayMap.get(1)!],
    ['wo_pull_a', coreWorkoutByCycleDayMap.get(2)!],
    ['wo_hybrid_a', coreWorkoutByCycleDayMap.get(3)!],
    ['wo_recovery_1', coreWorkoutByCycleDayMap.get(4)!],
    ['wo_push_b', coreWorkoutByCycleDayMap.get(5)!],
    ['wo_pull_b', coreWorkoutByCycleDayMap.get(6)!],
    ['wo_hybrid_b', coreWorkoutByCycleDayMap.get(7)!],
    ['wo_recovery_2', coreWorkoutByCycleDayMap.get(8)!],
    ['wo_bonus_datenight', { id: 'wo_bonus_datenight', name: 'Date Night Mobility', type: 'date', badge: 'Bonus', isCore: false, exercises: [] }]
  ]);

  // Test 1: Bonus workouts never satisfy core adherence in selectTimeRangeAnalytics
  it('1. Bonus workouts never satisfy core adherence and rest days do not enter denominator', () => {
    const testNow = new Date(2026, 7, 3, 12, 0, 0); // 2026-08-03
    const logs: SessionLog[] = [
      createTestLog({
        id: 'log_bonus',
        workoutId: 'wo_bonus_datenight',
        date: '2026-08-01',
        complete: true,
        sets: { bench: [{ id: 's1', weight: '50', reps: '10', done: true }] }
      }),
      createTestLog({
        id: 'log_pull_a',
        workoutId: 'wo_pull_a',
        date: '2026-08-02',
        complete: true,
        sets: { pullup: [{ id: 's2', weight: '0', reps: '10', done: true }] }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const analytics = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      '7d',
      '2026-08-01',
      undefined,
      testNow
    );

    // On 2026-08-01: Push A was missed (bonus completed does not satisfy core Push A)
    // On 2026-08-02: Pull A was completed
    // Evaluated scheduled core workouts = 2 past days (Aug 1 and Aug 2)
    expect(analytics.completedScheduledCore).toBe(1);
    expect(analytics.bonusCompletedSessions).toBe(1);
    expect(analytics.missedPastCoreDays).toBe(1);
    // Adherence must be 50% (1/2), not 100%
    expect(analytics.adherencePct).toBe(50);
  });

  // Test 2: Rest days never enter the adherence denominator
  it('2. Scheduled rest days (recovery days) are excluded from the adherence denominator', () => {
    const testNow = new Date(2026, 7, 5, 12, 0, 0);
    const logs: SessionLog[] = [
      createTestLog({ id: 'l1', workoutId: 'wo_push_a', date: '2026-08-01', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '5', done: true }] } }),
      createTestLog({ id: 'l2', workoutId: 'wo_pull_a', date: '2026-08-02', complete: true, sets: { pullup: [{ id: '2', weight: '0', reps: '5', done: true }] } }),
      createTestLog({ id: 'l3', workoutId: 'wo_hybrid_a', date: '2026-08-03', complete: true, sets: { squat: [{ id: '3', weight: '120', reps: '5', done: true }] } })
      // Aug 4 is Day 4 Recovery: no log required!
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const analytics = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      '7d',
      '2026-08-01',
      undefined,
      testNow
    );

    expect(analytics.scheduledRestDays).toBe(1);
    expect(analytics.completedScheduledCore).toBe(3);
    // Evaluated scheduled workouts must be 3 (not 4)
    expect(analytics.adherencePct).toBe(100);
  });

  // Test 3: Today's pending workout is excluded from evaluated denominator
  it('3. Today pending scheduled core workout is excluded from evaluated adherence denominator', () => {
    const testNow = new Date(2026, 7, 2, 9, 0, 0);
    const logs: SessionLog[] = [
      createTestLog({ id: 'l1', workoutId: 'wo_push_a', date: '2026-08-01', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '5', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const analytics = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      '7d',
      '2026-08-01',
      undefined,
      testNow
    );

    expect(analytics.isTodayCorePending).toBe(true);
    expect(analytics.completedScheduledCore).toBe(1);
    // Only 1 past workout evaluated; adherence is 100% (not penalized for pending workout today)
    expect(analytics.adherencePct).toBe(100);
  });

  // Test 4: Prevent pre-cycle dates from fabricating scheduled adherence
  it('4. Dates before cycleStart must not generate scheduled core or missed obligations', () => {
    const testNow = new Date(2026, 7, 2, 12, 0, 0);
    const logs: SessionLog[] = [
      createTestLog({ id: 'old_1', workoutId: 'wo_push_a', date: '2026-07-20', complete: true, sets: { bench: [{ id: 's1', weight: '90', reps: '5', done: true }] } }),
      createTestLog({ id: 'old_2', workoutId: 'wo_pull_a', date: '2026-07-25', complete: true, sets: { pullup: [{ id: 's2', weight: '0', reps: '5', done: true }] } }),
      createTestLog({ id: 'l1', workoutId: 'wo_push_a', date: '2026-08-01', complete: true, sets: { bench: [{ id: 's3', weight: '100', reps: '5', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const analytics = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      '30d',
      '2026-08-01',
      undefined,
      testNow
    );

    // Historical sessions before cycleStart are treated as bonus/historical data, not missed core days!
    expect(analytics.missedPastCoreDays).toBe(0);
    expect(analytics.completedScheduledCore).toBe(1);
    expect(analytics.bonusCompletedSessions).toBe(2);
    expect(analytics.adherencePct).toBe(100);
  });

  // Test 5: Zero-volume week remains present in Performance Score consistency (not deleted)
  it('5. Zero-volume week remains present in Performance Score consistency', () => {
    const testNow = new Date(2026, 7, 28, 12, 0, 0); // 2026-08-28

    const logs: SessionLog[] = [
      createTestLog({ id: 'w1', workoutId: 'wo_push_a', date: '2026-08-05', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '10', done: true }, { id: '2', weight: '100', reps: '10', done: true }] } }),
      // Week 2 has NO logs (0 kg)
      createTestLog({ id: 'w3', workoutId: 'wo_push_a', date: '2026-08-19', complete: true, sets: { bench: [{ id: '3', weight: '100', reps: '10', done: true }, { id: '4', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'w4', workoutId: 'wo_push_a', date: '2026-08-26', complete: true, sets: { bench: [{ id: '5', weight: '100', reps: '10', done: true }, { id: '6', weight: '100', reps: '10', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const adherence = calculateAdherence({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart: '2026-08-01',
      now: testNow
    });

    const perf = calculatePerformanceScore({
      adherence,
      completionRate: 1.0,
      index,
      now: testNow
    });

    expect(perf.components.volumeConsistency.available).toBe(true);
    // Because of the zero-volume week, volumeScore is penalized (50) and zero-volume week is detected in factors
    expect(perf.components.volumeConsistency.score).toBe(50);
    expect(perf.primaryFactors).toContain('Inconsistent weekly volume (zero-volume week detected)');
  });

  // Test 6: Four weeks with one zero week -> consistency decreases appropriately compared to all-active weeks
  it('6. Four weeks with one zero week decreases volume consistency appropriately', () => {
    const testNow = new Date(2026, 7, 28, 12, 0, 0);

    // Dataset A: Consistent 4 weeks (10,000 kg each week)
    const logsConsistent: SessionLog[] = [
      createTestLog({ id: 'a1', workoutId: 'wo_push_a', date: '2026-08-05', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'a2', workoutId: 'wo_push_a', date: '2026-08-12', complete: true, sets: { bench: [{ id: '2', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'a3', workoutId: 'wo_push_a', date: '2026-08-19', complete: true, sets: { bench: [{ id: '3', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'a4', workoutId: 'wo_push_a', date: '2026-08-26', complete: true, sets: { bench: [{ id: '4', weight: '100', reps: '10', done: true }] } })
    ];

    // Dataset B: 4 weeks with one zero week (Week 2 missed)
    const logsWithZeroWeek: SessionLog[] = [
      createTestLog({ id: 'b1', workoutId: 'wo_push_a', date: '2026-08-05', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'b3', workoutId: 'wo_push_a', date: '2026-08-19', complete: true, sets: { bench: [{ id: '3', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'b4', workoutId: 'wo_push_a', date: '2026-08-26', complete: true, sets: { bench: [{ id: '4', weight: '100', reps: '10', done: true }] } })
    ];

    const indexConsistent = buildFitnessIndex(logsConsistent, defsMap);
    const indexWithZero = buildFitnessIndex(logsWithZeroWeek, defsMap);

    const adherenceConsistent = calculateAdherence({ index: indexConsistent, coreWorkoutByCycleDayMap, cycleStart: '2026-08-01', now: testNow });
    const adherenceWithZero = calculateAdherence({ index: indexWithZero, coreWorkoutByCycleDayMap, cycleStart: '2026-08-01', now: testNow });

    const perfConsistent = calculatePerformanceScore({ adherence: adherenceConsistent, completionRate: 1.0, index: indexConsistent, now: testNow });
    const perfWithZero = calculatePerformanceScore({ adherence: adherenceWithZero, completionRate: 1.0, index: indexWithZero, now: testNow });

    expect(perfConsistent.components.volumeConsistency.score).toBe(90);
    expect(perfWithZero.components.volumeConsistency.score).toBe(50);
    expect(perfWithZero.score!).toBeLessThan(perfConsistent.score!);
  });

  // Test 7: Dashboard and Analytics Training Streak -> identical result
  it('7. Dashboard and Analytics Training Streak produce identical result', () => {
    const testNow = new Date(2026, 7, 5, 12, 0, 0); // Day 5
    const logs: SessionLog[] = [
      createTestLog({ id: 'l1', workoutId: 'wo_push_a', date: '2026-08-01', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '5', done: true }] } }),
      createTestLog({ id: 'l2', workoutId: 'wo_pull_a', date: '2026-08-02', complete: true, sets: { pullup: [{ id: '2', weight: '0', reps: '5', done: true }] } }),
      createTestLog({ id: 'l3', workoutId: 'wo_hybrid_a', date: '2026-08-03', complete: true, sets: { squat: [{ id: '3', weight: '120', reps: '5', done: true }] } }),
      createTestLog({ id: 'l4', workoutId: 'wo_push_b', date: '2026-08-05', complete: true, sets: { bench: [{ id: '4', weight: '105', reps: '5', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);

    // 1. Training Streak computed by intelligence selector (Dashboard consumption)
    const trainingStreak = calculateTrainingStreak({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart: '2026-08-01',
      now: testNow
    });

    // 2. Training Streak returned by selectTimeRangeAnalytics (Analytics consumption)
    const analytics = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      '30d',
      '2026-08-01',
      undefined,
      testNow
    );

    // Both surfaces MUST agree identically on the training streak (4 scheduled workouts completed across Recovery Day 4)
    expect(analytics.currentStreak).toBe(trainingStreak.currentStreak);
    expect(analytics.longestStreak).toBe(trainingStreak.longestStreak);
    expect(analytics.currentStreak).toBe(4);

    // Meanwhile, the calendar days streak is exposed distinctly (Aug 4 was a rest day, so calendar streak is 1)
    expect(analytics.consecutiveDaysStreak).toBe(1);
    expect(computeConsecutiveDaysStreak(index.sortedLogsDescending, testNow)).toBe(1);
  });

  // Test 8: Insufficient calendar history returns volumeConsistency unavailable
  it('8. Insufficient calendar history returns volumeConsistency unavailable', () => {
    const testNow = new Date(2026, 7, 1, 12, 0, 0);
    const logs: SessionLog[] = [
      createTestLog({ id: 'l1', workoutId: 'wo_push_a', date: '2026-08-01', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '5', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const adherence = calculateAdherence({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart: '2026-08-01',
      now: testNow
    });

    const perf = calculatePerformanceScore({
      adherence,
      completionRate: 1.0,
      index,
      now: testNow
    });

    expect(perf.components.volumeConsistency.available).toBe(false);
    expect(perf.components.volumeConsistency.score).toBeNull();
  });

  // Test 9: Performance Score components use declared evaluation windows
  it('9. Performance Score components declare and use consistent evaluation windows', () => {
    const testNow = new Date(2026, 7, 28, 12, 0, 0);
    const logs: SessionLog[] = [
      createTestLog({ id: 'l1', workoutId: 'wo_push_a', date: '2026-08-20', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '5', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const adherence = calculateAdherence({ index, coreWorkoutByCycleDayMap, cycleStart: '2026-08-01', now: testNow });

    const perf = calculatePerformanceScore({
      adherence,
      completionRate: 1.0,
      index,
      now: testNow,
      evaluationWindow: {
        currentRange: { start: '2026-08-01', end: '2026-08-28' },
        previousRange: { start: '2026-07-04', end: '2026-07-31' }
      }
    });

    expect(perf.evaluationWindow).toBeDefined();
    expect(perf.evaluationWindow.currentRange.start).toBe('2026-08-01');
    expect(perf.evaluationWindow.currentRange.end).toBe('2026-08-28');

    // Every component states its window type and description
    expect(perf.components.adherence.windowType).toBe('current_window');
    expect(perf.components.completion.windowType).toBe('current_window');
    expect(perf.components.strengthProgression.windowType).toBe('previous_window');
    expect(perf.components.performanceVsPrevious.windowType).toBe('current_window');
    expect(perf.components.volumeConsistency.windowType).toBe('current_window');
  });

  // Test 10: Deload / taper handling preserves consistency when non-zero volume drops with high adherence
  it('10. Deload / taper secondary interpretation preserves acceptable consistency when non-zero volume drops with high adherence', () => {
    const testNow = new Date(2026, 7, 28, 12, 0, 0);
    const logs: SessionLog[] = [
      createTestLog({ id: 'w1', workoutId: 'wo_push_a', date: '2026-08-05', complete: true, sets: { bench: [{ id: '1', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'w2', workoutId: 'wo_pull_a', date: '2026-08-12', complete: true, sets: { pullup: [{ id: '2', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'w3', workoutId: 'wo_hybrid_a', date: '2026-08-19', complete: true, sets: { squat: [{ id: '3', weight: '100', reps: '10', done: true }] } }),
      createTestLog({ id: 'w4', workoutId: 'wo_push_b', date: '2026-08-26', complete: true, sets: { bench: [{ id: '4', weight: '35', reps: '10', done: true }] } })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const adherence = calculateAdherence({ index, coreWorkoutByCycleDayMap, cycleStart: '2026-08-01', now: testNow });

    const perf = calculatePerformanceScore({
      adherence,
      completionRate: 1.0,
      index,
      now: testNow
    });

    expect(perf.components.volumeConsistency.score).toBe(75);
  });
});
