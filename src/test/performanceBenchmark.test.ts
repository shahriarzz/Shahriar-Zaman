// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { SessionView } from '../components/SessionView';
import { FitnessContext } from '../context/FitnessContext';
import { FitnessDerivedProvider } from '../context/FitnessDerivedContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { ActiveSessionProvider, useActiveSessionMeta } from '../context/ActiveSessionContext';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
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
  selectWeightPRs,
  selectE1RMPRs,
  selectMuscleDistribution,
  selectExerciseFrequency,
  selectExercise1RMProgression,
  selectTimeRangeAnalytics,
  selectMuscleBalanceForRange,
  selectMuscleRecovery
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
  const baseTimestamp = new Date('2010-01-01T10:00:00Z').getTime();
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

        // Verify muscle attribution index structures are populated
        expect(index.muscleStimulusByDate).toBeDefined();
        expect(index.muscleAttributionCoverageByDate).toBeDefined();
        expect(index.lifetimeLastTrainedDateByMuscle).toBeDefined();

        // Regression guard: index build must stay within tightened performance budget
        const budgetMs = count === 5000 ? 1000 : count === 1000 ? 350 : 150;
        expect(durationMs).toBeLessThan(budgetMs);
      });

      it(`measures Muscle Intelligence selectors execution with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap);

        const t0 = performance.now();
        const balance30d = selectMuscleBalanceForRange(index, '2024-12-01', '2025-01-01');
        const balanceAll = selectMuscleBalanceForRange(index, '2010-01-01', '2025-01-01');
        const recovery = selectMuscleRecovery(index, '2025-01-01');
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] Muscle Intelligence Selectors (${count} logs): ${durationMs.toFixed(2)} ms`);

        expect(balance30d.groups).toHaveLength(6);
        expect(balance30d.allGroups).toHaveLength(15);
        expect(balanceAll.allGroups).toHaveLength(15);
        expect(recovery.items).toHaveLength(15);

        // Pure selector pass budget: ensures no O(N^2) regressions
        const budgetMs = count === 5000 ? 60 : count === 1000 ? 30 : 20;
        expect(durationMs).toBeLessThan(budgetMs);
      });

      it(`measures canonical selectors execution with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap);

        const t0 = performance.now();
        const lifetime = selectLifetimeStats(index);
        const weightPRs = selectWeightPRs(index);
        const e1rmPRs = selectE1RMPRs(index);
        const muscleDist = selectMuscleDistribution(index);
        const freq = selectExerciseFrequency(index);
        const bench1RM = selectExercise1RMProgression(index, 'bench');
        const t1 = performance.now();
        const durationMs = t1 - t0;

        console.log(`[PERF BENCHMARK] Canonical Selectors (${count} logs): ${durationMs.toFixed(2)} ms`);

        expect(lifetime.totalSessions).toBe(count);
        expect(weightPRs.length).toBeGreaterThan(0);
        expect(e1rmPRs.length).toBeGreaterThan(0);
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

      it(`measures plain-object active-set mutation microbenchmark (baseline)`, () => {
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

  describe('8.2 Real SessionView UI Interaction & Persistence Benchmark', () => {
    it('measures real SessionView set editing responsiveness, React.memo card isolation, and debounced persistence', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const cardCommits: Record<string, number> = {};
      const onCardCommit = vi.fn((exDefId: string) => {
        cardCommits[exDefId] = (cardCommits[exDefId] || 0) + 1;
      });

      let shellCommits = 0;
      function TrackingShell({ children }: { children?: React.ReactNode }) {
        useActiveSessionMeta();
        shellCommits++;
        return React.createElement(React.Fragment, null, children);
      }

      const mockFitness: any = {
        user: null,
        loading: false,
        isInitialized: true,
        syncStatus: 'idle',
        syncError: null,
        exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
        workouts: INITIAL_WORKOUTS,
        logs: {},
        appState: { cycleStart: '2026-10-01' },
        addLog: vi.fn().mockResolvedValue(undefined),
        updateCycleStart: vi.fn().mockResolvedValue(undefined),
      };

      await act(async () => {
        root.render(
          React.createElement(FitnessContext.Provider, { value: mockFitness },
            React.createElement(FitnessDerivedProvider, null,
              React.createElement(ActiveSessionProvider, null,
                React.createElement(ConfirmProvider, null,
                  React.createElement(TrackingShell, null,
                    React.createElement(SessionView, {
                      workoutId: 'push-a',
                      onExit: vi.fn(),
                      onCardCommit: onCardCommit
                    })
                  )
                )
              )
            )
          )
        );
      });

      // Baseline commits after initial mount
      const baselineE1Commits = cardCommits['e1'] || 0;
      const baselineE2Commits = cardCommits['e2'] || 0;
      const baselineShellCommits = shellCommits;

      expect(baselineE1Commits).toBeGreaterThan(0);
      expect(baselineE2Commits).toBeGreaterThan(0);

      // Find the weight input for the first set of Exercise e1
      const weightInputs = container.querySelectorAll('input');
      const firstWeightInput = weightInputs[0] as HTMLInputElement;
      expect(firstWeightInput).toBeTruthy();

      // Spy on localStorage.setItem to measure write frequency during rapid typing
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockClear();

      const runs = 10;
      const latencies: number[] = [];
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      for (let i = 0; i < runs; i++) {
        const newValue = `${100 + i * 2.5}`;
        const t0 = performance.now();
        await act(async () => {
          nativeSetter?.call(firstWeightInput, newValue);
          firstWeightInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const t1 = performance.now();
        latencies.push(t1 - t0);
      }

      latencies.sort((a, b) => a - b);
      const medianLatencyMs = latencies[Math.floor(runs / 2)];
      console.log(`[PERF BENCHMARK] Real SessionView Set Input Median Latency (${runs} runs): ${medianLatencyMs.toFixed(2)} ms`);

      // 1. Acceptance Criterion: Edited card committed updates to reflect typed values
      expect(cardCommits['e1']).toBeGreaterThan(baselineE1Commits);

      // 2. Acceptance Criterion: Unaffected card committed ZERO extra renders (React.memo bailout)
      expect(cardCommits['e2']).toBe(baselineE2Commits);

      // 3. Acceptance Criterion: Application shell committed ZERO extra renders
      expect(shellCommits).toBe(baselineShellCommits);

      // 4. Acceptance Criterion: Synchronous persistence is debounced (NOT called on every keystroke)
      const activeSessionWrites = setItemSpy.mock.calls.filter(c => c[0] === 'gl_active_session').length;
      expect(activeSessionWrites).toBeLessThan(runs);

      // 5. Verification threshold: Input-to-commit median latency is responsive
      expect(medianLatencyMs).toBeLessThan(250);

      setItemSpy.mockRestore();
      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
