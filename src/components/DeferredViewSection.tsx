import React, { useState, useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

interface DeferredViewSectionProps {
  children: React.ReactNode;
  minHeight?: number | string;
  rootMargin?: string;
  className?: string;
  placeholder?: React.ReactNode;
}

/**
 * Lightweight viewport-aware section wrapper.
 * Defers mounting heavy chart/analysis DOM nodes until they approach the viewport.
 * Once mounted, remains mounted for the lifecycle of the parent view.
 * Respects user reduced-motion preferences.
 */
export const DeferredViewSection: React.FC<DeferredViewSectionProps> = ({
  children,
  minHeight = 280,
  rootMargin = '200px',
  className = '',
  placeholder
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [isRendered, setIsRendered] = useState(() => {
    // If IntersectionObserver is not supported (e.g. older browser or JSDOM), render immediately
    return typeof IntersectionObserver === 'undefined';
  });

  useEffect(() => {
    if (isRendered) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsRendered(true);
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && (entry.isIntersecting || entry.intersectionRatio > 0)) {
          setIsRendered(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [isRendered, rootMargin]);

  const styleMinHeight = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;

  if (!isRendered) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ minHeight: styleMinHeight }}
        aria-hidden="true"
      >
        {placeholder || (
          <div
            className="w-full h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/40 flex items-center justify-center"
            style={{ minHeight: styleMinHeight }}
          >
            <div
              className={cn(
                "w-5 h-5 border-2 border-zinc-800 border-t-orange-500 rounded-full",
                shouldReduceMotion ? "opacity-60" : "animate-spin [animation-duration:1s]"
              )}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};
