// Re-export canonical calculations for backwards compatibility and clean architectural boundaries
export {
  sanitizeSetLog,
  sanitizeSessionLog,
  getSortedLogsDescending,
  getCompletedSets,
  getExerciseSets,
  getExerciseVolume,
  getSessionVolume,
  calculateE1RM,
  getHeaviestSet,
  getExerciseHistory,
  getLatestExerciseSession,
  getAllTimeHeaviestSet,
  getAllTimeBestE1RM
} from './fitnessCalculations';
