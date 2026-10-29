import React from 'react';
import { cn } from '../../lib/utils';
import { SURFACE, BORDER, RADIUS, SPACING, INTERACTIVE, TRANSITION, FOCUS } from '../../styles/tokens';

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  content?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  variant?: 'standard' | 'subtle' | 'recessed';
}

export const ListRow: React.FC<ListRowProps> = ({
  leading,
  content,
  trailing,
  children,
  selected = false,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  className,
  variant = 'subtle',
  ...props
}) => {
  const isClickable = Boolean(onClick);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);

    if (isClickable && !e.defaultPrevented) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    }
  };

  const resolvedRole = role !== undefined ? role : (isClickable ? 'button' : undefined);
  const resolvedTabIndex = tabIndex !== undefined ? tabIndex : (isClickable ? 0 : undefined);
  const resolvedAriaSelected = props['aria-selected'] !== undefined
    ? props['aria-selected']
    : (selected ? true : undefined);
  const resolvedAriaPressed = props['aria-pressed'] !== undefined
    ? props['aria-pressed']
    : (isClickable && selected ? true : undefined);

  return (
    <div
      {...props}
      role={resolvedRole}
      tabIndex={resolvedTabIndex}
      aria-selected={resolvedAriaSelected}
      aria-pressed={resolvedAriaPressed}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "border flex items-center justify-between gap-3 text-xs text-zinc-200",
        TRANSITION.interactive,
        RADIUS.button,
        SPACING.compact,
        variant === 'subtle' && SURFACE.subtle,
        variant === 'recessed' && SURFACE.recessed,
        variant === 'standard' && SURFACE.default,
        BORDER.standard,
        isClickable && cn(INTERACTIVE.hover, INTERACTIVE.active, "cursor-pointer select-none", FOCUS.visible),
        selected && "border-orange-500 bg-orange-500/10 text-white",
        className
      )}
    >
      {children ? (
        children
      ) : (
        <>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {leading && <div className="shrink-0">{leading}</div>}
            {content && <div className="min-w-0 flex-1">{content}</div>}
          </div>
          {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
        </>
      )}
    </div>
  );
};
