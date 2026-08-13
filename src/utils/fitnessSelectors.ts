import { SessionLog, SetLog, Workout, ExerciseDefinition, AppState } from '../types/fitness';
import {
  calculateVolume,
  calculateStreak,
  calculateLongestStreak,
  calculateTotalWeightLifted,
  getExerciseHistory,
  getSortedLogsDescending,
  getSortedWeightEntries,
  getWeightSparklineData,
  calculateE1RM,
  getNextCycleDayFromLogs,
  CYCLE_LENGTH,
  SparklineData
} from './fitnessCalculations';
import {
  resolveExercise,
  createExerciseDefinitionMap,
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

/**
 * Selects all-time personal bests / records across all exercises
 */
export function selectPersonalBests(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  defsMap: Map<string, ExerciseDefinition> | ExerciseDefinition[]
): PersonalBestRecord[] {
  const map = Array.isArray(defsMap) ? createExerciseDefinitionMap(defsMap) : defsMap;
  const recordsMap: Record<string, PersonalBestRecord> = {};
  const logArray = Array.isArray(logs) ? logs : Object.values(logs || {});

  logArray.forEach(log => {
    if (!log || !log.sets) return;
    Object.entries(log.sets).forEach(([exId, setList]) => {
      const doneSets = (setList as SetLog[]).filter(s => s && s.done);
      doneSets.forEach(s => {
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps, 10) || 0;
        if (w > 0 && r > 0) {
          const epley = calculateE1RM(w, r);
          const meta = resolveExercise(exId, map);
          const normId = meta.id;

          if (!recordsMap[normId] || epley > recordsMap[normId].maxEpley) {
            recordsMap[normId] = {
              exerciseId: normId,
              exerciseName: meta.name,
              maxWeight: w,
              repsAtMax: r,
              maxEpley: epley,
              date: log.date,
              category: meta.category
            };
          }
        }
      });
    });
  });

  return Object.values(recordsMap).sort((a, b) => b.maxEpley - a.maxEpley);
}

/**
 * Selects muscle group load distribution across completed sessions
 */
export function selectMuscleDistribution(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  defsMap: Map<string, ExerciseDefinition> | ExerciseDefinition[]
): MuscleDistributionStats {
  const map = Array.isArray(defsMap) ? createExerciseDefinitionMap(defsMap) : defsMap;
  const logArray = Array.isArray(logs) ? logs : Object.values(logs || {});

  const volume: Record<MuscleCategory, number> = {
    Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
  };
  const setsCount: Record<MuscleCategory, number> = {
    Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
  };
  const sessionOccurrence: Record<MuscleCategory, Set<string>> = {
    Chest: new Set(), Shoulders: new Set(), Back: new Set(), Biceps: new Set(), Triceps: new Set(),
    Forearms: new Set(), Legs: new Set(), Core: new Set()
  };

  let totalVolume = 0;
  let totalSets = 0;

  logArray.forEach(log => {
    if (!log || !log.sets) return;
    Object.entries(log.sets).forEach(([exId, setList]) => {
      const doneSets = (setList as SetLog[]).filter(s => s && s.done);
      if (doneSets.length === 0) return;

      const meta = resolveExercise(exId, map);
      const cat = meta.category;

      let exVol = 0;
      doneSets.forEach(s => {
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps, 10) || 0;
        exVol += (w * r);
      });

      volume[cat] += exVol;
      setsCount[cat] += doneSets.length;
      sessionOccurrence[cat].add(log.id);

      totalVolume += exVol;
      totalSets += doneSets.length;
    });
  });

  const frequency: Record<MuscleCategory, number> = {
    Chest: sessionOccurrence.Chest.size,
    Shoulders: sessionOccurrence.Shoulders.size,
    Back: sessionOccurrence.Back.size,
    Biceps: sessionOccurrence.Biceps.size,
    Triceps: sessionOccurrence.Triceps.size,
    Forearms: sessionOccurrence.Forearms.size,
    Legs: sessionOccurrence.Legs.size,
    Core: sessionOccurrence.Core.size
  };

  return {
    volume,
    sets: setsCount,
    frequency,
    totalVolume,
    totalSets
  };
}

/**
 * Selects exercise frequency rankings across completed sessions
 */
export function selectExerciseFrequency(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined,
  defsMap: Map<string, ExerciseDefinition> | ExerciseDefinition[]
): ExerciseFrequencyStat[] {
  const map = Array.isArray(defsMap) ? createExerciseDefinitionMap(defsMap) : defsMap;
  const logArray = Array.isArray(logs) ? logs : Object.values(logs || {});
  const counts: Record<string, ExerciseFrequencyStat> = {};

  logArray.forEach(log => {
    if (!log || !log.sets) return;
    Object.entries(log.sets).forEach(([exId, setList]) => {
      const doneSets = (setList as SetLog[]).filter(s => s && s.done);
      if (doneSets.length === 0) return;

      const meta = resolveExercise(exId, map);
      const normId = meta.id;

      let exVol = 0;
      doneSets.forEach(s => {
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps, 10) || 0;
        exVol += (w * r);
      });

      if (!counts[normId]) {
        counts[normId] = {
          exerciseId: normId,
          name: meta.name,
          count: 0,
          volume: 0,
          category: meta.category
        };
      }
      counts[normId].count += 1;
      counts[normId].volume += exVol;
    });
  });

  return Object.values(counts).sort((a, b) => b.count - a.count || b.volume - a.volume);
}

/**
 * Selects lifetime summary stats across all recorded sessions
 */
export function selectLifetimeStats(
  logs: Record<string, SessionLog> | SessionLog[] | null | undefined
): LifetimeStats {
  const sorted = getSortedLogsDescending(logs);
  let totalVolume = 0;
  let totalSets = 0;
  let totalMinutes = 0;

  sorted.forEach(log => {
    totalVolume += calculateVolume(log);
    if (log.durationMinutes && log.durationMinutes > 0) {
      totalMinutes += log.durationMinutes;
    }
    if (log.sets) {
      Object.values(log.sets).forEach(sets => {
        totalSets += (sets || []).filter(s => s && s.done).length;
      });
    }
  });

  return {
    totalSessions: sorted.length,
    totalVolume,
    totalSets,
    totalMinutes,
    currentStreak: calculateStreak(logs),
    longestStreak: calculateLongestStreak(logs),
    firstSessionDate: sorted.length > 0 ? sorted[sorted.length - 1].date : null,
    lastSessionDate: sorted.length > 0 ? sorted[0].date : null
  };
}

/**
 * Selects structured weight summary info for dashboard biometrics
 */
export function selectWeightSummary(
  weightLog: Record<string, number> | undefined | null
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
