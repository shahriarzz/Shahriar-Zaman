# GAINLOG System Architecture & Architectural Contract

## 1. System Map

GAINLOG is a local-first, offline-capable progressive overload training engine with selective Firestore cloud synchronization. The system is composed of the following core modules:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Application Root                              │
│                    (index.html → src/App.tsx)                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           FitnessContext                               │
│                   (src/context/FitnessContext.tsx)                     │
│  Orchestrates domain hooks, local persistence, and cloud sync:         │
│  • useFitnessData         • useFitnessSync        • useFitnessBackups  │
│  • useFitnessExercises    • useFitnessWorkouts    • useFitnessLogs     │
│  • useActiveSession                                                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FitnessDerivedContext                           │
│               (src/context/FitnessDerivedContext.tsx)                  │
│  • Constructs canonical FitnessIndex via buildFitnessIndex() in O(N)   │
│  • Computes training intelligence insights (trainingIntelligence.ts)   │
│  • Exposes pure memoized selectors (fitnessDerivedSelectors.ts)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            UI View Layer                               │
│  • Dashboard (src/components/Dashboard.tsx)                            │
│  • Session Execution (src/components/SessionView.tsx)                  │
│  • History & Reports (src/components/HistoryView.tsx)                  │
│  • Analytics (src/components/AnalyticsView.tsx)                        │
│  • Calendar (src/components/Calendar.tsx + useCalendarGrid.ts)         │
│  • Management & Vault (src/components/ManageView.tsx)                  │
│  • Shared UI Primitives & Tokens (src/components/ui/, tokens.ts)       │
└────────────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

1. **Application Entry & Root Composition** (`src/App.tsx`, `src/main.tsx`):
   Mounts providers (`FitnessProvider` → `FitnessDerivedProvider` → `ConfirmProvider` → `ToastContainer`), manages active navigation tab (`dashboard`, `session`, `history`, `analytics`, `calendar`, `manage`), and catches unexpected execution halts via `ErrorFallback.tsx`.
2. **Local Persistence & Migration** (`src/hooks/useFitnessData.ts`, `src/utils/fitnessMigration.ts`):
   Loads, migrates (V1 → V2), and persists the atomic database snapshot payload (`gl_database_snapshot`) using staging-commit protection (`gl_snapshot_staging`) with best-effort discrete key mirroring for backwards compatibility.
3. **Cloud Synchronization & Service Boundary** (`src/hooks/useFitnessSync.ts`, `src/services/fitnessFirestore.ts`, `src/utils/fitnessSyncHelpers.ts`):
   Manages Firestore auth listeners, bidirectional batched replication (<= 400 items/batch), UID-isolated deletion tombstones (`gl_deleted_ids_${uid}`), conflict resolution via deterministic `updatedAt` timestamps, and in-flight sync queuing (`syncQueuedRef`).
4. **Active Workout State** (`src/hooks/useActiveSession.ts`):
   Maintains transient in-progress workout keystrokes, active timer, and set completions in `gl_active_session`. Completely isolated from historical logs and indexing until user explicitly finishes the session.
5. **Canonical Derived Index** (`src/utils/fitnessDerivedSelectors.ts`):
   Executes a single O(N) traversal over session logs in `buildFitnessIndex()` to construct memoized exercise indices, PR records, date-to-volume maps, and completed-set totals.
6. **Training Intelligence & Calculations** (`src/utils/trainingIntelligence.ts`, `src/utils/fitnessCalculations.ts`):
   Computes protocol adherence, training streak across recovery days, 28-day frequency, strength trends, and multi-factor performance score on top of `FitnessIndex`.
7. **Design Tokens & Shared Primitives** (`src/styles/tokens.ts`, `src/components/ui/`):
   Centralizes application visual design: `SURFACE`, `BORDER`, `RADIUS`, `SPACING`, `TYPOGRAPHY`, `SHADOW`, `GAP`, and modular primitives (`Card`, `StatCard`, `Section`, `Button`, `Dialog`, etc.).

---

## 2. Ownership and Sources of Truth

