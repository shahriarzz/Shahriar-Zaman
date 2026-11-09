# GAINLOG State Machine Architecture & Registry

> **Status**: Active Architectural Specification  
> **Authority**: Defines the typed lifecycle state machines, legal transitions, invariants, and side-effect boundaries for GAINLOG workflows.  
> **Rule for AI Agents & Developers**: Before adding or modifying application workflows, consult this registry to identify canonical state owners and legal transitions. Do NOT implement ad-hoc boolean flag combinations or un-instrumented asynchronous flows.

---

## 1. Architectural Principles

1. **Lightweight & Domain-Specific**:
   GAINLOG uses pure, domain-specific TypeScript state machines without external runtime dependencies (zero XState, Redux, or Zustand).
2. **Pure Transition Functions**:
   Transition functions `(state: TState, event: TEvent) => TState` are completely deterministic, synchronous, and side-effect free.
3. **Downward Layer Directionality**:
   State machine definitions (`src/state/`) must never import React hooks, contexts, or UI components. React components and hooks consume machines via `useReducer` or memoized selector projections.
4. **Single Authoritative Ownership**:
   Every critical workflow has exactly one canonical state owner. Unrelated boolean combinations representing mutually exclusive phases are prohibited.
5. **Durable Boundaries & Offline Resilience**:
   Side-effect handlers coordinate persistence, network requests, and haptics outside the pure transition boundary.

---

## 2. Canonical State Machine Index

| # | Workflow Domain | Machine File | Canonical Owner | State Type | Events | Primary Verification Test |
|---|---|---|---|---|---|---|
| **1** | **App Navigation** | `src/state/app/navigationMachine.ts` | `src/App.tsx`, `src/components/Layout.tsx` | `NavigationState` | `NavigationEvent` | `src/test/stateMachines.test.ts`, `src/test/mobileNavigationAnimation.test.tsx` |
| **2** | **Active Workout Session** | `src/state/session/sessionMachine.ts` | `src/hooks/useActiveSession.ts`, `src/components/SessionView.tsx` | `SessionLifecycleState` | `SessionLifecycleEvent` | `src/test/stateMachines.test.ts`, `src/test/sessionDataContract.test.ts` |
| **3** | **AI Coaching Requests** | `src/state/session/coachingMachine.ts` | `src/components/SessionView.tsx` | `CoachingMap` | `CoachingEvent` | `src/test/stateMachines.test.ts`, `src/test/apiAndCoachingFallback.test.ts` |
| **4** | **Authentication Lifecycle** | `src/state/sync/authMachine.ts` | `src/hooks/useFitnessSync.ts` | `AuthState` | `AuthEvent` | `src/test/stateMachines.test.ts`, `src/test/dataSyncAndIsolationRegression.test.ts` |
| **5** | **Cloud Synchronization** | `src/state/sync/syncMachine.ts` | `src/hooks/useFitnessSync.ts` | `SyncPhase` | `SyncEvent` | `src/test/stateMachines.test.ts`, `src/test/targetedPerformanceRegressionPass2.test.tsx` |
| **6** | **Local Database Storage** | `src/state/persistence/databaseMachine.ts` | `src/hooks/useFitnessData.ts` | `DatabaseState` | `DatabaseEvent` | `src/test/stateMachines.test.ts`, `src/test/persistenceBoundaries.test.ts` |
| **7** | **Backup & Savepoints** | `src/state/persistence/backupMachine.ts` | `src/hooks/useFitnessBackups.ts`, `src/utils/fitnessBackupDb.ts` | `BackupPhase` | `BackupEvent` | `src/test/stateMachines.test.ts`, `src/test/backupRestoreRoundTrip.test.ts` |
| **8** | **Domain Mutation Boundary** | `src/state/domain/mutationLifecycle.ts` | `src/hooks/useFitnessLogs.ts`, `useFitnessWorkouts.ts`, `useFitnessExercises.ts` | `MutationOutcome<T>` | Functional Execution | `src/test/stateMachines.test.ts`, `src/test/canonicalFitnessPipeline.test.ts` |
| **9** | **Manage & Editors** | `src/state/editing/editorMachine.ts` | `src/components/ManageView.tsx`, `ProgramEditor.tsx` | `EditorMode` | `EditorEvent` | `src/test/stateMachines.test.ts` |
| **10** | **Dialogs & Confirmation** | `src/state/dialogs/confirmationMachine.ts` | `src/context/ConfirmContext.tsx` | `ConfirmationState` | `ConfirmationEvent` | `src/test/stateMachines.test.ts` |
| **11** | **Training Cycle Contract** | `src/state/training/cycleContract.ts` | `src/utils/fitnessCalculations.ts`, `src/utils/trainingIntelligence.ts` | `CycleScheduleEvaluation` | Pure Evaluation | `src/test/stateMachines.test.ts`, `src/test/recoveryCycleAdvancement.test.ts` |

