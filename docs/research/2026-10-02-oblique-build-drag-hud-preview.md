# Angled canvas-origin construction preview beneath the HUD

Date: 2026-10-02. Evidence tier: **VERIFIED** by the built application in
Chromium, native mouse events, real worker submissions and a production
consumer mutation. Tracked as [Issue #1971](https://github.com/woogitsu/lockstate/issues/1971).

## Observed behavior corrects the source hypothesis

The top-down scene captures canvas-origin pointer drags; the angled scene
did not. An initial hypothesis was that the angled scene might cancel or
truncate a construction run after leaving the canvas. Actual native evidence
disproved that: both measured releases submitted every intended square.
The defect was the held preview and catalogue quote freezing at the HUD edge
while the release submitted a longer run than the player had been shown.

The full closed #878 record was read: its top-down canvas capture established
that a drag starting on the map should continue beneath interactive islands,
while a press starting on a HUD control remains that control's. Fresh remote
all-state searches for oblique/angled HUD drag, capture and canvas pointerout
found no record of this measured angled preview discrepancy. The full #1914
camera-pose preview record and #1935 camera-cancellation record were read.
Neither describes a native pointer crossing a HUD island without camera change.

## Actual Full HD baseline

Diagnostic checkpoint `e44ce410e7b878f5bdd8814740a21ecd44b92b5b` is based on
the parent's published room-building integration. The test creates and pauses
a new prison, opens Build and arms Brick wall. An uncovered-map control first
submits exactly two independently calculated occupied squares. It then drags
from uncovered canvas to the actual native Category select inside the right rail.

| Scale | Physical start → release | Held preview and quote | Actual worker command squares |
|---|---|---|---|
| 100% | (1377,237) → (1785.078125,237) | 3 from (23,15), value240 | (23,15)..(27,15), 5 squares, value400 |
| 200% | (1013,539) → (1706.15625,539) | 3 from (16,16), value240 | (16,16)..(22,16), 7 squares, value560 |

The first unchanged-production baseline was 2/2 red, 8.5/6.6s, at the held
preview count after all command-coordinate assertions had passed. A second
unchanged-source baseline added durable passive event artifacts: 2/2 red,
6.8/6.4s, at the same assertion. Native traces show CANVAS pointerdown and
mousedown, pointerout with buttons=1 into the HUD, then SELECT pointerup and
mouseup. No pointer capture had been acquired. Phaser listens for movement
on canvas and also processes the window mouseup, so the preview misses the
remaining physical movement while the release correctly picks its endpoint.
The 200% baseline screenshot was opened and visually inspected.

## Scoped native capture

Correction `2f0aa78eff` adds ten lines in
`src/rendering/scene/oblique-world-scene.ts`. A native mouse left-button press
on the canvas acquires pointer capture only while a construction tool is armed.
The listener is removed on scene shutdown. Acquisition does not prevent default,
modify the HUD, change a pick, adjust camera pose or author new text. Touch and
camera-button presses keep their existing behavior. Existing cancellation
handlers remain unchanged.

The [W3C Pointer Events capture contract](https://www.w3.org/TR/pointerevents3/#setting-pointer-capture)
retargets subsequent pointer events to the capturing element. Its
[implicit-release contract](https://www.w3.org/TR/pointerevents3/#implicit-release-of-pointer-capture)
ends capture after pointerup or pointercancel. The actual restored trace records
gotpointercapture on CANVAS, then pointerup/mouseup targeted at CANVAS while
the physical hit-test element is SELECT. Normal lostpointercapture follows the
mouseup and does not suppress the construction commit in the tested browser.

`tests/browser/oblique-build-drag-under-hud.spec.ts` drives actual native mouse
input against the built Cloudflare-served client. Its worker tee observes the
production sender; it does not emulate preflight or construction. An independent
inverse of the known fresh-prison framing calculates the intended occupied
squares. The gate checks every worker coordinate, square footprint, Brick wall
definition and held preview count. The corrected 100% screenshot was opened:
the readout shows five whole squares from23,15 and catalogue value400.
The restored 200% artifact records seven from16,16 and catalogue value560.
A subsequent fresh native press on Category retains focus and ArrowDown
changes its filter, with no additional construction command.

## Production mutation and exact restoration

First corrected native run: 2/2 green, 8.5/8.7s. The production mutation omitted
only `canvas.setPointerCapture(event.pointerId)` from the new acquisition
listener. All native test input, command assertions and budgets stayed intact.
The rebuilt mutation was 2/2 red, 7.3/6.4s, at the same held preview mismatch:
three squares rather than five/seven. Its uncovered control and full released
worker-coordinate assertions still passed.

The exact source file was restored from the retained copy. SHA256 before and
after was 93C22B2D5822AAA4E82C2F476496F2121968199648BC6591F03427F58AA27ACB,
with zero production source diff. App/tools TypeScript and the production build
passed before the final restored browser group. The existing local artifact
configuration was used; no new tracked config or timeout increase was made.

Final restored group: **4/4 green in32.3s**:

- New native Full HD100% and200% HUD-crossing cases: 8.2/7.4s.
- Existing right-button blur/pointercancel cancellation: 7.9s. Those cancellation
  signals are synthesized by that existing regression; they are not claimed as
  physical window-focus proof.
- Existing real two-finger camera pan: 5.7s. That case also keeps its existing
  cancellation checks and verifies a fresh normal native touch release still
  submits its single square.

Every launched browser process returned terminal before the exclusive lease
was released. Passive JSON artifacts retain the intended run, actual commands,
held readout and native pointer/mouse trace beside the screenshots.

## Accepted boundary and remaining work

Acceptance covers paused fresh-prison Brick wall square runs crossing into the
actual right-rail native control at1920×1080, UI100%/200%, default angled pose,
plus a native HUD-origin press and the named existing cancellation/touch gates.
All released command coordinates and footprints remain unchanged. The captured
run may extend under the HUD; this change does not reveal occluded world tiles.

Object and room-area ports share the acquisition, but separate physical
off-canvas drags for those tools, camera-button HUD crossings, other poses,
other browser engines, full CI, parent integration and deployment have not been
proved here. No room-template fit, gameplay, save, art, copy or layout rule changed.
