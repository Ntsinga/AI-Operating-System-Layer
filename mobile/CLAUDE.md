@AGENTS.md

# AI-OS Mobile — Claude Code Instructions

React Native / Expo app that exposes real Android phone capabilities as structured tools. See
[`../docs/AI_OS_ORCHESTRATOR_PLAN.md`](../docs/AI_OS_ORCHESTRATOR_PLAN.md) for the full roadmap.

## Expo version

Expo has changed. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any Expo/React Native code.

## Issue learning workflow

- Before debugging a build failure, native-bridge issue, or unexpected Android behavior, read
  [`../ERROR_LOG.md`](../ERROR_LOG.md) and review lessons from relevant past incidents.
- After fixing any meaningful problem (build failure, regression, tooling failure, incomplete
  result), add or update an entry in `../ERROR_LOG.md` with symptoms, root cause, solution,
  validation, and lessons — before confirming completion.

## Android build environment (Windows)

- **JDK**: Java is not on the system PATH. Builds need `JAVA_HOME` set to
  `C:\Users\ElijahNtsinga\tools\jdk17\jdk-17.0.19+10` and its `bin` prepended to PATH.
- **Temp dir / loopback fix**: On this machine, AF_UNIX sockets fail under
  `C:\Users\<user>\AppData\Local\Temp`, which breaks `Selector.open()` and therefore Gradle's
  daemon (error: `Unable to establish loopback connection`). The `android` npm script wraps
  `expo run:android` with `cross-env TMP=C:\Windows\Temp TEMP=C:\Windows\Temp` to work around it.
  **Do not remove this**; if you see the loopback error, verify `TEMP`/`TMP` point at
  `C:\Windows\Temp` (NOT `-Djava.io.tmpdir`, which does not fix it). Full diagnosis in `ERROR_LOG.md`.
- **Running the app**: from `mobile/`, `npm run android` (with `JAVA_HOME` set as above) builds,
  installs `com.ntsinga.mobile`, and launches on the connected emulator/device.
- `expo run:android` does not exit on success — it hands off to the Metro dev server, which runs
  indefinitely. A build that installs the APK and prints "Opening com.ntsinga.mobile/.MainActivity"
  succeeded even though the command never "completes". Verify success via the APK under
  `android/app/build/outputs/apk/debug/`, `adb shell pm list packages`, and a screenshot — not by
  waiting for the command to end.

## Android package visibility (API 30+)

- Any native tool that enumerates OTHER installed apps or resolvable intents (`get_installed_apps`,
  future `open_application`, `search_installed_apps`, share/intent tools) MUST declare the queried
  intents in a `<queries>` block in `android/app/src/main/AndroidManifest.xml`. Without it,
  `PackageManager.queryIntentActivities(...)` silently returns an incomplete list with no error.
- The launcher-app query requires `ACTION_MAIN` + `CATEGORY_LAUNCHER` in `<queries>`.

## Native module conventions

- Kotlin native modules live under `android/app/src/main/java/com/ntsinga/mobile/` and are
  hand-authored and committed (the Android project is not regenerated on every build). Edit
  `AndroidManifest.xml` directly; `app.json` does not manage the `<queries>` block. If
  `expo prebuild` is re-run, re-apply manual manifest edits (or move them into a config plugin).
- Each native method resolves/rejects a `Promise`. Reject with a stable error code string
  (e.g. `APP_MANAGER_GET_INSTALLED_APPS_FAILED`) so the TypeScript layer can surface it.
- TypeScript accesses modules via `NativeModules`; guard for the module being undefined (native
  build not present) and throw a clear message.
- **Bridge name every module `getName()` with an `Aios`-prefixed name that is obviously ours**
  (e.g. `AiosDeviceInfo`), never a bare name like `"DeviceInfo"`. React Native/Expo core already
  registers built-in modules under common names (`DeviceInfo` is used internally by `Dimensions`).
  A collision is silent: `NativeModules.<name>` in JS resolves to *whichever module won*, so an
  `if (!Module)` guard does not catch it — the symptom is a bare `undefined is not a function`
  with no error code and nothing in logcat from our own code, because our module never runs. See
  `ERROR_LOG.md` (2026-07-19, get_device_info). Existing safe names already in use: `AppManager`,
  `AiosDeviceInfo`, `LocationManagerModule`, `ContactsManager`.
- **Runtime permissions** (location, contacts, etc.): use `PermissionHelper.requestPermission(...)`
  (`PermissionHelper.kt`) rather than hand-rolling `ActivityCompat.requestPermissions`. It checks
  `ContextCompat.checkSelfPermission` first, then requests through `currentActivity as
  PermissionAwareActivity` (which `ReactActivity` implements out of the box — no extra wiring
  needed in `MainActivity.kt`), and rejects the promise with `PERMISSION_DENIED` or
  `PERMISSION_ACTIVITY_UNAVAILABLE` on failure.

## Tool contract

- Every capability is a `ToolDefinition` (`src/tools/types.ts`) with `name`, `description`,
  `parameters`, and `execute`. `parameters` is a real JSON Schema object
  (`{ type: 'object', properties: {...}, required?: [...] }`) — this is fed directly into the
  OpenAI tool-calling API, so keep it accurate for every argument the tool actually reads.
  Register tools in `src/tools/registry.ts`.

## Phase 2 planner (`src/planner/openaiPlanner.ts`, `src/components/PlannerCard.tsx`)

- Provider: OpenAI (`gpt-4o-mini`), chosen for balance of cost and quality — see
  `docs/AI_OS_ORCHESTRATOR_PLAN.md` Phase 2. Single-shot tool-calling: the model picks exactly one
  tool + arguments per command; nothing executes until the user taps "Confirm & run" in the UI
  (`PlannerCard.tsx`). Do not wire up auto-execution without an explicit user decision to do so —
  the plan requires confirmation for exactly this reason.
- **API key**: `EXPO_PUBLIC_OPENAI_API_KEY`, read from `mobile/.env` (gitignored; copy
  `.env.example`). `EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time — this key
  ships inside the APK and is extractable. Acceptable only because this is a local, personal
  dev-only tool bench; before any real distribution, move the OpenAI call behind a backend proxy
  (see the SECURITY NOTE at the top of `openaiPlanner.ts`). Changing `.env` requires restarting
  Metro (`npm run android` again) — Fast Refresh does not pick up new env vars.
- **Grounding**: `planToolCall()` takes an optional `installedApps` list and includes it verbatim
  in the system prompt (`name -> packageName` pairs) so `open_application` gets real package names
  instead of the model guessing from training-data knowledge, which is frequently wrong for
  renamed/rebranded apps (e.g. Google Photos is `com.google.android.apps.photos`, not
  `com.android.gallery` — the model's first guess). `PlannerCard.tsx` fetches
  `get_installed_apps` before every plan call to supply this. Any future tool whose arguments
  depend on real device/account state (contact IDs, file paths, etc.) needs the same treatment —
  Phase 2 is single-shot, so the model cannot call a lookup tool first to self-correct; the data
  must be pre-fetched and injected into the prompt. See `ERROR_LOG.md` (2026-07-19, planner
  hallucinates package names).

## After completing tasks

1. Run `npx tsc --noEmit` from `mobile/` and fix all errors.
2. Read every changed file — do not rely on memory of intended edits.
3. For native/Android changes, rebuild and verify the actual behavior on the emulator
   (screenshot + `adb`), not just that it compiled.
4. Update `../ERROR_LOG.md` for any bug, regression, or tooling failure encountered.
