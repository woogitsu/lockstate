# Layout menu Escape preserves the armed placement tool

Measured in an isolated worktree based on `4ceb0f1150`, using the production
composition root at 1920 × 1080 and 200% interface scale.

## Reproduction and cause

Create a prison, pause, select Build, arm placement, open the Layout menu,
focus Reset layout and press Escape. The menu closes and returns focus to its
trigger, but the same key bubbles to the renderer's window listener and
cancels placement. The button changes from “Stop placing” to “Place on map”.
This occurred in both the standard and angled views. A player opening settings
while building loses the selected tool without asking to end construction.

The menu's `keydown` listener called `preventDefault`, which suppresses a
browser default action but does not stop event propagation. The scoped fix
stops propagation only for Escape while the menu is open. A second Escape
after closure still reaches the world and cancels placement normally.

## Browser evidence

`tests/browser/hud-layout-menu-fullhd.spec.ts` uses actual buttons and keyboard
events, verifies menu closure and focus return, then verifies both preservation
of the armed tool and cancellation by the subsequent world Escape.

- Unchanged production: both cases failed; expected “Stop placing”, received
  “Place on map” (15.6 s standard, 15.5 s angled).
- Fixed production: 2 passed (17.7 s overall).
- Deliberately removing the new `stopPropagation` call: angled case failed
  with the same observed tool cancellation (16.2 s); no network-change retry
  signature was present.
- Exact restoration: both cases passed again (17.3 s overall; 5.6 s standard,
  6.2 s angled).

An earlier suspected Layout-menu overflow was disproved: unchanged production
passed viewport and final-action hit tests in English and Polish at this same
resolution and scale. No layout sizing change was made.

## Scope and delivery boundary

Only the Layout menu's consumed Escape changes. Rendering, camera behavior,
art, simulation, persistence and player wording are untouched. This is local
browser acceptance, not a claim of successful exact-head CI, merging,
staging deployment or production verification.
