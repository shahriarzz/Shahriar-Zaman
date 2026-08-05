import React from 'react';
import { cn } from '../../lib/utils';
import { RADIUS } from '../../styles/tokens';

export interface EmptyStateProps {
  icon?: React.ReactNode | React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  size?: 'compact' | 'default' | 'hero';
  className?: string;
}

const renderIcon = (
  iconItem: EmptyStateProps['icon'],
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
          "py-4 px-3 flex items-center justify-center gap-2 text-center text-zinc-500 font-mono text-xs border border-dashed border-zinc-800",
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
          "p-12 bg-zinc-900/10 border border-zinc-800/60 border-dashed flex flex-col items-center justify-center text-center space-y-3",
          RADIUS.panel,
          className
        )}
      >
        {icon && (
          <div className="p-4 rounded-2xl bg-zinc-900/40 text-zinc-500 mb-1 flex items-center justify-center">
            {renderIcon(icon, { size: 36 })}
          </div>
        )}
        <p className="font-display uppercase text-zinc-400 text-lg tracking-wide">
          {title}
        </p>
        {description && (
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider max-w-[240px] leading-relaxed">
            {description}
          </p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              "mt-3 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs uppercase font-bold tracking-wider transition-all cursor-pointer",
              RADIUS.button
            )}
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }

  // Default size
  return (
    <div
      className={cn(
        "py-8 px-6 bg-zinc-950/20 rounded-2xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-center space-y-2",
        RADIUS.card,
        className
      )}
    >
      {icon && (
        <div className="text-zinc-500 mb-1 flex items-center justify-center">
          {renderIcon(icon, { size: 24 })}
        </div>
      )}
      <p className="text-zinc-300 font-display uppercase text-sm tracking-wide">
        {title}
      </p>
      {description && (
        <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider max-w-[260px] leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            "mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs uppercase font-bold tracking-wider transition-all cursor-pointer",
            RADIUS.button
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
