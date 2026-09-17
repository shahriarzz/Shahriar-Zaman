import React from 'react';
import { cn } from '../../lib/utils';
import {
  SURFACE,
  BORDER,
  RADIUS,
  SPACING,
  SpacingIntent,
  SHADOW,
  SemanticColor,
  getAccentColor
} from '../../styles/tokens';

export type CardSurface = 'base' | 'subtle' | 'recessed' | 'raised' | 'panel' | 'elevated';
export type CardAccentVariant = 'left' | 'top' | 'glow';
export type CardVariant = 
  | 'standard' 
  | 'elevated' 
  | 'interactive' 
  | 'panel' 
  | 'overlay' 
  | 'default'
  | 'recessed'
  | 'selected'
  | 'active'
  | 'warning'
  | 'destructive'
  | 'success'
  | 'compact'
  | 'section';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  surface?: CardSurface;
  accent?: SemanticColor | null;
  colorOverride?: string;
  accentVariant?: CardAccentVariant | null;
  hoverable?: boolean;
  onClick?: (e?: React.MouseEvent<HTMLDivElement>) => void;
  padding?: SpacingIntent;
  children: React.ReactNode;
  className?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  variant = 'standard',
  surface,
  accent,
  colorOverride,
  accentVariant,
  hoverable = false,
  onClick,
  padding,
  children,
  className,
  style,
  ...props
}, ref) => {
  const normalizedVariant = variant === 'default' ? 'standard' : variant;

  // Resolved surface appearance (base / subtle / recessed / raised / elevated / panel)
  const effectiveSurface: CardSurface = surface || (
    normalizedVariant === 'panel'
      ? 'subtle'
      : normalizedVariant === 'elevated'
      ? 'elevated'
      : normalizedVariant === 'recessed'
      ? 'recessed'
      : 'base'
  );

  const surfaceClasses: Record<CardSurface, string> = {
    base: SURFACE.default,
    subtle: SURFACE.subtle,
    recessed: SURFACE.recessed,
    raised: SURFACE.raised,
    elevated: SURFACE.elevated,
    panel: SURFACE.panel,
  };

  // Determine default padding based on variant if not explicitly provided
  const effectivePadding: SpacingIntent = padding || (
    normalizedVariant === 'compact'
      ? 'compact'
      : normalizedVariant === 'section'
      ? 'section'
      : 'standard'
  );

  const paddingClass = SPACING[effectivePadding] || SPACING.standard;

  const variantClasses: Record<string, string> = {
    standard: cn(BORDER.standard, RADIUS.card, SHADOW.elevation, 'border'),
    recessed: cn(BORDER.standard, RADIUS.card, 'border'),
    elevated: cn(BORDER.standard, RADIUS.panel, SHADOW.elevation, 'border'),
    interactive: cn(
      BORDER.standard,
      RADIUS.card,
      'border active:scale-[0.99] select-none cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80 transition-all'
    ),
    selected: cn(
      'border border-orange-500 bg-gradient-to-br from-orange-500/15 to-transparent text-white shadow-[0_4px_20px_rgba(249,115,22,0.15)]',
      RADIUS.card
    ),
    active: cn(
      'border border-orange-500 bg-gradient-to-br from-orange-500/15 to-transparent text-white shadow-[0_4px_20px_rgba(249,115,22,0.15)]',
      RADIUS.card
    ),
    warning: cn(
      'border border-amber-500/30 bg-amber-500/10 text-amber-200',
      RADIUS.card
    ),
    destructive: cn(
      'border border-red-500/30 bg-red-500/10 text-red-200',
      RADIUS.card
    ),
    success: cn(
      'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      RADIUS.card
    ),
    compact: cn(BORDER.standard, RADIUS.card, SHADOW.elevation, 'border'),
    section: cn(BORDER.standard, RADIUS.panel, SHADOW.panel, 'border'),
    panel: cn(BORDER.standard, RADIUS.panel, SHADOW.panel, 'border'),
    overlay: cn(BORDER.standard, RADIUS.panel, SHADOW.panel, 'border backdrop-blur-xl')
  };

  const resolvedAccentHex = colorOverride || getAccentColor(accent);
  const effectiveAccentVariant = accentVariant;

  let accentClasses = '';
  let accentStyles: React.CSSProperties = {};

  if (resolvedAccentHex && effectiveAccentVariant) {
    if (effectiveAccentVariant === 'left') {
      accentClasses = 'border-l-4';
      accentStyles.borderLeftColor = resolvedAccentHex;
    } else if (effectiveAccentVariant === 'top') {
      accentClasses = 'border-t-4';
      accentStyles.borderTopColor = resolvedAccentHex;
    } else if (effectiveAccentVariant === 'glow') {
      accentClasses = SHADOW.accentGlow(resolvedAccentHex);
    }
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{ ...accentStyles, ...style }}
      className={cn(
        "min-w-0",
        surfaceClasses[effectiveSurface],
        variantClasses[normalizedVariant] || variantClasses.standard,
        paddingClass,
        hoverable && 'hover:bg-zinc-900/80 hover:border-zinc-700 transition-all',
        onClick && !hoverable && 'cursor-pointer',
        accentClasses,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

