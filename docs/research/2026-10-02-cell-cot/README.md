# Authored Cell cot visual

The existing `object.bed` occupies **1 x 2 square tiles** in `src/content/object-catalog.ts`. The old generic oblique bed had only nine poses. This increment gives that same object a full-size authored steel cot at every camera angle. It does not change the object ID, cost, construction, capabilities, collision, or save identity. The visual applies to any room using `object.bed`, including Cell and Holding Cell.

## Source and repeatability

- Blender generator: `tooling/blender/create-cell-cot.py`.
- Source: `assets/source/blender/furniture.cell.cot.single.blend`, SHA-256 `9c4b72d8631c2d14c638df4d03a73b14d5a738aac55b642c7836ce2c398f76c7`.
- Source mesh bounds: X `[0.125, 0.875]`, Y `[0.135, 1.865]`, Z `[0, 0.635]` tile units. The whole mesh stays inside the authoritative 1 x 2 occupied rectangle.
- Exporter: `tooling/blender/render-cell-cot-oblique.py`. Resolution 256 x 256, ortho span 4 tiles, exact nominal 64 px/tile, camera target `[0.5, 1.0, 0.35]`, pivot `[128, 128]`.
- Manifest: `public/game-content/oblique-furniture.cell-cot.v1.json`, 12 yaw x 6 elevation = 72 SHA-checked transparent PNG poses. Two complete rerenders produced identical manifest SHA-256 `a752a19753800e643d9de40e55cd652e0ab3803933a9942ffd1ce59c3431d0fd`.
- [Twelve-view pose sheet](./poses.png) uses only frames matching the manifest and verifies transparent border clearance. [Old and new comparison](./old-versus-new.png) shows sprites at the same nominal 64 px/tile; the old 512 px image was cropped centrally, not rescaled.

## Runtime scope and checks

The production registry includes the new manifest. The existing `object.bed` maps to `furniture.cell.cot.single`; its old `furniture.cell.bed.single.variants` manifest remains registered for compatibility. Focused consumer tests were red 3/3 before mapping and green afterward. Art source, footprint, SHA and registry tests were red 1/2 before registration, then green. Replacing the first frame SHA with zeroes made the art suite fail 1/2 on that exact frame; restoring the original bytes brought it back to 2/2. The focused suite passes 47 tests, the research index gate passes 5 tests, and TypeScript checking passes.

## Actual player proof at Full HD

`tests/browser/cell-cot-player-build.spec.ts` uses two serial cases under the normal browser test budget (no timeout overrides). First, the player starts a prison, places Storage Room and Delivery Bay plans, lets the worker complete their orders, and saves to IndexedDB. A fresh browser loads that real save, places Basic cell at `(20,5)`, lets the worker complete all orders, and confirms the existing bed object at `(21,6)` with the authoritative 1 x 2 footprint. It saves and loads again, then checks the same bed anchor and rendered frame.

The [worker-completed screenshot](./worker-completed-fullhd.png) and [loaded screenshot](./loaded-fullhd.png) each measure **1,212** authored ochre-blanket pixels in the isolated `(925,490)` to `(1000,540)` region of the 1920 x 1080 frame. Both browser cases passed. As a negative control, changing only the production `object.bed` mapping back to the old generic alias left worker construction intact but made the second case fail at the pixel oracle with **0** against the required >700. Restoring the original mapping made both browser cases pass again. The mutation was restored byte-for-byte before committing.
