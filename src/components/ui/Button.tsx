import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { RADIUS, SemanticColor, getAccentColor, SEMANTIC_COLORS, BORDER, SURFACE } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';
import { haptics } from '../../utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'danger' | 'warning' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type HapticType = 'light' | 'medium' | 'selection' | 'success' | 'warning' | 'none';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: SemanticColor;
  colorOverride?: string;
  icon?: IconProp;
  iconPosition?: 'left' | 'right';
  leftIcon?: IconProp;
  rightIcon?: IconProp;
  loading?: boolean;
  fullWidth?: boolean;
  haptic?: HapticType;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary',
  size = 'md',
  color,
  colorOverride,
  icon,
  iconPosition = 'left',
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  haptic,
  disabled,
  className,
  children,
  onClick,
  style,
  ...props
}, ref) => {
  const resolvedColor = colorOverride || getAccentColor(color);
  const isDestructive = variant === 'destructive' || variant === 'danger';

  const defaultHaptic = (): void => {
    if (haptic === 'none') return;
    if (haptic && haptic in haptics) {
      haptics[haptic as keyof typeof haptics]();
      return;
    }
    if (isDestructive) {
      haptics.warning();
    } else if (variant === 'primary' || variant === 'success') {
      haptics.medium();
    } else {
      haptics.light();
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    defaultHaptic();
    onClick?.(e);
  };

  const variantClasses: Record<string, string> = {
    primary: 'bg-orange-500 hover:bg-orange-400 text-black font-bold border-transparent',
    secondary: cn(SURFACE.default, BORDER.standard, 'border hover:bg-zinc-800 text-zinc-200 font-bold'),
    outline: cn(BORDER.standard, 'border hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300 font-bold bg-transparent'),
    ghost: 'hover:bg-zinc-800/60 text-zinc-400 hover:text-white font-bold border-transparent bg-transparent',
    destructive: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold',
    warning: 'bg-amber-500 hover:bg-amber-400 text-black font-bold border-transparent',
    success: 'bg-emerald-500 hover:bg-emerald-400 text-black font-bold border-transparent',
  };

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-[11px] gap-1.5 min-h-[30px]',
    md: 'px-5 py-2.5 text-xs gap-2 min-h-[38px]',
    lg: 'px-8 py-3.5 text-xs tracking-wider gap-2.5 min-h-[46px]',
    icon: 'p-2 text-sm justify-center min-h-[36px] min-w-[36px]',
  };

  const iconSizes: Record<ButtonSize, number> = {
    sm: 13,
    md: 15,
    lg: 16,
    icon: 16,
  };

  const effectiveLeftIcon = leftIcon || (iconPosition === 'left' ? icon : undefined);
  const effectiveRightIcon = rightIcon || (iconPosition === 'right' ? icon : undefined);

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onClick={handleClick}
      style={{
        ...(resolvedColor && (variant === 'primary' || colorOverride) ? { backgroundColor: resolvedColor } : {}),
        ...style
      }}
      className={cn(
        "inline-flex items-center justify-center font-mono uppercase tracking-wider transition-all select-none cursor-pointer",
        RADIUS.button,
        variantClasses[variant] || variantClasses.secondary,
        sizeClasses[size],
        fullWidth && "w-full",
        (disabled || loading) && "opacity-40 cursor-not-allowed pointer-events-none",
        !disabled && !loading && "active:scale-[0.98]",
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin shrink-0" size={iconSizes[size]} />
      ) : (
        effectiveLeftIcon && (
          <span className="shrink-0 flex items-center">
            {renderIcon(effectiveLeftIcon, { size: iconSizes[size] })}
          </span>
        )
      )}

      {children && (
        <span className={cn(size === 'icon' && "sr-only")}>
          {children}
        </span>
      )}

      {!loading && effectiveRightIcon && (
        <span className="shrink-0 flex items-center">
          {renderIcon(effectiveRightIcon, { size: iconSizes[size] })}
        </span>
      )}
    </button>
  );
});

Button.displayName = 'Button';
