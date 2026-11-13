# PROFILING.md — Physical Android Device Profiling Guide for GAINLOG

This document outlines the standardized, repeatable profiling protocol for verifying GAINLOG's runtime performance, memory boundaries, and frame pacing on physical Android devices.

---

## 1. Prerequisites & Equipment

- **Device**: Physical Android device running Android 10 (API 29) or higher (recommended: mid-range device with 4GB–6GB RAM to simulate baseline performance).
- **USB Cable**: High-speed data cable connected to development machine.
- **Developer Options**:
  - `USB Debugging` enabled.
  - `Profile HWUI Rendering` -> set to `On screen as bars` (visual frame drops).
  - `Show refresh rate` -> enabled.
- **Host Tools**:
  - Google Chrome (DevTools inspection at `chrome://inspect`).
  - Android Studio Profiler (CPU, Memory, and Energy profilers).
  - Android Debug Bridge (`adb`).

---

## 2. Repeatable 10-Point Profiling Checklist

Execute these 10 scenarios in sequence while monitoring frame time, memory footprint, and CPU spikes:

### 1. Cold Application Launch
- **Action**: Force stop GAINLOG (`adb shell am force-stop com.gainlog.app`), launch from home screen.
- **Target**: Time to First Meaningful Paint (TTFMP) < 800ms. No white flash; splash screen transitions cleanly to Dashboard.
- **Metric**: Memory heap initial allocation < 45MB.

### 2. Dashboard First Render & Widget Hydration
- **Action**: Observe initial load of cycle indicators, today's workout card, and streak statistics.
- **Target**: Zero jank. Calculation of canonical derived index must happen off the main animation frame or complete in < 15ms.

### 3. Rapid Tab Navigation (Dashboard ↔ Workouts ↔ History ↔ Analytics ↔ Profile)
- **Action**: Switch between all 5 bottom tabs in rapid succession (1 tap every 300ms for 10 cycles).
- **Target**: 60fps / 120fps sustained frame pacing without frame drops. Re-renders must be isolated to tab content.

### 4. Active Workout Session Start
- **Action**: Tap "Start Session" on today's scheduled workout.
- **Target**: Session transition completes in < 100ms. Draft is synchronously mounted; background prewarming initializes cleanly without dropped frames.

### 5. High-Frequency Set & Rep Input
- **Action**: Enter weight (e.g., `82.5`) and reps (e.g., `8`), tap set checkmark, tap "Add Set", adjust inputs.
- **Target**: Keystroke latency < 16ms (single frame). No layout thrashing. Set completion haptic fires within 10ms of touch without UI freeze.

### 6. Workout Session Finish & Durable Commit
- **Action**: Tap "Finish Session", confirm any abnormal dialogs, await confirmation screen.
- **Target**: Synchronous lock acquisition (`finishInFlightRef`); synchronous local snapshot commit (`persistFitnessDatabase()`); draft deletion occurs only *after* verified persistence. Time from tap to summary < 250ms.

### 7. History Filter & Search Interaction
- **Action**: In History tab, scroll through 500+ past logs, toggle workout filters (Push, Pull, Legs), type in search filter.
- **Target**: Smooth 60fps scrolling. Filter debounce and memoized selection keep CPU utilization under 20%.

### 8. Analytics Range Switching (7d ↔ 30d ↔ 90d ↔ 1y ↔ All)
- **Action**: Toggle time ranges on Analytics tab; observe volume chart and radar muscle distribution redraws.
- **Target**: Re-aggregation of index across historical data completes in < 10ms. Recharts animations execute fluidly without thread blocking.

### 9. App Backgrounding & Foreground Restoration
- **Action**: While an active session is in progress, background app (press Home), wait 60 seconds, reopen.
- **Target**: Active session state preserved intact (`gl_active_session`); no duplicate timers or stale state. Memory must not leak while backgrounded.

### 10. Large Dataset Hydration & Database Quarantine Recovery
- **Action**: Restore a backup containing 5,000+ session logs or simulate local quota handling.
- **Target**: IndexedDB batch read/write completes cleanly; snapshot staging commits without exceeding heap limits. If storage error occurs, recovery quarantine safely captures snapshot.

---

## 3. Chrome DevTools & Android Studio Profiling Commands

### Chrome Remote Inspection
1. Open Chrome on host machine: `chrome://inspect/#devices`.
2. Locate `com.gainlog.app` WebView.
3. Open **Performance** tab -> Record 5-second trace during Session Finish:
   - Check Long Tasks (> 50ms): Target = 0 long tasks during active workout logging.
   - Check Forced Reflow / Recalculate Style: Target = 0 occurrences during set completion.
4. Open **Memory** tab -> Take Heap Snapshot before and after 10 session starts:
   - Verify detached DOM trees count = 0.
   - Verify closure leaks for `FitnessContext` listeners = 0.

### ADB Memory & Jank Tracking
```bash
# Measure frame drops and jank
adb shell dumpsys gfxinfo com.gainlog.app framestats

# Inspect heap memory allocation
adb shell dumpsys meminfo com.gainlog.app

# Monitor logcat for storage or capacitor errors
adb logcat -s "Capacitor" "Capacitor/Console"
```

---

## 4. Passing Criteria
- 95th percentile frame rendering time < 16.6ms (60Hz) or < 8.3ms (120Hz).
- Zero dropped frames during active session timer ticks.
- Total resident memory < 90MB on a 5,000-log profile.
- Zero data loss across background kill and restart cycles.
