# Dedicated Garbage Room refuse trolley

2026-10-03, own branch `codex/missing-room-fixture-oblique-20261003`, base
`04bb28215a`. The playable catalogue already maps all 21 object IDs to angled
models. The missing presentation is contextual: `room.garbage-room` requires two
1x1 `object.waste-bin` instances but uses the Cell pedal-bin model. This record
does not claim that the global object mapping was missing.

## Genuine source and retained assembly

Pinned Blender 5.2.1 LTS (`9e2066aef7ef`) saved
`assets/source/blender/fixture.garbage-room.waste-bin.blend`, SHA256
`5d9cafee94af08098b045e389b642ec655536fe0cc8aae8b5e026822f7d984cc`.
All twelve original bin parts, raw vertices/topology, modifiers and **all five
original stored material graphs** are retained. One rigid +0.16 Z translation
seats the complete bin assembly on a pressed steel carrier deck; no scaling or
original-source edits. Thirty real parts add four caster/axle/fork/hub
assemblies, two rear brakes, push uprights/handle, attached retention rails,
front bumper and amber reflectors. These serve refuse handling and reuse the
original palette. The source guard checks 33 real evaluated triangle-interior
contacts, geometric normals, source/provenance hashes and every occupied turn.

Grounded centered bounds are X ±0.4225000143, Y ±0.4875000, Z approximately
0..1.189999938. Every part stays inside the existing 1x1 footprint. The original
aligned source SHA256 remains
`ff8f91f62e67ad69293c0560849664524a5e7cd34824137171f5cb3d740376c3`.

## Actual canonical exports and integration handoff

The unchanged shared square export camera/pixel pipeline produced all 72 poses:
256px, 64px/tile, ortho 4, pivot (128,128), target
(0.5,0.5,0.5949999690055847), yaw 0..330 step30, elevation20..70 step10.
Descriptor: `/game-content/oblique-fixture.garbage-room-waste-bin.v1.json`.
Asset ID: `fixture.garbage-room.waste-bin`. Existing source and descriptor formats
are reused. No shared registry or object mapping edits are made here.

Root's exact optional integration:

1. Add `{ "assetId": "fixture.garbage-room.waste-bin", "manifest": "/game-content/oblique-fixture.garbage-room-waste-bin.v1.json" }` to the existing registry.
2. Add a `ROOM_VISUAL_VARIANTS` row for `room.garbage-room` mapping only
   `object.waste-bin` to `fixture.garbage-room.waste-bin`, through the existing
   wholly-contained footprint logic. Preserve default Cell and Yard routes.

Actual model/canonical integrity tests: 2 passed. A real source mutation and
hash-valid PNG control are being completed in the next coherent checkpoint;
this initial checkpoint does not claim those gates or native acceptance.

No browser/server, runtime, save, player-copy, catalogue/palette or canonical
alias changes. Root owns integration and native verification.
