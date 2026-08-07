import React from 'react';
import { cn } from '../../lib/utils';
import { SemanticColor, getAccentColor, RADIUS } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export type BadgeTone = 'achievement' | 'success' | 'warning' | 'danger' | 'info' | 'workout' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  tone?: BadgeTone;
  color?: SemanticColor;
  colorOverride?: string;
  variant?: 'solid' | 'subtle' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
  icon?: IconProp;
  className?: string;
}

const TONE_PRESETS: Record<BadgeTone, { color: SemanticColor; variant: 'solid' | 'subtle' | 'outline' }> = {
  achievement: { color: 'orange', variant: 'subtle' },
  success: { color: 'emerald', variant: 'subtle' },
  warning: { color: 'amber', variant: 'subtle' },
  danger: { color: 'red', variant: 'subtle' },
  info: { color: 'zinc', variant: 'subtle' },
  workout: { color: 'emerald', variant: 'subtle' },
  neutral: { color: 'zinc', variant: 'subtle' },
};

function getContrastTextColor(hex?: string): string {
  if (!hex) return '#ffffff';
  const cleaned = hex.replace('#', '');
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 155 ? '#000000' : '#ffffff';
  }
  return '#ffffff';
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  tone,
  color,
  colorOverride,
  variant,
  size = 'sm',
  dot = true,
  icon,
  className,
  style: userStyle,
  ...restProps
}) => {
  const tonePreset = tone ? TONE_PRESETS[tone] : undefined;
  const effectiveColor = color || tonePreset?.color;
  const effectiveVariant = variant || tonePreset?.variant || 'subtle';

  const resolvedColor = colorOverride || getAccentColor(effectiveColor);

  let style: React.CSSProperties = {};

  if (resolvedColor) {
    if (effectiveVariant === 'subtle') {
      style = {
        backgroundColor: `${resolvedColor}22`,
        color: resolvedColor,
        borderColor: `${resolvedColor}55`,
      };
    } else if (effectiveVariant === 'solid') {
      style = {
        backgroundColor: resolvedColor,
        color: getContrastTextColor(resolvedColor),
        borderColor: resolvedColor,
      };
    } else if (effectiveVariant === 'outline') {
      style = {
        backgroundColor: 'transparent',
        color: resolvedColor,
        borderColor: `${resolvedColor}66`,
      };
    }
  }

  // Mutually exclusive: If icon is present, do not render dot
  const hasDot = dot && !icon;

  return (
    <div
      className={cn(
        "inline-flex items-center font-mono uppercase tracking-wider font-bold border transition-colors select-none shrink-0",
        RADIUS.pill,
        size === 'sm' ? "gap-1 px-2 py-0.5 text-[9px]" : "gap-1.5 px-2.5 py-1 text-[10px]",
        !resolvedColor && effectiveVariant === 'subtle' && "bg-zinc-800/60 text-zinc-300 border-zinc-700/50",
        !resolvedColor && effectiveVariant === 'outline' && "bg-transparent text-zinc-400 border-zinc-800",
        className
      )}
      style={{ ...style, ...userStyle }}
      {...restProps}
    >
      {hasDot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: resolvedColor || 'currentColor' }}
        />
      )}
      {icon && (
        <span className="shrink-0 flex items-center">
          {renderIcon(icon, { size: size === 'sm' ? 12 : 14 })}
        </span>
      )}
      <span className="truncate">{label}</span>
    </div>
  );
};
