import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';
import { Badge } from './Badge';
import { Button } from './Button';
import { SemanticColor, TYPOGRAPHY } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export type BannerVariant = 'warning' | 'success' | 'destructive' | 'info' | 'achievement';

export interface BannerProps {
  variant?: BannerVariant;
  size?: 'default' | 'compact';
  badge?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconProp;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
  children?: React.ReactNode;
}

const BANNER_CONFIG: Record<BannerVariant, {
  accent: SemanticColor;
  containerClass: string;
  badgeColor: SemanticColor;
}> = {
  warning: {
    accent: 'amber',
    containerClass: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    badgeColor: 'amber',
  },
  success: {
    accent: 'emerald',
    containerClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    badgeColor: 'emerald',
  },
  destructive: {
    accent: 'red',
    containerClass: 'border-red-500/30 bg-red-500/10 text-red-200',
    badgeColor: 'red',
  },
  info: {
    accent: 'zinc',
    containerClass: 'border-zinc-800 bg-zinc-900/60 text-zinc-300',
    badgeColor: 'zinc',
  },
  achievement: {
    accent: 'orange',
    containerClass: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
    badgeColor: 'orange',
  },
};

export const Banner: React.FC<BannerProps> = ({
  variant = 'warning',
  size = 'default',
  badge,
  title,
  description,
  icon,
  action,
  onDismiss,
  className,
  children,
}) => {
  const config = BANNER_CONFIG[variant] || BANNER_CONFIG.warning;
  const isCompact = size === 'compact';

  return (
    <Card
      variant="standard"
      padding={isCompact ? 'compact' : 'section'}
      className={cn("relative overflow-hidden", config.containerClass, className)}
    >
      <div className={cn(
        "relative z-10",
        isCompact
          ? "flex items-start justify-between gap-3"
          : "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
      )}>
        <div className={cn(isCompact ? "space-y-1" : "space-y-1.5", "flex-1 min-w-0")}>
          {(badge || icon) && (
            <div className="flex items-center gap-2">
              {badge && (
                <Badge
                  label={badge}
                  color={config.badgeColor}
                  variant="subtle"
                  size={isCompact ? "sm" : "md"}
                />
              )}
              {icon && renderIcon(icon, { size: isCompact ? 12 : 14 })}
            </div>
          )}
          {typeof title === 'string' ? (
            isCompact ? (
              <p className={cn(TYPOGRAPHY.metadata, "text-zinc-300 normal-case font-mono leading-relaxed break-words")}>
                {title}
              </p>
            ) : (
              <h3 className={cn(TYPOGRAPHY.titleSection, "font-black")}>
                {title}
              </h3>
            )
          ) : (
            title
          )}
          {typeof description === 'string' ? (
            <p className={cn(isCompact ? TYPOGRAPHY.caption : TYPOGRAPHY.body, "text-xs font-mono")}>
              {description}
            </p>
          ) : (
            description
          )}
          {children}
        </div>

        <div className={cn(
          "flex items-center gap-3 shrink-0",
          isCompact ? "w-auto" : "w-full sm:w-auto"
        )}>
          {action && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {action}
            </div>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              icon={<X size={16} />}
              onClick={onDismiss}
              className="text-zinc-500 hover:text-zinc-300"
              title="Dismiss"
              aria-label="Dismiss"
            />
          )}
        </div>
      </div>
    </Card>
  );
};
