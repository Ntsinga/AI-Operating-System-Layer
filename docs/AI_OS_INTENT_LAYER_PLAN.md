# AI-OS Intent Layer Plan

Status: draft v1, 2026-09-21. Extends Phase 6 (AI Launcher) of [AI_OS_ORCHESTRATOR_PLAN.md](AI_OS_ORCHESTRATOR_PLAN.md).
UI rules and design tokens live in [../mobile/DESIGN.md](../mobile/DESIGN.md).

## 1. Vision

The phone becomes an intent layer instead of an app grid. The user states an outcome ("order a ride", "what matters in my inbox", "laptops for 1.2m") and the AI orchestrates the steps. Installed apps (SafeBoda, Faras, Uber, Gmail, Instagram) stop being destinations and become interchangeable providers behind capabilities. The AI is not a floating add-on: it is the surface the user lands on and the coordinator behind it. The long-term goal is AI integrated with the operating system at the user level (how people interact day to day), not only at code level.

The launcher (home screen) is only the surface. The AI is the orchestration layer.

## 2. Principles

Distilled from the design research below and the decisions taken so far.

1. Read at the top, touch at the bottom. Most people use a phone one-handed with a thumb, so the ask bar and primary actions live in the lower half.
2. Never a blank box alone. Many people struggle to articulate intent in writing, so text and voice are paired with tiles and suggestion chips (recognition over recall).
3. Intents call capabilities, not apps. Apps plug in as swappable providers.
4. Earn autonomy. Reads run automatically, reversible actions need one tap, spending or sending needs an explicit confirmation. Auto-booking is opt-in, under a spend cap, after a default exists.
5. Show why. Every AI choice carries a reason line and a "Why this?" entry point. Learned preferences are visible and editable, never a hidden model.
6. Learn cautiously. Propose a default after a clear pattern; never silently switch.
7. Fail safely. When driving a third-party app, abort rather than guess.

## 3. Architecture

| Layer | Job | Exists today | New |
|---|---|---|---|
| Surface (launcher) | Ask bar (text and voice), intent tiles and cards, app drawer one swipe away | GPT-Live-1 voice, `get_installed_apps`, `open_application` | Home screen, chat sheet (step 1) |
| Orchestrator | Utterance to typed intent with slots, risk tier and a fulfilment chain | LangGraph planner (`backend/app/graph.py`), tool registry | Intent registry, slot-filling, confirmation tiers |
| Capabilities and providers | A capability contract (`quote`, `book`, `status`, `cancel`) with one adapter per app | Teach and replay (Uber lessons), deep-link tools | Adapter interface, provider selection |
| Fulfilment ladder | Cheapest reliable route first: API or deep link, then learned replay, then vision recovery, then ask the user | Replay and `replay_recovery.py` | Completion checks |
| Context | One event store from Gmail, SMS, calendar, location, notifications | Gmail, SMS, calendar tools, Neon DB | Notification listener, unified ledger |
| Policy | Confirmation tiers, audit log, reversible rules | Focus and device-policy tools | Preferences store |

## 4. Flagship intents

| Intent | Flow | Have | Missing |
|---|---|---|---|
| Ride | Slots: pickup (default is current location), destination, provider. Show price and ETA, confirm, book, track. | Uber teaching and replay, `get_current_location`, `navigate_maps` | Provider selection and scoring, deep-link or API check for SafeBoda and Faras, completion check, ride status from notifications |
| Inbox | Home card of the top emails ranked by importance, one-tap draft reply, confirm before sending | `search_gmail`, `read_gmail_message`, `create_gmail_draft` | Ranking (Gmail `is:important` as v0, then LLM score plus sender, thread and calendar signals, then learning from corrections), incremental sync |
| Money | Email, SMS and receipts feed one ledger, reconcile duplicates, split company and personal, income and expense breakdown, profit view | `expenses.py`, `sms_finances.py`, `subscriptions.py`, `receipt.py`, `ExpenseStoreModule`, dashboard card | Normalized transaction model, cross-source matching, company/personal rules with correction learning, income side |
| Shopping | "Laptop options for 1.2m": search, rank by budget, specs, seller and distance, show in the AI-OS browser | `search_web`, `get_current_location`, `open_url_in_aios_browser` | Listing extraction and ranking. Instagram has no open search API, so v0 uses web search across Instagram and local marketplaces; an in-app Instagram adapter (replay) comes later. Currency is assumed to be UGX. |

## 5. Provider dispatch and preference learning

### Dispatch modes

| Mode | How it works | Trade-off | Verdict |
|---|---|---|---|
| Quote-and-pick | Read price and ETA from each app in turn, then book the best | Slower start; UI automation drives one foreground app at a time | Default |
| Book-and-failover | Book the best match; if no driver accepts within N seconds, cancel and try the next | Occasional cancel | Fallback |
| Race both | Request several at once, keep the first acceptance, cancel the rest | Not possible via UI automation on one screen; cancellation fees, driver friction, account flags | Only if a provider offers API access |

