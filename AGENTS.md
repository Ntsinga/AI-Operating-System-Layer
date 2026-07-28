# AI-OS project commands

When the user sends `#start`, run the project startup workflow:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-aios.ps1
```

The workflow starts the FastAPI backend, waits for `/health`, then builds and launches the Android app from `mobile/`. Report backend health, build result, and APK path (if produced). Do not claim the app is running if Gradle or Metro failed.

After making changes to the mobile app, always build and install the updated Android app on the connected device/emulator before reporting completion. Report whether the build/install succeeded, which target received it, and the APK path if one was produced. If build or install fails, report the exact failing step and do not claim the device has the latest app. On Samsung devices with a `DUAL_APP`/user 95 profile, always run secondary-user cleanup after every install with `pm uninstall --user 95 com.aioperatingsystem` regardless of whether a pre-check shows a clone. Then verify AI-OS is installed only for the primary user.

Known local validation gotchas: in this workspace, `npm exec tsc -- --noEmit` and Gradle Android tasks often fail inside the managed sandbox because Node cannot stat `C:\Users\ElijahNtsinga` and Gradle may need wrapper/cache access even with `--offline`. For TypeScript or Android validation, request filesystem approval/escalation up front instead of first running a doomed sandboxed check. Use scoped approvals such as `npm exec`, `.\gradlew.bat :app:compileDebugKotlin`, `.\gradlew.bat :app:assembleDebug`, or `.\gradlew.bat :app:installDebug`.

Regression prevention: before changing any nontrivial behavior, inspect the current implementation, nearby call sites, relevant logs/progress notes, and recent git history for the same files. Preserve existing behavior unless the user explicitly asks to remove it. When replacing or simplifying code, carry forward all behavioral safeguards from the prior implementation, including waits, retries, validation, fallbacks, cleanup, metadata propagation, and logging. If runtime logs mention behavior not present in the local source, treat that as a warning that the checkout may be behind a prior fix; find and port the missing behavior before making further changes. Do not delete or bypass working logic to fix a narrower bug.

Session continuity: read `PROGRESS.md`, `ARCHIVE.md`, and the relevant `ERROR_LOG.md` entries before debugging. Record every material regression, database/log discrepancy, secondary Android-user issue, build/install failure, timeout, sandbox or shell limitation, and workaround in those files before finishing the task. When investigating learned procedures, query the configured database as well as logcat; local SQLite may be stale.

Learned procedure replay must be exact by default. Do not silently fall back from a requested procedure to a different "better" procedure: that hides broken teaching/storage and makes debugging impossible. If the selected procedure has no stable replayable `tap` or `text_input` selectors, reject it before opening the target app, record debug details about the missing selector metadata, and investigate why capture/storage failed.

Planner-guided replay recovery must remain bounded and typed. Deterministic replay executes first; planner recovery may only choose wait, retry, gesture-focus, reopen-field, dismiss-overlay, resume from a confirmed checkpoint, ask for confirmation, or abort. Validate the target package before every input action, enforce a small action budget, preserve trace reasons, and never invent coordinates, switch procedures, type into an unverified app, or silently continue after ambiguous state.
