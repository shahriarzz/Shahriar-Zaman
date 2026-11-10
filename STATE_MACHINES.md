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
   State machine definitions (`src/state/`) must never import React hooks, contexts, or UI components. Shared types live in `src/types/` (such as `src/types/navigation.ts`). React components and hooks consume machines via `useReducer` or memoized selector projections.
4. **Single Authoritative Ownership**:
   Every critical workflow has exactly one canonical state owner. Unrelated boolean combinations representing mutually exclusive phases are prohibited.
5. **Durable Boundaries & Offline Resilience**:
   Side-effect handlers coordinate persistence, network requests, and haptics outside the pure transition boundary.

---

## 2. Canonical State Machine Index

Every machine in this registry has a verified, active production consumer. No unused or aspirational machines are maintained in `src/state/`.

| # | Workflow Domain | Machine File | Canonical Production Owner | State Type | Events | Primary Verification Test |
|---|---|---|---|---|---|---|
| **1** | **App Navigation** | `src/state/app/navigationMachine.ts` | `src/App.tsx` | `NavigationState` | `NavigationEvent` | `src/test/stateMachines.test.ts`, `src/test/mobileNavigationAnimation.test.tsx` |
| **2** | **Active Workout Session** | `src/state/session/sessionMachine.ts` | `src/components/SessionView.tsx` | `SessionLifecycleState` | `SessionLifecycleEvent` | `src/test/stateMachines.test.ts`, `src/test/sessionDataContract.test.ts` |
| **3** | **AI Coaching Requests** | `src/state/session/coachingMachine.ts` | `src/components/SessionView.tsx` | `CoachingMap` | `CoachingEvent` | `src/test/stateMachines.test.ts`, `src/test/apiAndCoachingFallback.test.ts` |
| **4** | **Authentication Lifecycle** | `src/state/sync/authMachine.ts` | `src/hooks/useFitnessSync.ts` | `AuthState` | `AuthEvent` | `src/test/stateMachines.test.ts`, `src/test/dataSyncAndIsolationRegression.test.ts` |
| **5** | **Cloud Synchronization** | `src/state/sync/syncMachine.ts` | `src/hooks/useFitnessSync.ts` | `SyncPhase` | `SyncEvent` | `src/test/stateMachines.test.ts`, `src/test/targetedPerformanceRegressionPass2.test.tsx` |
| **6** | **Local Database Storage** | `src/state/persistence/databaseMachine.ts` | `src/hooks/useFitnessData.ts` | `DatabaseState` | `DatabaseEvent` | `src/test/stateMachines.test.ts`, `src/test/persistenceBoundaries.test.ts` |
| **7** | **Backup & Savepoints** | `src/state/persistence/backupMachine.ts` | `src/hooks/useFitnessBackups.ts`, `src/utils/fitnessBackupDb.ts` | `BackupPhase` | `BackupEvent` | `src/test/stateMachines.test.ts`, `src/test/backupRestoreRoundTrip.test.ts` |
| **8** | **Dialogs & Confirmation** | `src/state/dialogs/confirmationMachine.ts` | `src/context/ConfirmContext.tsx` | `ConfirmationState` | `ConfirmationEvent` | `src/test/stateMachines.test.ts` |

---

## 3. Machine Contracts & Invariants

### 1. App Navigation Machine (`src/state/app/navigationMachine.ts`)
- **Owner**: `src/App.tsx` via `useReducer(navigationTransition, initialNavigationState)`.
- **State**: `{ route: 'dashboard' }` | `{ route: 'history' }` | `{ route: 'analytics' }` | `{ route: 'manage' }` | `{ route: 'session', workoutId: string, pendingLeaveRequest?: LeaveSessionRequest }`.
- **Invariants**:
  - `ActiveTab` type is imported from `src/types/navigation.ts` (zero UI component dependencies in `src/state/`).
  - A session route must strictly carry the target `workoutId`.
  - Leave requests assign a unique `requestId`. Duplicate exit taps while a confirmation is open are rejected to prevent destination clobbering.
  - `CONFIRM_LEAVE_SESSION` and `CANCEL_LEAVE_SESSION` strictly match the in-flight `requestId`.
  - Android hardware back button from `session` triggers serialized leave-confirmation flow; from sub-tabs returns to `dashboard`; on `dashboard` requests native app minimization.

