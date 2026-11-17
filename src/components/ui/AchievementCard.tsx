import React from 'react';
import { Trophy } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../../lib/utils';
import { getAccentColor, SemanticColor, SEMANTIC_COLORS, TYPOGRAPHY, SpacingIntent } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export interface AchievementCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: IconProp;
  accent?: SemanticColor;
  colorOverride?: string;
  size?: 'standard' | 'hero';
  padding?: SpacingIntent;
  className?: string;
}

export const AchievementCard: React.FC<AchievementCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accent = 'orange',
  colorOverride,
  size = 'standard',
  padding,
  className
}) => {
  const accentHex = colorOverride || getAccentColor(accent as SemanticColor) || SEMANTIC_COLORS.orange;
  const effectivePadding = padding || (size === 'hero' ? 'section' : 'standard');
  const valueTypography = size === 'hero' ? TYPOGRAPHY.statValueHero : TYPOGRAPHY.statValue;

  return (
    <Card
      variant="standard"
      accent={accent}
      colorOverride={colorOverride}
      padding={effectivePadding}
      className={cn("flex flex-col justify-between relative min-w-0 max-w-full", className)}
    >
      <div className="min-w-0 max-w-full">
        <div className="flex items-center gap-1.5 mb-2 min-h-[36px] min-w-0 max-w-full">
          <span
            className="shrink-0 flex items-center"
            style={{ color: accentHex }}
          >
            {renderIcon(icon, { size: 15, style: { color: accentHex } }) || (
              <Trophy size={15} style={{ color: accentHex }} />
            )}
          </span>
          <span
            className={cn(TYPOGRAPHY.label, "font-bold min-w-0 max-w-full whitespace-normal leading-tight")}
            style={{ color: accentHex }}
          >
            {title}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mt-2 min-w-0 max-w-full">
          <span className={cn(valueTypography, "text-white leading-none min-w-0 max-w-full break-words whitespace-normal")}>
            {value}
          </span>
        </div>
      </div>

      {subtitle && (
        <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400 mt-4 leading-relaxed min-w-0 max-w-full break-words whitespace-normal")}>
          {subtitle}
        </p>
      )}
    </Card>
  );
};
