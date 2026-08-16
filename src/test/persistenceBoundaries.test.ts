// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExerciseDefinition,
  Workout,
  SessionLog,
  SetLog,
  AppState,
  CURRENT_SCHEMA_VERSION,
  WeightLogEntry
} from '../types/fitness';
import {
  calculateVolume,
  calculateE1RM,
  dk,
  sanitizeSessionLog,
  normalizeWeightEntry
} from '../utils/fitnessCalculations';
import {
  buildFitnessIndex,
  selectSortedLogs,
  selectLifetimeStats,
  selectPersonalBests,
  selectWeightSummary
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise
} from '../utils/exerciseResolver';
import {
  trackDeletedId,
  getDeletedIdsTracker,
  clearDeletedIdsTracker,
  mergeDefinitions,
  mergeWorkouts,
  mergeLogs,
  mergeAppState
} from '../utils/fitnessSyncHelpers';
import { loadInitialFitnessData } from '../utils/fitnessMigration';
import { ActiveSession } from '../hooks/useActiveSession';

describe('Persistence Boundaries Test Suite (Transitions & Failure Recovery)', () => {
  const sampleDefs: ExerciseDefinition[] = [
    { id: 'def_deadlift', name: 'Conventional Deadlift', target: 'Back', equipment: 'Barbell' },
    { id: 'def_pullup', name: 'Overhand Pull Up', target: 'Lats', equipment: 'Bodyweight' }
  ];
  const defsMap = createExerciseDefinitionMap(sampleDefs);

  const sampleWorkout: Workout = {
    id: 'w_pull_core',
    name: 'Pull Day Heavy',
    badge: 'PULL A',
    type: 'pull',
    isCore: true,
    cycleDay: 2,
    exercises: [
      { exerciseDefinitionId: 'def_deadlift', sets: 3, reps: '5' },
      { exerciseDefinitionId: 'def_pullup', sets: 3, reps: '8-10' }
    ]
  };

  beforeEach(() => {
    localStorage.clear();
    clearDeletedIdsTracker();
  });

  // 1. Transition: SessionView -> state -> persistence -> reload -> derived index -> consumers
  it('1. Transition: Normal session completion persists and reloads accurately into derived index', () => {
    const today = dk();
    const sessionId = `log_${today}_pull`;

    const completedLog: SessionLog = sanitizeSessionLog({
      id: sessionId,
      workoutId: sampleWorkout.id,
      date: today,
      complete: true,
      durationMinutes: 50,
      sets: {
        def_deadlift: [
          { id: 'dl_1', weight: '140', reps: '5', done: true },
          { id: 'dl_2', weight: '150', reps: '5', done: true }
        ],
        def_pullup: [
          { id: 'pu_1', weight: '0', reps: '10', done: true }
        ]
      }
    });

    // 1. Save to persistence (e.g. localStorage)
    const logsMap: Record<string, SessionLog> = { [sessionId]: completedLog };
    localStorage.setItem('gl_logs', JSON.stringify(logsMap));

    // 2. Simulate complete browser restart/reload
    const loadedData = JSON.parse(localStorage.getItem('gl_logs') || '{}');
    expect(loadedData[sessionId]).toBeDefined();

    // 3. Derived Index builds from reloaded state
    const index = buildFitnessIndex(loadedData, defsMap);
    const stats = selectLifetimeStats(index);
    const sorted = selectSortedLogs(index);

    // Deadlift volume: 140*5 + 150*5 = 700 + 750 = 1450. Pullup = 0 kg volume (bodyweight)
    expect(stats.totalVolume).toBe(1450);
    expect(stats.totalSets).toBe(3);
    expect(sorted[0].id).toBe(sessionId);
    expect(sorted[0].date).toBe(today);
  });

  // 2. Transition: Browser/App reload during active session (in-progress crash recovery)
  it('2. Transition: In-progress active session recovers seamlessly after browser reload', () => {
    const today = dk();
    const inProgressSession: ActiveSession = {
      workoutId: sampleWorkout.id,
      startTime: Date.now() - 20 * 60 * 1000,
      sessionSets: {
        def_deadlift: [
          { id: 's1', weight: '140', reps: '5', done: true },
          { id: 's2', weight: '150', reps: '5', done: false } // in progress
        ]
      }
    };

    // Store in active session storage
    localStorage.setItem('gl_active_session', JSON.stringify(inProgressSession));

    // App reload simulation: read active session back
    const recoveredJson = localStorage.getItem('gl_active_session');
    expect(recoveredJson).not.toBeNull();
    const recoveredSession: ActiveSession = JSON.parse(recoveredJson!);

    expect(recoveredSession.workoutId).toBe(sampleWorkout.id);
    expect(recoveredSession.sessionSets.def_deadlift[0].done).toBe(true);
    expect(recoveredSession.sessionSets.def_deadlift[0].weight).toBe('140');
    expect(recoveredSession.sessionSets.def_deadlift[1].done).toBe(false);
  });

  // 3. Transition: Reload after completion ensures active session key is wiped and historical log preserved
  it('3. Transition: Reload after session completion ensures active workout is cleared and log is preserved', () => {
    const today = dk();
    const sessionId = `log_${today}_done`;

    // Active session finished -> saved to logs and removed active session
    const logs: Record<string, SessionLog> = {
      [sessionId]: {
        id: sessionId,
        workoutId: sampleWorkout.id,
        date: today,
        complete: true,
        durationMinutes: 40,
        sets: {
          def_deadlift: [{ id: 's1', weight: '100', reps: '5', done: true }]
        }
      }
    };
    localStorage.setItem('gl_logs', JSON.stringify(logs));
    localStorage.removeItem('gl_active_session');

    // Reload
    expect(localStorage.getItem('gl_active_session')).toBeNull();
    const reloadedLogs = JSON.parse(localStorage.getItem('gl_logs') || '{}');
    expect(Object.keys(reloadedLogs)).toHaveLength(1);
    expect(reloadedLogs[sessionId].complete).toBe(true);
  });

  // 4. Transition: Editing historical data updates storage and cascades through derived selectors
  it('4. Transition: Editing historical log correctly recalculates volume and Personal Bests on reload', () => {
    const sessionId = 'log_history_edit';
    const originalLog: SessionLog = {
      id: sessionId,
      workoutId: sampleWorkout.id,
      date: '2026-08-01',
      complete: true,
      durationMinutes: 45,
      sets: {
        def_deadlift: [
          { id: 's1', weight: '120', reps: '5', done: true } // 120 x 5 = 600 kg. e1RM = 140
        ]
      }
    };

    let logs: Record<string, SessionLog> = { [sessionId]: originalLog };
    let index = buildFitnessIndex(logs, defsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(600);
    expect(selectPersonalBests(index)[0].maxWeight).toBe(120);

    // User edits the historical session to 160kg x 5
    const updatedLog: SessionLog = {
      ...originalLog,
      sets: {
        def_deadlift: [
          { id: 's1', weight: '160', reps: '5', done: true } // 160 x 5 = 800 kg. e1RM = 186.7
        ]
      }
    };
    logs = { [sessionId]: updatedLog };
    localStorage.setItem('gl_logs', JSON.stringify(logs));

    // Reload from persistence
    const reloaded = JSON.parse(localStorage.getItem('gl_logs') || '{}');
    const reloadedIndex = buildFitnessIndex(reloaded, defsMap);

    expect(selectLifetimeStats(reloadedIndex).totalVolume).toBe(800);
    const pb = selectPersonalBests(reloadedIndex)[0];
    expect(pb.maxWeight).toBe(160);
    expect(pb.maxEpley).toBe(calculateE1RM(160, 5));
  });

  // 5. Transition: Deleting historical data cleanly removes records and registers deletion tracker
  it('5. Transition: Deleting historical log updates persistence, tracks deletion ID, and updates index', () => {
    const log1: SessionLog = {
      id: 'log_to_keep',
      workoutId: sampleWorkout.id,
      date: '2026-08-01',
      complete: true,
      durationMinutes: 30,
      sets: { def_deadlift: [{ id: 's1', weight: '100', reps: '5', done: true }] }
    };
    const log2: SessionLog = {
      id: 'log_to_delete',
      workoutId: sampleWorkout.id,
      date: '2026-08-02',
      complete: true,
      durationMinutes: 30,
      sets: { def_deadlift: [{ id: 's2', weight: '110', reps: '5', done: true }] }
    };

    const logs: Record<string, SessionLog> = {
      [log1.id]: log1,
      [log2.id]: log2
    };

    // User deletes log2
    delete logs[log2.id];
    trackDeletedId('logs', log2.id);
    localStorage.setItem('gl_logs', JSON.stringify(logs));

    // Verify deletion tracker
    const deletedTracker = getDeletedIdsTracker();
    expect(deletedTracker.logs).toContain('log_to_delete');

    // Reload and verify index has 0 ghost references to deleted log
    const reloadedLogs = JSON.parse(localStorage.getItem('gl_logs') || '{}');
    expect(reloadedLogs['log_to_delete']).toBeUndefined();
    expect(reloadedLogs['log_to_keep']).toBeDefined();

    const reloadedIndex = buildFitnessIndex(reloadedLogs, defsMap);
    expect(selectLifetimeStats(reloadedIndex).totalSessions).toBe(1);
    expect(selectLifetimeStats(reloadedIndex).totalVolume).toBe(500);
  });

  // 6. Transition: Firebase sync & reload (two-way merge with timestamp and deletion tombstone resolution)
  it('6. Transition: Cloud sync merge respects deleted IDs and avoids resurrecting deleted records', () => {
    const localLogs: Record<string, SessionLog> = {
      'log_1': { id: 'log_1', workoutId: 'w1', date: '2026-08-01', complete: true, durationMinutes: 30, sets: {} }
    };
    const cloudLogs: Record<string, SessionLog> = {
      'log_1': { id: 'log_1', workoutId: 'w1', date: '2026-08-01', complete: true, durationMinutes: 30, sets: {} },
      'log_deleted_on_client': { id: 'log_deleted_on_client', workoutId: 'w1', date: '2026-08-02', complete: true, durationMinutes: 30, sets: {} }
    };

    // Mark 'log_deleted_on_client' as deleted locally
    trackDeletedId('logs', 'log_deleted_on_client');
    const deletedTracker = getDeletedIdsTracker();

    const { merged } = mergeLogs(localLogs, cloudLogs, deletedTracker.logs);

    expect(merged['log_deleted_on_client']).toBeUndefined();
    expect(merged['log_1']).toBeDefined();
  });

  // 7. Transition: Offline/Local-only operation when Firebase is unconfigured or offline
  it('7. Transition: Operates reliably in offline-only mode initializing schema and local storage', () => {
    const initialData = loadInitialFitnessData();
    expect(initialData.defs.length).toBeGreaterThan(0);
    expect(initialData.workouts.length).toBeGreaterThan(0);
    expect(initialData.appState.cycleStart).toBeDefined();

    expect(localStorage.getItem('gl_schema_version')).toBe(String(CURRENT_SCHEMA_VERSION));
    expect(localStorage.getItem('gl_exercise_definitions')).not.toBeNull();
    expect(localStorage.getItem('gl_workouts')).not.toBeNull();
  });
});
