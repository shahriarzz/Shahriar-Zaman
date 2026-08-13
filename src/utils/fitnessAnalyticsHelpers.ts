// Re-export canonical exercise identity and analytics calculations
export {
  MUSCLE_CATEGORIES,
  mapTargetToCategory,
  createExerciseDefinitionMap,
  resolveExercise,
  resolveExercise as getResolvedExerciseMeta,
  getPriorityExercises,
  getCompoundScore
} from './exerciseResolver';

export type {
  MuscleCategory,
  ResolvedExerciseMeta
} from './exerciseResolver';

export {
  calculateE1RM,
  calculateE1RM as calcEpley1RM
} from './fitnessCalculations';
