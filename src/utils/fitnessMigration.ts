import { Workout, SessionLog, AppState, WorkoutExercise, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { dk, generateId } from './fitnessHelpers';

// Extract exercise definitions from workouts if migrating legacy data
export function extractExerciseDefinitionsFromWorkouts(
  rawWorkouts: any[],
  existingDefs?: ExerciseDefinition[]
): { defs: ExerciseDefinition[]; workouts: Workout[] } {
  const defMap = new Map<string, ExerciseDefinition>();
  const nameToIdMap = new Map<string, string>();

  // Pre-seed with existingDefs if provided
  if (Array.isArray(existingDefs)) {
    existingDefs.forEach(def => {
      if (def && def.id) {
        defMap.set(def.id, { ...def });
        if (def.name) {
          nameToIdMap.set(def.name.trim().toLowerCase(), def.id);
        }
      }
    });
  }

  const migratedWorkouts: Workout[] = (rawWorkouts || []).map(w => {
    const migratedExercises: WorkoutExercise[] = (w.exercises || []).map((ex: any) => {
      let defId = ex.exerciseDefinitionId || ex.exerciseId || ex.id;

      // If no explicit ID or if ID not in defMap, check if name matches an existing definition
      if (ex.name && (!defId || !defMap.has(defId))) {
        const lowerName = ex.name.trim().toLowerCase();
        if (nameToIdMap.has(lowerName)) {
          defId = nameToIdMap.get(lowerName)!;
        }
      }

      if (!defId) {
        defId = `ex-${generateId()}`;
      }

      if (!defMap.has(defId)) {
        const defName = ex.name?.trim() || 'Exercise';
        const newDef: ExerciseDefinition = {
          id: defId,
          name: defName,
          target: ex.target || 'General',
          equipment: ex.equipment || '',
          instructions: ex.instructions || '',
          tags: Array.isArray(ex.tags) ? ex.tags : []
        };
        defMap.set(defId, newDef);
        nameToIdMap.set(defName.toLowerCase(), defId);
      }

      return {
        exerciseDefinitionId: defId,
        sets: typeof ex.sets === 'number' ? ex.sets : 3,
        reps: ex.reps || '10–12',
        rest: ex.rest || '90s',
        note: ex.note || '',
        tags: Array.isArray(ex.tags) ? ex.tags : []
      };
    });

    return {
      ...w,
      exercises: migratedExercises
    };
  });

  return {
    defs: Array.from(defMap.values()),
    workouts: migratedWorkouts
  };
}

export function migrateV1ToV2(raw: {
  rawDefs: ExerciseDefinition[] | null;
  rawWorkouts: Workout[] | null;
  rawLogs: Record<string, SessionLog> | null;
  rawState: any | null;
}): {
  defs: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
} {
  // 1. Resolve exercise definitions & workouts
  let initialDefs = raw.rawDefs ?? undefined;
  
  // If rawDefs is null and rawWorkouts is null, seed with INITIAL_EXERCISE_DEFINITIONS
  if (raw.rawDefs === null && raw.rawWorkouts === null) {
    initialDefs = INITIAL_EXERCISE_DEFINITIONS;
  }

  const workoutsToMigrate = raw.rawWorkouts !== null ? raw.rawWorkouts : (raw.rawDefs === null ? INITIAL_WORKOUTS : []);

  const { defs: finalDefs, workouts: migratedWorkouts } = extractExerciseDefinitionsFromWorkouts(
    workoutsToMigrate,
    initialDefs
  );

  // 2. Resolve logs
  const logs: Record<string, SessionLog> = {};
  if (raw.rawLogs && typeof raw.rawLogs === 'object') {
    Object.entries(raw.rawLogs).forEach(([id, logVal]: [string, any]) => {
      if (logVal && typeof logVal === 'object') {
        const cleanSets: Record<string, any> = {};
        if (logVal.sets && typeof logVal.sets === 'object') {
          Object.entries(logVal.sets).forEach(([exKey, setList]: [string, any]) => {
            if (Array.isArray(setList)) {
              cleanSets[exKey] = setList.map((s: any) => ({
                id: s.id || generateId(),
                weight: String(s.weight ?? s.weightKg ?? '0'),
                reps: String(s.reps ?? '0'),
                done: Boolean(s.done ?? s.completed)
              }));
            }
          });
        }

        logs[id] = {
          id,
          workoutId: logVal.workoutId || '',
          date: logVal.date || dk(),
          sets: cleanSets,
          complete: Boolean(logVal.complete),
          durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
        };
      }
    });
  }

  // 3. Resolve AppState
  let appState: AppState = { cycleStart: dk() };
  if (raw.rawState && typeof raw.rawState === 'object') {
    const cycleStart = typeof raw.rawState.cycleStart === 'string' ? raw.rawState.cycleStart : dk();
    let weightLog: Record<string, number> = {};

    if (raw.rawState.weightLog && typeof raw.rawState.weightLog === 'object') {
      weightLog = { ...raw.rawState.weightLog };
    } else if (Array.isArray(raw.rawState.bodyWeightLogs)) {
      raw.rawState.bodyWeightLogs.forEach((entry: any) => {
        if (entry && entry.date && typeof entry.weightKg === 'number') {
          weightLog[entry.date] = entry.weightKg;
        }
      });
    }

    appState = {
      cycleStart,
      weightLog
    };
  }

  return {
    defs: finalDefs,
    workouts: migratedWorkouts,
    logs,
    appState
  };
}

export function loadInitialFitnessData(): {
  defs: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
} {
  const defsKey = localStorage.getItem('gl_exercise_definitions');
  const workoutsKey = localStorage.getItem('gl_workouts');
  const logsKey = localStorage.getItem('gl_logs');
  const stateKey = localStorage.getItem('gl_state');
  const versionKey = localStorage.getItem('gl_schema_version');

  // Check if first-time launch (none of the core keys exist in localStorage)
  const isFirstInstall = defsKey === null && workoutsKey === null && logsKey === null && stateKey === null;

  if (isFirstInstall) {
    const seedDefs = [...INITIAL_EXERCISE_DEFINITIONS];
    const seedWorkouts = [...INITIAL_WORKOUTS];
    const seedLogs: Record<string, SessionLog> = {};
    const seedState: AppState = { cycleStart: dk() };

    try {
      localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
      localStorage.setItem('gl_exercise_definitions', JSON.stringify(seedDefs));
      localStorage.setItem('gl_workouts', JSON.stringify(seedWorkouts));
      localStorage.setItem('gl_logs', JSON.stringify(seedLogs));
      localStorage.setItem('gl_state', JSON.stringify(seedState));
    } catch (e) {
      console.warn("Failed to persist initial installation data", e);
    }

    return {
      defs: seedDefs,
      workouts: seedWorkouts,
      logs: seedLogs,
      appState: seedState
    };
  }

  // Parse keys safely and detect corrupted entries
  let rawDefs: ExerciseDefinition[] | null = null;
  if (defsKey !== null) {
    try {
      const parsed = JSON.parse(defsKey);
      if (Array.isArray(parsed)) {
        rawDefs = parsed; // Preserves empty array [] if intentionally emptied
      } else {
        console.error("Corrupted gl_exercise_definitions data detected in localStorage");
      }
    } catch (e) {
      console.error("Failed to parse gl_exercise_definitions", e);
    }
  }

  let rawWorkouts: Workout[] | null = null;
  if (workoutsKey !== null) {
    try {
      const parsed = JSON.parse(workoutsKey);
      if (Array.isArray(parsed)) {
        rawWorkouts = parsed; // Preserves empty array [] if intentionally emptied
      } else {
        console.error("Corrupted gl_workouts data detected in localStorage");
      }
    } catch (e) {
      console.error("Failed to parse gl_workouts", e);
    }
  }

  let rawLogs: Record<string, SessionLog> | null = null;
  if (logsKey !== null) {
    try {
      const parsed = JSON.parse(logsKey);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rawLogs = parsed;
      } else {
        console.error("Corrupted gl_logs data detected in localStorage");
      }
    } catch (e) {
      console.error("Failed to parse gl_logs", e);
    }
  }

  let rawState: any | null = null;
  if (stateKey !== null) {
    try {
      const parsed = JSON.parse(stateKey);
      if (parsed && typeof parsed === 'object') {
        rawState = parsed;
      } else {
        console.error("Corrupted gl_state data detected in localStorage");
      }
    } catch (e) {
      console.error("Failed to parse gl_state", e);
    }
  }

  // Execute explicit migration
  const migrated = migrateV1ToV2({
    rawDefs,
    rawWorkouts,
    rawLogs,
    rawState
  });

  // Save migrated data and version tag
  try {
    localStorage.setItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(migrated.defs));
    localStorage.setItem('gl_workouts', JSON.stringify(migrated.workouts));
    localStorage.setItem('gl_logs', JSON.stringify(migrated.logs));
    localStorage.setItem('gl_state', JSON.stringify(migrated.appState));
  } catch (e) {
    console.warn("Failed to update localStorage with migrated data", e);
  }

  return migrated;
}
