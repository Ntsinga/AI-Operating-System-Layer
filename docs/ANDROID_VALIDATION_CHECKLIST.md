# Android validation checklist for Phases 1–5

The repository contains automated backend contract tests, but AccessibilityService behavior can
only be validated on an Android emulator or physical device. Run the following before calling
the phone-use layer production-ready.

## Capability and permission checks

- Install a debug build on a clean Android 12+ emulator/device.
- Grant microphone, camera, contacts, calendar, SMS, location, notification, and overlay access
  only when each test requires it.
- Enable **AI-OS learning watcher** under Android Accessibility settings.
- Confirm disabling the service stops event capture and replay.

## Teach and replay checks

- Teach a harmless workflow such as opening a search field and tapping a result.
- Confirm the procedure appears as a draft in Learned Procedures.
- Confirm typed text is not present in the stored procedure payload.
- Approve the draft and replay it from the app.
- Move or rename a UI element, then confirm semantic text/content-description fallback can still
  find it or reports a skipped action rather than tapping an unrelated control.
- Replay with a one-time runtime value and confirm it is entered but not persisted.
- Provide a completion selector and confirm replay reports `verified: 1` only when it is visible.
- Confirm a missing completion selector produces `requiresManualConfirmation`.
- Test a booking-like flow in a sandbox app and confirm the final irreversible action still pauses
  for user approval.

## Failure and privacy checks

- Disable Accessibility during replay and confirm the workflow fails safely.
- Kill and restart the app during teaching; confirm incomplete sessions are not auto-approved.
- Inspect logs for session IDs, counts, outcomes, and selector failures—not passwords, screenshots,
  message bodies, or typed runtime values.
- Test Android versions and OEM skins with different resource IDs and accessibility trees.
