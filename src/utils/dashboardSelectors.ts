// Re-export canonical calculations for dashboard
export {
  formatDateStr,
  calculateStreak,
  calculateTotalWeightLifted,
  getSortedWeightEntries,
  getWeightSparklineData,
  getRelativeTimeString
} from './fitnessCalculations';

export type { SparklineData } from './fitnessCalculations';
