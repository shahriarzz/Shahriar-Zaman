# Muscle Balance & Recovery Analytics — Implementation Plan (Revised)

GAINLOG introduces a fine-grained muscle intelligence and workload recovery model extending the canonical derived pipeline. It delivers objective visibility into anatomical training distribution and recent workload across 15 distinct muscle groups using multi-muscle attribution, without altering raw log schemas or disturbing existing broad-category analytics.

---

### STOP-AND-APPROVE PROPOSAL: Canonical Derived Pipeline & Indexing

- **Target Subsystem**: Subsystem 3 (Canonical Derived Pipeline & Indexing)
- **Proposed Modification**: Extend `buildFitnessIndex()` in `src/utils/fitnessCalculations.ts` with single-pass muscle stimulus attribution (`muscleStimulusByDate`, `muscleAttributionCoverageByDate`, `lifetimeLastTrainedDateByMuscle`), add pure selectors in `src/utils/muscleIntelligence.ts` and `src/utils/fitnessDerivedSelectors.ts`, and render `MuscleBalanceRecovery.tsx` in `src/components/AnalyticsView.tsx`.
- **Architectural Rationale**: Provide fine-grained 15-muscle balance and residual workload analytics without creating a secondary source of truth, altering raw schemas, or disturbing legacy broad-category metrics.
- **Invariants Affected**: Invariant 1 (Single Canonical State Store), Invariant 4 (Complete Session Predicate), Invariant 14 (Performance & Algorithmic Reality).
- **Potential Risks**: Double-counting set coverage, performance degradation on large log histories, or regression of existing category volume/sets.
- **Risk Mitigation & Test Plan**: Cache exercise resolution per exercise ID within `buildFitnessIndex()`, run a single chronological pass, evaluate mathematical invariant parity against existing test suites, and add comprehensive unit/regression tests in `src/test/muscleIntelligence.test.ts`.
- **Backward Compatibility**: 100% backward compatible. Zero changes to raw log storage schema, Firestore sync payloads, or migration version. Legacy metrics (`volumeByMuscle`, `setsByMuscle`, `frequencyByMuscle`) remain completely untouched.

---

> [!IMPORTANT]
> **Confirmed Decisions & Specification Governance**
> - **15 Canonical Anatomy Groups**: `chest`, `front_delts`, `side_delts`, `rear_delts`, `lats`, `upper_back`, `lower_back`, `biceps`, `triceps`, `forearms`, `quads`, `hamstrings`, `glutes`, `calves`, `core`.
> - **Three-Tier Role-to-Weight Mapping**:
>   - `primary` = **1.0 WSE**
>   - `secondary_strong` = **0.5 WSE**
>   - `secondary_moderate` = **0.25 WSE**
>   - Minor / Stabilizer = **0.0 WSE** (excluded from attribution)
>   - *Note*: Role assignments are exercise-specific and centrally mapped to weights via pure lookup. Roles are never inferred from generic broad muscle categories. For example, biceps are classified as `secondary_strong` or `secondary_moderate` according to the specific exercise mechanics (e.g., strong in underhand chin-ups; moderate in neutral-grip rows).
> - **Fingerprint-Guarded Matching Contract**: Built-in exercises match using both stable ID and target fingerprint. If the ID matches but the target fingerprint has been customized, the curated profile is not silently applied; it falls back to conservative target inference or unclassified.
> - **Transparent Coverage Metric**: Tracked as three explicit counts: `curated`, `inferred`, and `unclassified`. Coverage is strictly `(curated + inferred) / eligible completed sets × 100`, where each completed eligible set contributes to the denominator exactly once regardless of how many muscles the exercise touches.
> - **View All Behavior**: When expanded, all 15 anatomical groups are shown, including groups with zero exposure, to reveal training gaps clearly. Zero-exposure groups are distinctly differentiated from unclassified activity.
> - **Deterministic Residual Stimulus**: $R_m = \sum_{d=0}^{13} \text{dailyWSE}_{m,d} \cdot 2^{-\text{ageInDays} / 2}$, evaluated over the reference date (day 0) and preceding 13 calendar dates. All daily stimulus is summed per muscle before applying decay. Future dates are excluded. Labeled as a recency-weighted workload estimate, not physiological recovery.
> - **Exposure Scope Separation**: Lifetime last exposure date is tracked separately from exposure within the trailing 14-day recovery window. Muscles with no exposure in the 14-day window show "No recent history" without implying the muscle has never been trained.

---

## 1. Overview & Core Concept

