// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Workout, ExerciseDefinition, SetLog, SessionLog } from '../types/fitness';
import { calculateSessionPRs, SessionPR } from '../components/SessionView';
import { WeightPRRecord, E1RMPRRecord, buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { calculateE1RM, sanitizeSessionLog } from '../utils/fitnessCalculations';

describe('Session Summary PR Pre-Persistence Detection Regression Suite', () => {
  const mockDefs: ExerciseDefinition[] = [
    { id: 'def_bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'def_incline', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
    { id: 'def_squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' }
  ];

  const defsMap = createExerciseDefinitionMap(mockDefs);

  const mockWorkout: Workout = {
    id: 'w_push',
    name: 'Push Routine',
    badge: 'PUSH',
    type: 'push',
    isCore: true,
    cycleDay: 1,
    exercises: [
      { exerciseDefinitionId: 'def_bench', sets: 3, reps: '8-10' },
      { exerciseDefinitionId: 'def_incline', sets: 3, reps: '10-12' }
    ]
  };

  it('1. New exercise + completed set -> Session Summary shows "1 PR" (baseline established)', () => {
    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '80', reps: '10', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '10' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: () => null,
      getE1RMPRForExercise: () => null
    });

    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      exerciseDefinitionId: 'def_bench',
      name: 'Barbell Bench Press',
      weight: 80,
      reps: '10',
      isNew: true,
      isWeightPR: true
    });
  });

  it('2. Higher weight than previous PR -> shows "1 PR"', () => {
    const prevWeightPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 8,
      date: '2026-01-01',
      category: 'Chest'
    };

    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '105', reps: '5', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '5' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: (id) => id === 'def_bench' ? prevWeightPR : null,
      getE1RMPRForExercise: () => ({
        exerciseDefinitionId: 'def_bench',
        exerciseName: 'Barbell Bench Press',
        maxEpley: 126.7,
        weight: 100,
        reps: 8,
        date: '2026-01-01',
        setDetail: '100kg × 8 reps',
        category: 'Chest'
      })
    });

    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      exerciseDefinitionId: 'def_bench',
      name: 'Barbell Bench Press',
      weight: 105,
      reps: '5',
      isNew: false,
      isWeightPR: true
    });
  });

  it('3. Same weight + higher reps -> shows "1 PR"', () => {
    const prevWeightPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 8,
      date: '2026-01-01',
      category: 'Chest'
    };

    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '100', reps: '9', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '8' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: (id) => id === 'def_bench' ? prevWeightPR : null,
      getE1RMPRForExercise: () => ({
        exerciseDefinitionId: 'def_bench',
        exerciseName: 'Barbell Bench Press',
        maxEpley: 126.7,
        weight: 100,
        reps: 8,
        date: '2026-01-01',
        setDetail: '100kg × 8 reps',
        category: 'Chest'
      })
    });

    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      exerciseDefinitionId: 'def_bench',
      weight: 100,
      reps: '9',
      isNew: false,
      isWeightPR: true
    });
  });

  it('4. Lower weight -> no PR', () => {
    const prevWeightPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 8,
      date: '2026-01-01',
      category: 'Chest'
    };

    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '90', reps: '8', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '8' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: (id) => id === 'def_bench' ? prevWeightPR : null,
      getE1RMPRForExercise: () => ({
        exerciseDefinitionId: 'def_bench',
        exerciseName: 'Barbell Bench Press',
        maxEpley: 126.7,
        weight: 100,
        reps: 8,
        date: '2026-01-01',
        setDetail: '100kg × 8 reps',
        category: 'Chest'
      })
    });

    expect(prs).toHaveLength(0);
  });

  it('5. Same weight + same reps -> no PR', () => {
    const prevWeightPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 8,
      date: '2026-01-01',
      category: 'Chest'
    };

    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '100', reps: '8', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '8' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: (id) => id === 'def_bench' ? prevWeightPR : null,
      getE1RMPRForExercise: () => ({
        exerciseDefinitionId: 'def_bench',
        exerciseName: 'Barbell Bench Press',
        maxEpley: 126.7,
        weight: 100,
        reps: 8,
        date: '2026-01-01',
        setDetail: '100kg × 8 reps',
        category: 'Chest'
      })
    });

    expect(prs).toHaveLength(0);
  });

  it('6. A set that establishes both weight PR + e1RM PR -> counts as exactly "1 PR"', () => {
    const prevWeightPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 5,
      date: '2026-01-01',
      category: 'Chest'
    };

    // 110kg x 8 is both higher weight (110 > 100) and higher e1RM (110*1.267 = 139.3 > 100*1.167 = 116.7)
    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '110', reps: '8', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '8' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: (id) => id === 'def_bench' ? prevWeightPR : null,
      getE1RMPRForExercise: () => ({
        exerciseDefinitionId: 'def_bench',
        exerciseName: 'Barbell Bench Press',
        maxEpley: 116.7,
        weight: 100,
        reps: 5,
        date: '2026-01-01',
        setDetail: '100kg × 5 reps',
        category: 'Chest'
      })
    });

    expect(prs).toHaveLength(1);
    expect(prs[0].isWeightPR).toBe(true);
    expect(prs[0].isE1RMPR).toBe(true);
  });

  it('7. After addLog() updates the canonical index, the previously detected PR snapshot still remains visible in Session Summary', () => {
    // Initial historical state with a prior PR of 100kg x 8
    const historicalLogs: SessionLog[] = [
      {
        id: 'log_prev',
        workoutId: 'w_push',
        date: '2026-01-01',
        durationMinutes: 45,
        complete: true,
        sets: {
          def_bench: [{ id: 's_hist', weight: '100', reps: '8', done: true }]
        }
      }
    ];

    // Build pre-session canonical index
    const preSessionIndex = buildFitnessIndex(historicalLogs, defsMap);
    const getPreSessionWeightPR = (id: string) => preSessionIndex.weightPRsMap.get(id) || null;
    const getPreSessionE1RMPR = (id: string) => preSessionIndex.e1RMPRsMap.get(id) || null;

    // Today's workout achieves 105kg x 8
    const todaySets: Record<string, SetLog[]> = {
      def_bench: [{ id: 's_today', weight: '105', reps: '8', done: true }]
    };

    // STEP A: Snapshot PRs BEFORE persistence
    const snapshotPRs: SessionPR[] = calculateSessionPRs({
      workout: mockWorkout,
      sessionSets: todaySets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: getPreSessionWeightPR,
      getE1RMPRForExercise: getPreSessionE1RMPR
    });

    expect(snapshotPRs).toHaveLength(1);
    expect(snapshotPRs[0].weight).toBe(105);

    // STEP B: Persist today's workout into logs and rebuild the canonical index
    const todayLog: SessionLog = sanitizeSessionLog({
      id: 'log_today',
      workoutId: 'w_push',
      date: '2026-01-02',
      durationMinutes: 45,
      complete: true,
      sets: todaySets
    });
    const updatedLogs = [...historicalLogs, todayLog];
    const postSessionIndex = buildFitnessIndex(updatedLogs, defsMap);

    // Demonstrate the root-cause bug that was fixed:
    // If PRs were calculated AFTER addLog() against postSessionIndex, getWeightPRForExercise returns 105kg x 8,
    // which compares today's performance against itself and erroneously finds 0 PRs!
    const postSessionWeightPR = (id: string) => postSessionIndex.weightPRsMap.get(id) || null;
    const postSessionE1RMPR = (id: string) => postSessionIndex.e1RMPRsMap.get(id) || null;
    const recalculatedPRs = calculateSessionPRs({
      workout: mockWorkout,
      sessionSets: todaySets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: postSessionWeightPR,
      getE1RMPRForExercise: postSessionE1RMPR
    });
    expect(recalculatedPRs).toHaveLength(0); // This confirms the exact bug described by the user!

    // But our preserved snapshotPRs remains intact for Session Summary:
    expect(snapshotPRs).toHaveLength(1);
    expect(snapshotPRs[0].name).toBe('Barbell Bench Press');
    expect(snapshotPRs[0].weight).toBe(105);
    expect(snapshotPRs[0].isNew).toBe(false);
  });

  it('8. Multiple exercises setting PRs -> correct plural count and detailed list', () => {
    const prevBenchPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 8,
      date: '2026-01-01',
      category: 'Chest'
    };
    const prevInclinePR: WeightPRRecord = {
      exerciseDefinitionId: 'def_incline',
      exerciseName: 'Incline Dumbbell Press',
      weight: 30,
      reps: 10,
      date: '2026-01-01',
      category: 'Chest'
    };

    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '105', reps: '8', done: true }
      ],
      def_incline: [
        { id: 's2', weight: '32', reps: '10', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: mockWorkout,
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: (id) => {
        if (id === 'def_bench') return prevBenchPR;
        if (id === 'def_incline') return prevInclinePR;
        return null;
      },
      getE1RMPRForExercise: (id) => {
        if (id === 'def_bench') {
          return {
            exerciseDefinitionId: 'def_bench',
            exerciseName: 'Barbell Bench Press',
            maxEpley: 126.7,
            weight: 100,
            reps: 8,
            date: '2026-01-01',
            setDetail: '100kg × 8 reps',
            category: 'Chest'
          };
        }
        if (id === 'def_incline') {
          return {
            exerciseDefinitionId: 'def_incline',
            exerciseName: 'Incline Dumbbell Press',
            maxEpley: 40,
            weight: 30,
            reps: 10,
            date: '2026-01-01',
            setDetail: '30kg × 10 reps',
            category: 'Chest'
          };
        }
        return null;
      }
    });

    expect(prs).toHaveLength(2);
    expect(prs[0].name).toBe('Barbell Bench Press');
    expect(prs[0].weight).toBe(105);
    expect(prs[1].name).toBe('Incline Dumbbell Press');
    expect(prs[1].weight).toBe(32);
  });

  it('9. No PR -> neither PR acknowledgement nor PR detail card is rendered (0 PRs)', () => {
    const prevBenchPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 8,
      date: '2026-01-01',
      category: 'Chest'
    };

    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '90', reps: '8', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: mockWorkout,
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: () => prevBenchPR,
      getE1RMPRForExercise: () => ({
        exerciseDefinitionId: 'def_bench',
        exerciseName: 'Barbell Bench Press',
        maxEpley: 126.7,
        weight: 100,
        reps: 8,
        date: '2026-01-01',
        setDetail: '100kg × 8 reps',
        category: 'Chest'
      })
    });

    expect(prs).toHaveLength(0);
  });

  it('10. Canonical e1RM PR with lower weight but higher reps establishes 1 PR', () => {
    // Previous PR was 100kg x 1 (e1RM = 100kg)
    const prevWeightPR: WeightPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      weight: 100,
      reps: 1,
      date: '2026-01-01',
      category: 'Chest'
    };
    const prevE1RMPR: E1RMPRRecord = {
      exerciseDefinitionId: 'def_bench',
      exerciseName: 'Barbell Bench Press',
      maxEpley: 100,
      weight: 100,
      reps: 1,
      date: '2026-01-01',
      setDetail: '100kg × 1 reps',
      category: 'Chest'
    };

    // Today: 90kg x 10 reps (e1RM = 90 * (1 + 10/30) = 120kg > 100kg)
    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '90', reps: '10', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 1, reps: '10' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: () => prevWeightPR,
      getE1RMPRForExercise: () => prevE1RMPR
    });

    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      name: 'Barbell Bench Press',
      weight: 90,
      reps: '10',
      isNew: false,
      isWeightPR: false,
      isE1RMPR: true
    });
  });

  it('11. Incomplete sets (done: false) or 0 values are not counted towards PRs', () => {
    const sessionSets: Record<string, SetLog[]> = {
      def_bench: [
        { id: 's1', weight: '150', reps: '10', done: false },
        { id: 's2', weight: '0', reps: '0', done: true }
      ]
    };

    const prs = calculateSessionPRs({
      workout: {
        id: 'w_single',
        name: 'Single Routine',
        badge: 'PUSH',
        type: 'push',
        exercises: [{ exerciseDefinitionId: 'def_bench', sets: 2, reps: '10' }]
      },
      sessionSets,
      exerciseDefinitions: mockDefs,
      getWeightPRForExercise: () => null,
      getE1RMPRForExercise: () => null
    });

    expect(prs).toHaveLength(0);
  });
});
