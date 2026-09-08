// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  calculateTrainingStreak,
  calculateTrainingFrequency,
  calculateAdherence,
  calculateStrengthTrend,
  calculatePerformanceScore,
  calculatePREvents,
  selectVolumeForRange,
  median
} from '../utils/trainingIntelligence';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { Workout, SessionLog, ExerciseDefinition } from '../types/fitness';

const createTestLog = (partial: Partial<SessionLog> & { id: string; workoutId: string; date: string; complete: true; sets: SessionLog['sets'] }): SessionLog => ({
  durationMinutes: 45,
  ...partial
});

describe('Training Intelligence Canonical Invariants Suite', () => {
  const definitions: ExerciseDefinition[] = [
    { id: 'bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'squat', name: 'Barbell Squat', target: 'Quads', equipment: 'Barbell' },
    { id: 'deadlift', name: 'Barbell Deadlift', target: 'Back', equipment: 'Barbell' }
  ];
  const defsMap = createExerciseDefinitionMap(definitions);

  const coreWorkouts: Workout[] = [
    {
      id: 'wo_push',
      name: 'Push Routine',
      type: 'push',
      badge: 'Day 1',
      cycleDay: 1,
      isCore: true,
      exercises: [{ exerciseDefinitionId: 'bench', sets: 3, reps: '8-12' }]
    },
    {
      id: 'wo_legs',
      name: 'Leg Routine',
      type: 'lower',
      badge: 'Day 2',
      cycleDay: 2,
      isCore: true,
      exercises: [{ exerciseDefinitionId: 'squat', sets: 3, reps: '8-12' }]
    },
    {
      id: 'wo_pull',
      name: 'Pull Routine',
      type: 'pull',
      badge: 'Day 3',
      cycleDay: 3,
      isCore: true,
      exercises: [{ exerciseDefinitionId: 'deadlift', sets: 3, reps: '5' }]
    },
    {
      id: 'wo_custom',
      name: 'Bonus Arms',
      type: 'custom',
      badge: 'Bonus',
      isCore: false,
      exercises: []
    }
  ];

  const coreWorkoutByCycleDayMap = new Map<number, Workout>();
  coreWorkouts.forEach(w => {
    if (w.isCore && w.cycleDay !== undefined) {
      coreWorkoutByCycleDayMap.set(w.cycleDay, w);
    }
  });

  // 1. Scheduled vs. Bonus classification
  it('correctly distinguishes scheduled core workout completions from bonus workouts', () => {
    const cycleStart = '2026-08-01'; // Day 1 scheduled on 2026-08-01
    const testNow = new Date(2026, 7, 2, 12, 0, 0); // 2026-08-02

    // Scenario A: Completed a bonus workout on Day 1 instead of the scheduled Day 1 core workout
    const logsBonusOnly: SessionLog[] = [
      createTestLog({
        id: 'log_bonus',
        workoutId: 'wo_custom', // Bonus workout, NOT wo_push!
        date: '2026-08-01',
        complete: true,
        sets: {
          bench: [{ id: 's1', weight: '80', reps: '10', done: true }]
        }
      })
    ];

    const indexBonus = buildFitnessIndex(logsBonusOnly, defsMap);
    const adherenceBonus = calculateAdherence({
      index: indexBonus,
      coreWorkoutByCycleDayMap,
      cycleStart,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      now: testNow
    });

    // Scheduled core was 2026-08-01 (1 scheduled core workout evaluated)
    expect(adherenceBonus.scheduledCoreWorkouts).toBe(1);
    expect(adherenceBonus.completedScheduled).toBe(0); // Did not complete wo_push
    expect(adherenceBonus.bonusCompletedSessions).toBe(1); // Classified as bonus
    expect(adherenceBonus.rate).toBe(0);

    // Scenario B: Completed the exact scheduled core workout
    const logsScheduled: SessionLog[] = [
      createTestLog({
        id: 'log_scheduled',
        workoutId: 'wo_push', // Matches expectedWo.id!
        date: '2026-08-01',
        complete: true,
        sets: {
          bench: [{ id: 's1', weight: '80', reps: '10', done: true }]
        }
      })
    ];

    const indexScheduled = buildFitnessIndex(logsScheduled, defsMap);
    const adherenceScheduled = calculateAdherence({
      index: indexScheduled,
      coreWorkoutByCycleDayMap,
      cycleStart,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      now: testNow
    });

    expect(adherenceScheduled.scheduledCoreWorkouts).toBe(1);
    expect(adherenceScheduled.completedScheduled).toBe(1);
    expect(adherenceScheduled.bonusCompletedSessions).toBe(0);
    expect(adherenceScheduled.rate).toBe(1);
  });

  // 2. Pending-Today Performance Score & Adherence evaluation
  it('does not penalize adherence or performance score for pending workouts scheduled today', () => {
    // Today is cycleStart: Day 1 is scheduled TODAY, but not yet worked out
    const cycleStart = '2026-08-05';
    const testNow = new Date(2026, 7, 5, 9, 0, 0); // 2026-08-05 morning, no logs yet

    const emptyIndex = buildFitnessIndex([], defsMap);
    const adherence = calculateAdherence({
      index: emptyIndex,
      coreWorkoutByCycleDayMap,
      cycleStart,
      startDate: '2026-08-05',
      endDate: '2026-08-05',
      now: testNow
    });

    // Scheduled today should be marked isTodayPending and not evaluated as missed
    expect(adherence.isTodayPending).toBe(true);
    expect(adherence.evaluatedScheduledWorkouts).toBe(0); // 0 past scheduled days
    expect(adherence.missedPastCoreDays).toBe(0);

    // Performance score should not drop to 0 or Critical
    const perf = calculatePerformanceScore({
      adherence,
      completionRate: 1.0,
      strengthTrend: { percentChange: 0, confidence: 'low', comparableExercises: 0, currentValue: null, previousValue: null, exerciseBreakdown: [] },
      index: emptyIndex,
      now: testNow
    });

    expect(perf.score).toBeGreaterThanOrEqual(70);
    expect(perf.status).not.toBe('Critical');
  });

  // 3. Historical schedule independence
  it('treats logs before cycleStart neutrally without projecting current cycle days into the past', () => {
    // Cycle started on 2026-08-10, but user logged earlier workouts on 2026-08-01 and 2026-08-02
    const cycleStart = '2026-08-10';
    const testNow = new Date(2026, 7, 12, 12, 0, 0); // 2026-08-12

    const historicalLogs: SessionLog[] = [
      createTestLog({
        id: 'hist_1',
        workoutId: 'wo_custom',
        date: '2026-08-01',
        complete: true,
        sets: { bench: [{ id: 's1', weight: '80', reps: '10', done: true }] }
      }),
      createTestLog({
        id: 'hist_2',
        workoutId: 'wo_push',
        date: '2026-08-10', // Scheduled Day 1
        complete: true,
        sets: { bench: [{ id: 's2', weight: '85', reps: '10', done: true }] }
      })
    ];

    const index = buildFitnessIndex(historicalLogs, defsMap);
    const adherence = calculateAdherence({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart,
      startDate: '2026-08-01',
      endDate: '2026-08-11',
      now: testNow
    });

    // 2026-08-10 was Day 1 (completed), 2026-08-11 was Day 2 (missed)
    // 2026-08-01 was before cycleStart so it is counted as bonus rather than missed core
    expect(adherence.bonusCompletedSessions).toBe(1); // 2026-08-01 classified as bonus
    expect(adherence.completedScheduled).toBe(1); // 2026-08-10
    expect(adherence.evaluatedScheduledWorkouts).toBe(2); // 2026-08-10 and 2026-08-11
  });

  // 4. Strength Trend confidence and canonical medians
  it('correctly scales Strength Trend confidence based on comparable exercises count and provides canonical medians', () => {
    const logs: SessionLog[] = [
      // Previous range: 2026-07-01 to 2026-07-31
      createTestLog({
        id: 'p1',
        workoutId: 'wo_push',
        date: '2026-07-10',
        complete: true,
        sets: {
          bench: [{ id: 's1', weight: '100', reps: '10', done: true }] // e1RM: ~133.3kg
        }
      }),
      // Current range: 2026-08-01 to 2026-08-31
      createTestLog({
        id: 'c1',
        workoutId: 'wo_push',
        date: '2026-08-10',
        complete: true,
        sets: {
          bench: [{ id: 's2', weight: '110', reps: '10', done: true }] // e1RM: ~146.6kg (+10%)
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const trend1 = calculateStrengthTrend({
      index,
      currentRange: { start: '2026-08-01', end: '2026-08-31' },
      comparisonRange: { start: '2026-07-01', end: '2026-07-31' }
    });

    expect(trend1.comparableExercises).toBe(1);
    expect(trend1.confidence).toBe('low');
    expect(trend1.percentChange).toBeCloseTo(10.0, 0);
    expect(trend1.currentValue).toBeGreaterThan(0);
    expect(trend1.previousValue).toBeGreaterThan(0);
    expect(trend1.currentValue).toBeGreaterThan(trend1.previousValue!);

    // Empty comparison: 0 exercises -> low confidence and null percentChange
    const emptyTrend = calculateStrengthTrend({
      index: buildFitnessIndex([], defsMap),
      currentRange: { start: '2026-08-01', end: '2026-08-31' },
      comparisonRange: { start: '2026-07-01', end: '2026-07-31' }
    });
    expect(emptyTrend.comparableExercises).toBe(0);
    expect(emptyTrend.confidence).toBe('low');
    expect(emptyTrend.percentChange).toBeNull();
    expect(emptyTrend.currentValue).toBeNull();
    expect(emptyTrend.previousValue).toBeNull();
  });

  // 5. Canonical PR events consolidation
  it('deduplicates weight and e1RM PR established on the same set into a single canonical PR event', () => {
    const logs: SessionLog[] = [
      createTestLog({
        id: 'log1',
        workoutId: 'wo_push',
        date: '2026-08-05',
        complete: true,
        sets: {
          bench: [
            { id: 'set_pr', weight: '120', reps: '8', done: true } // Sets both weight PR and e1RM PR
          ]
        }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const prEvents = calculatePREvents(index);

    // Exactly one event for this set, despite triggering both weight PR and e1RM PR
    expect(prEvents.length).toBe(1);
    expect(prEvents[0].exerciseDefinitionId).toBe('bench');
    expect(prEvents[0].date).toBe('2026-08-05');
    expect(prEvents[0].weight).toBe(120);
    expect(prEvents[0].reps).toBe(8);
    expect(prEvents[0].isWeightPR).toBe(true);
    expect(prEvents[0].isE1RMPR).toBe(true);
  });

  // 6. Deload / high-completion volume consistency protection
  it('neutralizes volume consistency when completion rate is high to protect deload / taper phases', () => {
    const testNow = new Date(2026, 7, 28, 12, 0, 0);

    const adherenceMock = {
      rate: 1.0,
      percent: 100,
      completedScheduled: 4,
      scheduledCoreWorkouts: 4,
      evaluatedScheduledWorkouts: 4,
      pendingScheduledWorkouts: 0,
      missedPastCoreDays: 0,
      scheduledRestDays: 0,
      bonusCompletedSessions: 0,
      isTodayPending: false
    };

    const emptyIndex = buildFitnessIndex([], defsMap);

    // High completion rate (1.0) with consistency
    const perf = calculatePerformanceScore({
      adherence: adherenceMock,
      completionRate: 1.0,
      strengthTrend: {
        percentChange: 0,
        confidence: 'medium',
        comparableExercises: 2,
        currentValue: 100,
        previousValue: 100,
        medianCurrentE1RM: 100,
        medianPreviousE1RM: 100,
        exerciseBreakdown: []
      },
      index: emptyIndex,
      now: testNow
    });

    // Score remains strong despite volume fluctuations due to high completion rate
    expect(perf.score).toBeGreaterThanOrEqual(80);
    expect(perf.status === 'Strong' || perf.status === 'Excellent').toBe(true);
  });

  // 7. Training streak & frequency
  it('computes training streaks and frequency across rolling intervals', () => {
    const testNow = new Date(2026, 7, 10, 12, 0, 0); // 2026-08-10

    const logs: SessionLog[] = [
      createTestLog({
        id: 's1',
        workoutId: 'wo_push',
        date: '2026-08-08',
        complete: true,
        sets: { bench: [{ id: '1', weight: '100', reps: '5', done: true }] }
      }),
      createTestLog({
        id: 's2',
        workoutId: 'wo_legs',
        date: '2026-08-09',
        complete: true,
        sets: { squat: [{ id: '2', weight: '120', reps: '5', done: true }] }
      }),
      createTestLog({
        id: 's3',
        workoutId: 'wo_pull',
        date: '2026-08-10',
        complete: true,
        sets: { deadlift: [{ id: '3', weight: '140', reps: '5', done: true }] }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const streak = calculateTrainingStreak({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart: '2026-08-08',
      now: testNow
    });

    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBeGreaterThanOrEqual(3);

    const freq = calculateTrainingFrequency({
      index,
      now: testNow,
      windowDays: 28
    });

    expect(freq.completedSessions).toBe(3);
    expect(freq.sessionsPerWeek).toBeCloseTo((3 / 28) * 7, 1);
  });

  // 8. Regression test: Empty/New-user dataset must never produce "0 / Struggling"
  it('returns score: null and status: "Unavailable" for empty datasets instead of "0 / Struggling"', () => {
    const testNow = new Date(2026, 7, 1, 12, 0, 0);
    const emptyIndex = buildFitnessIndex([], defsMap);

    const adherence = calculateAdherence({
      index: emptyIndex,
      coreWorkoutByCycleDayMap,
      cycleStart: '2026-08-01',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      now: testNow
    });

    const perf = calculatePerformanceScore({
      adherence,
      index: emptyIndex,
      now: testNow
    });

    expect(perf.score).toBeNull();
    expect(perf.status).toBe('Unavailable');
    expect(perf.confidence).toBe('low');
  });

  // 9. Regression test: Adherence UI denominator (8 completed + today's pending -> 100%, denominator = 8)
  it('correctly calculates adherence when 8 past workouts completed and today is pending (100% adherence, 8 evaluated)', () => {
    // Cycle starts on 2026-08-01. Over 9 days: 8 past days have completed core workouts, day 9 (today) is scheduled but pending
    const testNow = new Date(2026, 7, 9, 9, 0, 0); // 2026-08-09 morning
    const eightDayWorkoutMap = new Map<number, Workout>();
    for (let day = 1; day <= 8; day++) {
      eightDayWorkoutMap.set(day, {
        id: `wo_day_${day}`,
        name: `Day ${day} Routine`,
        type: 'push',
        badge: `Day ${day}`,
        cycleDay: day,
        isCore: true,
        exercises: [{ exerciseDefinitionId: 'bench', sets: 3, reps: '10' }]
      });
    }

    const logs: SessionLog[] = [];
    const dates = [
      '2026-08-01', '2026-08-02', '2026-08-03',
      '2026-08-04', '2026-08-05', '2026-08-06',
      '2026-08-07', '2026-08-08'
    ];
    dates.forEach((date, i) => {
      logs.push(createTestLog({
        id: `log_${date}`,
        workoutId: `wo_day_${i + 1}`,
        date,
        complete: true,
        sets: { bench: [{ id: 's1', weight: '80', reps: '10', done: true }] }
      }));
    });

    const index = buildFitnessIndex(logs, defsMap);
    const adherence = calculateAdherence({
      index,
      coreWorkoutByCycleDayMap: eightDayWorkoutMap,
      cycleStart: '2026-08-01',
      startDate: '2026-08-01',
      endDate: '2026-08-09',
      now: testNow
    });

    expect(adherence.completedScheduled).toBe(8);
    expect(adherence.evaluatedScheduledWorkouts).toBe(8);
    expect(adherence.scheduledCoreWorkouts).toBe(9); // Includes today
    expect(adherence.pendingScheduledWorkouts).toBe(1);
    expect(adherence.isTodayPending).toBe(true);
    expect(adherence.percent).toBe(100);
  });

  // 10. Regression test: Pre-cycleStart streak fallback resets on gap days
  it('resets streak on gap days prior to cycleStart without fabricating continuous streak', () => {
    const cycleStart = '2026-08-10';
    const testNow = new Date(2026, 7, 10, 8, 0, 0); // 2026-08-10 before workout

    // User logged on 2026-08-06 and 2026-08-07, but rest/gap on 2026-08-08 and 2026-08-09
    const logs: SessionLog[] = [
      createTestLog({
        id: 'l1',
        workoutId: 'wo_custom',
        date: '2026-08-06',
        complete: true,
        sets: { bench: [{ id: 's1', weight: '80', reps: '10', done: true }] }
      }),
      createTestLog({
        id: 'l2',
        workoutId: 'wo_custom',
        date: '2026-08-07',
        complete: true,
        sets: { bench: [{ id: 's2', weight: '80', reps: '10', done: true }] }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const streak = calculateTrainingStreak({
      index,
      coreWorkoutByCycleDayMap,
      cycleStart,
      now: testNow
    });

    // Since there was a gap on 08-08 and 08-09 before cycleStart, currentStreak must reset to 0
    expect(streak.currentStreak).toBe(0);
    // Longest streak from the 2 contiguous days (08-06 and 08-07)
    expect(streak.longestStreak).toBe(2);
  });

  // 11. Regression test: Performance vs Previous (Component 4) 28-day window & 90-day comparison restriction
  it('Component 4 includes latest session within 28 days and excludes sessions older than 28 days or gaps > 90 days', () => {
    const testNow = new Date(2026, 7, 28, 12, 0, 0); // 2026-08-28

    // Exercise 1: Session 10 days ago (2026-08-18) and previous 20 days ago (2026-08-08) -> Valid!
    // Exercise 2: Session 40 days ago (2026-07-19) -> Excluded from 28d window!
    // Exercise 3: Session 10 days ago (2026-08-18) but previous 120 days ago (2026-04-20) -> Gap > 90d, excluded!
    const logs: SessionLog[] = [
      createTestLog({
        id: 'ex1_prev',
        workoutId: 'wo_push',
        date: '2026-08-08',
        complete: true,
        sets: { bench: [{ id: 's1', weight: '100', reps: '5', done: true }] }
      }),
      createTestLog({
        id: 'ex1_latest',
        workoutId: 'wo_push',
        date: '2026-08-18',
        complete: true,
        sets: { bench: [{ id: 's2', weight: '105', reps: '5', done: true }] }
      }),
      createTestLog({
        id: 'ex2_old',
        workoutId: 'wo_legs',
        date: '2026-07-19',
        complete: true,
        sets: { squat: [{ id: 's3', weight: '120', reps: '5', done: true }] }
      }),
      createTestLog({
        id: 'ex3_ancient_prev',
        workoutId: 'wo_pull',
        date: '2026-04-20',
        complete: true,
        sets: { deadlift: [{ id: 's4', weight: '140', reps: '5', done: true }] }
      }),
      createTestLog({
        id: 'ex3_latest',
        workoutId: 'wo_pull',
        date: '2026-08-18',
        complete: true,
        sets: { deadlift: [{ id: 's5', weight: '145', reps: '5', done: true }] }
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const adherenceMock = {
      rate: 1.0,
      percent: 100,
      completedScheduled: 2,
      scheduledCoreWorkouts: 2,
      evaluatedScheduledWorkouts: 2,
      pendingScheduledWorkouts: 0,
      missedPastCoreDays: 0,
      scheduledRestDays: 0,
      bonusCompletedSessions: 0,
      isTodayPending: false
    };

    const perf = calculatePerformanceScore({
      adherence: adherenceMock,
      index,
      now: testNow
    });

    // Exercise 1 is evaluated (+5% e1RM), exercise 2 is ignored (outside 28d), exercise 3 is ignored (gap > 90d)
    expect(perf.components.performanceVsPrevious).toBeDefined();
    expect(perf.components.performanceVsPrevious?.score).toBeGreaterThan(70);
  });

  // 12. Regression test: median helper correctness
  it('correctly calculates median for odd, even, and empty arrays', () => {
    expect(median([])).toBe(0);
    expect(median([10])).toBe(10);
    expect(median([10, 20, 30])).toBe(20);
    expect(median([30, 10, 20])).toBe(20); // handles unsorted input
    expect(median([10, 20, 30, 40])).toBe(25); // even count: average of middle two
    expect(median([40, 10, 20, 30])).toBe(25);
  });

  // 13. Regression test: History monthly volume equals selectVolumeForRange
  it('canonical selectVolumeForRange accurately sums volume for a calendar month', () => {
    const logs: SessionLog[] = [
      createTestLog({
        id: 'l1',
        workoutId: 'wo_push',
        date: '2026-08-05',
        complete: true,
        sets: { bench: [{ id: 's1', weight: '100', reps: '10', done: true }] } // 1000 kg
      }),
      createTestLog({
        id: 'l2',
        workoutId: 'wo_legs',
        date: '2026-08-20',
        complete: true,
        sets: { squat: [{ id: 's2', weight: '150', reps: '10', done: true }] } // 1500 kg
      }),
      createTestLog({
        id: 'l3_next_month',
        workoutId: 'wo_pull',
        date: '2026-09-01',
        complete: true,
        sets: { deadlift: [{ id: 's3', weight: '200', reps: '5', done: true }] } // 1000 kg
      })
    ];

    const index = buildFitnessIndex(logs, defsMap);
    const augustVolume = selectVolumeForRange(index, '2026-08-01', '2026-08-31');
    expect(augustVolume).toBe(2500);

    const septemberVolume = selectVolumeForRange(index, '2026-09-01', '2026-09-30');
    expect(septemberVolume).toBe(1000);
  });
});
