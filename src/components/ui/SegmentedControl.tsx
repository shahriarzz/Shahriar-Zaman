import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { SemanticColor, getAccentColor, RADIUS, SURFACE, BORDER, TYPOGRAPHY, SPACING, GAP } from '../../styles/tokens';

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
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = 'emerald',
  colorOverride,
  size = 'sm',
  className
}: SegmentedControlProps<T>) {
  const accentHex = colorOverride || getAccentColor(accent) || '#10b981';

  return (
    <div
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
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative transition-colors cursor-pointer select-none flex items-center justify-center",
              GAP.xs,
              size === 'sm' ? cn(SPACING.segmentedSm, TYPOGRAPHY.segmentedSm) : cn(SPACING.segmentedMd, TYPOGRAPHY.segmentedMd),
              RADIUS.button,
              isSelected
                ? "text-white font-black"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
            )}
          >
            {isSelected && (
              <motion.div
                layoutId={`segmented-active-${options.map(o => o.value).join('-')}`}
                className={cn("absolute inset-0 bg-zinc-800 border shadow-sm -z-0", BORDER.interactive, RADIUS.button)}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
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
