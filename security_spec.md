# Security Specification for GAINLOG

## 1. Security Architecture & Boundary Model
GAINLOG employs defense-in-depth security with explicit boundaries between server-side Firestore security rules and client/API data validation:

### A. Server-Side Enforced Boundaries (`firestore.rules`)
- **Default Deny**: All unauthenticated access and unknown document collections are denied (`allow read, write: if false`).
- **User Ownership & Isolation**: A user can strictly only read and write documents inside their own subtree (`/users/{userId}/**` where `request.auth.uid == userId`).
- **Account Data Segregation**: Cross-user document reads, bulk scraping across `/users`, and identity-spoofed writes across distinct user IDs are strictly rejected by the Firestore engine.
- **Deletions on Root Profile**: Root user profile documents cannot be deleted (`allow delete: if false`).
- **Health Check Path**: The `/test/{document=**}` health check requires authenticated requests (`request.auth != null`).

### B. Client & API-Side Enforced Sanitization & Invariant Validation
Payload structural constraints and application invariants are validated deterministically via `fitnessCalculations.ts` (`sanitizeWorkout`, `sanitizeSessionLog`, `sanitizeExerciseDefinition`, `validateAndSanitizeFitnessData`):
1. **Allowed Workout Types**: Type values outside the `WorkoutType` enum are normalized to standard supported types.
2. **String & Note Length Caps**: Defensive length caps prevent resource poisoning (notes clamped, payload sizes bounded).
3. **Finite Numeric Enforcement**: Weights, reps, and durations strictly require finite values within biological bounds; negative durations and malformed exponential values (`1e309`, `Infinity`, `NaN`) are sanitized.
4. **Orphan & State Transition Protection**: Session logs and workout definitions maintain strict structural integrity before persistence or sync.
5. **No Secret Leaks**: Zero service credentials, secret API keys, or stack traces are bundled or transmitted to untrusted environments.

## 2. Invariant Verification & Test Coverage
- Cloud isolation and UID-based tombstone partitioning are verified in `src/test/dataSyncAndIsolationRegression.test.ts` and `src/test/lifecycleDestructiveSyncBoundary.test.ts`.
- Payload sanitization boundaries and extreme value resilience are verified in `src/test/persistenceBoundaries.test.ts` and `src/test/canonicalDataContract.test.ts`.

## 3. Documentation & Contract Cross-References
- **Domain Entity Schemas & Numeric Bounds**: See `DATA_MODEL.md` (§2 for biological validation limits, §5 for Firestore collection hierarchy).
- **System Boundaries & Invariants**: See `ARCHITECTURE.md` (§8 Invariants 10–12 for conflict resolution, batch limits, and account isolation).
- **AI Agent Governance & Security Gating**: See `AGENTS.md` (§3 for High-Risk Subsystem 5 on Cloud Synchronization & Tombstones).


