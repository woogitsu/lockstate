# Existing Prisoner silhouette and historical actor camera audit

## Scope and decision

Immutable base c1459094256c42704d266fd0ff422597de389faf. Original actor.prisoner.base.blend SHA256 48e3457298d9d3a2cc9dcd39725ba263450bffea27df05d42fe90afc6e659c0b has48 mesh parts/eight complete stored material graphs and eight evaluated animation poses. Full raw mesh/modifier/material/action/pose inventory is retained in original-source-and-camera-audit.json. No justified missing garment connection was found: torso, hips, neck, head, sleeve/cuff/forearm/hand, lapel/pocket/ID patch, trouser hem and shoe components already exist. No physical parts, source bytes, descriptor, alias, runtime camera, palette or projection were changed.

The live canonical descriptor has512px frames, nominal64, pivot256/256 and target0/0/0. These fields alone do not specify Blender model scale, orthographic span or lighting. The existing current role exporter uses unscaled source/ortho15.5 and retained source lights. Its eighteen actual source renders differ from all eighteen canonical Prisoner rasters, including alpha silhouettes; these are not metadata differences. The opened canonical-versus-actual-pinned-source.png records the discrepancy, and current-prisoner-eighteen-poses.png records published poses.

## Exact historical producer identified and reproduced

Git428cd89e48cdbb30c2b5dfda4476dec3a2e9cad0:tooling/blender/render-oblique-actor-frames.py, no longer present at this base, explicitly sets SpriteRoot.scale=.5, ortho8, radius12 and calls configure_oblique_module_lighting. That historical lighting hides existing source lights, uses Standard/Medium High Contrast, neutral world(.72,.77,.82) strength.7, and a600W area disk at(-3,-4,7), size5. The replay script reproduces these actual settings without saving the source.

**Eighteen historical replays match all decoded canonical RGBA pixels exactly** at yaws-180/-90/-45/0/45/90 and elevations25/45/65. PNG bytes differ because this diagnostic uses the current role normalization encoder rather than historical wall.strip_png_metadata. The historical-replay-comparison.json records every canonical/replay byte hash, bbox and exact decoded comparison. This establishes actual legacy fit/lighting; it is stronger than inferring span from bounding boxes.

Legacy density is32pixels per unscaled source unit and.5world tiles per source unit. Body span3.425 source units therefore equals1.7125tiles. Current role density512/15.5=33.032258 gives1.767742tiles: **3.225806% larger**. Do not label the role pipeline as the accepted Guard/Prisoner camera. Root separately granted a narrow Guard exporter correction; its source69parts and actual belt contacts remain valid, while earlier Guard canonical raster fit/lighting are superseded pending that correction.

## Actual production math and source pixels

The runtime audit bundles and executes existing groundToScreen/projectObliqueActors via pinned Vite/Rolldown, then parses the actual image.setScale expression rather than copying it. Its configured-role-camera72 Blender projections/front-back centroids agree with real renderer math within0.0000323pixel. Eight heading cases confirm cameraYaw-minus-south-based-heading. This checks projection math at the explicitly configured15.5 span; it does not establish that span as historical canonical production.

Actual image scales at zoom.5/1/1.25/2 are.5/1/1.25/2. Published yaw-45/elev45 alpha bbox35x97 becomes43.75x121.25pixels at the actual defaultzoom1.25. Thus nominal64 does not imply a64pixel-tall actor, and no too-small or wrong-facing defect is established by this source/math audit. The.8tile head in oblique-world-scene is the Graphics fallback and does not size authored Images.

## Replay and boundary

Run pinned Blender5.2.1 with --python tooling/research/audit-prisoner-source-camera.py -- --render-role or --render-legacy, then pinned Node tooling/research/audit-prisoner-runtime-scale.mjs. Outputs are ignored assets/intermediate/prisoner-scale-audit. Original source remains byte-identical. All current processes terminal; no browser/server/native feed injection. Genuine admitted-Prisoner native rendered acceptance remains pending and is not proved by controlled mathematical inputs, source renders or atlas decoding.

Research-index contract3/5passed; two inherited structural failures remain at this base (earlier malformed four-cell art rows end the parser table atline102). This record uses the existing three-column linked first cell and is appended to the continuous final table; unrelated historical rows were preserved for parent integration.
