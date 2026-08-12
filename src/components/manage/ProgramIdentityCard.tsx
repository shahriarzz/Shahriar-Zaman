import React, { useMemo } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import { Workout } from '../../types/fitness';
import { Card, Button, EmptyState, TYPOGRAPHY } from '../ui';
import { cn } from '../../lib/utils';

export interface ProgramIdentityCardProps {
  workouts?: Workout[];
  onEditProgram: () => void;
}

export const ProgramIdentityCard: React.FC<ProgramIdentityCardProps> = ({
  workouts = [],
  onEditProgram
}) => {
  // Authoritative cycle workouts definition (matching CycleEditor / ProgramEditor)
  const cycleWorkouts = useMemo(() => {
    return (workouts || [])
      .filter(w => typeof w.cycleDay === 'number' && w.cycleDay > 0)
      .sort((a, b) => (a.cycleDay || 0) - (b.cycleDay || 0));
  }, [workouts]);

  const totalDays = cycleWorkouts.length;

  const activeCount = useMemo(() => {
    return cycleWorkouts.filter(w => w.type !== 'rest').length;
  }, [cycleWorkouts]);

  const restCount = useMemo(() => {
    return cycleWorkouts.filter(w => w.type === 'rest').length;
  }, [cycleWorkouts]);

  // Handle empty / missing program data without fabricating values
  if (totalDays === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No Active Program"
        description="Configure your workout cycle and progression schedule."
        action={{
          label: "Configure Program",
          onClick: onEditProgram
        }}
      />
    );
  }

  const programName = `${totalDays}-Day Routine Cycle`;

  return (
    <Card variant="standard" padding="relaxed">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className={cn(TYPOGRAPHY.titleSection, "text-white")}>
            {programName}
          </h2>
          <p className={cn(TYPOGRAPHY.body, "text-zinc-400 text-sm")}>
            Composition: <strong className="text-zinc-200">{activeCount} {activeCount === 1 ? 'workout' : 'workouts'}</strong> · <strong className="text-zinc-200">{restCount} rest {restCount === 1 ? 'day' : 'days'}</strong>
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={onEditProgram}
          icon={<ArrowRight size={15} />}
          iconPosition="right"
          className="w-full md:w-auto"
        >
          Edit Program
        </Button>
      </div>
    </Card>
  );
};

