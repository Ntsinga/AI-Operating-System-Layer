# AI-OS Orchestrator Project Plan

Source brief: [source/AI-native_OS_Development_2026-07-18.txt](source/AI-native_OS_Development_2026-07-18.txt)

## Product Thesis

The project is an Android-first AI-native operating layer. It starts as a mobile app, then grows into a phone capability layer, tool orchestrator, memory system, policy engine, and eventually an AI-first launcher.

The core belief is:

> AI agents are becoming the new way people use technology. The phone is the interface people use more than any other, so the real opportunity is not another AI app. It is a user-owned intent layer that can understand, organize, and govern the phone itself. By doing so, the phone becomes AI enhanced esssentially your portable AI Assistant.

The distinction is ownership of the interface. A normal agent sits inside an app or browser tab and asks other systems for permission to act. This project aims to move the agent closer to the operating layer itself: current screen, installed apps, notifications, files, photos, contacts, calendar, launcher state, and user-defined policies. The long-term goal is not a smarter chat window. It is a phone where intent becomes the primary interface, apps become capabilities, and the AI becomes the coordinator and policy engine.

This should not begin as a chatbot. The first valuable asset is the phone action layer: clean, testable tools that let software inspect and control phone capabilities with explicit user permissions. The second valuable asset is the policy layer: rules the user can create, audit, reverse, and enforce at the device-interface level.

## Anchor Use Cases

These are the kinds of outcomes the system should eventually support:

- Find every receipt from last month.
- Reorganize my home screen based on how I actually use my apps.
- Watch how I edit photos and learn my style.
- Enforce my study rules across every app.

These use cases matter because they combine tool use, personal context, behavioral learning, and operating-layer control. They also help define the long-term boundaries of the project: search across device data, launcher ownership, learned user preferences, and enforceable policy execution.

## Phase One Goal

Build a working Android capability layer that exposes real phone functions as structured tools.

Phase one is successful when the app can:

1. Run on an Android device or emulator.
2. Call native Kotlin modules from React Native TypeScript.
3. Display installed apps returned from Android Package Manager.
4. Represent each capability as a standard tool definition.
5. Add several basic phone-awareness tools without adding an LLM yet.

This creates the foundation for a later AI planner to call tools such as `get_installed_apps`, `open_application`, `get_device_info`, `search_photos`, and `send_sms`.

## Architecture Direction

```text
User
  |
  v
React Native UI
  - command screen
  - tool results screen
  - permission prompts
  - future voice/chat interface
  |
  v
Tool Registry in TypeScript
  - tool name
  - description
  - parameters schema
  - execute function
  |
  v
Native Android Modules in Kotlin
  - app manager
  - device info
  - contacts
  - photos
  - calendar
  - notifications
  |
  v
Android APIs
  - PackageManager
  - Intents
  - MediaStore
  - Contacts Provider
  - Calendar Provider
  - Notification Listener
  - Accessibility APIs where appropriate
```

Later phases add:

```text
LLM planner -> LangGraph/OpenAI Agents SDK -> memory -> policies -> AI launcher
```

## Recommended Repository Shape

```text
aios/
  docs/
    AI_OS_ORCHESTRATOR_PLAN.md
    source/
      AI-native_OS_Development_2026-07-18.txt
  mobile/
    React Native app
    android/ generated after Expo prebuild
  backend/
    future API, memory, and orchestration service
  packages/
    future shared tool schemas/types
```

Current status: `docs/` and the Expo TypeScript `mobile/` app exist. `backend/` and `packages/` are future work.

## Phase 0: Repo And Machine Setup

Purpose: prepare a clean private repo and Android development environment.

### Repo Steps

1. Initialize Git in this workspace:

```powershell
git init
```

2. Create a private remote repository, for example on GitHub.

3. Add the remote:

```powershell
git remote add origin <private-repo-url>
```

4. Add a root `.gitignore` before committing. It should ignore at least:

```gitignore
node_modules/
.expo/
android/.gradle/
android/build/
android/app/build/
.env
.env.*
*.keystore
```

5. Commit the plan and mobile scaffold once reviewed:

```powershell
git add .gitignore README.md docs mobile
git commit -m "Scaffold AI-OS mobile app"
```

### Required Local Dependencies

Install these before creating the mobile app:

1. Node.js LTS.
2. Git.
3. Android Studio.
4. Android SDK Platform.
5. Android SDK Build Tools.
6. Android Emulator or a physical Android phone with USB debugging enabled.
7. Java JDK 17, unless Android Studio already provides a compatible JDK.

Useful checks:

```powershell
node --version
npm --version
git --version
java -version
adb version
```

Current machine check: Node, npm, Git, and adb are available. Java is not currently available on PATH, so JDK setup is the next environment task before Android native builds.

