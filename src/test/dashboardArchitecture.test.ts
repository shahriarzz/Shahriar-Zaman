// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  getSortedWeightEntries,
  getWeightSparklineData,
  formatDateStr,
  getRelativeTimeString
} from '../utils/dashboardSelectors';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { SessionLog } from '../types/fitness';

describe('Dashboard Architecture & Selectors Suite', () => {
  describe('formatDateStr', () => {
    it('formats YYYY-MM-DD date string properly', () => {
      const formatted = formatDateStr('2026-10-24');
      expect(formatted).toMatch(/Oct 24/);
    });

    it('returns raw string if not 3 segments', () => {
      expect(formatDateStr('invalid-date')).toBe('invalid-date');
    });
  });

  describe('calculateStreak via Canonical Index', () => {
    it('returns 0 when no logs exist', () => {
      expect(buildFitnessIndex(null).lifetimeStats.currentStreak).toBe(0);
      expect(buildFitnessIndex({}).lifetimeStats.currentStreak).toBe(0);
    });

    it('calculates active streak when today is completed', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const dStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const logs: Record<string, SessionLog> = {
        log1: { id: 'log1', date: dStr(today), workoutId: 'w1', complete: true, durationMinutes: 45, sets: {} },
        log2: { id: 'log2', date: dStr(yesterday), workoutId: 'w2', complete: true, durationMinutes: 50, sets: {} }
      };

      expect(buildFitnessIndex(logs).lifetimeStats.currentStreak).toBe(2);
    });

    it('sustains streak if completed yesterday but not yet today', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(today);
      dayBefore.setDate(dayBefore.getDate() - 2);

      const dStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const logs: Record<string, SessionLog> = {
        log1: { id: 'log1', date: dStr(yesterday), workoutId: 'w1', complete: true, durationMinutes: 45, sets: {} },
        log2: { id: 'log2', date: dStr(dayBefore), workoutId: 'w2', complete: true, durationMinutes: 60, sets: {} }
      };

      expect(buildFitnessIndex(logs).lifetimeStats.currentStreak).toBe(2);
    });

    it('returns 0 if neither today nor yesterday has a log', () => {
      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const dStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const logs: Record<string, SessionLog> = {
        log1: { id: 'log1', date: dStr(threeDaysAgo), workoutId: 'w1', complete: true, durationMinutes: 45, sets: {} }
      };

      expect(buildFitnessIndex(logs).lifetimeStats.currentStreak).toBe(0);
    });
  });

  describe('Canonical Total Volume Calculation', () => {
    it('returns 0 on empty logs', () => {
      expect(buildFitnessIndex(null).lifetimeStats.totalVolume).toBe(0);
      expect(buildFitnessIndex({}).lifetimeStats.totalVolume).toBe(0);
    });

    it('sums weight * reps for completed sets only in canonical index', () => {
      const logs: Record<string, SessionLog> = {
        log1: {
          id: 'log1',
          date: '2026-08-01',
          workoutId: 'w1',
          complete: true,
          durationMinutes: 50,
          sets: {
            ex1: [
              { id: 's1', weight: '100', reps: '10', done: true }, // 1000
              { id: 's2', weight: '100', reps: '8', done: true },  // 800
              { id: 's3', weight: '100', reps: '10', done: false } // not done: 0
            ]
          }
        },
        log2: {
          id: 'log2',
          date: '2026-08-02',
          workoutId: 'w2',
          complete: true,
          durationMinutes: 40,
          sets: {
            ex2: [
              { id: 's4', weight: '50', reps: '10', done: true } // 500
            ]
          }
        }
      };

      const index = buildFitnessIndex(logs);
      expect(index.lifetimeStats.totalVolume).toBe(2300);
    });
  });

  describe('getSortedWeightEntries & getWeightSparklineData', () => {
    it('sorts weight entries descending by date', () => {
      const weightLog = {
        '2026-08-01': 80.5,
        '2026-08-05': 81.0,
        '2026-08-03': 80.8
      };

      const sorted = getSortedWeightEntries(weightLog);
      expect(sorted).toEqual([
        ['2026-08-05', 81.0],
        ['2026-08-03', 80.8],
        ['2026-08-01', 80.5]
      ]);
    });

    it('returns null for sparkline when 0 or 1 weight log exists', () => {
      expect(getWeightSparklineData(null)).toBeNull();
      expect(getWeightSparklineData({})).toBeNull();
      expect(getWeightSparklineData({ '2026-08-01': 80 })).toBeNull();
    });

    it('computes correct sparkline min, max, range, and step width', () => {
      const weightLog = {
        '2026-08-01': 80.0,
        '2026-08-02': 82.0
      };

      const spark = getWeightSparklineData(weightLog);
      expect(spark).not.toBeNull();
      expect(spark?.weights).toEqual([80.0, 82.0]);
      expect(spark?.min).toBe(79.5);
      expect(spark?.max).toBe(82.5);
      expect(spark?.range).toBe(3);
      expect(spark?.w).toBe(100);
    });
  });

  describe('getRelativeTimeString', () => {
    it('formats relative time for minutes and hours', () => {
      const now = 100000000;
      const twentyMinAgo = now - 20 * 60 * 1000;
      const twoHoursAgo = now - 130 * 60 * 1000;

      expect(getRelativeTimeString(twentyMinAgo, now)).toBe('20 min ago');
      expect(getRelativeTimeString(twoHoursAgo, now)).toBe('2h ago');
    });
  });
});
