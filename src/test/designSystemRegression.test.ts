// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SEMANTIC_COLORS,
  SEMANTIC_PALETTE,
  CHART_THEME,
  RADIUS,
  SPACING,
  BORDER,
  SURFACE,
  TYPOGRAPHY,
  DURATION,
  TRANSITION,
  MOTION_CONFIG,
  MOTION,
  SemanticColorKey,
} from '../styles/tokens';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';

/**
 * Design System Regression & Invariant Test Suite.
 * Enforces token consolidation, semantic-color alignment, shared primitive contracts,
 * and zero stale or deprecated token references.
 */
describe('Design System Consolidation & Token Contracts', () => {
  const rootDir = process.cwd();

  describe('1. Canonical Semantic Colors & Palette Consistency', () => {
    const canonicalColors: SemanticColorKey[] = ['orange', 'emerald', 'amber', 'red', 'indigo', 'zinc'];

    it('defines exactly the 6 canonical system colors', () => {
      const keys = Object.keys(SEMANTIC_COLORS).sort();
      expect(keys).toEqual([...canonicalColors].sort());
    });

    it('enforces canonical amber hex as #f59e0b (Tailwind amber-500)', () => {
      expect(SEMANTIC_COLORS.amber).toBe('#f59e0b');
      expect(SEMANTIC_PALETTE.amber.hex).toBe('#f59e0b');
      expect(SEMANTIC_PALETTE.amber.text).toBe('text-amber-500');
      expect(SEMANTIC_PALETTE.amber.bg).toBe('bg-amber-500');
    });

    it('ensures every semantic palette entry matches its corresponding hex and role', () => {
      canonicalColors.forEach((color) => {
        const palette = SEMANTIC_PALETTE[color];
        expect(palette).toBeDefined();
        expect(palette.hex).toBe(SEMANTIC_COLORS[color]);
        expect(palette.role).toBeTruthy();
        expect(palette.text).toBe(`text-${color}-500`);
        expect(palette.textLight).toBe(`text-${color}-400`);
      });
    });

    it('standardizes compound text shades to *-400 for high-contrast legibility', () => {
      canonicalColors.forEach((color) => {
        const palette = SEMANTIC_PALETTE[color];
        expect(palette.compound).toContain(`text-${color}-400`);
        expect(palette.compound).toContain(palette.bgSubtle);
      });
    });

    it('derives chart colors from canonical SEMANTIC_COLORS and SURFACE tokens', () => {
      expect(CHART_THEME.orange).toBe(SEMANTIC_COLORS.orange);
      expect(CHART_THEME.emerald).toBe(SEMANTIC_COLORS.emerald);
      expect(CHART_THEME.amber).toBe(SEMANTIC_COLORS.amber);
      expect(CHART_THEME.red).toBe(SEMANTIC_COLORS.red);
      expect(CHART_THEME.indigo).toBe(SEMANTIC_COLORS.indigo);
      expect(CHART_THEME.zinc).toBe(SEMANTIC_COLORS.zinc);
      expect(CHART_THEME.background).toBe('#09090e'); // SURFACE.canvas
    });

    it('preserves domain-specific workout category colors separate from semantic states', () => {
      // Workout categories have distinct visual meaning and must not be blindly recolored
      expect(WORKOUT_COLORS.push).toBe('#f59e0b');
      expect(WORKOUT_COLORS.pull).toBe('#38bdf8');
      expect(WORKOUT_COLORS.hybrid).toBe('#c026d3');
      expect(WORKOUT_COLORS.rest).toBe('#22c55e');
      expect(WORKOUT_COLORS.upper).toBe('#fb923c');
      expect(WORKOUT_COLORS.lower).toBe('#4ade80');
      expect(WORKOUT_COLORS.custom).toBe('#a78bfa');
    });
  });

  describe('2. Deprecated Token Removal & Zero Stale References', () => {
    const deprecatedTokens = [
      'SEMANTIC_UI',
      'formSuccess',
      'zincText',
      'buttonMd',
      'buttonLg',
      'badgeText',
      'BORDER.divider',
      'RADIUS.sm',
      'RADIUS.md',
      'SPACING.modal',
      'SPACING.navItem',
      '#eab308',
    ];

    function getSourceFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getSourceFiles(fullPath));
        } else if (
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !file.includes('designSystemRegression.test.ts')
        ) {
          results.push(fullPath);
        }
      });
      return results;
    }

    const allSourceFiles = getSourceFiles(path.join(rootDir, 'src'));

    deprecatedTokens.forEach((token) => {
      it(`verifies that deprecated token "${token}" is not used anywhere in src/`, () => {
        const violations: string[] = [];
        allSourceFiles.forEach((file) => {
          const content = fs.readFileSync(file, 'utf8');
          if (content.includes(token)) {
            violations.push(path.relative(rootDir, file));
          }
        });
        expect(
          violations,
          `Found deprecated token "${token}" in: ${violations.join(', ')}`
        ).toEqual([]);
      });
    });
  });

  describe('3. Approved Raw Hex Allowlist in UI Components', () => {
    // Only dynamic luminance calculation in Badge.tsx is permitted to use raw hex literals in src/components/
    const approvedHexMap: Record<string, string[]> = {
      'src/components/ui/Badge.tsx': ['#ffffff', '#000000'],
    };

    function getComponentFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getComponentFiles(fullPath));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          results.push(fullPath);
        }
      });
      return results;
    }

    const componentFiles = getComponentFiles(path.join(rootDir, 'src/components'));

    it('verifies all raw hex occurrences in components match the explicit allowlist', () => {
      const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
      const unapprovedOccurrences: { file: string; hex: string; line: number }[] = [];

      componentFiles.forEach((file) => {
        const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        const allowedForFile = approvedHexMap[relPath] || [];

        lines.forEach((lineText, idx) => {
          let match: RegExpExecArray | null;
          while ((match = hexRegex.exec(lineText)) !== null) {
            const foundHex = match[0].toLowerCase();
            if (!allowedForFile.map((h) => h.toLowerCase()).includes(foundHex)) {
              unapprovedOccurrences.push({ file: relPath, hex: foundHex, line: idx + 1 });
            }
          }
        });
      });

      expect(
        unapprovedOccurrences,
        `Unapproved raw hex literals found in components: ${JSON.stringify(unapprovedOccurrences, null, 2)}`
      ).toEqual([]);
    });
  });

  describe('4. Shared Primitive Contracts & Modal Architecture', () => {
    it('verifies RADIUS scale has canonical semantic role tokens', () => {
      expect(RADIUS.badge).toBe('rounded-lg');
      expect(RADIUS.button).toBe('rounded-xl');
      expect(RADIUS.card).toBe('rounded-2xl');
      expect(RADIUS.panel).toBe('rounded-3xl');
      expect(RADIUS.pill).toBe('rounded-full');
    });

    it('verifies SPACING scale has canonical progression without obsolete aliases', () => {
      expect(SPACING.none).toBe('p-0');
      expect(SPACING.compact).toBe('py-2.5 px-3.5');
      expect(SPACING.standard).toBe('p-5');
      expect(SPACING.section).toBe('p-6');
      expect(SPACING.hero).toBe('p-8');
      expect(SPACING.badgeSm).toBe('px-2 py-0.5');
      expect(SPACING.badgeMd).toBe('px-2.5 py-1');
    });

    it('verifies PrivacyPolicyModal uses Dialog with size="2xl" (max-w-2xl)', () => {
      const modalPath = path.join(rootDir, 'src/components/manage/PrivacyPolicyModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf8');

      expect(content).toContain('size="2xl"');
      expect(content).toContain('<DialogHeader');
      expect(content).toContain('<DialogBody');
      expect(content).toContain('<DialogFooter');
      expect(content).toContain('overflow-y-auto');
    });

    it('verifies HistoryView training plan bar uses single authoritative color source', () => {
      const historyPath = path.join(rootDir, 'src/components/HistoryView.tsx');
      const content = fs.readFileSync(historyPath, 'utf8');

      // The distribution bar must not declare both bg-orange-500 and inline backgroundColor
      const badBarPattern = /className="[^"]*bg-orange-500[^"]*"[^>]*style=\{\{[^}]*backgroundColor/;
      expect(badBarPattern.test(content)).toBe(false);
    });
  });

  describe('5. Downward Dependency Rule for Tokens', () => {
    it('src/styles/tokens.ts must not import React or UI components', () => {
      const tokensPath = path.join(rootDir, 'src/styles/tokens.ts');
      const content = fs.readFileSync(tokensPath, 'utf8');
      expect(content).not.toMatch(/from\s+['"]react['"]/);
      expect(content).not.toMatch(/from\s+['"]\.\.?\/components/);
    });
  });

  describe('6. Motion Tokens & DESIGN_SYSTEM.md Integration Invariants', () => {
    it('exports canonical DURATION scale (fast, standard, relaxed)', () => {
      expect(DURATION.fast).toBe(150);
      expect(DURATION.standard).toBe(200);
      expect(DURATION.relaxed).toBe(250);
    });

    it('exports MOTION matching MOTION_CONFIG and containing standard motion presets', () => {
      expect(MOTION).toBe(MOTION_CONFIG);
      expect(MOTION.entrance).toBeDefined();
      expect(MOTION.calendarPanel).toBeDefined();
      expect(MOTION.collapse).toBeDefined();
    });

    it('exports TRANSITION with property-specific utilities and reduced-motion guard', () => {
      expect(TRANSITION.colors).toContain('motion-reduce:transition-none');
      expect(TRANSITION.interactive).toContain('motion-reduce:transition-none');
      expect(TRANSITION.button).toContain('motion-reduce:transition-none');
    });

    it('verifies DESIGN_SYSTEM.md exists in root and is wired into AGENTS.md reading order and prohibited actions', () => {
      const designSystemPath = path.join(rootDir, 'DESIGN_SYSTEM.md');
      expect(fs.existsSync(designSystemPath)).toBe(true);

      const agentsPath = path.join(rootDir, 'AGENTS.md');
      const agentsContent = fs.readFileSync(agentsPath, 'utf8');
      expect(agentsContent).toContain('DESIGN_SYSTEM.md');
      expect(agentsContent).toContain('Violating Design System Equivalents');
    });
  });
});
