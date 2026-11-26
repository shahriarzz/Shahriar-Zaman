import { Workout, SessionLog, AppState, WorkoutExercise, ExerciseDefinition, CURRENT_SCHEMA_VERSION } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { dk, generateId } from './fitnessHelpers';
import { sanitizeSessionLog, isValidCalendarDate } from './fitnessCalculations';
import {
  SafeStorageError,
  probeLocalStorageWritable,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
} from '../lib/safeStorage';

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
    const rawCycleStart = raw.rawState.cycleStart;
    const cycleStart = isValidCalendarDate(rawCycleStart) ? rawCycleStart : dk();
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

export type CanonicalSnapshotEnvelope =
  | { status: 'storage_unavailable'; error: string }
  | { status: 'missing' }
  | { status: 'corrupt' }
  | {
      status: 'ok';
      snapshot: ValidatedSnapshotData;
      lastReconciliationOperationId: string | null;
      resetOrigin: boolean;
    };

export type LocalFitnessStorageState =
  | 'storage_unavailable'
  | 'missing'
  | 'valid'
  | 'corrupt'
  | 'staging_recoverable';

export interface LocalFitnessStorageInspection {
  state: LocalFitnessStorageState;
  error?: SafeStorageError;
}

/**
 * Inspects local browser storage initialization state without modifying user data.
 * Distinguishes inaccessible storage from an empty first-install database,
 * valid canonical data, recoverable staged data, and corrupt payloads.
 */
export function inspectLocalFitnessStorage(): LocalFitnessStorageInspection {
  const snapshotRes = safeGetItem('gl_database_snapshot');
  if (!snapshotRes.ok) {
    return { state: 'storage_unavailable', error: snapshotRes.error };
  }

  if (snapshotRes.value !== null) {
    try {
      const parsedSnapshot = JSON.parse(snapshotRes.value);
      if (validateSnapshotStructure(parsedSnapshot)) {
        return { state: 'valid' };
      }
    } catch {
      // Fall through to check staging recovery before classifying as corrupt
    }
  }

  const stagingRes = safeGetItem('gl_snapshot_staging');
  if (!stagingRes.ok) {
    return { state: 'storage_unavailable', error: stagingRes.error };
  }

  if (stagingRes.value !== null) {
    try {
      const parsedStaging = JSON.parse(stagingRes.value);
      if (validateSnapshotStructure(parsedStaging)) {
        return { state: 'staging_recoverable' };
      }
    } catch {
      // Staging is corrupt as well
    }
  }

  if (snapshotRes.value !== null || stagingRes.value !== null) {
    return { state: 'corrupt' };
  }

  const defsRes = safeGetItem('gl_exercise_definitions');
  if (!defsRes.ok) return { state: 'storage_unavailable', error: defsRes.error };
  const workoutsRes = safeGetItem('gl_workouts');
  if (!workoutsRes.ok) return { state: 'storage_unavailable', error: workoutsRes.error };
  const logsRes = safeGetItem('gl_logs');
  if (!logsRes.ok) return { state: 'storage_unavailable', error: logsRes.error };
  const stateRes = safeGetItem('gl_state');
  if (!stateRes.ok) return { state: 'storage_unavailable', error: stateRes.error };

  const allMissing =
    defsRes.value === null &&
    workoutsRes.value === null &&
    logsRes.value === null &&
    stateRes.value === null;

  if (allMissing) {
    const probe = probeLocalStorageWritable();
    if (!probe.ok) {
      return { state: 'storage_unavailable', error: probe.error };
    }
    return { state: 'missing' };
  }

  try {
    if (defsRes.value !== null && !Array.isArray(JSON.parse(defsRes.value))) {
      return { state: 'corrupt' };
    }
    if (workoutsRes.value !== null && !Array.isArray(JSON.parse(workoutsRes.value))) {
      return { state: 'corrupt' };
    }
    if (logsRes.value !== null) {
      const parsedLogs = JSON.parse(logsRes.value);
      if (!parsedLogs || typeof parsedLogs !== 'object' || Array.isArray(parsedLogs)) {
        return { state: 'corrupt' };
      }
    }
    if (stateRes.value !== null) {
      const parsedState = JSON.parse(stateRes.value);
      if (!parsedState || typeof parsedState !== 'object' || Array.isArray(parsedState)) {
        return { state: 'corrupt' };
      }
    }
    return { state: 'valid' };
  } catch {
    return { state: 'corrupt' };
  }
}

