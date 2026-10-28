import React from 'react';
import { ChevronRight, Moon, AlertTriangle } from 'lucide-react';
import { Workout } from '../../types/fitness';
import { WORKOUT_COLORS } from '../../utils/fitnessHelpers';
import { CYCLE_LENGTH } from '../../utils/fitnessCalculations';
import { buildValidatedCoreWorkoutMap } from '../../utils/fitnessDerivedSelectors';
import {
  Card,
  Badge,
  Stack,
  SectionHeader,
  WorkoutColorIndicator,
  TYPOGRAPHY,
  BORDER,
  SURFACE,
  RADIUS,
  SEMANTIC_COLORS,
  TRANSITION
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
  // 1. Canonical 8-Day Core Workout Resolution
  const { coreWorkoutByCycleDayMap } = React.useMemo(() => {
    return buildValidatedCoreWorkoutMap(workouts);
  }, [workouts]);

  // Construct exactly CYCLE_LENGTH sequential slots (1..CYCLE_LENGTH)
  const cycleSlots = React.useMemo(() => {
    const slots: { day: number; workout: Workout; isFallback: boolean }[] = [];
    for (let day = 1; day <= CYCLE_LENGTH; day++) {
      const wo = coreWorkoutByCycleDayMap.get(day);
      if (wo) {
        const matchingValidWorkouts = (workouts || []).filter(
          w => w?.isCore === true && w?.cycleDay === day
        );
        const isFallback = matchingValidWorkouts.length !== 1;
        slots.push({ day, workout: wo, isFallback });
      }
    }
    return slots;
  }, [coreWorkoutByCycleDayMap, workouts]);

  // 2. Core workouts requiring repair (duplicates or invalid cycleDay)
  const malformedCoreWorkouts = React.useMemo(() => {
    const validDayCounts = new Map<number, number>();
    (workouts || []).forEach(w => {
      if (
        w?.isCore === true &&
        typeof w.cycleDay === 'number' &&
        Number.isInteger(w.cycleDay) &&
        w.cycleDay >= 1 &&
        w.cycleDay <= CYCLE_LENGTH
      ) {
        validDayCounts.set(w.cycleDay, (validDayCounts.get(w.cycleDay) || 0) + 1);
      }
    });

    return (workouts || []).filter(w => {
      if (w?.isCore !== true) return false;
      const isInvalid =
        typeof w.cycleDay !== 'number' ||
        !Number.isInteger(w.cycleDay) ||
        w.cycleDay < 1 ||
        w.cycleDay > CYCLE_LENGTH;
      const isDuplicate = !isInvalid && (validDayCounts.get(w.cycleDay!) || 0) > 1;
      return isInvalid || isDuplicate;
    });
  }, [workouts]);

  // 3. Bonus/Auxiliary workouts (non-core protocols)
  const additionalWorkouts = React.useMemo(() => {
    return (workouts || []).filter(w => w?.isCore !== true);
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

      {/* Cycle Days Sequential List: Exactly 8 days in ascending order */}
      <div className="space-y-3" data-testid="cycle-list">
        {cycleSlots.map(({ day, workout: wo, isFallback }) => {
          const isRest = wo.type === 'rest';
          const exerciseCount = wo.exercises ? wo.exercises.length : 0;
          const accentColor = WORKOUT_COLORS[wo.type] || SEMANTIC_COLORS.zinc;

          return (
            <Card
              key={`cycle-slot-${day}-${wo.id}`}
              variant="interactive"
              surface="base"
              padding="standard"
              data-testid={`cycle-slot-${day}`}
              data-cycle-day={day}
              onClick={() => handleWorkoutClick(wo.id)}
              className={cn("flex items-center justify-between group cursor-pointer select-none", TRANSITION.interactive, BORDER.interactive)}
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Day Indicator Badge / Pill */}
                <div className={cn("flex flex-col items-center justify-center w-12 h-12 shrink-0 border", RADIUS.button, SURFACE.recessed, BORDER.standard)}>
                  <span className={cn(TYPOGRAPHY.micro, "text-zinc-500")}>DAY</span>
                  <span className="font-display text-lg font-bold text-white leading-none">
                    {day}
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
                    {isFallback && (
                      <Badge
                        label="Fallback"
                        color="amber"
                        variant="subtle"
                        size="sm"
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

      {/* Malformed or Duplicate Core Workouts Requiring Repair */}
      {malformedCoreWorkouts.length > 0 && (
        <div className={cn("space-y-3 pt-4 border-t", BORDER.standard)} data-testid="malformed-core-section">
          <SectionHeader
            size="subsection"
            title="Needs Review / Inactive Core Routines"
            description="Core workouts with invalid or conflicting cycle days. Tap to inspect and repair."
          />

          <div className="space-y-2.5">
            {malformedCoreWorkouts.map((wo) => {
              const isInvalidDay =
                typeof wo.cycleDay !== 'number' ||
                !Number.isInteger(wo.cycleDay) ||
                wo.cycleDay < 1 ||
                wo.cycleDay > CYCLE_LENGTH;
              const statusLabel = isInvalidDay
                ? `INVALID DAY: ${wo.cycleDay ?? 'UNSET'}`
                : `DUPLICATE DAY ${wo.cycleDay}`;

              return (
                <Card
                  key={`malformed-${wo.id}`}
                  variant="interactive"
                  surface="base"
                  padding="compact"
                  onClick={() => handleWorkoutClick(wo.id)}
                  data-testid={`malformed-workout-${wo.id}`}
                  className={cn("flex items-center justify-between group cursor-pointer select-none", TRANSITION.interactive, BORDER.interactive)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("flex flex-col items-center justify-center w-10 h-10 shrink-0 border text-amber-400", RADIUS.button, SURFACE.recessed, BORDER.standard)}>
                      <AlertTriangle size={16} />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm break-words group-hover:text-orange-400 transition-colors">
                          {wo.name}
                        </span>
                        <Badge
                          label={statusLabel}
                          color="amber"
                          variant="subtle"
                          size="sm"
                        />
                      </div>
                      <div className={cn(TYPOGRAPHY.micro, "text-zinc-500")}>
                        Tap to repair cycle assignment
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
                  className={cn("flex items-center justify-between group cursor-pointer select-none", TRANSITION.interactive, BORDER.interactive)}
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
