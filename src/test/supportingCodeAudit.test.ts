import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSetVolume,
  calculateE1RM,
  sanitizeSetLog,
  sanitizeWorkout,
  sanitizeSessionLog,
  getRelativeTimeString,
  formatCompactWeight
} from '../utils/fitnessCalculations';
import { isValidApiBaseUrl, getApiBaseUrl, buildApiUrl } from '../utils/apiConfig';
import { persistFitnessDatabase, FitnessDatabaseSnapshot } from '../hooks/useFitnessData';
import { loadInitialFitnessData } from '../utils/fitnessMigration';
import { generateId } from '../utils/generateId';
import { generateId as helperGenId } from '../utils/fitnessHelpers';

describe('GAINLOG Supporting-Code Audit Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Non-Finite & Extreme Number Rejection in Fitness Calculations', () => {
    it('rejects Infinity, -Infinity, NaN, and 1e309 in calculateSetVolume', () => {
      expect(calculateSetVolume({ weight: 'Infinity', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '-Infinity', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '1e309', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: 'NaN', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: 'Infinity', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '-5', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '-100', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '0', reps: '10', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '0', done: true })).toBe(0);
      expect(calculateSetVolume({ weight: '100', reps: '10', done: false })).toBe(0);
      // Legitimate finite numbers
      expect(calculateSetVolume({ weight: '100', reps: '10', done: true })).toBe(1000);
      expect(calculateSetVolume({ weight: '82.5', reps: '8', done: true })).toBe(660);
    });

    it('rejects Infinity, NaN, and extreme values in calculateE1RM', () => {
      expect(calculateE1RM(Infinity, 10)).toBe(0);
      expect(calculateE1RM(-Infinity, 10)).toBe(0);
      expect(calculateE1RM('1e309', 10)).toBe(0);
      expect(calculateE1RM(NaN, 10)).toBe(0);
      expect(calculateE1RM(100, Infinity)).toBe(0);
      expect(calculateE1RM(100, -5)).toBe(0);
      expect(calculateE1RM(-100, 5)).toBe(0);
      expect(calculateE1RM(0, 5)).toBe(0);
      // Valid finite calculation
      expect(calculateE1RM(100, 1)).toBe(100);
      expect(calculateE1RM(100, 10)).toBe(133.3);
    });

    it('sanitizes malformed and non-finite values in sanitizeSetLog', () => {
      const setWithInf = sanitizeSetLog({ weight: 'Infinity', reps: '1e309', done: true });
      expect(setWithInf.weight).toBe('');
      expect(setWithInf.reps).toBe('');

      const setWithNeg = sanitizeSetLog({ weight: -50, reps: -10, done: true });
      expect(setWithNeg.weight).toBe('');
      expect(setWithNeg.reps).toBe('');

      const validSet = sanitizeSetLog({ weight: '100', reps: '10', done: true });
      expect(validSet.weight).toBe('100');
      expect(validSet.reps).toBe('10');
      expect(validSet.done).toBe(true);
    });

    it('rejects non-finite or unreasonable set counts in sanitizeWorkout', () => {
      const workoutWithInf = sanitizeWorkout({
        id: 'w1',
        name: 'Test',
        exercises: [{ id: 'ex1', sets: Infinity }]
      });
      expect(workoutWithInf.exercises[0].sets).toBe(3); // Falls back to default 3

      const workoutWithZero = sanitizeWorkout({
        id: 'w1',
        name: 'Test',
        exercises: [{ id: 'ex1', sets: 0 }]
      });
      expect(workoutWithZero.exercises[0].sets).toBe(3);

      const workoutWithValid = sanitizeWorkout({
        id: 'w1',
        name: 'Test',
        exercises: [{ id: 'ex1', sets: 5 }]
      });
      expect(workoutWithValid.exercises[0].sets).toBe(5);
    });

    it('clamps future timestamps in getRelativeTimeString and formats safely', () => {
      const now = 1700000000000;
      // Future timestamp (5 minutes in future) must NOT return negative minutes ago
      expect(getRelativeTimeString(now + 300000, now)).toBe('just now');
      // Invalid/zero timestamp
      expect(getRelativeTimeString(-1, now)).toBe('recently');
      expect(getRelativeTimeString(NaN, now)).toBe('recently');
      // Legitimate elapsed times
      expect(getRelativeTimeString(now - 30000, now)).toBe('just now');
      expect(getRelativeTimeString(now - 600000, now)).toBe('10 min ago');
      expect(getRelativeTimeString(now - 7200000, now)).toBe('2h ago');
    });

    it('safely formats compact weights without NaN', () => {
      expect(formatCompactWeight(NaN)).toBe('0');
      expect(formatCompactWeight(Infinity)).toBe('0');
      expect(formatCompactWeight(-500)).toBe('0');
      expect(formatCompactWeight(846)).toBe('846');
      expect(formatCompactWeight(1200)).toBe('1.2k');
      expect(formatCompactWeight(1300000)).toBe('1.3M');
    });
  });

  describe('2. Native AI API Endpoint Configuration & Security', () => {
    it('validates HTTPS required in production and allows valid URLs', () => {
      expect(isValidApiBaseUrl('http://insecure.com', true)).toBe(false);
      expect(isValidApiBaseUrl('https://secure-api.gainlog.app', true)).toBe(true);
      expect(isValidApiBaseUrl('not-a-url', true)).toBe(false);
      expect(isValidApiBaseUrl('', true)).toBe(false);
    });

    it('does not silently return a development cloud run URL on unconfigured native builds', () => {
      // In native environment without configured VITE_API_BASE_URL, getApiBaseUrl must return ''
      const base = getApiBaseUrl();
      expect(base).not.toContain('ais-dev');
    });
  });

  describe('3. Local Persistence Resilience to Partial Writes & Atomic Snapshots', () => {
    const mockSnapshot: FitnessDatabaseSnapshot = {
      exerciseDefinitions: [
        { id: 'ex1', name: 'Bench Press', target: 'Chest', updatedAt: 1000 }
      ],
      workouts: [
        { id: 'w1', name: 'Push', badge: 'PUSH', type: 'push', exercises: [], updatedAt: 1000 }
      ],
      logs: {
        log1: {
          id: 'log1',
          workoutId: 'w1',
          date: '2026-10-01',
          complete: true,
          durationMinutes: 45,
          sets: {}
        }
      },
      appState: { cycleStart: '2026-10-01' }
    };

    it('persists and loads atomic versioned snapshot correctly', () => {
      persistFitnessDatabase(mockSnapshot);

      const rawSnapshot = localStorage.getItem('gl_database_snapshot');
      expect(rawSnapshot).not.toBeNull();
      const parsed = JSON.parse(rawSnapshot!);
      expect(parsed.schemaVersion).toBeDefined();
      expect(parsed.data.exerciseDefinitions.length).toBe(1);

      const loaded = loadInitialFitnessData();
      expect(loaded.defs.length).toBe(1);
      expect(loaded.defs[0].id).toBe('ex1');
      expect(loaded.workouts.length).toBe(1);
      expect(loaded.logs['log1']).toBeDefined();
    });

    it('recovers gracefully from corrupted snapshot by falling back to discrete keys', () => {
      // Store discrete keys
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(mockSnapshot.exerciseDefinitions));
      localStorage.setItem('gl_workouts', JSON.stringify(mockSnapshot.workouts));
      localStorage.setItem('gl_logs', JSON.stringify(mockSnapshot.logs));
      localStorage.setItem('gl_state', JSON.stringify(mockSnapshot.appState));

      // Introduce corrupted gl_database_snapshot
      localStorage.setItem('gl_database_snapshot', '{corrupted_json');

      const loaded = loadInitialFitnessData();
      expect(loaded.defs.length).toBe(1);
      expect(loaded.defs[0].id).toBe('ex1');
      expect(loaded.workouts[0].id).toBe('w1');
    });
  });

  describe('4. ID Generation Consolidation', () => {
    it('generateId in fitnessHelpers is identical to generateId module', () => {
      expect(helperGenId).toBe(generateId);
      const id1 = generateId();
      const id2 = helperGenId();
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });
});
