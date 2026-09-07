// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  calculateSetVolume,
  calculateSetsVolume,
  calculateE1RM,
  getCompletedSets,
  getCycleDay,
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
  selectExerciseWeightPR,
  selectExerciseE1RMPR,
  selectWeightPRs,
  selectE1RMPRs,
  selectHistoryForExercise,
  selectLatestForExercise,
  selectNextCycleDay,
  selectCycleDayForDate,
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
import { canonicalizeWorkoutExercise } from '../utils/fitnessMigration';

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
      expect(bench?.weightPR?.weight).toBe(110);
      expect(bench?.weightPR?.reps).toBe(1);
      expect(bench?.e1RMPR?.maxEpley).toBe(116.7);
      expect(bench?.e1RMPR?.weight).toBe(100);
      expect(bench?.e1RMPR?.reps).toBe(5);
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

    it('selects weight PRs and e1RM PRs correctly', () => {
      const weightPrs = selectWeightPRs(index);
      expect(weightPrs).toHaveLength(2);
      expect(weightPrs[0].exerciseDefinitionId).toBe('d2'); // Squat 140kg
      expect(weightPrs[0].weight).toBe(140);
      expect(weightPrs[1].exerciseDefinitionId).toBe('d1'); // Bench 105kg
      expect(weightPrs[1].weight).toBe(105);

      const e1rmPrs = selectE1RMPRs(index);
      expect(e1rmPrs).toHaveLength(2);
      expect(e1rmPrs[0].exerciseDefinitionId).toBe('d2'); // Squat e1RM 163.3
      expect(e1rmPrs[1].exerciseDefinitionId).toBe('d1'); // Bench e1RM 133.3
    });

    it('selects PRs for specific exercise', () => {
      const squatWeightPR = selectExerciseWeightPR(index, 'd2');
      expect(squatWeightPR?.weight).toBe(140);
      const squatE1RM = selectExerciseE1RMPR(index, 'd2');
      expect(squatE1RM?.maxEpley).toBe(163.3);
    });

    it('selects exercise frequency ranking correctly', () => {
      const freq = selectExerciseFrequency(index);
      expect(freq[0].exerciseDefinitionId).toBe('d1'); // Bench in 2 sessions
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
      expect(meta.category).toBe('Uncategorized');
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
        'squat',
        '2026-08-14'
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
        'bench',
        '2026-08-14'
      );

      expect(analyticsAll.rangeLogsCount).toBe(2);
      expect(analyticsAll.rangeVolume).toBe(1700);
    });

    it('ensures analytics operates over existing FitnessIndex without mutating or rebuilding it', () => {
      const initialIndexReference = index;
      const analyticsA = selectTimeRangeAnalytics(index, workoutMap, coreWorkoutByCycleDayMap, '7d', '2026-08-01', 'squat', '2026-08-14');
      const analyticsB = selectTimeRangeAnalytics(index, workoutMap, coreWorkoutByCycleDayMap, '30d', '2026-08-01', 'squat', '2026-08-14');
      const analyticsC = selectTimeRangeAnalytics(index, workoutMap, coreWorkoutByCycleDayMap, 'all', '2026-08-01', 'bench', '2026-08-14');

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
      const pr = selectExerciseWeightPR(index, 'ex_bench');
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
      const pr = selectExerciseWeightPR(index, 'ex_squat');
      expect(pr).not.toBeNull();
      expect(pr?.weight).toBe(60);
      expect(pr?.reps).toBe(8);
    });

    it('proves Weight PR and Best e1RM cannot overwrite each other (50x5 vs 52.5x1 regression)', () => {
      const defMap = createExerciseDefinitionMap([
        { id: 'ex_press', name: 'Overhead Press', target: 'Shoulders', equipment: 'Barbell' }
      ]);
      const logs: SessionLog[] = [
        {
          id: 'log1',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 40,
          sets: {
            ex_press: [
              { id: 's1', weight: '50', reps: '5', done: true } // e1RM = 50 * (1 + 5/30) = 58.3
            ]
          }
        },
        {
          id: 'log2',
          workoutId: 'w1',
          date: '2026-08-05',
          complete: true,
          durationMinutes: 40,
          sets: {
            ex_press: [
              { id: 's2', weight: '52.5', reps: '1', done: true } // e1RM = 52.5 * (1 + 1/30) = 54.3 (or 52.5 for 1 rep = 52.5)
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs, defMap);
      
      // Weight PR: 52.5 x 1 wins (highest weight)
      const weightPR = selectExerciseWeightPR(index, 'ex_press');
      expect(weightPR?.weight).toBe(52.5);
      expect(weightPR?.reps).toBe(1);

      // Best e1RM: 50 x 5 wins (e1RM = 58.3 > 52.5)
      const e1rmPR = selectExerciseE1RMPR(index, 'ex_press');
      expect(e1rmPR?.maxEpley).toBe(58.3);
      expect(e1rmPR?.weight).toBe(50);
      expect(e1rmPR?.reps).toBe(5);

      // ExerciseIndex entry contains both independently
      const entry = index.exerciseIndex.get('ex_press');
      expect(entry?.maxWeight).toBe(52.5);
      expect(entry?.weightPR?.weight).toBe(52.5);
      expect(entry?.weightPR?.reps).toBe(1);
      expect(entry?.e1RMPR?.maxEpley).toBe(58.3);
      expect(entry?.e1RMPR?.weight).toBe(50);
      expect(entry?.e1RMPR?.reps).toBe(5);
    });

    it('calculates cycle day correctly using canonical selectNextCycleDay and selectCycleDayForDate', () => {
      const workouts: Workout[] = [
        { id: 'w1', name: 'Push', badge: 'Push', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
        { id: 'w2', name: 'Pull', badge: 'Pull', type: 'pull', isCore: true, cycleDay: 2, exercises: [] },
        { id: 'w3', name: 'Legs', badge: 'Legs', type: 'lower', isCore: true, cycleDay: 3, exercises: [] },
        { id: 'w4', name: 'Rest', badge: 'Rest', type: 'rest', isCore: true, cycleDay: 4, exercises: [] }
      ];
      const workoutMap = new Map<string, Workout>();
      workouts.forEach(w => workoutMap.set(w.id, w));

      const logs: SessionLog[] = [
        { id: 'l1', workoutId: 'w1', date: '2026-08-10', complete: true, durationMinutes: 45, sets: {} }
      ];
      const index = buildFitnessIndex(logs);

      // After completed day 1, next cycle day is 2
      const nextDay = selectNextCycleDay(index, workoutMap, '2026-08-01');
      expect(nextDay).toBe(2);

      // Same day should be 2
      const sameDayCycle = selectCycleDayForDate(new Date(), index, workoutMap, '2026-08-01');
      expect(sameDayCycle).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 11. REGRESSION: HISTORY DIRECTION, PR SEPARATION & METRICS
  // -------------------------------------------------------------
  describe('11. Regression Tests for History Direction & Metric Consistency', () => {
    it('proves latest session is newest session and not oldest session', () => {
      const defMap = createExerciseDefinitionMap([
        { id: 'ex_curl', name: 'Bicep Curl', target: 'Biceps', equipment: 'Dumbbell' }
      ]);
      const logs: SessionLog[] = [
        {
          id: 'log_oldest',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 40,
          sets: {
            ex_curl: [{ id: 's1', weight: '12', reps: '10', done: true }]
          }
        },
        {
          id: 'log_middle',
          workoutId: 'w1',
          date: '2026-08-05',
          complete: true,
          durationMinutes: 40,
          sets: {
            ex_curl: [{ id: 's2', weight: '14', reps: '10', done: true }]
          }
        },
        {
          id: 'log_newest',
          workoutId: 'w1',
          date: '2026-08-10',
          complete: true,
          durationMinutes: 40,
          sets: {
            ex_curl: [{ id: 's3', weight: '16', reps: '8', done: true }]
          }
        }
      ];

      const index = buildFitnessIndex(logs, defMap);
      const entry = index.exerciseIndex.get('ex_curl');
      expect(entry).toBeDefined();

      // entry.sessions must be ordered newest -> oldest
      expect(entry?.sessions).toHaveLength(3);
      expect(entry?.sessions[0].date).toBe('2026-08-10');
      expect(entry?.sessions[0].logId).toBe('log_newest');
      expect(entry?.sessions[1].date).toBe('2026-08-05');
      expect(entry?.sessions[2].date).toBe('2026-08-01');
      expect(entry?.sessions[2].logId).toBe('log_oldest');

      // latestSession must equal the newest session (entry.sessions[0]), NOT the oldest
      expect(entry?.latestSession?.date).toBe('2026-08-10');
      expect(entry?.latestSession?.logId).toBe('log_newest');
      expect(entry?.latestSession?.date).not.toBe('2026-08-01');

      // selectExerciseHistory returns newest-first
      const history = selectExerciseHistory(index, 'ex_curl');
      expect(history[0].date).toBe('2026-08-10');
      expect(history[history.length - 1].date).toBe('2026-08-01');
    });

    it('handles empty exercise history safely returning empty array or null', () => {
      const index = buildFitnessIndex([]);
      expect(index.exerciseIndex.get('non_existent')).toBeUndefined();
      expect(selectExerciseHistory(index, 'non_existent')).toEqual([]);
      expect(selectExerciseWeightPR(index, 'non_existent')).toBeNull();
      expect(selectExerciseE1RMPR(index, 'non_existent')).toBeNull();
    });

    it('tracks plannedSetsByDate vs completedSetsByDate independently with incomplete sessions', () => {
      // Completed session: 3 planned, 3 completed
      // Incomplete session: 4 planned, 2 done
      // Combined date: plannedSetsByDate = 7, completedSetsByDate = 3 (only completed sessions count)
      const logs: SessionLog[] = [
        {
          id: 'log_completed',
          workoutId: 'w1',
          date: '2026-08-12',
          complete: true,
          durationMinutes: 45,
          sets: {
            ex1: [
              { id: 's1', weight: '100', reps: '10', done: true },
              { id: 's2', weight: '100', reps: '10', done: true },
              { id: 's3', weight: '100', reps: '10', done: true }
            ]
          }
        },
        {
          id: 'log_incomplete',
          workoutId: 'w2',
          date: '2026-08-12',
          complete: false,
          durationMinutes: 20,
          sets: {
            ex2: [
              { id: 's4', weight: '80', reps: '8', done: true },
              { id: 's5', weight: '80', reps: '8', done: true },
              { id: 's6', weight: '80', reps: '8', done: false },
              { id: 's7', weight: '80', reps: '8', done: false }
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs);
      expect(index.plannedSetsByDate['2026-08-12']).toBe(7);
      expect(index.completedSetsByDate['2026-08-12']).toBe(3);
    });

    it('volumeByDate obeys the completed-session invariant (1,000kg completed vs 10,000kg incomplete)', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_completed',
          workoutId: 'w1',
          date: '2026-08-15',
          complete: true,
          durationMinutes: 50,
          sets: {
            ex1: [{ id: 's1', weight: '100', reps: '10', done: true }] // 1,000 kg
          }
        },
        {
          id: 'log_incomplete',
          workoutId: 'w1',
          date: '2026-08-16',
          complete: false,
          durationMinutes: 30,
          sets: {
            ex1: [{ id: 's2', weight: '1000', reps: '10', done: true }] // 10,000 kg unfinalized
          }
        }
      ];

      const index = buildFitnessIndex(logs);
      expect(index.volumeByDate['2026-08-15']).toBe(1000);
      expect(index.volumeByDate['2026-08-16']).toBeUndefined();
      expect(index.lifetimeStats.totalVolume).toBe(1000);

      const analytics = selectTimeRangeAnalytics(
        index,
        new Map(),
        new Map(),
        'all',
        '2026-08-01',
        'ex1'
      );
      expect(analytics.rangeVolume).toBe(1000);
      expect(analytics.rangeLogsCount).toBe(1);
    });

    it('independently resolves WeightPRRecord vs E1RMPRRecord (100x5 e1RM 116.7 vs 110x1 e1RM 110)', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_rep_pr',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 45,
          sets: {
            ex_bench: [{ id: 's1', weight: '100', reps: '5', done: true }] // 100x5 -> e1RM 116.7
          }
        },
        {
          id: 'log_weight_pr',
          workoutId: 'w1',
          date: '2026-08-10',
          complete: true,
          durationMinutes: 45,
          sets: {
            ex_bench: [{ id: 's2', weight: '110', reps: '1', done: true }] // 110x1 -> e1RM 110
          }
        }
      ];

      const index = buildFitnessIndex(logs);

      // Weight PR must be 110kg x 1
      const weightPR = selectExerciseWeightPR(index, 'ex_bench');
      expect(weightPR).toBeDefined();
      expect(weightPR?.weight).toBe(110);
      expect(weightPR?.reps).toBe(1);
      expect(weightPR?.date).toBe('2026-08-10');

      // Best e1RM PR must be 116.7 from the 100kg x 5 session
      const e1rmPR = selectExerciseE1RMPR(index, 'ex_bench');
      expect(e1rmPR).toBeDefined();
      expect(e1rmPR?.maxEpley).toBe(calculateE1RM(100, 5)); // 116.7
      expect(e1rmPR?.weight).toBe(100);
      expect(e1rmPR?.reps).toBe(5);
      expect(e1rmPR?.date).toBe('2026-08-01');

      // Canonical Map lookups
      expect(index.weightPRsMap.get('ex_bench')?.weight).toBe(110);
      expect(index.e1RMPRsMap.get('ex_bench')?.maxEpley).toBe(calculateE1RM(100, 5));
    });

    it('assigns Uncategorized to orphan/unknown exercises and does not contaminate other muscle groups', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_orphan',
          workoutId: 'w1',
          date: '2026-08-20',
          complete: true,
          durationMinutes: 40,
          sets: {
            unknown_mystery_ex: [{ id: 's1', weight: '50', reps: '10', done: true }] // 500 kg
          }
        }
      ];

      const index = buildFitnessIndex(logs);
      const muscleDist = selectMuscleDistribution(index);
      
      expect(muscleDist.volume.Uncategorized).toBe(500);
      expect(muscleDist.sets.Uncategorized).toBe(1);
      expect(muscleDist.volume.Chest).toBe(0);
      expect(muscleDist.volume.Back).toBe(0);
      expect(muscleDist.volume.Core).toBe(0);
    });

    // -------------------------------------------------------------
    // P1: CANONICAL PR RECORD INTEGRITY & DISAMBIGUATION
    // -------------------------------------------------------------
    it('P1: enforces WeightPRRecord and E1RMPRRecord canonical models, sorting weightPRs by weight rather than maxEpley', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_squat_heavy',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 50,
          sets: {
            // Squat: 140kg x 1 -> e1RM 140
            ex_squat: [{ id: 's1', weight: '140', reps: '1', done: true }],
            // Bench: 100kg x 5 -> e1RM 116.7
            ex_bench: [{ id: 's2', weight: '100', reps: '5', done: true }]
          }
        },
        {
          id: 'log_squat_reps',
          workoutId: 'w1',
          date: '2026-08-05',
          complete: true,
          durationMinutes: 50,
          sets: {
            // Squat: 120kg x 10 -> e1RM 160 (higher e1RM, but lower weight than 140kg)
            ex_squat: [{ id: 's3', weight: '120', reps: '10', done: true }],
            // Bench: 110kg x 1 -> e1RM 110 (higher weight, but lower e1RM than 116.7)
            ex_bench: [{ id: 's4', weight: '110', reps: '1', done: true }]
          }
        }
      ];

      const index = buildFitnessIndex(logs);

      // 1. Weight PRs canonical records
      const weightPRs = selectWeightPRs(index);
      expect(weightPRs).toHaveLength(2);
      // Sorted descending by weight (140kg squat, then 110kg bench)
      expect(weightPRs[0].exerciseDefinitionId).toBe('ex_squat');
      expect(weightPRs[0].weight).toBe(140);
      expect(weightPRs[0].reps).toBe(1);
      expect(weightPRs[1].exerciseDefinitionId).toBe('ex_bench');
      expect(weightPRs[1].weight).toBe(110);
      expect(weightPRs[1].reps).toBe(1);

      // 2. E1RM PRs canonical records
      const e1rmPRs = selectE1RMPRs(index);
      expect(e1rmPRs).toHaveLength(2);
      // Sorted descending by maxEpley (160kg squat, then 116.7kg bench)
      expect(e1rmPRs[0].exerciseDefinitionId).toBe('ex_squat');
      expect(e1rmPRs[0].maxEpley).toBe(160);
      expect(e1rmPRs[0].weight).toBe(120);
      expect(e1rmPRs[0].reps).toBe(10);
      expect(e1rmPRs[1].exerciseDefinitionId).toBe('ex_bench');
      expect(e1rmPRs[1].maxEpley).toBe(calculateE1RM(100, 5));

      // 3. Per-exercise PR selectors
      const squatWeightPR = selectExerciseWeightPR(index, 'ex_squat');
      expect(squatWeightPR?.weight).toBe(140);
      expect(squatWeightPR?.reps).toBe(1);
      const squatE1RMPR = selectExerciseE1RMPR(index, 'ex_squat');
      expect(squatE1RMPR?.maxEpley).toBe(160);
      expect(squatE1RMPR?.weight).toBe(120);
      expect(squatE1RMPR?.reps).toBe(10);
    });

    // -------------------------------------------------------------
    // P2: RUNTIME IDENTITY & WORKOUT CREATION INVARIANT
    // -------------------------------------------------------------
    it('P2: freshly created and resolved runtime workout objects only contain exerciseDefinitionId and not exerciseId', () => {
      const defs: ExerciseDefinition[] = [
        { id: 'def_incline', name: 'Incline Bench Press', target: 'Upper Chest' }
      ];

      // Newly constructed workout exercise
      const runtimeWorkoutExercise = {
        exerciseDefinitionId: 'def_incline',
        sets: 4,
        reps: '8–10',
        rest: '90s',
        note: 'Control eccentric',
        tags: []
      };

      // Assert runtime object does not have legacy exerciseId property
      expect('exerciseId' in runtimeWorkoutExercise).toBe(false);
      expect((runtimeWorkoutExercise as any).exerciseId).toBeUndefined();

      // Resolved workout exercise
      const resolved = resolveWorkoutExercise(runtimeWorkoutExercise, defs);
      expect(resolved.exerciseDefinitionId).toBe('def_incline');
      expect(resolved.name).toBe('Incline Bench Press');
      expect(resolved.target).toBe('Upper Chest');
      expect('exerciseId' in resolved).toBe(false);
    });

    // -------------------------------------------------------------
    // P4: EXERCISE HISTORY ORDERING INVARIANT (NEWEST-FIRST)
    // -------------------------------------------------------------
    it('P4: enforces newest-first history ordering: sessions[0] === latestSession and getHistoryForExercise()[0] === getLatestForExercise()', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_aug_01',
          workoutId: 'w1',
          date: '2026-08-01',
          complete: true,
          durationMinutes: 40,
          sets: {
            def_bench: [{ id: 's1', weight: '80', reps: '10', done: true }]
          }
        },
        {
          id: 'log_aug_10',
          workoutId: 'w1',
          date: '2026-08-10',
          complete: true,
          durationMinutes: 45,
          sets: {
            def_bench: [{ id: 's2', weight: '85', reps: '10', done: true }]
          }
        },
        {
          id: 'log_aug_20',
          workoutId: 'w1',
          date: '2026-08-20',
          complete: true,
          durationMinutes: 50,
          sets: {
            def_bench: [{ id: 's3', weight: '90', reps: '10', done: true }]
          }
        }
      ];

      const index = buildFitnessIndex(logs);
      const entry = index.exerciseIndex.get('def_bench')!;

      expect(entry).toBeDefined();
      expect(entry.sessions).toHaveLength(3);
      // Newest first: 2026-08-20, then 2026-08-10, then 2026-08-01
      expect(entry.sessions[0].date).toBe('2026-08-20');
      expect(entry.sessions[1].date).toBe('2026-08-10');
      expect(entry.sessions[2].date).toBe('2026-08-01');

      // Invariant: sessions[0] === latestSession
      expect(entry.sessions[0]).toBe(entry.latestSession);

      // Invariant: selectHistoryForExercise(index, id)[0] === selectLatestForExercise(index, id)
      const history = selectHistoryForExercise(index, 'def_bench');
      const latest = selectLatestForExercise(index, 'def_bench');
      expect(history[0]).toEqual(latest);
      expect(latest?.date).toBe('2026-08-20');
    });

    // -------------------------------------------------------------
    // P5: PLANNED VS COMPLETED SETS SEMANTICS
    // -------------------------------------------------------------
    it('P5: plannedSetsByDate intentionally preserves programmed sets from incomplete sessions, while completedSetsByDate includes only completed sessions', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_completed',
          workoutId: 'w1',
          date: '2026-08-15',
          complete: true,
          durationMinutes: 45,
          sets: {
            def_bench: [
              { id: 's1', weight: '100', reps: '10', done: true },
              { id: 's2', weight: '100', reps: '10', done: true },
              { id: 's3', weight: '100', reps: '10', done: false }
            ]
          }
        },
        {
          id: 'log_incomplete_planned',
          workoutId: 'w2',
          date: '2026-08-15',
          complete: false,
          durationMinutes: 0,
          sets: {
            def_squat: [
              { id: 's4', weight: '120', reps: '8', done: false },
              { id: 's5', weight: '120', reps: '8', done: false },
              { id: 's6', weight: '120', reps: '8', done: false }
            ]
          }
        }
      ];

      const index = buildFitnessIndex(logs);

      // plannedSetsByDate includes all 3 bench set rows + 3 squat set rows = 6 planned sets
      expect(index.plannedSetsByDate['2026-08-15']).toBe(6);
      // completedSetsByDate only includes the 2 done sets from the completed session
      expect(index.completedSetsByDate['2026-08-15']).toBe(2);
    });

    // -------------------------------------------------------------
    // P6: ANALYTICS-SAFE INDEX COMPREHENSIVE REGRESSION SUITE
    // -------------------------------------------------------------
    it('P6: Analytics-Safe Index fixture: incomplete session contributes zero to all analytics metrics while remaining intact in raw history', () => {
      const defs: ExerciseDefinition[] = [
        { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest' },
        { id: 'def_squat', name: 'Barbell Back Squat', target: 'Legs' }
      ];

      const defsMap = createExerciseDefinitionMap(defs);

      // Session A: Completed session (100kg x 10 done)
      const sessionCompleted: SessionLog = {
        id: 'session_completed_1',
        workoutId: 'w_push',
        date: '2026-08-10',
        complete: true,
        durationMinutes: 45,
        sets: {
          def_bench: [{ id: 's1', weight: '100', reps: '10', done: true }] // 1,000kg vol, e1RM 133.3
        }
      };

      // Session B: Incomplete session (1000kg x 10 done, plus 2x 500kg x 10 squats done)
      const sessionIncomplete: SessionLog = {
        id: 'session_incomplete_2',
        workoutId: 'w_heavy',
        date: '2026-08-11',
        complete: false,
        durationMinutes: 120,
        sets: {
          def_bench: [{ id: 's2', weight: '1000', reps: '10', done: true }], // 10,000kg vol (incomplete!)
          def_squat: [
            { id: 's3', weight: '500', reps: '10', done: true }, // 5,000kg vol
            { id: 's4', weight: '500', reps: '10', done: true }  // 5,000kg vol
          ]
        }
      };

      const index = buildFitnessIndex([sessionCompleted, sessionIncomplete], defsMap);

      // 1. Lifetime volume: exactly 1,000kg (not 21,000kg)
      expect(index.lifetimeStats.totalVolume).toBe(1000);

      // 2. Lifetime sets: exactly 1 set (not 4)
      expect(index.lifetimeStats.totalSets).toBe(1);

      // 3. Duration totals: exactly 45 minutes (not 165 minutes)
      expect(index.lifetimeStats.totalMinutes).toBe(45);

      // 4. Measured sessions count: exactly 1 (not 2)
      expect(index.lifetimeStats.measuredSessionsCount).toBe(1);
      expect(index.lifetimeStats.totalSessions).toBe(1);

      // 5. Volume by date: '2026-08-10' has 1,000kg, '2026-08-11' has 0 / undefined
      expect(index.volumeByDate['2026-08-10']).toBe(1000);
      expect(index.volumeByDate['2026-08-11']).toBeUndefined();

      // 6. Completed sets by date
      expect(index.completedSetsByDate['2026-08-10']).toBe(1);
      expect(index.completedSetsByDate['2026-08-11']).toBeUndefined();

      // 7. Weekly volume: only contains the 1,000kg
      const totalWeeklyVol = Object.values(index.weeklyVolumeMap).reduce((a, b) => a + b, 0);
      expect(totalWeeklyVol).toBe(1000);

      // 8. Volume by exercise: Bench = 1,000kg, Squat = 0 / undefined
      expect(index.volumeByExercise.get('def_bench')).toBe(1000);
      expect(index.volumeByExercise.get('def_squat')).toBeUndefined();

      // 9. Volume by muscle: Chest = 1,000kg, Legs = 0
      expect(index.volumeByMuscle.Chest).toBe(1000);
      expect(index.volumeByMuscle.Legs).toBe(0);

      // 10. Sets by muscle: Chest = 1, Legs = 0
      expect(index.setsByMuscle.Chest).toBe(1);
      expect(index.setsByMuscle.Legs).toBe(0);

      // 11. Exercise frequency: Bench has 1 session, Squat is not in frequency
      expect(index.frequencyByExercise).toHaveLength(1);
      expect(index.frequencyByExercise[0].exerciseDefinitionId).toBe('def_bench');
      expect(index.frequencyByExercise[0].count).toBe(1);

      // 12. Weight PR: Bench is 100kg (NOT 1000kg), Squat has no PR
      const benchWeightPR = selectExerciseWeightPR(index, 'def_bench');
      expect(benchWeightPR?.weight).toBe(100);
      expect(benchWeightPR?.reps).toBe(10);
      expect(selectExerciseWeightPR(index, 'def_squat')).toBeNull();

      // 13. e1RM PR: Bench is 133.3 (NOT 1333.3), Squat has no e1RM PR
      const benchE1RM = selectExerciseE1RMPR(index, 'def_bench');
      expect(benchE1RM?.maxEpley).toBe(calculateE1RM(100, 10)); // 133.3
      expect(selectExerciseE1RMPR(index, 'def_squat')).toBeNull();

      // 14. e1RM history: Bench has exactly 1 progression point, Squat has none
      const benchProgression = index.e1rmHistoryByExercise.get('def_bench') || [];
      expect(benchProgression).toHaveLength(1);
      expect(benchProgression[0].epley1RM).toBe(calculateE1RM(100, 10));
      expect(index.e1rmHistoryByExercise.get('def_squat')).toBeUndefined();

      // 15. Raw / Recovery structures: Incomplete session is preserved completely for session recovery
      expect(index.sortedLogsDescending).toHaveLength(2);
      expect(index.logsByDate.get('2026-08-11')?.[0].id).toBe('session_incomplete_2');
      expect(index.logsByWorkout['w_heavy']?.[0].id).toBe('session_incomplete_2');
    });

    // -------------------------------------------------------------
    // P1: EXPLICIT WEIGHT PR & E1RM PR SEMANTIC REGRESSION (INSTRUCTION 8)
    // -------------------------------------------------------------
    it('P1 (Instruction 8): independent Weight PR (heaviest weight) vs e1RM PR (highest Epley e1RM) with undone set & incomplete session guards', () => {
      // Scenario:
      // Set 1: 100 kg x 5 -> e1RM = 100 * (1 + 5/30) = 116.67
      // Set 2: 110 kg x 1 -> e1RM = 110 * (1 + 1/30) = 113.67
      // Set 3 (undone): 150 kg x 10 -> done: false, must be ignored completely
      const logCompleted: SessionLog = {
        id: 'log_bench_comparison',
        workoutId: 'w_push',
        date: '2026-08-20',
        complete: true,
        durationMinutes: 40,
        sets: {
          def_bench: [
            { id: 's1', weight: '100', reps: '5', done: true },
            { id: 's2', weight: '110', reps: '1', done: true },
            { id: 's3', weight: '150', reps: '10', done: false }
          ],
          def_squat: [
            { id: 's4', weight: '140', reps: '5', done: true }
          ]
        }
      };

      // Incomplete session with higher weight (must NOT generate PRs)
      const logIncomplete: SessionLog = {
        id: 'log_incomplete_high_weight',
        workoutId: 'w_push',
        date: '2026-08-21',
        complete: false,
        durationMinutes: 30,
        sets: {
          def_bench: [
            { id: 's5', weight: '200', reps: '5', done: true }
          ]
        }
      };

      const index = buildFitnessIndex([logCompleted, logIncomplete]);

      // 1. Weight PR: The highest actual successfully performed weight (110 kg x 1, NOT 100 kg x 5, NOT 150 kg undone, NOT 200 kg incomplete)
      const benchWeightPR = selectExerciseWeightPR(index, 'def_bench');
      expect(benchWeightPR).not.toBeNull();
      expect(benchWeightPR?.weight).toBe(110);
      expect(benchWeightPR?.reps).toBe(1);
      expect(benchWeightPR?.date).toBe('2026-08-20');

      // 2. e1RM PR: The set producing the highest calculated Epley estimated 1RM (100 kg x 5 = 116.67, NOT 110 kg x 1)
      const benchE1RMPR = selectExerciseE1RMPR(index, 'def_bench');
      expect(benchE1RMPR).not.toBeNull();
      expect(benchE1RMPR?.weight).toBe(100);
      expect(benchE1RMPR?.reps).toBe(5);
      expect(benchE1RMPR?.maxEpley).toBeCloseTo(calculateE1RM(100, 5), 2);
      expect(benchE1RMPR?.date).toBe('2026-08-20');

      // 3. Different exercises maintain independent PRs
      const squatWeightPR = selectExerciseWeightPR(index, 'def_squat');
      expect(squatWeightPR?.weight).toBe(140);
      expect(squatWeightPR?.reps).toBe(5);
      const squatE1RMPR = selectExerciseE1RMPR(index, 'def_squat');
      expect(squatE1RMPR?.maxEpley).toBeCloseTo(calculateE1RM(140, 5), 2);
    });

    // -------------------------------------------------------------
    // P1: CANONICAL-ID BOUNDARY ISOLATION REGRESSION (INSTRUCTION 15)
    // -------------------------------------------------------------
    it('P1 (Instruction 15): proves exerciseDefinitionId is canonical while legacy exerciseId does not leak into runtime objects', () => {
      // Legacy raw workout exercise with exerciseId
      const legacyRaw = {
        exerciseId: 'legacy_overhead_press',
        sets: 3,
        reps: '8-10',
        rest: '90s',
        note: 'strict form'
      };

      const canonicalExercise = canonicalizeWorkoutExercise(legacyRaw);

      // exerciseDefinitionId must be present and canonical
      expect(canonicalExercise.exerciseDefinitionId).toBe('legacy_overhead_press');
      // exerciseId must NOT leak into the runtime object
      expect('exerciseId' in canonicalExercise).toBe(false);
      expect((canonicalExercise as any).exerciseId).toBeUndefined();

      // Build index and check PRs & Frequency canonical models
      const log: SessionLog = {
        id: 'log_ohp',
        workoutId: 'w_shoulders',
        date: '2026-08-25',
        complete: true,
        durationMinutes: 40,
        sets: {
          legacy_overhead_press: [{ id: 's1', weight: '60', reps: '8', done: true }]
        }
      };

      const index = buildFitnessIndex([log]);
      const weightPR = selectExerciseWeightPR(index, 'legacy_overhead_press');
      expect(weightPR?.exerciseDefinitionId).toBe('legacy_overhead_press');
      expect('exerciseId' in (weightPR as any)).toBe(false);

      const e1rmPR = selectExerciseE1RMPR(index, 'legacy_overhead_press');
      expect(e1rmPR?.exerciseDefinitionId).toBe('legacy_overhead_press');
      expect('exerciseId' in (e1rmPR as any)).toBe(false);

      const freq = selectExerciseFrequency(index);
      expect(freq[0].exerciseDefinitionId).toBe('legacy_overhead_press');
      expect('exerciseId' in (freq[0] as any)).toBe(false);
    });

    // -------------------------------------------------------------
    // P1: INCOMPLETE-SESSION REGRESSION (INSTRUCTION 24)
    // -------------------------------------------------------------
    it('P1 (Instruction 24): completed session (3 sets) vs incomplete session (4 programmed, 2 done) set accounting and analytics isolation', () => {
      const logCompleted: SessionLog = {
        id: 'session_completed_3_sets',
        workoutId: 'w1',
        date: '2026-08-28',
        complete: true,
        durationMinutes: 45,
        sets: {
          def_bench: [
            { id: 'c1', weight: '90', reps: '10', done: true },
            { id: 'c2', weight: '90', reps: '10', done: true },
            { id: 'c3', weight: '90', reps: '10', done: true }
          ]
        }
      };

      const logIncomplete: SessionLog = {
        id: 'session_incomplete_4_sets',
        workoutId: 'w2',
        date: '2026-08-28',
        complete: false,
        durationMinutes: 20,
        sets: {
          def_squat: [
            { id: 'i1', weight: '120', reps: '8', done: true },
            { id: 'i2', weight: '120', reps: '8', done: true },
            { id: 'i3', weight: '120', reps: '8', done: false },
            { id: 'i4', weight: '120', reps: '8', done: false }
          ]
        }
      };

      const index = buildFitnessIndex([logCompleted, logIncomplete]);

      // completedSetsByDate only counts sets from verified completed sessions = 3
      expect(index.completedSetsByDate['2026-08-28']).toBe(3);
      // plannedSetsByDate counts all programmed rows = 3 + 4 = 7
      expect(index.plannedSetsByDate['2026-08-28']).toBe(7);

      // Incomplete session does NOT create PRs
      expect(selectExerciseWeightPR(index, 'def_squat')).toBeNull();
      expect(selectExerciseE1RMPR(index, 'def_squat')).toBeNull();

      // Incomplete session does NOT create e1RM progression
      expect(index.e1rmHistoryByExercise.get('def_squat')).toBeUndefined();

      // Incomplete session does NOT count toward measured completed session analytics
      expect(index.lifetimeStats.totalSessions).toBe(1);
      expect(index.lifetimeStats.totalSets).toBe(3);
      expect(index.lifetimeStats.totalVolume).toBe(90 * 10 * 3);
    });

    // -------------------------------------------------------------
    // P1: THREE-SESSION EXERCISE HISTORY ORDERING (INSTRUCTION 28)
    // -------------------------------------------------------------
    it('P1 (Instruction 28): three-session fixture preserves newest-first ordering (history[0]=new, history[1]=middle, history[2]=old, latest=new)', () => {
      const logs: SessionLog[] = [
        {
          id: 'log_old',
          workoutId: 'w1',
          date: '2026-06-01',
          complete: true,
          durationMinutes: 40,
          sets: {
            def_deadlift: [{ id: 's_old', weight: '140', reps: '5', done: true }]
          }
        },
        {
          id: 'log_middle',
          workoutId: 'w1',
          date: '2026-07-15',
          complete: true,
          durationMinutes: 45,
          sets: {
            def_deadlift: [{ id: 's_mid', weight: '150', reps: '5', done: true }]
          }
        },
        {
          id: 'log_new',
          workoutId: 'w1',
          date: '2026-08-30',
          complete: true,
          durationMinutes: 50,
          sets: {
            def_deadlift: [{ id: 's_new', weight: '160', reps: '5', done: true }]
          }
        }
      ];

      const index = buildFitnessIndex(logs);
      const history = selectExerciseHistory(index, 'def_deadlift');
      const latest = selectLatestForExercise(index, 'def_deadlift');

      expect(history).toHaveLength(3);
      // Invariant: history[0] = new, history[1] = middle, history[2] = old
      expect(history[0].date).toBe('2026-08-30');
      expect(history[1].date).toBe('2026-07-15');
      expect(history[2].date).toBe('2026-06-01');

      // Invariant: latest = new
      expect(latest?.date).toBe('2026-08-30');
      expect(history[0]).toEqual(latest);

      // Verify immutable clone invariant
      const chronological = history.slice().reverse();
      expect(chronological[0].date).toBe('2026-06-01');
      expect(history[0].date).toBe('2026-08-30');
    });
  });
});
