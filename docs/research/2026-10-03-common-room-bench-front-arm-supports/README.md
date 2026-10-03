# Common Room upholstered bench: retained front arm support connections

Date: 2026-10-03. Base: `b2da0e0791`. Surface: the existing Common Room
`object.bench` context, `furniture.common-room.upholstered-bench`, its dedicated
Blender source and standalone exporter. The approved addition is exactly two
steel risers inside the original bounds.

**VERIFIED — original source.** Blender 5.2.1 reopened
`assets/source/blender/furniture.common-room.upholstered-bench.blend`, SHA-256
`cfb1af97817ff0f5944626c2888a498bf96d60c3880544cc5f6d6544b9613b92`.
The [full original inventory](./original-bench-inventory-and72-camera-replay.json)
contains all 33 raw parts, their material assignments, modifiers, object matrices,
evaluated positions and normals, and all eight stored material graphs. The
[original producer replay](./actual-original-72-byte-equal.log) reproduced every
frame in the [retained original descriptor](./original-canonical-manifest.json)
byte for byte. The front timber arm undersides are at z≈0.653; the side bearers
end at z≈0.463. Their original vertical gap is 0.19 tiles, approximately 12 pixels
at the accepted 64 pixels per tile. Each rear back support already connects its
side bearer, rear steel upright and timber arm; those six retained contacts were
measured after reopening the actual dedicated source.

**VERIFIED — authored source.**
`assets/source/blender/furniture.common-room.upholstered-bench.angled-detail.blend`,
SHA-256 `825f228a6bb81dd03ab06d80c52af02646b92a16880e929c112c461b68992772`,
retains every original part and graph. Two `physical-common-room-bench.front arm
riser` meshes are added at x=0.22/1.78, y=0.25, z=0.55, with dimensions
0.04×0.04×0.25 tiles, using the retained powder-coated petrol steel material.
The [reopened contact graph](./actual-retained-rear-and-added-front-contact-graph.json)
records four actual triangle-interior front contacts, with 0.038 tiles of overlap
into each side bearer and 0.022 into each arm, alongside the six retained rear
contacts. This is an actual interior witness test on the evaluated triangles,
rather than an object-bounding-box proximity assertion.

All 33 original raw meshes, topology, material indices, modifier values,
evaluated position hashes, object matrices, normals, stored actions and eight
complete stored shader graphs remain equal. The final source has 35 meshes and
3,278 evaluated polygons. All evaluated normals point outward, with no detected
degenerate faces. Original evaluated bounds remain
`[0.1199999973,0.0999999940,0]` to
`[1.8799999952,0.8799999952,0.9905608892]`.

**VERIFIED — actual exporter.** The existing
`tooling/blender/render-common-room-bench-oblique.py` loads the dedicated source,
checks source identity, its actual assembly, full stored graphs, real contacts,
original bounds, retained matrices and all four occupied quarter turns before
adding the export camera. It checks the actual orthographic camera span,
resolution, position and aim. The existing canonical descriptor remains
`public/game-content/oblique-furniture.common-room-bench.v1.json`, with 72 poses,
256×256 RGBA PNGs, orthographic scale 4, 64 pixels per tile, pivot 128/128, and
target `[1,0.5,0.52]`. The existing room context mapping selects this asset only
for a built bench wholly inside an authoritative Common Room rectangle. The
context tests also verify the corridor, canteen, yard and planned cases.

The [four actual producer views](./actual-four-yaw-original-and-detailed.png)
show the retained original above the detailed model at yaws 30/120/210/300 and
elevation 40. The image was opened and inspected. Each source image is the
actual 256×256 render; the sheet scales it by 2 with nearest-neighbour sampling.
The [native RGBA differences](./actual-four-yaw-pixel-deltas.json) are
76/58/26/64 pixels. The new front support is visible where the view exposes the
arm underside, while the rear view occludes most of the addition.

**VERIFIED — production negative controls and restoration.** The
[control receipt](./actual-negative-controls-and-exact-restoration.json) and logs
were produced by `tooling/research/verify-common-room-bench-arm-supports.py`:

- [Saved-source disconnected riser RED](./actual-producer-disconnected-riser-red.log):
  moving one actual riser up 0.15 tiles and updating the source digest still
  fails the real producer on triangle-interior contact with its retained bearer.
- [Wrong producer dispatch RED](./actual-producer-wrong-dispatch-red.log):
  changing the actual producer to open the original source fails its dedicated
  source dispatch check.
- [Wrong actual camera span RED](./actual-producer-wrong-camera-span-red.log):
  halving the actual camera's orthographic scale fails its camera check.
- [Hash-valid malformed image RED](./actual-hash-valid-opaque-png-red.log):
  a 256×256 RGBA PNG containing one opaque border pixel, with an updated matching
  digest and hashed filename, reaches and fails the actual pixel decoder test.
- [Restored actual producer GREEN](./actual-producer-green-restored.log),
  [72-frame producer repeat GREEN](./actual-producer-72-rerender-restored.log),
  and [unit/context GREEN](./actual-unit-green-restored.log): 3 files, 9 tests.
  Source, producer, provenance, canonical descriptor and all 72 export bytes
  were restored exactly. The restored producer reproduced those same exports.

**UNKNOWN — native player result.** This branch does not claim a browser build,
placement, capacity, save/reload, hover or runtime result. The coordinator owns
the serialized native test and integration. No shared mapping, palette,
descriptor format, player copy or workflow file changed in this branch.

The weakest claim is visual usefulness in a densely occupied Common Room at a
player's chosen zoom. The measured rear-view difference is only 26 pixels due
to occlusion. A genuine player view that makes either front support read as a
floating mark, or obscures the authored bench's usable silhouette, would change
the visual acceptance decision. The native player evidence remains the next
gate; the source and standalone producer results establish physical contacts
and reproducible art only.
