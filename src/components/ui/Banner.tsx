import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';
import { Badge } from './Badge';
import { SemanticColor, SEMANTIC_COLORS } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';

export type BannerVariant = 'warning' | 'success' | 'danger' | 'error' | 'info' | 'achievement';

export interface BannerProps {
  variant?: BannerVariant;
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
  bgGradient: string;
  badgeColor: SemanticColor;
  pingColor: string;
}> = {
  warning: {
    accent: 'amber',
    bgGradient: 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-zinc-900/40 to-transparent',
    badgeColor: 'amber',
    pingColor: 'bg-amber-500',
  },
  success: {
    accent: 'emerald',
    bgGradient: 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-zinc-900/40 to-transparent',
    badgeColor: 'emerald',
    pingColor: 'bg-emerald-500',
  },
  danger: {
    accent: 'red',
    bgGradient: 'border-red-500/40 bg-gradient-to-r from-red-500/10 via-zinc-900/40 to-transparent',
    badgeColor: 'red',
    pingColor: 'bg-red-500',
  },
  error: {
    accent: 'red',
    bgGradient: 'border-red-500/40 bg-gradient-to-r from-red-500/10 via-zinc-900/40 to-transparent',
    badgeColor: 'red',
    pingColor: 'bg-red-500',
  },
  info: {
    accent: 'zinc',
    bgGradient: 'border-zinc-700/40 bg-gradient-to-r from-zinc-700/10 via-zinc-900/40 to-transparent',
    badgeColor: 'zinc',
    pingColor: 'bg-zinc-400',
  },
  achievement: {
    accent: 'orange',
    bgGradient: 'border-orange-500/40 bg-gradient-to-r from-orange-500/15 via-zinc-900/40 to-transparent',
    badgeColor: 'orange',
    pingColor: 'bg-orange-500',
  },
};

export const Banner: React.FC<BannerProps> = ({
  variant = 'warning',
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

  return (
    <Card
      variant="elevated"
      padding="relaxed"
      className={cn("relative overflow-hidden", config.bgGradient, className)}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
        <div className="space-y-1.5 flex-1 min-w-0">
          {(badge || icon) && (
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full animate-ping", config.pingColor)} />
              {badge && <Badge label={badge} color={config.badgeColor} variant="subtle" />}
              {icon && renderIcon(icon, { size: 14 })}
            </div>
          )}
          {typeof title === 'string' ? (
            <h3 className="text-2xl font-black uppercase text-white tracking-tight leading-none font-display">
              {title}
            </h3>
          ) : (
            title
          )}
          {typeof description === 'string' ? (
            <p className="text-xs text-zinc-400 font-mono">
              {description}
            </p>
          ) : (
            description
          )}
          {children}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          {action && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {action}
            </div>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};
