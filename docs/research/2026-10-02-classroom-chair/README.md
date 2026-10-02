# Classroom chair: authored angled art

The existing `object.chair` has a wooden generic visual. This increment authors a steel and molded-seat Classroom visual variant without changing object identity, footprint, cost, capabilities, or saved state. The visual comparison is [old versus new](./old-versus-new.png); the [pose sheet](./poses.png) shows twelve views.

## Source and geometry

- Blender source: `assets/source/blender/furniture.classroom.school-chair.blend`.
- Source SHA-256: `d28bc849cc54701a8efa26504905dcfb8887847b540a6e1253e216c2b6bd16d1`.
- Evaluated bevel mesh bounds in tile units: X `[0.15, 0.85]`, Y `[0.144, 0.846]`, Z `[0, 1.044]`, within its unchanged 1 x 1 footprint.
- Exporter: `tooling/blender/render-classroom-chair-oblique.py` at 256 x 256 px and orthographic span 4 tiles, so `nominalPixelsPerTile = 256 / 4 = 64` exactly. Camera target is `[0.5, 0.5, 0.58]` and pivot is `[128, 128]`.
- Manifest: `public/game-content/oblique-furniture.classroom-chair.v1.json`, with twelve yaw angles, six elevations, 72 individually hashed transparent PNGs. Repeated export yielded the same manifest SHA-256, `8a7d1738e89d5f8dc6dd32e4d5bfad9c055f0052a13176cdc86ccbefb092a898`.

## Checks at this checkpoint

The catalog integrity unit test passed. Mutating a frame SHA produced a failing byte-integrity assertion; restoring the manifest passed. Mutating the exporter span to 3.7 produced the expected scale mismatch (`256 / 3.7` versus 64); restoring 4 passed. Runtime context selection and actual player Build, worker completion, and Save/Load remain to be verified before calling the variant integrated.

## Runtime checkpoint, not acceptance yet

A first Full HD source-browser experiment placed all four Classroom chairs through the real plan and worker, then retained four placed-object anchors after Save/Load. The screenshot showed four teal chairs. Mutating only the Classroom visual selector back to `furniture.chair.wooden` made the per-chair color assertion fail with zero qualifying pixels; the production mapping was restored. That experiment overrode the established 60-second case and 10-second assertion budgets, so it does **not** count as final browser acceptance. The checked-in browser case uses the normal budgets and advances the simulation at the normal fastest UI speed; its baseline, mutation, and restored run must be repeated under those budgets.
