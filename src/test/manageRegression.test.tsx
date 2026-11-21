// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkoutEditor } from '../components/manage/WorkoutEditor';
import { CycleEditor } from '../components/manage/CycleEditor';
import { ExerciseLibrary } from '../components/manage/ExerciseLibrary';
import { ProgramIdentityCard } from '../components/manage/ProgramIdentityCard';
import { AccountSection } from '../components/manage/AccountSection';
import { DataMaintenanceSection } from '../components/manage/DataMaintenanceSection';
import { ConfirmProvider } from '../context/ConfirmContext';
import { FitnessContext, FitnessContextType } from '../context/FitnessContext';
import { INITIAL_WORKOUTS, INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { Workout } from '../types/fitness';

vi.mock('../utils/haptics', () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    selection: vi.fn(),
    selectionChanged: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    destructive: vi.fn(),
    vibrate: vi.fn(),
  },
}));

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function createMockFitnessContext(overrides: Partial<FitnessContextType> = {}): FitnessContextType {
  return {
    user: null,
    loading: false,
    syncStatus: 'idle',
    syncError: null,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    retrySync: vi.fn(),
    accountResetStatus: 'idle',
    accountResetError: null,
    retryAccountReset: vi.fn().mockResolvedValue({ success: true }),
    exerciseDefinitions: INITIAL_EXERCISE_DEFINITIONS,
    workouts: INITIAL_WORKOUTS,
    logs: {},
    appState: { cycleStart: '2026-10-01' },
    databaseLifecycleState: { phase: 'ready' },
    retryStorageCommit: vi.fn().mockReturnValue({ success: true }),
    addExerciseDefinition: vi.fn().mockResolvedValue({
      id: 'ex-new-custom',
      name: 'Hammer Curl',
      target: 'Biceps',
      equipment: 'Dumbbell',
      instructions: '',
      tags: [],
    }),
    updateExerciseDefinition: vi.fn(),
    deleteExerciseDefinition: vi.fn(),
    setWorkouts: vi.fn(),
    assignExerciseToWorkout: vi.fn(),
    removeExerciseFromWorkout: vi.fn(),
    updateWorkoutExerciseProgramming: vi.fn(),
    deleteWorkout: vi.fn(),
    addLog: vi.fn().mockResolvedValue({ success: true, localPersisted: true, cloudPersisted: false, cloudAttempted: false }),
    deleteLog: vi.fn(),
    resetLogs: vi.fn().mockResolvedValue(undefined),
    updateCycleStart: vi.fn().mockResolvedValue(undefined),
    commitFitnessSnapshot: vi.fn(),
    activeSession: null,
    startActiveSession: vi.fn(),
    updateActiveSessionSets: vi.fn(),
    clearActiveSession: vi.fn(),
    logBodyWeight: vi.fn(),
    deleteBodyWeight: vi.fn(),
    pushAutoBackup: vi.fn().mockResolvedValue({ success: true }),
    getAutoBackups: vi.fn().mockReturnValue([]),
    clearAutoBackups: vi.fn().mockResolvedValue({ success: true }),
    restoreAutoBackup: vi.fn().mockResolvedValue({ success: true, message: 'Restored', restoreStatus: 'restored_locally' }),
    createManualBackup: vi.fn().mockResolvedValue({ success: true, message: 'Savepoint created' }),
    exportBackup: vi.fn().mockReturnValue('{"workouts":[],"logs":{}}'),
    importBackup: vi.fn().mockResolvedValue({ success: true, message: 'Backup imported successfully', restoreStatus: 'restored_locally' }),
    retryPendingCloudSync: vi.fn().mockResolvedValue({ success: true, message: 'Synced', restoreStatus: 'fully_synced' }),
    isBackupsLoading: false,
    hasPendingCloudSync: false,
    pendingCloudSyncError: null,
    ...overrides,
  };
}

