import { SessionLog } from '../../types/fitness';

export function calculateActiveSessionProgress(session: SessionLog): { completedSets: number; totalSets: number; percentage: number } {
  if (!session || !session.sets) return { completedSets: 0, totalSets: 0, percentage: 0 };
  let totalSets = 0;
  let completedSets = 0;

  Object.values(session.sets).forEach(setArray => {
    if (Array.isArray(setArray)) {
      setArray.forEach(s => {
        totalSets++;
        if (s.done) completedSets++;
      });
    }
  });

  const percentage = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  return { completedSets, totalSets, percentage };
}
