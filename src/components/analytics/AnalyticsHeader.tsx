import React from 'react';
import { BarChart3, Trophy, Flame, Activity } from 'lucide-react';
import { StatCard, Grid } from '../ui';

interface AnalyticsHeaderProps {
  totalVolume: number;
  completedSessions: number;
  streak: number;
  top1RM: { name: string; val: number } | null;
}

export const AnalyticsHeader: React.FC<AnalyticsHeaderProps> = ({
  totalVolume,
  completedSessions,
  streak,
  top1RM
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-orange-500" />
            Analytics
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Performance metrics, volume progression, and personal records
          </p>
        </div>
      </div>

      <Grid cols={{ default: 2, sm: 4 }} gap="sm">
        <StatCard
          label="Total Volume"
          value={`${(totalVolume / 1000).toFixed(1)}k kg`}
          subtext="Cumulative volume"
          icon={<Activity size={16} className="text-orange-400" />}
          accent="orange"
        />
        <StatCard
          label="Workouts Logged"
          value={completedSessions}
          subtext="Completed sessions"
          icon={<BarChart3 size={16} className="text-emerald-400" />}
          accent="emerald"
        />
        <StatCard
          label="Consistency Streak"
          value={`${streak} cycles`}
          subtext="Active streak"
          icon={<Flame size={16} className="text-amber-400" />}
          accent="amber"
        />
        <StatCard
          label="Top Estimated 1RM"
          value={top1RM ? `${top1RM.val} kg` : 'N/A'}
          subtext={top1RM ? top1RM.name : 'No records'}
          icon={<Trophy size={16} className="text-cyan-400" />}
          accent="cyan"
        />
      </Grid>
    </div>
  );
};
