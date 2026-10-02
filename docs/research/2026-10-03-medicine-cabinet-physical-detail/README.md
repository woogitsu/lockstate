# Medicine Cabinet physical detail ? source checkpoint

2026-10-03, isolated base `99999723d4e7355a30300faebf93aaa0b0259cf6`.

## Scope and original authorship

The existing `medicine-cabinet-wooden` / `object.medicine-cabinet` / `fixture.medicine-cabinet.variants` remains a 1?1 medical-supply fixture. Its previously accepted source already fits the shared 64-pixels-per-tile camera and has outward surfaces. This is a physical-detail refinement, not a correction of an alignment or winding defect.

The immutable original `assets/source/blender/fixture.medicine-cabinet.variants.blend` has SHA256 `17670457233caef94855cdaf64b2cf1bd3c8623318941cbd3ce2e5c50224ac75`. It contains nine cabinet meshes and eleven foreign bed meshes. Only `cabinet_body`, `inner`, the three `shelf` meshes, two `door` meshes and two `handle` meshes belong to the selected cabinet assembly. The bed objects are excluded from the new dedicated scene; the original file remains byte-identical. Historical cabinet-refresh branches contain the earlier environment catalogue and concept/flat assets, not this dedicated angled scene.

The new dedicated source `assets/source/blender/fixture.medicine-cabinet.angled-detail.blend` has SHA256 `f03b6fc2d33d83c069b181073616ae95031839e130d890b9f5374cfd947be5ea`. It retains all nine selected meshes and their raw vertex/topology/material assignment/modifier data and all three complete existing material node graphs: cabinet warm white, cabinet inset and brass handle. No additional material or palette is introduced.

## Actual modeled detail and measured geometry

There are 57 additional physical meshes: 28 hinge pieces, 12 handle mounting pieces, 14 rear service frame/louver/fastener pieces and three toe service pieces. The original two brass pulls remain intact. Together the scene has 66 meshes and 6804 evaluated polygons. The first unaccepted builder draft copied a Desk object prefix; it was corrected to `angled-medicine-cabinet.` before this checkpoint. Its scratch log remains preserved separately.

Original evaluated bounds are `[-0.4099999964,-0.3849999905,0.0300000310]` to `[0.4099999964,0.4325000048,1.2100000381]`. The accepted rigid Z grounding is `-0.0300000310`. New source bounds are `[-0.4099999964,-0.3849999905,0]` to `[0.4099999964,0.4325000048,1.1799999475]`; measured target is `[0.5,0.5,0.5899999738]`. After the shared unit anchor translation, bounds are `[0.0900000036,0.1149999946,0]` to `[0.9099999666,0.9324999452,1.1799999475]`. All four quarter-turn occupied rectangles fit 1?1.

The native Blender auditor checks actual original/new source hashes, selected mesh identities, retained raw data and material graphs, prepared transforms and evaluated position hashes. Evaluated normals include modifiers and inverse-transpose object transforms. All original 54 faces and all new evaluated polygons point outward; the new minimum outward normal distance is `0.0019998252`. Maximum retained evaluated translation error is `1.1920928955e-7`. The actual 72 camera directions and shared 256px / 4-tile span pass verification at 64 pixels per tile.

## Real negative controls and inspected previews

Producer-only reversal of the left lower hinge moving-knuckle faces fails the evaluated normal guard (exit 1), while keeping its raw vertex bytes unchanged. A separate loaded-only reversal after source-hash validation also fails (exit 1). Exact builder and wrapper byte restoration passes native `--verify` (exit 0), and both original and dedicated source bytes remain equal to baseline in all phases. Receipts are in [winding-controls.json](winding-controls.json) and [source-audit.json](source-audit.json).

Both actual source previews were opened and inspected: [front](source-front-preview.png) shows the retained pulls plus real hinge barrels and handle mounting pieces; [rear](source-rear-preview.png) shows the raised service louvers and frame. They are Blender source previews, not built-player evidence.

Canonical 72-frame export, byte-repeat, descriptor integration, PNG integrity controls and genuine worker Build/SaveLoad acceptance remain pending at this source checkpoint. No hosted or native-player completion is claimed. Browser lease remains with the parent.
