# PROFILING.md — Physical Android Device Profiling Guide for GAINLOG

This document defines the standardized profiling protocol for measuring GAINLOG's runtime responsiveness, memory footprint, and Android rendering behavior on physical devices.

> **Calibration Notice**: All absolute timing/memory numbers listed in Section 2 are **provisional reference targets** pending empirical calibration on your target hardware. Compare every build against a recorded baseline on the same device configuration using median and p95 deltas.

---

## 1. Prerequisites & Required Run Metadata

- **Device**: Physical Android device running Android 10 (API 29) or higher (recommended: mid-range 4GB–6GB RAM baseline device + optional high-refresh 120Hz device).
- **Developer Options**:
  - `USB Debugging` enabled.
  - `Profile HWUI Rendering` -> `On screen as bars` (visualizes Android UI thread + RenderThread jank).
  - `Show refresh rate` -> enabled.
- **Host Tools**:
  - Google Chrome (`chrome://inspect/#devices`) for **WebView JavaScript & DOM/Layout** profiling.
  - Android Studio Profiler & `adb` for **Native Android Frame Timing & Resident Memory** profiling.

### Mandatory Run Metadata Record (Capture for Every Profiling Session)
Record the following block alongside every benchmark run:

```yaml
date_utc: YYYY-MM-DDTHH:MM:SSZ
device_model: "<e.g., Pixel 6a / Galaxy A54>"
soc_ram: "<e.g., Tensor / 6GB LPDDR5>"
android_os: "<e.g., Android 14 (API 34)>"
webview_version: "<from chrome://inspect or Android System WebView>"
display_refresh_hz: 60 # or 120
apk_variant: release # release (preferred) or debug (note debug overhead)
dataset_logs: <count e.g. 5000>
git_commit: "<sha>"
```

---

## 2. Measurement Methodology & Separation of Metrics

### Trial & Aggregation Rules
- Execute **at least 5 repeated trials (`n >= 5`)** per scenario after a warm-up launch.
- Report **median** and **p95** (and optionally IQR/range) rather than single-run numbers or arithmetic means.

### Strict Separation: WebView JS vs Android Native Frame Timing
Do not conflate WebView main-thread JS work with Android compositor/RenderThread frame pacing:

1. **WebView JS Execution & Layout** (Chrome DevTools Performance & Memory tabs via `chrome://inspect`):
   - Measures pure TypeScript/React commit duration, long tasks (`> 50ms`), forced synchronous reflows, `localStorage` persistence time, and JS heap growth.
2. **Android Native Frame Timing** (`adb shell dumpsys gfxinfo com.gainlog.app framestats` & HWUI bars):
   - Measures total UI + RenderThread frame completion against hardware VSync cadence (`16.6ms` at 60Hz, `8.3ms` at 120Hz), catching WebView compositor stalls and SurfaceFlinger frame drops.

---

## 3. Repeatable 10-Point Profiling Checklist

For each scenario, run `n >= 5` trials and evaluate against both the **provisional reference target** and **baseline regression delta** (`<= +10%` p95 regression on same device):

### 1. Cold Application Launch
- **Action**: `adb shell am force-stop com.gainlog.app`, launch from home screen.
- **Provisional Target**: Time to First Meaningful Paint (TTFMP) `< 800ms` (baseline-relative: within `+10%` of baseline p95); initial JS heap `< 45MB`.

### 2. Dashboard First Render & Widget Hydration
- **Action**: Observe initial mount of cycle card, today's protocol card, and streak stats.
- **Provisional Target**: `buildFitnessIndex` + selector derivation (`WebView JS`) completes in `< 15ms` at 1,000 logs without blocking frame commit.

### 3. Rapid Tab Navigation (Dashboard ↔ History ↔ Analytics ↔ Manage)
- **Action**: Switch between tabs continuously (1 tap every 300ms for 10 cycles).
- **Provisional Target**: Sustained VSync pacing under active display budget (`< 16.6ms` p95 on 60Hz; `< 8.3ms` p95 on 120Hz); zero shell over-rendering.

