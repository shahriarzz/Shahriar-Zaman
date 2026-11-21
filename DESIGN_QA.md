# DESIGN_QA.md — GAINLOG Design Quality, Screen Contracts & Verification Audit

> **Status:** Active Quality Contract  
> **Companion Docs:** `DESIGN_SYSTEM.md` (visual tokens & primitives), `ARCHITECTURE.md` (15 architectural invariants), `AGENTS.md` (operating rules)  
> **Visual Identity:** Technical dark training instrument (`#09090e` canvas, zinc surfaces, `#f97316` brand/achievement orange, `#10b981` success/emerald analytics, `#6366f1` indigo strength-trend analysis, and `WORKOUT_COLORS` identity markers).

---

## Section A: Screen & Surface Contracts

| Surface | Primary Role | Canonical Top-to-Bottom Section Order | Primary Action | Empty / Unavailable Contract |
|---|---|---|---|---|
| **Dashboard** (`src/components/Dashboard.tsx`) | Immediate daily orientation, 4-card readiness snapshot, and launch pad into today's 8-day cycle protocol | 1. `<h1>` `"Stay Aggressive"` (date eyebrow)<br>2. 4 KPI grid (`[data-testid="dashboard-overview-stats"]`: `Streak`, `Training Frequency`, `Strength Progress`, `Adherence`)<br>3. Conditional `Unfinished Session` banner (`[data-testid="unfinished-session-banner"]`)<br>4. `"Today's Protocol"`<br>5. `"Recent Achievements"` (`Total Volume (Lifetime)` separate + 7d Rolling Volume + PR list)<br>6. `"Body Weight Tracker"` (zinc sparkline + latest orange dot)<br>7. `"Routine Library"`<br>8. `"Calendar"` | `Start Session` / `Resume Session` / `Log Rest Day` | Missing 28d strength baseline renders `"Insufficient 28d baseline"` (`—`); 0 evaluated scheduled workouts keeps the 4th card as `Adherence` with `"Building baseline"` and `"Complete 1 scheduled workout"` (never falls back to Lifetime Volume) |
| **Calendar** (`src/components/Calendar.tsx`) | Month-by-month protocol adherence & schedule lookup | 1. Month nav header (`<` / `Month YYYY` / `>`)<br>2. 7-column Mon–Sun grid (colored dot + non-color glyph)<br>3. Dual Legend (`Status:` vs `Routines:`)<br>4. Expandable selected-date detail panel | Tap day to inspect or launch scheduled protocol / jump to History | Non-color status glyphs always accompany color dots: `✓ Completed`, `◐ Incomplete`, `! Missed`, `· Scheduled` (today & future training), `— Rest` (past/today/future rest), blank off-protocol |
| **SessionView** (`src/components/SessionView.tsx`) | Distraction-free intra-workout set logger | 1. Compact sticky workout header (`Finish`)<br>2. Expandable exercise accordions with Ghost Data (Last Session + All-Time PR), Weight/Reps table, Done check, Coach Tip<br>3. Completion Summary (`Session Cleared`) | Mark sets complete → `Finish` | Sets persist synchronously to `gl_active_session` on every keystroke; persistence error keeps draft intact without clearing |
| **HistoryView** (`src/components/HistoryView.tsx`) | Chronological workout logbook, inline correction editor & monthly rollups | 1. `<h1>` `"History"` + Search Bar (`"Search date, routine or exercise…"`)<br>2. Conditional date filter banner<br>3. `"Training Sessions"` expandable log list (with compact indigo `LineChart` per exercise)<br>4. `"Monthly Training Analytics"` collapsed `"Monthly Reports"` toggle | Search/expand/edit session or open Monthly Reports | `"No Workouts Logged Yet"` vs `"No Matching Sessions"` (with `Clear Filters` button); extreme weights (>500 kg) or reps (>100) trigger warning input + confirmation |
| **AnalyticsView** (`src/components/AnalyticsView.tsx`) | Canonical multi-horizon overload, consistency, and balance telemetry | 1. `<h1>` `"Analytics"` + Range segmented control (`7D`/`30D`/`90D`/`ALL`)<br>2. Top hero metrics (`Training Volume`, `Estimated 1RM Progression` indigo AreaChart, `Adherence Rate`, `Performance Score`)<br>3. `01 · Training Activity & Consistency` → `Daily Training Volume` / `Monthly Intensity Heatmap`<br>4. `02 · Training Distribution & Anatomical Load` → `Muscle Group Targeting` (emerald bar chart + frequent exercises) + `Muscle Balance & Recovery`<br>5. `03 · Records & Long-Term Progress` → `Personal Bests` + `Lifetime Summary`<br>6. `04 · Training Patterns & Insights` → `Performance Insights` + `Routine Distribution` + `Training Cadence` | Switch timeframe / E1RM priority lift / heatmap month | Heatmap footer (`Active Days · Skipped · Adherence`) & `aria-label` track the displayed `currentHeatmapMonth` via `selectMonthlyHeatmapSummary`; future/unscheduled months show `— Adherence` |
| **ManageView & Editors** (`ManageView.tsx`, `ProgramEditor.tsx`, `CycleEditor.tsx`, `WorkoutEditor.tsx`, `ExerciseLibrary.tsx`, `ExerciseEditor.tsx`, `AccountSection.tsx`, `DataMaintenanceSection.tsx`, `PrivacyPolicyModal.tsx`) | Routine authoring, exercise repository, cloud sync & local snapshot safety | 1. `ProgramIdentityCard`<br>2. `AccountSection` (Google sync + preview notice)<br>3. `DataMaintenanceSection` (Export, File Import, Paste JSON, Savepoints, Danger Zone)<br>4. Privacy footer & legal modal | `Edit Program` → 8-day `CycleEditor` → `WorkoutEditor` → `ExerciseEditor` (`Save Changes` / `Cancel` bottom row) | Single bottom `Cancel` + `Save Changes` in `ExerciseEditor` (unsaved badge + inline name validation); `WorkoutEditor` updates strictly by array index; `DataMaintenanceSection` validates JSON & surfaces pending cloud retry |

