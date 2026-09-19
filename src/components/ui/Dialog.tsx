import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { RADIUS, BORDER, SURFACE, SHADOW, SPACING, TYPOGRAPHY } from '../../styles/tokens';

export interface DialogProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
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
  // Lock background scroll when dialog is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    full: 'max-w-2xl',
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
            className="absolute inset-0 bg-[#040409]/80 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Canonical Dialog Surface */}
          <motion.div
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
              SPACING.modal,
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
  isDanger?: boolean;
}

export const DialogHeader: React.FC<DialogHeaderProps> = ({
  eyebrow,
  title,
  description,
  icon,
  isDanger,
  children,
  className,
  ...props
}) => {
  return (
    <div className={cn("flex items-start gap-4", className)} {...props}>
      {icon && (
        <div
          className={cn(
            "p-3 rounded-2xl flex-shrink-0 border",
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
        TYPOGRAPHY.label,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
