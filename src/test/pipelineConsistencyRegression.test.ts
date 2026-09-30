// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  buildFitnessIndex,
  selectTimeRangeAnalytics,
  selectWeightSummary,
  selectNextCycleDay,
  selectCycleDayForDate
} from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { calculatePREvents } from '../utils/trainingIntelligence';
import { ExerciseDefinition, SessionLog, Workout } from '../types/fitness';

describe('P0 & P1 Pipeline Consistency Regressions', () => {
  const mockDefs: ExerciseDefinition[] = [
    { id: 'bench', name: 'Barbell Bench Press', target: 'Chest', updatedAt: 1000 },
    { id: 'squat', name: 'Barbell Back Squat', target: 'Legs', updatedAt: 1000 }
  ];
  const defsMap = createExerciseDefinitionMap(mockDefs);

  const mockWorkouts: Workout[] = [
    { id: 'w1', name: 'Push', type: 'push', badge: 'PUSH', exercises: [], cycleDay: 1, isCore: true, updatedAt: 1000 }
  ];
  const workoutMap = new Map<string, Workout>(mockWorkouts.map(w => [w.id, w]));
  const coreWorkoutByCycleDayMap = new Map<number, Workout>([[1, mockWorkouts[0]]]);

  // P0.1: Future-dated logs must NEVER appear in 7D, 30D, 90D, or ALL analytics
  describe('P0.1 — Upper date boundary enforcement for analytics', () => {
    it('excludes future-dated logs from 7D, 30D, 90D, and ALL analytics queries', () => {
      const pastLog: SessionLog = {
        id: 'past_log',
        workoutId: 'w1',
        date: '2026-09-28',
        complete: true,
        durationMinutes: 45,
        sets: {
          bench: [{ id: 's1', weight: '100', reps: '10', done: true }]
        }
      };

      const futureLog: SessionLog = {
        id: 'future_log',
        workoutId: 'w1',
        date: '2026-10-15', // Future relative to eval date 2026-09-30
        complete: true,
        durationMinutes: 90,
        sets: {
          bench: [{ id: 's2', weight: '200', reps: '20', done: true }],
          squat: [{ id: 's3', weight: '300', reps: '10', done: true }]
        }
      };

      const evalDate = new Date('2026-09-30T12:00:00Z');
      const index = buildFitnessIndex([pastLog, futureLog], defsMap);

      const ranges: ('7d' | '30d' | '90d' | 'all')[] = ['7d', '30d', '90d', 'all'];

      ranges.forEach(range => {
        const analytics = selectTimeRangeAnalytics(
          index,
          workoutMap,
          coreWorkoutByCycleDayMap,
          range,
          '2026-09-01',
          undefined,
          evalDate
        );

        // Future log volume (200*20 + 300*10 = 7000kg) must NOT be present
        expect(analytics.rangeVolume).toBe(1000); // Only pastLog: 100 * 10 = 1000
        expect(analytics.rangeLogsCount).toBe(1);
        expect(analytics.rangeMuscleVolume.Chest).toBe(1000);
        expect(analytics.rangeMuscleVolume.Legs || 0).toBe(0);
      });
    });
  });

  // P0.3: Future weight entries do not affect Current Weight
  describe('P0.3 — Current Weight ignores future weight records', () => {
    it('displays the latest non-future weight as Current Weight', () => {
      const weightLog = {
        '2026-09-25': { weight: 70, updatedAt: 100 },
        '2026-09-30': { weight: 68.5, updatedAt: 200 },
        '2026-10-05': { weight: 65.0, updatedAt: 300 } // Future entry
      };

      const evalDate = new Date('2026-09-30T12:00:00Z');
      const summary = selectWeightSummary(weightLog, evalDate);

      expect(summary.currentWeight).toBe(68.5);
      expect(summary.weightEntries[0][0]).toBe('2026-09-30');
      expect(summary.weightEntries.some(([date]) => date > '2026-09-30')).toBe(false);
    });
  });

  // P1.6: Canonical PR event logic agrees with Weight PR logic
  describe('P1.6 — Canonical PR event consistency', () => {
    it('recognizes higher weight as a PR, same weight with higher reps as a PR, and lower weight as NOT a PR', () => {
      const logs: SessionLog[] = [
        {
          id: 'log1',
          date: '2026-09-01',
          workoutId: 'w1',
          complete: true,
          durationMinutes: 40,
          sets: {
            bench: [{ id: 's1', weight: '100', reps: '8', done: true }]
          }
        },
        {
          id: 'log2',
          date: '2026-09-08',
          workoutId: 'w1',
          complete: true,
          durationMinutes: 40,
          sets: {
            bench: [{ id: 's2', weight: '100', reps: '10', done: true }] // Same weight + higher reps -> PR!
          }
        },
        {
          id: 'log3',
          date: '2026-09-15',
          workoutId: 'w1',
          complete: true,
          durationMinutes: 40,
          sets: {
            bench: [{ id: 's3', weight: '90', reps: '12', done: true }] // Lower weight -> NOT a weight PR
          }
        },
        {
          id: 'log4',
          date: '2026-09-22',
          workoutId: 'w1',
          complete: true,
          durationMinutes: 40,
          sets: {
            bench: [{ id: 's4', weight: '105', reps: '6', done: true }] // Higher weight -> PR!
          }
        }
      ];

      const index = buildFitnessIndex(logs, defsMap);
      const prEvents = calculatePREvents(index);

      const benchWeightPREvents = prEvents.filter(e => e.exerciseDefinitionId === 'bench' && e.isWeightPR);
      expect(benchWeightPREvents).toHaveLength(3); // log1, log2, log4
      expect(benchWeightPREvents[0].weight).toBe(100);
      expect(benchWeightPREvents[0].reps).toBe(8);

      expect(benchWeightPREvents[1].weight).toBe(100);
      expect(benchWeightPREvents[1].reps).toBe(10); // Same weight, higher reps

      expect(benchWeightPREvents[2].weight).toBe(105);
      expect(benchWeightPREvents[2].reps).toBe(6);
    });
  });

  // P1.7: Set Completion Rate semantics
  describe('P1.7 — Set completion rate and completed-session invariant', () => {
    it('enforces completed-session integrity: only completed sessions contribute to completedSetsByDate', () => {
      const incompleteLog: SessionLog = {
        id: 'incomplete_session',
        workoutId: 'w1',
        date: '2026-09-28',
        complete: false, // Abandoned session
        durationMinutes: 30,
        sets: {
          bench: [
            { id: 's1', weight: '80', reps: '10', done: true },
            { id: 's2', weight: '80', reps: '10', done: true },
            { id: 's3', weight: '80', reps: '10', done: false } // Not done
          ]
        }
      };

      const index = buildFitnessIndex([incompleteLog], defsMap);
      expect(index.plannedSetsByDate['2026-09-28']).toBe(3);
      expect(index.completedSetsByDate['2026-09-28']).toBeUndefined(); // Only completed sessions count in completedSetsByDate
      expect(index.lifetimeStats.totalSessions).toBe(0); // Lifetime session count remains 0 for incomplete
      expect(index.lifetimeStats.totalVolume).toBe(0); // Lifetime volume remains 0 for incomplete
    });
  });

  // P1.8: Clean cycle day selector API signatures
  describe('P1.8 — Clean cycle day selector API signatures', () => {
    it('supports modern clean 1-2 argument signature', () => {
      const day1 = selectNextCycleDay('2026-09-01', new Date('2026-09-01T10:00:00Z'));
      const day2 = selectNextCycleDay('2026-09-01', new Date('2026-09-02T10:00:00Z'));
      expect(day1).toBe(1);
      expect(day2).toBe(2);

      const targetDay = selectCycleDayForDate('2026-09-05', '2026-09-01');
      expect(targetDay).toBe(5);
    });

    it('retains backward compatibility with legacy multi-arg signatures', () => {
      const dayLegacy = selectNextCycleDay(null, null, '2026-09-01', new Date('2026-09-03T10:00:00Z'));
      expect(dayLegacy).toBe(3);

      const targetLegacy = selectCycleDayForDate('2026-09-04', null, null, '2026-09-01');
      expect(targetLegacy).toBe(4);
    });
  });
});