- **What It Does**: Calculates true anatomical training distribution across 15 distinct muscle groups using multi-muscle attribution, paired with a deterministic 14-day recency-weighted residual stimulus indicator.
- **Target Audience**: Dedicated strength athletes seeking objective visibility into muscle group balance, fatigue accumulation, and unaddressed body regions.
- **Key Value**: Delivers multi-tier primary and secondary muscle stimulus tracking while leaving existing single-category volume/set charts completely unaltered and backwards-compatible.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Navigating to Analytics**: The user opens the existing **Analytics** tab (`AnalyticsView.tsx`). The global time-window selector (7D, 30D, 90D, ALL) governs both legacy analytics and the new Muscle Balance panel.
2. **Reviewing Muscle Balance**:
   - The user scans the **Muscle Balance** card on the left (on desktop).
   - Shows the top 6 muscle groups ranked by total Weighted Set Equivalents (WSE) with proportional emerald fill bars and share percentages.
   - Shows transparent attribution coverage: `(curated + inferred) / eligible completed sets` (e.g., `42 / 48 sets mapped (87.5%)` with breakdown of curated, inferred, and unclassified).
   - Tapping "View All (15)" expands the list to display **all 15 anatomical groups**, including groups with 0 WSE. Zero-exposure groups are styled with subtle muted indicators to highlight training gaps without conflating them with unclassified sets.
3. **Evaluating Recovery Context**:
   - The user scans the **Recovery Context** card on the right (on desktop).
   - Displays estimated residual training stimulus (exponentially decayed over a 14-day rolling window) alongside recency context.
   - If trained within the last 14 days: displays relative recency (e.g., `Today`, `Yesterday`, `3d ago`).
   - If not trained in the last 14 days: displays `No recent history` (differentiated from lifetime history if available).
   - Plainly labeled as a workload estimate; no misleading clinical recovery percentages or "ready to train" assertions.

### Visual Identity & Theme
- **Layout Structure**: Responsive side-by-side grid on desktop (`lg:grid-cols-2`), stacked vertically on mobile viewports.
- **Surface Elevation**: Deep dark slate card surfaces matching GAINLOG's design tokens (`SURFACE.card`, `BORDER.subtle`).
- **Typography**: Clean display pairing using `JetBrains Mono` for tabular numerals (`font-mono tabular-nums`), preventing layout jitter during metric updates.
- **Zero-Pill Discipline**: Metadata (dates, percentages, mapping coverage) rendered as clean unboxed text with subtle typographic dot separators (`·`).
- **Affordance-Only Icons & Neutral Badging**: Interactive expansion toggle uses a standard chevron; coverage summary uses unboxed, quiet typography.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Code-Owned Muscle Profiles with Fingerprint Guards**
  - *Chosen Approach*: Maintain exercise-to-muscle profiles in a pure TypeScript utility (`src/utils/muscleIntelligence.ts`). Curated profiles for `INITIAL_EXERCISE_DEFINITIONS` are gated by both `exerciseId` and `targetFingerprint`. If an exercise's target has been modified, it falls back to conservative target-text inference or unclassified.
  - *Why*: Eliminates the need to modify `ExerciseDefinition`, bump `CURRENT_SCHEMA_VERSION`, alter Firestore sync payloads, or migrate local databases, while preventing misattribution if an exercise is repurposed.
  - *Trade-off*: Custom exercises rely on conservative target-text inference rather than arbitrary user-defined secondary muscle assignments.

- **Decision 2: Exercise-Specific Three-Tier Weighted Set Equivalents (WSE)**
  - *Chosen Approach*: Primary (1.0), Strong Secondary (0.5), Moderate Secondary (0.25).
  - *Why*: Prevents secondary muscle inflation while capturing meaningful biomechanical assistance (e.g., triceps in heavy pressing, biceps in pull movements) based on specific movement mechanics.
  - *Trade-off*: WSE weights and the two-day half-life are transparent modelling assumptions, not validated physiological constants.

- **Decision 3: Inclusive 14-Day Consolidated Residual Decay**
  - *Chosen Approach*: Sum all eligible WSE on the same calendar date per muscle before applying exponential decay ($R_m = \sum_{d=0}^{13} \text{dailyWSE}_{m,d} \cdot 2^{-d / 2}$). Caller supplies the reference date; zero reliance on `new Date()` within memoized selectors.
  - *Why*: Guarantees pure, deterministic, and testable calculation behavior across all timezones and snapshot states.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Canonical Training Logs                         │
