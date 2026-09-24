---
version: alpha
name: AI-OS
description: Dark, one-handed, intent-first Android launcher and assistant. Read at the top, touch at the bottom.
colors:
  primary: "#4f7cf6"
  secondary: "#8b5cf6"
  neutral: "#080b14"
  surface: "#0f1524"
  surface-alt: "#131a2c"
  code-bg: "#05070e"
  border: "#1e2740"
  border-strong: "#2c3860"
  text-primary: "#eef2fb"
  text-secondary: "#9aa4bd"
  text-muted: "#5e6885"
  on-primary: "#ffffff"
  danger: "#f4736a"
  danger-text: "#f9a49d"
  danger-bg: "#20121a"
  positive: "#5fd1a0"
  positive-bg: "#0d2222"
  info: "#6ea8fe"
  info-bg: "#0e1c30"
typography:
  headline-lg:
    fontFamily: System
    fontSize: 24px
    fontWeight: 900
    lineHeight: 1.2
  headline-md:
    fontFamily: System
    fontSize: 18px
    fontWeight: 800
    lineHeight: 1.3
  body-md:
    fontFamily: System
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.4
  body-sm:
    fontFamily: System
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: System
    fontSize: 12px
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: 0.08em
rounded:
  sm: 10px
  md: 14px
  lg: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  gutter: 16px
  touch-min: 48px
components:
  ask-bar:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.full}"
    height: 52px
    padding: 12px
  ask-bar-mic:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: 46px
  screen:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-primary}"
  notice-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.sm}"
    padding: 10px
  notice-positive:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive}"
    rounded: "{rounded.sm}"
    padding: 10px
  notice-info:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.info}"
    rounded: "{rounded.sm}"
    padding: 10px
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: 12px
  tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 56px
    padding: 12px
  tile-selected:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-primary}"
  chip:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    height: 40px
    padding: 12px
  social-app:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    size: 44px
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: 16px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 16px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 48px
    padding: 16px
---

# AI-OS design

## Overview

AI-OS is an intent layer for Android: the user states an outcome and the AI orchestrates apps behind it. The interface should feel calm, quick and one-handed: a near-black canvas, restrained blue-to-purple accents that mark AI presence and the main action, and very little chrome. It is a launcher first, not a chat window, so the home screen leads with recognizable actions (tiles, suggestions, today) and keeps free-form text and voice one thumb-tap away.

The governing rule is read at the top, touch at the bottom. Glanceable, read-only content sits in the upper part of the screen; everything the user taps, types or speaks sits in the lower half within thumb reach. These tokens are the values already in `src/theme.ts`; keep the two in sync.

## Colors

- **Primary (#4f7cf6):** the blue that marks the main action and AI presence (sparkle, mic, selected state). At most one filled primary action per view.
- **Secondary (#8b5cf6):** the purple end of the brand gradient. Only used together with primary as the gradient on buttons and the brand mark.
- **Neutral (#080b14):** the app background. Surfaces step up from it: `surface` (#0f1524) for cards and sheets, `surface-alt` (#131a2c) for inputs and nested boxes, `code-bg` (#05070e) for monospace result blocks.
- **Text:** `text-primary` (#eef2fb) for content, `text-secondary` (#9aa4bd) for supporting text, `text-muted` (#5e6885) only for placeholders and inactive labels.
- **Status:** `danger`, `positive` and `info` each come with a text and a background tint. Use them for meaning (error, success, informational), never decoration.

Measured contrast: primary text 16 to 17:1 and secondary text 7 to 8:1 on the dark surfaces, so both are safe. `text-muted` is only 3.1 to 3.6:1, so it fails WCAG AA for normal text. White on `primary` is 3.79:1, which also misses 4.5:1 for small text, so labels on primary buttons should be bold and at least 18px, or the primary should be darkened.

## Typography

The system font (Roboto on Android) at a small set of sizes and only heavy weights for emphasis. Headings are very heavy (800 to 900) and tight; body is regular. Labels are small, heavy, uppercase-friendly with generous letter spacing and are used for section headers.

- **Headline:** greeting and wordmark (`headline-lg`), card and sheet titles (`headline-md`).
- **Body:** content at 15px (`body-md`), supporting text at 13px (`body-sm`). Nothing below 12px.
- **Label:** section headers such as "Today" (`label-md`).

## Layout

One-handed use drives the layout.

- Divide the screen into three zones: a read-only zone at the top (about the top third), a stretch zone in the middle, and an easy-reach zone at the bottom half. Put the ask bar, suggestion chips, tiles and the social strip in the bottom half; the ask bar is the lowest element, just above the system gesture area.
- Every tappable target is at least 48px by 48px (`touch-min`) with at least 8px between neighbors. Where a control looks smaller, extend its hit area (for example `hitSlop`) to 48px.
- Horizontal gutter is 16px. The spacing scale is 4, 8, 12, 16, 24.
- Respect system insets: keep the ask bar clear of the gesture bar with `useSafeAreaInsets`.
- A left-handed setting mirrors thumb-operated controls (mic, send) to the left. Do not rely on a single side.
- Prefer sheets that rise from the bottom over new screens; the composer stays in the same place when the ask bar expands into chat.

## Elevation & Depth

Flat and tonal. Depth comes from stepping the surface color (`neutral` to `surface` to `surface-alt`) and 1px borders (`border`, `border-strong`), not shadows. The only floating layer is the bottom sheet, which uses a scrim behind it. Avoid more than one floating layer at a time.

## Shapes

Soft, rounded shapes: 10px for buttons and inputs, 14px for cards and tiles, 24px for the top corners of sheets, fully round for the ask bar, chips, mic and app icons. Do not mix sharp and rounded corners in one view.

## Components

- **Ask bar:** fully rounded, 52px tall, docked at the bottom. Sparkle at the start, placeholder "Ask or say anything", round mic button at the thumb side. Tapping it raises the chat sheet whose composer occupies the same position.
- **Tile:** icon plus a title and one line of supporting text, at least 56px tall. A selected tile gets a primary border. A sparkle marks anything the AI chose or learned.
- **Chip:** suggestion or tuner, fully rounded, 40px tall, hit area 48px. Horizontally scrollable; a partly visible last chip hints at swiping.
- **Social app:** round icon with the app's initials and its name below; the whole cell is the target.
- **Sheet:** rises from the bottom over a scrim, rounded top corners, drag handle, stays mounted after first open so an in-flight task is not lost.
- **Card:** grouped content, `surface` background, 1px border. Rows inside are at least 48px.
- **Primary button:** brand gradient, 48px tall. One per view.

## Do's and Don'ts

- Do put every tapped control in the lower half and read-only content at the top.
- Do keep targets at least 48px and gaps at least 8px.
- Do show why the AI chose something: a short reason line and a sparkle that opens an explanation.
- Do ask before spending or sending; reads run automatically, reversible actions need one tap.
- Do keep learned preferences visible and editable.
- Don't lead with a blank text box alone; pair text and voice with tiles and suggestions.
- Don't use `text-muted` for anything the user must read, and don't put small white text on the primary blue.
- Don't use more than one filled primary button per view.
- Don't use emoji or an icon font. Icons are drawn from Views so they take one theme color.
- Don't add drop shadows; use surface steps and borders.
