import React from 'react';
import { cn } from '../../lib/utils';
import { RADIUS, TYPOGRAPHY, BORDER, SURFACE, SPACING, GAP } from '../../styles/tokens';
import { renderIcon, IconProp } from './renderIcon';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: IconProp;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  size?: 'compact' | 'default' | 'hero';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  size = 'default',
  className
}) => {
  if (size === 'compact') {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-center text-zinc-500 border border-dashed",
          SPACING.compact,
          GAP.xs,
          BORDER.standard,
          TYPOGRAPHY.metadata,
          RADIUS.card,
          className
        )}
      >
        {icon && <span className="shrink-0 text-zinc-500 flex items-center">{renderIcon(icon, { size: 14 })}</span>}
        <span className="text-zinc-400">{title}</span>
        {description && <span className="text-zinc-600">· {description}</span>}
      </div>
    );
  }

  if (size === 'hero') {
    return (
      <div
        className={cn(
          "p-8 md:p-12 border border-dashed flex flex-col items-center justify-center text-center space-y-3",
          SURFACE.subtle,
          BORDER.subtle,
          RADIUS.panel,
          className
        )}
      >
        {icon && (
          <div className={cn("p-4 text-zinc-500 mb-1 flex items-center justify-center", SURFACE.subtle, RADIUS.card)}>
            {renderIcon(icon, { size: 36 })}
          </div>
        )}
        <p className={TYPOGRAPHY.emptyTitle}>
          {title}
        </p>
        {description && (
          <p className={TYPOGRAPHY.emptyDescription}>
            {description}
          </p>
        )}
        {action && (
          <Button
            size="md"
            variant="secondary"
            onClick={action.onClick}
            className="mt-3"
          >
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  // Default size
  return (
    <div
      className={cn(
        "py-8 px-6 border border-dashed flex flex-col items-center justify-center text-center space-y-2",
        SURFACE.subtle,
        BORDER.standard,
        RADIUS.card,
        className
      )}
    >
      {icon && (
        <div className="text-zinc-500 mb-1 flex items-center justify-center">
          {renderIcon(icon, { size: 24 })}
        </div>
      )}
      <p className={TYPOGRAPHY.emptyTitle}>
        {title}
      </p>
      {description && (
        <p className={TYPOGRAPHY.emptyDescription}>
          {description}
        </p>
      )}
      {action && (
        <Button
          size="sm"
          variant="secondary"
          onClick={action.onClick}
          className="mt-2"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
};

