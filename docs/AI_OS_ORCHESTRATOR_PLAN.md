# AI-OS Orchestrator Project Plan

Source brief: [source/AI-native_OS_Development_2026-07-18.txt](source/AI-native_OS_Development_2026-07-18.txt)

## Product Thesis

The project is an Android-first AI-native operating layer. It starts as a mobile app, then grows into a phone capability layer, tool orchestrator, memory system, policy engine, and eventually an AI-first launcher.

The core belief is:

> AI agents are becoming the new way people use technology. So why not use AI to control your phone, the technology interface you interact with the most. By understanding the phone, it understands you.

The distinction is ownership of the interface. A normal agent sits inside an app or browser tab and asks other systems for permission to act. This project aims to move the agent closer to the operating layer: current screen, installed apps, notifications, files, photos, contacts, calendar, launcher state, and user-defined policies. The long-term goal is not a smarter chat window; it is an intent-driven phone environment where apps become capabilities and the AI becomes the coordinator.

This should not begin as a chatbot. The first valuable asset is the phone action layer: clean, testable tools that let software inspect and control phone capabilities with explicit user permissions. The second valuable asset is the policy layer: rules the user can create, audit, reverse, and enforce at the device-interface level.

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

## Immediate Next Action

Set up Java/JDK access for Android builds, then run the mobile app on Android. After that, generate the native Android project with Expo prebuild, implement the smallest Kotlin bridge method, and replace it with `get_installed_apps`.

The first milestone is intentionally small:

> Tap a button in the app and see the installed Android apps returned from Kotlin.

That is the first real brick of the AI operating system.
