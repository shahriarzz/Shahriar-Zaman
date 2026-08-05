import React from 'react';
import { cn } from '../../lib/utils';
import {
  SURFACE,
  BORDER,
  RADIUS,
  SPACING,
  SHADOW,
  SemanticColor,
  getAccentColor
} from '../../styles/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'standard' | 'default' | 'elevated' | 'interactive' | 'panel' | 'overlay';
  accent?: SemanticColor | string | null;
  accentStyle?: 'border-left' | 'border-top' | 'glow' | null;
  hoverable?: boolean;
  onClick?: (e?: React.MouseEvent<HTMLDivElement>) => void;
  padding?: 'none' | 'compact' | 'sm' | 'md' | 'lg' | 'relaxed' | 'hero';
  children: React.ReactNode;
  className?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  variant = 'standard',
  accent,
  accentStyle,
  hoverable = false,
  onClick,
  padding,
  children,
  className,
  style,
  ...props
}, ref) => {
  const normalizedVariant = variant === 'default' ? 'standard' : variant;
  // Determine default padding based on variant if not specified
  const effectivePaddingKey = padding !== undefined ? padding : (normalizedVariant === 'panel' || normalizedVariant === 'elevated' ? 'lg' : 'md');
  const paddingClass = SPACING[effectivePaddingKey] || '';

  const variantClasses = {
    standard: cn(SURFACE[2], BORDER.default, RADIUS.card, SHADOW.elevation, 'border'),
    elevated: cn('bg-gradient-to-br from-zinc-900 to-zinc-950', BORDER.default, RADIUS.panel, SHADOW.elevation, 'border'),
    interactive: cn(
      SURFACE[2],
      BORDER.default,
      RADIUS.card,
      'border hover:bg-zinc-900/80 hover:border-zinc-700 transition-all active:scale-[0.99] select-none'
    ),
    panel: cn(SURFACE[1], BORDER.default, RADIUS.panel, SHADOW.panel, 'border'),
    overlay: cn('bg-zinc-900/95', BORDER.default, RADIUS.panel, SHADOW.panel, 'border backdrop-blur-xl')
  };

  const resolvedAccentHex = getAccentColor(accent);

  let accentClasses = '';
  let accentStyles: React.CSSProperties = {};

  if (resolvedAccentHex && accentStyle) {
    if (accentStyle === 'border-left') {
      accentClasses = 'border-l-4';
      accentStyles.borderLeftColor = resolvedAccentHex;
    } else if (accentStyle === 'border-top') {
      accentClasses = 'border-t-4';
      accentStyles.borderTopColor = resolvedAccentHex;
    } else if (accentStyle === 'glow') {
      accentStyles.boxShadow = `0 0 20px ${resolvedAccentHex}40`;
    }
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{ ...accentStyles, ...style }}
      className={cn(
        variantClasses[variant],
        paddingClass,
        hoverable && 'hover:border-zinc-700 transition-all',
        onClick && 'cursor-pointer',
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
