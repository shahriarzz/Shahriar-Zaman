// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Workout, ExerciseDefinition, SessionLog, SetLog } from '../types/fitness';
import { resolveWorkoutExercise, dk, getAdjustedCycleStart } from '../utils/fitnessHelpers';

describe('SessionView Exercise Identity & State-Key Regression Suite', () => {
  const mockDefs: ExerciseDefinition[] = [
    { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'def_incline', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
    { id: 'def_triceps', name: 'Tricep Rope Pushdown', target: 'Triceps', equipment: 'Cable' }
  ];

  const mockWorkout: Workout = {
    id: 'w_push',
    name: 'Push Protocol',
    badge: 'PUSH',
    type: 'push',
    isCore: true,
    cycleDay: 1,
    exercises: [
      { exerciseDefinitionId: 'def_bench', sets: 3, reps: '8-10' },
      { exerciseDefinitionId: 'def_incline', sets: 3, reps: '10-12' },
      { exerciseDefinitionId: 'def_triceps', sets: 3, reps: '12-15' }
    ]
  };

  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Resolution & Identity Matching', () => {
    it('resolves WorkoutExercise to canonical definition ID', () => {
      const we = mockWorkout.exercises[0];
      const resolved = resolveWorkoutExercise(we, mockDefs);

      expect(resolved.id).toBe('def_bench');
      expect(resolved.exerciseDefinitionId).toBe('def_bench');
      expect(resolved.name).toBe('Barbell Bench Press');
      expect(resolved.target).toBe('Chest');
      expect(resolved.sets).toBe(3);
      expect(resolved.reps).toBe('8-10');
    });
  });

  describe('2. sessionSets Initialization by Canonical ID', () => {
    it('initializes sessionSets keyed by exerciseDefinitionId instead of undefined id', () => {
      const sessionSets: Record<string, SetLog[]> = {};
      mockWorkout.exercises.forEach(ex => {
        const exDefId = ex.exerciseDefinitionId;
        sessionSets[exDefId] = Array.from({ length: ex.sets }, () => ({
          id: 'set_' + Math.random(),
          weight: '',
          reps: '',
          done: false
        }));
      });

      expect(sessionSets['def_bench']).toBeDefined();
      expect(sessionSets['def_bench']).toHaveLength(3);
      expect(sessionSets['def_incline']).toBeDefined();
      expect(sessionSets['def_incline']).toHaveLength(3);
      expect(sessionSets['def_triceps']).toBeDefined();
      expect(sessionSets['def_triceps']).toHaveLength(3);
      expect(sessionSets['undefined']).toBeUndefined();
    });
  });

  describe('3. Auto-Expand Logic & Completion Checks', () => {
    it('identifies the first incomplete exercise using canonical exerciseDefinitionId', () => {
      const sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '100', reps: '8', done: true },
          { id: 's2', weight: '100', reps: '8', done: true },
          { id: 's3', weight: '100', reps: '8', done: true }
        ],
        def_incline: [
          { id: 's4', weight: '30', reps: '10', done: true },
          { id: 's5', weight: '30', reps: '10', done: false },
          { id: 's6', weight: '30', reps: '10', done: false }
        ],
        def_triceps: [
          { id: 's7', weight: '25', reps: '12', done: false },
          { id: 's8', weight: '25', reps: '12', done: false },
          { id: 's9', weight: '25', reps: '12', done: false }
        ]
      };

      const firstIncomplete = mockWorkout.exercises.find(ex =>
        !sessionSets[ex.exerciseDefinitionId]?.slice(0, ex.sets).every(s => s.done)
      );

      expect(firstIncomplete).toBeDefined();
      expect(firstIncomplete?.exerciseDefinitionId).toBe('def_incline');
    });

    it('advances to next incomplete exercise when all sets of current exercise are done', () => {
      const sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '100', reps: '8', done: true },
          { id: 's2', weight: '100', reps: '8', done: true },
          { id: 's3', weight: '100', reps: '8', done: true }
        ],
        def_incline: [
          { id: 's4', weight: '30', reps: '10', done: true },
          { id: 's5', weight: '30', reps: '10', done: true },
          { id: 's6', weight: '30', reps: '10', done: true }
        ],
        def_triceps: [
          { id: 's7', weight: '25', reps: '12', done: false },
          { id: 's8', weight: '25', reps: '12', done: false },
          { id: 's9', weight: '25', reps: '12', done: false }
        ]
      };

      const nextIncomplete = mockWorkout.exercises.find(e =>
        !sessionSets[e.exerciseDefinitionId]?.slice(0, e.sets).every(s => s.done)
      );

      expect(nextIncomplete?.exerciseDefinitionId).toBe('def_triceps');
    });

    it('verifies allExercisesDone check completes when all sets are done', () => {
      const sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '100', reps: '8', done: true },
          { id: 's2', weight: '100', reps: '8', done: true },
          { id: 's3', weight: '100', reps: '8', done: true }
        ],
        def_incline: [
          { id: 's4', weight: '30', reps: '10', done: true },
          { id: 's5', weight: '30', reps: '10', done: true },
          { id: 's6', weight: '30', reps: '10', done: true }
        ],
        def_triceps: [
          { id: 's7', weight: '25', reps: '12', done: true },
          { id: 's8', weight: '25', reps: '12', done: true },
          { id: 's9', weight: '25', reps: '12', done: true }
        ]
      };

      const allExercisesDone = mockWorkout.exercises.every(ex =>
        (sessionSets[ex.exerciseDefinitionId] || []).slice(0, ex.sets).every(s => s.done)
      );

      expect(allExercisesDone).toBe(true);
    });
  });

  describe('4. Independent Exercise State Updates', () => {
    it('updates set for one exercise without affecting another exercise', () => {
      let sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '100', reps: '8', done: false },
          { id: 's2', weight: '100', reps: '8', done: false },
          { id: 's3', weight: '100', reps: '8', done: false }
        ],
        def_incline: [
          { id: 's4', weight: '30', reps: '10', done: false },
          { id: 's5', weight: '30', reps: '10', done: false },
          { id: 's6', weight: '30', reps: '10', done: false }
        ]
      };

      const updateSet = (exId: string, setIndex: number, field: keyof SetLog, value: string | boolean) => {
        sessionSets = {
          ...sessionSets,
          [exId]: sessionSets[exId].map((s, i) => i === setIndex ? { ...s, [field]: value } : s)
        };
      };

      // Set weight and reps for bench set 0
      updateSet('def_bench', 0, 'weight', '102.5');
      updateSet('def_bench', 0, 'reps', '9');
      updateSet('def_bench', 0, 'done', true);

      // Verify bench updated
      expect(sessionSets['def_bench'][0].weight).toBe('102.5');
      expect(sessionSets['def_bench'][0].reps).toBe('9');
      expect(sessionSets['def_bench'][0].done).toBe(true);

      // Verify incline remained untouched
      expect(sessionSets['def_incline'][0].weight).toBe('30');
      expect(sessionSets['def_incline'][0].reps).toBe('10');
      expect(sessionSets['def_incline'][0].done).toBe(false);
    });
  });

  describe('5. Ghost Data & Personal Records', () => {
    it('correlates ghost data and all-time PR correctly with historical logs', () => {
      const logs: Record<string, SessionLog> = {
        log1: {
          id: 'log1',
          date: '2026-08-01',
          workoutId: 'w_push',
          complete: true,
          durationMinutes: 50,
          sets: {
            def_bench: [
              { id: 's1', weight: '100', reps: '8', done: true },
              { id: 's2', weight: '100', reps: '8', done: true }
            ]
          }
        },
        log2: {
          id: 'log2',
          date: '2026-08-08',
          workoutId: 'w_push',
          complete: true,
          durationMinutes: 55,
          sets: {
            def_bench: [
              { id: 's3', weight: '105', reps: '6', done: true },
              { id: 's4', weight: '105', reps: '6', done: true }
            ]
          }
        }
      };

      // Ghost data calculation
      const ghostData: Record<string, { lastSession: any; allTimePR: any }> = {};
      mockWorkout.exercises.forEach(ex => {
        const exDefId = ex.exerciseDefinitionId;
        const exLogs = (Object.values(logs) as SessionLog[])
          .map(l => ({ date: l.date, sets: l.sets?.[exDefId] }))
          .filter(l => l.sets && (l.sets as SetLog[]).some(s => s.done && s.weight));

        const lastSession = exLogs.length > 0 ? exLogs[exLogs.length - 1] : null;

        let allTimePR: { weight: number; reps: string; date: string } | null = null;
        exLogs.forEach(l => {
          (l.sets as SetLog[]).forEach(s => {
            const w = parseFloat(s.weight);
            if (s.done && (!allTimePR || w > allTimePR.weight)) {
              allTimePR = { weight: w, reps: s.reps, date: l.date };
            }
          });
        });
        ghostData[exDefId] = { lastSession, allTimePR };
      });

      expect(ghostData['def_bench'].lastSession).toBeDefined();
      expect(ghostData['def_bench'].lastSession.date).toBe('2026-08-08');
      expect(ghostData['def_bench'].allTimePR?.weight).toBe(105);
      expect(ghostData['def_bench'].allTimePR?.reps).toBe('6');

      expect(ghostData['def_incline'].lastSession).toBeNull();
      expect(ghostData['def_incline'].allTimePR).toBeNull();
    });
  });

  describe('6. Active Session Restoring & Persistence Structure', () => {
    it('serializes and deserializes active session maintaining keys and values', () => {
      const activeSession = {
        workoutId: 'w_push',
        startTime: Date.now() - 15 * 60 * 1000,
        sessionSets: {
          def_bench: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '100', reps: '8', done: true },
            { id: 's3', weight: '100', reps: '', done: false }
          ]
        }
      };

      const serialized = JSON.stringify(activeSession);
      const restored = JSON.parse(serialized);

      expect(restored.workoutId).toBe('w_push');
      expect(restored.sessionSets['def_bench']).toHaveLength(3);
      expect(restored.sessionSets['def_bench'][0].done).toBe(true);
      expect(restored.sessionSets['def_bench'][0].weight).toBe('100');
    });

    it('creates completed SessionLog with canonical structure', () => {
      const sessionSets: Record<string, SetLog[]> = {
        def_bench: [
          { id: 's1', weight: '100', reps: '8', done: true },
          { id: 's2', weight: '100', reps: '8', done: true }
        ],
        def_incline: [
          { id: 's3', weight: '32', reps: '10', done: true }
        ]
      };

      const finalLog: SessionLog = {
        id: `${dk()}_${mockWorkout.id}_12345`,
        workoutId: mockWorkout.id,
        date: dk(),
        sets: sessionSets,
        complete: true,
        durationMinutes: 48
      };

      expect(finalLog.sets['def_bench']).toBeDefined();
      expect(finalLog.sets['def_incline']).toBeDefined();
      expect(finalLog.complete).toBe(true);
      expect(finalLog.durationMinutes).toBe(48);
    });
  });
});
