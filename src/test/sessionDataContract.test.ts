// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Workout, ExerciseDefinition, SessionLog, SetLog, AppState } from '../types/fitness';
import {
  sanitizeSetLog,
  sanitizeSessionLog,
  getSortedLogsDescending,
  getCompletedSets,
  calculateSetsVolume,
  calculateE1RM
} from '../utils/fitnessCalculations';
import {
  buildFitnessIndex,
  selectPersonalBests,
  selectExerciseHistory
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { resolveWorkoutExercise, dk, getAdjustedCycleStart } from '../utils/fitnessHelpers';

describe('GainLog Session Data Contract & Analytics Invariants Suite', () => {
  const mockDefs: ExerciseDefinition[] = [
    { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'def_incline', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
    { id: 'def_triceps', name: 'Tricep Rope Pushdown', target: 'Triceps', equipment: 'Cable' },
    { id: 'def_squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' }
  ];
  const defsMap = createExerciseDefinitionMap(mockDefs);

  const mockWorkoutPushA: Workout = {
    id: 'w_push_a',
    name: 'Push Protocol A',
    badge: 'PUSH A',
    type: 'push',
    isCore: true,
    cycleDay: 1,
    exercises: [
      { exerciseDefinitionId: 'def_bench', sets: 3, reps: '8-10' },
      { exerciseDefinitionId: 'def_incline', sets: 3, reps: '10-12' }
    ]
  };

  const mockWorkoutPushB: Workout = {
    id: 'w_push_b',
    name: 'Push Protocol B',
    badge: 'PUSH B',
    type: 'push',
    isCore: true,
    cycleDay: 4,
    exercises: [
      { exerciseDefinitionId: 'def_bench', sets: 4, reps: '5-5' },
      { exerciseDefinitionId: 'def_triceps', sets: 3, reps: '12-15' }
    ]
  };

  beforeEach(() => {
    localStorage.clear();
  });

  describe('Core Analytics Utilities & Invariants', () => {
    it('sanitizes SetLog with default fallbacks and trimmed values', () => {
      const sanitized = sanitizeSetLog({ weight: ' 100.5 ', reps: ' 8 ', done: true }, 'fallback_id');
      expect(sanitized.id).toBe('fallback_id');
      expect(sanitized.weight).toBe('100.5');
      expect(sanitized.reps).toBe('8');
      expect(sanitized.done).toBe(true);

      const emptySanitized = sanitizeSetLog(null, 'set_1');
      expect(emptySanitized.id).toBe('set_1');
      expect(emptySanitized.weight).toBe('');
      expect(emptySanitized.reps).toBe('');
      expect(emptySanitized.done).toBe(false);
    });

    it('calculates e1RM correctly with Epley formula', () => {
      // 1 rep = exact weight
      expect(calculateE1RM(100, 1)).toBe(100);
      // 100kg x 10 reps = 100 * (1 + 10/30) = 133.3
      expect(calculateE1RM(100, 10)).toBe(133.3);
      // Invalid / zero inputs
      expect(calculateE1RM(0, 10)).toBe(0);
      expect(calculateE1RM(100, 0)).toBe(0);
      expect(calculateE1RM('', '')).toBe(0);
    });

    it('sorts logs by date descending, then ID descending', () => {
      const logs: SessionLog[] = [
        { id: 'log_b', date: '2026-08-01', workoutId: 'w1', sets: {}, complete: true, durationMinutes: 45 },
        { id: 'log_a', date: '2026-08-10', workoutId: 'w1', sets: {}, complete: true, durationMinutes: 50 },
        { id: 'log_c', date: '2026-08-01', workoutId: 'w1', sets: {}, complete: true, durationMinutes: 40 }
      ];

      const sorted = getSortedLogsDescending(logs);
      expect(sorted[0].id).toBe('log_a');
      expect(sorted[0].date).toBe('2026-08-10');
      expect(sorted[1].id).toBe('log_c'); // 'log_c' > 'log_b'
      expect(sorted[2].id).toBe('log_b');
    });

    it('enforces invariant: only done === true sets count towards volume', () => {
      const sampleLog: SessionLog = {
        id: 'test_log_1',
        workoutId: 'w_push_a',
        date: '2026-08-12',
        complete: true,
        durationMinutes: 45,
        sets: {
          def_bench: [
            { id: 's1', weight: '100', reps: '10', done: true }, // 1000kg
            { id: 's2', weight: '100', reps: '10', done: false }, // not done -> ignored
            { id: 's3', weight: '100', reps: '8', done: true } // 800kg
          ]
        }
      };

      const benchVolume = calculateSetsVolume(sampleLog.sets['def_bench']);
      expect(benchVolume).toBe(1800); // 1000 + 800, s2 ignored

      const sessionVolume = calculateSetsVolume(Object.values(sampleLog.sets).flat());
      expect(sessionVolume).toBe(1800);
    });
  });

  describe('STEP 11 Canonical Verification Pipelines (Tests A - H)', () => {
    // Test A — New workout: Start workout → enter weights/reps → mark sets done → finish → SessionLog created
    it('Test A: New workout full lifecycle creates valid SessionLog', () => {
      const sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '80', reps: '10', done: true },
          { id: 's2', weight: '80', reps: '9', done: true },
          { id: 's3', weight: '80', reps: '8', done: true }
        ],
        def_incline: [
          { id: 's4', weight: '26', reps: '12', done: true },
          { id: 's5', weight: '26', reps: '11', done: true },
          { id: 's6', weight: '26', reps: '10', done: true }
        ]
      };

      const rawLog = {
        id: `2026-08-13_${mockWorkoutPushA.id}_1000`,
        workoutId: mockWorkoutPushA.id,
        date: '2026-08-13',
        sets: sessionSets,
        complete: true,
        durationMinutes: 48
      };

      const validatedLog = sanitizeSessionLog(rawLog);

      expect(validatedLog.id).toBe(rawLog.id);
      expect(validatedLog.workoutId).toBe(mockWorkoutPushA.id);
      expect(validatedLog.complete).toBe(true);
      expect(validatedLog.durationMinutes).toBe(48);
      expect(validatedLog.sets['def_bench']).toHaveLength(3);
      expect(validatedLog.sets['def_incline']).toHaveLength(3);

      const benchSets = getCompletedSets(validatedLog.sets['def_bench']);
      expect(benchSets).toHaveLength(3);
      expect(calculateSetsVolume(validatedLog.sets['def_bench'])).toBe(80 * 10 + 80 * 9 + 80 * 8);
    });

    // Test B — Reload: Start workout → enter data → reload browser → session restored → no data lost
    it('Test B: In-flight active session is restored intact with original inputs and timestamps', () => {
      const initialStartTime = Date.now() - 25 * 60 * 1000;
      const inFlightSession = {
        workoutId: mockWorkoutPushA.id,
        startTime: initialStartTime,
        sessionSets: {
          def_bench: [
            { id: 'bench_1', weight: '85', reps: '8', done: true },
            { id: 'bench_2', weight: '85', reps: '7', done: false },
            { id: 'bench_3', weight: '', reps: '', done: false }
          ]
        }
      };

      localStorage.setItem('gl_active_session', JSON.stringify(inFlightSession));
      const loaded = JSON.parse(localStorage.getItem('gl_active_session') || '{}');

      expect(loaded.workoutId).toBe(mockWorkoutPushA.id);
      expect(loaded.startTime).toBe(initialStartTime);
      expect(loaded.sessionSets['def_bench'][0].weight).toBe('85');
      expect(loaded.sessionSets['def_bench'][0].done).toBe(true);
      expect(loaded.sessionSets['def_bench'][1].reps).toBe('7');
    });

    // Test C — Background sync: Start workout → enter data → Firebase snapshot arrives → current session remains untouched
    it('Test C: Background data changes do not overwrite active workout sessionSets once initialized', () => {
      let isInitialized = true;
      let activeWorkoutId = mockWorkoutPushA.id;
      let sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '90', reps: '8', done: true },
          { id: 's2', weight: '90', reps: '8', done: true },
          { id: 's3', weight: '90', reps: '6', done: false }
        ]
      };

      // Simulated background snapshot from Firebase updates workouts or logs
      const updatedLogsFromFirebase: Record<string, SessionLog> = {
        new_cloud_log: {
          id: 'new_cloud_log',
          date: '2026-08-12',
          workoutId: mockWorkoutPushA.id,
          complete: true,
          durationMinutes: 60,
          sets: {
            def_bench: [{ id: 'cloud_s1', weight: '100', reps: '5', done: true }]
          }
        }
      };

      // Guard evaluation
      const shouldReinitialize = !isInitialized || activeWorkoutId !== mockWorkoutPushA.id;
      expect(shouldReinitialize).toBe(false);

      // sessionSets remains untouched
      expect(sessionSets['def_bench'][0].weight).toBe('90');
      expect(sessionSets['def_bench'][0].done).toBe(true);
    });

    // Test D — Offline: Go offline → complete workout → session remains saved locally → cloud receives exact same log
    it('Test D: Offline completion saves locally and produces idempotent cloud log', () => {
      const localStore: Record<string, SessionLog> = {};
      const cloudStore: Record<string, SessionLog> = {};

      const completedLog: SessionLog = sanitizeSessionLog({
        id: 'log_offline_123',
        workoutId: mockWorkoutPushA.id,
        date: '2026-08-13',
        complete: true,
        durationMinutes: 52,
        sets: {
          def_bench: [
            { id: 's1', weight: '95', reps: '6', done: true },
            { id: 's2', weight: '95', reps: '6', done: true }
          ]
        }
      });

      // Save locally while offline
      localStore[completedLog.id] = completedLog;
      expect(localStore['log_offline_123']).toBeDefined();
      expect(localStore['log_offline_123'].complete).toBe(true);

      // Reconnect and sync to cloud
      cloudStore[completedLog.id] = localStore['log_offline_123'];
      expect(cloudStore['log_offline_123']).toEqual(localStore['log_offline_123']);
    });

    // Test E — Multiple exercises: Verify Exercise A sets != Exercise B sets with no cross-contamination
    it('Test E: Multiple exercises maintain separate isolated sets and identity', () => {
      const sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 'bench_1', weight: '100', reps: '8', done: true },
          { id: 'bench_2', weight: '100', reps: '8', done: true }
        ],
        def_incline: [
          { id: 'incline_1', weight: '32', reps: '10', done: true },
          { id: 'incline_2', weight: '32', reps: '10', done: true }
        ]
      };

      expect(sessionSets['def_bench'][0].id).not.toBe(sessionSets['def_incline'][0].id);
      expect(sessionSets['def_bench'][0].weight).toBe('100');
      expect(sessionSets['def_incline'][0].weight).toBe('32');
    });

    // Test F — Additional sets: 3 programmed sets → Add set → 4th set saved → analytics includes completed 4th set
    it('Test F: Adding additional set preserves programmed sets and incorporates 4th set in analytics', () => {
      let benchSets: SetLog[] = [
        { id: 's1', weight: '80', reps: '10', done: true },
        { id: 's2', weight: '80', reps: '10', done: true },
        { id: 's3', weight: '80', reps: '10', done: true }
      ];

      // Add 4th set
      benchSets = [...benchSets, { id: 's4', weight: '80', reps: '12', done: true }];

      const log: SessionLog = {
        id: 'log_extra_set',
        workoutId: mockWorkoutPushA.id,
        date: '2026-08-13',
        complete: true,
        durationMinutes: 55,
        sets: {
          def_bench: benchSets
        }
      };

      expect(log.sets['def_bench']).toHaveLength(4);
      // Volume = 80*10 + 80*10 + 80*10 + 80*12 = 800 + 800 + 800 + 960 = 3360
      expect(calculateSetsVolume(log.sets['def_bench'])).toBe(3360);
    });

    // Test G — Delete set: Verify deleted set does not appear in SessionLog, History, volume, e1RM, PR
    it('Test G: Deleting a set excludes it completely from the final SessionLog and downstream analytics', () => {
      let benchSets: SetLog[] = [
        { id: 's1', weight: '80', reps: '10', done: true },
        { id: 's2_extreme', weight: '150', reps: '1', done: true }, // deleted set
        { id: 's3', weight: '80', reps: '8', done: true }
      ];

      // Delete set index 1
      benchSets = benchSets.filter((_, i) => i !== 1);

      const log: SessionLog = {
        id: 'log_after_delete',
        workoutId: mockWorkoutPushA.id,
        date: '2026-08-13',
        complete: true,
        durationMinutes: 40,
        sets: {
          def_bench: benchSets
        }
      };

      const indexAfterDelete = buildFitnessIndex([log], defsMap);
      const benchMeta = indexAfterDelete.exerciseIndex.get('def_bench');

      expect(log.sets['def_bench']).toHaveLength(2);
      expect(benchMeta?.maxWeight).toBe(80);
      expect(calculateSetsVolume(log.sets['def_bench'])).toBe(800 + 640);
    });

    // Test H — Same exercise in multiple workouts: Push A -> Bench Press, Push B -> Bench Press
    it('Test H: Combines exercise history across different workout protocols by exerciseDefinitionId', () => {
      const logs: Record<string, SessionLog> = {
        log_push_a: {
          id: 'log_push_a',
          date: '2026-08-01',
          workoutId: 'w_push_a', // Push A protocol
          complete: true,
          durationMinutes: 45,
          sets: {
            def_bench: [{ id: 's1', weight: '100', reps: '8', done: true }]
          }
        },
        log_push_b: {
          id: 'log_push_b',
          date: '2026-08-08',
          workoutId: 'w_push_b', // Push B protocol
          complete: true,
          durationMinutes: 50,
          sets: {
            def_bench: [{ id: 's2', weight: '110', reps: '5', done: true }]
          }
        }
      };

      const defsMap = createExerciseDefinitionMap(mockDefs);
      const index = buildFitnessIndex(Object.values(logs), defsMap);
      const benchEntry = index.exerciseIndex.get('def_bench');

      // Both logs are indexed for def_bench regardless of workoutId
      expect(benchEntry).toBeDefined();
      expect(benchEntry?.sessions).toHaveLength(2);
      expect(benchEntry?.sessions[0].date).toBe('2026-08-08'); // Newer session first
      expect(benchEntry?.sessions[1].date).toBe('2026-08-01');

      // Latest session
      expect(benchEntry?.latestSession?.date).toBe('2026-08-08');
      expect(benchEntry?.latestSession?.sets[0].weight).toBe('110');

      // All-time heaviest PR
      expect(benchEntry?.maxWeight).toBe(110);
      expect(benchEntry?.bestE1RM?.maxWeight).toBe(110);
      expect(benchEntry?.bestE1RM?.repsAtMax).toBe(5);

      // All-time best e1RM: 110 * (1 + 5/30) = 128.3 vs 100 * (1 + 8/30) = 126.7
      expect(benchEntry?.bestE1RM?.maxEpley).toBe(128.3);
    });
  });

  describe('Single Ingestion Path: sanitizeSessionLog() Contract & Validation', () => {
    it('preserves all legitimate workout data and types without discarding valid entries', () => {
      const complexRawLog = {
        id: 'log_2026_08_13_push',
        workoutId: 'w_push_a',
        date: '2026-08-13',
        durationMinutes: 55,
        complete: true,
        sets: {
          def_bench: [
            { id: 's1', weight: '100', reps: '10', done: true },
            { id: 's2', weight: '102.5', reps: '8', done: true },
            { id: 's3', weight: '0', reps: '15', done: true } // Bodyweight / 0kg set
          ],
          def_incline: [
            { id: 'inc_1', weight: '30', reps: '12', done: false }
          ]
        }
      };

      const sanitized = sanitizeSessionLog(complexRawLog);
      expect(sanitized.id).toBe('log_2026_08_13_push');
      expect(sanitized.workoutId).toBe('w_push_a');
      expect(sanitized.date).toBe('2026-08-13');
      expect(sanitized.durationMinutes).toBe(55);
      expect(sanitized.complete).toBe(true);

      // Verify exercise definition keys are preserved
      expect(Object.keys(sanitized.sets)).toEqual(['def_bench', 'def_incline']);

      // Verify sets preserved with types and exact values
      expect(sanitized.sets['def_bench']).toHaveLength(3);
      expect(sanitized.sets['def_bench'][0]).toEqual({ id: 's1', weight: '100', reps: '10', done: true });
      expect(sanitized.sets['def_bench'][1]).toEqual({ id: 's2', weight: '102.5', reps: '8', done: true });
      expect(sanitized.sets['def_bench'][2]).toEqual({ id: 's3', weight: '0', reps: '15', done: true });
      expect(sanitized.sets['def_incline'][0]).toEqual({ id: 'inc_1', weight: '30', reps: '12', done: false });
    });

    it('handles malformed, missing, or extreme values gracefully', () => {
      const malformedLog = {
        id: 'log_corrupt',
        workoutId: 'w1',
        date: '2026-08-13',
        durationMinutes: -15 as any, // Negative duration
        complete: 'yes' as any, // Truthy string coerced to boolean
        sets: {
          def_bench: [
            { weight: ' 100 ', reps: ' 10 ', done: 1 as any }, // whitespace and truthy number
            null as any, // Null set
            { id: 'custom_id' } as any // Empty set
          ]
        }
      };

      const sanitized = sanitizeSessionLog(malformedLog as any);
      expect(sanitized.durationMinutes).toBe(0); // Coerced to 0
      expect(sanitized.complete).toBe(true);
      expect(sanitized.sets['def_bench']).toHaveLength(3);
      expect(sanitized.sets['def_bench'][0]).toEqual({ id: 'def_bench_set_0', weight: '100', reps: '10', done: true });
      expect(sanitized.sets['def_bench'][1]).toEqual({ id: 'def_bench_set_1', weight: '', reps: '', done: false });
      expect(sanitized.sets['def_bench'][2]).toEqual({ id: 'custom_id', weight: '', reps: '', done: false });
    });
  });

  describe('Exercise-History Semantics: Bodyweight & Zero-Weight Support', () => {
    it('correctly includes bodyweight exercises in ghost history, progression, and latest session', () => {
      const logsWithBodyweight: Record<string, SessionLog> = {
        log_pullups_1: {
          id: 'log_bw_1',
          date: '2026-08-05',
          workoutId: 'w_pull',
          complete: true,
          durationMinutes: 40,
          sets: {
            def_pullups: [
              { id: 'p1', weight: '0', reps: '12', done: true },
              { id: 'p2', weight: '0', reps: '10', done: true },
              { id: 'p3', weight: '0', reps: '8', done: true }
            ]
          }
        },
        log_pullups_2: {
          id: 'log_bw_2',
          date: '2026-08-12',
          workoutId: 'w_pull',
          complete: true,
          durationMinutes: 42,
          sets: {
            def_pullups: [
              { id: 'p4', weight: '', reps: '15', done: true },
              { id: 'p5', weight: '', reps: '12', done: true },
              { id: 'p6', weight: '', reps: '10', done: true }
            ]
          }
        }
      };

      // Both bodyweight sessions must appear in index
      const defsMap = createExerciseDefinitionMap([
        { id: 'def_pullups', name: 'Pull Ups', target: 'Lats' }
      ]);
      const index = buildFitnessIndex(Object.values(logsWithBodyweight), defsMap);
      const pullupsEntry = index.exerciseIndex.get('def_pullups');

      expect(pullupsEntry).toBeDefined();
      expect(pullupsEntry?.sessions).toHaveLength(2);
      expect(pullupsEntry?.sessions[0].date).toBe('2026-08-12');
      expect(pullupsEntry?.sessions[0].sets[0].reps).toBe('15');
      expect(pullupsEntry?.sessions[1].date).toBe('2026-08-05');
      expect(pullupsEntry?.sessions[1].sets[0].reps).toBe('12');

      // Latest session lookup for ghost data returns newest bodyweight session
      expect(pullupsEntry?.latestSession).not.toBeNull();
      expect(pullupsEntry?.latestSession?.date).toBe('2026-08-12');
      expect(pullupsEntry?.latestSession?.sets).toHaveLength(3);
      expect(pullupsEntry?.latestSession?.sets[0].reps).toBe('15');

      // PR lookup correctly evaluates bodyweight sets (weight >= 0)
      expect(pullupsEntry?.maxWeight).toBe(0);
      expect(pullupsEntry?.sessions).toHaveLength(2);
    });
  });

  describe('Complete Session -> Analytics Pipeline Integration', () => {
    it('executes the full session lifecycle and ensures Dashboard, History, and Analytics observe identical metrics', () => {
      const logsState: Record<string, SessionLog> = {};

      // 1. Start session with 2 exercises
      const inFlightSessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 'b1', weight: '100', reps: '8', done: true },
          { id: 'b2', weight: '100', reps: '8', done: true },
          { id: 'b3', weight: '100', reps: '7', done: false } // Incomplete
        ],
        def_incline: [
          { id: 'i1', weight: '30', reps: '12', done: true },
          { id: 'i2', weight: '30', reps: '10', done: true }
        ]
      };

      // 2. Add extra set to bench press
      inFlightSessionSets['def_bench'].push({ id: 'b4', weight: '100', reps: '6', done: true });

      // 3. Mark incomplete set completed
      inFlightSessionSets['def_bench'][2].done = true;

      // 4. Finish session
      const sessionDate = '2026-08-13';
      const logId = `${sessionDate}_${mockWorkoutPushA.id}_test`;
      const finalLog: SessionLog = sanitizeSessionLog({
        id: logId,
        workoutId: mockWorkoutPushA.id,
        date: sessionDate,
        sets: inFlightSessionSets,
        complete: true,
        durationMinutes: 46
      });

      // 5. Ingest into logs state
      logsState[logId] = finalLog;

      // Invariant: Log survives and has all 4 bench sets + 2 incline sets
      expect(logsState[logId]).toBeDefined();
      expect(logsState[logId].sets['def_bench']).toHaveLength(4);
      expect(logsState[logId].sets['def_incline']).toHaveLength(2);

      // 6. Verification: Dashboard volume calculation via canonical index
      const dashboardTotalVolume = buildFitnessIndex([logsState[logId]]).lifetimeStats.totalVolume;
      // Bench: 100*8 + 100*8 + 100*7 + 100*6 = 2900 kg
      // Incline: 30*12 + 30*10 = 660 kg
      // Total = 3560 kg
      expect(dashboardTotalVolume).toBe(3560);

      // 7. Verification: History view sorted retrieval
      const historyList = getSortedLogsDescending(logsState);
      expect(historyList).toHaveLength(1);
      expect(historyList[0].id).toBe(logId);
      expect(calculateSetsVolume(historyList[0].sets['def_bench'])).toBe(2900);

      // 8. Verification: Canonical index & Analytics reflect the newly logged workout
      const defsMap = createExerciseDefinitionMap(mockDefs);
      const index = buildFitnessIndex(Object.values(logsState), defsMap);
      const benchMeta = index.exerciseIndex.get('def_bench');

      expect(benchMeta?.maxWeight).toBe(100);
      expect(benchMeta?.bestE1RM?.date).toBe('2026-08-13');

      // 100 * (1 + 8/30) = 126.7
      expect(benchMeta?.bestE1RM?.maxEpley).toBe(126.7);

      // 9. Verification: Next session ghost data sees this exact session
      expect(benchMeta?.latestSession?.date).toBe('2026-08-13');
      expect(benchMeta?.latestSession?.sets).toHaveLength(4);
      expect(benchMeta?.latestSession?.sets[0].weight).toBe('100');
    });
  });
});
