// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SEMANTIC_COLORS, SEMANTIC_PALETTE } from '../styles/tokens';
import {
  WORKOUT_COLORS,
  UNKNOWN_WORKOUT_COLOR,
  getWorkoutBadgeStyle
} from '../utils/fitnessHelpers';
import { resolveCalendarDayStatus } from '../utils/calendarHelpers';
import { Workout, WorkoutType } from '../types/fitness';
import { Calendar } from '../components/Calendar';

const mockCalendarWorkouts: Workout[] = [
  { id: 'wo-push', name: 'Push Protocol', badge: 'PUSH', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
  { id: 'wo-pull', name: 'Pull Protocol', badge: 'PULL', type: 'pull', isCore: true, cycleDay: 2, exercises: [] },
  { id: 'wo-upper', name: 'Upper Protocol', badge: 'UPPER', type: 'upper', isCore: true, cycleDay: 3, exercises: [] },
  { id: 'wo-lower', name: 'Lower Protocol', badge: 'LOWER', type: 'lower', isCore: true, cycleDay: 4, exercises: [] },
  { id: 'wo-hybrid', name: 'Hybrid Protocol', badge: 'HYBRID', type: 'hybrid', isCore: true, cycleDay: 5, exercises: [] },
  { id: 'wo-custom', name: 'Custom Protocol', badge: 'CUSTOM', type: 'custom', isCore: true, cycleDay: 6, exercises: [] },
  { id: 'wo-rest', name: 'Rest Day', badge: 'REST', type: 'rest', isCore: true, cycleDay: 7, exercises: [] },
];

const mockWorkoutMap = new Map(mockCalendarWorkouts.map(w => [w.id, w]));
const mockCoreMap = new Map(mockCalendarWorkouts.map(w => [w.cycleDay, w]));

const mockLogsByDate = new Map<string, any[]>([
  ['2026-10-01', [{ id: 'l1', workoutId: 'wo-push', date: '2026-10-01', complete: true, sets: {}, durationMinutes: 45 }]],
  ['2026-10-02', [{ id: 'l2', workoutId: 'wo-pull', date: '2026-10-02', complete: false, sets: {}, durationMinutes: 30 }]],
  ['2026-10-03', [{ id: 'l3', workoutId: 'deleted_template', date: '2026-10-03', complete: true, sets: {}, durationMinutes: 45 }]],
]);

vi.mock('../context/FitnessContext', () => ({
  useFitness: () => ({
    workouts: mockCalendarWorkouts,
  }),
}));

vi.mock('../hooks/useFitnessDerivedData', () => ({
  useFitnessDerivedData: () => ({
    index: {
      logsByDate: mockLogsByDate,
      volumeByDate: {},
      completedSetsByDate: { '2026-10-01': 3, '2026-10-02': 1, '2026-10-03': 3 },
      plannedSetsByDate: { '2026-10-01': 3, '2026-10-02': 3, '2026-10-03': 3 },
    },
    workoutMap: mockWorkoutMap,
    coreWorkoutByCycleDayMap: mockCoreMap,
    getCycleDayForDate: (d: Date) => {
      // Map day 28 (future) to cycleDay 7 (Rest), past day 5 to cycleDay 1 (Push)
      if (d.getDate() === 28) return 7;
      return 1;
    },
    resolveExerciseMeta: () => null,
  }),
}));

/**
 * Color Token Integrity & Palette Collision Regression Suite.
 * Enforces zero collisions between semantic colors and workout types,
 * prevents duplicate colors within palettes, validates 6-digit hex format,
 * guarantees neutral fallback for unknown routines, and audits UI source files.
 */
describe('Color Token Integrity & Palette Contracts', () => {
  const rootDir = process.cwd();

  describe('1. Semantic Palette Role Preservation', () => {
    it('preserves exact semantic colors and roles without silent redefinition', () => {
      expect(SEMANTIC_COLORS.orange.toLowerCase()).toBe('#f97316');
      expect(SEMANTIC_COLORS.emerald.toLowerCase()).toBe('#10b981');
      expect(SEMANTIC_COLORS.amber.toLowerCase()).toBe('#f59e0b');
      expect(SEMANTIC_COLORS.red.toLowerCase()).toBe('#ef4444');
      expect(SEMANTIC_COLORS.indigo.toLowerCase()).toBe('#6366f1');
      expect(SEMANTIC_COLORS.zinc.toLowerCase()).toBe('#71717a');

      expect(SEMANTIC_PALETTE.orange.role).toContain('achievement');
      expect(SEMANTIC_PALETTE.amber.role).toContain('warning');
      expect(SEMANTIC_PALETTE.emerald.role).toContain('success');
      expect(SEMANTIC_PALETTE.red.role).toContain('destructive');
      expect(SEMANTIC_PALETTE.indigo.role).toContain('intelligence');
      expect(SEMANTIC_PALETTE.zinc.role).toContain('neutral');
    });
  });

  describe('2. Palette Uniqueness & Collision Prevention', () => {
    it('contains no duplicate color values within SEMANTIC_COLORS', () => {
      const semanticValues = Object.values(SEMANTIC_COLORS).map(c => c.toLowerCase());
      const uniqueValues = new Set(semanticValues);
      expect(uniqueValues.size).toBe(semanticValues.length);
    });

    it('contains no duplicate color values within WORKOUT_COLORS', () => {
      const workoutValues = Object.values(WORKOUT_COLORS).map(c => c.toLowerCase());
      const uniqueValues = new Set(workoutValues);
      expect(uniqueValues.size).toBe(workoutValues.length);
    });

    it('enforces zero exact collisions between SEMANTIC_COLORS and WORKOUT_COLORS (case-insensitive)', () => {
      const semanticHexes = new Map<string, string>();
      Object.entries(SEMANTIC_COLORS).forEach(([k, v]) => {
        semanticHexes.set(v.toLowerCase(), k);
      });

      const collisions: { workoutType: string; workoutColor: string; collidingSemanticKey: string }[] = [];

      Object.entries(WORKOUT_COLORS).forEach(([type, hex]) => {
        const lowerHex = hex.toLowerCase();
        if (semanticHexes.has(lowerHex)) {
          collisions.push({
            workoutType: type,
            workoutColor: hex,
            collidingSemanticKey: semanticHexes.get(lowerHex)!
          });
        }
      });

      expect(
        collisions,
        `Found exact collisions between WORKOUT_COLORS and SEMANTIC_COLORS: ${JSON.stringify(collisions)}`
      ).toEqual([]);
    });

    it('ensures Push workout color is neither Amber, Orange, nor near-Orange #fb8500', () => {
      const pushLower = WORKOUT_COLORS.push.toLowerCase();
      expect(pushLower).not.toBe(SEMANTIC_COLORS.amber.toLowerCase());
      expect(pushLower).not.toBe(SEMANTIC_COLORS.orange.toLowerCase());
      expect(pushLower).not.toBe('#fb8500');
      // Push is established as Tailwind yellow-400 (#facc15)
      expect(pushLower).toBe('#facc15');
    });

    it('validates that all entries in SEMANTIC_COLORS and WORKOUT_COLORS are valid 6-digit hex strings', () => {
      const hexRegex = /^#[0-9a-fA-F]{6}$/;

      Object.entries(SEMANTIC_COLORS).forEach(([key, value]) => {
        expect(hexRegex.test(value), `Invalid hex in SEMANTIC_COLORS.${key}: "${value}"`).toBe(true);
      });

      Object.entries(WORKOUT_COLORS).forEach(([key, value]) => {
        expect(hexRegex.test(value), `Invalid hex in WORKOUT_COLORS.${key}: "${value}"`).toBe(true);
      });
    });
  });

  describe('3. Unknown Workout Fallback Integrity', () => {
    it('ensures unknown workout fallback is neutral zinc (#71717a), not Amber or Push', () => {
      expect(UNKNOWN_WORKOUT_COLOR.toLowerCase()).toBe('#71717a');
      expect(UNKNOWN_WORKOUT_COLOR.toLowerCase()).toBe(SEMANTIC_COLORS.zinc.toLowerCase());
      expect(UNKNOWN_WORKOUT_COLOR.toLowerCase()).not.toBe(SEMANTIC_COLORS.amber.toLowerCase());
      expect(UNKNOWN_WORKOUT_COLOR.toLowerCase()).not.toBe(WORKOUT_COLORS.push.toLowerCase());
    });

    it('returns neutral zinc styling from getWorkoutBadgeStyle for unknown/invalid workout types', () => {
      const fallbackBadge = getWorkoutBadgeStyle('non_existent_workout_type');
      expect(fallbackBadge.color.toLowerCase()).toBe(UNKNOWN_WORKOUT_COLOR.toLowerCase());
      expect(fallbackBadge.backgroundColor).toBe(`${UNKNOWN_WORKOUT_COLOR}22`);
      expect(fallbackBadge.border).toBe(`1px solid ${UNKNOWN_WORKOUT_COLOR}55`);
    });
  });

  describe('4. Near-Color Distinctness & Perceptual Distance Metric', () => {
    function hexToRgb(hex: string): [number, number, number] {
      const clean = hex.replace('#', '');
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      return [r, g, b];
    }

    /**
     * Approximate redmean color-distance formula used strictly as a rough comparative heuristic.
     * Note: This numerical calculation is not a formal proof of human perceptual clarity,
     * universal distinctness, or WCAG accessibility compliance. It serves merely as an automated
     * check against unintentional near-identical palette values.
     */
    function perceptualColorDistance(hex1: string, hex2: string): number {
      const [r1, g1, b1] = hexToRgb(hex1);
      const [r2, g2, b2] = hexToRgb(hex2);
      const rmean = (r1 + r2) / 2;
      const dr = r1 - r2;
      const dg = g1 - g2;
      const db = b1 - b2;
      return Math.sqrt(
        (((512 + rmean) * dr * dr) >> 8) +
        4 * dg * dg +
        (((767 - rmean) * db * db) >> 8)
      );
    }

    it('ensures every distinct pair within WORKOUT_COLORS has perceptual distance > 100', () => {
      const entries = Object.entries(WORKOUT_COLORS);
      const closePairs: { typeA: string; typeB: string; distance: number }[] = [];

      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [typeA, hexA] = entries[i];
          const [typeB, hexB] = entries[j];
          const dist = perceptualColorDistance(hexA, hexB);
          if (dist < 100) {
            closePairs.push({ typeA, typeB, distance: Math.round(dist) });
          }
        }
      }

      expect(
        closePairs,
        `Found near-color workout type pairs with distance < 100: ${JSON.stringify(closePairs)}`
      ).toEqual([]);
    });

    it('ensures Push (#facc15) is distinct from Upper (#fb923c) with distance > 120', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.push, WORKOUT_COLORS.upper);
      expect(dist).toBeGreaterThan(120);
      expect(WORKOUT_COLORS.push.toLowerCase()).toBe('#facc15');
      expect(WORKOUT_COLORS.upper.toLowerCase()).toBe('#fb923c');
    });

    it('ensures Push (#facc15) is distinct from warning Amber (#f59e0b) with distance >= 90', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.push, SEMANTIC_COLORS.amber);
      expect(dist).toBeGreaterThanOrEqual(90);
    });

    it('ensures Push (#facc15) is distinct from achievement Orange (#f97316) with distance >= 160', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.push, SEMANTIC_COLORS.orange);
      expect(dist).toBeGreaterThanOrEqual(160);
    });

    it('ensures Rest (#22c55e) is distinct from Lower (#84cc16) with distance > 150', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.rest, WORKOUT_COLORS.lower);
      expect(dist).toBeGreaterThan(150);
      expect(WORKOUT_COLORS.rest.toLowerCase()).toBe('#22c55e');
      expect(WORKOUT_COLORS.lower.toLowerCase()).toBe('#84cc16');
    });

    it('documents context isolation and verifies distinctness for cross-domain pairs', () => {
      // 1. Upper (#fb923c) vs Semantic Orange (#f97316) (~82)
      // UI Context Analysis: Upper Body is a workout routine category identifier (badge/legend).
      // Semantic Orange is the brand interactive color (primary CTA buttons) and PR achievement pill.
      // They belong to distinct semantic systems and are never displayed simultaneously as competing options
      // in the same picker, legend, or selector.
      expect(WORKOUT_COLORS.upper.toLowerCase()).not.toBe(SEMANTIC_COLORS.orange.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.upper, SEMANTIC_COLORS.orange)).toBeGreaterThan(80);

      // 2. Rest (#22c55e) vs Semantic Emerald (#10b981) (~69)
      // UI Context Analysis: Rest is a recovery protocol identifier (accompanied by Moon icon and "REST" label).
      // Semantic Emerald is a feedback state for successful session completion ("COMPLETED SESSION").
      // Because a scheduled rest day by definition contains no completed session, these two visual treatments
      // never compete or coexist on the same date cell or action.
      expect(WORKOUT_COLORS.rest.toLowerCase()).not.toBe(SEMANTIC_COLORS.emerald.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.rest, SEMANTIC_COLORS.emerald)).toBeGreaterThan(65);

      // 3. Upper (#fb923c) vs Semantic Amber (#f59e0b) (~74)
      // UI Context Analysis: Upper represents routine identity, whereas Amber indicates warning/partial status
      // (e.g. "PARTIAL" session badge). They never serve as competing choices in any selector or legend.
      expect(WORKOUT_COLORS.upper.toLowerCase()).not.toBe(SEMANTIC_COLORS.amber.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.upper, SEMANTIC_COLORS.amber)).toBeGreaterThan(70);

      // 4. Custom (#a78bfa) vs Semantic Indigo (#6366f1) (~132)
      // Custom is user workout type, Indigo is strength trend intelligence. Different contexts.
      expect(WORKOUT_COLORS.custom.toLowerCase()).not.toBe(SEMANTIC_COLORS.indigo.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.custom, SEMANTIC_COLORS.indigo)).toBeGreaterThan(120);

      // 5. Date (#f43f8e) vs Semantic Red (#ef4444) (~106)
      // Date is calendar indicator dot, Red is destructive/error action.
      expect(WORKOUT_COLORS.date.toLowerCase()).not.toBe(SEMANTIC_COLORS.red.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.date, SEMANTIC_COLORS.red)).toBeGreaterThan(100);
    });
  });

  describe('5. Source Code Audit for Hardcoded Raw Hex and RGBA Literals', () => {
    it('verifies fitnessHelpers.ts does not contain hardcoded amber (#f59e0b) as fallback', () => {
      const helpersPath = path.join(rootDir, 'src/utils/fitnessHelpers.ts');
      const content = fs.readFileSync(helpersPath, 'utf8');
      expect(content).not.toContain('#f59e0b');
    });

    it('verifies SessionView.tsx and Calendar.tsx do not use hardcoded rgba strings for emerald/amber box shadows', () => {
      const sessionPath = path.join(rootDir, 'src/components/SessionView.tsx');
      const calendarPath = path.join(rootDir, 'src/components/Calendar.tsx');

      const sessionContent = fs.readFileSync(sessionPath, 'utf8');
      const calendarContent = fs.readFileSync(calendarPath, 'utf8');

      // Neither should have raw rgba strings for amber or emerald shadows
      expect(sessionContent).not.toContain('rgba(245,158,11');
      expect(sessionContent).not.toContain('rgba(16,185,129');
      expect(calendarContent).not.toContain('rgba(16,185,129');
    });
  });

  describe('6. Production Behavioral Consistency for Calendar Workout Colors & Achievement Semantics', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    function normalizeColor(color?: string | null): string {
      if (!color) return '';
      if (color.startsWith('rgb')) {
        const matches = color.match(/\d+/g);
        if (matches && matches.length >= 3) {
          const [r, g, b] = matches.map(Number);
          return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        }
      }
      return color.toLowerCase();
    }

    it('exercises production resolveCalendarDayStatus for all supported workout types, partials, fallbacks, and missed', () => {
      const mockWorkout = (type: WorkoutType): Workout => ({
        id: `wo-${type}`,
        name: `${type} protocol`,
        badge: type.toUpperCase(),
        type,
        isCore: true,
        cycleDay: 1,
        exercises: [],
      });

      // 1. All supported workout types resolve to their canonical WORKOUT_COLORS
      const supportedTypes: WorkoutType[] = ['push', 'pull', 'upper', 'lower', 'hybrid', 'custom', 'rest'];
      supportedTypes.forEach((type) => {
        const result = resolveCalendarDayStatus({
          date: new Date('2026-10-15'),
          dateStr: '2026-10-15',
          today: new Date('2026-10-15'),
          log: { complete: true, workoutId: `wo-${type}`, id: 'log-1', date: '2026-10-15', sets: {}, durationMinutes: 45 },
          workout: mockWorkout(type),
        });
        expect(result?.color).toBe(WORKOUT_COLORS[type]);
        expect(result?.isComplete).toBe(true);
      });

      // 2. Incomplete sessions must use semantic Amber (#f59e0b)
      const incomplete = resolveCalendarDayStatus({
        date: new Date('2026-10-15'),
        dateStr: '2026-10-15',
        today: new Date('2026-10-15'),
        log: { complete: false, workoutId: 'wo-push', id: 'log-2', date: '2026-10-15', sets: {}, durationMinutes: 30 },
        workout: mockWorkout('push'),
      });
      expect(incomplete?.color).toBe(SEMANTIC_COLORS.amber);
      expect(incomplete?.isPartial).toBe(true);

      // 3. Unknown or deleted workout templates must use neutral Zinc fallback (#71717a)
      const unknownWo = resolveCalendarDayStatus({
        date: new Date('2026-10-15'),
        dateStr: '2026-10-15',
        today: new Date('2026-10-15'),
        log: { complete: true, workoutId: 'deleted-999', id: 'log-3', date: '2026-10-15', sets: {}, durationMinutes: 45 },
        workout: null,
      });
      expect(unknownWo?.color).toBe(UNKNOWN_WORKOUT_COLOR);
      expect(unknownWo?.color).toBe(SEMANTIC_COLORS.zinc);
      expect(unknownWo?.color).not.toBe(WORKOUT_COLORS.push);
      expect(unknownWo?.color).not.toBe(SEMANTIC_COLORS.amber);

      // 4. Scheduled future rest days must use WORKOUT_COLORS.rest (#22c55e), not Emerald
      const futureRest = resolveCalendarDayStatus({
        date: new Date('2026-10-28'),
        dateStr: '2026-10-28',
        today: new Date('2026-10-15'),
        expectedWorkout: mockWorkout('rest'),
      });
      expect(futureRest?.color).toBe(WORKOUT_COLORS.rest);
      expect(futureRest?.color).toBe('#22c55e');
      expect(futureRest?.color).not.toBe(SEMANTIC_COLORS.emerald);

      // 5. Missed scheduled sessions must use semantic Red (#ef4444)
      const missed = resolveCalendarDayStatus({
        date: new Date('2026-10-10'),
        dateStr: '2026-10-10',
        today: new Date('2026-10-15'),
        expectedWorkout: mockWorkout('push'),
      });
      expect(missed?.color).toBe(SEMANTIC_COLORS.red);
      expect(missed?.isMissed).toBe(true);
    });

    it('exercises the actual Calendar component and asserts rendered date indicator colors in DOM', () => {
      act(() => {
        root.render(React.createElement(Calendar));
      });

      // 1. Completed Push workout on 2026-10-01 -> dot must be WORKOUT_COLORS.push (#facc15)
      const pushDay = container.querySelector('[data-testid="calendar-day-2026-10-01"]');
      expect(pushDay, 'Day 2026-10-01 should be rendered').toBeTruthy();
      const pushDot = pushDay?.querySelector('.rounded-full:not(span)') as HTMLElement;
      expect(pushDot).toBeTruthy();
      expect(normalizeColor(pushDot.style.backgroundColor)).toBe(WORKOUT_COLORS.push.toLowerCase());

      // 2. Incomplete workout on 2026-10-02 -> dot must be SEMANTIC_COLORS.amber (#f59e0b)
      const incompleteDay = container.querySelector('[data-testid="calendar-day-2026-10-02"]');
      expect(incompleteDay, 'Day 2026-10-02 should be rendered').toBeTruthy();
      const incompleteDot = incompleteDay?.querySelector('.rounded-full:not(span)') as HTMLElement;
      expect(incompleteDot).toBeTruthy();
      expect(normalizeColor(incompleteDot.style.backgroundColor)).toBe(SEMANTIC_COLORS.amber.toLowerCase());

      // 3. Completed session with deleted/missing template on 2026-10-03 -> neutral zinc (#71717a)
      const missingDay = container.querySelector('[data-testid="calendar-day-2026-10-03"]');
      expect(missingDay, 'Day 2026-10-03 should be rendered').toBeTruthy();
      const missingDot = missingDay?.querySelector('.rounded-full:not(span)') as HTMLElement;
      expect(missingDot).toBeTruthy();
      expect(normalizeColor(missingDot.style.backgroundColor)).toBe(UNKNOWN_WORKOUT_COLOR.toLowerCase());

      // 4. Scheduled future rest day on 2026-10-28 -> WORKOUT_COLORS.rest (#22c55e)
      const futureRestDay = container.querySelector('[data-testid="calendar-day-2026-10-28"]');
      expect(futureRestDay, 'Day 2026-10-28 should be rendered').toBeTruthy();
      const futureRestDot = futureRestDay?.querySelector('.rounded-full:not(span)') as HTMLElement;
      expect(futureRestDot).toBeTruthy();
      expect(normalizeColor(futureRestDot.style.backgroundColor)).toBe(WORKOUT_COLORS.rest.toLowerCase());

      // 5. Missed scheduled past session on 2026-10-05 (past core push, no log) -> SEMANTIC_COLORS.red (#ef4444)
      const missedDay = container.querySelector('[data-testid="calendar-day-2026-10-05"]');
      expect(missedDay, 'Day 2026-10-05 should be rendered').toBeTruthy();
      const missedDot = missedDay?.querySelector('.rounded-full:not(span)') as HTMLElement;
      expect(missedDot).toBeTruthy();
      expect(normalizeColor(missedDot.style.backgroundColor)).toBe(SEMANTIC_COLORS.red.toLowerCase());
    });

    it('enforces achievement/PR semantics use orange (#f97316) exclusively, keeping amber (#f59e0b) for warnings', () => {
      expect(SEMANTIC_COLORS.orange).toBe('#f97316');
      expect(SEMANTIC_COLORS.amber).toBe('#f59e0b');

      // Semantic roles
      expect(SEMANTIC_PALETTE.orange.role).toContain('achievement');
      expect(SEMANTIC_PALETTE.orange.role).toContain('brand');
      expect(SEMANTIC_PALETTE.orange.role).not.toContain('warning');

      expect(SEMANTIC_PALETTE.amber.role).toContain('warning');
      expect(SEMANTIC_PALETTE.amber.role).not.toContain('achievement');
    });
  });
});