## Phase 1: Build The Phone Capability Layer

Purpose: prove the app can call real Android capabilities through a stable tool interface.

### Step 1: Create The Mobile App

Use Expo for speed at the start:

```powershell
npx create-expo-app@latest mobile --template blank-typescript
Set-Location mobile
npm run android
```

Expected result: the blank app runs on an emulator or device.

### Step 2: Add Native Android Support

Generate the native Android project when Kotlin modules are needed:

```powershell
npx expo prebuild --platform android
```

Expected result: `mobile/android/` exists and can build.

### Step 3: Create The First Native Tool

First tool: `get_installed_apps`.

Native Android responsibility:

- Use `PackageManager`.
- Read installed applications.
- Return app name, package name, and whether it can be launched.

TypeScript responsibility:

- Call the native module.
- Normalize the result.
- Display the installed app list in the UI.

Target result:

```json
[
  {
    "name": "YouTube",
    "packageName": "com.google.android.youtube",
    "launchable": true
  }
]
```

### Step 4: Define A Tool Contract

Every capability should follow one shape:

```ts
type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
};
```

Example:

```json
{
  "name": "get_installed_apps",
  "description": "Gets launchable applications installed on the Android device.",
  "parameters": {}
}
```

This contract matters because the future LLM planner will inspect this registry before choosing actions.

### Step 5: Build The First 5 Tools

Build tools in this order:

1. `get_installed_apps`: list launchable apps.
2. `open_application`: open an app by package name using Android intents.
3. `get_device_info`: battery level, charging state, device model, Android version, current time.
4. `get_current_location`: current location with explicit permission.
5. `get_contacts`: contact names and phone numbers with explicit permission.

Do not add AI until these are working manually from the app UI.

### Step 6: Build The Tool Test Screen

Create a simple internal screen with:

- Tool list.
- Run button for each tool.
- JSON result viewer.
- Error display.
- Permission status display.

This screen is the workshop for building the AI OS. It does not need to look like the final product.

## Phase 1 Definition Of Done

Phase one is done when:

1. `mobile/` exists and runs on Android.
2. Kotlin native module calls work from TypeScript.
3. `get_installed_apps` works on a real device or emulator.
4. `open_application` can launch at least one installed app.
5. `get_device_info` returns real device state.
6. At least one permissioned tool is implemented cleanly.
7. The app has a reusable tool registry.
8. The repo has setup instructions in a README.

## Phase 2: Add A Simple Planner, Not A Full Agent Yet

**Status: superseded by Phase 3 (2026-07-20).** Originally built as a client-side single-shot
planner calling OpenAI directly from the app (`src/planner/openaiPlanner.ts` +
`PlannerCard.tsx`). Once Phase 3's multi-step workflow could also handle single-step commands
correctly (and does so more safely - key stays server-side, real tool-call chaining instead of
one-shot guesses), the single-shot UI was collapsed into the same "AI assistant" card and the
Phase 2-only files were deleted rather than kept as unused dead code. The provider-choice
discussion and example below are kept for history.

Purpose: let an LLM choose one tool at a time.

Recommended first approach:

- Use a simple server endpoint or local development function.
- Give the model the tool registry.
- Ask it to return a tool name and JSON arguments.
- Execute only after user confirmation.

Possible model providers:

- Gemini API.
- OpenAI API.
- Anthropic API.

Do not introduce LangGraph yet. Use a direct tool-calling loop first.

Example target command:

```text
Open Spotify
```

Planner output:

```json
{
  "tool": "open_application",
  "arguments": {
    "packageName": "com.spotify.music"
  }
}
```

## Phase 3: Add Multi-Step Orchestration

**Status: done (2026-07-20).** Built with LangGraph, running through `backend/app/graph.py`
+ `mobile/src/components/WorkflowCard.tsx`. The graph has no separate "done" state from
"awaiting reply" - every plain-text model response pauses and can be continued with a new
user turn (see ERROR_LOG.md, 2026-07-20 entry on the stuck-after-options bug and its fix).
Verified end-to-end with exactly the workflow below.

Purpose: move from single action to workflows.

Use LangGraph or a similar orchestration framework once the app can run several tools reliably.

Example workflow:

```text
Find Ronaldo posts and show me five options.
```

Possible flow:

1. Search web or open browser.
2. Collect candidate results.
3. Rank results.
4. Show options in the app.
5. Ask user to confirm.
6. Save or share selected item.

## Phase 3.5: System Overlay And Default Assistant Registration

**This is the next phase to build**, inserted ahead of Memory/Policies because it is more
foundational to the "operating layer" vision than either: memory and policies are more valuable
once the assistant can actually sit above other apps the way a real OS-level layer should,
rather than only being reachable by opening this app directly.