/**
 * Reads and validates the canonical local snapshot envelope (`gl_database_snapshot`)
 * including its durable reconciliation metadata (`lastReconciliationOperationId`, `resetOrigin`).
 */
export function readCanonicalSnapshotEnvelope(): CanonicalSnapshotEnvelope {
  const readRes = safeGetItem('gl_database_snapshot');
  if (!readRes.ok) {
    return { status: 'storage_unavailable', error: readRes.error.message };
  }
  const snapshotKey = readRes.value;
  if (snapshotKey === null) {
    return { status: 'missing' };
  }
  try {
    const parsedSnapshot = JSON.parse(snapshotKey);
    const validated = validateSnapshotStructure(parsedSnapshot);
    if (!validated) {
      return { status: 'corrupt' };
    }
    const rawOpId = (parsedSnapshot as Record<string, unknown>).lastReconciliationOperationId;
    const rawResetOrigin = (parsedSnapshot as Record<string, unknown>).resetOrigin;
    return {
      status: 'ok',
      snapshot: validated,
      lastReconciliationOperationId: typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : null,
      resetOrigin: rawResetOrigin === true
    };
  } catch {
    return { status: 'corrupt' };
  }
}

export function loadInitialFitnessData(): {
  defs: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
} {
  // 1. Check canonical database snapshot via SafeStorage (never swallow access errors)
  const snapshotRead = safeGetItem('gl_database_snapshot');
  if (!snapshotRead.ok) {
    throw snapshotRead.error;
  }
  const snapshotKey = snapshotRead.value;
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

        // If the stored anchor was invalid or missing, persist the repaired state once through persistence boundary
        if (!isValidCalendarDate(validated.appState?.cycleStart)) {
          const rawOpId = (parsedSnapshot as Record<string, unknown>).lastReconciliationOperationId;
          const rawResetOrigin = (parsedSnapshot as Record<string, unknown>).resetOrigin;
          const versionedPayload: Record<string, unknown> = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            timestamp: Date.now(),
            data: {
              exerciseDefinitions: migrated.defs,
              workouts: migrated.workouts,
              logs: migrated.logs,
              appState: migrated.appState
            }
          };
          if (typeof rawOpId === 'string' || rawOpId === null) {
            versionedPayload.lastReconciliationOperationId = rawOpId;
          }
          if (typeof rawResetOrigin === 'boolean') {
            versionedPayload.resetOrigin = rawResetOrigin;
          }
          safeSetItem('gl_database_snapshot', JSON.stringify(versionedPayload));
          safeSetItem('gl_state', JSON.stringify(migrated.appState));
        }

        return migrated;
      } else {
        // Snapshot failed structure or schema validation; preserve as recoverable backup
        console.warn("Invalid snapshot structure in gl_database_snapshot; backing up and attempting recovery.");
        safeSetItem('gl_corrupt_snapshot_backup', snapshotKey);
      }
    } catch (e) {
      console.error("Corrupted gl_database_snapshot JSON, backing up and checking staging / discrete keys:", e);
      safeSetItem('gl_corrupt_snapshot_backup', snapshotKey);
    }
  }

  // 2. Check staging snapshot for crash recovery
  const stagingRead = safeGetItem('gl_snapshot_staging');
  if (!stagingRead.ok) {
    throw stagingRead.error;
  }
  const stagingKey = stagingRead.value;
  if (stagingKey !== null && !hasValidSnapshot) {
    try {
      const parsedStaging = JSON.parse(stagingKey);
      const validatedStaging = validateSnapshotStructure(parsedStaging);
      if (validatedStaging) {
        console.info("Recovered state from valid gl_snapshot_staging; promoting to canonical snapshot.");
        const promoted = safeSetItem('gl_database_snapshot', stagingKey);
        if (promoted.ok) {
          safeRemoveItem('gl_snapshot_staging');
        }
        const migrated = migrateV1ToV2({
          rawDefs: validatedStaging.exerciseDefinitions,
          rawWorkouts: validatedStaging.workouts,
          rawLogs: validatedStaging.logs,
          rawState: validatedStaging.appState
        });

        if (!isValidCalendarDate(validatedStaging.appState?.cycleStart)) {
          const rawOpId = (parsedStaging as Record<string, unknown>).lastReconciliationOperationId;
          const rawResetOrigin = (parsedStaging as Record<string, unknown>).resetOrigin;
          const versionedPayload: Record<string, unknown> = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            timestamp: Date.now(),
            data: {
              exerciseDefinitions: migrated.defs,
              workouts: migrated.workouts,
              logs: migrated.logs,
              appState: migrated.appState
            }
          };
          if (typeof rawOpId === 'string' || rawOpId === null) {
            versionedPayload.lastReconciliationOperationId = rawOpId;
          }
          if (typeof rawResetOrigin === 'boolean') {
            versionedPayload.resetOrigin = rawResetOrigin;
          }
          safeSetItem('gl_database_snapshot', JSON.stringify(versionedPayload));
          safeSetItem('gl_state', JSON.stringify(migrated.appState));
        }

        return migrated;
      }
    } catch (e) {
      console.warn("Failed to parse gl_snapshot_staging during recovery:", e);
    }
  }

  const defsRead = safeGetItem('gl_exercise_definitions');
  if (!defsRead.ok) throw defsRead.error;
  const workoutsRead = safeGetItem('gl_workouts');
  if (!workoutsRead.ok) throw workoutsRead.error;
  const logsRead = safeGetItem('gl_logs');
  if (!logsRead.ok) throw logsRead.error;
  const stateRead = safeGetItem('gl_state');
  if (!stateRead.ok) throw stateRead.error;

  const defsKey = defsRead.value;
  const workoutsKey = workoutsRead.value;
  const logsKey = logsRead.value;
  const stateKey = stateRead.value;

  // Check if first-time launch (none of the core keys exist in readable localStorage)
  const isFirstInstall =
    defsKey === null &&
    workoutsKey === null &&
    logsKey === null &&
    stateKey === null &&
    snapshotKey === null &&
    stagingKey === null;

  if (isFirstInstall) {
    const seedDefs = [...INITIAL_EXERCISE_DEFINITIONS];
    const seedWorkouts = [...INITIAL_WORKOUTS];
    const seedLogs: Record<string, SessionLog> = {};
    const seedState: AppState = { cycleStart: dk() };

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
    const serializedSnapshot = JSON.stringify(versionedPayload);
    const snapWrite = safeSetItem('gl_database_snapshot', serializedSnapshot);
    if (!snapWrite.ok) {
      throw snapWrite.error;
    }
    const readBack = safeGetItem('gl_database_snapshot');
    if (!readBack.ok) {
      throw readBack.error;
    }
    if (readBack.value !== serializedSnapshot) {
      throw new SafeStorageError(
        'storage_unavailable',
        'probe',
        'Initial installation snapshot write could not be verified in localStorage.',
        'gl_database_snapshot'
      );
    }

    safeSetItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    safeSetItem('gl_exercise_definitions', JSON.stringify(seedDefs));
    safeSetItem('gl_workouts', JSON.stringify(seedWorkouts));
    safeSetItem('gl_logs', JSON.stringify(seedLogs));
    safeSetItem('gl_state', JSON.stringify(seedState));

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
  const migratedSnapWrite = safeSetItem('gl_database_snapshot', JSON.stringify(versionedPayload));
  if (!migratedSnapWrite.ok) {
    console.warn("Failed to update localStorage with migrated data", migratedSnapWrite.error);
  } else {
    safeSetItem('gl_schema_version', String(CURRENT_SCHEMA_VERSION));
    safeSetItem('gl_exercise_definitions', JSON.stringify(migrated.defs));
    safeSetItem('gl_workouts', JSON.stringify(migrated.workouts));
    safeSetItem('gl_logs', JSON.stringify(migrated.logs));
    safeSetItem('gl_state', JSON.stringify(migrated.appState));
  }

  return migrated;
}
