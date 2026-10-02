# Held construction footprint after registered yaw/tilt input

Date: 2026-10-03. Isolated baseline: published Laundry integration
`7b4cc4265010e313a7518d2d99ae30580b72eaca`.

## Result: current producer is correct in this scope

The durable adjustable-camera plan records ordinary construction preview
reprojection after camera changes and the separate owner-approved retained
room-template fit rule. This audit preserves both; it does not change the
template fit source, camera policy, copy, layout, artwork or world/save format.

The earlier 144-case pointer-transform matrix changes poses through the public
pose/fit ports before starting construction. It does not hold an existing
footprint through actual registered continuous yaw/tilt key handlers with a
stationary screen endpoint. The new regression covers that distinct path.

`tests/unit/oblique-held-footprint-pose-input.test.ts` instantiates the production
scene and keyboard adapter, executes their registered pointer and window-key
handlers plus `update`, and observes the actual construction target/place ports
and graphics polygon vertices. Only Phaser rendering/texture plumbing is
stubbed. Independent projection/inverse equations predict ground coordinates
and every painted corner; the test does not choose a point through the
production inverse and then assert its own roundtrip.

The 32 cases cross:

- Q/E yaw and R/F elevation in both directions;
- default bindings and the actual settings-loaded remap to KeyJ;
- held whole-square wall run, room area, 1x2 object and rotated 2x1 footprint.

All cases check the exact angle change, including the existing lower elevation
clamp, the original pressed world square, the stationary endpoint's current
ground origin, full footprint polygon corners, no placement before release,
stopped camera movement after keyup, and the matching place-port payload on
release. They use a logical 1920x1080 viewport; this is not a native screenshot
or a browser worker-command claim.

## Obtained evidence

| Stage | Actual result | Preserved output |
| --- | --- | --- |
| Unchanged production | 32/32 green,812ms | [baseline](registered-baseline-green.log) |
| Remove only held endpoint reprojection | 30 red /2 green,916ms | [producer negative](registered-producer-reprojection-removal-red.log) |
| Byte-exact original source restoration | 32/32 green,877ms | [restored](registered-byte-restored-green.log) |
| Related pose-control/projection scope | 43/43 green,813ms | [scoped controls](scoped-related-green.log) |
| App/tools TypeScript | exit0 | [typecheck](typecheck-green.log) |

The real negative removes exactly one block inside `paintGesturePreview`:
updating `gesture.current` from `hoveredScreenPoint` and the current camera pose.
A unique byte-pattern match is required before writing. A `finally` block
restores the complete original source bytes before any restored run. Original
and restored SHA256:
`d461926ee16903ca9b430dd08f6cb649b55801cc4472449b22ecf7b51227949e`.
No production diff remains. Every Vitest invocation uses `--maxWorkers=2`.

The two surviving negatives are default/remapped E wall cases: although yaw
changes, their endpoint remains in the same dominant-axis wall run. They are
honest unchanged-square controls, not killed mutations. Other object/room/yaw
and tilt cases expose the stale ground origin or footprint dimensions. No
tolerance, timeout, retry or assertion was relaxed for the negative.

Initial diagnostic setup assumed an unclamped F angle and a constant north
object edge; it also required every changed pose to change a quantized wall
run. Those assumptions were false. That first22-red result is excluded from
product findings. The corrected independent expectations precede the real
producer removal.

## Mouse buttons, HUD ports and nonduplicate boundary

The installed Phaser `Pointer.js` copies native `event.button` and
`event.buttons`; its right/middle held predicates use masks2/4. The production
scene correctly starts middle pan with button1 and right turn with button2,
and checks held masks4/2 on release. Left construction checks mask1. Existing
`oblique-mixed-buttons.spec.ts`, `oblique-middle-pan.spec.ts`, and the published
canvas-exit native receipt cover those player interactions; this audit does
not claim to have rerun them or to provide another native acceptance.

The current HUD has four pose actions (yaw +/-15 degrees, elevation +/-10
degrees) and separate zoom out/in controls. Its existing Layout Reset restores
layout settings, not a camera pose. No unimplemented camera-reset control is
invented here. The actual pose button component's existing action-port test is
included in the43-case related scope; assembled-page hit reachability and
renderer switching remain native tests outside this receipt.

Fresh remote searches and full bodies of [#1914](https://github.com/woogitsu/lockstate/issues/1914),
[#1954](https://github.com/woogitsu/lockstate/issues/1954), and
[#1776](https://github.com/woogitsu/lockstate/pull/1776) were read. They already
record preview reprojection, mixed-button ownership and held Build camera
controls. The current scoped producer is correct, so no new bug Issue or
production fix is opened. Their open state is not treated as evidence that
their historical defect remains in this source.

Weakest claim: the Node/Phaser plumbing model cannot prove native browser
delivery or assembled HUD routing. Art owns the single browser lease; no
browser, server or listener was launched for this offline audit. No native,
touch-hardware, deployment or full-suite claim is made.
