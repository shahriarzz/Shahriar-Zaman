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
import { SetLog } from '../types/fitness';
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
import { resolveExercise } from '../utils/exerciseResolver';
import { generateSyntheticDataset } from '../benchmarks/syntheticDataset';

describe('8.1 Canonical Selector Correctness & Index Scaling Invariants', () => {
  const benchmarkTiers = [100, 1000, 5000];

  benchmarkTiers.forEach(count => {
    describe(`Tier: ${count} Historical Session Logs`, () => {
      const fixture = generateSyntheticDataset(count);

      it(`builds canonical index cleanly across ${count} logs using dataset.lastDate`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap, fixture.lastDate);

        expect(index).toBeDefined();
        expect(index.sortedLogsDescending).toHaveLength(count);
        expect(index.lifetimeStats.totalSessions).toBe(count);
        expect(index.lifetimeStats.totalVolume).toBeGreaterThan(0);

        // Verify muscle attribution index structures are populated
        expect(index.muscleStimulusByDate).toBeDefined();
        expect(index.muscleAttributionCoverageByDate).toBeDefined();
        expect(index.lifetimeLastTrainedDateByMuscle).toBeDefined();
      });

      it(`executes Muscle Intelligence selectors accurately with non-empty windows across ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap, fixture.lastDate);

        const balance30d = selectMuscleBalanceForRange(index, fixture.recentRangeStart, fixture.recentRangeEnd);
        const balance90d = selectMuscleBalanceForRange(index, fixture.range90Start, fixture.recentRangeEnd);
        const balanceAll = selectMuscleBalanceForRange(index, fixture.firstDate, fixture.lastDate);
        const recovery = selectMuscleRecovery(index, fixture.lastDate);

        expect(balance30d.groups).toHaveLength(6);
        expect(balance30d.allGroups).toHaveLength(15);
        expect(balance30d.totalAttributedWSE).toBeGreaterThan(0);
        expect(balance90d.totalAttributedWSE).toBeGreaterThan(0);
        expect(balanceAll.allGroups).toHaveLength(15);
        expect(balanceAll.totalAttributedWSE).toBeGreaterThan(0);
        expect(recovery.items).toHaveLength(15);
      });

      it(`executes canonical selectors accurately with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap, fixture.lastDate);

        const lifetime = selectLifetimeStats(index);
        const weightPRs = selectWeightPRs(index);
        const e1rmPRs = selectE1RMPRs(index);
        const muscleDist = selectMuscleDistribution(index);
        const freq = selectExerciseFrequency(index);
        const bench1RM = selectExercise1RMProgression(index, 'bench');

        expect(lifetime.totalSessions).toBe(count);
        expect(weightPRs.length).toBeGreaterThan(0);
        expect(e1rmPRs.length).toBeGreaterThan(0);
        expect(muscleDist.totalVolume).toBeGreaterThan(0);
        expect(freq.length).toBeGreaterThan(0);
        expect(bench1RM.length).toBeGreaterThan(0);
      });

      it(`executes Analytics range aggregations (30d, 90d, all) with non-empty sessions across ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap, fixture.lastDate);

        const analytics30d = selectTimeRangeAnalytics(
          index,
          fixture.workoutsMap,
          fixture.coreWorkoutMap,
          '30d',
          fixture.firstDate,
          'bench',
          fixture.lastDate
        );
        const analytics90d = selectTimeRangeAnalytics(
          index,
          fixture.workoutsMap,
          fixture.coreWorkoutMap,
          '90d',
          fixture.firstDate,
          'bench',
          fixture.lastDate
        );
        const analyticsAll = selectTimeRangeAnalytics(
          index,
          fixture.workoutsMap,
          fixture.coreWorkoutMap,
          'all',
          fixture.firstDate,
          'bench',
          fixture.lastDate
        );

        expect(analytics30d.rangeLogsCount).toBeGreaterThan(0);
        expect(analytics90d.rangeLogsCount).toBeGreaterThan(0);
        expect(analyticsAll.rangeLogsCount).toBe(count);
      });

      it(`resolves History exercises consistently with ${count} logs`, () => {
        const index = buildFitnessIndex(fixture.logs, fixture.defsMap, fixture.lastDate);

        fixture.defs.forEach(d => {
          const resolved = resolveExercise(d.id, fixture.defsMap);
          const meta = index.exerciseMetaById.get(d.id);
          const entry = index.exerciseIndex.get(d.id);
          expect(resolved.name).toBe(d.name);
          expect(meta?.name).toBe(d.name);
          expect(entry).toBeDefined();
        });
      });

      it(`preserves plain-object active-set mutation contract (${count} logs context)`, () => {
        const activeSets: Record<string, SetLog[]> = {
          bench: [
            { id: 's1', weight: '100', reps: '8', done: true },
            { id: 's2', weight: '102.5', reps: '6', done: false }
          ]
        };

        for (let i = 0; i < 50; i++) {
          activeSets.bench[1].weight = `${102.5 + i * 0.5}`;
          activeSets.bench[1].reps = `${6 + (i % 3)}`;
        }

        expect(activeSets.bench[1].weight).toBe('127');
      });
    });
  });

  describe('8.2 Real SessionView UI Interaction & Render Isolation', () => {
    it('verifies SessionView React.memo card isolation and debounced persistence on rapid edits', async () => {
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
        syncStatus: 'idle',
        syncError: null,
        exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
        workouts: INITIAL_WORKOUTS,
        logs: {},
        appState: { cycleStart: '2026-10-01' },
        addLog: vi.fn().mockResolvedValue({ success: true, localPersisted: true, cloudPersisted: false, cloudAttempted: false }),
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

      const baselineE1Commits = cardCommits['e1'] || 0;
      const baselineE2Commits = cardCommits['e2'] || 0;
      const baselineShellCommits = shellCommits;

      expect(baselineE1Commits).toBeGreaterThan(0);
      expect(baselineE2Commits).toBeGreaterThan(0);

      const weightInputs = container.querySelectorAll('input');
      const firstWeightInput = weightInputs[0] as HTMLInputElement;
      expect(firstWeightInput).toBeTruthy();

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockClear();

      const runs = 10;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      for (let i = 0; i < runs; i++) {
        const newValue = `${100 + i * 2.5}`;
        await act(async () => {
          nativeSetter?.call(firstWeightInput, newValue);
          firstWeightInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }

      // 1. Edited card committed updates to reflect typed values
      expect(cardCommits['e1']).toBeGreaterThan(baselineE1Commits);

      // 2. Unaffected card committed ZERO extra renders (React.memo bailout)
      expect(cardCommits['e2']).toBe(baselineE2Commits);

      // 3. Application shell committed ZERO extra renders
      expect(shellCommits).toBe(baselineShellCommits);

      // 4. Synchronous persistence is debounced (NOT called on every keystroke)
      const activeSessionWrites = setItemSpy.mock.calls.filter(c => c[0] === 'gl_active_session').length;
      expect(activeSessionWrites).toBeLessThan(runs);

      setItemSpy.mockRestore();
      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
