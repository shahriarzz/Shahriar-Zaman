import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { RADIUS, BORDER, SURFACE, SHADOW, SPACING, TYPOGRAPHY } from '../../styles/tokens';

export interface DialogProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  children,
  size = 'md',
  className,
  closeOnEscape = true,
  closeOnBackdropClick = true,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Preserve and restore the body's previous inline "overflow" value rather than always resetting to empty string
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = previousOverflow;
        if (openerRef.current && typeof openerRef.current.focus === 'function') {
          openerRef.current.focus();
        }
      };
    }
  }, [isOpen]);

  // Focus management: initial focus and focus trap
  useEffect(() => {
    if (!isOpen) return;

    // Initial focus on first interactive element or dialog container
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable: HTMLElement[] = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        const visibleFocusable = focusable.filter(el => el.offsetParent !== null);

        if (visibleFocusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = visibleFocusable[0];
        const last = visibleFocusable[visibleFocusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeOnEscape, onClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Canonical Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (closeOnBackdropClick && onClose) {
                onClose();
              }
            }}
            className={cn("absolute inset-0", SURFACE.backdrop)}
            aria-hidden="true"
          />

          {/* Canonical Dialog Surface */}
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative w-full min-w-0 max-w-full text-zinc-200 focus:outline-none",
              SURFACE.panel,
              BORDER.standard,
              RADIUS.panel,
              SHADOW.modal,
              SPACING.section,
              "border",
              sizeClasses[size],
              className
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  isDanger?: boolean;
}

export const DialogHeader: React.FC<DialogHeaderProps> = ({
  eyebrow,
  title,
  description,
  icon,
  action,
  isDanger,
  children,
  className,
  ...props
}) => {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)} {...props}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && (
          <div
            className={cn(
              "p-2.5 flex-shrink-0 border",
              RADIUS.card,
              isDanger
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-orange-500/10 text-orange-500 border-orange-500/20"
            )}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 space-y-1.5 min-w-0">
          {eyebrow && (
            <p className={TYPOGRAPHY.eyebrow}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2
              className={cn(
                "text-base font-sans font-semibold tracking-tight",
                isDanger ? "text-red-400" : "text-zinc-100"
              )}
            >
              {title}
            </h2>
          )}
          {description && (
            <div className="text-xs text-zinc-400 font-mono leading-relaxed uppercase tracking-wider whitespace-pre-wrap">
              {description}
            </div>
          )}
          {children}
        </div>
      </div>
      {action && (
        <div className="shrink-0 flex items-center">
          {action}
        </div>
      )}
    </div>
  );
};

export interface DialogBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const DialogBody: React.FC<DialogBodyProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div className={cn("my-6 min-w-0", className)} {...props}>
      {children}
    </div>
  );
};

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const DialogFooter: React.FC<DialogFooterProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "mt-8 flex items-center justify-end gap-3",
        TYPOGRAPHY.dialogFooter,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
