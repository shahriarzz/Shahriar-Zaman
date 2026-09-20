import React, { useMemo } from 'react';
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
import { useCountUp } from '../../hooks/useCountUp';

export interface StatCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  formatValue?: (val: number) => string;
  disableAnimation?: boolean;
  animationDuration?: number;
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

interface ParsedStatValue {
  isNumeric: boolean;
  target: number;
  prefix: string;
  suffix: string;
  decimals: number;
  hasCommas: boolean;
  formatFn?: (val: number) => string;
}

function parseStatValue(
  value: string | number | null | undefined,
  formatValue?: (val: number) => string
): ParsedStatValue {
  if (value === null || value === undefined) {
    return { isNumeric: false, target: 0, prefix: '', suffix: '', decimals: 0, hasCommas: false };
  }

  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return { isNumeric: false, target: 0, prefix: '', suffix: '', decimals: 0, hasCommas: false };
    }
    const valStr = value.toString();
    const decimals = valStr.includes('.') ? (valStr.split('.')[1] || '').length : 0;
    return {
      isNumeric: true,
      target: value,
      prefix: '',
      suffix: '',
      decimals,
      hasCommas: false,
      formatFn: formatValue,
    };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '—' || trimmed === '-' || !trimmed) {
      return { isNumeric: false, target: 0, prefix: '', suffix: '', decimals: 0, hasCommas: false };
    }

    // Match numbers, decimals, +/- signs, commas, and optional suffix (k, M, etc.)
    const match = trimmed.match(/^([+-]?)([\d,]+(?:\.\d+)?)\s*([kKmMbB]?)$/);
    if (!match) {
      return { isNumeric: false, target: 0, prefix: '', suffix: '', decimals: 0, hasCommas: false };
    }

    const prefix = match[1] || '';
    const numStr = match[2];
    const suffix = match[3] || '';
    const cleaned = numStr.replace(/,/g, '');
    const target = parseFloat(cleaned);

    if (isNaN(target) || !isFinite(target)) {
      return { isNumeric: false, target: 0, prefix: '', suffix: '', decimals: 0, hasCommas: false };
    }

    const hasDecimals = numStr.includes('.');
    const decimals = hasDecimals ? (numStr.split('.')[1] || '').length : 0;
    const hasCommas = numStr.includes(',');

    return {
      isNumeric: true,
      target,
      prefix,
      suffix,
      decimals,
      hasCommas,
      formatFn: formatValue,
    };
  }

  return { isNumeric: false, target: 0, prefix: '', suffix: '', decimals: 0, hasCommas: false };
}

function formatAnimatedValue(
  current: number,
  parsed: ParsedStatValue
): string {
  if (parsed.formatFn) {
    return parsed.formatFn(current);
  }

  let formattedNum = '';
  if (parsed.decimals > 0) {
    formattedNum = current.toFixed(parsed.decimals);
  } else {
    formattedNum = Math.round(current).toString();
  }

  if (parsed.hasCommas) {
    const parts = formattedNum.split('.');
    const intPart = parseInt(parts[0], 10);
    parts[0] = isNaN(intPart) ? parts[0] : intPart.toLocaleString('en-US');
    formattedNum = parts.join('.');
  }

  return `${parsed.prefix}${formattedNum}${parsed.suffix}`;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  formatValue,
  disableAnimation = false,
  animationDuration = 800,
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
  const effectiveUnavailable =
    isUnavailable ||
    value === '—' ||
    value === '-' ||
    value === null ||
    value === undefined ||
    value === '';
  const effectiveAccent = effectiveUnavailable ? 'zinc' : accent;
  const effectiveColorOverride = effectiveUnavailable ? undefined : colorOverride;
  const accentHex = effectiveColorOverride || (effectiveUnavailable ? SEMANTIC_COLORS.zinc : (getAccentColor(effectiveAccent as SemanticColor) || SEMANTIC_COLORS.emerald));

  const parsed = useMemo(() => parseStatValue(value, formatValue), [value, formatValue]);

  const animatedNumber = useCountUp(parsed.target, {
    duration: animationDuration,
    disabled: disableAnimation || !parsed.isNumeric || effectiveUnavailable,
  });

  const displayString = useMemo(() => {
    if (effectiveUnavailable) return '—';
    if (!parsed.isNumeric) return String(value ?? '—');
    if (disableAnimation) {
      return parsed.formatFn ? parsed.formatFn(parsed.target) : formatAnimatedValue(parsed.target, parsed);
    }
    return formatAnimatedValue(animatedNumber, parsed);
  }, [effectiveUnavailable, parsed, animatedNumber, disableAnimation, value]);

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
        "flex h-full w-full min-w-0 max-w-full flex-col justify-between",
        className
      )}
    >
      <div className="min-w-0 max-w-full flex flex-col">
        {/* Header: Icon + Label (deterministic vertical center & consistent height) */}
        <div className="flex min-w-0 max-w-full items-center gap-2 mb-2 min-h-[36px]">
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

          <span className={cn(TYPOGRAPHY.label, "min-w-0 max-w-full break-words whitespace-normal leading-tight")}>
            {label}
          </span>
        </div>

        {/* Primary Value + Unit (anchored baseline alignment) */}
        <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1">
          <span
            className={cn(
              STAT_NUMBER_VARIANTS[size],
              "min-w-0 max-w-full break-words whitespace-normal",
              effectiveUnavailable && "text-zinc-500 font-mono tracking-normal"
            )}
          >
            {displayString}
          </span>

          {unit && !effectiveUnavailable && (
            <span className={cn(TYPOGRAPHY.unit, "shrink-0")}>
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Simplified Footer: sublabel on left, status/trend on right, anchored to bottom */}
      {(effectiveSublabel || metaBadge) && (
        <div className="mt-auto pt-2.5 min-w-0 max-w-full min-h-[32px] flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          {effectiveSublabel ? (
            <p className={cn(TYPOGRAPHY.metadata, "min-w-0 max-w-full flex-1 break-words whitespace-normal leading-tight")}>
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
