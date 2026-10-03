# Next existing model: utility panel source audit

2026-10-02, read-only Blender audit after corrected Cell source checkpoint
`d6e36bce1936479885644899ba894e25ceb35ace`. No utility source, model, registry,
descriptor or export file has changed. Browser remains with the other agent.

## Actual existing consumer

`object.utility-panel`, numeric20, authoritative1×1, remains the existing
`utility-panel-brick` buildable. `utility-room-basic` is the existing4×4
template and places it at local2,1. Its default consumer maps to
`utility.utility-panel.variants`, registered through
`public/game-content/oblique-utility.utility-panel.v1.json`.

The published descriptor already has72 shared-camera poses,256px/4tiles=64ppt,
target[.5,.5,.65] and the shared yaw0−Y direction. The current consumed exporter
is `render-control-fixtures-oblique.py`, reusing the existing square pipeline.
The historical standalone `render-utility-panel.py` still declares2×1 and
128px/2.7tiles, but this is obsolete-exporter drift, not evidence that current
published pixels or world placement are misaligned.

## Actual source geometry

Original `assets/source/blender/utility.utility-panel.variants.blend` SHA256
`05281b06512f7dabab247b183568b249aa8df04e912c7ea89a209e918f9775ea` stays
byte-identical before/after the Blender audit. Nine retained cube meshes use
four existing materials: warm charcoal, control panel, monitor glass and amber
status. Body, top, front, monitor, control, dial, status and two feet are already
authored parts; do not describe this as a missing model.

Actual evaluated shared-export transform is translation(.5,.5,0) with existing
XYfit(.8,.9). Bounds are
`[.0599999725818634,.06350002437829971,0]` to
`[.940000057220459,.7700000405311584,1.0099999904632568]`.
Every evaluated vertex fits all four occupied orientations. Each cube has
8raw vertices,6raw polygons and56evaluated vertices after its bevel modifier.
No current footprint, camera scale or facing defect was found.

Independent actual-face audit computes each polygon normal dotted with its
center minus the raw mesh centroid. All54faces (nine meshes×six) are inward;
none point outward. This is a concrete source winding defect. The serialized
native receipt is `next-utility-source-audit.json`; this source audit did not
render or run any player case.

## Proposed bounded refinement, awaiting coordinator lease

Prepare a dedicated angled source preserving all nine existing assembly parts,
raw vertex positions, four materials/material assignments and bevel settings.
Correct the inward face winding; record the intentional topology change rather
than claiming retained topology bytes. Add real round control knobs, shallow
monitor bezel, cabinet latch/hinges and cable glands using existing materials.
Retain accepted footprint/fit and source provenance. Decide camera target only
from actual geometry, with declared runtime target and64ppt checked separately.

Proposed exact edit surface:

- Own `tooling/blender/refine-utility-panel-angled.py` and
  `tooling/blender/render-utility-panel-angled.py`.
- New `assets/source/blender/utility.utility-panel.angled.blend` and matching
  `.provenance.json`; original source stays byte-identical.
- Existing `public/game-content/oblique-utility.utility-panel.v1.json` and its
  referenced72PNGs.
- Only the utility-panel tuple in `render-control-fixtures-oblique.py`.
  Security-console tuple and all shared functions/default callbacks unchanged.
- Scoped integrity, native producer controls and later genuine UtilityRoom
  q0/q1 Build/SaveLoad + consumer-removal/exact-restoration proof.

No new buildable, palette, registry, save schema or gameplay rule is proposed.
Existing earlier utility browser acceptance remains historical; it is not
rerun here and does not establish corrected or refined source consumption.
This proposal does not edit any shared exporter tuple before authorization.
