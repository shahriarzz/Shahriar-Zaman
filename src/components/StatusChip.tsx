import React from 'react';
import { cn } from '../lib/utils';

export interface StatusChipProps {
  label: React.ReactNode;
  color?: string; // Hex or CSS color
  variant?: 'solid' | 'subtle' | 'outline';
  dot?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  label,
  color,
  variant = 'subtle',
  dot = true,
  className,
  icon
}) => {
  let style: React.CSSProperties = {};

  if (color) {
    if (variant === 'subtle') {
      style = {
        backgroundColor: `${color}22`,
        color: color,
        borderColor: `${color}55`,
      };
    } else if (variant === 'solid') {
      style = {
        backgroundColor: color,
        color: '#000000',
        borderColor: color,
      };
    } else if (variant === 'outline') {
      style = {
        backgroundColor: 'transparent',
        color: color,
        borderColor: `${color}66`,
      };
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9px] uppercase tracking-wider font-bold border transition-colors select-none shrink-0",
        !color && variant === 'subtle' && "bg-zinc-800/60 text-zinc-300 border-zinc-700/50",
        !color && variant === 'outline' && "bg-transparent text-zinc-400 border-zinc-800",
        className
      )}
      style={style}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color || 'currentColor' }}
        />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </div>
  );
};
