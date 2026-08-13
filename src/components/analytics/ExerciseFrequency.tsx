import React from 'react';
import { Dumbbell, Activity } from 'lucide-react';
import { Card, SectionHeader, Badge } from '../ui';

interface ExerciseFrequencyProps {
  frequentExercises: Array<{ id: string; name: string; count: number; category: string }>;
}

export const ExerciseFrequency: React.FC<ExerciseFrequencyProps> = ({ frequentExercises }) => {
  return (
    <Card variant="default" className="p-5 space-y-4">
      <SectionHeader
        title="Most Frequent Lifts"
        subtitle="Top movements performed across recorded training sessions"
      />

      {frequentExercises.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {frequentExercises.map((ex, idx) => (
            <div
              key={ex.id || idx}
              className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center font-bold text-xs">
                  #{idx + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{ex.name}</div>
                  <div className="text-xs text-zinc-500">{ex.category}</div>
                </div>
              </div>
              <Badge variant="orange">{ex.count} sessions</Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          No exercise frequency data recorded yet
        </div>
      )}
    </Card>
  );
};
