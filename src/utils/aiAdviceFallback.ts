export interface FallbackSet {
  weight: string | number;
  reps: string | number;
  done?: boolean;
}

export interface FallbackSession {
  date?: string;
  sets?: FallbackSet[];
}

/**
 * Generates an intelligent, deterministic progressive overload coaching tip
 * directly on device when the backend AI endpoint is unreachable or offline.
 */
export function generateClientCoachingFallback(
  exerciseName: string,
  targetReps: string,
  history: FallbackSession[] = []
): string {
  const cleanName = exerciseName || 'this movement';
  const cleanReps = targetReps || '8–12';

  if (!history || history.length === 0) {
    return `[Offline Coach] Establish a solid baseline for ${cleanName} targeting ${cleanReps} controlled reps. Prioritize strict form and a steady tempo.`;
  }

  const lastSession = history[0];
  const lastSets = (lastSession?.sets || []).filter(s => s.done !== false);

  if (lastSets.length > 0) {
    const topSet = lastSets[0];
    const topWeight = parseFloat(String(topSet.weight)) || 0;
    const topReps = parseInt(String(topSet.reps), 10) || 0;

    if (topWeight > 0 && topReps >= 8) {
      return `[Offline Coach] Previous session: ${topWeight}kg × ${topReps} reps on ${cleanName}. If you achieve target reps across all working sets today, advance load by 2.5kg. Otherwise, maintain load and emphasize controlled eccentrics.`;
    } else if (topWeight > 0) {
      return `[Offline Coach] Keep load at ${topWeight}kg for ${cleanName}. Focus on hitting your full target of ${cleanReps} reps with solid mechanical tension.`;
    }
  }

  return `[Offline Coach] Focus on progressive tension on ${cleanName}. Maintain strict bracing and full range of motion.`;
}