### Why This Phase, Now

Phase 1-3 built a capable assistant, but it only exists as a normal app the user has to open.
The product thesis in this plan's opening section is that the agent should move "closer to the
operating layer" instead of sitting inside one app window. A system overlay - a floating,
always-reachable AI surface that can appear above whatever app the user is currently in - is the
concrete first step toward that, and is a natural prerequisite for Phase 6's AI Launcher.

Reference behavior worth studying: Gemini's system-level integration on Android already
demonstrates the target interaction model - it overlays the current app, can read on-screen
context, proposes actions (e.g. drafting and sending a message), and is reachable via a
system-wide gesture. That is the mental model for this phase, not a replacement for Android,
but a layer on top of it.

### Revised Phase Ladder

1. **Full-screen app** (done) - the user opens this app manually. This is everything built in
   Phase 1-3.
2. **System overlay** - the AI becomes reachable while inside *any* app, not just this one.
3. **Default Digital Assistant registration** - where the device/manufacturer allows it, a
   system gesture (long-press power button, assistant swipe) launches this app's AI instead of
   Gemini/Bixby/whatever is currently configured.
4. **AI Launcher** (Phase 6, unchanged below) - replace the home screen entirely.

Each step builds on the previous one; none require jumping straight to replacing the OS.

### Step 1: Overlay Window

- Android's overlay mechanism is `TYPE_APPLICATION_OVERLAY` via `WindowManager`, gated by the
  `SYSTEM_ALERT_WINDOW` permission - **already declared in this project's manifest**
  (`android/app/src/main/AndroidManifest.xml`), so no new permission plumbing is needed to start.
  It does need the special "draw over other apps" grant flow (like `WRITE_SETTINGS` /
  `REQUEST_INSTALL_PACKAGES` in the existing capability backlog - a Settings-screen toggle, not a
  runtime dialog), and modern Android additionally requires hosting the overlay from a running
  **foreground service** (with its own persistent notification) rather than an Activity, since a
  backgrounded Activity cannot keep a window alive indefinitely.
- Minimal v1 overlay: a small floating "chip"/bubble the user can drag and tap, which expands
  into a compact version of the existing `WorkflowCard` chat UI, rendered in the overlay window
  instead of the full-screen app. Reuse the same tool registry, backend workflow client, and
  voice input - the overlay is a second presentation surface for the same functionality already
  built, not a second implementation of it.

### Step 2: Activation Mechanisms

Multiple ways to summon the overlay, roughly ordered by implementation effort:

| Mechanism | Notes |
| --- | --- |
| App icon (existing) | Already works - opening the app normally. |
| Persistent notification action | Low effort; a notification action can toggle the overlay. |
| Quick Settings tile | `TileService` - one tap from the notification shade, any app. **Implemented in the current mobile tree.** |
| Home screen widget | Static launcher affordance, no gesture needed. |
| Floating bubble (the overlay itself) | Persistent small tap target once the overlay is shown. |
| Voice activation while the app/overlay is already running | Opt-in `VoiceActivationService` listens for “Hey Casper” and routes commands into the existing workflow. **Implemented in the current mobile tree.** |

The structured image path is also now implemented: `search_images` calls Brave Image Search,
the Tools tab renders selectable thumbnails, and `set_wallpaper` applies the selected image after
confirmation. `browse_for_image` provides an AI-OS-owned WebView fallback that returns an image URL
when the user taps an image on a source page. Accessibility/screenshot-driven control of arbitrary
third-party apps remains a later opt-in capability because it requires sensitive Android permissions.

**Caveat - the Gemini-style long-press is a different, harder thing.** That specific gesture
(long-press power button, or the assistant swipe) is handled by Android's assist framework and
launches whichever app is configured as the device's **default digital assistant**. Whether a
third-party app can be set as that default, and how, varies by Android version and device
manufacturer (Samsung, Google, Xiaomi, etc. each customize this differently) - some devices let
the user pick any app implementing the required assistant interfaces (`VoiceInteractionService`
+ an assist-capable activity), others restrict it further. Do not assume every phone will let
this app replace the configured assistant; treat it as a "where supported" capability (Step 3
below), not a guaranteed one, and always keep the other activation mechanisms as the reliable
fallback.

### Step 3: Default Assistant Registration (Where Supported)

- Implement Android's assist APIs (`VoiceInteractionService`, the assist-capable activity
  contract) so the app becomes *selectable* as the default assistant in Settings on devices that
  allow third-party assistants.
- This is additive, not a replacement for Step 1/2 - most users on most devices will still reach
  the AI via the overlay's own activation mechanisms, not the system assistant gesture.

### Design Refinement: A Task Center, Not Just A Chat Thread

