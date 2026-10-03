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

## First recovered producer checkpoint

Actual consumer baseline: **3 RED / 3 GREEN**. The north complete-grid assertion fails and actual cameras135/225 select45/?45. West72 and actual front45/315 controls pass. `old-nine-consumer-red.log` contains the real result.

The standalone producer recovers historical setup/camera/render/PNG normalization without its unrelated bed dispatch or registry writer. Direct pinned-version check is present. Actual appended collection inventory is **20 leaf +9 full-frame meshes =29**, with **10 used appended material graphs**. Whole source files still retain7/6 stored graphs, including unused original graphs. `door.interior.open.full.export-contract.json` captures all selected raw geometry, modifiers, matrices, evaluated-position hashes and graphs. Two real evaluated triangle-interior witnesses connect the retained hinge barrels to the negative metal reveal; both pass before byte/hash equality. Whole selected bounds remain[-0.8462811708450317,-0.6383092403411865,0]?[0.5,0.14000000059604645,2.5799999237060547]. These accepted authored bounds are deliberately not forced into a new square or centered camera convention.

First contract invocation exposed a guessed missing space in the hinge name before rendering. Corrected to the actual authored names, then production verify-only passes; this diagnostic is not a semantic negative. One actual45/e45 preview rendered with512px/64samples/one thread. The full72 matrix and mutations are still pending at this checkpoint.

## Actual full72 checkpoint

A single real Blender5.2.1/thread1 production invocation rendered all72 PNGs in approximately30seconds. Actual log contains72 Saved entries and full body decoder GREEN. No historical PNGs were copied as newly rendered output. Every resulting SHA256 equals the corresponding historical e081 frame, including **all9 original PNGs byte-for-byte**. Current runtime test is **6 GREEN**, including real north/west cameras45/135/225/315 and unchanged whole picking footprints. Descriptor SHA256 `77054fd613d795e24754321a63b44b4fb1b93f39b437eaf706f6d90558895d63`.

The bounded first fresh45/e45 preview differed from the authored warm frame (5740 RGB pixels, zero alpha changes). Repeating it, updating material tags, and reopening an exact appended temporary assembly reproduced the same isolated first-render result. The full original canonical-order matrix resolves the comparison: all72 hashes match history exactly. This points to fresh EEVEE initialization/order, not a source/material edit or a need to change lighting. The first canonical?180/e25 frame also matches history. Bounded repeat controls will reproduce that same canonical first-pose initialization before rendering a later pose; no second full matrix is needed.

Actual135/e45 and?135/e45 frames were visually opened: both retain the solid frame, leaf thickness, timber panels where visible, latch hardware and hinges, with natural backside occlusion. At135 the open leaf is largely edge-on behind the frame; this is true authored geometry, not a missing part. Material, actual source bounds,512resolution/64ppU/target/pivot and West72 remain unchanged. Native canvas acceptance remains pending with root.

## Actual production negatives and exact final restoration

`tooling/verify-interior-north-door-proof.py` is the repeatable real serial control runner (Python+Pillow, pinned Blender5.2.1). It writes a genuine temporary mutated leaf `.blend` with every original mesh moved+1X, updates only the temporary producer source hash to the actual bad bytes, then invokes the real producer. The actual triangle-interior hinge guard fails **before** raw geometry or stale source hash checks. Exact original source and producer bytes restore to GREEN. Wrong accepted asset dispatch fails?exact restore GREEN. A genuinely valid512RGBA PNG with one opaque border pixel and matching updated filename/body/descriptor hash fails the real decoded clipping guard?exact descriptor/PNG restore GREEN. Detailed source-mutant/hash/body evidence and all outputs are in `actual-production-negative-controls.json` and adjacent logs.

Four bounded real repeats45/135/?135/?45 at45elevation match the fullmatrix body hashes exactly. The standalone producer now performs the historical first?180/25 initialization in ignored scratch before a later isolated pose, retaining original samples/lighting/geometry. Full72 default output is unchanged. Studio guard additionally validates actual EEVEE64samples,512resolution,8tile orthographic span, source camera target, original light/world and color grade.

The first control runner rejected an already-existing unreferenced older?45 PNG as if the bounded repeat had created it. Corrected bookkeeping snapshots preexisting filenames and protects **all retained old north PNGs**, instead of removing them. Final runner passes and proves **162 exact restored protected files**, including original sources, all descriptor-owned north/West frames, retained unreferenced north art, producer/contract and accepted registry/mapping. No original .blend or original PNG is changed/deleted.

Actual registry entry omission gives **5 RED /1 West control GREEN**; exact file restore gives **6 GREEN**. Final named-script focused set: **42 GREEN /1 optional generic Blender-on-PATH live gate skipped**, five real collected suites. Own actual Blender source/render/mutation/repeat evidence above is executed, not skipped. Named strict typecheck (app/browser+tools) and actual Cloudflare production build pass. Build emits existing bundle-size/plugin-time advisories; no deployment/native/browser was run.

## Integration handoff

Only existing `/game-content/oblique-cell-door-open.v1.json` grows from9 to72 poses, with63 genuinely rendered retained-source frames added. Existing `door.interior.open.full` registry/aliases are untouched. Full-source leaf SHA256 `48a27d1b212e88121e6b55661452f70df1129e78f8825eebc3913db1d5aeaf5f`, dependency SHA256 `98b264c5b3ea15658d7d8996f403024928c660135a66025adccba1d385927e6c`, canonical LF descriptor SHA256 `77054fd613d795e24754321a63b44b4fb1b93f39b437eaf706f6d90558895d63`. Git may check text out withCRLF; canonical JSON/source/frame hashes, rather than an assumed checkout newline, are the durable comparison.

North world camera135/e45 selects `cell-door-open-yaw+135-elev45.1c1f8e0b7cbe.png`; world225/e45 normalizes to?135 and selects `cell-door-open-yaw-135-elev45.cae1519010fd.png`. Both use the accepted512px/pivot256/target[0,0,0]/64ppU. All source72frame SHA256s appear in `actual72-source-frame-receipt.json`; current typed actual callback tests preserve full projected north1?0.22 and west0.22?1 picking footprints. No new geometry/state/copy/palette/schema/price/alias choice.

Root cherry-pick conflict surface: `docs/research/README.md` only appends the own canonical `./2026-10-03-interior-north-door-pose-completion/README.md` three-column row in its first continuous table. Preserve all intervening root rows. All other documentation is inside the new own report directory. No root HUD/protocol/renderer/worker/source-doc surface is edited. Native actual displayed-model acceptance remains root-owned and pending.
