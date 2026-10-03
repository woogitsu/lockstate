# Loading dock door export

The existing `utility.loading-dock-door.variants.blend` stays the authored
source. `render-loading-dock-door.py` reuses the kitchen fixture exporter to
place its centred geometry inside `object.loading-dock-door`'s 3 x 1 footprint.
The export applies X scale 1.5 and translation (1.5, 0.5, 0), preserving height
and depth. Evaluated mesh vertices, including modifiers, are checked before
rendering.

Run with Blender 5.2.x:

```text
blender --background --python-exit-code 1 --python tooling/blender/render-loading-dock-door.py -- --verify
blender --background --python-exit-code 1 --python tooling/blender/render-loading-dock-door.py -- --preview
blender --background --python-exit-code 1 --python tooling/blender/render-loading-dock-door.py
```

The preview goes to ignored `assets/intermediate/loading-dock-door-preview`.
Production exports use 256 x 256 RGBA frames, 64 pixels per tile, pivot
(128, 128), camera target (1.5, 0.5, 0.89), and the shared square-fixture yaw
convention. The 72 poses retain transparent borders. Normalized PNGs receive
content hashes in their filenames.

Measured on 2026-10-02 with Blender 5.2.1 LTS (`9e2066aef7ef`): evaluated
export bounds were (0.075, 0.28, 0) to (2.925, 0.67, 1.78). Two complete render
passes produced identical frame hashes and manifest bytes (manifest SHA-256
`ef169cde855e75cea8bd27a99e129cbe48f13f3782b4e473fba1e4592a14d625`).
Increasing X scale to 2.0 caused verification to exit 1 with bounds
(-0.40, 0.28, 0) to (3.40, 0.67, 1.78); restoring 1.5 passed.
The manifest integrity test failed on the original camera target (1, 0.5, 0.5)
and passed on the corrected source-backed exports.

The preview was visually inspected. Player placement and save/load acceptance
remain a browser check; these geometry and byte checks do not establish it.
