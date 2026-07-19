# AI-OS Orchestrator — Error Log

Chronological incident log for product issues and task-execution failures. Newest entries at the bottom of each section. Read relevant entries before debugging build, native-bridge, or Android capability issues.

---

## 2026-07-19 — Android Gradle build fails: "Unable to establish loopback connection"

- **Area**: Build / Tooling
- **Symptoms**: `npm run android` (and any `gradlew` invocation) failed immediately with
  `java.io.IOException: Unable to establish loopback connection`, caused by
  `java.net.SocketException: Invalid argument: connect` inside
  `sun.nio.ch.UnixDomainSockets.connect0`. Failed identically across Temurin JDK 17 and
  Android Studio's JBR 21, from both Git Bash and PowerShell, with and without `--no-daemon`.
- **Root cause**: AF_UNIX (Unix domain socket) `connect()` calls fail with `WSAEINVAL` when the
  socket file lives under this machine's user temp folder `C:\Users\<user>\AppData\Local\Temp`,
  but succeed under `C:\Windows\Temp`. Modern JVMs implement `java.nio.channels.Selector.open()`
  on Windows using an internal AF_UNIX loopback pipe created in `java.io.tmpdir`, so every
  Selector-dependent operation (Gradle's daemon handshake, Metro, etc.) broke. Reproduced with a
  bare 5-line Java program calling `Selector.open()` and independently with a .NET
  `UnixDomainSocketEndPoint` test — confirming it is an OS/environment issue in that specific temp
  directory, not JDK- or Gradle-specific. Likely an endpoint-security / file-system filter driver
  scoped to the user temp path. `-Djava.io.tmpdir=...` did NOT fix it (native pipe code reads the
  `TEMP`/`TMP` environment variables, not the JVM property).
- **Solution**: Point the build's temp env vars at the working directory. `mobile/package.json`
  `android` script now runs through `cross-env`:
  `cross-env TMP=C:\\Windows\\Temp TEMP=C:\\Windows\\Temp expo run:android`.
- **Validation**: `npm run android` builds `app-debug.apk`, installs `com.ntsinga.mobile`, and
  launches on the Pixel_6a emulator. Verified the fix works even when the parent shell exports the
  broken `AppData\Local\Temp` path, proving the script is self-contained.
- **Lessons**:
  - `Unable to establish loopback connection` on Windows Gradle is usually an AF_UNIX/temp-dir
    problem, not a network/VPN/firewall problem. Isolate it with a bare `Selector.open()` Java
    program before touching Winsock, VPN, or system settings.
  - It is NOT fixed by `-Djava.io.tmpdir`; override the `TEMP`/`TMP` environment variables.
  - Do not chase red herrings (duplicate Winsock AF_UNIX catalog entries, ProtonVPN, reboots) —
    none of those changed the result here. The deterministic signal was the per-directory
    AF_UNIX socket test (`C:\Windows\Temp` works, user temp fails).

---

## 2026-07-19 — get_installed_apps returns only a partial app list (Android 11+ package visibility)

- **Area**: Native Bridge / Android
- **Symptoms**: The `get_installed_apps` tool returned only 8 apps and was missing obviously-present
  launcher apps (Chrome, Gmail, YouTube, Maps, Messages, Contacts, Calendar, etc.) that were
  clearly visible in the emulator's app drawer.
- **Root cause**: Android 11 (API 30)+ enforces package visibility filtering. An app's
  `PackageManager.queryIntentActivities(ACTION_MAIN/CATEGORY_LAUNCHER)` only returns packages the
  app can "see", and by default it cannot see most other installed apps unless it declares them in
  a `<queries>` element in `AndroidManifest.xml`. The manifest only declared a `<queries>` intent
  for browsable HTTPS links, so the launcher query was silently filtered down to a small subset.
- **Solution**: Added a `<queries>` intent for `ACTION_MAIN` + `CATEGORY_LAUNCHER` in
  `mobile/android/app/src/main/AndroidManifest.xml`. App count went from 8 to 21 and matches the
  real app drawer.
- **Validation**: Rebuilt, relaunched, tapped "Run tool" — list now shows Calendar, Camera, Chrome,
  Clock, Contacts, Drive, and the rest, matching the emulator drawer.
- **Lessons**:
  - Any Android capability tool that enumerates OTHER apps/components (installed apps, share
    targets, resolvable intents) on API 30+ needs matching `<queries>` declarations, or it will
    silently return an incomplete result with no error. Future tools like `open_application`,
    `search_installed_apps`, and share/intent tools must declare the intents they query.
  - The Android native project under `mobile/android/` is hand-authored (Kotlin modules committed
    directly), not regenerated on every build, and `app.json` does not manage this `<queries>`
    block — so edit `AndroidManifest.xml` directly. If `expo prebuild` is ever re-run it may
    overwrite this; re-apply the launcher `<queries>` intent afterward (or move it into an Expo
    config plugin).

---

## 2026-07-19 — open_application "fails" on Calendar (launched app's own onboarding blocks)

- **Area**: Native Bridge / Android (NOT a bug — expected behavior, logged to avoid re-diagnosis)
- **Symptoms**: Tapping an app in the tool bench to launch it via `open_application` worked for
  Chrome but appeared to "fail" for Google Calendar — Calendar got stuck on a "Checking info…"
  screen and never reached its main UI.
- **Root cause**: `open_application` fires the target app's launcher intent
  (`getLaunchIntentForPackage` + `startActivity`) — the same thing tapping the app's home-screen
  icon does. Logcat confirmed the launch succeeded: `START ... pkg=com.google.android.calendar ...
  from uid ... (com.ntsinga.mobile) ... result code=0`, with no exception and no promise
  rejection from `AppManagerModule`. Calendar then redirected itself into Google Play Services'
  add-account flow (`gms.auth.uiflows.minutemaid.MinuteMaidActivity` → `ErrorActivity` →
  `PreAddAccountActivity`) because Google Calendar requires a signed-in Google account, and this
  emulator has none. That account-setup screen ("Checking info…") hangs on a bare emulator.
- **Resolution**: None needed in our code. The tool did exactly its job. Chrome works because it
  does not force account setup; account-gated Google apps (Calendar, Gmail) hang until a Google
  account is signed into the emulator (Settings → Accounts).
- **Lessons**:
  - `open_application`'s success contract is "launcher intent delivered", NOT "app reached its
    main screen" — the same guarantee the Android home screen makes. What the launched app does
    next (onboarding, permission gates, account setup, splash hangs) is outside our control and
    must not be treated as a tool failure.
  - When a launched app appears stuck, check `adb logcat | grep "ActivityTaskManager: START"` for
    `result code=0` (our launch succeeded) and look for a follow-on redirect into `gms.auth` /
    setup activities before assuming the tool is broken.
  - For testing account-gated apps on an emulator, sign into a Google account first.

---

## 2026-07-19 — get_device_info: "undefined is not a function" from a native module name collision

- **Area**: Native Bridge / Android
- **Symptoms**: New `DeviceInfoModule.kt` (registered as `AppToolsPackage`'s `getName() = "DeviceInfo"`)
  built and installed with no errors, but calling it from JS threw `undefined is not a function`
  — not a promise rejection, not an `APP_MANAGER_*`/`DEVICE_INFO_*` error code, just a plain JS
  TypeError with no native-side log line at all.
- **Root cause**: React Native core already registers a built-in native module bridge-named
  `"DeviceInfo"` (used internally by the `Dimensions` API). Our custom module used the exact same
  `getName()` string. `NativeModules.DeviceInfo` in JS silently resolved to RN's built-in module
  instead of ours — it exists and is truthy (so our "module unavailable" guard never fired), but it
  has no `getDeviceInfo()` method, so calling it threw `undefined is not a function`. No exception,
  no logcat error, and no rejection anywhere in our Kotlin code, because our code never ran.
- **Solution**: Renamed the bridge name to `"AiosDeviceInfo"` (`DeviceInfoModule.kt`'s `getName()`)
  and updated `mobile/src/native/DeviceInfo.ts` to destructure `NativeModules.AiosDeviceInfo`.
- **Validation**: Rebuilt, ran `get_device_info` from the tool bench — returns real battery
  percent, charging state, model, manufacturer, Android version, and current time.
- **Lessons**:
  - Never name a custom RN native module `getName()` after a well-known RN/Expo built-in
    (`DeviceInfo`, `Dimensions`, `Clipboard`, `NetInfo`, etc.) — the collision is silent. JS sees a
    real module object (so `if (!Module)` guards don't catch it) with different methods than
    expected, and the failure looks like a generic JS bug, not a bridge problem.
  - When a native-module call throws a bare JS error (`undefined is not a function`, no error code,
    no logcat trace from our own `promise.reject` or exceptions) — suspect a name collision before
    debugging the Kotlin/Java side. Check `NativeModules` in a debugger/log for what the resolved
    module's actual keys are.
  - Prefix custom native module bridge names with something project-specific (e.g. `Aios*`) to
    avoid this class of collision going forward for future modules.
