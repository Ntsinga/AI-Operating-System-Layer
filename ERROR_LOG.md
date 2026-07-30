# AI-OS Orchestrator — Error Log

Chronological incident log for product issues and task-execution failures. Newest entries at the bottom of each section. Read relevant entries before debugging build, native-bridge, or Android capability issues.

---

## 2026-07-30 — Added a third inference case: disappearance correlation ("Start your search")

- **Area**: `LearningWatcherService.kt` (`disappearanceInferenceCandidate`, new).
- **Context**: after confirming "Start your search" has no persisting node identity to match
  forward (Compose unmounts it entirely; the modal is a different composable tree, not a mutated
  version of the same one - see the entry above), the user pushed back: `semanticDiff`'s `removed`
  bucket was already being computed for every screen_transition, but nothing in the inference
  logic ever looked at it. An element that existed on the previous screen and is simply gone now
  is real evidence of what caused the change, even without forward identity to match.
- **Added**: `disappearanceInferenceCandidate` - a third case (tried after Case A same-node and
  Case B navigation correlation both fail), reading `semanticDiff.removed` directly (already
  computed by `addTransitionEvidence` before inference runs, so no extra tree walk needed).
  Requires exactly one clickable element to have vanished (2+ is the "scroll recycled several
  list rows" ambiguous case - reject, never guess which one) and a bounded set of 1-6 newly
  `added` elements alongside it (corroborates "this looks like a modal/sheet reveal," not "it
  scrolled off with nothing replacing it," and guards against the wholesale-reshuffle risk from
  the other direction too). Base score 0.4, capped at 0.7 - deliberately below both other cases,
  since this infers the cause from an absence rather than from any signal the vanished element
  itself produced.
- **Validation**: Kotlin compiles clean. On-device re-test (re-teach an Airbnb procedure through
  the "Start your search" modal and confirm step 0 now captures the search button itself, not one
  of the modal's new options) pending.
- Lesson: don't stop investigating once a plausible-sounding "this data doesn't exist" conclusion
  is reached - the data (`removed`) *did* exist here, computed for an entirely different reason
  (audit trail) three fixes ago, and simply wasn't being consulted. Worth explicitly checking what
  evidence is already being captured before concluding a case is unsolvable.

---

## 2026-07-30 — Inferred taps credited a modal's new option instead of the button that opened it

- **Area**: `LearningWatcherService.kt` (`sameNodeInferenceScore`).
- **Symptom**: teaching "Book 5" (tap "Start your search" -> a modal expands with several new
  options -> tap "Nearby"), the FIRST recorded step captured `text: "Nearby"`, not "Start your
  search" - and did so with high confidence, `inferred: true`.
- **Root cause**: `sameNodeInferenceScore`'s same-node case scored any small, clickable, labeled
  event-source node highly, with no check for whether that node existed on the PREVIOUS screen at
  all. When a tap causes a modal to reveal several brand-new options at once, any one of those new
  options can satisfy every criterion the scorer checks - small bounds, real label, clickable,
  enabled - despite having zero connection to what was physically touched (the tap that revealed
  them, not one of the revealed things itself). This is precisely the "which of several
  equally-plausible new things caused this" ambiguity the whole inference design is supposed to
  reject rather than resolve; the same-node case just wasn't checking for it.
- **Investigated further, not fixable by scoring alone**: confirmed "Start your search" itself is
  unrecoverable by ANY passive-inference improvement for this interaction shape. It's not a
  same-node state change (Compose unmounts the pill and mounts an entirely different composable
  tree - the modal - so there is no persisting node identity across the transition to match
  before/after by resourceId or label) and not a navigation correlation (the label "Start your
  search" doesn't reappear anywhere in the modal's content). No click event, no persisting
  identity, and no safe raw-touch API (ruled out earlier the same day: `onMotionEvent()` is
  Android 14+ and intercepts touches away from the target app). The full evidence set is
  genuinely exhausted, not under-exploited.
- **Fix**: added `existedOnPreviousScreen(action)` - checks the event's source (by resourceId, or
  by label when there's no resourceId) against `lastScreenInteractiveCandidates` (the previous
  screen's captured elements). `sameNodeInferenceScore` now requires this to be true before
  scoring anything. Case B (navigation correlation) already had this property by construction (it
  only ever considers candidates drawn from the previous screen). Net effect: this interaction
  pattern (tap reveals several new options) now correctly stays an un-inferred `screen_transition`
  instead of confidently recording the wrong element - a false negative instead of a false
  positive, which is the right tradeoff given a wrong recorded tap would otherwise execute
  silently and confidently at replay time.
- **Proposed next step (not yet built, discussed with user)**: the only way to actually capture
  "Start your search" itself is a live, teach-time "ask the user" prompt when a screen change has
  no confident explanation - the "ask the user" step from the original hybrid capture design that
  was explicitly deferred earlier the same day. Given search-bar-expands-to-modal is a common UI
  pattern (not unique to Airbnb), this is likely to recur across future teaching sessions for
  other apps too.
- **Validation**: Kotlin compiles clean. On-device re-test (re-teach Book 5/6 and confirm "Start
  your search" no longer gets misattributed to "Nearby") pending.

---

## 2026-07-30 — Uncaught promise rejection crash overlay during teaching, plus a misleading status color

- **Area**: `LearningModeCard.tsx`, `LearnedProceduresCard.tsx`.
- **Symptom**: user saw a LogBox "Console Error - Uncaught (in promise, id: 1)" overlay during a
  teaching session: `"Error: Learning session is no longer recording."` (found via a screenshot;
  logcat didn't surface it since LogBox is a JS-side overlay, not a native crash).
- **Root cause**: `start()`'s 800ms poll timer passed an `async` arrow function directly to
  `setInterval` with no try/catch: `setInterval(async () => { await saveQueuedActions(...) }, 800)`.
  `setInterval` never awaits or handles a rejection from its callback. If a poll tick is still
  in-flight exactly when `stop()` finishes completing the session (a real race - the backend can
  mark the session `status != 'recording'` while an earlier tick's own upload request is still
  travelling), that tick's `appendLearningActionsBatch` call gets the backend's genuine
  `"Learning session is no longer recording"` 409 and throws with nowhere to catch it.
- **Fix**: wrapped the poll tick's body in try/catch, logging via `console.warn` instead of
  letting it escape - a failed *background* tick should never crash anything, since the next
  tick (or the final drain inside `stop()`) picks up whatever's still pending. Left `stop()`'s own
  direct calls to `saveQueuedActions` unprotected on purpose - a real failure during the final
  drain still needs to reach the user via `stop()`'s existing catch block.
- **Also fixed while investigating (same screenshot)**: `LearnedProceduresCard.tsx`'s
  `"Replay complete: N executed, M skipped"` status message was always rendered in
  `colors.positive` (green), including the `0 executed` case - a total replay failure looked
  identical to a real success at a glance. Added `statusIsWarning` (true when `executed === 0`)
  and a `statusWarning` style override using `colors.danger`.
- **Validation**: `npx tsc --noEmit` clean. On-device re-test pending.

---

## 2026-07-30 — Teaching now force-restarts the target app to a known starting screen

- **Area**: `AppManagerModule.kt` (`openApplication`), `AppManager.ts`, `LearningModeCard.tsx`,
  `registry.ts`.
- **Context**: two separate investigations today (Book 2, and the "Location picker, Step 1 of 3"
  confirm-prompt case) traced back to the same root cause - a taught procedure's first recorded
  step assumed whatever screen the app happened to already be on when teaching started, but
  replay always launches the app fresh, landing on its actual default screen instead. No amount
  of smarter selector matching or recovery can fix a step whose target genuinely isn't on screen
  yet.
- **Fix**: `openApplication` gained an opt-in `forceRestart` parameter. When true, it adds
  `Intent.FLAG_ACTIVITY_CLEAR_TASK` alongside the existing `FLAG_ACTIVITY_NEW_TASK` - the
  permission-free equivalent of force-stopping the target app first (a regular app can't call
  `forceStopPackage`; that needs a system/device-owner permission this project doesn't have, per
  the earlier `GoalGuardCard`/device-owner investigation). This discards the target's existing
  activity back-stack so its launch intent becomes a true fresh root, not just "bring whatever
  screen it was last on to the foreground." `LearningModeCard.tsx`'s `start()` now passes
  `forceRestart: true` so every teaching session begins from a known, reproducible screen that
  will match what replay actually opens to. Left `false` for `registry.ts`'s general-purpose
  `open_application` tool - that should keep the normal, less disruptive bring-to-foreground
  behavior for everyday use, not force-restart every app the planner opens.
- **Note**: since `@ReactMethod` bridge methods require an exact parameter count (no Kotlin-side
  defaults across the JS<->native boundary), every existing JS call site had to be updated to pass
  the new argument explicitly, not just the one that needed the new behavior.
- **Validation**: `npx tsc --noEmit` clean, Kotlin compiles clean. On-device re-test (teach a new
  Airbnb procedure and confirm it starts from Home every time, then replay it end-to-end) pending.

---

## 2026-07-30 — Recovery overlay read the wrong app's UI mid-replay

- **Area**: `LearningWatcherService.kt` (`attemptBoundedRecovery`, `confirmInferredTapBeforeExecuting`,
  `attemptTextInputRecovery`).
- **Symptom**: user reported that during an Airbnb replay they briefly switched to WhatsApp, and
  when they came back the recovery/confirmation overlay was showing candidate data that
  referenced WhatsApp's UI, not Airbnb's.
- **Root cause**: none of the three functions that read `rootInActiveWindow` to build an overlay's
  content (candidate list, or the label shown in a confirm prompt) verified the current root
  actually matched the replay's target app first. `collectRecoveryElements`/`collectEditableFields`
  just read whatever was frontmost at that instant - if the user (or a notification) switched apps
  right as recovery kicked in, the overlay would silently reflect the wrong app's screen instead of
  refusing to proceed.
- **Fix**: new `waitForTargetSurfaceBeforeOverlay(targetSurface)` - reuses the existing
  `isTargetSurfaceActive` (already hardened earlier today to tolerate transient system surfaces
  without tolerating a genuinely different app), waits up to 3s for the target to be frontmost
  again, and returns false if it never resolves. Called at the very start of all three
  overlay-producing functions; on failure they abort the step cleanly
  (`recovery_target_surface_not_frontmost`) instead of ever showing a prompt built from another
  app's data. Required threading `targetSurface` through as a new parameter to all three
  functions and their three call sites in `replay()`'s main loop.
- **Separately investigated, not a new bug**: same session, a *different* symptom - after
  confirming an inferred tap ("Tap 'Location picker, Step 1 of 3'? Yes, tap this"), replay
  immediately fell into a second, different overlay instead of executing the tap. Traced this
  fully before writing any fix: confirmed `readableLabel()` does NOT concatenate multiple
  children's text into a compound string (it returns the first non-blank label found, own or a
  descendant's) - so the label is very likely one node's own literal text, not a
  matching-logic problem to fix. But that label demonstrably belongs to Airbnb's search/filter
  overlay (it appeared alongside "Date Picker, Step 2 of 3", "Guest Picker, Step 3 of 3", "Clear
  all", "Close" in an earlier capture), and replay always launches onto the Home screen fresh -
  same root cause as the "Book 2" procedure investigated earlier today: the taught procedure's
  first step assumes a screen state teaching never actually recorded how to reach. No code fix
  applied for this one; a smarter-matching fix would have targeted the wrong cause.
- **Validation**: Kotlin compiles clean. On-device re-test of both fixes pending.
- Lessons:
  - Don't ship a fix for a plausible-sounding root cause without checking it against the actual
    mechanism first. The initial hypothesis for the "falls into another overlay" symptom (compound
    label text not matching literally) was reasonable but wrong once `readableLabel()`'s real
    behavior was checked - the evidence pointed to a screen-state mismatch instead, which no
    amount of smarter text matching could have fixed.
  - Every place that reads `rootInActiveWindow` to build user-facing content needs the same
    "is this actually the target app" guard - adding it to one recovery path and not the others
    (confirm-gate, text-input recovery) leaves the exact same class of bug half-fixed.

---

## 2026-07-30 — Teaching sessions silently lost taps under concurrent uploads

- **Area**: `backend/app/learning.py` (`append_action`), `mobile/src/components/LearningModeCard.tsx`.
- **Symptom**: user reported replay tapping "Experiences" when they were confident they'd taught
  "Start your Search," insisting the teaching session itself was clear. The saved procedure (8-10
  steps) looked plausible on its own, so this initially looked like a wrong-element capture bug.
- **Investigation**: pulled the *raw* teaching-session debug trace (not just the final saved
  steps) for the session behind procedure 49. It told a completely different story: a 45-second
  session recorded 60+ taps, cycling chaotically through the same ~6 labels
  (`Experiences`/`Services`/`Close`/`Location picker...`/`Date Picker...`/`Guest Picker...`), many
  under 300ms apart - far faster than any real tapping. The reported action count was also stuck
  at `step=11` across ~45 consecutive appends spanning 19 seconds, meaning the stored array length
  wasn't growing to match the append calls actually happening.
- **Root cause**: `LearningModeCard.tsx` polls the native action queue every 800ms and uploads
  whatever's pending, with no in-flight guard. If a network round-trip to the backend outlasts
  800ms (common right after Render's free-tier cold start), the next poll tick fires before the
  previous one finishes - two overlapping uploads for the same session. On the backend,
  `append_action()`'s `SELECT actions_json` -> mutate -> `UPDATE actions_json` was a plain,
  unlocked read-modify-write; FastAPI runs sync endpoint handlers in a thread pool, so two
  concurrent calls could both read the same pre-append state and the later write would silently
  discard the earlier one. Net effect: dozens of real, correctly-captured taps were quietly lost
  in the upload pipeline, and whatever randomly survived the race became "the taught procedure" -
  with no error surfaced anywhere. The final saved steps weren't a wrong capture; they were debris
  from a lost-update race.
- **Fix**: `LearningModeCard.tsx` gained a `saveInFlight` ref guard around `saveQueuedActions`
  (same pattern as the existing `startInFlight`/`stopInFlight`) - an overlapping poll tick now
  skips rather than races, since the next tick 800ms later picks up whatever accumulated.
  `learning.py` gained a module-level `_actions_lock = threading.Lock()` wrapping the entire
  read-modify-write critical section in `append_action`. A single in-process lock is sufficient
  here specifically because Render runs this backend with `WEB_CONCURRENCY=1` (confirmed from
  deploy logs) - only one process ever touches this database, so there's no cross-process race to
  also guard against; a multi-worker deployment would need a DB-level lock instead
  (`SELECT ... FOR UPDATE` on Postgres - SQLite has no per-row equivalent).
- **Validation**: added `test_concurrent_append_action_calls_do_not_lose_writes` - 8 threads x 5
  appends each against the same session, asserting all 40 survive with the exact expected labels
  (not just a count, since a lock in the wrong place could coincidentally produce the right length
  via a different bug). Confirmed the test actually catches the regression: temporarily neutering
  the lock made it fail with only 5/40 appends surviving, matching the real-world severity: then
  restored the fix and reconfirmed the full suite (54/54) passes. `npx tsc --noEmit` clean.
- Lessons:
  - When a "wrong element" complaint comes with "the teaching session was clear," don't trust the
    final saved artifact as ground truth - pull the *raw* upload trace. A corrupted-in-transit
    result can look like a plausible, coherent procedure while being nothing of the sort.
  - A suspiciously *stuck* counter (the same `step=N` reported across dozens of consecutive
    events) is a strong, specific signal of a lost-update race - much more diagnostic than
    "the data looks wrong," and worth searching for specifically once "no error, but data doesn't
    match reality" shows up.
  - Prove a concurrency fix actually closes the gap by breaking it on purpose first (neuter the
    lock, watch the new test fail, restore it) - a test that merely passes with the fix in place
    doesn't rule out testing the wrong thing entirely.

---

## 2026-07-30 — Replay aborted right after a recovery prompt was dismissed

- **Area**: Native replay (`LearningWatcherService.kt`), `RecoveryPromptOverlay.kt`.
- **Symptom**: user reported "replay opened Airbnb but didn't continue." Debug trace for
  procedure 48 showed: step 1's tap went through `attemptBoundedRecovery` -> `ask_user`, resolved
  as `recovery_ask_user_cancelled_or_timed_out`, then the very next step (2) immediately failed
  with `target_surface_lost_abort`, ending the replay.
- **Root cause**: `RecoveryPromptOverlay.dismiss()` removed the overlay window by posting to the
  main thread (`Handler(Looper.getMainLooper()).post { windowManager.removeView(view) }`) and
  returned immediately, without waiting for that post to actually run. The calling
  `askChoiceOrText`/`askConfirm` (running on the background replay thread) returned control to
  `replay()`'s main loop right away, which could then check `isTargetSurfaceActive()` for the
  *next* step before the overlay had actually been removed from the window manager. While our own
  `TYPE_ACCESSIBILITY_OVERLAY` window was still topmost, `rootInActiveWindow` reported
  `com.aioperatingsystem` instead of the target app, and the unconditional
  `currentRootSurface() == surface` check in `isTargetSurfaceActive()` treated that as "target
  lost," aborting every remaining step.
- **Fix**: `dismiss()` now blocks on a `CountDownLatch` until the posted `removeView()` actually
  runs (2s cap), plus a 200ms settle delay - `WindowManagerService`'s own focus recalculation can
  lag slightly behind `removeView()` returning. Also hardened `isTargetSurfaceActive()` itself as
  defense in depth: a transient system surface (launcher/systemui/keyboard, reusing
  `isTransientNavigationSurface` from the recording-side auto-stop fix earlier today) or briefly
  seeing our own package no longer counts as "target lost" - only a real, different app does.
- **Separately confirmed not a bug**: procedure 48 ("Book 2")'s first step (`tap "Clear all"`)
  is a filter chip that only exists on a search-results/filter screen, not Airbnb's default
  Explore/Homes landing screen replay actually opens to. Teaching most likely started after the
  user had already manually navigated into that screen, so the procedure is missing the leading
  steps to get there from a fresh launch - a pre-existing "replay always launches fresh, procedure
  assumes wherever teaching started" limitation, unrelated to today's fixes. Re-teaching this
  procedure starting from Airbnb's actual launch screen should produce a fully replayable one.
- **Validation**: Kotlin compiles clean. On-device re-test of a full replay pending.

---

## 2026-07-30 — Compose-style teaching sessions capture transitions but zero taps

- **Area**: Android Accessibility / Learning capture
- **Symptoms**: Four real Airbnb teaching sessions, including deliberate picker and search
  interactions, produced approximately 395 `screen_transition` events and zero `tap` events.
  Sessions stopped cleanly when the user returned to AI-OS.
- **Current assessment**: The recorder depends on `TYPE_VIEW_CLICKED` for physical taps. Some
  Compose-based or custom-semantic UIs appear to expose the resulting content change without a
  corresponding clicked event. This is not yet proven to be Airbnb-only or Compose-only and must
  be validated against event source nodes, pre/post hierarchy diffs, and Android versions.
- **Safety constraint**: Do not treat every content change as a tap and do not inject raw touch
  interception into teaching; ambiguous inferred taps could corrupt learned procedures.
- **Next investigation**: Add bounded, explicitly `inferred` candidate detection using a recent
  content-change window, source-node semantics/bounds, and before/after hierarchy evidence. Keep
  deterministic events authoritative, require confidence/uniqueness, and reject ambiguous cases.
- **Confirmed root cause (web research)**: Airbnb's own engineering blog confirms their Android
  app is substantially built on Jetpack Compose (their "Trio" screen-architecture framework, in
  production since ~2020-2021). Compose's `clickable` modifier does not reliably synthesize
  `AccessibilityEvent.TYPE_VIEW_CLICKED` for a real physical touch the way a classic `View` does -
  the semantics/click-action integration is built primarily for an accessibility service
  *performing* `ACTION_CLICK`, not for observing one. `AccessibilityService.onMotionEvent()` would
  give raw touch data, but it's Android 14+ only and (per its own docs) *withholds* those motion
  events from the rest of the system - i.e. using it would break the target app's ability to
  receive the user's real touches while teaching. Ruled out; not attempted.
- **Implemented (2026-07-30, same day)**: bounded, typed "inferred tap" pipeline in
  `LearningWatcherService.kt` (`applyInferredTapIfConfident`), reusing per-event capture data that
  was already being collected but not used for this: `clickable`/`enabled` state, resourceId,
  content description, bounds, selector role, and each screen's full `interactiveElements` list.
  Two cases, both reject-on-ambiguity rather than guess:
  - **Same-node state change**: the content-changed event's own source node is itself small
    (<35% of screen area disqualifies outright), clickable, enabled, and has a stable resourceId
    or meaningful label. Base score 0.45, +0.2 resourceId, +0.15 label, +0.15 small/localized
    bounds, +0.05 non-generic selector role; capped at 0.9.
  - **Navigation correlation**: the event's source is the new screen's root (not useful on its
    own), but exactly one clickable candidate from the *previous* screen's captured interactive
    elements has a label that carried over into the new screen's title/visible text. Zero or 2+
    matching candidates = ambiguous = rejected, never guessed. Base score 0.35, capped at 0.75
    (weaker evidence than a same-node match, so it can never claim as much confidence).
  - Threshold to accept either case: confidence >= 0.6. Below that, or disqualified outright,
    the event stays an ordinary `screen_transition` - completely unchanged behavior.
  - Accepted inferred taps are tagged `inferred: true`, `confidence: <score>`,
    `inferenceReason: "<human-readable>"` and otherwise populate the exact same
    resourceId/text/contentDescription fields a real tap would, so replay works identically either
    way - replay only ever reads those matching fields, never the inferred/confidence tags.
  - **Persistence gap caught before it shipped**: `backend/app/learning.py`'s `append_action()`
    used a field allowlist that would have silently dropped `inferred`/`confidence`/
    `inferenceReason` before ever saving them, defeating the "auditable" requirement even though
    capture correctly tagged them. Fixed by adding the three fields to the allowlist.
- **Replay-side gate (added same day, before first test)**: the user pushed back on "will replay
  actually work" - correctly pointing out that structural compatibility isn't the same question
  as *safety*. An inferred tap is a confident guess, not ground truth; replaying one unconditionally
  would let a wrong guess execute as if it were a real captured click, with no error at all (the
  wrong-but-real element would still be found and tapped "successfully"). Added
  `confirmInferredTapBeforeExecuting` in `LearningWatcherService.kt`: before executing any tap step
  where `inferred == true` and `inferenceConfirmed != true`, blocks on a new
  `RecoveryPromptOverlay.askConfirm` (pure yes/no, no candidate list/text field) showing the
  target label, confidence %, and inference reason. Confirming persists `inferenceConfirmed: true`
  via the existing `correct-step` endpoint (learn-forward - future replays of that step skip the
  prompt); declining skips the step entirely rather than tapping anything. This closes the loop the
  user's original spec called a hard requirement ("replay should apply stricter matching or
  confirmation... never silently treated as equivalent to real click events"), not an optional
  deferred item. Required also adding `inferred`/`confidence`/`inferenceReason`/`inferenceConfirmed`
  to `LearningWatcherModule.kt`'s JS->native replay bridge allowlist - a *third* allowlist (capture
  screen_transition -> action fields; backend `append_action`; now the replay bridge) that would
  otherwise have silently dropped these fields exactly like the persistence-layer gap below.
- **Explicitly deferred** (per the agreed phased plan, not forgotten): a live "ask the user"
  confirmation UI during *teaching* for ambiguous inferred candidates (distinct from the
  replay-time confirm gate above), and a "visible inferred step" indicator in
  `LearningModeCard.tsx`'s live recording counter. Both are natural follow-ups once real-world
  Airbnb re-tests show whether the same-node/navigation cases actually fire in practice.
- **Validation**: `backend/tests/test_procedural_memory_and_learning.py` gained
  `test_learning_session_preserves_inferred_tap_fields`, confirming inferred/confidence/
  inferenceReason survive `append_action` -> `complete_session` -> saved procedure steps. Full
  backend suite 53/53 passing. Native side compiles clean. On-device re-test against Airbnb still
  pending as of this entry.
- Lessons:
  - Effectiveness claims need real math, not a plausible-sounding idea. Before proposing the
    "infer a tap when the changed node is itself clickable" heuristic, actually counting how often
    that pattern occurred in the real captured data (2 times out of 400+ events) would have caught
    that it was too weak to be useful on its own - the fuller pipeline (confidence scoring,
    uniqueness requirement, navigation-case correlation, explicit rejection) is what the user's
    counter-proposal correctly demanded instead of a single boolean heuristic.
  - A new persisted field is only as safe as every allowlist it has to pass through. Adding
    `inferred`/`confidence`/`inferenceReason` at the capture site was necessary but not
    sufficient - the backend's own field allowlist (a separate, easy-to-forget checkpoint) needed
    the same update, or the data would have silently vanished by the time it reached storage.

---

## 2026-07-19 — Android Gradle build fails: "Unable to establish loopback connection"

- **Area**: Build / Tooling
- **Symptoms**: `npm run android` (and any `gradlew` invocation) failed immediately with
  `java.io.IOException: Unable to establish loopback connection`, caused by
  `java.net.SocketException: Invalid argument: connect` inside
  `sun.nio.ch.UnixDomainSockets.connect0`. Failed identically across Temurin JDK 17 and
  Android Studio's JBR 21, from both Git Bash and PowerShell, with and without `--no-daemon`.
- **Root cause**: AF_UNIX (Unix domain socket) `connect()` calls fail with `WSAEINVAL` when the
  socket file lives under this machine's user temp folder `C:\Users\<user>\AppData\Local\Temp`,
  but succeed under `C:\Windows\Temp`. Modern JVMs implement `java.nio.channels.Selector.open()`
  on Windows using an internal AF_UNIX loopback pipe created in `java.io.tmpdir`, so every
  Selector-dependent operation (Gradle's daemon handshake, Metro, etc.) broke. Reproduced with a
  bare 5-line Java program calling `Selector.open()` and independently with a .NET
  `UnixDomainSocketEndPoint` test — confirming it is an OS/environment issue in that specific temp
  directory, not JDK- or Gradle-specific. Likely an endpoint-security / file-system filter driver
  scoped to the user temp path. `-Djava.io.tmpdir=...` did NOT fix it (native pipe code reads the
  `TEMP`/`TMP` environment variables, not the JVM property).
- **Solution**: Point the build's temp env vars at the working directory. `mobile/package.json`
  `android` script now runs through `cross-env`:
  `cross-env TMP=C:\\Windows\\Temp TEMP=C:\\Windows\\Temp expo run:android`.
- **Validation**: `npm run android` builds `app-debug.apk`, installs `com.ntsinga.mobile`, and
  launches on the Pixel_6a emulator. Verified the fix works even when the parent shell exports the
  broken `AppData\Local\Temp` path, proving the script is self-contained.
- **Lessons**:
  - `Unable to establish loopback connection` on Windows Gradle is usually an AF_UNIX/temp-dir
    problem, not a network/VPN/firewall problem. Isolate it with a bare `Selector.open()` Java
    program before touching Winsock, VPN, or system settings.
  - It is NOT fixed by `-Djava.io.tmpdir`; override the `TEMP`/`TMP` environment variables.
  - Do not chase red herrings (duplicate Winsock AF_UNIX catalog entries, ProtonVPN, reboots) —
    none of those changed the result here. The deterministic signal was the per-directory
    AF_UNIX socket test (`C:\Windows\Temp` works, user temp fails).

---

## 2026-07-19 — get_installed_apps returns only a partial app list (Android 11+ package visibility)

- **Area**: Native Bridge / Android
- **Symptoms**: The `get_installed_apps` tool returned only 8 apps and was missing obviously-present
  launcher apps (Chrome, Gmail, YouTube, Maps, Messages, Contacts, Calendar, etc.) that were
  clearly visible in the emulator's app drawer.
- **Root cause**: Android 11 (API 30)+ enforces package visibility filtering. An app's
  `PackageManager.queryIntentActivities(ACTION_MAIN/CATEGORY_LAUNCHER)` only returns packages the
  app can "see", and by default it cannot see most other installed apps unless it declares them in
  a `<queries>` element in `AndroidManifest.xml`. The manifest only declared a `<queries>` intent
  for browsable HTTPS links, so the launcher query was silently filtered down to a small subset.
- **Solution**: Added a `<queries>` intent for `ACTION_MAIN` + `CATEGORY_LAUNCHER` in
  `mobile/android/app/src/main/AndroidManifest.xml`. App count went from 8 to 21 and matches the
  real app drawer.
- **Validation**: Rebuilt, relaunched, tapped "Run tool" — list now shows Calendar, Camera, Chrome,
  Clock, Contacts, Drive, and the rest, matching the emulator drawer.
- **Lessons**:
  - Any Android capability tool that enumerates OTHER apps/components (installed apps, share
    targets, resolvable intents) on API 30+ needs matching `<queries>` declarations, or it will
    silently return an incomplete result with no error. Future tools like `open_application`,
    `search_installed_apps`, and share/intent tools must declare the intents they query.
  - The Android native project under `mobile/android/` is hand-authored (Kotlin modules committed
    directly), not regenerated on every build, and `app.json` does not manage this `<queries>`
    block — so edit `AndroidManifest.xml` directly. If `expo prebuild` is ever re-run it may
    overwrite this; re-apply the launcher `<queries>` intent afterward (or move it into an Expo
    config plugin).

---

## 2026-07-19 — open_application "fails" on Calendar (launched app's own onboarding blocks)

- **Area**: Native Bridge / Android (NOT a bug — expected behavior, logged to avoid re-diagnosis)
- **Symptoms**: Tapping an app in the tool bench to launch it via `open_application` worked for
  Chrome but appeared to "fail" for Google Calendar — Calendar got stuck on a "Checking info…"
  screen and never reached its main UI.
- **Root cause**: `open_application` fires the target app's launcher intent
  (`getLaunchIntentForPackage` + `startActivity`) — the same thing tapping the app's home-screen
  icon does. Logcat confirmed the launch succeeded: `START ... pkg=com.google.android.calendar ...
  from uid ... (com.ntsinga.mobile) ... result code=0`, with no exception and no promise
  rejection from `AppManagerModule`. Calendar then redirected itself into Google Play Services'
  add-account flow (`gms.auth.uiflows.minutemaid.MinuteMaidActivity` → `ErrorActivity` →
  `PreAddAccountActivity`) because Google Calendar requires a signed-in Google account, and this
  emulator has none. That account-setup screen ("Checking info…") hangs on a bare emulator.
- **Resolution**: None needed in our code. The tool did exactly its job. Chrome works because it
  does not force account setup; account-gated Google apps (Calendar, Gmail) hang until a Google
  account is signed into the emulator (Settings → Accounts).
- **Lessons**:
  - `open_application`'s success contract is "launcher intent delivered", NOT "app reached its
    main screen" — the same guarantee the Android home screen makes. What the launched app does
    next (onboarding, permission gates, account setup, splash hangs) is outside our control and
    must not be treated as a tool failure.
  - When a launched app appears stuck, check `adb logcat | grep "ActivityTaskManager: START"` for
    `result code=0` (our launch succeeded) and look for a follow-on redirect into `gms.auth` /
    setup activities before assuming the tool is broken.
  - For testing account-gated apps on an emulator, sign into a Google account first.

---

## 2026-07-19 — get_device_info: "undefined is not a function" from a native module name collision

- **Area**: Native Bridge / Android
- **Symptoms**: New `DeviceInfoModule.kt` (registered as `AppToolsPackage`'s `getName() = "DeviceInfo"`)
  built and installed with no errors, but calling it from JS threw `undefined is not a function`
  — not a promise rejection, not an `APP_MANAGER_*`/`DEVICE_INFO_*` error code, just a plain JS
  TypeError with no native-side log line at all.
- **Root cause**: React Native core already registers a built-in native module bridge-named
  `"DeviceInfo"` (used internally by the `Dimensions` API). Our custom module used the exact same
  `getName()` string. `NativeModules.DeviceInfo` in JS silently resolved to RN's built-in module
  instead of ours — it exists and is truthy (so our "module unavailable" guard never fired), but it
  has no `getDeviceInfo()` method, so calling it threw `undefined is not a function`. No exception,
  no logcat error, and no rejection anywhere in our Kotlin code, because our code never ran.
- **Solution**: Renamed the bridge name to `"AiosDeviceInfo"` (`DeviceInfoModule.kt`'s `getName()`)
  and updated `mobile/src/native/DeviceInfo.ts` to destructure `NativeModules.AiosDeviceInfo`.
- **Validation**: Rebuilt, ran `get_device_info` from the tool bench — returns real battery
  percent, charging state, model, manufacturer, Android version, and current time.
- **Lessons**:
  - Never name a custom RN native module `getName()` after a well-known RN/Expo built-in
    (`DeviceInfo`, `Dimensions`, `Clipboard`, `NetInfo`, etc.) — the collision is silent. JS sees a
    real module object (so `if (!Module)` guards don't catch it) with different methods than
    expected, and the failure looks like a generic JS bug, not a bridge problem.
  - When a native-module call throws a bare JS error (`undefined is not a function`, no error code,
    no logcat trace from our own `promise.reject` or exceptions) — suspect a name collision before
    debugging the Kotlin/Java side. Check `NativeModules` in a debugger/log for what the resolved
    module's actual keys are.
  - Prefix custom native module bridge names with something project-specific (e.g. `Aios*`) to
    avoid this class of collision going forward for future modules.

---

## 2026-07-19 — Phase 2 planner: open_application hallucinates package names without grounding

- **Area**: State / Tooling (LLM planner, `src/planner/openaiPlanner.ts`)
- **Symptoms**: First manual test of the new AI planner: command "Oppen photos" (typo for "Open
  photos") produced a plausible-looking, correctly-shaped tool call —
  `open_application({ packageName: "com.android.gallery" })` — that the app confirmed and ran, and
  which then correctly failed with `No launchable activity found for package: com.android.gallery`
  (from `AppManagerModule.kt`'s own guard, per the 2026-07-19 open_application entry above; that
  guard did its job here). On this device, Google Photos is actually
  `com.google.android.apps.photos`.
- **Root cause**: `planToolCall()` only sent the tool list (name/description/JSON-schema
  parameters) to the model with no information about what apps are actually installed. GPT-4o-mini
  filled in `packageName` from training-data knowledge of common Android package names, which is
  frequently wrong for apps that were renamed/rebranded (Google Photos was `com.android.gallery`
  years ago) or that don't have a single canonical package name across OEMs/regions.
- **Solution**: `planToolCall(command, installedApps?)` now accepts the result of
  `get_installed_apps` and lists every `name -> packageName` pair in the system prompt, instructing
  the model to use those exact values instead of guessing. `PlannerCard.tsx` calls
  `getInstalledAppsTool.execute()` before every `planToolCall()` (best-effort — falls back to
  ungrounded planning if that fetch fails) so `open_application` proposals are grounded in the real
  device state.
- **Validation**: Re-ran "open photos" — proposed call is now
  `open_application({ packageName: "com.google.android.apps.photos" })`, confirmed, and Google
  Photos actually opened (into its own first-run backup prompt, which is that app's own onboarding,
  not a failure — see the Calendar entry above for the same class of non-issue).
- **Lessons**:
  - A single-shot "pick one tool + arguments" planner (Phase 2 in the plan, no multi-step
    orchestration yet) cannot self-correct a wrong argument by calling `get_installed_apps` first —
    it only gets one shot. Any tool argument that depends on real device/account state (package
    names, contact IDs, file paths, etc.) needs that state fed into the prompt up front, or the
    model will confidently hallucinate a plausible-looking value from training data.
  - "The tool call looks well-formed and confirms cleanly" is not the same as "the tool call is
    correct" — always test the planner against apps/data that have non-obvious real identifiers
    (renamed/rebranded apps are a good adversarial case), not just the first/easiest example.
  - This is a good candidate to revisit once Phase 3 (multi-step orchestration, per the plan) adds a
    tool-calling loop — at that point the model could call `get_installed_apps` itself as a step
    instead of us having to pre-fetch and inject it for every command.

---

## 2026-07-19 — Phase 3 workflow stuck repeating the same tool call in a loop

- **Area**: Backend / Tooling (`backend/app/graph.py`)
- **Symptoms**: First real multi-step workflow test — "check battery and then open chrome" —
  called `get_device_info` successfully, then called `get_device_info` again with identical
  arguments instead of moving on to `open_application`. Kept proposing the same step repeatedly
  until it hit `MAX_STEPS` and stopped without ever opening Chrome.
- **Root cause**: `planner_node` fed prior tool calls to the model as **prose text** inside the
  system prompt (`"Tool calls made so far this workflow:\n- Called get_device_info({}) -> {...}"`),
  not as real OpenAI conversation turns. `gpt-4o-mini` does not reliably use a text summary buried
  in the system prompt to track "I already did this" — it needs the actual multi-turn
  function-calling protocol (`assistant` messages with `tool_calls` + matching `tool` role
  messages with results) to recognize a tool call has already happened and its result is already
  known.
- **Solution**: Replaced the prose-history system-prompt section with `_build_messages()`, which
  reconstructs real `assistant`/`tool_calls` + `tool` message pairs for every step in
  `state["history"]` before the current planning call. The system prompt now only carries static
  instructions + the installed-apps grounding list, no history text.
- **Validation**: Re-ran "check battery and then open chrome" via curl against `/workflow/start`
  and `/workflow/{id}/resume` — model now calls `get_device_info` once, then `open_application`
  with `com.android.chrome`, then returns a final summary. No repeats.
- **Lessons**:
  - When building a multi-step tool-calling loop with any OpenAI-style API, always replay prior
    steps as real `assistant tool_calls` + `tool` result messages, never as a text description in
    the system/user prompt. This applies even (especially) with cheaper models — a prose summary
    is exactly the kind of instruction weaker models are least reliable at actually using.
  - Restarting `uvicorn` after editing `backend/app/graph.py` is required — Python does not
    hot-reload without `--reload`, and the compiled LangGraph object is built once at import time
    (`compiled_graph` module-level singleton in `graph.py`). A code fix silently does nothing until
    the server process is restarted; check `Get-CimInstance Win32_Process` for stray old `uvicorn`
    processes before concluding a fix "didn't work".
  - When investigating an app issue, prefer reproducing directly against the backend via `curl`
    over debugging through the emulator UI — it isolates whether the bug is in the graph/prompt
    logic or in the mobile client, and iterates far faster than a full Android rebuild each time.

---

## 2026-07-20 — search_web backend: Google Custom Search "search the entire web" is gone for new engines

- **Area**: Task Execution / External API
- **Symptoms**: Set up a new Google Programmable Search Engine to switch `search_web` from Brave
  to Google (per user request for better result quality). The "Search the entire web" toggle
  documented in Google's own older help pages was not present anywhere in the control panel for
  the newly-created engine.
- **Root cause**: Google discontinued "Search the entire web" for **newly-created** Programmable
  Search Engines effective 2026-01-20. New engines are now capped at a "Sites to search" allowlist
  of up to 50 domains, which cannot do general web search at all. Existing engines that already
  had "Search the entire web" enabled before that date keep it until 2027-01-01, which is why
  older guidance/tutorials (and this assistant's own training knowledge, cutoff January 2026)
  still describe a toggle that most readers creating a *new* engine will never see. Google's
  suggested replacement is Vertex AI Search, an enterprise product requiring a custom quote.
- **Resolution**: Reverted `backend/app/search.py` to the Brave Search API (the original choice
  before this detour) — no such gating, real general web search, working free tier. Backend env
  vars: `BRAVE_SEARCH_API_KEY` (removed `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID`).
- **Lessons**:
  - Don't trust this assistant's built-in knowledge of a fast-moving external API/product's
    current UI or feature availability, especially for anything Google has a habit of
    deprecating — verify against a live web search before committing setup steps to the user.
  - When a user reports "the option isn't there" for a documented setting, take that as a signal
    to look for a *recent* deprecation before assuming user error or a UI navigation mistake.
  - `search.py` is intentionally an isolated, single-file provider boundary specifically so a
    provider swap (Brave <-> Google <-> whatever comes next) is a contained change — this paid
    off directly here.

---

## 2026-07-20 — record_video: CameraX "Unable to find supported quality by QualitySelector"

- **Area**: Native Bridge / Android
- **Symptoms**: New `record_video` (in-app CameraX recording, `InAppCaptureActivity.kt`) failed
  immediately on start with `androidx.camera.core.internal.CameraUseCaseAdapter$CameraException:
  java.lang.IllegalArgumentException: Unable to find supported quality by QualitySelector`.
- **Root cause**: `Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.SD))` used a
  fixed, concrete quality value. `Quality.SD` (and other concrete values like HD/FHD/UHD) are not
  guaranteed to be supported by every camera - the Pixel_6a emulator's virtual/software camera
  backend does not support it, so resolution failed outright with no fallback.
- **Resolution**: Changed to `QualitySelector.from(Quality.HIGHEST)`. `HIGHEST`/`LOWEST` are
  special CameraX values (not concrete resolutions) that resolve to whatever the actual camera
  supports, instead of asserting a specific quality exists.
- **Lessons**:
  - Never hardcode a concrete CameraX `Quality` value (`SD`/`HD`/`FHD`/`UHD`) for a capability
    meant to run on arbitrary devices/emulators - always use `Quality.HIGHEST`/`Quality.LOWEST`,
    or a `QualitySelector.fromOrderedList(...)` with an explicit `FallbackStrategy`, so resolution
    can never fail outright just because one specific quality isn't in the device's supported set.
  - Emulator virtual camera backends are a real, distinct compatibility surface from physical
    camera hardware - CameraX code that only gets tested against a real device's camera can still
    ship a bug that fails 100% of the time on every emulator.

---

## 2026-07-20 — Multi-step workflow silently ended after presenting text options

- **Area**: Product / Phase 3 workflow design
- **Symptoms**: User asked the workflow to "search for the 5 best fitness apps and let me pick
  one" (a "search → present options → user picks → act on it" flow, the plan's original Ronaldo
  example). The model correctly called `search_web`, then presented the results as a plain-text
  numbered list asking the user to pick one - and the workflow just stopped there. Replying with a
  pick did nothing; there was no way to continue.
- **Root cause**: The graph's `_should_continue` treated ANY model response with no tool call as
  terminal (`finalMessage` set, routes to `END`). It could not distinguish "I am done" from "I am
  asking a question / presenting options and expect a reply" - both look identical to the OpenAI
  API (plain assistant text, no tool_calls). Once `END` was reached, `/workflow/{id}/resume`
  404'd - the thread was unrecoverable, so a reply had nowhere to go.
- **Resolution**: Reworked `graph.py`/`main.py` so the graph has no "done" terminal state distinct
  from "awaiting reply" - every plain-text response pauses via `interrupt({"kind":
  "awaiting_reply", "message": text})` and waits for either a tool result (if the model had called
  a tool) or the user's next free-text turn, which gets appended to the conversation as a real new
  `user` message (not folded into the original command) and the graph continues. The graph only
  truly ends at `MAX_STEPS` (raised 6 -> 12 to give a search→pick→act chain more room) or when the
  client stops calling resume (same abandon-the-thread pattern the "Stop" button already used).
  Replaced the fixed `state["command"]` field with a growing `state["messages"]` list built fresh
  each turn. Added a new `awaiting_reply` status to the `/workflow/*` response contract and a
  reply text box + "Send"/"Done" UI in `WorkflowCard.tsx`.
- **Validation**: Verified via curl end-to-end: start -> `search_web` proposed -> resume with
  fake results -> now returns `status: "awaiting_reply"` with the option list (previously
  `"done"`) -> resume with `"the second one"` -> correctly proposes `open_play_store_listing` with
  the package name matching option 2, not a guess.
- **Lessons**:
  - For any agent design where the model can legitimately respond with plain text mid-task
    (asking a question, presenting choices) as well as at true completion, do not conflate "no
    tool call" with "done." They need distinct pause states, or every options-list becomes a dead
    end exactly like this.
  - A multi-step/multi-turn workflow's state should carry the full growing conversation
    (`messages: list`), not a single fixed original command - user input doesn't end at turn one
    the moment the flow needs a follow-up reply, not just a follow-up tool result.
## 2026-07-21 — Phase 3.5 Quick Settings tile validation

- **Area**: Android overlay / Phase 3.5
- **Change**: Added `OverlayTileService`, registered as a Quick Settings tile, and centralized
  overlay start/stop calls in `OverlayService` so the app and tile use the same foreground service.
- **Validation**: The configured JDK was present, but Gradle's wrapper distribution was not cached.
  The sandbox blocked the download, and the approved retry timed out before compilation completed.
- **Lesson**: Native validation still requires a cached Gradle distribution or a network-enabled build
  environment; source review alone is not a substitute for an Android install test.
## 2026-07-21 — Hey Casper voice activation

- **Area**: Android overlay / Phase 3.5
- **Change**: Added an opt-in microphone foreground service with a persistent notification. It
  recognizes “Hey Casper”, accepts the command in the same utterance or arms the next utterance,
  and opens the existing workflow through an `aios://voice` deep link.
- **Safety**: Voice activation is disabled by default and can be stopped from the app or its
  notification. Tool execution still requires the existing confirmation step.
- **Validation**: TypeScript validation passed. Android compilation could not complete because the
  Gradle distribution was not cached and the network-enabled retry timed out; device validation remains required.
## 2026-07-21 — Android wallpaper capability

- **Area**: Phone capability layer
- **Change**: Added `AiosWallpaper`, a native `WallpaperManager` bridge exposed as the
  `set_wallpaper` tool. It accepts HTTPS/content/file URIs, validates image bytes and dimensions,
  enforces a 25 MB limit, and supports home, lock, or both targets.
- **Safety**: The AI workflow still pauses for confirmation before execution. The Tools tab is a
  direct internal test surface and should only be used with an intentional image and target.
- **Validation**: TypeScript validation is being run; Android device/build validation remains
  dependent on the Gradle distribution and an emulator/device.
## 2026-07-21 — Structured image search and owned image browser

- **Area**: Phase 3.5 / image-to-wallpaper workflow
- **Change**: Added Brave Image Search-backed `/search/images` and `search_images`, an in-app
  thumbnail grid, and `browse_for_image` backed by an AI-OS-owned Android WebView. The browser
  injects a small image-selection bridge and returns the tapped image URL to the workflow.
- **Validation**: TypeScript and backend Python compilation passed. Android install/build validation
  remains outstanding because Gradle compilation timed out in this environment.
- **Boundary**: This WebView is an owned browsing surface; it does not intercept or observe arbitrary
  Chrome sessions. Accessibility/screenshot phone-use remains a separate, permission-gated phase.
## 2026-07-21 — Explicit browser routing tools

- **Area**: Phase 3.5 browser activation
- **Change**: Added `open_url_external` for Chrome/default-browser launches,
  `open_url_in_aios_browser` for the AI-OS-owned WebView, and retained `browse_for_image` for
  WebView image selection. All three are registered in the planner and exposed in the Tools tab.
- **Validation**: TypeScript validation passed. Android install validation remains pending.
## 2026-07-21 — Planner OS harness and app fallback policy

- **Area**: LangGraph planning context
- **Change**: Added versioned `backend/app/context/os_harness.md` and `web_aliases.json`. The
  planner now loads these on startup and uses installed-app state plus explicit routing rules to
  choose the native app, external browser, AI-OS browser, or image-selection browser.
- **Boundary**: The harness cannot make Chrome observable; it explicitly prevents the model from
  claiming it saw external-app state. It also keeps confirmation requirements for side effects.
- **Validation**: Backend Python compilation and TypeScript validation are being run separately.
## 2026-07-21 — Outcome portfolio and storage-health slice

- **Area**: Roadmap / AI Phone Doctor
- **Change**: Added the normalized 10 core outcomes plus 5 hackathon/demo slices to the plan.
  Started the easiest new diagnostic slice with read-only `get_storage_info`, exposing total,
  used, free, and percentage storage to the planner and Tools tab.
- **Safety**: This first storage step is read-only; deletion and archive actions remain a separate
  confirmed workflow.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Network diagnostics slice

- **Area**: AI Phone Doctor / network outcome track
- **Change**: Added read-only `diagnose_network`, exposing active transports, validated internet
  state, metering, signal strength where supported, DNS servers, and a short connectivity latency
  probe. It is available to the planner and Tools tab.
- **Safety**: This tool changes no network settings. Remediation actions will be separate tools with
  confirmation and verification.
- **Validation**: TypeScript validation passed; Android device/build validation remains pending.

## 2026-07-21 â€” Device Owner / DPC policy scaffold

- **Area**: Android managed-device policy layer
- **Change**: Added `AiosDeviceAdminReceiver`, `device_admin.xml`, and the `AiosDevicePolicy`
  bridge. The bridge reports normal-app vs managed-device status and exposes owner-only app
  suspension/restore. Added planner tools `get_device_policy_status` and
  `set_application_suspended`.
- **Safety**: Device Owner is not root. Provisioning is intentionally not automated; Android
  requires administrator provisioning on a clean device. Normal installs fail closed with a
  `DEVICE_OWNER_REQUIRED` error.
- **Validation**: `npx tsc --noEmit` passed; Android Gradle/device validation remains pending
  because the local Gradle toolchain is unavailable.

## 2026-07-21 â€” Goal Guard vertical slice

- **Area**: Policy / focus enforcement
- **Change**: Added `GoalGuardCard`. Users define a goal and comma-separated package list,
  start owner-enforced app suspension, inspect policy status, and explicitly unlock apps after
  completion. Partial suspension failures trigger best-effort rollback.
- **Boundary**: Normal-app installs fail closed with a clear Device Owner requirement; this slice
  does not claim that a timer or self-report proves the goal was completed.
- **Validation**: `npx tsc --noEmit` passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” Goal Guard app selection UX

- **Area**: Policy / focus enforcement UX
- **Change**: Replaced the package-name text field with a native installed-app picker. Users
  load launchable apps, tap rows to select/deselect them, and AI-OS keeps package identifiers
  internal for the Device Owner policy call.
- **Validation**: `npx tsc --noEmit` passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” Goal Guard orchestration controls

- **Area**: Policy orchestration
- **Change**: Added grouped `set_applications_suspended` and explicit `set_kiosk_mode` tools.
  The planner harness now instructs the model to inspect installed apps, classify social-media
  requests, present the proposed group, avoid suspending AI-OS, distinguish app blocking from
  whole-device kiosk mode, and verify the result.
- **Safety**: Kiosk mode is never an implicit side effect of “lock my phone”; it requires an
  explicit request and Device Owner. Normal-app installs cannot claim enforcement.
- **Validation**: `npx tsc --noEmit` and `git diff --check` passed; Android Gradle/device
  validation remains pending.

## 2026-07-21 â€” Timed Goal Guard policies

- **Area**: Policy scheduling
- **Change**: Added persistent `AiosFocusPolicy` storage, grouped timed suspension, automatic
  unlock via `AlarmManager`/`FocusPolicyReceiver`, status inspection, and explicit early stop.
  Added planner tools `start_focus_policy`, `get_focus_policy_status`, and `stop_focus_policy`.
- **Boundary**: Timed policies require Device Owner. The alarm receiver restores apps after the
  deadline but the next foreground status check remains the verification path if Android delays
  delivery under power restrictions.
- **Validation**: `npx tsc --noEmit` and `git diff --check` passed; Android Gradle/device
  validation remains pending.

## 2026-07-21 â€” Android alarm tool

- **Area**: Device scheduling
- **Change**: Added `AiosAlarm` and the `set_alarm` planner/tool-registry entry. It validates
  24-hour hour/minute values and delegates creation to Android's system alarm app, preserving
  system ownership and user-visible confirmation.
- **Validation**: TypeScript validation passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” Exact date-specific alarm scheduler

- **Area**: Device scheduling
- **Change**: Added `AiosScheduledAlarm`, an exact one-time `AlarmManager` schedule, persisted
  receiver delivery, notification channel, and planner tool `schedule_date_alarm`. This is used
  for “tomorrow at 7:00” instead of the ordinary system alarm next-occurrence intent.
- **Boundary**: Android may require the user to allow exact alarms; notification permission is
  also user-controlled. The tool fails clearly if either system capability is unavailable.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Network outcome workflow

- **Area**: AI Phone Doctor / connectivity
- **Change**: Added `run_network_test`, which performs repeated connectivity probes and reports
  latency samples, average/min/max latency, successful probes, and packet loss. Added planner
  harness guidance to diagnose, open user-approved settings, then retest and compare measurements.
- **Boundary**: Android does not permit ordinary apps to silently toggle Wi-Fi or mobile radios;
  remediation still delegates to the system settings panels.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Battery optimization workflow

- **Area**: AI Phone Doctor / battery policy
- **Change**: Added read-only per-app battery-optimization status and a system optimization-list
  launcher. The planner now combines battery diagnostics, Usage Access foreground activity, and
  per-app battery settings into an evidence-based before/after workflow.
- **Boundary**: Foreground usage is only an activity proxy; Android does not expose privileged
  per-app drain to ordinary apps. AI-OS does not request optimization exemptions as a “fix.”
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” App Repair Assistant

- **Area**: App health / repair
- **Change**: Added `AiosAppHealth` inspection for installed state, version, enabled/system
  status, UID, and launchability, plus `open_app_settings` for user-controlled force-stop,
  cache/data, permissions, update, and uninstall actions. Added planner guidance to diagnose
  before and verify after the user changes settings.
- **Boundary**: Normal apps cannot read another app's private crash logs or silently clear its
  data. The workflow reports those limits rather than claiming an invisible repair.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Meeting Brief calendar foundation

- **Area**: Meeting Brief
- **Change**: Added permission-aware `AiosCalendar` event lookup for the next 1-168 hours,
  planner tool `get_upcoming_events`, Tools-tab access, and planner guidance for combining
  calendar facts with contacts and public research.
- **Boundary**: Email, private message history, and meeting transcripts are not yet connected;
  the planner must not imply access to those sources.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Google OAuth connection scaffold

- **Area**: Meeting Brief external sources
- **Change**: Added a server-side Google OAuth redirect/callback/status flow requesting Gmail
  read-only, Calendar read-only, and Drive read-only scopes, plus the mobile
  `connect_google_account` tool and setup environment variables.
- **Safety**: Client secrets remain server-side. The current token store is development-only
  in-memory storage and must be replaced with encrypted per-user persistence before production.
  Gmail/Drive scopes may require Google OAuth verification.
- **Boundary**: WhatsApp is not a generic personal-message OAuth connector. Production access
  requires a Meta WhatsApp Business Cloud API app, business phone number, and approved scopes;
  no WhatsApp credentials are present yet.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Google retrieval handlers

- **Area**: Meeting Brief private context
- **Change**: Added read-only backend handlers and planner tools for Gmail search, Google Drive
  file-name search, and Google Calendar upcoming events. They use the server-side OAuth token
  obtained by the consent flow; the mobile app never receives Google client secrets.
- **Boundary**: Development token storage is still in-memory and must be replaced with encrypted
  per-user persistence. No WhatsApp handler was added because WhatsApp requires a Meta Business
  Cloud API integration rather than generic personal OAuth.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Full Google retrieval and follow-up actions

- **Area**: Meeting Brief completion
- **Change**: Added full Gmail message-body reads, Drive file-content reads, Gmail draft creation,
  and Google Calendar follow-up event creation. Draft/event tools remain confirmation-gated by the
  workflow UI.
- **Security**: Latest briefs are encrypted locally with an Android Keystore AES-GCM key and can
  be surfaced through the overlay notification. Google OAuth tokens are now encrypted at rest in
  a server-side Fernet vault; the key is supplied by `GOOGLE_TOKEN_ENCRYPTION_KEY` and must remain
  outside source control. The vault is still single-user development storage until account/user
  isolation is added.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Expense and receipt workflow

- **Area**: Expense outcome track
- **Change**: Added `get_monthly_finances` to search connected Gmail for likely expense/revenue
  evidence and reconcile currency-specific candidate totals, plus `extract_receipt` using a
  vision OCR pass for merchant/date/total/currency/tax/category/confidence.
- **Safety**: Financial results are explicitly candidates requiring review. OCR never submits a
  claim or moves money; provider-specific expense submission and approval monitoring remain
  future write integrations.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Expense dashboard and receipt UI

- **Area**: Expense UX / visualization
- **Change**: Added an in-app Finance Overview with month selection, category bars, candidate
  counts, and AI-generated analysis. Added a Receipt Scanner card that captures a receipt and
  displays OCR fields for review.
- **Safety**: Charts reflect extracted candidates and do not imply accounting accuracy. Receipt
  data is not submitted automatically.
- **Validation**: TypeScript validation passed; Android Gradle/device validation remains pending.

## 2026-07-21 â€” SMS finance route

- **Area**: Expense evidence sources
- **Change**: Added explicit READ_SMS permission flow, recent SMS retrieval, and
  `analyze_sms_finances` for bank/mobile-money alert classification and currency-specific totals.
- **Privacy**: SMS access is user-granted and capped to a bounded lookback/row count. The planner
  is instructed not to expose unrelated message content; parsed items remain review candidates.
- **Validation**: Backend compilation, TypeScript validation, and `git diff --check` passed;
  Android Gradle/device validation remains pending.

## 2026-07-21 â€” Conversational expenditure analysis

- **Area**: Expense analysis / planner
- **Change**: Exposed the AI analysis endpoint as `analyze_finances`, allowing Chat workflows to
  gather Gmail or SMS finance candidates and then explain category concentration, revenue versus
  expenditure, anomalies, and practical next steps conversationally.
- **Boundary**: Analysis is informational and not regulated financial advice; no payments or
  financial changes are performed.
- **Validation**: TypeScript validation and backend compilation passed; Android Gradle/device
  validation remains pending.
## 2026-07-21 — Network remediation panels

- **Area**: AI Phone Doctor / network outcome track
- **Change**: Added `open_wifi_settings` and `open_network_settings` native tools. They open
  Android's own settings panels and return control to the workflow; the planner can rerun
  `diagnose_network` afterward to verify the change.
- **Platform boundary**: Ordinary apps cannot silently toggle Wi-Fi/mobile data on modern Android,
  so these actions intentionally require the user to make the setting change.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Battery diagnostics slice

- **Area**: AI Phone Doctor / battery outcome track
- **Change**: Added read-only `diagnose_battery`, exposing charge state, temperature, voltage,
  current draw, energy counter, health, plug type, and power-saver status to the planner and Tools tab.
- **Boundary**: Battery usage by individual apps and automatic background-policy changes require
  additional UsageStats/OS-specific work; this slice establishes the measurable baseline first.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Usage Access and battery policy layer

- **Area**: AI Phone Doctor / battery policy
- **Change**: Added `get_app_usage`, backed by Android Usage Access, to report foreground time by
  app for a 1–168 hour window. Added `open_app_battery_settings` so the workflow can guide the
  user to an app's battery/background controls and then verify usage again.
- **Boundary**: Usage Access is a special user-granted setting. Ordinary apps cannot read
  privileged per-app battery drain or silently impose background restrictions; true enforcement
  requires device-owner/system privileges.
- **Validation**: TypeScript validation is being run; Android install validation remains pending.
## 2026-07-21 — Safe storage cleanup workflow

- **Area**: Storage outcome track
- **Change**: Added a permission-aware shared-media scanner, candidate ranking for large/old media,
  selectable cleanup UI, and `delete_storage_candidates`. Android 11+ presents its own system delete
  confirmation before the selected content URIs are removed.
- **Safety**: The app never deletes during scanning. The user selects items in the UI, confirms in
  AI-OS, then confirms again in Android. Deletion is limited to selected shared-media URIs.
- **Validation**: TypeScript validation passed; Android device/build validation remains pending.
## 2026-07-21 — Phase 4 procedural memory

Added a local, privacy-minimized procedure store and planner hints. It persists a short intent,
tool names, and arguments from completed runs; screenshots, credentials, tool results, and raw
private content are intentionally excluded. This is development storage and must move to encrypted,
per-user storage before multi-user deployment.

The follow-up slice adds procedure listing, search, deletion, and a mobile reuse indicator so
the user can see and control learned memory instead of having it operate invisibly.

Phase 5 starts with a semantic learning-session API that accepts only UI metadata (role, label,
resource ID, action, and value), explicitly excluding screenshots and arbitrary payloads. Phase
4 hardening now adds an explicit workflow completion endpoint, outcome-aware traces, device/user
scope, deduplication, versioning, and Fernet encryption when the production key is configured.
Multi-user authentication and key rotation remain deployment hardening.

Added structured API, learning, and procedural-memory logs. Added
`backend/tests/test_procedural_memory_and_learning.py`;
the three Phase 4/5 persistence and approval tests pass with `python -m unittest discover -s
backend/tests -v`. Android and TypeScript checks remain environment-dependent.

Phase 5 now has a user-visible teaching card, semantic AccessibilityService event capture,
backend session ingestion, automatic procedure-draft creation, and draft approval/deletion. The
watcher is consent-gated and records only event metadata; safe replay and cross-version selector
adaptation remain future work. Approved procedures can now replay semantic tap/scroll actions and
set text using one-time runtime values supplied at replay; typed values are not stored. The
planner registry now exposes procedure discovery and replay so natural-language commands can
provide those runtime values.

Added replay completion verification and semantic selector fallback. Added
`docs/ANDROID_VALIDATION_CHECKLIST.md`; actual AccessibilityService/device behavior remains an
install-time validation requirement rather than something this Windows workspace can prove.

## 2026-07-22 — Device launch validation, embedded debug bundle, and native module startup

- **Area**: Android build/runtime and device connectivity
- **Symptoms**: A debug install showed “Unable to load script” when Metro was not reachable;
  after bundling, the physical device reported a TurboModule parse error for `AiosBriefStore`.
  The emulator also displayed a stale System UI ANR overlay while its React activity was running.
- **Root causes**: React Native debug variants normally omit the JS bundle; `BriefStoreModule`
  used expression-bodied `@ReactMethod`s whose inferred `Result<Unit>` return type violated the
  TurboModule parser’s synchronous-method contract. The emulator ANR was stale System UI state
  after repeated launches, not an app exception.
- **Solutions**: Set `debuggableVariants = []` so `packageDebug` embeds the Expo/Metro bundle;
  changed `saveBrief` and `getBrief` to explicit `Unit` methods; regenerated the native AI‑OS
  label/icon resources; configured the mobile client to use the host LAN address
  `192.168.1.74:8000`; installed and launched the rebuilt APK on emulator and physical device.
  Installed the missing backend `cryptography` requirement and started FastAPI on port 8000.
- **Validation**: `:app:packageDebug --offline` succeeded; both ADB targets installed the APK;
  physical and emulator `mFocusedApp` report `com.ntsinga.mobile/.MainActivity`, and emulator
  logcat reports `ReactNativeJS: Running "main"` with no script-load or TurboModule errors.
- **Lessons**: Metro is a development bundler, not the backend. A self-contained debug APK is
  preferable for device demos; backend reachability must be configured independently using a
  LAN-reachable server address. React Native `@ReactMethod` methods should always declare an
  explicit `Unit` return when they resolve through a `Promise`.

## 2026-07-22 — Hey Casper onboarding, recognition accuracy, and automatic execution

- **Area**: Voice activation and workflow UX
- **Change**: Added a first-run activation card that reports overlay, microphone, and calibration
  readiness; asks only for missing Android permissions; resumes the overlay and voice foreground
  services automatically after setup. Calibration records two private samples, one in a lower
  speaking range and one in a higher range, and stores their verified transcripts in app-private
  storage.
- **Recognition**: Uses Android's on-device `SpeechRecognizer` when available, requests multiple
  candidates/partial results and word confidence, and accepts common Casper/Kasper/Caspar/Asper
  recognition variants. The overlay bubble now changes color/scale and its notification changes
  when the phrase is heard and while the command is being captured.
- **Boundary**: Android's built-in `SpeechRecognizer` cannot be personalized by injecting these
  recordings. The samples are therefore a stored voice profile and a future integration point for
  a real custom wake-word engine (for example an on-device ONNX/OpenWakeWord or Porcupine model),
  not a claim that Android has been retrained.
- **Workflow UX**: Removed the redundant `Confirm & run` tap from the normal planner proposal
  loop. Tool proposals execute immediately; workflows still pause in `awaiting_reply` when the
  planner needs user information.
- **Validation**: `npm exec tsc -- --noEmit` passed. A self-contained debug APK was produced at
  `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. ADB device validation could not be
  repeated in this session because both previously connected targets were offline/disconnected.

## 2026-07-22 - Zero-cost Sherpa-ONNX wake-word engine

- **Area**: Voice activation / on-device keyword spotting
- **Change**: Replaced continuous wake-phrase transcription with Sherpa-ONNX's open-vocabulary
  English keyword spotter. The app bundles the Apache-2.0 Android AAR, a small int8 Zipformer
  model, and a generated `HEY CASPER` keyword file. Sherpa owns the microphone while waiting for
  the wake phrase; after detection it releases the mic to Android SpeechRecognizer for the command,
  then re-arms the spotter. If the native runtime/model cannot initialize, the previous transcript
  matcher remains the fallback.
- **Why**: A dedicated keyword spotter only decodes the configured phrase, so it avoids repeatedly
  interpreting arbitrary speech as a wake command and avoids sending wake detection to a cloud
  recognizer. The user's low/high samples remain private calibration history; this open-vocabulary
  model does not claim to retrain from them.
- **Packaging**: Debug APK is restricted to `arm64-v8a` and `x86_64` (the connected phone and
  emulator). The resulting APK is approximately 161 MB because it contains the native inference
  runtime and model assets.
- **Validation**: `:app:assembleDebug` passed; APK installed on both `R5CY105S20T` and
  `emulator-5554`. Emulator logcat confirms `Sherpa-ONNX KWS initialized for Hey Casper` and
  loads `libsherpa-onnx-jni.so` without a crash. Real speech recall, false accepts/hour, and battery
  usage still require a controlled phone test with positive and negative recordings.
- **Startup hardening**: Sherpa model construction now runs on a single background executor, so
  React renders the AI-OS screen while the model warms up instead of appearing blank or dropping
  frames during first activation.

## 2026-07-28 - Learned procedure replay investigation notes

- **Area**: Phase 5 learned procedure replay, Faras/SafeBoda ride procedures, logcat/database
  investigation workflow.
- **Symptom**: A learned ride procedure appeared to keep replaying or making no progress. Replay
  logs showed it bouncing between the target ride app and AI-OS, then skipping many steps.
- **Root cause**: The stored procedure was malformed: text-entry recording parsed incremental
  field text as replay steps (`focus(W)`, `focus(Wa)`, `text_input(Wande)`, etc.) instead of one
  stable field selector plus one runtime value. Replay treated `focus` and unstable text-delta
  `text_input` actions as actionable. Notification-permission UI in Faras also interrupted the
  target surface, so some steps ran while AI-OS or a permission dialog was frontmost.
- **Fix applied locally**: `mobile/src/tools/registry.ts` and
  `mobile/src/components/LearnedProceduresCard.tsx` now consider `tap`/`text_input` replayable
  only when they have a stable selector (`resourceId`, `contentDescription`, or a `fieldKey` that
  is not just the current text). `LearningWatcherService.kt` now ignores `focus` actions and
  selectorless/unstable text inputs at native replay time.
- **Regression guard**: Do not fix malformed text parsing by dropping selector metadata. SafeBoda
  needs duplicate-field disambiguation: `resourceIdOccurrence` plus nearby parent context such as
  `parentText` identifies the second pickup/dropoff input when two fields share
  `com.safeboda.passenger:id/pickUpDropOffInputText`. Native replay must receive and honor these
  fields before choosing a node by resource ID.
- **Regression recovered**: A later local edit restored selector metadata but accidentally stayed
  on the simpler replay path from `main`, dropping prior safeguards from commit `22a2151`
  (`Preserve replay selectors and recover target app`). The native replay files were restored from
  that implementation so waits/loading logic came back: `screen_ready_before_text`,
  `target_ready_before_text`, `focus_settle_before_text`, `waitForReadyNode`,
  `waitForScreenReady`, gesture-tap focus, front-window obstruction checks, duplicate text-input
  suppression, incremental typing, replay cooldown, queue locking, and location-suggestion waits.
  The bridge was then patched to stringify numeric `Dynamic` values as integers where possible so
  `resourceIdOccurrence` remains usable.
- **Validation**: `npm exec tsc -- --noEmit` passed after running with filesystem approval.
  `mobile/android/gradlew.bat :app:compileDebugKotlin --offline` passed after allowing Gradle to
  access its wrapper/cache. Kotlin emitted only existing `AccessibilityNodeInfo.recycle()`
  deprecation warnings.
- **Important DB state**: The local SQLite file `backend/procedural_memory.sqlite3` only had smoke
  data (`demo ride`, `persistence smoke test`) and no `debug_events` table. The real procedure
  records were in the configured Postgres database from `backend/.env` (`procedures` had 25 rows,
  `debug_events` had 2081 rows, `learning_sessions` had 59 rows at investigation time). Use the
  backend venv Python and `load_dotenv('backend/.env')` for direct DB inspection.
- **Bad remote procedure examples**: Remote Faras procedures `Ride 22` through `Ride 25`,
  especially procedure `31` (`Ride 24`) and `32` (`Ride 25`), were approved but dominated by
  `focus`, repeated partial `text_input`, and `screen_transition` steps. Delete, unapprove, or
  ignore these when testing until a clean procedure is taught.
- **2026-07-28 follow-up**: Faras procedure `32` (`Ride 25`) intentionally replayed Faras, but
  it kept reopening/churning because the stored lesson had no stable replayable selectors:
  direct DB inspection showed `stable_real []` for Faras procedures `28` through `32`. The bug was
  not app choice; it was that replay launched an exact malformed lesson instead of rejecting it
  before opening the target app. `mobile/src/tools/registry.ts` and
  `mobile/src/components/LearnedProceduresCard.tsx` now remove same-app "better procedure"
  fallback entirely. Exact replay either runs the requested approved procedure or records a
  `procedure_rejected` debug event with per-step selector diagnostics and fails before Android
  opens the target surface. Future debugging should focus on why teaching/storage produced only
  static text/current-value selectors for Faras, not on substituting another procedure.
- **Replay target-loss guard**: During a Faras replay, leaving Faras allowed later replay typing to
  land in AI-OS's own learning-procedure text field. Do not relaunch or continue a replay once the
  user leaves the target app. Native replay now aborts on target-surface loss with
  `target_surface_lost_abort`, and recording now auto-stops with `recording_auto_stopped` when the
  active root leaves the teaching target.
- **Logcat gotchas**:
  - The installed/running package in this build is `com.aioperatingsystem`, not
    `com.ntsinga.mobile`. `adb shell pidof com.ntsinga.mobile` can falsely imply the app is not
    running. Use `adb shell pidof com.aioperatingsystem` and `dumpsys activity processes`.
  - A useful replay slice is:
    `adb logcat -d -v time AIOS.Replay:I AIOS.Learning:I ReactNativeJS:I AndroidRuntime:E *:S`
  - If that slice is quiet, check recents/process state; AI-OS may be top activity and Faras may
    only be the previous task. Use `adb shell dumpsys activity recents`.
  - Some logcat lines may come from an APK newer or different than the local checkout. During this
    investigation logcat contained fields/events like `selectorKind`, `nodeClass`,
    `frontWindows`, `screen_ready_before_text`, and `target_ready_before_text` that were not in the
    local source at HEAD.
- **Windows/sandbox gotchas**:
  - Plain `python` lacked backend dependencies such as `python-dotenv`; use
    `backend/.venv/Scripts/python.exe` for backend DB scripts.
  - Direct Postgres inspection needs network approval; without it psycopg failed with
    `Permission denied` to port 5432.
  - Node/TypeScript may need filesystem approval because Node resolves paths under
    `C:\Users\ElijahNtsinga` and can hit `EPERM` in the managed sandbox. Request scoped approval
    for `npm exec` up front when validating this mobile workspace.
  - Gradle may try to fetch or touch its wrapper/cache even with `--offline`; if it fails with a
    socket permission error, rerun with approval. Request scoped Gradle approval up front for
    Android validation/install tasks. Keep `TMP` and `TEMP` pointed at `C:\Windows\Temp` for Gradle
    on this machine.
  - Samsung Dual App/user 95 can retain or recreate an AI-OS install. `scripts/start-aios.ps1`
    now removes stale packages across all Android users before install and always runs
    `pm uninstall --user <non-primary-user> com.aioperatingsystem` after install, regardless of
    whether a pre-check reports the clone. Verify with
    `adb shell dumpsys package com.aioperatingsystem`; user 0 should be `installed=true` and user
    95 should be `installed=false`.
- **Next-agent checklist**:
  1. Read this entry before replay work.
  2. Check whether the backend is running on `127.0.0.1:8000`; if not, local `/procedures` calls
     will fail even though remote Postgres has data.
  3. Inspect both local SQLite and remote Postgres before concluding data is missing.
  4. Verify the active Android package name before trusting `pidof`.
  5. For replay bugs, summarize `debug_events` by `trace_id`, `procedure_id`, warning count, and
     failure reasons before changing code.
  6. Rebuild/reinstall the APK after native replay fixes; the connected phone keeps using the
     installed APK until replaced.
# 2026-07-28: Uber teaching capture stopped during launch

- Symptom: teaching an Uber lesson repeatedly captured no semantic actions.
- Evidence: `AIOS.Learning` logged `recording_auto_stopped` with `eventSurface=com.aioperatingsystem`, `activeRootSurface=com.aioperatingsystem`, and `targetSurface=com.ubercab` during the AI-OS-to-Uber launch transition. The target had not yet become active, so the new exit guard stopped recording too early.
- Fix: recording now tracks `target_seen` and auto-stops only after the target surface has first been observed active and is subsequently left. The flag resets for every new recording.
- Earlier Uber capture evidence: once Uber was active, the watcher captured 16 queued actions (`scroll:3`, `focus:1`, `text_input:11`, `tap:1`), so the native semantic capture path works after the launch race is avoided.

# 2026-07-28: Teaching session ownership regression

- Symptom: the UI showed no semantic inputs and Stop repeatedly failed with `At least one semantic action is required.`
- Database evidence: multiple simultaneous `Ride 27` sessions were created. Session `0a52...` held 13 actions, while the current session `078b...` held 0 actions; Stop was targeting the empty session.
- Cause: prior session guards (`activeSessionId`, `startInFlight`, `stopInFlight`, and drain ownership checks) had been removed from `LearningModeCard` during the upload simplification.
- Fix: restored one-session locking, active-session drain ownership, timer cleanup, and Stop targeting the active session. This was a regression from the previous implementation, not an Uber accessibility limitation.

# 2026-07-28: Learned procedures did not auto-refresh after teaching

- Symptom: a newly completed lesson was saved but the Learned Procedures list did not update until manual refresh or remount.
- Cause: the `aios.learning.procedureSaved` DeviceEventEmitter contract had been removed from both the completion and list components.
- Fix: completion emits the event after `completeLearningSession`; Learned Procedures subscribes and reloads immediately.

# 2026-07-28: Replay lost Uber target after focus gesture

- Symptom: replay opened Uber and began the first focus step, but the subsequent text action failed and replay aborted with `target_surface_lost_abort`.
- Evidence: logcat showed the root changing from `com.ubercab` to `com.aioperatingsystem` during `focus_settle_before_text`; the failed text action then saw AI-OS/recent-apps content instead of Uber.
- Cause: the floating AI-OS overlay remained active during external-app replay and could reclaim the accessibility/foreground surface when the replay gesture ran.
- Fix: external-app replay now suspends the overlay for the complete launch/replay operation and restores it in `finally`; the existing real gesture focus path and strict target-surface abort remain intact.

# 2026-07-29: "Hey Casper" wake-word commands silently dropped when app was backgrounded, not killed

- Symptom: user reported "the voice functionality is not there yet" - saying the wake phrase visibly woke the bubble/notification and brought the app to the foreground, but the spoken command never reached the planner/workflow.
- Evidence: traced the full pipeline (`VoiceActivationService.kt` wake-word detection → on-device `SpeechRecognizer` command transcription → `launchCommand()` firing `aios://voice?command=...` via `startActivity`). Detection and transcription both work; `ERROR_LOG.md`'s own 2026-07-22 KWS entry only ever validated that the model *loads*, never a full say-it-and-it-runs round trip. `MainActivity.kt` had no `onNewIntent()` override, and `MainActivity` is `launchMode="singleTask"` - so once the app's task already exists (the normal case, since you enable "Hey Casper" from inside the running app), Android delivers the new deep-link intent through `onNewIntent()`, not a fresh `onCreate()`. Without forwarding it, `App.tsx`'s `Linking.addEventListener('url', ...)` never fires and `Linking.getInitialURL()` stays stale - only a full cold start (app previously killed) worked, since then the intent arrives as the activity's initial intent.
- Cause: missing standard RN Android deep-link boilerplate (`onNewIntent` → `setIntent`) in `MainActivity.kt`.
- Fix: added `override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent) }` to `MainActivity.kt`.
- Also noted, not yet fixed: the wake-word path and the manual `VoiceInputButton` mic button use two entirely different transcription mechanisms (on-device Android `SpeechRecognizer` vs. cloud OpenAI via backend `/transcribe`), and `ActivationSetupCard.tsx`'s voice "calibration" step records/stores sample clips but nothing in `VoiceActivationService.kt` ever reads them back - the onboarding copy claiming personalized wake-word matching is currently false.
- Lessons:
  - A deep-link handoff from a background Android service needs to be tested from a *backgrounded* app state, not just a cold start - cold start silently masks a missing `onNewIntent` override because the URL arrives via `getInitialURL()` instead.
  - "The native side logs success" (KWS model loaded, intent fired) is not the same as "the feature works" - verify the JS side actually received the event before calling a pipeline validated.

# 2026-07-29: Learned ride procedures replayed "complete" but never selected a destination

- Symptom: the last two taught Uber ride procedures ("Ride 32", "Ride 33") reported `replay_completed` with no crash, but the ride's destination was never actually chosen.
- Evidence: queried the live procedures/debug-events over `/procedures` and `/debug/events` (production DB, since `EXPO_PUBLIC_BACKEND_BASE_URL` points at Render). Both procedures' destination-selection tap step had `resourceId: null`, `selectorKind: null`, and `text` set to a distance label ("2.4 mi" / "5.7 mi"). The most recent replay trace showed `step_skipped: selector_not_found_after_wait` with `selector.text: "2.4 mi"` while the actual screen showed `"3.5 mi"`/`"3.6 mi"` for the same results - Uber recalculates that distance from current location every time, so a selector built from it can never match again.
- Root cause (capture side): `LearningWatcherService.kt`'s `onAccessibilityEvent` built a tapped node's `text` selector from `event.text?.firstOrNull()` - for Uber's destination-result rows, the accessibility event's text list puts the volatile distance label first, ahead of the actual place name/address, so it always got captured as the selector.
- Root cause (design gap): teaching never recorded *which specific option* was tapped when several results share a prefix (e.g. "Ntinda Shopping Center" vs "Ntinda Kigowa Road" vs "Ntinda View Crescent" all match typing "Ntind") - only the (unusable) distance label. This means recovery for the two already-taught procedures cannot safely be automated: guessing between multiple equally-plausible named options risks silently selecting the wrong destination. They need to be re-taught.
- Fix (capture): `onAccessibilityEvent` now rejects known-volatile text patterns (distance, duration, clock-time regexes - `isVolatileLabel`) when choosing `event.text`, and falls through the rest of the event's text list, then to `readableLabel(node)` (node-tree text), before ever accepting a volatile value.
- Fix (recovery, v1 of the "Phase 5.5" planner-guided recovery already described in `AGENTS.md`/`docs/AI_OS_ORCHESTRATOR_PLAN.md` but never implemented until now): new `POST /replay/recovery` (`backend/app/replay_recovery.py`), called from `LearningWatcherService.kt::attemptBoundedRecovery` only for `tap` steps whose selector isn't found after every existing deterministic fallback. Deterministic-first: if the value typed earlier in the procedure matches exactly one currently-visible element, resolve with no model call; if it matches two or more, always abort - never guess, regardless of what a model call would say. Only when there's no typed-value signal at all does it fall back to a constrained `gpt-4o-mini` call that must pick an index from the real, currently-visible elements it's given (JSON-schema-enforced) or return retry/abort; a server-side guard rejects any model-picked index that isn't actually in that list.
- Validation: `backend/tests/test_replay_recovery.py` (9 tests) covers the unambiguous-match fast path, the multi-match-must-abort guard (using the actual 4 "Ntinda ..." candidates from the real trace), and the index-outside-real-list rejection guard. Full backend suite 46/46 passing. Native side compiles; on-device end-to-end validation (re-teach a ride and confirm the destination step now captures a place name, not a distance) still pending.
- Lessons:
  - `AccessibilityEvent.getText()`'s ordering is not the same as visual/DOM order - never trust `.firstOrNull()` for a compound list-item's label without checking it isn't a value that's expected to change (distance/ETA/time/price-shaped text).
  - Recording "what the user typed" is not the same as recording "which specific option the user picked" - when multiple results can share a typed prefix, only capturing the query loses the actual selection, and no amount of replay-time cleverness can safely reconstruct it after the fact.
  - A documented "planner may only choose a bounded action" safety rule is only as strong as the code that enforces it - implemented the ambiguity check and the index-validity guard server-side (not just via prompt instructions) so an uncooperative or confused model response still can't cause an unsafe action.

## 2026-07-29 (same day, follow-up) - Learn-forward persistence + interactive `ask_user` recovery

- **Context**: the v1 recovery above only helped the run in front of it - a resolved step was never saved, so every future replay of the same procedure needed recovery again, and the "2+ typed-value matches" / "no confident model match" cases hard-aborted with no way to actually finish the ride. The user asked for both: (1) persist a successful recovery so the procedure self-heals, and (2) when recovery can't safely auto-resolve - especially for `text_input`, which was never attempted at all - ask the person replaying instead of just failing, either with options or a plain question, and use their answer to continue.
- **Persistence**: `procedural_memory.get_procedure()` / `correct_step_and_save_version()` (backend) and `POST /procedures/{id}/correct-step` (`main.py`) apply a corrected step's arguments on top of the procedure's existing steps and save the result via the existing `save_procedure()` fingerprint/versioning path - same mechanism used for normal re-teaching, not a special case. `LearningWatcherService.kt` threads `procedureId`/`stepIndex` through `replay()` → `LearningWatcherModule.replayActions` → `LearningWatcher.ts` → both call sites (`LearnedProceduresCard.tsx`, `registry.ts`'s `replayLearnedProcedureTool`) so every successful recovery calls `persistCorrectedArguments` (best-effort - a failure here never affects the live replay's outcome, only whether a *future* replay still needs recovery).
- **Interactive `ask_user`**: `replay_recovery.py` no longer hard-aborts on ambiguity or "no confident model match" - both now return `{"action": "ask_user", "candidateIndices": [...]}` instead (validated real indices only, same as `select_element`). New `RecoveryPromptOverlay.kt` shows a blocking, themed prompt (candidate buttons + an always-available free-text field) as a `TYPE_ACCESSIBILITY_OVERLAY` window - no `SYSTEM_ALERT_WINDOW` permission needed, since `LearningWatcherService` already holds the accessibility-service binding - and blocks the replay thread on a `CountDownLatch` until the user answers or a 60s timeout elapses (default: abort the step). Whatever gets tapped or typed is always a direct, synchronous human answer, never a model guess.
- **New capability, not just a fallback**: `text_input` steps whose selector can no longer be found at all previously always skipped with no recovery attempt (`AGENTS.md` explicitly called this out as a deliberate boundary, since typing into an unverified target was considered unsafe). `attemptTextInputRecovery` now asks a human which editable field (if more than one is visible) and what value to type, then types exactly that - never a model-supplied value. This is what let the "never guess" rule and "recover text_input" coexist: a human confirming their own answer isn't a guess.
- **Validation**: `backend/tests/test_replay_recovery.py` updated for the new `ask_user` action (14 backend tests total across both recovery files, full suite 51/51 passing). Native side compiles clean (`:app:compileDebugKotlin`). `npx tsc --noEmit` clean. On-device end-to-end validation of the full recovery+persistence+prompt chain (trigger a real broken-selector replay, e.g. "Ride 32"/"Ride 33" which still carry the original volatile-distance-label bug in their stored steps, and confirm the overlay appears and the correction persists) still pending.
- Lessons:
  - "Ask, don't guess" is not the same policy as "never resolve ambiguity automatically" - the hard safety rule was specifically about the *model* never picking between equally-plausible options, not about the system being unable to make forward progress at all. A synchronous human-in-the-loop answer is a different trust tier entirely and can safely fill the gap a model must not.
  - Threading an identifier (`procedureId`) through a long call chain (native `replay()` → JNI bridge → JS wrapper → two call sites) is easy to leave half-done across a context compaction - the type signature can be updated without the function body, and it will look correct until `tsc`/Kotlin compile actually catches the mismatch. Always compile end-to-end after resuming this kind of multi-layer plumbing change, don't assume the last edit before a break was the last edit needed.

## 2026-07-29 (same day, follow-up 2) - Recovery-persistence lost-update bug, and a runtime-value corruption risk

- **Symptom**: user reported "when Ride 33 was corrected, it created 3 versions" - investigated via `/procedures` on production. Ride 33 has the same volatile `"2.4 mi"` selector recorded twice (steps 2 and 5 - a duplicate-recording artifact from teaching), so one replay triggered recovery twice. v2 correctly fixed step 2; v3 (built moments later from the step-5 correction) had step 2 **regressed back to broken** while fixing step 5 - the step-2 fix silently vanished.
- **Root cause**: `procedural_memory.correct_step_and_save_version(procedure_id, ...)` built its corrected steps from the literal `procedure_id` row passed in, not the current latest version for that `(scope, intent)` lineage. Native code always passes the ID captured once at the start of the whole replay, so a second correction later in the same run forks from the pre-first-correction snapshot and clobbers it.
- **Fix**: added `_latest_version(scope, intent)` and changed `correct_step_and_save_version` to always correct on top of it, never the passed-in row directly. `step_index` stays valid across versions since corrections only ever change argument values, never step count/order.
- **Deploy mistake made while fixing this**: verified the fix by calling `/health` (200 immediately - Render does zero-downtime deploys, so the OLD instance keeps answering `/health` right up until the swap) and treating that as "deploy done," then immediately calling the real endpoint - which was still running the pre-fix code and created a *fourth*, still-buggy version. Lesson: `/health` returning 200 proves the service is up, not that a specific deploy has landed; verify an actual deploy by behavior that only the new code produces (or poll until that behavior appears), not by liveness alone.
- **Separate bug found while explaining "can an existing procedure be reused for a different destination" to the user**: `os_harness.md` already documents that the planner may replay a learned procedure with one-time `runtimeValues` (e.g. substituting a new ride destination) and that "runtime values must never become persistent memory." The recovery-persistence code added earlier the same day didn't honor this - any successful recovery got persisted regardless of whether the broken selector was due to stale UI (worth remembering) or a deliberately different one-off destination search (must never be remembered). Left unfixed, asking for a ride to a new place would have silently repointed the taught procedure at that one-off address.
- **Fix**: `replay()` now tracks `lastTextInputWasRuntimeOverride` alongside `lastTextInputValue`, threaded into `attemptBoundedRecovery`/`attemptTextInputRecovery` as `typedValueIsEphemeral`/`isRuntimeOverride`. Every recovery-persistence call site is gated through it (`maybePersistTapCorrection` centralizes the tap-side guard so none of the three tap-recovery resolution paths could forget it); the replay itself still completes normally either way, only the persistence is skipped, with `correctionSkippedReason: "runtime_override_value_not_persisted"` recorded in the trace for transparency.
- **Validation**: added a regression test reproducing the exact two-correction-in-one-run sequence (`test_second_correction_in_the_same_replay_builds_on_the_first_not_the_original`); full backend suite 52/52 passing. Kotlin compiles clean; rebuilt and installed on device.
- Lessons:
  - A "persist this correction" code path added to fix one bug (recovery not self-healing) can silently reintroduce a *different*, previously-solved problem (runtime values leaking into permanent memory) if it doesn't know about a policy that already existed elsewhere in the system (the planner prompt). When adding persistence to any previously-ephemeral operation, explicitly check what else already assumed that operation was ephemeral.
  - "It returned 200" is not the same claim as "the new code is live" - for any zero-downtime-deployed service, verify a deploy by a behavior the new code specifically produces, not by the service merely responding.

## 2026-07-30 — Teaching evidence handoff and Android install limitation

- **Implementation update**: Learning transitions now carry compact `preScreen`, `postScreen`,
  and `semanticDiff` evidence through the native queue and backend persistence. This preserves
  semantic before/after context for a future bounded teaching retry or planner decision without
  storing screenshots or raw touch coordinates.
- **Validation**: Backend unittest coverage passed 9/9 for the affected learning tests. Android
  `:app:installDebug` first timed out after 124 seconds without output; the longer retry reached
  Gradle but failed at installation because no connected devices were available. The updated APK
  has not been claimed as installed.

- **Follow-up**: `semanticDiff.changedState` and unique `added` matches now contribute directly to
  same-node inferred-tap confidence; the diff is no longer documentation-only. The previous-screen
  snapshot is retained by reference because the event snapshot is not mutated afterward. Payload
  size remains unchanged pending real-session compaction measurements.

## 2026-07-30 (same day, follow-up) — Two independent bugs behind "Book 6 captured the wrong element" and "Book 7's steps got stuck alternating"

User reported three symptoms from the same teaching pass: Book 6 correctly captured "Start your
search" but then captured "Popular homes in Bugolobi" (a Home-screen listing header) instead of
the "Nearby" option the user actually tapped inside the newly-opened search modal; the replay-time
recovery overlay showed Home-screen candidates instead of the modal's; and a new session, Book 7,
captured a procedure that just alternates `tap 'Experiences'` / `tap 'Services'` / `tap 'Close'`
with no real steps. Investigated per explicit instruction to use logcat and DB events rather than
guessing. Found two separate, compounding bugs — not the concurrency lock (re-verified live with a
fresh 20-concurrent-request test against a throwaway session: 20/20 survived, ruling it out
directly).

**Bug 1 — accessibility focus-oscillation storm (`LearningWatcherService.kt`, client)**

- **Symptom**: `adb logcat -s AIOS.Learning` during Book 7's teaching window showed the bottom tab
  bar elements ("Experiences"/"Services"/"Close") logged as `action":"tap"` dozens of times in a
  row, gaps of 60–420ms, for 4+ continuous seconds while the user was actually interacting with
  the date-picker calendar — clearly not real taps. The identical pattern (rapid oscillation
  between "Popular homes in Bugolobi"/"Experiences NEW"/"Services NEW") appeared earlier in the
  same log while the user was on the Home feed, right before the real "Nearby" tap — this is what
  got recorded as Book 6's step 1 instead of "Nearby".
- **Root cause**: Compose screens with heavy re-layout (the calendar, the feed) fire genuine,
  repeated `TYPE_VIEW_FOCUSED` events on a small set of persistent chrome elements as accessibility
  focus bounces during recomposition. `syntheticActivationBeforeFocus` promotes each one straight
  to a synthetic `tap`. Its only guard, `hasRecentFocusOrTapForSameTarget`, compares a new focus
  event only against the single immediately-preceding queue entry — so alternation between 2+
  targets (Experiences → Services → Close → Experiences → …) defeats it on every single event,
  since neighboring entries never share the same target.
- **Fix**: added a time-windowed storm detector (`isFocusPromotionStormSuppressed`, ~30 lines
  above `syntheticActivationBeforeFocus`). Qualifying focus events less than 900ms apart count as
  one storm episode (no human deliberately taps distinct targets faster than that in a sustained
  burst); only the first 2 events per episode are promoted to synthetic taps, the rest are
  suppressed and logged as `synthetic_tap_suppressed_focus_storm`. The episode resets after any
  real ~900ms gap, so genuine sequential user taps are unaffected.
- **Validation**: `:app:compileDebugKotlin` clean. Rebuilt and installed on device
  (`lastUpdateTime` confirmed advanced). On-device re-teach to confirm the storm no longer pollutes
  a real session is still pending — flagged for the user's next teaching pass.

**Bug 2 — backend action-array char budget sized for the pre-instrumentation payload shape (`backend/app/learning.py`)**

- **Symptom**: Book 7's raw `action_appended` debug-event trace showed `actionCount` stuck at the
  same value across multiple real appends (`step=3` three times running with different tapped
  text, then `step=4` twice) — the exact visible signature of the old lost-update race, but the
  lock was already re-verified working.
- **Root cause**: direct query of Book 7's stored session (`5eb1ac0c-…`) showed only 4 actions
  stored but `len(actions_json) == 49988` — one action embeds a ~4KB compact `screen` snapshot
  (added earlier this same day for the hybrid inference pipeline; see the entry above). Against
  `MAX_ACTIONS_JSON_CHARS = 50000`, that's the ceiling after only ~4 real actions. Once
  `_compact_actions` exhausts `NOISE_ACTION_TYPES` entries (`screen_transition`/`observe`/`scroll`)
  it falls back to evicting the *oldest action of any type* — including real taps — to make room
  for each new one. Net effect: pop one real step, push one real step, `len()` doesn't grow. Purely
  a payload-size regression from the new screen-embed instrumentation; the 50000 budget was never
  updated to match. (The follow-up note in the entry above — "payload size remains unchanged
  pending real-session compaction measurements" — was the flag that this needed checking; it
  wasn't checked until this incident forced it.)
- **Fix**: raised `MAX_ACTIONS_JSON_CHARS` from 50000 to 400000, matching the client's own
  `MAX_QUEUE_CHARS` (`LearningWatcherService.kt`) which budgets the same payload shape.
- **Validation**: full backend suite 54/54 passing. **Not yet deployed to Render** — this fix only
  helps once pushed; local `sqlite`/test runs don't reflect production until then.
- Lessons:
  - When two independent budgets (client queue-trim size, backend compaction size) exist for the
    same payload shape, a change that grows the payload on one side silently invalidates the other
    side's sizing unless both are updated together. Search for the sibling constant whenever
    changing what a record contains, not just whether it fits.
  - A "stuck step count" and "wrong element captured" reported together in the same session can
    have two entirely unrelated causes that only look connected because they hit the same teaching
    pass — don't stop at the first plausible explanation (concurrency was the obvious first guess
    from prior history) once it's been directly disproven; keep pulling the thread with real
    evidence (logcat, direct DB query) rather than pattern-matching to the last similar bug.

## 2026-07-30 (same day, follow-up 2) — The focus-storm fix didn't cover Case A/B/C's own storm vulnerability (Book 8)

- **Symptom**: after the two fixes above shipped, user reported Book 8: "Start your search" was
  correctly captured, there was "a long wait" before the real "Nearby" tap, and the recording
  captured "Home" and "Services" instead — the same class of wrong-element capture, on a freshly
  rebuilt app.
- **Investigation**: direct query of Book 8's session (`27b5dea1-…`) showed 4 stored actions —
  `Start your search`, `Homes`, `Profile`, `Wishlists` — all `inferred: true` via Case A ("single
  clickable node changed state"), all with `confidence` well above threshold. Critically, all four
  carried **byte-identical** `preScreen`/`postScreen` snapshots (the same 10-element Home-screen
  bottom nav bar) and an **empty** `semanticDiff` (`added`/`removed`/`changedState` all `[]`) — the
  screen never actually visibly changed across any of these four events. `debug_events` timestamps
  put all four within ~1 second of each other.
- **Root cause**: the previous entry's fix only guarded the *focus→tap* promotion path
  (`syntheticActivationBeforeFocus`). Case A/B/C (`applyInferredTapIfConfident`, triggered from
  `screen_transition` events) had no equivalent protection. A burst of `screen_transition` events
  can fire in a row while something is still settling (a modal animating in, a network fetch) —
  each carrying an arbitrary, different node as `event.source` even though nothing detectably
  changed. Case A only ever looks at one event in isolation, so any later event in the same burst
  can independently satisfy "small labeled clickable element, existed on the previous screen" —
  which is trivially true for persistent bottom-nav items on almost every screen. Requiring
  `semanticDiff` corroboration doesn't distinguish real from spurious here, since the **real**
  capture's diff was also empty — the tapped element's own visible effect (the modal opening)
  hadn't rendered yet when the snapshot was taken. Only recency does: the real tap's event is
  reliably first in the burst; everything after it in the same tight window is settling noise.
- **Fix**: added the same storm-episode pattern used for the focus path, this time gating
  `applyInferredTapIfConfident`'s three cases through a shared `acceptInferredTap()` helper and
  `isInferredTapStormSuppressed()` — only the *first* accepted inferred tap (across any of Case
  A/B/C) per ~1000ms episode is kept; anything else within that window is logged as
  `inferred_tap_suppressed_storm` and discarded, regardless of which case would have accepted it.
- **Validation**: `:app:compileDebugKotlin` clean. Rebuilt and installed on device (`lastUpdateTime`
  confirmed advanced to 2026-07-30 15:57:32). On-device re-teach to confirm the fix holds for a
  live "Start your search → Nearby" sequence is still pending.
- Lessons:
  - A fix scoped to "the code path that produced this specific bad log line" doesn't necessarily
    cover "the class of bug that produced it" — the focus-oscillation fix and this one address the
    identical underlying phenomenon (spurious accessibility events during UI settling misattributed
    as taps) through two structurally separate pipelines (`syntheticActivationBeforeFocus` vs.
    `applyInferredTapIfConfident`) that happened to need the same shape of fix independently. When
    a root cause is "the platform fires more events than there were real interactions," check every
    place that promotes an event to a recorded action, not just the one the evidence pointed at
    first.
  - Requiring corroborating evidence (a non-empty diff) is not always the right tightening — here
    it would have rejected the *correct* capture too, since the real tap's own visible effect
    hadn't rendered by the time the snapshot was taken. Recency/uniqueness-per-burst was the signal
    that actually separated real from spurious in the concrete data; don't assume "add a stricter
    content check" is always safer than "add a timing check" without checking what the real
    captures actually look like.

## 2026-07-30 (same day, follow-up 3) — Our own app was auto-stopping every recent teaching session, not the user leaving Airbnb (Books 9/10)

- **Symptom**: user reported Book 9 "failed" and asked to confirm the debugging instrumentation
  itself was adequate. Also reported (mid-investigation, correcting an early hypothesis) that they
  **never typed** during any of these sessions, ruling out the keyboard as a user-initiated trigger.
- **Investigation**: queried the three most recent Airbnb learning_sessions directly and their full
  `debug_events` traces. Two attempts were both named "Book 9" (`b66bb8b8`, `67d43e7a` - the first
  clearly a false start the user immediately retried) and a third, "Book 10" (`8da51347`),
  eventually completed with 11 actions. `b66bb8b8`'s raw `action_appended` trace showed
  `actionCount` genuinely jumping **backward** repeatedly (1,2,3,3,2,2,2,3,3,3,3,4,4,3,3,3,3,3,2,2,
  2,2,2,2,2,3,4) - real evidence of lost appends, distinct from the merely-*stuck* pattern from the
  earlier Book 7 investigation. Root cause: the `MAX_ACTIONS_JSON_CHARS` fix from earlier today
  (50000 → 400000) was written and tested locally but **never deployed to Render** - the old 50000
  budget is still live in production, and these newer sessions carry even heavier per-action
  payloads (focus + text_input + several screen_transitions, each embedding a full snapshot),
  so compaction is popping *multiple* items per append to get back under budget, which is exactly
  what produces a net decrease larger than 1. A `session_error` ("No actionable taps... Try
  teaching again") fired mid-session at `13:01:42.759`, consistent with compaction evicting the
  session's only actionable step right before something tried to complete it.
- **Bigger finding**: cross-referencing raw logcat against this trace explained *why* something
  tried to complete the session that early. All three sessions that day show a burst of hundreds of
  `recording_event_skipped/target_not_frontmost` events followed by `recording_auto_stopped`
  (`reason: target_app_exited`) - and extracting the actual `activeRootSurface`/`eventSurface`
  fields from the raw log (not just the event name) showed **all three** `recording_auto_stopped`
  firings had `activeRootSurface == eventSurface == com.aioperatingsystem` - our own app, never a
  third-party app switch. The user confirmed they never left Airbnb or typed anything.
- **Root cause**: `onAccessibilityEvent`'s auto-stop guard already exempts transient system
  surfaces (launcher/systemui/keyboard, via `isTransientNavigationSurface`) from counting as
  evidence the user left the target app - added earlier this session after real launcher-glimpse
  false positives. It never exempted **our own package**. `isTargetSurfaceActive` (the analogous
  replay-side check, used by recovery/confirmation overlays) already has this exact exemption
  (`currentRoot == packageName`) - it was never carried over to the recording-side guard. So any
  time our own foreground-service notification or an accessibility overlay window briefly became
  the reported root (which `rootInActiveWindow` can glitch to report, same as the launcher), the
  auto-stop guard concluded the user had switched to a different real app and permanently killed
  the recording - even though the event's own `packageName` was still genuinely Airbnb the whole
  time. This is almost certainly why 2 of the last 3 teaching attempts needed a restart with no
  clear reason and why "Book 9"'s first attempt only captured 3 real steps.
- **Fix**: `LearningWatcherService.kt` - both the hard auto-stop condition and the noisy
  `target_not_frontmost` skip-check (which was also discarding genuine in-flight events during the
  same glitch, not just risking auto-stop) now exempt `activeRootPackage == packageName` /
  `surface == packageName`, mirroring `isTargetSurfaceActive`'s existing pattern exactly.
- **Validation**: `:app:compileDebugKotlin` clean. Rebuilt and installed on device. Backend fix from
  earlier today (`MAX_ACTIONS_JSON_CHARS`) still needs an actual Render deploy to take effect in
  production - flagged to the user as now higher priority given fresh evidence it's actively
  corrupting live sessions.
- Lessons:
  - When a fix introduces an exemption for one path (`isTargetSurfaceActive`'s `== packageName`
    check), check every OTHER path making a structurally identical trustworthiness judgment
    (the recording-side auto-stop guard checks the same kind of "is this really evidence the user
    left" question) for the same gap - a fix applied to only the path that happened to be under
    investigation at the time leaves siblings silently vulnerable.
  - Don't stop at "the event name is `recording_auto_stopped`, reason `target_app_exited`" -
    extract the actual surface/package fields the decision was based on before trusting the
    stated reason. The reason string was accurate to the code's own (buggy) judgment, not to what
    actually happened.
  - A fix that's written, tested, and reported as "not yet deployed" doesn't stay theoretical -
    it keeps actively corrupting every subsequent production session until it's actually pushed.
    Treat "confirmed root cause, fix ready, not deployed" as an open incident, not a closed one.
