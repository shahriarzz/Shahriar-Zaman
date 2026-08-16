// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ExerciseDefinition, Workout, SessionLog, SetLog, AppState } from '../types/fitness';
import {
  calculateVolume,
  calculateSetVolume,
  calculateSetsVolume,
  calculateE1RM,
  getCompletedSets,
  dk,
  sanitizeSetLog,
  sanitizeSessionLog
} from '../utils/fitnessCalculations';
import {
  buildFitnessIndex,
  selectSortedLogs,
  selectLifetimeStats,
  selectPersonalBests,
  selectPersonalBestForExercise,
  selectExerciseHistory,
  selectMuscleDistribution,
  selectExerciseFrequency
} from '../utils/fitnessDerivedSelectors';
import {
  createExerciseDefinitionMap,
  resolveExercise
} from '../utils/exerciseResolver';
import { ActiveSession } from '../hooks/useActiveSession';

describe('End-to-End Session Data-Flow Regression Test Suite', () => {
  const sampleDefinitions: ExerciseDefinition[] = [
    { id: 'def_bench_press', name: 'Barbell Bench Press', target: 'Chest', equipment: 'Barbell' },
    { id: 'def_incline_db', name: 'Incline Dumbbell Press', target: 'Upper Chest', equipment: 'Dumbbells' },
    { id: 'def_tricep_pushdown', name: 'Cable Tricep Pushdown', target: 'Triceps', equipment: 'Cable' }
  ];

  const sampleWorkout: Workout = {
    id: 'w_push_hypertrophy',
    name: 'Push Hypertrophy Day',
    badge: 'PUSH A',
    type: 'push',
    isCore: true,
    cycleDay: 1,
    exercises: [
      { exerciseDefinitionId: 'def_bench_press', sets: 3, reps: '8-10', rest: '90s', note: 'Pause on chest' },
      { exerciseDefinitionId: 'def_incline_db', sets: 3, reps: '10-12', rest: '60s' },
      { exerciseDefinitionId: 'def_tricep_pushdown', sets: 3, reps: '12-15', rest: '60s' }
    ]
  };

  const defsMap = createExerciseDefinitionMap(sampleDefinitions);

  beforeEach(() => {
    localStorage.clear();
  });

  it('executes a complete end-to-end workout lifecycle: start -> expand -> log -> edit -> delete -> finish -> reload -> verify consistency across Dashboard, History, Analytics', () => {
    const sessionDate = dk();
    const sessionId = `log_${sessionDate}_${sampleWorkout.id}`;

    // 1. STARTS A PROGRAMMED WORKOUT (initialize ActiveSession)
    const initialActiveSession: ActiveSession = {
      workoutId: sampleWorkout.id,
      startTime: Date.now() - 45 * 60 * 1000, // 45 minutes ago
      sessionSets: {
        def_bench_press: [
          { id: 'set_bench_1', weight: '', reps: '', done: false },
          { id: 'set_bench_2', weight: '', reps: '', done: false },
          { id: 'set_bench_3', weight: '', reps: '', done: false }
        ],
        def_incline_db: [
          { id: 'set_inc_1', weight: '', reps: '', done: false },
          { id: 'set_inc_2', weight: '', reps: '', done: false },
          { id: 'set_inc_3', weight: '', reps: '', done: false }
        ],
        def_tricep_pushdown: [
          { id: 'set_tri_1', weight: '', reps: '', done: false },
          { id: 'set_tri_2', weight: '', reps: '', done: false },
          { id: 'set_tri_3', weight: '', reps: '', done: false }
        ]
      }
    };

    // Store active session in persistence during workout
    localStorage.setItem('gl_active_session', JSON.stringify(initialActiveSession));

    // 3. LOGS MULTIPLE SETS
    const activeSets = { ...initialActiveSession.sessionSets };
    // Log Set 1 for Bench Press: 100kg x 8 reps (done: true)
    activeSets.def_bench_press[0] = { id: 'set_bench_1', weight: '100', reps: '8', done: true };
    // Log Set 2 for Bench Press: 100kg x 8 reps (done: true)
    activeSets.def_bench_press[1] = { id: 'set_bench_2', weight: '100', reps: '8', done: true };
    // Log Set 3 for Bench Press: 105kg x 6 reps (done: true)
    activeSets.def_bench_press[2] = { id: 'set_bench_3', weight: '105', reps: '6', done: true };
    // Add extra Set 4 for Bench Press: 110kg x 4 reps (done: true)
    activeSets.def_bench_press.push({ id: 'set_bench_4', weight: '110', reps: '4', done: true });

    // Also log Incline DB sets
    activeSets.def_incline_db[0] = { id: 'set_inc_1', weight: '32', reps: '10', done: true };
    activeSets.def_incline_db[1] = { id: 'set_inc_2', weight: '32', reps: '10', done: true };

    // 4. EDITS ONE SET (Change Set 2 of Bench from 100kg x 8 to 102.5kg x 8)
    activeSets.def_bench_press[1] = { id: 'set_bench_2', weight: '102.5', reps: '8', done: true };

    // 5. DELETES ONE SET (Delete Set 4 of Bench)
    activeSets.def_bench_press = activeSets.def_bench_press.filter(s => s.id !== 'set_bench_4');

    expect(activeSets.def_bench_press).toHaveLength(3);
    expect(activeSets.def_bench_press[1].weight).toBe('102.5');

    // 6. FINISHES THE SESSION
    const completedSessionLog: SessionLog = sanitizeSessionLog({
      id: sessionId,
      workoutId: sampleWorkout.id,
      date: sessionDate,
      complete: true,
      durationMinutes: 45,
      sets: activeSets
    });

    // Save completed session to persistent storage and clear active session
    const logsMap: Record<string, SessionLog> = {
      [sessionId]: completedSessionLog
    };
    localStorage.setItem('gl_logs', JSON.stringify(logsMap));
    localStorage.removeItem('gl_active_session');

    // 7. RELOADS / RECONSTRUCTS APP STATE
    const persistedLogsJson = localStorage.getItem('gl_logs');
    expect(persistedLogsJson).not.toBeNull();
    const reconstructedLogs: Record<string, SessionLog> = JSON.parse(persistedLogsJson!);

    expect(localStorage.getItem('gl_active_session')).toBeNull();
    expect(reconstructedLogs[sessionId]).toBeDefined();

    // Reconstruct canonical FitnessIndex
    const index = buildFitnessIndex(reconstructedLogs, defsMap);

    // 8. VERIFIES HISTORY, DASHBOARD, AND ANALYTICS ALL DERIVE THE SAME UNDERLYING VALUES
    // Bench total volume = 800 + 820 + 630 = 2250 kg
    // Incline total volume = 640 kg
    // Total Session Volume = 2250 + 640 = 2890 kg
    // Total Completed Sets = 3 + 2 = 5 sets

    const expectedSessionVolume = 2890;
    const expectedCompletedSets = 5;
    const expectedBenchBestE1RM = calculateE1RM(102.5, 8); // 129.8

    // A. Direct Session Calculation Check
    const rawSessionVolume = calculateVolume(reconstructedLogs[sessionId]);
    expect(rawSessionVolume).toBe(expectedSessionVolume);

    // B. History Consumer Verification (selectSortedLogs)
    const historyLogs = selectSortedLogs(index);
    expect(historyLogs).toHaveLength(1);
    const historySession = historyLogs[0];
    expect(historySession.id).toBe(sessionId);
    expect(historySession.date).toBe(sessionDate);
    expect(historySession.workoutId).toBe(sampleWorkout.id);
    expect(calculateVolume(historySession)).toBe(expectedSessionVolume);
    expect(getCompletedSets(historySession.sets['def_bench_press'])).toHaveLength(3);
    expect(getCompletedSets(historySession.sets['def_incline_db'])).toHaveLength(2);
    expect(getCompletedSets(historySession.sets['def_tricep_pushdown'])).toHaveLength(0);

    // C. Dashboard Consumer Verification (selectLifetimeStats, selectSortedLogs)
    const dashboardStats = selectLifetimeStats(index);
    expect(dashboardStats.totalSessions).toBe(1);
    expect(dashboardStats.totalVolume).toBe(expectedSessionVolume);
    expect(dashboardStats.totalSets).toBe(expectedCompletedSets);
    expect(dashboardStats.totalMinutes).toBe(45);
    expect(dashboardStats.lastSessionDate).toBe(sessionDate);
    expect(dashboardStats.firstSessionDate).toBe(sessionDate);

    // D. Analytics Consumer Verification (selectPersonalBests, selectMuscleDistribution, selectExerciseFrequency)
    const personalBests = selectPersonalBests(index);
    const benchPB = selectPersonalBestForExercise(index, 'def_bench_press');
    expect(benchPB).not.toBeNull();
    expect(benchPB?.exerciseId).toBe('def_bench_press');
    expect(benchPB?.maxWeight).toBe(102.5);
    expect(benchPB?.repsAtMax).toBe(8);
    expect(benchPB?.maxEpley).toBe(expectedBenchBestE1RM);
    expect(benchPB?.date).toBe(sessionDate);

    const exerciseHistory = selectExerciseHistory(index, 'def_bench_press');
    expect(exerciseHistory).toHaveLength(1);
    expect(exerciseHistory[0].volume).toBe(2250);
    expect(exerciseHistory[0].doneSetsCount).toBe(3);
    expect(exerciseHistory[0].maxW).toBe(105);

    const muscleDist = selectMuscleDistribution(index);
    // Bench Press = Chest (2250 kg, 3 sets), Incline DB = Upper Chest -> Chest (640 kg, 2 sets)
    expect(muscleDist.volume.Chest).toBe(2890);
    expect(muscleDist.sets.Chest).toBe(5);

    const exerciseFreq = selectExerciseFrequency(index);
    const benchFreq = exerciseFreq.find(e => e.exerciseId === 'def_bench_press');
    const inclineFreq = exerciseFreq.find(e => e.exerciseId === 'def_incline_db');
    expect(benchFreq).toEqual({
      exerciseId: 'def_bench_press',
      name: 'Barbell Bench Press',
      category: 'Chest',
      count: 1,
      volume: 2250
    });
    expect(inclineFreq).toEqual({
      exerciseId: 'def_incline_db',
      name: 'Incline Dumbbell Press',
      category: 'Chest',
      count: 1,
      volume: 640
    });

    // E. EXPLICIT INVARIANT VERIFICATIONS:
    // 1. Total Volume
    expect(dashboardStats.totalVolume).toBe(rawSessionVolume);
    expect(index.volumeByDate[sessionDate]).toBe(expectedSessionVolume);
    expect(index.volumeByWorkout[sampleWorkout.id]).toBe(expectedSessionVolume);

    // 2. Sets and Reps
    const benchSets = historySession.sets['def_bench_press'];
    expect(benchSets[0]).toEqual({ id: 'set_bench_1', weight: '100', reps: '8', done: true });
    expect(benchSets[1]).toEqual({ id: 'set_bench_2', weight: '102.5', reps: '8', done: true });
    expect(benchSets[2]).toEqual({ id: 'set_bench_3', weight: '105', reps: '6', done: true });

    // 3. Exercise Identity
    const resolvedBench = resolveExercise('def_bench_press', defsMap);
    expect(resolvedBench.id).toBe('def_bench_press');
    expect(resolvedBench.name).toBe('Barbell Bench Press');
    expect(resolvedBench.category).toBe('Chest');

    const resolvedIncline = resolveExercise('def_incline_db', defsMap);
    expect(resolvedIncline.id).toBe('def_incline_db');
    expect(resolvedIncline.name).toBe('Incline Dumbbell Press');
    expect(resolvedIncline.category).toBe('Chest');

    // 4. Session Date
    expect(historySession.date).toBe(sessionDate);
    expect(index.distinctDates).toEqual([sessionDate]);

    // 5. e1RM
    expect(benchPB?.maxEpley).toBe(129.8);

    // 6. Personal Best
    expect(personalBests.find(pb => pb.exerciseId === 'def_bench_press')?.maxEpley).toBe(129.8);

    // 7. Workout/Session count
    expect(dashboardStats.totalSessions).toBe(1);
    expect(dashboardStats.measuredSessionsCount).toBe(1);
    expect(index.logsByWorkout[sampleWorkout.id]).toHaveLength(1);
  });
});