---

## Section B: 8-Check Cognitive-Load Scorecard

| Check Criteria | Dashboard | History | Analytics | Session | Manage & Editors |
|---|---|---|---|---|---|
| 1. **Immediate comprehension (<3s)** | Pass (`Stay Aggressive` + 4 KPIs + Today) | Pass (Search + Sessions first) | Pass (4 numbered category chapters) | Pass (Exercise title + sets/reps + Done) | Pass (`Active Program` + clear sections) |
| 2. **Visual hierarchy (primary metric first)** | Pass (`tabular-nums` KPI row above fold) | Pass (Date & badge before stats) | Pass (`Estimated 1RM` indigo AreaChart focus) | Pass (44px set table & `Finish` CTA) | Pass (Breadcrumb + single bottom save) |
| 3. **Zero redundant metric duplication** | Pass (Adherence kept distinct from Lifetime Volume) | Pass (Collapsed reports below list) | Pass (`Training Cadence` moved under `04`) | Pass (Consolidated PR banner on exit) | Pass (Header duplicate buttons removed) |
| 4. **Logbook density (no card bloat)** | Pass (4-card overview grid, flat list rows) | Pass (Compact expandable session rows) | Pass (Grouped sections with `01`–`04` rules) | Pass (Dense grid set inputs) | Pass (Compact `CycleEditor` slots 1–8) |
| 5. **Calm restrained color discipline** | Pass (Zinc canvas + single brand orange CTA) | Pass (`WORKOUT_COLORS` badges + indigo chart) | Pass (Indigo E1RM, emerald load/heatmap, workout pie) | Pass (Emerald done, amber extreme warning) | Pass (Neutral zinc + orange primary action) |
| 6. **Progressive disclosure of secondary detail** | Pass (Weight history/add collapsible on demand) | Pass (Monthly reports collapsed by default) | Pass (View All Records / Exercises toggles) | Pass (Coach tips & ghost data inside accordion) | Pass (Exercise cues collapsed in `WorkoutEditor`) |
| 7. **Non-ambiguous status cues (color + shape/label)** | Pass (`Building baseline`, active badges) | Pass (`COMPLETED` / `INCOMPLETE` labels) | Pass (Heatmap text + legend + `aria-label`) | Pass (`CheckCircle2` + `Done` count badge) | Pass (`✓ Priority`, `DUPLICATE DAY` amber badge) |
| 8. **Minimal action fan-out per editor/view** | Pass (1 primary protocol CTA) | Pass (Inline edit + verify checkbox) | Pass (1 segmented range + 1 lift selector) | Pass (Finish / Cancel cleanly separated) | Pass (1 `Cancel` + 1 `Save Changes` in `ExerciseEditor`) |

