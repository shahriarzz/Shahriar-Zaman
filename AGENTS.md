# AGENTS.md — AI Developer Governance & Operating Contract for GAINLOG

> **Target Repository**: [Shahriar-Zaman/gainlog](https://github.com/shahriarzz/Shahriar-Zaman)  
> **Status**: Active Operating Contract  
> **Audience**: AI Coding Agents, Automated Assistants, and Contributing Engineers  
> **Authority**: Overrides default LLM behaviors, speculative implementations, and unverified assumptions.

---

## 1. Operating Mission & Boundaries

GAINLOG is a local-first, privacy-focused progressive overload training engine designed for serious strength athletes.

### Core Operating Constraints
- **Zero Hallucinated Features**: Implement only the features requested by the user and specified in `PRD.md`. Never invent social feeds, gamified badges, payment walls, or decorative fluff.
- **No Unsolicited AI Additions**: Never add chatbots, conversational assistants, "Ask AI" widgets, telemetry trackers, or external LLM API calls unless explicitly commanded by the user.
- **Zero-Pill & Clean UI Discipline**: Presentation rules are governed exclusively by Tailwind CSS tokens (`src/styles/tokens.ts`) and primitives in `src/components/ui/`. Never add external UI libraries (such as MUI, Ant, or Bootstrap).
- **Downward Dependency Integrity**: Pure calculations (`src/utils/`) must never import React hooks or UI components (`src/components/`).
- **Documentation Sync Mandate**: Any authorized architectural change MUST update `ARCHITECTURE.md` and `DATA_MODEL.md` in the exact same commit.

---

## 2. Mandatory Reading Order

Before proposing, modifying, or executing any code or architecture change, the AI agent MUST read relevant project documentation in this strict sequential order:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Read AGENTS.md (This Document)                                      │
│    Understand governance, gating rules, forbidden actions, and checks  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Read Relevant Sections of ARCHITECTURE.md                           │
│    Inspect system map, downward layer rules, and 15 testable invariants│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Read Relevant Sections of DATA_MODEL.md                             │
│    Inspect entity schemas, validation bounds, storage keys & migrations│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Read Relevant Sections of PRD.md                                    │
│    Verify product intent, UX workflows, and 8-day cycle protocols      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. Read security_spec.md (If Touching Data, Auth, or Sync)             │
│    Verify Firestore security rules, UID isolation & sanitization bounds│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 6. Read DESIGN_SYSTEM.md (If Touching Tokens, UI, or Screen Layouts)   │
│    Required before touching tokens.ts, components/ui/, or visual code  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 7. Inspect Implementation Files & Existing Regression Tests            │
│    Verify actual default-branch code behavior before proposing changes │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 8. Check Invariant Statuses Prior to Proposal                          │
│    Ensure proposed changes do not violate any of the 15 invariants     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. High-Risk Subsystems & Mandatory Gating Protocol

> [!WARNING]
> When a requested task touches any of the **6 High-Risk Subsystems** listed below, the AI agent **MUST NOT execute code changes immediately**. The agent must pause and present a formal **STOP-AND-APPROVE PROPOSAL** and await explicit user sign-off.

### The 6 High-Risk Subsystems

| # | High-Risk Subsystem | Key Files | Invariants at Risk |
|---|---|---|---|
| **1** | **Persistence & Snapshot Durability** | `src/hooks/useFitnessData.ts`<br>`src/utils/fitnessMigration.ts` | Invariant 2 (Snapshot Durability & Two-Phase Staging)<br>Invariant 8 (Snapshot Self-Healing & Quarantine) |
| **2** | **Session Completion Gate** | `src/components/SessionView.tsx`<br>`src/hooks/useFitnessLogs.ts`<br>`src/hooks/useActiveSession.ts` | Invariant 3 (Session Completion Synchronous Verification)<br>Invariant 5 (Pre-Session PR Isolation & Consolidation) |
| **3** | **Canonical Derived Pipeline & Indexing** | `src/utils/fitnessDerivedSelectors.ts`<br>`src/context/FitnessDerivedContext.tsx` | Invariant 1 (Single Canonical State Store)<br>Invariant 4 (Complete Session Predicate)<br>Invariant 14 (Performance & Algorithmic Reality)<br>Invariant 15 (Deterministic Muscle Intelligence & Selector Purity) |
| **4** | **Training Intelligence & Adherence** | `src/utils/trainingIntelligence.ts`<br>`src/utils/fitnessCalculations.ts` | Invariant 6 (8-Day Date-Based Modulo Progression)<br>Invariant 7 (Rest-Day Natural Advancement & Bonus Isolation) |
| **5** | **Cloud Synchronization & Tombstones** | `src/services/fitnessFirestore.ts`<br>`src/hooks/useFitnessSync.ts`<br>`src/utils/fitnessSyncHelpers.ts` | Invariant 10 (Deterministic Conflict Resolution & Local Bias)<br>Invariant 11 (Batch Limits & Network Retries)<br>Invariant 12 (Account Isolation & Tombstone Scoping) |
| **6** | **Schema Versioning & Migrations** | `src/types/fitness.ts`<br>`src/utils/fitnessMigration.ts` | Invariant 9 (Deterministic Two-Phase Migration Contract) |

---

## 4. Standardized Communication Templates

### A. Stop-and-Approve Proposal Template
Use when a proposed task touches any High-Risk Subsystem:

```markdown
### STOP-AND-APPROVE PROPOSAL: [Subsystem Name]

- **Target Subsystem**: [1 of the 6 High-Risk Subsystems]
- **Proposed Modification**: [Concise summary of what needs to change]
- **Architectural Rationale**: [Why this change is required]
- **Invariants Affected**: [Relevant Invariants from ARCHITECTURE.md §8]
- **Potential Risks**: [Data loss, sync divergence, calculation mismatch]
- **Risk Mitigation & Test Plan**: [How changes will be isolated and verified]
- **Backward Compatibility**: [Migration needs or storage key preservation]

*Awaiting explicit user approval before modifying code.*
```

### B. Architectural Conflict Report Template
Use when a requested change conflicts with an existing architectural invariant, dependency rule, or data contract without prior authorization:

```markdown
### ARCHITECTURAL CONFLICT REPORT

- **Conflict**: [Description of the requested change and why it triggers this protocol]
- **Existing Documented Rule**: [Exact section and invariant from ARCHITECTURE.md]
- **Code Evidence**: [Specific file, line number, or interface implementing the current rule]
- **Reason for Conflict**: [Why the requested change violates existing architecture]
- **Smallest Compliant Alternative**: [Localized change that satisfies user intent without violating architecture]
- **Broader Architectural Alternative**: [Systemic change required if the rule itself must evolve]
- **Affected Files & Systems**: [Complete list of files impacted]
- **Decision Required**: [Specific question requiring user approval before proceeding]
```

---

## 5. Prohibited Actions for AI Agents

AI agents working on GAINLOG are **strictly prohibited** from:

1. **Adding External UI Frameworks**: Do not install or import Tailwind UI alternatives, Material UI, Chakra, Ant Design, or Bootstrap. Tailwind v4 utility tokens are canonical.
2. **Adding Conversational Assistants / Telemetry**: Do not embed chat widgets, telemetry pings, tracking beacons, or system logs in the UI.
3. **Bypassing the Staging Mechanism**: Never write directly to `gl_database_snapshot` without first validating write integrity through `gl_snapshot_staging`.
4. **Relaxing Numeric Sanitization**: Never permit `Infinity`, `NaN`, negative durations, negative weights, or non-integer reps.
5. **Computing Canonical Metrics in Components**: Never compute volume, e1RM, streaks, adherence, or PRs directly inside React components. Use pure selectors from `src/utils/fitnessDerivedSelectors.ts`.
6. **Violating Layer Directionality**: Never import UI components, React hooks, or contexts into pure utility modules (`src/utils/`).
7. **Weakening Firestore Rules**: Never modify `firestore.rules` to permit public unauthenticated access or cross-user document inspection.
8. **Disabling Existing Regression Tests**: Never delete, comment out, or skip existing tests in `src/test/` to make a failing suite pass. Fix the root cause in the implementation or report the conflict.
9. **Violating Design System Equivalents**: Never introduce a new color, typography style, radius value, spacing value, or UI primitive without first checking `DESIGN_SYSTEM.md` for an existing equivalent. If none exists, propose the addition explicitly in the same change rather than creating a parallel option silently.

---

## 6. Verification Checklists

### Pre-Implementation Checklist
Before editing any file:
- [ ] Confirmed source of truth in `PRD.md` (for product requirements) or `DATA_MODEL.md` (for schema/storage).
- [ ] Checked whether task involves any of the 6 High-Risk Subsystems. If yes, presented Stop-and-Approve Proposal.
- [ ] Verified that proposed changes respect downward dependency rules (UI → Contexts/Hooks → Selectors → Utils).
- [ ] Confirmed that all numeric inputs are sanitized within biological limits (`sanitizeWorkout`, `sanitizeSessionLog`).

### Post-Implementation Verification Checklist
Before declaring any task complete:
- [ ] **Typecheck**: `npm run lint` (`tsc --noEmit`) passes with 0 errors.
- [ ] **Unit & Regression Tests**: `npx vitest run` passes with 100% of test files passing (all regression suites must pass cleanly).
- [ ] **Production Build**: `npm run build` succeeds cleanly (`build:web` and `build:server`).
- [ ] **Regression Coverage**: Added dedicated test cases in `src/test/` for any new logic, edge case, or bug fix.
- [ ] **Documentation Sync**: If an approved architectural change occurred, updated `ARCHITECTURE.md` and `DATA_MODEL.md` in the same commit.

---

## 7. Subsystem Test Mapping Matrix

| Subsystem | Primary Vitest Suite | Critical Invariants Verified |
|---|---|---|
| **Pipeline & Calculations** | `src/test/canonicalFitnessPipeline.test.ts`<br>`src/test/pipelineConsistencyRegression.test.ts` | Incomplete log filtering, zero-volume handling, PR consolidation, cross-surface metric identity |
| **Persistence & Snapshot** | `src/test/persistenceBoundaries.test.ts`<br>`src/test/backupRestoreRoundTrip.test.ts` | Two-phase staging commit, corrupt snapshot recovery, quarantine backup, staged rollback |
| **Cloud Sync & Auth** | `src/test/dataSyncAndIsolationRegression.test.ts`<br>`src/test/lifecycleDestructiveSyncBoundary.test.ts` | UID subtree path isolation, tombstone persistence, timestamp tie-breaker, offline queueing |
| **Session Lifecycle & PRs** | `src/test/sessionDataContract.test.ts`<br>`src/test/sessionViewIdentity.test.ts`<br>`src/test/sessionPRRegression.test.ts` | Active draft preservation, pre-session PR comparison, one-visible PR event rule |
| **Training Intelligence** | `src/test/analyticsAdherenceAndPerformanceScore.test.ts`<br>`src/test/recoveryCycleAdvancement.test.ts` | 8-day cycle modulo arithmetic, rest day automatic progression, streak across recovery days |
| **Architecture Boundaries** | `src/test/architectureContract.test.ts` | Strict downward dependency imports (zero UI/hooks in calculations) |
| **Performance Benchmarks** | `src/test/performanceBenchmark.test.ts` | Algorithmic reality: O(N log N + S + E log E + D log D) for 100, 1,000, and 5,000 logs |
| **Muscle Intelligence** | `src/test/muscleIntelligence.test.ts`<br>`src/test/muscleBalanceRecovery.test.tsx` | Invariant 15: Deterministic reference date validation, full internal precision for residual stimulus, 15 anatomical groups, unclassified fallback, WSE attribution |

---

## 8. Android & CI/CD Development Rules

- **Capacitor Configuration**: App ID is `com.gainlog.app`. Native web directory is `dist`. When changing native plugins, sync via `npx cap sync android`.
- **Status Bar & Haptics**: Native interactions must use `@capacitor/status-bar` and `@capacitor/haptics`. Never bypass native plugin wrappers with browser-only vibration hacks on Android.
- **CI Workflow & Release Enablement**:
  - Regular validation (`validate`) runs `npm ci`, `npm run lint`, `npm test`, and `npm run build`.
  - Android debug APK build (`android-build`) runs `./gradlew assembleDebug`.
  - Android signed release bundle (`android-release-validation`) runs exclusively on trusted `push` events when the repository variable `vars.ANDROID_RELEASE_ENABLED == 'true'`. Pull requests (including same-repository PRs) never trigger signed releases or expose signing secrets.
  - Required secrets for release signing: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
  - If `ANDROID_RELEASE_ENABLED` is `'true'` on a push event but secrets are missing, the job fails with a clear, non-sensitive diagnostic. When disabled or on pull requests, the release job is skipped cleanly without impacting debug builds or tests.
