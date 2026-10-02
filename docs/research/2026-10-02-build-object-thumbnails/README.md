# Authored Build catalogue thumbnails

Source checkpoint: HUD receives only an optional authored image URL through HudBuildableViewModel. The composition root retains the verified oblique catalogs already loaded for production boot. A presentation-only helper resolves the existing object mapping and a 45-degree catalogue pose; the catalog selects its nearest authored frame. UI does not read scene or simulation internals. Unknown objects, top-down mode without catalogs and image-load errors retain the existing hammer icon. Accessible names, catalogue costs, occupied dimensions, selection and keyboard controls remain unchanged.

Existing row/tap geometry is retained: image fits tap-target minus the existing two vertical gutters, with no additional row or header height.

Verification: 155 focused thumbnail/token/boundary/catalogue tests and TypeScript pass. Source mutation removes the authored URL return: real-catalog assertion fails undefined; restoring it passes2/2. Actual Full HD bench/station selection and PNG proof is pending a browser lease, so this source checkpoint is not runtime completion.

Authored frames include transparent export margins (station256px, bench512px). The UI now trims nonzero alpha bounds once after same-origin decoding, keeping the real object aspect ratio inside the unchanged row box. Empty or failed images keep the hammer. Alpha bounds unit mutation substitutes whole-image8x8 for real4x2 bounds: one assertion red; restore passes. Actual image-failure fallback is included in the pending player test.
