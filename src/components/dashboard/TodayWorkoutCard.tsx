import React from 'react';
import { Dumbbell, ArrowRight } from 'lucide-react';
import { Card, Badge, Button, SectionHeader } from '../ui';
import { Workout } from '../../types/fitness';
import { calculateWorkoutEstimatedDuration } from '../../domain';

interface TodayWorkoutCardProps {
  workout?: Workout;
  cycleDay: number;
  onStart: (workoutId: string) => void;
}

export const TodayWorkoutCard: React.FC<TodayWorkoutCardProps> = ({
  workout,
  cycleDay,
  onStart
}) => {
  if (!workout) {
    return (
      <Card variant="default" className="p-5 space-y-3">
        <SectionHeader title={`Cycle Day ${cycleDay}`} subtitle="Rest or active recovery scheduled for today." />
        <p className="text-xs text-zinc-400">
          No core programming scheduled for Day {cycleDay}. Take time for stretching, light cardio, or rest.
        </p>
      </Card>
    );
  }

  const duration = calculateWorkoutEstimatedDuration(workout);

  return (
    <Card variant="default" className="p-5 space-y-4 border-orange-500/30 bg-orange-500/[0.02]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-bold">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs uppercase font-bold tracking-wider text-orange-400">
              Today's Program • Day {cycleDay}
            </div>
            <h2 className="text-lg font-extrabold text-white">{workout.name}</h2>
          </div>
        </div>

        <Badge variant="orange">{duration} mins</Badge>
      </div>

      <div className="text-xs text-zinc-400">
        {workout.exercises.length} movements planned • {workout.exercises.reduce((acc, e) => acc + (typeof e.sets === 'number' ? e.sets : 3), 0)} total sets
      </div>

      <Button
        variant="primary"
        size="md"
        onClick={() => onStart(workout.id)}
        className="w-full font-bold justify-center"
      >
        Start Workout <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    </Card>
  );
};
