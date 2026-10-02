# Retained indoor waste-bin source and shared-camera alignment

2026-10-02, isolated branch `codex/default-waste-bin-angled-20261002`,
published input `4f0ad8a7865504172fdfc416cce0440743b2fb78`.

## Verified source and consumer scope

The existing buildable `waste-bin-brick` places `object.waste-bin` (numeric19),
authoritative1×1 and waste-disposal capability. `garbage-room-basic` already
places two. Default rendering consumes `fixture.cell.waste_bin` through
`oblique-fixture-cell-waste-bin.v1.json`. The separate Yard steel-bin override,
gameplay definitions, IDs, palette, registry and save format are unchanged.

The original `fixture.cell.waste_bin.blend` has twelve authored meshes and five
materials (enamel, edge, cavity, label, pedal). It already models the cylindrical
body, shoulder, cavity, hinged lid, side handles, label and pedal. This work
retains that geometry rather than describing it as a newly invented model.
Original SHA256 `acac99dd51895f561f0b25b1e7453c0290141ed6c7953f123575b2cb8bb95963`.

Native evaluated original bounds are
`[-.3499999940395355,-.4300000071525574,0]` to
`[.3499999940395355,.5449999570846558,.9340000152587891]`.
The previous exporter used128px /1.55orthographic tiles =82.58064516129032
actual pixels per tile while declaring64. Its yaw0 camera occupied+X; the
shared world basis occupies−Y. Those are concrete scale/basis mismatches.
Centered source versus declared XY target alone is not proof of an offset,
because runtime pivot composition can compensate.

## Retained preparation and native checks

`extract-default-waste-bin-angled.py` preserves the original bytes, all twelve
meshes/modifiers and all five material values. It rigidly translates sourceY by
`-.057499974966049194`; there is no shape scaling. Every evaluated vertex is
compared before/after; maximum rigid translation error is
`2.9802322387695312e-8` tiles. The provenance records each original and prepared
mesh name, evaluated count, position digest, modifiers and material slots.

Prepared source `fixture.cell.waste_bin.angled.blend` SHA256
`ff8f91f62e67ad69293c0560849664524a5e7cd34824137171f5cb3d740376c3`.
Actual shared exporter loaded bounds are
`[.15000000596046448,.012500032782554626,0]` to
`[.8500000238418579,.987500011920929,.9340000152587891]`.
Measured target `[.5,.5,.46700000762939453]`; unitXY transform,
256px /4tiles =64actual pixels per tile.

The standalone existing bin exporter delegates to the existing shared square
pipeline without changing shared functions or other model tuples. Its own
callback verifies source bytes, evaluated mesh positions/material assignment,
canonical runtime descriptor and exact unit min-corner transform. Native
`--verify` exited0, checking actual evaluated vertices inside all four clockwise
occupied orientations and actual camera offsets/forward vectors for72poses.
Both entrypoints explicitly require the pinned Blender version.

Blender5.2.1LTS upstream build ID `9e2066aef7ef` is not a Git commit citation.
Executable SHA256
`284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`.

## Pending evidence and weakest claim

Full repeat exports, opened decoded images, actual producer negative controls
and real GarbageRoom worker construction/SaveLoad/palette proof are pending.
No native player or hosted completion is claimed at this source checkpoint.
The weakest claim is runtime framing: actual completed/loaded pixels and a
consumer-only negative control must establish it after the browser lease.
