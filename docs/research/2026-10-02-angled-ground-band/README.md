# Angled ground band audit ? 2026-10-02

## VERIFIED: saved image inspection

The inspected 2560?1080 real Build screenshot from the target-readability acceptance contains a horizontal RGB(0,0,0) strip. At y 990, 1000, 1010, 1020 and 1030 the exposed band runs from x 548 through 2195. At the same x 1800, y 980 is RGB(140,121,103), and y 1040 returns to RGB(133,113,96). The left part is obscured by the minimap; the right rail begins at 2196. See [original acceptance image](../2026-10-02-build-target-readability/target-2560.png).

## VERIFIED: source distinction

`ObliqueWorldScene` uses VOID_COLOR 0x0b0e12, not black 0. `projectObliqueWorldFrame` visits materialised chunks inside inverse-projected viewport bounds and emits exact projected tile quads. A fixed world boundary at the shown rotated yaw projects diagonally; terrain visible immediately above and below this horizontal strip does not establish an ordinary world edge. `paintGround` paints fallback quads, then authored floor Mesh2D batches at depth 0.1, then zoning/grid overlay at 0.2. No coverage/render source has been changed.

## VERIFIED: offline ground coverage and painter lifecycle

The painter clears both graphics layers, destroys previous floor meshes, paints every projected ground quad, and adds authored meshes above the fallback. No row-based clipping/filtering occurs in `paintGround`. The floor-batch builder emits four vertices and two triangles for each tile; no viewport-height threshold exists there.

`tests/unit/oblique-ground-band-coverage.test.ts` projects one actual loaded 32?32 SparseWorld snapshot at target1024/1024, yaw?45?, elevation45?, zoom1, viewport2560?1080. Independent convex-quad containment finds painted ground at fifteen points x650/900/1200/1500/1800 ? y980/1000/1040. The focused diagnostic passed (1/1). This establishes that this loaded fixture is covered above, inside and below the observed row. It does not prove the real screenshot's feed, WebGL framebuffer or screenshot compositor state, and no renderer source is changed.

## VERIFIED: actual artifact diagnosis

The bounded actual player capture ran after the assigned browser lease: New prison ? View/Angled ? Build/Brick wall ? actual square drag at 2560?1080. Page and canvas-bounds screenshots reproduce the strip before and after rotation. A Playwright canvas locator screenshot crops the composited page; it does not export the underlying canvas bitmap. Treating it as raw canvas evidence would be wrong.

A raw PNG was then exported from the same real WebGL canvas in an animation frame. It contains 826 RGB colors and correct terrain at the band rows. At x1800/y1000 it is RGB(125,105,88,255), while the composited screenshot is black. Across x650..2099 at y986, y1000 and y1035: **raw canvas has zero black pixels, page screenshot has 1450 black pixels**. Terrain also exists at y980 and y1040 in both. The raw image was opened and visually inspected.

Canvas dimensions and bounds are 2560?1080 with origin0/0. Both GPU maximum texture and renderbuffer dimensions are8192. Every containing DOM element and before/after pseudo-element at x1800/y1000 has transparent or light background; no black HTML layer was found. Rotation keeps the screenshot strip at the same screen rows. See [runtime metadata](./runtime.json), [composited page](./page.png), [raw game canvas](./raw-canvas.png), [rotated page](./rotated-page.png).

The capture run completed1/1,13.8s, one worker, unchanged test budgets. This is diagnostic capture, not a repaired production regression test. No production source was modified and no new game Issue was filed. Fresh terrain-black-band and oblique-floor-gap searches found no duplicate, but the evidence does not support claiming missing ground in the game's canvas.

## INFERENCE and limits

The discrepancy occurs downstream of the game canvas framebuffer, in host/browser composition or screenshot capture. This evidence cannot distinguish the exact compositor/driver/capture cause and does not establish that every non-headless player's physical display is unaffected. It does establish that changing ground coverage or tile painting to erase this screenshot strip would address an unproven game defect. Keep the original observation in the record and use the raw canvas when judging authored terrain for this host. No timeout, configuration, deployment, camera or art changes were used to mask the observation.
