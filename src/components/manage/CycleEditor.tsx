import React from 'react';
import { ChevronRight, Plus, Moon, Dumbbell, Sparkles } from 'lucide-react';
import { Workout } from '../../types/fitness';
import { WORKOUT_COLORS } from '../../utils/fitnessHelpers';
import {
  Card,
  Badge,
  Button,
  Stack,
  Grid,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS
} from '../ui';
import { cn } from '../../lib/utils';
import { haptics } from '../../utils/haptics';

export interface CycleEditorProps {
  workouts: Workout[];
  onSelectWorkout: (workoutId: string) => void;
}

export const CycleEditor: React.FC<CycleEditorProps> = ({
  workouts,
  onSelectWorkout
}) => {
  // Sort core cycle workouts by cycleDay 1..8
  const cycleWorkouts = React.useMemo(() => {
    return [...workouts]
      .filter(w => typeof w.cycleDay === 'number' && w.cycleDay > 0)
      .sort((a, b) => (a.cycleDay || 0) - (b.cycleDay || 0));
  }, [workouts]);

  // Bonus/Custom workouts not in the primary 8-day cycle
  const additionalWorkouts = React.useMemo(() => {
    return [...workouts].filter(w => !w.cycleDay || w.cycleDay <= 0);
  }, [workouts]);

  const handleWorkoutClick = (id: string) => {
    haptics.selection();
    onSelectWorkout(id);
  };

  return (
    <Stack spacing="lg">
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn(TYPOGRAPHY.titleSubsection, "text-white")}>
            8-Day Routine Cycle
          </h3>
          <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400 mt-1")}>
            Sequential progression schedule. Tap any day to customize its exercise protocol.
          </p>
        </div>
      </div>

      {/* Cycle Days Sequential List */}
      <div className="space-y-3">
        {cycleWorkouts.map((wo) => {
          const isRest = wo.type === 'rest';
          const exerciseCount = wo.exercises ? wo.exercises.length : 0;
          const accentColor = WORKOUT_COLORS[wo.type] || '#f97316';

          return (
            <Card
              key={wo.id}
              variant="interactive"
              surface="base"
              padding="standard"
              onClick={() => handleWorkoutClick(wo.id)}
              className="flex items-center justify-between group border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer select-none"
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Day Indicator Badge / Pill */}
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800/80 shrink-0">
                  <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 text-[8px]")}>DAY</span>
                  <span className="font-display text-lg font-bold text-white leading-none">
                    {wo.cycleDay}
                  </span>
                </div>

                {/* Workout Details */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-base truncate group-hover:text-orange-400 transition-colors">
                      {wo.name}
                    </span>
                    <Badge
                      label={wo.type.toUpperCase()}
                      color={isRest ? 'zinc' : (wo.type as any)}
                      variant="subtle"
                      size="sm"
                    />
                    {isRest && (
                      <Badge
                        label="Rest Day"
                        color="zinc"
                        variant="solid"
                        size="sm"
                        icon={<Moon size={10} />}
                      />
                    )}
                  </div>

                  <div className={cn(TYPOGRAPHY.label, "text-zinc-500 flex items-center gap-2")}>
                    {isRest ? (
                      <span className="text-zinc-500">Recovery Phase · 0 exercises</span>
                    ) : (
                      <span>{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                    )}
                    {wo.cardio && (
                      <>
                        <span>·</span>
                        <span className="text-orange-400/80">{wo.cardio.name} ({wo.cardio.duration})</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Tap Affordance */}
              <div className="flex items-center gap-1.5 text-zinc-500 group-hover:text-white transition-colors shrink-0 ml-3">
                <span className={cn(TYPOGRAPHY.eyebrow, "hidden sm:inline-block text-[9px]")}>
                  Edit
                </span>
                <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Additional / Bonus Workouts (if any exist) */}
      {additionalWorkouts.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-zinc-800/60">
          <div>
            <h4 className={cn(TYPOGRAPHY.label, "text-zinc-400 text-xs font-bold")}>
              Bonus & Auxiliary Protocols
            </h4>
            <p className={cn(TYPOGRAPHY.body, "text-[11px] text-zinc-500")}>
              Specialized sessions outside the primary 8-day progression.
            </p>
          </div>

          <div className="space-y-2.5">
            {additionalWorkouts.map((wo) => {
              const exerciseCount = wo.exercises ? wo.exercises.length : 0;
              return (
                <Card
                  key={wo.id}
                  variant="interactive"
                  surface="base"
                  padding="compact"
                  onClick={() => handleWorkoutClick(wo.id)}
                  className="flex items-center justify-between group border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: WORKOUT_COLORS[wo.type] || '#f97316' }} />
                    <div className="space-y-0.5 truncate">
                      <div className="font-bold text-white text-sm truncate group-hover:text-orange-400 transition-colors">
                        {wo.name}
                      </div>
                      <div className={cn(TYPOGRAPHY.label, "text-zinc-500 text-[9px]")}>
                        {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-zinc-500 group-hover:text-white transition-colors shrink-0">
                    <ChevronRight size={16} />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </Stack>
  );
};
