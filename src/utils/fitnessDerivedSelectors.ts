import { format, parseISO, subDays, differenceInCalendarDays, isValid, startOfWeek, startOfDay, isSameDay, eachDayOfInterval } from 'date-fns';
import { SessionLog, SetLog, Workout, ExerciseDefinition } from '../types/fitness';
import {
  calculateVolume,
  calculateSetVolume,
  calculateSetsVolume,
  calculateE1RM,
  calculateStreak,
  calculateLongestStreak,
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
  sessions: ExerciseSessionHistoryEntry[];
  latestSession: ExerciseSessionHistoryEntry | null;
  completedSets: { date: string; set: SetLog; logId: string }[];
  totalVolume: number;
  sessionCount: number;
  maxWeight: number;
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
 * Builds the canonical FitnessIndex in a single, high-performance O(N) traversal.
 */
export function buildFitnessIndex(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  exerciseDefinitions?: ExerciseDefinition[] | Map<string, ExerciseDefinition> | null | undefined
): FitnessIndex {
  const defsMap = Array.isArray(exerciseDefinitions)
    ? createExerciseDefinitionMap(exerciseDefinitions)
    : (exerciseDefinitions || new Map<string, ExerciseDefinition>());

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
  const exerciseCountsMap = new Map<string, { count: number; volume: number; name: string; category: MuscleCategory }>();
  const personalBestsMap = new Map<string, PersonalBestRecord>();
  const e1rmHistoryByExercise = new Map<string, E1RMProgressionPoint[]>();
  const weeklyVolumeMap: Record<string, number> = {};

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
    const sessionVol = calculateVolume(log);
    totalLifetimeVolume += sessionVol;

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

      // Weekly volume
      try {
        const parsedDate = parseISO(log.date);
        if (isValid(parsedDate)) {
          const weekStr = format(startOfWeek(parsedDate, { weekStartsOn: 1 }), 'MMM dd, yyyy');
          weeklyVolumeMap[weekStr] = (weeklyVolumeMap[weekStr] || 0) + sessionVol;
        }
      } catch (_) {}
    }

    // Process sets
    if (log.sets && typeof log.sets === 'object') {
      Object.entries(log.sets).forEach(([exId, setList]) => {
        if (!Array.isArray(setList)) return;
        const doneSets = setList.filter(s => s && s.done);
        if (doneSets.length === 0) return;

        totalLifetimeSets += doneSets.length;
        const exMeta = resolveExercise(exId, defsMap);
        const normId = exMeta.id;
        const category = exMeta.category;

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

          if (w > 0 && r > 0) {
            const epley = calculateE1RM(w, r);
            if (epley > maxEpleyInSession) {
              maxEpleyInSession = epley;
              maxSetDetailInSession = `${w}kg × ${r} reps`;
            }

            // All-time personal best check
            const existingPB = personalBestsMap.get(normId);
            if (!existingPB || epley > existingPB.maxEpley) {
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

        // Muscle distribution
        volumeByMuscle[category] += exSessionVol;
        setsByMuscle[category] += doneSets.length;
        muscleOccurrence[category].add(log.id);

        // Exercise volume total
        volumeByExercise.set(normId, (volumeByExercise.get(normId) || 0) + exSessionVol);

        // Exercise frequency ranking
        if (!exerciseCountsMap.has(normId)) {
          exerciseCountsMap.set(normId, { count: 0, volume: 0, name: exMeta.name, category });
        }
        const freqEntry = exerciseCountsMap.get(normId)!;
        freqEntry.count += 1;
        freqEntry.volume += exSessionVol;

        // Exercise history record
        if (!historyByExercise.has(normId)) {
          historyByExercise.set(normId, []);
        }
        historyByExercise.get(normId)!.push({
          date: log.date,
          sets: doneSets,
          logId: log.id,
          maxW: maxWInSession,
          maxE1RM: maxEpleyInSession
        });

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
  const exerciseIndex = new Map<string, ExerciseIndexEntry>();
  exerciseCountsMap.forEach((freqVal, exId) => {
    const ascendingSessions = historyByExercise.get(exId) || [];
    const sessions = [...ascendingSessions].reverse();
    const latestSession = sessions[0] || null;
    const completedSets = completedSetsByExercise.get(exId) || [];
    const bestE1RM = personalBestsMap.get(exId) || null;
    const progression = e1rmHistoryByExercise.get(exId) || [];
    
    let maxWeight = 0;
    completedSets.forEach(cs => {
      const w = parseFloat(cs.set.weight) || 0;
      if (w > maxWeight) maxWeight = w;
    });

    exerciseIndex.set(exId, {
      exerciseId: exId,
      name: freqVal.name,
      category: freqVal.category,
      sessions,
      latestSession,
      completedSets,
      totalVolume: freqVal.volume,
      sessionCount: freqVal.count,
      maxWeight,
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
    currentStreak: calculateStreak(validLogs),
    longestStreak: calculateLongestStreak(validLogs),
    firstSessionDate: sortedLogsAscending[0]?.date || null,
    lastSessionDate: sortedLogsDescending[0]?.date || null
  };

  return {
    sortedLogsDescending,
    sortedLogsAscending,
    logsByDate,
    distinctDates,
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
  index: FitnessIndex,
  _defsMap?: Map<string, ExerciseDefinition>
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

export function selectWeightSummary(weightLog: Record<string, number> | undefined | null): WeightSummaryData {
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
 */
export function selectTimeRangeAnalytics(
  index: FitnessIndex,
  defsMap: Map<string, ExerciseDefinition>,
  workouts: Workout[] | undefined | null,
  timeRange: '7d' | '30d' | '90d' | 'all',
  cycleStart?: string | null,
  active1RMExerciseId?: string,
  now: Date = new Date()
) {
  const todayStr = format(now, 'yyyy-MM-dd');
  const startOfToday = startOfDay(now);

  // Fast workout lookup maps
  const workoutMap = new Map<string, Workout>();
  const coreWorkoutByCycleDayMap = new Map<number, Workout>();
  (workouts || []).forEach(w => {
    workoutMap.set(w.id, w);
    if (w.isCore && typeof w.cycleDay === 'number') {
      coreWorkoutByCycleDayMap.set(w.cycleDay, w);
    }
  });

  // Calculate cutoffs
  let cutoffDateStr: string | null = null;
  let priorCutoffDateStr: string | null = null;

  if (timeRange === '7d') {
    cutoffDateStr = format(subDays(now, 6), 'yyyy-MM-dd');
    priorCutoffDateStr = format(subDays(now, 13), 'yyyy-MM-dd');
  } else if (timeRange === '30d') {
    cutoffDateStr = format(subDays(now, 29), 'yyyy-MM-dd');
    priorCutoffDateStr = format(subDays(now, 59), 'yyyy-MM-dd');
  } else if (timeRange === '90d') {
    cutoffDateStr = format(subDays(now, 89), 'yyyy-MM-dd');
    priorCutoffDateStr = format(subDays(now, 179), 'yyyy-MM-dd');
  }

  const rangeLogs = index.sortedLogsAscending.filter(l => !cutoffDateStr || l.date >= cutoffDateStr);
  const priorLogs = index.sortedLogsAscending.filter(l => {
    if (!cutoffDateStr || !priorCutoffDateStr) return false;
    return l.date >= priorCutoffDateStr && l.date < cutoffDateStr;
  });

  let rangeVolume = 0;
  let priorVolume = 0;
  rangeLogs.forEach(l => { rangeVolume += calculateVolume(l); });
  priorLogs.forEach(l => { priorVolume += calculateVolume(l); });

  // Period over period volume change
  let volumePeriodChangePct: number | null = null;
  if (cutoffDateStr && priorVolume > 0) {
    volumePeriodChangePct = Math.round(((rangeVolume - priorVolume) / priorVolume) * 100);
  } else if (cutoffDateStr && priorVolume === 0 && rangeVolume > 0) {
    volumePeriodChangePct = 100;
  }

  // Muscle group and exercise breakdown within the time range
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

    if (log.sets && typeof log.sets === 'object') {
      Object.entries(log.sets).forEach(([exId, setList]) => {
        if (!Array.isArray(setList)) return;
        const doneSets = setList.filter(s => s && s.done);
        if (doneSets.length === 0) return;

        const exMeta = resolveExercise(exId, defsMap);
        const category = exMeta.category;
        const normId = exMeta.id;
        const exVol = calculateSetsVolume(doneSets);

        rangeMuscleVolume[category] += exVol;
        rangeMuscleSets[category] += doneSets.length;
        rangeMuscleFrequency[category]?.add(log.id);

        if (!exerciseSessionCounts[normId]) {
          exerciseSessionCounts[normId] = {
            name: exMeta.name,
            count: 0,
            volume: 0
          };
        }
        exerciseSessionCounts[normId].count += 1;
        exerciseSessionCounts[normId].volume += exVol;
      });
    }
  });

  // Scheduled Adherence calculation
  const firstLogDate = index.lifetimeStats.firstSessionDate;
  const rangeStartDate = cutoffDateStr
    ? parseISO(cutoffDateStr)
    : (firstLogDate ? parseISO(firstLogDate) : subDays(now, 30));
  
  const validRangeStart = isValid(rangeStartDate) ? rangeStartDate : subDays(now, 30);
  const dayInterval = eachDayOfInterval({
    start: validRangeStart,
    end: now
  });

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
    const hasCompletedWorkout = dayLogs.some(l => l.complete || calculateVolume(l) > 0);

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
