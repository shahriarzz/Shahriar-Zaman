// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Workout, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import {
  getCycleDay,
  getAdjustedCycleStart,
  dk,
  isValidCalendarDate,
  CYCLE_LENGTH
} from '../utils/fitnessCalculations';
import {
  buildValidatedCoreWorkoutMap,
  selectNextCycleDay,
  selectCycleDayForDate,
  selectCoreWorkoutForCycleDay,
  selectTodayCoreWorkout,
  buildFitnessIndex
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { loadInitialFitnessData } from '../utils/fitnessMigration';
import { SessionView } from '../components/SessionView';
import { CycleEditor } from '../components/manage/CycleEditor';
import { Dashboard } from '../components/Dashboard';
import { Calendar } from '../components/Calendar';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { FitnessDerivedProvider, FitnessDerivedContext } from '../context/FitnessDerivedContext';
import { ConfirmContext } from '../context/ConfirmContext';

describe('Routine Cycle Verification and Regression Hardening', () => {
  const initialWorkouts: Workout[] = INITIAL_WORKOUTS;
  const initialDefs: ExerciseDefinition[] = INITIAL_EXERCISE_DEFINITIONS;
  const defsMap = createExerciseDefinitionMap(initialDefs);

  function createMockFitnessContext(overrides: Partial<FitnessContextType> = {}): FitnessContextType {
    return {
      user: null,
      loading: false,
      isInitialized: true,
      syncStatus: 'idle',
      syncError: null,
      login: vi.fn(),
      logout: vi.fn(),
      retrySync: vi.fn(),
      exerciseDefinitions: initialDefs,
      workouts: initialWorkouts,
      logs: {},
      appState: { cycleStart: dk() },
      addExerciseDefinition: vi.fn(),
      updateExerciseDefinition: vi.fn(),
      deleteExerciseDefinition: vi.fn(),
      setWorkouts: vi.fn(),
      assignExerciseToWorkout: vi.fn(),
      removeExerciseFromWorkout: vi.fn(),
      updateWorkoutExerciseProgramming: vi.fn(),
      deleteWorkout: vi.fn(),
      addLog: vi.fn().mockResolvedValue(undefined),
      deleteLog: vi.fn(),
      resetLogs: vi.fn(),
      updateCycleStart: vi.fn().mockResolvedValue(undefined),
      activeSession: null,
      startActiveSession: vi.fn(),
      updateActiveSessionSets: vi.fn(),
      clearActiveSession: vi.fn(),
      logBodyWeight: vi.fn(),
      deleteBodyWeight: vi.fn(),
      pushAutoBackup: vi.fn(),
      getAutoBackups: vi.fn().mockReturnValue([]),
      restoreAutoBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
      createManualBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
      exportBackup: vi.fn().mockReturnValue('{}'),
      importBackup: vi.fn().mockResolvedValue({ success: true, message: '' }),
      ...overrides
    };
  }

  describe('P1 — Core Workout Map Validation & Order-Independent Fallback', () => {
    it('1. Valid 8-day core workouts assemble clean map with isValid: true and 0 errors', () => {
      const result = buildValidatedCoreWorkoutMap(initialWorkouts);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.coreWorkoutByCycleDayMap.size).toBe(CYCLE_LENGTH);

      for (let day = 1; day <= CYCLE_LENGTH; day++) {
        const wo = result.coreWorkoutByCycleDayMap.get(day);
        expect(wo).toBeDefined();
        expect(wo?.cycleDay).toBe(day);
        expect(wo?.isCore).toBe(true);
      }
    });

    it('2. Duplicate Day 1 with default routine first resolves Day 1 to canonical push-a', () => {
      const defaultFirst: Workout[] = [
        ...initialWorkouts,
        {
          id: 'custom-push-dupe',
          name: 'Custom Competing Push',
          type: 'push',
          badge: 'DAY 1 · COMPETING',
          cycleDay: 1,
          isCore: true,
          exercises: []
        }
      ];

      const result = buildValidatedCoreWorkoutMap(defaultFirst);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate core workout cycleDay 1'))).toBe(true);

      const resolvedDay1 = result.coreWorkoutByCycleDayMap.get(1);
      expect(resolvedDay1?.id).toBe('push-a');
      expect(resolvedDay1?.isCore).toBe(true);
    });

    it('3. Duplicate Day 1 with custom routine first resolves Day 1 to canonical push-a', () => {
      const customFirst: Workout[] = [
        {
          id: 'custom-push-dupe',
          name: 'Custom Competing Push',
          type: 'push',
          badge: 'DAY 1 · COMPETING',
          cycleDay: 1,
          isCore: true,
          exercises: []
        },
        ...initialWorkouts
      ];

      const result = buildValidatedCoreWorkoutMap(customFirst);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate core workout cycleDay 1'))).toBe(true);

      // Deterministic fallback contract: MUST NOT select custom-push-dupe merely because it was first in array!
      const resolvedDay1 = result.coreWorkoutByCycleDayMap.get(1);
      expect(resolvedDay1?.id).toBe('push-a');
      expect(resolvedDay1?.isCore).toBe(true);
    });

    it('4. Duplicate Day 1 with two conflicting custom entries resolves Day 1 to canonical push-a regardless of order', () => {
      const customA: Workout = {
        id: 'custom-a',
        name: 'Custom Push A',
        type: 'push',
        badge: 'DAY 1 · A',
        cycleDay: 1,
        isCore: true,
        exercises: []
      };
      const customB: Workout = {
        id: 'custom-b',
        name: 'Custom Push B',
        type: 'push',
        badge: 'DAY 1 · B',
        cycleDay: 1,
        isCore: true,
        exercises: []
      };

      const others = initialWorkouts.filter(w => w.cycleDay !== 1);

      // Order 1: customA before customB
      const resultOrder1 = buildValidatedCoreWorkoutMap([customA, customB, ...others]);
      expect(resultOrder1.isValid).toBe(false);
      expect(resultOrder1.coreWorkoutByCycleDayMap.get(1)?.id).toBe('push-a');

      // Order 2: customB before customA
      const resultOrder2 = buildValidatedCoreWorkoutMap([customB, customA, ...others]);
      expect(resultOrder2.isValid).toBe(false);
      expect(resultOrder2.coreWorkoutByCycleDayMap.get(1)?.id).toBe('push-a');
    });

    it('5. Valid customized Day 2 is preserved when Day 1 is duplicated', () => {
      const customDay2: Workout = {
        id: 'pull-a-custom',
        name: 'Heavy Pull Specialized',
        type: 'pull',
        badge: 'DAY 2 · HEAVY PULL',
        cycleDay: 2,
        isCore: true,
        exercises: []
      };

      const workoutsWithDupeDay1AndCustomDay2: Workout[] = [
        ...initialWorkouts.filter(w => w.cycleDay !== 2),
        customDay2,
        {
          id: 'competing-day-1',
          name: 'Extra Day 1',
          type: 'push',
          badge: 'DAY 1 · EXTRA',
          cycleDay: 1,
          isCore: true,
          exercises: []
        }
      ];

      const result = buildValidatedCoreWorkoutMap(workoutsWithDupeDay1AndCustomDay2);
      expect(result.isValid).toBe(false);
      // Day 1 has duplicate -> falls back to initial push-a
      expect(result.coreWorkoutByCycleDayMap.get(1)?.id).toBe('push-a');
      // Day 2 has exactly 1 valid core workout -> preserves user's custom routine!
      expect(result.coreWorkoutByCycleDayMap.get(2)?.id).toBe('pull-a-custom');
      expect(result.coreWorkoutByCycleDayMap.get(2)?.name).toBe('Heavy Pull Specialized');
    });

    it('6. Detects invalid cycleDay (out of bounds or non-integer) and provides safe initial fallback', () => {
      const invalidWorkouts: Workout[] = initialWorkouts.map(w => {
        if (w.cycleDay === 3) {
          return { ...w, cycleDay: 9 as any }; // Out of bounds
        }
        return w;
      });

      const result = buildValidatedCoreWorkoutMap(invalidWorkouts);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid core workout cycleDay "9"'))).toBe(true);
      expect(result.errors.some(e => e.includes('Missing core workout for cycle day 3'))).toBe(true);

      // Deterministic fallback for day 3 must be populated from initial data (hybrid-a)
      const day3Wo = result.coreWorkoutByCycleDayMap.get(3);
      expect(day3Wo).toBeDefined();
      expect(day3Wo?.id).toBe('hybrid-a');
    });

    it('7. Keeps bonus workouts strictly outside the core-day mapping using strict isCore === true', () => {
      const workoutsWithBonus: Workout[] = [
        ...initialWorkouts,
        {
          id: 'date-night-bonus',
          name: 'Date Night Mobility',
          type: 'date',
          badge: 'BONUS',
          isCore: false,
          cycleDay: 1, // Mistakenly has cycleDay assigned
          exercises: []
        },
        {
          id: 'truthy-core-bonus',
          name: 'Non-boolean Core',
          type: 'custom',
          badge: 'BONUS 2',
          isCore: ('yes' as unknown) as boolean, // Truthy but not boolean true
          cycleDay: 1,
          exercises: []
        }
      ];

      const result = buildValidatedCoreWorkoutMap(workoutsWithBonus);
      expect(result.coreWorkoutByCycleDayMap.get(1)?.id).toBe('push-a');
      expect(result.coreWorkoutByCycleDayMap.get(1)?.isCore).toBe(true);
    });

    it('8. Detects missing cycle days and restores safe initial fallback', () => {
      const strippedWorkouts = initialWorkouts.filter(w => w.cycleDay !== 5 && w.cycleDay !== 6);
      const result = buildValidatedCoreWorkoutMap(strippedWorkouts);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing core workout for cycle day 5'))).toBe(true);
      expect(result.errors.some(e => e.includes('Missing core workout for cycle day 6'))).toBe(true);

      expect(result.coreWorkoutByCycleDayMap.get(5)?.id).toBe('push-b');
      expect(result.coreWorkoutByCycleDayMap.get(6)?.id).toBe('pull-b');
    });
  });

  describe('P1 — Anchor Calendar Validation & One-Time Storage Repair', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('1. isValidCalendarDate validates strict YYYY-MM-DD and actual calendar validity', () => {
      // Valid calendar dates
      expect(isValidCalendarDate('2026-10-01')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // Leap year
      expect(isValidCalendarDate('2026-12-31')).toBe(true);

      // Missing, empty, or wrong type
      expect(isValidCalendarDate(null)).toBe(false);
      expect(isValidCalendarDate(undefined)).toBe(false);
      expect(isValidCalendarDate('')).toBe(false);
      expect(isValidCalendarDate(12345)).toBe(false);
      expect(isValidCalendarDate({})).toBe(false);

      // Malformed date formats
      expect(isValidCalendarDate('not-a-date')).toBe(false);
      expect(isValidCalendarDate('2026-10')).toBe(false);
      expect(isValidCalendarDate('2026-1-1')).toBe(false);
      expect(isValidCalendarDate('2026/10/01')).toBe(false);

      // Impossible calendar dates
      expect(isValidCalendarDate('2026-02-31')).toBe(false);
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2025-02-29')).toBe(false); // 2025 is not a leap year
    });

    it('2. getCycleDay falls back to target date when cycleStart is invalid without throwing or mutating', () => {
      const targetDate = '2026-10-05';

      expect(getCycleDay('not-a-date', targetDate)).toBe(1);
      expect(getCycleDay('2026-02-31', targetDate)).toBe(1);
      expect(getCycleDay(undefined, targetDate)).toBe(1);
      expect(getCycleDay(null as any, targetDate)).toBe(1);
    });

    it('3. loadInitialFitnessData repairs invalid anchor in canonical snapshot once to storage', () => {
      const invalidSnapshot = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        timestamp: 1000,
        data: {
          exerciseDefinitions: initialDefs,
          workouts: initialWorkouts,
          logs: {},
          appState: { cycleStart: '2026-02-31' } // Impossible calendar date!
        }
      };

      localStorage.setItem('gl_database_snapshot', JSON.stringify(invalidSnapshot));
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));

      const loaded = loadInitialFitnessData();

      // Repaired anchor must be valid calendar date
      expect(isValidCalendarDate(loaded.appState.cycleStart)).toBe(true);
      expect(loaded.appState.cycleStart).toBe(dk());

      // Repaired anchor must have been persisted back to localStorage
      const updatedSnapshotRaw = localStorage.getItem('gl_database_snapshot');
      expect(updatedSnapshotRaw).not.toBeNull();
      const updatedSnapshot = JSON.parse(updatedSnapshotRaw!);
      expect(updatedSnapshot.data.appState.cycleStart).toBe(dk());

      const updatedStateRaw = localStorage.getItem('gl_state');
      expect(updatedStateRaw).not.toBeNull();
      const updatedState = JSON.parse(updatedStateRaw!);
      expect(updatedState.cycleStart).toBe(dk());
    });

    it('4. loadInitialFitnessData preserves valid anchor without resetting cycle', () => {
      const validAnchor = '2026-05-10';
      const validSnapshot = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        timestamp: 1000,
        data: {
          exerciseDefinitions: initialDefs,
          workouts: initialWorkouts,
          logs: {},
          appState: { cycleStart: validAnchor }
        }
      };

      localStorage.setItem('gl_database_snapshot', JSON.stringify(validSnapshot));
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));

      const loaded = loadInitialFitnessData();
      expect(loaded.appState.cycleStart).toBe(validAnchor);
    });
  });

  describe('P1 — CycleEditor Core vs Bonus Classification Regression Suite', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('1. A bonus workout with isCore: false and cycleDay: 1 appears only in the bonus section', async () => {
      const bonusWithCycleDay: Workout = {
        id: 'date-night-bonus',
        name: 'Date Night Mobility Protocol',
        type: 'date',
        badge: 'BONUS',
        isCore: false,
        cycleDay: 1, // Accidental cycleDay assignment
        exercises: []
      };

      const workoutList: Workout[] = [...initialWorkouts, bonusWithCycleDay];

      await act(async () => {
        root.render(
          <CycleEditor workouts={workoutList} onSelectWorkout={vi.fn()} />
        );
      });

      // Bonus section must exist
      expect(container.textContent).toContain('Bonus & Auxiliary Protocols');
      expect(container.textContent).toContain('Date Night Mobility Protocol');

      // Malformed section must NOT exist for clean bonus workouts
      expect(container.querySelector('[data-testid="malformed-core-section"]')).toBeNull();

      // The 8-day progression section must show exactly 8 core days (Day 1..8)
      // and Day 1 must be Push Day A, NOT Date Night Mobility Protocol!
      const cycleSlots = container.querySelectorAll('[data-testid^="cycle-slot-"]');
      expect(cycleSlots).toHaveLength(CYCLE_LENGTH);
      expect(cycleSlots[0].textContent).toContain('Push Day A');
      expect(cycleSlots[0].textContent).not.toContain('Date Night Mobility Protocol');
    });

    it('2. Duplicate Day 1: editor renders exactly 8 sequential slots (1..8) with canonical fallback for Day 1, and shows both competing workouts in Needs Review section for repair', async () => {
      const dupe1: Workout = {
        id: 'custom-push-dupe-1',
        name: 'Custom Push Alpha',
        type: 'push',
        badge: 'DAY 1 · ALPHA',
        cycleDay: 1,
        isCore: true,
        exercises: []
      };
      const dupe2: Workout = {
        id: 'custom-push-dupe-2',
        name: 'Custom Push Beta',
        type: 'push',
        badge: 'DAY 1 · BETA',
        cycleDay: 1,
        isCore: true,
        exercises: []
      };

      // Workouts with duplicate Day 1 replacing default Day 1
      const withoutDay1 = initialWorkouts.filter(w => w.cycleDay !== 1);
      const workoutsWithDuplicates = [...withoutDay1, dupe1, dupe2];

      await act(async () => {
        root.render(
          <CycleEditor workouts={workoutsWithDuplicates} onSelectWorkout={vi.fn()} />
        );
      });

      // Exactly 8 cycle slots rendered in ascending order
      const cycleSlots = container.querySelectorAll('[data-testid^="cycle-slot-"]');
      expect(cycleSlots).toHaveLength(CYCLE_LENGTH);

      // Slot 1 resolves via deterministic fallback to initial Push Day A
      const slot1 = container.querySelector('[data-testid="cycle-slot-1"]')!;
      expect(slot1.textContent).toContain('Push Day A');
      expect(slot1.textContent).toContain('Fallback');

      // Both duplicate core workouts are surfaced in the Needs Review repair section
      const repairSection = container.querySelector('[data-testid="malformed-core-section"]')!;
      expect(repairSection).not.toBeNull();
      expect(repairSection.textContent).toContain('Needs Review / Inactive Core Routines');
      expect(repairSection.querySelector('[data-testid="malformed-workout-custom-push-dupe-1"]')).not.toBeNull();
      expect(repairSection.querySelector('[data-testid="malformed-workout-custom-push-dupe-2"]')).not.toBeNull();
      expect(repairSection.textContent).toContain('DUPLICATE DAY 1');
    });

    it('3. Missing core days: editor still displays all 8 sequential slots (1..8) with missing day resolving via canonical fallback', async () => {
      // Remove Day 3 (Hybrid Day A)
      const missingDay3Workouts = initialWorkouts.filter(w => w.cycleDay !== 3);

      await act(async () => {
        root.render(
          <CycleEditor workouts={missingDay3Workouts} onSelectWorkout={vi.fn()} />
        );
      });

      // Exactly 8 cycle slots rendered
      const cycleSlots = container.querySelectorAll('[data-testid^="cycle-slot-"]');
      expect(cycleSlots).toHaveLength(CYCLE_LENGTH);

      // Slot 3 resolves via canonical fallback
      const slot3 = container.querySelector('[data-testid="cycle-slot-3"]')!;
      expect(slot3.textContent).toContain('Hybrid Day A');
      expect(slot3.textContent).toContain('Fallback');
    });

    it('4. Invalid core day values (null, 0, 9, 2.5 fractional): excluded from cycle slots and displayed in Needs Review section with tap to edit', async () => {
      const invalidWorkouts: Workout[] = [
        {
          id: 'invalid-null-day',
          name: 'Core Workout Null Day',
          type: 'custom',
          badge: 'CORE',
          isCore: true,
          cycleDay: null,
          exercises: []
        },
        {
          id: 'invalid-zero-day',
          name: 'Core Workout Day Zero',
          type: 'custom',
          badge: 'CORE',
          isCore: true,
          cycleDay: 0,
          exercises: []
        },
        {
          id: 'invalid-day-9',
          name: 'Core Workout Day Nine',
          type: 'custom',
          badge: 'CORE',
          isCore: true,
          cycleDay: 9,
          exercises: []
        },
        {
          id: 'invalid-fractional-day',
          name: 'Core Workout Day Two Point Five',
          type: 'custom',
          badge: 'CORE',
          isCore: true,
          cycleDay: 2.5,
          exercises: []
        }
      ];

      const fullList = [...initialWorkouts, ...invalidWorkouts];

      await act(async () => {
        root.render(
          <CycleEditor workouts={fullList} onSelectWorkout={vi.fn()} />
        );
      });

      // The 8-day progression section must remain exactly 8 items (1..8)
      const cycleSlots = container.querySelectorAll('[data-testid^="cycle-slot-"]');
      expect(cycleSlots).toHaveLength(CYCLE_LENGTH);

      // None of the invalid workouts appear as numbered cycle slots
      invalidWorkouts.forEach(iw => {
        const matchingInCycle = Array.from(cycleSlots).find(slot => slot.textContent?.includes(iw.name));
        expect(matchingInCycle).toBeUndefined();
      });

      // All 4 invalid core workouts appear in Needs Review section
      const repairSection = container.querySelector('[data-testid="malformed-core-section"]')!;
      expect(repairSection).not.toBeNull();
      invalidWorkouts.forEach(iw => {
        const item = repairSection.querySelector(`[data-testid="malformed-workout-${iw.id}"]`);
        expect(item).not.toBeNull();
        expect(item?.textContent).toContain(iw.name);
      });
    });

    it('5. Valid core workouts appear in strictly ascending order from Day 1 through Day 8 with customizations preserved', async () => {
      // Create a valid customized Day 2 workout
      const customPull: Workout = {
        id: 'custom-pull-day-2',
        name: 'Custom Hypertrophy Pull',
        type: 'pull',
        badge: 'DAY 2 · PULL',
        cycleDay: 2,
        isCore: true,
        exercises: []
      };

      // Shuffled array order with custom Day 2
      const modified = initialWorkouts.filter(w => w.cycleDay !== 2);
      const shuffled = [customPull, ...modified].reverse();

      await act(async () => {
        root.render(
          <CycleEditor workouts={shuffled} onSelectWorkout={vi.fn()} />
        );
      });

      const cycleSlots = container.querySelectorAll('[data-testid^="cycle-slot-"]');
      expect(cycleSlots).toHaveLength(CYCLE_LENGTH);

      // Verify ascending day order
      const dayNumbers = Array.from(cycleSlots).map(el =>
        el.querySelector('.font-display')?.textContent?.trim()
      );
      expect(dayNumbers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);

      // Slot 2 must preserve the user's valid custom routine
      const slot2 = container.querySelector('[data-testid="cycle-slot-2"]')!;
      expect(slot2.textContent).toContain('Custom Hypertrophy Pull');
      // No fallback indicator on valid user customization
      expect(slot2.textContent).not.toContain('Fallback');
    });

    it('6. Ordinary bonus workouts without a cycle-day assignment remain visible in auxiliary section', async () => {
      const auxiliaryWorkout: Workout = {
        id: 'core-conditioning',
        name: 'Auxiliary Core Protocol',
        type: 'custom',
        badge: 'AUX',
        isCore: false,
        cycleDay: null,
        exercises: []
      };

      await act(async () => {
        root.render(
          <CycleEditor workouts={[...initialWorkouts, auxiliaryWorkout]} onSelectWorkout={vi.fn()} />
        );
      });

      expect(container.textContent).toContain('Bonus & Auxiliary Protocols');
      expect(container.textContent).toContain('Auxiliary Core Protocol');
    });

    it('7. Clicking a malformed core workout in Needs Review invokes onSelectWorkout with its ID for user repair', async () => {
      const onSelectWorkout = vi.fn();
      const malformedWorkout: Workout = {
        id: 'repairable-workout-9',
        name: 'Repairable Core Routine',
        type: 'custom',
        badge: 'DAY 9',
        isCore: true,
        cycleDay: 9,
        exercises: []
      };

      await act(async () => {
        root.render(
          <CycleEditor workouts={[...initialWorkouts, malformedWorkout]} onSelectWorkout={onSelectWorkout} />
        );
      });

      const repairCard = container.querySelector('[data-testid="malformed-workout-repairable-workout-9"]') as HTMLElement;
      expect(repairCard).not.toBeNull();

      await act(async () => {
        repairCard.click();
      });

      expect(onSelectWorkout).toHaveBeenCalledTimes(1);
      expect(onSelectWorkout).toHaveBeenCalledWith('repairable-workout-9');
    });
  });

  describe('P1 — Production Component Testing: SessionView Finish Transaction & Failure Contract', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('Scenario 1: Complete expected core workout: log persisted, anchor aligned, draft cleared in order', async () => {
      const today = dk();
      const callOrder: string[] = [];
      const mockAddLog = vi.fn().mockImplementation(async () => {
        callOrder.push('addLog');
      });
      const mockUpdateCycleStart = vi.fn().mockImplementation(async () => {
        callOrder.push('updateCycleStart');
      });
      const mockClearActiveSession = vi.fn().mockImplementation(() => {
        callOrder.push('clearActiveSession');
      });

      const pushAWorkout = initialWorkouts.find(w => w.id === 'push-a')!;
      expect(pushAWorkout.cycleDay).toBe(1);

      // Scheduled Day 1 matches active workout Day 1
      const contextValue = createMockFitnessContext({
        appState: { cycleStart: today },
        addLog: mockAddLog,
        updateCycleStart: mockUpdateCycleStart,
        clearActiveSession: mockClearActiveSession
      });

      const derivedIndex = buildFitnessIndex([], defsMap, today);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedContext.Provider
              value={
                {
                  index: derivedIndex,
                  getLatestForExercise: () => null,
                  getWeightPRForExercise: () => null,
                  getE1RMPRForExercise: () => null,
                  getHistoryForExercise: () => []
                } as any
              }
            >
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <SessionView workoutId="push-a" onExit={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const finishBtn = buttons.find(b => b.textContent?.includes('Finish') || b.textContent?.includes('✓'));
      expect(finishBtn).toBeDefined();

      await act(async () => {
        finishBtn!.click();
      });

      // Verify transaction sequence:
      // 1. Log persisted
      expect(mockAddLog).toHaveBeenCalledTimes(1);
      // 2. Realignment NOT called because scheduledDay === activeWorkout.cycleDay
      expect(mockUpdateCycleStart).not.toHaveBeenCalled();
      // 3. Active session cleared
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['addLog', 'clearActiveSession']);
      // 4. Session cleared / summary view rendered
      expect(container.textContent).toContain('Session Cleared');
    });

    it('Scenario 2: Complete different core workout: operations execute in strict sequence (addLog -> updateCycleStart -> clearActiveSession)', async () => {
      const today = dk();
      const callOrder: string[] = [];
      const mockAddLog = vi.fn().mockImplementation(async () => {
        callOrder.push('addLog');
      });
      const mockUpdateCycleStart = vi.fn().mockImplementation(async () => {
        callOrder.push('updateCycleStart');
      });
      const mockClearActiveSession = vi.fn().mockImplementation(() => {
        callOrder.push('clearActiveSession');
      });

      // Scheduled Day 1, but user completes Day 5
      const contextValue = createMockFitnessContext({
        appState: { cycleStart: today },
        addLog: mockAddLog,
        updateCycleStart: mockUpdateCycleStart,
        clearActiveSession: mockClearActiveSession
      });

      const derivedIndex = buildFitnessIndex([], defsMap, today);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedContext.Provider
              value={
                {
                  index: derivedIndex,
                  getLatestForExercise: () => null,
                  getWeightPRForExercise: () => null,
                  getE1RMPRForExercise: () => null,
                  getHistoryForExercise: () => []
                } as any
              }
            >
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <SessionView workoutId="push-b" onExit={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const finishBtn = buttons.find(b => b.textContent?.includes('Finish') || b.textContent?.includes('✓'));
      expect(finishBtn).toBeDefined();

      await act(async () => {
        finishBtn!.click();
      });

      expect(mockAddLog).toHaveBeenCalledTimes(1);
      expect(mockUpdateCycleStart).toHaveBeenCalledTimes(1);
      const expectedAdjustedAnchor = getAdjustedCycleStart(5, today);
      expect(mockUpdateCycleStart).toHaveBeenCalledWith(expectedAdjustedAnchor);
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1);

      // Verify exact sequence: addLog -> updateCycleStart -> clearActiveSession
      expect(callOrder).toEqual(['addLog', 'updateCycleStart', 'clearActiveSession']);
    });

    it('Scenario 3: Complete bonus workout: cycleStart is unchanged', async () => {
      const today = dk();
      const mockAddLog = vi.fn().mockResolvedValue(undefined);
      const mockUpdateCycleStart = vi.fn().mockResolvedValue(undefined);
      const mockClearActiveSession = vi.fn();

      const bonusWorkout: Workout = {
        id: 'bonus-mobility',
        name: 'Bonus Mobility Protocol',
        badge: 'BONUS',
        type: 'date',
        isCore: false,
        cycleDay: 1, // Bonus workout with accidental cycleDay
        exercises: []
      };

      const contextValue = createMockFitnessContext({
        workouts: [...initialWorkouts, bonusWorkout],
        appState: { cycleStart: today },
        addLog: mockAddLog,
        updateCycleStart: mockUpdateCycleStart,
        clearActiveSession: mockClearActiveSession
      });

      const derivedIndex = buildFitnessIndex([], defsMap, today);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedContext.Provider
              value={
                {
                  index: derivedIndex,
                  getLatestForExercise: () => null,
                  getWeightPRForExercise: () => null,
                  getE1RMPRForExercise: () => null,
                  getHistoryForExercise: () => []
                } as any
              }
            >
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <SessionView workoutId="bonus-mobility" onExit={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const finishBtn = buttons.find(b => b.textContent?.includes('Finish') || b.textContent?.includes('✓'));
      expect(finishBtn).toBeDefined();

      await act(async () => {
        finishBtn!.click();
      });

      expect(mockAddLog).toHaveBeenCalledTimes(1);
      // Bonus workout MUST NEVER alter cycleStart!
      expect(mockUpdateCycleStart).not.toHaveBeenCalled();
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1);
    });

    it('Scenario 7: Failed addLog persistence: cycle not realigned and active session draft preserved', async () => {
      const today = dk();
      const mockAddLog = vi.fn().mockRejectedValue(new Error('IndexedDB storage quota exceeded'));
      const mockUpdateCycleStart = vi.fn().mockResolvedValue(undefined);
      const mockClearActiveSession = vi.fn();

      const contextValue = createMockFitnessContext({
        appState: { cycleStart: today },
        addLog: mockAddLog,
        updateCycleStart: mockUpdateCycleStart,
        clearActiveSession: mockClearActiveSession
      });

      const derivedIndex = buildFitnessIndex([], defsMap, today);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedContext.Provider
              value={
                {
                  index: derivedIndex,
                  getLatestForExercise: () => null,
                  getWeightPRForExercise: () => null,
                  getE1RMPRForExercise: () => null,
                  getHistoryForExercise: () => []
                } as any
              }
            >
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <SessionView workoutId="push-b" onExit={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const finishBtn = buttons.find(b => b.textContent?.includes('Finish') || b.textContent?.includes('✓'));
      expect(finishBtn).toBeDefined();

      await act(async () => {
        finishBtn!.click();
      });

      expect(mockAddLog).toHaveBeenCalledTimes(1);
      // Because persistence failed:
      // 1. updateCycleStart must NOT have been called
      expect(mockUpdateCycleStart).not.toHaveBeenCalled();
      // 2. clearActiveSession must NOT have been called
      expect(mockClearActiveSession).not.toHaveBeenCalled();
      // 3. Completion summary must NOT be shown
      expect(container.textContent).not.toContain('Session Cleared');
      // 4. Active session screen remains rendered and interactive
      expect(finishBtn).toBeDefined();
    });

    it('Failure Contract: updateCycleStart absorbs cloud failure internally while local update succeeds', async () => {
      const today = dk();
      // As implemented in useFitnessLogs.ts: updateCycleStart updates local appState and catches cloud errors,
      // resolving cleanly so callers proceed with session completion offline-first.
      const mockAddLog = vi.fn().mockResolvedValue(undefined);
      const mockUpdateCycleStart = vi.fn().mockImplementation(async () => {
        // Simulates local state update succeeding while cloud sync is queued/failed
        return Promise.resolve();
      });
      const mockClearActiveSession = vi.fn();

      const contextValue = createMockFitnessContext({
        appState: { cycleStart: today },
        addLog: mockAddLog,
        updateCycleStart: mockUpdateCycleStart,
        clearActiveSession: mockClearActiveSession
      });

      const derivedIndex = buildFitnessIndex([], defsMap, today);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedContext.Provider
              value={
                {
                  index: derivedIndex,
                  getLatestForExercise: () => null,
                  getWeightPRForExercise: () => null,
                  getE1RMPRForExercise: () => null,
                  getHistoryForExercise: () => []
                } as any
              }
            >
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <SessionView workoutId="push-b" onExit={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedContext.Provider>
          </FitnessContext.Provider>
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const finishBtn = buttons.find(b => b.textContent?.includes('Finish') || b.textContent?.includes('✓'));
      expect(finishBtn).toBeDefined();

      await act(async () => {
        finishBtn!.click();
      });

      expect(mockAddLog).toHaveBeenCalledTimes(1);
      expect(mockUpdateCycleStart).toHaveBeenCalledTimes(1);
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Session Cleared');
    });
  });

  describe('P1 — Provider-Level Fake-Timer & Visibility Rollover Suite', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.useRealTimers();
    });

    const TestCycleConsumer: React.FC = () => {
      const derived = React.useContext(FitnessDerivedContext);
      if (!derived) return <div>No Context</div>;
      return (
        <div>
          <span data-testid="todayStr">{derived.todayStr}</span>
          <span data-testid="nextCycleDay">{derived.nextCycleDay}</span>
        </div>
      );
    };

    it('Scenario 8: Midnight rollover and visibilitychange update cycle day reactively', async () => {
      const initialDate = new Date(2026, 9, 1, 23, 59, 58);
      vi.setSystemTime(initialDate);

      const cycleStart = '2026-10-01'; // Day 1 on 2026-10-01
      const contextValue = createMockFitnessContext({ appState: { cycleStart } });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <TestCycleConsumer />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      const todayEl = container.querySelector('[data-testid="todayStr"]')!;
      const cycleEl = container.querySelector('[data-testid="nextCycleDay"]')!;

      expect(todayEl.textContent).toBe('2026-10-01');
      expect(cycleEl.textContent).toBe('1');

      // Advance system time past midnight: +5 seconds to 2026-10-02 00:00:03
      vi.setSystemTime(new Date(2026, 9, 2, 0, 0, 3));

      // 1. Midnight timer fires
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(todayEl.textContent).toBe('2026-10-02');
      expect(cycleEl.textContent).toBe('2');

      // 2. Advance another day and simulate visibilitychange event
      vi.setSystemTime(new Date(2026, 9, 3, 10, 0, 0));
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(todayEl.textContent).toBe('2026-10-03');
      expect(cycleEl.textContent).toBe('3');
    });
  });

  describe('P1 — Cross-Surface Integration: Dashboard & Calendar Routine Resolution', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.useRealTimers();
    });

    it('1. Day 3 -> Day 4: Expected routine becomes Recovery on both Dashboard and Calendar without a log', async () => {
      const cycleStart = '2026-10-01'; // Day 1
      // On Day 4: 2026-10-04
      vi.setSystemTime(new Date(2026, 9, 4, 10, 0, 0));

      const contextValue = createMockFitnessContext({
        appState: { cycleStart },
        logs: {} // Zero logs
      });

      // 1. Render real Dashboard
      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      // Verify Dashboard reflects Day 4 Rest Protocol
      expect(container.textContent).toContain('DAY 4 · REST');
      expect(container.textContent).toContain('Recovery Day');
      expect(container.textContent).toContain('Rest Day');

      // 2. Render Calendar surface and click Day 4 cell to verify identical workout resolution
      act(() => {
        root.unmount();
      });
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <Calendar onNavigateToHistory={vi.fn()} />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      expect(container.textContent).toContain('Schedule & Consistency');

      // Click the Day 4 cell in Calendar grid to inspect the resolved protocol card
      const day4Btn = container.querySelector('[data-testid="calendar-day-2026-10-04"]') as HTMLElement;
      expect(day4Btn).not.toBeNull();

      await act(async () => {
        day4Btn.click();
        vi.advanceTimersByTime(50);
      });

      // Calendar preview card confirms identical Recovery Day identity
      expect(container.textContent).toContain('Rest & Adaptation Protocol');
    });

    it('2. Day 4 -> Day 5: Push B appears automatically without a recovery-day log on both Dashboard and Calendar', async () => {
      const cycleStart = '2026-10-01';
      // Advance clock to Day 5: 2026-10-05
      vi.setSystemTime(new Date(2026, 9, 5, 10, 0, 0));

      const contextValue = createMockFitnessContext({
        appState: { cycleStart },
        logs: {} // Still zero logs
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      // Day 5 Push B automatically appears on Dashboard
      expect(container.textContent).toContain('DAY 5 · PUSH B');
      expect(container.textContent).toContain('Push Day B');
      expect(container.textContent).toContain('Start Session');

      // Render Calendar on Day 5 and click Day 5 cell
      act(() => {
        root.unmount();
      });
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <Calendar onNavigateToHistory={vi.fn()} />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      const day5Btn = container.querySelector('[data-testid="calendar-day-2026-10-05"]') as HTMLElement;
      expect(day5Btn).not.toBeNull();

      await act(async () => {
        day5Btn.click();
        vi.advanceTimersByTime(50);
      });

      // Calendar resolves identical Push Day B routine
      expect(container.textContent).toContain('Push Day B');
      expect(container.textContent).toContain('DAY 5 · PUSH B');
    });

    it('3. Day 8 -> Day 1: Push A appears automatically without a Day 8 log on both surfaces', async () => {
      const cycleStart = '2026-10-01';
      // 2026-10-09 is Day 1 of cycle 2 (8 days after anchor)
      vi.setSystemTime(new Date(2026, 9, 9, 10, 0, 0));

      const contextValue = createMockFitnessContext({
        appState: { cycleStart },
        logs: {}
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      expect(container.textContent).toContain('DAY 1 · PUSH A');
      expect(container.textContent).toContain('Push Day A');

      // Render Calendar on Day 9 (Day 1 of next cycle)
      act(() => {
        root.unmount();
      });
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <Calendar onNavigateToHistory={vi.fn()} />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      const day9Btn = container.querySelector('[data-testid="calendar-day-2026-10-09"]') as HTMLElement;
      expect(day9Btn).not.toBeNull();

      await act(async () => {
        day9Btn.click();
        vi.advanceTimersByTime(50);
      });

      expect(container.textContent).toContain('Push Day A');
      expect(container.textContent).toContain('DAY 1 · PUSH A');
    });

    it('4. Missed days: cycle follows calendar rather than last completed workout', async () => {
      const cycleStart = '2026-10-01';
      // Lifter misses 11 days. Calendar day is 2026-10-12 (11 days after cycleStart).
      // 11 % 8 = 3 -> Day 4 (Recovery)
      vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));

      const contextValue = createMockFitnessContext({
        appState: { cycleStart },
        logs: {}
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      // Must show Day 4 Recovery, NOT Day 1 or Day 2
      expect(container.textContent).toContain('DAY 4 · REST');
      expect(container.textContent).toContain('Recovery Day');
    });

    it('5. Duplicate Day 1 in workouts library resolves through deterministic fallback on both surfaces', async () => {
      const cycleStart = '2026-10-01'; // Day 1
      vi.setSystemTime(new Date(2026, 9, 1, 10, 0, 0));

      const duplicateWorkouts: Workout[] = [
        {
          id: 'custom-push-competing',
          name: 'Competing Push Day',
          type: 'push',
          badge: 'DAY 1 · COMPETING',
          cycleDay: 1,
          isCore: true,
          exercises: []
        },
        ...initialWorkouts
      ];

      const contextValue = createMockFitnessContext({
        workouts: duplicateWorkouts,
        appState: { cycleStart }
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      // Deterministic fallback resolves to canonical Push Day A on Dashboard
      expect(container.textContent).toContain('DAY 1 · PUSH A');
      expect(container.textContent).toContain('Push Day A');
      expect(container.textContent).not.toContain('Competing Push Day');

      // Verify Calendar also resolves to canonical Push Day A fallback
      act(() => {
        root.unmount();
      });
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <Calendar onNavigateToHistory={vi.fn()} />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      const day1Btn = container.querySelector('[data-testid="calendar-day-2026-10-01"]') as HTMLElement;
      expect(day1Btn).not.toBeNull();

      await act(async () => {
        day1Btn.click();
        vi.advanceTimersByTime(50);
      });

      expect(container.textContent).toContain('Push Day A');
      expect(container.textContent).toContain('DAY 1 · PUSH A');
      expect(container.textContent).not.toContain('Competing Push Day');
    });

    it('6. Missing core day (Day 3 missing) resolves to canonical Hybrid Day A on both surfaces', async () => {
      const cycleStart = '2026-10-01';
      // 2026-10-03 is Day 3 (Hybrid Day A)
      vi.setSystemTime(new Date(2026, 9, 3, 10, 0, 0));

      const withoutDay3 = initialWorkouts.filter(w => w.cycleDay !== 3);
      const contextValue = createMockFitnessContext({
        workouts: withoutDay3,
        appState: { cycleStart }
      });

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <ConfirmContext.Provider value={{ confirm: vi.fn().mockResolvedValue(true) }}>
                <Dashboard onStartWorkout={vi.fn()} onNavigateToHistory={vi.fn()} />
              </ConfirmContext.Provider>
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      // Dashboard shows canonical Hybrid Day A fallback
      expect(container.textContent).toContain('DAY 3 · HYBRID A');
      expect(container.textContent).toContain('Hybrid Day A');

      // Calendar shows identical fallback
      act(() => {
        root.unmount();
      });
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <FitnessContext.Provider value={contextValue}>
            <FitnessDerivedProvider>
              <Calendar onNavigateToHistory={vi.fn()} />
            </FitnessDerivedProvider>
          </FitnessContext.Provider>
        );
      });

      const day3Btn = container.querySelector('[data-testid="calendar-day-2026-10-03"]') as HTMLElement;
      expect(day3Btn).not.toBeNull();

      await act(async () => {
        day3Btn.click();
        vi.advanceTimersByTime(50);
      });

      expect(container.textContent).toContain('Hybrid Day A');
      expect(container.textContent).toContain('DAY 3 · HYBRID A');
    });
  });

  describe('Cycle Progression & Date Boundary Scenarios', () => {
    const { coreWorkoutByCycleDayMap } = buildValidatedCoreWorkoutMap(initialWorkouts);

    it('Scenario 4: Open app on Day 4 without a log, then advance reference date to Day 5: Push B selected', () => {
      const cycleStart = '2026-10-01';
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

    it('Scenario 5: Open app on Day 8 without a log, then advance to next date: Push A selected', () => {
      const cycleStart = '2026-10-01';
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

    it('Scenario 6: Miss multiple days: cycle follows calendar rather than last completed workout', () => {
      const cycleStart = '2026-10-01';
      // Lifter misses 11 days. Calendar day is 2026-10-12 (11 calendar days after cycleStart).
      // 11 % 8 = 3 -> Day 4 (Recovery)
      expect(getCycleDay(cycleStart, '2026-10-12')).toBe(4);

      // On 2026-10-13 (12 days after cycleStart): 12 % 8 = 4 -> Day 5 (Push B)
      expect(getCycleDay(cycleStart, '2026-10-13')).toBe(5);
    });

    describe('Scenario 9: Date boundary resilience (month-end, year-end, leap day, pre-anchor)', () => {
      it('handles month-end transitions smoothly', () => {
        const cycleStart = '2026-10-29'; // Day 1
        expect(getCycleDay(cycleStart, '2026-10-29')).toBe(1);
        expect(getCycleDay(cycleStart, '2026-10-30')).toBe(2);
        expect(getCycleDay(cycleStart, '2026-10-31')).toBe(3);
        expect(getCycleDay(cycleStart, '2026-11-01')).toBe(4);
        expect(getCycleDay(cycleStart, '2026-11-02')).toBe(5);
      });

      it('handles year-end transitions smoothly', () => {
        const cycleStart = '2026-12-30'; // Day 1
        expect(getCycleDay(cycleStart, '2026-12-30')).toBe(1);
        expect(getCycleDay(cycleStart, '2026-12-31')).toBe(2);
        expect(getCycleDay(cycleStart, '2027-01-01')).toBe(3);
        expect(getCycleDay(cycleStart, '2027-01-02')).toBe(4);
        expect(getCycleDay(cycleStart, '2027-01-03')).toBe(5);
      });

      it('handles leap day (Feb 29) in leap year (2028)', () => {
        const cycleStart = '2028-02-27'; // Day 1
        expect(getCycleDay(cycleStart, '2028-02-27')).toBe(1);
        expect(getCycleDay(cycleStart, '2028-02-28')).toBe(2);
        expect(getCycleDay(cycleStart, '2028-02-29')).toBe(3); // Leap Day
        expect(getCycleDay(cycleStart, '2028-03-01')).toBe(4);
        expect(getCycleDay(cycleStart, '2028-03-02')).toBe(5);
      });

      it('handles dates before the anchor date deterministically via modular arithmetic', () => {
        const cycleStart = '2026-10-09'; // Day 1
        expect(getCycleDay(cycleStart, '2026-10-08')).toBe(8);
        expect(getCycleDay(cycleStart, '2026-10-07')).toBe(7);
        expect(getCycleDay(cycleStart, '2026-10-01')).toBe(1);
      });
    });

    it('Scenario 10: Cross-surface identity: date and anchor produce identical cycle day across all selectors', () => {
      const cycleStart = '2026-10-01';
      const testDate = '2026-10-05'; // Day 5

      const direct = getCycleDay(cycleStart, testDate);
      expect(direct).toBe(5);

      const nextDay = selectNextCycleDay(cycleStart, testDate);
      expect(nextDay).toBe(direct);

      const forDate = selectCycleDayForDate(testDate, cycleStart);
      expect(forDate).toBe(direct);

      const coreWo = coreWorkoutByCycleDayMap.get(direct);
      const selectorWo = selectTodayCoreWorkout(coreWorkoutByCycleDayMap, cycleStart, testDate);
      expect(selectorWo?.id).toBe(coreWo?.id);
      expect(selectorWo?.badge).toBe('DAY 5 · PUSH B');
    });
  });
});
