import React, { useState, useEffect } from 'react';
import { Dumbbell, ArrowRight, Check } from 'lucide-react';
import { Card, Badge, Button, SectionHeader } from '../ui';
import { Workout } from '../../types/fitness';
import { calculateWorkoutEstimatedDuration } from '../../domain';

interface TodayWorkoutCardProps {
  workout?: Workout;
  cycleDay: number;
  allWorkouts?: Workout[];
  onStart: (workoutId: string) => void;
}

export const TodayWorkoutCard: React.FC<TodayWorkoutCardProps> = ({
  workout,
  cycleDay,
  allWorkouts = [],
  onStart
}) => {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(workout?.id || null);

  useEffect(() => {
    if (workout?.id) {
      setSelectedWorkoutId(workout.id);
    } else if (allWorkouts.length > 0 && !selectedWorkoutId) {
      setSelectedWorkoutId(allWorkouts[0].id);
    }
  }, [workout?.id, allWorkouts]);

  const activeWorkout = allWorkouts.find(w => w.id === selectedWorkoutId) || workout || allWorkouts[0];
  const isRecommendedToday = activeWorkout && workout && activeWorkout.id === workout.id;

  if (!activeWorkout) {
    return (
      <Card variant="default" className="p-5 space-y-3">
        <SectionHeader title={`Cycle Day ${cycleDay}`} subtitle="Rest or active recovery scheduled for today." />
        <p className="text-xs text-zinc-400">
          No core programming scheduled for Day {cycleDay}. Take time for stretching, light cardio, or rest.
        </p>
      </Card>
    );
  }

  const duration = calculateWorkoutEstimatedDuration(activeWorkout);
  const totalSets = (activeWorkout.exercises || []).reduce((acc, e) => acc + (typeof e.sets === 'number' ? e.sets : 3), 0);

  return (
    <Card variant="default" className="p-5 space-y-4 border-orange-500/30 bg-orange-500/[0.02]">
      {/* Recommended or Selected Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-bold">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs uppercase font-bold tracking-wider text-orange-400 flex items-center gap-2">
              <span>{isRecommendedToday ? `Today's Recommended • Day ${cycleDay}` : 'Selected Routine'}</span>
              {isRecommendedToday && (
                <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono">REC</span>
              )}
            </div>
            <h2 className="text-lg font-extrabold text-white">{activeWorkout.name}</h2>
          </div>
        </div>

        <Badge variant="orange">{duration} mins</Badge>
      </div>

      <div className="text-xs text-zinc-400">
        {(activeWorkout.exercises || []).length} movements planned • {totalSets} total sets
      </div>

      {/* Subtle Workout Selector pills if allWorkouts provided */}
      {allWorkouts.length > 0 && (
        <div className="pt-2 border-t border-zinc-800/60 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
            Choose Routine ({allWorkouts.length} programmed):
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {allWorkouts.map((w) => {
              const isSelected = w.id === activeWorkout.id;
              const isRec = workout && w.id === workout.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedWorkoutId(w.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 shadow-sm'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {isSelected && <Check size={12} className="text-orange-400" />}
                  <span>{w.name}</span>
                  {w.badge && (
                    <span className="text-[9px] uppercase font-mono text-zinc-500 bg-zinc-800/80 px-1 rounded">
                      {w.badge}
                    </span>
                  )}
                  {isRec && !isSelected && (
                    <span className="text-[9px] text-orange-400/80 font-mono">Today</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Button
        variant="primary"
        size="md"
        onClick={() => onStart(activeWorkout.id)}
        className="w-full font-bold justify-center"
      >
        Start {activeWorkout.name} <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    </Card>
  );
};