If a provider works on driver offers, the AI watches them and accepts the first that meets the user's rule (price, ETA, rating thresholds). If it auto-assigns, the AI monitors.

### Learning a preferred provider

1. Log every choice: route, time, options shown with price and ETA, the pick, and the outcome.
2. Score providers: recency-weighted affinity blended with live price and ETA.
3. After a clear pattern (for example the same provider in 3 of the last 5 picks), ask once: "Make SafeBoda your default ride?" with Yes, Not now and Never ask, plus a cooldown.
4. Once a default exists, the tile shows its name and books in one tap; the AI still flags a real gap ("Faras is 30% cheaper right now").
5. Everything learned lives in a visible "What AI-OS has learned" screen where it can be changed or deleted.

## 6. Launcher v0: the Home screen

Zones follow one-handed reach: read-only content at the top, everything touched at the bottom.

```text
+-----------------------------+
| AI  Good evening, Elijah  E |  read-only header, avatar opens Settings
| Today                       |  glanceable calendar card
|  - event / reminder rows    |
|                             |
| [Take selfie ] [Order ride ]|  tiles, 2 x 2
| [Open social ] [Study exam ]|
| (IG) (TT) (WA) (X) (FB)...  |  social strip, swipe
| [Order a SafeBoda] [Lap...  |  suggestion chips
| ( Ask or say anything  (o) )|  ask bar, docked above the gesture area
+-----------------------------+
```

Decisions (confirmed 2026-09-21):

- Chat is folded into the ask bar. Tapping it raises a chat sheet from the bottom; there is no separate Chat tab and no bottom navigation. The sheet's composer sits at the same place as the ask bar.
- Settings opens from the avatar at the top right, since it is rarely used.
- A left-handed setting mirrors the mic and send buttons to the left.
- The Order a ride tile shows the default provider's name ("Usual: SafeBoda").
- Sparkle marks anything the AI chose or learned.
- Whole tiles and chips are the hit target, at least 48dp.

### Step 1 scope (built first)

- Home screen, ask bar, suggestion chips, social strip built from installed apps, chat sheet, left-handed setting.
- Take selfie: new front-camera capture path reusing the in-app CameraX activity (3 second countdown).
- Order a ride: opens a detected ride app (SafeBoda, Faras, Uber, Bolt), records each pick, and offers a default after a pattern. This is a first slice of preference learning, not provider dispatch.
- Open social: strip of installed social apps from a curated list.
- Study for exam: hands a study-planning request to the existing planner. The dedicated study flow is a later step.
- Today card: upcoming calendar events, requested on first tap so the calendar permission prompt is intentional.
- Preferences persist in a small native SharedPreferences module (`AiosPrefs`).
- The existing Hey Casper voice activation keeps auto-resuming when the app comes to the foreground (that logic used to live in the Chat tab).
- Not in step 1: HOME intent filter, bubble removal, task list, provider dispatch.

### Step 1 status (2026-09-21)

Written, not yet run on a device:

- `mobile/src/screens/HomeScreen.tsx`, `mobile/src/components/ChatSheet.tsx` (chat sheet), `WorkflowCard.tsx` reworked to a docked composer, `HandednessCard.tsx` (left-handed setting), `HomeIcons.tsx`, `mobile/src/home/rideProviders.ts` and `socialApps.ts`, `mobile/src/native/Prefs.ts` and `assistantResume.ts`.
- Native: `PrefsModule.kt` (`AiosPrefs`), `MediaCaptureModule.takeSelfie` plus a front-camera option in `InAppCaptureActivity`.
- `App.tsx` no longer has tab navigation: Home is the root, Chat is the sheet, Settings opens from the Home header. `BottomNav.tsx` and `ChatScreen.tsx` were removed.

Checked: `npx tsc --noEmit` passes; `:app:compileDebugKotlin` builds successfully (`--offline`) and Metro bundles the JS (643 modules); `mobile/DESIGN.md` lints with 0 errors (the warnings are the documented white-on-blue contrast gap and unreferenced tokens).

Not checked (no device was connected):

- The docked composer and keyboard behavior under edge-to-edge, and the sheet animation.
- The front camera, the ride default prompt, and preference persistence across restarts.
- That "Hey Casper" still resumes on foreground now that `App.tsx` calls `resumeAssistantIfPermitted()` instead of the Chat tab's card.

The native changes need a rebuild and install. Until then, Take selfie shows an "install the latest build" message and preferences fall back to memory.

Known follow-ups: real app icons in the social strip (needs a native icon lookup), readable result cards in the chat instead of raw step JSON, the L5 bubble retirement, and a pointer to DESIGN.md from `mobile/CLAUDE.md`.

## 7. Roadmap

Launcher track:

