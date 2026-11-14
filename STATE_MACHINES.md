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
  - Generation, sequence-token, and UID isolation: in-flight auth reset callbacks capture a monotonic `authEventSeqRef` token and ignore superseded callbacks after awaiting isolation cleanup; in-flight sync callbacks verify matching `uid`, `authGenerationRef`, and `!resetFencedRef.current`.
  - Account reset fencing: if `resetToDefaultData()` (including `clearAutoBackupsForAccountReset()`) fails during an account switch/logout, `resetFencedRef.current` stays `true`, `user` remains fenced (`null`), and `accountResetStatus` becomes `'failed'` with a retryable `retryAccountReset()` path rather than silently publishing a mixed `currentUidRef`/`user` state.
  - UID-partitioned tombstone retention: account switching and `logout()` do NOT delete `gl_deleted_ids_${uid}`. Only anonymous tombstones (`gl_deleted_ids_anon`) are cleared (`FitnessContext.tsx` / `useFitnessSync.ts`) when entering an authenticated account from anonymous mode. Before running Step 0 cloud deletions, `syncDataBackground()` requires `getPendingCloudReconciliationFromDb(uid)` or a valid same-UID/same-generation cached record (aborting before any cloud delete if unknown), and `filterTombstonesExcludingSnapshot()` shields records in any `PendingCloudReconciliation` snapshot alongside Step 0 purged IDs.
  - Differentiates `initial_sync`, `syncing`, `synced`, `offline`, `retrying`, and `failed`. Domain cloud write hooks report failures via `setSyncStatus` / `setSyncError`.
  - Offline network detection pauses retry backoff and cleanly transitions to `offline` status without reporting false generic failures.

### 5. Local Database & Backup Machines (`src/state/persistence/`)
- **Owners**: `useFitnessData.ts` (`databaseMachine.ts`) and `useFitnessBackups.ts` + `fitnessBackupDb.ts` (`backupMachine.ts`).
- **Invariants**:
  - `persistFitnessDatabase` performs two-phase staging (`gl_snapshot_staging` → `gl_database_snapshot` → readback verification), with `commitFitnessSnapshot()` / background persistence deduped via slice reference equality (`lastCommittedSnapshotRef`) instead of redundant `JSON.stringify` compares. It throws on failure and never dispatches false-positive `WRITE_COMMITTED`. Recoverable write failures transition `databaseState` to `storage_error` and are retryable via `retryStorageCommit()`.
  - Unrelated or stale write completions never clear an active `storage_error`.
  - `openBackupDb()` maintains a single-flight `inFlightOpenPromise`, closes late `onsuccess` connections after `onblocked`, and clears cached state on `onclose`/`onversionchange`/error.
  - `initializationPromiseRef` + `hasHydratedRef` enforce an explicit hydration barrier before backup pruning, import checkpoints, or restore reads (`isBackupOperationAdmissible` blocks `create`/`restore`/`import`/`clear` during `loading`).
  - `backupPhaseRef` mirrors `backupTransition` synchronously; `runSerializedBackupOp` evaluates `isBackupOperationAdmissible` inside the queue immediately before execution without relying on React rerenders. Every start transition (including `CLEAR_STARTED` and `FORCE_CLEAR_STARTED`) is guarded in `backupTransition`.
  - `clearAutoBackups()` (UI path) returns explicit failure when inadmissible and preserves `backupsCacheRef` + `gl_auto_backups_meta` if IndexedDB clear fails. `clearAutoBackupsForAccountReset()` (account-boundary path) coalesces via `activeForceClearPromiseRef`, advances `resetEpochRef`, awaits active mutations/migrations, wipes `auto_backups` via `clearBackupCheckpointsFromDb()` (leaving per-UID `pending_cloud_sync` intact while clearing in-memory pending refs cleanly), and rejects/returns failure if durable clearing fails.
  - `importBackup` and `restoreAutoBackup` await pre-operation checkpoint creation, then persist `PendingCloudReconciliation` (`status: 'pending'`) write-ahead in `pending_cloud_sync` BEFORE starting cloud writes (never starting cloud writes or claiming durable recovery if pre-write persistence fails, cleaning up on local-commit failure). IndexedDB read/write/delete errors in `executeWriteAheadCloudReconciliation()` and `retryPendingCloudSync()` are never swallowed; in-memory pending state and `gl_deleted_ids_${uid}` stay intact until `clearPendingCloudReconciliationFromDb(uid)` succeeds durably.
  - Backups enforce an 8-checkpoint limit and durable IndexedDB `tx.oncomplete` resolution; `migrateLegacyLocalStorageBackups()` preserves existing DB records on timestamp collisions and keeps `gl_auto_backups` intact if a transaction aborts.

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
