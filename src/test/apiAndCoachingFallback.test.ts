import { describe, it, expect } from 'vitest';
import { getApiBaseUrl, buildApiUrl } from '../utils/apiConfig';
import { generateClientCoachingFallback } from '../utils/aiAdviceFallback';

describe('API Configuration & Offline Coaching Fallback', () => {
  it('buildApiUrl generates clean endpoints', () => {
    const url1 = buildApiUrl('/api/fitness/advice');
    const url2 = buildApiUrl('api/fitness/advice');

    expect(url1).toContain('/api/fitness/advice');
    expect(url2).toContain('/api/fitness/advice');
  });

  it('generates intelligent client coaching fallback for new exercise', () => {
    const advice = generateClientCoachingFallback('Barbell Bench Press', '8-12', []);
    expect(advice).toContain('Barbell Bench Press');
    expect(advice).toContain('8-12');
    expect(advice).toContain('baseline');
  });

  it('generates progressive overload advice when user hit previous rep targets', () => {
    const history = [
      {
        date: '2026-10-01',
        sets: [
          { weight: 100, reps: 10, done: true },
          { weight: 100, reps: 8, done: true }
        ]
      }
    ];

    const advice = generateClientCoachingFallback('Barbell Back Squat', '8-10', history);
    expect(advice).toContain('100kg');
    expect(advice).toContain('10 reps');
    expect(advice).toContain('advance load by 2.5kg');
  });

  it('generates volume and mechanical tension advice when reps were below threshold', () => {
    const history = [
      {
        date: '2026-10-01',
        sets: [
          { weight: 120, reps: 5, done: true }
        ]
      }
    ];

    const advice = generateClientCoachingFallback('Deadlift', '5', history);
    expect(advice).toContain('120kg');
    expect(advice).toContain('mechanical tension');
  });
});
