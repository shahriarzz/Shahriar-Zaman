import { SessionLog, ExerciseDefinition, Workout } from '../../types/fitness';
import { getCompletedSessionsCount, getTrainingStreak } from '../selectors/logSelectors';
import { calculatePersonalBests } from './personalBests';

export interface PerformanceInsight {
  id: string;
  title: string;
  description: string;
  type: 'positive' | 'neutral' | 'warning';
}

export function generatePerformanceInsights(
  logs: Record<string, SessionLog>,
  defsMap: Map<string, ExerciseDefinition>,
  workouts: Workout[]
): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];
  const completedCount = getCompletedSessionsCount(logs);
  const streak = getTrainingStreak(logs);
  const pbs = calculatePersonalBests(logs, defsMap);

  if (completedCount === 0) {
    insights.push({
      id: 'no-history',
      title: 'Ready to Begin',
      description: 'Log your first workout session to start unlocking performance metrics and insights.',
      type: 'neutral'
    });
    return insights;
  }

  if (streak >= 3) {
    insights.push({
      id: 'streak-high',
      title: 'Consistency Spike',
      description: `You have logged ${streak} consistent training cycles. Excellent momentum!`,
      type: 'positive'
    });
  } else if (streak === 0) {
    insights.push({
      id: 'streak-zero',
      title: 'Recovery Window',
      description: 'It has been more than 3 days since your last recorded session. Time for the next workout!',
      type: 'warning'
    });
  }

  if (pbs.length > 0) {
    const topPB = pbs[0];
    insights.push({
      id: 'top-pb',
      title: `Top Lift: ${topPB.name}`,
      description: `Estimated 1RM peak at ${topPB.maxE1RM} kg (${topPB.maxWeight} kg achieved on ${topPB.date}).`,
      type: 'positive'
    });
  }

  return insights;
}
