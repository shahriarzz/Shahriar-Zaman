import React from 'react';

export type IconProp =
  | React.ReactNode
  | React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }>;

export function renderIcon(
  iconItem: IconProp,
  props?: { size?: number | string; className?: string; style?: React.CSSProperties }
): React.ReactNode {
  if (!iconItem) return null;
  if (React.isValidElement(iconItem)) return iconItem;
  if (
    typeof iconItem === 'function' ||
    (typeof iconItem === 'object' &&
      iconItem !== null &&
      ('$$typeof' in (iconItem as object) || 'render' in (iconItem as object)))
  ) {
    const IconComp = iconItem as React.ComponentType<any>;
    return <IconComp {...props} />;
  }
  return iconItem as React.ReactNode;
}