│             (logs: Record<string, SessionLog> | SessionLog[], defs)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          buildFitnessIndex()                           │
│  • Single chronological pass over complete sessions & done: true sets  │
│  • Resolves exercise profile once per exercise entry (not per set)     │
│  • Preserves existing volumeByMuscle, setsByMuscle, frequencyByMuscle  │
│  • Populates new derived fields:                                       │
│      - muscleStimulusByDate: Record<string, Record<MuscleGroup, number>>│
│      - muscleAttributionCoverageByDate: Record<string, CoverageCounts> │
│      - lifetimeLastTrainedDateByMuscle: Record<MuscleGroup, string>    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FitnessDerivedContext                           │
│          Exposes memoized FitnessIndex to downstream consumers         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────┴────────────────────────────────────┐
│                    Pure Muscle Intelligence Selectors                  │
│  • selectMuscleBalanceForRange(index, startDate, endDate)              │
│      - Returns: WSE per group, share %, totalAttributedWSE,            │
│        coverage: { curated, inferred, unclassified, totalEligibleSets }│
│  • selectMuscleRecovery(index, referenceDate)                          │
│      - Evaluates [referenceDate - 13 days, referenceDate]              │
│      - Daily stimulus consolidated per date before decay               │
│      - Returns: residualStimulus, recentStimulus, lastTrainedInWindow, │
│        lifetimeLastTrainedDate                                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               MuscleBalanceRecovery.tsx (UI Component)                 │
│  • Rendered in AnalyticsView below Muscle Targeting, above Bests       │
│  • Responsive grid (lg:grid-cols-2), 6 top groups by default           │
│  • View All expands to all 15 anatomy groups (0-exposure visible)      │
│  • Explicit coverage summary with unclassified count                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Proposed Data Structures (`src/utils/muscleIntelligence.ts`)

```typescript
export type MuscleGroup =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export const ALL_MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'lats',
  'upper_back', 'lower_back', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core'
] as const;

export type MuscleInvolvementRole = 'primary' | 'secondary_strong' | 'secondary_moderate';

export interface MuscleInvolvement {
  muscle: MuscleGroup;
  role: MuscleInvolvementRole;
}

export type AttributionSource = 'curated' | 'inferred' | 'unclassified';

export interface ExerciseMuscleProfile {
  source: AttributionSource;
  involvements: MuscleInvolvement[];
}

export interface AttributionCoverageCounts {
  curatedSets: number;
  inferredSets: number;
  unclassifiedSets: number;
  totalEligibleSets: number;
}
```

### Central Role-to-Weight Mapping
```typescript
export const ROLE_WEIGHTS: Record<MuscleInvolvementRole, number> = {
  primary: 1.0,
  secondary_strong: 0.5,
  secondary_moderate: 0.25,
};

export function getRoleWeight(role: MuscleInvolvementRole): number {
  return ROLE_WEIGHTS[role] ?? 0;
}
```

---

## 5. Verification & Test Plan

1. **Curated Matching & Fingerprint Integrity**:
   - Test built-in exercise profile resolution matching both ID and target fingerprint.
   - Test that changing an exercise's target fingerprint prevents silent application of the curated profile and routes to conservative inference or unclassified.
2. **Attribution & Coverage Math**:
   - Verify that each eligible completed set contributes to `totalEligibleSets` exactly once, even when the exercise has 3+ muscle involvements.
   - Verify coverage calculation: `(curated + inferred) / totalEligibleSets * 100`.
   - Verify handling of 100% curated, mixed, and 100% unclassified sets.
3. **Stimulus Consolidation & Deterministic Decay**:
   - Verify multiple sessions/exercises on the same date consolidate WSE per muscle before exponential decay is applied.
   - Verify exact decay multipliers: day 0 ($2^0 = 1.0$), day 2 ($2^{-1} = 0.5$), day 4 ($2^{-2} = 0.25$), day 13 ($2^{-6.5} \approx 0.011048$).
   - Verify that dates prior to day 13 or future-dated sessions receive zero weight.
4. **Range Balance & 15-Group View All**:
   - Verify ranking orders groups by WSE descending.
   - Verify that default shows top 6 groups and "View All" reveals all 15 groups, including those with 0 WSE.
   - Verify zero-exposure groups are visibly distinguished from unclassified activity.
5. **Canonical Invariant Parity**:
   - Verify `volumeByMuscle`, `setsByMuscle`, `frequencyByMuscle`, PRs, e1RM, adherence, and streaks remain 100% identical before and after.
   - Verify both array and record log formats operate seamlessly.
6. **Performance & Build**:
   - Run Vitest suite (must pass 100% across all files).
   - Run `npm run lint` (`tsc --noEmit`).
   - Run `npm run build` (`build:web` and `build:server`).

---

## 6. Documentation Synchronization

Update the following documents in the implementation commit:
- **`ARCHITECTURE.md`**: Document the 15-group anatomy taxonomy, single-pass index integration, pure selector contracts, deterministic decay formula, and performance boundaries.
- **`DATA_MODEL.md`**: Document the derived `FitnessIndex` extensions (`muscleStimulusByDate`, `muscleAttributionCoverageByDate`, `lifetimeLastTrainedDateByMuscle`), confirming zero schema/migration/storage changes.
- **`PRD.md`**: Document the Muscle Balance & Recovery feature, user workflows, 6-group default with 15-group expansion, and explicit disclaimer that WSE weights and 2-day decay half-life are modelling heuristics.
