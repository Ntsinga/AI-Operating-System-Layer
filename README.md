# AI-OS Orchestrator

Android-first AI-native operating layer project.

Start here:

- [Project plan](docs/AI_OS_ORCHESTRATOR_PLAN.md)
- [Voice/chat test guide](docs/AI_OS_TEST_GUIDE.md)
- [Source chat export](docs/source/AI-native_OS_Development_2026-07-18.txt)

The first implementation milestone is intentionally small: create the mobile app, build a Kotlin native bridge, and display installed Android apps from React Native.

## Project Commands

Send `#start` in Codex to run the project startup workflow. It starts the backend, waits for its health endpoint, then builds and launches Android. The underlying command is:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-aios.ps1
```

Useful variants:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-aios.ps1 -BuildOnly
powershell -ExecutionPolicy Bypass -File .\scripts\start-aios.ps1 -SkipBuild
```

## Render API Deployment

For Render Docker deployment from this monorepo:

- Service type: `Web Service`
- Runtime: `Docker`
- Root directory: `backend`
- Dockerfile path: `Dockerfile`
- Health check path: `/health`

Render provides the `PORT` environment variable automatically. The backend Dockerfile starts:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Add any required API keys and OAuth settings from `backend/.env.example` as Render environment variables.

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
