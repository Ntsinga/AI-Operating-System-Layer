# AI-OS Progress Log And Architecture Notes

Last updated: 2026-07-28

This document captures the current state of AI-OS, the architecture decisions we have made, and the active issues around learned phone-use procedures. It is meant to be the living handoff file when the chat history gets too long.

## Current Product Direction

AI-OS is an Android-first phone orchestration layer. It starts as an app, but the architecture is designed to grow toward an AI-native operating layer:

```text
User intent
  -> Chat / voice / Hey Casper / overlay bubble
  -> Planner
  -> Tool registry
  -> Native Android capability layer
  -> Workflow engine
  -> Procedural memory / learned app procedures
  -> Debug events + verification
```

The core product difference is that AI-OS should not only answer questions. It should use the phone, remember procedures, replay them safely, and verify whether the real user goal was achieved.

## Major Capabilities Implemented So Far

### 1. Mobile app foundation

- React Native / Expo app with Android native Kotlin modules.
- App name and launcher branding set to `AI-OS`.
- App icon uses the AI-OS face/logo style.
- Debug APK can be built with Gradle and installed on a physical Android device.
- `#start` project command exists through `scripts/start-aios.ps1`.

### 2. Backend foundation

- FastAPI backend exists under `backend/`.
- Render deployment is available at:
  - `https://ai-operating-system-layer.onrender.com`
- Dockerfile support was added for Render deployment.
- Mobile app has been pointed at the hosted backend for real use away from the laptop.
- PostgreSQL-backed persistence has been introduced for production-oriented storage.

### 3. Tool registry and planner-facing tools

The app exposes tool-like capabilities to the planner rather than requiring the user to call tools directly.

Current direction:

- Users should use chat or voice.
- The Tools screen is for inspection/setup/debugging, not the primary user flow.
- The planner can still call internal tools like installed-app lookup when needed.
- User-facing package-name inputs should be replaced with app picker/search UI wherever possible.

Important implemented/covered tool areas include:

- Installed app discovery and app opening.
- Device info and health checks.
- Battery diagnostics baseline.
- App repair assistant primitives.
- Storage cleanup flow.
- Calendar and alarms/scheduler foundations.
- Goal Guard / app blocking foundations.
- Gmail / Google Calendar / Google Drive integration foundations.
- Meeting brief foundations.
- Expense/receipt/SMS finance analysis foundations.
- Wallpaper/image-search route foundations.
- Learning/procedure recording and replay.

### 4. Voice activation and overlay

- `Hey Casper` is the product wake phrase.
- Overlay bubble exists independently of voice activation.
- Voice activation setup should be a single user-friendly setup flow, not multiple confusing permission buttons.
- App should ask for Android permissions on startup/setup where needed:
  - microphone
  - overlay / draw over apps
  - accessibility for learning/replay
- Sherpa-ONNX was selected for zero-cost on-device wake/transcription experimentation.
- Wake calibration samples are stored as user audio examples.
- Speaker verification work began using 3D-Speaker / ERes2Net-style on-device speaker embeddings.

Current limitation:

- Sherpa wake recognition does not directly learn from recorded samples yet.
- The intended next step is a personalized acoustic verifier:
  - wake recognizer detects a candidate phrase;
  - speaker verifier compares the audio to the user's saved `Hey Casper` samples;
  - bubble reacts only when phrase + speaker confidence pass threshold.

### 5. Procedural Memory Engine

This is now a core architectural pillar.

The system should not behave like a stateless computer-use agent that rediscovers every screen every time. Instead, it should learn procedures once, store reusable semantic actions, and replay them later.

Current model:

```text
Teach
  -> Accessibility watcher records semantic actions
  -> Backend stores procedure
  -> User approves procedure
  -> Planner or UI replays procedure
  -> Replay emits structured logs
  -> Failures improve selectors/recovery
```

Recorded action metadata includes, where available:

- `action`
- `surface`
- `role`
- `text`
- `value`
- `resourceId`
- `resourceIdOccurrence`
- `contentDescription`
- `fieldKey`
- `selectorKind`
- `editable`
- `clickable`
- `scrollable`
- `enabled`
- `nodeClass`
- `parentClass`
- `parentSelectorKind`
- `parentText`
- `bounds`
- `screen`
- `screenTitle`

Important design rule:

