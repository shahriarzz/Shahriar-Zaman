import React from 'react';
import { Card } from './Card';
import { cn } from '../../lib/utils';
import {
  SemanticColor,
  getAccentColor,
  TYPOGRAPHY
} from '../../styles/tokens';

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode | React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;
  accent?: SemanticColor | string;
  color?: SemanticColor | string;
  sublabel?: string;
  trend?: React.ReactNode;
  size?: 'standard' | 'hero';
  variant?: 'standard' | 'default' | 'elevated' | 'interactive' | 'panel' | 'overlay';
  className?: string;
}

const renderIcon = (
  iconItem: StatCardProps['icon'],
  props?: { size?: number | string; className?: string; style?: React.CSSProperties }
): React.ReactNode => {
  if (!iconItem) return null;
  if (React.isValidElement(iconItem)) return iconItem;
  if (
    typeof iconItem === 'function' ||
    (typeof iconItem === 'object' && iconItem !== null && '$$typeof' in (iconItem as object))
  ) {
    const IconComp = iconItem as React.ComponentType<any>;
    return <IconComp {...props} />;
  }
  return iconItem as React.ReactNode;
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  icon,
  accent,
  color = 'emerald',
  sublabel,
  trend,
  size = 'standard',
  variant = 'standard',
  className
}) => {
  const effectiveAccent = accent || color || 'emerald';
  const accentHex = getAccentColor(effectiveAccent) || '#10b981';
  const effectiveVariant = variant === 'default' ? 'standard' : variant;

  return (
    <Card
      variant={effectiveVariant}
      padding={size === 'hero' ? 'lg' : 'md'}
      className={cn("flex flex-col justify-between", className)}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="shrink-0 flex items-center" style={{ color: accentHex }}>
                {renderIcon(icon, { size: 16 })}
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
          <span className={size === 'hero' ? TYPOGRAPHY.statNumberHero : TYPOGRAPHY.statNumber}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {unit && (
            <span className="font-mono text-xs text-zinc-500 font-normal">
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
