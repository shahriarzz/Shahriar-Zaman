export * from './selectors/exerciseSelectors';
export * from './selectors/workoutSelectors';
export * from './selectors/logSelectors';
export * from './analytics/e1rm';
export * from './analytics/volume';
export * from './analytics/frequency';
export * from './analytics/personalBests';
export * from './analytics/performanceInsights';
export * from './training/sessionMetrics';
export * from './training/workoutMetrics';
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
