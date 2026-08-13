// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  calculateVolume,
  calculateTotalWeightLifted,
  calculateE1RM,
  getCompletedSets,
  getExerciseSets,
  getExerciseVolume,
  getSessionVolume,
  getHeaviestSet,
  getExerciseHistory,
  getLatestExerciseSession,
  getAllTimeHeaviestSet,
  getAllTimeBestE1RM,
  calculateStreak,
  calculateLongestStreak,
  getCycleDay,
  getNextCycleDayFromLogs,
  getCycleDayForDate,
  getSortedWeightEntries,
  getWeightSparklineData,
  sanitizeSetLog,
  sanitizeSessionLog,
  getSortedLogsDescending
} from '../utils/fitnessCalculations';
import {
  createExerciseDefinitionMap,
  resolveExercise,
  resolveWorkoutExercise,
  mapTargetToCategory,
  getPriorityExercises,
  getCompoundScore
} from '../utils/exerciseResolver';
import {
  selectPersonalBests,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectLifetimeStats,
  selectWeightSummary
} from '../utils/fitnessSelectors';
import { SessionLog, ExerciseDefinition, Workout } from '../types/fitness';

describe('Canonical Fitness Calculation & Selector Pipeline', () => {

  // -------------------------------------------------------------
  // 1. COMPLETED-SET FILTERING INVARIANT
  // -------------------------------------------------------------
  describe('1. Completed-Set Filtering Invariant', () => {
    it('filters only sets where done is true', () => {
      const sets = [
        { id: 's1', weight: '100', reps: '10', done: true },
        { id: 's2', weight: '100', reps: '10', done: false },
        { id: 's3', weight: '100', reps: '8', done: true }
      ];

      const completed = getCompletedSets(sets);
      expect(completed).toHaveLength(2);
      expect(completed.map(s => s.id)).toEqual(['s1', 's3']);
    });

    it('filters completed sets across an entire session log', () => {
      const log: SessionLog = {
        id: 'l1',
        workoutId: 'w1',
        date: '2026-08-10',
        complete: true,
        durationMinutes: 40,
        sets: {
          'ex1': [
            { id: 's1', weight: '50', reps: '10', done: true },
            { id: 's2', weight: '50', reps: '10', done: false }
          ],
          'ex2': [
            { id: 's3', weight: '70', reps: '8', done: true }
          ]
        }
      };

      const completed = getCompletedSets(log);
      expect(completed).toHaveLength(2);
      expect(completed.map(s => s.id)).toEqual(['s1', 's3']);
    });
  });

  // -------------------------------------------------------------
  // 2. VOLUME CALCULATIONS
  // -------------------------------------------------------------
  describe('2. Volume Calculations', () => {
    it('calculates exercise volume ignoring incomplete sets', () => {
      const log: SessionLog = {
        id: 'l1',
        workoutId: 'w1',
        date: '2026-08-10',
        complete: true,
        durationMinutes: 40,
        sets: {
          'ex1': [
            { id: 's1', weight: '100', reps: '10', done: true }, // 1000 kg
            { id: 's2', weight: '100', reps: '10', done: false }, // ignored
            { id: 's3', weight: '120', reps: '5', done: true }   // 600 kg
          ]
        }
      };

      expect(getExerciseVolume(log, 'ex1')).toBe(1600);
      expect(getSessionVolume(log)).toBe(1600);
      expect(calculateVolume(log)).toBe(1600);
    });

    it('calculates total volume lifted across multiple sessions', () => {
      const logs: Record<string, SessionLog> = {
        'l1': {
          id: 'l1',
          workoutId: 'w1',
          date: '2026-08-10',
          complete: true,
          durationMinutes: 40,
          sets: { 'ex1': [{ id: 's1', weight: '100', reps: '10', done: true }] } // 1000
        },
        'l2': {
          id: 'l2',
          workoutId: 'w2',
          date: '2026-08-11',
          complete: true,
          durationMinutes: 45,
          sets: { 'ex2': [{ id: 's2', weight: '200', reps: '5', done: true }] }  // 1000
        }
      };

      expect(calculateTotalWeightLifted(logs)).toBe(2000);
    });
  });

  // -------------------------------------------------------------
  // 3. ESTIMATED 1RM (e1RM) CALCULATION
  // -------------------------------------------------------------
  describe('3. Estimated 1RM (e1RM)', () => {
    it('returns exact weight for 1 rep', () => {
      expect(calculateE1RM(100, 1)).toBe(100);
    });

    it('calculates standard Epley for multi-rep sets', () => {
      // 100 * (1 + 10/30) = 133.333... -> 133.3
      expect(calculateE1RM(100, 10)).toBe(133.3);
    });

    it('caps effective reps at 30 reps', () => {
      // 100 * (1 + 30/30) = 200
      expect(calculateE1RM(100, 50)).toBe(200);
    });

    it('handles zero or invalid inputs safely', () => {
      expect(calculateE1RM(0, 10)).toBe(0);
      expect(calculateE1RM(100, 0)).toBe(0);
      expect(calculateE1RM(-50, 10)).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // 4. HEAVIEST SET & PR DETECTION
  // -------------------------------------------------------------
  describe('4. Heaviest Set & PR Detection', () => {
    const logs: Record<string, SessionLog> = {
      'l1': {
        id: 'l1',
        workoutId: 'w1',
        date: '2026-08-01',
        complete: true,
        durationMinutes: 40,
        sets: {
          'bench': [
            { id: 's1', weight: '90', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '5', done: true }
          ]
        }
      },
      'l2': {
        id: 'l2',
        workoutId: 'w1',
        date: '2026-08-08',
        complete: true,
        durationMinutes: 45,
        sets: {
          'bench': [
            { id: 's3', weight: '105', reps: '3', done: true },
            { id: 's4', weight: '110', reps: '1', done: true }
          ]
        }
      }
    };

    it('finds heaviest set in a single session', () => {
      const bestL1 = getHeaviestSet(logs['l1'], 'bench');
      expect(bestL1?.weight).toBe(100);
      expect(bestL1?.reps).toBe('5');
    });

    it('finds all-time heaviest set across history', () => {
      const allTime = getAllTimeHeaviestSet(logs, 'bench');
      expect(allTime?.weight).toBe(110);
      expect(allTime?.reps).toBe('1');
      expect(allTime?.date).toBe('2026-08-08');
    });

    it('finds all-time best estimated 1RM across history', () => {
      // l1: 100x5 -> 100 * (1 + 5/30) = 116.7
      // l2: 105x3 -> 105 * (1 + 3/30) = 115.5
      // l2: 110x1 -> 110
      const bestE1RM = getAllTimeBestE1RM(logs, 'bench');
      expect(bestE1RM?.e1rm).toBe(116.7);
      expect(bestE1RM?.weight).toBe(100);
      expect(bestE1RM?.date).toBe('2026-08-01');
    });
  });

  // -------------------------------------------------------------
  // 5. STREAK CALCULATIONS
  // -------------------------------------------------------------
  describe('5. Streak Calculations', () => {
    it('calculates current consecutive day streak correctly', () => {
      const refDate = new Date(2026, 7, 13); // Aug 13, 2026
      const logs: SessionLog[] = [
        { id: 'l1', workoutId: 'w1', date: '2026-08-13', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l2', workoutId: 'w2', date: '2026-08-12', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l3', workoutId: 'w3', date: '2026-08-11', complete: true, durationMinutes: 30, sets: {} }
      ];

      expect(calculateStreak(logs, refDate)).toBe(3);
    });

    it('sustains streak if today has not been logged yet but yesterday was', () => {
      const refDate = new Date(2026, 7, 13); // Aug 13, 2026 (no log today yet)
      const logs: SessionLog[] = [
        { id: 'l1', workoutId: 'w1', date: '2026-08-12', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l2', workoutId: 'w2', date: '2026-08-11', complete: true, durationMinutes: 30, sets: {} }
      ];

      expect(calculateStreak(logs, refDate)).toBe(2);
    });

    it('calculates longest historical streak across broken periods', () => {
      const logs: SessionLog[] = [
        // 4-day streak in January
        { id: 'l1', workoutId: 'w1', date: '2026-01-01', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l2', workoutId: 'w1', date: '2026-01-02', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l3', workoutId: 'w1', date: '2026-01-03', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l4', workoutId: 'w1', date: '2026-01-04', complete: true, durationMinutes: 30, sets: {} },
        // Gap
        // 2-day streak in February
        { id: 'l5', workoutId: 'w1', date: '2026-02-01', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l6', workoutId: 'w1', date: '2026-02-02', complete: true, durationMinutes: 30, sets: {} }
      ];

      expect(calculateLongestStreak(logs)).toBe(4);
    });
  });

  // -------------------------------------------------------------
  // 6. CANONICAL EXERCISE RESOLVER
  // -------------------------------------------------------------
  describe('6. Canonical Exercise Resolver', () => {
    const defs: ExerciseDefinition[] = [
      {
        id: 'bench-press-def',
        name: 'Barbell Bench Press',
        target: 'Middle Chest',
        equipment: 'Barbell',
        instructions: 'Arch back, plant feet',
        tags: ['priority']
      }
    ];
    const defsMap = createExerciseDefinitionMap(defs);

    it('resolves valid definition accurately', () => {
      const meta = resolveExercise('bench-press-def', defsMap);
      expect(meta.id).toBe('bench-press-def');
      expect(meta.name).toBe('Barbell Bench Press');
      expect(meta.target).toBe('Middle Chest');
      expect(meta.category).toBe('Chest');
      expect(meta.equipment).toBe('Barbell');
      expect(meta.isUnknown).toBe(false);
    });

    it('provides controlled fallback for orphaned/deleted definition IDs', () => {
      const meta = resolveExercise('deleted-id-999', defsMap);
      expect(meta.id).toBe('deleted-id-999');
      expect(meta.name).toBe('Unknown Exercise');
      expect(meta.isUnknown).toBe(true);
    });

    it('resolves workout exercise programming with definition metadata', () => {
      const we = {
        exerciseDefinitionId: 'bench-press-def',
        sets: 4,
        reps: '8-10',
        rest: '120s'
      };
      const resolved = resolveWorkoutExercise(we, defsMap);
      expect(resolved.name).toBe('Barbell Bench Press');
      expect(resolved.sets).toBe(4);
      expect(resolved.reps).toBe('8-10');
      expect(resolved.rest).toBe('120s');
    });
  });

  // -------------------------------------------------------------
  // 7. SELECTORS & DERIVED DATA CONSISTENCY
  // -------------------------------------------------------------
  describe('7. Selectors & Derived Data Consistency', () => {
    const defs: ExerciseDefinition[] = [
      { id: 'd1', name: 'Barbell Bench Press', target: 'Chest' },
      { id: 'd2', name: 'Barbell Squat', target: 'Quads' },
      { id: 'd3', name: 'Pull-Up', target: 'Lats' }
    ];
    const defsMap = createExerciseDefinitionMap(defs);

    const logs: Record<string, SessionLog> = {
      'l1': {
        id: 'l1',
        workoutId: 'w1',
        date: '2026-08-01',
        complete: true,
        durationMinutes: 45,
        sets: {
          'd1': [{ id: 's1', weight: '100', reps: '10', done: true }], // 1000 kg, e1RM 133.3
          'd2': [{ id: 's2', weight: '140', reps: '5', done: true }]   // 700 kg, e1RM 163.3
        }
      },
      'l2': {
        id: 'l2',
        workoutId: 'w2',
        date: '2026-08-03',
        complete: true,
        durationMinutes: 50,
        sets: {
          'd3': [{ id: 's3', weight: '0', reps: '12', done: true }],  // 0 kg (bodyweight)
          'd1': [{ id: 's4', weight: '105', reps: '8', done: true }]  // 840 kg, e1RM 133.0
        }
      }
    };

    it('selects personal bests sorted descending by estimated 1RM', () => {
      const pbs = selectPersonalBests(logs, defsMap);
      expect(pbs).toHaveLength(2);
      expect(pbs[0].exerciseId).toBe('d2'); // Squat e1RM 163.3
      expect(pbs[1].exerciseId).toBe('d1'); // Bench e1RM 133.3
    });

    it('selects muscle distribution with correct volumes and set counts', () => {
      const dist = selectMuscleDistribution(logs, defsMap);
      expect(dist.volume.Chest).toBe(1840);
      expect(dist.volume.Legs).toBe(700);
      expect(dist.sets.Chest).toBe(2);
      expect(dist.sets.Legs).toBe(1);
      expect(dist.sets.Back).toBe(1);
      expect(dist.totalVolume).toBe(2540);
      expect(dist.totalSets).toBe(4);
    });

    it('selects exercise frequency ranking correctly', () => {
      const freq = selectExerciseFrequency(logs, defsMap);
      expect(freq[0].exerciseId).toBe('d1'); // Bench performed in 2 sessions
      expect(freq[0].count).toBe(2);
      expect(freq[0].volume).toBe(1840);
    });

    it('selects lifetime stats accurately', () => {
      const stats = selectLifetimeStats(logs);
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalVolume).toBe(2540);
      expect(stats.totalSets).toBe(4);
      expect(stats.totalMinutes).toBe(95);
      expect(stats.firstSessionDate).toBe('2026-08-01');
      expect(stats.lastSessionDate).toBe('2026-08-03');
    });

    it('selects weight summary biometrics correctly', () => {
      const weightLog = {
        '2026-08-01': 80.5,
        '2026-08-05': 80.2,
        '2026-08-10': 79.8
      };
      const summary = selectWeightSummary(weightLog);
      expect(summary.currentWeight).toBe(79.8);
      expect(summary.weightEntries).toHaveLength(3);
      expect(summary.recentWeightLogs[0][0]).toBe('2026-08-10');
      expect(summary.sparklineData).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // 8. SANITIZATION & RE-INGESTION CONTRACT
  // -------------------------------------------------------------
  describe('8. Sanitization & Re-ingestion Contract', () => {
    it('sanitizes partial or malformed sets predictably', () => {
      const sanitized = sanitizeSetLog({ weight: 75 as any, reps: 12 as any, done: true });
      expect(sanitized.weight).toBe('75');
      expect(sanitized.reps).toBe('12');
      expect(sanitized.done).toBe(true);
      expect(sanitized.id).toBeDefined();
    });

    it('sanitizes session logs ensuring positive duration and non-null sets map', () => {
      const raw = {
        id: 'sess-1',
        workoutId: 'w-1',
        date: '2026-08-13',
        durationMinutes: -15 as any,
        sets: {
          'ex-1': [{ weight: '50', reps: '10', done: true }]
        }
      };
      const cleaned = sanitizeSessionLog(raw);
      expect(cleaned.durationMinutes).toBe(0);
      expect(cleaned.sets['ex-1']).toHaveLength(1);
    });
  });
});
