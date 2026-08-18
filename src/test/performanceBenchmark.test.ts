// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  ExerciseDefinition,
  Workout,
  SessionLog,
  SetLog,
  CURRENT_SCHEMA_VERSION
} from '../types/fitness';
import {
  buildFitnessIndex,
  selectLifetimeStats,
  selectPersonalBests,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectExercise1RMProgression,
  selectTimeRangeAnalytics
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise
} from '../utils/exerciseResolver';
import {
  calculateE1RM,
  sanitizeSessionLog
} from '../utils/fitnessCalculations';

// Helper to generate N synthetic session logs across multiple exercise definitions
function generateSyntheticDataset(logCount: number): {
  defs: ExerciseDefinition[];
  defsMap: Map<string, ExerciseDefinition>;
  workouts: Workout[];
  workoutsMap: Map<string, Workout>;
  coreWorkoutMap: Map<number, Workout>;
  logs: Record<string, SessionLog>;
} {
  const exercises = [
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

  const workoutsMap = new Map<string, Workout>();
  const coreWorkoutMap = new Map<number, Workout>();
  workouts.forEach(w => {
    workoutsMap.set(w.id, w);
    if (w.isCore && w.cycleDay) coreWorkoutMap.set(w.cycleDay, w);
  });

  const logs: Record<string, SessionLog> = {};
  const baseTimestamp = new Date('2025-01-01T10:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < logCount; i++) {
    const sessionTime = new Date(baseTimestamp + i * dayMs);
    const dateStr = sessionTime.toISOString().split('T')[0];
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

  return { defs: exercises, defsMap, workouts, workoutsMap, coreWorkoutMap, logs };
}

describe('8.1 Real Performance Baselines & Benchmark Suite', () => {
  const benchmarkTiers = [100, 1000, 5000];

  benchmarkTiers.forEach(count => {
    describe(`Benchmark Tier: ${count} Historical Session Logs`, () => {
      const fixture = generateSyntheticDataset(count);

      it(`measures buildFitnessIndex() with ${count} logs`, () => {
        const t0 = performance.now();
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap);
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] buildFitnessIndex (${count} logs): ${durationMs.toFixed(2)} ms`);

        expect(index).toBeDefined();
        expect(index.sortedLogsDescending).toHaveLength(count);
        expect(index.lifetimeStats.totalSessions).toBe(count);
        expect(index.lifetimeStats.totalVolume).toBeGreaterThan(0);
      });

      it(`measures canonical selectors execution with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap);

        const t0 = performance.now();
        const lifetime = selectLifetimeStats(index);
        const pbs = selectPersonalBests(index);
        const muscleDist = selectMuscleDistribution(index);
        const freq = selectExerciseFrequency(index);
        const bench1RM = selectExercise1RMProgression(index, 'bench');
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] Canonical Selectors (${count} logs): ${durationMs.toFixed(2)} ms`);

        expect(lifetime.totalSessions).toBe(count);
        expect(pbs.length).toBeGreaterThan(0);
        expect(muscleDist.totalVolume).toBeGreaterThan(0);
        expect(freq.length).toBeGreaterThan(0);
        expect(bench1RM.length).toBeGreaterThan(0);
      });

      it(`measures Analytics derived data aggregation with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap);

        const t0 = performance.now();
        const analytics30d = selectTimeRangeAnalytics(
          index,
          fixture.workoutsMap,
          fixture.coreWorkoutMap,
          '30d',
          '2025-01-01',
          'bench'
        );
        const analyticsAll = selectTimeRangeAnalytics(
          index,
          fixture.workoutsMap,
          fixture.coreWorkoutMap,
          'all',
          '2025-01-01',
          'bench'
        );
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] Analytics selectTimeRangeAnalytics (${count} logs): ${durationMs.toFixed(2)} ms`);

        expect(analytics30d).toBeDefined();
        expect(analyticsAll).toBeDefined();
      });

      it(`measures History exercise resolution & lookups with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap);

        const t0 = performance.now();
        // Resolve exercises across all available definitions and synthetic keys
        fixture.defs.forEach(d => {
          const resolved = resolveExercise(d.id, fixture.defsMap);
          const meta = index.exerciseMetaById.get(d.id);
          const entry = index.exerciseIndex.get(d.id);
          expect(resolved.name).toBe(d.name);
          expect(meta?.name).toBe(d.name);
          expect(entry).toBeDefined();
        });
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] History Exercise Resolution (${count} logs): ${durationMs.toFixed(2)} ms`);
      });

      it(`measures SessionView active-set mutation simulation (zero historical index rebuild)`, () => {
        // Simulates rapid typing of weight and reps into transient activeSession
        const activeSets: Record<string, SetLog[]> = {
          bench: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '102.5', reps: '6', done: false }
          ]
        };

        const t0 = performance.now();
        for (let i = 0; i < 50; i++) {
          activeSets.bench[1].weight = `${102.5 + i * 0.5}`;
          activeSets.bench[1].reps = `${6 + (i % 3)}`;
        }
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] SessionView Transient Set Mutations (50 edits, ${count} logs): ${durationMs.toFixed(3)} ms`);
        expect(activeSets.bench[1].weight).toBeDefined();
      });
    });
  });
});
