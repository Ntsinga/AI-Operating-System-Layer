# AI-OS Progress

## 2026-07-28 Replay and Teaching Session

- Investigated Uber lessons Ride 30 through Ride 33 using both logcat and the configured remote database. Do not infer procedure contents from logcat alone; query `scripts/query-semantic-actions.py` and inspect the ordered `procedures.steps_json` record.
- Ride 30 contained false startup `scroll` actions emitted by Uber during layout/sheet transitions, including an invalid negative-height Saved places node. Ride 31 stored `focus -> text_input -> tap` without the activation tap. Ride 32 and Ride 33 received the generic synthetic activation tap, but the first implementation targeted Uber's post-activation destination container, which is absent on the home screen.
- Native replay preserves the existing gesture-based focus path: focus attempts a real gesture tap, then accessibility click fallback, then accessibility focus. Strict target-surface checks must remain enabled so replay aborts instead of typing into AI-OS or another app.
- Current native fixes: startup scroll noise is ignored before the first semantic action; text input can synthesize an activation target from the semantic hierarchy; replay has a generic pre-activation fallback for a missing synthetic container; external-app replay suspends and restores the AI-OS overlay.
- Build/install rule: after every mobile change, run `:app:installDebug --offline`, then always run `adb shell pm uninstall --user 95 com.aioperatingsystem` and verify user 0 is installed and user 95 is absent.
- Latest verification: Gradle install succeeded; user 95 cleanup succeeded; primary user 0 remains installed. A fresh post-fix replay still needs device confirmation with a newly captured lesson.

## Debugging Rules

- Inspect database and logcat together. Local `backend/procedural_memory.sqlite3` was stale and did not contain Ride 31; the configured remote PostgreSQL database contained procedure IDs 38-40.
- Do not tell the user a new lesson is absent based only on stale logcat. Query the remote DB first.
- Preserve app-agnostic selectors and hierarchy metadata. Do not hardcode Uber labels or ride-app field IDs into replay logic.
- Architectural conclusion: the goal remains feasible, but reliable cross-app automation requires a semantic state machine, not literal event replay. Preserve target/hierarchy and pre/post screen evidence, wait for state transitions, use bounded generic gesture fallbacks, score confidence, and abort safely when the target is ambiguous. Expect broad coverage across conventional native apps, with adapters only for interfaces that expose no stable semantics.
- Planner strategy: deterministic replay remains the primary executor; planner guidance is limited to typed, budgeted recovery after a checkpoint mismatch. Candidate recoveries are wait, retry, gesture-focus, reopen field, dismiss overlay, resume checkpoint, ask user, or abort. No arbitrary coordinates, procedure switching, unverified typing, or silent continuation.
- Implemented first checkpoint primitive in native replay: successful/verified steps now update `lastConfirmedCheckpoint`, and every replay trace detail carries that boundary for future bounded recovery/resume decisions. This does not yet give the planner arbitrary control.
