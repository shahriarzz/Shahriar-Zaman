import React from 'react';
import { cn } from '../../lib/utils';

export interface AmbientBackgroundProps {
  className?: string;
  intensity?: 'subtle' | 'standard';
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({
  className,
  intensity = 'standard',
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn("fixed inset-0 pointer-events-none overflow-hidden z-0", className)}
    >
      <div
        className={cn(
          "absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-[100px] pointer-events-none animate-pulse",
          intensity === 'subtle' ? "bg-orange-500/[0.04]" : "bg-orange-500/10"
        )}
      />
      <div
        className={cn(
          "absolute bottom-1/3 left-1/3 w-60 h-60 rounded-full blur-[120px] pointer-events-none",
          intensity === 'subtle' ? "bg-blue-500/[0.02]" : "bg-blue-500/5"
        )}
      />
    </div>
  );
};
