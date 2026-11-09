// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { initialNavigationState, navigationTransition } from '../state/app/navigationMachine';
import { initialSessionLifecycleState, sessionLifecycleTransition } from '../state/session/sessionMachine';
import { initialCoachingState, coachingTransition } from '../state/session/coachingMachine';
import { initialAuthState, authTransition } from '../state/sync/authMachine';
import { initialSyncPhase, syncTransition } from '../state/sync/syncMachine';
import { initialDatabaseState, databaseTransition } from '../state/persistence/databaseMachine';
import { initialBackupPhase, backupTransition } from '../state/persistence/backupMachine';
import { initialEditorMode, editorTransition } from '../state/editing/editorMachine';
import { initialConfirmationState, confirmationTransition } from '../state/dialogs/confirmationMachine';

describe('State Machine Architecture Contract Invariants', () => {
  const rootDir = process.cwd();
  const stateDir = path.join(rootDir, 'src/state');

  // 1. Purity & Downward Dependency Rules for src/state/
  describe('1. State Machine Purity & Downward Isolation', () => {
    function getAllFiles(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          getAllFiles(filePath, fileList);
        } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
          fileList.push(filePath);
        }
      });
      return fileList;
    }

    const stateFiles = getAllFiles(stateDir);

    it('finds all state machine modules in src/state', () => {
      expect(stateFiles.length).toBeGreaterThanOrEqual(8);
    });

    stateFiles.forEach(absPath => {
      const relPath = path.relative(rootDir, absPath);

      it(`${relPath} must not import React hooks or UI components`, () => {
        const content = fs.readFileSync(absPath, 'utf8');
        const lines = content.split('\n');

        const forbiddenImportPatterns = [
          /from\s+['"]react['"]/,
          /from\s+['"]react-dom['"]/,
          /from\s+['"]\.\.?\/components/,
          /from\s+['"]\.\.?\/styles/
        ];

        lines.forEach((line, idx) => {
          if (line.trim().startsWith('import ') || line.trim().startsWith('export * from')) {
            forbiddenImportPatterns.forEach(pattern => {
              expect(
                pattern.test(line),
                `Forbidden React/UI import found at ${relPath}:${idx + 1}: ${line}`
              ).toBe(false);
            });
          }
        });
      });

      it(`${relPath} must not contain side-effects (no async transitions, no fetch, no setTimeout)`, () => {
        const content = fs.readFileSync(absPath, 'utf8');
        const lines = content.split('\n');

        // Check for side effects inside transition modules (mutationLifecycle is the execution runner)
        if (!relPath.includes('mutationLifecycle.ts')) {
          lines.forEach((line, idx) => {
            const forbiddenEffectPatterns = [
              /\bfetch\s*\(/,
              /\bsetTimeout\s*\(/,
              /\bsetInterval\s*\(/,
              /\blocalStorage\b/
            ];

            forbiddenEffectPatterns.forEach(pattern => {
              expect(
                pattern.test(line),
                `Forbidden side-effect in state machine at ${relPath}:${idx + 1}: ${line}`
              ).toBe(false);
            });
          });
        }
      });
    });
  });

  // 2. Pure Transition Determinism & Immutability Verification
  describe('2. Deterministic Immutability of State Transition Functions', () => {
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
      const event = Object.freeze({ type: 'START' as const, workoutId: 'push-a' as const, startTime: 1000 });
      const result1 = sessionLifecycleTransition(state, event);
      const result2 = sessionLifecycleTransition(state, event);

      expect(result1).toEqual(result2);
      expect(result1.phase).toBe('running');
      expect(state.phase).toBe('idle');
    });

    it('coachingTransition does not mutate prior exercise advice mappings', () => {
      const state = Object.freeze({
        bench: Object.freeze({ status: 'success' as const, advice: 'Tight grip' })
      });
      const event = Object.freeze({ type: 'REQUEST_STARTED' as const, exerciseId: 'squat' });
      const next = coachingTransition(state as any, event);

      expect(next.bench.status).toBe('success');
      expect(next.squat.status).toBe('loading');
      expect((state as any).squat).toBeUndefined();
    });

    it('confirmationTransition preserves immutable queue ordering', () => {
      const state = Object.freeze({ ...initialConfirmationState });
      const req = Object.freeze({ id: 'r1', title: 'Test', message: 'Msg' });
      const next = confirmationTransition(state, { type: 'ENQUEUE', request: req });

      expect(next.status).toBe('open');
      expect(state.status).toBe('closed');
      expect(state.queue.length).toBe(0);
    });
  });

  // 3. UI Layer Boundaries: No Direct Cloud or Storage Writes in UI Screens
  describe('3. UI Layer Isolation (Direct Persistence & Cloud Write Guard)', () => {
    const screens = [
      'src/components/Dashboard.tsx',
      'src/components/HistoryView.tsx',
      'src/components/AnalyticsView.tsx',
      'src/components/Calendar.tsx'
    ];

    screens.forEach(relPath => {
      it(`${relPath} must not write directly to localStorage or Firestore collections`, () => {
        const fullPath = path.join(rootDir, relPath);
        if (!fs.existsSync(fullPath)) return;

        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        const forbiddenBypasses = [
          /\blocalStorage\.setItem\s*\(\s*['"]gl_database_snapshot['"]/,
          /\blocalStorage\.setItem\s*\(\s*['"]gl_active_session['"]/,
          /\bsetDoc\s*\(/,
          /\baddDoc\s*\(/,
          /\bdeleteDoc\s*\(/
        ];

        lines.forEach((line, idx) => {
          forbiddenBypasses.forEach(pattern => {
            expect(
              pattern.test(line),
              `Direct persistence/cloud bypass at ${relPath}:${idx + 1}: ${line}`
            ).toBe(false);
          });
        });
      });
    });
  });

  // 4. Registry Synchronization Verification
  describe('4. STATE_MACHINES.md Registry Synchronization', () => {
    it('verifies all files indexed in STATE_MACHINES.md exist on disk', () => {
      const registryPath = path.join(rootDir, 'STATE_MACHINES.md');
      expect(fs.existsSync(registryPath)).toBe(true);

      const content = fs.readFileSync(registryPath, 'utf8');
      const pathRegex = /(src\/state\/[a-zA-Z0-9_\-\.\/]+\.ts)\b/g;
      const matches = new Set<string>();
      let match: RegExpExecArray | null;

      while ((match = pathRegex.exec(content)) !== null) {
        matches.add(match[0]);
      }

      expect(matches.size).toBeGreaterThanOrEqual(8);

      matches.forEach(filePath => {
        const fullPath = path.join(rootDir, filePath);
        expect(
          fs.existsSync(fullPath),
          `Machine file documented in STATE_MACHINES.md missing on disk: ${filePath}`
        ).toBe(true);
      });
    });
  });
});
