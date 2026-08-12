import React from 'react';
import { ArrowRight, Layers, Dumbbell } from 'lucide-react';
import { Workout } from '../../types/fitness';
import {
  Card,
  Button,
  Badge,
  Stack,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS
} from '../ui';
import { cn } from '../../lib/utils';

export interface ProgramIdentityCardProps {
  workouts: Workout[];
  onEditProgram: () => void;
}

export const ProgramIdentityCard: React.FC<ProgramIdentityCardProps> = ({
  workouts,
  onEditProgram
}) => {
  // Compute program composition from workouts
  const coreWorkouts = workouts.filter(w => w.isCore || (typeof w.cycleDay === 'number' && w.cycleDay > 0));
  const activeWorkouts = coreWorkouts.filter(w => w.type !== 'rest');
  const restWorkouts = coreWorkouts.filter(w => w.type === 'rest');

  const activeCount = activeWorkouts.length || 6;
  const restCount = restWorkouts.length || 2;
  const totalDays = activeCount + restCount;

  return (
    <Card
      variant="elevated"
      padding="relaxed"
      className="relative overflow-hidden group border-zinc-800"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge
              label="Primary Program"
              color="orange"
              variant="subtle"
              size="sm"
            />
            <span className={cn(TYPOGRAPHY.label, "text-zinc-500")}>
              {totalDays}-Day Cycle
            </span>
          </div>

          <div className="space-y-1">
            <h2 className={cn(TYPOGRAPHY.titleSection, "text-white")}>
              GainLog Hypertrophy Protocol
            </h2>
            <p className={cn(TYPOGRAPHY.body, "text-zinc-400 text-sm")}>
              Composition: <strong className="text-zinc-200">{activeCount} workouts</strong> · <strong className="text-zinc-200">{restCount} rest {restCount === 1 ? 'day' : 'days'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <Button
            variant="primary"
            size="lg"
            onClick={onEditProgram}
            icon={<ArrowRight size={16} />}
            iconPosition="right"
            className="w-full md:w-auto shadow-md"
          >
            Edit Program
          </Button>
        </div>
      </div>

      {/* Subtle background ambient icon */}
      <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
        <Dumbbell size={140} className="text-white" />
      </div>
    </Card>
  );
};
