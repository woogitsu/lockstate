# Current Kitchen prep counter structural audit

2026-10-03; fresh worktree base `423189bf9c343da8a1ab732ed3df75a77ab7a764`.

**Decision: retain the existing prep-counter source and producer.** The current
source has no significant visible support/worktop gap in the four inspected
canonical views. A microscopic shelf-bracket separation does not justify adding
new parts or another artwork revision.

**VERIFIED — earlier work was read first.**
[Dedicated prep-counter report](../2026-10-02-kitchen-prep-counter-angled/README.md),
its source/refiner/standalone producer and the
[Kitchen square-fixture report](../2026-10-02-kitchen-square-fixtures/README.md)
already record the retained 24-part source, 54 authored additions, footprint
alignment, deterministic export and genuine normal/rotated Kitchen acceptance.
The latest fridge report also explicitly declines a stove/prep-counter model
gap claim. This audit does not repeat that modeling work.

**VERIFIED — actual current assembly.** Reopened source
`assets/source/blender/furniture.kitchen.prep-counter.angled.blend`, SHA-256
`b20bffb79d6ffe66a6c741fc420bd163651faa4813ca4d77740eb3dd55914a8a`,
contains 78 evaluated mesh objects and six complete stored material graphs.
The [fresh inventory](./actual-current-inventory-contacts-and-four-replay.json)
records every raw mesh, modifier/material assignment and all part bounds.
The source bytes were compared before/after the audit and remain identical.

The actual carcass is solid and grounded, from z=0 to z=0.9599999785423279.
The worktop underside lies at exactly that same height. Independent BVH nearest
surface queries at `(0,0,0.9599999785423279)` return distance 0 for both evaluated
polygon surfaces, with opposite geometric normals. A strict triangle-interior
overlap test rejects this tangential pair; that rejection is explicitly retained
in the receipt and is not evidence of a gap. The worktop rests on the carcass.
Each of the four retained feet intersects the carcass by approximately 0.1 tiles.

Both service-shelf horizontal brackets intersect their vertical brackets by
0.0200000107 tiles and the shelf by 0.0129999965 tiles. The vertical bracket back
faces are separated from the carcass front by 0.00150001049 tiles, equivalent
to approximately **0.096 pixels** at the accepted 64 pixels per tile. The strict
interior test rejects those two bracket-to-carcass pairs. This microscopic
clearance is reported precisely, without turning it into a visible-model claim.

**VERIFIED — actual producer and visibility.** The existing standalone producer
loads the unit-scale dedicated source, applies the accepted `(1,0.5,0)` anchor
translation, and verifies all four occupied rotations. World bounds remain
`[0.0730000734,0.0185000021,0]` to
`[1.9269999266,0.9229999781,1.6200001240]`, inside the original 2×1 footprint.
Camera remains 256×256, orthographic scale 4, target
`[1,0.5,0.8100000619888306]`, 64 pixels per tile.

Four actual renders at yaws 30/120/210/300 and elevation 40 reproduce the current
canonical frame digests byte for byte. The
[four-view sheet](./actual-current-four-yaws.png) was opened and inspected;
it enlarges genuine 256×256 frames by 2 with nearest-neighbour sampling.
The wood top, solid support carcass, front drawers/service shelf and existing
basin/faucet/tray details remain coherent on exposed sides. Rear views naturally
hide the front shelf and drawers.

**VERIFIED — process limit.** Actual Blender process inventory was 0 before and
0 after each sequential audit invocation. Each invocation started one Blender
process. Only four selected poses were rendered per invocation; no full export,
browser or server was started. The second invocation resolved the precise
worktop surface-contact observation above.

**Next catalog candidate identified.** Existing `object.utility-panel` maps to
`utility.utility-panel.variants`; its current registry descriptor is
`/game-content/oblique-utility.utility-panel.v1.json`, referencing the existing
`utility.utility-panel.angled.blend` source. Its previous dedicated/integrated
reports are being read before any further source inspection. No utility-panel
model defect or required change is claimed at this checkpoint.

The weakest claim is that the subpixel shelf-bracket clearance is immaterial
at other zoom settings or elevations. Four current canonical views establish
the bounded decision here; a clearly visible disconnected shelf in an ordinary
player view would justify a fresh investigation. Earlier native evidence is
historical evidence, not a new browser result from this audit.
