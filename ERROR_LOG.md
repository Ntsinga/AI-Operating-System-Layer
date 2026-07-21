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

---

## 2026-07-19 — Phase 2 planner: open_application hallucinates package names without grounding

- **Area**: State / Tooling (LLM planner, `src/planner/openaiPlanner.ts`)
- **Symptoms**: First manual test of the new AI planner: command "Oppen photos" (typo for "Open
  photos") produced a plausible-looking, correctly-shaped tool call —
  `open_application({ packageName: "com.android.gallery" })` — that the app confirmed and ran, and
  which then correctly failed with `No launchable activity found for package: com.android.gallery`
  (from `AppManagerModule.kt`'s own guard, per the 2026-07-19 open_application entry above; that
  guard did its job here). On this device, Google Photos is actually
  `com.google.android.apps.photos`.
- **Root cause**: `planToolCall()` only sent the tool list (name/description/JSON-schema
  parameters) to the model with no information about what apps are actually installed. GPT-4o-mini
  filled in `packageName` from training-data knowledge of common Android package names, which is
  frequently wrong for apps that were renamed/rebranded (Google Photos was `com.android.gallery`
  years ago) or that don't have a single canonical package name across OEMs/regions.
- **Solution**: `planToolCall(command, installedApps?)` now accepts the result of
  `get_installed_apps` and lists every `name -> packageName` pair in the system prompt, instructing
  the model to use those exact values instead of guessing. `PlannerCard.tsx` calls
  `getInstalledAppsTool.execute()` before every `planToolCall()` (best-effort — falls back to
  ungrounded planning if that fetch fails) so `open_application` proposals are grounded in the real
  device state.
- **Validation**: Re-ran "open photos" — proposed call is now
  `open_application({ packageName: "com.google.android.apps.photos" })`, confirmed, and Google
  Photos actually opened (into its own first-run backup prompt, which is that app's own onboarding,
  not a failure — see the Calendar entry above for the same class of non-issue).
- **Lessons**:
  - A single-shot "pick one tool + arguments" planner (Phase 2 in the plan, no multi-step
    orchestration yet) cannot self-correct a wrong argument by calling `get_installed_apps` first —
    it only gets one shot. Any tool argument that depends on real device/account state (package
    names, contact IDs, file paths, etc.) needs that state fed into the prompt up front, or the
    model will confidently hallucinate a plausible-looking value from training data.
  - "The tool call looks well-formed and confirms cleanly" is not the same as "the tool call is
    correct" — always test the planner against apps/data that have non-obvious real identifiers
    (renamed/rebranded apps are a good adversarial case), not just the first/easiest example.
  - This is a good candidate to revisit once Phase 3 (multi-step orchestration, per the plan) adds a
    tool-calling loop — at that point the model could call `get_installed_apps` itself as a step
    instead of us having to pre-fetch and inject it for every command.

---

## 2026-07-19 — Phase 3 workflow stuck repeating the same tool call in a loop

- **Area**: Backend / Tooling (`backend/app/graph.py`)
- **Symptoms**: First real multi-step workflow test — "check battery and then open chrome" —
  called `get_device_info` successfully, then called `get_device_info` again with identical
  arguments instead of moving on to `open_application`. Kept proposing the same step repeatedly
  until it hit `MAX_STEPS` and stopped without ever opening Chrome.
- **Root cause**: `planner_node` fed prior tool calls to the model as **prose text** inside the
  system prompt (`"Tool calls made so far this workflow:\n- Called get_device_info({}) -> {...}"`),
  not as real OpenAI conversation turns. `gpt-4o-mini` does not reliably use a text summary buried
  in the system prompt to track "I already did this" — it needs the actual multi-turn
  function-calling protocol (`assistant` messages with `tool_calls` + matching `tool` role
  messages with results) to recognize a tool call has already happened and its result is already
  known.
- **Solution**: Replaced the prose-history system-prompt section with `_build_messages()`, which
  reconstructs real `assistant`/`tool_calls` + `tool` message pairs for every step in
  `state["history"]` before the current planning call. The system prompt now only carries static
  instructions + the installed-apps grounding list, no history text.
- **Validation**: Re-ran "check battery and then open chrome" via curl against `/workflow/start`
  and `/workflow/{id}/resume` — model now calls `get_device_info` once, then `open_application`
  with `com.android.chrome`, then returns a final summary. No repeats.
- **Lessons**:
  - When building a multi-step tool-calling loop with any OpenAI-style API, always replay prior
    steps as real `assistant tool_calls` + `tool` result messages, never as a text description in
    the system/user prompt. This applies even (especially) with cheaper models — a prose summary
    is exactly the kind of instruction weaker models are least reliable at actually using.
  - Restarting `uvicorn` after editing `backend/app/graph.py` is required — Python does not
    hot-reload without `--reload`, and the compiled LangGraph object is built once at import time
    (`compiled_graph` module-level singleton in `graph.py`). A code fix silently does nothing until
    the server process is restarted; check `Get-CimInstance Win32_Process` for stray old `uvicorn`
    processes before concluding a fix "didn't work".
  - When investigating an app issue, prefer reproducing directly against the backend via `curl`
    over debugging through the emulator UI — it isolates whether the bug is in the graph/prompt
    logic or in the mobile client, and iterates far faster than a full Android rebuild each time.

---

## 2026-07-20 — search_web backend: Google Custom Search "search the entire web" is gone for new engines

- **Area**: Task Execution / External API
- **Symptoms**: Set up a new Google Programmable Search Engine to switch `search_web` from Brave
  to Google (per user request for better result quality). The "Search the entire web" toggle
  documented in Google's own older help pages was not present anywhere in the control panel for
  the newly-created engine.
- **Root cause**: Google discontinued "Search the entire web" for **newly-created** Programmable
  Search Engines effective 2026-01-20. New engines are now capped at a "Sites to search" allowlist
  of up to 50 domains, which cannot do general web search at all. Existing engines that already
  had "Search the entire web" enabled before that date keep it until 2027-01-01, which is why
  older guidance/tutorials (and this assistant's own training knowledge, cutoff January 2026)
  still describe a toggle that most readers creating a *new* engine will never see. Google's
  suggested replacement is Vertex AI Search, an enterprise product requiring a custom quote.
- **Resolution**: Reverted `backend/app/search.py` to the Brave Search API (the original choice
  before this detour) — no such gating, real general web search, working free tier. Backend env
  vars: `BRAVE_SEARCH_API_KEY` (removed `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID`).
- **Lessons**:
  - Don't trust this assistant's built-in knowledge of a fast-moving external API/product's
    current UI or feature availability, especially for anything Google has a habit of
    deprecating — verify against a live web search before committing setup steps to the user.
  - When a user reports "the option isn't there" for a documented setting, take that as a signal
    to look for a *recent* deprecation before assuming user error or a UI navigation mistake.
  - `search.py` is intentionally an isolated, single-file provider boundary specifically so a
    provider swap (Brave <-> Google <-> whatever comes next) is a contained change — this paid
    off directly here.

---

## 2026-07-20 — record_video: CameraX "Unable to find supported quality by QualitySelector"

- **Area**: Native Bridge / Android
- **Symptoms**: New `record_video` (in-app CameraX recording, `InAppCaptureActivity.kt`) failed
  immediately on start with `androidx.camera.core.internal.CameraUseCaseAdapter$CameraException:
  java.lang.IllegalArgumentException: Unable to find supported quality by QualitySelector`.
- **Root cause**: `Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.SD))` used a
  fixed, concrete quality value. `Quality.SD` (and other concrete values like HD/FHD/UHD) are not
  guaranteed to be supported by every camera - the Pixel_6a emulator's virtual/software camera
  backend does not support it, so resolution failed outright with no fallback.
- **Resolution**: Changed to `QualitySelector.from(Quality.HIGHEST)`. `HIGHEST`/`LOWEST` are
  special CameraX values (not concrete resolutions) that resolve to whatever the actual camera
  supports, instead of asserting a specific quality exists.
- **Lessons**:
  - Never hardcode a concrete CameraX `Quality` value (`SD`/`HD`/`FHD`/`UHD`) for a capability
    meant to run on arbitrary devices/emulators - always use `Quality.HIGHEST`/`Quality.LOWEST`,
    or a `QualitySelector.fromOrderedList(...)` with an explicit `FallbackStrategy`, so resolution
    can never fail outright just because one specific quality isn't in the device's supported set.
  - Emulator virtual camera backends are a real, distinct compatibility surface from physical
    camera hardware - CameraX code that only gets tested against a real device's camera can still
    ship a bug that fails 100% of the time on every emulator.

---

## 2026-07-20 — Multi-step workflow silently ended after presenting text options

- **Area**: Product / Phase 3 workflow design
- **Symptoms**: User asked the workflow to "search for the 5 best fitness apps and let me pick
  one" (a "search → present options → user picks → act on it" flow, the plan's original Ronaldo
  example). The model correctly called `search_web`, then presented the results as a plain-text
  numbered list asking the user to pick one - and the workflow just stopped there. Replying with a
  pick did nothing; there was no way to continue.
- **Root cause**: The graph's `_should_continue` treated ANY model response with no tool call as
  terminal (`finalMessage` set, routes to `END`). It could not distinguish "I am done" from "I am
  asking a question / presenting options and expect a reply" - both look identical to the OpenAI
  API (plain assistant text, no tool_calls). Once `END` was reached, `/workflow/{id}/resume`
  404'd - the thread was unrecoverable, so a reply had nowhere to go.
- **Resolution**: Reworked `graph.py`/`main.py` so the graph has no "done" terminal state distinct
  from "awaiting reply" - every plain-text response pauses via `interrupt({"kind":
  "awaiting_reply", "message": text})` and waits for either a tool result (if the model had called
  a tool) or the user's next free-text turn, which gets appended to the conversation as a real new
  `user` message (not folded into the original command) and the graph continues. The graph only
  truly ends at `MAX_STEPS` (raised 6 -> 12 to give a search→pick→act chain more room) or when the
  client stops calling resume (same abandon-the-thread pattern the "Stop" button already used).
  Replaced the fixed `state["command"]` field with a growing `state["messages"]` list built fresh
  each turn. Added a new `awaiting_reply` status to the `/workflow/*` response contract and a
  reply text box + "Send"/"Done" UI in `WorkflowCard.tsx`.
- **Validation**: Verified via curl end-to-end: start -> `search_web` proposed -> resume with
  fake results -> now returns `status: "awaiting_reply"` with the option list (previously
  `"done"`) -> resume with `"the second one"` -> correctly proposes `open_play_store_listing` with
  the package name matching option 2, not a guess.
- **Lessons**:
  - For any agent design where the model can legitimately respond with plain text mid-task
    (asking a question, presenting choices) as well as at true completion, do not conflate "no
    tool call" with "done." They need distinct pause states, or every options-list becomes a dead
    end exactly like this.
  - A multi-step/multi-turn workflow's state should carry the full growing conversation
    (`messages: list`), not a single fixed original command - user input doesn't end at turn one
    the moment the flow needs a follow-up reply, not just a follow-up tool result.
## 2026-07-21 — Phase 3.5 Quick Settings tile validation

- **Area**: Android overlay / Phase 3.5
- **Change**: Added `OverlayTileService`, registered as a Quick Settings tile, and centralized
  overlay start/stop calls in `OverlayService` so the app and tile use the same foreground service.
- **Validation**: The configured JDK was present, but Gradle's wrapper distribution was not cached.
  The sandbox blocked the download, and the approved retry timed out before compilation completed.
- **Lesson**: Native validation still requires a cached Gradle distribution or a network-enabled build
  environment; source review alone is not a substitute for an Android install test.
## 2026-07-21 — Hey Casper voice activation

- **Area**: Android overlay / Phase 3.5
- **Change**: Added an opt-in microphone foreground service with a persistent notification. It
  recognizes “Hey Casper”, accepts the command in the same utterance or arms the next utterance,
  and opens the existing workflow through an `aios://voice` deep link.
- **Safety**: Voice activation is disabled by default and can be stopped from the app or its
  notification. Tool execution still requires the existing confirmation step.
- **Validation**: TypeScript validation passed. Android compilation could not complete because the
  Gradle distribution was not cached and the network-enabled retry timed out; device validation remains required.
## 2026-07-21 — Android wallpaper capability

- **Area**: Phone capability layer
- **Change**: Added `AiosWallpaper`, a native `WallpaperManager` bridge exposed as the
  `set_wallpaper` tool. It accepts HTTPS/content/file URIs, validates image bytes and dimensions,
  enforces a 25 MB limit, and supports home, lock, or both targets.
- **Safety**: The AI workflow still pauses for confirmation before execution. The Tools tab is a
  direct internal test surface and should only be used with an intentional image and target.
- **Validation**: TypeScript validation is being run; Android device/build validation remains
  dependent on the Gradle distribution and an emulator/device.
## 2026-07-21 — Structured image search and owned image browser

- **Area**: Phase 3.5 / image-to-wallpaper workflow
- **Change**: Added Brave Image Search-backed `/search/images` and `search_images`, an in-app
  thumbnail grid, and `browse_for_image` backed by an AI-OS-owned Android WebView. The browser
  injects a small image-selection bridge and returns the tapped image URL to the workflow.
- **Validation**: TypeScript and backend Python compilation passed. Android install/build validation
  remains outstanding because Gradle compilation timed out in this environment.
- **Boundary**: This WebView is an owned browsing surface; it does not intercept or observe arbitrary
  Chrome sessions. Accessibility/screenshot phone-use remains a separate, permission-gated phase.
## 2026-07-21 — Explicit browser routing tools

- **Area**: Phase 3.5 browser activation
- **Change**: Added `open_url_external` for Chrome/default-browser launches,
  `open_url_in_aios_browser` for the AI-OS-owned WebView, and retained `browse_for_image` for
  WebView image selection. All three are registered in the planner and exposed in the Tools tab.
- **Validation**: TypeScript validation passed. Android install validation remains pending.
## 2026-07-21 — Planner OS harness and app fallback policy

- **Area**: LangGraph planning context
- **Change**: Added versioned `backend/app/context/os_harness.md` and `web_aliases.json`. The
  planner now loads these on startup and uses installed-app state plus explicit routing rules to
  choose the native app, external browser, AI-OS browser, or image-selection browser.
- **Boundary**: The harness cannot make Chrome observable; it explicitly prevents the model from
  claiming it saw external-app state. It also keeps confirmation requirements for side effects.
- **Validation**: Backend Python compilation and TypeScript validation are being run separately.
## 2026-07-21 — Outcome portfolio and storage-health slice

- **Area**: Roadmap / AI Phone Doctor
- **Change**: Added the normalized 10 core outcomes plus 5 hackathon/demo slices to the plan.
  Started the easiest new diagnostic slice with read-only `get_storage_info`, exposing total,
  used, free, and percentage storage to the planner and Tools tab.
- **Safety**: This first storage step is read-only; deletion and archive actions remain a separate
  confirmed workflow.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Network diagnostics slice

- **Area**: AI Phone Doctor / network outcome track
- **Change**: Added read-only `diagnose_network`, exposing active transports, validated internet
  state, metering, signal strength where supported, DNS servers, and a short connectivity latency
  probe. It is available to the planner and Tools tab.
- **Safety**: This tool changes no network settings. Remediation actions will be separate tools with
  confirmation and verification.
- **Validation**: TypeScript validation passed; Android device/build validation remains pending.

## 2026-07-21 â€” Device Owner / DPC policy scaffold

- **Area**: Android managed-device policy layer
- **Change**: Added `AiosDeviceAdminReceiver`, `device_admin.xml`, and the `AiosDevicePolicy`
  bridge. The bridge reports normal-app vs managed-device status and exposes owner-only app
  suspension/restore. Added planner tools `get_device_policy_status` and
  `set_application_suspended`.
- **Safety**: Device Owner is not root. Provisioning is intentionally not automated; Android
  requires administrator provisioning on a clean device. Normal installs fail closed with a
  `DEVICE_OWNER_REQUIRED` error.
- **Validation**: `npx tsc --noEmit` passed; Android Gradle/device validation remains pending
  because the local Gradle toolchain is unavailable.

## 2026-07-21 â€” Goal Guard vertical slice

- **Area**: Policy / focus enforcement
- **Change**: Added `GoalGuardCard`. Users define a goal and comma-separated package list,
  start owner-enforced app suspension, inspect policy status, and explicitly unlock apps after
  completion. Partial suspension failures trigger best-effort rollback.
- **Boundary**: Normal-app installs fail closed with a clear Device Owner requirement; this slice
  does not claim that a timer or self-report proves the goal was completed.
- **Validation**: `npx tsc --noEmit` passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” Goal Guard app selection UX

- **Area**: Policy / focus enforcement UX
- **Change**: Replaced the package-name text field with a native installed-app picker. Users
  load launchable apps, tap rows to select/deselect them, and AI-OS keeps package identifiers
  internal for the Device Owner policy call.
- **Validation**: `npx tsc --noEmit` passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” Goal Guard orchestration controls

- **Area**: Policy orchestration
- **Change**: Added grouped `set_applications_suspended` and explicit `set_kiosk_mode` tools.
  The planner harness now instructs the model to inspect installed apps, classify social-media
  requests, present the proposed group, avoid suspending AI-OS, distinguish app blocking from
  whole-device kiosk mode, and verify the result.
- **Safety**: Kiosk mode is never an implicit side effect of “lock my phone”; it requires an
  explicit request and Device Owner. Normal-app installs cannot claim enforcement.
- **Validation**: `npx tsc --noEmit` and `git diff --check` passed; Android Gradle/device
  validation remains pending.

## 2026-07-21 â€” Timed Goal Guard policies

- **Area**: Policy scheduling
- **Change**: Added persistent `AiosFocusPolicy` storage, grouped timed suspension, automatic
  unlock via `AlarmManager`/`FocusPolicyReceiver`, status inspection, and explicit early stop.
  Added planner tools `start_focus_policy`, `get_focus_policy_status`, and `stop_focus_policy`.
- **Boundary**: Timed policies require Device Owner. The alarm receiver restores apps after the
  deadline but the next foreground status check remains the verification path if Android delays
  delivery under power restrictions.
- **Validation**: `npx tsc --noEmit` and `git diff --check` passed; Android Gradle/device
  validation remains pending.

## 2026-07-21 â€” Android alarm tool

- **Area**: Device scheduling
- **Change**: Added `AiosAlarm` and the `set_alarm` planner/tool-registry entry. It validates
  24-hour hour/minute values and delegates creation to Android's system alarm app, preserving
  system ownership and user-visible confirmation.
- **Validation**: TypeScript validation passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” Exact date-specific alarm scheduler

- **Area**: Device scheduling
- **Change**: Added `AiosScheduledAlarm`, an exact one-time `AlarmManager` schedule, persisted
  receiver delivery, notification channel, and planner tool `schedule_date_alarm`. This is used
  for “tomorrow at 7:00” instead of the ordinary system alarm next-occurrence intent.
- **Boundary**: Android may require the user to allow exact alarms; notification permission is
  also user-controlled. The tool fails clearly if either system capability is unavailable.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Network outcome workflow

- **Area**: AI Phone Doctor / connectivity
- **Change**: Added `run_network_test`, which performs repeated connectivity probes and reports
  latency samples, average/min/max latency, successful probes, and packet loss. Added planner
  harness guidance to diagnose, open user-approved settings, then retest and compare measurements.
- **Boundary**: Android does not permit ordinary apps to silently toggle Wi-Fi or mobile radios;
  remediation still delegates to the system settings panels.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Battery optimization workflow

- **Area**: AI Phone Doctor / battery policy
- **Change**: Added read-only per-app battery-optimization status and a system optimization-list
  launcher. The planner now combines battery diagnostics, Usage Access foreground activity, and
  per-app battery settings into an evidence-based before/after workflow.
- **Boundary**: Foreground usage is only an activity proxy; Android does not expose privileged
  per-app drain to ordinary apps. AI-OS does not request optimization exemptions as a “fix.”
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” App Repair Assistant

- **Area**: App health / repair
- **Change**: Added `AiosAppHealth` inspection for installed state, version, enabled/system
  status, UID, and launchability, plus `open_app_settings` for user-controlled force-stop,
  cache/data, permissions, update, and uninstall actions. Added planner guidance to diagnose
  before and verify after the user changes settings.
- **Boundary**: Normal apps cannot read another app's private crash logs or silently clear its
  data. The workflow reports those limits rather than claiming an invisible repair.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Meeting Brief calendar foundation

- **Area**: Meeting Brief
- **Change**: Added permission-aware `AiosCalendar` event lookup for the next 1-168 hours,
  planner tool `get_upcoming_events`, Tools-tab access, and planner guidance for combining
  calendar facts with contacts and public research.
- **Boundary**: Email, private message history, and meeting transcripts are not yet connected;
  the planner must not imply access to those sources.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Google OAuth connection scaffold

- **Area**: Meeting Brief external sources
- **Change**: Added a server-side Google OAuth redirect/callback/status flow requesting Gmail
  read-only, Calendar read-only, and Drive read-only scopes, plus the mobile
  `connect_google_account` tool and setup environment variables.
- **Safety**: Client secrets remain server-side. The current token store is development-only
  in-memory storage and must be replaced with encrypted per-user persistence before production.
  Gmail/Drive scopes may require Google OAuth verification.
- **Boundary**: WhatsApp is not a generic personal-message OAuth connector. Production access
  requires a Meta WhatsApp Business Cloud API app, business phone number, and approved scopes;
  no WhatsApp credentials are present yet.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Google retrieval handlers

- **Area**: Meeting Brief private context
- **Change**: Added read-only backend handlers and planner tools for Gmail search, Google Drive
  file-name search, and Google Calendar upcoming events. They use the server-side OAuth token
  obtained by the consent flow; the mobile app never receives Google client secrets.
- **Boundary**: Development token storage is still in-memory and must be replaced with encrypted
  per-user persistence. No WhatsApp handler was added because WhatsApp requires a Meta Business
  Cloud API integration rather than generic personal OAuth.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Full Google retrieval and follow-up actions

- **Area**: Meeting Brief completion
- **Change**: Added full Gmail message-body reads, Drive file-content reads, Gmail draft creation,
  and Google Calendar follow-up event creation. Draft/event tools remain confirmation-gated by the
  workflow UI.
- **Security**: Latest briefs are encrypted locally with an Android Keystore AES-GCM key and can
  be surfaced through the overlay notification. Google OAuth tokens are now encrypted at rest in
  a server-side Fernet vault; the key is supplied by `GOOGLE_TOKEN_ENCRYPTION_KEY` and must remain
  outside source control. The vault is still single-user development storage until account/user
  isolation is added.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Expense and receipt workflow

- **Area**: Expense outcome track
- **Change**: Added `get_monthly_finances` to search connected Gmail for likely expense/revenue
  evidence and reconcile currency-specific candidate totals, plus `extract_receipt` using a
  vision OCR pass for merchant/date/total/currency/tax/category/confidence.
- **Safety**: Financial results are explicitly candidates requiring review. OCR never submits a
  claim or moves money; provider-specific expense submission and approval monitoring remain
  future write integrations.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Expense dashboard and receipt UI

- **Area**: Expense UX / visualization
- **Change**: Added an in-app Finance Overview with month selection, category bars, candidate
  counts, and AI-generated analysis. Added a Receipt Scanner card that captures a receipt and
  displays OCR fields for review.
- **Safety**: Charts reflect extracted candidates and do not imply accounting accuracy. Receipt
  data is not submitted automatically.
- **Validation**: TypeScript validation passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” SMS finance route

- **Area**: Expense evidence sources
- **Change**: Added explicit READ_SMS permission flow, recent SMS retrieval, and
  `analyze_sms_finances` for bank/mobile-money alert classification and currency-specific totals.
- **Privacy**: SMS access is user-granted and capped to a bounded lookback/row count. The planner
  is instructed not to expose unrelated message content; parsed items remain review candidates.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Conversational expenditure analysis

- **Area**: Expense analysis / planner
- **Change**: Exposed the AI analysis endpoint as `analyze_finances`, allowing Chat workflows to
  gather Gmail or SMS finance candidates and then explain category concentration, revenue versus
  expenditure, anomalies, and practical next steps conversationally.
- **Boundary**: Analysis is informational and not regulated financial advice; no payments or
  financial changes are performed.
- **Validation**: TypeScript validation and backend compilation passed; Android Gradle/device
  validation remains pending.
## 2026-07-21 — Network remediation panels

- **Area**: AI Phone Doctor / network outcome track
- **Change**: Added `open_wifi_settings` and `open_network_settings` native tools. They open
  Android's own settings panels and return control to the workflow; the planner can rerun
  `diagnose_network` afterward to verify the change.
- **Platform boundary**: Ordinary apps cannot silently toggle Wi-Fi/mobile data on modern Android,
  so these actions intentionally require the user to make the setting change.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Battery diagnostics slice

- **Area**: AI Phone Doctor / battery outcome track
- **Change**: Added read-only `diagnose_battery`, exposing charge state, temperature, voltage,
  current draw, energy counter, health, plug type, and power-saver status to the planner and Tools tab.
- **Boundary**: Battery usage by individual apps and automatic background-policy changes require
  additional UsageStats/OS-specific work; this slice establishes the measurable baseline first.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Usage Access and battery policy layer

- **Area**: AI Phone Doctor / battery policy
- **Change**: Added `get_app_usage`, backed by Android Usage Access, to report foreground time by
  app for a 1–168 hour window. Added `open_app_battery_settings` so the workflow can guide the
  user to an app's battery/background controls and then verify usage again.
- **Boundary**: Usage Access is a special user-granted setting. Ordinary apps cannot read
  privileged per-app battery drain or silently impose background restrictions; true enforcement
  requires device-owner/system privileges.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Safe storage cleanup workflow

- **Area**: Storage outcome track
- **Change**: Added a permission-aware shared-media scanner, candidate ranking for large/old media,
  selectable cleanup UI, and `delete_storage_candidates`. Android 11+ presents its own system delete
  confirmation before the selected content URIs are removed.
- **Safety**: The app never deletes during scanning. The user selects items in the UI, confirms in
  AI-OS, then confirms again in Android. Deletion is limited to selected shared-media URIs.
- **Validation**: TypeScript validation passed; Android device/build validation remains pending.
## 2026-07-21 — Phase 4 procedural memory

Added a local, privacy-minimized procedure store and planner hints. It persists a short intent,
tool names, and arguments from completed runs; screenshots, credentials, tool results, and raw
private content are intentionally excluded. This is development storage and must move to encrypted,
per-user storage before multi-user deployment.

The follow-up slice adds procedure listing, search, deletion, and a mobile reuse indicator so
the user can see and control learned memory instead of having it operate invisibly.

Phase 4 is now marked complete. Phase 5 starts with a semantic learning-session API that accepts
only UI metadata (role, label, resource ID, action, and value), explicitly excluding screenshots
and arbitrary payloads. Android AccessibilityService capture and the teaching UI remain next.
