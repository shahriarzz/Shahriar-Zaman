// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExerciseDefinition,
  Workout,
  SessionLog,
  AppState,
  FitnessDatabase,
  CURRENT_SCHEMA_VERSION,
  WeightLogEntry
} from '../types/fitness';
import { validateAndSanitizeFitnessData } from '../utils/fitnessMigration';
import { buildFitnessIndex, selectLifetimeStats, selectPersonalBests, selectSortedLogs } from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { calculateSetsVolume } from '../utils/fitnessCalculations';

describe('Backup / Restore Round-Trip Regression Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Comprehensive representative dataset
  const originalDefs: ExerciseDefinition[] = [
    {
      id: 'def_bench',
      name: 'Barbell Flat Bench Press',
      target: 'Chest',
      equipment: 'Barbell',
      instructions: 'Retract scapula and drive feet into floor',
      tags: ['compound', 'push', 'core']
    },
    {
      id: 'def_incline_db',
      name: 'Incline Dumbbell Fly-Press (Custom Renamed)',
      target: 'Upper Chest',
      equipment: 'Dumbbells',
      instructions: '30 degree bench angle with slight elbow bend',
      tags: ['hypertrophy', 'custom']
    },
    {
      id: 'def_weighted_chins',
      name: 'Weighted Neutral Chin-Up',
      target: 'Lats',
      equipment: 'Bodyweight',
      instructions: 'Full dead-hang to chest to bar',
      tags: ['compound', 'pull']
    },
    {
      id: 'def_bulgarian_split',
      name: 'Bulgarian Split Squat',
      target: 'Quads',
      equipment: 'Dumbbells',
      instructions: 'Elevate rear foot on bench',
      tags: ['legs', 'unilateral']
    }
  ];

  const originalWorkouts: Workout[] = [
    {
      id: 'w_upper_heavy',
      name: 'Upper Power A',
      badge: 'UPPER A',
      type: 'push',
      isCore: true,
      cycleDay: 1,
      exercises: [
        { exerciseDefinitionId: 'def_bench', sets: 4, reps: '5', rest: '180s', note: 'Heavy working sets' },
        { exerciseDefinitionId: 'def_weighted_chins', sets: 4, reps: '6-8', rest: '120s', note: '+15kg belt' }
      ]
    },
    {
      id: 'w_lower_hypertrophy',
      name: 'Lower Quad Focus',
      badge: 'LOWER A',
      type: 'lower',
      isCore: false,
      cycleDay: 2,
      exercises: [
        { exerciseDefinitionId: 'def_bulgarian_split', sets: 3, reps: '10-12', rest: '90s' }
      ]
    },
    {
      id: 'w_custom_chest_arms',
      name: 'Chest & Arms Hypertrophy Blast',
      badge: 'CUSTOM',
      type: 'custom',
      isCore: false,
      cycleDay: null,
      exercises: [
        { exerciseDefinitionId: 'def_incline_db', sets: 3, reps: '12-15', rest: '60s' }
      ]
    }
  ];

  const originalLogs: Record<string, SessionLog> = {
    'log_2026_08_01_upper': {
      id: 'log_2026_08_01_upper',
      workoutId: 'w_upper_heavy',
      date: '2026-08-01',
      complete: true,
      durationMinutes: 55,
      sets: {
        def_bench: [
          { id: 's1', weight: '100', reps: '5', done: true },
          { id: 's2', weight: '102.5', reps: '5', done: true },
          { id: 's3', weight: '105', reps: '4', done: true },
          { id: 's4', weight: '105', reps: '3', done: false } // undone set
        ],
        def_weighted_chins: [
          { id: 'c1', weight: '15', reps: '8', done: true },
          { id: 'c2', weight: '15', reps: '7', done: true }
        ]
      }
    },
    'log_2026_08_03_lower': {
      id: 'log_2026_08_03_lower',
      workoutId: 'w_lower_hypertrophy',
      date: '2026-08-03',
      complete: true,
      durationMinutes: 45,
      sets: {
        def_bulgarian_split: [
          { id: 'bss_1', weight: '24', reps: '10', done: true },
          { id: 'bss_2', weight: '24', reps: '10', done: true }
        ]
      }
    },
    'log_2026_08_05_custom': {
      id: 'log_2026_08_05_custom',
      workoutId: 'w_custom_chest_arms',
      date: '2026-08-05',
      complete: true,
      durationMinutes: 35,
      sets: {
        def_incline_db: [
          { id: 'inc_1', weight: '36', reps: '12', done: true },
          { id: 'inc_2', weight: '38', reps: '10', done: true }
        ]
      }
    }
  };

  const originalAppState: AppState = {
    cycleStart: '2026-08-01',
    weightLog: {
      '2026-08-01': 82.4, // Legacy numeric format
      '2026-08-03': { weight: 82.1, updatedAt: 1722672000000 }, // Modern versioned format
      '2026-08-05': { weight: 81.9, updatedAt: 1722844800000 }
    },
    updatedAt: 1722845000000
  };

  it('performs a lossless round-trip: backup -> clear/replace state -> restore -> verify semantically identical state & identical derived analytics', () => {
    // 1. GENERATE BACKUP EXPORT
    const backupObj: FitnessDatabase = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      exerciseDefinitions: originalDefs,
      workouts: originalWorkouts,
      logs: originalLogs,
      appState: originalAppState
    };

    const exportedJsonString = JSON.stringify(backupObj, null, 2);
    expect(exportedJsonString).toContain('Barbell Flat Bench Press');
    expect(exportedJsonString).toContain('Chest & Arms Hypertrophy Blast');

    // Baseline Index before clear
    const originalDefsMap = createExerciseDefinitionMap(originalDefs);
    const originalIndex = buildFitnessIndex(originalLogs, originalDefsMap);
    const originalLifetimeStats = selectLifetimeStats(originalIndex);
    const originalPBs = selectPersonalBests(originalIndex);
    const originalSortedLogs = selectSortedLogs(originalIndex);

    // 2. CLEAR / REPLACE ALL LOCAL STATE TO EMPTY
    localStorage.clear();
    localStorage.setItem('gl_exercise_definitions', JSON.stringify([]));
    localStorage.setItem('gl_workouts', JSON.stringify([]));
    localStorage.setItem('gl_logs', JSON.stringify({}));
    localStorage.setItem('gl_state', JSON.stringify({ cycleStart: '2026-08-16' }));

    expect(JSON.parse(localStorage.getItem('gl_exercise_definitions')!)).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('gl_workouts')!)).toHaveLength(0);
    expect(Object.keys(JSON.parse(localStorage.getItem('gl_logs')!))).toHaveLength(0);

    // 3. RESTORE / IMPORT BACKUP
    const parsedImport = JSON.parse(exportedJsonString);
    const validationResult = validateAndSanitizeFitnessData(parsedImport);

    expect(validationResult.success).toBe(true);
    expect(validationResult.data).toBeDefined();

    const restoredData = validationResult.data!;

    // Save restored state to storage
    localStorage.setItem('gl_schema_version', String(restoredData.schemaVersion));
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(restoredData.exerciseDefinitions));
    localStorage.setItem('gl_workouts', JSON.stringify(restoredData.workouts));
    localStorage.setItem('gl_logs', JSON.stringify(restoredData.logs));
    localStorage.setItem('gl_state', JSON.stringify(restoredData.appState));

    // 4. VERIFY RESTORED DATASET IS SEMANTICALLY IDENTICAL
    // A. Exercise Definitions
    expect(restoredData.exerciseDefinitions).toHaveLength(originalDefs.length);
    originalDefs.forEach(origDef => {
      const restoredDef = restoredData.exerciseDefinitions.find(d => d.id === origDef.id);
      expect(restoredDef).toBeDefined();
      expect(restoredDef?.name).toBe(origDef.name);
      expect(restoredDef?.target).toBe(origDef.target);
      expect(restoredDef?.equipment).toBe(origDef.equipment);
      expect(restoredDef?.instructions).toBe(origDef.instructions);
      expect(restoredDef?.tags).toEqual(origDef.tags);
    });

    // B. Workouts
    expect(restoredData.workouts).toHaveLength(originalWorkouts.length);
    originalWorkouts.forEach(origW => {
      const restoredW = restoredData.workouts.find(w => w.id === origW.id);
      expect(restoredW).toBeDefined();
      expect(restoredW?.name).toBe(origW.name);
      expect(restoredW?.badge).toBe(origW.badge);
      expect(restoredW?.type).toBe(origW.type);
      expect(restoredW?.cycleDay).toBe(origW.cycleDay);
      expect(restoredW?.exercises).toHaveLength(origW.exercises.length);
      origW.exercises.forEach((origEx, idx) => {
        expect(restoredW?.exercises[idx].exerciseDefinitionId).toBe(origEx.exerciseDefinitionId);
        expect(restoredW?.exercises[idx].sets).toBe(origEx.sets);
        expect(restoredW?.exercises[idx].reps).toBe(origEx.reps);
      });
    });

    // C. Logs
    expect(Object.keys(restoredData.logs)).toHaveLength(Object.keys(originalLogs).length);
    Object.entries(originalLogs).forEach(([logId, origLog]) => {
      const restoredLog = restoredData.logs[logId];
      expect(restoredLog).toBeDefined();
      expect(restoredLog.workoutId).toBe(origLog.workoutId);
      expect(restoredLog.date).toBe(origLog.date);
      expect(restoredLog.durationMinutes).toBe(origLog.durationMinutes);
      expect(calculateSetsVolume(Object.values(restoredLog.sets).flat())).toBe(calculateSetsVolume(Object.values(origLog.sets).flat()));

      Object.entries(origLog.sets).forEach(([exKey, origSetList]) => {
        const restoredSetList = restoredLog.sets[exKey];
        expect(restoredSetList).toHaveLength(origSetList.length);
        origSetList.forEach((origSet, sIdx) => {
          expect(restoredSetList[sIdx].id).toBe(origSet.id);
          expect(restoredSetList[sIdx].weight).toBe(origSet.weight);
          expect(restoredSetList[sIdx].reps).toBe(origSet.reps);
          expect(restoredSetList[sIdx].done).toBe(origSet.done);
        });
      });
    });

    // D. AppState & Bodyweight records
    expect(restoredData.appState.cycleStart).toBe(originalAppState.cycleStart);
    expect(restoredData.appState.weightLog).toBeDefined();
    expect(Object.keys(restoredData.appState.weightLog || {})).toEqual(Object.keys(originalAppState.weightLog || {}));

    // 5. DERIVED INDEX INTEGRITY CHECK
    const restoredDefsMap = createExerciseDefinitionMap(restoredData.exerciseDefinitions);
    const restoredIndex = buildFitnessIndex(restoredData.logs, restoredDefsMap);
    const restoredLifetimeStats = selectLifetimeStats(restoredIndex);
    const restoredPBs = selectPersonalBests(restoredIndex);
    const restoredSortedLogs = selectSortedLogs(restoredIndex);

    expect(restoredLifetimeStats.totalSessions).toBe(originalLifetimeStats.totalSessions);
    expect(restoredLifetimeStats.totalVolume).toBe(originalLifetimeStats.totalVolume);
    expect(restoredLifetimeStats.totalSets).toBe(originalLifetimeStats.totalSets);
    expect(restoredLifetimeStats.totalMinutes).toBe(originalLifetimeStats.totalMinutes);

    expect(restoredPBs).toHaveLength(originalPBs.length);
    originalPBs.forEach(origPB => {
      const matchedPB = restoredPBs.find(p => p.exerciseId === origPB.exerciseId);
      expect(matchedPB).toBeDefined();
      expect(matchedPB?.maxEpley).toBe(origPB.maxEpley);
      expect(matchedPB?.maxWeight).toBe(origPB.maxWeight);
      expect(matchedPB?.repsAtMax).toBe(origPB.repsAtMax);
    });

    expect(restoredSortedLogs.map(l => l.id)).toEqual(originalSortedLogs.map(l => l.id));
  });
});
