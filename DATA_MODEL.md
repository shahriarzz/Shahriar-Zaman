# DATA_MODEL.md — Canonical Entity Schemas & Storage Contract for GAINLOG

> **Target Repository**: [Shahriar-Zaman/gainlog](https://github.com/shahriarzz/Shahriar-Zaman)  
> **Status**: Active Domain Contract  
> **Authority**: TypeScript definitions in `src/types/fitness.ts`, migrations in `src/utils/fitnessMigration.ts`, sanitization in `src/utils/fitnessCalculations.ts`, local persistence in `src/hooks/useFitnessData.ts`, and cloud sync in `src/services/fitnessFirestore.ts`.

---

## 1. Domain Entities & TypeScript Schemas

The canonical source of truth for all domain entities is `src/types/fitness.ts`.

### 1.1 `WorkoutType`
Canonical enumeration of supported workout categories:
```typescript
export type WorkoutType = 
  | 'push' 
  | 'pull' 
  | 'hybrid' 
  | 'rest' 
  | 'date' 
  | 'upper' 
  | 'lower' 
  | 'custom';
```

---

### 1.2 `ExerciseDefinition`
Defines an exercise in the user's library:
```typescript
export interface ExerciseDefinition {
  id: string;               // Unique exercise identifier (e.g. 'ex-1', UUID, or canonical slug)
  name: string;             // Display name (e.g. 'Barbell Bench Press')
  target: string;           // Target muscle or group (e.g. 'Chest', 'Triceps', 'General')
  equipment?: string;       // Equipment type (e.g. 'Barbell', 'Dumbbell', 'Cable', 'Bodyweight')
  instructions?: string;    // Technique notes or setup cues
  tags?: string[];          // Categorization tags (e.g. ['compound', 'push'])
  updatedAt?: number;       // Epoch milliseconds timestamp (e.g. 1776000000000)
}
```

---

### 1.3 `WorkoutExercise`
Prescribes an exercise within a `Workout` template:
```typescript
export interface WorkoutExercise {
  exerciseDefinitionId: string; // Foreign key referencing ExerciseDefinition.id
  sets: number;                 // Planned working sets (integer, 1–50, default: 3)
  reps: string;                 // Planned rep range target (string, e.g. '8–10', '10–12')
  rest?: string;                // Planned rest interval (e.g. '90s', '2m')
  note?: string;                // Specific execution notes
  tags?: string[];              // Optional exercise tags
}
```

*Note*: The component helper type `Exercise` is defined as:
```typescript
export type Exercise = ExerciseDefinition & WorkoutExercise & { id: string };
```

---

### 1.4 `CardioFinisher`
Optional cardio finisher attached to a workout template:
```typescript
export interface CardioFinisher {
  name: string;     // Cardio movement name (e.g. 'Incline Treadmill Walk')
  detail: string;   // Intensity or parameters (e.g. '12% incline, 3.5 mph')
  duration: string; // Duration description (e.g. '15 mins')
}
```

---

### 1.5 `Workout`
Defines a workout routine template:
```typescript
export interface Workout {
  id: string;                       // Unique workout identifier (e.g. 'push_a')
  name: string;                     // Routine title (e.g. 'Push A — Chest & Triceps')
  badge: string;                    // Short badge label (e.g. 'PUSH', 'CORE')
  type: WorkoutType;                // Workout classification
  exercises: WorkoutExercise[];     // Array of planned exercise prescriptions
  cardio?: CardioFinisher | null;   // Optional cardio finisher prescription
  cycleDay?: number | null;         // Day in the 8-day cycle (integer 1–8, or null for non-cycle routines)
  isCore?: boolean;                 // True for primary 8-day cycle workouts; false for bonus/custom workouts
  restNotes?: string[];             // Active recovery notes for rest/recovery days
  updatedAt?: number;               // Epoch milliseconds timestamp
}
```
*Validation Boundary*: Core workouts (`isCore: true`) are validated via `buildValidatedCoreWorkoutMap()`: requires integer `cycleDay` (1–8), rejects duplicates without silent overwrites, excludes bonus routines (`isCore: false`), guarantees deterministic fallback to initial core routines if any day is missing or corrupted, and surfaces malformed or conflicting core workouts for user repair in `CycleEditor`.

---

### 1.6 `SetLog`
Represents an executed set within a session:
```typescript
export interface SetLog {
  id: string;       // Unique set identifier (deterministic e.g. 'set_0', 'exDefId_set_0')
  weight: string;   // Actual load lifted as numeric string (e.g. '80', '82.5', or '' if blank)
  reps: string;     // Repetitions performed as integer string (e.g. '8', or '' if blank)
  done: boolean;    // Completion checkbox status in active session
}
```
*Design Note*: Weights and reps are stored canonically as strings to preserve user input formatting (decimals, empty draft states) without premature zero-coercion.

---

### 1.7 `SessionLog`
Represents a recorded workout session:
```typescript
export interface SessionLog {
  id: string;                     // Unique session log identifier
  workoutId: string;              // Foreign key referencing Workout.id
  date: string;                   // Local workout calendar date string ('YYYY-MM-DD')
  sets: Record<string, SetLog[]>; // Map of exerciseDefinitionId -> array of completed/attempted SetLog entries
  complete: boolean;              // True if explicitly finished; false if abandoned/draft
  durationMinutes: number;        // Elapsed session duration in integer minutes (>= 0)
  updatedAt?: number;             // Epoch milliseconds timestamp
}
```

---

### 1.8 `AppState` & `WeightLogEntry`
Tracks global training configuration, cycle anchor, and body weight logs:
```typescript
export interface WeightLogEntry {
  weight: number;     // Body weight in kilograms (finite number)
  updatedAt: number;  // Epoch milliseconds timestamp
}

export interface AppState {
  cycleStart: string;                                   // Calendar date string ('YYYY-MM-DD') anchoring Day 1 of the 8-day cycle
  weightLog?: Record<string, number | WeightLogEntry>;  // Map of 'YYYY-MM-DD' -> kg number OR { weight, updatedAt }
  updatedAt?: number;                                   // Epoch milliseconds timestamp
}
```

---

### 1.9 `ActiveSession` (Draft Session State)
Maintained in `src/hooks/useActiveSession.ts` to persist in-progress workout state:
```typescript
export interface ActiveSession {
  workoutId: string;                      // Workout template being executed
  startTime: number;                      // Epoch milliseconds timestamp when workout started
  sessionSets: Record<string, SetLog[]>;  // Active draft sets per exerciseDefinitionId
}
```

---

### 1.10 Canonical `FitnessDatabase` vs Local Storage Wrapper

There is an important distinction between the canonical domain database structure and its local-storage persistence wrapper:

#### A. Canonical Domain / Export Payload (`FitnessDatabase`)
Defined in `src/types/fitness.ts`, used by JSON exports, imports, and checkpoint backups:
```typescript
export interface FitnessDatabase {
  schemaVersion: number;              // Current schema version = 2
  exportDate?: string;                // ISO-8601 string of export creation time
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;   // Keyed by SessionLog.id
  appState: AppState;
}
```

#### B. Local Storage Persistence Wrapper (`VersionedFitnessSnapshot`)
Defined in `src/hooks/useFitnessData.ts`, written to `gl_database_snapshot` and `gl_snapshot_staging`:
```typescript
export interface FitnessDatabaseSnapshot {
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
}

export interface VersionedFitnessSnapshot {
  schemaVersion: number;              // CURRENT_SCHEMA_VERSION = 2
  timestamp: number;                  // Epoch milliseconds from Date.now()
  data: FitnessDatabaseSnapshot;      // Inner domain snapshot
}
```
*Note*: `validateSnapshotStructure()` in `src/utils/fitnessMigration.ts` accommodates both the wrapped `{ schemaVersion, timestamp, data }` format and an unnested `{ schemaVersion, exerciseDefinitions, workouts, logs, appState }` object.

---

### 1.11 Derived Analytics Entities (`FitnessIndex` Extensions)

The canonical index constructed in memory by `buildFitnessIndex()` in `src/utils/fitnessDerivedSelectors.ts` includes fine-grained muscle intelligence and workload recovery structures. These entities are **purely derived in-memory data structures** extending `FitnessIndex`; they require **zero changes to raw log storage schema, Firestore sync payloads, or migration versions**.

#### A. 15 Canonical Anatomical Groups (`MuscleGroup`)
Defined in `src/utils/muscleIntelligence.ts`:
`'chest' | 'front_delts' | 'side_delts' | 'rear_delts' | 'lats' | 'upper_back' | 'lower_back' | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core'`

#### B. Three-Tier Involvement Roles & Weighted Set Equivalents (WSE)
- `primary`: 1.0 WSE
- `secondary_strong`: 0.5 WSE
- `secondary_moderate`: 0.25 WSE
- Minor / Stabilizer: 0.0 WSE (excluded from attribution)

#### C. Derived Index Fields
```typescript
export interface FitnessIndex {
  // Existing canonical index fields ...
  muscleStimulusByDate: Record<string, Record<MuscleGroup, number>>;
  muscleAttributionCoverageByDate: Record<string, AttributionCoverageCounts>;
  lifetimeLastTrainedDateByMuscle: Record<MuscleGroup, string | null>;
}

export interface AttributionCoverageCounts {
  curatedSets: number;
  inferredSets: number;
  unclassifiedSets: number;
  totalEligibleSets: number; // Denominator invariant: each completed set counted exactly once
}
```

---

## 2. Field Invariants & Sanitization Bounds

All inputs passing through JSON imports, network responses, and data mutations are validated via pure sanitization functions in `src/utils/fitnessCalculations.ts`:

### 2.1 Verified Sanitization Functions & Bounds

| Field / Attribute | Target Type | Valid Range / Parsing Rules | Sanitization Function | Fallback / Behavior |
|---|---|---|---|---|
| **Weight** | `string` (in `SetLog`) | `0 <= weight <= 5,000` (numeric string or finite number, regex `/^\d+(\.\d+)?$/`) | `parseStrictWeight()` | Rejects negative, non-numeric (e.g. `'12abc'`), and `> 5,000`. Sets invalid values to `''`. |
| **Reps** | `string` (in `SetLog`) | `0 <= reps <= 1,000` (integer only, regex `/^\d+$/`) | `parseStrictReps()` | Rejects decimals (e.g. `'5.5'`), negative, and non-numeric. Sets invalid values to `''`. |
| **Workout Sets** | `number` | `1 <= sets <= 50` (integer) | `sanitizeWorkout()` | Non-finite or out-of-range defaults to `3`. |
| **Workout Reps / Rest** | `string` | Freeform prescription string | `sanitizeWorkout()` | Default reps: `'10–12'`; default rest: `'90s'`. |
| **Workout Type** | `WorkoutType` | Must match `'push' \| 'pull' \| 'hybrid' \| 'rest' \| 'date' \| 'upper' \| 'lower' \| 'custom'` | `sanitizeWorkout()` | Invalid or unlisted types normalize to `'custom'`. |
| **Cycle Day** | `number \| null` | Integer `1 <= cycleDay <= 8`, or `null` | `sanitizeWorkout()` | Out-of-range or non-integer becomes `null`. |
| **Session Duration** | `number` | Finite number `>= 0` (integer minutes) | `sanitizeSessionLog()` | `Math.floor(durationMin)`. Negative or non-finite defaults to `0`. |
| **Session Date** | `string` | Regex `/^\d{4}-\d{2}-\d{2}$/`, valid calendar date via `isValid(parseISO())` | `sanitizeSessionLog()` | Invalid date becomes empty string `''` (never silently defaults to today). |
| **Session Completion** | `boolean` | Strictly boolean `=== true` | `sanitizeSessionLog()` | Coerced to `false` if `id`, `workoutId`, or `date` is empty or invalid. |
| **Exercise Definition** | `ExerciseDefinition` | `id`, `name`, `target`, `equipment`, `instructions` | `sanitizeExerciseDefinition()` | `name` defaults to `'Exercise'`, `target` defaults to `'General'`. |
| **Updated Timestamp** | `number` | Finite number `>= 0` | All sanitizers | Coerced to `Number(updatedAt) \|\| 0`. |

### 2.2 Boundary A: Import & Migration Validation (`src/utils/fitnessMigration.ts`)
- **JSON Structure Check**: `validateAndSanitizeFitnessData(parsed)` checks that `parsed` is a non-null object and not an array. Non-JSON text or malformed structures return `{ success: false, message: 'Invalid JSON file structure.' }`.
- **Schema Version Gating**: Inspects `parsed.schemaVersion ?? parsed.version` (defaults to 1). If `version > CURRENT_SCHEMA_VERSION` (`version > 2`), the importer strictly rejects the file with an explicit error message requiring an app update.
- **Payload Shape Detection**:
  - If `version === 2` and `Array.isArray(parsed.exerciseDefinitions)`: extracts definitions, workouts, logs, and appState directly.
  - If `Array.isArray(parsed.workouts)`: treats as legacy v1 backup and passes through `migrateV1ToV2()`, extracting exercise definitions automatically from workout items.
  - If neither array exists, rejects with an unrecognized backup format error.
- **Normalization & Sanitization**:
  - Every workout exercise is passed through `canonicalizeWorkoutExercise()`.
  - Every session log is passed through `sanitizeSessionLog()`.
  - `appState.cycleStart` is normalized; legacy `bodyWeightLogs` arrays are mapped to `weightLog` dictionaries.
- **Orphan Reference Healing**: Maps all exercise definitions. If a workout or log references an unknown `exerciseDefinitionId`, a fallback definition is synthesized (`name: 'Exercise'`, `target: 'General'`) to prevent dangling foreign keys.
- **Unenforced Import Boundaries**: Freeform string fields (`instructions`, `notes`, `restNotes`) are not length-capped or sanitized for markup; non-standard workout IDs are preserved as strings without UUID validation.

### 2.3 Boundary B: Local Persistence & Storage Validation (`src/hooks/useFitnessData.ts`)
- **Runtime vs Compile-Time Reality**: TypeScript interfaces (`ExerciseDefinition`, `Workout`, `SessionLog`) provide **compile-time checking only**. At runtime, JavaScript state updates (`setWorkouts`, `setLogs`) do not perform automated schema validation on internal memory mutations.
- **Write Path Validation**: `persistFitnessDatabase()` does not re-sanitize the database on every write; it assumes upstream mutations were sanitized at the action boundary (`addLog`, `finishSession`). It stringifies the current in-memory state and performs staged writing with read-back verification.
- **Read Path Validation**: `loadInitialFitnessData()` runs `validateSnapshotStructure(candidate)`:
  - Validates `schemaVersion` is a positive finite number `<= CURRENT_SCHEMA_VERSION`.
  - Checks top-level array/object types: `Array.isArray(exerciseDefinitions)`, `Array.isArray(workouts)`, `typeof logs === 'object'`, `typeof appState === 'object'`.
  - Performs shallow item checks: confirms every definition has `typeof d.id === 'string'` and `typeof d.name === 'string'`; every workout has `typeof w.id === 'string'` and `typeof w.name === 'string'`.
  - Does **not** validate deep nested log sets or weight numbers during snapshot load; deep log sanitization occurs downstream via `migrateV1ToV2()`.
- **Corruption Quarantine**: If JSON parsing fails or `validateSnapshotStructure()` returns null, the raw string is saved to `gl_corrupt_snapshot_backup`, and the loader falls back to `gl_snapshot_staging`, then discrete keys.

### 2.4 Boundary C: Cloud Synchronization & Firestore Rules (`src/services/fitnessFirestore.ts`, `firestore.rules`)
- **Client-Side Outbound (Write)**: Writes in-memory documents directly (`saveExerciseDefinition`, `saveWorkout`, `saveLog`, `saveAppState`). `saveLog` strips the `id` field from the body because the Firestore document ID is the log ID.
- **Client-Side Inbound (Read)**:
  - `getExerciseDefinitions()` passes each document through `sanitizeExerciseDefinition()`.
  - `getWorkouts()` passes each document through `sanitizeWorkout()`.
  - `getLogs()` passes each document through `sanitizeSessionLog()`.
  - `getAppState()` casts directly to `AppState` without running a deep sanitizer.
  - Real-time snapshot listeners pass individual changes through their respective entity sanitizers.
- **Server-Side Security Rules Responsibilities (`firestore.rules`)**:
  - Enforces authenticated access (`request.auth != null`).
  - Enforces strict user isolation: a user can only read or write under `/users/{userId}/**` where `request.auth.uid == userId`.
  - Denies deletion of root user profile documents (`allow delete: if false;`).
  - **Unenforced Server-Side Boundaries**: `firestore.rules` does **NOT** validate document schemas, property names, data types, biological numeric limits, or orphan relationships. Server-side rules enforce identity and access control; data validity is strictly the client's responsibility.

### 2.5 Inferred & Unverified Constraints (Explicit Labels)
- **String Length Limits**: The code trims notes and names (`.trim()`), but does **not** enforce fixed maximum character truncation (e.g. no hard 500-character cap in code). Length limits are documentation guidelines, not active code-enforced boundaries.
- **RPE (Rate of Perceived Exertion)**: RPE is **not** an active field in canonical `SetLog` or `SessionLog`. It is supported only in `RawSetLog` as an optional input during migration and is not persisted in v2.

---

## 3. Storage Key Registry & Persistence Lifecycle

All local persistence in GAINLOG is managed across browser `localStorage`.

### Real Storage Key Registry

| Storage Key | Lifecycle & Ownership | Contents | Authoritative Source |
|---|---|---|---|
| **`gl_database_snapshot`** | Primary Canonical Store | JSON string of `VersionedFitnessSnapshot` (`{ schemaVersion: 2, timestamp, data }`) | `src/hooks/useFitnessData.ts` |
| **`gl_snapshot_staging`** | Snapshot Staging and Recovery Buffer | Staged JSON string written and verified before removing staging | `src/hooks/useFitnessData.ts` |
| **`gl_corrupt_snapshot_backup`** | Quarantine Buffer | Quarantined JSON backup of corrupted/invalid snapshot detected during boot | `src/utils/fitnessMigration.ts` |
| **`gl_exercise_definitions`** | Legacy Mirror Key | JSON array of `ExerciseDefinition[]` | `src/hooks/useFitnessData.ts` |
| **`gl_workouts`** | Legacy Mirror Key | JSON array of `Workout[]` | `src/hooks/useFitnessData.ts` |
| **`gl_logs`** | Legacy Mirror Key | JSON object of `Record<string, SessionLog>` | `src/hooks/useFitnessData.ts` |
| **`gl_state`** | Legacy Mirror Key | JSON object of `AppState` | `src/hooks/useFitnessData.ts` |
| **`gl_schema_version`** | Legacy Mirror Key | String representation of schema version (`"2"`) | `src/hooks/useFitnessData.ts` |
| **`gl_active_session`** | Active Workout Draft | JSON string of `ActiveSession` (`{ workoutId, startTime, sessionSets }`) | `src/hooks/useActiveSession.ts` |
| **`gl_auto_backups`** | Local Checkpoint Vault | JSON array of `AutoBackupEntry[]` (capped at 8 most recent snapshots) | `src/hooks/useFitnessBackups.ts` |
| **`gl_deleted_ids_${uid}`** | Scoped Sync Tombstones | JSON object `{ defs: string[], workouts: string[], logs: string[] }` | `src/utils/fitnessSyncHelpers.ts` |
| **`gl_deleted_ids_anon`** | Unauthenticated Tombstones | JSON object of tombstones for unauthenticated/offline sessions | `src/utils/fitnessSyncHelpers.ts` |
| **`gl_deleted_ids`** | Legacy Fallback Tombstones | Fallback tombstone key for backward compatibility | `src/utils/fitnessSyncHelpers.ts` |

### Removed & Non-Existent Keys
- GAINLOG does **not** read or write `gl_theme`, `gl_auth_cache`, or `gl_migration_backup`.
- Discrete legacy keys are strictly `gl_exercise_definitions` (not `gl_exercises`) and `gl_state` (not `gl_app_state`).

---

## 4. Durability, Staging & Crash Recovery Contract

### A. Staged Snapshot Write and Recovery Protocol (`persistFitnessDatabase`)
1. Serialize `VersionedFitnessSnapshot` to JSON.
2. Write serialized string to `gl_snapshot_staging`.
3. Write serialized string to canonical key `gl_database_snapshot`.
4. Verify write by reading `localStorage.getItem('gl_database_snapshot') === serialized`.
5. Only after verification succeeds, delete `gl_snapshot_staging`.
6. Best-effort mirror data to discrete keys (`gl_exercise_definitions`, `gl_workouts`, `gl_logs`, `gl_state`, `gl_schema_version`). Discrete key mirroring failure is caught and non-fatal.
7. If an error occurs (e.g. storage quota exceeded during canonical write), `gl_snapshot_staging` is **not deleted**, preserving the staged data for boot recovery.

### B. Startup Recovery Protocol (`loadInitialFitnessData`)
1. **Canonical Check**: Inspect `gl_database_snapshot`. If JSON parses and `validateSnapshotStructure()` passes, migrate/return data.
2. **Quarantine on Failure**: If parsing or validation fails, copy the corrupted raw value to `gl_corrupt_snapshot_backup`.
3. **Staging Recovery**: If canonical snapshot is missing or corrupted, inspect `gl_snapshot_staging`. If valid, promote it to `gl_database_snapshot`, delete staging, and return recovered data.
4. **Discrete Key Fallback**: If neither snapshot nor staging is valid, attempt recovery by parsing discrete keys (`gl_exercise_definitions`, `gl_workouts`, `gl_logs`, `gl_state`).
5. **Fresh Install Seed**: If all storage keys are empty (first install), initialize initial seed data from `src/types/initialData.ts` and commit both canonical snapshot and discrete mirrors.

### C. Atomicity Reality
Browser `localStorage` does **not** provide multi-key atomic transactions. The two-phase staging ensures that the single canonical snapshot (`gl_database_snapshot`) is verified before clearing staging. Discrete mirror keys are maintained sequentially on a best-effort basis and must never be treated as the authoritative primary store.

---

## 5. Backup, Export & Import Contract

### 5.1 Export JSON Format
Generated by `exportBackup()` in `src/hooks/useFitnessBackups.ts`:
```json
{
  "schemaVersion": 2,
  "exportDate": "2026-10-13T01:00:00.000Z",
  "exerciseDefinitions": [
    {
      "id": "bench_press",
      "name": "Barbell Bench Press",
      "target": "Chest",
      "equipment": "Barbell",
      "instructions": "Retract scapulae and press to lockout.",
      "tags": ["compound", "push"],
      "updatedAt": 1776000000000
    }
  ],
  "workouts": [
    {
      "id": "push_a",
      "name": "Push A",
      "badge": "PUSH",
      "type": "push",
      "cycleDay": 1,
      "isCore": true,
      "exercises": [
        {
          "exerciseDefinitionId": "bench_press",
          "sets": 3,
          "reps": "8–10",
          "rest": "90s",
          "note": "",
          "tags": []
        }
      ],
      "cardio": null,
      "restNotes": [],
      "updatedAt": 1776000000000
    }
  ],
  "logs": {
    "log-uuid-1": {
      "id": "log-uuid-1",
      "workoutId": "push_a",
      "date": "2026-10-12",
      "sets": {
        "bench_press": [
          { "id": "set_0", "weight": "80", "reps": "10", "done": true },
          { "id": "set_1", "weight": "80", "reps": "8", "done": true }
        ]
      },
      "complete": true,
      "durationMinutes": 45,
      "updatedAt": 1776000000000
    }
  },
  "appState": {
    "cycleStart": "2026-10-01",
    "weightLog": {
      "2026-10-12": { "weight": 78.5, "updatedAt": 1776000000000 }
    },
    "updatedAt": 1776000000000
  }
}
```

### 5.2 Import & Migration Behavior (`importBackup`)
1. **JSON Parsing**: Validates valid JSON structure; rejects non-object or array root payloads.
2. **Schema Version Detection**: Inspects `parsed.schemaVersion ?? parsed.version` (defaults to 1 if omitted).
3. **Version Rejection**: If `version > CURRENT_SCHEMA_VERSION` (version > 2), the import fails cleanly with an unsupported version message.
4. **V1 Legacy Normalization**: If `version === 1` or `workouts` array is present without `exerciseDefinitions`, `migrateV1ToV2()` extracts exercise definitions directly from workout exercises.
5. **Orphan Reference Protection**: If a workout or log references an `exerciseDefinitionId` missing from `exerciseDefinitions`, a fallback definition is synthesized (`name: 'Exercise'`, `target: 'General'`) to prevent broken foreign-key relationships.
6. **Pre-Import Checkpoint**: Before applying the new data, a checkpoint snapshot is pushed to `gl_auto_backups` with change type `'manual'` and description `'Pre-Import Savepoint'`.
7. **Tombstone Cleanup**: `clearDeletedIdsTracker()` clears local tombstones so imported items are not deleted upon subsequent cloud synchronization.
8. **Active Session Preservation**: `importBackup()` updates `exerciseDefinitions`, `workouts`, `logs`, and `appState`, but does **not** clear or overwrite `gl_active_session`. An in-progress workout draft remains preserved in localStorage.

---

## 6. Cloud Firestore Data Model & Sync Contract

When authenticated via Firebase Auth, GAINLOG synchronizes training data with Cloud Firestore.

### 6.1 Document & Subcollection Hierarchy
All user data is strictly scoped under `/users/{userId}`:
```
/users/{userId}                                     (Root user document: stores AppState fields)
  ├── cycleStart: string                            (YYYY-MM-DD)
  ├── weightLog: map<string, number | map>          (date -> weight or { weight, updatedAt })
  ├── updatedAt: number                             (Epoch milliseconds)
  │
  ├── /exerciseDefinitions/{exerciseDefId}          (Subcollection: ExerciseDefinition documents)
  │     ├── id, name, target, equipment, instructions, tags, updatedAt
  │
  ├── /workouts/{workoutId}                         (Subcollection: Workout documents)
  │     ├── id, name, badge, type, exercises, cardio, cycleDay, isCore, restNotes, updatedAt
  │
  └── /logs/{logId}                                 (Subcollection: SessionLog documents)
        ├── workoutId, date, sets, complete, durationMinutes, updatedAt
        (Note: log.id is omitted from document body; Firestore doc ID represents id)
```

*Architectural Boundary Note*: `AppState` is stored directly on the root user document `/users/{userId}`, **not** in a separate subcollection (`/users/{userId}/appState/current` does not exist).

### 6.2 Cloud Sync Protocols & Invariants
1. **Batch Chunking**: `commitBatchOperations` chunks all batch writes and deletes to **400 operations per batch** (under Firestore's 500-operation limit).
2. **Deterministic Conflict Resolution (`resolveLocalCloudRecord`)**:
   - Compares integer millisecond timestamps (`local.updatedAt` vs `cloud.updatedAt`).
   - If `local.updatedAt > cloud.updatedAt`: Local record uploaded to cloud (`winner: 'local'`).
   - If `cloud.updatedAt > local.updatedAt`: Cloud record replaces local (`winner: 'cloud'`).
   - If timestamps are equal: If stringified content matches, considered equal. If content differs, **local wins** as tie-breaker (`winner: 'local'`) and is uploaded to cloud.
3. **Tombstones & Resurrection Prevention**:
   - Deletions in local UI register IDs in `gl_deleted_ids_${uid}` (`{ defs: [], workouts: [], logs: [] }`).
   - Sync purges queued tombstones from Firestore first.
   - Incoming cloud records matching active tombstones are filtered out immediately, preventing deleted items from resurrecting.
4. **Retry & Network Awareness**:
   - On initial connection failure, background sync retries up to 3 times with exponential backoff (2000 ms, 4000 ms).
   - If `navigator.onLine === false` or Firestore reports `unavailable`, retry pauses and waits for the `window` `'online'` event.
   - `isSyncingRef` mutex prevents concurrent sync passes; `syncQueuedRef` ensures that rapid consecutive local mutations trigger exactly one follow-up sync.
5. **Account Isolation & Sign-Out**:
   - When switching accounts (`prevUid !== currentUid`) or signing out (`logout()`), tombstones for `prevUid` are cleared.
   - `resetToDefaultData()` wipes all user-specific local storage keys (`gl_database_snapshot`, `gl_snapshot_staging`, `gl_exercise_definitions`, `gl_workouts`, `gl_logs`, `gl_state`, `gl_deleted_ids`, `gl_auto_backups`, `gl_active_session`) and re-seeds fresh default data, guaranteeing zero data leakage between different lifters on the same device.
