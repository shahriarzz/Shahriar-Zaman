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

  const shouldSkipAnimation =
    isServerRendering ||
    disabled ||
    Boolean(isReducedMotion) ||
    target === 0 ||
    isNaN(target) ||
    !isFinite(target);

  // When skipping, or when target is 0, start with target immediately.
  // On client mount with animation active, start from 0 and animate to target.
  const [value, setValue] = useState<number>(() => (shouldSkipAnimation ? target : 0));

  const prevTargetRef = useRef<number>(target);
  const currentValRef = useRef<number>(shouldSkipAnimation ? target : 0);
  const isMountedRef = useRef<boolean>(false);

  useEffect(() => {
    if (shouldSkipAnimation) {
      setValue(target);
      currentValRef.current = target;
      prevTargetRef.current = target;
      return;
    }

    let startVal = 0;
    if (isMountedRef.current) {
      // If target hasn't changed, do not restart animation on unrelated re-renders
      if (prevTargetRef.current === target) {
        return;
      }
      startVal = currentValRef.current;
    } else {
      isMountedRef.current = true;
      startVal = 0;
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

  if (shouldSkipAnimation) {
    return target;
  }

  return value;
};


