# West-facing oblique T junction

The real `projectObliqueWorldFrame` can emit three walls at one grid vertex
`(cx, cy)`: `north-edge:(cx-1):cy`, `west-edge:cx:(cy-1)`, and
`west-edge:cx:cy`. Selecting both north-east and south-east corners here makes
their west arms occupy the same segment. The [yaw 45° comparison](evidence/oblique-t-junction-west/yaw45.png)
shows the doubled translucent wall; one T module resolves that overlap.

`wall.interior.junction.t.west.full` and `.cutaway` are Blender generated
transparent catalogs with 24 yaw poses at 15° increments and 25°, 45°, 65°
elevations. The wall has a single concave mesh per material layer, with no
coincident faces. Its arms run 1.11 tiles west and north, 0.89 tiles south from
the +0.11 tile ground anchor. At 64 pixels per tile, the pivot is `(256,256)`
in each 512×512 PNG. Both variants use the source wall kit's plaster, coping,
and skirting materials.

The runtime consumer should replace **all three** listed solids with one
catalog selection at
`groundToScreen({x:(cx+0.11)*64,y:(cy+0.11)*64}, camera)`. This branch only
publishes the modular frames, catalogs, registry entries, and projector-based
comparison harness. Game-scene selection depends on the separate oblique
composition work and is not claimed here.

To repeat: run Blender 5.2.1 with
`--background --python-exit-code 1 --python tooling/blender/render-oblique-wall-junction-t-west-frames.py`.
Two complete rerenders produced identical manifest SHA-256 values:
`a112c4b69c92b432c61e9da4e9f0988275eefce753387f2088df38e91abbe9c`
and `9aac8cd26799870a8d7782237d13d65667e215df355bc5ffd672d5b93`.
The registry contract test first failed with 32 entries versus 34 expected,
then passed with the two real catalogs and every PNG hash checked.

The [five Full HD comparisons](evidence/oblique-t-junction-west/) use the
actual world projector with yaw −90°, −45°, 0°, 45°, 90° at elevation 45°.
The left side overlaps the two existing corner modules; the right side loads
the single T module. At yaw −90° the overlap is hidden by the projection, but
at yaw 45° the duplicated face is obvious. These images are a controlled
browser composition test, not a claim that the game scene selects this module.
The reproducible harness is [`tooling/qa-oblique-t-junction-west.mjs`](../tooling/qa-oblique-t-junction-west.mjs).
