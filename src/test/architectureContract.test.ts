// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Lightweight Architectural & Dependency Invariant Verification.
 * Enforces layering rules and verifies that all file references in ARCHITECTURE.md exist.
 */
describe('ARCHITECTURE Contract & Dependency Invariants', () => {
  const rootDir = process.cwd();

  describe('1. Pure Calculation Modules Isolation (Zero React / UI Imports)', () => {
    const pureModules = [
      'src/utils/fitnessCalculations.ts',
      'src/utils/exerciseResolver.ts',
      'src/utils/trainingIntelligence.ts'
    ];

    pureModules.forEach(relPath => {
      it(`${relPath} must not import React, React hooks, or UI components`, () => {
        const fullPath = path.join(rootDir, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        const forbiddenImportPatterns = [
          /from\s+['"]react['"]/,
          /from\s+['"]react-dom['"]/,
          /from\s+['"]\.\.?\/components/,
          /from\s+['"]\.\.?\/styles/
        ];

        lines.forEach((line, lineIndex) => {
          if (line.trim().startsWith('import') || line.trim().startsWith('export * from')) {
            forbiddenImportPatterns.forEach(pattern => {
              expect(
                pattern.test(line),
                `Forbidden UI/React import at ${relPath}:${lineIndex + 1}: ${line}`
              ).toBe(false);
            });
          }
        });
      });
    });
  });

  describe('2. ARCHITECTURE.md Referenced Files Validation', () => {
    it('verifies that all primary source and test paths referenced in ARCHITECTURE.md exist on disk', () => {
      const archPath = path.join(rootDir, 'ARCHITECTURE.md');
      expect(fs.existsSync(archPath)).toBe(true);

      const content = fs.readFileSync(archPath, 'utf8');

      // Extract all file paths matching src/... or configuration files
      const pathRegex = /(src\/[a-zA-Z0-9_\-\.\/]+\.(?:tsx|ts|jsx|js|json))\b|(\.github\/workflows\/[a-zA-Z0-9_\-\.]+\.yml)\b|(android\/app\/build\.gradle)\b|(firestore\.rules)\b|(security_spec\.md)\b/g;
      const matches = new Set<string>();
      let match: RegExpExecArray | null;

      while ((match = pathRegex.exec(content)) !== null) {
        matches.add(match[0]);
      }

      expect(matches.size).toBeGreaterThan(15);

      matches.forEach(filePath => {
        const fullPath = path.join(rootDir, filePath);
        expect(
          fs.existsSync(fullPath),
          `Referenced file in ARCHITECTURE.md does not exist: ${filePath}`
        ).toBe(true);
      });
    });
  });
});
