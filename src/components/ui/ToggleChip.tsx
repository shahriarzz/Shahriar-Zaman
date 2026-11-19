import React from 'react';
import { cn } from '../../lib/utils';
import {
  CONTROL_HEIGHT,
  TYPOGRAPHY,
  RADIUS,
  TRANSITION,
  FOCUS,
  INTERACTIVE,
} from '../../styles/tokens';

export interface ToggleChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  selected: boolean;
  color?: 'orange' | 'amber';
}

const SELECTED_VARIANTS: Record<'orange' | 'amber', string> = {
  orange: 'bg-orange-500/15 border-orange-500/35 text-orange-400',
  amber: 'bg-amber-500/15 border-amber-500/35 text-amber-400',
};

export const ToggleChip: React.FC<ToggleChipProps> = ({
  selected,
  color = 'orange',
  className,
  disabled,
  children,
  ...rest
}) => {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        CONTROL_HEIGHT.touchTarget,
        'sm:min-h-[32px] sm:min-w-0 px-2.5 py-1 border inline-flex items-center gap-1 cursor-pointer select-none',
        TYPOGRAPHY.badgeSm,
        RADIUS.badge,
        TRANSITION.colors,
        FOCUS.visible,
        selected
          ? SELECTED_VARIANTS[color]
          : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
        disabled && INTERACTIVE.disabled,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
};
