import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Card, SectionHeader } from '../ui';

interface LoadDistributionProps {
  distribution: Record<string, number>;
}

const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#f97316',
  Back: '#10b981',
  Legs: '#3b82f6',
  Shoulders: '#8b5cf6',
  Arms: '#ec4899',
  Core: '#eab308'
};

export const LoadDistribution: React.FC<LoadDistributionProps> = ({ distribution }) => {
  const chartData = Object.entries(distribution).map(([category, volume]) => ({
    category,
    volume: Math.round(volume as number)
  }));

  const maxVol = Math.max(...chartData.map(d => d.volume), 1);

  return (
    <Card variant="default" className="p-5 space-y-4">
      <SectionHeader
        title="Muscle Group Volume Distribution"
        subtitle="Cumulative load allocation across target muscle categories"
      />

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="category" stroke="#a1a1aa" fontSize={11} tickLine={false} />
            <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#09090e', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }}
              formatter={(val: any) => [`${val} kg`, 'Volume']}
            />
            <Bar dataKey="volume" radius={[6, 6, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.category} fill={MUSCLE_COLORS[entry.category] || '#f97316'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
