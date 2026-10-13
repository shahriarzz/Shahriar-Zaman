# DATA_MODEL.md — Canonical Entity Schemas & Storage Contract for GAINLOG

> **Target Repository**: [Shahriar-Zaman/gainlog](https://github.com/shahriarzz/Shahriar-Zaman)  
> **Status**: Active Domain Contract  
> **Source of Truth**: TypeScript definitions in `src/types/fitness.ts`, migrations in `src/utils/fitnessMigration.ts`, sanitization in `src/utils/fitnessCalculations.ts`.

---

## 1. Domain Entities & Canonical Interfaces

GAINLOG organizes training data around 6 primary domain entities, unified under `DatabaseSnapshot`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                           DatabaseSnapshot                             │
│                  (Unified Atomic Local Storage State)                  │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ exercises:        │ workouts:         │ logs:                          │
│ ExerciseDefinition[]│ Workout[]       │ SessionLog[]                   │
├───────────────────┴───────────────────┴────────────────────────────────┤
│ appState: AppState                                                     │
│ version: number (CURRENT_SCHEMA_VERSION = 2)                            │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 `ExerciseDefinition`
Defines an exercise in the user's library:
```typescript
interface ExerciseDefinition {
  id: string;               // Stable UUID or canonical key (e.g. 'bench_press')
  name: string;             // Display name (1-100 characters)
  category: ExerciseCategory; // 'push' | 'pull' | 'legs' | 'core' | 'cardio' | 'other'
  equipment?: EquipmentType;  // 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'
  notes?: string;           // Optional user notes (max 500 characters)
  isCustom?: boolean;       // True if created by user; false for initial canonical definitions
  createdAt: string;        // ISO-8601 string (e.g. '2026-10-12T10:00:00.000Z')
  updatedAt: string;        // ISO-8601 string
}
```

### 1.2 `Workout`
Defines a template or routine within the training cycle:
```typescript
interface Workout {
  id: string;               // Stable UUID (e.g. 'push_a')
  name: string;             // Display name (e.g. 'Push A')
  type: WorkoutType;        // 'push' | 'pull' | 'hybrid' | 'recovery' | 'custom'
  isCore: boolean;          // True for canonical 8-day cycle workouts; false for bonus/custom sessions
  cycleDay?: number;        // Day in the 8-day cycle (1 through 8)
  exercises: WorkoutExercise[]; // Planned exercise prescriptions
  notes?: string;           // Optional workout notes (max 1000 characters)
  createdAt: string;        // ISO-8601 string
  updatedAt: string;        // ISO-8601 string
}

interface WorkoutExercise {
  id: string;               // Unique ID within workout template
  exerciseId: string;       // Foreign key referencing ExerciseDefinition.id
  targetSets: WorkoutSet[]; // Prescribed sets
  restSeconds?: number;     // Prescribed rest timer between sets (default: 90)
  notes?: string;           // Exercise-specific technique cues
}

interface WorkoutSet {
  setNumber: number;        // 1-indexed set ordinal (1, 2, 3...)
  targetReps: number;       // Prescribed rep count (integer 1-500)
  targetWeight?: number;    // Target load in kilograms (finite 0-1500)
  targetRpe?: number;       // Prescribed Rate of Perceived Exertion (1-10)
}
```

### 1.3 `SessionLog`
Represents an executed workout session:
```typescript
interface SessionLog {
  id: string;               // Stable UUID
  workoutId: string;        // Foreign key referencing Workout.id
  workoutName: string;      // Denormalized workout title at time of execution
  date: string;             // Workout date string ('YYYY-MM-DD')
  startTime?: string;       // ISO-8601 timestamp
  endTime?: string;         // ISO-8601 timestamp
  durationMinutes: number;  // Finite duration (>= 0)
  sets: SessionSet[];       // Executed sets
  complete: boolean;        // Strictly true if session was finished; false if abandoned/draft
  notes?: string;           // Post-workout reflection notes
  createdAt: string;        // ISO-8601 string
  updatedAt: string;        // ISO-8601 string
}

interface SessionSet {
  id: string;               // Unique set UUID
  exerciseId: string;       // Foreign key referencing ExerciseDefinition.id
  exerciseName?: string;    // Denormalized name snapshot
  setNumber: number;        // 1-indexed set ordinal
  reps: number;             // Actual reps performed (non-negative integer)
  weight: number;           // Actual load lifted in kilograms (finite number >= 0)
  rpe?: number;             // Perceived Exertion (1-10)
  done: boolean;            // Checkmark state in active session UI
  isWarmup?: boolean;       // Warmup sets excluded from volume and PR indexing
}
```

### 1.4 `AppState`
Tracks global configuration and cycle anchoring:
```typescript
interface AppState {
  cycleStart: string;       // ISO-8601 date string ('YYYY-MM-DD') anchoring Day 1 of the 8-day cycle
  theme?: 'dark' | 'light' | 'system'; // Active visual theme
  unit?: 'kg' | 'lbs';      // Display weight unit (calculations canonically in kg)
  restTimerSound?: boolean; // Audio alert toggle
  restTimerVibrate?: boolean; // Haptic alert toggle
  updatedAt: string;        // ISO-8601 string
}
```

### 1.5 `FitnessIndex`
The canonical in-memory index computed by `buildFitnessIndex()` from completed `SessionLog`s:
```typescript
interface FitnessIndex {
  exerciseMap: Map<string, ExerciseDefinition>; // Fast lookup by ID
  workoutMap: Map<string, Workout>;             // Fast lookup by ID
  logsByDate: Map<string, SessionLog[]>;        // Date-keyed lookup ('YYYY-MM-DD')
  exercisePRs: Map<string, {                     // Historical bests per exercise
    weightPR?: { weight: number; reps: number; date: string; logId: string };
    e1RMPR?: { e1RM: number; weight: number; reps: number; date: string; logId: string };
  }>;
  totalVolumeByExercise: Map<string, number>;   // Lifetime volume (weight * reps)
  lifetimeStats: {
    totalWorkouts: number;                      // Count of complete sessions
    totalSets: number;                          // Count of complete working sets
    totalVolumeKg: number;                      // Lifetime load
    activeStreakDays: number;                   // Consecutive active/rest cycle adherence
  };
}
```

---

## 2. Field Invariants & Biological Bounds

All inputs passing through API boundaries, JSON imports, or local state transitions are validated and sanitized via `src/utils/fitnessCalculations.ts`:

| Field / Attribute | Type | Valid Range / Bounds | Sanitization Fallback |
|---|---|---|---|
| **Weight** | `number` | `0 <= weight <= 1,500` (finite, non-NaN) | Clamped to bounds; `NaN`/negative becomes `0` |
| **Reps** | `number` | `0 <= reps <= 500` (integer only) | Clamped to bounds; rounded to integer (`Math.round`) |
| **Duration (minutes)** | `number` | `0 <= duration <= 1,440` (finite) | Non-finite or negative clamped to `0` |
| **RPE** | `number` | `1 <= rpe <= 10` (finite) | Omitted or clamped to `1-10` |
| **Date String** | `string` | `YYYY-MM-DD` (valid calendar date) | Fallback to current local date (`formatDate(new Date())`) |
| **String / Notes** | `string` | Exercise note: ≤ 500 chars<br>Workout note: ≤ 1,000 chars<br>Log note: ≤ 2,000 chars | Trimmed and sliced to length limits |
| **Session Completion** | `boolean` | Strictly `=== true` | Non-boolean truthy values coerced; strictly requires explicit finish |

---

## 3. Storage Key Registry & Two-Phase Durability

GAINLOG persists data in browser `localStorage` using a defensive two-phase staging mechanism:

```
                  Two-Phase Persistence Commit Flow
                  ──────────────────────────────────
1. Create New DatabaseSnapshot payload
                    │
                    ▼
2. Write to Staging Key: "gl_snapshot_staging"
                    │
                    ▼
3. Verify integrity (parse and validate JSON)
                    │
                    ├─► [Integrity Verified] ──► 4. Commit to: "gl_database_snapshot"
                    │                                   │
                    │                                   ▼
                    │                            5. Mirror legacy keys (backward compat)
                    │
                    └─► [Write/Parse Failed] ──► Rollback; preserve active session draft
```

### Storage Key Registry

| Storage Key | Lifecycle / Role | Contents | Invariant Protection |
|---|---|---|---|
| **`gl_database_snapshot`** | Primary Canonical Store | Full JSON `DatabaseSnapshot` (v2) | Single canonical state store (Invariant 1) |
| **`gl_snapshot_staging`** | Two-Phase Commit Buffer | Staged snapshot during write operations | Write verification before commit (Invariant 2) |
| **`gl_active_session`** | Active Draft Buffer | Current running workout draft | Recoverable on crash; cleared ONLY after verified snapshot commit |
| **`gl_deleted_ids_${uid}`** | Firestore Sync Tombstones | Array of `{ id, deletedAt, collection }` | Scoped per Firebase UID; prevents cloud resurrection (Invariant 12) |
| **`gl_corrupt_snapshot_backup`** | Quarantine Buffer | Corrupted payload isolated for forensics | Auto-recovery on load (Invariant 8) |
| **`gl_exercises`** (Legacy) | Read-Fallback Mirror | JSON array of `ExerciseDefinition` | Backward-compatibility mirror |
| **`gl_workouts`** (Legacy) | Read-Fallback Mirror | JSON array of `Workout` | Backward-compatibility mirror |
| **`gl_logs`** (Legacy) | Read-Fallback Mirror | JSON array of `SessionLog` | Backward-compatibility mirror |
| **`gl_app_state`** (Legacy) | Read-Fallback Mirror | JSON object of `AppState` | Backward-compatibility mirror |

---

## 4. Schema Versioning & Migration Rules

- **Current Version**: `CURRENT_SCHEMA_VERSION = 2` (defined in `src/utils/fitnessMigration.ts`).
- **Version 1**: Discrete local storage keys (`gl_exercises`, `gl_workouts`, `gl_logs`, `gl_app_state`).
- **Version 2**: Unified atomic snapshot (`gl_database_snapshot`).

### Migration Guarantees
1. **Hydration Detection**: On startup, `migrateToUnifiedSnapshot()` inspects `gl_database_snapshot`. If missing or version < 2, it automatically aggregates legacy keys into a v2 snapshot.
2. **Non-Destructive Staging**: The aggregated snapshot is staged to `gl_snapshot_staging`, validated, and committed to `gl_database_snapshot`. Legacy keys are preserved as read-fallbacks.
3. **Quarantine on Corruption**: If `gl_database_snapshot` cannot be parsed, it is quarantined to `gl_corrupt_snapshot_backup`, and the system attempts recovery from `gl_snapshot_staging` or legacy keys. If all fail, defaults from `src/types/initialData.ts` are initialized.
4. **Future Version Bumps**: Any schema version increment (e.g. v2 → v3) MUST provide an explicit upgrade transformer in `src/utils/fitnessMigration.ts` with comprehensive round-trip tests in `src/test/persistenceBoundaries.test.ts`.

---

## 5. Cloud Firestore Data Model & Sync Contract

When authenticated via Firebase Auth, GAINLOG synchronizes state with Firestore:

### Document Hierarchy
All cloud documents are strictly isolated within the authenticated user's private subtree:
```
/users/{userId}/exercises/{exerciseId}
/users/{userId}/workouts/{workoutId}
/users/{userId}/logs/{logId}
/users/{userId}/appState/current
```

### Sync & Conflict Rules
1. **Batch Limit**: Writes and deletes are grouped into batches of ≤ 400 operations (staying well within the Firestore 500-operation ceiling).
2. **Conflict Resolution**: Deterministic timestamp comparison based on `updatedAt`:
   - If `cloud.updatedAt > local.updatedAt`: Cloud record replaces local.
   - If `local.updatedAt > cloud.updatedAt`: Local record uploaded to cloud.
   - If `local.updatedAt === cloud.updatedAt`: If content differs, **local wins** (offline lifter priority).
3. **Tombstone Propagation**: Deletions recorded in `gl_deleted_ids_${uid}` are dispatched to Firestore as deletes. Cloud documents deleted remotely are removed locally without resurrection.
4. **Sign-Out Isolation**: Signing out purges user tombstones and resets in-memory collections to defaults, preventing cross-tenant leakage on shared devices.

---

## 6. Backup & Restore Specification

The Data Management vault (`src/components/manage/DataMaintenanceSection.tsx`) supports JSON backup export and import:

### Backup JSON Payload Structure
```json
{
  "version": 2,
  "exportedAt": "2026-10-12T12:00:00.000Z",
  "data": {
    "exercises": [ ... ],
    "workouts": [ ... ],
    "logs": [ ... ],
    "appState": { ... }
  }
}
```

### Validation & Import Rules
1. **Payload Inspection**: The import validator checks for required keys (`data.exercises`, `data.workouts`, `data.logs`, `data.appState`).
2. **Biological Sanitization**: Every imported log and workout is passed through `validateAndSanitizeFitnessData()` to normalize numbers, dates, and types.
3. **Atomic Overwrite**: The sanitized payload is written via two-phase staging (`gl_snapshot_staging` → `gl_database_snapshot`).
4. **Active Session Preservation**: An ongoing workout session in `gl_active_session` is preserved during backup import unless explicitly overwritten.
