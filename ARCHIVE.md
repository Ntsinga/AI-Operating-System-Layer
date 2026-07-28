# Session Archive

## 2026-07-28: Uber Teaching and Replay Investigation

### Evidence

- Ride 30 (procedure 37): 12 stored steps, duplicated; included three false startup scrolls per pass, then focus/text/tap.
- Ride 31 (procedure 38): 6 stored steps; began with synthetic focus on `com.ubercab:id/edit_text`, then text input and result tap. It had no activation tap.
- Ride 32 (procedure 39): 6 stored steps; began with a synthetic tap on the destination container, then text input and result tap.
- Ride 33 (procedure 40): 6 stored steps; same synthetic destination-container tap pattern. Database inspection confirmed the newly added synthetic tap was stored.
- Replay traces showed Uber home was ready, but the post-activation destination container was not present. Replay skipped the tap, could not find `edit_text`, and later saw `com.aioperatingsystem`, the launcher, or the keyboard as the root. It aborted with `target_surface_lost` rather than risking input in the wrong app.
- Early attempts queried only local SQLite or old logcat, producing the incorrect conclusion that Ride 31 did not exist. The authoritative remote DB query is `backend/.venv/Scripts/python.exe scripts/query-semantic-actions.py` with `backend/.env` loaded.

### Root Causes

- Uber's custom clickable field often exposes focus/text-change accessibility events but not a reliable `TYPE_VIEW_CLICKED` event for the physical tap.
- The replay gesture-focus fix only helps after a target node exists; it cannot recover an activation gesture that was never recorded.
- Synthetic activation initially copied the post-activation editable field/container selector. That selector is unavailable on Uber's initial home screen.
- Uber emits startup `TYPE_VIEW_SCROLLED` callbacks during layout and bottom-sheet changes. Treating them as user scrolls contaminated lessons.
- The floating AI-OS overlay or AI-OS activity could reclaim the accessibility/foreground root during external replay. Strict target validation correctly stopped execution.

### Fixes and Safeguards

- Preserve real gesture tap plus focus fallback for replayed focus actions.
- Ignore startup scroll callbacks until a semantic tap/focus/text action exists, and reject invalid scroll bounds.
- Add hierarchy-derived synthetic activation before text input, selecting the nearest clickable container around the editable field.
- Add a generic pre-activation replay fallback based on clickable accessibility shape/state when the recorded post-activation container is absent.
- Suspend the AI-OS overlay during external-app replay and restore it in `finally`.
- Keep exact-procedure selection and strict target-surface aborts; never silently fall back to a different procedure or app.

### Architectural conclusion

The project remains viable. The scalable design is a semantic state machine: event streams are
evidence, not a perfect gesture recording. Store target and hierarchy context plus pre/post state,
wait for transitions, use bounded generic gesture fallbacks, and attach confidence to each step.
Support conventional native apps broadly, diagnose or adapt inaccessible/custom interfaces, and
never trade correctness for silent cross-app input.

### Planner-guided recovery strategy

Planner control is intentionally bounded. Replay remains the primary executor; after a checkpoint
mismatch, the planner may select only wait, retry, gesture-focus, reopen-field, dismiss-overlay,
resume-checkpoint, user-confirmation, or abort. Each attempt must validate the target package,
carry a reason and action budget, and emit a trace. Visual computer-use fallback is for missing
accessibility evidence only and follows the same safety policy.

### Tooling and Device Issues

- A recursive file search initially timed out because it traversed `backend/.venv` and `mobile/node_modules`; exclude generated dependency trees.
- The first Gradle install attempt timed out without useful compiler output. A longer `--no-daemon --console=plain` offline install completed successfully.
- Gradle/Expo emitted `NODE_ENV` missing warnings during install; the build still completed successfully.
- After each successful install, `pm uninstall --user 95 com.aioperatingsystem` returned `Success`; `dumpsys package` confirmed user 0 installed and user 95 absent.
