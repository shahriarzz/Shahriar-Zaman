import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Dumbbell, TrendingUp } from 'lucide-react';
import { Card, SectionHeader } from '../ui';
import { ExerciseDefinition } from '../../types/fitness';

interface E1rmChartProps {
  priorityExercises: ExerciseDefinition[];
  selectedExerciseId: string | null;
  onSelectExercise: (id: string) => void;
  data: Array<{ date: string; e1RM: number; weight: number; reps: number }>;
}

export const E1rmChart: React.FC<E1rmChartProps> = ({
  priorityExercises,
  selectedExerciseId,
  onSelectExercise,
  data
}) => {
  return (
    <Card variant="default" className="p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionHeader
          title="Strength Progression (E1RM)"
          subtitle="Estimated 1RM progression calculated via Epley formula"
        />

        {priorityExercises.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {priorityExercises.slice(0, 5).map(ex => (
              <button
                key={ex.id}
                onClick={() => onSelectExercise(ex.id)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  selectedExerciseId === ex.id
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {ex.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {data.length > 0 ? (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#a1a1aa" fontSize={11} tickLine={false} />
              <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#09090e', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }}
                formatter={(val: any) => [`${val} kg`, 'Est 1RM']}
              />
              <Line
                type="monotone"
                dataKey="e1RM"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ fill: '#f97316', r: 4 }}
                activeDot={{ r: 6, fill: '#ffedd5' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-48 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
          Select an exercise with recorded sets to view 1RM progression
        </div>
      )}
    </Card>
  );
};
