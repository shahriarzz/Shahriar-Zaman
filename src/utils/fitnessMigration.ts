import { Workout, SessionLog, AppState, WorkoutExercise, ExerciseDefinition } from '../types/fitness';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { dk, generateId } from './fitnessHelpers';

// Extract exercise definitions from workouts if migrating from legacy data
export function extractExerciseDefinitionsFromWorkouts(
  rawWorkouts: any[],
  existingDefs?: ExerciseDefinition[]
): { defs: ExerciseDefinition[]; workouts: Workout[] } {
  const defMap = new Map<string, ExerciseDefinition>();
  const nameToIdMap = new Map<string, string>();

  // Pre-seed with INITIAL_EXERCISE_DEFINITIONS
  INITIAL_EXERCISE_DEFINITIONS.forEach(def => {
    defMap.set(def.id, { ...def });
    if (def.name) {
      nameToIdMap.set(def.name.trim().toLowerCase(), def.id);
    }
  });

  // Seed with existingDefs if provided
  if (Array.isArray(existingDefs)) {
    existingDefs.forEach(def => {
      defMap.set(def.id, { ...def });
      if (def.name) {
        nameToIdMap.set(def.name.trim().toLowerCase(), def.id);
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
          tags: ex.tags || []
        };
        defMap.set(defId, newDef);
        nameToIdMap.set(defName.toLowerCase(), defId);
      }

      return {
        exerciseDefinitionId: defId,
        exerciseId: defId,
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

export function loadInitialFitnessData(): {
  defs: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
} {
  let savedDefs: ExerciseDefinition[] | null = null;
  try {
    const raw = localStorage.getItem('gl_exercise_definitions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) savedDefs = parsed;
    }
  } catch (e) {
    console.error("Failed to parse gl_exercise_definitions", e);
  }

  let rawWorkouts: any[] | null = null;
  try {
    const raw = localStorage.getItem('gl_workouts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) rawWorkouts = parsed;
    }
  } catch (e) {
    console.error("Failed to parse gl_workouts", e);
  }

  const { defs: finalDefs, workouts: migratedWorkouts } = extractExerciseDefinitionsFromWorkouts(
    rawWorkouts || INITIAL_WORKOUTS,
    savedDefs || undefined
  );

  try {
    localStorage.setItem('gl_exercise_definitions', JSON.stringify(finalDefs));
    localStorage.setItem('gl_workouts', JSON.stringify(migratedWorkouts));
  } catch (e) {
    console.warn("Failed to set initial localStorage state", e);
  }

  let logs: Record<string, SessionLog> = {};
  try {
    const raw = localStorage.getItem('gl_logs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([id, logVal]: [string, any]) => {
          logs[id] = {
            ...logVal,
            durationMinutes: Number(logVal.durationMinutes !== undefined ? logVal.durationMinutes : logVal.duration) || 0
          };
        });
      }
    }
  } catch {}

  let appState: AppState = { cycleStart: dk() };
  try {
    const raw = localStorage.getItem('gl_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.cycleStart === 'string') {
        appState = parsed;
      }
    }
  } catch {}

  return {
    defs: finalDefs,
    workouts: migratedWorkouts,
    logs,
    appState
  };
}