The existing `WorkflowCard` chat UI (tool call -> confirm -> reply -> tool call -> ...) works,
but a chat transcript is not the only, or necessarily the best, way to present ongoing work.
Consider evolving the overlay's presentation toward a **task center**: instead of scrolling chat
bubbles, show the current task as a short list of live status lines, e.g.:

```text
Searching Pinterest...
  Found 48 posts
Ranking images...
  Top 5 ready
Waiting for your choice...
```

This is a relatively small change on top of what already exists - `WorkflowCard`'s
"Completed steps" list (`completedSteps.map(...)`) already renders executed tool calls as a
running list; the task-center framing mainly asks for status verbs (searching/ranking/waiting)
and a progress feel, rather than raw `toolName(args) -> result` lines, when this UI moves into
the more space-constrained overlay surface. It should feel like an operating system doing work
in the background, not a chatbot the user has to keep talking to.

## Phase 4: Add Memory

Purpose: make the assistant personal and persistent.

Recommended stack:

- PostgreSQL for structured memory.
- `pgvector` for semantic memory.
- Optional graph model later for relationships among people, places, goals, projects, and routines.

Memory should include:

- User preferences.
- Important people.
- Goals.
- Repeated routines.
- Tool execution history.
- Confirmed decisions.

## Phase 5: Add Policies

Purpose: move from assistant to behavioral operating layer.

Example policies:

- Do not open YouTube until homework is complete.
- Limit Instagram to 30 minutes.
- Silence notifications after 10 PM except family.
- Block food delivery after a configured time.

Android implementation may need:

- Usage access permission.
- Notification listener permission.
- Accessibility service for some enforcement paths.
- A foreground service for ongoing policy checks.

Every policy must be user-created, visible, reversible, and easy to disable.

## Phase 6: AI Launcher

Purpose: become the home screen, not just another app.

This is the route toward tasks like:

- Rearrange apps into categories and screens.
- Hide social media until a policy condition is met.
- Surface the most relevant actions instead of app icons.
- Organize the phone around user intent.

Important constraint: normal Android apps generally cannot rearrange another launcher's home screen. To control home-screen layout cleanly, this project should eventually build its own Android launcher.

The detailed launcher and intent-layer design (capabilities and providers, preference learning, the Launcher v0 Home screen, roadmap) is in [AI_OS_INTENT_LAYER_PLAN.md](AI_OS_INTENT_LAYER_PLAN.md); UI rules are in [../mobile/DESIGN.md](../mobile/DESIGN.md).

## First Two-Week Execution Plan

### Days 1-2: Setup

- Initialize Git.
- Create `.gitignore`.
- Install/check Node, npm, Git, Android Studio, Java, and adb.
- Create the Expo TypeScript app in `mobile/`.
- Run the blank app on Android.

### Days 3-5: Native Bridge

- Run Expo prebuild for Android.
- Create a Kotlin native module skeleton.
- Call a basic native method from TypeScript.
- Display the result in the app.

### Days 6-8: First Tool

- Implement `get_installed_apps`.
- Display app names and package names.
- Add loading and error states.
- Add result JSON viewer.

### Days 9-10: Tool Registry

- Define `ToolDefinition` in TypeScript.
- Register `get_installed_apps`.
- Make the UI render tools from the registry.

### Days 11-12: Second Tool

- Implement `open_application`.
- Let the user pick an installed app from the result list.
- Launch it through an Android intent.

### Days 13-14: Documentation And Hardening

- Add a mobile setup README.
- Document permissions.
- Test on emulator and physical Android device if available.
- Write the next tool backlog.

## Tool Backlog

### Phone And Apps

- `get_installed_apps`
- `open_application`
- `search_installed_apps`
- `get_foreground_app` later, likely requires usage/accessibility permissions

### Device Context

- `get_device_info`
- `get_battery_status`
- `get_network_status`
- `get_current_location`

### Communication

- `get_contacts`
- `find_contact`
- `send_sms`
- `make_call`

### Photos And Files

- `list_photo_albums`
- `search_photos`
- `share_photo`
- `find_file`
- `move_file`

### Calendar

- `find_events`
- `create_event`
- `update_event`

### Notifications And Policies

- `read_notifications`
- `dismiss_notification`
- `create_policy`
- `evaluate_policy`
- `enforce_policy`

## Advanced Capability Backlog (Ranked By Difficulty)

Build order for the next stretch of tools, easiest to hardest. Ranking is by real Android
implementation cost: permission model, whether an Intent can delegate the hard part to an
existing app, whether a new external API/dependency is needed, and whether Android's security
model allows the action at all for a normal (non-system, non-rooted) app.

