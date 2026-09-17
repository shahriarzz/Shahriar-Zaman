import React from 'react';
import { TriangleAlert, RotateCcw } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { TYPOGRAPHY, SURFACE, BORDER, RADIUS } from '../../styles/tokens';
import { cn } from '../../lib/utils';

export interface ErrorFallbackProps {
  error: Error | null;
  onReset?: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onReset }) => {
  return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center p-6 text-zinc-200">
      <Card
        variant="elevated"
        padding="section"
        className="max-w-xl w-full border-red-500/30 bg-red-950/20 space-y-5"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 shrink-0">
            <TriangleAlert size={24} />
          </div>
          <div className="space-y-1">
            <span className={cn(TYPOGRAPHY.eyebrow, "text-red-400")}>Protocol Halt</span>
            <h2 className={cn(TYPOGRAPHY.titleSubsection, "text-white")}>Runtime Exception Caught</h2>
            <p className={cn(TYPOGRAPHY.body, "text-zinc-400 text-xs")}>
              GainLog encountered an unexpected error while executing the current application state.
            </p>
          </div>
        </div>

        {error && (
          <pre
            className={cn(
              SURFACE.recessed,
              BORDER.standard,
              RADIUS.card,
              "p-4 border font-mono text-xs text-red-300 overflow-x-auto whitespace-pre-wrap max-h-60 leading-relaxed select-all"
            )}
          >
            {error.toString()}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            size="md"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              if (onReset) {
                onReset();
              } else {
                window.location.reload();
              }
            }}
          >
            Reload GainLog
          </Button>
        </div>
      </Card>
    </div>
  );
};
