import { useState, useEffect, useRef, useSyncExternalStore } from 'react';

export interface UseCountUpOptions {
  duration?: number;
  disabled?: boolean;
}

const emptySubscribe = () => () => {};

export const useCountUp = (
  target: number,
  options?: UseCountUpOptions
): number => {
  const duration = options?.duration ?? 800;
  const disabled = options?.disabled ?? false;

  // Detect SSR / static string rendering (e.g. renderToString)
  const isServerRendering = useSyncExternalStore(
    emptySubscribe,
    () => false,
    () => true
  );

  // Check prefers-reduced-motion in browser environments
  const isReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isInvalidTarget = isNaN(target) || !isFinite(target);

  const shouldSkipAnimation =
    isServerRendering ||
    disabled ||
    Boolean(isReducedMotion) ||
    target === 0 ||
    isInvalidTarget;

  // Initial state: immediately show target if skipping or if target is 0, otherwise start from 0
  const [value, setValue] = useState<number>(() => (shouldSkipAnimation ? (isInvalidTarget ? 0 : target) : 0));

  const currentValRef = useRef<number>(shouldSkipAnimation ? (isInvalidTarget ? 0 : target) : 0);

  useEffect(() => {
    if (shouldSkipAnimation) {
      const finalVal = isInvalidTarget ? 0 : target;
      setValue(finalVal);
      currentValRef.current = finalVal;
      return;
    }

    const startVal = currentValRef.current;
    if (startVal === target) {
      setValue(target);
      return;
    }

    let animFrameId: number;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Smooth ease-out cubic deceleration
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (target - startVal) * ease;

      currentValRef.current = current;

      if (progress >= 1) {
        currentValRef.current = target;
        setValue(target);
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
  }, [target, duration, disabled, shouldSkipAnimation, isInvalidTarget]);

  if (shouldSkipAnimation) {
    return isInvalidTarget ? 0 : target;
  }

  return value;
};


