import { describe, it, expect } from 'vitest';
import { Workout, SessionLog } from '../types/fitness';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { getCycleDay, getAdjustedCycleStart } from '../utils/fitnessCalculations';
import {
  buildFitnessIndex,
  buildValidatedCoreWorkoutMap,
  selectNextCycleDay,
  selectCycleDayForDate,
  selectCoreWorkoutForCycleDay,
  selectTodayCoreWorkout,
  selectTimeRangeAnalytics
} from '../utils/fitnessDerivedSelectors';

describe('Recovery Day & Carry-Forward Cycle Advancement Regression Suite', () => {
  const workouts: Workout[] = INITIAL_WORKOUTS;
  const { coreWorkoutByCycleDayMap: coreMap } = buildValidatedCoreWorkoutMap(workouts);
  const workoutMap = new Map<string, Workout>();
  workouts.forEach(w => {
    workoutMap.set(w.id, w);
  });

  // Cycle start anchor: 2026-10-01
  const cycleStart = '2026-10-01';

  const fullCycleThroughDay3Logs: SessionLog[] = [
    { id: 'log-1', workoutId: 'push-a', date: '2026-10-01', complete: true, durationMinutes: 45, sets: {} },
    { id: 'log-2', workoutId: 'pull-a', date: '2026-10-02', complete: true, durationMinutes: 45, sets: {} },
    { id: 'log-3', workoutId: 'hybrid-a', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} },
  ];

  const fullCycleThroughDay7Logs: SessionLog[] = [
    ...fullCycleThroughDay3Logs,
    // Day 4 (2026-10-04) is Recovery: no log required
    { id: 'log-5', workoutId: 'push-b', date: '2026-10-05', complete: true, durationMinutes: 45, sets: {} },
    { id: 'log-6', workoutId: 'pull-b', date: '2026-10-06', complete: true, durationMinutes: 45, sets: {} },
    { id: 'log-7', workoutId: 'hybrid-b', date: '2026-10-07', complete: true, durationMinutes: 45, sets: {} },
  ];

  it('1. Day 3 → Day 4: Hybrid Day A transitions naturally to Recovery Day tomorrow', () => {
    const index3 = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), '2026-10-03');
    const day3 = selectNextCycleDay(cycleStart, '2026-10-03', index3, coreMap);
    expect(day3).toBe(3);
    expect(selectCoreWorkoutForCycleDay(workoutMap, day3)?.badge).toBe('DAY 3 · HYBRID A');

    const index4 = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), '2026-10-04');
    const day4 = selectNextCycleDay(cycleStart, '2026-10-04', index4, coreMap);
    expect(day4).toBe(4);
    const day4Workout = selectCoreWorkoutForCycleDay(workoutMap, day4);
    expect(day4Workout?.badge).toBe('DAY 4 · REST');
    expect(day4Workout?.type).toBe('rest');
  });

  it('2. Day 4 → Day 5 without a Recovery log: advances to Push Day B without any log on Day 4', () => {
    const index = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), '2026-10-05');

    const day5 = selectNextCycleDay(cycleStart, '2026-10-05', index, coreMap);
    expect(day5).toBe(5);

    const day5Workout = selectCoreWorkoutForCycleDay(workoutMap, day5);
    expect(day5Workout?.badge).toBe('DAY 5 · PUSH B');
    expect(day5Workout?.type).toBe('push');

    const todayCore = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-05', index);
    expect(todayCore?.badge).toBe('DAY 5 · PUSH B');
  });

  it('3. Day 7 → Day 8: Hybrid Day B transitions naturally to Recovery Day tomorrow', () => {
    const index7 = buildFitnessIndex(fullCycleThroughDay7Logs, new Map(), '2026-10-07');
    const day7 = selectNextCycleDay(cycleStart, '2026-10-07', index7, coreMap);
    expect(day7).toBe(7);
    expect(selectCoreWorkoutForCycleDay(workoutMap, day7)?.badge).toBe('DAY 7 · HYBRID B');

    const index8 = buildFitnessIndex(fullCycleThroughDay7Logs, new Map(), '2026-10-08');
    const day8 = selectNextCycleDay(cycleStart, '2026-10-08', index8, coreMap);
    expect(day8).toBe(8);
    const day8Workout = selectCoreWorkoutForCycleDay(workoutMap, day8);
    expect(day8Workout?.badge).toBe('DAY 8 · REST');
    expect(day8Workout?.type).toBe('rest');
  });

  it('4. Day 8 → Day 1: Recovery Day naturally wraps cycle to Push Day A without a log on Day 8', () => {
    const index = buildFitnessIndex(fullCycleThroughDay7Logs, new Map(), '2026-10-09');

    const day1NextCycle = selectNextCycleDay(cycleStart, '2026-10-09', index, coreMap);
    expect(day1NextCycle).toBe(1);

    const day1Workout = selectCoreWorkoutForCycleDay(workoutMap, day1NextCycle);
    expect(day1Workout?.badge).toBe('DAY 1 · PUSH A');
    expect(day1Workout?.type).toBe('push');

    const todayCore = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-09', index);
    expect(todayCore?.badge).toBe('DAY 1 · PUSH A');
  });

  it('5. Skip opening on Day 4 completely → Day 5 still resolves once Days 1–3 are completed', () => {
    const index = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), '2026-10-05');

    const day5 = selectNextCycleDay(cycleStart, '2026-10-05', index, coreMap);
    expect(day5).toBe(5);

    const targetWorkout = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-05', index);
    expect(targetWorkout?.badge).toBe('DAY 5 · PUSH B');
  });

  it('6. Skip opening on Day 8 completely → Day 1 wraps cleanly once Days 1–7 are completed', () => {
    const index = buildFitnessIndex(fullCycleThroughDay7Logs, new Map(), '2026-10-09');

    const day1 = selectNextCycleDay(cycleStart, '2026-10-09', index, coreMap);
    expect(day1).toBe(1);

    const targetWorkout = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-09', index);
    expect(targetWorkout?.badge).toBe('DAY 1 · PUSH A');
  });

  it('7. Bonus workout between core days and on missed training days never alters the core cycle', () => {
    // User completed Days 1..3, then did a bonus session on Recovery Day 4 (2026-10-04)
    const logs: SessionLog[] = [
      ...fullCycleThroughDay3Logs,
      { id: 'log-bonus', workoutId: 'date-night', date: '2026-10-04', complete: true, durationMinutes: 30, sets: {} },
    ];
    const index4 = buildFitnessIndex(logs, new Map(), '2026-10-04');
    expect(selectNextCycleDay(cycleStart, '2026-10-04', index4, coreMap)).toBe(4);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 4)?.badge).toBe('DAY 4 · REST');

    const index5 = buildFitnessIndex(logs, new Map(), '2026-10-05');
    expect(selectNextCycleDay(cycleStart, '2026-10-05', index5, coreMap)).toBe(5);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 5)?.badge).toBe('DAY 5 · PUSH B');

    // Bonus workout on Day 1 (when Push A was missed) does NOT advance Push A to Pull A
    const bonusOnTrainingLogs: SessionLog[] = [
      { id: 'log-bonus-1', workoutId: 'date-night', date: '2026-10-01', complete: true, durationMinutes: 30, sets: {} },
    ];
    const indexBonusTraining = buildFitnessIndex(bonusOnTrainingLogs, new Map(), '2026-10-02');
    expect(selectNextCycleDay(cycleStart, '2026-10-02', indexBonusTraining, coreMap)).toBe(1);
    expect(selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-02', indexBonusTraining)?.id).toBe('push-a');
  });

  it('8. Reloading the app on the day after Recovery resolves Day 5; missing a training day carries it forward', () => {
    const indexAfterRecovery = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), '2026-10-05');
    expect(selectNextCycleDay(cycleStart, '2026-10-05', indexAfterRecovery, coreMap)).toBe(5);
    expect(selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-05', indexAfterRecovery)?.badge).toBe('DAY 5 · PUSH B');

    // Now Push B is missed on 2026-10-05 -> reloading on 2026-10-06 MUST carry forward Push B
    const indexAfterMissedPushB = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), '2026-10-06');
    expect(selectNextCycleDay(cycleStart, '2026-10-06', indexAfterMissedPushB, coreMap)).toBe(5);
    expect(selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-06', indexAfterMissedPushB)?.badge).toBe('DAY 5 · PUSH B');
  });

  it('9. Missed Push A carries forward across consecutive days and advances to Pull A once completed without rewriting history', () => {
    // Miss Day 1 (2026-10-01) and Day 2 (2026-10-02): Day 3 (2026-10-03) still expects Push A
    const emptyIdx = buildFitnessIndex([], new Map(), '2026-10-03');
    expect(selectNextCycleDay(cycleStart, '2026-10-03', emptyIdx, coreMap)).toBe(1);

    // Complete Push A on 2026-10-03 (two days late)
    const latePushALogs: SessionLog[] = [
      { id: 'late-1', workoutId: 'push-a', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} },
    ];
    const idxOn04 = buildFitnessIndex(latePushALogs, new Map(), '2026-10-04');
    // Tomorrow (2026-10-04) advances to Pull A (Day 2)
    expect(selectNextCycleDay(cycleStart, '2026-10-04', idxOn04, coreMap)).toBe(2);
    expect(selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-04', idxOn04)?.id).toBe('pull-a');

    // Historical dates 2026-10-01 and 2026-10-02 remain deterministically Push A (missed), NOT rewritten
    expect(selectCycleDayForDate('2026-10-01', cycleStart, idxOn04, coreMap, '2026-10-04')).toBe(1);
    expect(selectCycleDayForDate('2026-10-02', cycleStart, idxOn04, coreMap, '2026-10-04')).toBe(1);
  });

  it('10. Incomplete session logs never advance the core cycle', () => {
    const incompleteLogs: SessionLog[] = [
      { id: 'inc-1', workoutId: 'push-a', date: '2026-10-01', complete: false, durationMinutes: 20, sets: {} },
    ];
    const index = buildFitnessIndex(incompleteLogs, new Map(), '2026-10-02');
    expect(selectNextCycleDay(cycleStart, '2026-10-02', index, coreMap)).toBe(1);
    expect(selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-02', index)?.id).toBe('push-a');
  });

  it('11. Historical date projections remain deterministic regardless of today completions', () => {
    const baseLogs: SessionLog[] = [
      { id: 'log-1', workoutId: 'push-a', date: '2026-10-01', complete: true, durationMinutes: 45, sets: {} },
      // 2026-10-02 missed Pull A
    ];
    const todayPendingIdx = buildFitnessIndex(baseLogs, new Map(), '2026-10-03');
    const histBefore = selectCycleDayForDate('2026-10-02', cycleStart, todayPendingIdx, coreMap, '2026-10-03');
    expect(histBefore).toBe(2);

    // Completing Push B (out-of-order) today on 2026-10-03 does NOT rewrite 2026-10-01 or 2026-10-02
    const afterOutOfOrderIdx = buildFitnessIndex(
      [...baseLogs, { id: 'log-3', workoutId: 'push-b', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} }],
      new Map(),
      '2026-10-03'
    );
    expect(selectCycleDayForDate('2026-10-01', cycleStart, afterOutOfOrderIdx, coreMap, '2026-10-03')).toBe(1);
    expect(selectCycleDayForDate('2026-10-02', cycleStart, afterOutOfOrderIdx, coreMap, '2026-10-03')).toBe(2);
    // Today shows Push B (5) completed and tomorrow projects Pull B (6)
    expect(selectNextCycleDay(cycleStart, '2026-10-03', afterOutOfOrderIdx, coreMap)).toBe(5);
    expect(selectCycleDayForDate('2026-10-04', cycleStart, afterOutOfOrderIdx, coreMap, '2026-10-03')).toBe(6);
  });

  it('12. Pure calendar position helper getCycleDay remains intact for modulo calendar math', () => {
    expect(getCycleDay(cycleStart, '2026-10-01')).toBe(1);
    expect(getCycleDay(cycleStart, '2026-10-02')).toBe(2);
    expect(getCycleDay(cycleStart, '2026-10-03')).toBe(3);
    expect(getCycleDay(cycleStart, '2026-10-04')).toBe(4);
    expect(getCycleDay(cycleStart, '2026-10-05')).toBe(5);
    expect(getCycleDay(cycleStart, '2026-10-06')).toBe(6);
    expect(getCycleDay(cycleStart, '2026-10-07')).toBe(7);
    expect(getCycleDay(cycleStart, '2026-10-08')).toBe(8);
  });

  it('Acceptance Criterion 1: If the app shows "DAY 4 · REST" today, open tomorrow without logging today → "DAY 5 · PUSH B"', () => {
    const today = '2026-10-04';
    const tomorrow = '2026-10-05';

    const idxToday = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), today);
    const todayCycle = selectNextCycleDay(cycleStart, today, idxToday, coreMap);
    expect(selectCoreWorkoutForCycleDay(workoutMap, todayCycle)?.badge).toBe('DAY 4 · REST');

    const idxTomorrow = buildFitnessIndex(fullCycleThroughDay3Logs, new Map(), tomorrow);
    const tomorrowCycle = selectNextCycleDay(cycleStart, tomorrow, idxTomorrow, coreMap);
    expect(selectCoreWorkoutForCycleDay(workoutMap, tomorrowCycle)?.badge).toBe('DAY 5 · PUSH B');
  });

  it('Acceptance Criterion 2: If the app shows "DAY 8 · REST" today, open tomorrow without logging today → "DAY 1 · PUSH A"', () => {
    const today = '2026-10-08';
    const tomorrow = '2026-10-09';

    const idxToday = buildFitnessIndex(fullCycleThroughDay7Logs, new Map(), today);
    const todayCycle = selectNextCycleDay(cycleStart, today, idxToday, coreMap);
    expect(selectCoreWorkoutForCycleDay(workoutMap, todayCycle)?.badge).toBe('DAY 8 · REST');

    const idxTomorrow = buildFitnessIndex(fullCycleThroughDay7Logs, new Map(), tomorrow);
    const tomorrowCycle = selectNextCycleDay(cycleStart, tomorrow, idxTomorrow, coreMap);
    expect(selectCoreWorkoutForCycleDay(workoutMap, tomorrowCycle)?.badge).toBe('DAY 1 · PUSH A');
  });

  it('Manual realignment: Completing an out-of-order core workout realigns cycleStart appropriately', () => {
    const refDate = '2026-10-04';
    const adjustedStart = getAdjustedCycleStart(1, refDate);
    expect(adjustedStart).toBe('2026-10-04');

    const idxAfter = buildFitnessIndex(
      [{ id: 'realign-1', workoutId: 'push-a', date: refDate, complete: true, durationMinutes: 40, sets: {} }],
      new Map(),
      '2026-10-05'
    );
    expect(selectCycleDayForDate('2026-10-04', adjustedStart, idxAfter, coreMap, '2026-10-05')).toBe(1);
    expect(selectNextCycleDay(adjustedStart, '2026-10-05', idxAfter, coreMap)).toBe(2);
  });

  it('Selector & Analytics cross-surface consistency under carry-forward', () => {
    // Missed Day 2 (2026-10-02) after completing Day 1 (2026-10-01); today is 2026-10-03
    const logs: SessionLog[] = [
      { id: 'log-1', workoutId: 'push-a', date: '2026-10-01', complete: true, durationMinutes: 45, sets: {} },
    ];
    const testNow = new Date(2026, 9, 3, 12, 0, 0); // 2026-10-03
    const index = buildFitnessIndex(logs, new Map(), testNow);

    // Today carries forward Day 2 (Pull A)
    expect(selectNextCycleDay(cycleStart, testNow, index, coreMap)).toBe(2);
    expect(selectTodayCoreWorkout(coreMap, cycleStart, testNow, index)?.id).toBe('pull-a');
    expect(selectCycleDayForDate('2026-10-03', cycleStart, index, coreMap, testNow)).toBe(2);

    // Adherence: 2026-10-01 completed (1), 2026-10-02 missed (1), 2026-10-03 pending today => 50%
    const analytics = selectTimeRangeAnalytics(index, workoutMap, coreMap, '7d', cycleStart, undefined, testNow);
    expect(analytics.completedScheduledCore).toBe(1);
    expect(analytics.missedPastCoreDays).toBe(1);
    expect(analytics.isTodayCorePending).toBe(true);
    expect(analytics.adherencePct).toBe(50);
    expect(analytics.currentStreak).toBe(0);
  });
});
