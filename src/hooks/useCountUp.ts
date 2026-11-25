import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { prefersReducedMotion, DEFAULT_COUNT_UP_DURATION_MS } from '../lib/utils';

export interface UseCountUpOptions {
  duration?: number;
  disabled?: boolean;
  reducedMotion?: boolean;
}

const emptySubscribe = () => () => {};

export const useCountUp = (
  target: number,
  options?: UseCountUpOptions
): number => {
  const duration = options?.duration ?? DEFAULT_COUNT_UP_DURATION_MS;
  const disabled = options?.disabled ?? false;

  // Detect SSR / static string rendering (e.g. renderToString)
  const isServerRendering = useSyncExternalStore(
    emptySubscribe,
    () => false,
    () => true
  );

  // Use authoritative reduced-motion decision when provided by caller; otherwise check once
  const isReducedMotion = options?.reducedMotion ?? prefersReducedMotion();

  const isInvalidTarget = isNaN(target) || !isFinite(target);
  const resolvedTarget = isInvalidTarget ? 0 : target;

  const shouldSkipAnimation =
    isServerRendering ||
    disabled ||
    Boolean(isReducedMotion) ||
    target === 0 ||
    isInvalidTarget;

  // Initial state: immediately show target if skipping or if target is 0, otherwise start from 0
  const [value, setValue] = useState<number>(() => (shouldSkipAnimation ? resolvedTarget : 0));

  const currentValRef = useRef<number>(shouldSkipAnimation ? resolvedTarget : 0);

  useEffect(() => {
    if (shouldSkipAnimation) {
      if (currentValRef.current !== resolvedTarget) {
        currentValRef.current = resolvedTarget;
        setValue(resolvedTarget);
      }
      return;
    }

    const startVal = currentValRef.current;
    if (startVal === resolvedTarget) {
      setValue(resolvedTarget);
      return;
    }

    let animFrameId: number;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
      // Smooth ease-out cubic deceleration
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (resolvedTarget - startVal) * ease;

      currentValRef.current = current;

      if (progress >= 1) {
        currentValRef.current = resolvedTarget;
        setValue(resolvedTarget);
      } else {
        setValue(current);
        animFrameId = requestAnimationFrame(tick);
      }
    };

    animFrameId = requestAnimationFrame(tick);

    return () => {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, [resolvedTarget, duration, shouldSkipAnimation]);

  if (shouldSkipAnimation) {
    return resolvedTarget;
  }

  return value;
};
