import React from 'react';
import { cn } from '../../lib/utils';
import { SURFACE, BORDER, RADIUS, SPACING, INTERACTIVE, TRANSITION, FOCUS } from '../../styles/tokens';
import { useButtonRoleKeyboard } from './useInteractiveKeyboardActivation';

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  content?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
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
  disabled = false,
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
  const isClickable = Boolean(onClick) && !disabled;

  const resolvedRole = role !== undefined ? role : ((Boolean(onClick) || disabled) ? 'button' : undefined);
  const resolvedTabIndex = disabled ? undefined : (tabIndex !== undefined ? tabIndex : (isClickable ? 0 : undefined));

  const { handleKeyDown, handleKeyUp, handleBlur } = useButtonRoleKeyboard<HTMLDivElement>({
    isActionable: isClickable,
    resolvedRole,
    onActivate: onClick,
    onKeyDown,
    onKeyUp,
    onBlur,
  });

  // Roles supporting aria-selected per WAI-ARIA specification
  const isSelectableRole = resolvedRole && (
    resolvedRole === 'option' ||
    resolvedRole === 'tab' ||
    resolvedRole === 'row' ||
    resolvedRole === 'gridcell' ||
    resolvedRole === 'treeitem'
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    onClick?.();
  };

  const {
    'aria-selected': ariaSelectedProp,
    'aria-pressed': ariaPressedProp,
    'aria-disabled': ariaDisabledProp,
    ...restProps
  } = props;

  // aria-selected is only emitted for selectable roles
  const resolvedAriaSelected = isSelectableRole
    ? (ariaSelectedProp !== undefined ? ariaSelectedProp : (selected !== undefined ? selected : undefined))
    : undefined;

  // aria-pressed is emitted for role="button" toggle buttons when aria-pressed is explicitly provided
  const resolvedAriaPressed = resolvedRole === 'button' ? ariaPressedProp : undefined;

  // aria-disabled indicates disabled interaction
  const resolvedAriaDisabled = disabled ? 'true' : (ariaDisabledProp !== undefined ? ariaDisabledProp : undefined);

  return (
    <div
      {...restProps}
      role={resolvedRole}
      tabIndex={resolvedTabIndex}
      aria-selected={resolvedAriaSelected}
      aria-pressed={resolvedAriaPressed}
      aria-disabled={resolvedAriaDisabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
      className={cn(
        "border flex items-center justify-between gap-3 text-xs text-zinc-200",
        isClickable ? TRANSITION.button : TRANSITION.interactive,
        RADIUS.button,
        SPACING.compact,
        variant === 'subtle' && SURFACE.subtle,
        variant === 'recessed' && SURFACE.recessed,
        variant === 'standard' && SURFACE.default,
        BORDER.standard,
        disabled && cn(INTERACTIVE.disabled, "cursor-not-allowed pointer-events-none select-none"),
        !disabled && isClickable && cn(INTERACTIVE.hover, INTERACTIVE.active, "cursor-pointer select-none", FOCUS.visible),
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
