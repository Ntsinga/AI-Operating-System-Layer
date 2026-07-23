# AI-OS Orchestrator

Android-first AI-native operating layer project.

Start here:

- [Project plan](docs/AI_OS_ORCHESTRATOR_PLAN.md)
- [Source chat export](docs/source/AI-native_OS_Development_2026-07-18.txt)

The first implementation milestone is intentionally small: create the mobile app, build a Kotlin native bridge, and display installed Android apps from React Native.

## Current Status

- `mobile/` has been scaffolded with Expo, React Native, and TypeScript.
- TypeScript validation passes with `npx tsc --noEmit` from `mobile/`.
- Node, npm, Git, and adb are available locally.
- Java is not currently available on PATH, so Android native builds may need JDK setup before `npm run android` works reliably.

## Mobile Commands

```powershell
Set-Location mobile
npm start
npx tsc --noEmit
```

Android run command, after Java/JDK setup is confirmed:

```powershell
Set-Location mobile
npm run android
```