| Concern | Canonical Owner | Source of Truth | Consumers Must Not |
|---|---|---|---|
| **Exercise identity** | `src/utils/exerciseResolver.ts` (`resolveExercise()`) | Canonical `ExerciseDefinition` records (`id`, `name`, `target`, `tags`) in `FitnessContext` / `defsMap` | Create independent IDs, invent ad-hoc names, or resolve using uncanonical fallback strings |
| **Workout templates** | `src/hooks/useFitnessWorkouts.ts` | Canonical `Workout` records in `FitnessContext` / `workouts` | Maintain competing workout copies or mutate template structures directly in UI components |
| **Completed training history** | `src/hooks/useFitnessLogs.ts` (`addLog()`, `deleteLog()`) | Persisted `SessionLog` map in `FitnessContext` / `logs` | Reconstruct history from UI state, filter un-sanitized raw inputs, or count incomplete sessions |
| **Active workout** | `src/hooks/useActiveSession.ts` | Transient active-session state (`gl_active_session`) | Treat an unfinished draft as completed history or write keystrokes directly into `logs` |
| **Derived fitness statistics** | `src/utils/fitnessDerivedSelectors.ts` (`buildFitnessIndex()`) | Memoized `FitnessIndex` in `FitnessDerivedContext` | Reimplement calculations or aggregate volumes/sets independently in screen components |
| **PR and e1RM records** | `src/utils/fitnessDerivedSelectors.ts` (`buildFitnessIndex()`), `src/components/SessionView.tsx` (`calculateSessionPRs()`) | Canonical `WeightPRRecord` and `E1RMPRRecord` pipelines in `FitnessIndex` | Compare against inconsistent local history, count dual PRs as 2 events, or use un-sanitized values |
| **Cycle progression** | `src/utils/fitnessCalculations.ts` (`getCycleDay()`, `getAdjustedCycleStart()`) | Canonical `appState.cycleStart` anchor date string in `FitnessContext` | Infer the cycle from a separate UI-only rule, freeze cycle on missed days, or advance on bonus workouts |
| **Sync conflicts & deletions** | `src/utils/fitnessSyncHelpers.ts` (`resolveLocalCloudRecord()`, `trackDeletedId()`) | Per-record `updatedAt` timestamps and UID-partitioned tombstones (`gl_deleted_ids_${uid}`) | Bypass tombstones, mix cross-account tombstones, or discard queued follow-up sync requests |
| **Design tokens & shared UI** | `src/styles/tokens.ts`, `src/components/ui/` | Token definitions (`SURFACE`, `BORDER`, `RADIUS`, `SPACING`, `TYPOGRAPHY`, etc.) | Hardcode arbitrary styling classes, invent one-off dialogs/modals, or duplicate shared layouts |

---

## 3. Dependency Rules

```
┌────────────────────────────────────────────────────────┐
│               UI Screens & Components                  │
│    (Dashboard, SessionView, HistoryView, Analytics,    │
│            Calendar, ManageView, Modal Dialogs)        │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌───────────────────────────┐    ┌───────────────────────┐
│     Context & Hooks       │    │  Shared UI Primitives │
│ (FitnessContext,          │    │  & Design Tokens      │
│  FitnessDerivedContext,   │    │  (src/components/ui/, │
│  useCalendarGrid)         │    │   src/styles/tokens)  │
└───────────┬───────────────┘    └───────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│          Pure Selectors & Training Intelligence        │
│        (fitnessDerivedSelectors.ts,                    │
│         trainingIntelligence.ts, exerciseResolver.ts)  │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│              Calculations & Data Contracts             │
│        (fitnessCalculations.ts, fitnessMigration.ts)   │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│        Persistence & Synchronization Services          │
│        (fitnessSyncHelpers.ts, fitnessFirestore.ts)    │
└────────────────────────────────────────────────────────┘
```

### Layering Rules

1. **Downwards Dependency Flow**:
   Components consume hooks, selectors, and UI primitives. UI components must NEVER be imported by calculation, selector, persistence, or sync modules.
2. **Pure Calculation Isolation**:
   Pure calculation modules (`fitnessCalculations.ts`, `exerciseResolver.ts`, `trainingIntelligence.ts`) must NOT import React, React hooks, or UI state.
3. **No Direct UI Calculation of Canonical Metrics**:
   Screens must NOT calculate total volume, streaks, PRs, adherence, or frequency by scanning raw logs. They must read them directly from `FitnessDerivedContext` or canonical selectors.
4. **Single Ingestion Gate**:
   All log writes must pass through `sanitizeSessionLog()` and `addLog()` before durable storage or Firestore upload.
5. **No Cross-Feature Re-implementation**:
   Screens must not bypass shared hooks (e.g. `useCalendarGrid`) to re-compute date grids or log groupings.

---

## 4. Critical Data Flows

