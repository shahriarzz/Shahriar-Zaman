import React from 'react';
import { useFitness } from '../context/FitnessContext';
import { getNextCycleDayFromLogs, dk } from '../utils/fitnessHelpers';
import { useCountUp } from './useCountUp';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { Workout } from '../types/fitness';
import {
  calculateStreak,
  calculateTotalWeightLifted,
  getSortedWeightEntries,
  getWeightSparklineData,
  getRelativeTimeString,
  SparklineData
} from '../utils/dashboardSelectors';

export interface DashboardStats {
  streakCount: number;
  sessionsCount: number;
  animatedSessions: number;
  cyclesCount: number;
  animatedCycles: number;
  totalWeight: number;
  animatedWeight: number;
  formattedWeightLifted: string;
}

export interface UnfinishedSessionInfo {
  workoutId: string;
  workout: Workout;
  relativeTime: string;
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
  unfinishedSession: UnfinishedSessionInfo | null;
  todayWorkout: Workout | undefined;
  currentCycleDay: number;
  hasWorkouts: boolean;
  workouts: Workout[];
  weightSummary: WeightSummary;
  clearActiveSession: () => void;
  resetToCycleDay1: () => void;
  reloadInitialWorkouts: () => void;
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

  // 1. Hero Date String
  const heroDateStr = React.useMemo(() => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  // 2. Cycle & Today's Workout
  const currentCycleDay = React.useMemo(() => {
    return getNextCycleDayFromLogs(logs, workouts, appState?.cycleStart);
  }, [logs, workouts, appState?.cycleStart]);

  const todayWorkout = React.useMemo(() => {
    return (workouts || []).find(w => w.cycleDay === currentCycleDay && w.isCore);
  }, [workouts, currentCycleDay]);

  // 3. Stats & Metrics
  const totalWeight = React.useMemo(() => {
    return calculateTotalWeightLifted(logs);
  }, [logs]);

  const streakCount = React.useMemo(() => {
    return calculateStreak(logs);
  }, [logs]);

  const sessionsCount = React.useMemo(() => {
    return Object.keys(logs || {}).length;
  }, [logs]);

  const cyclesCount = React.useMemo(() => {
    return Math.floor(sessionsCount / 8);
  }, [sessionsCount]);

  const animatedSessions = useCountUp(sessionsCount);
  const animatedCycles = useCountUp(cyclesCount);
  const animatedWeight = useCountUp(Math.round(totalWeight));

  const formattedWeightLifted = React.useMemo(() => {
    return animatedWeight >= 1000 ? (animatedWeight / 1000).toFixed(1) + 'k' : animatedWeight.toString();
  }, [animatedWeight]);

  const stats: DashboardStats = {
    streakCount,
    sessionsCount,
    animatedSessions,
    cyclesCount,
    animatedCycles,
    totalWeight,
    animatedWeight,
    formattedWeightLifted
  };

  // 4. Unfinished Session
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

  // 5. Body Weight Biometrics
  const weightEntries = React.useMemo(() => {
    return getSortedWeightEntries(appState?.weightLog);
  }, [appState?.weightLog]);

  const currentWeight = React.useMemo(() => {
    if (weightEntries.length === 0) return '--';
    return weightEntries[0][1];
  }, [weightEntries]);

  const recentWeightLogs = React.useMemo(() => {
    return weightEntries.slice(0, 5);
  }, [weightEntries]);

  const sparklineData = React.useMemo(() => {
    return getWeightSparklineData(appState?.weightLog);
  }, [appState?.weightLog]);

  const handleLogWeight = React.useCallback((val: number) => {
    if (!val || val < 20 || val > 300) return;
    logBodyWeight(dk(), val);
  }, [logBodyWeight]);

  const handleDeleteWeight = React.useCallback((dateStr: string) => {
    deleteBodyWeight(dateStr);
  }, [deleteBodyWeight]);

  const weightSummary: WeightSummary = {
    currentWeight,
    weightEntries,
    recentWeightLogs,
    sparklineData,
    logWeight: handleLogWeight,
    deleteWeight: handleDeleteWeight
  };

  // 6. Action Handlers
  const resetToCycleDay1 = React.useCallback(() => {
    updateCycleStart(dk());
  }, [updateCycleStart]);

  const reloadInitialWorkouts = React.useCallback(() => {
    setWorkouts(INITIAL_WORKOUTS);
  }, [setWorkouts]);

  return {
    heroDateStr,
    stats,
    unfinishedSession,
    todayWorkout,
    currentCycleDay,
    hasWorkouts: (workouts || []).length > 0,
    workouts: workouts || [],
    weightSummary,
    clearActiveSession,
    resetToCycleDay1,
    reloadInitialWorkouts
  };
}
