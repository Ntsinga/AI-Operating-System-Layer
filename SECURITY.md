# AI-OS Security Register

This is the living security and safety register for AI-OS. Every new security issue, privacy
complaint, unsafe behavior report, or trust concern should be added here and cross-referenced from
`ERROR_LOG.md` when it has concrete runtime evidence.

## Rating Scale

The countermeasure rating is an estimated effectiveness score, not a guarantee:

- **10**: Strongly prevents or neutralizes the threat under the stated assumptions.
- **7-9**: Usually prevents it, but depends on Android, app, device, network, or user behavior.
- **4-6**: Reduces likelihood or impact but leaves a meaningful residual risk.
- **2-3**: Limited mitigation; useful mainly as defense in depth.
- **1**: The project currently cannot meaningfully prevent it.

Ratings must be revisited after incidents, architecture changes, and real-device testing.

## Threat Register

| Issue or complaint | Risk | Countermeasure | Rating | Residual risk / verification |
|---|---|---|---:|---|
| Replay types into the wrong app or AI-OS itself | Account damage, privacy leak, unintended input | Require the target package to be the active accessibility root before every input; abort on target loss; never silently continue | 9 | Android races and malicious/buggy overlays remain possible; test target-loss transitions |
| Replay taps the wrong same-shaped field | Wrong pickup/destination/account field | Store resource ID occurrence, hierarchy context, selector kind, screen evidence, and parent context; reject ambiguous matches | 8 | Custom apps may expose weak semantics; require confirmation when confidence is low |
| A physical tap is reported only as focus/text input | Missing activation and failed replay | Record activation intent separately; derive a clickable ancestor/container; replay gesture tap plus focus fallback | 7 | Accessibility APIs may omit both click and useful hierarchy; add category tests |
| False scroll events corrupt a lesson | Replay navigates the wrong screen | Ignore startup/layout scroll noise, invalid bounds, and non-semantic events before the first action; retain trace evidence | 8 | Some genuine early scrolls may be missed; verify against app categories |
| Overlay steals focus during external replay | Replay aborts or acts on AI-OS | Suspend overlay during external replay, restore in `finally`, and keep strict target validation | 8 | Other system overlays, keyboards, and permission dialogs can still intervene |
| Planner recovery invents an unsafe action | Unbounded automation or wrong-app input | Planner may choose only typed, budgeted recovery actions; no arbitrary coordinates, procedure switching, or unverified typing | 8 | Planner quality and semantic state estimation still require adversarial tests |
| Prompt injection in app text or notifications | Planner follows hostile instructions | Treat external UI text as untrusted data, never as policy; isolate tool policy and require confirmation for risky actions | 7 | Accessibility text can still influence model reasoning; add red-team fixtures |
| Booking, payment, sending, deletion, or settings change happens without consent | Irreversible harm or financial loss | Explicit confirmation at the final side-effect boundary; replay stops before submit/review actions by default | 9 | A misclassified action could bypass a boundary; maintain action-risk tests |
| Sensitive typed values enter procedure storage | Credential or personal-data exposure | Supply runtime values separately; do not persist typed values, screenshots, raw tool results, or credentials | 8 | Debug logs and backend request traces must be audited for accidental values |
| Google OAuth or other tokens leak | Account takeover | Keep client secrets server-side; encrypt OAuth tokens with Fernet at rest; protect `DATABASE_URL` and encryption keys | 8 | Key compromise or misconfigured deployment remains catastrophic; rotate and audit keys |
| Logs expose personal content or secrets | Privacy breach and difficult deletion | Log selectors, event types, outcomes, and bounded metadata only; redact values and avoid screenshots | 7 | Accessibility labels can contain names/addresses; add automated redaction tests |
| Learned procedures reveal locations or routines | Privacy and stalking risk | Minimize stored intent/metadata, scope procedures to device/user, encrypt when configured, support deletion | 7 | Selectors and labels can still be identifying; document retention and export deletion |
| Remote database mixes users or devices | Cross-user procedure execution or data leak | Scope and fingerprint procedures, validate requested procedure identity, isolate database access, audit caller scope | 7 | Local MVP authentication and deployment isolation are incomplete |
| Samsung Dual App/user 95 runs a second AI-OS copy | Conflicting sessions, duplicate overlays, data confusion | Always uninstall AI-OS for user 95 after install and verify user 0 only; include user in diagnostics | 8 | Device policy or OEM behavior may recreate clones; verify after updates |
| Competing teaching sessions stop/upload the wrong session | Lost or cross-contaminated lessons | Lock active session ownership, guard start/stop/drain, use batch upload and post-stop verification | 8 | Process death/restart recovery needs additional durable-session tests |
| Stale or wrong database is inspected | False diagnosis or wrong fix | Query configured remote DB and local SQLite separately; record source, timestamp, procedure ID, and action order | 8 | Environment credentials/network can be unavailable; report source uncertainty explicitly |
| App or procedure is silently substituted | User cannot debug or trust replay | Exact procedure selection only; reject missing/unstable selectors; never fallback to a “better” procedure | 9 | Intent matching upstream can still select incorrectly; display selected ID and app |
| Accessibility permission is abused or misunderstood | Broad screen-data exposure | Consent-gated onboarding, visible permission state, least-privilege capture, no screenshots/password storage | 7 | Android AccessibilityService is inherently powerful; provide disable/revoke guidance |
| Overlay permission enables deceptive UI | Phishing or clickjacking concern | Visible AI-OS identity, minimal bubble, overlay suspension during replay, explicit permission explanation | 6 | A compromised app with overlay permission can imitate UI; platform permission remains broad |
| Malicious or compromised installed app manipulates accessibility state | Unsafe actions or screen spoofing | Verify package/root surface, require semantic evidence, abort on unexpected windows, never trust app text as policy | 6 | Android cannot guarantee truthful third-party accessibility trees |
| Network/backend unavailable or compromised | Failed teaching, stale data, data exposure | Fail closed for remote writes, TLS/deployment controls, bounded local behavior, no secret in client logs | 7 | Availability remains dependent on backend and device network |
| API/tool authorization is bypassed | Unauthorized side effects | Server-side authorization, confirmation gates, typed tool schemas, audit events, deny-by-default dangerous operations | 7 | Full production auth and multi-tenant controls remain deployment work |
| Dependency or APK supply-chain compromise | Code execution or data theft | Pin/lock dependencies, review diffs, verify build provenance/signatures, avoid arbitrary runtime downloads | 6 | Current local workflow does not yet provide reproducible signed releases |
| Build/install targets the wrong Android user | User sees stale or conflicting behavior | Verify APK path/package, install result, `dumpsys package`, and user 95 cleanup after every mobile build | 8 | OEM package state can change outside the script |
| Device is lost, rooted, or backed up insecurely | Local procedures/tokens exposed | Android Keystore/encrypted stores, minimal local data, remote token revocation, device lock/MDM policy | 6 | Rooted devices and physical compromise cannot be fully neutralized by the app |
| Replay loops, repeats, or consumes resources | Battery/availability denial of service | Replay cooldown, in-progress lock, action/time budgets, checkpoint progress, abort on no progress | 8 | Complex apps can appear unchanged while loading; tune budgets with telemetry |
| User complaint is dismissed as “the lesson is bad” without evidence | Trust loss and repeated regressions | Inspect logcat, remote DB, local DB, procedure order, and installed APK; record evidence and failed commands in docs | 9 | Tooling access can still be blocked; report what was not observable |

## Required Response To New Reports

1. Preserve the exact user-visible symptom and timestamp.
2. Identify whether the report concerns capture, storage, selection, replay, permissions, privacy, or tooling.
3. Inspect both the configured database and device logs where applicable; do not rely on stale local SQLite or old logcat alone.
4. Record the procedure/session ID, target package, ordered actions, root surface, front windows, and failure reason.
5. Add the issue and countermeasure here, including a provisional rating and residual risk.
6. Implement the narrowest safe fix while preserving waits, retries, validation, fallbacks, cleanup, metadata, and logging.
7. Build/install after mobile changes, remove user 95, verify the installed package, and record command or sandbox failures.
8. Re-rate the countermeasure after real-device verification. Never claim a threat is neutralized solely because a unit test passed.

## Open Security Work

- Production authentication, authorization, tenant isolation, and audit retention.
- Automated redaction tests for accessibility labels, logs, backend payloads, and error messages.
- Threat-model and red-team tests for prompt injection through app UI, notifications, and procedures.
- Checkpoint-aware planner recovery with typed actions, confidence thresholds, and resume limits.
- Reproducible signed release builds and dependency/SBOM verification.
- User-facing data export, deletion, retention, and permission-revocation workflows.
