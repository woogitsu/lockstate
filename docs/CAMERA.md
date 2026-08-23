# Camera and coordinate contract

The renderer owns camera state; it is not prison simulation state and must not be written to saves as authoritative gameplay data.

- World coordinates are continuous logical coordinates. Tiles are integer cells, including at negative positions. How many world units a tile spans is a presentation choice owned by the renderer (`TILE_SIZE_PX`, see [RENDERING.md](./RENDERING.md)), not part of this contract.
- **Zoom scales about the centre of the viewport, not its top-left corner.** Every conversion between screen and world therefore needs the viewport size, which is why `CameraState` carries it: `world = (screen - origin) / zoom + origin + scroll`, with `origin` the middle of the viewport. This mirrors Phaser, whose camera defaults `originX`/`originY` to `0.5`.
- `CameraState.scroll` is Phaser's `scrollX`/`scrollY`. It is **not** the world coordinate at the viewport's top-left corner unless `zoom` is exactly 1 — `scroll + viewport / 2` is the world point at the viewport *centre*, at any zoom, so the corner moves as the player zooms. Ask `visibleWorldBounds` for the corner. `zoom` is positive screen pixels per world unit.
- `worldToScreen` and `screenToWorld` are inverse transforms. Their screen coordinates are logical CSS pixels relative to the camera's viewport, so device-pixel ratio and backing-canvas resizing do not change world coordinates. The main camera's viewport is the whole canvas, so a Phaser pointer's coordinates need no adjustment.
- `visibleWorldBounds` is the culling contract for grid and future chunk renderers. It scales with the viewport, never with the theoretical world size, and equals Phaser's own `camera.worldView`.
- Zoom operations preserve the world point under the screen cursor after explicit min/max clamping.

## The transforms are pinned to a real camera, not only to themselves

`src/rendering/camera/coordinates.ts` reimplements Phaser's camera maths as pure functions, so the renderer can convert coordinates without a live Phaser instance and the rules stay headlessly testable. The cost is that the module can be internally consistent and disagree with the engine that draws the frame — which is what issue #115 was. The two functions were each other's exact inverse and both modelled zoom as scaling about the corner, so the build cursor was displaced by `origin × (1 / zoom − 1)`: zero at zoom 1, half a screen at zoom 0.5.

Two layers hold it, and neither is sufficient alone:

- `tests/unit/camera-coordinates.test.ts` asserts **absolute** expected coordinates worked out by hand. A round trip through the pair's own inverse is not a check — it passes for any invertible transform, including a wrong one, and that is precisely the assertion that let #115 ship.
- `tests/browser/camera-coordinates.spec.ts` compares the pure functions against a **real Phaser camera** in a real browser at zoom 0.2, 0.5, 1, 2 and 3: `screenToWorld` against `camera.getWorldPoint`, `visibleWorldBounds` against `camera.worldView`, and a real mouse move against both. It also reads `originX`/`originY` off the camera, so changing the camera's origin fails a test instead of silently moving every build cursor.

A change to these functions that is checked only headlessly is not checked.