describe('Manage Subsystem Regression & Defect Verification Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('1. WorkoutEditor Index-Safe Mutation & Exercise Management', () => {
    const defA = INITIAL_EXERCISE_DEFINITIONS[0];
    const defB = INITIAL_EXERCISE_DEFINITIONS[1];
    const baseWorkout: Workout = {
      id: 'wo-push-test',
      name: 'Push Protocol Test',
      badge: 'PUSH TEST',
      type: 'push',
      isCore: true,
      cycleDay: 1,
      exercises: [
        { exerciseDefinitionId: defA.id, sets: 3, reps: '8-10', rest: '90s', tags: [], note: '' },
        { exerciseDefinitionId: defB.id, sets: 4, reps: '12', rest: '60s', tags: [], note: '' },
      ],
    };

    it('updates sets, reps, rest, note, and priority/daily tags strictly on the targeted exercise row without mutating sibling rows', () => {
      const onSaveWorkout = vi.fn();
      const mockFitness = createMockFitnessContext();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <WorkoutEditor
                workout={baseWorkout}
                allWorkouts={[baseWorkout]}
                onSaveWorkout={onSaveWorkout}
                onOpenExerciseEditor={vi.fn()}
                onBack={vi.fn()}
              />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      // Expand only the second exercise (index 1)
      const expandButtons = Array.from(
        container.querySelectorAll('button[aria-controls^="workout-ex-panel-"]')
      ).filter((b) => b.getAttribute('aria-label') !== 'Expand exercise details') as HTMLButtonElement[];
      expect(expandButtons).toHaveLength(2);

      act(() => {
        expandButtons[1].click();
      });

      expect(container.querySelector(`#workout-ex-panel-${defA.id}-0`)).toBeNull();
      const secondPanel = container.querySelector(`#workout-ex-panel-${defB.id}-1`);
      expect(secondPanel).toBeTruthy();

      // Increase sets on row 1 (4 -> 5) and ensure row 0 remains untouched (sets === 3)
      const incBtn = secondPanel!.querySelector('button[aria-label="Increase sets"]') as HTMLButtonElement;
      act(() => {
        incBtn.click();
      });
      expect(onSaveWorkout).toHaveBeenCalledTimes(1);
      let saved = onSaveWorkout.mock.calls[0][0] as Workout;
      expect(saved.exercises[0].sets).toBe(3);
      expect(saved.exercises[1].sets).toBe(5);

      // Update rep range on row 1
      const repInput = Array.from(secondPanel!.querySelectorAll('input')).find(
        (i) => i.value === '12'
      ) as HTMLInputElement;
      act(() => {
        setInputValue(repInput, '15');
      });
      saved = onSaveWorkout.mock.calls[1][0] as Workout;
      expect(saved.exercises[0].reps).toBe('8-10');
      expect(saved.exercises[1].reps).toBe('15');

      // Toggle Priority chip on row 1
      const priorityBtn = Array.from(secondPanel!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Mark Priority')
      ) as HTMLButtonElement;
      act(() => {
        priorityBtn.click();
      });
      saved = onSaveWorkout.mock.calls[2][0] as Workout;
      expect(saved.exercises[0].tags).toEqual([]);
      expect(saved.exercises[1].tags).toEqual(['priority']);
    });

    it('removes only the targeted exercise row after confirmation when exercises lack an explicit id property', async () => {
      const onSaveWorkout = vi.fn();
      const mockFitness = createMockFitnessContext();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <WorkoutEditor
                workout={baseWorkout}
                allWorkouts={[baseWorkout]}
                onSaveWorkout={onSaveWorkout}
                onOpenExerciseEditor={vi.fn()}
                onBack={vi.fn()}
              />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const expandButtons = Array.from(
        container.querySelectorAll('button[aria-controls^="workout-ex-panel-"]')
      ).filter((b) => b.getAttribute('aria-label') !== 'Expand exercise details') as HTMLButtonElement[];
      act(() => {
        expandButtons[1].click();
      });

      const secondPanel = container.querySelector(`#workout-ex-panel-${defB.id}-1`)!;
      const removeBtn = Array.from(secondPanel.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Remove'
      ) as HTMLButtonElement;

      await act(async () => {
        removeBtn.click();
      });

      const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('EXECUTE') || b.textContent?.includes('Confirm') || b.textContent?.includes('Remove')
      );
      const modalBtns = Array.from(document.body.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')) as HTMLButtonElement[];
      const confirmDeleteBtn = modalBtns[modalBtns.length - 1] ?? confirmBtn;
      expect(confirmDeleteBtn).toBeTruthy();

      await act(async () => {
        confirmDeleteBtn!.click();
      });

      expect(onSaveWorkout).toHaveBeenCalledTimes(1);
      const saved = onSaveWorkout.mock.calls[0][0] as Workout;
      expect(saved.exercises).toHaveLength(1);
      expect(saved.exercises[0].exerciseDefinitionId).toBe(defA.id);
    });

    it('reorders exercises cleanly and supports recovery rest notes & empty library search', () => {
      const onSaveWorkout = vi.fn();
      const mockFitness = createMockFitnessContext();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <WorkoutEditor
                workout={baseWorkout}
                allWorkouts={[baseWorkout]}
                onSaveWorkout={onSaveWorkout}
                onOpenExerciseEditor={vi.fn()}
                onBack={vi.fn()}
              />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const moveDownBtns = container.querySelectorAll('button[aria-label="Move exercise down"]');
      act(() => {
        (moveDownBtns[0] as HTMLButtonElement).click();
      });
      const reordered = onSaveWorkout.mock.calls[0][0] as Workout;
      expect(reordered.exercises.map((e) => e.exerciseDefinitionId)).toEqual([defB.id, defA.id]);

      // Add Exercise search empty state
      const addExBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Exercise')
      ) as HTMLButtonElement;
      act(() => {
        addExBtn.click();
      });
      const searchLib = container.querySelector('input[placeholder*="Search library"]') as HTMLInputElement;
      act(() => {
        setInputValue(searchLib, 'zzzz-unknown-movement');
      });
      expect(container.textContent).toContain('No matching exercises found in library.');

      // Rest day recovery checkpoints
      const restWorkout: Workout = {
        id: 'wo-rest',
        name: 'Recovery Day',
        badge: 'REST',
        type: 'rest',
        isCore: true,
        cycleDay: 4,
        exercises: [],
        restNotes: ['Walk 8,000 steps'],
      };
      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <WorkoutEditor
                workout={restWorkout}
                allWorkouts={[restWorkout]}
                onSaveWorkout={onSaveWorkout}
                onOpenExerciseEditor={vi.fn()}
                onBack={vi.fn()}
              />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });
      expect(container.textContent).toContain('Recovery Protocol Checkpoints');
      expect(container.textContent).toContain('Walk 8,000 steps');
    });
  });

  describe('2. CycleEditor, ExerciseLibrary & ProgramIdentityCard', () => {
    it('renders 8 sequential cycle slots, malformed review banner, and auxiliary workouts in CycleEditor', () => {
      const onSelectWorkout = vi.fn();
      const workoutsWithIssues: Workout[] = [
        ...INITIAL_WORKOUTS,
        { id: 'malformed-dup', name: 'Broken Duplicate Day 1', badge: 'DUP', type: 'push', isCore: true, cycleDay: 1, exercises: [] },
        { id: 'bonus-cond', name: 'Bonus Conditioning', badge: 'BONUS', type: 'custom', isCore: false, cycleDay: null as any, exercises: [] },
      ];

      act(() => {
        root.render(<CycleEditor workouts={workoutsWithIssues} onSelectWorkout={onSelectWorkout} />);
      });

      const slots = container.querySelectorAll('[data-testid^="cycle-slot-"]');
      expect(slots).toHaveLength(8);
      expect(container.querySelector('[data-testid="malformed-core-section"]')).toBeTruthy();
      expect(container.textContent).toContain('Broken Duplicate Day 1');
      expect(container.textContent).toContain('Bonus Conditioning');
    });

    it('filters ExerciseLibrary by search query and muscle group and renders empty state fallback', () => {
      const mockFitness = createMockFitnessContext();
      const onOpenExerciseEditor = vi.fn();
      const onCreateNewExercise = vi.fn();

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ExerciseLibrary
              workouts={INITIAL_WORKOUTS}
              onOpenExerciseEditor={onOpenExerciseEditor}
              onCreateNewExercise={onCreateNewExercise}
            />
          </FitnessContext.Provider>
        );
      });

      const searchInput = container.querySelector('input[placeholder*="Search exercises"]') as HTMLInputElement;
      act(() => {
        setInputValue(searchInput, 'zzznomatch');
      });
      expect(container.textContent).toContain('No exercises match your search');

      const newExEmptyBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '+ New Exercise'
      ) as HTMLButtonElement;
      act(() => {
        newExEmptyBtn.click();
      });
      expect(onCreateNewExercise).toHaveBeenCalledTimes(1);
    });

    it('renders ProgramIdentityCard empty state vs populated cycle breakdown', () => {
      const onEditProgram = vi.fn();
      act(() => {
        root.render(<ProgramIdentityCard workouts={[]} onEditProgram={onEditProgram} />);
      });
      expect(container.textContent).toContain('No Active Program');

      act(() => {
        root.render(<ProgramIdentityCard workouts={INITIAL_WORKOUTS} onEditProgram={onEditProgram} />);
      });
      expect(container.textContent).toContain('8-Day Routine Cycle');
      expect(container.textContent).toContain('6 workouts · 2 rest days');
    });
  });

  describe('3. AccountSection & DataMaintenanceSection Hardening', () => {
    it('prevents duplicate concurrent logins and surfaces authError via role="alert"', async () => {
      let rejectLogin: (e: Error) => void = () => {};
      const slowLogin = vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            rejectLogin = reject;
          })
      );
      const mockFitness = createMockFitnessContext({ login: slowLogin });

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <AccountSection />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      const loginBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Sync with Google')
      ) as HTMLButtonElement;

      // Double click while first login request is in flight
      act(() => {
        loginBtn.click();
        loginBtn.click();
      });
      expect(slowLogin).toHaveBeenCalledTimes(1);

      await act(async () => {
        rejectLogin(new Error('Network blocked by privacy filter'));
      });

      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl?.textContent).toContain('Network blocked by privacy filter');
    });

    it('renders DataMaintenanceSection readable empty restore points, paste validation error, and pending cloud sync retry', async () => {
      const importBackup = vi.fn().mockResolvedValue({
        success: false,
        message: 'Invalid JSON string: Failed to parse backup.',
        restoreStatus: 'failed',
      });
      const mockFitness = createMockFitnessContext({
        hasPendingCloudSync: true,
        pendingCloudSyncError: 'Offline quota paused',
        importBackup,
      });

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitness}>
            <ConfirmProvider>
              <DataMaintenanceSection />
            </ConfirmProvider>
          </FitnessContext.Provider>
        );
      });

      // Readable empty restore points message (leaf div uses bodySecondary text-xs, not micro text-[9px])
      const emptyRestore = Array.from(container.querySelectorAll('div')).find(
        (d) => d.children.length === 0 && d.textContent?.trim() === 'No restore points available.'
      );
      expect(emptyRestore).toBeTruthy();
      expect(emptyRestore?.className).toContain('text-xs');
      expect(emptyRestore?.className).not.toContain('text-[9px]');

      // Pending cloud sync banner & retry trigger
      expect(container.textContent).toContain('Cloud restore reconciliation pending');
      const retryBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Retry Cloud Sync'
      ) as HTMLButtonElement;
      await act(async () => {
        retryBtn.click();
      });
      expect(mockFitness.retryPendingCloudSync).toHaveBeenCalledTimes(1);

      // Paste JSON error surfacing
      const pasteToggle = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Paste JSON')
      ) as HTMLButtonElement;
      act(() => {
        pasteToggle.click();
      });
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        setInputValue(textarea, '{bad json');
      });
      const restoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Restore from JSON')
      ) as HTMLButtonElement;
      await act(async () => {
        restoreBtn.click();
      });
      expect(importBackup).toHaveBeenCalledWith('{bad json');
      expect(container.textContent).toContain('Invalid JSON string');
    });
  });
});
