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

export type CardSurface = 'base' | 'subtle' | 'recessed' | 'raised';
export type CardAccentVariant = 'left' | 'top' | 'glow';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'standard' | 'elevated' | 'interactive' | 'panel' | 'overlay' | 'default';
  surface?: CardSurface;
  accent?: SemanticColor | null;
  colorOverride?: string;
  accentVariant?: CardAccentVariant | null;
  accentStyle?: 'border-left' | 'border-top' | 'glow' | 'left' | 'top' | null;
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
  accentStyle,
  hoverable = false,
  onClick,
  padding = 'standard',
  children,
  className,
  style,
  ...props
}, ref) => {
  const normalizedVariant = variant === 'default' ? 'standard' : variant;

  // Resolved surface appearance (base / subtle / recessed / raised)
  const effectiveSurface: CardSurface = surface || (
    normalizedVariant === 'panel'
      ? 'subtle'
      : normalizedVariant === 'elevated'
      ? 'raised'
      : 'base'
  );

  const surfaceClasses: Record<CardSurface, string> = {
    base: SURFACE.default,
    subtle: SURFACE.subtle,
    recessed: SURFACE.recessed,
    raised: 'bg-gradient-to-br from-zinc-900 to-zinc-950',
  };

  const paddingClass = SPACING[padding] || SPACING.standard;

  const variantClasses = {
    standard: cn(BORDER.standard, RADIUS.card, SHADOW.elevation, 'border'),
    elevated: cn(BORDER.standard, RADIUS.panel, SHADOW.elevation, 'border'),
    interactive: cn(
      BORDER.standard,
      RADIUS.card,
      'border active:scale-[0.99] select-none cursor-pointer'
    ),
    panel: cn(BORDER.standard, RADIUS.panel, SHADOW.panel, 'border'),
    overlay: cn(BORDER.standard, RADIUS.panel, SHADOW.panel, 'border backdrop-blur-xl')
  };

  const resolvedAccentHex = colorOverride || getAccentColor(accent);
  const effectiveAccentVariant = accentVariant || (
    accentStyle === 'border-left'
      ? 'left'
      : accentStyle === 'border-top'
      ? 'top'
      : accentStyle
  );

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
        surfaceClasses[effectiveSurface],
        variantClasses[normalizedVariant],
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

