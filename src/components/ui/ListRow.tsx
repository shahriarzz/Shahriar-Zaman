import React from 'react';
import { cn } from '../../lib/utils';
import { SURFACE, BORDER, RADIUS, SPACING, INTERACTIVE } from '../../styles/tokens';

export interface ListRowProps {
  leading?: React.ReactNode;
  content?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  selected?: boolean;
  interactive?: boolean;
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
  interactive = false,
  onClick,
  className,
  variant = 'subtle',
}) => {
  const isClickable = Boolean(onClick || interactive);

  return (
    <div
      onClick={onClick}
      className={cn(
        "border flex items-center justify-between gap-3 text-xs text-zinc-200 transition-all",
        RADIUS.button,
        SPACING.compact,
        variant === 'subtle' && SURFACE.subtle,
        variant === 'recessed' && SURFACE.recessed,
        variant === 'standard' && SURFACE.default,
        BORDER.standard,
        isClickable && INTERACTIVE.hover,
        isClickable && "cursor-pointer",
        selected && "border-orange-500 bg-orange-500/10 text-white shadow-[0_0_15px_rgba(249,115,22,0.15)]",
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