Guiding principle for every app-interaction tool below (not just `open_application`): prefer a
**deep link** (an `Intent` with a specific URI/extras) over a bare launch whenever the target
app supports one. "Open YouTube" is a weak tool; "open YouTube already searching X" or "open Maps
already routing to X" is the same Android API surface (`ACTION_VIEW` + a URI) for barely more
code, and it is what makes the phone feel actually intent-driven instead of just an app launcher.

1. **`adjust_volume`** (increase / decrease / mute) - `AudioManager.adjustStreamVolume`. No
   runtime permission. Easiest tool in the entire backlog.
2. **Deep-link navigation tools** - `search_youtube` (`https://www.youtube.com/results?search_query=`),
   `search_web` via browser (`Intent.ACTION_WEB_SEARCH` or a plain `https://` URL),
   `navigate_maps` (`google.navigation:q=` or `geo:` URI), `search_in_app` for any app with a
   known search deep link. No new permission beyond the existing browsable `<queries>` entry.
   This is the direct answer to "every app should do something more complicated than just open" -
   it is `open_application` plus a URI, not a new capability class.
3. **`send_sms`** - `SEND_SMS` runtime permission (dangerous-permission tier, same
   `PermissionHelper` pattern as location/contacts) + `SmsManager.sendTextMessage`. Sending does
   NOT require being the default SMS app (only *receiving*/*reading* SMS does).
4. **`set_screen_brightness`** - needs `WRITE_SETTINGS`, which is a *special* permission: it
   cannot be granted through the normal runtime-permission dialog. The user must be sent to
   `Settings.ACTION_MANAGE_WRITE_SETTINGS` once and flip it on manually. Slightly more UX plumbing
   than a dangerous permission, otherwise straightforward (`Settings.System.putInt(SCREEN_BRIGHTNESS)`).
5. **`take_photo`** - **implemented as an in-app CameraX capture with a 3-second countdown that
   auto-fires**, not the originally-planned Intent delegation to the stock Camera app. Delegating
   via `ACTION_IMAGE_CAPTURE` cannot be driven to auto-capture - it only opens the Camera app's own
   UI and waits for the user to tap the shutter themselves, with no way to script that tap through
   Intent extras. An autonomous countdown-then-capture requires a real in-app camera
   (`TimedCameraActivity.kt`: `androidx.camera:camera-*` `Preview` + `ImageCapture` use cases bound
   to the activity's lifecycle, a `Handler`-driven 1-second countdown, then a programmatic
   `takePicture()` call). Still fully user-visible and user-initiated (the countdown and preview
   are on screen the whole time) - this is a "3-2-1 selfie timer," not a silent/hidden capture.
   Needs `CAMERA` permission and the shared `FileProvider` entry for the output URI.
6. **`record_video`** - like `take_photo`, implemented as an in-app CameraX capture
   (`InAppCaptureActivity.kt`, shared with the photo path via an `EXTRA_CAPTURE_MODE` extra), not
   Intent delegation - `ACTION_VIDEO_CAPTURE` has the same "can't be scripted" limitation as
   `ACTION_IMAGE_CAPTURE`. Recording starts immediately (no countdown - unlike a photo, video
   needs the subject to already be ready) and stops on a visible on-screen Stop tap or
   automatically after a 60-second safety cap. The privacy line this project won't cross is
   **silent/hidden** recording (no camera preview on screen, no way for the user to see or stop
   it, e.g. via a foreground service with no UI) - it is NOT "must require a manual tap to start."
   An auto-starting recording that stays fully visible on screen the whole time, with a visible
   stop control, does not cross that line; a background/headless one would. Needs `CAMERA` and
   `RECORD_AUDIO` permission.
7. **`search_web`** (structured results, not just "open a browser") - the first tool needing a new
   external dependency: a search API (e.g. Google Custom Search JSON API, Bing Search API, Brave
   Search API - needs its own API key, likely proxied through `backend/` rather than embedded in
   the client, following the same key-handling lesson as the OpenAI key). Returns a small ranked
   list of options into the app's own UI (this is what makes it a "return options in our
   interface" tool, not a deep link). Pairs naturally with capability 2 above - once web search
   returns a URL, "open it" is a one-line deep link.
8. **Multi-step "search then act" workflows** (the plan's original Ronaldo example: search, show
   five options, let the user pick, open/save the pick) - not new Android capability, just
   composition of capability 7 + capability 2 through the Phase 3 LangGraph workflow. Difficulty
   here is graph/UI design (how the "pick one of N options" interrupt looks), not phone APIs.
9. **App-store search + open listing for the user to tap Install** ("find the top 10 fitness apps,
   show me 3, take me to the one I pick") - easy, same tier as capability 8. Search (capability 7,
   optionally restricted to `play.google.com`) finds candidates, we present 3 in our own UI, and
   the user's pick opens `market://details?id=<package>` (a plain `ACTION_VIEW` deep link, no new
   permission) directly on that app's Play Store page. The user taps Install there - this is a
   completely standard, fully-supported pattern with no wall at all. Do not undersell this as hard.
10. **`install_local_apk`** - a real, working "ask the user" install flow, but only for an APK file
    we can legitimately obtain (sideloaded, F-Droid, a project's own GitHub release - NOT a Play
    Store app; see the wall in item 11). Needs the `REQUEST_INSTALL_PACKAGES` special permission
    (same tier as `WRITE_SETTINGS` - one-time Settings toggle, not a runtime dialog) plus
    `PackageInstaller.Session` to trigger Android's own system "Install this app?" confirmation.
    Once the user taps Install there, the app driving that session (us) completed the flow -
    this is a legitimate one-tap install, not a workaround.
11. **`restart_device`** and **fully-silent app install (zero user tap, any source)** - grouped
    together because they hit the exact same wall: both `REBOOT` and unattended
    `PackageInstaller`/`INSTALL_PACKAGES` use are **signature-level** permissions. Unlike
    `WRITE_SETTINGS`/`REQUEST_INSTALL_PACKAGES` above, Android provides **no user-facing grant
    mechanism at all** for this permission tier - no Settings toggle, no dialog, nothing a user can
    tap to hand it to a normal app, regardless of consent. The only two paths that cross this line:
    - **Root** (`su -c reboot`, `su -c pm install`) - bypasses the Android permission system
      entirely rather than obtaining consent through it. This emulator's current AVD is a "Google
      Play" system image (`ro.build.type=user`, non-debuggable) and does NOT support `adb root`;
      a rootable AVD needs a separate "Google APIs" (non-Play Store) system image instead.
    - **Device Owner enrollment** (`DevicePolicyManager.reboot()`, silent install via a
      Device-Owner-privileged `PackageInstaller` session) - no root needed, but is a one-time
      device *enrollment* (`adb shell dpm set-device-owner ...`), not a per-action prompt, and only
      works on a device with **zero accounts already added**. This emulator already has a Google
      account signed in, which blocks it until removed (or done on a fresh AVD).
    Treat both as out of scope unless there is an explicit decision to set up a second, dedicated
    rootable or account-free AVD for them - do not attempt a workaround that silently fails or
    requires undisclosed root access without that trade-off being chosen first.

## Key Technical Choices

### Start Android First

Android exposes more of the phone through APIs, intents, launchers, accessibility services, notification access, and background services. iOS can be explored later through App Intents and Shortcuts, but it is much more constrained.

### Start With Expo, Then Prebuild

Expo is useful for speed. Native Android control requires `expo prebuild` and Kotlin modules.

### Build Tools Before Agents

The AI planner is only useful when tools exist. The first project risk is not model intelligence; it is whether the app can safely and reliably expose phone capabilities.

### Use Confirmation For Risky Actions

Actions such as deleting photos, sending messages, making calls, moving files, or enforcing app blocks should require explicit confirmation until trust and safeguards are mature.

## Future Dependency Map

Install dependencies only when the phase needs them.

### Phase 1

- `expo`
- `react-native`
- `typescript`
- Android Gradle/Kotlin generated by Expo prebuild

### Phase 2

- Model SDK for chosen provider, such as Gemini, OpenAI, or Anthropic
- Environment variable support for API keys

### Phase 3

- LangGraph or another orchestration framework
- Backend runtime, likely Python/FastAPI or Node/TypeScript

### Phase 4

- PostgreSQL
- `pgvector`
- Database migration tool

### Phase 5

- Android foreground service support
- Usage access integration
- Notification listener service
- Accessibility service, only where appropriate

### Phase 6

- Android launcher activity
- App grid/folder data model
- Widget and shortcut support where possible

## Outcome Use-Case Portfolio

The product portfolio below turns the original examples into concrete, testable outcome tracks.
Several hackathon demos are implementation slices of the larger tracks; they are listed separately
so each can produce a measurable milestone without pretending the full outcome is already solved.

### Core outcome tracks

1. **Run my entire travel day** — coordinate confirmations, calendar, maps, files, rides,
   notifications, and follow-up across a long-running workflow.
2. **Process a work expense** — read a receipt, reconcile supporting data, create and submit a
   claim, then monitor its outcome.
3. **Prepare me for a meeting** — assemble calendar, contacts, messages, documents, public research,
   briefing notes, and follow-up actions.
4. **Protect my goal** — enforce focus rules across apps and unlock distractions only after a
   user-defined outcome is verified.
5. **Diagnose and fix unreliable internet** — inspect connectivity, test hypotheses, apply safe
   changes, escalate to support, and verify improvement.
6. **Diagnose and improve battery life** — inspect usage, propose reversible settings changes,
   measure the result, and roll back harmful changes.
7. **Free storage safely** — identify duplicates, caches, and backed-up files, show confidence-based
   choices, delete/archive approved items, and verify recovered space.
8. **Repair a crashing app** — reproduce an observable failure, inspect safe diagnostics, apply
   reversible fixes, and verify the app works again.
9. **Respond to suspicious charges** — investigate notifications and receipts, pause at financial
   actions, secure accounts, and track the dispute.
10. **Recover after phone theft** — coordinate device lock, account/session protection, carrier
    recovery, evidence preservation, and replacement-device restoration.

### Hackathon/demo slices

11. **AI Phone Doctor** — one task center combining battery, storage, connectivity, and app-health
    diagnostics with before/after measurements.
12. **Safe storage cleanup** — the first destructive-action workflow, with confidence tiers and
    explicit confirmation for every deletion/archive batch.
13. **Goal Guard** — a focused policy vertical slice: start a study task, block selected apps, ask
    review questions, and unlock only after completion.
14. **App Repair Assistant** — a constrained diagnostic flow for one app using visible errors,
    connectivity, permissions, version, and cache checks.
15. **Meeting Brief** — a read-only cross-source briefing that produces immediate user value before
    adding follow-up automation.

### Delivery order from easiest to hardest

The existing image-search/wallpaper and app/browser routing work is the first usable demonstration.
The next implementation slice is **AI Phone Doctor: storage snapshot**, followed by network
diagnostics, battery usage, safe storage cleanup, Meeting Brief, App Repair, Goal Guard, and the
long-running travel/expense/security workflows. Accessibility-driven cross-app enforcement and a
full launcher remain later platform phases.

### Managed-device mode (Device Owner / DPC)

AI-OS now includes the first managed-device slice: a device-admin receiver, policy-status tool,
and owner-only app suspension tool. On a provisioned test device this enables stronger Goal Guard
and battery/storage policy enforcement than a normal app can provide. It does not grant root access
or bypass Android's security model. Provisioning is an administrator action performed on a clean
device (normally with Android's `dpm set-device-owner` flow); the app must never factory-reset or
silently self-provision a user's phone. Normal phones continue using user-approved settings, Usage
Access, and system confirmation screens.

The first Goal Guard vertical slice is now implemented in the Tools tab: the user enters a goal,
chooses apps by name from the installed-app picker, starts enforcement, and explicitly unlocks
the apps after completion. The planner can now inspect the installed inventory, classify a request
such as “lock all social media,” propose one grouped suspension action, and verify policy status.
For an explicit “allow only AI-OS” request it can use the separate Device Owner lock-task/kiosk
tool, with a confirmation warning because the user may be unable to leave the app. It fails closed
when Device Owner is unavailable. Next increment: persist policies, add audit events, and require a
configurable evidence check (for example a short quiz or completed task) before unlock. Timed
focus policies now persist the selected apps and automatically restore them at a deadline using
an Android alarm receiver; the UI currently exposes a duration in minutes, while the planner can
translate natural-language deadlines into a duration or ask for clarification.

## Procedural Intelligence Roadmap

The next capability track turns one-off phone-use execution into reusable procedural
knowledge. Phase 4 is in progress; later phases are deliberately sequenced so each one
adds reliability and network effects without sharing private user data.

### Phase 4 — Procedural Memory (complete for local/device-scoped workflows)

Persist privacy-minimized execution traces (short intent, tool names, arguments, outcome),
retrieve matching procedures at workflow start, and provide them to the planner as verifiable
hints. The app now reports when a procedure was reused, and users can list, search, or delete
learned procedures. Workflows have an explicit completion path that records success, failure,
cancellation, or rollback outcomes; traces are scoped by a caller-provided device/user scope,
deduplicated, and versioned. Step payloads are Fernet-encrypted when
`GOOGLE_TOKEN_ENCRYPTION_KEY` is configured. Never store screenshots, credentials, message
bodies, tool results, or raw personal content in this layer. Multi-user authentication and key
rotation remain deployment hardening rather than local MVP work.

### Phase 5 — Learning Mode / Workflow Recorder (in progress)

Let a user teach an unfamiliar app once while AI-OS records semantic UI nodes, actions,
conditions, and completion evidence rather than brittle coordinates. The first recorder
contract is now available through `/learning/sessions`: start a teaching session, append
semantic actions, and complete it into a saved procedure draft. AI-OS now includes a consented
AccessibilityService watcher, an Accessibility settings handoff, a live action counter, and
mobile controls for starting/finishing teaching, plus draft review/approval. Remaining work is
safe replay is now available for approved tap/scroll procedures through semantic selectors, and
text-input steps can receive one-time runtime values supplied by the user. Typed values are not
stored in procedure memory. Remaining work is completion detection and robust UI-node selectors
on more Android versions. The planner now has `list_learned_procedures` and
`replay_learned_procedure`, allowing it to extract current-request values such as “Home” and
propose a replay while preserving the normal confirmation boundary.
Replay now supports an optional completion selector and reports verification status; selector
lookup falls back from resource ID to visible text/content description. Device validation is
tracked in `docs/ANDROID_VALIDATION_CHECKLIST.md` and requires an Android emulator or device.

#### Phase 5 reliability direction: semantic state machines

Cross-app teaching and replay is feasible, but accessibility event streams are not a faithful
recording of every physical gesture. Custom controls may expose focus or text changes without a
click event; screens may create fields only after activation; and layout changes may emit false
scroll callbacks. The recorder/replayer must therefore model workflows as semantic state
transitions rather than replaying an event list literally. Each action should retain its target,
hierarchy context, pre/post screen evidence, and confidence. Replay should use bounded,
app-agnostic activation and gesture fallbacks, wait for the expected state, validate the target
package and node before input, and abort with diagnostics when confidence is low. It must never
silently switch procedures or type into another app. Validation should cover app categories and
UI patterns, with app-specific adapters reserved for interfaces that expose no stable semantics.

### Core-phase verification

Phases 1–4 have backend and contract coverage for tool-facing orchestration, workflow memory,
completion outcomes, and learning-session persistence. Phase 5 has coverage for semantic session
sanitization, draft creation, approval, and the replay contract. Android Accessibility behavior
still requires a real device/emulator test because the local environment cannot run Gradle/device
validation.

### Phase 6 — Adaptive Memory / Workflow Diff

Detect UI changes, localize the changed step, relearn only that node, and version procedures
with rollback to the last known-good revision.

### Phase 7 — Confidence Engine

Score each procedure and step from evidence, recency, failures, and user corrections; require
confirmation whenever confidence or action risk is below policy thresholds.

### Phase 8 — Shared Knowledge

Publish reviewed, abstract workflows that contain no account data or private content so new
users can benefit from common app skills immediately.

### Phase 9 — Federated Learning

Keep raw traces on-device and upload only privacy-reviewed workflow improvements or diffs;
support opt-in, deletion, provenance, and abuse monitoring.

### Phase 10 — Skill Marketplace

Package signed, versioned workflow skills for apps such as transport, shopping, media, and
productivity, with permissions, trust ratings, and safe installation.

### Phase 11 — Intent Engine

Map outcome-level intents such as “get me home safely” to the best available native API,
official integration, deep link, learned procedure, or phone-use fallback.

### Phase 12 — Universal Task Graph

Unify goals, workflows, tools, UI actions, approvals, verification, and memory into one
auditable graph that can pause and resume across minutes or days.

### Phase 13 — Self-Improvement

Use success, failure, latency, corrections, and verification signals to improve procedures
without silently expanding permissions or changing high-risk behavior.

### Phase 14 — Autonomous Optimization

Suggest safe optimizations for repeated routines, explain the proposed change, and apply it
only after policy checks and user approval where the outcome or risk changes.

### Phase 5.5 - Planner-guided replay recovery

The planner may guide recovery after deterministic replay detects a mismatch, but it must not
replace replay or issue unconstrained taps. Evolve saved steps toward checkpoints containing
preconditions, intended targets, expected postconditions, stable selectors and alternatives,
screen/hierarchy evidence, reversibility, confidence, and known failure signatures.

After each step, replay observes semantic state and either continues or invokes one bounded policy:
wait for loading, retry the selector, gesture-focus, reopen the expected field, dismiss a known
overlay, resume from the last confirmed checkpoint, request user confirmation, or abort. Recovery
must carry a reason and action budget, validate the target package, and emit a trace. The planner
must not invent coordinates, switch procedures, type while the target is unverified, or silently
continue after ambiguity. Visual computer-use fallback is reserved for interfaces without enough
accessibility evidence and follows the same safety and confirmation policy.

## Immediate Next Action

**Updated 2026-07-20.** Phase 1 (phone capability layer, 10+ tools), Phase 2 (single-shot
planner - since merged into Phase 3's UI, see below), and Phase 3 (LangGraph multi-step
orchestration, verified end-to-end with the Ronaldo-style search-then-act workflow) are done.
The app now also has a Chat/Tools two-tab navigation and a dark theme matching the AI-OS brand.

Next: continue **Phase 5, Learning Mode** by connecting the semantic recorder contract to an
explicit Android AccessibilityService teaching session. Phase 3.5 overlay work remains
available for teaching and approvals.

Original first milestone (superseded, kept for history):

> Tap a button in the app and see the installed Android apps returned from Kotlin.

That was the first real brick of the AI operating system.
