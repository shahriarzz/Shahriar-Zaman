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
  getAccentColor,
  INTERACTIVE,
  TRANSITION,
  FOCUS
} from '../../styles/tokens';

export type CardSurface = 'base' | 'subtle' | 'recessed' | 'elevated';
export type CardAccentVariant = 'left' | 'top' | 'glow';
export type CardVariant = 
  | 'standard' 
  | 'elevated' 
  | 'interactive' 
  | 'recessed'
  | 'selected'
  | 'warning'
  | 'destructive';

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
  onKeyDown,
  onKeyUp,
  onBlur,
  role,
  tabIndex,
  padding,
  children,
  className,
  style,
  ...props
}, ref) => {
  const isActionable = Boolean(onClick);
  const isSpacePressedRef = React.useRef(false);

  // Resolved surface appearance (base / subtle / recessed / elevated)
  const effectiveSurface: CardSurface = surface || (
    variant === 'elevated'
      ? 'elevated'
      : variant === 'recessed'
      ? 'recessed'
      : 'base'
  );

  const surfaceClasses: Record<CardSurface, string> = {
    base: SURFACE.default,
    subtle: SURFACE.subtle,
    recessed: SURFACE.recessed,
    elevated: SURFACE.elevated,
  };

  const paddingClass = SPACING[padding || 'standard'] || SPACING.standard;

  const variantClasses: Record<CardVariant, string> = {
    standard: cn(BORDER.standard, RADIUS.card, 'border'),
    recessed: cn(BORDER.standard, RADIUS.card, 'border'),
    elevated: cn(BORDER.standard, RADIUS.panel, SHADOW.elevation, 'border'),
    interactive: cn(
      BORDER.standard,
      RADIUS.card,
      'border',
      isActionable && cn(
        BORDER.hover,
        INTERACTIVE.hover,
        'active:scale-[0.99] select-none cursor-pointer',
        FOCUS.visible
      )
    ),
    selected: cn(
      'border border-orange-500 bg-orange-500/10 text-white',
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
  };

  const resolvedAccentHex = colorOverride || getAccentColor(accent);
  const effectiveAccentVariant = accentVariant;

  let accentClasses = '';
  const accentStyles: React.CSSProperties = {};

  if (resolvedAccentHex && effectiveAccentVariant) {
    if (effectiveAccentVariant === 'left') {
      accentClasses = 'border-l-4';
      accentStyles.borderLeftColor = resolvedAccentHex;
    } else if (effectiveAccentVariant === 'top') {
      accentClasses = 'border-t-4';
      accentStyles.borderTopColor = resolvedAccentHex;
    } else if (effectiveAccentVariant === 'glow') {
      Object.assign(accentStyles, SHADOW.accentGlowStyle(resolvedAccentHex));
    }
  }

  const resolvedRole = role !== undefined ? role : (isActionable ? 'button' : undefined);
  const resolvedTabIndex = tabIndex !== undefined ? tabIndex : (isActionable ? 0 : undefined);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);

    // Only apply built-in button keyboard behavior when resolvedRole is 'button' and actionable
    if (resolvedRole === 'button' && isActionable && !e.defaultPrevented) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onClick?.();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Prevent default page scroll on Space keydown; activation occurs on keyup
        e.preventDefault();
        if (!e.repeat) {
          isSpacePressedRef.current = true;
        }
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyUp?.(e);

    if (resolvedRole === 'button' && isActionable && !e.defaultPrevented) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (isSpacePressedRef.current) {
          isSpacePressedRef.current = false;
          onClick?.();
        }
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    onBlur?.(e);
    isSpacePressedRef.current = false;
  };

  // Roles supporting aria-selected per WAI-ARIA specification
  const isSelectableRole = resolvedRole && (
    resolvedRole === 'option' ||
    resolvedRole === 'tab' ||
    resolvedRole === 'row' ||
    resolvedRole === 'gridcell' ||
    resolvedRole === 'treeitem'
  );

  const {
    'aria-selected': ariaSelectedProp,
    'aria-pressed': ariaPressedProp,
    ...restProps
  } = props;

  const resolvedAriaSelected = isSelectableRole ? ariaSelectedProp : undefined;
  const resolvedAriaPressed = resolvedRole === 'button' ? ariaPressedProp : undefined;

  return (
    <div
      ref={ref}
      {...restProps}
      role={resolvedRole}
      tabIndex={resolvedTabIndex}
      aria-selected={resolvedAriaSelected}
      aria-pressed={resolvedAriaPressed}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
      style={{ ...accentStyles, ...style }}
      className={cn(
        "min-w-0",
        surfaceClasses[effectiveSurface],
        variantClasses[variant] || variantClasses.standard,
        paddingClass,
        isActionable && FOCUS.visible,
        hoverable && isActionable && cn(BORDER.hover, INTERACTIVE.hover),
        isActionable && !hoverable && 'cursor-pointer',
        accentClasses,
        className
      )}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