### A. App Initialization & Hydration
```
localStorage (gl_database_snapshot)
    │
    ▼ (validateSnapshotStructure; fallback to gl_snapshot_staging / discrete keys)
loadInitialFitnessData() & migrateV1ToV2()
    │
    ▼
FitnessContext State Hydrated (initialData)
    │
    ├─────────────────────────────────────────────┐
    ▼                                             ▼
buildFitnessIndex() (O(N) single pass)      Firebase Auth State Change (useFitnessSync)
    │                                             │
    ▼                                             ▼
FitnessDerivedContext Ready                Download & Merge Cloud Data (resolveLocalCloudRecord)
    │                                             │
    ▼                                             ▼
UI Views Render Canonical Data             Local State Updated (if cloud has newer data)
```
- **Failure Rule**: If `gl_database_snapshot` is corrupted, recovery promotes `gl_snapshot_staging` if valid, or recovers from discrete legacy keys (`gl_exercise_definitions`, `gl_workouts`, `gl_logs`, `gl_state`), saving corrupted data to `gl_corrupt_snapshot_backup`.

### B. Session Completion & Log Persistence
```
Active Session Input (SessionView: sessionSets, activeWorkout)
    │
    ▼
calculateSessionPRs() (Snapshot PRs against pre-session canonical history)
    │
    ▼
sanitizeSessionLog() (Enforce finite numbers, integer reps, deterministic set IDs)
    │
    ▼
addLog() (Atomically writes nextLogs in memory, updates logsRef synchronously)
    │
    ├─────────────────────────────────────────────┐
    ▼                                             ▼
persistFitnessDatabase() (Local snapshot)    saveLog() (Firestore write if authenticated)
    │
    ▼ (Only after durable persistence succeeds)
updateCycleStart() (If completing out-of-order scheduled core workout)
    │
    ▼
clearActiveSession() (Remove gl_active_session) → Render Completion Summary
```
- **Failure Rule**: If `addLog()` fails or throws, `clearActiveSession()` is NOT called. The active session draft is preserved in `localStorage` (`gl_active_session`) to prevent data loss.

### C. Fitness Calculation & Derived Metrics
```
logs (Record<string, SessionLog>)
    │
    ▼ (Filter: isCompletedSession(l) && l.date <= todayStr)
buildFitnessIndex() (Single O(N) traversal over session logs)
    │
    ├─ sortedLogsDescending, sortedLogsAscending
    ├─ exerciseIndex (Map: sessions, maxW, volume, weightPR, e1RMPR, progression)
    ├─ weightPRs, e1RMPRs (Canonical PR arrays)
    ├─ completedSetsByDate (done: true sets from completed sessions)
    ├─ plannedSetsByDate (all programmed/logged set rows)
    ├─ volumeByDate, volumeByMuscle, frequencyByMuscle
    └─ lifetimeStats (totalSessions, totalVolume, totalSets, calendarTrainingStreak)
    │
    ▼
trainingIntelligence.ts Algorithms
    ├─ calculateTrainingStreak() (Scheduled protocol streak across rest days)
    ├─ calculateAdherence() (Scheduled core workout adherence; rest days excluded)
    ├─ calculateTrainingFrequency() (Rolling 28-day sessions/week)
    ├─ calculateStrengthTrend() (Median e1RM change across comparable lifts)
    └─ calculatePerformanceScore() (Multi-factor evaluation with declared windows)
    │
    ▼
Consumed by Dashboard, HistoryView, AnalyticsView, Calendar
```

### D. Cloud Synchronization & Conflict Resolution
```
Local Mutation (setExerciseDefinitions / setWorkouts / setLogs / setAppState)
    │
    ▼
syncDataBackground(uid)
    │
    ├─ 1. Purge offline deletions (delete doc; remove from gl_deleted_ids_${uid})
    ├─ 2. Fetch cloud collections (getDocs)
    ├─ 3. Filter cloud docs against active tombstones (prevent resurrection)
    ├─ 4. Deterministic Merge:
    │     - If local.updatedAt > cloud.updatedAt → local wins (upload to cloud)
    │     - If cloud.updatedAt >= local.updatedAt → cloud wins (apply to local)
    │     - If deleted in tombstone → tombstone wins (purge from cloud)
    └─ 5. Batch writes executed (commitBatchOperations, <= 400 operations)
```
- **Concurrency Rule**: If a sync request arrives while `isSyncingRef.current` is true, `syncQueuedRef.current = true`. Exactly one follow-up sync runs after the current sync finishes.

