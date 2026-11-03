import React from 'react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from './useFitnessDerivedData';
import { dk, getRollingDateRange, formatDateStr, isCompletedSession, BODY_WEIGHT_LIMITS, CYCLE_LENGTH } from '../utils/fitnessCalculations';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { Workout } from '../types/fitness';
import { getRelativeTimeString } from '../utils/dashboardSelectors';
import { SparklineData } from '../utils/fitnessDerivedSelectors';
import {
  StreakInsight,
  TrainingFrequencyInsight,
  StrengthTrendInsight,
  AdherenceInsight,
  PREvent
} from '../utils/trainingIntelligence';

export { BODY_WEIGHT_LIMITS };

export interface DashboardStats {
  totalWeight: number;
}

export interface UnfinishedSessionInfo {
  workoutId: string;
  workout: Workout;
  relativeTime: string;
}

export interface RecentVolumeInfo {
  volume: number;
  startDateStr: string;
  endDateStr: string;
  dateRangeLabel: string;
}

export interface DashboardMilestones {
  recentPREvents: PREvent[];
  recentVolume: RecentVolumeInfo;
}

export interface CompletedWorkoutSummary {
  logId: string;
  durationMinutes: number;
  setsCount: number;
  totalVolume: number;
}

export interface WeightSummary {
  currentWeight: string | number;
  weightEntries: [string, number][];
  recentWeightLogs: [string, number][];
  sparklineData: SparklineData | null;
  logWeight: (weight: number) => Promise<void>;
  deleteWeight: (dateStr: string) => Promise<void>;
}

export interface DashboardData {
  heroDateStr: string;
  stats: DashboardStats;
  trainingStreak: StreakInsight;
  trainingFrequency: TrainingFrequencyInsight;
  strengthTrend: StrengthTrendInsight;
  adherence: AdherenceInsight;
  unfinishedSession: UnfinishedSessionInfo | null;
  todayWorkout: Workout | undefined;
  isTodayCompleted: boolean;
  todayCompletedSummary: CompletedWorkoutSummary | null;
  nextScheduledWorkout: Workout | null;
  currentCycleDay: number;
  hasWorkouts: boolean;
  workouts: Workout[];
  weightSummary: WeightSummary;
  recentMilestones: DashboardMilestones;
  clearActiveSession: () => void;
  resetToCycleDay1: () => void;
  reloadInitialWorkouts: () => void;
}

/**
 * Strictly parses and validates a raw body weight input.
 * Normalizes single comma to decimal point.
 * Allowed range: 20 to 300 kg (BODY_WEIGHT_LIMITS).
 * Rounds accepted values to 1 decimal place.
 * Rejects empty, non-numeric, or non-finite inputs.
 */
export function parseStrictBodyWeight(raw: string): { value: number | null; error: string | null } {
  let trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: 'Enter a weight in kg.' };
  }
  const commaCount = (trimmed.match(/,/g) || []).length;
  const periodCount = (trimmed.match(/\./g) || []).length;
  if (commaCount === 1 && periodCount === 0) {
    trimmed = trimmed.replace(',', '.');
  } else if (commaCount > 1 || (commaCount >= 1 && periodCount >= 1)) {
    return { value: null, error: 'Enter a valid numeric weight.' };
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { value: null, error: 'Enter a valid numeric weight.' };
  }
  const val = Number(trimmed);
  if (isNaN(val) || !Number.isFinite(val)) {
    return { value: null, error: 'Enter a valid finite weight.' };
  }
  if (val < BODY_WEIGHT_LIMITS.min || val > BODY_WEIGHT_LIMITS.max) {
    return { value: null, error: `Weight must be between ${BODY_WEIGHT_LIMITS.min} kg and ${BODY_WEIGHT_LIMITS.max} kg.` };
  }
  const rounded = Math.round(val * 10) / 10;
  return { value: rounded, error: null };
}

