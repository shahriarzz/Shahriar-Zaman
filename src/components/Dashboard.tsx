import React, { useMemo } from 'react';
import { useFitness } from '../context/FitnessContext';
import {
  calculateTotalVolume,
  getCompletedSessionsCount,
  getTrainingStreak,
  getNextCycleDayFromLogs,
  getWorkoutForCycleDay
} from '../domain';
import { DashboardStats } from './dashboard/DashboardStats';
import { TodayWorkoutCard } from './dashboard/TodayWorkoutCard';
import { BodyWeightCard } from './dashboard/BodyWeightCard';
import { Calendar } from './Calendar';

interface DashboardProps {
  onStartWorkout: (id: string) => void;
  onNavigateToHistory: (dateStr?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onStartWorkout,
  onNavigateToHistory
}) => {
  const { logs, workouts, appState, logBodyWeight, deleteBodyWeight } = useFitness();

  const totalVolume = calculateTotalVolume(logs || {});
  const completedSessions = getCompletedSessionsCount(logs || {});
  const streak = getTrainingStreak(logs || {});

  const currentCycleDay = useMemo(() => {
    return getNextCycleDayFromLogs(logs || {}, appState?.cycleStart || new Date().toISOString().split('T')[0]);
  }, [logs, appState?.cycleStart]);

  const todayWorkout = useMemo(() => {
    return getWorkoutForCycleDay(workouts || [], currentCycleDay);
  }, [workouts, currentCycleDay]);

  const latestWeight = useMemo(() => {
    const entries = Object.entries(appState?.bodyWeight || {}).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
    return entries.length > 0 ? entries[0][1] : null;
  }, [appState?.bodyWeight]);

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">Dashboard</h1>
        <p className="text-xs text-zinc-400 mt-1">Overview of your training cycle, volume, and momentum</p>
      </div>

      <DashboardStats
        totalVolume={totalVolume}
        streak={streak}
        completedSessions={completedSessions}
        latestWeight={latestWeight}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TodayWorkoutCard
            workout={todayWorkout}
            cycleDay={currentCycleDay}
            onStart={onStartWorkout}
          />

          <Calendar onSelectDate={(date) => onNavigateToHistory(date)} />
        </div>

        <div>
          <BodyWeightCard
            bodyWeightLogs={appState?.bodyWeight || {}}
            onLogWeight={logBodyWeight}
            onDeleteWeight={deleteBodyWeight}
          />
        </div>
      </div>
    </div>
  );
};
