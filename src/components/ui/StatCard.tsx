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
  size?: 'standard' | 'hero';
  className?: string;
}

const STAT_NUMBER_VARIANTS = {
  standard: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  hero: 'font-display text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none',
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
  size = 'standard',
  className
}) => {
  const accentHex = colorOverride || getAccentColor(accent as SemanticColor) || '#10b981';

  return (
    <Card
      variant="standard"
      accent={accent}
      colorOverride={colorOverride}
      accentStyle={accentStyle}
      padding={size === 'hero' ? 'section' : 'standard'}
      className={cn("flex flex-col justify-between", className)}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="shrink-0 flex items-center" style={{ color: accentHex }}>
                {renderIcon(icon, { size: 16, style: { color: accentHex } })}
              </span>
            )}
            <span className={cn(TYPOGRAPHY.label, "truncate")}>
              {label}
            </span>
          </div>

          {trend && (
            <div className="shrink-0">
              {trend}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-1 mt-1">
          <span className={STAT_NUMBER_VARIANTS[size]}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {unit && (
            <span className={TYPOGRAPHY.unit}>
              {unit}
            </span>
          )}
        </div>
      </div>

      {sublabel && (
        <p className="font-mono text-[10px] text-zinc-500 mt-2 truncate">
          {sublabel}
        </p>
      )}
    </Card>
  );
};