### 2. Active Workout Session Machine (`src/state/session/sessionMachine.ts`)
- **Owner**: `src/components/SessionView.tsx` via `useReducer(sessionLifecycleTransition, initialSessionLifecycleState)`.
- **Phases**: `idle` → `running` → `validating` → `committing` → `completed` (with `abandoning` and recoverable `error` states).
- **Invariants**:
  - Exactly one authoritative session lifecycle owner (`SessionView.tsx`). Misleading derived lifecycle states in hooks are eliminated.
  - A session cannot be finished more than once: `finishSession` gates on active phase and validates parameters.
  - Session sets remain canonically owned by `gl_active_session` in `ActiveSessionContext`.
  - A failed commit preserves the complete active draft and transitions to recoverable `error`.
  - Draft is cleared from `localStorage` ONLY after `addLog()` and cycle anchor adjustment have completed.
  - PR calculation is snapshotted against pre-session canonical history prior to `addLog()`.

### 3. AI Coaching Request Machine (`src/state/session/coachingMachine.ts`)
- **Owner**: `src/components/SessionView.tsx` via `useReducer(coachingTransition, initialCoachingState)`.
- **State**: `CoachingMap` (`Record<string, ExerciseCoachingState>`).
- **Invariants**:
  - Every advice request is tagged with a unique `requestId`.
  - Stale responses or abort cancellations from older requests never clear or overwrite newer in-flight requests.
  - Previous successful advice remains visible while a replacement request is loading.
  - Cancelling an in-flight replacement restores the prior valid advice rather than destroying results.

### 4. Auth & Sync Machines (`src/state/sync/authMachine.ts`, `src/state/sync/syncMachine.ts`)
- **Owner**: `src/hooks/useFitnessSync.ts` via `useReducer(authTransition, ...)` and `useReducer(syncTransition, ...)`.
- **Invariants**:
  - Generation and UID isolation: in-flight sync callbacks strictly check matching `uid` and `generation`. Stale completions from prior accounts or older sync generations are discarded.
  - Account switching or logout triggers an atomic `resetToDefaultData()` and wipes UID-scoped tombstones (`gl_deleted_ids_${uid}`).
  - Differentiates `initial_sync`, `syncing`, `synced`, `offline`, `retrying`, and `failed`.
  - Offline network detection pauses retry backoff and cleanly transitions to `offline` status without reporting false generic failures.

### 5. Local Database & Backup Machines (`src/state/persistence/`)
- **Owners**: `useFitnessData.ts` and `useFitnessBackups.ts`.
- **Invariants**:
  - `persistFitnessDatabase` performs two-phase staging (`gl_snapshot_staging` → `gl_database_snapshot` → readback verification). It throws on failure and never dispatches false-positive `WRITE_COMMITTED`.
  - Unrelated or stale write completions never clear an active `storage_error`.
  - `importBackup` strictly awaits pre-import checkpoint creation: if the checkpoint fails, the import aborts immediately before modifying application data or clearing tombstones.
  - Backups enforce an 8-checkpoint limit and durable IndexedDB `tx.oncomplete` resolution.
  - Account boundaries cleanly wipe backup caches to prevent cross-account checkpoint leaks.

### 6. Confirmation Machine (`src/state/dialogs/confirmationMachine.ts`)
- **Owner**: `src/context/ConfirmContext.tsx` via `useReducer(confirmationTransition, initialConfirmationState)`.
- **Invariants**:
  - Serialized FIFO queue: concurrent confirmation requests are queued rather than dropped or deadlocked.
  - No global indiscriminate Enter key listener: Enter activates only focused controls according to normal HTML button semantics.
  - Escape key cancels the active dialog safely.
  - Dialog opening saves `document.activeElement` and restores focus on close.
  - Single-resolution guarantee: every request promise resolves exactly once.
  - Provider unmount safely rejects all pending queue items with `false`.

---

## 4. Cross-Reference Links

- **System Architecture & Dependency Rules**: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Domain Data Schemas & Migrations**: [`DATA_MODEL.md`](./DATA_MODEL.md)
- **Product Requirements & Protocol Rules**: [`PRD.md`](./PRD.md)
- **AI Operating Governance**: [`AGENTS.md`](./AGENTS.md)
