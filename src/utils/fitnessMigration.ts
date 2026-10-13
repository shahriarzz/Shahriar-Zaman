import { Workout, SessionLog, AppState, WorkoutExercise, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { dk, generateId } from './fitnessHelpers';
import { sanitizeSessionLog } from './fitnessCalculations';

// Extract exercise definitions from workouts if migrating legacy data
export function canonicalizeWorkoutExercise(
  rawEx: any,
  fallbackDefMap?: Map<string, ExerciseDefinition>,
  nameToIdMap?: Map<string, string>
): WorkoutExercise {
  if (!rawEx || typeof rawEx !== 'object') {
    return {
      exerciseDefinitionId: `ex-${generateId()}`,
      sets: 3,
      reps: '10–12',
      rest: '90s',
      note: '',
      tags: []
    };
  }

  // Legacy V1 compatibility only.
  // Canonical runtime identifier is exerciseDefinitionId.
  let defId = rawEx.exerciseDefinitionId || rawEx.exerciseId || rawEx.id;

  if (rawEx.name && nameToIdMap && (!defId || (fallbackDefMap && !fallbackDefMap.has(defId)))) {
    const lowerName = String(rawEx.name).trim().toLowerCase();
    if (nameToIdMap.has(lowerName)) {
      defId = nameToIdMap.get(lowerName)!;
    }
  }

  if (!defId) {
    defId = `ex-${generateId()}`;
  }

  return {
    exerciseDefinitionId: defId,
    sets: typeof rawEx.sets === 'number' && rawEx.sets > 0 ? rawEx.sets : 3,
    reps: String(rawEx.reps || '10–12'),
    rest: String(rawEx.rest || '90s'),
    note: String(rawEx.note || ''),
    tags: Array.isArray(rawEx.tags) ? rawEx.tags : []
  };
}

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
      const canonicalEx = canonicalizeWorkoutExercise(ex, defMap, nameToIdMap);
      const defId = canonicalEx.exerciseDefinitionId;

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

      return canonicalEx;
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
        logs[id] = sanitizeSessionLog({
          ...logVal,
          id
        });
      }
    });
  }

  // 3. Resolve AppState
  let appState: AppState = { cycleStart: dk() };
  if (raw.rawState && typeof raw.rawState === 'object') {
    const cycleStart = typeof raw.rawState.cycleStart === 'string' ? raw.rawState.cycleStart : dk();
    let weightLog: Record<string, number | { weight: number; updatedAt: number }> = {};

    if (raw.rawState.weightLog && typeof raw.rawState.weightLog === 'object') {
      weightLog = { ...raw.rawState.weightLog };
    } else if (Array.isArray(raw.rawState.bodyWeightLogs)) {
      raw.rawState.bodyWeightLogs.forEach((entry: any) => {
        if (entry && entry.date && typeof entry.weightKg === 'number') {
          weightLog[entry.date] = { weight: entry.weightKg, updatedAt: Number(entry.timestamp) || 0 };
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

export function validateAndSanitizeFitnessData(parsed: any): {
  success: boolean;
  message?: string;
  data?: {
    schemaVersion: number;
    exportDate?: string;
    exerciseDefinitions: ExerciseDefinition[];
    workouts: Workout[];
    logs: Record<string, SessionLog>;
    appState: AppState;
  };
} {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, message: 'Invalid JSON file structure.' };
  }

  // Detect schema version
  const rawVersion = parsed.schemaVersion ?? parsed.version;
  const version = typeof rawVersion === 'number' ? rawVersion : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      success: false,
      message: `Unsupported backup schema version (v${version}). Please update GainLog to import this file.`
    };
  }

  let rawDefs: any[] | null = null;
  let rawWorkouts: any[] | null = null;
  let rawLogs: any = null;
  let rawState: any = null;

  if (version === 2 && Array.isArray(parsed.exerciseDefinitions)) {
    rawDefs = parsed.exerciseDefinitions;
    rawWorkouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    rawLogs = parsed.logs || {};
    rawState = parsed.appState || null;
  } else if (Array.isArray(parsed.workouts)) {
    // Legacy v1 backup format
    rawDefs = Array.isArray(parsed.exerciseDefinitions) ? parsed.exerciseDefinitions : null;
    rawWorkouts = parsed.workouts;
    rawLogs = parsed.logs || {};
    rawState = parsed.appState || null;
  } else {
    return {
      success: false,
      message: 'Unrecognized backup format. File missing workouts or exerciseDefinitions array.'
    };
  }

  // Perform migration/normalization
  const migrated = migrateV1ToV2({
    rawDefs,
    rawWorkouts,
    rawLogs,
    rawState
  });

  // Ensure orphan-reference prevention across all workouts and logs
  const defMap = new Map<string, ExerciseDefinition>();
  migrated.defs.forEach(d => {
    if (d && d.id) defMap.set(d.id, { ...d });
  });

  const sanitizedWorkouts: Workout[] = migrated.workouts.map(w => {
    const sanitizedExercises: WorkoutExercise[] = (w.exercises || []).map((ex: any) => {
      const canonicalEx = canonicalizeWorkoutExercise(ex, defMap);
      const defId = canonicalEx.exerciseDefinitionId;

      // If definition missing from defMap, auto-create fallback definition to prevent orphan references
      if (!defMap.has(defId)) {
        const fallbackDef: ExerciseDefinition = {
          id: defId,
          name: ex.name?.trim() || 'Exercise',
          target: ex.target || 'General',
          equipment: ex.equipment || '',
          instructions: ex.instructions || '',
          tags: Array.isArray(ex.tags) ? ex.tags : []
        };
        defMap.set(defId, fallbackDef);
      }

      return canonicalEx;
    });

    return {
      id: w.id || generateId(),
      name: w.name || 'Workout',
      badge: w.badge || 'WORKOUT',
      type: w.type || 'custom',
      exercises: sanitizedExercises,
      cardio: w.cardio ?? null,
      cycleDay: typeof w.cycleDay === 'number' ? w.cycleDay : null,
      isCore: Boolean(w.isCore),
      restNotes: Array.isArray(w.restNotes) ? w.restNotes : []
    };
  });

  // Also check logs for exercise keys and synthesize definitions if missing
  Object.values(migrated.logs || {}).forEach(log => {
    if (log && log.sets && typeof log.sets === 'object') {
      Object.keys(log.sets).forEach(exDefId => {
        if (!defMap.has(exDefId)) {
          defMap.set(exDefId, {
            id: exDefId,
            name: 'Exercise',
            target: 'General',
            equipment: '',
            instructions: '',
            tags: []
          });
        }
      });
    }
  });

  const finalDefs = Array.from(defMap.values());

  return {
    success: true,
    data: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportDate: parsed.exportDate || new Date().toISOString(),
      exerciseDefinitions: finalDefs,
      workouts: sanitizedWorkouts,
      logs: migrated.logs,
      appState: migrated.appState
    }
  };
}

