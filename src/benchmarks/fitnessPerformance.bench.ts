import { bench, describe } from 'vitest';
import { ExerciseDefinition, Workout, SessionLog, SetLog } from '../types/fitness';
import {
  buildFitnessIndex,
  selectLifetimeStats,
  selectTimeRangeAnalytics,
  selectMuscleBalanceForRange,
  selectWeightPRs,
  selectE1RMPRs
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { persistFitnessDatabase, FitnessDatabaseSnapshot } from '../hooks/useFitnessData';

function generateSyntheticDataset(logCount: number) {
  const exercises: ExerciseDefinition[] = [
    { id: 'bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' },
    { id: 'deadlift', name: 'Conventional Deadlift', target: 'Back', equipment: 'Barbell' },
    { id: 'ohp', name: 'Overhead Press', target: 'Shoulders', equipment: 'Barbell' },
    { id: 'row', name: 'Barbell Row', target: 'Back', equipment: 'Barbell' },
    { id: 'curl', name: 'Dumbbell Bicep Curl', target: 'Biceps', equipment: 'Dumbbells' },
    { id: 'skullcrusher', name: 'Skull Crusher', target: 'Triceps', equipment: 'Barbell' },
    { id: 'lunge', name: 'Walking Lunge', target: 'Quads', equipment: 'Dumbbells' }
  ];

  const defsMap = createExerciseDefinitionMap(exercises);

  const workouts: Workout[] = [
    {
      id: 'w_push',
      name: 'Push Day',
      badge: 'PUSH',
      type: 'push',
      isCore: true,
      cycleDay: 1,
      exercises: [
        { exerciseDefinitionId: 'bench', sets: 4, reps: '8-10' },
        { exerciseDefinitionId: 'ohp', sets: 3, reps: '8-10' },
        { exerciseDefinitionId: 'skullcrusher', sets: 3, reps: '12-15' }
      ]
    },
    {
      id: 'w_pull',
      name: 'Pull Day',
      badge: 'PULL',
      type: 'pull',
      isCore: true,
      cycleDay: 2,
      exercises: [
        { exerciseDefinitionId: 'deadlift', sets: 3, reps: '5' },
        { exerciseDefinitionId: 'row', sets: 4, reps: '8-10' },
        { exerciseDefinitionId: 'curl', sets: 3, reps: '12' }
      ]
    },
    {
      id: 'w_legs',
      name: 'Leg Day',
      badge: 'LEGS',
      type: 'lower',
      isCore: true,
      cycleDay: 3,
      exercises: [
        { exerciseDefinitionId: 'squat', sets: 5, reps: '5' },
        { exerciseDefinitionId: 'lunge', sets: 3, reps: '10' }
      ]
    }
  ];

  const logs: Record<string, SessionLog> = {};
  const baseTimestamp = new Date('2020-01-01T10:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < logCount; i++) {
    const sessionTime = new Date(baseTimestamp + i * dayMs);
    const dateStr = sessionTime.toISOString().split('T')[0];
    const logId = `bench_log_${i}`;
    const workout = workouts[i % workouts.length];

    const sets: Record<string, SetLog[]> = {};
    workout.exercises.forEach(ex => {
      const setList: SetLog[] = [];
      const count = ex.sets || 3;
      for (let s = 1; s <= count; s++) {
        const weight = 60 + (i % 50) * 1.5 + s * 2.5;
        const reps = 5 + (s % 6);
        setList.push({
          id: `set_${ex.exerciseDefinitionId}_${i}_${s}`,
          weight: String(weight),
          reps: String(reps),
          done: true
        });
      }
      sets[ex.exerciseDefinitionId] = setList;
    });

    logs[logId] = {
      id: logId,
      workoutId: workout.id,
      date: dateStr,
      complete: true,
      durationMinutes: 45 + (i % 30),
      sets
    };
  }

  const snapshot: FitnessDatabaseSnapshot = {
    workouts,
    logs,
    exerciseDefinitions: exercises,
    appState: {
      cycleStart: '2020-01-01'
    }
  };

  const workoutsMap = new Map<string, Workout>();
  const coreWorkoutMap = new Map<number, Workout>();
  workouts.forEach(w => {
    workoutsMap.set(w.id, w);
    if (w.isCore && w.cycleDay) coreWorkoutMap.set(w.cycleDay, w);
  });

  return { defs: exercises, defsMap, workouts, workoutsMap, coreWorkoutMap, logs, snapshot };
}

const tiers = [100, 1000, 5000, 10000];
const datasets = new Map<number, ReturnType<typeof generateSyntheticDataset>>();
tiers.forEach(t => datasets.set(t, generateSyntheticDataset(t)));

describe('GAINLOG Synthetic Performance Benchmark Suite', () => {
  tiers.forEach(count => {
    const dataset = datasets.get(count)!;
    const index = buildFitnessIndex(dataset.logs, dataset.defsMap);

    describe(`Tier: ${count} Historical Session Logs`, () => {
      bench(`buildFitnessIndex (${count} logs)`, () => {
        buildFitnessIndex(dataset.logs, dataset.defsMap);
      });

      bench(`selectLifetimeStats (${count} logs)`, () => {
        selectLifetimeStats(index);
      });

      bench(`selectTimeRangeAnalytics 90d (${count} logs)`, () => {
        selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, '90d', '2024-01-01');
      });

      bench(`selectMuscleBalanceForRange 90d (${count} logs)`, () => {
        selectMuscleBalanceForRange(index, '2023-10-01', '2024-01-01');
      });

      bench(`selectWeightPRs (${count} logs)`, () => {
        selectWeightPRs(index);
      });

      bench(`selectE1RMPRs (${count} logs)`, () => {
        selectE1RMPRs(index);
      });

      bench(`JSON.stringify snapshot serialization (${count} logs)`, () => {
        JSON.stringify(dataset.snapshot);
      });
    });
  });
});
