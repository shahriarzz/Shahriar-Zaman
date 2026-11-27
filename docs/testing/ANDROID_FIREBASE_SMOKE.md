# GAINLOG Android WebView Firebase Smoke-Test Checklist

> **Scope Note**: The CI `android-build` job (`./gradlew assembleDebug`) validates native Android compilation and Capacitor packaging only. It does **not** launch the APK, attach a WebView, or verify Firebase Auth redirects, Firestore sync, or local storage behavior at runtime.

---

## Pre-Test Safety Requirements

- Use a **dedicated non-production test Firebase project** with Google Sign-In enabled and SHA-1/SHA-256 fingerprints registered for the debug/test build.
- **Never** configure a shipping or release APK (`assembleRelease` / `bundleRelease`) to target local emulator hosts (`127.0.0.1` / `localhost` / `10.0.2.2`), and **never** embed test credentials or `e2eEntry` test harnesses in Android Web assets (`dist/`).
- Target device: Physical Android device via ADB or Android Emulator with Google Play Services.

---

## Manual Smoke-Test Checklist

- [ ] **1. Fresh Install & First Launch**
  - Install clean APK on device/emulator (clear app data if reinstalling).
  - Verify app boots past native SplashScreen into Dashboard with default 8-day routines initialized and StatusBar styling applied cleanly.

- [ ] **2. Android WebView Google Sign-In Boundary Notice**
  - Navigate to **Manage -> Cloud Account**.
  - Verify the inline `Android Sign-In Notice` informs users that embedded WebView sessions block Google OAuth unless a native Google Sign-In plugin is bundled, and tapping **Sync with Google** produces a clean `role="alert"` error message without launching a failing `403 disallowed_useragent` redirect or crashing.

- [ ] **3. Local-First Continuity & Redirect Return State**
  - Prior to and after attempting sign-in on Android (or after completing OAuth in a supported web browser / native OAuth build), confirm local logs, body-weight entries, and custom routines remain completely intact and unaffected.

- [ ] **4. Close & Relaunch App (Auth Persistence)**
  - Swipe the app closed from Android Recents (not force-stop) and relaunch.
  - Verify Firebase Auth session persists (`browserLocalPersistence` / WebView storage) and user remains signed in cleanly.

- [ ] **5. Complete a Workout & Verify Cloud Sync**
  - Start today's scheduled protocol, log completed sets, and press **Finish**.
  - Verify the session summary displays, Dashboard updates to `COMPLETED TODAY`, and `/users/{uid}/logs/{logId}` + updated `cycleStart` appear in the test Firebase project's Firestore console.

- [ ] **6. Background Mid-Session & Verify Draft Survival**
  - Start a new session, enter weight/reps on a set, mark one set done, then press Home / switch apps to background Android WebView for at least 10 seconds.
  - Return to GAINLOG and verify the active session sets and elapsed timer remain intact in `gl_active_session`.

- [ ] **7. Account Switching & Data Isolation**
  - Sign out via **Manage -> Sign Out**, then sign in with a second Google test account (Account B).
  - Verify Account A's logs, body weight entries, and IndexedDB restore checkpoints are completely absent from Account B's UI and Firestore paths; switch back to Account A and confirm Account A's cloud data restores.

- [ ] **8. Offline Session Logging & Reconnection**
  - Enable Airplane Mode on Android.
  - Complete a workout or log body weight; verify local persistence succeeds immediately without blocking UI and sync status indicates offline/failed cloud write.
  - Disable Airplane Mode and trigger reconnection / **Retry Sync**; verify offline records flush to Firestore cleanly.

- [ ] **9. Backup Restore & Recovery**
  - Create a manual savepoint in **Manage -> Data & Maintenance**, modify state, then restore that savepoint.
  - Verify local state reverts immediately, IndexedDB savepoints survive app restarts, and cloud state reconciles (or recovers via **Retry Cloud Sync** banner if interrupted offline).

- [ ] **10. Force-Stop & Relaunch Consistency**
  - Open Android App Info -> **Force stop**, then relaunch GAINLOG.
  - Verify Auth session, canonical `gl_database_snapshot`, IndexedDB savepoints, and any active session draft load without corruption or duplicate session logs.

---

## Sign-Off Record

| Build / Version | Device / Android API | Test Firebase Project | Tester | Date | Result |
|---|---|---|---|---|---|
| *(fill on execution)* | *(e.g., Pixel 7 API 34)* | *(dedicated test project ID)* | | | `NOT YET PERFORMED` |
