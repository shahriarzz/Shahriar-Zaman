import { format, parseISO, subDays, differenceInCalendarDays, isValid, startOfWeek, startOfDay, isSameDay, eachDayOfInterval } from 'date-fns';
import { SessionLog, SetLog, Workout, ExerciseDefinition } from '../types/fitness';
import {
  calculateSetVolume,
  calculateSetsVolume,
  calculateE1RM,
  getSortedLogsDescending,
  getSortedWeightEntries,
  getWeightSparklineData,
  getCycleDay,
  SparklineData
} from './fitnessCalculations';

export type { SparklineData };
import {
  createExerciseDefinitionMap,
  resolveExercise,
  MuscleCategory,
  MUSCLE_CATEGORIES,
  ResolvedExerciseMeta
} from './exerciseResolver';

export interface PersonalBestRecord {
  exerciseId: string;
  exerciseName: string;
  maxWeight: number;
  repsAtMax: number;
  maxEpley: number;
  date: string;
  category: MuscleCategory;
}

export interface ExerciseFrequencyStat {
  exerciseId: string;
  name: string;
  count: number;
  volume: number;
  category: MuscleCategory;
}

export interface MuscleDistributionStats {
  volume: Record<MuscleCategory, number>;
  sets: Record<MuscleCategory, number>;
  frequency: Record<MuscleCategory, number>;
  totalVolume: number;
  totalSets: number;
}

export interface LifetimeStats {
  totalSessions: number;
  totalVolume: number;
  totalSets: number;
  totalMinutes: number;
  measuredSessionsCount: number;
  currentStreak: number;
  longestStreak: number;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
}

export interface WeightSummaryData {
  currentWeight: string | number;
  weightEntries: [string, number][];
  recentWeightLogs: [string, number][];
  sparklineData: SparklineData | null;
}

export interface ExerciseSessionHistoryEntry {
  date: string;
  sets: SetLog[];
  logId: string;
  maxW: number;
  maxE1RM: number;
  volume: number;
  doneSetsCount: number;
  category: MuscleCategory;
  exerciseName: string;
}

export interface E1RMProgressionPoint {
  date: string;
  displayDate: string;
  epley1RM: number;
  setDetail: string;
}

/**
 * Reusable single-exercise indexed entry constructed in the canonical pass.
 */
export interface ExerciseIndexEntry {
  exerciseId: string;
  name: string;
  category: MuscleCategory;
  resolvedExercise: ResolvedExerciseMeta;
  sessions: ExerciseSessionHistoryEntry[];
  latestSession: ExerciseSessionHistoryEntry | null;
  completedSets: { date: string; set: SetLog; logId: string }[];
  totalVolume: number;
  sessionCount: number;
  maxWeight: number;
  heaviestSet: { weight: number; reps: string; date: string } | null;
  bestE1RM: PersonalBestRecord | null;
  progression: E1RMProgressionPoint[];
}

/**
 * High-performance canonical index of fitness data.
 * Constructed in a single O(N) pass over session logs.
 */
export interface FitnessIndex {
  sortedLogsDescending: SessionLog[];
  sortedLogsAscending: SessionLog[];
  logsByDate: Map<string, SessionLog[]>;
  distinctDates: string[];
  volumeByDate: Record<string, number>;
  setsByDate: Record<string, number>;
  totalSetsByDate: Record<string, number>;
  exerciseMetaById: Map<string, ResolvedExerciseMeta>;
  logsByWorkout: Record<string, SessionLog[]>;
  sessionsByExercise: Record<string, ExerciseSessionHistoryEntry[]>;
  volumeByWorkout: Record<string, number>;
  setsByWorkout: Record<string, number>;
  muscleFrequencyByDate: Record<string, Record<MuscleCategory, number>>;
  exerciseIndex: Map<string, ExerciseIndexEntry>;
  historyByExercise: Map<string, ExerciseSessionHistoryEntry[]>;
  completedSetsByExercise: Map<string, { date: string; set: SetLog; logId: string }[]>;
  volumeByExercise: Map<string, number>;
  volumeByMuscle: Record<MuscleCategory, number>;
  setsByMuscle: Record<MuscleCategory, number>;
  frequencyByMuscle: Record<MuscleCategory, number>;
  frequencyByExercise: ExerciseFrequencyStat[];
  personalBests: PersonalBestRecord[];
  personalBestsMap: Map<string, PersonalBestRecord>;
  e1rmHistoryByExercise: Map<string, E1RMProgressionPoint[]>;
  lifetimeStats: LifetimeStats;
  weeklyVolumeMap: Record<string, number>;
  biggestWeek: { weekStr: string; volume: number };
}

