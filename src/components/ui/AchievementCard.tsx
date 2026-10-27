import React from 'react';
import { Trophy } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../../lib/utils';
import { getAccentColor, SemanticColor, SEMANTIC_COLORS, TYPOGRAPHY, RADIUS } from '../../styles/tokens';
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

const ACHIEVEMENT_GLOW_BACKDROP = "absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl pointer-events-none";

export const AchievementCard: React.FC<AchievementCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accent = 'orange',
  colorOverride,
  className
}) => {
  const accentHex = colorOverride || getAccentColor(accent as SemanticColor) || SEMANTIC_COLORS.orange;

  return (
    <Card
      variant="elevated"
      accent={accent}
      colorOverride={colorOverride}
      accentVariant="glow"
      padding="section"
      className={cn("flex flex-col justify-between relative overflow-hidden min-w-0 max-w-full", className)}
    >
      {/* Subtle brand glow backdrop */}
      <div
        aria-hidden="true"
        className={ACHIEVEMENT_GLOW_BACKDROP}
        style={{ backgroundColor: `${accentHex}1a` }}
      />

      <div className="min-w-0 max-w-full">
        <div className="flex items-center gap-2 mb-3 min-w-0 max-w-full">
          <div
            className={cn("p-2 shrink-0 flex items-center justify-center border", RADIUS.button)}
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
            className={cn(TYPOGRAPHY.label, "font-bold min-w-0 max-w-full break-words whitespace-normal leading-tight")}
            style={{ color: accentHex }}
          >
            {title}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mt-2 min-w-0 max-w-full">
          <span className={cn(TYPOGRAPHY.statValueHero, "text-white leading-none min-w-0 max-w-full break-words whitespace-normal")}>
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
