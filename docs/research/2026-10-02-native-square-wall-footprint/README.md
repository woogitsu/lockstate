# Native whole-square Brick wall diagnostic — 2026-10-02

The recorded original baseline below is retained. The later scoped export fix,
two producer negatives and final native6/6 acceptance are recorded in
[native acceptance](native-acceptance.md).

## Recorded original diagnostic; native correction acceptance remains pending

At the unchanged `8b3096c888` baseline, the authored Brick wall is wider than the horizontal projection of the
one occupied square selected by ordinary Build. At yaw −45° it is also anchored
at the square's minimum corner instead of the centre of the centred wall mesh.
This is a remaining part of [Issue #1585](https://github.com/woogitsu/lockstate/issues/1585),
whose acceptance requires the committed wall to match the highlighted square.
No gameplay, save, image, exporter, manifest or production source was changed during this diagnostic.
This diagnostic is not a completed fix or an accepted mutation-tested gate.

The independent native case is
`tests/browser/oblique-square-wall-native-footprint.spec.ts`, published in
`a8c7c4686c` after preparation `a66be780ec` and height separation `9ccfca9f39`.
The source subject is unchanged from integration `8b3096c888`.

## Actual player path

A real scheduled kernel completes Storage Room and Delivery Bay commands. Its
save is imported through the shipped native file chooser and loaded in the
production client. The player then opens Build, chooses Brick wall, arms it,
and clicks the independently calculated centre of square (20,20). There is exactly
one actual `PlaceBuildOrder`, with `footprint: square` and coordinates (20,20).
Fast forward completes that order; a real worker snapshot confirms its completed
state, the same anchor, and two allocated bricks. No completed wall, material
stock, worker reply or renderer state is injected.

Native minimap and camera buttons frame the finished wall. The passive native
click trace gives world target (20.571428571428573,20.727272727272727), including
physical click rounding. The test calculates the four occupied ground corners
independently from this DOM event, the known 32×32 loaded world, zoom 1.25 and the
requested native angle. It does not read renderer internals or a HUD target as
its expected geometry.

## Retained exact-buffer evidence

All three cases use 1920×1080, UI 100%, one browser worker, the unchanged 60s case
and 10s expectation budgets, and no retry. Each final retained canvas PNG is the
exact buffer measured; all three were opened. Authored-material polling precedes
the capture because a finished request can precede Phaser's batch repaint.

| Native yaw/elevation | Pixels inside full-height prism | Masonry pixels outside horizontal ground span | Terminal duration |
| --- | ---: | ---: | ---: |
| −45°/45° | 6372 | 7931 | 19.6s |
| 45°/65° | 2838 | 1042 | 22.6s |
| 45°/80° | 1740 | 1041 | 23.8s |

All three fail at the intended outside-span limit 20. The horizontal span of a
1×1 square at these exact authored yaw angles and zoom 1.25 is 113.14px. Height
has no horizontal component. The sampled native cap/brick colors (170,167,162)
and (131,125,118) distinguish actual masonry from brown ground (132,112,95); dark
footing/shadow pixels are excluded. A 3px allowance covers click rounding and
antialiasing. Full vertical prism bounds are diagnostic only: at elevation 80°,
the accepted nearest authored wall frame is 65°, so its vertical overhang is not
counted as a footprint defect.

- [−45°/45° raw measured canvas](./wall-minus45-elev45.png), [coordinate/worker trace](./wall-minus45-elev45.json).
- [45°/65° raw measured canvas](./wall-plus45-elev65.png), [coordinate/worker trace](./wall-plus45-elev65.json).
- [45°/80° raw measured canvas](./wall-plus45-elev80.png), [coordinate/worker trace](./wall-plus45-elev80.json).
- [Terminal three-case log](./native-baseline.log).

## Producer/consumer trace and rejected hypotheses

`tooling/blender/verify-square-brick-oblique.py` verifies centred source mesh XY
bounds −0.5..0.5. The wall exporter uses 512px resolution and orthographic span 5.5
tiles, which is 93.09px/tile, while both published wall manifests declare
`nominalPixelsPerTile: 64` and `cameraTargetTiles: [0,0,0]`.
`ObliqueWorldScene.paintAsset` projects tile corner plus that target and scales
by 64×zoom divided by the declared nominal value. This accounts for an enlarged
sprite and a centred source being placed at the logical minimum corner.
Correction of exporter calibration and centred-anchor consumption is pending
surface coordination. Source mesh detail and all authoritative square rules
remain accepted.

An earlier prism-only cutaway experiment `83743ada4f` found 76 wall/pose pairs
with disjoint logical prism hulls. It is not a valid blanket visibility
regression: independent authored-alpha sampling at yaw 30°/elevation 20° found
real sprite intersections that those prisms miss. The SAT candidate remains
read-only and must not be integrated as an asserted production contract.

Two initial three-case attempts failed on the diagnostic's incorrect assumption
that an empty queue has `data-queued=0`; the production panel deletes that
attribute. They never placed a wall. A later single-case attempt reached actual
completion but its provisional warm palette counted 103667 brown ground pixels,
which are not wall evidence. Corrected sampling reached three intended failures
7931/1042/1041 in 18.2/20.9/23.5s, but the 65° page screenshot was transient
fallback art before the measured canvas repaint. The final run above retains
the actual measured authored buffers and reproduces the same counts. Earlier
attempt logs remain locally retained; they are not presented as additional
product defects.

Both TypeScript targets and the production build pass. The real logistics
fixture unit case passes 1/1. No production mutation, corrected native run,
Save/Load of the new wall, other renderer, UI 200%, hosted delivery, main merge
or exact-head CI acceptance is claimed. All own browser/controller processes
are terminal; the preview port 5402 has zero listeners and the exclusive browser
lease was explicitly released to root.

Exact source SHA-256 values at the final native baseline:

- Scene SHA256=93c22b2d5822aaa4e82c2f476496f2121968199648bc6591f03427f58aa27acb.
- Full-wall manifest SHA256=e7b36ab309150b5e886ae9b9a635cda023d836b91d503eec734a8deff9a37a1d.
- Exporter SHA256=e02ed4164e9a3f6f1d490a80f0e0665b4b10b200a7bb49640803c7d85e8ebf3d.
- Built client `index-BUl_YZvF.js`, SHA256=2b1e93f0a7facb98f0e1be205d7fcf8b2db4119223fdb4f6bf29902d2c8067d7.
- Built worker `worker-R9AIfERa.js`, SHA256=d080ed79cac248071acfd966e3fe7fffd3daf922a2813a0b445914308937bb51.
