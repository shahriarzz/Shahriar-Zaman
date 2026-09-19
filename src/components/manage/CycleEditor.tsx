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
  SectionHeader,
  WorkoutColorIndicator,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS,
  SEMANTIC_COLORS
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
      <SectionHeader
        size="subsection"
        title="8-Day Routine Cycle"
        description="Sequential progression schedule. Tap any day to customize its exercise protocol."
      />

      {/* Cycle Days Sequential List */}
      <div className="space-y-3">
        {cycleWorkouts.map((wo) => {
          const isRest = wo.type === 'rest';
          const exerciseCount = wo.exercises ? wo.exercises.length : 0;
          const accentColor = WORKOUT_COLORS[wo.type] || SEMANTIC_COLORS.orange;

          return (
            <Card
              key={wo.id}
              variant="interactive"
              surface="base"
              padding="standard"
              onClick={() => handleWorkoutClick(wo.id)}
              className={cn("flex items-center justify-between group transition-all cursor-pointer select-none", BORDER.interactive)}
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Day Indicator Badge / Pill */}
                <div className={cn("flex flex-col items-center justify-center w-12 h-12 shrink-0 border", RADIUS.button, SURFACE.recessed, BORDER.standard)}>
                  <span className={cn(TYPOGRAPHY.micro, "text-zinc-500")}>DAY</span>
                  <span className="font-display text-lg font-bold text-white leading-none">
                    {wo.cycleDay}
                  </span>
                </div>

                {/* Workout Details */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-white text-base break-words group-hover:text-orange-400 transition-colors">
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
                <span className={cn(TYPOGRAPHY.eyebrow, "hidden sm:inline-block")}>
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
        <div className={cn("space-y-3 pt-4 border-t", BORDER.standard)}>
          <SectionHeader
            size="subsection"
            title="Bonus & Auxiliary Protocols"
            description="Specialized sessions outside the primary 8-day progression."
          />

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
                  className={cn("flex items-center justify-between group transition-all cursor-pointer select-none", BORDER.interactive)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <WorkoutColorIndicator type={wo.type} size="sm" />
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-bold text-white text-sm break-words group-hover:text-orange-400 transition-colors">
                        {wo.name}
                      </div>
                      <div className={cn(TYPOGRAPHY.micro, "text-zinc-500")}>
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