| Step | Scope |
|---|---|
| L1 | Home screen (above) |
| L2 | Today card with a task list ("Finish report") beside calendar events |
| L3 | Shopping intent: search, rank, show in the AI-OS browser |
| L4 | Study flow: gather materials from Drive and Gmail, draft a plan, book study blocks, optional focus policy |
| L5 | Real Home: add the HOME intent filter, retire the persistent bubble, keep only a transient automation-status surface |

Intelligence track:

| Step | Scope |
|---|---|
| I1 | Intent registry, capability contracts, provider adapters, preferences store |
| I2 | Money: ledger, reconciliation, company/personal split, profit card |
| I3 | Inbox: ranking, card, draft-and-confirm replies |
| I4 | Ride adapters for SafeBoda and Faras. Spike first: check for deep links or partner APIs before investing in replay. |
| I5 | Ambient: notification listener, default assistant role, policy integration (for example hiding apps until a goal is met) |

Money and Inbox come before Ride because they are mostly data and LLM work on pieces that already exist, and they show value on the home screen quickly. Ride depends on cross-app replay, which is still being stabilized.

## 8. Risks and spikes

- Home-button latency: a React Native cold start on every home press could feel slow. Keep the process warm and measure; fall back to a native shell if needed. Applies at L5.
- Third-party UI drift breaks replay. The fulfilment ladder plus safe abort covers this.
- Privacy: email and SMS content reaches LLM providers. Redact before sending, route per task through `llm.py`, keep retention minimal.
- Distribution: `READ_SMS`, accessibility, notification access and overlay are restricted on Google Play. This plan targets a personal, sideloaded build.
- A broken launcher is a broken phone: keep a one-tap route back to the stock home and add a crash-loop guard (L5).
- "Apps as APIs" feel: while an adapter drives another app, that app takes the screen for a few seconds. Hiding it behind an AI-OS working screen may hit Android's obscured-touch rules; `TYPE_ACCESSIBILITY_OVERLAY` is the likely route. Needs a spike on the device.
- Keyboard handling for the docked composer under edge-to-edge is unverified on a device.
- Contrast: the existing `textMuted` and white-on-accent colors are below WCAG AA for small text (see DESIGN.md).

## 9. Design research summary

Reach and ergonomics:

- Hoober (2013, 1,333 observations): 49% one-handed, 36% cradled, 15% two-handed; the thumb did most of the tapping. Phones were much smaller then, so reach is likely a larger problem now. He warns that people shift grips, so test across all three.
- One-handed users were 67% right thumb and 33% left, hence the left-handed setting.
- Samsung One UI splits the screen into a viewing area (top) and an interaction area (bottom); Google has tested a bottom Search bar. Touch targets: at least 48dp with 8dp gaps (Material), 44pt (Apple).

AI interaction:

- NN/g: AI is intent-based outcome specification, but the articulation barrier means a blank prompt box alone loses many users. Use hybrid UI (text and voice plus tiles, suggestions, presets).
- Microsoft HAX guidelines mapped onto this plan:

| Guideline | Where it lands |
|---|---|
| G7, G8 efficient invocation and dismissal | Ask bar always in reach; any suggestion can be swiped away |
| G9 efficient correction | "Change ride" and undo after the AI picks |
| G10 scope services when in doubt | Ask when unsure (currency, pickup) instead of guessing |
| G11 make clear why | Reason line and "Why this?" |
| G13, G14 learn from behavior, adapt cautiously | Default proposed after a pattern, never silently switched |
| G17 global controls | "What AI-OS has learned" screen, per-source permissions |

- Google People + AI Guidebook: mental models, explainability and trust, feedback and control, errors and graceful failure.
- Shape of AI pattern catalog: tiles are wayfinders, Cheaper/Closer chips are tuners, confirm and undo are governors, reason lines are trust builders, the sparkle is an identifier.

Design-system formats for AI agents: IBM Carbon (Carbon for AI plus Carbon MCP) and Google's open `DESIGN.md` format. AI-OS uses `DESIGN.md`.

Sources: [Hoober, UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php), [Smashing Magazine thumb zone](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/), [NN/g AI paradigm](https://www.nngroup.com/articles/ai-paradigm/), [NN/g articulation barrier](https://www.nngroup.com/articles/ai-articulation-barrier/), [Microsoft HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/), [People + AI Guidebook](https://medium.com/google-design/people-ai-guidebook-41ec2ee5ec3f), [Shape of AI](https://www.shapeof.ai/), [Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/), [DESIGN.md spec](https://github.com/google-labs-code/design.md).

## 10. Open questions

- Do SafeBoda or Faras expose deep links or partner APIs? Decides how much replay work I4 needs.
- Should learned preferences sync to the backend or stay on the device? Recommended: backend as source of truth for the money ledger, device as cache; preferences stay local until there is a reason to sync.
- Autonomy caps: what per-ride spend limit should unlock auto-booking?
