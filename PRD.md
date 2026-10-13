# PRD.md — Product Requirements Document for GAINLOG

> **Target Repository**: [Shahriar-Zaman/gainlog](https://github.com/shahriarzz/Shahriar-Zaman)  
> **Status**: Active Product Contract  
> **Audience**: Product Engineers, AI Assistants, and Maintainers  
> **Authority**: Defines user needs, feature specifications, workout protocols, and non-goals.

---

## 1. Executive Summary & Product Philosophy

GAINLOG is a local-first, distraction-free strength training log designed for serious lifters seeking consistent progressive overload.

### Guiding Principles
1. **Local-First Speed & Privacy**: Every feature works completely offline without network lag or mandatory login. User data belongs entirely to the lifter and lives in local storage by default.
2. **Zero-Fluff Discipline**: No algorithmic social feeds, no public leaderboards, no pushy notification spam, and no paywalls. The UI is built for fast logging during heavy training sessions.
3. **Evidence-Based Progressive Overload**: Tracks estimated 1-Rep Max (e1RM), total volume, set-by-set performance, and personal records with mathematical precision.
4. **Structured Periodization**: Centers on an 8-day undulating training split that accounts for recovery days naturally.

---

## 2. Target Personas & User Journeys

### Primary Persona: The Dedicated Strength Athlete
- **Profile**: Intermediate-to-advanced lifters, powerlifters, or hypertrophy-focused athletes training 4–6 days per week.
- **Pain Points with Existing Apps**: Cluttered social feeds, aggressive subscription modals, complex logging flows that slow down rest periods, and apps that fail without an internet connection.
- **Core Goal**: Rapidly record completed weights and reps, see previous benchmarks instantly, track rest timers, and monitor objective strength progression over 30-day windows.

### Primary User Journeys

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Starting a Workout                                                  │
│    Open app ──► View today's scheduled cycle workout on Dashboard      │
│             ──► Tap "Start Workout" ──► Pre-populated Session View    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Executing Sets & Rest                                               │
│    Enter Weight & Reps ──► Check "Done" ──► Rest timer starts with     │
│    audio/haptic cue ──► Live PR banner if previous best exceeded       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Completing the Workout                                              │
│    Tap "Finish Workout" ──► Synchronous snapshot verification          │
│    ──► Completion Summary shows volume, total sets, and PR events      │
│    ──► Cycle anchor advances ──► Optional Firestore cloud sync         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Analyzing Progress & Review                                         │
│    Review History drill-down ──► Check 28-day adherence & 30-day       │
│    Performance Score in Analytics ──► Export JSON vault in Manage      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Feature Specifications

GAINLOG is navigated via a permanent bottom navigation bar featuring 6 primary views:

```
┌────────────────────────────────────────────────────────────────────────┐
│                            GAINLOG Views                               │
├─────────────┬───────────┬───────────┬───────────┬──────────┬───────────┤
│  Dashboard  │  Session  │  History  │ Analytics │ Calendar │  Manage   │
└─────────────┴───────────┴───────────┴───────────┴──────────┴───────────┘
```

### 3.1 Dashboard (`src/components/Dashboard.tsx`)
- **Today's Scheduled Session**: Identifies the expected workout according to the 8-day cycle and current date.
- **Cycle Status Indicator**: Displays active cycle day (e.g. "Day 1 of 8: Push A" or "Day 4 of 8: Recovery").
- **Quick Action**: Single-tap button to start the scheduled workout or resume an active session.
- **Training Frequency & Streak**: High-level indicator of active consecutive adherence across workouts and rest days.
- **Recent Milestones**: High-level recap of recent volume and newly established PRs.

### 3.2 Session Execution (`src/components/SessionView.tsx`)
- **Active Session Draft State**: Persists live workout progress in `gl_active_session`. Navigating away or refreshing does not lose entered sets or elapsed time.
- **Exercise List & Set Check-Off**:
  - Displays prescribed target sets, target reps, target weights, and RPE cues.
  - Tapping the "Done" checkmark marks the set complete and automatically triggers the rest timer.
- **Integrated Rest Timer**:
  - Countdown timer with presets (60s, 90s, 120s, 180s) and custom duration adjustments.
  - Configurable sound alert (`restTimerSound`) and haptic vibration (`restTimerVibrate`).
- **PR Detection**:
  - Detects weight and e1RM PRs during set completion compared against the pre-session canonical index.
  - Emits real-time visual feedback when a benchmark is shattered.
- **Completion Flow**:
  - "Finish Workout" button requires explicit confirmation.
  - Synchronously writes and verifies local database snapshot (`gl_database_snapshot`) before clearing the active draft.
  - Presents a Post-Workout Summary displaying duration, total volume (kg), completed sets, and new PRs achieved.

### 3.3 History (`src/components/HistoryView.tsx`)
- **Chronological Log Listing**: Reverse-chronological list of all completed workouts grouped by month and date.
- **Exercise Identity Resolution**: Resolves exercise IDs to canonical definitions via `src/utils/exerciseResolver.ts`. If an exercise was deleted, falls back gracefully to "Unknown Exercise" without crashing.
- **Detailed Drill-Down**: Tapping any workout expands the set-by-set breakdown (set number, weight lifted, reps completed, RPE, and warmup flags).
- **Log Management**: Allows editing workout notes or deleting accidentally recorded logs (with confirmation).

### 3.4 Analytics & Intelligence (`src/components/AnalyticsView.tsx`)
- **28-Day Training Frequency**: Visualizes workout density across rolling 4-week periods.
- **Protocol Adherence**: Calculates percentage compliance with scheduled workouts vs missed days.
- **Active Streak**: Tracks continuous days of adherence, treating canonical recovery days as valid streak continuation.
- **Progressive Overload Trends**: Graphs estimated 1-Rep Max (e1RM) progression per exercise across time.
- **Performance Score**:
  - Multi-factor score evaluating volume, intensity, frequency, and progressive overload over a rolling 30-day window compared to the preceding 30-day baseline.
  - Strict semantic handling: Displays `available: false` ("Data unavailable") when training history is insufficient, never falsely rendering score `0`.

### 3.5 Calendar (`src/components/Calendar.tsx`)
- **Monthly Grid Visualizer**: Full monthly calendar displaying completed workouts, rest days, and missed workouts with distinct status indicators.
- **8-Day Cycle Projection**: Shows past and projected cycle days across the month based on `appState.cycleStart`.
- **Day Inspector**: Tapping any calendar day filters and displays workouts logged on that specific date.

### 3.6 Manage & Vault (`src/components/ManageView.tsx`)
- **Custom Exercise Library**: Search, add, edit, or delete custom exercise definitions with category and equipment tags.
- **Workout Routine Editor**: Customize sets, exercises, target reps, and rest timers for the 8 cycle workouts or create bonus routines.
- **Cycle Editor**: Modify the anchor date (`appState.cycleStart`) to re-sync the training schedule.
- **Data Vault**:
  - **Export JSON**: Download a complete, uncompressed backup of all exercises, routines, logs, and settings.
  - **Import JSON**: Validate and restore data from an existing backup with full two-phase staging safety.
  - **Reset to Defaults**: Clear all records and restore initial canonical data.
- **Cloud Account**: Firebase Auth sign-in/sign-out to sync data across devices.

---

## 4. The 8-Day Undulating Split Protocol

GAINLOG implements an evidence-based 8-day training cycle:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        The 8-Day Undulating Split                      │
├───────┬────────────┬───────────────────────────────────────────────────┤
│ Day 1 │ Push A     │ Chest, Front Delts, Triceps (Strength emphasis)   │
│ Day 2 │ Pull A     │ Lats, Upper Back, Biceps (Strength emphasis)      │
│ Day 3 │ Hybrid A   │ Quads, Hamstrings, Shoulders, Core                │
│ Day 4 │ Recovery 1 │ Active Rest / Mobility (Natural Calendar Advance) │
│ Day 5 │ Push B     │ Chest, Delts, Triceps (Hypertrophy / Volume)      │
│ Day 6 │ Pull B     │ Back, Rear Delts, Biceps (Hypertrophy / Volume)   │
│ Day 7 │ Hybrid B   │ Lower Body, Posterior Chain, Arms                 │
│ Day 8 │ Recovery 2 │ Full Rest / Recovery (Natural Calendar Advance)   │
└───────┴────────────┴───────────────────────────────────────────────────┘
```

### Protocol Advancement Rules
1. **Natural Rest Day Advancement**: Recovery days (Day 4 and Day 8) advance automatically with calendar days. The athlete does not need to record a dummy log to progress through rest days.
2. **Anchor Realignment for Out-of-Order Workouts**: If an athlete logs Day 5 (Push B) when the cycle expects Day 1, completing Day 5 automatically realigns `appState.cycleStart` so future projections match the newly executed day.
3. **Bonus / Custom Workouts Isolation**: Workouts designated as non-core (`isCore: false`) can be performed on any day without disturbing the 8-day cycle anchor.

---

## 5. Personal Record (PR) Rules

1. **Pre-Session Baseline Comparison**: PRs achieved during a session are evaluated exclusively against the pre-session canonical index. Completing multiple sets within the same session does not create a chain of self-referential PRs.
2. **Dual-PR Consolidation (One-Visible-Event Rule)**: If a single set breaks both the absolute **Weight PR** and the calculated **e1RM PR**, the UI consolidates these into **exactly one visible PR event** per exercise in the session summary.
3. **Warmup Exclusion**: Sets flagged as `isWarmup: true` are excluded from PR calculations and volume aggregations.

---

## 6. Explicit Non-Goals & Prohibitions

To preserve user focus and application stability, the following are strictly out-of-scope:
- **No Social Networking**: No follower feeds, user profiles, comments, or shared workout timelines.
- **No Monetization / Subscriptions**: No paywalled analytics, locked routine slots, or premium tiers.
- **No AI Chatbots / Conversational Interfaces**: No conversational assistants or LLM chat windows embedded in the app.
- **No Third-Party Analytics Tracking**: Zero Google Analytics, Facebook Pixel, or telemetry trackers.