> Text typed into a field is a value, not automatically a selector.

This matters because if a user types `Wandegeya`, replay must not try to find `Wandegeya` before typing it. It should identify the editable field first, then type the value.

## Current Learned Procedure / Replay Architecture

### Teaching

The desired teaching flow is:

1. User selects/searches the target app from installed apps.
2. User taps `Start teaching`.
3. AI-OS opens the selected app.
4. Accessibility watcher records only target-app actions.
5. User performs the workflow normally.
6. User returns to AI-OS and taps `Finish teaching`.
7. App uploads/drains recorded actions.
8. Procedure list refreshes automatically.
9. User approves or replays the learned procedure.

### Replay

Replay is executed by the Android Accessibility service, not by directly manipulating other apps through React Native UI.

Current replay rules:

- Launch target app before replay.
- Wait for target surface to be frontmost.
- Before each step, confirm target app is still foreground.
- If replay drifts to Home or AI-OS, relaunch/re-wait for the target app.
- For field focus, prefer human-like gesture tap over pure accessibility focus.
- Wait after focus before typing.
- Type incrementally, slowly enough for apps that trigger search/autocomplete.
- After typing, verify text or relevant suggestions remain visible/stable.
- For location suggestions, prefer choosing a real suggestion card over tapping the text field again.

## Most Recent Issue: Faras Ride Replay Getting Stuck

### Symptom

User taught recent Faras rides, then replay got stuck. It appeared to open the app but failed to continue reliably through the destination/location flow.

Recent procedures inspected:

- `Ride 24`, procedure `31`
  - `16` steps
  - `10 focus`
  - `6 text_input`
  - `0 tap`
  - `0 selection`

- `Ride 23`, procedure `30`
  - `15` steps
  - `11 focus`
  - `4 text_input`
  - `0 tap`
  - `0 selection`

These procedures are mostly field focus + incremental typing. That can be valid for Faras because the user starts directly in a location input field after the app opens.

### What the logs showed

The latest replay logs showed:

```text
target_surface_ready: com.faras.rider
then step visibleTexts: Samsung Home screen
then step visibleTexts: AI-OS
then all later steps skipped
```

So replay started with Faras ready, then lost the foreground almost immediately. The system kept trying to replay Faras actions while Home or AI-OS was active.

Another issue was found in the native bridge:

- `LearningWatcherModule` was stripping important metadata before calling `LearningWatcherService.replay`.
- Fields like `selectorKind`, `editable`, `nodeClass`, and `parentSelectorKind` were not being passed into replay.
- This made the replay service blind to the fact that a step was an editable field.

### Fixes just added

Commit:

```text
22a2151 Preserve replay selectors and recover target app
```

Changes:

- Preserve replay metadata across the React Native -> Kotlin bridge.
- Pass through:
  - `selectorKind`
  - `editable`
  - `clickable`
  - `scrollable`
  - `enabled`
  - `nodeClass`
  - `parentClass`
  - `parentSelectorKind`
  - `parentText`
- Add per-step target foreground guard.
- If target app is lost during replay, relaunch/re-wait instead of skipping against AI-OS/Home.

Prior related commit:

```text
6e26a3a Use editable field fallback for replay
```

Changes:

- For editable fields without stable resource IDs/content descriptions, do not use dynamic typed text as the selector.
- Find visible editable field fallback instead.
- Treat values like `Wandegeya`, `Kololo`, etc. as values to type.

Prior related commit:

```text
5b4c08c Use gesture tap for learned field focus
```

Changes:

- Field focus uses a real gesture tap, because some apps do not behave the same when only accessibility focus is used.

Prior related commit:

```text
2491bf0 Tune field focus wait and preserve actionables
```

Changes:

- Focus settle wait tuned to `1000ms`.
- Recording compaction preserves important actions before screen noise.

Prior related commit:

```text
d29b108 Ignore learning events when target app is not frontmost
```

Changes:

- Avoid attaching Launcher/Recents/System snapshots to a target app procedure.

## Current Test Needed

The next immediate test is:

1. Open AI-OS.
2. Go to learned procedures.
3. Replay `Ride 24` / procedure `31`.
4. Watch whether:
   - Faras remains foreground;
   - field focus is performed using gesture tap;
   - `Wandegeya` is typed into the correct editable field;
   - suggestions appear;
   - replay selects the intended suggestion/result card.

