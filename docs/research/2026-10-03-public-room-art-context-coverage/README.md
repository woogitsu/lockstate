# Actual public room art context coverage — 2026-10-03

## Catalogue decision

Verified base `a7db8b1fe3c2ee7340213b71dad4580a40d6bc10`, including the published remote root branch. The actual catalogue has 18 rooms and 20 public templates, with no Library or Workshop room/template. Classroom's `bookshelf-wooden` is a purpose-built bookshelf, not an Office placeholder: the current genuine source has 63 meshes, 9 stored material graphs, fourteen books and physical shelf/back joinery. Read-only Blender 5.2.1 inspection and its existing physical-detail record confirm the actual source and bounds; no source modification or new render was performed. Its original authored geometry already serves the Classroom function.

Classroom has dedicated student chairs and a separately purchasable teacher desk; Storage has dedicated racks; Garbage has refuse trolleys; Kitchen and Infirmary have dedicated fixture models. Staff Room's ordinary wooden chairs are functionally appropriate and its desk uses the employee model. Reception registration desk is the existing published work, imported as a dependency here. A new coursebook station would duplicate an already served function without a confirmed material defect. No additional asset is proposed.

## Concrete integration gap

`tests/unit/room-template-oblique-art-coverage.test.ts` currently derives 19 fixture types from the 20 plans, then checks only `obliqueCanonicalAssetIdForObject`, the DEFAULT mapping. It does not check the actual room selector, completed structures, rotated occupied rectangles, or mirrored plans. Existing individual context tests provide focused controls but do not close this full public-template coverage gap.

Own scope: an independent literal expectation table and integration coverage for all 20 plans, four rotations and both mirror states; actual world projection, registry/descriptor/source and canonical frame integrity. Genuine context and registry omission controls must fail, followed by byte-exact restoration and GREEN. No model, palette, price, catalogue, protocol, UI, renderer or gameplay edits. No browser/server; native acceptance belongs to root.

## Evidence status

Catalogue/source inspection complete. Regression coverage, actual production mutations, exact restoration, type/build checks and final counts are pending. No native result is claimed.
