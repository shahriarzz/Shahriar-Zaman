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
import { useButtonRoleKeyboard } from './useInteractiveKeyboardActivation';

export type CardSurface = 'base' | 'subtle' | 'recessed' | 'elevated';
export type CardAccentVariant = 'left' | 'top';
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

  const isInteractiveActionable = variant === 'interactive' && isActionable;
  const isHoverableActionable = hoverable && isActionable;

  // Single authoritative transition token based on complete interaction state:
  // Actionable interactive cards with active scale feedback retain TRANSITION.button.
  // Hoverable-only actionable cards use TRANSITION.interactive.
  const resolvedTransition = isInteractiveActionable
    ? TRANSITION.button
    : isHoverableActionable
    ? TRANSITION.interactive
    : undefined;

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
        INTERACTIVE.active,
        'select-none cursor-pointer',
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
    }
  }

  const resolvedRole = role !== undefined ? role : (isActionable ? 'button' : undefined);
  const resolvedTabIndex = tabIndex !== undefined ? tabIndex : (isActionable ? 0 : undefined);

  const { handleKeyDown, handleKeyUp, handleBlur } = useButtonRoleKeyboard<HTMLDivElement>({
    isActionable,
    resolvedRole,
    onActivate: onClick ? () => onClick() : undefined,
    onKeyDown,
    onKeyUp,
    onBlur,
  });

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
        resolvedTransition,
        isActionable && FOCUS.visible,
        isHoverableActionable && cn(BORDER.hover, INTERACTIVE.hover),
        isActionable && !isInteractiveActionable && !hoverable && 'cursor-pointer',
        accentClasses,
        className
      )}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

