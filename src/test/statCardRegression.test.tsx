// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StatCard } from '../components/ui/StatCard';
import { formatCompactWeight } from '../utils/fitnessCalculations';

describe('StatCard Architecture & Display Regression Suite', () => {
  describe('formatCompactWeight helper', () => {
    it('formats numbers below 1,000 as standard integers without suffix', () => {
      expect(formatCompactWeight(0)).toBe('0');
      expect(formatCompactWeight(846)).toBe('846');
      expect(formatCompactWeight(999)).toBe('999');
    });

    it('formats thousands with k suffix and 1 decimal place when needed', () => {
      expect(formatCompactWeight(1000)).toBe('1k');
      expect(formatCompactWeight(1200)).toBe('1.2k');
      expect(formatCompactWeight(124600)).toBe('124.6k');
    });

    it('formats millions with M suffix', () => {
      expect(formatCompactWeight(1300000)).toBe('1.3M');
      expect(formatCompactWeight(2500000)).toBe('2.5M');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatCompactWeight(-100)).toBe('0');
      expect(formatCompactWeight(NaN)).toBe('0');
    });
  });

  describe('StatCard Rendering & Typography Constraints', () => {
    it('renders value and unit separately without concatenated strings', () => {
      const html = renderToString(
        <StatCard
          label="Total Volume"
          value={formatCompactWeight(124600)}
          unit="kg"
        />
      );

      expect(html).toContain('124.6k');
      expect(html).toContain('kg');
      // Unit is in its own span with proper styling
      expect(html).toMatch(/<span[^>]*>kg<\/span>/);
    });

    it('hides the unit when value is a dash or placeholder', () => {
      const html = renderToString(
        <StatCard
          label="Strength Trend"
          value="—"
          unit="%"
        />
      );

      expect(html).toContain('—');
      expect(html).not.toContain('%');
    });

    it('hides the unit when isUnavailable is true', () => {
      const html = renderToString(
        <StatCard
          label="Strength Trend"
          value={15}
          unit="%"
          isUnavailable={true}
        />
      );

      // Dash is displayed instead of 15
      expect(html).toContain('—');
      expect(html).not.toContain('%');
    });

    it('applies tabular-nums to numeric values for alignment and legibility', () => {
      const html = renderToString(
        <StatCard
          label="Duration"
          value={45}
          unit="min"
        />
      );

      expect(html).toContain('tabular-nums');
      expect(html).toContain('45');
    });

    it('allows long labels without truncate or horizontal overflow', () => {
      const html = renderToString(
        <StatCard
          label="Very Long Descriptive Section Label That Should Not Clip"
          value={100}
        />
      );

      expect(html).toContain('Very Long Descriptive Section Label That Should Not Clip');
      expect(html).not.toContain('truncate');
      expect(html).toContain('break-words');
    });

    it('allows long sublabels to wrap without truncation', () => {
      const html = renderToString(
        <StatCard
          label="Sessions"
          value={12}
          sublabel="Comparing current cycle cadence with previous 28-day baseline period"
        />
      );

      expect(html).toContain('Comparing current cycle cadence with previous 28-day baseline period');
      expect(html).toContain('break-words');
      expect(html).not.toContain('truncate');
    });

    it('renders status badge cleanly in the metadata slot', () => {
      const html = renderToString(
        <StatCard
          label="Performance Score"
          value={84}
          statusIndicator={{ label: 'STRONG', color: 'emerald' }}
          sublabel="28-day evaluation"
        />
      );

      expect(html).toContain('STRONG');
      expect(html).toContain('28-day evaluation');
    });

    it('renders trend indicator when provided', () => {
      const html = renderToString(
        <StatCard
          label="Window Volume"
          value="42.6k"
          unit="kg"
          trend="+8.4%"
          trendDirection="positive"
        />
      );

      expect(html).toContain('+8.4%');
      expect(html).toContain('text-emerald-400');
    });

    it('renders fallback unavailable label when unavailable and sublabel not provided', () => {
      const html = renderToString(
        <StatCard
          label="Performance Score"
          value="—"
          isUnavailable={true}
          unavailableLabel="Building baseline"
        />
      );

      expect(html).toContain('Building baseline');
      expect(html).toContain('text-zinc-500');
    });
  });
});