### E. Cycle Progression
```
appState.cycleStart (Anchor date YYYY-MM-DD) + targetDate
    │
    ▼
getCycleDay(cycleStart, targetDate) = ((differenceInCalendarDays(targetDate, cycleStart) % 8) + 8) % 8 + 1
    │
    ▼
Cycle Day (1-8):
  Day 1: PUSH A     Day 2: PULL A     Day 3: HYBRID A   Day 4: RECOVERY (Rest)
  Day 5: PUSH B     Day 6: PULL B     Day 7: HYBRID B   Day 8: RECOVERY (Rest)
```
- **Rules**:
  - Rest days (Days 4 and 8) naturally advance without requiring a completed session log.
  - Skipped days do not pause or freeze the cycle.
  - Bonus workouts (`isCore === false`) do not advance or alter `cycleStart`.

---

## 5. Testable Invariants

| # | Invariant Rule | Implementation Path | Verification Test Path | Status |
|---|---|---|---|---|
| 1 | **Single Completion Predicate**: A session is completed if and only if `isCompletedSession(log)` returns `true` (`log.complete === true`). Malformed flags (`completed`, `1`, `"true"`) evaluate to `false`. | `src/utils/fitnessCalculations.ts` | `src/test/dataSyncAndIsolationRegression.test.ts`, `src/test/canonicalFitnessPipeline.test.ts` | **ENFORCED** |
| 2 | **Incomplete Sessions Isolation**: Incomplete sessions contribute 0 to volume, PRs, completed sets, streaks, or completion metrics. | `src/utils/fitnessDerivedSelectors.ts` | `src/test/canonicalFitnessPipeline.test.ts`, `src/test/sessionDataContract.test.ts` | **ENFORCED** |
| 3 | **Active-Session Isolation**: In-progress edits in `useActiveSession` never enter `FitnessIndex` or historical metrics until persisted via `addLog()`. | `src/hooks/useActiveSession.ts`, `src/context/FitnessContext.tsx` | `src/test/sessionViewIdentity.test.ts` | **ENFORCED** |
| 4 | **Exercise Identity Integrity**: `exerciseDefinitionId` is the single canonical key. Orphaned or missing definitions resolve to `Unknown Exercise`, never crash, and never output raw UUIDs as names. | `src/utils/exerciseResolver.ts` | `src/test/canonicalDataContract.test.ts` | **ENFORCED** |
| 5 | **Sets Accounting Distinction**: `completedSetsByDate` strictly counts `done: true` sets from completed sessions. `plannedSetsByDate` counts programmed/logged set rows across all sessions. | `src/utils/fitnessDerivedSelectors.ts` | `src/test/canonicalFitnessPipeline.test.ts` | **ENFORCED** |
| 6 | **PR & e1RM Pipeline**: e1RM uses the standard Epley formula with a 30-rep cap. In Session Summary, a set that establishes both a weight PR and an e1RM PR counts as exactly 1 visible PR event. | `src/utils/fitnessCalculations.ts`, `src/components/SessionView.tsx` | `src/test/sessionPRRegression.test.ts` | **ENFORCED** |
| 7 | **Scheduled Core Adherence**: Adherence measures completion of the scheduled core workout for that cycle day. Bonus workouts do not satisfy core obligations; scheduled rest days do not enter the denominator. | `src/utils/trainingIntelligence.ts` | `src/test/analyticsAdherenceAndPerformanceScore.test.ts` | **ENFORCED** |
| 8 | **Natural Recovery Day Advancement**: Cycle day advances naturally from Day 3 to Day 4 (Recovery) and Day 4 to Day 5 without requiring a session log on recovery days. | `src/utils/fitnessCalculations.ts`, `src/utils/fitnessDerivedSelectors.ts` | `src/test/recoveryCycleAdvancement.test.ts` | **ENFORCED** |
| 9 | **Cross-Surface Consistency**: Equivalent metrics and time windows produce identical numbers across Dashboard, History, Analytics, and Calendar. | `src/context/FitnessDerivedContext.tsx` | `src/test/analyticsAdherenceAndPerformanceScore.test.ts`, `src/test/pipelineConsistencyRegression.test.ts` | **ENFORCED** |
| 10 | **Distinct Semantic Values for Data Availability**: Missing data, zero values, and unavailable metrics remain semantically distinct (`available: false` vs score `0`). | `src/utils/trainingIntelligence.ts` | `src/test/analyticsAdherenceAndPerformanceScore.test.ts` | **ENFORCED** |
| 11 | **Persistence Failure Safety**: If persistence throws, active workout state is retained in `gl_active_session`. Atomic writes use `gl_snapshot_staging` before committing `gl_database_snapshot`. | `src/hooks/useFitnessData.ts`, `src/components/SessionView.tsx` | `src/test/supportingCodeAudit.test.ts` | **ENFORCED** |
| 12 | **Account Isolation & Tombstone Scoping**: Tombstones are scoped to Firebase UID (`gl_deleted_ids_${uid}`). Logging out or switching accounts clears tombstones and isolates storage. | `src/utils/fitnessSyncHelpers.ts`, `src/hooks/useFitnessSync.ts` | `src/test/dataSyncAndIsolationRegression.test.ts`, `src/test/lifecycleDestructiveSyncBoundary.test.ts` | **ENFORCED** |
| 13 | **Token & Primitive Ownership**: Design tokens in `src/styles/tokens.ts` and primitives in `src/components/ui/` own presentation rules. Modals trap focus and restore scroll cleanly. | `src/styles/tokens.ts`, `src/components/ui/` | `src/test/statCardRegression.test.tsx`, `src/test/supportingCodeAudit.test.ts` | **ENFORCED** |
| 14 | **Performance Guarantees**: `buildFitnessIndex()` runs in linear time O(N), executing in <40 ms for 5,000 session logs. | `src/utils/fitnessDerivedSelectors.ts` | `src/test/performanceBenchmark.test.ts` | **ENFORCED** |

