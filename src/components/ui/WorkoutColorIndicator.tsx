import React from 'react';
import { cn } from '../../lib/utils';
import { WorkoutType } from '../../types/fitness';
import { WORKOUT_COLORS } from '../../utils/fitnessHelpers';
import { getAccentColor, SemanticColor, SEMANTIC_COLORS } from '../../styles/tokens';

export interface WorkoutColorIndicatorProps {
  color?: string;
  type?: WorkoutType;
  accent?: SemanticColor;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-1.5 h-5 rounded-full',
  md: 'w-2 h-6 rounded-full',
  lg: 'w-3 h-8 rounded-full',
};

export const WorkoutColorIndicator: React.FC<WorkoutColorIndicatorProps> = ({
  color,
  type,
  accent,
  size = 'md',
  className,
}) => {
  const resolvedColor =
    color ||
    (type ? WORKOUT_COLORS[type] : undefined) ||
    (accent ? getAccentColor(accent) : undefined) ||
    SEMANTIC_COLORS.orange;

  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 block transition-colors", SIZE_CLASSES[size], className)}
      style={{ backgroundColor: resolvedColor }}
    />
  );
};
