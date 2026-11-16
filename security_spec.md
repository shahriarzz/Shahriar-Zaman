# Security Specification for GAINLOG

## 1. Security Architecture & Boundary Model
GAINLOG employs defense-in-depth security with explicit boundaries between server-side Firestore security rules and client/API data validation:

### A. Server-Side Enforced Boundaries (`firestore.rules`)
- **Default Deny**: All unauthenticated access and unknown document collections are denied (`allow read, write: if false`).
- **User Ownership & Isolation**: A user can strictly only read and write documents inside their own subtree (`/users/{userId}/**` where `request.auth.uid == userId`).
- **Account Data Segregation**: Cross-user document reads, bulk scraping across `/users`, and identity-spoofed writes across distinct user IDs are strictly rejected by the Firestore engine.
- **Deletions on Root Profile**: Root user profile documents cannot be deleted (`allow delete: if false`).
- **Health Check Path**: The `/test/{document=**}` health check requires authenticated requests (`request.auth != null`).
- **Server-Side Boundary Scope**: Firestore rules strictly enforce authentication, UID subtree path scoping, and root deletion denial. They do **not** enforce document schema properties, field types, numeric ranges, or orphan relationships; data validity is enforced on the client.

### B. Client & API-Side Enforced Sanitization & Invariant Validation
Payload structural constraints and application invariants are validated deterministically via `fitnessCalculations.ts` (`sanitizeWorkout`, `sanitizeSessionLog`, `sanitizeExerciseDefinition`, `validateAndSanitizeFitnessData`):
1. **Allowed Workout Types**: Type values outside the `WorkoutType` enum are normalized to standard supported types.
2. **String & Note Length Caps**: Defensive length caps prevent resource poisoning (notes clamped, payload sizes bounded).
3. **Finite Numeric Enforcement**: Weights, reps, and durations strictly require finite values within biological bounds; negative durations and malformed exponential values (`1e309`, `Infinity`, `NaN`) are sanitized.
4. **Orphan & State Transition Protection**: Session logs and workout definitions maintain strict structural integrity before persistence or sync.
5. **No Secret Leaks**: Zero service credentials, secret API keys, or stack traces are bundled or transmitted to untrusted environments.

## 2. Invariant Verification & Test Coverage
- **Live Firestore Security Rules (`firestore.rules`)**: Verified directly against the Firestore Emulator via `@firebase/rules-unit-testing` in `src/test/integration/firestoreRules.integration.test.ts` (unauthenticated denial, `/test/connection` auth gate, owner CRUD + collection queries, cross-UID read/write/list isolation, root `/users/{uid}` deletion denial, and default deny on unknown collections).
- **Cloud Isolation & Integration Tests**: Real Firebase Auth & Firestore Emulator CRUD, batch chunking (`>= 405`), atomic `deleteExerciseDefinitionWithWorkouts`, realtime subscriptions, UID-based tombstone partitioning, and `A -> B -> A` isolation are verified in `src/test/integration/fitnessFirestore.integration.test.ts` and `src/test/integration/fitnessSync.integration.test.tsx`, alongside unit/regression suites `src/test/dataSyncAndIsolationRegression.test.ts` and `src/test/lifecycleDestructiveSyncBoundary.test.ts`.
- **Execution Commands**: Run Pass One emulator + rules tests via `firebase emulators:exec --project demo-gainlog --only auth,firestore "npm run test:firebase"`, or run the full Firebase + Playwright browser integration suite via `npm run test:integration`.
- Payload sanitization boundaries and extreme value resilience are verified in `src/test/persistenceBoundaries.test.ts` and `src/test/canonicalDataContract.test.ts`.

## 3. Documentation & Contract Cross-References
- **Domain Entity Schemas & Numeric Bounds**: See `DATA_MODEL.md` (§2 for biological validation limits, §6 for Firestore collection hierarchy).
- **System Boundaries & Invariants**: See `ARCHITECTURE.md` (§8 Invariants 10–12 for conflict resolution, batch limits, and account isolation).
- **AI Agent Governance & Security Gating**: See `AGENTS.md` (§3 for High-Risk Subsystem 5 on Cloud Synchronization & Tombstones).


