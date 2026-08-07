import React from 'react';
import { cn } from '../../lib/utils';
import { RADIUS, TYPOGRAPHY, BORDER, SURFACE, SEMANTIC_COLORS, SemanticColor, getAccentColor } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
  error?: string | boolean;
  success?: string | boolean;
  unit?: string;
  suffix?: React.ReactNode;
  icon?: IconProp;
  leftIcon?: IconProp;
  rightIcon?: IconProp;
  variant?: 'standard' | 'filled' | 'flush';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  helperText,
  error,
  success,
  unit,
  suffix,
  icon,
  leftIcon,
  rightIcon,
  variant = 'standard',
  size = 'md',
  fullWidth = true,
  className,
  id,
  disabled,
  ...props
}, ref) => {
  const generatedId = React.useId();
  const inputId = id || (label ? generatedId : undefined);
  const effectiveLeftIcon = leftIcon || icon;
  const effectiveUnit = unit || suffix;

  const isError = Boolean(error);
  const isSuccess = Boolean(success) && !isError;

  const sizeClasses: Record<'sm' | 'md' | 'lg', { input: string; icon: number; text: string }> = {
    sm: { input: 'py-1.5 px-2.5 text-xs', icon: 13, text: 'text-xs' },
    md: { input: 'py-2 px-3 text-sm', icon: 14, text: 'text-sm' },
    lg: { input: 'py-3 px-4 text-base', icon: 16, text: 'text-base' },
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
      {label && (
        <label
          htmlFor={inputId}
          className={cn(TYPOGRAPHY.label, "select-none flex items-center justify-between")}
        >
          <span>{label}</span>
          {typeof error === 'string' && (
            <span className="text-red-400 normal-case font-normal text-[10px] tracking-normal">
              {error}
            </span>
          )}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {effectiveLeftIcon && (
          <span className="absolute left-3 text-zinc-500 flex items-center pointer-events-none z-10">
            {renderIcon(effectiveLeftIcon, { size: currentSize.icon })}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={cn(
            "w-full font-mono text-white placeholder-zinc-600 outline-none transition-all",
            RADIUS.button,
            currentSize.input,
            effectiveLeftIcon ? "pl-9" : "",
            effectiveUnit || rightIcon ? "pr-12" : "",
            variant === 'standard' && cn(
              SURFACE.recessed,
              BORDER.standard,
              "border focus:border-orange-500"
            ),
            variant === 'filled' && cn(
              "bg-zinc-900/70 border border-transparent focus:border-zinc-700"
            ),
            variant === 'flush' && "bg-transparent border-b border-zinc-800 rounded-none focus:border-orange-500",
            isError && "border-red-500/70 focus:border-red-500 text-red-200",
            isSuccess && "border-emerald-500/70 focus:border-emerald-500 text-emerald-200",
            disabled && "opacity-40 cursor-not-allowed bg-zinc-900/30",
            className
          )}
          {...props}
        />

        {effectiveUnit && (
          <div className="absolute right-3 flex items-center pointer-events-none text-zinc-500 text-xs font-mono select-none">
            {effectiveUnit}
          </div>
        )}

        {!effectiveUnit && rightIcon && (
          <span className="absolute right-3 text-zinc-500 flex items-center pointer-events-none z-10">
            {renderIcon(rightIcon, { size: currentSize.icon })}
          </span>
        )}
      </div>

      {helperText && !error && (
        <p className="text-[10px] font-mono text-zinc-500 tracking-wide">
          {helperText}
        </p>
      )}
      {typeof error === 'string' && !label && (
        <p className="text-[10px] font-mono text-red-400 tracking-wide">
          {error}
        </p>
      )}
      {typeof success === 'string' && (
        <p className="text-[10px] font-mono text-emerald-400 tracking-wide">
          {success}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
