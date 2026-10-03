# Angled pointer transforms after fit and viewport replacement

**No production calculation defect found in this scoped source audit.**
The test-only checkpoint `0e17ff0c3d12cc0c8d5e1ec5c8b01215fa135419` is based on
the published Laundry renderer integration `0315bf1068`. No Issue or production
fix is proposed. Browser acceptance is separate and has not been run here.

## Missing consumer boundary tested

Existing pure projection tests already exercise shallow/intermediate camera
poses. This additional regression runs the actual angled scene constructor,
create registrations, pose setter, update-time viewport replacement, accepted
pan-locked fit, hover preview and pointer press/move/release producers.

The test chooses screen coordinates with an independent forward projection;
it does not ask the production inverse where to click and then assert that
same answer. Literal world expectations are square (15,15); wall run 15..18 at
y=15; room rectangle (15,15) with dimensions 4×3; and rectangular object footprints
1×2 or 2×1 at (15,15), supplied for four orientation cases.

The matrix contains **144 angle cases**:

- Twelve 30° yaw samples covering the full turn, plus 37°, 143°, 217°, 323°.
- Elevations 20°, 25°, 30°, 40°, 45°, 50°, 53°, 65°, 80°.
- Each case replaces the Phaser viewport with 1920×1080, 1280×720 and 900×600.
- Each viewport applies a genuinely calculated accepted fit of a 7×16 plan,
  using explicit unobscured screen bounds, before invoking pointer producers.
- Each fitted viewport checks wall hover/commit, room drag/commit, and all four
  supplied object orientation footprints/commit.

Only graphics plumbing, texture loading and heavy world repaint are stubbed.
Preview geometry, pointer dispatch bodies, camera math, viewport update and fit
remain production code. No private pose, hovered square or gesture is set by
the test. Ordinary pointer objects are delivered to registered callbacks;
these are **source tests**, not genuine browser-native events.

The actual scene-produced wall squares also pass through `packCommand` and the
real new-session simulation kernel/command handler. All four active orders retain
literal world coordinates and square footprints. Repeating the same coordinates
creates only failed duplicate records; it claims no additional active squares.
This is in-process kernel coverage, not a dedicated worker/browser claim.

## Producer mutation and exact restoration

| Source stage | Result |
| --- | --- |
| Correct production source and full matrix/kernel checks | 144 GREEN |
| Only `worldPointOf` returns picked world x plus 64 | 144 RED |
| Byte-exact original source restored | 144 GREEN |

The negative is deliberately on the actual input producer, not the test's
expected result or a copied geometry helper. Every case fails at committed wall
coordinates: independently correct hover selects (15,15) while the corrupted press
starts one square farther right. The first failing guard prevents later ports
and viewport stages in those negative cases; no separate negative acceptance is
inferred for object/room stages. Their positive matrix remains recorded.

The source hash after byte-array restoration is
`4470EC92178CF0D7D9528A96B70DAE6F2473AB586729590FCDC04CE720DD284D`.
Production source diff is zero. Complete baseline, negative and restored terminal
logs are retained alongside this receipt. Both TypeScript checks pass.

## Diagnostic mistakes kept distinct

Early drafts used `target` instead of the renderer-view DTO's `centre`, then
picked exactly on a nearest-edge tie. Those failures were instrument errors;
the final interior sample avoids the tie and retains a fixed literal north
removal fallback. A subsequent draft counted all kernel order records as active:
the real service keeps refused duplicates as failed records. The final guard
asserts four active orders and all four duplicate states failed. Those earlier
logs are retained and are not treated as player bugs.

## Acceptance limits

Supported yaw and elevation are continuous; this finite matrix samples authored,
intermediate and limit poses and does not claim proof for every real number.
HUD bounds are explicit fixture inputs to the fit, not measured UI-scale panels.
The test proves handed object footprint shapes, not live rotation controls,
authored model pixels, camera cutaway or saved orientation history.

Physical pointer scaling, native UI 100%/200% hit ownership, real resize events,
dedicated-worker messaging, blocked room-plan confirmation, Save/Load, main CI,
merge and deployment are not claimed. The parent owns the independent actual
blocked-origin browser consumer correction after fitting moves the camera.