export function useDashboardData(): DashboardData {
  const {
    logs,
    workouts,
    appState,
    updateCycleStart,
    activeSession,
    clearActiveSession,
    logBodyWeight,
    deleteBodyWeight,
    setWorkouts
  } = useFitness();

  const {
    currentDate,
    todayStr,
    index,
    lifetimeStats,
    weightSummary: derivedWeightSummary,
    nextCycleDay: currentCycleDay,
    coreWorkoutByCycleDayMap,
    trainingStreak,
    trainingFrequency,
    strengthTrend,
    adherenceInsight,
    prEvents,
    getVolumeForRange
  } = useFitnessDerivedData();

  // 1. Hero Date String (reactive to calendar rollover and focus updates)
  const heroDateStr = React.useMemo(() => {
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, [currentDate]);

  // 2. Cycle & Today's Workout from canonical validated core map
  const todayWorkout = React.useMemo(() => {
    return coreWorkoutByCycleDayMap.get(currentCycleDay);
  }, [coreWorkoutByCycleDayMap, currentCycleDay]);

  // Derive completed status for today's scheduled workout from canonical logs
  const todayCompletedInfo = React.useMemo<{ isCompleted: boolean; summary: CompletedWorkoutSummary | null }>(() => {
    if (!todayWorkout || todayWorkout.type === 'rest') {
      return { isCompleted: false, summary: null };
    }
    const todayLogs = index.logsByDate.get(todayStr) || [];
    const completedLog = todayLogs.find(l => isCompletedSession(l) && l.workoutId === todayWorkout.id);
    if (!completedLog) {
      return { isCompleted: false, summary: null };
    }
    let totalSets = 0;
    let totalVolume = 0;
    Object.values(completedLog.sets || {}).forEach(sets => {
      sets.forEach(s => {
        if (s.done) {
          totalSets++;
          const w = Number(s.weight) || 0;
          const r = Number(s.reps) || 0;
          totalVolume += (w * r);
        }
      });
    });
    return {
      isCompleted: true,
      summary: {
        logId: completedLog.id,
        durationMinutes: completedLog.durationMinutes,
        setsCount: totalSets,
        totalVolume
      }
    };
  }, [todayWorkout, index.logsByDate, todayStr]);

  // Derive next scheduled core workout in the 8-day cycle
  const nextScheduledWorkout = React.useMemo<Workout | null>(() => {
    const nextDay = (currentCycleDay % CYCLE_LENGTH) + 1;
    return coreWorkoutByCycleDayMap.get(nextDay) || null;
  }, [coreWorkoutByCycleDayMap, currentCycleDay]);

  // 3. Stats & Metrics from canonical derived pipeline
  const totalWeight = lifetimeStats.totalVolume;

  const stats: DashboardStats = {
    totalWeight
  };

  // 4. Recent Milestones (canonical PR events and rolling 7-day training volume)
  const recentMilestones = React.useMemo<DashboardMilestones>(() => {
    const range = getRollingDateRange(currentDate, 7);
    const volume = getVolumeForRange(range.start, range.end);
    const startFormatted = formatDateStr(range.start);
    const endFormatted = formatDateStr(range.end);
    const recentVolume: RecentVolumeInfo = {
      volume,
      startDateStr: range.start,
      endDateStr: range.end,
      dateRangeLabel: `Last 7 Days (${startFormatted} – ${endFormatted})`
    };

    // Sort PR events newest-first by date before taking the latest four for 2x2 grid
    const sortedPREvents = [...prEvents].sort((a, b) => b.date.localeCompare(a.date));
    const recentPREvents = sortedPREvents.slice(0, 4);

    return {
      recentPREvents,
      recentVolume
    };
  }, [currentDate, getVolumeForRange, prEvents]);

  // 5. Unfinished Session
  const unfinishedSession = React.useMemo<UnfinishedSessionInfo | null>(() => {
    if (!activeSession) return null;
    const unfinishedWo = (workouts || []).find(w => w.id === activeSession.workoutId);
    if (!unfinishedWo) return null;

    return {
      workoutId: activeSession.workoutId,
      workout: unfinishedWo,
      relativeTime: getRelativeTimeString(activeSession.startTime)
    };
  }, [activeSession, workouts]);

  // 6. Body Weight Biometrics from canonical pipeline
  const handleLogWeight = React.useCallback(async (val: number): Promise<void> => {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      throw new Error('Enter a valid numeric weight.');
    }
    if (val < BODY_WEIGHT_LIMITS.min || val > BODY_WEIGHT_LIMITS.max) {
      throw new Error(`Weight must be between ${BODY_WEIGHT_LIMITS.min} kg and ${BODY_WEIGHT_LIMITS.max} kg.`);
    }
    const rounded = Math.round(val * 10) / 10;
    await logBodyWeight(dk(), rounded);
  }, [logBodyWeight]);

  const handleDeleteWeight = React.useCallback(async (dateStr: string): Promise<void> => {
    await deleteBodyWeight(dateStr);
  }, [deleteBodyWeight]);

  const weightSummary: WeightSummary = React.useMemo(() => ({
    currentWeight: derivedWeightSummary.currentWeight,
    weightEntries: derivedWeightSummary.weightEntries,
    recentWeightLogs: derivedWeightSummary.recentWeightLogs,
    sparklineData: derivedWeightSummary.sparklineData,
    logWeight: handleLogWeight,
    deleteWeight: handleDeleteWeight
  }), [derivedWeightSummary, handleLogWeight, handleDeleteWeight]);

  // 7. Action Handlers
  const resetToCycleDay1 = React.useCallback(() => {
    updateCycleStart(dk());
  }, [updateCycleStart]);

  const reloadInitialWorkouts = React.useCallback(() => {
    setWorkouts(INITIAL_WORKOUTS);
  }, [setWorkouts]);

  return {
    heroDateStr,
    stats,
    trainingStreak,
    trainingFrequency,
    strengthTrend,
    adherence: adherenceInsight,
    unfinishedSession,
    todayWorkout,
    isTodayCompleted: todayCompletedInfo.isCompleted,
    todayCompletedSummary: todayCompletedInfo.summary,
    nextScheduledWorkout,
    currentCycleDay,
    hasWorkouts: (workouts || []).length > 0,
    workouts: workouts || [],
    weightSummary,
    recentMilestones,
    clearActiveSession,
    resetToCycleDay1,
    reloadInitialWorkouts
  };
}