export interface ValidatedSnapshotData {
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
}

/**
 * Validates the schema version and full snapshot structure strictly.
 * Rejects objects with missing fields, wrong types, or unsupported schema versions.
 */
export function validateSnapshotStructure(candidate: unknown): ValidatedSnapshotData | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const obj = candidate as Record<string, any>;
  
  // 1. Validate schemaVersion: must be positive number <= CURRENT_SCHEMA_VERSION
  const schemaVer = obj.schemaVersion;
  if (typeof schemaVer !== 'number' || !Number.isFinite(schemaVer) || schemaVer <= 0 || schemaVer > CURRENT_SCHEMA_VERSION) {
    return null;
  }

  // 2. Extract inner data payload or root
  const data = (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) ? obj.data : obj;

  // 3. Validate required fields existence and types
  if (!Array.isArray(data.exerciseDefinitions)) {
    return null;
  }
  if (!Array.isArray(data.workouts)) {
    return null;
  }
  if (!data.logs || typeof data.logs !== 'object' || Array.isArray(data.logs)) {
    return null;
  }
  if (!data.appState || typeof data.appState !== 'object' || Array.isArray(data.appState)) {
    return null;
  }

  // 4. Validate array contents are valid objects with basic required properties
  const defsValid = data.exerciseDefinitions.every((d: any) => 
    d && typeof d === 'object' && typeof d.id === 'string' && typeof d.name === 'string'
  );
  const workoutsValid = data.workouts.every((w: any) => 
    w && typeof w === 'object' && typeof w.id === 'string' && typeof w.name === 'string'
  );

  if (!defsValid || !workoutsValid) {
    return null;
  }

  return {
    exerciseDefinitions: data.exerciseDefinitions,
    workouts: data.workouts,
    logs: data.logs,
    appState: data.appState
  };
}

