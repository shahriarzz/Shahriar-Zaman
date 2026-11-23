import React from 'react';

const INTERACTIVE_DESCENDANT_SELECTOR =
  'button, input, select, textarea, a[href], a[tabindex]:not([tabindex="-1"]), summary, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [contenteditable]:not([contenteditable="false"])';

function isEventFromNestedInteractive(
  target: EventTarget | null,
  currentTarget: HTMLElement
): boolean {
  if (!target || typeof (target as Node).nodeType !== 'number') {
    return false;
  }
  const element = (target as Node).nodeType === 3
    ? (target as Node).parentElement
    : (target as Element);

  if (!element || typeof element.closest !== 'function') {
    return false;
  }

  const interactiveDescendant = element.closest(INTERACTIVE_DESCENDANT_SELECTOR);
  return Boolean(
    interactiveDescendant &&
    interactiveDescendant !== currentTarget &&
    currentTarget.contains(interactiveDescendant)
  );
}

export interface UseButtonRoleKeyboardOptions<T extends HTMLElement> {
  isActionable: boolean;
  resolvedRole?: string;
  onActivate?: () => void;
  onKeyDown?: React.KeyboardEventHandler<T>;
  onKeyUp?: React.KeyboardEventHandler<T>;
  onBlur?: React.FocusEventHandler<T>;
}

export function useButtonRoleKeyboard<T extends HTMLElement>({
  isActionable,
  resolvedRole,
  onActivate,
  onKeyDown,
  onKeyUp,
  onBlur,
}: UseButtonRoleKeyboardOptions<T>) {
  const isSpacePressedRef = React.useRef(false);

  const handleKeyDown = (e: React.KeyboardEvent<T>) => {
    onKeyDown?.(e);

    if (isEventFromNestedInteractive(e.target, e.currentTarget)) {
      isSpacePressedRef.current = false;
      return;
    }

    // Only apply built-in button keyboard behavior when resolvedRole is 'button' and actionable
    if (resolvedRole === 'button' && isActionable && !e.defaultPrevented) {
      if (e.key === 'Enter') {
        // Native <button> triggers click repeatedly when Enter is held (e.repeat === true).
        e.preventDefault();
        onActivate?.();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Prevent default page scroll on Space keydown; activation occurs on keyup
        e.preventDefault();
        if (!e.repeat) {
          isSpacePressedRef.current = true;
        }
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<T>) => {
    onKeyUp?.(e);

    if (e.key === ' ' || e.key === 'Spacebar') {
      const wasPressed = isSpacePressedRef.current;
      isSpacePressedRef.current = false; // Unconditionally clear on Space keyup to prevent stale activation
      if (isEventFromNestedInteractive(e.target, e.currentTarget)) {
        return;
      }
      if (wasPressed && resolvedRole === 'button' && isActionable && !e.defaultPrevented) {
        e.preventDefault();
        onActivate?.();
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<T>) => {
    onBlur?.(e);
    isSpacePressedRef.current = false;
  };

  return { handleKeyDown, handleKeyUp, handleBlur };
}