---

## 6. Architecture Change Protocol

Any engineer or AI coding agent modifying the codebase must treat a proposed modification as an **Architectural Change** if it:
1. Moves responsibility between modules (e.g. moving calculation logic into a UI component).
2. Adds or reverses an allowed dependency direction (e.g. importing UI components into calculations).
3. Modifies a canonical source of truth or changes data schemas.
4. Alters persistence, snapshot staging, sync retry, or conflict resolution behavior.
5. Modifies public interfaces of `FitnessContext` or `FitnessDerivedContext`.
6. Changes calculation semantics for volume, e1RM, streaks, adherence, or performance scores.
7. Weakens any of the 14 testable invariants above.

### Mandatory Stop-and-Report Gate

When an architectural change is requested or identified, the agent **MUST STOP IMMEDIATELY** before writing code and provide the following structured report:

```markdown
### ARCHITECTURAL CONFLICT REPORT
- **Conflict**: Description of the requested change and why it triggers this protocol.
- **Existing Documented Rule**: Exact section and invariant from ARCHITECTURE.md.
- **Code Evidence**: Specific file, line number, or interface implementing the current rule.
- **Reason for Conflict**: Why the requested change violates the existing architecture.
- **Smallest Compliant Alternative**: Localized change that satisfies user intent without violating architecture.
- **Broader Architectural Alternative**: Systemic change required if the architectural rule itself must evolve.
- **Affected Files & Systems**: Complete list of files impacted.
- **Decision Required**: Specific question requiring maintainer approval before proceeding.
```

---

## 7. References & Source Locations

- **Canonical Data Models**: `src/types/fitness.ts`
- **Initial Training Protocol & Workouts**: `src/types/initialData.ts`
- **Local Persistence & Migration**: `src/hooks/useFitnessData.ts`, `src/utils/fitnessMigration.ts`
- **Canonical Fitness Calculations**: `src/utils/fitnessCalculations.ts`
- **Derived Selectors & Indexing**: `src/utils/fitnessDerivedSelectors.ts`
- **Training Intelligence Algorithms**: `src/utils/trainingIntelligence.ts`
- **Exercise Identity Resolution**: `src/utils/exerciseResolver.ts`
- **Cloud Synchronization & Tombstones**: `src/hooks/useFitnessSync.ts`, `src/utils/fitnessSyncHelpers.ts`, `src/services/fitnessFirestore.ts`
- **Design Tokens & UI Primitives**: `src/styles/tokens.ts`, `src/components/ui/`
- **Security Specification**: `security_spec.md`
- **Firestore Security Rules**: `firestore.rules`
- **CI / Build Workflow**: `.github/workflows/ci.yml`
- **Android Release & Signing Configuration**: `android/app/build.gradle`
- **Performance Benchmark Test Suite**: `src/test/performanceBenchmark.test.ts`