---

## Section C: 0–4 Ten-Heuristic Usability Scorecard

Scale: `0 = unusable`, `1 = major friction`, `2 = acceptable with friction`, `3 = solid`, `4 = refined/benchmark`.

| # | Heuristic | Dashboard | History | Analytics | Session | Manage & Editors |
|---|---|---|---|---|---|---|
| 1 | Visibility of system status | 4 | 4 | 4 | 4 | 4 (`Unsaved Changes`, sync status pill, pending retry) |
| 2 | Match between system & lifter domain | 4 | 4 | 4 | 4 | 4 (8-day protocol, e1RM Epley, Priority/Daily tags) |
| 3 | User control & freedom | 4 | 4 | 4 | 4 | 4 (Breadcrumbs, confirmation abort focus restore) |
| 4 | Consistency & standards | 4 | 4 | 4 | 4 | 4 (Shared `ChartTooltip`, `ProgressBar`, `ToggleChip`, `TYPOGRAPHY`) |
| 5 | Error prevention | 4 | 4 | 3 | 4 | 4 (Verify checkbox, JSON pre-check, index-safe delete) |
| 6 | Recognition rather than recall | 4 | 4 | 4 | 4 | 4 (Calendar glyphs+legend, Ghost PR/Last Session) |
| 7 | Flexibility & efficiency of use | 4 | 4 | 4 | 4 | 4 (Tab state preserved, library picker + quick add) |
| 8 | Aesthetic & minimalist design | 4 | 4 | 4 | 4 | 4 (Single canvas `#09090e`, no shadows/glow fluff) |
| 9 | Help users recognize & recover from errors | 4 | 4 | 3 | 4 | 4 (`role="alert"`, staging auto-recovery, savepoints) |
| 10 | Help & documentation | 3 | 3 | 3 | 3 | 4 (Global vs workout-specific Scope Banners + Privacy modal) |

---

## Section D: 10 End-to-End Task Walkthroughs

