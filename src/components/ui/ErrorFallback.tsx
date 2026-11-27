import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { TriangleAlert, RotateCcw } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { TYPOGRAPHY, SURFACE, BORDER, RADIUS } from '../../styles/tokens';
import { cn } from '../../lib/utils';

import { isStorageUnavailableError } from '../../lib/safeStorage';

export interface ErrorFallbackProps {
  error: Error | null;
  onReset?: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onReset }) => {
  const isStorageBlocked = isStorageUnavailableError(error);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide().catch(() => {});
    }
  }, []);

  return (
    <div className={cn("min-h-screen flex items-center justify-center p-6 text-zinc-200", SURFACE.canvas)}>
      <Card
        variant="elevated"
        padding="section"
        className="max-w-xl w-full border-red-500/30 bg-red-950/20 space-y-5"
      >
        <div className="flex items-start gap-4">
          <div className={cn("p-3 bg-red-500/10 border border-red-500/20 text-red-400 shrink-0", RADIUS.card)}>
            <TriangleAlert size={24} />
          </div>
          <div className="space-y-1">
            <span className={cn(TYPOGRAPHY.eyebrow, "text-red-400")}>
              {isStorageBlocked ? 'Storage Access Blocked' : 'Protocol Halt'}
            </span>
            <h2 className={cn(TYPOGRAPHY.titleSubsection, "text-white")}>
              {isStorageBlocked ? 'Browser Storage Unavailable' : 'Runtime Exception Caught'}
            </h2>
            <p className={cn(TYPOGRAPHY.body, "text-zinc-400 text-xs")}>
              {isStorageBlocked
                ? 'GainLog cannot read or persist local browser storage in this browser context. Your existing data (if any) was not overwritten.'
                : 'GainLog encountered an unexpected error while executing the current application state.'}
            </p>
          </div>
        </div>

        {isStorageBlocked && (
          <div
            className={cn(
              SURFACE.recessed,
              BORDER.standard,
              RADIUS.card,
              "p-4 border space-y-1.5 text-xs text-zinc-300"
            )}
          >
            <p className="font-medium text-white">How to restore access</p>
            <p className="text-zinc-400">
              Enable site storage and cookies for this origin, exit restricted private or sandboxed browser modes, and reload GainLog.
            </p>
          </div>
        )}

        {error && (() => {
          const isDev = Boolean((import.meta as any).env?.DEV);
          const errorRefId = `ERR-${Math.abs(
            (error.message || '').split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
          ).toString(16).toUpperCase()}`;

          return isDev ? (
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
          ) : (
            <div
              className={cn(
                SURFACE.recessed,
                BORDER.standard,
                RADIUS.card,
                "p-4 border space-y-2 text-xs font-mono"
              )}
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span>INCIDENT REFERENCE</span>
                <span className="text-red-400 font-bold">{errorRefId}</span>
              </div>
              <p className="text-zinc-300">
                {isStorageBlocked
                  ? 'Local storage initialization was halted safely to prevent creating an empty overwrite.'
                  : 'A system error occurred. Your training logs and saved protocols remain safely preserved.'}
              </p>
            </div>
          );
        })()}

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
