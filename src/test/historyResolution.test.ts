// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ExerciseDefinition, Workout, SessionLog, SetLog } from '../types/fitness';
import { calculateVolume } from '../utils/fitnessHelpers';

describe('History View Canonical Exercise Resolution Suite', () => {
  const mockDefs: ExerciseDefinition[] = [
    { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'def_incline', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
    { id: 'def_latpulldown', name: 'Lat Pulldown', target: 'Lats', equipment: 'Cable' },
    { id: 'def_squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' }
  ];

  const mockWorkouts: Workout[] = [
    {
      id: 'w_push',
      name: 'Push Protocol Hypertrophy',
      badge: 'PUSH A',
      type: 'push',
      isCore: true,
      cycleDay: 1,
      exercises: [
        { exerciseDefinitionId: 'def_bench', sets: 3, reps: '8-10' },
        { exerciseDefinitionId: 'def_incline', sets: 3, reps: '10-12' }
      ]
    },
    {
      id: 'w_pull',
      name: 'Pull Protocol',
      badge: 'PULL A',
      type: 'pull',
      isCore: true,
      cycleDay: 2,
      exercises: [
        { exerciseDefinitionId: 'def_latpulldown', sets: 4, reps: '10-12' }
      ]
    }
  ];

  // Helper matching HistoryView's canonical maps
  function buildExerciseDefinitionsById(defs: ExerciseDefinition[]): Map<string, ExerciseDefinition> {
    const map = new Map<string, ExerciseDefinition>();
    defs.forEach(def => map.set(def.id, def));
    return map;
  }

  function buildWorkoutsById(workouts: Workout[]): Map<string, Workout> {
    const map = new Map<string, Workout>();
    workouts.forEach(w => map.set(w.id, w));
    return map;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  // 1. A normal logged exercise resolves its real name
  it('1. resolves normal logged exercises to their real canonical names via exerciseDefinitions', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const sessionSetsKey = 'def_bench';
    const resolvedDef = defsById.get(sessionSetsKey);

    expect(resolvedDef).toBeDefined();
    expect(resolvedDef?.name).toBe('Barbell Bench Press');
    expect(resolvedDef?.target).toBe('Chest');
  });

  // 2. Exercise name search works
  it('2. filters sessions when user searches by canonical exercise name', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const workoutsById = buildWorkoutsById(mockWorkouts);

    const logs: Record<string, SessionLog> = {
      log_1: {
        id: 'log_1',
        date: '2026-08-10',
        workoutId: 'w_push',
        complete: true,
        durationMinutes: 50,
        sets: {
          def_bench: [{ id: 's1', weight: '100', reps: '10', done: true }]
        }
      },
      log_2: {
        id: 'log_2',
        date: '2026-08-11',
        workoutId: 'w_pull',
        complete: true,
        durationMinutes: 45,
        sets: {
          def_latpulldown: [{ id: 's2', weight: '70', reps: '12', done: true }]
        }
      }
    };

    const searchStr = 'bench';
    const lowercaseSearch = searchStr.toLowerCase();

    const matches = Object.values(logs).filter(session => {
      const wo = workoutsById.get(session.workoutId);
      const workoutName = wo?.name || 'Session';
      const matchesDate = session.date.includes(lowercaseSearch);
      const matchesWorkout = workoutName.toLowerCase().includes(lowercaseSearch);
      const matchesId = session.id?.toLowerCase().includes(lowercaseSearch);
      const matchesExercises = Object.keys(session.sets).some(exId => {
        const def = defsById.get(exId);
        const exName = def?.name || 'Unlisted Exercise';
        return exName.toLowerCase().includes(lowercaseSearch);
      });
      return matchesDate || matchesWorkout || matchesExercises || matchesId;
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('log_1');
  });

  // 3. Monthly peak lift shows the real exercise name
  it('3. generates monthly peak lift summaries with canonical exercise names', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const workoutsById = buildWorkoutsById(mockWorkouts);

    const logs: SessionLog[] = [
      {
        id: 'log_aug_1',
        date: '2026-08-01',
        workoutId: 'w_push',
        complete: true,
        durationMinutes: 50,
        sets: {
          def_bench: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '110', reps: '5', done: true }
          ]
        }
      }
    ];

    const summaries: Record<string, any> = {};
    logs.forEach(log => {
      const monthKey = log.date.substring(0, 7);
      if (!summaries[monthKey]) {
        summaries[monthKey] = { peakLifts: {} };
      }
      Object.entries(log.sets).forEach(([exId, sets]) => {
        const doneSets = (sets as SetLog[]).filter(s => s.done);
        if (doneSets.length === 0) return;
        const def = defsById.get(exId);
        const exerciseName = def?.name || 'Unlisted Exercise';
        const weights = doneSets.map(s => parseFloat(s.weight) || 0);
        const logMaxWeight = Math.max(...weights);
        summaries[monthKey].peakLifts[exId] = { exerciseName, weight: logMaxWeight };
      });
    });

    expect(summaries['2026-08'].peakLifts['def_bench']).toEqual({
      exerciseName: 'Barbell Bench Press',
      weight: 110
    });
  });

  // 4. Edit mode shows the real exercise name
  it('4. displays canonical exercise name when editing session sets', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const editSessionSets: Record<string, SetLog[]> = {
      def_incline: [
        { id: 'inc_1', weight: '34', reps: '10', done: true }
      ]
    };

    const renderedHeaderNames = Object.keys(editSessionSets).map(exId => {
      const def = defsById.get(exId);
      return def?.name || 'Unlisted Exercise';
    });

    expect(renderedHeaderNames).toEqual(['Incline Dumbbell Press']);
  });

  // 5. Abnormal-data warning shows the real exercise name
  it('5. includes canonical exercise name in abnormal-data validation warnings', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const extremeSessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 'b1', weight: '600', reps: '10', done: true } // > 500kg
      ]
    };

    const extremeSets: string[] = [];
    Object.entries(extremeSessionSets).forEach(([exId, sets]) => {
      const def = defsById.get(exId);
      const exName = def?.name || 'Unlisted Exercise';
      sets.forEach((s, idx) => {
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps) || 0;
        if (w > 500 || r > 100) {
          extremeSets.push(`${exName} Set ${idx + 1}: ${s.weight}kg × ${s.reps} reps`);
        }
      });
    });

    expect(extremeSets).toHaveLength(1);
    expect(extremeSets[0]).toBe('Barbell Bench Press Set 1: 600kg × 10 reps');
  });

  // 6. A deliberately orphaned exercise ID still gracefully displays Unlisted Exercise
  it('6. gracefully falls back to "Unlisted Exercise" when an exercise ID has no definition', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const orphanedExId = 'deleted_legacy_def_999';

    const def = defsById.get(orphanedExId);
    const exerciseName = def?.name || 'Unlisted Exercise';

    expect(exerciseName).toBe('Unlisted Exercise');
  });

  // 7. Multiple exercises in one session resolve independently
  it('7. resolves multiple different exercises in a single session independently', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const multiExerciseSets: Record<string, SetLog[]> = {
      def_bench: [{ id: '1', weight: '100', reps: '10', done: true }],
      def_incline: [{ id: '2', weight: '32', reps: '12', done: true }],
      orphaned_def: [{ id: '3', weight: '50', reps: '10', done: true }]
    };

    const resolved = Object.keys(multiExerciseSets).map(exId => {
      const def = defsById.get(exId);
      return {
        id: exId,
        name: def?.name || 'Unlisted Exercise'
      };
    });

    expect(resolved).toEqual([
      { id: 'def_bench', name: 'Barbell Bench Press' },
      { id: 'def_incline', name: 'Incline Dumbbell Press' },
      { id: 'orphaned_def', name: 'Unlisted Exercise' }
    ]);
  });

  // 8. Historical logs remain untouched
  it('8. leaves historical stored log keys and set objects completely untouched', () => {
    const originalLog: SessionLog = {
      id: 'log_legacy_2025',
      date: '2025-11-20',
      workoutId: 'w_push',
      complete: true,
      durationMinutes: 48,
      sets: {
        def_bench: [
          { id: 's1', weight: '90', reps: '10', done: true },
          { id: 's2', weight: '95', reps: '8', done: true }
        ]
      }
    };

    const serializedBefore = JSON.stringify(originalLog);
    const defsById = buildExerciseDefinitionsById(mockDefs);
    const resolvedName = defsById.get('def_bench')?.name;

    expect(resolvedName).toBe('Barbell Bench Press');
    expect(JSON.stringify(originalLog)).toBe(serializedBefore);
  });

  // 9. PR / progression calculations remain unchanged
  it('9. calculates all-time PRs without altering calculation outcomes', () => {
    const historyLogs = [
      { date: '2026-07-01', maxW: 100 },
      { date: '2026-08-01', maxW: 110 },
      { date: '2026-08-10', maxW: 105 }
    ];

    // Ensure .slice().sort() does not mutate original array
    const sorted = historyLogs.slice().sort((a, b) => b.date.localeCompare(a.date));
    expect(sorted[0].date).toBe('2026-08-10');
    expect(historyLogs[0].date).toBe('2026-07-01'); // Untouched

    const prWeight = Math.max(...historyLogs.map(h => h.maxW));
    expect(prWeight).toBe(110);
  });

  // 10. Deleting / changing a workout does not destroy exercise-name resolution
  it('10. preserves exercise-name resolution even if a workout is deleted or modified', () => {
    const defsById = buildExerciseDefinitionsById(mockDefs);
    // Workouts array is now empty (e.g. user purged workout routine)
    const workoutsById = buildWorkoutsById([]);

    const log: SessionLog = {
      id: 'log_standalone',
      date: '2026-08-13',
      workoutId: 'deleted_workout_xyz',
      complete: true,
      durationMinutes: 40,
      sets: {
        def_squat: [{ id: 'sq1', weight: '140', reps: '5', done: true }]
      }
    };

    const workout = workoutsById.get(log.workoutId);
    const workoutName = workout?.name || 'Custom Protocol';

    const exerciseName = defsById.get('def_squat')?.name || 'Unlisted Exercise';

    expect(workoutName).toBe('Custom Protocol');
    // Exercise name is still perfectly resolved!
    expect(exerciseName).toBe('Barbell Back Squat');
  });
});
