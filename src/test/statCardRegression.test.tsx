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

let mockUseReducedMotionValue: boolean | null = null;
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    useReducedMotion: () => mockUseReducedMotionValue,
  };
});

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
      mockUseReducedMotionValue = null;
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

    it('renders final numeric value immediately by default without scheduling count-up animation', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
      let renderCount = 0;
      act(() => {
        root!.render(
          <React.Profiler id="default-stat" onRender={() => { renderCount += 1; }}>
            <StatCard label="Volume" value={100} animationDuration={800} />
          </React.Profiler>
        );
      });
      expect(container!.textContent).toContain('100');
      expect(container!.querySelector('[data-countup-animating="true"]')).toBeNull();
      expect(rafSpy).not.toHaveBeenCalled();
      expect(renderCount).toBe(1);
    });

    it('numeric value animates when animateValue is enabled', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value={100} animateValue animationDuration={800} />);
      });
      // At t=0, starts at 0 and flags animation
      expect(container!.textContent).toContain('0');
      expect(container!.querySelector('[data-countup-animating="true"]')).not.toBeNull();
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
      expect(container!.querySelector('[data-countup-animating="true"]')).toBeNull();
    });

    it('decimal value animates when animateValue is enabled', () => {
      act(() => {
        root!.render(<StatCard label="Frequency" value={4.2} animateValue animationDuration={800} />);
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(container!.textContent).toContain('4.2');
    });

    it('formatted numeric value animates when animateValue is enabled', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value="124.6k" unit="kg" animateValue animationDuration={800} />);
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(container!.textContent).toContain('124.6k');
      expect(container!.textContent).toContain('kg');
    });

    it('formatValue receives animated numeric value when animateValue is enabled', () => {
      const receivedValues: number[] = [];
      act(() => {
        root!.render(
          <StatCard
            label="Tonnage"
            value={500}
            animateValue
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

    it('disableAnimation overrides animateValue and immediately renders target', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
      act(() => {
        root!.render(<StatCard label="Volume" value={750} animateValue disableAnimation={true} />);
      });
      // Immediately contains 750 without advancing timers
      expect(container!.textContent).toContain('750');
      expect(rafSpy).not.toHaveBeenCalled();
    });

    it('cancels active requestAnimationFrame loop on unmount', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
      act(() => {
        root!.render(<StatCard label="Volume" value={500} animateValue animationDuration={800} />);
      });
      expect(container!.querySelector('[data-countup-animating="true"]')).not.toBeNull();

      act(() => {
        root!.unmount();
      });
      root = null;
      expect(cancelSpy).toHaveBeenCalledTimes(1);
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
        root!.render(<StatCard label="Streak" value={10} animateValue animationDuration={400} />);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(container!.textContent).toContain('10');

      // Update target to 15
      act(() => {
        root!.render(<StatCard label="Streak" value={15} animateValue animationDuration={400} />);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(container!.textContent).toContain('15');
    });

    it('uses ~440ms default count-up duration when animateValue is enabled', () => {
      act(() => {
        root!.render(<StatCard label="Streak" value={100} animateValue />);
      });
      expect(container!.querySelector('[data-countup-animating="true"]')).not.toBeNull();
      // Midway through ~440ms count-up, still animating
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(container!.querySelector('[data-countup-animating="true"]')).not.toBeNull();
      // Completes cleanly well before legacy 800ms duration
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(container!.textContent).toContain('100');
      expect(container!.querySelector('[data-countup-animating="true"]')).toBeNull();
    });

    it('uses useReducedMotion() directly when boolean without calling matchMedia fallback', () => {
      const originalMatchMedia = window.matchMedia;
      const matchMediaSpy = vi.fn();
      window.matchMedia = matchMediaSpy;
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      try {
        mockUseReducedMotionValue = true;
        act(() => {
          root!.render(<StatCard label="Reduced Hook" value={88} animateValue />);
        });
        expect(container!.textContent).toContain('88');
        expect(container!.querySelector('[data-countup-animating="true"]')).toBeNull();
        expect(rafSpy).not.toHaveBeenCalled();
        expect(matchMediaSpy).not.toHaveBeenCalled();

        mockUseReducedMotionValue = false;
        act(() => {
          root!.render(<StatCard label="Normal Hook" value={77} animateValue />);
        });
        expect(matchMediaSpy).not.toHaveBeenCalled();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it('falls back to matchMedia once when useReducedMotion() returns null and renders target immediately', () => {
      const originalMatchMedia = window.matchMedia;
      const matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as any));
      window.matchMedia = matchMediaSpy;
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      try {
        mockUseReducedMotionValue = null;
        act(() => {
          root!.render(<StatCard label="Reduced" value={99} animateValue />);
        });
        expect(container!.textContent).toContain('99');
        expect(container!.querySelector('[data-countup-animating="true"]')).toBeNull();
        expect(rafSpy).not.toHaveBeenCalled();
        expect(matchMediaSpy).toHaveBeenCalledTimes(1);
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
            <StatCard label="Total Volume" value="12,500" unit="kg" animateValue animationDuration={400} />
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
            animateValue
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

    it('initial render is not dimmed (does not apply opacity-50)', () => {
      act(() => {
        root!.render(<StatCard label="Streak" value={10} animateValue animationDuration={500} />);
      });
      const dimmedEl = container!.querySelector('.opacity-50');
      expect(dimmedEl).toBeNull();
    });

    it('stable target change triggers subtle effect and clears after duration', () => {
      act(() => {
        root!.render(<StatCard label="Streak" value={10} animateValue animationDuration={800} />);
      });
      expect(container!.querySelector('.opacity-50')).toBeNull();

      // Change target value
      act(() => {
        root!.render(<StatCard label="Streak" value={20} animateValue animationDuration={800} />);
      });
      expect(container!.querySelector('.opacity-50')).not.toBeNull();

      // After 150ms (DURATION.fast), opacity-50 is cleared
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(container!.querySelector('.opacity-50')).toBeNull();
    });

    it('intermediate count-up frames do not retrigger the effect or keep it dim', () => {
      act(() => {
        root!.render(<StatCard label="Volume" value={100} animateValue animationDuration={1000} />);
      });

      // Update to new target
      act(() => {
        root!.render(<StatCard label="Volume" value={500} animateValue animationDuration={1000} />);
      });
      expect(container!.querySelector('.opacity-50')).not.toBeNull();

      // Advance by 150ms: fade timeout expires
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(container!.querySelector('.opacity-50')).toBeNull();

      // Advance timer further during count-up animation: frames tick, but value-fade does NOT re-trigger
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(container!.querySelector('.opacity-50')).toBeNull();

      // Complete the count-up animation
      act(() => {
        vi.advanceTimersByTime(650);
      });
      expect(container!.querySelector('.opacity-50')).toBeNull();
      expect(container!.textContent).toContain('500');
    });

    it('reduced-motion mode skips the value-fade effect entirely', () => {
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
          root!.render(<StatCard label="Tonnage" value={100} />);
        });
        expect(container!.querySelector('.opacity-50')).toBeNull();

        // Update target in reduced motion mode
        act(() => {
          root!.render(<StatCard label="Tonnage" value={200} />);
        });
        // Must skip opacity-50 completely
        expect(container!.querySelector('.opacity-50')).toBeNull();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it('unavailable and nonnumeric values render correctly during target transitions', () => {
      act(() => {
        root!.render(<StatCard label="Top Set" value="Bench 100kg" />);
      });
      expect(container!.textContent).toContain('Bench 100kg');

      // Update non-numeric value
      act(() => {
        root!.render(<StatCard label="Top Set" value="Squat 140kg" />);
      });
      expect(container!.textContent).toContain('Squat 140kg');

      // Transition to unavailable
      act(() => {
        root!.render(<StatCard label="Top Set" value="—" isUnavailable={true} unavailableLabel="No PR logged" />);
      });
      expect(container!.textContent).toContain('—');
      expect(container!.textContent).toContain('No PR logged');
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

  describe('StatCard Info Dialog & Sibling Detail Action Regression', () => {
    let container: HTMLDivElement | null = null;
    let root: ReturnType<typeof createRoot> | null = null;

    beforeEach(() => {
      mockUseReducedMotionValue = true;
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
      vi.restoreAllMocks();
    });

    it('opens accessible metric info dialog with formula breakdown and restores focus on Escape', () => {
      const detailClickSpy = vi.fn();

      act(() => {
        root!.render(
          <StatCard
            label="Strength Progress"
            value="+3.5"
            unit="%"
            info={{
              title: 'Strength Progress',
              measures: 'Median e1RM change.',
              calculation: 'Epley e1RM delta.',
              period: 'Last 28 days vs preceding 28 days.',
              excludes: 'Unpaired lifts.',
              limitations: 'Reflects paired lift count only.'
            }}
            detailAction={{
              label: 'View Strength Progress chart in Analytics',
              onClick: detailClickSpy
            }}
          />
        );
      });

      const infoBtn = container!.querySelector('button[aria-label="Explain Strength Progress"]') as HTMLButtonElement;
      const detailBtn = container!.querySelector('button[aria-label="View Strength Progress chart in Analytics"]') as HTMLButtonElement;

      expect(infoBtn).toBeTruthy();
      expect(detailBtn).toBeTruthy();
      expect(infoBtn.getAttribute('aria-haspopup')).toBe('dialog');
      expect(infoBtn.getAttribute('aria-expanded')).toBe('false');
      // Never nest interactive buttons inside each other
      expect(infoBtn.contains(detailBtn)).toBe(false);
      expect(detailBtn.contains(infoBtn)).toBe(false);

      // Clicking sibling detail button triggers Analytics callback without opening dialog
      act(() => {
        detailBtn.click();
      });
      expect(detailClickSpy).toHaveBeenCalledTimes(1);
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();

      // Focusing and opening info button launches dialog cleanly
      act(() => {
        infoBtn.focus();
        infoBtn.click();
      });
      expect(infoBtn.getAttribute('aria-expanded')).toBe('true');

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog!.textContent).toContain('Median e1RM change.');
      expect(dialog!.textContent).toContain('Epley e1RM delta.');
      expect(dialog!.textContent).toContain('Last 28 days vs preceding 28 days.');
      expect(dialog!.textContent).toContain('Unpaired lifts.');
      expect(dialog!.textContent).toContain('Reflects paired lift count only.');

      // Clicking Open Analytics inside dialog closes dialog and navigates
      const openAnalyticsBtn = Array.from(dialog!.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Open Analytics'
      ) as HTMLButtonElement;
      expect(openAnalyticsBtn).toBeTruthy();
      act(() => {
        openAnalyticsBtn.click();
      });
      expect(detailClickSpy).toHaveBeenCalledTimes(2);
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();

      // Re-open and close with Escape -> restores focus to trigger button
      act(() => {
        infoBtn.focus();
        infoBtn.click();
      });
      expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(infoBtn.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(infoBtn);
    });
  });
});
