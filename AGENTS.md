# AI-OS project commands

When the user sends `#start`, run the project startup workflow:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-aios.ps1
```

The workflow starts the FastAPI backend, waits for `/health`, then builds and launches the Android app from `mobile/`. Report backend health, build result, and APK path (if produced). Do not claim the app is running if Gradle or Metro failed.
