import React from 'react';
import { cn } from '../../lib/utils';
import { RADIUS, TYPOGRAPHY, BORDER, SURFACE, FOCUS } from '../../styles/tokens';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string | boolean;
  variant?: 'standard' | 'filled' | 'flush';
  fullWidth?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  helperText,
  error,
  variant = 'standard',
  fullWidth = true,
  className,
  id,
  disabled,
  ...props
}, ref) => {
  const generatedId = React.useId();
  const textareaId = id || (label ? generatedId : undefined);
  const isError = Boolean(error);

  return (
    <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
      {label && (
        <label
          htmlFor={textareaId}
          className={cn(TYPOGRAPHY.label, "select-none flex items-center justify-between")}
        >
          <span>{label}</span>
          {typeof error === 'string' && (
            <span className={cn(TYPOGRAPHY.errorText, "normal-case font-normal")}>
              {error}
            </span>
          )}
        </label>
      )}

      <textarea
        ref={ref}
        id={textareaId}
        disabled={disabled}
        className={cn(
          "w-full font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-all p-3 resize-none",
          RADIUS.button,
          variant === 'standard' && cn(
            SURFACE.recessed,
            BORDER.standard,
            "border",
            FOCUS.ring
          ),
          variant === 'filled' && cn(
            SURFACE.subtle,
            "border border-transparent",
            BORDER.interactive
          ),
          variant === 'flush' && cn("bg-transparent border-b rounded-none", BORDER.standard, FOCUS.ring),
          isError && "border-red-500/70 focus:border-red-500 text-red-200",
          disabled && "opacity-40 cursor-not-allowed bg-zinc-900/30",
          className
        )}
        {...props}
      />

      {helperText && !error && (
        <p className={TYPOGRAPHY.helperText}>
          {helperText}
        </p>
      )}
      {typeof error === 'string' && !label && (
        <p className={TYPOGRAPHY.errorText}>
          {error}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';