If it still gets stuck, query:

```powershell
$events = Invoke-RestMethod 'https://ai-operating-system-layer.onrender.com/debug/events?limit=400'
$events | Where-Object { $_.flow -eq 'replay' } | Select-Object -First 160 id,traceId,procedureId,event,step,level,details,createdAt | ConvertTo-Json -Depth 8
```

Also read logcat:

```powershell
adb -s R5CY105S20T logcat -d -t 1000 | findstr /i "AIOS LearningWatcher Replay Faras faras Accessibility com.aioperatingsystem"
```

## Current Known Issues And Watchpoints

### 1. Duplicate app icon on Samsung phone

Current package verification shows only:

```text
com.aioperatingsystem
```

under main user. User-95 clone uninstall reports:

```text
Failure [not installed for 95]
```

If two icons still appear, likely causes are:

- launcher cache;
- work profile / hidden profile state;
- Samsung launcher stale shortcut;
- old icon shortcut not mapped to an installed package.

Next manual cleanup if needed:

- remove one icon manually from launcher;
- clear Samsung One UI Home cache;
- reboot phone;
- re-check package users with ADB.

### 2. Field typing can still choose the wrong editable field

The editable fallback is intentionally app-agnostic. If a screen has multiple editable fields, replay may need a stronger ranking strategy.

Next improvement if needed:

- prefer currently focused editable field;
- then prefer recorded bounds similarity;
- then prefer same screen role/title context;
- then fallback to first visible editable field.

### 3. Location suggestion selection is still fragile

For ride-hailing flows, typing is not enough. Replay must select a suggestion/result card after search results appear.

Current direction:

- If last typed value matches a later tap text, prefer location suggestion card.
- Avoid tapping the text field itself when the intended next action is selecting a suggestion.
- Verify that the suggestion was accepted before continuing.

Next improvement:

- Store a dedicated `selection` action when the user taps a non-editable result after typing.
- During replay, treat `selection` differently from `focus`/`tap`.

### 4. Recording large workflows

Backend compaction has been improved, but the long-term reliable design is append-only action storage:

```text
learning_sessions
  -> learning_actions
```

Instead of storing a whole procedure as one shrinking JSON blob during teaching, every action should be appended with order, metadata, and trace ID.

Current status:

- Important actions are preserved better than before.
- Screen noise is dropped before taps/text/focus.
- Full append-only action table is still the more robust long-term shape.

### 5. Calibration and wake-word reliability

Wake phrase reliability is not finished. Current best path:

- Sherpa-ONNX wake/transcription candidate.
- User-recorded `Hey Casper` samples.
- 3D-Speaker/ERes2Net-style speaker verifier.
- Candidate accepted only if phrase and speaker match.

## How We Should Debug Learning/Replays From Now On

For every learning/replay issue, use this order:

1. Query backend debug events.
2. Identify the exact procedure ID and trace ID.
3. Confirm the selected procedure was the one the user intended.
4. Confirm actions are in the same order as taught.
5. Compare:
   - `step_started`
   - `step_executed`
   - `step_skipped`
   - `rootSurface`
   - `visibleTexts`
   - `selector`
   - `reason`
6. Read logcat if phone is connected.
7. Patch the smallest layer that failed:
   - recording;
   - backend storage/compaction;
   - bridge serialization;
   - accessibility replay;
   - UI state feedback.

This prevents guessing. The logs should tell us whether the bug is teaching, storage, selection, typing, foreground drift, or app-specific UI behavior.

## Current Build / Deployment Notes

Backend:

- Hosted Render URL:
  - `https://ai-operating-system-layer.onrender.com`

Android:

- Build command:

```powershell
cd mobile/android
.\gradlew.bat :app:assembleDebug
```

- Debug APK:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

- Install to connected phone:

```powershell
adb -s R5CY105S20T install -r --user 0 .\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

- Clear logcat before a replay test:

```powershell
adb -s R5CY105S20T logcat -c
```

## Latest Working State

As of this update:

- App builds successfully.
- Latest APK has been installed on the connected phone.
- Latest replay fixes have been pushed to `main`.
- Logcat was cleared before the next user replay test.
- Immediate next work item is validating whether `Ride 24` replay remains in Faras and successfully types/selects the destination.