1. **First-Visit Daily Protocol Run**: Load `/` cleanly → `Stay Aggressive` + 4 KPIs (`Adherence` shows `—` / `Complete 1 scheduled workout`) → tap `Start Session` → fill Weight/Reps → tap `Check` → tap `Finish` → `Session Cleared` summary → `Dismiss Summary` returns to `COMPLETED TODAY`.
2. **Unfinished Session Guard**: Start Session A (`gl_active_session` saved) → return to Dashboard → Unfinished Session banner renders below the 4 KPIs and above `Today's Protocol` → attempt Session B → single `Discard Unfinished Session?` modal → Abort preserves Session A; Execute clears Session A and starts Session B.
3. **Body Weight Log & Validation**: Enter `-12` or `350` in Body Weight Tracker → error inline shown below input, invalid value preserved for correction → enter `78.5` → sparks neutral zinc polyline with orange latest marker; thin markers prevent dot crowding over long series.
4. **Calendar Inspection & History Jump**: Inspect past completed (`✓`), incomplete (`◐`), missed (`!`), today/future scheduled (`·`), rest (`—`), off-protocol (`blank`) → click logged day → tap detail card CTA → transitions to History filtered cleanly to `YYYY-MM-DD`.
5. **History Search & Monthly Rollup Toggle**: Search `"Push"` or exercise name `"Bench Press"` → expand session row → expand exercise accordion (compact indigo `LineChart` with `ChartTooltip`) → search `"zzzz"` → `"No Matching Sessions"` + `Clear Filters` → expand `Monthly Reports`.
6. **History Session Edit Safety**: Click `Edit session logs` → toggle verification checkbox (explicit `<label for>`) → test extreme set (>500 kg) warning dialog → save persists through `sanitizeSessionLog` + `addLog`.
7. **Analytics Multi-Month Heatmap & Time Range Independence**: Switch `7D` / `30D` / `90D` / `ALL` → top KPIs and `Estimated 1RM` indigo AreaChart update while `Monthly Intensity Heatmap` footer (`Active Days · Skipped · Adherence`) & `aria-label` track the displayed month (`<` / `>`) via `selectMonthlyHeatmapSummary`; future months render `— Adherence`.
8. **Program Authoring Drill-Down**: Manage → `Edit Program` → `CycleEditor` (8 cycle slots `1..8`, malformed review banner if conflicted) → `WorkoutEditor` (edit sets/reps/rest/notes/priority on row N without mutating sibling rows, reorder, remove with confirm) → `ExerciseEditor` (1 `Cancel`, 1 primary `Save Changes` at bottom).
9. **Backup, Restore & Pending Cloud Sync**: Manage → `Create Savepoint` → open `Paste JSON`, submit malformed string → inline JSON error shown, zero state mutation → import valid JSON snapshot → checkpoint created; pending cloud sync banner exposes `Retry Sync`.
10. **Cloud Account & Privacy Modal Keyboard Accessibility**: Signed-out Auth error surfaces via `role="alert"`; open `Privacy Policy & Data Safety` → Tab cycles inside modal → Escape closes modal and restores focus to trigger button; Cloud status popover in header also restores focus on Escape.

---

## Section E: 12-Row Interaction-State Matrix

| # | State | Expected Behavior & UI Contract | Verified Component(s) |
|---|---|---|---|
| 1 | **Initial / First-Run Empty** | Explicit instructive `EmptyState` or `Unavailable` message (`Complete 1 scheduled workout`, `No Workouts Logged Yet`, `No restore points available`) | `Dashboard`, `HistoryView`, `AnalyticsView`, `DataMaintenanceSection`, `ProgramIdentityCard` |
| 2 | **Search-Empty** | Distinct from data-empty; offers direct `Clear Filters` or `+ New Exercise` recovery CTA | `HistoryView`, `ExerciseLibrary`, `WorkoutEditor` |
| 3 | **Metric Unavailable vs Zero** | `Strength Progress` / `Adherence` / `Avg Training Gap` never coerce insufficient baseline into `0%` or substitute unrelated metrics | `Dashboard`, `AnalyticsView`, `StatCard` |
| 4 | **Field Validation Error** | Inline error border + `role="alert"` message (`Exercise name is required.`, body weight 20–300 kg bounds, JSON parse error) retaining user input | `ExerciseEditor`, `Dashboard`, `DataMaintenanceSection` |
| 5 | **Async Write / Auth Error** | Error surfaces inline or via global Alert Banner (`role="alert"` / `retryAccountReset`); no false-positive success toast/haptic; button resets loading spinner | `AccountSection`, `Dashboard`, `Layout` |
| 6 | **Offline / Pending Sync** | Local-first mutations remain instant; Sync popover/section communicates offline queueing & `Retry Sync` CTA cleanly | `Layout`, `AccountSection`, `DataMaintenanceSection` |
| 7 | **Modal & Confirmation Focus Trap** | `Dialog` sets `aria-modal="true"`, traps Tab/Shift+Tab, cancels on Escape/backdrop, restores `overflow` & opener focus | `Dialog`, `ConfirmContext`, `PrivacyPolicyModal` |
| 8 | **Re-entrancy / Double-Submit Guard** | Weight submit and `AccountSection` `handleLogin` / `handleLogout` ignore duplicate clicks while request is in flight | `AccountSection`, `Dashboard` |
| 9 | **Responsive Geometry (320px–1280px)** | Zero horizontal overflow (`scrollWidth <= clientWidth`), non-colliding axis ticks, 44px touch targets on primary mobile controls | `Layout`, `HistoryView`, `AnalyticsView`, `SessionView`, `ManageView` |
| 10 | **Reduced Motion (`prefers-reduced-motion: reduce`)** | `MotionConfig` & `useReducedMotion()` short-circuit entrance/collapse transitions (`duration: 0`, no layout-thrashing scale) | `Layout`, `SessionView`, `WorkoutEditor`, `ManageView`, `Dialog` |
| 11 | **Touch & Hover Tooltips** | Recharts charts use single `<ChartTooltip>` surface without native `contentStyle`; calendar/heatmap cells include full `aria-label` | `AnalyticsView`, `HistoryView`, `ChartTooltip` |
| 12 | **Corrupt Local Storage / Runtime Boundary** | Staging fallback recovers `gl_snapshot_staging` or quarantines corrupt payload; fatal React render errors caught cleanly with recovery actions | `useFitnessData`, `E2EErrorBoundary` |

