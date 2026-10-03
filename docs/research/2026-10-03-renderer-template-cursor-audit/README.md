# Renderer replacement loses the armed plan's stationary map hover

2026-10-03. Base `975520efc09accf8d2af4a6ceeb9d2f52c973669`. The scoped main/bridge
physical-hover handoff is implemented and source-verified. Native keyboard View
acceptance remains queued with ROOT; no browser or server was launched here.
Scene/protocol/save/art and the accepted fit policy are unchanged.

The original diagnostic below is retained: it preceded the granted production
lease and was published in `9643890ef5bd476a3388cd86fc7d6cc58b78fa5f`.

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
At the original diagnostic checkpoint, no production mutation had been made
under ROOT's integration lease. The then-pending narrow proposal retained only a genuine physical canvas point across bridge
replacement, clear it on actual UI movement and recompute using the current
camera; it must never copy old world origin, fit lock, verdict or cost. Source
lease/implementation and production-negative/byte-restore proof were pending
at that diagnostic checkpoint; the completed source work is recorded below.

## Implemented handoff and source acceptance

`main.ts` observes genuine pointer movement in window capture phase, before the
armed bridge consumes canvas events. It retains only physical clientX/clientY
when the actual event target is the canvas. Movement over UI clears the memory,
including the interval when neither old nor new bridge is installed. Window blur
also clears that host memory. The callback is installed once with the main
application, rather than once for each renderer replacement.

The new bridge accepts this optional physical point only within the current
nonempty canvas bounds, converts it using the current bounding rectangle and
logical canvas dimensions, then uses its own actual picker/fit/tool/worker ports.
It never copies old origin, fit lock, selection, verdict, quote or preflight.
A stationary first click submits the freshly chosen current origin normally.

The expanded actual-source suite has20 cases: the four original stationary
cases now include fresh requests and exact command-origin checks; four physical
movement controls; four genuine old out-of-bounds worker refusals followed by a
new legal renderer preview; four UI-movement-during-withdrawal invalidations;
and four changed-canvas-offset/CSS-ratio controls. Independent affine inversion
or explicit yaw/elevation inversion checks the new ground origin before fitting.
Changed CSS ratio is a canvas-transform control, **not a claim of UI200% coverage**.

Obtained raw receipts, all with maxWorkers2:

- Original exact production bytes, expanded suite:12 RED /8 controls GREEN.
- Fixed production:20 GREEN.
- Main producer `initialCanvasHover: canvasHover`?undefined:12 RED /8 GREEN.
- Byte-exact restoration:20 GREEN.
- Main producer UI branch retaining the old point instead of clearing it:
  4 RED /16 GREEN, specifically all genuine UI-movement controls.
- Final byte-exact restoration:20 GREEN; SHA256 receipts in
  `producer-restoration.json` cover both production files.
- Focused tool-bridge/fit/live-renderer neighbors plus the new suite:43 GREEN.
- Strict standalone TypeScript:exit0.
- App/tools TypeScript and complete production build:exit0.

The old real read-only reply never revives removed DOM or stands down the
still-armed tool. The source suite also obtains a real clear or refused worker
reply rather than constructing the expected verdict in the harness.

Native acceptance is pending. Source evidence establishes the missing handoff
and guards its production implementation; it does not establish physical View
keyboard selection, actual FullHD HUD safe-fit or browser pixels. ROOT will run
a dedicated four-case fixture against the built client and preserve any setup
or acceptance failure before attributing it to production.

## Dedicated native fixture, prepared only

`tests/browser/room-template-renderer-stationary-hover.spec.ts` collects exactly
four cases: World?Angled and Angled?World, quarter-turn1 Basic cell with mirror
off/on, physical1920?1080 and explicit accessibility UI100%. Strict fixture
TypeScript and offline Playwright collection exit0. No browser/server launched.
UI200% remains outside this prepared four-case native acceptance.

The fixture starts the genuine game/New prison/Pause and uses actual catalogue
buttons, native rotation/checkbox keyboard input, a physically hit-tested canvas
hover, and native View Home/End. A passive Worker observer delays exactly the
first actual nonzero-origin map-preflight **reply**, forwards its exact bytes
later, and observes actual fresh preflight/cost/command receipts. Simulation is
not mocked and no command/verdict/ghost/camera state is injected. Physical pointer
move capture checks trusted canvas coordinates and unchanged move count across
replacement and old reply release. Fresh clear28-polygon preview/worker quote
must precede release; afterward its full quoted status remains unchanged and a
physical down/up, with no new move, submits exactly one current fresh-origin
rotated/mirrored command, receives `queued`, and stands down.

The chosen880,380 cursor is an existing UI100% fixture point, with a required
actual canvas hit precondition. Its legal q1 footprint and actual native initial
preflight are asserted rather than assumed to have passed. ROOT must preserve
any setup/preflight failure and calibrate only from actual evidence. The
independent source transform/origin controls above are separate from this native
receipt/cursor proof; this spec does not invent a second camera oracle from SVG.

Research-index integration and canonical artifact routing belong to ROOT's
integration checkpoint. Current source correction is
`eaea1b8bfec19390b6b60b3f3a6b1ad490368f9b`; Issue1923 extension is
https://github.com/woogitsu/lockstate/issues/1923#issuecomment-5965013048.
