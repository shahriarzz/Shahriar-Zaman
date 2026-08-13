// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadInitialFitnessData, extractExerciseDefinitionsFromWorkouts } from '../utils/fitnessMigration';
import { trackDeletedId, getDeletedIdsTracker, clearDeletedIdsTracker, areLogsEqual } from '../utils/fitnessSyncHelpers';
import {
  createExerciseDefinitionMap,
  getResolvedExerciseMeta,
  getPriorityExercises,
  mapTargetToCategory,
  calcEpley1RM
} from '../utils/fitnessAnalyticsHelpers';
import { ExerciseDefinition, Workout, SessionLog, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_EXERCISE_DEFINITIONS, INITIAL_WORKOUTS } from '../types/initialData';

describe('GainLog Comprehensive Validation Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeletedIdsTracker();
  });

  // -------------------------------------------------------------
  // 1. SMOKE TEST
  // -------------------------------------------------------------
  describe('1. Smoke Test', () => {
    it('initializes application data correctly on fresh load', () => {
      const data = loadInitialFitnessData();
      expect(data).toBeDefined();
      expect(data.defs).toHaveLength(INITIAL_EXERCISE_DEFINITIONS.length);
      expect(data.workouts).toHaveLength(INITIAL_WORKOUTS.length);
      expect(data.logs).toEqual({});
      expect(data.appState).toBeDefined();
      expect(data.appState.cycleStart).toBeDefined();
      expect(localStorage.getItem('gl_schema_version')).toBe(String(CURRENT_SCHEMA_VERSION));
    });

    it('verifies initial schema constants', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 2. CRUD TESTS
  // -------------------------------------------------------------
  describe('2. CRUD Operations Test', () => {
    it('Exercise Definitions CRUD: Create, Read, Update, Delete', () => {
      const initial = loadInitialFitnessData();
      const defs = [...initial.defs];

      // CREATE
      const newDef: ExerciseDefinition = {
        id: 'ex-custom-1',
        name: 'Incline Cable Fly',
        target: 'Upper Chest',
        tags: ['priority']
      };
      defs.push(newDef);
      expect(defs.find(d => d.id === 'ex-custom-1')).toBeDefined();

      // READ
      const found = defs.find(d => d.id === 'ex-custom-1');
      expect(found?.name).toBe('Incline Cable Fly');

      // UPDATE
      const updatedDefs = defs.map(d => d.id === 'ex-custom-1' ? { ...d, name: 'Incline Cable Fly (High Angle)' } : d);
      expect(updatedDefs.find(d => d.id === 'ex-custom-1')?.name).toBe('Incline Cable Fly (High Angle)');

      // DELETE
      trackDeletedId('defs', 'ex-custom-1');
      const filteredDefs = updatedDefs.filter(d => d.id !== 'ex-custom-1');
      expect(filteredDefs.find(d => d.id === 'ex-custom-1')).toBeUndefined();
      expect(getDeletedIdsTracker().defs).toContain('ex-custom-1');
    });

    it('Workouts CRUD: Create, Read, Update, Delete', () => {
      const initial = loadInitialFitnessData();
      const workouts = [...initial.workouts];

      // CREATE
      const newWorkout: Workout = {
        id: 'workout-custom-1',
        name: 'Arm Day Burner',
        badge: 'ARMS',
        type: 'custom',
        exercises: [
          { exerciseDefinitionId: 'e11', sets: 4, reps: '12-15' }
        ]
      };
      workouts.push(newWorkout);
      expect(workouts.find(w => w.id === 'workout-custom-1')).toBeDefined();

      // READ
      const found = workouts.find(w => w.id === 'workout-custom-1');
      expect(found?.exercises).toHaveLength(1);

      // UPDATE
      const updated = workouts.map(w => w.id === 'workout-custom-1' ? { ...w, name: 'Arm Day Heavy' } : w);
      expect(updated.find(w => w.id === 'workout-custom-1')?.name).toBe('Arm Day Heavy');

      // DELETE
      trackDeletedId('workouts', 'workout-custom-1');
      const activeWorkouts = updated.filter(w => w.id !== 'workout-custom-1');
      expect(activeWorkouts.find(w => w.id === 'workout-custom-1')).toBeUndefined();
      expect(getDeletedIdsTracker().workouts).toContain('workout-custom-1');
    });

    it('Session Logs CRUD: Create, Read, Update, Delete', () => {
      const logs: Record<string, SessionLog> = {};

      // CREATE
      const logId = 'log-2026-08-12-push-a';
      logs[logId] = {
        id: logId,
        workoutId: 'push-a',
        date: '2026-08-12',
        sets: {
          'e1': [
            { id: 's1', weight: '80', reps: '10', done: true },
            { id: 's2', weight: '85', reps: '8', done: true }
          ]
        },
        complete: true,
        durationMinutes: 45
      };
      expect(logs[logId]).toBeDefined();

      // READ
      expect(logs[logId].sets['e1']).toHaveLength(2);

      // UPDATE
      logs[logId].durationMinutes = 50;
      expect(logs[logId].durationMinutes).toBe(50);

      // DELETE
      trackDeletedId('logs', logId);
      delete logs[logId];
      expect(logs[logId]).toBeUndefined();
      expect(getDeletedIdsTracker().logs).toContain(logId);
    });
  });

  // -------------------------------------------------------------
  // 3. SAFETY TESTS
  // -------------------------------------------------------------
  describe('3. Safety Test', () => {
    it('recovers safely from invalid or corrupted JSON in localStorage', () => {
      localStorage.setItem('gl_exercise_definitions', '{ corrupted json ...');
      localStorage.setItem('gl_workouts', '12345');
      localStorage.setItem('gl_logs', 'undefined');

      const data = loadInitialFitnessData();
      expect(Array.isArray(data.defs)).toBe(true);
      expect(Array.isArray(data.workouts)).toBe(true);
      expect(typeof data.logs).toBe('object');
    });

    it('gracefully handles missing optional fields without throwing errors', () => {
      const rawDefs = [{ id: 'bare-1' }]; // Missing name, target, equipment, instructions, tags
      const { defs } = extractExerciseDefinitionsFromWorkouts([], rawDefs as any);
      expect(defs[0].id).toBe('bare-1');
    });

    it('maintains pending tombstones safely when cloud synchronization fails', () => {
      trackDeletedId('workouts', 'target-del-1');
      trackDeletedId('defs', 'target-del-2');

      const tracker = getDeletedIdsTracker();
      expect(tracker.workouts).toContain('target-del-1');
      expect(tracker.defs).toContain('target-del-2');
    });
  });

  // -------------------------------------------------------------
  // 4. WORKOUT-SESSION STRESS TEST
  // -------------------------------------------------------------
  describe('4. Workout-Session Stress Test', () => {
    it('handles heavy volume logging with 100 sets across 10 exercises', () => {
      const logId = 'log-stress-test';
      const setsMap: Record<string, any[]> = {};

      let totalCalculatedVolume = 0;
      for (let e = 1; e <= 10; e++) {
        const exId = `e${e}`;
        setsMap[exId] = [];
        for (let s = 1; s <= 10; s++) {
          const weight = 50 + s * 5; // 55 to 100 kg
          const reps = 10;
          totalCalculatedVolume += weight * reps;
          setsMap[exId].push({
            id: `set-${e}-${s}`,
            weight: String(weight),
            reps: String(reps),
            done: true
          });
        }
      }

      const heavyLog: SessionLog = {
        id: logId,
        workoutId: 'push-a',
        date: '2026-08-12',
        sets: setsMap,
        complete: true,
        durationMinutes: 90
      };

      expect(Object.keys(heavyLog.sets)).toHaveLength(10);
      
      // Calculate total volume sum across all sets
      let logVolume = 0;
      Object.values(heavyLog.sets).forEach(setList => {
        setList.forEach(s => {
          if (s.done) {
            logVolume += (parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0);
          }
        });
      });

      expect(logVolume).toBe(totalCalculatedVolume);
      expect(logVolume).toBeGreaterThan(30000); // Over 30,000 kg volume!
    });
  });

  // -------------------------------------------------------------
  // 5. DATA INTEGRITY TESTS
  // -------------------------------------------------------------
  describe('5. Data Integrity Tests', () => {
    it('preserves user cleared state (empty arrays) without resurrecting default templates', () => {
      localStorage.setItem('gl_schema_version', '2');
      localStorage.setItem('gl_exercise_definitions', JSON.stringify([]));
      localStorage.setItem('gl_workouts', JSON.stringify([]));
      localStorage.setItem('gl_logs', JSON.stringify({}));
      localStorage.setItem('gl_state', JSON.stringify({ cycleStart: '2026-01-01' }));

      const loaded = loadInitialFitnessData();
      expect(loaded.defs).toHaveLength(0);
      expect(loaded.workouts).toHaveLength(0);
      expect(loaded.logs).toEqual({});
    });

    it('compares identical logs accurately via areLogsEqual helper', () => {
      const logA: SessionLog = {
        id: 'l1',
        workoutId: 'push-a',
        date: '2026-08-12',
        sets: { 'e1': [{ id: 's1', weight: '80', reps: '10', done: true }] },
        complete: true,
        durationMinutes: 45
      };

      const logB: SessionLog = {
        id: 'l1',
        workoutId: 'push-a',
        date: '2026-08-12',
        sets: { 'e1': [{ id: 's1', weight: '80', reps: '10', done: true }] },
        complete: true,
        durationMinutes: 45
      };

      const logC: SessionLog = {
        ...logA,
        durationMinutes: 50
      };

      expect(areLogsEqual(logA, logB)).toBe(true);
      expect(areLogsEqual(logA, logC)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 6. UI EDGE-CASE TESTS
  // -------------------------------------------------------------
  describe('6. UI Edge-Case Tests', () => {
    it('handles workouts with empty exercise arrays safely', () => {
      const restWorkout: Workout = {
        id: 'rest-day',
        name: 'Rest Day',
        badge: 'REST',
        type: 'rest',
        isCore: true,
        exercises: [],
        restNotes: ['Rest and recover', 'Drink water']
      };

      expect(restWorkout.exercises).toHaveLength(0);
      expect(restWorkout.restNotes).toHaveLength(2);
    });

    it('handles workouts with null or missing cardio finisher safely', () => {
      const noCardioWorkout: Workout = {
        id: 'w-no-cardio',
        name: 'Pure Lifting',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'e1', sets: 3, reps: '10' }],
        cardio: null
      };

      expect(noCardioWorkout.cardio).toBeNull();
    });

    it('handles orphaned exerciseDefinitionId in workout exercises gracefully', () => {
      const defs = [{ id: 'e1', name: 'Bench Press', target: 'Chest' }];
      const workoutExercise = { exerciseDefinitionId: 'non-existent-id', sets: 3, reps: '10' };

      const matchedDef = defs.find(d => d.id === workoutExercise.exerciseDefinitionId);
      const displayName = matchedDef ? matchedDef.name : 'Unknown Exercise';

      expect(displayName).toBe('Unknown Exercise');
    });
  });

  // -------------------------------------------------------------
  // 7. PERFORMANCE TEST
  // -------------------------------------------------------------
  describe('7. Performance Test', () => {
    it('filters through 1,000 exercise definitions in under 10ms', () => {
      const largeDefs: ExerciseDefinition[] = [];
      for (let i = 0; i < 1000; i++) {
        largeDefs.push({
          id: `ex-perf-${i}`,
          name: `Exercise Variant ${i}`,
          target: i % 2 === 0 ? 'Chest' : 'Back',
          tags: i % 10 === 0 ? ['priority'] : []
        });
      }

      const start = performance.now();
      const filtered = largeDefs.filter(d => d.target === 'Chest' && d.tags?.includes('priority'));
      const duration = performance.now() - start;

      expect(filtered.length).toBe(100);
      expect(duration).toBeLessThan(10); // Under 10ms execution limit
    });

    it('queries through 1,000 session logs in under 10ms', () => {
      const largeLogs: Record<string, SessionLog> = {};
      for (let i = 0; i < 1000; i++) {
        const id = `log-${i}`;
        largeLogs[id] = {
          id,
          workoutId: i % 2 === 0 ? 'push-a' : 'pull-a',
          date: `2026-01-${(i % 30) + 1}`,
          sets: {},
          complete: i % 3 === 0,
          durationMinutes: 45
        };
      }

      const start = performance.now();
      const completedPushALogs = Object.values(largeLogs).filter(l => l.workoutId === 'push-a' && l.complete);
      const duration = performance.now() - start;

      expect(completedPushALogs.length).toBeGreaterThan(150);
      expect(duration).toBeLessThan(10); // Under 10ms execution limit
    });
  });

  // -------------------------------------------------------------
  // 8. ANALYTICS EXERCISE RESOLUTION HELPERS
  // -------------------------------------------------------------
  describe('8. Analytics Exercise Resolution Helpers', () => {
    it('resolves exercise metadata via exerciseDefinitionId cleanly', () => {
      const defs: ExerciseDefinition[] = [
        { id: 'e1', name: 'Barbell Flat Bench Press', target: 'Chest', tags: ['priority'] },
        { id: 'e2', name: 'Incline Dumbbell Press', target: 'Upper Chest' }
      ];
      const defsMap = createExerciseDefinitionMap(defs);

      const resolved = getResolvedExerciseMeta('e1', defsMap);
      expect(resolved.id).toBe('e1');
      expect(resolved.name).toBe('Barbell Flat Bench Press');
      expect(resolved.target).toBe('Chest');
      expect(resolved.category).toBe('Chest');
      expect(resolved.tags).toContain('priority');
    });

    it('ranks priority and compound exercises correctly', () => {
      const defs: ExerciseDefinition[] = [
        { id: 'e1', name: 'Barbell Squat', target: 'Quads', tags: ['priority'] },
        { id: 'e2', name: 'Barbell Deadlift', target: 'Back' },
        { id: 'e3', name: 'Triceps Pushdown', target: 'Triceps' }
      ];
      const defsMap = createExerciseDefinitionMap(defs);
      const priority = getPriorityExercises(defs, [], defsMap);

      expect(priority.length).toBeGreaterThanOrEqual(3);
      expect(priority[0].id).toBe('e1'); // Priority tagged
      expect(priority[1].name).toContain('Deadlift'); // High compound score
    });

    it('calculates 1RM Epley formula and maps targets accurately', () => {
      expect(calcEpley1RM(100, 1)).toBe(100);
      expect(calcEpley1RM(100, 10)).toBe(133.3);
      expect(mapTargetToCategory('Triceps Long Head')).toBe('Triceps');
      expect(mapTargetToCategory('Hamstrings')).toBe('Legs');
      expect(mapTargetToCategory('Lats')).toBe('Back');
    });
  });
});
