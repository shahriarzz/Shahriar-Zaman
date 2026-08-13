import { ExerciseDefinition, Workout, WorkoutExercise } from '../../types/fitness';

export function createExerciseDefinitionMap(defs: ExerciseDefinition[]): Map<string, ExerciseDefinition> {
  const map = new Map<string, ExerciseDefinition>();
  if (Array.isArray(defs)) {
    defs.forEach(def => {
      if (def && def.id) {
        map.set(def.id, def);
      }
    });
  }
  return map;
}

export function getResolvedExerciseMeta(
  exKey: string,
  defsMap: Map<string, ExerciseDefinition>
): { id: string; name: string; target: string; equipment: string; tags: string[]; isUnresolved?: boolean } {
  if (!exKey) {
    return {
      id: 'unknown',
      name: 'Unspecified Exercise',
      target: 'General',
      equipment: '',
      tags: [],
      isUnresolved: true
    };
  }

  const found = defsMap.get(exKey);
  if (found) {
    return {
      id: found.id,
      name: found.name,
      target: found.target || 'General',
      equipment: found.equipment || '',
      tags: found.tags || [],
      isUnresolved: false
    };
  }

  // If not found in definitions map, preserve key as ID and formatting
  const formattedName = exKey.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return {
    id: exKey,
    name: formattedName || 'Custom Exercise',
    target: 'General',
    equipment: '',
    tags: [],
    isUnresolved: false
  };
}

export function getPriorityExercises(
  defs: ExerciseDefinition[],
  workouts: Workout[],
  defsMap: Map<string, ExerciseDefinition>
): ExerciseDefinition[] {
  const priorityList: ExerciseDefinition[] = [];
  const addedIds = new Set<string>();

  // 1. Explicit priority tags
  defs.forEach(d => {
    if (d.tags?.includes('priority') || d.tags?.includes('compound')) {
      priorityList.push(d);
      addedIds.add(d.id);
    }
  });

  // 2. Exercises used in core workouts
  workouts.forEach(w => {
    if (w.isCore && w.exercises) {
      w.exercises.forEach(ex => {
        const defId = ex.exerciseDefinitionId;
        if (defId && !addedIds.has(defId)) {
          const def = defsMap.get(defId);
          if (def) {
            priorityList.push(def);
            addedIds.add(defId);
          }
        }
      });
    }
  });

  // 3. Fallback to first 5 defs if list empty
  if (priorityList.length === 0) {
    defs.slice(0, 5).forEach(d => {
      if (!addedIds.has(d.id)) {
        priorityList.push(d);
        addedIds.add(d.id);
      }
    });
  }

  return priorityList;
}

export function resolveWorkoutExercise(
  ex: WorkoutExercise,
  defsMap: Map<string, ExerciseDefinition>
): ExerciseDefinition & WorkoutExercise {
  const def = defsMap.get(ex.exerciseDefinitionId) || {
    id: ex.exerciseDefinitionId,
    name: 'Exercise',
    target: 'General',
    equipment: '',
    instructions: '',
    tags: ex.tags || []
  };

  return {
    ...def,
    ...ex
  };
}
