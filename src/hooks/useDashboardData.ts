import React from 'react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from './useFitnessDerivedData';
import { getNextCycleDayFromLogs, dk } from '../utils/fitnessHelpers';
import { useCountUp } from './useCountUp';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { Workout } from '../types/fitness';
import { getRelativeTimeString } from '../utils/dashboardSelectors';
import { SparklineData } from '../utils/fitnessDerivedSelectors';

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

  const {
    lifetimeStats,
    weightSummary: derivedWeightSummary
  } = useFitnessDerivedData();

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

  // 3. Stats & Metrics from canonical derived pipeline
  const totalWeight = lifetimeStats.totalVolume;
  const streakCount = lifetimeStats.currentStreak;
  const sessionsCount = lifetimeStats.totalSessions;
  const cyclesCount = Math.floor(sessionsCount / 8);

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

  // 5. Body Weight Biometrics from canonical pipeline
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
