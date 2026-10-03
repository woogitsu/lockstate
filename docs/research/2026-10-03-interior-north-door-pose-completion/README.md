# Existing interior north door pose completion — 2026-10-03

## Actual catalogue selection and retained model

Published base `2023be9e1a7aaf1307c99a8f5d2e7dd9df2ee338` was verified against the remote root branch. The actual world edge consumer selects the accepted `door.interior.open.full` alias for a north door and `door.interior.open.west.full` for a west door. Doors do not get near-wall cutaway inference. Accepted closed Issue1830 owns these aliases; this increment does not add a closed-door state or change alias rules, collision, picking or gameplay.

The north registry entry still points at `oblique-cell-door-open.v1.json`, currently nine poses: yaw−45/0/45, elevation25/45/65. The west sibling already has72poses. North camera135 clamps to old45; camera225 clamps to old−45. This substitutes a front/side view at a back-facing camera, a material coverage problem for the real consumer.

Genuine Blender5.2.1LTS, one thread, opened six current sources without saving. The leaf contains20authored meshes and7stored material graphs: two hinges and pins, two latch plates/sockets/grips, four raised panels/recesses, slab and top endgrain. Leaf source SHA256 `48a27d1b212e88121e6b55661452f70df1129e78f8825eebc3913db1d5aeaf5f`. Existing wall source SHA256 `98b264c5b3ea15658d7d8996f403024928c660135a66025adccba1d385927e6c` contains85meshes/6graphs across14authored wall collections, including the separately selected full doorframe. Source counts must not confuse this whole kit with the selected doorframe assembly. Current square full/low walls are59/27meshes, UtilityPanel36, LoadingDock64 and already have72poses. No extra geometric detail is justified for these sources.

The original north45/e45 PNG was opened and shows the already detailed timber leaf and plaster/metal frame. No new generic concept or speculative micro-joint is proposed.

## Historical producer discovered before generation

Historical commit `e08129b96afe07329be3fba3bbb0e41def10116d` already published this exact same retained leaf/frame across the full signed24yaw×3elevation grid. Its leaf/dependency hashes,512resolution,64pixelsPerTile,pivot256 and target[0,0,0] match the current nine-pose manifest. The later final-tree publication leaves only nine current poses. This is completion/recovery of existing authored work, not new modelling or a new asset ID.

The historical actual producer is `render-oblique-door-full-frames.py`, importing `render-oblique-bed-door-frames.py`; it appends `wall.interior.doorframe.full` and `door.interior.leaf.open`. Its camera uses `(R*sin(yaw),-R*cos(yaw),R*tan(elevation))`, not the newer object-fit camera convention. Historical lighting and PNG metadata filtering are read directly from that commit. Recover these functions in the own standalone producer, with direct current version/semantic/dispatch guards and no registry rewrite. Preserve the accepted target/scale/source/world-picking contracts and all West72frames.

## Approved bounded plan and evidence boundary

Root confirmed retained-source runtime coverage completion. Next: exact selected assembly inventory/material/geometry guards; actual old-nine consumer RED; genuine historical producer72serial render, actual view comparison, source/hash/dispatch/PNG controls and exact restoration. Runtime integration changes only the existing north descriptor/frames; registry/aliases/state/palette remain byte-identical. Browser/server/native visual acceptance remains root-owned.

The first read-only inventory tried serializing live Blender custom-property references after opening later files and failed before writing a result. The corrected inventory freezes only explicit collection asset/footprint values; all six files remain unchanged. This diagnostic is not counted as a successful model mutation/control.
