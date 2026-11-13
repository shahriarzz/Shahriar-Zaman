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

  // 1. AST-Based Dependency Validation for src/state/
  describe('1. State Machine Purity & AST-Based Downward Isolation', () => {
    it('verifies that state files exist', () => {
      expect(stateFiles.length).toBeGreaterThanOrEqual(8);
    });

    stateFiles.forEach(absPath => {
      const relPath = path.relative(rootDir, absPath);

      it(`${relPath} must not import React, UI components, styles, or hooks via AST inspection`, () => {
        const fileContent = fs.readFileSync(absPath, 'utf8');
        const sourceFile = ts.createSourceFile(
          absPath,
          fileContent,
          ts.ScriptTarget.Latest,
          true
        );

        const importedModules: string[] = [];

        function visit(node: ts.Node) {
          // Check static import declarations
          if (ts.isImportDeclaration(node)) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
              importedModules.push(node.moduleSpecifier.text);
            }
          }
          // Check export from declarations
          if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
              importedModules.push(node.moduleSpecifier.text);
            }
          }
          // Check dynamic import() calls
          if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length > 0 &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            importedModules.push(node.arguments[0].text);
          }
          ts.forEachChild(node, visit);
        }

        visit(sourceFile);

        importedModules.forEach(mod => {
          const isForbidden =
            mod === 'react' ||
            mod === 'react-dom' ||
            mod.includes('/components') ||
            mod.includes('/styles') ||
            mod.startsWith('lucide-react');

          expect(
            isForbidden,
            `Forbidden dependency "${mod}" imported in ${relPath}`
          ).toBe(false);
        });
      });

      it(`${relPath} must not contain side-effects (pure synchronous state transitions)`, () => {
        const fileContent = fs.readFileSync(absPath, 'utf8');
        const sourceFile = ts.createSourceFile(
          absPath,
          fileContent,
          ts.ScriptTarget.Latest,
          true
        );

        let hasSideEffects = false;
        let sideEffectName = '';

        function checkNode(node: ts.Node) {
          if (ts.isIdentifier(node)) {
            if (
              node.text === 'fetch' ||
              node.text === 'setTimeout' ||
              node.text === 'setInterval' ||
              node.text === 'localStorage' ||
              node.text === 'indexedDB' ||
              node.text === 'sessionStorage'
            ) {
              // Ensure it's not a type or property name in an interface
              const parent = node.parent;
              if (
                !ts.isPropertySignature(parent) &&
                !ts.isTypeReferenceNode(parent)
              ) {
                hasSideEffects = true;
                sideEffectName = node.text;
              }
            }
          }

          // Check for Date.now(), Math.random(), performance.now()
          if (ts.isPropertyAccessExpression(node)) {
            const expr = node.expression;
            const name = node.name.text;
            if (ts.isIdentifier(expr)) {
              if (
                (expr.text === 'Date' && name === 'now') ||
                (expr.text === 'Math' && name === 'random') ||
                (expr.text === 'performance' && name === 'now')
              ) {
                hasSideEffects = true;
                sideEffectName = `${expr.text}.${name}`;
              }
            }
          }

          ts.forEachChild(node, checkNode);
        }

        checkNode(sourceFile);

        expect(
          hasSideEffects,
          `Side-effect or non-deterministic call "${sideEffectName}" found in pure transition module ${relPath}`
        ).toBe(false);
      });
    });
  });

  // 2. Production Consumer Verification (Zero Dead Machines)
  describe('2. Active Production Consumer Verification', () => {
    const srcDir = path.join(rootDir, 'src');
    const allProdFiles = getAllTsFiles(srcDir).filter(
      f => !f.includes('/test/') && !f.includes('/state/')
    );

    // Helper: Parse TS file to AST and extract import declarations and imported symbols
    function getFileImports(filePath: string): { moduleSpecifier: string; importedSymbols: string[] }[] {
      const content = fs.readFileSync(filePath, 'utf8');
      const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      const imports: { moduleSpecifier: string; importedSymbols: string[] }[] = [];

      function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
          if (ts.isStringLiteral(node.moduleSpecifier)) {
            const mod = node.moduleSpecifier.text;
            const symbols: string[] = [];
            if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
              node.importClause.namedBindings.elements.forEach(el => {
                symbols.push(el.name.text);
              });
            }
            imports.push({ moduleSpecifier: mod, importedSymbols: symbols });
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sf);
      return imports;
    }

    const canonicalStateMachines = [
      { name: 'navigationMachine', file: 'src/state/app/navigationMachine.ts', expectedOwner: 'App.tsx', transitionFn: 'navigationTransition' },
      { name: 'sessionMachine', file: 'src/state/session/sessionMachine.ts', expectedOwner: 'SessionView.tsx', transitionFn: 'sessionLifecycleTransition' },
      { name: 'coachingMachine', file: 'src/state/session/coachingMachine.ts', expectedOwner: 'SessionView.tsx', transitionFn: 'coachingTransition' },
      { name: 'authMachine', file: 'src/state/sync/authMachine.ts', expectedOwner: 'useFitnessSync.ts', transitionFn: 'authTransition' },
      { name: 'syncMachine', file: 'src/state/sync/syncMachine.ts', expectedOwner: 'useFitnessSync.ts', transitionFn: 'syncTransition' },
      { name: 'databaseMachine', file: 'src/state/persistence/databaseMachine.ts', expectedOwner: 'useFitnessData.ts', transitionFn: 'databaseTransition' },
      { name: 'backupMachine', file: 'src/state/persistence/backupMachine.ts', expectedOwner: 'useFitnessBackups.ts', transitionFn: 'backupTransition' },
      { name: 'confirmationMachine', file: 'src/state/dialogs/confirmationMachine.ts', expectedOwner: 'ConfirmContext.tsx', transitionFn: 'confirmationTransition' }
    ];

    canonicalStateMachines.forEach(machine => {
      it(`machine ${machine.name} has a verified production consumer in ${machine.expectedOwner} via AST symbol inspection`, () => {
        const ownerFile = allProdFiles.find(f => f.endsWith(machine.expectedOwner));
        expect(ownerFile, `Expected consumer file ${machine.expectedOwner} not found in src/`).toBeDefined();

        const fileImports = getFileImports(ownerFile!);
        const relevantImport = fileImports.find(imp =>
          imp.moduleSpecifier.includes(machine.name)
        );

        expect(
          relevantImport,
          `AST inspection: ${machine.expectedOwner} does not import module ${machine.name}`
        ).toBeDefined();

        // Verify the transition function symbol itself is imported
        expect(
          relevantImport?.importedSymbols,
          `AST inspection: ${machine.expectedOwner} does not import transition function ${machine.transitionFn} from ${machine.name}`
        ).toContain(machine.transitionFn);
      });
    });

    it('verifies that no orphaned or unreferenced state machine files exist in src/state via AST import mapping', () => {
      const allImportedModules = allProdFiles.flatMap(f => getFileImports(f).map(i => i.moduleSpecifier));

      stateFiles.forEach(sf => {
        const baseName = path.basename(sf, '.ts');
        if (baseName === 'machineTypes') return; // Shared interface types

        const isImportedInProd = allImportedModules.some(mod => mod.includes(baseName));
        expect(
          isImportedInProd,
          `AST verification: State machine module ${baseName} has no AST import references in production codebase`
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
