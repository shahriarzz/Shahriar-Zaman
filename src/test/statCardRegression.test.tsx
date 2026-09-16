// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StatCard } from '../components/ui/StatCard';
import { Grid } from '../components/ui/Grid';
import { formatCompactWeight } from '../utils/fitnessHelpers';

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

    it('forces neutral zinc accent and suppresses misleading trend/status when unavailable', () => {
      const html = renderToString(
        <StatCard
          label="Strength Trend"
          value="—"
          accent="emerald"
          colorOverride="#10b981"
          trend="+15%"
          trendDirection="positive"
          statusIndicator={{ label: 'STRONG', color: 'emerald' }}
          isUnavailable={true}
          unavailableLabel="Building baseline"
        />
      );

      // Value is placeholder
      expect(html).toContain('—');
      // Unavailable copy is present
      expect(html).toContain('Building baseline');
      // Misleading trend or status badge is suppressed
      expect(html).not.toContain('+15%');
      expect(html).not.toContain('STRONG');
      // Color override does not survive into unavailable state
      expect(html).not.toContain('rgb(16, 185, 129)');
      expect(html).not.toContain('#10b981');
    });

    it('applies strengthened width constraint classes for long monthly values and labels', () => {
      const html = renderToString(
        <StatCard
          label="Monthly Aggregate Tonnage Volume"
          value="1,452.8k"
          unit="kg"
          trend="+18.5% vs previous month"
          trendDirection="positive"
          sublabel="Confidence: High · 8 comparable exercises compared"
          statusIndicator={{ label: 'RECORD HIGH VOLUME', color: 'emerald' }}
        />
      );

      // Verify root container constraints
      expect(html).toContain('w-full min-w-0 max-w-full flex-col overflow-hidden');
      // Verify label wrapping
      expect(html).toContain('min-w-0 max-w-full break-words whitespace-normal');
      // Verify value wrapping
      expect(html).toContain('1,452.8k');
      // Verify sublabel wrapping
      expect(html).toContain('Confidence: High · 8 comparable exercises compared');
      // Verify badge retains shrink-0 and max-w-full
      expect(html).toContain('shrink-0 max-w-full');
    });

    it('renders edge case monthly sublabels cleanly without overflow', () => {
      const firstMonthHtml = renderToString(
        <StatCard
          label="Strength Trend"
          value="—"
          isUnavailable={true}
          unavailableLabel="No Overlap"
          sublabel="First recorded month"
        />
      );
      expect(firstMonthHtml).toContain('First recorded month');
      expect(firstMonthHtml).toContain('w-full min-w-0 max-w-full');

      const noMatchHtml = renderToString(
        <StatCard
          label="Strength Trend"
          value="—"
          isUnavailable={true}
          unavailableLabel="No Overlap"
          sublabel="No matching lifts vs prev"
        />
      );
      expect(noMatchHtml).toContain('No matching lifts vs prev');
      expect(noMatchHtml).toContain('w-full min-w-0 max-w-full');
    });

    it('renders the monthly report grid structure with width-constrained items and extreme values', () => {
      const gridHtml = renderToString(
        <Grid cols={1} colsSm={2} colsLg={4} gap="md" className="grid-cols-1 min-w-0 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 w-full">
            <StatCard
              label="Sessions"
              value={42}
              accent="zinc"
              trend="+6 vs previous month"
              trendDirection="positive"
              sublabel="Completed 100% of cycle target"
            />
          </div>
          <div className="min-w-0 w-full">
            <StatCard
              label="Volume"
              value="2,450.8k"
              unit="kg"
              accent="emerald"
              trend="+18.4% (All-time high volume window)"
              trendDirection="positive"
            />
          </div>
          <div className="min-w-0 w-full">
            <StatCard
              label="PRs"
              value={19}
              accent="amber"
              trend="+4 new records"
              trendDirection="positive"
              sublabel="Barbell Incline Close-Grip Bench Press with Pauses"
              statusIndicator={{ label: 'RECORD SURGE', color: 'amber' }}
            />
          </div>
          <div className="min-w-0 w-full">
            <StatCard
              label="Strength Trend"
              value="—"
              accent="indigo"
              isUnavailable={true}
              unavailableLabel="No Overlap"
              sublabel="First recorded month"
            />
          </div>
        </Grid>
      );

      // Verify grid constraints
      expect(gridHtml).toContain('grid-cols-1 min-w-0 sm:grid-cols-2 lg:grid-cols-4');
      // Verify every child has min-w-0 w-full
      expect(gridHtml).toContain('min-w-0 w-full');
      // Verify no card lacks width constraint classes
      const cardMatches = gridHtml.match(/w-full min-w-0 max-w-full flex-col overflow-hidden/g);
      expect(cardMatches?.length).toBe(4);
      // Verify value, sublabels and badges render safely
      expect(gridHtml).toContain('2,450.8k');
      expect(gridHtml).toContain('First recorded month');
      expect(gridHtml).toContain('Barbell Incline Close-Grip Bench Press with Pauses');
    });
  });
});
