// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  SHADOW,
  CONTROL_HEIGHT,
  TYPOGRAPHY,
  DURATION,
  TRANSITION,
  MOTION_CONFIG,
  CANVAS_HEX,
  SemanticColorKey,
} from '../styles/tokens';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Dialog, DialogHeader } from '../components/ui/Dialog';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';

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
      expect(WORKOUT_COLORS.push).toBe('#facc15');
      expect(WORKOUT_COLORS.pull).toBe('#38bdf8');
      expect(WORKOUT_COLORS.hybrid).toBe('#c026d3');
      expect(WORKOUT_COLORS.rest).toBe('#22c55e');
      expect(WORKOUT_COLORS.upper).toBe('#fb923c');
      expect(WORKOUT_COLORS.lower).toBe('#84cc16');
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

  describe('3. Approved Raw Hex Allowlist in UI Code & Styles', () => {
    // Only dynamic luminance calculation in Badge.tsx and canonical tokens/theme in index.css are permitted
    const approvedHexMap: Record<string, string[]> = {
      'src/components/ui/Badge.tsx': ['#ffffff', '#000000'],
      'src/index.css': ['#45454e', '#232328', '#151518', '#27272a', '#3f3f46', '#09090e'],
      'src/App.tsx': [],
    };

    function getScanFiles(): string[] {
      let results: string[] = [];
      function walkDir(dir: string) {
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            walkDir(fullPath);
          } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(fullPath);
          }
        });
      }
      walkDir(path.join(rootDir, 'src/components'));
      results.push(path.join(rootDir, 'src/App.tsx'));
      results.push(path.join(rootDir, 'src/index.css'));
      return results;
    }

    const scanFiles = getScanFiles();

    it('verifies all raw hex occurrences in UI code and styles match the explicit allowlist', () => {
      const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
      const unapprovedOccurrences: { file: string; hex: string; line: number }[] = [];

      scanFiles.forEach((file) => {
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

    it('exports MOTION_CONFIG as the canonical preset object containing standard motion presets', () => {
      expect(MOTION_CONFIG).toBeDefined();
      expect(MOTION_CONFIG.entrance).toBeDefined();
      expect(MOTION_CONFIG.viewEntrance).toBeDefined();
      expect(MOTION_CONFIG.dialogSurface).toBeDefined();
      expect(MOTION_CONFIG.calendarPanel).toBeDefined();
      expect(MOTION_CONFIG.collapse).toBeDefined();
      expect(MOTION_CONFIG.tapRestrained).toBeDefined();
      expect(MOTION_CONFIG.hoverRestrained).toBeDefined();
      expect(MOTION_CONFIG.pulseSubtle).toBeDefined();
      expect(typeof MOTION_CONFIG.staggerDelay).toBe('function');
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

  describe('7. Canonical Control Height & Touch Target Scale', () => {
    it('defines canonical control height tokens with exact min-h boundaries', () => {
      expect(CONTROL_HEIGHT.sm).toBe('min-h-[32px] h-8');
      expect(CONTROL_HEIGHT.md).toBe('min-h-[40px] h-10');
      expect(CONTROL_HEIGHT.lg).toBe('min-h-[48px] h-12');
      expect(CONTROL_HEIGHT.touchTarget).toBe('min-h-[44px] min-w-[44px]');
    });
  });

  describe('8. Readable Typography Floors by Role', () => {
    function extractSub9pxArbitraryFonts(text: string): { match: string; px: number }[] {
      const regex = /text-\[([0-9.]+)(px|rem)\]/g;
      const findings: { match: string; px: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        const val = parseFloat(m[1]);
        const unit = m[2];
        const px = unit === 'rem' ? val * 16 : val;
        if (px < 9) {
          findings.push({ match: m[0], px });
        }
      }
      return findings;
    }

    it('enforces that no token in TYPOGRAPHY resolves to below 9px via unit parser', () => {
      const violations: string[] = [];
      Object.entries(TYPOGRAPHY).forEach(([key, value]) => {
        const findings = extractSub9pxArbitraryFonts(value);
        if (findings.length > 0) {
          violations.push(`${key}: ${findings.map(f => `${f.match} (${f.px}px)`).join(', ')}`);
        }
      });
      expect(violations, `Found typography tokens below 9px readable floor: ${violations.join(', ')}`).toEqual([]);
    });

    it('scans all UI source files to ensure no arbitrary font-size utility falls below 9px', () => {
      function getAllUiFiles(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            results = results.concat(getAllUiFiles(fullPath));
          } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(fullPath);
          }
        });
        return results;
      }

      const uiFiles = [...getAllUiFiles(path.join(rootDir, 'src/components')), path.join(rootDir, 'src/App.tsx')];
      const violations: { file: string; match: string; px: number }[] = [];

      uiFiles.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        const findings = extractSub9pxArbitraryFonts(content);
        findings.forEach(f => {
          violations.push({
            file: path.relative(rootDir, file).replace(/\\/g, '/'),
            match: f.match,
            px: f.px,
          });
        });
      });

      expect(violations, `Found inline arbitrary font-size below 9px in UI files: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    });

    it('enforces minimum 9px floor for micro-badges and 10px floor for metadata', () => {
      expect(TYPOGRAPHY.micro).toContain('text-[9px]');
      expect(TYPOGRAPHY.badgeSm).toContain('text-[9px]');
      expect(TYPOGRAPHY.eyebrow).toContain('text-[10px]');
      expect(TYPOGRAPHY.label).toContain('text-[10px]');
      expect(TYPOGRAPHY.caption).toContain('text-[10px]');
      expect(TYPOGRAPHY.metadata).toContain('text-[10px]');
      expect(TYPOGRAPHY.navLabel).toContain('text-[10px]');
    });
  });

  describe('9. Card Surface Discipline & Elevation Isolation', () => {
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

    it('renders standard card without default shadow elevation', () => {
      act(() => {
        root.render(React.createElement(Card, { variant: 'standard' }, 'Test Card'));
      });
      const cardEl = container.firstElementChild as HTMLElement;
      expect(cardEl).toBeTruthy();
      expect(cardEl.className).not.toContain(SHADOW.elevation);
      expect(cardEl.className).not.toContain('shadow-md');
    });

    it('renders elevated card with explicit shadow elevation', () => {
      act(() => {
        root.render(React.createElement(Card, { variant: 'elevated' }, 'Elevated Card'));
      });
      const cardEl = container.firstElementChild as HTMLElement;
      expect(cardEl).toBeTruthy();
      expect(cardEl.className).toContain(SHADOW.elevation);
    });
  });

  describe('10. Accessible SegmentedControl & Motion Guards', () => {
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

    it('renders with role="group" and aria-pressed attributes on options', () => {
      const options = [
        { value: 'tab1', label: 'Tab 1' },
        { value: 'tab2', label: 'Tab 2' },
      ];

      act(() => {
        root.render(
          React.createElement(SegmentedControl, {
            options,
            value: 'tab1',
            onChange: () => {},
            label: 'Workout Filter',
          })
        );
      });

      const groupEl = container.querySelector('[role="group"]');
      expect(groupEl).toBeTruthy();
      expect(groupEl?.getAttribute('aria-label')).toBe('Workout Filter');

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(2);
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
      expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('11. Elimination of Decorative Looping Effects', () => {
    function getAllUiSourceFiles(): string[] {
      let results: string[] = [];
      function walkDir(dir: string) {
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            walkDir(fullPath);
          } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(fullPath);
          }
        });
      }
      walkDir(path.join(rootDir, 'src/components'));
      results.push(path.join(rootDir, 'src/App.tsx'));
      return results;
    }

    const uiSourceFiles = getAllUiSourceFiles();

    it('verifies no component or UI file uses decorative animate-ping', () => {
      const pingViolations: string[] = [];
      uiSourceFiles.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('animate-ping')) {
          pingViolations.push(path.relative(rootDir, file));
        }
      });
      expect(pingViolations, `Found decorative animate-ping in: ${pingViolations.join(', ')}`).toEqual([]);
    });

    it('verifies AmbientBackground does not use continuous animate-pulse or unapproved blue glow', () => {
      const ambientPath = path.join(rootDir, 'src/components/ui/AmbientBackground.tsx');
      const content = fs.readFileSync(ambientPath, 'utf8');
      expect(content).not.toContain('animate-pulse');
      expect(content).not.toContain('bg-blue-500');
    });

    it('verifies status dots across Layout, App, and AccountSection do not use continuous animate-pulse', () => {
      const layoutContent = fs.readFileSync(path.join(rootDir, 'src/components/Layout.tsx'), 'utf8');
      const appContent = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
      const accountContent = fs.readFileSync(path.join(rootDir, 'src/components/manage/AccountSection.tsx'), 'utf8');

      expect(layoutContent).not.toMatch(/syncing.*animate-pulse/);
      expect(appContent).not.toMatch(/dotColor:.*animate-pulse/);
      expect(accountContent).not.toMatch(/syncStatus === 'syncing'.*animate-pulse/);
    });

    it('verifies spinners in App and Button use motion-safe:animate-spin', () => {
      const appContent = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
      const buttonContent = fs.readFileSync(path.join(rootDir, 'src/components/ui/Button.tsx'), 'utf8');

      expect(appContent).toContain('motion-safe:animate-spin');
      expect(buttonContent).toContain('motion-safe:animate-spin');
    });
  });

  describe('12. Dialog Accessible Naming Contract', () => {
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

    it('forwards ariaLabel directly to the element with role="dialog" without aria-labelledby', () => {
      act(() => {
        root.render(
          React.createElement(Dialog, { isOpen: true, ariaLabel: 'System Protocol Confirmation' }, 'Dialog Content')
        );
      });

      const dialogEl = container.querySelector('[role="dialog"]');
      expect(dialogEl).toBeTruthy();
      expect(dialogEl?.getAttribute('aria-label')).toBe('System Protocol Confirmation');
      expect(dialogEl?.getAttribute('aria-labelledby')).toBeNull();
      expect(dialogEl?.getAttribute('aria-modal')).toBe('true');
    });

    it('sets aria-labelledby pointing to existing element when ariaLabelledBy is passed', () => {
      const heading = document.createElement('h2');
      heading.id = 'external-heading-id';
      heading.textContent = 'External Heading';
      document.body.appendChild(heading);

      act(() => {
        root.render(
          React.createElement(Dialog, { isOpen: true, ariaLabelledBy: 'external-heading-id' }, 'Dialog Content')
        );
      });

      const dialogEl = container.querySelector('[role="dialog"]');
      expect(dialogEl).toBeTruthy();
      expect(dialogEl?.getAttribute('aria-labelledby')).toBe('external-heading-id');
      expect(document.getElementById('external-heading-id')).toBeTruthy();
      heading.remove();
    });

    it('connects DialogHeader title to dialog via aria-labelledby when ariaLabel is not passed', () => {
      act(() => {
        root.render(
          React.createElement(
            Dialog,
            { isOpen: true },
            React.createElement(DialogHeader, { title: 'Purge Archive Logs' })
          )
        );
      });

      const dialogEl = container.querySelector('[role="dialog"]');
      expect(dialogEl).toBeTruthy();
      const labelledBy = dialogEl?.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();

      const titleEl = container.querySelector(`#${labelledBy}`);
      expect(titleEl).toBeTruthy();
      expect(titleEl?.textContent).toBe('Purge Archive Logs');
    });

    it('provides accessible name fallback and does not silently render invalid aria-labelledby in no-title/no-label case', () => {
      act(() => {
        root.render(
          React.createElement(
            Dialog,
            { isOpen: true },
            React.createElement('div', null, 'Dialog with no title or label')
          )
        );
      });

      const dialogEl = container.querySelector('[role="dialog"]');
      expect(dialogEl).toBeTruthy();
      // Must NOT render a dangling aria-labelledby pointing to non-existent element
      const labelledBy = dialogEl?.getAttribute('aria-labelledby');
      expect(labelledBy).toBeNull();
      // Must still have a valid accessible name fallback
      const ariaLabel = dialogEl?.getAttribute('aria-label');
      expect(ariaLabel).toBe('Dialog');
    });
  });

  describe('13. Banner Styling & Non-Elevation Contract', () => {
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

    it('renders Banner without default shadow elevation or background gradient', () => {
      act(() => {
        root.render(React.createElement(Banner, { variant: 'warning', title: 'Test Alert' }));
      });

      const cardEl = container.firstElementChild as HTMLElement;
      expect(cardEl).toBeTruthy();
      expect(cardEl.className).not.toContain(SHADOW.elevation);
      expect(cardEl.className).not.toContain('shadow-md');
      expect(cardEl.className).not.toContain('bg-gradient-to-r');
      expect(cardEl.className).not.toContain('from-amber-500');
    });

    it('distinguishes all 5 banner variants with distinct semantic container classes', () => {
      const bannerSrc = fs.readFileSync(path.join(rootDir, 'src/components/ui/Banner.tsx'), 'utf8');
      expect(bannerSrc).not.toContain('bgGradient');
      expect(bannerSrc).not.toContain('pingColor');

      const variants = ['warning', 'success', 'destructive', 'info', 'achievement'] as const;
      const classMap = new Set<string>();

      variants.forEach((v) => {
        act(() => {
          root.render(React.createElement(Banner, { variant: v, title: `Alert ${v}` }));
        });
        const cardEl = container.firstElementChild as HTMLElement;
        expect(cardEl).toBeTruthy();
        classMap.add(cardEl.className);
      });

      // All 5 variants must produce distinct class styling
      expect(classMap.size).toBe(5);
    });
  });

  describe('14. Canvas Synchronization & Native Status Bar Invariant', () => {
    it('synchronizes web canvas token, CSS custom property, and native status bar color', () => {
      expect(CANVAS_HEX).toBe('#09090e');
      expect(SURFACE.canvas).toBe('bg-[#09090e]');

      const cssContent = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8');
      expect(cssContent).toContain('--canvas-color: #09090e;');
      expect(cssContent).toContain('background-color: var(--canvas-color);');
      expect(cssContent).not.toContain('body::before');

      const appContent = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
      expect(appContent).toContain('StatusBar.setBackgroundColor({ color: CANVAS_HEX })');
    });
  });

  describe('15. Touch-Target & Focus Accessibility Contracts', () => {
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

    it('enforces Button size="icon" matches touchTarget (minimum 44x44px) in source contract', () => {
      expect(CONTROL_HEIGHT.touchTarget).toBe('min-h-[44px] min-w-[44px]');

      const buttonSrc = fs.readFileSync(path.join(rootDir, 'src/components/ui/Button.tsx'), 'utf8');
      expect(buttonSrc).toContain("icon: cn(CONTROL_HEIGHT.touchTarget, 'p-2.5 justify-center')");
    });

    it('renders Button size="icon" with DOM classes guaranteeing 44x44px touch target and accessibility', () => {
      act(() => {
        root.render(
          React.createElement(
            Button,
            { size: 'icon', 'aria-label': 'Settings action' },
            React.createElement('span', null, 'Icon')
          )
        );
      });

      const buttonEl = container.querySelector('button') as HTMLButtonElement;
      expect(buttonEl).toBeTruthy();

      // Verified computed class token contract: min 44x44px hit boundary
      expect(buttonEl.classList.contains('min-h-[44px]')).toBe(true);
      expect(buttonEl.classList.contains('min-w-[44px]')).toBe(true);
      expect(buttonEl.classList.contains('justify-center')).toBe(true);

      // Accessible name contract
      expect(buttonEl.getAttribute('aria-label')).toBe('Settings action');

      // Zero sub-44px overriding classes
      const sub44Overrides = ['h-5', 'h-6', 'h-7', 'h-8', 'w-5', 'w-6', 'w-7', 'w-8'];
      sub44Overrides.forEach((cls) => {
        expect(buttonEl.classList.contains(cls)).toBe(false);
      });
    });

    it('renders standard Button size variants (sm, md, lg) with exact CONTROL_HEIGHT tokens', () => {
      // sm: min-h-[32px] h-8
      act(() => {
        root.render(React.createElement(Button, { size: 'sm' }, 'Small'));
      });
      let btn = container.querySelector('button') as HTMLButtonElement;
      expect(btn.classList.contains('min-h-[32px]')).toBe(true);
      expect(btn.classList.contains('h-8')).toBe(true);

      // md: min-h-[40px] h-10
      act(() => {
        root.render(React.createElement(Button, { size: 'md' }, 'Medium'));
      });
      btn = container.querySelector('button') as HTMLButtonElement;
      expect(btn.classList.contains('min-h-[40px]')).toBe(true);
      expect(btn.classList.contains('h-10')).toBe(true);

      // lg: min-h-[48px] h-12
      act(() => {
        root.render(React.createElement(Button, { size: 'lg' }, 'Large'));
      });
      btn = container.querySelector('button') as HTMLButtonElement;
      expect(btn.classList.contains('min-h-[48px]')).toBe(true);
      expect(btn.classList.contains('h-12')).toBe(true);
    });

    it('enforces FOCUS.visible on navigation items in Layout.tsx', () => {
      const layoutSrc = fs.readFileSync(path.join(rootDir, 'src/components/Layout.tsx'), 'utf8');
      expect(layoutSrc).toContain('FOCUS.visible');
      expect(layoutSrc).not.toContain('drop-shadow-[0_0_8px_rgba(249,115,22,0.45)]');
    });

    it('verifies caller controls do not have sub-44px touch target overrides', () => {
      const toastSrc = fs.readFileSync(path.join(rootDir, 'src/components/ui/Toast.tsx'), 'utf8');
      expect(toastSrc).not.toContain('h-5 w-5 p-0');

      const historySrc = fs.readFileSync(path.join(rootDir, 'src/components/HistoryView.tsx'), 'utf8');
      expect(historySrc).not.toContain('h-6 w-6 p-0 text-zinc-400');
      expect(historySrc).not.toContain('w-7 h-7 p-0 hover:text-red-400');

      const dashboardSrc = fs.readFileSync(path.join(rootDir, 'src/components/Dashboard.tsx'), 'utf8');
      expect(dashboardSrc).not.toContain('w-6 h-6 p-0 text-zinc-600');

      const calendarSrc = fs.readFileSync(path.join(rootDir, 'src/components/Calendar.tsx'), 'utf8');
      expect(calendarSrc).not.toContain('w-7 h-7 p-0 rounded-full');

      const workoutEditorSrc = fs.readFileSync(path.join(rootDir, 'src/components/manage/WorkoutEditor.tsx'), 'utf8');
      expect(workoutEditorSrc).not.toContain('w-8 h-8 p-0');

      const exerciseEditorSrc = fs.readFileSync(path.join(rootDir, 'src/components/manage/ExerciseEditor.tsx'), 'utf8');
      expect(exerciseEditorSrc).not.toContain('w-10 h-10 p-0');
    });
  });
});
