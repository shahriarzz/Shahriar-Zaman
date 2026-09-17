import React from 'react';
import { cn } from '../../lib/utils';
import { SURFACE, BORDER, RADIUS, SPACING, SHADOW, STACK_SPACING } from '../../styles/tokens';

export interface ChartTooltipProps {
  children: React.ReactNode;
  className?: string;
}

export const ChartTooltip: React.FC<ChartTooltipProps> = ({ children, className }) => {
  return (
    <div
      className={cn(
        SURFACE.recessed,
        BORDER.standard,
        RADIUS.button,
        SPACING.compact,
        SHADOW.panel,
        STACK_SPACING.xs,
        "border font-mono text-xs select-none",
        className
      )}
    >
      {children}
    </div>
  );
};
