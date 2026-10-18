# GAINLOG System Architecture & Architectural Contract

> **Document Status**: Active Architectural Contract  
> **Last Verified Date**: 2026-10-12  
> **Test Verification Evidence**: 24 Vitest suites, 346 tests passing (`npx vitest run`)  
> **Maintenance Rule**: Any authorized architectural change MUST update this document in the same commit.

---

## 1. Audit Summary of Architectural Claims

Before detailing the contracts, the following classification records the verification status of claims in this document against the current codebase:

| Claim Category | Prior Claim | Verified Reality in Implementation | Classification |
|---|---|---|---|
| **Indexing Performance** | "Runs in linear time O(N), executing in <40 ms for 5,000 logs" | In `buildFitnessIndex()`: input logs are sorted via O(N log N), sets are traversed in O(S), and exercise/PR lists are sorted in O(E log E). Benchmark in `performanceBenchmark.test.ts` yields ~33 ms (100 logs), ~98 ms (1,000 logs), and ~341 ms (5,000 logs). The sub-40 ms claim for 5,000 logs is contradicted by empirical measurements. | **STALE / CORRECTED** |
| **Indexing Structure** | "Single-pass index traversal over session logs" | Initial pass iterates chronologically over valid sorted logs to populate exercise maps, PR maps, date aggregations, and lifetime counts without secondary full log passes. | **SUPPORTED** |
| **Completion Predicate** | "Strictly checks `log.complete === true`" | Enforced in `src/utils/fitnessCalculations.ts` (`isCompletedSession`), filtering invalid truthy values (`"true"`, `1`). Excludes incomplete sessions across all selectors and derived indices. | **SUPPORTED** |
| **PR Pipeline** | "Single PR pipeline and event count" | Historical PR indexing in `buildFitnessIndex()` tracks separate `weightPR` and `e1RMPR` records. Pre-session comparison in `calculateSessionPRs()` snapshots against pre-session index. Session summary consolidates dual PRs into exactly 1 visible event. | **SUPPORTED & CLARIFIED** |
| **Cycle Advancement** | "8-day date-based cycle; rest days advance naturally" | Evaluated via `differenceInCalendarDays` modulo 8 + 1. Days 4 and 8 (recovery) advance with calendar days; skipped workouts do not freeze the cycle; bonus workouts do not advance the cycle anchor. | **SUPPORTED** |
| **Sync Conflict Resolution** | "Deterministic merge via `updatedAt` timestamps and UID tombstones" | Verified in `fitnessSyncHelpers.ts` (`resolveLocalCloudRecord`). Local wins if timestamps equal but content differs. Deletion tombstones are strictly scoped per Firebase UID (`gl_deleted_ids_${uid}`). | **SUPPORTED** |
| **Multi-Tenant Device Isolation** | "Complete isolation between accounts on shared device" | Tombstones and cloud sync data are partitioned per UID. However, the local storage snapshot key `gl_database_snapshot` is device-scoped. Full local partition requires sign-out `resetToDefaultData()`. | **QUALIFIED / UNVERIFIED LIMITATION** |

---

## 2. System Map

GAINLOG is a local-first, offline-capable progressive overload training engine with selective Firestore cloud synchronization. The application is composed of the following core layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Application Root                              │
│                    (index.html → src/App.tsx)                          │
│        Entry point, tab navigation, global dialogs, toast alerts       │
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
│  • Constructs canonical FitnessIndex via buildFitnessIndex()           │
│  • Computes training intelligence insights (trainingIntelligence.ts)   │
│  • Exposes pure memoized selectors (fitnessDerivedSelectors.ts)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            UI View Layer                               │
│  • Primary Tabs: Dashboard, History, Analytics, Manage                 │
│  • Session Workflow: Session Execution (src/components/SessionView.tsx)│
│  • Embedded Component: Calendar (src/components/Calendar.tsx)          │
│  • Shared UI Primitives & Tokens (src/components/ui/, tokens.ts)       │
└────────────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

