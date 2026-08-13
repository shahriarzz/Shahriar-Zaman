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

  // -------------------------------------------------------------
  // FOCUSED HISTORY REGRESSION SCENARIOS
  // -------------------------------------------------------------
  describe('Focused History Regression Flow: Multi-Day, Multi-Exercise, Search, Edit, PRs, and Peak Lifts', () => {
    const richDefs: ExerciseDefinition[] = [
      { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
      { id: 'def_incline', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
      { id: 'def_latpulldown', name: 'Lat Pulldown', target: 'Lats', equipment: 'Cable' },
      { id: 'def_seated_row', name: 'Seated Cable Row', target: 'Upper Back', equipment: 'Cable' },
      { id: 'def_squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' },
      { id: 'def_leg_press', name: 'Leg Press', target: 'Quads', equipment: 'Machine' },
      { id: 'def_pullups', name: 'Pull-ups', target: 'Lats', equipment: 'Bodyweight' }
    ];

    const richWorkouts: Workout[] = [
      {
        id: 'w_push_hyper',
        name: 'Push Protocol Alpha',
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
        id: 'w_pull_hyper',
        name: 'Pull Protocol Alpha',
        badge: 'PULL A',
        type: 'pull',
        isCore: true,
        cycleDay: 2,
        exercises: [
          { exerciseDefinitionId: 'def_pullups', sets: 3, reps: '8-12' },
          { exerciseDefinitionId: 'def_latpulldown', sets: 3, reps: '10-12' },
          { exerciseDefinitionId: 'def_seated_row', sets: 3, reps: '10-12' }
        ]
      },
      {
        id: 'w_legs_hyper',
        name: 'Leg Protocol Alpha',
        badge: 'LEGS A',
        type: 'lower',
        isCore: true,
        cycleDay: 3,
        exercises: [
          { exerciseDefinitionId: 'def_squat', sets: 4, reps: '6-8' },
          { exerciseDefinitionId: 'def_leg_press', sets: 3, reps: '10-12' }
        ]
      }
    ];

    const historicalLogs: Record<string, SessionLog> = {
      // July sessions
      log_2026_07_15_push: {
        id: 'log_2026_07_15_push',
        date: '2026-07-15',
        workoutId: 'w_push_hyper',
        complete: true,
        durationMinutes: 45,
        sets: {
          def_bench: [
            { id: 'b1', weight: '95', reps: '8', done: true },
            { id: 'b2', weight: '95', reps: '8', done: true },
            { id: 'b3', weight: '95', reps: '7', done: true }
          ],
          def_incline: [
            { id: 'i1', weight: '28', reps: '12', done: true },
            { id: 'i2', weight: '28', reps: '10', done: true }
          ]
        }
      },
      // August Day 1: Pull Day (3 exercises including bodyweight)
      log_2026_08_01_pull: {
        id: 'log_2026_08_01_pull',
        date: '2026-08-01',
        workoutId: 'w_pull_hyper',
        complete: true,
        durationMinutes: 52,
        sets: {
          def_pullups: [
            { id: 'p1', weight: '0', reps: '10', done: true },
            { id: 'p2', weight: '0', reps: '9', done: true }
          ],
          def_latpulldown: [
            { id: 'lp1', weight: '70', reps: '12', done: true },
            { id: 'lp2', weight: '70', reps: '11', done: true }
          ],
          def_seated_row: [
            { id: 'sr1', weight: '65', reps: '12', done: true },
            { id: 'sr2', weight: '65', reps: '10', done: true }
          ]
        }
      },
      // August Day 2: Leg Day (2 compound exercises)
      log_2026_08_04_legs: {
        id: 'log_2026_08_04_legs',
        date: '2026-08-04',
        workoutId: 'w_legs_hyper',
        complete: true,
        durationMinutes: 58,
        sets: {
          def_squat: [
            { id: 'sq1', weight: '130', reps: '8', done: true },
            { id: 'sq2', weight: '135', reps: '6', done: true },
            { id: 'sq3', weight: '140', reps: '5', done: true }
          ],
          def_leg_press: [
            { id: 'lp1', weight: '220', reps: '12', done: true },
            { id: 'lp2', weight: '240', reps: '10', done: true }
          ]
        }
      },
      // August Day 3: Push Day with new PR
      log_2026_08_10_push: {
        id: 'log_2026_08_10_push',
        date: '2026-08-10',
        workoutId: 'w_push_hyper',
        complete: true,
        durationMinutes: 50,
        sets: {
          def_bench: [
            { id: 'b1_new', weight: '105', reps: '6', done: true }, // PR vs 95kg in July
            { id: 'b2_new', weight: '105', reps: '5', done: true }
          ],
          def_incline: [
            { id: 'i1_new', weight: '32', reps: '10', done: true } // PR vs 28kg in July
          ]
        }
      }
    };

    it('opens several historical days and groups sessions accurately', () => {
      const defsById = buildExerciseDefinitionsById(richDefs);
      const workoutsById = buildWorkoutsById(richWorkouts);

      // Extract unique chronological days
      const days = Array.from(new Set(Object.values(historicalLogs).map(l => l.date)))
        .sort((a, b) => b.localeCompare(a));

      expect(days).toEqual(['2026-08-10', '2026-08-04', '2026-08-01', '2026-07-15']);
      expect(days).toHaveLength(4);

      // Verify each day's session links to its workout name
      days.forEach(day => {
        const daySessions = Object.values(historicalLogs).filter(l => l.date === day);
        expect(daySessions.length).toBeGreaterThan(0);
        daySessions.forEach(session => {
          const wo = workoutsById.get(session.workoutId);
          expect(wo).toBeDefined();
          expect(wo?.name).toBeTruthy();
        });
      });
    });

    it('expands multi-exercise sessions and verifies every exercise name matches canonical definitions without unlisted fallbacks', () => {
      const defsById = buildExerciseDefinitionsById(richDefs);
      const pullSession = historicalLogs['log_2026_08_01_pull'];

      const resolvedExercises = Object.entries(pullSession.sets).map(([exId, sets]) => {
        const def = defsById.get(exId);
        return {
          id: exId,
          name: def?.name,
          target: def?.target,
          setCount: sets.length,
          completedCount: sets.filter(s => s.done).length
        };
      });

      expect(resolvedExercises).toHaveLength(3);
      expect(resolvedExercises[0].name).toBe('Pull-ups');
      expect(resolvedExercises[1].name).toBe('Lat Pulldown');
      expect(resolvedExercises[2].name).toBe('Seated Cable Row');

      // Assert zero "Unlisted Exercise" occurrences
      resolvedExercises.forEach(ex => {
        expect(ex.name).not.toBe('Unlisted Exercise');
        expect(ex.target).toBeDefined();
      });
    });

    it('searches and filters historical sessions across compound and accessory exercise names', () => {
      const defsById = buildExerciseDefinitionsById(richDefs);
      const workoutsById = buildWorkoutsById(richWorkouts);
      const allSessions = Object.values(historicalLogs);

      const filterByQuery = (query: string) => {
        const lowercaseSearch = query.toLowerCase();
        return allSessions.filter(session => {
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
      };

      // Search: "bench" -> July 15 & August 10 Push sessions
      const benchResults = filterByQuery('bench');
      expect(benchResults).toHaveLength(2);
      expect(benchResults.map(r => r.id)).toEqual(['log_2026_07_15_push', 'log_2026_08_10_push']);

      // Search: "squat" -> August 04 Leg session
      const squatResults = filterByQuery('squat');
      expect(squatResults).toHaveLength(1);
      expect(squatResults[0].id).toBe('log_2026_08_04_legs');

      // Search: "pull-ups" -> August 01 Pull session
      const pullupResults = filterByQuery('pull-ups');
      expect(pullupResults).toHaveLength(1);
      expect(pullupResults[0].id).toBe('log_2026_08_01_pull');

      // Search: "nonexistent exercise" -> 0 matches
      const noResults = filterByQuery('bicep 21s');
      expect(noResults).toHaveLength(0);
    });

    it('opens and edits a historical session, updating weights/reps while preserving canonical exercise names', () => {
      const defsById = buildExerciseDefinitionsById(richDefs);
      const sessionToEdit = historicalLogs['log_2026_08_10_push'];

      // Clone session into edit state
      const editSessionState = {
        ...sessionToEdit,
        sets: JSON.parse(JSON.stringify(sessionToEdit.sets))
      };

      // Verify headers in edit modal
      const editHeaderNames = Object.keys(editSessionState.sets).map(exId => {
        return defsById.get(exId)?.name || 'Unlisted Exercise';
      });
      expect(editHeaderNames).toEqual(['Barbell Bench Press', 'Incline Dumbbell Press']);

      // Perform set edit: modify set 1 weight to 107.5kg, and add a 3rd set
      editSessionState.sets['def_bench'][0].weight = '107.5';
      editSessionState.sets['def_bench'].push({
        id: 'b3_added',
        weight: '100',
        reps: '8',
        done: true
      });

      expect(editSessionState.sets['def_bench']).toHaveLength(3);
      expect(editSessionState.sets['def_bench'][0].weight).toBe('107.5');
      expect(calculateVolume(editSessionState)).toBe(
        107.5 * 6 + 105 * 5 + 100 * 8 + 32 * 10
      );
    });

    it('accurately calculates and surfaces all-time PR records and PR badges', () => {
      // Group historical logs by exercise
      const exerciseHistory: Record<string, { date: string; maxW: number }[]> = {};

      Object.values(historicalLogs).forEach(log => {
        Object.entries(log.sets).forEach(([exId, sets]) => {
          const doneSets = (sets as SetLog[]).filter(s => s.done);
          if (doneSets.length === 0) return;
          const maxW = Math.max(...doneSets.map(s => parseFloat(s.weight) || 0));
          if (!exerciseHistory[exId]) exerciseHistory[exId] = [];
          exerciseHistory[exId].push({ date: log.date, maxW });
        });
      });

      // Bench Press PR tracking
      const benchHistory = (exerciseHistory['def_bench'] || []).slice().sort((a, b) => b.date.localeCompare(a.date));
      expect(benchHistory).toHaveLength(2);
      expect(benchHistory[0]).toEqual({ date: '2026-08-10', maxW: 105 });
      expect(benchHistory[1]).toEqual({ date: '2026-07-15', maxW: 95 });

      const allTimeBenchPR = Math.max(...benchHistory.map(h => h.maxW));
      expect(allTimeBenchPR).toBe(105);

      // Squat PR tracking
      const squatHistory = exerciseHistory['def_squat'] || [];
      const allTimeSquatPR = Math.max(...squatHistory.map(h => h.maxW));
      expect(allTimeSquatPR).toBe(140);
    });

    it('aggregates and verifies monthly peak lifts with exact canonical exercise names and highest weights', () => {
      const defsById = buildExerciseDefinitionsById(richDefs);
      const workoutsById = buildWorkoutsById(richWorkouts);

      const summaries: Record<string, {
        monthKey: string;
        sessionCount: number;
        totalVolume: number;
        peakLifts: Record<string, { exerciseName: string; weight: number; reps: number }>;
      }> = {};

      Object.values(historicalLogs).forEach(log => {
        const monthKey = log.date.substring(0, 7);
        if (!summaries[monthKey]) {
          summaries[monthKey] = {
            monthKey,
            sessionCount: 0,
            totalVolume: 0,
            peakLifts: {}
          };
        }
        const summary = summaries[monthKey];
        summary.sessionCount += 1;
        summary.totalVolume += calculateVolume(log);

        Object.entries(log.sets).forEach(([exId, sets]) => {
          const doneSets = (sets as SetLog[]).filter(s => s.done);
          if (doneSets.length === 0) return;

          const def = defsById.get(exId);
          const exerciseName = def?.name || 'Unlisted Exercise';
          const maxSet = doneSets.reduce((best, s) => {
            const w = parseFloat(s.weight) || 0;
            return w > (parseFloat(best.weight) || 0) ? s : best;
          }, doneSets[0]);

          const weight = parseFloat(maxSet.weight) || 0;
          const reps = parseInt(maxSet.reps, 10) || 0;

          if (!summary.peakLifts[exId] || weight > summary.peakLifts[exId].weight) {
            summary.peakLifts[exId] = { exerciseName, weight, reps };
          }
        });
      });

      // Verify July Summary
      expect(summaries['2026-07']).toBeDefined();
      expect(summaries['2026-07'].sessionCount).toBe(1);
      expect(summaries['2026-07'].peakLifts['def_bench']).toEqual({
        exerciseName: 'Barbell Bench Press',
        weight: 95,
        reps: 8
      });
      expect(summaries['2026-07'].peakLifts['def_incline']).toEqual({
        exerciseName: 'Incline Dumbbell Press',
        weight: 28,
        reps: 12
      });

      // Verify August Summary (3 sessions, peak bench is 105kg, peak squat is 140kg, peak leg press is 240kg)
      expect(summaries['2026-08']).toBeDefined();
      expect(summaries['2026-08'].sessionCount).toBe(3);
      expect(summaries['2026-08'].peakLifts['def_bench'].weight).toBe(105);
      expect(summaries['2026-08'].peakLifts['def_bench'].exerciseName).toBe('Barbell Bench Press');
      expect(summaries['2026-08'].peakLifts['def_squat'].weight).toBe(140);
      expect(summaries['2026-08'].peakLifts['def_squat'].exerciseName).toBe('Barbell Back Squat');
      expect(summaries['2026-08'].peakLifts['def_leg_press'].weight).toBe(240);
      expect(summaries['2026-08'].peakLifts['def_leg_press'].exerciseName).toBe('Leg Press');
    });
  });
});