---

## Section F: Verification Evidence Classification

| Evidence Class | Scope Covered | Execution Status & Honest Boundary |
|---|---|---|
| **1. Implemented in Source** | Dashboard 4-KPI ordering, Calendar full status glyphs & legends, History search placeholder, Analytics `Daily Training Volume` & `selectMonthlyHeatmapSummary` & Section `04` Cadence move, `ExerciseEditor` single bottom `Cancel`/`Save Changes`, `WorkoutEditor` index-based row handlers, `AccountSection` & `DataMaintenanceSection` hardening | Completed across `src/components/*`, `src/hooks/*`, `src/utils/*`, `src/styles/tokens.ts` |
| **2. Automated Unit & Component Tests Passed** | `npm test` (`npx vitest run`): all regression suites including `dashboardRegression.test.tsx` (9 ordering/KPI checks), `uiRefinementRegression.test.tsx` (charts, calendar glyphs/legends, heatmap multi-month, History search, ExerciseEditor actions), `manageRegression.test.tsx` (WorkoutEditor index isolation, CycleEditor, ExerciseLibrary, AccountSection, DataMaintenanceSection), `colorTokenIntegrity.test.ts`, `designSystemRegression.test.ts` | Re-executed cleanly after final code changes (check CI / command output log in delivery summary) |
| **3. Static Type, Unused & Token Gate Passed** | `npm run design:check:static` (`tsc --noEmit`, `--noUnusedLocals --noUnusedParameters`, design system/UI/Manage regression suites) + `npm run build` | Re-executed cleanly after final code changes |
| **4. Browser E2E, Axe-Core & Visual Screenshots (`e2e/design-quality.spec.ts`)** | `@axe-core/playwright` scans across Dashboard, History, Analytics, Manage (+ sub-editors), Session, Modals; 7 viewport overflow checks (320–1280px); `toHaveScreenshot()`; Escape/focus/reduced-motion/History flows; `.github/workflows/ci.yml` `"Design Quality & Accessibility"` job | Executed / diagnosed in container (see final verification report for Chromium binary availability in this sandbox vs GitHub Actions CI runner) |
| **5. Physical Android Device Verification** | Capacitor APK visual inspection & hardware keyboard/IME check on physical Android handset | **Not physically verified** — Android SDK/Gradle and physical Android device are unavailable inside this cloud container; debug APK builds cleanly via GitHub Actions CI |
