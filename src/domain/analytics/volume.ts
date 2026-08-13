import { SessionLog, ExerciseDefinition } from '../../types/fitness';
import { getResolvedExerciseMeta } from '../selectors/exerciseSelectors';
import { calculateSessionVolume } from '../selectors/logSelectors';
import { subDays, parseISO, isAfter } from 'date-fns';

export function calculateVolumeByTimeframe(
  logs: Record<string, SessionLog>,
  days: number = 30
): Array<{ date: string; volume: number }> {
  const cutoff = subDays(new Date(), days);
  const result: Array<{ date: string; volume: number }> = [];

  const filteredLogs = Object.values(logs || {})
    .filter(l => l && l.complete && isAfter(parseISO(l.date), cutoff))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  filteredLogs.forEach(log => {
    const vol = calculateSessionVolume(log);
    result.push({
      date: log.date,
      volume: vol
    });
  });

  return result;
}

export function calculateMuscleGroupVolumeDistribution(
  logs: Record<string, SessionLog>,
  defsMap: Map<string, ExerciseDefinition>
): Record<string, number> {
  const distribution: Record<string, number> = {
    Chest: 0,
    Back: 0,
    Legs: 0,
    Shoulders: 0,
    Arms: 0,
    Core: 0
  };

  Object.values(logs || {}).forEach(log => {
    if (log && log.complete && log.sets) {
      Object.entries(log.sets).forEach(([exKey, sets]) => {
        if (Array.isArray(sets)) {
          const meta = getResolvedExerciseMeta(exKey, defsMap);
          const target = meta.target || 'Chest';
          const cat = mapTargetToCategory(target);

          sets.forEach(s => {
            if (s.done) {
              const w = parseFloat(s.weight) || 0;
              const r = parseFloat(s.reps) || 0;
              distribution[cat] = (distribution[cat] || 0) + (w * r);
            }
          });
        }
      });
    }
  });

  return distribution;
}

export function mapTargetToCategory(targetStr: string): string {
  if (!targetStr) return 'Chest';
  const lower = targetStr.toLowerCase();
  if (lower.includes('chest') || lower.includes('pec')) return 'Chest';
  if (lower.includes('back') || lower.includes('lat') || lower.includes('trap') || lower.includes('rhomboid')) return 'Back';
  if (lower.includes('quad') || lower.includes('hamstring') || lower.includes('glute') || lower.includes('calf') || lower.includes('leg')) return 'Legs';
  if (lower.includes('shoulder') || lower.includes('deltoid')) return 'Shoulders';
  if (lower.includes('bicep') || lower.includes('tricep') || lower.includes('forearm') || lower.includes('arm')) return 'Arms';
  if (lower.includes('abs') || lower.includes('core') || lower.includes('oblique')) return 'Core';
  return 'Chest';
}
