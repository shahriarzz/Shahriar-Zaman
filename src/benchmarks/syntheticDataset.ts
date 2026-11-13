import { ExerciseDefinition, Workout, SessionLog, SetLog } from '../types/fitness';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import type { FitnessDatabaseSnapshot } from '../hooks/useFitnessData';

export interface SyntheticBenchmarkDataset {
  defs: ExerciseDefinition[];
  defsMap: Map<string, ExerciseDefinition>;
  workouts: Workout[];
  workoutsMap: Map<string, Workout>;
  coreWorkoutMap: Map<number, Workout>;
  logs: Record<string, SessionLog>;
  snapshot: FitnessDatabaseSnapshot;
  firstDate: string;
  lastDate: string;
  recentRangeStart: string;
  recentRangeEnd: string;
  range90Start: string;
}

/**
 * Deterministic synthetic dataset shared between Vitest benchmarks and regression tests.
 * Generates `logCount` daily completed sessions starting at `2020-01-01` and exposes exact
 * window boundaries derived from the generated date span so 30d/90d/all queries are
 * non-empty across every dataset tier (100, 1000, 5000, 10000).
 */
export function generateSyntheticDataset(logCount: number): SyntheticBenchmarkDataset {
  const defs: ExerciseDefinition[] = [
    { id: 'bench', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'squat', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell' },
    { id: 'deadlift', name: 'Conventional Deadlift', target: 'Back', equipment: 'Barbell' },
    { id: 'ohp', name: 'Overhead Press', target: 'Shoulders', equipment: 'Barbell' },
    { id: 'row', name: 'Barbell Row', target: 'Back', equipment: 'Barbell' },
    { id: 'curl', name: 'Dumbbell Bicep Curl', target: 'Biceps', equipment: 'Dumbbells' },
    { id: 'skullcrusher', name: 'Skull Crusher', target: 'Triceps', equipment: 'Barbell' },
    { id: 'lunge', name: 'Walking Lunge', target: 'Quads', equipment: 'Dumbbells' }
  ];

  const defsMap = createExerciseDefinitionMap(defs);

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

  const workoutsMap = new Map<string, Workout>();
  const coreWorkoutMap = new Map<number, Workout>();
  workouts.forEach(w => {
    workoutsMap.set(w.id, w);
    if (w.isCore && w.cycleDay) coreWorkoutMap.set(w.cycleDay, w);
  });

  const logs: Record<string, SessionLog> = {};
  const baseTimestamp = Date.UTC(2020, 0, 1, 10, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  let firstDate = '2020-01-01';
  let lastDate = '2020-01-01';

  for (let i = 0; i < logCount; i++) {
    const sessionTime = new Date(baseTimestamp + i * dayMs);
    const dateStr = sessionTime.toISOString().split('T')[0];
    if (i === 0) firstDate = dateStr;
    if (i === logCount - 1) lastDate = dateStr;

    const logId = `log_bench_${i}`;
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

  const lastMs = new Date(`${lastDate}T10:00:00Z`).getTime();
  const clampStart = (daysBack: number): string => {
    const candidate = new Date(Math.max(baseTimestamp, lastMs - daysBack * dayMs));
    return candidate.toISOString().split('T')[0];
  };

  const recentRangeStart = clampStart(29);
  const range90Start = clampStart(89);
  const recentRangeEnd = lastDate;

  const snapshot: FitnessDatabaseSnapshot = {
    workouts,
    logs,
    exerciseDefinitions: defs,
    appState: {
      cycleStart: firstDate
    }
  };

  return {
    defs,
    defsMap,
    workouts,
    workoutsMap,
    coreWorkoutMap,
    logs,
    snapshot,
    firstDate,
    lastDate,
    recentRangeStart,
    recentRangeEnd,
    range90Start
  };
}

/**
 * Minimal in-memory Web Storage mock for Node-mode benchmarks of persistFitnessDatabase().
 */
export function createInMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    }
  };
}
