# Native object and room-area drags beneath the HUD

Date: 2026-10-02. Evidence tier: **VERIFIED** by built-client Chromium,
native pointer input, passive event traces, actual worker commands and
production predicate mutation. This extends the accepted scope of
[Issue #1971](https://github.com/woogitsu/lockstate/issues/1971).

## Already correct on the published shared capture

The existing wall correction captures mouse left construction presses on the
canvas while Build, object or room-area tools are armed. Its first acceptance
explicitly excluded separate physical object and area drags. This audit starts
from that corrected source; it finds no additional construction defect and
makes **no production change**.

The final diagnostic is `2fc435e996d3722bc476066642ebd3b410f76ef3` on
`codex/hud-object-area-native-drag-20261002`, based on the published wall
correction. `tests/browser/oblique-object-area-drag-under-hud.spec.ts` drives
a paused fresh prison at1920×1080, UI100% and200%, default angled pose.

The object case selects Bed by its actual catalogue control, verifies the
occupied1×2 dimensions and arms placement. An uncovered-map native click
first proves the sender works. A second canvas-origin drag ends above the
actual native Category select in the right rail. Each expected world origin
is calculated independently from the fresh framing; the held readout and
actual released PlaceObject command must match it. A subsequent native press
on Category retains its focus and native filter navigation without an extra
object command.

The area case selects Yard and arms ordinary Rooms drawing. It drags from
exposed canvas into the explicit Rotate camera left control. The inclusive
rectangle remains inside the owned32×32 chunk and satisfies Yard's8×8 minimum.
No ZoneRoom is sent while held or merely on release. A real Confirm click
then submits exactly the independently calculated rectangle. A fresh native
camera-button press still turns the map and emits no extra zoning command.

| Scale | Bed held/released origin | Yard held/confirmed rectangle |
|---|---|---|
| 100% | (26,19), occupied1×2 | (5,12), 10×10 |
| 200% | (21,23), occupied1×2 | (7,12), 9×9 |

The calibrated fixed-source baseline was **4/4 green in29.0s**:
Bed1006.5s, Yard1006.6s, Bed2006.1s, Yard2006.7s. Passive artifacts retain
the physical endpoints, expected shapes, held readout, native capture events
and real sender commands. The restored200% Yard screenshot was opened and
visually inspected: the projected area continues under the camera controls.

## Calibration failures are not production findings

The first diagnostic used the Yard catalogue row as an endpoint. Rooms
intentionally hides that row when drawing is armed, so both area cases stopped
before any drag (3.7/3.7s); object cases passed6.9/6.2s. An attempted native
View endpoint hit canvas instead of SELECT, again before the area drag
(3.8/3.8s; object6.3/6.4s). This View observation is reserved for its separate
actual mouse-selection audit, not claimed as a construction failure.

The explicit camera control's accessible name comes from its content rather
than an aria-label attribute. An attribute-based endpoint identity check
therefore also stopped before the area drag (3.8/3.9s; object6.5/6.1s).
The final identity check verifies that the physical hit element belongs to
the actual camera button, preserving the intended native boundary. These
setup failures were not cured by a production change or relaxed test budget.

## Predicate mutation and exact restored proof

The temporary production mutation removes only the objectTool and roomTool
acquisition predicates from the existing capture condition, retaining the
wall predicate and all cancellation handlers. The rebuilt result was
**4/4 red**, Bed1006.5s, Yard1006.7s, Bed2006.0s, Yard2006.1s. Correct
released/confirmed worker coordinates still passed, but held readouts froze:

- Bed100: (24,17) instead of (26,19).
- Bed200: (17,18) instead of (21,23).
- Yard100: 8×8 at(7,14) instead of10×10 at(5,12).
- Yard200: 5×5 at(11,16) instead of9×9 at(7,12).

The exact production file was restored with matching SHA256
93C22B2D5822AAA4E82C2F476496F2121968199648BC6591F03427F58AA27ACB and zero
production diff. App/tools TypeScript and production build passed. The final
rebuilt group was **4/4 green in31.4s**, Bed1007.6s, Yard1007.0s,
Bed2006.5s, Yard2007.3s. No tracked Playwright config or timeout changed.
Every browser process returned terminal and the exclusive lease was released.

## Acceptance boundary

This proves exact native held/readout versus sender-origin/rectangle agreement
for the selected Bed and ordinary Yard under the named HUD controls, at the
two actual scales. It does not prove completed object art, construction
progress, every room type, all drag directions/poses, other engines, full CI,
parent integration or deployment. The world remains occluded where the HUD
covers it. Camera-button drags are separate from pressing a camera control.
Room-template fitting and gameplay/save/art/copy/layout rules are unchanged.
