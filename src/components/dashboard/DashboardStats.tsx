import React from 'react';
import { Activity, Flame, Trophy, Calendar as CalendarIcon } from 'lucide-react';
import { StatCard, Grid } from '../ui';

interface DashboardStatsProps {
  totalVolume: number;
  streak: number;
  completedSessions: number;
  latestWeight?: number | null;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  totalVolume,
  streak,
  completedSessions,
  latestWeight
}) => {
  return (
    <Grid cols={{ default: 2, sm: 4 }} gap="sm">
      <StatCard
        label="Total Volume"
        value={`${(totalVolume / 1000).toFixed(1)}k kg`}
        subtext="Cumulative workload"
        icon={<Activity size={16} className="text-orange-400" />}
        accent="orange"
      />
      <StatCard
        label="Training Streak"
        value={`${streak} cycles`}
        subtext="Active momentum"
        icon={<Flame size={16} className="text-amber-400" />}
        accent="amber"
      />
      <StatCard
        label="Sessions Logged"
        value={completedSessions}
        subtext="Total completed"
        icon={<Trophy size={16} className="text-emerald-400" />}
        accent="emerald"
      />
      <StatCard
        label="Body Weight"
        value={latestWeight ? `${latestWeight} kg` : 'N/A'}
        subtext="Latest log"
        icon={<CalendarIcon size={16} className="text-cyan-400" />}
        accent="cyan"
      />
    </Grid>
  );
};
