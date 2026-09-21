// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StatCard } from '../components/ui/StatCard';
import { Grid } from '../components/ui/Grid';
import { formatCompactWeight } from '../utils/fitnessHelpers';
import { useCountUp, UseCountUpOptions } from '../hooks/useCountUp';
import { Banner } from '../components/ui/Banner';

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
      expect(html).toContain('w-full min-w-0 max-w-full flex-col');
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
        <Grid cols={2} gap="md">
          <StatCard
            label="Sessions"
            value={42}
            accent="zinc"
            trend="+6 vs previous month"
            trendDirection="positive"
            sublabel="Completed 100% of cycle target"
          />
          <StatCard
            label="Volume"
            value="2,450.8k"
            unit="kg"
            accent="emerald"
            trend="+18.4% (All-time high volume window)"
            trendDirection="positive"
          />
          <StatCard
            label="PRs"
            value={19}
            accent="amber"
            trend="+4 new records"
            trendDirection="positive"
            sublabel="Barbell Incline Close-Grip Bench Press with Pauses"
            statusIndicator={{ label: 'RECORD SURGE', color: 'amber' }}
          />
          <StatCard
            label="Strength Trend"
            value="—"
            accent="indigo"
            isUnavailable={true}
            unavailableLabel="No Overlap"
            sublabel="First recorded month"
          />
        </Grid>
      );

      // Verify grid constraints and children shrink safety rule
      expect(gridHtml).toContain('grid-cols-2');
      expect(gridHtml).toContain('[&amp;&gt;*]:min-w-0');
      // Verify no card lacks width constraint classes
      const cardMatches = gridHtml.match(/w-full min-w-0 max-w-full flex-col/g);
      expect(cardMatches?.length).toBe(4);
      // Verify value, sublabels and badges render safely
      expect(gridHtml).toContain('2,450.8k');
      expect(gridHtml).toContain('First recorded month');
      expect(gridHtml).toContain('Barbell Incline Close-Grip Bench Press with Pauses');
    });
  });

  describe('StatCard Animation & Formatting Regression', () => {
    it('renders formatted numeric strings with suffix preserved', () => {
      const html = renderToString(
        <StatCard
          label="Total Volume"
          value="124.6k"
          unit="kg"
        />
      );

      expect(html).toContain('124.6k');
      expect(html).toContain('kg');
    });

    it('supports custom formatValue function', () => {
      const html = renderToString(
        <StatCard
          label="Custom Formatted"
          value={8500}
          formatValue={(val) => `$${Math.round(val).toLocaleString()}`}
        />
      );

      expect(html).toContain('$8,500');
    });

    it('respects disableAnimation prop', () => {
      const html = renderToString(
        <StatCard
          label="Static Metric"
          value={42}
          disableAnimation={true}
        />
      );

      expect(html).toContain('42');
    });

    it('renders placeholder dash when unavailable, ignoring animation', () => {
      const html = renderToString(
        <StatCard
          label="Pending Metric"
          value={100}
          isUnavailable={true}
          unavailableLabel="Awaiting logs"
        />
      );

      expect(html).toContain('—');
      expect(html).toContain('Awaiting logs');
      expect(html).not.toContain('100');
    });

    it('maintains deterministic min-height layout for headers and footers', () => {
      const cardWithoutFooter = renderToString(
        <StatCard
          label="Streak"
          value={5}
        />
      );
      const cardWithFooter = renderToString(
        <StatCard
          label="Streak"
          value={5}
          sublabel="Current active streak"
          trend="+1 day"
          trendDirection="positive"
        />
      );

      // Both should share deterministic header height
      expect(cardWithoutFooter).toContain('min-h-[36px]');
      expect(cardWithFooter).toContain('min-h-[36px]');
      // The one with footer has deterministic footer container
      expect(cardWithFooter).toContain('min-h-[32px]');
    });
  });

  describe('StatCard & useCountUp Animation Pipeline Regression Suite', () => {
    let container: HTMLDivElement | null = null;
    let root: ReturnType<typeof createRoot> | null = null;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      if (root) {
        act(() => {
          root?.unmount();
        });
      }
      if (container) {
        container.remove();
      }
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('numeric value renders final value', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value={100} animationDuration={800} />);
      });
      // Advance timers to complete animation
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(container!.textContent).toContain('100');
    });

    it('numeric value animates', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value={100} animationDuration={800} />);
      });
      // At t=0, starts at 0
      expect(container!.textContent).toContain('0');
      // Advance halfway
      act(() => {
        vi.advanceTimersByTime(400);
      });
      // At halfway, should be animated and not yet at 100
      expect(container!.textContent).not.toContain('100');
      // Advance to completion
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(container!.textContent).toContain('100');
    });

    it('decimal value animates', () => {
      act(() => {
        root!.render(<StatCard label="Frequency" value={4.2} animationDuration={800} />);
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(container!.textContent).toContain('4.2');
    });

    it('formatted numeric value animates', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value="124.6k" unit="kg" animationDuration={800} />);
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(container!.textContent).toContain('124.6k');
      expect(container!.textContent).toContain('kg');
    });

    it('formatValue receives animated numeric value', () => {
      const receivedValues: number[] = [];
      act(() => {
        root!.render(
          <StatCard
            label="Tonnage"
            value={500}
            animationDuration={800}
            formatValue={(val) => {
              receivedValues.push(val);
              return `${Math.round(val)}kg`;
            }}
          />
        );
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(receivedValues.length).toBeGreaterThan(0);
      expect(typeof receivedValues[0]).toBe('number');
      // Final call should receive target 500
      expect(receivedValues[receivedValues.length - 1]).toBe(500);
      expect(container!.textContent).toContain('500kg');
    });

    it('disabled animation immediately renders target', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value={750} disableAnimation={true} />);
      });
      // Immediately contains 750 without advancing timers
      expect(container!.textContent).toContain('750');
    });

    it('unavailable value renders —', () => {
      act(() => {
        root!.render(<StatCard label="Progress" value="—" />);
      });
      expect(container!.textContent).toContain('—');
      expect(container!.textContent).not.toContain('0');

      act(() => {
        root!.render(<StatCard label="Progress" value={null} />);
      });
      expect(container!.textContent).toContain('—');

      act(() => {
        root!.render(<StatCard label="Progress" value={undefined} />);
      });
      expect(container!.textContent).toContain('—');

      act(() => {
        root!.render(<StatCard label="Progress" value="" />);
      });
      expect(container!.textContent).toContain('—');

      act(() => {
        root!.render(<StatCard label="Progress" value={100} isUnavailable={true} />);
      });
      expect(container!.textContent).toContain('—');
      expect(container!.textContent).not.toContain('100');
    });

    it('zero renders 0', () => {
      act(() => {
        root!.render(<StatCard label="Streak" value={0} />);
      });
      expect(container!.textContent).toContain('0');
      expect(container!.textContent).not.toContain('—');
    });

    it('target change updates value', () => {
      act(() => {
        root!.render(<StatCard label="Streak" value={10} animationDuration={400} />);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(container!.textContent).toContain('10');

      // Update target to 15
      act(() => {
        root!.render(<StatCard label="Streak" value={15} animationDuration={400} />);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(container!.textContent).toContain('15');
    });

    it('reduced-motion renders target immediately', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as any));

      try {
        act(() => {
          root!.render(<StatCard label="Reduced" value={99} animationDuration={800} />);
        });
        // Renders 99 immediately without timer advancement
        expect(container!.textContent).toContain('99');
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it('regression test: fails if useCountUp receives incorrect options shape', () => {
      function HookTest({ target, options }: { target: number; options?: UseCountUpOptions }) {
        const val = useCountUp(target, options);
        return <span id="hook-val">{val}</span>;
      }

      // Disabled option should immediately return target without animation
      act(() => {
        root!.render(<HookTest target={450} options={{ duration: 500, disabled: true }} />);
      });
      expect(container!.querySelector('#hook-val')!.textContent).toBe('450');

      // Zero target returns 0 immediately
      act(() => {
        root!.render(<HookTest target={0} options={{ duration: 500 }} />);
      });
      expect(container!.querySelector('#hook-val')!.textContent).toBe('0');
    });

    it('renders and animates accurately in React.StrictMode without getting stuck at 0', () => {
      act(() => {
        root!.render(
          <React.StrictMode>
            <StatCard label="Total Volume" value="12,500" unit="kg" animationDuration={400} />
          </React.StrictMode>
        );
      });

      // Complete animation
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Must show the actual value, never stuck at 0
      expect(container!.textContent).toContain('12,500');
      expect(container!.textContent).toContain('kg');
    });

    it('handles pure numeric value with isUnavailable explicitly without preformatted strings', () => {
      // When unavailable with raw number
      act(() => {
        root!.render(
          <StatCard
            label="Average Session Length"
            value={0}
            unit="min"
            isUnavailable={true}
          />
        );
      });
      expect(container!.textContent).toContain('—');
      // Unit is suppressed when unavailable
      expect(container!.textContent).not.toContain('min');

      // When available with raw number
      act(() => {
        root!.render(
          <StatCard
            label="Average Session Length"
            value={45}
            unit="min"
            isUnavailable={false}
            animationDuration={400}
          />
        );
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(container!.textContent).toContain('45');
      expect(container!.textContent).toContain('min');
    });
  });

  describe('Compact Banner Typography & Hierarchy', () => {
    it('renders compact typography and subtle badge when size="compact"', () => {
      const html = renderToString(
        <Banner
          variant="achievement"
          size="compact"
          badge="COACH TIP"
          title="Progressive overload achieved on bench press."
        />
      );

      // Does not use large titleSection h3
      expect(html).not.toContain('<h3');
      // Uses paragraph with compact font-mono styling
      expect(html).toContain('<p');
      expect(html).toContain('COACH TIP');
      expect(html).toContain('Progressive overload achieved on bench press.');
    });

    it('renders standard titleSection when size="default" (preserving other banners)', () => {
      const html = renderToString(
        <Banner
          variant="achievement"
          badge="ALL-TIME MILESTONE"
          title="New All-Time High"
        />
      );

      // Uses large titleSection h3
      expect(html).toContain('<h3');
      expect(html).toContain('New All-Time High');
    });
  });
});
