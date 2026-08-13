import { SessionLog, ExerciseDefinition } from '../../types/fitness';
import { getResolvedExerciseMeta } from '../selectors/exerciseSelectors';

export function calcEpley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export function calculateExercise1RMTimeline(
  logs: Record<string, SessionLog>,
  exerciseId: string,
  defsMap: Map<string, ExerciseDefinition>
): Array<{ date: string; e1RM: number; weight: number; reps: number }> {
  if (!exerciseId) return [];

  const timeline: Array<{ date: string; e1RM: number; weight: number; reps: number }> = [];

  const sortedLogs = Object.values(logs || {})
    .filter(l => l && l.complete && l.sets && l.sets[exerciseId])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedLogs.forEach(log => {
    const sets = log.sets[exerciseId] || [];
    let maxE1RM = 0;
    let maxW = 0;
    let maxR = 0;

    sets.forEach(s => {
      if (s.done) {
        const w = parseFloat(s.weight) || 0;
        const r = parseFloat(s.reps) || 0;
        const est = calcEpley1RM(w, r);
        if (est > maxE1RM) {
          maxE1RM = est;
          maxW = w;
          maxR = r;
        }
      }
    });

    if (maxE1RM > 0) {
      timeline.push({
        date: log.date,
        e1RM: maxE1RM,
        weight: maxW,
        reps: maxR
      });
    }
  });

  return timeline;
}