1. **Application Entry & Root Composition** (`src/App.tsx`, `src/main.tsx`):
   Mounts providers (`FitnessProvider` → `FitnessDerivedProvider` → `ConfirmProvider` → `ToastContainer`), manages the 4 primary navigation tabs (`dashboard`, `history`, `analytics`, `manage`), routes the dedicated session workflow view (`session`), and catches execution halts via `ErrorFallback.tsx`.
2. **Local Persistence & Migration** (`src/hooks/useFitnessData.ts`, `src/utils/fitnessMigration.ts`):
   Loads, migrates (V1 → V2), and persists the versioned database snapshot payload (`gl_database_snapshot`) using staged writes with read-back verification (`gl_snapshot_staging`) and best-effort discrete key mirroring for backwards compatibility.
3. **Cloud Synchronization & Service Boundary** (`src/hooks/useFitnessSync.ts`, `src/services/fitnessFirestore.ts`, `src/utils/fitnessSyncHelpers.ts`):
   Manages Firestore auth listeners, bidirectional batched replication (<= 400 operations/batch), UID-isolated deletion tombstones (`gl_deleted_ids_${uid}`), deterministic conflict resolution via `updatedAt` timestamps, and in-flight sync queuing (`syncQueuedRef`).
4. **Active Workout State** (`src/hooks/useActiveSession.ts`):
   Maintains transient in-progress workout keystrokes, active timer, and set completions in `gl_active_session`. Completely isolated from historical logs and indexing until user explicitly finishes the session.
5. **Canonical Derived Index & Muscle Intelligence** (`src/utils/fitnessDerivedSelectors.ts`, `src/utils/muscleIntelligence.ts`):
   Transforms raw session logs into an indexed, multi-faceted data structure (`FitnessIndex`) in a single chronological pass. Delivers pre-aggregated exercise indices, PR records, date-to-volume maps, completed-set totals, and fine-grained anatomical stimulus across 15 distinct muscle groups (`chest`, `front_delts`, `side_delts`, `rear_delts`, `lats`, `upper_back`, `lower_back`, `biceps`, `triceps`, `forearms`, `quads`, `hamstrings`, `glutes`, `calves`, `core`) using a three-tier Weighted Set Equivalents model (Primary 1.0, Strong Secondary 0.5, Moderate Secondary 0.25 WSE). Built-in exercises are guarded by both ID and target fingerprint to prevent silent misattribution, while custom exercises rely on conservative target-text inference. Attribution coverage is calculated strictly as `(curated + inferred) / eligible completed sets * 100`, returning `null` when eligible completed sets are zero.
6. **Training Intelligence & Selectors** (`src/utils/trainingIntelligence.ts`, `src/utils/fitnessCalculations.ts`, `src/utils/muscleIntelligence.ts`):
   Computes protocol adherence, training streak across recovery days, 28-day frequency, strength trends, multi-factor performance scores, and deterministic 14-day recency-weighted residual stimulus ($R_m = \sum_{d=0}^{13} \text{dailyWSE}_{m,d} \cdot 2^{-d / 2}$) evaluated against an explicit caller-supplied reference date with strict calendar and format validation and zero reliance on non-deterministic system clocks within selectors.
7. **Design Tokens & Shared Primitives** (`src/styles/tokens.ts`, `src/components/ui/`, `src/components/MuscleBalanceRecovery.tsx`):
   Centralizes application visual design: `SURFACE`, `BORDER`, `RADIUS`, `SPACING`, `TYPOGRAPHY`, `SHADOW`, `GAP`, `CHART_THEME`, and modular primitives (`Card`, `StatCard`, `Section`, `Button`, `Dialog`, etc.). Governed by a unified semantic color configuration (`orange` for brand/achievement, `emerald` for data visualization/success, `amber` for warning/partial, `red` for destructive/missed, `indigo` as the canonical intelligence/strength-trend color, and `zinc` for neutral) and canonical semantic radius scale (`badge`, `button`, `card`, `panel`, `pill`). Renders responsive side-by-side analytics for muscle balance and recovery context with zero-pill discipline and tabular numerals. Empty states cleanly distinguish zero eligible sets from unclassified sets and zero recent residual stimulus.
