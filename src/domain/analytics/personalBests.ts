import { SessionLog, ExerciseDefinition } from '../../types/fitness';
import { getResolvedExerciseMeta } from '../selectors/exerciseSelectors';
import { calcEpley1RM } from './e1rm';

export interface PersonalBestRecord {
  exerciseId: string;
  name: string;
  target: string;
  maxWeight: number;
  maxE1RM: number;
  date: string;
}

export function calculatePersonalBests(
  logs: Record<string, SessionLog>,
  defsMap: Map<string, ExerciseDefinition>
): PersonalBestRecord[] {
  const recordsMap = new Map<string, PersonalBestRecord>();

  Object.values(logs || {}).forEach(log => {
    if (log && log.complete && log.sets) {
      Object.entries(log.sets).forEach(([exKey, sets]) => {
        if (Array.isArray(sets)) {
          sets.forEach(s => {
            if (s.done) {
              const w = parseFloat(s.weight) || 0;
              const r = parseFloat(s.reps) || 0;
              const e1rm = calcEpley1RM(w, r);

              const meta = getResolvedExerciseMeta(exKey, defsMap);
              const existing = recordsMap.get(meta.id);

              if (!existing || e1rm > existing.maxE1RM) {
                recordsMap.set(meta.id, {
                  exerciseId: meta.id,
                  name: meta.name,
                  target: meta.target,
                  maxWeight: w,
                  maxE1RM: e1rm,
                  date: log.date
                });
              }
            }
          });
        }
      });
    }
  });

  return Array.from(recordsMap.values()).sort((a, b) => b.maxE1RM - a.maxE1RM);
}
