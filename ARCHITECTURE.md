# Canonical Fitness Architecture & Data Pipeline

## 1. Executive Summary & Design Principles

This application implements a strict, centralized single source of truth architecture designed for local-first execution, Firestore synchronization, and zero redundant computation.

### Core Principles
1. **Single Source of Truth**: All raw domain records (`exerciseDefinitions`, `workouts`, `logs`, `appState`) live exclusively in `FitnessContext`.
2. **One-Way Canonical Transformation Pipeline**:
   ```
   Raw Persistence (localStorage / Firestore)
              │
              ▼
   Migration & Schema Normalization (fitnessMigration.ts)
              │
              ▼
   Canonical Local State (FitnessContext.tsx)
              │
              ▼
   Derived Canonical Index (FitnessDerivedContext.tsx -> buildFitnessIndex)
              │
              ▼
   Pure Canonical Selectors (fitnessDerivedSelectors.ts)
              │
              ▼
   UI Tabs & Components (Dashboard, Session, History, Analytics, Manage)
   ```
3. **Strict Immutability & O(N) Single-Pass Indexing**: All historical calculations (volume, sets, PRs, streaks, muscle distribution, e1RM progression) are computed in a single pass in `buildFitnessIndex()` and memoized by dataset references (`logs`, `defsMap`).
4. **Transient Active Session Isolation**: Interactive set mutations (typing weight/reps, toggling done) during a workout live inside isolated transient state and NEVER trigger historical re-indexing until completion.
5. **Deterministic Resolution**: Exercise resolution uses canonical `ExerciseDefinition` UUIDs with graceful fallbacks for missing or deleted definitions (resolving to `"Unknown Exercise"`, never generic `"Exercise"`, and never crashing).

---

## 2. Pipeline Subsystems & Ownership

### 2.1 Persistence & Migration (`src/utils/fitnessMigration.ts`)
- **Ownership**: Loading, validating, repairing corrupted data, and migrating schema versions (V1 -> V2).
- **Storage Keys**:
  - `gl_schema_version`: Active schema version integer (`CURRENT_SCHEMA_VERSION = 2`).
  - `gl_exercise_definitions`: Canonical exercise definitions list.
  - `gl_workouts`: Canonical workout templates.
  - `gl_logs`: Historical workout completion records.
  - `gl_state`: Application state (`cycleStart`, `weightLog`, `updatedAt`).
  - `gl_active_session`: Active workout draft.
  - `gl_deleted_ids`: Tombstones for offline deletions.
- **Migration Invariant**: Legacy keys (`gl_exercises`, `gl_custom_exercises`) are migrated exactly once to `gl_exercise_definitions` with deduplication and ID mapping.

### 2.2 Domain State Management (`src/context/FitnessContext.tsx`)
- Orchestrates modular hooks:
  - `useFitnessData`: Base in-memory state and local persistence listeners.
  - `useFitnessSync`: Realtime Firestore synchronization, conflict resolution, and offline queuing.
  - `useFitnessExercises`: CRUD operations for exercise definitions.
  - `useFitnessWorkouts`: CRUD operations for workout templates.
  - `useFitnessLogs`: Log creation, deletion, cycle reset, and body weight logging.
  - `useActiveSession`: Transient workout state management.
  - `useFitnessBackups`: Automated rolling backups and manual JSON snapshot import/export.

### 2.3 Derived Canonical Index & Selectors (`src/utils/fitnessDerivedSelectors.ts` & `src/context/FitnessDerivedContext.tsx`)
- **`buildFitnessIndex(logs, defsMap)`**:
  - Produces `FitnessIndex`:
    - `sortedLogsDescending`: Chronologically ordered array of completed `SessionLog`s.
    - `exerciseIndex`: `Map<string, ExerciseIndexEntry>` containing per-exercise sessions, heaviest sets, best e1RM, and total volume.
    - `exerciseMetaById`: `Map<string, ResolvedExerciseMeta>` cached exercise identity.
    - `personalBests`: Sorted array of all-time PRs (prioritizing `Weight > Reps`).
    - `lifetimeStats`: Aggregated volume, set count, session count, and consecutive day streak.
    - `distinctDates`: Sorted unique training dates for streak analysis.
    - `volumeByDate`: O(1) date-to-volume map.
- **Pure Selectors**:
  - `selectLifetimeStats(index)`
  - `selectPersonalBests(index)`
  - `selectPersonalBestForExercise(index, exerciseId)`
  - `selectMuscleDistribution(index)`
  - `selectExerciseFrequency(index)`
  - `selectTimeRangeAnalytics(index, defsMap, workoutsMap, coreMap, range, cycleStart, active1RMId)`
  - `selectExercise1RMProgression(index, exerciseId)`

### 2.4 Synchronization & Offline Conflict Handling (`src/utils/fitnessSyncHelpers.ts`)
- **Conflict Resolution**: Per-record `updatedAt` timestamps with deterministic tie-breakers.
- **Tombstones**: Offline deletions tracked in `gl_deleted_ids` preventing resurrection upon reconnect.
- **Batching**: Firestore writes chunked to <= 400 operations per batch to satisfy cloud limits.

---

## 3. UI Tab Contracts

| Tab | Data Source | Rerender Triggers |
|---|---|---|
| **Dashboard** | `useDashboardData()` via `FitnessDerivedContext` | Changes to `logs`, `workouts`, or `cycleStart` |
| **Session** | `useActiveSession()` for active draft + `FitnessDerivedContext` for ghost PRs | Keystrokes mutate local transient state; Ghost PRs memoized on workout definition |
| **History** | `FitnessDerivedContext.sortedLogs` & `index.exerciseIndex` | Changes to `logs` or `exerciseDefinitions` |
| **Analytics** | `useAnalyticsData()` via `selectTimeRangeAnalytics(index)` | Time range selector or dataset changes |
| **Manage** | `FitnessContext` CRUD actions | User modifications to exercises or workouts |

---

## 4. Performance & Scalability Guarantees

1. **Benchmark Suite**: Verified via `src/test/performanceBenchmark.test.ts` across 100, 1,000, and 5,000 logs:
   - `buildFitnessIndex`: O(N) linear pass (~1-10 ms for 1,000 logs; <40 ms for 5,000 logs).
   - Selectors: O(1) or O(M) where M is the number of distinct exercises.
   - Session typing: O(1) transient mutation with 0 ms re-indexing overhead.
2. **List Rendering**: Stable keying across all tables, session cards, and exercise rows.
3. **No Redundant Scans**: No ad-hoc `Object.values(logs)` or `logs.filter` in UI components.

---

## 5. Rules for Future Modifications

1. **NEVER** bypass `buildFitnessIndex` to recalculate lifetime volume, PRs, or streaks in a UI component.
2. **NEVER** store transient session input in `logs` before user confirmation.
3. **ALWAYS** use `resolveExercise(id, defsMap)` or `index.exerciseMetaById.get(id)` for exercise identity.
4. **ALWAYS** run the full test suite (`npm test`) before shipping changes.
