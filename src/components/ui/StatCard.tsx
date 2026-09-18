import React from 'react';
import { Card, CardProps } from './Card';
import { Badge } from './Badge';
import { cn } from '../../lib/utils';
import {
  SemanticColor,
  SEMANTIC_COLORS,
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
  accentVariant?: CardProps['accentVariant'];
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
  standard: TYPOGRAPHY.statValue,
  hero: TYPOGRAPHY.statValueHero,
} as const;

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  icon,
  accent = 'emerald',
  colorOverride,
  accentVariant,
  sublabel,
  trend,
  trendDirection,
  isUnavailable = false,
  unavailableLabel,
  statusIndicator,
  size = 'standard',
  className
}) => {
  const effectiveUnavailable = isUnavailable || value === '—' || value === '-';
  const effectiveAccent = effectiveUnavailable ? 'zinc' : accent;
  const effectiveColorOverride = effectiveUnavailable ? undefined : colorOverride;
  const accentHex = effectiveColorOverride || (effectiveUnavailable ? SEMANTIC_COLORS.zinc : (getAccentColor(effectiveAccent as SemanticColor) || SEMANTIC_COLORS.emerald));

  const trendColorClass = trendDirection === 'positive'
    ? 'text-emerald-400'
    : trendDirection === 'negative'
      ? 'text-red-400'
      : trendDirection === 'neutral'
        ? 'text-zinc-400'
        : '';

  // Determine what to show in the meta slot (suppressed when unavailable to avoid misleading trend/status)
  const metaBadge = !effectiveUnavailable ? (statusIndicator ? (
    <Badge
      label={statusIndicator.label}
      color={statusIndicator.color || 'zinc'}
      size="sm"
      dot={false}
      className="shrink-0 max-w-full"
    />
  ) : trend ? (
    <div className={cn("shrink-0 max-w-full font-mono text-xs", trendColorClass)}>
      {trend}
    </div>
  ) : null) : null;

  const effectiveSublabel = effectiveUnavailable
    ? (sublabel || unavailableLabel || 'Building baseline')
    : sublabel;

  return (
    <Card
      variant="standard"
      accent={effectiveUnavailable ? 'zinc' : accent}
      colorOverride={effectiveUnavailable ? undefined : colorOverride}
      accentVariant={accentVariant}
      padding={size === 'hero' ? 'section' : 'standard'}
      className={cn(
        "flex h-full w-full min-w-0 max-w-full flex-col",
        className
      )}
    >
      <div className="min-w-0">
        {/* Header: Icon + Label */}
        <div className="flex min-w-0 max-w-full items-center gap-2 mb-2 min-h-[20px]">
          {icon && (
            <span
              className="shrink-0 flex items-center"
              style={{
                color: effectiveUnavailable ? SEMANTIC_COLORS.zinc : accentHex
              }}
            >
              {renderIcon(icon, {
                size: 16,
                style: {
                  color: effectiveUnavailable ? SEMANTIC_COLORS.zinc : accentHex
                }
              })}
            </span>
          )}

          <span className={cn(TYPOGRAPHY.label, "min-w-0 max-w-full break-words whitespace-normal")}>
            {label}
          </span>
        </div>

        {/* Primary Value + Unit */}
        <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1">
          <span
            className={cn(
              STAT_NUMBER_VARIANTS[size],
              "min-w-0 max-w-full break-words whitespace-normal",
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
        <div className="mt-auto pt-2.5 min-w-0 max-w-full flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          {effectiveSublabel ? (
            <p className="min-w-0 max-w-full flex-1 break-words whitespace-normal font-mono text-[10px] leading-tight text-zinc-500">
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
