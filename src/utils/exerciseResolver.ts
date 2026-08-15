import { ExerciseDefinition, Workout, WorkoutExercise, Exercise } from '../types/fitness';
import { generateId } from './generateId';

export const MUSCLE_CATEGORIES = [
  'Chest',
  'Shoulders',
  'Back',
  'Biceps',
  'Triceps',
  'Forearms',
  'Legs',
  'Core'
] as const;

export type MuscleCategory = typeof MUSCLE_CATEGORIES[number];

/**
 * Deliberate non-overlapping muscle category mapping based on target string
 */
export function mapTargetToCategory(targetStr: string | null | undefined): MuscleCategory {
  if (!targetStr) return 'Core';
  const t = targetStr.toLowerCase();

  if (t.includes('tricep')) return 'Triceps';
  if (t.includes('bicep')) return 'Biceps';
  if (t.includes('forearm') || t.includes('grip') || t.includes('wrist')) return 'Forearms';
  if (t.includes('arm')) return 'Biceps';

  if (t.includes('chest') || t.includes('pec')) return 'Chest';
  if (t.includes('shoulder') || t.includes('delt') || t.includes('trap')) return 'Shoulders';
  if (t.includes('back') || t.includes('lat') || t.includes('rhomboid') || t.includes('erector') || t.includes('spine')) return 'Back';
  if (t.includes('quad') || t.includes('hamstring') || t.includes('glute') || t.includes('calf') || t.includes('calves') || t.includes('leg') || t.includes('thigh') || t.includes('adductor')) return 'Legs';
  if (t.includes('core') || t.includes('ab') || t.includes('oblique')) return 'Core';

  return 'Core';
}

export interface ResolvedExerciseMeta {
  id: string;
  name: string;
  target: string;
  category: MuscleCategory;
  tags: string[];
  equipment: string;
  instructions: string;
  isUnknown?: boolean;
}

/**
 * Creates a Map from exerciseDefinition ID to ExerciseDefinition object
 */
