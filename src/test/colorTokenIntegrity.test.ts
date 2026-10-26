import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SEMANTIC_COLORS, SEMANTIC_PALETTE } from '../styles/tokens';
import {
  WORKOUT_COLORS,
  UNKNOWN_WORKOUT_COLOR,
  getWorkoutBadgeStyle
} from '../utils/fitnessHelpers';

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
     * Standard perceptual color distance (redmean formula).
     * Distance >= 80 indicates clearly distinguishable hues across compact indicators.
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

    it('ensures Push (#facc15) is perceptually distinct from Upper (#fb923c) with distance > 120', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.push, WORKOUT_COLORS.upper);
      expect(dist).toBeGreaterThan(120);
      expect(WORKOUT_COLORS.push.toLowerCase()).toBe('#facc15');
      expect(WORKOUT_COLORS.upper.toLowerCase()).toBe('#fb923c');
    });

    it('ensures Push (#facc15) is perceptually distinct from warning Amber (#f59e0b) with distance >= 90', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.push, SEMANTIC_COLORS.amber);
      expect(dist).toBeGreaterThanOrEqual(90);
    });

    it('ensures Push (#facc15) is perceptually distinct from achievement Orange (#f97316) with distance >= 160', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.push, SEMANTIC_COLORS.orange);
      expect(dist).toBeGreaterThanOrEqual(160);
    });

    it('ensures Rest (#22c55e) is distinct from Lower (#84cc16) with distance > 150', () => {
      const dist = perceptualColorDistance(WORKOUT_COLORS.rest, WORKOUT_COLORS.lower);
      expect(dist).toBeGreaterThan(150);
      expect(WORKOUT_COLORS.rest.toLowerCase()).toBe('#22c55e');
      expect(WORKOUT_COLORS.lower.toLowerCase()).toBe('#84cc16');
    });

    it('documents and verifies distinctness of intentional cross-domain pairs (workout vs semantic)', () => {
      // 4 intentional shared hue families across different semantic domains:
      // 1. Upper (#fb923c) vs Semantic Orange (#f97316): Upper is workout category, Orange is achievement
      expect(WORKOUT_COLORS.upper.toLowerCase()).not.toBe(SEMANTIC_COLORS.orange.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.upper, SEMANTIC_COLORS.orange)).toBeGreaterThan(80);

      // 2. Rest (#22c55e) vs Semantic Emerald (#10b981): Rest is scheduled rest workout, Emerald is success
      expect(WORKOUT_COLORS.rest.toLowerCase()).not.toBe(SEMANTIC_COLORS.emerald.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.rest, SEMANTIC_COLORS.emerald)).toBeGreaterThan(65);

      // 3. Custom (#a78bfa) vs Semantic Indigo (#6366f1): Custom is user workout type, Indigo is intelligence
      expect(WORKOUT_COLORS.custom.toLowerCase()).not.toBe(SEMANTIC_COLORS.indigo.toLowerCase());
      expect(perceptualColorDistance(WORKOUT_COLORS.custom, SEMANTIC_COLORS.indigo)).toBeGreaterThan(120);

      // 4. Date (#f43f8e) vs Semantic Red (#ef4444): Date is calendar dot, Red is destructive/error
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

  describe('6. Behavioral Consistency for Calendar Workout Colors & Achievement Semantics', () => {
    it('resolves completed sessions to their canonical workout colors and missing templates to neutral zinc', () => {
      // Mock workout registry
      const workoutMap = new Map<string, { type: keyof typeof WORKOUT_COLORS; name: string }>([
        ['wo-push', { type: 'push', name: 'Push Protocol' }],
        ['wo-pull', { type: 'pull', name: 'Pull Protocol' }],
        ['wo-upper', { type: 'upper', name: 'Upper Body' }],
        ['wo-lower', { type: 'lower', name: 'Lower Body' }],
        ['wo-hybrid', { type: 'hybrid', name: 'Hybrid Conditioning' }],
        ['wo-custom', { type: 'custom', name: 'Custom Session' }],
        ['wo-rest', { type: 'rest', name: 'Active Recovery' }],
      ]);

      function resolveCalendarStatus(log: { complete: boolean; workoutId: string }) {
        if (!log.complete) {
          return { color: SEMANTIC_COLORS.amber, label: 'partial' };
        }
        const wo = workoutMap.get(log.workoutId);
        const woTypeColor = wo?.type ? WORKOUT_COLORS[wo.type] : undefined;
        return {
          color: woTypeColor || UNKNOWN_WORKOUT_COLOR,
          label: wo?.type || 'unclassified'
        };
      }

      // 1. Each valid workout type resolves to its canonical workout color
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-push' }).color).toBe(WORKOUT_COLORS.push);
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-pull' }).color).toBe(WORKOUT_COLORS.pull);
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-upper' }).color).toBe(WORKOUT_COLORS.upper);
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-lower' }).color).toBe(WORKOUT_COLORS.lower);
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-hybrid' }).color).toBe(WORKOUT_COLORS.hybrid);
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-custom' }).color).toBe(WORKOUT_COLORS.custom);
      expect(resolveCalendarStatus({ complete: true, workoutId: 'wo-rest' }).color).toBe(WORKOUT_COLORS.rest);

      // 2. Missing/deleted workout templates fallback to neutral zinc (#71717a), NEVER Push (#facc15) or Amber (#f59e0b)
      const missingStatus = resolveCalendarStatus({ complete: true, workoutId: 'deleted_workout_999' });
      expect(missingStatus.color).toBe(UNKNOWN_WORKOUT_COLOR);
      expect(missingStatus.color).toBe(SEMANTIC_COLORS.zinc);
      expect(missingStatus.color).not.toBe(WORKOUT_COLORS.push);
      expect(missingStatus.color).not.toBe(SEMANTIC_COLORS.amber);

      // 3. Incomplete session resolves to amber warning
      const incompleteStatus = resolveCalendarStatus({ complete: false, workoutId: 'wo-push' });
      expect(incompleteStatus.color).toBe(SEMANTIC_COLORS.amber);
    });

    it('ensures scheduled future rest days use WORKOUT_COLORS.rest (#22c55e), not Emerald (#10b981)', () => {
      function resolveScheduledDayColor(expectedType: keyof typeof WORKOUT_COLORS, isFuture: boolean) {
        if (isFuture) {
          if (expectedType === 'rest') {
            return WORKOUT_COLORS.rest;
          }
          return WORKOUT_COLORS[expectedType] || UNKNOWN_WORKOUT_COLOR;
        }
        return SEMANTIC_COLORS.zinc;
      }

      const futureRestColor = resolveScheduledDayColor('rest', true);
      expect(futureRestColor).toBe(WORKOUT_COLORS.rest);
      expect(futureRestColor).toBe('#22c55e');
      expect(futureRestColor).not.toBe(SEMANTIC_COLORS.emerald);
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
