import { bench, describe, expect } from 'vitest';
import {
  buildFitnessIndex,
  selectLifetimeStats,
  selectTimeRangeAnalytics,
  selectMuscleBalanceForRange,
  selectWeightPRs,
  selectE1RMPRs
} from '../utils/fitnessDerivedSelectors';
import { persistFitnessDatabase } from '../hooks/useFitnessData';
import { generateSyntheticDataset, createInMemoryStorage } from './syntheticDataset';

// Install isolated in-memory localStorage for deterministic Node benchmarks without Node WebStorage quota limits
(globalThis as any).localStorage = createInMemoryStorage();

const tiers = [100, 1000, 5000, 10000];
const datasets = new Map<number, ReturnType<typeof generateSyntheticDataset>>();
tiers.forEach(t => datasets.set(t, generateSyntheticDataset(t)));

describe('GAINLOG Synthetic Performance Benchmark Suite', () => {
  tiers.forEach(count => {
    const dataset = datasets.get(count)!;
    // Setup & canonical index build executed OUTSIDE bench() using dataset.lastDate
    const index = buildFitnessIndex(dataset.logs, dataset.defsMap, dataset.lastDate);

    // Pre-benchmark integrity assertions (outside bench callbacks) ensure 30d, 90d, and all windows are non-empty
    const sanity30d = selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, '30d', dataset.firstDate, 'bench', dataset.lastDate);
    const sanity90d = selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, '90d', dataset.firstDate, 'bench', dataset.lastDate);
    const sanityAll = selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, 'all', dataset.firstDate, 'bench', dataset.lastDate);
    const sanityMuscle90d = selectMuscleBalanceForRange(index, dataset.range90Start, dataset.recentRangeEnd);

    expect(index.sortedLogsDescending).toHaveLength(count);
    expect(sanity30d.rangeLogsCount).toBeGreaterThan(0);
    expect(sanity90d.rangeLogsCount).toBeGreaterThan(0);
    expect(sanityAll.rangeLogsCount).toBe(count);
    expect(sanityMuscle90d.totalAttributedWSE).toBeGreaterThan(0);

    describe(`Tier: ${count} Historical Session Logs`, () => {
      bench(`buildFitnessIndex (${count} logs)`, () => {
        buildFitnessIndex(dataset.logs, dataset.defsMap, dataset.lastDate);
      });

      bench(`selectLifetimeStats (${count} logs)`, () => {
        selectLifetimeStats(index);
      });

      bench(`selectTimeRangeAnalytics 30d (${count} logs)`, () => {
        selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, '30d', dataset.firstDate, 'bench', dataset.lastDate);
      });

      bench(`selectTimeRangeAnalytics 90d (${count} logs)`, () => {
        selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, '90d', dataset.firstDate, 'bench', dataset.lastDate);
      });

      bench(`selectTimeRangeAnalytics all (${count} logs)`, () => {
        selectTimeRangeAnalytics(index, dataset.workoutsMap, dataset.coreWorkoutMap, 'all', dataset.firstDate, 'bench', dataset.lastDate);
      });

      bench(`selectMuscleBalanceForRange 90d (${count} logs)`, () => {
        selectMuscleBalanceForRange(index, dataset.range90Start, dataset.recentRangeEnd);
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

      bench(`persistFitnessDatabase staged commit (${count} logs)`, () => {
        persistFitnessDatabase(dataset.snapshot);
      });
    });
  });
});
