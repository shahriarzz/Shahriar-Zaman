import React, { useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Info, ArrowUpRight } from 'lucide-react';
import { Card, CardProps } from './Card';
import { Badge } from './Badge';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import { cn, prefersReducedMotion, DEFAULT_COUNT_UP_DURATION_MS } from '../../lib/utils';
import {
  SemanticColor,
  SEMANTIC_COLORS,
  getAccentColor,
  TYPOGRAPHY,
  TRANSITION,
  DURATION,
  BORDER,
  RADIUS,
  SURFACE
} from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';
import { useCountUp } from '../../hooks/useCountUp';

export interface StatCardInfo {
  title: string;
  measures: string;
  calculation: string;
  period: string;
  excludes: string;
  limitations?: string;
}

export interface StatCardDetailAction {
  label: string;
  onClick: () => void;
}

export interface StatCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  formatValue?: (val: number) => string;
  animateValue?: boolean;
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
  info?: StatCardInfo;
  detailAction?: StatCardDetailAction;
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
  animateValue = false,
  disableAnimation = false,
  animationDuration = DEFAULT_COUNT_UP_DURATION_MS,
  icon,
  accent = 'zinc',
  colorOverride,
  accentVariant,
  sublabel,
  trend,
  trendDirection,
  isUnavailable = false,
  unavailableLabel,
  statusIndicator,
  info,
  detailAction,
  size = 'standard',
  className
}) => {
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const effectiveUnavailable =
    isUnavailable ||
    value === '—' ||
    value === '-' ||
    value === null ||
    value === undefined ||
    value === '';
  const effectiveAccent = effectiveUnavailable ? 'zinc' : accent;
  const effectiveColorOverride = effectiveUnavailable ? undefined : colorOverride;
  const accentHex = effectiveColorOverride || (effectiveUnavailable ? SEMANTIC_COLORS.zinc : (getAccentColor(effectiveAccent as SemanticColor) || SEMANTIC_COLORS.zinc));

  const parsed = useMemo(() => parseStatValue(value, formatValue), [value, formatValue]);

  const motionReduced = useReducedMotion();
  const shouldReduceMotion = motionReduced ?? prefersReducedMotion();
  const shouldAnimate = Boolean(animateValue) && !disableAnimation;

  const animatedNumber = useCountUp(parsed.target, {
    duration: animationDuration,
    disabled: !shouldAnimate || !parsed.isNumeric || effectiveUnavailable,
    reducedMotion: shouldReduceMotion,
  });

  const isCountingUp =
    shouldAnimate &&
    !shouldReduceMotion &&
    parsed.isNumeric &&
    !effectiveUnavailable &&
    parsed.target !== 0 &&
    animatedNumber !== parsed.target;

  const displayString = useMemo(() => {
    if (effectiveUnavailable) return '—';
    if (!parsed.isNumeric) return String(value ?? '—');
    if (!shouldAnimate) {
      return formatAnimatedValue(parsed.target, parsed);
    }
    return formatAnimatedValue(animatedNumber, parsed);
  }, [effectiveUnavailable, parsed, animatedNumber, shouldAnimate, value]);

  const prevTargetRef = React.useRef<string | number | null | undefined>(null);
  const isFirstMountRef = React.useRef(true);
  const [isValueChanging, setIsValueChanging] = React.useState(false);

  React.useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevTargetRef.current = value;
      return;
    }
    if (prevTargetRef.current !== value) {
      prevTargetRef.current = value;
      if (shouldReduceMotion) return;
      setIsValueChanging(true);
      const timer = setTimeout(() => setIsValueChanging(false), DURATION.fast);
      return () => clearTimeout(timer);
    }
  }, [value, shouldReduceMotion]);

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
    <div className={cn("shrink-0 max-w-full font-mono text-xs tabular-nums", trendColorClass)}>
      {trend}
    </div>
  ) : null) : null;

  const effectiveSublabel = effectiveUnavailable
    ? (sublabel || unavailableLabel || 'Building baseline')
    : sublabel;

  const valueContent = (
    <>
      <span
        data-countup-animating={isCountingUp ? 'true' : undefined}
        className={cn(
          STAT_NUMBER_VARIANTS[size],
          "min-w-0 max-w-full break-words whitespace-normal",
          TRANSITION.opacity,
          isValueChanging && !shouldReduceMotion && "opacity-50",
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
    </>
  );

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
        <div className="flex min-w-0 max-w-full items-center justify-between gap-1.5 mb-2 min-h-[36px]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
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

          {info && (
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              aria-label={`Explain ${label}`}
              aria-haspopup="dialog"
              aria-expanded={isInfoOpen}
              className={cn(
                "relative z-10 shrink-0 w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                "after:content-[''] after:absolute after:-inset-2",
                RADIUS.badge,
                TRANSITION.colors
              )}
            >
              <Info size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Primary Value + Unit (anchored baseline alignment; optional sibling Analytics drill-down trigger) */}
        {detailAction ? (
          <button
            type="button"
            onClick={detailAction.onClick}
            aria-label={detailAction.label}
            className={cn(
              "group/kpi relative flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1 text-left cursor-pointer",
              "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
              "after:content-[''] after:absolute after:-inset-1",
              RADIUS.button
            )}
          >
            {valueContent}
          </button>
        ) : (
          <div className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1">
            {valueContent}
          </div>
        )}
      </div>

      {/* Simplified Footer: sublabel on left, status/trend on right, anchored to bottom */}
      {(effectiveSublabel || metaBadge) && (
        <div className="mt-auto pt-2.5 min-w-0 max-w-full min-h-[32px] flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          {effectiveSublabel ? (
            <p className={cn(TYPOGRAPHY.metadata, "min-w-0 max-w-full flex-1 basis-[110px] break-words whitespace-normal leading-tight tabular-nums")}>
              {effectiveSublabel}
            </p>
          ) : (
            <span />
          )}

          {metaBadge}
        </div>
      )}

      {info && (
        <Dialog
          isOpen={isInfoOpen}
          onClose={() => setIsInfoOpen(false)}
          size="sm"
        >
          <DialogHeader
            eyebrow="Metric Definition"
            title={info.title}
          />
          <DialogBody className="my-4">
            <dl className={cn("border divide-y text-xs", BORDER.subtle, RADIUS.card, SURFACE.recessed)}>
              <div className="p-3 space-y-1">
                <dt className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Measures</dt>
                <dd className="text-zinc-200 leading-relaxed">{info.measures}</dd>
              </div>
              <div className="p-3 space-y-1">
                <dt className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Calculation</dt>
                <dd className="text-zinc-200 leading-relaxed">{info.calculation}</dd>
              </div>
              <div className="p-3 space-y-1">
                <dt className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Period</dt>
                <dd className="text-zinc-200 leading-relaxed">{info.period}</dd>
              </div>
              <div className="p-3 space-y-1">
                <dt className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Excludes</dt>
                <dd className="text-zinc-200 leading-relaxed">{info.excludes}</dd>
              </div>
              {info.limitations && (
                <div className="p-3 space-y-1">
                  <dt className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Notes & Limits</dt>
                  <dd className="text-zinc-300 leading-relaxed">{info.limitations}</dd>
                </div>
              )}
            </dl>
          </DialogBody>
          <DialogFooter className="mt-4">
            {detailAction && (
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowUpRight size={14} />}
                iconPosition="right"
                onClick={() => {
                  setIsInfoOpen(false);
                  detailAction.onClick();
                }}
              >
                Open Analytics
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsInfoOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </Card>
  );
};
