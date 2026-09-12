import React from 'react';
import { Card, CardProps } from './Card';
import { cn } from '../../lib/utils';
import {
  SemanticColor,
  getAccentColor,
  TYPOGRAPHY
} from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: IconProp;
  accent?: SemanticColor;
  colorOverride?: string;
  accentStyle?: CardProps['accentStyle'];
  sublabel?: string;
  trend?: React.ReactNode;
  trendDirection?: 'positive' | 'negative' | 'neutral';
  isUnavailable?: boolean;
  unavailableLabel?: string;
  statusIndicator?: {
    label: string;
    color?: SemanticColor;
  };
  size?: 'standard' | 'hero';
  className?: string;
}

const STAT_NUMBER_VARIANTS = {
  standard: 'font-display text-3xl sm:text-[2rem] uppercase tracking-tight text-white leading-none tabular-nums',
  hero: 'font-display text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none tabular-nums',
} as const;

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  icon,
  accent = 'emerald',
  colorOverride,
  accentStyle,
  sublabel,
  trend,
  trendDirection,
  isUnavailable = false,
  unavailableLabel,
  statusIndicator,
  size = 'standard',
  className
}) => {
  const accentHex = colorOverride || getAccentColor(accent as SemanticColor) || '#10b981';
  const effectiveUnavailable = isUnavailable || value === '—' || value === '-';

  const trendColorClass = trendDirection === 'positive'
    ? 'text-emerald-400'
    : trendDirection === 'negative'
      ? 'text-rose-400'
      : trendDirection === 'neutral'
        ? 'text-zinc-400'
        : '';

  // Determine what to show in the meta slot (status replaces trend when both present to prevent clutter)
  const metaBadge = statusIndicator ? (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider",
        statusIndicator.color === 'emerald' &&
          "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
        statusIndicator.color === 'orange' &&
          "text-orange-400 border-orange-500/30 bg-orange-500/10",
        statusIndicator.color === 'amber' &&
          "text-amber-400 border-amber-500/30 bg-amber-500/10",
        statusIndicator.color === 'rose' &&
          "text-rose-400 border-rose-500/30 bg-rose-500/10",
        (!statusIndicator.color || statusIndicator.color === 'zinc') &&
          "text-zinc-400 border-zinc-700/40"
      )}
    >
      {statusIndicator.label}
    </span>
  ) : trend ? (
    <div className={cn("shrink-0 font-mono text-xs", trendColorClass)}>
      {trend}
    </div>
  ) : null;

  const effectiveSublabel = effectiveUnavailable
    ? (unavailableLabel || sublabel || 'Building baseline')
    : sublabel;

  return (
    <Card
      variant="standard"
      accent={effectiveUnavailable ? 'zinc' : accent}
      colorOverride={colorOverride}
      accentStyle={accentStyle}
      padding={size === 'hero' ? 'section' : 'standard'}
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden",
        className
      )}
    >
      <div className="min-w-0">
        {/* Header: Icon + Label */}
        <div className="flex min-w-0 items-center gap-2 mb-2">
          {icon && (
            <span
              className="shrink-0 flex items-center"
              style={{
                color: effectiveUnavailable ? '#71717a' : accentHex
              }}
            >
              {renderIcon(icon, {
                size: 16,
                style: {
                  color: effectiveUnavailable ? '#71717a' : accentHex
                }
              })}
            </span>
          )}

          <span className={cn(TYPOGRAPHY.label, "min-w-0 break-words")}>
            {label}
          </span>
        </div>

        {/* Primary Value + Unit */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1">
          <span
            className={cn(
              STAT_NUMBER_VARIANTS[size],
              "min-w-0 max-w-full break-words",
              effectiveUnavailable && "text-zinc-500 font-mono tracking-normal"
            )}
          >
            {effectiveUnavailable ? '—' : (typeof value === 'number' ? value.toLocaleString() : value)}
          </span>

          {unit && !effectiveUnavailable && (
            <span className={cn(TYPOGRAPHY.unit, "shrink-0")}>
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Simplified Footer: sublabel on left, status/trend on right */}
      {(effectiveSublabel || metaBadge) && (
        <div className="mt-2.5 min-w-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {effectiveSublabel ? (
            <p className="min-w-0 flex-1 break-words font-mono text-[10px] leading-tight text-zinc-500">
              {effectiveSublabel}
            </p>
          ) : (
            <span />
          )}

          {metaBadge}
        </div>
      )}
    </Card>
  );
};
