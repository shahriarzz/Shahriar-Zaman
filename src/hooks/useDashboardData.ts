import React from 'react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from './useFitnessDerivedData';
import { dk, getRollingDateRange, formatDateStr } from '../utils/fitnessCalculations';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { Workout } from '../types/fitness';
import { getRelativeTimeString } from '../utils/dashboardSelectors';
import { SparklineData } from '../utils/fitnessDerivedSelectors';
import {
  StreakInsight,
  TrainingFrequencyInsight,
  StrengthTrendInsight,
  PREvent
} from '../utils/trainingIntelligence';

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

export interface WeightSummary {
  currentWeight: string | number;
  weightEntries: [string, number][];
  recentWeightLogs: [string, number][];
  sparklineData: SparklineData | null;
  logWeight: (weight: number) => void;
  deleteWeight: (dateStr: string) => void;
}

export interface DashboardData {
  heroDateStr: string;
  stats: DashboardStats;
  trainingStreak: StreakInsight;
  trainingFrequency: TrainingFrequencyInsight;
  strengthTrend: StrengthTrendInsight;
  unfinishedSession: UnfinishedSessionInfo | null;
  todayWorkout: Workout | undefined;
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
 * Allowed range: 20 to 300 kg.
 * Rejects empty, non-numeric, or non-finite inputs.
 */
export function parseStrictBodyWeight(raw: string): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: 'Enter a weight in kg.' };
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { value: null, error: 'Enter a valid numeric weight.' };
  }
  const val = Number(trimmed);
  if (isNaN(val) || !Number.isFinite(val)) {
    return { value: null, error: 'Enter a valid finite weight.' };
  }
  if (val < 20 || val > 300) {
    return { value: null, error: 'Weight must be between 20 kg and 300 kg.' };
  }
  return { value: val, error: null };
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
    lifetimeStats,
    weightSummary: derivedWeightSummary,
    nextCycleDay: currentCycleDay,
    coreWorkoutByCycleDayMap,
    trainingStreak,
    trainingFrequency,
    strengthTrend,
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

    const recentPREvents = [...prEvents].reverse().slice(0, 3);

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
  const handleLogWeight = React.useCallback((val: number) => {
    if (!val || val < 20 || val > 300) return;
    logBodyWeight(dk(), val);
  }, [logBodyWeight]);

  const handleDeleteWeight = React.useCallback((dateStr: string) => {
    deleteBodyWeight(dateStr);
  }, [deleteBodyWeight]);

  const weightSummary: WeightSummary = {
    currentWeight: derivedWeightSummary.currentWeight,
    weightEntries: derivedWeightSummary.weightEntries,
    recentWeightLogs: derivedWeightSummary.recentWeightLogs,
    sparklineData: derivedWeightSummary.sparklineData,
    logWeight: handleLogWeight,
    deleteWeight: handleDeleteWeight
  };

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
    unfinishedSession,
    todayWorkout,
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
