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

  describe('4. Near-Color Distinctness & Category Differentiation', () => {
    it('ensures Push (#facc15) is perceptually distinct from Upper (#fb923c)', () => {
      expect(WORKOUT_COLORS.push.toLowerCase()).not.toBe(WORKOUT_COLORS.upper.toLowerCase());
      expect(WORKOUT_COLORS.push.toLowerCase()).toBe('#facc15');
      expect(WORKOUT_COLORS.upper.toLowerCase()).toBe('#fb923c');
    });

    it('ensures Rest (#22c55e) is distinct from Lower (#84cc16)', () => {
      expect(WORKOUT_COLORS.rest.toLowerCase()).not.toBe(WORKOUT_COLORS.lower.toLowerCase());
      expect(WORKOUT_COLORS.rest.toLowerCase()).toBe('#22c55e');
      expect(WORKOUT_COLORS.lower.toLowerCase()).toBe('#84cc16');
    });

    it('ensures Custom (#a78bfa) does not collide with semantic Indigo (#6366f1)', () => {
      expect(WORKOUT_COLORS.custom.toLowerCase()).not.toBe(SEMANTIC_COLORS.indigo.toLowerCase());
      expect(WORKOUT_COLORS.custom.toLowerCase()).toBe('#a78bfa');
    });

    it('ensures Date (#f43f8e) does not collide with semantic Red (#ef4444)', () => {
      expect(WORKOUT_COLORS.date.toLowerCase()).not.toBe(SEMANTIC_COLORS.red.toLowerCase());
      expect(WORKOUT_COLORS.date.toLowerCase()).toBe('#f43f8e');
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
});
