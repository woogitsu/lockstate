# Layout Escape preserves an armed room plan

Measured on the integrated `b51831047a` base in an isolated UI worktree,
at 1920 × 1080 and 200% interface scale, in both standard and angled views.

## Reproduction and event ownership

Create a prison, pause, open Build and Room plans, then press Place on map.
Move onto the map and verify the complete 28-square basic-cell preview.
Open Layout, focus Reset layout and press Escape. The menu closes and returns
focus to its trigger. Returning the pointer to the map nevertheless shows no
plan: the same Escape has disarmed the room-template tool.

The existing menu handler already calls preventDefault and stopPropagation.
The distinct room-template overlay listener was installed on window in the
capture phase, which runs before that focused menu can consume the key.
The scoped fix moves cancellation to the bubbling phase, respects
defaultPrevented and removes the listener in the matching phase on disposal.
An unconsumed world Escape still cancels the armed plan.

## Evidence obtained

- New consumed-Escape unit case on unchanged production: 1 failed, 10 passed.
- Actual application browser baseline: both cases failed precisely at the
  preview being hidden after menu-owned Escape (18.1s standard / 17.1s angled).
  Initial preview, menu closure and focus-return assertions had passed.
- Fixed production module: 11/11 world-bridge units and 2/2 browser cases green
  (18.2s overall, 6.0s / 6.4s).
- Deliberately restoring window capture and removing the defaultPrevented
  guard made the new unit case and both browser cases red again
  (15.9s / 15.7s). There was no network-change retry signature.
- Exact source restoration, checked by matching SHA-256 before and after the
  mutation, returned 11/11 units and 2/2 browser cases green
  (19.2s overall, 6.1s / 6.7s).
- Both TypeScript projects and the named production build passed.

The browser test uses actual buttons, keyboard input and map pointer movement.
It proves the preview survives menu closure, the subsequent Escape removes it
even after fresh movement and no PlaceRoomTemplate command was submitted.
Screenshots capture the retained preview before the second Escape. Browser
execution uses the repository browser server and actual application entry.
No test timeout was increased.

## Scope and delivery boundary

Only room-template overlay keyboard event ownership changes. Gameplay,
geometry, renderer, camera, art, persistence and player strings are untouched.
These are local regression results; full CI, merging and deployed production
verification belong to integration and are not claimed here.