export function createExerciseDefinitionMap(defs: ExerciseDefinition[] | undefined | null): Map<string, ExerciseDefinition> {
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

export const EMPTY_RESOLVED_EXERCISE: ResolvedExerciseMeta = {
  id: 'unknown',
  name: 'Unknown Exercise',
  target: 'General',
  category: 'Core',
  tags: [],
  equipment: '',
  instructions: '',
  isUnknown: true
};

/**
 * Canonical exercise identity resolver:
 * exerciseDefinitionId -> ExerciseDefinition -> ResolvedExerciseMeta
 * Never outputs raw IDs as names. When an exercise definition genuinely no longer
 * exists, returns a controlled fallback with "Unknown Exercise" (or "Unlisted Exercise").
 */
export function resolveExercise(
  exerciseDefinitionId: string | null | undefined,
  defsMap: Map<string, ExerciseDefinition> | ExerciseDefinition[]
): ResolvedExerciseMeta {
  const map = Array.isArray(defsMap) ? createExerciseDefinitionMap(defsMap) : defsMap;
  const targetId = exerciseDefinitionId || '';
  const def = targetId ? map.get(targetId) : undefined;

  if (def) {
    return {
      id: def.id,
      name: def.name || 'Unnamed Exercise',
      target: def.target || 'General',
      category: mapTargetToCategory(def.target || 'General'),
      tags: def.tags || [],
      equipment: def.equipment || '',
      instructions: def.instructions || '',
      isUnknown: false
    };
  }

  // Explicit, controlled fallback for orphaned/deleted IDs
  return {
    ...EMPTY_RESOLVED_EXERCISE,
    id: targetId || 'unknown'
  };
}

/**
 * Resolves a WorkoutExercise programming entry with its canonical ExerciseDefinition
 */
export function resolveWorkoutExercise(
  we: WorkoutExercise | any,
  definitionsOrMap: ExerciseDefinition[] | Map<string, ExerciseDefinition> = []
): Exercise {
  const defsMap = Array.isArray(definitionsOrMap)
    ? createExerciseDefinitionMap(definitionsOrMap)
    : definitionsOrMap;

  const defId = we.exerciseDefinitionId || we.exerciseId || we.id;
  const meta = resolveExercise(defId, defsMap);

  return {
    id: meta.id || generateId(),
    exerciseDefinitionId: meta.id,
    name: meta.isUnknown && we.name ? we.name : meta.name,
    target: meta.target,
    equipment: meta.equipment,
    instructions: meta.instructions,
    sets: typeof we.sets === 'number' && we.sets > 0 ? we.sets : 3,
    reps: we.reps || '10–12',
    rest: we.rest || '90s',
    note: we.note || '',
    tags: Array.from(new Set([...(meta.tags || []), ...(we.tags || [])]))
  };
}

// Compound lift priority ranker
const COMPOUND_KEYWORDS = [
  'squat',
  'bench',
  'deadlift',
  'overhead press',
  'ohp',
  'shoulder press',
  'incline',
  'row',
  'pull-up',
  'pullup',
  'chin-up',
  'lat pulldown',
  'leg press',
  'rdl'
];

export function getCompoundScore(name: string): number {
  if (!name) return 0;
  const lower = name.toLowerCase();
  for (let i = 0; i < COMPOUND_KEYWORDS.length; i++) {
    if (lower.includes(COMPOUND_KEYWORDS[i])) {
      return 100 - i;
    }
  }
  return 0;
}

/**
 * Extracts priority and compound exercises based on global ExerciseDefinitions
 */
export function getPriorityExercises(
  defs: ExerciseDefinition[],
  workouts: Workout[],
  defsMap: Map<string, ExerciseDefinition>
): { id: string; name: string; target: string }[] {
  const priorityList: { id: string; name: string; target: string }[] = [];
  const seenIds = new Set<string>();

  // 1. Gather all explicitly tagged priority exercise definitions
  defs.forEach(def => {
    if (def.tags?.includes('priority') && !seenIds.has(def.id)) {
      seenIds.add(def.id);
      priorityList.push({ id: def.id, name: def.name, target: def.target });
    }
  });

  // 2. Check workouts for exercises tagged with priority in programming
  workouts.forEach(wo => {
    (wo.exercises || []).forEach((ex: WorkoutExercise) => {
      if (ex.tags?.includes('priority') && ex.exerciseDefinitionId && !seenIds.has(ex.exerciseDefinitionId)) {
        const meta = resolveExercise(ex.exerciseDefinitionId, defsMap);
        seenIds.add(meta.id);
        priorityList.push({ id: meta.id, name: meta.name, target: meta.target });
      }
    });
  });

  // 3. If priority list is sparse (< 5), collect and rank compound lifts from exercise definitions
  if (priorityList.length < 5) {
    const candidates: { id: string; name: string; target: string; score: number }[] = [];

    defs.forEach(def => {
      if (!seenIds.has(def.id)) {
        const score = getCompoundScore(def.name);
        if (score > 0) {
          candidates.push({ id: def.id, name: def.name, target: def.target, score });
        }
      }
    });

    // Sort by compound relevance score descending
    candidates.sort((a, b) => b.score - a.score);

    for (const cand of candidates) {
      if (priorityList.length >= 6) break;
      if (!seenIds.has(cand.id)) {
        seenIds.add(cand.id);
        priorityList.push({ id: cand.id, name: cand.name, target: cand.target });
      }
    }
  }

  // 4. Fallback: if still under 5, add remaining exercise definitions
  if (priorityList.length < 5) {
    for (const def of defs) {
      if (priorityList.length >= 6) break;
      if (!seenIds.has(def.id)) {
        seenIds.add(def.id);
        priorityList.push({ id: def.id, name: def.name, target: def.target });
      }
    }
  }

  return priorityList;
}
