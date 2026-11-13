// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { initialNavigationState, navigationTransition } from '../state/app/navigationMachine';
import { initialSessionLifecycleState, sessionLifecycleTransition } from '../state/session/sessionMachine';
import { initialCoachingState, coachingTransition } from '../state/session/coachingMachine';
import { initialAuthState, authTransition } from '../state/sync/authMachine';
import { initialSyncPhase, syncTransition } from '../state/sync/syncMachine';
import { initialDatabaseState, databaseTransition } from '../state/persistence/databaseMachine';
import { initialBackupPhase, backupTransition } from '../state/persistence/backupMachine';
import { initialConfirmationState, confirmationTransition } from '../state/dialogs/confirmationMachine';

describe('State Machine Architecture Contract Invariants', () => {
  const rootDir = process.cwd();
  const stateDir = path.join(rootDir, 'src/state');

  // Parse canonical tsconfig.json so path aliases (@/*) and module resolution match TypeScript
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const tsconfigRaw = fs.existsSync(tsconfigPath)
    ? ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    : { config: {} };
  const parsedTsConfig = ts.parseJsonConfigFileContent(tsconfigRaw.config || {}, ts.sys, rootDir);
  const compilerOptions: ts.CompilerOptions = parsedTsConfig.options;

  function resolveImportToAbsPath(specifier: string, containingFile: string): string | null {
    const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys);
    if (resolved.resolvedModule?.resolvedFileName) {
      return path.resolve(resolved.resolvedModule.resolvedFileName);
    }
    if (specifier.startsWith('.')) {
      const candidate = path.resolve(path.dirname(containingFile), specifier);
      for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        if (fs.existsSync(candidate + ext)) return path.resolve(candidate + ext);
      }
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        getAllTsFiles(filePath, fileList);
      } else if ((file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx') && !file.endsWith('.d.ts')) {
        fileList.push(filePath);
      }
    });
    return fileList;
  }

  const stateFiles = getAllTsFiles(stateDir);

  // 1. AST-Based Dependency Validation & Strict Purity for src/state/
  describe('1. State Machine Purity & AST-Based Downward Isolation', () => {
    it('verifies that state files exist', () => {
      expect(stateFiles.length).toBeGreaterThanOrEqual(8);
    });

    const FORBIDDEN_RUNTIME_GLOBALS = new Set([
      'fetch',
      'setTimeout',
      'setInterval',
      'setImmediate',
      'requestAnimationFrame',
      'localStorage',
      'indexedDB',
      'sessionStorage',
      'window',
      'document',
      'navigator',
      'globalThis',
      'XMLHttpRequest',
      'WebSocket',
      'addEventListener',
      'dispatchEvent',
      'CustomEvent'
    ]);

    stateFiles.forEach(absPath => {
      const relPath = path.relative(rootDir, absPath);

      it(`${relPath} must not import React, UI components, styles, hooks, or use dynamic import()`, () => {
        const fileContent = fs.readFileSync(absPath, 'utf8');
        const sourceFile = ts.createSourceFile(
          absPath,
          fileContent,
          ts.ScriptTarget.Latest,
          true
        );

        const importedModules: string[] = [];
        let hasDynamicImport = false;

        function visit(node: ts.Node) {
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            importedModules.push(node.moduleSpecifier.text);
          }
          if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            importedModules.push(node.moduleSpecifier.text);
          }
          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            hasDynamicImport = true;
            if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
              importedModules.push(node.arguments[0].text);
            }
          }
          ts.forEachChild(node, visit);
        }

        visit(sourceFile);

        expect(hasDynamicImport, `Dynamic import() found in pure state module ${relPath}`).toBe(false);

        importedModules.forEach(mod => {
          const resolvedAbs = resolveImportToAbsPath(mod, absPath);
          const resolvedRel = resolvedAbs ? path.relative(rootDir, resolvedAbs).replace(/\\/g, '/') : mod;
          const isForbidden =
            mod === 'react' ||
            mod === 'react-dom' ||
            mod.startsWith('lucide-react') ||
            resolvedRel.includes('src/components/') ||
            resolvedRel.includes('src/hooks/') ||
            resolvedRel.includes('src/context/') ||
            resolvedRel.includes('src/styles/');

          expect(
            isForbidden,
            `Forbidden dependency "${mod}" (resolved: ${resolvedRel}) imported in ${relPath}`
          ).toBe(false);
        });
      });

      it(`${relPath} must not contain environmental reads, globals, timers, randomness, or non-deterministic time`, () => {
        const fileContent = fs.readFileSync(absPath, 'utf8');
        const sourceFile = ts.createSourceFile(
          absPath,
          fileContent,
          ts.ScriptTarget.Latest,
          true
        );

        let violation = '';

        function isTypeOnlyPosition(node: ts.Node): boolean {
          let curr: ts.Node | undefined = node.parent;
          while (curr) {
            if (
              ts.isTypeNode(curr) ||
              ts.isInterfaceDeclaration(curr) ||
              ts.isTypeAliasDeclaration(curr) ||
              ts.isPropertySignature(curr)
            ) {
              return true;
            }
            curr = curr.parent;
          }
          return false;
        }

        function checkNode(node: ts.Node) {
          if (violation) return;

          if (ts.isIdentifier(node) && FORBIDDEN_RUNTIME_GLOBALS.has(node.text)) {
            const parent = node.parent;
            const isPropertyNameAccess = ts.isPropertyAccessExpression(parent) && parent.name === node;
            const isPropertyAssignmentName = ts.isPropertyAssignment(parent) && parent.name === node;
            if (!isTypeOnlyPosition(node) && !isPropertyNameAccess && !isPropertyAssignmentName) {
              violation = node.text;
              return;
            }
          }

          // Reject `new Date(...)`
          if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
            violation = 'new Date()';
            return;
          }

          // Reject Date.now(), Math.random(), performance.now(), crypto.randomUUID(), crypto.getRandomValues()
          if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
            const obj = node.expression.text;
            const prop = node.name.text;
            if (
              (obj === 'Date' && prop === 'now') ||
              (obj === 'Math' && prop === 'random') ||
              (obj === 'performance' && prop === 'now') ||
              (obj === 'crypto' && (prop === 'randomUUID' || prop === 'getRandomValues'))
            ) {
              violation = `${obj}.${prop}()`;
              return;
            }
          }

          ts.forEachChild(node, checkNode);
        }

        checkNode(sourceFile);

        expect(
          violation,
          `Side-effect or non-deterministic call "${violation}" found in pure transition module ${relPath}`
        ).toBe('');
      });
    });
  });

  // 2. Production Consumer Verification (Resolved Module Paths + Active Usage)
  describe('2. Active Production Consumer Verification', () => {
    const srcDir = path.join(rootDir, 'src');
    const allProdFiles = getAllTsFiles(srcDir).filter(
      f => !f.includes('/test/') && !f.includes('/state/')
    );

    interface ExtractedImport {
      moduleSpecifier: string;
      resolvedAbsPath: string | null;
      importedSymbols: { importedName: string; localName: string }[];
    }

    function parseConsumerAst(filePath: string): {
      imports: ExtractedImport[];
      isSymbolInvokedOrPassedToReducer: (localSymbol: string) => boolean;
    } {
      const content = fs.readFileSync(filePath, 'utf8');
      const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      const imports: ExtractedImport[] = [];
      const calledIdentifiers = new Set<string>();
      const reducerPassedIdentifiers = new Set<string>();

      function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const mod = node.moduleSpecifier.text;
          const symbols: { importedName: string; localName: string }[] = [];
          if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach(el => {
              const importedName = el.propertyName ? el.propertyName.text : el.name.text;
              const localName = el.name.text;
              symbols.push({ importedName, localName });
            });
          }
          imports.push({
            moduleSpecifier: mod,
            resolvedAbsPath: resolveImportToAbsPath(mod, filePath),
            importedSymbols: symbols
          });
        }

        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression)) {
            const callee = node.expression.text;
            calledIdentifiers.add(callee);
            if (callee === 'useReducer' && node.arguments.length > 0 && ts.isIdentifier(node.arguments[0])) {
              reducerPassedIdentifiers.add(node.arguments[0].text);
            }
          } else if (ts.isPropertyAccessExpression(node.expression)) {
            if (node.expression.name.text === 'useReducer' && node.arguments.length > 0 && ts.isIdentifier(node.arguments[0])) {
              reducerPassedIdentifiers.add(node.arguments[0].text);
            }
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sf);

      return {
        imports,
        isSymbolInvokedOrPassedToReducer: (localSymbol: string) =>
          calledIdentifiers.has(localSymbol) || reducerPassedIdentifiers.has(localSymbol)
      };
    }

    const canonicalStateMachines = [
      { name: 'navigationMachine', file: 'src/state/app/navigationMachine.ts', expectedOwner: 'src/App.tsx', transitionFn: 'navigationTransition' },
      { name: 'sessionMachine', file: 'src/state/session/sessionMachine.ts', expectedOwner: 'src/components/SessionView.tsx', transitionFn: 'sessionLifecycleTransition' },
      { name: 'coachingMachine', file: 'src/state/session/coachingMachine.ts', expectedOwner: 'src/components/SessionView.tsx', transitionFn: 'coachingTransition' },
      { name: 'authMachine', file: 'src/state/sync/authMachine.ts', expectedOwner: 'src/hooks/useFitnessSync.ts', transitionFn: 'authTransition' },
      { name: 'syncMachine', file: 'src/state/sync/syncMachine.ts', expectedOwner: 'src/hooks/useFitnessSync.ts', transitionFn: 'syncTransition' },
      { name: 'databaseMachine', file: 'src/state/persistence/databaseMachine.ts', expectedOwner: 'src/hooks/useFitnessData.ts', transitionFn: 'databaseTransition' },
      { name: 'backupMachine', file: 'src/state/persistence/backupMachine.ts', expectedOwner: 'src/hooks/useFitnessBackups.ts', transitionFn: 'backupTransition' },
      { name: 'confirmationMachine', file: 'src/state/dialogs/confirmationMachine.ts', expectedOwner: 'src/context/ConfirmContext.tsx', transitionFn: 'confirmationTransition' }
    ];

    canonicalStateMachines.forEach(machine => {
      it(`machine ${machine.name} has an active consumer in ${machine.expectedOwner} passing ${machine.transitionFn} to useReducer or calling it`, () => {
        const expectedOwnerAbs = path.resolve(rootDir, machine.expectedOwner);
        const machineAbs = path.resolve(rootDir, machine.file);

        expect(fs.existsSync(expectedOwnerAbs), `Expected consumer file ${machine.expectedOwner} not found`).toBe(true);
        const parsed = parseConsumerAst(expectedOwnerAbs);

        const relevantImport = parsed.imports.find(imp => imp.resolvedAbsPath === machineAbs);
        expect(
          relevantImport,
          `AST inspection: ${machine.expectedOwner} does not resolve to ${machine.file}`
        ).toBeDefined();

        const symbolBinding = relevantImport!.importedSymbols.find(
          s => s.importedName === machine.transitionFn
        );
        expect(
          symbolBinding,
          `AST inspection: ${machine.expectedOwner} does not import ${machine.transitionFn} from ${machine.file}`
        ).toBeDefined();

        expect(
          parsed.isSymbolInvokedOrPassedToReducer(symbolBinding!.localName),
          `AST inspection: ${machine.expectedOwner} imports ${machine.transitionFn} but never calls it or passes it to useReducer`
        ).toBe(true);
      });
    });

    it('verifies via resolved module paths that no orphaned state machine files exist in src/state', () => {
      const resolvedProdImports = new Set<string>();
      allProdFiles.forEach(prodFile => {
        const { imports } = parseConsumerAst(prodFile);
        imports.forEach(imp => {
          if (imp.resolvedAbsPath) {
            resolvedProdImports.add(imp.resolvedAbsPath);
          }
        });
      });

      stateFiles.forEach(sf => {
        const baseName = path.basename(sf, '.ts');
        if (baseName === 'machineTypes') return;

        const absStateFile = path.resolve(sf);
        expect(
          resolvedProdImports.has(absStateFile),
          `AST verification: State machine file ${path.relative(rootDir, absStateFile)} has no resolved production imports`
        ).toBe(true);
      });
    });
  });

  // 3. Pure Transition Determinism & Immutability Verification
  describe('3. Deterministic Immutability of State Transition Functions', () => {
    it('navigationTransition does not mutate input state and returns identical results for identical inputs', () => {
      const state = Object.freeze({ ...initialNavigationState });
      const event = Object.freeze({ type: 'NAVIGATE' as const, to: 'history' as const });
      const result1 = navigationTransition(state, event);
      const result2 = navigationTransition(state, event);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(state);
      expect(state.route).toBe('dashboard');
    });

    it('sessionLifecycleTransition is immutable and deterministic', () => {
      const state = Object.freeze({ ...initialSessionLifecycleState });
      const event = Object.freeze({ type: 'START' as const, workoutId: 'push-a', startTime: 1000 });
      const result1 = sessionLifecycleTransition(state, event);
      const result2 = sessionLifecycleTransition(state, event);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(state);
      expect(state.phase).toBe('idle');
    });

    it('coachingTransition isolates exercise keys without modifying input map', () => {
      const state = Object.freeze({ ...initialCoachingState });
      const event = Object.freeze({
        type: 'REQUEST_STARTED' as const,
        exerciseId: 'ex_bench',
        requestId: 'req_1'
      });
      const result = coachingTransition(state, event);

      expect(result).not.toBe(state);
      expect(state['ex_bench']).toBeUndefined();
      expect(result['ex_bench'].status).toBe('loading');
    });

    it('authTransition is pure and immutable', () => {
      const state = Object.freeze({ ...initialAuthState });
      const event = Object.freeze({
        type: 'LOGIN_SUCCEEDED' as const,
        user: { uid: 'u1', email: 'a@b.com' }
      });
      const result = authTransition(state, event);

      expect(result).not.toBe(state);
      expect(state.status).toBe('initializing');
      expect(result.status).toBe('authenticated');
    });

    it('syncTransition is pure and immutable', () => {
      const state = Object.freeze({ ...initialSyncPhase });
      const event = Object.freeze({
        type: 'SYNC_STARTED' as const,
        uid: 'u1',
        generation: 1
      });
      const result = syncTransition(state, event);

      expect(result).not.toBe(state);
      expect(state.status).toBe('idle');
      expect(result.status).toBe('syncing');
    });

    it('databaseTransition is pure and immutable', () => {
      const state = Object.freeze({ ...initialDatabaseState });
      const event = Object.freeze({ type: 'WRITE_STARTED' as const });
      const result = databaseTransition(state, event);

      expect(result).not.toBe(state);
      expect(state.phase).toBe('ready');
      expect(result.phase).toBe('persisting');
    });

    it('backupTransition is pure and immutable', () => {
      const state = Object.freeze({ ...initialBackupPhase });
      const event = Object.freeze({ type: 'INIT_SUCCEEDED' as const, count: 5 });
      const result = backupTransition(state, event);

      expect(result).not.toBe(state);
      expect(state.status).toBe('loading');
      expect(result.status).toBe('ready');
    });

    it('confirmationTransition is pure and immutable', () => {
      const state = Object.freeze({ ...initialConfirmationState });
      const event = Object.freeze({
        type: 'ENQUEUE' as const,
        request: { id: 'r1', title: 'T', message: 'M' }
      });
      const result = confirmationTransition(state, event);

      expect(result).not.toBe(state);
      expect(state.status).toBe('closed');
      expect(result.status).toBe('open');
    });
  });

  // 4. Documentation & Schema Synchronization
  describe('4. Architecture Documentation Registry Synchronization', () => {
    it('verifies that STATE_MACHINES.md accurately lists all active machines', () => {
      const docPath = path.join(rootDir, 'STATE_MACHINES.md');
      expect(fs.existsSync(docPath)).toBe(true);
      const docContent = fs.readFileSync(docPath, 'utf8');

      stateFiles.forEach(absPath => {
        const baseName = path.basename(absPath);
        if (baseName === 'machineTypes.ts') return;
        expect(
          docContent.includes(baseName),
          `STATE_MACHINES.md is missing documentation for active machine ${baseName}`
        ).toBe(true);
      });
    });
  });
});
