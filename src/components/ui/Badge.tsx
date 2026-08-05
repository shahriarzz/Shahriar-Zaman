import React from 'react';
import { cn } from '../../lib/utils';
import { SemanticColor, getAccentColor, RADIUS } from '../../styles/tokens';

export interface BadgeProps {
  label: React.ReactNode;
  color?: SemanticColor | string;
  variant?: 'solid' | 'subtle' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
  icon?: React.ReactNode | React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;
  className?: string;
}

const renderIcon = (
  iconItem: BadgeProps['icon'],
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

export const Badge: React.FC<BadgeProps> = ({
  label,
  color,
  variant = 'subtle',
  size = 'sm',
  dot = true,
  icon,
  className
}) => {
  const resolvedColor = getAccentColor(color) || (typeof color === 'string' && color.startsWith('#') ? color : undefined);

  let style: React.CSSProperties = {};

  if (resolvedColor) {
    if (variant === 'subtle') {
      style = {
        backgroundColor: `${resolvedColor}22`,
        color: resolvedColor,
        borderColor: `${resolvedColor}55`,
      };
    } else if (variant === 'solid') {
      style = {
        backgroundColor: resolvedColor,
        color: '#000000',
        borderColor: resolvedColor,
      };
    } else if (variant === 'outline') {
      style = {
        backgroundColor: 'transparent',
        color: resolvedColor,
        borderColor: `${resolvedColor}66`,
      };
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center font-mono uppercase tracking-wider font-bold border transition-colors select-none shrink-0",
        RADIUS.pill,
        size === 'sm' ? "gap-1 px-2 py-0.5 text-[9px]" : "gap-1.5 px-2.5 py-1 text-[10px]",
        !resolvedColor && variant === 'subtle' && "bg-zinc-800/60 text-zinc-300 border-zinc-700/50",
        !resolvedColor && variant === 'outline' && "bg-transparent text-zinc-400 border-zinc-800",
        className
      )}
      style={style}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: resolvedColor || 'currentColor' }}
        />
      )}
      {icon && (
        <span className="shrink-0 flex items-center">
          {renderIcon(icon, { size: size === 'sm' ? 12 : 14 })}
        </span>
      )}
      <span className="truncate">{label}</span>
    </div>
  );
};
