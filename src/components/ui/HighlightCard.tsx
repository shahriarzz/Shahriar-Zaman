import React from 'react';
import { Trophy } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../../lib/utils';
import { SEMANTIC_COLORS, TYPOGRAPHY } from '../../styles/tokens';

export interface HighlightCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode | React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;
  className?: string;
}

const renderIcon = (
  iconItem: HighlightCardProps['icon'],
  props?: { size?: number | string; className?: string; style?: React.CSSProperties }
): React.ReactNode => {
  if (!iconItem) return <Trophy size={16} style={{ color: SEMANTIC_COLORS.orange }} />;
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

export const HighlightCard: React.FC<HighlightCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  className
}) => {
  return (
    <Card
      variant="elevated"
      accent="orange"
      accentStyle="glow"
      padding="lg"
      className={cn("flex flex-col justify-between relative overflow-hidden", className)}
    >
      {/* Subtle brand glow backdrop */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 shrink-0 flex items-center justify-center">
            {renderIcon(icon, { size: 16, style: { color: SEMANTIC_COLORS.orange } })}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-orange-400 font-bold">
            {title}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mt-2">
          <span className={cn(TYPOGRAPHY.statNumberHero, "text-white")}>
            {value}
          </span>
        </div>
      </div>

      {subtitle && (
        <p className="font-mono text-[11px] text-zinc-400 mt-4 leading-relaxed">
          {subtitle}
        </p>
      )}
    </Card>
  );
};
