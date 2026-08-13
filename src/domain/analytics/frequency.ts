import { SessionLog, ExerciseDefinition } from '../../types/fitness';
import { getResolvedExerciseMeta } from '../selectors/exerciseSelectors';
import { mapTargetToCategory } from './volume';

export function calculateMostFrequentExercises(
  logs: Record<string, SessionLog>,
  defsMap: Map<string, ExerciseDefinition>,
  limit: number = 8
): Array<{ id: string; name: string; count: number; category: string }> {
  const counts = new Map<string, number>();

  Object.values(logs || {}).forEach(log => {
    if (log && log.complete && log.sets) {
      Object.keys(log.sets).forEach(exKey => {
        counts.set(exKey, (counts.get(exKey) || 0) + 1);
      });
    }
  });

  const sorted = Array.from(counts.entries())
    .map(([exKey, count]) => {
      const meta = getResolvedExerciseMeta(exKey, defsMap);
      return {
        id: meta.id,
        name: meta.name,
        count,
        category: mapTargetToCategory(meta.target)
      };
    })
    .sort((a, b) => b.count - a.count);

  return sorted.slice(0, limit);
}
