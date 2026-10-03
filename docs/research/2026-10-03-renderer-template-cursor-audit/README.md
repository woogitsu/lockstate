# Renderer replacement loses the armed plan's stationary map hover

2026-10-03. Base `975520efc09accf8d2af4a6ceeb9d2f52c973669`. Diagnostic only;
no production modification, browser, server or new UX rule. Scene/main sources
remain owned by ROOT. Original production source still fails the new test.

## Actual source reproduction

`tests/unit/ui-renderer-template-stationary-hover.test.ts` executes the complete
current `main.ts` ghost-install block and its unique `changed` callback extracted
from the real source bytes. It uses actual `LiveRendererSelection`, real
`WorldScene`/`ObliqueWorldScene` instances, real Phaser Camera preRender/inverse,
the actual angled projection, actual tool/bridge/fit classes and real production
preflight/quote ports. DOM/display activation is Node plumbing; a native pointer,
HUD layout and browser pixels are **not** claimed.

The worker side is the real `SimulationWorkerStateMachine`, initialized from a
genuine new-session snapshot. Its genuine correlated preflight projection is
held across replacement, then forwarded unchanged to the normal requester.
The real cost projection is forwarded normally. A real consistency snapshot
baselines the actual command sender, as the running game's feed does.

World starts at zoom1.25 with the real matrix. Angled starts at yaw35°, elevation65°,
zoom1.4. Both use a1920×1080 logical viewport and the same logical centre. The
tool selects quarter-turn1 Basic cell, with mirror off/on, before one canvas
hover. The initial actual worker reply is clear; the current bridge shows all28
squares. The renderer switches, disposes the old bridge and installs the new
bridge over the same canvas. The genuine old response is released afterward.

**Obtained:4 RED /4 legal controls GREEN.** All four stationary cases fail at
`newGhost.hidden`: actual `true`, expected `false`. Both directions fail for the
rotated and rotated+mirrored plan. The old reply does not revive removed DOM or
cancel the tool; current selection remains armed. The new bridge has no plan,
origin or mapHover from which its next paint could request a fresh preview.

The four legal controls make a2px physical pointer movement only after the same
replacement/held reply. The new actual preflight becomes clear, all28 polygons
appear, and pointerdown/up sends exactly one real `PlaceRoomTemplate` command
with the selected quarter-turn/mirror. The tool stands down normally. This
distinguishes lost hover from broken worker, transform, plan or command plumbing.

## Cause and existing acceptance gap

`main.ts` withdraws the old bridge on deactivation and unconditionally constructs
a fresh one on `changed`. `room-template-world-bridge.ts` keeps genuine mapHover
inside that instance. No current physical map point reaches the replacement.
Late-preview guards are working; the failure is the missing cursor continuity.

Existing `room-template-renderer-preflight-receipt.spec.ts` moves the native mouse
by2px after replacement/receipt before checking its new ghost. That previously
accepted proof therefore does not cover a still-armed plan under an unchanged
physical map cursor. Existing camera inverse/forward and stale-result guards
are not regressed or duplicated by this finding.

## Fresh deduplication

`fresh-search-receipt.json` records current open/all-state searches. Complete
fresh bodies/comments for1923,1951 and1908 are retained separately.

- [#1923](https://github.com/woogitsu/lockstate/issues/1923) fixed retaining a
  genuine canvas hover across keyboard selection/rearming within one bridge.
  This remaining renderer-disposal boundary belongs to the same retained-hover
  family; extend its evidence rather than open a duplicate general hover issue.
- [#1951](https://github.com/woogitsu/lockstate/issues/1951) requires the current
  ghost route to follow live replacement; its completed native evidence proves
  unsaved prison/session continuity, not unchanged map hover while armed.
- [#1908](https://github.com/woogitsu/lockstate/issues/1908) already fixes accepted
  placement ownership after old-bridge disposal. That guard is unchanged and
  correctly retains this still-armed tool when only a read-only reply arrives.

## Receipts and preparation limits

- `actual-source-baseline-4red-4controls.log`:4 original-source failures,4 legal
  controls passing at maxWorkers2. This is not a native run or synthetic verdict.
- `strict-diagnostic-types.log`: strict diagnostic TypeScript exit0.
- Initial setup runs were8 failures: Node EventTarget boolean-capture removal
  did not model browser removal; later the async control painted before the
  nested actual port promise settled; then the command sender lacked its normal
  genuine consistency snapshot. Each plumbing error was corrected without
  altering production or the stationary/command expectations. Only the final
  four failures are attributed to the source defect.

This bounded reproduction does not prove failure with a native keyboard View
selection or full HUD fit at100/200% scale. Those remain ROOT's browser queue.
No production mutation was made under ROOT's integration lease. A narrow fix
proposal may retain only a genuine physical canvas point across bridge
replacement, clear it on actual UI movement and recompute using the current
camera; it must never copy old world origin, fit lock, verdict or cost. Source
lease/implementation and production-negative/byte-restore proof are pending.