export function loadInitialFitnessData(): {
  defs: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
} {
  // 1. Check canonical database snapshot
  const snapshotKey = localStorage.getItem('gl_database_snapshot');
  let hasValidSnapshot = false;

  if (snapshotKey !== null) {
    try {
      const parsedSnapshot = JSON.parse(snapshotKey);
      const validated = validateSnapshotStructure(parsedSnapshot);
      if (validated) {
        hasValidSnapshot = true;
        const migrated = migrateV1ToV2({
          rawDefs: validated.exerciseDefinitions,
          rawWorkouts: validated.workouts,
          rawLogs: validated.logs,
          rawState: validated.appState
        });
        return migrated;
      } else {
        // Snapshot failed structure or schema validation; preserve as recoverable backup
        console.warn("Invalid snapshot structure in gl_database_snapshot; backing up and attempting recovery.");
        try {
          localStorage.setItem('gl_corrupt_snapshot_backup', snapshotKey);
        } catch {
          // Best effort backup
        }
      }
    } catch (e) {
      console.error("Corrupted gl_database_snapshot JSON, backing up and checking staging / discrete keys:", e);
      try {
        localStorage.setItem('gl_corrupt_snapshot_backup', snapshotKey);
      } catch {
        // Best effort backup
      }
    }
  }

  // 2. Check staging snapshot for crash recovery
  const stagingKey = localStorage.getItem('gl_snapshot_staging');
  if (stagingKey !== null && !hasValidSnapshot) {
    try {
      const parsedStaging = JSON.parse(stagingKey);
      const validatedStaging = validateSnapshotStructure(parsedStaging);
      if (validatedStaging) {
        console.info("Recovered state from valid gl_snapshot_staging; promoting to canonical snapshot.");
        try {
          localStorage.setItem('gl_database_snapshot', stagingKey);
          localStorage.removeItem('gl_snapshot_staging');
        } catch {
          // Proceed with recovered data
        }
        const migrated = migrateV1ToV2({
          rawDefs: validatedStaging.exerciseDefinitions,
          rawWorkouts: validatedStaging.workouts,
          rawLogs: validatedStaging.logs,
          rawState: validatedStaging.appState
        });
        return migrated;
      }
    } catch (e) {
      console.warn("Failed to parse gl_snapshot_staging during recovery:", e);
    }
  }

  const defsKey = localStorage.getItem('gl_exercise_definitions');
  const workoutsKey = localStorage.getItem('gl_workouts');
  const logsKey = localStorage.getItem('gl_logs');
  const stateKey = localStorage.getItem('gl_state');
  const versionKey = localStorage.getItem('gl_schema_version');

  // Check if first-time launch (none of the core keys exist in localStorage)
  const isFirstInstall = defsKey === null && workoutsKey === null && logsKey === null && stateKey === null && snapshotKey === null && stagingKey === null;

  if (isFirstInstall) {
    const seedDefs = [...INITIAL_EXERCISE_DEFINITIONS];
    const seedWorkouts = [...INITIAL_WORKOUTS];
    const seedLogs: Record<string, SessionLog> = {};
    const seedState: AppState = { cycleStart: dk() };

    try {
      const versionedPayload = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        timestamp: Date.now(),
        data: {
          exerciseDefinitions: seedDefs,
          workouts: seedWorkouts,
          logs: seedLogs,
          appState: seedState
        }
      };
      localStorage.setItem('gl_database_snapshot', JSON.stringify(versionedPayload));
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

  // Sequentially persist migrated data: canonical snapshot payload first, followed by the schema version tag and legacy discrete keys
  try {
    const versionedPayload = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      timestamp: Date.now(),
      data: {
        exerciseDefinitions: migrated.defs,
        workouts: migrated.workouts,
        logs: migrated.logs,
        appState: migrated.appState
      }
    };
    localStorage.setItem('gl_database_snapshot', JSON.stringify(versionedPayload));
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