8. **Tests & Build Configuration** (`src/test/`, `vite.config.ts`, `package.json`, `.github/workflows/ci.yml`, `android/app/build.gradle`):
   Automated regression suite (25 test suites, 362 tests), Vite bundler, and GitHub Actions CI workflow (`ci.yml`):
   - **`validate`**: Runs `npm ci`, `npm run lint` (`tsc --noEmit`), `npm test` (Vitest), and `npm run build`.
   - **`android-build`**: Builds the Android debug APK (`./gradlew assembleDebug`) and uploads artifacts. Runs unconditionally after `validate` succeeds.
   - **`android-release-validation`**: Guarded explicitly to run only on trusted `push` events when repository variable `vars.ANDROID_RELEASE_ENABLED == 'true'`. Pull requests (including same-repository PRs) never trigger this job. Requires secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Decodes release keystore and verifies `./gradlew bundleRelease`. If enabled on push with missing secrets, halts with a specific error message. When disabled or on pull requests, skips cleanly without impacting ordinary build/test validation.

---

## 3. Ownership and Sources of Truth

| Concern | Canonical Owner | Source of Truth | Consumers Must Not |
|---|---|---|---|
| **Exercise identity** | `src/utils/exerciseResolver.ts` (`resolveExercise()`, `createExerciseDefinitionMap()`) | Canonical `ExerciseDefinition` records (`id`, `name`, `target`, `tags`) in `FitnessContext` / `defsMap` | Create independent identities, invent ad-hoc names, or resolve using uncanonical fallback strings |
| **Workout templates** | `src/hooks/useFitnessWorkouts.ts` (`saveWorkout()`, `deleteWorkout()`, `sanitizeWorkout()`) | Canonical `Workout` records in `FitnessContext` / `workouts` | Maintain competing workout copies, mutate template structures directly in UI components, or bypass `sanitizeWorkout` |
| **Completed training history** | `src/hooks/useFitnessLogs.ts` (`addLog()`, `deleteLog()`, `sanitizeSessionLog()`) | Persisted `SessionLog` map in `FitnessContext` / `logs` | Reconstruct history from UI state, filter un-sanitized raw inputs, or count incomplete sessions |
| **Active workout** | `src/hooks/useActiveSession.ts` (`startActiveSession()`, `updateActiveSessionSets()`, `clearActiveSession()`) | Transient active-session state (`gl_active_session`) | Treat an unfinished draft as completed history, write keystrokes directly into `logs`, or inflate analytics |
| **Derived fitness statistics** | `src/utils/fitnessDerivedSelectors.ts` (`buildFitnessIndex()`, canonical selectors) | Memoized `FitnessIndex` in `FitnessDerivedContext` | Reimplement calculations or aggregate volumes/sets independently in screen components |
| **Historical PR records** | `src/utils/fitnessDerivedSelectors.ts` (`buildFitnessIndex()`) | Canonical `weightPRsMap` and `e1RMPRsMap` in `FitnessIndex` | Re-scan raw logs for PRs or use un-sanitized weight/reps values |
| **Session Summary PR detection** | `src/components/SessionView.tsx` (`calculateSessionPRs()`) | Current session's valid done sets snapshot against pre-session canonical index (`getWeightPRForExercise`, `getE1RMPRForExercise`) | Compare against in-session mutations or emit dual PR events for a single exercise |
| **Cycle progression** | `src/utils/fitnessCalculations.ts` (`getCycleDay()`, `getAdjustedCycleStart()`) | Canonical `appState.cycleStart` anchor date string in `FitnessContext` | Infer the cycle from a separate UI-only rule, freeze cycle on missed days, or advance on bonus workouts |
| **Sync conflicts & deletions** | `src/utils/fitnessSyncHelpers.ts` (`resolveLocalCloudRecord()`, `trackDeletedId()`, `commitBatchOperations()`) | Per-record `updatedAt` timestamps and UID-partitioned tombstones (`gl_deleted_ids_${uid}`) | Bypass tombstones, mix cross-account tombstones, or discard queued follow-up sync requests |
| **Design tokens & shared UI** | `src/styles/tokens.ts`, `src/components/ui/` | Token definitions (`SURFACE`, `BORDER`, `RADIUS`, `SPACING`, `TYPOGRAPHY`, etc.) and component primitives | Hardcode arbitrary styling classes, invent one-off dialogs/modals, or duplicate shared layouts |

