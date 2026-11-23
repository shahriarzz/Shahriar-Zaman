import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';
import { SemanticColor, getAccentColor, SEMANTIC_COLORS, RADIUS, SURFACE, BORDER, INTERACTIVE, TYPOGRAPHY, SPACING, GAP, FOCUS, TRANSITION, CONTROL_HEIGHT } from '../../styles/tokens';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: SemanticColor;
  colorOverride?: string;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = 'emerald',
  colorOverride,
  size = 'sm',
  label,
  className
}: SegmentedControlProps<T>) {
  const accentHex = colorOverride || getAccentColor(accent) || SEMANTIC_COLORS.emerald;
  const shouldReduceMotion = useReducedMotion();
  const controlId = React.useId();

  return (
    <div
      role="group"
      aria-label={label || 'Selection options'}
      className={cn(
        SURFACE.recessed,
        BORDER.standard,
        GAP.micro,
        "p-1 border flex items-center",
        RADIUS.button,
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative cursor-pointer select-none flex items-center justify-center",
              TRANSITION.colors,
              GAP.xs,
              size === 'sm'
                ? cn(SPACING.segmentedSm, TYPOGRAPHY.segmentedSm, CONTROL_HEIGHT.touchTarget, 'sm:min-h-[32px] sm:min-w-0')
                : cn(SPACING.segmentedMd, TYPOGRAPHY.segmentedMd, CONTROL_HEIGHT.touchTarget, 'sm:min-h-[36px] sm:min-w-0'),
              RADIUS.button,
              FOCUS.visible,
              isSelected
                ? "text-white font-black"
                : cn("text-zinc-400 hover:text-zinc-200", INTERACTIVE.hover)
            )}
          >
            {isSelected && (
              shouldReduceMotion ? (
                <div
                  className={cn("absolute inset-0 bg-zinc-800 border -z-0", BORDER.standard, RADIUS.button)}
                />
              ) : (
                <motion.div
                  layoutId={`segmented-active-${controlId}`}
                  className={cn("absolute inset-0 bg-zinc-800 border -z-0", BORDER.standard, RADIUS.button)}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )
            )}
            <span className={cn("relative z-10 flex items-center", GAP.xs)}>
              {opt.icon && (
                <span
                  className="shrink-0"
                  style={isSelected ? { color: accentHex } : undefined}
                >
                  {opt.icon}
                </span>
              )}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
