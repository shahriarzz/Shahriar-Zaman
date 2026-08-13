import { useActiveSession } from './useActiveSession';
import { calculateActiveSessionProgress } from '../domain';

export function useFitnessSession() {
  const activeSessionData = useActiveSession();

  const progress = activeSessionData.activeSession
    ? calculateActiveSessionProgress({
        id: 'active',
        workoutId: activeSessionData.activeSession.workoutId,
        date: new Date().toISOString().split('T')[0],
        sets: activeSessionData.activeSession.sessionSets,
        complete: false,
        durationMinutes: 0
      })
    : { completedSets: 0, totalSets: 0, percentage: 0 };

  return {
    ...activeSessionData,
    progress
  };
}