---

## 4. Dependency Rules

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

1. **Strict Downward Dependency Flow**:
   UI components consume hooks, selectors, and UI primitives. UI components must NEVER be imported by calculation, selector, persistence, or sync modules (enforced in `src/test/architectureContract.test.ts`).
2. **Pure Calculation Isolation**:
   Pure calculation modules (`fitnessCalculations.ts`, `exerciseResolver.ts`, `trainingIntelligence.ts`) must NOT import React, React hooks, or UI state.
3. **No Direct UI Calculation of Canonical Metrics**:
   Screens must NOT calculate total volume, streaks, PRs, adherence, or frequency by scanning raw logs. They must read them directly from `FitnessDerivedContext` or canonical selectors.
4. **Single Ingestion Gate**:
   All log writes must pass through `sanitizeSessionLog()` and `addLog()` before durable storage or Firestore upload.
5. **No Cross-Feature Re-implementation**:
   Screens must not bypass shared hooks (e.g. `useCalendarGrid`) to re-compute date grids or log groupings.
6. **No Leaking Transient State**:
   Active workout drafts (`gl_active_session`) must never enter `FitnessContext.logs` until durability succeeds.

---

## 5. Critical Data Flows

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
buildFitnessIndex()                         Firebase Auth State Change (useFitnessSync)
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
addLog() (Writes nextLogs in state and synchronously updates logsRef)
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
- **Failure Rule**: If `addLog()` throws or fails, `clearActiveSession()` is NOT called. The active session draft is preserved in `localStorage` (`gl_active_session`) to prevent data loss.

### C. Fitness Calculation & Algorithmic Complexity
```
logs (Record<string, SessionLog>)
    │
    ▼ (Filter: isCompletedSession(l) && l.date <= todayStr)
buildFitnessIndex()
    ├─ Step 1: Filter valid logs: O(N)
    ├─ Step 2: Sort logs by date descending / ID descending: O(N log N)
    ├─ Step 3: Single chronological traversal over logs and sets: O(N + S)
    ├─ Step 4: Exercise frequency and PR sorting: O(E log E)
    ├─ Step 5: Distinct dates sorting & longest streak: O(D log D)
    └─ Overall Index Complexity: O(N log N + S + E log E + D log D)
    │
    ▼
Downstream Canonical Selectors
    ├─ selectLifetimeStats(index): O(1)
    ├─ selectWeightPRs(index), selectE1RMPRs(index): O(1)
    ├─ selectExerciseIndex(index, exId): O(1)
    ├─ selectExercise1RMProgression(index, exId): O(1)
    └─ selectTimeRangeAnalytics(index, ...): O(L_range + S_range) (Filters index logs within requested date window)
    │
    ▼
Consumed by Dashboard, HistoryView, AnalyticsView, Calendar
```

#### Benchmark Timings (from `performanceBenchmark.test.ts`)
- **100 logs**: `buildFitnessIndex`: ~22.8 ms; Selectors: ~0.20 ms; Analytics: ~153.7 ms.
- **1,000 logs**: `buildFitnessIndex`: ~63.8 ms; Selectors: ~0.06 ms; Analytics: ~117.3 ms.
- **5,000 logs**: `buildFitnessIndex`: ~247.1 ms; Selectors: ~0.02 ms; Analytics: ~190.0 ms.