---

## 3. Machine Contracts & Invariants

### 1. App Navigation Machine (`src/state/app/navigationMachine.ts`)
- **State**: `{ route: 'dashboard' }` | `{ route: 'history' }` | `{ route: 'analytics' }` | `{ route: 'manage' }` | `{ route: 'session', workoutId: string, pendingLeaveDestination?: ActiveTab }`
- **Invariants**:
  - A session route must strictly carry the target `workoutId`.
  - Direct tab navigation while in an active session enters `pendingLeaveDestination`, requiring explicit user confirmation before discarding.
  - Android hardware back button from `session` triggers leave-confirmation flow; from sub-tabs returns to `dashboard`; on `dashboard` requests app minimization.
  - Preserves scroll positions across tab navigation.

### 2. Active Workout Session Machine (`src/state/session/sessionMachine.ts`)
- **Phases**: `idle` → `running` → `validating` → `committing` → `completed` (with `abandoning` and recoverable `error` states).
- **Invariants**:
  - A session cannot be finished more than once.
  - A failed commit preserves the active draft in a recoverable `error` state.
  - Session sets remain owned by `gl_active_session` without duplicated set state inside the machine.
  - PR calculation is snapshotted against pre-session history prior to `addLog()`.

### 3. AI Coaching Request Machine (`src/state/session/coachingMachine.ts`)
- **State**: Per-exercise record: `Record<string, { status: 'idle' | 'loading' | 'success' | 'fallback' | 'error', advice?: string, error?: string }>`.
- **Invariants**:
  - Loading status is scoped per-exercise: requesting coaching for one exercise never clears or overwrites another exercise's in-flight request.
  - AbortController cancellation transitions strictly to `idle` without overwriting prior successful advice.

### 4. Auth & Sync Machines (`src/state/sync/authMachine.ts`, `src/state/sync/syncMachine.ts`)
- **Invariants**:
  - In-flight sync callbacks strictly check matching `uid` and `generation`. Stale completions from prior accounts or older sync generations are discarded.
  - Account switching or logout triggers an atomic `resetToDefaultData()` and wipes UID-scoped tombstones (`gl_deleted_ids_${uid}`).
  - Offline network detection pauses retry backoff and cleanly transitions to `offline` status without pretending local changes were lost.

### 5. Local Database & Backup Machines (`src/state/persistence/`)
- **Invariants**:
  - Single versioned snapshot commit with staged read-back verification (`gl_database_snapshot` and `gl_snapshot_staging`).
  - Storage failures transition to `storage_error` with `canRetry: true` rather than failing silently.
  - Backups enforce an 8-checkpoint limit and durable IndexedDB `tx.oncomplete` resolution.
  - Account boundaries cleanly wipe backup caches to prevent cross-account checkpoint leaks.

### 6. Confirmation Machine (`src/state/dialogs/confirmationMachine.ts`)
- **Invariants**:
  - FIFO serialized queue: concurrent confirmation dialog requests are queued rather than dropped or deadlocked.
  - Every confirmation promise resolves exactly once.
  - Provider unmount safely rejects pending requests with `false`.

---

## 4. Cross-Reference Links

- **System Architecture & Dependency Rules**: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Domain Data Schemas & Migrations**: [`DATA_MODEL.md`](./DATA_MODEL.md)
- **Product Requirements & Protocol Rules**: [`PRD.md`](./PRD.md)
- **AI Operating Governance**: [`AGENTS.md`](./AGENTS.md)
