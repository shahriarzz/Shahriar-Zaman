import { describe, it, expect } from 'vitest';
import {
  buildFitnessIndex,
  buildValidatedCoreWorkoutMap,
  selectTimeRangeAnalytics,
  selectMonthlyHeatmapSummary,
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { INITIAL_EXERCISE_DEFINITIONS, INITIAL_WORKOUTS } from '../types/initialData';
import { SessionLog, Workout } from '../types/fitness';

const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);
const { coreWorkoutByCycleDayMap } = buildValidatedCoreWorkoutMap(INITIAL_WORKOUTS);
const workoutMap = new Map(INITIAL_WORKOUTS.map((w) => [w.id, w]));

function makeCompletedLog(id: string, date: string, workoutId: string, weight = '100', reps = '5'): SessionLog {
  return {
    id,
    date,
    workoutId,
    complete: true,
    durationMinutes: 45,
    sets: {
      e1: [{ id: `s-${id}`, weight, reps, done: true }],
    },
  };
}

describe('selectMonthlyHeatmapSummary Direct Unit Suite', () => {
  it('evaluates a completed past month with completed scheduled workouts and missed past scheduled workouts', () => {
    // cycleStart = 2026-09-01 (Day 1 = push-a)
    // Day 1 (Sep 01): completed push-a -> scheduled advances to Day 2
    // Day 2 (Sep 02): completed pull-a -> scheduled advances to Day 3
    // Day 3 (Sep 03): missed hybrid-a -> scheduled carries forward on Sep 04..Sep 30 (28 past days missed in Sep!)
    // Actually let's test a 5-day active cycle window starting 2026-09-26:
    // Sep 26 (Day 1 push-a): completed
    // Sep 27 (Day 2 pull-a): completed
    // Sep 28 (Day 3 hybrid-a): missed -> carried to Sep 29 (missed) -> carried to Sep 30 (completed!)
    // Wait: let's verify exact sequence:
    // Sep 26 = scheduledDay 1 -> completed -> next scheduledDay = 2
    // Sep 27 = scheduledDay 2 -> completed -> next scheduledDay = 3
    // Sep 28 = scheduledDay 3 -> missed -> next scheduledDay stays 3 (1 missed)
    // Sep 29 = scheduledDay 3 -> missed -> next scheduledDay stays 3 (2 missed)
    // Sep 30 = scheduledDay 3 (hybrid-a) -> completed -> next scheduledDay = 4 (3 completed, 2 missed, 5 evaluated -> 60%)
    const logs: SessionLog[] = [
      makeCompletedLog('sep-26', '2026-09-26', 'push-a'),
      makeCompletedLog('sep-27', '2026-09-27', 'pull-a'),
      makeCompletedLog('sep-30', '2026-09-30', 'hybrid-a'),
    ];
    const index = buildFitnessIndex(logs, defsMap);
    const summary = selectMonthlyHeatmapSummary(
      index,
      coreWorkoutByCycleDayMap,
      new Date('2026-09-15T12:00:00Z'),
      '2026-09-26',
      new Date('2026-10-15T12:00:00Z')
    );

    expect(summary).toEqual({
      activeDaysCount: 3,
      missedPastCoreDays: 2,
      completedScheduled: 3,
      evaluatedScheduledWorkouts: 5,
      adherencePct: 60,
    });
  });

  it('excludes future dates in the current month from active days and missed/evaluated counts', () => {
    // Today = 2026-10-05; cycleStart = 2026-10-01
    // Oct 01 (Day 1 push-a): completed
    // Oct 02 (Day 2 pull-a): completed
    // Oct 03 (Day 3 hybrid-a): missed (1 missed)
    // Oct 04 (Day 3 carried forward): missed (2 missed)
    // Oct 05 (today, Day 3 pending): NOT counted as missed or evaluated
    // Oct 20 (erroneous future log): excluded because > todayStr
    const logs: SessionLog[] = [
      makeCompletedLog('oct-01', '2026-10-01', 'push-a'),
      makeCompletedLog('oct-02', '2026-10-02', 'pull-a'),
      makeCompletedLog('oct-20', '2026-10-20', 'hybrid-a'),
    ];
    const index = buildFitnessIndex(logs, defsMap);
    const summary = selectMonthlyHeatmapSummary(
      index,
      coreWorkoutByCycleDayMap,
      '2026-10-01',
      '2026-10-01',
      '2026-10-05'
    );

    expect(summary).toEqual({
      activeDaysCount: 2,
      missedPastCoreDays: 2,
      completedScheduled: 2,
      evaluatedScheduledWorkouts: 4,
      adherencePct: 50,
    });
  });

  it('returns unavailable adherence state for a future month (all zero metrics)', () => {
    const logs: SessionLog[] = [
      makeCompletedLog('oct-01', '2026-10-01', 'push-a'),
    ];
    const index = buildFitnessIndex(logs, defsMap);
    const summary = selectMonthlyHeatmapSummary(
      index,
      coreWorkoutByCycleDayMap,
      '2026-11-01',
      '2026-10-01',
      '2026-10-15'
    );

    expect(summary).toEqual({
      activeDaysCount: 0,
      missedPastCoreDays: 0,
      completedScheduled: 0,
      evaluatedScheduledWorkouts: 0,
      adherencePct: 0,
    });
  });

  it('treats scheduled rest days as neutral without counting them as missed or completed scheduled workouts', () => {
    // cycleStart = 2026-10-01
    // Oct 01 (Day 1 push-a): completed
    // Oct 02 (Day 2 pull-a): completed
    // Oct 03 (Day 3 hybrid-a): completed
    // Oct 04 (Day 4 rest-1): scheduled rest -> advances to Day 5 without log
    // Oct 05 (Day 5 push-b): completed
    const logs: SessionLog[] = [
      makeCompletedLog('oct-01', '2026-10-01', 'push-a'),
      makeCompletedLog('oct-02', '2026-10-02', 'pull-a'),
      makeCompletedLog('oct-03', '2026-10-03', 'hybrid-a'),
      makeCompletedLog('oct-05', '2026-10-05', 'push-b'),
    ];
    const index = buildFitnessIndex(logs, defsMap);
    const summary = selectMonthlyHeatmapSummary(
      index,
      coreWorkoutByCycleDayMap,
      '2026-10-10',
      '2026-10-01',
      '2026-10-05'
    );

    expect(summary).toEqual({
      activeDaysCount: 4,
      missedPastCoreDays: 0,
      completedScheduled: 4,
      evaluatedScheduledWorkouts: 4,
      adherencePct: 100,
    });
  });

  it('handles a month with no evaluated scheduled workouts (pre-cycle bonus log or all-rest cycle)', () => {
    // Case A: Bonus session in August prior to cycleStart in September -> activeDaysCount = 1, evaluatedScheduledWorkouts = 0
    const logs: SessionLog[] = [
      makeCompletedLog('aug-bonus', '2026-08-18', 'date-night'),
    ];
    const index = buildFitnessIndex(logs, defsMap);
    const preCycleSummary = selectMonthlyHeatmapSummary(
      index,
      coreWorkoutByCycleDayMap,
      '2026-08-01',
      '2026-09-01',
      '2026-10-15'
    );

    expect(preCycleSummary).toEqual({
      activeDaysCount: 1,
      missedPastCoreDays: 0,
      completedScheduled: 0,
      evaluatedScheduledWorkouts: 0,
      adherencePct: 0,
    });

    // Case B: Custom all-rest cycle map -> evaluatedScheduledWorkouts = 0
    const allRestMap = new Map<number, Workout>();
    for (let day = 1; day <= 8; day++) {
      allRestMap.set(day, {
        id: `rest-${day}`,
        name: `Rest ${day}`,
        badge: `REST ${day}`,
        type: 'rest',
        isCore: true,
        cycleDay: day,
        exercises: [],
      });
    }
    const restSummary = selectMonthlyHeatmapSummary(
      buildFitnessIndex([], defsMap),
      allRestMap,
      '2026-09-01',
      '2026-09-01',
      '2026-10-01'
    );
    expect(restSummary).toEqual({
      activeDaysCount: 0,
      missedPastCoreDays: 0,
      completedScheduled: 0,
      evaluatedScheduledWorkouts: 0,
      adherencePct: 0,
    });
  });

  it('respects leap-year February boundaries (2024-02 has Feb 29; 2025-02 ends on Feb 28)', () => {
    // Leap year: 2024-02-26..29 (4 days: Day 1, 2, 3, 4 rest)
    const leapLogs: SessionLog[] = [
      makeCompletedLog('f24-26', '2024-02-26', 'push-a'),
      makeCompletedLog('f24-27', '2024-02-27', 'pull-a'),
      makeCompletedLog('f24-29', '2024-02-29', 'hybrid-a'),
      // Log in March 2024 must not bleed into Feb 2024
      makeCompletedLog('m24-01', '2024-03-01', 'push-b'),
    ];
    const leapSummary = selectMonthlyHeatmapSummary(
      buildFitnessIndex(leapLogs, defsMap),
      coreWorkoutByCycleDayMap,
      '2024-02-01',
      '2024-02-26',
      '2024-03-10'
    );
    expect(leapSummary).toEqual({
      activeDaysCount: 3, // Feb 26, Feb 27, Feb 29 (includes Feb 29!)
      missedPastCoreDays: 1, // Feb 28 missed Day 3
      completedScheduled: 3, // Feb 26, 27, 29
      evaluatedScheduledWorkouts: 4,
      adherencePct: 75,
    });

    // Non-leap year: 2025-02-26..28 (3 days total in Feb)
    const nonLeapLogs: SessionLog[] = [
      makeCompletedLog('f25-26', '2025-02-26', 'push-a'),
      makeCompletedLog('f25-27', '2025-02-27', 'pull-a'),
      makeCompletedLog('f25-28', '2025-02-28', 'hybrid-a'),
      // Log on March 1 must not be counted in Feb 2025
      makeCompletedLog('m25-01', '2025-03-01', 'push-b'),
    ];
    const nonLeapSummary = selectMonthlyHeatmapSummary(
      buildFitnessIndex(nonLeapLogs, defsMap),
      coreWorkoutByCycleDayMap,
      '2025-02-01',
      '2025-02-26',
      '2025-03-10'
    );
    expect(nonLeapSummary).toEqual({
      activeDaysCount: 3,
      missedPastCoreDays: 0,
      completedScheduled: 3,
      evaluatedScheduledWorkouts: 3,
      adherencePct: 100,
    });
  });

  it('remains independent from global Analytics timeRange while evaluating a displayed month', () => {
    const logs: SessionLog[] = [
      // August 2026: 1 completed session
      makeCompletedLog('aug-28', '2026-08-28', 'push-a'),
      // August 29..31 missed pull-a (3 missed days in Aug) -> Sep 01 carries pull-a
      // Let's check Sep vs Aug independently when timeRange is 7d vs all:
      makeCompletedLog('oct-14', '2026-10-14', 'pull-a'),
    ];
    const index = buildFitnessIndex(logs, defsMap);
    const now = new Date('2026-10-15T12:00:00Z');

    // Global Analytics with 7d range filters global analytics window to Oct 09..Oct 15
    const analytics7d = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      '7d',
      '2026-08-28',
      undefined,
      now
    );
    const analyticsAll = selectTimeRangeAnalytics(
      index,
      workoutMap,
      coreWorkoutByCycleDayMap,
      'all',
      '2026-08-28',
      undefined,
      now
    );

    // Global ranges clearly differ (7d has 1 completed session in last 7d, ALL has 2)
    expect(analytics7d.rangeLogsCount).toBe(1);
    expect(analyticsAll.rangeLogsCount).toBe(2);

    // Month summary for August stays strictly anchored to August regardless of timeRange
    const augSummary = selectMonthlyHeatmapSummary(
      index,
      coreWorkoutByCycleDayMap,
      '2026-08-15',
      '2026-08-28',
      now
    );
    expect(augSummary).toEqual({
      activeDaysCount: 1,
      missedPastCoreDays: 3,
      completedScheduled: 1,
      evaluatedScheduledWorkouts: 4,
      adherencePct: 25,
    });
  });
});