### D. Cloud Synchronization & Conflict Resolution
```
Local Mutation (setExerciseDefinitions / setWorkouts / setLogs / setAppState)
    │
    ▼
syncDataBackground(uid)
    │
    ├─ 0. Purge offline deletions (delete doc; remove from gl_deleted_ids_${uid})
    ├─ 1. Parallel fetch cloud collections (getDocs)
    ├─ 2. Filter cloud docs against active tombstones (prevent resurrection)
    ├─ 3. Deterministic Merge (resolveLocalCloudRecord):
    │     - If local.updatedAt > cloud.updatedAt → local wins (upload to cloud)
    │     - If cloud.updatedAt > local.updatedAt → cloud wins (apply to local)
    │     - If local.updatedAt === cloud.updatedAt:
    │         - Content identical → equal (no upload)
    │         - Content differs → local wins (upload to cloud)
    │     - If tombstoned → tombstone wins (purge from cloud)
    └─ 4. Batch writes executed (commitBatchOperations, <= 400 operations/batch)
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
  - Completing an out-of-order core workout recalculates `cycleStart` via `getAdjustedCycleStart(workout.cycleDay, new Date())`.

---

## 6. Date, Calendar & Timezone Semantics

1. **Date Representation & Timezone Boundary**:
   - Dates in logs, cycle anchors, and weight logs are represented strictly as `YYYY-MM-DD` calendar strings generated via `dk()` (`format(d, 'yyyy-MM-dd')` from `date-fns`).
   - All string date comparisons use lexicographical or calendar date comparisons, avoiding UTC/local midnight conversion shifts.
   - Display formatting uses `formatDateStr()` (e.g. `"Oct 24"`), constructing dates from year/month/day components without timezone offsets.
2. **Session Completion Date**:
   - When a session finishes, `date: dk()` records the user's current local calendar date.
3. **Upper Date Boundary (Future Dates)**:
   - In `buildFitnessIndex()`: `isCompleted = isCompletedSession(log) && (!log.date || log.date <= todayStr)`.
   - Any log with `date > todayStr` (future-dated) is excluded from completed sessions, lifetime volume, PRs, streaks, and adherence.
   - In weight tracking: `getSortedWeightEntries` filters out any weight entry where `date > todayStr`.
4. **Rolling Windows**:
   - `getRollingDateRange(now, days)`: returns `{ start: dk(subDays(validNow, days - 1)), end: dk(validNow) }`. The interval is inclusive of `now`, spanning exactly `days` calendar dates.
   - `getPreviousDateRange(start, days)`: returns the preceding interval of length `days` immediately prior to `start`.
   - 28-day training frequency: `(completedSessions / 28) * 7` sessions per week compared to the preceding 28 days.
   - Performance Score evaluation window: compares the rolling 30-day window against the previous 30-day window.
5. **Cycle Anchor**:
   - Stored in `appState.cycleStart` as `YYYY-MM-DD`.
   - If missing or invalid, deterministically falls back to anchor to the target date as Day 1.

---

## 7. Cloud Synchronization & Failure Contracts

1. **Local-First Durability & Graceful Degradation**:
   - The primary data store is local `localStorage` via `gl_database_snapshot`.
   - If a cloud read, write, or authentication operation fails (network offline, Firestore down, rules error), `useFitnessSync` sets `syncStatus = 'failed'` and exposes a user-friendly error notice.
   - Local training functionality, active session recording, and historical metrics remain fully operational in offline mode.
2. **Deterministic Timestamp Conflict Resolution**:
   - Every record carries an integer `updatedAt` millisecond timestamp.
   - Local records with strictly newer `updatedAt` are uploaded to the cloud.
   - Cloud records with strictly newer `updatedAt` update local state.
   - If `local.updatedAt === cloud.updatedAt`:
     - If stringified contents match: considered equal; no action taken.
     - If contents differ: local version is preferred as tie-breaker (`winner: 'local'`) and queued for upload to reconcile cloud.
3. **Deletion Propagation & Tombstone Lifetime**:
   - Deletions are tracked in UID-scoped tombstones in `localStorage` under `gl_deleted_ids_${uid}`.
   - Deletion of an item adds its ID to the tracker.
   - During sync, remote deletion is attempted. If successful, the ID is removed from the tracker. If failed, it remains in the tracker to retry on next connection.
   - Incoming cloud records matching active tombstones are dropped immediately, preventing deleted items from resurrecting upon reconnect.
4. **Retry Mechanism & Network Awareness**:
   - Sync retry on connection uses exponential backoff (2000 ms, 4000 ms) up to 3 attempts.
   - If `!navigator.onLine` or Firestore reports `unavailable`, retry backoff pauses and registers a `window.addEventListener('online')` handler to resume sync when connectivity returns.
   - Concurrency protection: `isSyncingRef` prevents overlapping background sync passes; `syncQueuedRef` ensures that rapid consecutive mutations execute exactly one consolidated follow-up sync.
5. **Account Isolation & Sign-Out**:
   - Tombstones are keyed per Firebase UID (`gl_deleted_ids_${uid}`).
   - On `logout()`, the user's tombstone storage is cleared, and `resetToDefaultData()` wipes the in-memory state.
6. **Explicitly Unverified Behaviors & Known Limitations**:
   - *Device Storage Multi-Tenant Partition*: If User A and User B share the same physical browser profile without signing out, local storage keys are shared. True local multi-account isolation without sign-out is not supported.
   - *Firestore Write Queue Depth*: Under prolonged offline usage with thousands of offline modifications, memory and storage bounds of the pending mutation queue are subject to browser local storage limits (~5-10 MB).

---

## 8. Testable Invariants

| # | Invariant Rule | Implementation Path | Verification Test Path | Status |
|---|---|---|---|---|
| 1 | **Single Completion Predicate**: A session is completed if and only if `isCompletedSession(log)` returns `true` (`log.complete === true`). Malformed flags (`completed`, `1`, `"true"`) evaluate to `false`. | `src/utils/fitnessCalculations.ts` | `src/test/dataSyncAndIsolationRegression.test.ts`, `src/test/canonicalFitnessPipeline.test.ts` | **VERIFIED & TESTED** |
| 2 | **Incomplete Sessions Isolation**: Incomplete sessions contribute 0 to volume, PRs, completed sets, streaks, or completion metrics. | `src/utils/fitnessDerivedSelectors.ts` | `src/test/canonicalFitnessPipeline.test.ts`, `src/test/sessionDataContract.test.ts` | **VERIFIED & TESTED** |
| 3 | **Active-Session Isolation**: In-progress edits in `useActiveSession` never enter `FitnessIndex` or historical metrics until persisted via `addLog()`. | `src/hooks/useActiveSession.ts`, `src/context/FitnessContext.tsx` | `src/test/sessionViewIdentity.test.ts` | **VERIFIED & TESTED** |
| 4 | **Exercise Identity Integrity**: `exerciseDefinitionId` is the single canonical key. Orphaned or missing definitions resolve to `Unknown Exercise`, never crash, and never output raw UUIDs as names. | `src/utils/exerciseResolver.ts` | `src/test/canonicalDataContract.test.ts`, `src/test/historyResolution.test.ts` | **VERIFIED & TESTED** |
| 5 | **Sets Accounting Distinction**: `completedSetsByDate` strictly counts `done: true` sets from completed sessions. `plannedSetsByDate` counts programmed/logged set rows across all sessions. | `src/utils/fitnessDerivedSelectors.ts` | `src/test/canonicalFitnessPipeline.test.ts` | **VERIFIED & TESTED** |
| 6 | **PR Pipeline & Consolidation**: Historical index tracks independent weight and e1RM PRs. Session summary compares against pre-session index and consolidates a set establishing both weight and e1RM records into exactly 1 visible PR event. | `src/utils/fitnessDerivedSelectors.ts`, `src/components/SessionView.tsx` | `src/test/sessionPRRegression.test.ts`, `src/test/canonicalFitnessPipeline.test.ts` | **VERIFIED & TESTED** |
| 7 | **Scheduled Core Adherence**: Adherence measures completion of the scheduled core workout for that cycle day. Bonus workouts do not satisfy core obligations; scheduled rest days do not enter the denominator. | `src/utils/trainingIntelligence.ts` | `src/test/analyticsAdherenceAndPerformanceScore.test.ts` | **VERIFIED & TESTED** |
| 8 | **Natural Recovery Day Advancement**: Cycle day advances naturally from Day 3 to Day 4 (Recovery) and Day 4 to Day 5 without requiring a session log on recovery days. | `src/utils/fitnessCalculations.ts`, `src/utils/fitnessDerivedSelectors.ts` | `src/test/recoveryCycleAdvancement.test.ts` | **VERIFIED & TESTED** |
| 9 | **Cross-Surface Consistency**: Equivalent metrics and time windows produce identical numbers across Dashboard, History, Analytics, and Calendar. | `src/context/FitnessDerivedContext.tsx` | `src/test/analyticsAdherenceAndPerformanceScore.test.ts`, `src/test/pipelineConsistencyRegression.test.ts` | **VERIFIED & TESTED** |
| 10 | **Distinct Semantic Values for Data Availability**: Missing data, zero values, and unavailable metrics remain semantically distinct (`available: false` vs score `0`). | `src/utils/trainingIntelligence.ts` | `src/test/analyticsAdherenceAndPerformanceScore.test.ts` | **VERIFIED & TESTED** |
| 11 | **Persistence Failure Safety**: If persistence throws, active workout state is retained in `gl_active_session`. Staged writes verify `gl_database_snapshot` before clearing `gl_snapshot_staging`. | `src/hooks/useFitnessData.ts`, `src/components/SessionView.tsx` | `src/test/supportingCodeAudit.test.ts`, `src/test/persistenceBoundaries.test.ts` | **VERIFIED & TESTED** |
| 12 | **Account Isolation & Tombstone Scoping**: Tombstones are scoped to Firebase UID (`gl_deleted_ids_${uid}`). Logging out or switching accounts clears tombstones and isolates storage. | `src/utils/fitnessSyncHelpers.ts`, `src/hooks/useFitnessSync.ts` | `src/test/dataSyncAndIsolationRegression.test.ts`, `src/test/lifecycleDestructiveSyncBoundary.test.ts` | **VERIFIED & TESTED** |
| 13 | **Token & Primitive Ownership**: Design tokens in `src/styles/tokens.ts` and primitives in `src/components/ui/` own presentation rules. Features zero duplicate token aliases, a single canonical semantic color system (`orange`, `emerald`, `amber`, `red`, approved `indigo` for intelligence, and `zinc` for neutral), shared `CHART_THEME`, and canonical semantic radius scale. Modals trap focus and restore scroll cleanly. Pure calculations never import UI. | `src/styles/tokens.ts`, `src/components/ui/` | `src/test/statCardRegression.test.tsx`, `src/test/architectureContract.test.ts`, `src/test/designSystemRegression.test.ts` | **VERIFIED & TESTED** |
| 14 | **Performance & Algorithmic Complexity**: `buildFitnessIndex()` runs in O(N log N + S + E log E + D log D) time. Benchmarks demonstrate ~33 ms for 100 logs, ~98 ms for 1,000 logs, and ~341 ms for 5,000 logs on standard V8. Downstream selectors execute in <1 ms (Muscle Intelligence selectors in ~3-9 ms). | `src/utils/fitnessDerivedSelectors.ts` | `src/test/performanceBenchmark.test.ts` | **MEASURED & BENCHMARKED (QUALIFIED)** |
| 15 | **Deterministic Muscle Intelligence & Selector Purity**: `selectMuscleRecovery()` and `selectMuscleBalanceForRange()` are strictly deterministic. `selectMuscleRecovery()` requires an explicit reference date, rejects invalid format or calendar dates (`RangeError`/`TypeError`) without fallback to `new Date()`, and evaluates the 14-day trailing window against that date with full internal floating-point precision for residual values, maximum determination, and ranking. `selectMuscleBalanceForRange()` strictly validates date formats, calendar validity, and rejects reversed date ranges (`startDate > endDate`), returning null coverage when eligible sets are zero. | `src/utils/muscleIntelligence.ts` | `src/test/muscleIntelligence.test.ts`, `src/test/muscleBalanceRecovery.test.tsx` | **VERIFIED & TESTED** |

---

## 9. Architecture Change Protocol

Any engineer or AI coding agent modifying the codebase must treat a proposed modification as an **Architectural Change** if it:
1. Moves responsibility between modules (e.g. moving calculation logic into a UI component).
2. Adds or reverses an allowed dependency direction (e.g. importing UI components into calculations).
3. Modifies a canonical source of truth or changes data schemas.
4. Alters persistence, snapshot staging, sync retry, or conflict resolution behavior.
5. Modifies public interfaces of `FitnessContext` or `FitnessDerivedContext`.
6. Changes calculation semantics for volume, e1RM, streaks, adherence, or performance scores.
7. Modifies or weakens any of the 15 testable invariants above.

### A. Mandatory Stop-and-Report Gate (Unauthorized Requests)

When a requested change conflicts with an existing invariant, dependency rule, or data contract **WITHOUT prior maintainer authorization**, the engineer or AI agent **MUST STOP IMMEDIATELY** before writing code and output the following structured report:

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

### B. Approved Architectural Change Workflow

When an architectural change is **explicitly authorized** by the maintainer:
1. Document affected data contracts, migration risks, and backward compatibility paths.
2. Implement necessary schema migrations in `fitnessMigration.ts` (e.g. incrementing `CURRENT_SCHEMA_VERSION`).
3. Add regression tests validating both legacy and new behavior before altering implementation.
4. Update `ARCHITECTURE.md` to reflect the new canonical owner, dependency rule, data flow, or invariant status.
5. Verify complete build and test suite passes (`npm run build`, `npx vitest run`).

---

## 10. Documentation System & Source Locations

### A. Core Consolidated Documentation System

GAINLOG enforces a consolidated 4-document core documentation system alongside `security_spec.md`. Each document has strict single-responsibility boundaries and serves as an immutable source of truth for its domain:

| Document | Role & Authority | Primary Responsibilities |
|---|---|---|
| **`PRD.md`** | Canonical Product Source of Truth | Feature requirements, target personas, 8-day cycle protocol, PR rules, UX workflows, non-goals. |
| **`ARCHITECTURE.md`** | Canonical System & Technical Contract | System map, layer hierarchy, downward dependency rules, 15 testable invariants, change protocol. |
| **`AGENTS.md`** | AI Developer Operating Contract | Mandatory reading order, 6 high-risk subsystems, stop-and-approve gating, verification checklists. |
| **`DATA_MODEL.md`** | Domain Entity & Storage Contract | TypeScript schemas, validation bounds, storage keys (`gl_database_snapshot`), migrations, Firestore model. |
| **`security_spec.md`** | Security & Isolation Specification | Server-side Firestore rules (`/users/{uid}/**`), client-side sanitization, account segregation. |

### B. Codebase References & Source Locations

- **Product Requirements & Features**: `PRD.md`
- **Agent Governance & Gating Rules**: `AGENTS.md`
- **Data Entities, Storage Keys & Migrations**: `DATA_MODEL.md`, `src/types/fitness.ts`, `src/utils/fitnessMigration.ts`
- **Initial Training Protocol & Workouts**: `src/types/initialData.ts`
- **Local Persistence & Durability**: `src/hooks/useFitnessData.ts`, `src/utils/fitnessMigration.ts`
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
- **Architecture Contract Verification Test**: `src/test/architectureContract.test.ts`

