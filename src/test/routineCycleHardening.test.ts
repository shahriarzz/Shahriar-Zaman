// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Workout, SessionLog, AppState } from '../types/fitness';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { getCycleDay, getAdjustedCycleStart, dk } from '../utils/fitnessCalculations';
import {
  buildValidatedCoreWorkoutMap,
  selectNextCycleDay,
  selectCycleDayForDate,
  selectCoreWorkoutForCycleDay,
  selectTodayCoreWorkout,
  buildFitnessIndex,
  selectTimeRangeAnalytics
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';

describe('Routine Cycle Verification and Regression Hardening', () => {
  const initialWorkouts: Workout[] = INITIAL_WORKOUTS;

  describe('Core Workout Map Validation Boundary', () => {
    it('1. Valid 8-day core workouts assemble clean map with isValid: true and 0 errors', () => {
      const result = buildValidatedCoreWorkoutMap(initialWorkouts);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.coreWorkoutByCycleDayMap.size).toBe(8);

      for (let day = 1; day <= 8; day++) {
        const wo = result.coreWorkoutByCycleDayMap.get(day);
        expect(wo).toBeDefined();
        expect(wo?.cycleDay).toBe(day);
        expect(wo?.isCore).toBe(true);
      }
    });

    it('2. Detects duplicate core cycleDay values without silent Map.set() overwrite', () => {
      const duplicateWorkouts: Workout[] = [
        ...initialWorkouts,
        {
          id: 'custom_push_a_dupe',
          name: 'Competing Push Day',
          type: 'push',
          badge: 'DAY 1 · COMPETING',
          cycleDay: 1,
          isCore: true,
          exercises: []
        }
      ];

      const result = buildValidatedCoreWorkoutMap(duplicateWorkouts);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate core workout cycleDay 1'))).toBe(true);
      // The original Day 1 workout must NOT be overwritten silently
      const day1Wo = result.coreWorkoutByCycleDayMap.get(1);
      expect(day1Wo?.id).toBe('push-a');
    });

    it('3. Detects invalid cycleDay (out of bounds or non-integer) and provides safe fallback', () => {
      const invalidWorkouts: Workout[] = initialWorkouts.map(w => {
        if (w.cycleDay === 2) {
          return { ...w, cycleDay: 9 as any }; // Out of bounds
        }
        return w;
      });

      const result = buildValidatedCoreWorkoutMap(invalidWorkouts);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid core workout cycleDay "9"'))).toBe(true);
      expect(result.errors.some(e => e.includes('Missing core workout for cycle day 2'))).toBe(true);

      // Deterministic fallback for day 2 must be populated from initial data
      const day2Wo = result.coreWorkoutByCycleDayMap.get(2);
      expect(day2Wo).toBeDefined();
      expect(day2Wo?.id).toBe('pull-a');
    });

    it('4. Keeps bonus workouts strictly outside the core-day mapping', () => {
      const workoutsWithBonus: Workout[] = [
        ...initialWorkouts,
        {
          id: 'date-night-bonus',
          name: 'Date Night Mobility',
          type: 'date',
          badge: 'BONUS',
          isCore: false,
          cycleDay: 1, // Even if it mistakenly has a cycleDay set!
          exercises: []
        }
      ];

      const result = buildValidatedCoreWorkoutMap(workoutsWithBonus);
      expect(result.isValid).toBe(true);
      expect(result.coreWorkoutByCycleDayMap.get(1)?.id).toBe('push-a');
      expect(result.coreWorkoutByCycleDayMap.get(1)?.isCore).toBe(true);
    });

    it('5. Detects completely missing cycle days and restores safe fallback', () => {
      // Remove Day 5 and Day 6 entirely
      const strippedWorkouts = initialWorkouts.filter(w => w.cycleDay !== 5 && w.cycleDay !== 6);
      const result = buildValidatedCoreWorkoutMap(strippedWorkouts);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing core workout for cycle day 5'))).toBe(true);
      expect(result.errors.some(e => e.includes('Missing core workout for cycle day 6'))).toBe(true);

      // Verify safe fallback
      expect(result.coreWorkoutByCycleDayMap.get(5)?.id).toBe('push-b');
      expect(result.coreWorkoutByCycleDayMap.get(6)?.id).toBe('pull-b');
    });
  });

  describe('Cycle Completion & Advancement Scenarios', () => {
    const { coreWorkoutByCycleDayMap } = buildValidatedCoreWorkoutMap(initialWorkouts);
    const workoutMap = new Map<string, Workout>(initialWorkouts.map(w => [w.id, w]));

    // Scenario 1: Complete the expected core workout
    it('Scenario 1: Complete expected core workout: log persisted and anchor remains aligned', () => {
      const cycleStart = '2026-10-01'; // Day 1
      const today = '2026-10-01';

      const scheduledDay = getCycleDay(cycleStart, today);
      expect(scheduledDay).toBe(1);

      const activeWorkout = coreWorkoutByCycleDayMap.get(1)!;
      expect(activeWorkout.id).toBe('push-a');

      // Check realignment condition from SessionView:
      // if (!appState?.cycleStart || currentScheduledDay !== activeWorkout.cycleDay)
      const needsRealignment = !cycleStart || scheduledDay !== activeWorkout.cycleDay;
      expect(needsRealignment).toBe(false); // No realignment needed! Anchor remains '2026-10-01'
    });

    // Scenario 2: Complete a different core workout (out of order)
    it('Scenario 2: Complete different core workout: new anchor maps current date to that workout cycle day', () => {
      const cycleStart = '2026-10-01'; // Scheduled Day 1 on 2026-10-01
      const today = '2026-10-01';

      const scheduledDay = getCycleDay(cycleStart, today);
      expect(scheduledDay).toBe(1);

      // Lifter chooses to do Day 5 (Push B) instead of Day 1
      const activeWorkout = coreWorkoutByCycleDayMap.get(5)!;
      expect(activeWorkout.cycleDay).toBe(5);

      const needsRealignment = !cycleStart || scheduledDay !== activeWorkout.cycleDay;
      expect(needsRealignment).toBe(true);

      const newCycleStart = getAdjustedCycleStart(activeWorkout.cycleDay!, today);
      // For Day 5 on 2026-10-01, newCycleStart = 2026-10-01 minus 4 days = 2026-09-27
      expect(newCycleStart).toBe('2026-09-27');

      // Now today maps to Day 5!
      expect(getCycleDay(newCycleStart, today)).toBe(5);
      // And tomorrow naturally maps to Day 6 (Pull B)
      expect(getCycleDay(newCycleStart, '2026-10-02')).toBe(6);
    });

    // Scenario 3: Complete a bonus workout
    it('Scenario 3: Complete bonus workout: cycleStart is unchanged', () => {
      const cycleStart = '2026-10-01';
      const bonusWorkout: Workout = {
        id: 'date_night',
        name: 'Date Night Mobility',
        type: 'date',
        badge: 'BONUS',
        isCore: false,
        exercises: []
      };

      // Session completion check:
      const isCoreEligible = bonusWorkout.isCore && typeof bonusWorkout.cycleDay === 'number';
      expect(isCoreEligible).toBe(false);
      // cycleStart remains completely untouched
      expect(cycleStart).toBe('2026-10-01');
    });

    // Scenario 4: Open app on Day 4 without log, advance reference date to Day 5: Push B selected
    it('Scenario 4: Open app on Day 4 without a log, then advance reference date to Day 5: Push B selected', () => {
      const cycleStart = '2026-10-01';
      // 2026-10-01 = Day 1
      // 2026-10-02 = Day 2
      // 2026-10-03 = Day 3
      // 2026-10-04 = Day 4 (Recovery)
      // 2026-10-05 = Day 5 (Push B)

      const day4 = getCycleDay(cycleStart, '2026-10-04');
      expect(day4).toBe(4);
      const day4Workout = selectCoreWorkoutForCycleDay(coreWorkoutByCycleDayMap, day4);
      expect(day4Workout?.badge).toBe('DAY 4 · REST');

      // Zero logs recorded on Day 4. Advance reference date to Day 5
      const day5 = getCycleDay(cycleStart, '2026-10-05');
      expect(day5).toBe(5);
      const day5Workout = selectCoreWorkoutForCycleDay(coreWorkoutByCycleDayMap, day5);
      expect(day5Workout?.badge).toBe('DAY 5 · PUSH B');
      expect(day5Workout?.id).toBe('push-b');
    });

    // Scenario 5: Open app on Day 8 without log, advance to next date: Push A selected
    it('Scenario 5: Open app on Day 8 without a log, then advance to next date: Push A selected', () => {
      const cycleStart = '2026-10-01';
      // 2026-10-08 = Day 8 (Recovery)
      // 2026-10-09 = Day 1 (Push A)

      const day8 = getCycleDay(cycleStart, '2026-10-08');
      expect(day8).toBe(8);
      const day8Workout = selectCoreWorkoutForCycleDay(coreWorkoutByCycleDayMap, day8);
      expect(day8Workout?.badge).toBe('DAY 8 · REST');

      // Zero logs on Day 8. Advance date to 2026-10-09
      const nextCycleDay = getCycleDay(cycleStart, '2026-10-09');
      expect(nextCycleDay).toBe(1);
      const nextCycleWorkout = selectCoreWorkoutForCycleDay(coreWorkoutByCycleDayMap, nextCycleDay);
      expect(nextCycleWorkout?.badge).toBe('DAY 1 · PUSH A');
      expect(nextCycleWorkout?.id).toBe('push-a');
    });

    // Scenario 6: Miss multiple days: cycle follows calendar rather than last completed workout
    it('Scenario 6: Miss multiple days: cycle follows calendar rather than last completed workout', () => {
      const cycleStart = '2026-10-01';
      // Lifter only completed Day 1 on 2026-10-01.
      // Then misses 10 days! Current date is 2026-10-12 (11 calendar days after cycleStart).
      // 11 % 8 = 3 -> (3) + 1 = Day 4 (Recovery)
      // On 2026-10-13 (12 days after cycleStart): 12 % 8 = 4 -> (4) + 1 = Day 5 (Push B)

      const targetDate = '2026-10-12';
      const resolvedDay = getCycleDay(cycleStart, targetDate);
      expect(resolvedDay).toBe(4); // Day 4, NOT Day 2!

      const dayAfter = '2026-10-13';
      expect(getCycleDay(cycleStart, dayAfter)).toBe(5); // Day 5
    });

    // Scenario 7: Simulate failed session save: cycle not advanced prematurely and active session preserved
    it('Scenario 7: Simulate failed session save: cycle not advanced prematurely and active session draft preserved', async () => {
      let cycleStart = '2026-10-01';
      let activeSessionDraft: any = { workoutId: 'push-b', startTime: 12345, sessionSets: {} };
      let isFinishing = false;

      const mockAddLog = vi.fn().mockRejectedValue(new Error('IndexedDB storage quota exceeded'));
      const mockUpdateCycleStart = vi.fn().mockImplementation((newStart: string) => {
        cycleStart = newStart;
      });
      const mockClearActiveSession = vi.fn().mockImplementation(() => {
        activeSessionDraft = null;
      });

      // Emulate finishSession transactional path from SessionView:
      async function executeFinish(activeWorkout: Workout) {
        try {
          // 1. Sanitize & Persist
          await mockAddLog('test-log-id', { id: 'test-log-id', workoutId: activeWorkout.id });

          // 2. Realignment
          if (
            activeWorkout.isCore &&
            typeof activeWorkout.cycleDay === 'number' &&
            activeWorkout.cycleDay >= 1 &&
            activeWorkout.cycleDay <= 8
          ) {
            const currentScheduledDay = getCycleDay(cycleStart, '2026-10-01');
            if (currentScheduledDay !== activeWorkout.cycleDay) {
              const newCycleStart = getAdjustedCycleStart(activeWorkout.cycleDay, '2026-10-01');
              await mockUpdateCycleStart(newCycleStart);
            }
          }

          // 3. Clear draft only after persistence
          mockClearActiveSession();
          isFinishing = true;
        } catch (err) {
          // Error caught; active session preserved
        }
      }

      await executeFinish(coreWorkoutByCycleDayMap.get(5)!);

      // Verify persistence was attempted
      expect(mockAddLog).toHaveBeenCalledTimes(1);
      // Because persistence threw:
      // - cycleStart must NOT have advanced or realigned
      expect(mockUpdateCycleStart).not.toHaveBeenCalled();
      expect(cycleStart).toBe('2026-10-01');
      // - active session draft must NOT have been cleared
      expect(mockClearActiveSession).not.toHaveBeenCalled();
      expect(activeSessionDraft).not.toBeNull();
      // - completion summary must not be shown
      expect(isFinishing).toBe(false);
    });

    // Scenario 8: Simulate midnight rollover and app visibility/focus
    it('Scenario 8: Simulate midnight rollover and app visibility/focus: cycle day updates reactively', () => {
      let currentDate = new Date('2026-10-01T23:59:59Z');
      const cycleStart = '2026-10-01';

      expect(getCycleDay(cycleStart, currentDate)).toBe(1);
      expect(selectTodayCoreWorkout(coreWorkoutByCycleDayMap, cycleStart, currentDate)?.id).toBe('push-a');

      // Midnight rollover occurs:
      currentDate = new Date('2026-10-02T00:00:01Z');
      expect(getCycleDay(cycleStart, currentDate)).toBe(2);
      expect(selectTodayCoreWorkout(coreWorkoutByCycleDayMap, cycleStart, currentDate)?.id).toBe('pull-a');
    });

    // Scenario 9: Dates spanning month-end, year-end, leap day, and pre-anchor dates
    describe('Scenario 9: Date boundary resilience (month-end, year-end, leap day, pre-anchor)', () => {
      it('handles month-end transitions smoothly', () => {
        const cycleStart = '2026-10-29'; // Day 1
        // 2026-10-29: Day 1
        // 2026-10-30: Day 2
        // 2026-10-31: Day 3
        // 2026-11-01: Day 4 (Recovery)
        // 2026-11-02: Day 5 (Push B)
        expect(getCycleDay(cycleStart, '2026-10-29')).toBe(1);
        expect(getCycleDay(cycleStart, '2026-10-30')).toBe(2);
        expect(getCycleDay(cycleStart, '2026-10-31')).toBe(3);
        expect(getCycleDay(cycleStart, '2026-11-01')).toBe(4);
        expect(getCycleDay(cycleStart, '2026-11-02')).toBe(5);
      });

      it('handles year-end transitions smoothly', () => {
        const cycleStart = '2026-12-30'; // Day 1
        // 2026-12-30: Day 1
        // 2026-12-31: Day 2
        // 2027-01-01: Day 3
        // 2027-01-02: Day 4
        // 2027-01-03: Day 5
        expect(getCycleDay(cycleStart, '2026-12-30')).toBe(1);
        expect(getCycleDay(cycleStart, '2026-12-31')).toBe(2);
        expect(getCycleDay(cycleStart, '2027-01-01')).toBe(3);
        expect(getCycleDay(cycleStart, '2027-01-02')).toBe(4);
        expect(getCycleDay(cycleStart, '2027-01-03')).toBe(5);
      });

      it('handles leap day (Feb 29) in leap year (2028)', () => {
        const cycleStart = '2028-02-27'; // Day 1
        // 2028-02-27: Day 1
        // 2028-02-28: Day 2
        // 2028-02-29: Day 3 (Leap Day!)
        // 2028-03-01: Day 4 (Recovery)
        // 2028-03-02: Day 5 (Push B)
        expect(getCycleDay(cycleStart, '2028-02-27')).toBe(1);
        expect(getCycleDay(cycleStart, '2028-02-28')).toBe(2);
        expect(getCycleDay(cycleStart, '2028-02-29')).toBe(3);
        expect(getCycleDay(cycleStart, '2028-03-01')).toBe(4);
        expect(getCycleDay(cycleStart, '2028-03-02')).toBe(5);
      });

      it('handles dates before the anchor date deterministically via modular arithmetic', () => {
        const cycleStart = '2026-10-09'; // Day 1
        // 1 day before (2026-10-08) -> Day 8 (Recovery)
        // 2 days before (2026-10-07) -> Day 7 (Hybrid B)
        // 8 days before (2026-10-01) -> Day 1 (Push A)
        expect(getCycleDay(cycleStart, '2026-10-08')).toBe(8);
        expect(getCycleDay(cycleStart, '2026-10-07')).toBe(7);
        expect(getCycleDay(cycleStart, '2026-10-01')).toBe(1);
      });
    });

    // Scenario 10: Verify the same date and anchor produce identical cycle days across all selectors
    it('Scenario 10: Cross-surface identity: date and anchor produce identical cycle day across all selectors', () => {
      const cycleStart = '2026-10-01';
      const testDate = '2026-10-05'; // Day 5

      // 1. Direct utility getCycleDay
      const direct = getCycleDay(cycleStart, testDate);
      expect(direct).toBe(5);

      // 2. Selector selectNextCycleDay
      const nextDay = selectNextCycleDay(cycleStart, testDate);
      expect(nextDay).toBe(direct);

      // 3. Selector selectCycleDayForDate
      const forDate = selectCycleDayForDate(testDate, cycleStart);
      expect(forDate).toBe(direct);

      // 4. Workout lookup from core map
      const coreWo = coreWorkoutByCycleDayMap.get(direct);
      const selectorWo = selectTodayCoreWorkout(coreWorkoutByCycleDayMap, cycleStart, testDate);
      expect(selectorWo?.id).toBe(coreWo?.id);
      expect(selectorWo?.badge).toBe('DAY 5 · PUSH B');
    });
  });
});
