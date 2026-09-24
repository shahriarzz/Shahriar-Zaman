import { describe, it, expect } from 'vitest';
import { Workout, SessionLog } from '../types/fitness';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { getCycleDay, getAdjustedCycleStart } from '../utils/fitnessCalculations';
import {
  buildFitnessIndex,
  selectNextCycleDay,
  selectCycleDayForDate,
  selectCoreWorkoutForCycleDay,
  selectTodayCoreWorkout
} from '../utils/fitnessDerivedSelectors';

describe('Recovery Day Cycle Advancement Regression Suite', () => {
  const workouts: Workout[] = INITIAL_WORKOUTS;
  const workoutMap = new Map<string, Workout>();
  const coreMap = new Map<number, Workout>();
  workouts.forEach(w => {
    workoutMap.set(w.id, w);
    if (w.isCore && typeof w.cycleDay === 'number') {
      coreMap.set(w.cycleDay, w);
    }
  });

  // Cycle start anchor: 2026-10-01 (Thursday) is Day 1
  // Day 1: 2026-10-01 (Push Day A - DAY 1 · PUSH A)
  // Day 2: 2026-10-02 (Pull Day A - DAY 2 · PULL A)
  // Day 3: 2026-10-03 (Hybrid Day A - DAY 3 · HYBRID A)
  // Day 4: 2026-10-04 (Recovery Day - DAY 4 · REST)
  // Day 5: 2026-10-05 (Push Day B - DAY 5 · PUSH B)
  // Day 6: 2026-10-06 (Pull Day B - DAY 6 · PULL B)
  // Day 7: 2026-10-07 (Hybrid Day B - DAY 7 · HYBRID B)
  // Day 8: 2026-10-08 (Recovery Day - DAY 8 · REST)
  // Day 1: 2026-10-09 (Push Day A - DAY 1 · PUSH A)
  const cycleStart = '2026-10-01';

  it('1. Day 3 → Day 4: Hybrid Day A transitions naturally to Recovery Day tomorrow', () => {
    // On Day 3 (2026-10-03), user has completed Hybrid Day A
    const logs: SessionLog[] = [
      { id: 'log-1', workoutId: 'push-a', date: '2026-10-01', complete: true, durationMinutes: 45, sets: {} },
      { id: 'log-2', workoutId: 'pull-a', date: '2026-10-02', complete: true, durationMinutes: 45, sets: {} },
      { id: 'log-3', workoutId: 'hybrid-a', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} },
    ];
    const index = buildFitnessIndex(logs);

    // Day 3 evaluates to cycleDay 3
    const day3 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-03');
    expect(day3).toBe(3);
    const day3Workout = selectCoreWorkoutForCycleDay(workoutMap, day3);
    expect(day3Workout?.badge).toBe('DAY 3 · HYBRID A');

    // Tomorrow (2026-10-04) naturally becomes Day 4 Recovery
    const day4 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-04');
    expect(day4).toBe(4);
    const day4Workout = selectCoreWorkoutForCycleDay(workoutMap, day4);
    expect(day4Workout?.badge).toBe('DAY 4 · REST');
    expect(day4Workout?.type).toBe('rest');
  });

  it('2. Day 4 → Day 5 without a Recovery log: advances to Push Day B without any log on Day 4', () => {
    // Only logs up to Day 3 exist. Absolutely NO log on Day 4 (2026-10-04).
    const logs: SessionLog[] = [
      { id: 'log-3', workoutId: 'hybrid-a', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} },
    ];
    const index = buildFitnessIndex(logs);

    // On Day 5 (2026-10-05), protocol must advance to Day 5 (Push Day B)
    const day5 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-05');
    expect(day5).toBe(5);

    const day5Workout = selectCoreWorkoutForCycleDay(workoutMap, day5);
    expect(day5Workout?.badge).toBe('DAY 5 · PUSH B');
    expect(day5Workout?.type).toBe('push');

    const todayCore = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-05');
    expect(todayCore?.badge).toBe('DAY 5 · PUSH B');
  });

  it('3. Day 7 → Day 8: Hybrid Day B transitions naturally to Recovery Day tomorrow', () => {
    const logs: SessionLog[] = [
      { id: 'log-7', workoutId: 'hybrid-b', date: '2026-10-07', complete: true, durationMinutes: 45, sets: {} },
    ];
    const index = buildFitnessIndex(logs);

    // Day 7 evaluates to cycleDay 7
    const day7 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-07');
    expect(day7).toBe(7);
    const day7Workout = selectCoreWorkoutForCycleDay(workoutMap, day7);
    expect(day7Workout?.badge).toBe('DAY 7 · HYBRID B');

    // Tomorrow (2026-10-08) is Day 8 Recovery
    const day8 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-08');
    expect(day8).toBe(8);
    const day8Workout = selectCoreWorkoutForCycleDay(workoutMap, day8);
    expect(day8Workout?.badge).toBe('DAY 8 · REST');
    expect(day8Workout?.type).toBe('rest');
  });

  it('4. Day 8 → Day 1: Recovery Day naturally wraps cycle to Push Day A without a log on Day 8', () => {
    // Only logs up to Day 7 exist. Absolutely NO log on Day 8 (2026-10-08).
    const logs: SessionLog[] = [
      { id: 'log-7', workoutId: 'hybrid-b', date: '2026-10-07', complete: true, durationMinutes: 45, sets: {} },
    ];
    const index = buildFitnessIndex(logs);

    // On Day 1 (2026-10-09), protocol wraps to Day 1 (Push Day A)
    const day1NextCycle = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-09');
    expect(day1NextCycle).toBe(1);

    const day1Workout = selectCoreWorkoutForCycleDay(workoutMap, day1NextCycle);
    expect(day1Workout?.badge).toBe('DAY 1 · PUSH A');
    expect(day1Workout?.type).toBe('push');

    const todayCore = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-09');
    expect(todayCore?.badge).toBe('DAY 1 · PUSH A');
  });

  it('5. Skip Day 4 completely → Day 5: Even if user does not open app on Day 4, Day 5 resolves correctly', () => {
    // An empty log set or old logs from previous weeks
    const index = buildFitnessIndex([]);

    // Open on Day 5 directly
    const day5 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-05');
    expect(day5).toBe(5);

    const targetWorkout = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-05');
    expect(targetWorkout?.badge).toBe('DAY 5 · PUSH B');
  });

  it('6. Skip Day 8 completely → Day 1: Even if user does not open app on Day 8, Day 1 resolves correctly', () => {
    const index = buildFitnessIndex([]);

    // Open on Day 1 of next cycle directly
    const day1 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-09');
    expect(day1).toBe(1);

    const targetWorkout = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-09');
    expect(targetWorkout?.badge).toBe('DAY 1 · PUSH A');
  });

  it('7. Bonus workout between core days does not alter the cycle', () => {
    // User did Day 3 on 2026-10-03, then did a bonus "Date Night" session on Recovery Day (2026-10-04)
    const logs: SessionLog[] = [
      { id: 'log-3', workoutId: 'hybrid-a', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} },
      { id: 'log-bonus', workoutId: 'date-night', date: '2026-10-04', complete: true, durationMinutes: 30, sets: {} },
    ];
    const index = buildFitnessIndex(logs);

    // Day 4 scheduled protocol remains Recovery Day despite bonus workout
    const day4 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-04');
    expect(day4).toBe(4);
    const day4Workout = selectCoreWorkoutForCycleDay(workoutMap, day4);
    expect(day4Workout?.badge).toBe('DAY 4 · REST');

    // Day 5 scheduled protocol remains Push Day B
    const day5 = selectNextCycleDay(index, workoutMap, cycleStart, '2026-10-05');
    expect(day5).toBe(5);
    const day5Workout = selectCoreWorkoutForCycleDay(workoutMap, day5);
    expect(day5Workout?.badge).toBe('DAY 5 · PUSH B');
  });

  it('8. Reloading the app on the day after Recovery still resolves the correct cycle day', () => {
    // User views Day 4 Recovery on 2026-10-04.
    // Index has no logs on Day 4.
    const logs: SessionLog[] = [
      { id: 'log-3', workoutId: 'hybrid-a', date: '2026-10-03', complete: true, durationMinutes: 45, sets: {} },
    ];
    const indexAfterReload = buildFitnessIndex(logs);

    // Reopen next morning (2026-10-05)
    const morningCycleDay = selectNextCycleDay(indexAfterReload, workoutMap, cycleStart, '2026-10-05');
    expect(morningCycleDay).toBe(5);
    const morningWorkout = selectTodayCoreWorkout(workoutMap, cycleStart, '2026-10-05');
    expect(morningWorkout?.badge).toBe('DAY 5 · PUSH B');
  });

  it('9. A completed workout must not cause the next calendar day to incorrectly remain on Recovery', () => {
    // When user completes Day 3 (Hybrid Day A) on 2026-10-03:
    // Today's scheduled day was 3, and user completed day 3.
    // cycleStart remains aligned.
    const currentScheduledDay = getCycleDay(cycleStart, '2026-10-03');
    expect(currentScheduledDay).toBe(3);

    // Next calendar day is 2026-10-04 (Recovery Day, Day 4)
    const recoveryDay = getCycleDay(cycleStart, '2026-10-04');
    expect(recoveryDay).toBe(4);

    // Following calendar day is 2026-10-05 (Push B, Day 5) - must NOT remain on Day 4!
    const dayAfterRecovery = getCycleDay(cycleStart, '2026-10-05');
    expect(dayAfterRecovery).toBe(5);
    expect(dayAfterRecovery).not.toBe(4);
  });

  it('10. Existing cycle behavior for Days 1–3 and 5–7 remains unchanged', () => {
    // Day 1
    expect(getCycleDay(cycleStart, '2026-10-01')).toBe(1);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 1)?.badge).toBe('DAY 1 · PUSH A');

    // Day 2
    expect(getCycleDay(cycleStart, '2026-10-02')).toBe(2);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 2)?.badge).toBe('DAY 2 · PULL A');

    // Day 3
    expect(getCycleDay(cycleStart, '2026-10-03')).toBe(3);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 3)?.badge).toBe('DAY 3 · HYBRID A');

    // Day 5
    expect(getCycleDay(cycleStart, '2026-10-05')).toBe(5);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 5)?.badge).toBe('DAY 5 · PUSH B');

    // Day 6
    expect(getCycleDay(cycleStart, '2026-10-06')).toBe(6);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 6)?.badge).toBe('DAY 6 · PULL B');

    // Day 7
    expect(getCycleDay(cycleStart, '2026-10-07')).toBe(7);
    expect(selectCoreWorkoutForCycleDay(workoutMap, 7)?.badge).toBe('DAY 7 · HYBRID B');
  });

  it('Acceptance Criterion 1: If the app shows "DAY 4 · REST" today, open the app tomorrow without logging anything today -> shows "DAY 5 · PUSH B"', () => {
    const today = '2026-10-04';
    const tomorrow = '2026-10-05';

    // Today is Day 4
    const todayCycle = selectNextCycleDay(null, workoutMap, cycleStart, today);
    const todayWorkout = selectCoreWorkoutForCycleDay(workoutMap, todayCycle);
    expect(todayWorkout?.badge).toBe('DAY 4 · REST');

    // Without logging anything today, tomorrow's workout resolves
    const tomorrowCycle = selectNextCycleDay(null, workoutMap, cycleStart, tomorrow);
    const tomorrowWorkout = selectCoreWorkoutForCycleDay(workoutMap, tomorrowCycle);
    expect(tomorrowWorkout?.badge).toBe('DAY 5 · PUSH B');
  });

  it('Acceptance Criterion 2: If the app shows "DAY 8 · REST" today, open the app tomorrow without logging anything today -> shows "DAY 1 · PUSH A"', () => {
    const today = '2026-10-08';
    const tomorrow = '2026-10-09';

    // Today is Day 8
    const todayCycle = selectNextCycleDay(null, workoutMap, cycleStart, today);
    const todayWorkout = selectCoreWorkoutForCycleDay(workoutMap, todayCycle);
    expect(todayWorkout?.badge).toBe('DAY 8 · REST');

    // Without logging anything today, tomorrow's workout resolves
    const tomorrowCycle = selectNextCycleDay(null, workoutMap, cycleStart, tomorrow);
    const tomorrowWorkout = selectCoreWorkoutForCycleDay(workoutMap, tomorrowCycle);
    expect(tomorrowWorkout?.badge).toBe('DAY 1 · PUSH A');
  });

  it('Manual realignment: Completing an unscheduled core workout realigns cycleStart appropriately', () => {
    // Suppose today is 2026-10-04 (scheduled Day 4 Recovery).
    // The user decides to complete Day 1 (Push Day A) today to restart cycle early.
    const refDate = '2026-10-04';
    const adjustedStart = getAdjustedCycleStart(1, refDate);
    expect(adjustedStart).toBe('2026-10-04');

    // Now today (2026-10-04) evaluates to Day 1
    expect(getCycleDay(adjustedStart, '2026-10-04')).toBe(1);
    // Tomorrow (2026-10-05) evaluates to Day 2
    expect(getCycleDay(adjustedStart, '2026-10-05')).toBe(2);
  });
});