/**
 * Internal helper to calculate current consecutive workout day streak.
 */
function computeCurrentStreak(logs: SessionLog[], referenceDate: Date = new Date()): number {
  const datesSet = new Set(logs.map(l => l?.date).filter(Boolean));
  if (datesSet.size === 0) return 0;

  let streak = 0;
  const checkDate = new Date(referenceDate);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  let checkStr = formatDate(checkDate);

  if (!datesSet.has(checkStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    checkStr = formatDate(checkDate);
    if (!datesSet.has(checkStr)) {
      return 0;
    }
  }

  while (datesSet.has(formatDate(checkDate))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

/**
 * Internal helper to calculate longest consecutive workout day streak.
 */
function computeLongestStreak(logs: SessionLog[]): number {
  const distinctDates = Array.from(new Set(logs.map(l => l?.date).filter(Boolean) as string[])).sort();
  if (distinctDates.length === 0) return 0;

  let longestStreak = 0;
  let tempStreak = 0;
  let prevDateObj: Date | null = null;

  distinctDates.forEach(dateStr => {
    const curDateObj = parseISO(dateStr);
    if (isValid(curDateObj)) {
      if (!prevDateObj) {
        tempStreak = 1;
      } else {
        const diff = differenceInCalendarDays(curDateObj, prevDateObj);
        if (diff === 1) {
          tempStreak++;
        } else if (diff > 1) {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDateObj = curDateObj;
    }
  });

  return longestStreak;
}

/**
 * Builds the canonical FitnessIndex in a single, high-performance O(N) traversal.
 */
export function buildFitnessIndex(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  defsMap: Map<string, ExerciseDefinition> = new Map()
): FitnessIndex {
  const rawLogs = Array.isArray(logs) ? logs : Object.values(logs || {});
  
  // Validated logs
  const validLogs = rawLogs.filter(l => {
    if (!l || !l.date) return false;
    const parsed = parseISO(l.date);
    return isValid(parsed);
  });

  const sortedLogsDescending = [...validLogs].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.id || '').localeCompare(a.id || '');
  });

  const sortedLogsAscending = [...sortedLogsDescending].reverse();

  const logsByDate = new Map<string, SessionLog[]>();
  const historyByExercise = new Map<string, ExerciseSessionHistoryEntry[]>();
  const completedSetsByExercise = new Map<string, { date: string; set: SetLog; logId: string }[]>();
  const volumeByExercise = new Map<string, number>();
  const exerciseCountsMap = new Map<string, { count: number; volume: number; name: string; category: MuscleCategory; resolvedMeta: ResolvedExerciseMeta }>();
  const personalBestsMap = new Map<string, PersonalBestRecord>();
  const e1rmHistoryByExercise = new Map<string, E1RMProgressionPoint[]>();
  const weeklyVolumeMap: Record<string, number> = {};

  // Canonical resolution map containing ALL exercise definitions plus any in logs
  const exerciseMetaById = new Map<string, ResolvedExerciseMeta>();
  defsMap.forEach((_, defId) => {
    exerciseMetaById.set(defId, resolveExercise(defId, defsMap));
  });

  // Additional indexed structures populated in single pass
  const volumeByDate: Record<string, number> = {};
  const setsByDate: Record<string, number> = {};
  const totalSetsByDate: Record<string, number> = {};
  const logsByWorkout: Record<string, SessionLog[]> = {};
  const sessionsByExercise: Record<string, ExerciseSessionHistoryEntry[]> = {};
  const volumeByWorkout: Record<string, number> = {};
  const setsByWorkout: Record<string, number> = {};
  const muscleFrequencyByDate: Record<string, Record<MuscleCategory, number>> = {};
  const maxWeightByExercise = new Map<string, number>();
  const heaviestSetByExercise = new Map<string, { weight: number; reps: string; date: string }>();

  const volumeByMuscle: Record<MuscleCategory, number> = {
    Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
  };
  const setsByMuscle: Record<MuscleCategory, number> = {
    Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
  };
  const muscleOccurrence: Record<MuscleCategory, Set<string>> = {
    Chest: new Set(), Shoulders: new Set(), Back: new Set(), Biceps: new Set(), Triceps: new Set(),
    Forearms: new Set(), Legs: new Set(), Core: new Set()
  };

  let totalLifetimeVolume = 0;
  let totalLifetimeSets = 0;
  let totalLifetimeMinutes = 0;
  let measuredLifetimeCount = 0;

  // Single pass over ascending logs (chronological order)
  sortedLogsAscending.forEach(log => {
    let logSessionVol = 0;

    if (log.durationMinutes && log.durationMinutes > 0) {
      totalLifetimeMinutes += log.durationMinutes;
      measuredLifetimeCount++;
    }

    // Index by date
    if (log.date) {
      if (!logsByDate.has(log.date)) {
        logsByDate.set(log.date, []);
      }
      logsByDate.get(log.date)!.push(log);

      if (!muscleFrequencyByDate[log.date]) {
        muscleFrequencyByDate[log.date] = {
          Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
        };
      }
    }

    // Index by workout
    if (log.workoutId) {
      if (!logsByWorkout[log.workoutId]) {
        logsByWorkout[log.workoutId] = [];
      }
      logsByWorkout[log.workoutId].push(log);
    }

    // Process sets in a single pass
    if (log.sets && typeof log.sets === 'object') {
      Object.entries(log.sets).forEach(([exId, setList]) => {
        if (!Array.isArray(setList)) return;
        if (log.date) {
          totalSetsByDate[log.date] = (totalSetsByDate[log.date] || 0) + setList.length;
        }

        const doneSets = setList.filter(s => s && s.done);
        if (doneSets.length === 0) return;

        totalLifetimeSets += doneSets.length;
        if (log.date) {
          setsByDate[log.date] = (setsByDate[log.date] || 0) + doneSets.length;
        }
        if (log.workoutId) {
          setsByWorkout[log.workoutId] = (setsByWorkout[log.workoutId] || 0) + doneSets.length;
        }

        let exMeta = exerciseMetaById.get(exId);
        if (!exMeta) {
          exMeta = resolveExercise(exId, defsMap);
          exerciseMetaById.set(exId, exMeta);
        }
        const normId = exMeta.id;
        if (!exerciseMetaById.has(normId)) {
          exerciseMetaById.set(normId, exMeta);
        }
        const category = exMeta.category;

        if (log.date && muscleFrequencyByDate[log.date]) {
          muscleFrequencyByDate[log.date][category] = (muscleFrequencyByDate[log.date][category] || 0) + 1;
        }

        let exSessionVol = 0;
        let maxWInSession = 0;
        let maxEpleyInSession = 0;
        let maxSetDetailInSession = '';

        doneSets.forEach(s => {
          const w = parseFloat(s.weight) || 0;
          const r = parseInt(s.reps, 10) || 0;
          const setVol = calculateSetVolume(s);
          exSessionVol += setVol;

          if (w > maxWInSession) maxWInSession = w;

          // Single-pass maxWeight tracking across all sessions for this exercise
          const prevExMax = maxWeightByExercise.get(normId) || 0;
          if (w > prevExMax) {
            maxWeightByExercise.set(normId, w);
          }

          if (w > 0) {
            const prevHeaviest = heaviestSetByExercise.get(normId);
            const prevReps = prevHeaviest ? (parseInt(prevHeaviest.reps, 10) || 0) : 0;
            // Canonical PR Rule: Heaviest weight recorded, and highest reps at that maximum weight
            if (!prevHeaviest || w > prevHeaviest.weight || (w === prevHeaviest.weight && r > prevReps)) {
              heaviestSetByExercise.set(normId, {
                weight: w,
                reps: s.reps || '0',
                date: log.date
              });
            }
          }

          if (w > 0 && r > 0) {
            const epley = calculateE1RM(w, r);
            if (epley > maxEpleyInSession) {
              maxEpleyInSession = epley;
              maxSetDetailInSession = `${w}kg × ${r} reps`;
            }

            // All-time personal best check (Weight PR: highest weight, then highest reps at that weight)
            const existingPB = personalBestsMap.get(normId);
            const isPB = !existingPB || w > existingPB.maxWeight || (w === existingPB.maxWeight && r > existingPB.repsAtMax);
            if (isPB) {
              personalBestsMap.set(normId, {
                exerciseId: normId,
                exerciseName: exMeta.name,
                maxWeight: w,
                repsAtMax: r,
                maxEpley: epley,
                date: log.date,
                category
              });
            }
          }

          // Completed sets list
          if (!completedSetsByExercise.has(normId)) {
            completedSetsByExercise.set(normId, []);
          }
          completedSetsByExercise.get(normId)!.push({ date: log.date, set: s, logId: log.id });
        });

        // Accumulate single-pass volume into log session total
        logSessionVol += exSessionVol;

        // Muscle distribution
        volumeByMuscle[category] += exSessionVol;
        setsByMuscle[category] += doneSets.length;
        muscleOccurrence[category].add(log.id);

        // Exercise volume total
        volumeByExercise.set(normId, (volumeByExercise.get(normId) || 0) + exSessionVol);

        // Exercise frequency ranking
        if (!exerciseCountsMap.has(normId)) {
          exerciseCountsMap.set(normId, { count: 0, volume: 0, name: exMeta.name, category, resolvedMeta: exMeta });
        }
        const freqEntry = exerciseCountsMap.get(normId)!;
        freqEntry.count += 1;
        freqEntry.volume += exSessionVol;

        const sessionHistoryItem: ExerciseSessionHistoryEntry = {
          date: log.date,
          sets: doneSets,
          logId: log.id,
          maxW: maxWInSession,
          maxE1RM: maxEpleyInSession,
          volume: exSessionVol,
          doneSetsCount: doneSets.length,
          category,
          exerciseName: exMeta.name
        };

        // Exercise history record
        if (!historyByExercise.has(normId)) {
          historyByExercise.set(normId, []);
        }
        historyByExercise.get(normId)!.push(sessionHistoryItem);

        if (!sessionsByExercise[normId]) {
          sessionsByExercise[normId] = [];
        }
        sessionsByExercise[normId].push(sessionHistoryItem);

        // 1RM progression entry
        if (maxEpleyInSession > 0) {
          if (!e1rmHistoryByExercise.has(normId)) {
            e1rmHistoryByExercise.set(normId, []);
          }
          e1rmHistoryByExercise.get(normId)!.push({
            date: log.date,
            displayDate: format(parseISO(log.date), 'MMM dd'),
            epley1RM: maxEpleyInSession,
            setDetail: maxSetDetailInSession
          });
        }
      });
    }

    // Accumulate total lifetime volume and date/workout/week aggregations from calculated logSessionVol
    totalLifetimeVolume += logSessionVol;

    if (log.date) {
      volumeByDate[log.date] = (volumeByDate[log.date] || 0) + logSessionVol;

      // Weekly volume
      try {
        const parsedDate = parseISO(log.date);
        if (isValid(parsedDate)) {
          const weekStr = format(startOfWeek(parsedDate, { weekStartsOn: 1 }), 'MMM dd, yyyy');
          weeklyVolumeMap[weekStr] = (weeklyVolumeMap[weekStr] || 0) + logSessionVol;
        }
      } catch (_) {}
    }

    if (log.workoutId) {
      volumeByWorkout[log.workoutId] = (volumeByWorkout[log.workoutId] || 0) + logSessionVol;
    }
  });

  // Biggest week ever
  let biggestWeek = { weekStr: 'N/A', volume: 0 };
  Object.entries(weeklyVolumeMap).forEach(([wStr, vol]) => {
    if (vol > biggestWeek.volume) {
      biggestWeek = { weekStr: wStr, volume: vol };
    }
  });

  // Frequency array sorted descending
  const frequencyByExercise: ExerciseFrequencyStat[] = Array.from(exerciseCountsMap.entries()).map(([id, val]) => ({
    exerciseId: id,
    name: val.name,
    count: val.count,
    volume: val.volume,
    category: val.category
  })).sort((a, b) => b.count - a.count || b.volume - a.volume);

  // Personal bests list sorted descending by max estimated 1RM
  const personalBests = Array.from(personalBestsMap.values()).sort((a, b) => b.maxEpley - a.maxEpley);

  // Frequency by muscle
  const frequencyByMuscle: Record<MuscleCategory, number> = {
    Chest: muscleOccurrence.Chest.size,
    Shoulders: muscleOccurrence.Shoulders.size,
    Back: muscleOccurrence.Back.size,
    Biceps: muscleOccurrence.Biceps.size,
    Triceps: muscleOccurrence.Triceps.size,
    Forearms: muscleOccurrence.Forearms.size,
    Legs: muscleOccurrence.Legs.size,
    Core: muscleOccurrence.Core.size
  };

  const distinctDates = Array.from(new Set(sortedLogsAscending.map(l => l.date))).sort();

  // Construct comprehensive exerciseIndex map for O(1) multi-faceted access
  // Uses single-pass maxWeight directly (no 2nd iteration of completedSets!)
  const exerciseIndex = new Map<string, ExerciseIndexEntry>();
  exerciseCountsMap.forEach((freqVal, exId) => {
    const ascendingSessions = historyByExercise.get(exId) || [];
    const sessions = [...ascendingSessions].reverse();
    const latestSession = sessions[0] || null;
    const completedSets = completedSetsByExercise.get(exId) || [];
    const bestE1RM = personalBestsMap.get(exId) || null;
    const progression = e1rmHistoryByExercise.get(exId) || [];
    const maxWeight = maxWeightByExercise.get(exId) || 0;
    const heaviestSet = heaviestSetByExercise.get(exId) || null;

    exerciseIndex.set(exId, {
      exerciseId: exId,
      name: freqVal.name,
      category: freqVal.category,
      resolvedExercise: freqVal.resolvedMeta,
      sessions,
      latestSession,
      completedSets,
      totalVolume: freqVal.volume,
      sessionCount: freqVal.count,
      maxWeight,
      heaviestSet,
      bestE1RM,
      progression
    });
  });

  const lifetimeStats: LifetimeStats = {
    totalSessions: sortedLogsDescending.length,
    totalVolume: totalLifetimeVolume,
    totalSets: totalLifetimeSets,
    totalMinutes: totalLifetimeMinutes,
    measuredSessionsCount: measuredLifetimeCount,
    currentStreak: computeCurrentStreak(validLogs),
    longestStreak: computeLongestStreak(validLogs),
    firstSessionDate: sortedLogsAscending[0]?.date || null,
    lastSessionDate: sortedLogsDescending[0]?.date || null
  };

  return {
    sortedLogsDescending,
    sortedLogsAscending,
    logsByDate,
    distinctDates,
    volumeByDate,
    setsByDate,
    totalSetsByDate,
    exerciseMetaById,
    logsByWorkout,
    sessionsByExercise,
    volumeByWorkout,
    setsByWorkout,
    muscleFrequencyByDate,
    exerciseIndex,
    historyByExercise,
    completedSetsByExercise,
    volumeByExercise,
    volumeByMuscle,
    setsByMuscle,
    frequencyByMuscle,
    frequencyByExercise,
    personalBests,
    personalBestsMap,
    e1rmHistoryByExercise,
    lifetimeStats,
    weeklyVolumeMap,
    biggestWeek
  };
}

// -------------------------------------------------------------
// PURE SELECTORS (Fast, non-allocating reads over pre-computed FitnessIndex)
// -------------------------------------------------------------

export function selectExerciseIndex(
  index: FitnessIndex,
  exerciseDefinitionId: string
): ExerciseIndexEntry | null {
  return index.exerciseIndex.get(exerciseDefinitionId) || null;
}

export function selectSortedLogs(
  index: FitnessIndex
): SessionLog[] {
  return index.sortedLogsDescending;
}

export function selectLifetimeStats(
  index: FitnessIndex
): LifetimeStats {
  return index.lifetimeStats;
}

export function selectPersonalBests(
  index: FitnessIndex
): PersonalBestRecord[] {
  return index.personalBests;
}

export function selectPersonalBestForExercise(
  index: FitnessIndex,
  exerciseDefinitionId: string
): PersonalBestRecord | null {
  return index.personalBestsMap.get(exerciseDefinitionId) || null;
}

export function selectExercisePR(
  index: FitnessIndex,
  exerciseDefinitionId: string
): { weight: number; reps: number; date?: string } | null {
  const entry = index.exerciseIndex.get(exerciseDefinitionId);
  if (!entry || !entry.heaviestSet) return null;
  return {
    weight: entry.heaviestSet.weight,
    reps: parseInt(entry.heaviestSet.reps, 10) || 0,
    date: entry.heaviestSet.date
  };
}

/**
 * Canonical Personal Best evaluator:
 * 1. Heaviest completed weight ever recorded for the exercise.
 * 2. Among sets at that maximum weight, highest reps.
 * 3. A new PR occurs when:
 *    - candidate weight > previous weight
 *    - candidate weight == previous weight AND candidate reps > previous reps
 * 4. Lower weight is never a PR, regardless of reps.
 * 5. Equal weight + equal/lower reps is not a PR.
 */
export function isNewPersonalBest(
  candidate: { weight: number; reps: number | string },
  previous: { weight: number; reps: number | string } | null | undefined
): boolean {
  const cWeight = typeof candidate?.weight === 'number' ? candidate.weight : (parseFloat(candidate?.weight) || 0);
  const cReps = typeof candidate?.reps === 'number' ? candidate.reps : (parseInt(candidate?.reps, 10) || 0);
  if (cWeight <= 0 || cReps <= 0) return false;
  if (!previous || previous.weight <= 0) return true;

  const pWeight = typeof previous.weight === 'number' ? previous.weight : (parseFloat(previous.weight as any) || 0);
  const pReps = typeof previous.reps === 'number' ? previous.reps : (parseInt(previous.reps as any, 10) || 0);

  if (cWeight > pWeight) return true;
  if (cWeight === pWeight && cReps > pReps) return true;
  return false;
}

export function selectExerciseHistory(
  index: FitnessIndex,
  exerciseDefinitionId: string
): ExerciseSessionHistoryEntry[] {
  // Returns descending (newest first)
  const history = index.historyByExercise.get(exerciseDefinitionId) || [];
  return [...history].reverse();
}

export function selectExercise1RMProgression(
  index: FitnessIndex,
  exerciseDefinitionId: string
): E1RMProgressionPoint[] {
  return index.e1rmHistoryByExercise.get(exerciseDefinitionId) || [];
}

export function selectMuscleDistribution(
  index: FitnessIndex
): MuscleDistributionStats {
  return {
    volume: index.volumeByMuscle,
    sets: index.setsByMuscle,
    frequency: index.frequencyByMuscle,
    totalVolume: index.lifetimeStats.totalVolume,
    totalSets: index.lifetimeStats.totalSets
  };
}

export function selectExerciseFrequency(
  index: FitnessIndex
): ExerciseFrequencyStat[] {
  return index.frequencyByExercise;
}

export function selectWeightSummary(
  weightLog: Record<string, number | { weight: number; updatedAt?: number }> | undefined | null
): WeightSummaryData {
  const weightEntries = getSortedWeightEntries(weightLog);
  const currentWeight = weightEntries.length > 0 ? weightEntries[0][1] : '--';
  const recentWeightLogs = weightEntries.slice(0, 5);
  const sparklineData = getWeightSparklineData(weightLog);

  return {
    currentWeight,
    weightEntries,
    recentWeightLogs,
    sparklineData
  };
}

/**
 * Pure selector for time-windowed analytics aggregation without re-calculating primitives
 * Consumes existing workoutMap and coreWorkoutByCycleDayMap without rebuilding maps.
 */
export function selectTimeRangeAnalytics(
  index: FitnessIndex,
  workoutMap: Map<string, Workout>,
  coreWorkoutByCycleDayMap: Map<number, Workout>,
  timeRange: '7d' | '30d' | '90d' | 'all',
  cycleStart?: string | null,
  active1RMExerciseId?: string,
  now: Date | string = new Date()
) {
  const parsedNow = typeof now === 'string' ? parseISO(now) : now;
  const validNow = isValid(parsedNow) ? parsedNow : new Date();
  const todayStr = format(validNow, 'yyyy-MM-dd');
  const startOfToday = startOfDay(validNow);

  // Calculate cutoffs
  let cutoffDateStr: string | null = null;
  let priorCutoffDateStr: string | null = null;

  if (timeRange === '7d') {
    cutoffDateStr = format(subDays(validNow, 6), 'yyyy-MM-dd');
    priorCutoffDateStr = format(subDays(validNow, 13), 'yyyy-MM-dd');
  } else if (timeRange === '30d') {
    cutoffDateStr = format(subDays(validNow, 29), 'yyyy-MM-dd');
    priorCutoffDateStr = format(subDays(validNow, 59), 'yyyy-MM-dd');
  } else if (timeRange === '90d') {
    cutoffDateStr = format(subDays(validNow, 89), 'yyyy-MM-dd');
    priorCutoffDateStr = format(subDays(validNow, 179), 'yyyy-MM-dd');
  }

  const rangeLogs = index.sortedLogsAscending.filter(l => !cutoffDateStr || l.date >= cutoffDateStr);
  const priorLogs = index.sortedLogsAscending.filter(l => {
    if (!cutoffDateStr || !priorCutoffDateStr) return false;
    return l.date >= priorCutoffDateStr && l.date < cutoffDateStr;
  });

  // Calculate range and prior volumes using indexed volumeByDate
  const rangeDates = new Set(rangeLogs.map(l => l.date));
  let rangeVolume = 0;
  rangeDates.forEach(d => {
    rangeVolume += (index.volumeByDate[d] || 0);
  });

  const priorDates = new Set(priorLogs.map(l => l.date));
  let priorVolume = 0;
  priorDates.forEach(d => {
    priorVolume += (index.volumeByDate[d] || 0);
  });

  // Period over period volume change
  let volumePeriodChangePct: number | null = null;
  if (cutoffDateStr && priorVolume > 0) {
    volumePeriodChangePct = Math.round(((rangeVolume - priorVolume) / priorVolume) * 100);
  } else if (cutoffDateStr && priorVolume === 0 && rangeVolume > 0) {
    volumePeriodChangePct = 100;
  }

  // Muscle group and exercise breakdown within the time range aggregated from indexed structures
  const rangeMuscleVolume: Record<MuscleCategory, number> = {
    Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
  };
  const rangeMuscleSets: Record<MuscleCategory, number> = {
    Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
  };
  const rangeMuscleFrequency: Record<MuscleCategory, Set<string>> = {
    Chest: new Set(), Shoulders: new Set(), Back: new Set(), Biceps: new Set(), Triceps: new Set(),
    Forearms: new Set(), Legs: new Set(), Core: new Set()
  };

  const exerciseSessionCounts: Record<string, { name: string; count: number; volume: number }> = {};
  const workoutTypeDistribution: Record<string, number> = {};
  const activeDatesSet = new Set<string>();
  let rangeMeasuredMinutes = 0;
  let rangeMeasuredCount = 0;

  rangeLogs.forEach(log => {
    if (log.durationMinutes && log.durationMinutes > 0) {
      rangeMeasuredMinutes += log.durationMinutes;
      rangeMeasuredCount++;
    }
    if (log.date) activeDatesSet.add(log.date);

    const woMeta = workoutMap.get(log.workoutId);
    const wType = woMeta?.type || 'custom';
    workoutTypeDistribution[wType] = (workoutTypeDistribution[wType] || 0) + 1;
  });

  // Aggregate muscle & exercise stats purely from pre-indexed exercise entries (no raw set traversals or recalculations)
  index.exerciseIndex.forEach((entry, normId) => {
    const rangeSessions = entry.sessions.filter(s => !cutoffDateStr || s.date >= cutoffDateStr);
    if (rangeSessions.length === 0) return;

    let exRangeVol = 0;
    let exRangeSets = 0;
    const category = entry.category;

    rangeSessions.forEach(sess => {
      exRangeVol += sess.volume;
      exRangeSets += sess.doneSetsCount;
      rangeMuscleFrequency[category]?.add(sess.logId);
    });

    rangeMuscleVolume[category] += exRangeVol;
    rangeMuscleSets[category] += exRangeSets;

    exerciseSessionCounts[normId] = {
      name: entry.name,
      count: rangeSessions.length,
      volume: exRangeVol
    };
  });

  // Scheduled Adherence calculation
  const firstLogDate = index.lifetimeStats.firstSessionDate;
  const rangeStartDate = cutoffDateStr
    ? parseISO(cutoffDateStr)
    : (firstLogDate ? parseISO(firstLogDate) : subDays(validNow, 30));
  
  const validRangeStart = isValid(rangeStartDate) ? rangeStartDate : subDays(validNow, 30);
  let intervalStart = validRangeStart;
  let intervalEnd = validNow;
  if (intervalStart > intervalEnd) {
    intervalEnd = intervalStart;
  }
  const dayInterval = (isValid(intervalStart) && isValid(intervalEnd))
    ? eachDayOfInterval({
        start: intervalStart,
        end: intervalEnd
      })
    : [validNow];

  let scheduledCoreWorkouts = 0;
  let completedScheduledCore = 0;
  let scheduledRestDays = 0;
  let missedPastCoreDays = 0;
  let bonusCompletedSessions = 0;
  let isTodayCorePending = false;

  dayInterval.forEach(dayDate => {
    const dateStr = format(dayDate, 'yyyy-MM-dd');
    const isToday = isSameDay(dayDate, now) || dateStr === todayStr;
    const isPast = dayDate < startOfToday && !isToday;

    const cycleDay = getCycleDay(cycleStart, dayDate);
    const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
    const dayLogs = index.logsByDate.get(dateStr) || [];
    const dayVolume = index.volumeByDate[dateStr] || 0;
    const hasCompletedWorkout = dayLogs.some(l => l.complete) || dayVolume > 0;

    const isScheduledCore = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
    const isScheduledRest = expectedWo && expectedWo.type === 'rest';

    if (isScheduledCore) {
      scheduledCoreWorkouts++;
      if (hasCompletedWorkout) {
        completedScheduledCore++;
      } else if (isPast) {
        missedPastCoreDays++;
      } else if (isToday) {
        isTodayCorePending = true;
      }
    } else if (isScheduledRest) {
      scheduledRestDays++;
      if (hasCompletedWorkout) {
        bonusCompletedSessions++;
      }
    } else {
      if (hasCompletedWorkout) {
        bonusCompletedSessions++;
      }
    }
  });

  const baseCoreExpected = Math.max(1, scheduledCoreWorkouts);
  const adherencePct = Math.min(100, Math.round((completedScheduledCore / baseCoreExpected) * 100));
  const avgDuration = rangeMeasuredCount > 0 ? Math.round(rangeMeasuredMinutes / rangeMeasuredCount) : 0;
  const lifetimeHours = index.lifetimeStats.totalMinutes > 0 ? Math.round((index.lifetimeStats.totalMinutes / 60) * 10) / 10 : 0;

  const mostFrequentExercises = Object.values(exerciseSessionCounts)
    .sort((a, b) => b.count - a.count || b.volume - a.volume);

  // Active 1RM Trend
  const active1RMTrend = active1RMExerciseId ? (index.e1rmHistoryByExercise.get(active1RMExerciseId) || []) : [];

  // Days since last workout
  let daysSinceLast = 0;
  if (index.lifetimeStats.lastSessionDate) {
    const parsedLast = parseISO(index.lifetimeStats.lastSessionDate);
    if (isValid(parsedLast)) {
      daysSinceLast = Math.max(0, differenceInCalendarDays(now, parsedLast));
    }
  }

  // Average training gap
  let avgGapDays = 0;
  if (index.sortedLogsAscending.length > 1) {
    let totalGaps = 0;
    let validGapsCount = 0;
    for (let i = 1; i < index.sortedLogsAscending.length; i++) {
      const d1 = parseISO(index.sortedLogsAscending[i - 1].date);
      const d2 = parseISO(index.sortedLogsAscending[i].date);
      if (isValid(d1) && isValid(d2)) {
        const diff = Math.max(0, differenceInCalendarDays(d2, d1));
        totalGaps += diff;
        validGapsCount++;
      }
    }
    if (validGapsCount > 0) {
      avgGapDays = Math.round((totalGaps / validGapsCount) * 10) / 10;
    }
  }

  return {
    totalLogsCount: index.lifetimeStats.totalSessions,
    rangeLogsCount: rangeLogs.length,
    lifetimeVolume: index.lifetimeStats.totalVolume,
    lifetimeSets: index.lifetimeStats.totalSets,
    lifetimeHours,
    firstLogDate: index.lifetimeStats.firstSessionDate,
    lastLogDate: index.lifetimeStats.lastSessionDate,
    rangeVolume,
    priorVolume,
    volumePeriodChangePct,
    activeDaysCount: activeDatesSet.size,
    scheduledCoreWorkouts,
    completedScheduledCore,
    scheduledRestDays,
    missedPastCoreDays,
    bonusCompletedSessions,
    isTodayCorePending,
    adherencePct,
    currentStreak: index.lifetimeStats.currentStreak,
    longestStreak: index.lifetimeStats.longestStreak,
    avgDuration,
    biggestWeek: index.biggestWeek,
    recordsList: index.personalBests,
    rangeMuscleVolume,
    rangeMuscleSets,
    rangeMuscleFrequency,
    mostFrequentExercises,
    workoutTypeDistribution,
    active1RMTrend,
    daysSinceLast,
    avgGapDays
  };
}
