// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

interface ExtractedDependency {
  specifier: string;
  resolvedPath: string | null;
  kind: 'import' | 'reexport' | 'dynamic-import' | 'import-equals';
  isTypeOnly: boolean;
  line: number;
}

function resolveModuleTarget(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const baseDir = path.dirname(fromFile);
  const candidate = path.resolve(baseDir, specifier);
  const probes = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    path.join(candidate, 'index.ts'),
    path.join(candidate, 'index.tsx'),
  ];
  for (const probe of probes) {
    if (fs.existsSync(probe) && fs.statSync(probe).isFile()) {
      return probe;
    }
  }
  return candidate;
}

export function extractAstDependencies(filePath: string, sourceText: string): ExtractedDependency[] {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const deps: ExtractedDependency[] = [];

  const getLine = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const isTypeOnly = Boolean(
        clause &&
          (clause.isTypeOnly ||
            (!clause.name &&
              clause.namedBindings &&
              ts.isNamedImports(clause.namedBindings) &&
              clause.namedBindings.elements.length > 0 &&
              clause.namedBindings.elements.every((el) => el.isTypeOnly)))
      );
      const specifier = node.moduleSpecifier.text;
      deps.push({
        specifier,
        resolvedPath: resolveModuleTarget(filePath, specifier),
        kind: 'import',
        isTypeOnly,
        line: getLine(node),
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const isTypeOnly = Boolean(
        node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((el) => el.isTypeOnly))
      );
      const specifier = node.moduleSpecifier.text;
      deps.push({
        specifier,
        resolvedPath: resolveModuleTarget(filePath, specifier),
        kind: 'reexport',
        isTypeOnly,
        line: getLine(node),
      });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteral(firstArg)) {
        const specifier = firstArg.text;
        deps.push({
          specifier,
          resolvedPath: resolveModuleTarget(filePath, specifier),
          kind: 'dynamic-import',
          isTypeOnly: false,
          line: getLine(node),
        });
      }
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expr = node.moduleReference.expression;
      if (ts.isStringLiteral(expr)) {
        const specifier = expr.text;
        deps.push({
          specifier,
          resolvedPath: resolveModuleTarget(filePath, specifier),
          kind: 'import-equals',
          isTypeOnly: Boolean(node.isTypeOnly),
          line: getLine(node),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return deps;
}

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

/**
 * Architectural & Downward Dependency Invariant Verification (AST-based).
 * Uses the TypeScript compiler API to inspect imports, type-only imports,
 * re-exports, and dynamic imports across pure calculation, state, service,
 * infrastructure lib, and hook layers.
 */
describe('ARCHITECTURE Contract & Dependency Invariants', () => {
  const rootDir = process.cwd();
  const srcRoot = path.join(rootDir, 'src');

  // Explicitly documented exceptions only — every entry requires a clear reason.
  const DOCUMENTED_LAYER_EXCEPTIONS = new Map<string, Set<string>>([
    // Type-only persistence record interfaces shared with hooks (erased at compile time; zero runtime dependency)
    ['src/utils/fitnessBackupDb.ts', new Set(['type:../hooks/useFitnessBackups', 'type:../hooks/useFitnessData'])],
    // Calendar status helper resolves pure semantic hex constants from tokens.ts (no React/UI import)
    ['src/utils/calendarHelpers.ts', new Set(['../styles/tokens'])],
  ]);

  const FORBIDDEN_UI_PACKAGES = new Set(['react', 'react-dom', 'motion', 'motion/react', 'lucide-react']);

  function isForbiddenUiOrAppTarget(resolvedPath: string | null, specifier: string): boolean {
    if (FORBIDDEN_UI_PACKAGES.has(specifier) || specifier.startsWith('react/') || specifier.startsWith('react-dom/')) {
      return true;
    }
    if (!resolvedPath) return false;
    const relTarget = path.relative(srcRoot, resolvedPath).replace(/\\/g, '/');
    return (
      relTarget.startsWith('components/') ||
      relTarget.startsWith('hooks/') ||
      relTarget.startsWith('context/') ||
      relTarget.startsWith('styles/') ||
      relTarget === 'App.tsx'
    );
  }

  describe('1. Downward Layer Isolation Across utils, state, services, and lib (TypeScript AST)', () => {
    const isolatedLayers = ['src/utils', 'src/state', 'src/services', 'src/lib'];
    const filesToAudit = isolatedLayers.flatMap((layer) => collectSourceFiles(path.join(rootDir, layer)));

    it('audits all files in src/utils/, src/state/, src/services/, and src/lib/', () => {
      expect(filesToAudit.length).toBeGreaterThan(20);
    });

    filesToAudit.forEach((fullPath) => {
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      it(`${relPath} respects downward dependency boundaries`, () => {
        const content = fs.readFileSync(fullPath, 'utf8');
        const deps = extractAstDependencies(fullPath, content);
        const exceptions = DOCUMENTED_LAYER_EXCEPTIONS.get(relPath);

        const violations: string[] = [];
        for (const dep of deps) {
          const exceptionKey = dep.isTypeOnly ? `type:${dep.specifier}` : dep.specifier;
          if (exceptions?.has(exceptionKey)) {
            continue;
          }

          if (isForbiddenUiOrAppTarget(dep.resolvedPath, dep.specifier)) {
            violations.push(
              `${relPath}:${dep.line} (${dep.kind}${dep.isTypeOnly ? ' type-only' : ''}) -> "${dep.specifier}"`
            );
          }
        }

        expect(
          violations,
          `Forbidden layer dependency detected:\n${violations.join('\n')}`
        ).toEqual([]);
      });
    });

    it('prevents src/hooks/ from importing React UI component barrels or screen components', () => {
      const hookFiles = collectSourceFiles(path.join(rootDir, 'src/hooks'));
      expect(hookFiles.length).toBeGreaterThan(5);

      const violations: string[] = [];
      for (const fullPath of hookFiles) {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        const deps = extractAstDependencies(fullPath, fs.readFileSync(fullPath, 'utf8'));
        for (const dep of deps) {
          if (!dep.resolvedPath) continue;
          const relTarget = path.relative(srcRoot, dep.resolvedPath).replace(/\\/g, '/');
          if (relTarget.startsWith('components/')) {
            violations.push(`${relPath}:${dep.line} (${dep.kind}) -> "${dep.specifier}"`);
          }
        }
      }

      expect(violations, `Hooks must not import UI components:\n${violations.join('\n')}`).toEqual([]);
    });

    it('detects multiline imports, type-only imports, re-exports, and dynamic imports via AST', () => {
      const syntheticSource = [
        'import type {',
        '  CardProps',
        "} from '../components/ui';",
        'import {',
        '  Button,',
        '  Badge',
        "} from '../components/ui';",
        "export { showToast } from '../components/ui/Toast';",
        "const loadView = () => import('../components/HistoryView');",
      ].join('\n');

      const fakePath = path.join(rootDir, 'src/utils/__synthetic__.ts');
      const deps = extractAstDependencies(fakePath, syntheticSource);

      expect(deps).toHaveLength(4);
      expect(deps[0]).toMatchObject({ specifier: '../components/ui', kind: 'import', isTypeOnly: true });
      expect(deps[1]).toMatchObject({ specifier: '../components/ui', kind: 'import', isTypeOnly: false });
      expect(deps[2]).toMatchObject({ specifier: '../components/ui/Toast', kind: 'reexport', isTypeOnly: false });
      expect(deps[3]).toMatchObject({ specifier: '../components/HistoryView', kind: 'dynamic-import', isTypeOnly: false });
    });
  });

  describe('2. ARCHITECTURE.md Referenced Files Validation', () => {
    it('verifies that all primary source and test paths referenced in ARCHITECTURE.md exist on disk', () => {
      const archPath = path.join(rootDir, 'ARCHITECTURE.md');
      expect(fs.existsSync(archPath)).toBe(true);

      const content = fs.readFileSync(archPath, 'utf8');

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
