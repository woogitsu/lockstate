# Classroom chair: authored angled art

The existing `object.chair` has a wooden generic visual. This increment authors a steel and molded-seat Classroom visual variant without changing object identity, footprint, cost, capabilities, or saved state. The visual comparison is [old versus new](./old-versus-new.png); the [pose sheet](./poses.png) shows twelve views.

## Source and geometry

- Blender source: `assets/source/blender/furniture.classroom.school-chair.blend`.
- Source SHA-256: `d28bc849cc54701a8efa26504905dcfb8887847b540a6e1253e216c2b6bd16d1`.
- Evaluated bevel mesh bounds in tile units: X `[0.15, 0.85]`, Y `[0.144, 0.846]`, Z `[0, 1.044]`, within its unchanged 1 x 1 footprint.
- Exporter: `tooling/blender/render-classroom-chair-oblique.py` at 256 x 256 px and orthographic span 4 tiles, so `nominalPixelsPerTile = 256 / 4 = 64` exactly. Camera target is `[0.5, 0.5, 0.58]` and pivot is `[128, 128]`.
- Manifest: `public/game-content/oblique-furniture.classroom-chair.v1.json`, with twelve yaw angles, six elevations, 72 individually hashed transparent PNGs. Repeated export yielded the same manifest SHA-256, `8a7d1738e89d5f8dc6dd32e4d5bfad9c055f0052a13176cdc86ccbefb092a898`.

## Checks at this checkpoint

The catalog integrity unit test passed. Mutating a frame SHA produced a failing byte-integrity assertion; restoring the manifest passed. Mutating the exporter span to 3.7 produced the expected scale mismatch (`256 / 3.7` versus 64); restoring 4 passed. The production registry resolves the new manifest, while contextual projection selects it only for completed `object.chair` instances wholly within a published `room.classroom` rectangle. The original wooden asset remains selected in other rooms or for planned chairs. A context test first failed 1/5 before the selector was added, then passed 5/5. Rendered-art registry validation found 40 valid entries.

## Actual player route at Full HD

The final `tests/browser/classroom-chair-player-build.spec.ts` uses the repository's normal 60-second case and 10-second assertion budgets. In the real 1920 x 1080 application, a player started a prison, placed the `Classroom` plan at (4,4), advanced time with the real speed buttons, and waited for every worker queue transition. Four chair orders completed at (5,7), (5,8), (7,7), and (7,8). The [completed view](./player-completed-fullhd.png) showed all four authored chairs; the independent teal-pixel counts in their four rectangles were `[729, 1038, 693, 857]`, each above the 350-pixel gate. Save/Load retained all four placed-object anchors and produced the same counts in the [loaded view](./player-loaded-fullhd.png).

The bounded baseline passed 1/1 in 46.7 seconds. Mutating only the production Classroom mapping to the old wooden chair made the same browser test fail with zero qualifying pixels instead of over 350. The original mapping was restored, and the same route passed 1/1 in 44.3 seconds. The red run did not alter object identity, price, construction state, or save format. The earlier, slower experiment was not used as acceptance evidence because it overrode the browser budgets.
