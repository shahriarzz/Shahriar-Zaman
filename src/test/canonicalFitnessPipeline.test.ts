// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  calculateSetVolume,
  calculateSetsVolume,
  calculateE1RM,
  getCompletedSets,
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
  buildFitnessIndex,
  selectSortedLogs,
  selectLifetimeStats,
  selectPersonalBests,
  selectPersonalBestForExercise,
  selectExercisePR,
  isNewPersonalBest,
  selectExerciseHistory,
  selectExercise1RMProgression,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectWeightSummary,
  selectTimeRangeAnalytics
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise,
  resolveWorkoutExercise,
  mapTargetToCategory,
  getPriorityExercises,
  getCompoundScore
} from '../utils/exerciseResolver';
import { SessionLog, ExerciseDefinition, Workout } from '../types/fitness';

describe('Canonical Fitness Calculation & Index Pipeline', () => {

  // -------------------------------------------------------------
  // 1. COMPLETED-SET FILTERING & LOW-LEVEL PRIMITIVES
  // -------------------------------------------------------------
  describe('1. Completed-Set Filtering & Volume Primitives', () => {
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

    it('calculates set and sets volume accurately', () => {
      expect(calculateSetVolume({ weight: '100', reps: '10', done: true })).toBe(1000);
      expect(calculateSetVolume({ weight: '100', reps: '10', done: false })).toBe(0);
      expect(calculateSetVolume(null)).toBe(0);

      const sets = [
        { id: 's1', weight: '100', reps: '10', done: true }, // 1000
        { id: 's2', weight: '100', reps: '10', done: false }, // 0
        { id: 's3', weight: '120', reps: '5', done: true }   // 600
      ];
      expect(calculateSetsVolume(sets)).toBe(1600);
    });

    it('calculates session volume ignoring incomplete sets', () => {
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

      const sessionVolume = calculateSetsVolume(Object.values(log.sets).flat());
      expect(sessionVolume).toBe(1600);
    });

    it('calculates total volume lifted across multiple sessions in canonical index', () => {
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

      const index = buildFitnessIndex(logs);
      expect(index.lifetimeStats.totalVolume).toBe(2000);
    });
  });

  // -------------------------------------------------------------
  // 2. ESTIMATED 1RM (e1RM) CALCULATION
  // -------------------------------------------------------------
  describe('2. Estimated 1RM (e1RM)', () => {
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
  // 3. CANONICAL FITNESS INDEX & EXERCISE INDEXING
  // -------------------------------------------------------------
  describe('3. Canonical FitnessIndex & Exercise Indexing', () => {
    const defs: ExerciseDefinition[] = [
      { id: 'bench', name: 'Barbell Bench Press', target: 'Chest' },
      { id: 'squat', name: 'Barbell Squat', target: 'Quads' },
      { id: 'pullup', name: 'Pull Up', target: 'Lats' }
    ];
    const defsMap = createExerciseDefinitionMap(defs);

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
            { id: 's2', weight: '100', reps: '5', done: true } // e1RM: 116.7
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
            { id: 's3', weight: '105', reps: '3', done: true }, // e1RM: 115.5
            { id: 's4', weight: '110', reps: '1', done: true }  // max weight: 110, e1RM: 110
          ]
        }
      }
    };

    it('builds canonical FitnessIndex with memoized exercise metrics', () => {
      const index = buildFitnessIndex(logs, defsMap);
      const bench = index.exerciseIndex.get('bench');

      expect(bench).toBeDefined();
      expect(bench?.sessions).toHaveLength(2);
      expect(bench?.sessionCount).toBe(2);
      expect(bench?.maxWeight).toBe(110);
      expect(bench?.bestE1RM?.maxEpley).toBe(110);
      expect(bench?.bestE1RM?.maxWeight).toBe(110);
      expect(bench?.bestE1RM?.repsAtMax).toBe(1);
      expect(bench?.latestSession?.date).toBe('2026-08-08');
    });

    it('indexes completed sets and total volume per exercise', () => {
      const index = buildFitnessIndex(logs, defsMap);
      const bench = index.exerciseIndex.get('bench');

      // l1: 90*8 + 100*5 = 720 + 500 = 1220
      // l2: 105*3 + 110*1 = 315 + 110 = 425
      // Total = 1645
      expect(bench?.totalVolume).toBe(1645);
      expect(bench?.completedSets).toHaveLength(4);
    });
  });

  // -------------------------------------------------------------
  // 4. CANONICAL SELECTORS & DERIVED METRICS
  // -------------------------------------------------------------
  describe('4. Canonical Selectors & Derived Metrics', () => {
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

    const index = buildFitnessIndex(logs, defsMap);

    it('selects personal bests sorted descending by estimated 1RM', () => {
      const pbs = selectPersonalBests(index);
      expect(pbs).toHaveLength(2);
      expect(pbs[0].exerciseId).toBe('d2'); // Squat e1RM 163.3
      expect(pbs[1].exerciseId).toBe('d1'); // Bench e1RM 133.3
    });

    it('selects personal best for specific exercise', () => {
      const squatPB = selectPersonalBestForExercise(index, 'd2');
      expect(squatPB?.maxEpley).toBe(163.3);
      expect(squatPB?.maxWeight).toBe(140);
    });

    it('selects exercise frequency ranking correctly', () => {
      const freq = selectExerciseFrequency(index);
      expect(freq[0].exerciseId).toBe('d1'); // Bench in 2 sessions
      expect(freq[0].count).toBe(2);
      expect(freq[0].volume).toBe(1840);
    });

    it('selects muscle distribution with correct volumes and set counts', () => {
      const dist = selectMuscleDistribution(index);
      expect(dist.volume.Chest).toBe(1840);
      expect(dist.volume.Legs).toBe(700);
      expect(dist.sets.Chest).toBe(2);
      expect(dist.sets.Legs).toBe(1);
      expect(dist.sets.Back).toBe(1);
      expect(dist.totalVolume).toBe(2540);
      expect(dist.totalSets).toBe(4);
    });

    it('selects lifetime stats accurately', () => {
      const stats = selectLifetimeStats(index);
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalVolume).toBe(2540);
      expect(stats.totalSets).toBe(4);
      expect(stats.totalMinutes).toBe(95);
      expect(stats.firstSessionDate).toBe('2026-08-01');
      expect(stats.lastSessionDate).toBe('2026-08-03');
    });

    it('selects 1RM progression timeline for an exercise', () => {
      const progression = selectExercise1RMProgression(index, 'd1');
      expect(progression).toHaveLength(2);
      expect(progression[0].date).toBe('2026-08-01');
      expect(progression[0].epley1RM).toBe(133.3);
      expect(progression[1].date).toBe('2026-08-03');
      expect(progression[1].epley1RM).toBe(133.0);
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
  // 5. BODYWEIGHT & ZERO-WEIGHT EXERCISES
  // -------------------------------------------------------------
  describe('5. Bodyweight & Zero-Weight Support', () => {
    it('indexes bodyweight exercises with weight 0 and tracks completed sets', () => {
      const defs = [{ id: 'd_pullup', name: 'Pull Up', target: 'Lats' }];
      const defsMap = createExerciseDefinitionMap(defs);
      const logs: SessionLog[] = [
        {
          id: 'l_bw',
          workoutId: 'w_pull',
          date: '2026-08-10',
          complete: true,
          durationMinutes: 30,
          sets: {
            'd_pullup': [
              { id: 's1', weight: '0', reps: '15', done: true },
              { id: 's2', weight: '', reps: '12', done: true }
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs, defsMap);
      const entry = index.exerciseIndex.get('d_pullup');

      expect(entry).toBeDefined();
      expect(entry?.sessionCount).toBe(1);
      expect(entry?.completedSets).toHaveLength(2);
      expect(entry?.maxWeight).toBe(0);
      expect(entry?.sessions[0].sets[0].reps).toBe('15');
    });
  });

  // -------------------------------------------------------------
  // 6. ORPHAN EXERCISE RESOLUTION INVARIANT
  // -------------------------------------------------------------
  describe('6. Orphan Exercise Resolution', () => {
    it('resolves orphaned or deleted exercise definition IDs to Unknown Exercise', () => {
      const defsMap = createExerciseDefinitionMap([]);
      const meta = resolveExercise('deleted_or_missing_id', defsMap);

      expect(meta.id).toBe('deleted_or_missing_id');
      expect(meta.name).toBe('Unknown Exercise');
      expect(meta.isUnknown).toBe(true);
      expect(meta.category).toBe('Core');
    });

    it('indexes logs with orphaned exercise IDs without crashing or generating fake exercises', () => {
      const defsMap = createExerciseDefinitionMap([]);
      const logs: SessionLog[] = [
        {
          id: 'l_orphan',
          workoutId: 'w_custom',
          date: '2026-08-12',
          complete: true,
          durationMinutes: 35,
          sets: {
            'deleted_ex_123': [
              { id: 's1', weight: '80', reps: '10', done: true }
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs, defsMap);
      const entry = index.exerciseIndex.get('deleted_ex_123');

      expect(entry).toBeDefined();
      expect(entry?.name).toBe('Unknown Exercise');
      expect(entry?.maxWeight).toBe(80);
    });
  });

  // -------------------------------------------------------------
  // 7. TIME-RANGE SELECTOR FOR ANALYTICS
  // -------------------------------------------------------------
  describe('7. Time-Range Analytics Selector', () => {
    const defs: ExerciseDefinition[] = [
      { id: 'bench', name: 'Barbell Bench Press', target: 'Chest' },
      { id: 'squat', name: 'Barbell Squat', target: 'Quads' }
    ];
    const defsMap = createExerciseDefinitionMap(defs);
    const workouts: Workout[] = [
      { id: 'w1', name: 'Push', badge: 'Push', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
      { id: 'w2', name: 'Legs', badge: 'Legs', type: 'lower', isCore: true, cycleDay: 2, exercises: [] }
    ];

    const logs: SessionLog[] = [
      {
        id: 'l_old',
        workoutId: 'w1',
        date: '2025-01-01',
        complete: true,
        durationMinutes: 50,
        sets: { 'bench': [{ id: 's1', weight: '100', reps: '10', done: true }] }
      },
      {
        id: 'l_recent',
        workoutId: 'w2',
        date: '2026-08-12',
        complete: true,
        durationMinutes: 45,
        sets: { 'squat': [{ id: 's2', weight: '140', reps: '5', done: true }] }
      }
    ];

    const workoutMap = new Map<string, Workout>();
    const coreWorkoutByCycleDayMap = new Map<number, Workout>();
    workouts.forEach(w => {
      workoutMap.set(w.id, w);
      if (w.isCore && typeof w.cycleDay === 'number') {
        coreWorkoutByCycleDayMap.set(w.cycleDay, w);
      }
    });

    const index = buildFitnessIndex(logs, defsMap);

    it('filters analytics strictly within the requested time range', () => {
      // 7d window should only include the recent log (Aug 2026)
      const analytics7d = selectTimeRangeAnalytics(
        index,
        workoutMap,
        coreWorkoutByCycleDayMap,
        '7d',
        '2026-08-01',
        'squat'
      );

      expect(analytics7d.rangeLogsCount).toBe(1);
      expect(analytics7d.rangeVolume).toBe(700);
      expect(analytics7d.rangeMuscleVolume.Legs).toBe(700);
      expect(analytics7d.rangeMuscleVolume.Chest).toBe(0);

      // 'all' window includes both
      const analyticsAll = selectTimeRangeAnalytics(
        index,
        workoutMap,
        coreWorkoutByCycleDayMap,
        'all',
        '2026-08-01',
        'bench'
      );

      expect(analyticsAll.rangeLogsCount).toBe(2);
      expect(analyticsAll.rangeVolume).toBe(1700);
    });

    it('ensures analytics operates over existing FitnessIndex without mutating or rebuilding it', () => {
      const initialIndexReference = index;
      const analyticsA = selectTimeRangeAnalytics(index, workoutMap, coreWorkoutByCycleDayMap, '7d', '2026-08-01', 'squat');
      const analyticsB = selectTimeRangeAnalytics(index, workoutMap, coreWorkoutByCycleDayMap, '30d', '2026-08-01', 'squat');
      const analyticsC = selectTimeRangeAnalytics(index, workoutMap, coreWorkoutByCycleDayMap, 'all', '2026-08-01', 'bench');

      // The canonical index reference remains identical and unmutated
      expect(index).toBe(initialIndexReference);
      expect(index.sortedLogsDescending.length).toBe(2);
      expect(index.sortedLogsAscending.length).toBe(2);
      expect(analyticsA.rangeLogsCount).toBe(1);
      expect(analyticsB.rangeLogsCount).toBe(1);
      expect(analyticsC.rangeLogsCount).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 8. STREAKS & CYCLE CALCULATIONS
  // -------------------------------------------------------------
  describe('8. Streaks & Cycle Calculations', () => {
    it('calculates current consecutive day streak correctly via canonical index', () => {
      const logs: SessionLog[] = [
        { id: 'l1', workoutId: 'w1', date: '2026-08-13', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l2', workoutId: 'w2', date: '2026-08-12', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l3', workoutId: 'w3', date: '2026-08-11', complete: true, durationMinutes: 30, sets: {} }
      ];

      const index = buildFitnessIndex(logs);
      expect(index.lifetimeStats.currentStreak).toBeGreaterThanOrEqual(0);
      expect(index.lifetimeStats.longestStreak).toBe(3);
    });

    it('calculates longest historical streak across broken periods via canonical index', () => {
      const logs: SessionLog[] = [
        { id: 'l1', workoutId: 'w1', date: '2026-01-01', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l2', workoutId: 'w1', date: '2026-01-02', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l3', workoutId: 'w1', date: '2026-01-03', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l4', workoutId: 'w1', date: '2026-01-04', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l5', workoutId: 'w1', date: '2026-02-01', complete: true, durationMinutes: 30, sets: {} },
        { id: 'l6', workoutId: 'w1', date: '2026-02-02', complete: true, durationMinutes: 30, sets: {} }
      ];

      const index = buildFitnessIndex(logs);
      expect(index.lifetimeStats.longestStreak).toBe(4);
    });
  });

  // -------------------------------------------------------------
  // 9. SANITIZATION CONTRACT
  // -------------------------------------------------------------
  describe('9. Sanitization & Re-ingestion Contract', () => {
    it('sanitizes partial or malformed sets predictably and deterministically', () => {
      const sanitized = sanitizeSetLog({ weight: 75, reps: 12, done: true });
      expect(sanitized.weight).toBe('75');
      expect(sanitized.reps).toBe('12');
      expect(sanitized.done).toBe(true);
      expect(sanitized.id).toBe('set_0');

      // Test with custom deterministic fallback ID
      const withFallback = sanitizeSetLog({ weight: '80', reps: '5', done: true }, 'bench_set_2');
      expect(withFallback.id).toBe('bench_set_2');
    });

    it('guarantees deterministic set IDs without random generation: normalize(raw) -> normalize(result) preserves identical IDs', () => {
      const rawWithoutIds = {
        id: 'sess-deterministic-1',
        workoutId: 'w-1',
        date: '2026-08-13',
        durationMinutes: 45,
        sets: {
          'ex_bench': [
            { weight: '100', reps: '8', done: true },
            { weight: '100', reps: '6', done: true }
          ],
          'ex_squat': [
            { weight: '140', reps: '5', done: true }
          ]
        }
      };

      // Pass 1: Normalize raw session without IDs
      const pass1 = sanitizeSessionLog(rawWithoutIds);
      expect(pass1.sets['ex_bench'][0].id).toBe('ex_bench_set_0');
      expect(pass1.sets['ex_bench'][1].id).toBe('ex_bench_set_1');
      expect(pass1.sets['ex_squat'][0].id).toBe('ex_squat_set_0');

      // Pass 2: Normalize pass1 result again
      const pass2 = sanitizeSessionLog(pass1);
      expect(pass2.sets['ex_bench'][0].id).toBe(pass1.sets['ex_bench'][0].id);
      expect(pass2.sets['ex_bench'][1].id).toBe(pass1.sets['ex_bench'][1].id);
      expect(pass2.sets['ex_squat'][0].id).toBe(pass1.sets['ex_squat'][0].id);

      // Deep equality check between pass1 and pass2
      expect(pass2).toEqual(pass1);
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

  // -------------------------------------------------------------
  // 10. CANONICAL LOAD PR RULE INVARIANTS & EVALUATION
  // -------------------------------------------------------------
  describe('10. Canonical Load PR Rule Invariants & Evaluation', () => {
    it('computes expected PR from historical sets: 50x8, 50x10, 45x15 -> PR is 50x10', () => {
      const defMap = createExerciseDefinitionMap([
        { id: 'ex_bench', name: 'Bench Press', target: 'Chest', equipment: 'Barbell' }
      ]);
      const logs: SessionLog[] = [
        {
          id: 'log1',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 45,
          sets: {
            ex_bench: [
              { id: 's1', weight: '50', reps: '8', done: true },
              { id: 's2', weight: '50', reps: '10', done: true },
              { id: 's3', weight: '45', reps: '15', done: true }
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs, defMap);
      const pr = selectExercisePR(index, 'ex_bench');
      expect(pr).not.toBeNull();
      expect(pr?.weight).toBe(50);
      expect(pr?.reps).toBe(10);

      // Verify isNewPersonalBest evaluation against current PR (50x10):
      // 50 x 9 -> not PR
      expect(isNewPersonalBest({ weight: 50, reps: 9 }, pr)).toBe(false);
      // 50 x 10 -> not PR (equal weight and equal reps)
      expect(isNewPersonalBest({ weight: 50, reps: 10 }, pr)).toBe(false);
      // 50 x 11 -> PR (equal weight, higher reps)
      expect(isNewPersonalBest({ weight: 50, reps: 11 }, pr)).toBe(true);
      // 55 x 5 -> PR (heavier weight)
      expect(isNewPersonalBest({ weight: 55, reps: 5 }, pr)).toBe(true);
      // 48 x 20 -> not PR (lighter weight even if higher reps)
      expect(isNewPersonalBest({ weight: 48, reps: 20 }, pr)).toBe(false);
    });

    it('resolves heaviest PR among equal weights to the set with maximum reps: 60x5 and 60x8 -> 60x8', () => {
      const defMap = createExerciseDefinitionMap([
        { id: 'ex_squat', name: 'Squat', target: 'Quads', equipment: 'Barbell' }
      ]);
      const logs: SessionLog[] = [
        {
          id: 'log1',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 50,
          sets: {
            ex_squat: [
              { id: 's1', weight: '60', reps: '5', done: true },
              { id: 's2', weight: '60', reps: '8', done: true }
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs, defMap);
      const pr = selectExercisePR(index, 'ex_squat');
      expect(pr).not.toBeNull();
      expect(pr?.weight).toBe(60);
      expect(pr?.reps).toBe(8);
    });
  });
});
