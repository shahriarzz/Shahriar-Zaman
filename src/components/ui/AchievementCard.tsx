import React from 'react';
import { Trophy } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../../lib/utils';
import { getAccentColor, SemanticColor, TYPOGRAPHY } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export interface AchievementCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: IconProp;
  accent?: SemanticColor;
  colorOverride?: string;
  className?: string;
}

export const AchievementCard: React.FC<AchievementCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accent = 'orange',
  colorOverride,
  className
}) => {
  const accentHex = colorOverride || getAccentColor(accent as SemanticColor) || '#f97316';

  return (
    <Card
      variant="elevated"
      accent={accent}
      colorOverride={colorOverride}
      accentStyle="glow"
      padding="section"
      className={cn("flex flex-col justify-between relative overflow-hidden", className)}
    >
      {/* Subtle brand glow backdrop */}
      <div
        aria-hidden="true"
        className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: `${accentHex}1a` }}
      />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="p-2 rounded-xl shrink-0 flex items-center justify-center border"
            style={{
              backgroundColor: `${accentHex}1a`,
              borderColor: `${accentHex}4d`,
              color: accentHex
            }}
          >
            {renderIcon(icon, { size: 16, style: { color: accentHex } }) || (
              <Trophy size={16} style={{ color: accentHex }} />
            )}
          </div>
          <span
            className={cn(TYPOGRAPHY.label, "font-bold")}
            style={{ color: accentHex }}
          >
            {title}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mt-2">
          <span className="font-display text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none">
            {value}
          </span>
        </div>
      </div>

      {subtitle && (
        <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400 mt-4 leading-relaxed")}>
          {subtitle}
        </p>
      )}
    </Card>
  );
};
