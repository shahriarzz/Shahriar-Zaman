import React from 'react';
import { cn } from '../../lib/utils';
import { SURFACE, BORDER, RADIUS, SPACING, INTERACTIVE, TRANSITION, FOCUS } from '../../styles/tokens';

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  content?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  variant?: 'standard' | 'subtle' | 'recessed';
}

export const ListRow: React.FC<ListRowProps> = ({
  leading,
  content,
  trailing,
  children,
  selected = false,
  onClick,
  onKeyDown,
  onKeyUp,
  onBlur,
  role,
  tabIndex,
  className,
  variant = 'subtle',
  ...props
}) => {
  const isClickable = Boolean(onClick);
  const isSpacePressedRef = React.useRef(false);

  const resolvedRole = role !== undefined ? role : (isClickable ? 'button' : undefined);
  const resolvedTabIndex = tabIndex !== undefined ? tabIndex : (isClickable ? 0 : undefined);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);

    // Only apply built-in button keyboard behavior when resolvedRole is 'button' and clickable
    if (resolvedRole === 'button' && isClickable && !e.defaultPrevented) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onClick?.();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Prevent default page scroll on Space keydown; activation occurs on keyup
        e.preventDefault();
        if (!e.repeat) {
          isSpacePressedRef.current = true;
        }
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyUp?.(e);

    if (resolvedRole === 'button' && isClickable && !e.defaultPrevented) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (isSpacePressedRef.current) {
          isSpacePressedRef.current = false;
          onClick?.();
        }
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    onBlur?.(e);
    isSpacePressedRef.current = false;
  };

  // Roles supporting aria-selected per WAI-ARIA specification
  const isSelectableRole = resolvedRole && (
    resolvedRole === 'option' ||
    resolvedRole === 'tab' ||
    resolvedRole === 'row' ||
    resolvedRole === 'gridcell' ||
    resolvedRole === 'treeitem'
  );

  const {
    'aria-selected': ariaSelectedProp,
    'aria-pressed': ariaPressedProp,
    ...restProps
  } = props;

  // aria-selected is only emitted for selectable roles
  const resolvedAriaSelected = isSelectableRole
    ? (ariaSelectedProp !== undefined ? ariaSelectedProp : (selected !== undefined ? selected : undefined))
    : undefined;

  // aria-pressed is emitted for role="button" toggle buttons when aria-pressed is explicitly provided
  const resolvedAriaPressed = resolvedRole === 'button' ? ariaPressedProp : undefined;

  return (
    <div
      {...restProps}
      role={resolvedRole}
      tabIndex={resolvedTabIndex}
      aria-selected={resolvedAriaSelected}
      aria-pressed={resolvedAriaPressed}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
      className={cn(
        "border flex items-center justify-between gap-3 text-xs text-zinc-200",
        TRANSITION.interactive,
        RADIUS.button,
        SPACING.compact,
        variant === 'subtle' && SURFACE.subtle,
        variant === 'recessed' && SURFACE.recessed,
        variant === 'standard' && SURFACE.default,
        BORDER.standard,
        isClickable && cn(INTERACTIVE.hover, INTERACTIVE.active, "cursor-pointer select-none", FOCUS.visible),
        selected && "border-orange-500 bg-orange-500/10 text-white",
        className
      )}
    >
      {children ? (
        children
      ) : (
        <>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {leading && <div className="shrink-0">{leading}</div>}
            {content && <div className="min-w-0 flex-1">{content}</div>}
          </div>
          {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
        </>
      )}
    </div>
  );
};
