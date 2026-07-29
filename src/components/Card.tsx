import React from 'react';
import { cn } from '../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'standard' | 'elevated' | 'interactive' | 'panel' | 'overlay';
  className?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  variant = 'standard',
  className,
  ...props
}, ref) => {
  const variantClasses = {
    standard: 'bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 shadow-sm',
    elevated: 'bg-gradient-to-br from-zinc-850 to-zinc-900 border border-zinc-750/90 rounded-3xl p-6 shadow-md',
    interactive: 'bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 hover:bg-zinc-850 hover:border-zinc-700/80 transition-all cursor-pointer active:scale-[0.99] select-none',
    panel: 'bg-zinc-950/80 border border-zinc-850/80 rounded-3xl p-6 shadow-lg',
    overlay: 'bg-zinc-900/95 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl'
  };

  return (
    <div
      ref={ref}
      className={cn(variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';
