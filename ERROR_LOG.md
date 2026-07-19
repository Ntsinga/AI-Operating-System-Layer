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
