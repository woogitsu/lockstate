# Oblique SW corner candidate

## Evidence

The current oblique module registry contains `wall.interior.corner.inner.north-east`, `north-west`, and `south-east`, each with `full` and `cutaway` manifests. There is no `south-west` registry entry, manifest, source `.blend`, or rendered frame set in `assets/source/` and `public/assets/environment/oblique/`.

## Candidate scope

Create `wall.interior.corner.inner.south-west.full` and `.cutaway` from a Blender source that uses the existing 64 px/tile contract, canonical pivot, orthographic camera, and the same yaw/elevation grid as the other corner modules. Register both manifests only after deterministic renders and a real scene review prove that the south-west orientation is needed.

## Current decision

This is a candidate for a future Blender batch, not an asset claim. No placeholder manifest or fabricated frame is added while the source geometry and visual acceptance evidence are absent.