### 4. Active Workout Session Start
- **Action**: Tap "Start Session" on today's scheduled workout.
- **Provisional Target**: Route transition completes `< 100ms` (WebView JS); draft mounts cleanly without dropped frames.

### 5. High-Frequency Set & Rep Input
- **Action**: Type weight/reps, toggle set completion checkboxes, add sets.
- **Provisional Target**: Input-to-commit duration (`WebView JS`) stays within single-frame budget (`< 16.6ms` at 60Hz / `< 8.3ms` at 120Hz); zero forced reflows; haptics fire promptly without jank.

### 6. Workout Session Finish & Durable Commit
- **Action**: Tap "Finish Session", confirm dialogs if shown, await Session Summary.
- **Provisional Target**: Local staged commit (`persistFitnessDatabase()`) + draft clear completes `< 250ms` p95 on 5,000-log dataset; `finishInFlightRef` blocks double submission cleanly.

### 7. History Filter & Search Interaction
- **Action**: Scroll 500+ historical logs, toggle workout filters, type search terms.
- **Provisional Target**: Zero long tasks `> 50ms` during typing/scrolling; p95 frame time stays within refresh budget.

### 8. Analytics Range Switching (7d ↔ 30d ↔ 90d ↔ 1y ↔ All)
- **Action**: Toggle analytics windows; observe charts and muscle radar updates.
- **Provisional Target**: Selector re-aggregation (`WebView JS`) completes `< 10ms` p95 cleanly; chart redraw remains within refresh budget.

### 9. App Backgrounding & Foreground Restoration
- **Action**: Background active session (Home button), wait 60 seconds, foreground app.
- **Provisional Target**: Active draft (`gl_active_session`) preserved intact; zero duplicate timers or retained listener leaks across background cycles.

### 10. Large Dataset Hydration, Backups & Account Isolation
- **Action**: Restore or import a 5,000+ log JSON backup, or switch user accounts.
- **Provisional Target**: IndexedDB checkpointing completes cleanly within heap bounds; no cross-account leakage; storage errors trigger quarantine/recovery banners without silent failure.

---

## 4. Chrome DevTools & ADB Commands

### Chrome Remote Inspection (WebView JS & Heap)
1. Open `chrome://inspect/#devices` -> inspect `com.gainlog.app`.
2. Record a **Performance** trace during Session Finish & Rapid Set Input:
   - Inspect **Long Tasks (`> 50ms`)** and **Forced Reflow** warnings separately from native frame timings.
3. Capture **Memory Heap Snapshots** before and after 10 session start/exit cycles:
   - Verify 0 detached DOM trees and 0 leaked `FitnessContext` subscriptions.

### ADB Commands (Android Frame Stats & Resident Memory)
```bash
# Reset and collect Android frame rendering stats
adb shell dumpsys gfxinfo com.gainlog.app reset
# ... run >= 5 scenario trials ...
adb shell dumpsys gfxinfo com.gainlog.app framestats

# Inspect native + WebView process memory
adb shell dumpsys meminfo com.gainlog.app

# Monitor Capacitor & persistence logs
adb logcat -s "Capacitor" "Capacitor/Console"
```

---

## 5. Refresh-Rate-Specific Passing Criteria

- **60Hz Display Budget**: Android `framestats` 95th percentile frame duration **`< 16.6ms`** (baseline-relative delta `<= +10%`).
- **120Hz Display Budget**: Android `framestats` 95th percentile frame duration **`< 8.3ms`** (baseline-relative delta `<= +10%`).
- **WebView JS Long Tasks**: `0` main-thread long tasks `> 50ms` during steady-state set input and tab switching.
- **Memory & Durability**: Resident memory (`dumpsys meminfo`) remains bounded without monotonic leak growth across repeated cycles (`< 90MB` provisional reference on 5,000-log profile), with zero data loss across background kill/restart cycles.
