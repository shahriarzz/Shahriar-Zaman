import { useState, useEffect, useRef } from 'react';

export interface UseCountUpOptions {
  duration?: number;
  disabled?: boolean;
}

export const useCountUp = (
  target: number,
  optionsOrDuration: number | UseCountUpOptions = 800
): number => {
  const options: UseCountUpOptions =
    typeof optionsOrDuration === 'number'
      ? { duration: optionsOrDuration }
      : optionsOrDuration;

  const duration = options.duration ?? 800;
  const disabled = options.disabled ?? false;

  // Check prefers-reduced-motion in browser environments
  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const shouldSkipAnimation = disabled || Boolean(isReducedMotion);

  // In SSR / static render, start with target directly
  const [value, setValue] = useState(target);

  const prevTargetRef = useRef(target);
  const currentValRef = useRef(target);
  const isMountedRef = useRef(false);

  useEffect(() => {
    if (shouldSkipAnimation || isNaN(target) || !isFinite(target)) {
      setValue(target);
      currentValRef.current = target;
      prevTargetRef.current = target;
      return;
    }

    // Determine start value:
    // If not mounted yet (first client render), start from 0.
    // If already mounted and target didn't change, do nothing.
    // If target changed, start from currentValRef.current.
    let startVal = 0;
    if (isMountedRef.current) {
      if (prevTargetRef.current === target) {
        // No meaningful numeric change
        return;
      }
      startVal = currentValRef.current;
    } else {
      isMountedRef.current = true;
      startVal = 0;
      setValue(0);
      currentValRef.current = 0;
    }

    prevTargetRef.current = target;

    if (startVal === target) {
      setValue(target);
      currentValRef.current = target;
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
        setValue(target);
        currentValRef.current = target;
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
  }, [target, duration, shouldSkipAnimation]);

  return shouldSkipAnimation ? target : value;
};

