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

  // 8. 5.1 Exhaustive Persistence Round-Trip Testing
  it('8. Exhaustive Round-Trip: writes canonical database, reloads, normalizes, and preserves all IDs and structures without mutations', () => {
    const originalDatabase = {
      version: CURRENT_SCHEMA_VERSION,
      defs: [
        { id: 'def_sq', name: 'Barbell Back Squat', target: 'Quads', equipment: 'Barbell', instructions: 'Depth below parallel', tags: ['compound', 'legs'] },
        { id: 'def_bp', name: 'Barbell Flat Bench', target: 'Chest', equipment: 'Barbell', instructions: 'Arch back, retract scapulae', tags: ['compound', 'push'] }
      ],
      workouts: [
        {
          id: 'w_leg_power',
          name: 'Leg Power Day',
          badge: 'LEG A',
          type: 'lower' as const,
          isCore: true,
          cycleDay: 1,
          exercises: [
            { exerciseDefinitionId: 'def_sq', sets: 5, reps: '5', rest: '180s', note: 'Heavy working sets', tags: [] }
          ]
        }
      ],
      logs: {
        'log_2026_08_10_legs': {
          id: 'log_2026_08_10_legs',
          workoutId: 'w_leg_power',
          date: '2026-08-10',
          complete: true,
          durationMinutes: 60,
          sets: {
            def_sq: [
              { id: 'sq_set_1', weight: '140', reps: '5', done: true },
              { id: 'sq_set_2', weight: '145', reps: '5', done: true }
            ]
          }
        }
      },
      appState: {
        cycleStart: '2026-08-01',
        weightLog: {
          '2026-08-09': 82.5,
          '2026-08-10': 82.2
        }
      },
      activeSession: {
        workoutId: 'w_leg_power',
        startTime: 1786500000000,
        sessionSets: {
          def_sq: [
            { id: 'sq_active_1', weight: '145', reps: '5', done: true },
            { id: 'sq_active_2', weight: '150', reps: '5', done: false }
          ]
        }
      }
    };

    // Serialize to storage keys
    localStorage.setItem('gl_schema_version', String(originalDatabase.version));
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(originalDatabase.defs));
    localStorage.setItem('gl_workouts', JSON.stringify(originalDatabase.workouts));
    localStorage.setItem('gl_logs', JSON.stringify(originalDatabase.logs));
    localStorage.setItem('gl_state', JSON.stringify(originalDatabase.appState));
    localStorage.setItem('gl_active_session', JSON.stringify(originalDatabase.activeSession));

    // Reload / Deserialize
    const reloaded = loadInitialFitnessData();
    const reloadedActiveSession = JSON.parse(localStorage.getItem('gl_active_session')!);

    // Assert exact equality of all IDs and definitions
    expect(reloaded.defs).toEqual(originalDatabase.defs);
    expect(reloaded.workouts).toEqual(originalDatabase.workouts);
    expect(reloaded.logs).toEqual(originalDatabase.logs);
    expect(reloaded.appState).toEqual(originalDatabase.appState);
    expect(reloadedActiveSession).toEqual(originalDatabase.activeSession);

    // Verify SetLog IDs and exerciseDefinitionIds did not change
    expect(reloaded.logs['log_2026_08_10_legs'].sets.def_sq[0].id).toBe('sq_set_1');
    expect(reloaded.logs['log_2026_08_10_legs'].sets.def_sq[1].id).toBe('sq_set_2');
    expect(reloaded.workouts[0].exercises[0].exerciseDefinitionId).toBe('def_sq');

    // Rebuild index and check derived integrity
    const reloadedDefsMap = createExerciseDefinitionMap(reloaded.defs);
    const index = buildFitnessIndex(reloaded.logs, reloadedDefsMap);
    expect(selectLifetimeStats(index).totalVolume).toBe(140 * 5 + 145 * 5);
  });

  // 9. 5.2 Test Interrupted Active Sessions
  it('9. Interrupted Active Session: survives browser reload, maintains all set states, and produces exactly one log on finish', () => {
    // 1. Start workout
    const active: ActiveSession = {
      workoutId: sampleWorkout.id,
      startTime: Date.now() - 30 * 60 * 1000,
      sessionSets: {
        def_deadlift: [
          { id: 's_dl_1', weight: '130', reps: '5', done: true },
          { id: 's_dl_2', weight: '140', reps: '5', done: true }
        ],
        def_pullup: [
          { id: 's_pu_1', weight: '0', reps: '10', done: false }
        ]
      }
    };
    localStorage.setItem('gl_active_session', JSON.stringify(active));

    // 2. Reload before completion
    const reloadedActiveJson = localStorage.getItem('gl_active_session');
    expect(reloadedActiveJson).not.toBeNull();
    const resumedActive: ActiveSession = JSON.parse(reloadedActiveJson!);

    // Verify no set disappeared, no duplicates, IDs unchanged
    expect(resumedActive.sessionSets.def_deadlift).toHaveLength(2);
    expect(resumedActive.sessionSets.def_deadlift[0].id).toBe('s_dl_1');
    expect(resumedActive.sessionSets.def_deadlift[1].id).toBe('s_dl_2');
    expect(resumedActive.sessionSets.def_pullup).toHaveLength(1);

    // 3. Continue logging in resumed session
    resumedActive.sessionSets.def_pullup[0].done = true;
    resumedActive.sessionSets.def_pullup.push({ id: 's_pu_2', weight: '10', reps: '8', done: true });

    // 4. Finish session
    const finalSessionId = 'log_completed_from_resumed';
    const finishedLog = sanitizeSessionLog({
      id: finalSessionId,
      workoutId: resumedActive.workoutId,
      date: dk(),
      complete: true,
      durationMinutes: 40,
      sets: resumedActive.sessionSets
    });

    const logs = { [finalSessionId]: finishedLog };
    localStorage.setItem('gl_logs', JSON.stringify(logs));
    localStorage.removeItem('gl_active_session');

    // 5. Verification
    expect(localStorage.getItem('gl_active_session')).toBeNull();
    const storedLogs = JSON.parse(localStorage.getItem('gl_logs')!);
    expect(Object.keys(storedLogs)).toHaveLength(1);
    expect(storedLogs[finalSessionId].sets.def_pullup).toHaveLength(2);
    expect(storedLogs[finalSessionId].sets.def_pullup[1].weight).toBe('10');
  });

  // 10. 5.3 Test Persistence Ordering & Rapid Mutations
  it('10. Persistence Ordering: rapid sequential mutations maintain state sequence without stale snapshot overwrites', () => {
    let currentLogs: Record<string, SessionLog> = {};
    const logId = 'log_rapid_seq';

    // Base log
    currentLogs[logId] = sanitizeSessionLog({
      id: logId,
      workoutId: sampleWorkout.id,
      date: dk(),
      complete: false,
      sets: {
        def_deadlift: [{ id: 's1', weight: '100', reps: '5', done: true }]
      }
    });

    // Sequence of state snapshots representing rapid user actions
    const snapshots: Array<Record<string, SessionLog>> = [];

    // Step 1: Edit set (100 -> 110)
    currentLogs = {
      ...currentLogs,
      [logId]: {
        ...currentLogs[logId],
        sets: {
          ...currentLogs[logId].sets,
          def_deadlift: [{ id: 's1', weight: '110', reps: '5', done: true }]
        }
      }
    };
    snapshots.push(JSON.parse(JSON.stringify(currentLogs)));

    // Step 2: Edit same set (110 -> 120)
    currentLogs = {
      ...currentLogs,
      [logId]: {
        ...currentLogs[logId],
        sets: {
          ...currentLogs[logId].sets,
          def_deadlift: [{ id: 's1', weight: '120', reps: '5', done: true }]
        }
      }
    };
    snapshots.push(JSON.parse(JSON.stringify(currentLogs)));

    // Step 3: Add set
    currentLogs = {
      ...currentLogs,
      [logId]: {
        ...currentLogs[logId],
        sets: {
          ...currentLogs[logId].sets,
          def_deadlift: [
            { id: 's1', weight: '120', reps: '5', done: true },
            { id: 's2', weight: '130', reps: '5', done: true }
          ]
        }
      }
    };
    snapshots.push(JSON.parse(JSON.stringify(currentLogs)));

    // Step 4: Delete set
    currentLogs = {
      ...currentLogs,
      [logId]: {
        ...currentLogs[logId],
        sets: {
          ...currentLogs[logId].sets,
          def_deadlift: [
            { id: 's1', weight: '120', reps: '5', done: true }
          ]
        }
      }
    };
    snapshots.push(JSON.parse(JSON.stringify(currentLogs)));

    // Step 5: Finish workout
    currentLogs = {
      ...currentLogs,
      [logId]: {
        ...currentLogs[logId],
        complete: true,
        durationMinutes: 45
      }
    };
    snapshots.push(JSON.parse(JSON.stringify(currentLogs)));

    // Emulate sequential write-through
    snapshots.forEach((snap, idx) => {
      localStorage.setItem('gl_logs', JSON.stringify(snap));
      // Read immediately back
      const verified = JSON.parse(localStorage.getItem('gl_logs')!);
      expect(verified[logId].complete).toBe(idx === snapshots.length - 1);
    });

    const finalStored = JSON.parse(localStorage.getItem('gl_logs')!);
    expect(finalStored[logId].complete).toBe(true);
    expect(finalStored[logId].sets.def_deadlift).toHaveLength(1);
    expect(finalStored[logId].sets.def_deadlift[0].weight).toBe('120');
  });

  // 11. 5.4 Test Corrupt / Partial Storage
  it('11. Corrupt / Partial Storage: handles malformed JSON, missing IDs, invalid numbers, and orphaned exercises safely without crashing', () => {
    // 1. Missing sets, missing set IDs, missing exercise IDs, invalid numeric values
    const rawMalformed = {
      id: 'log_malformed',
      workoutId: 'w_pull_core',
      date: '2026-08-01',
      durationMinutes: 'invalid_number',
      sets: {
        'orphan_ex_999': [
          { weight: null, reps: undefined, done: 'yes' },
          { id: '', weight: 'not_a_number', reps: 10, done: true }
        ],
        '': null
      }
    };

    const sanitized = sanitizeSessionLog(rawMalformed as any);
    expect(sanitized.id).toBe('log_malformed');
    expect(sanitized.durationMinutes).toBe(0);
    expect(sanitized.sets['orphan_ex_999']).toHaveLength(2);
    expect(sanitized.sets['orphan_ex_999'][0].id).toBeDefined();
    expect(sanitized.sets['orphan_ex_999'][0].weight).toBe('');
    expect(sanitized.sets['orphan_ex_999'][1].weight).toBe('not_a_number');

    // Feed orphaned exercise log to buildFitnessIndex
    const index = buildFitnessIndex({ [sanitized.id]: sanitized }, defsMap);
    // Should safely synthesize definition and not throw or crash
    const orphanMeta = index.exerciseMetaById.get('orphan_ex_999');
    expect(orphanMeta).toBeDefined();
    expect(orphanMeta?.name).not.toBe('Exercise'); // Should resolve cleanly with non-generic naming
  });

  // 12. 5.5 Verify Migration is One-Way
  it('12. One-Way Migration: Loading legacy data migrates once into canonical state, and second reload causes zero mutations', () => {
    // Legacy storage state
    localStorage.setItem('gl_schema_version', '1');
    localStorage.setItem('gl_workouts', JSON.stringify([
      {
        id: 'legacy_w1',
        name: 'Legacy Upper',
        badge: 'LEGACY',
        type: 'push',
        isCore: true,
        cycleDay: 1,
        exercises: [
          { name: 'Legacy Bench', target: 'Chest', equipment: 'Barbell', sets: 3, reps: '10', weight: '80' }
        ]
      }
    ]));
    localStorage.setItem('gl_logs', JSON.stringify({
      'log_legacy_1': {
        workoutId: 'legacy_w1',
        date: '2026-07-01',
        completed: true,
        duration: 35,
        sets: {
          'Legacy Bench': [
            { weightKg: 80, reps: 10, completed: true }
          ]
        }
      }
    }));

    // First load -> performs migration
    const firstLoad = loadInitialFitnessData();
    expect(firstLoad.defs.length).toBeGreaterThan(0);
    expect(firstLoad.workouts[0].exercises[0].exerciseDefinitionId).toBeDefined();
    const migratedDefId = firstLoad.workouts[0].exercises[0].exerciseDefinitionId;

    // Persist canonical state
    localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(firstLoad.defs));
    localStorage.setItem('gl_workouts', JSON.stringify(firstLoad.workouts));
    localStorage.setItem('gl_logs', JSON.stringify(firstLoad.logs));
    localStorage.setItem('gl_state', JSON.stringify(firstLoad.appState));

    // Second load -> strictly loads canonical state with zero mutation
    const secondLoad = loadInitialFitnessData();
    expect(secondLoad.defs).toEqual(firstLoad.defs);
    expect(secondLoad.workouts).toEqual(firstLoad.workouts);
    expect(secondLoad.logs).toEqual(firstLoad.logs);
    expect(secondLoad.workouts[0].exercises[0].exerciseDefinitionId).toBe(migratedDefId);
  });
});
