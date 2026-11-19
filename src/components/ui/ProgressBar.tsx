import React from 'react';
import { cn } from '../../lib/utils';
import {
  SemanticColor,
  SemanticColorKey,
  SEMANTIC_PALETTE,
  getAccentColor,
  RADIUS,
  SURFACE,
  BORDER,
  TRANSITION,
  SEMANTIC_COLORS,
} from '../../styles/tokens';

export interface ProgressBarProps {
  value: number;
  max?: number;
  minVisiblePercent?: number;
  color?: SemanticColor;
  colorOverride?: string;
  size?: 'sm' | 'md';
  fillClassName?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  minVisiblePercent = 0,
  color,
  colorOverride,
  size = 'sm',
  fillClassName,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const clampedValue = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), safeMax)
    : 0;
  const clampedPercent = Math.min(Math.max((clampedValue / safeMax) * 100, 0), 100);
  const visualPercent =
    clampedPercent > 0 && minVisiblePercent > 0
      ? Math.min(100, Math.max(clampedPercent, minVisiblePercent))
      : clampedPercent;

  const resolvedColor: SemanticColor = color ?? 'emerald';
  const isPaletteKey =
    !colorOverride && Object.prototype.hasOwnProperty.call(SEMANTIC_PALETTE, resolvedColor);
  const paletteBgClass = isPaletteKey
    ? SEMANTIC_PALETTE[resolvedColor as SemanticColorKey].bg
    : undefined;
  const resolvedFillColor =
    colorOverride ?? (!isPaletteKey ? getAccentColor(resolvedColor) || SEMANTIC_COLORS.zinc : undefined);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(clampedValue * 100) / 100}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        'w-full overflow-hidden border',
        size === 'sm' ? 'h-1.5' : 'h-2',
        RADIUS.pill,
        SURFACE.recessed,
        BORDER.subtle,
        className
      )}
    >
      {visualPercent > 0 && (
        <div
          className={cn(
            'h-full',
            RADIUS.pill,
            TRANSITION.progressBar,
            paletteBgClass,
            fillClassName
          )}
          style={{
            width: `${visualPercent}%`,
            ...(resolvedFillColor ? { backgroundColor: resolvedFillColor } : {}),
          }}
        />
      )}
    </div>
  );
};
