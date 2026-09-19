# Camera and coordinate contract

The renderer owns camera state; it is not prison simulation state and must not be written to saves as authoritative gameplay data.

- World coordinates are continuous logical coordinates. Tiles are integer cells, including at negative positions. How many world units a tile spans is a presentation choice owned by the renderer (`TILE_SIZE_PX`, see [RENDERING.md](./RENDERING.md)), not part of this contract.
- **Zoom scales about the centre of the viewport, not its top-left corner.** Every conversion between screen and world therefore needs the viewport size, which is why `CameraState` carries it: `world = (screen - origin) / zoom + origin + scroll`, with `origin` the middle of the viewport. This mirrors Phaser, whose camera defaults `originX`/`originY` to `0.5`.
- `CameraState.scroll` is Phaser's `scrollX`/`scrollY`. It is **not** the world coordinate at the viewport's top-left corner unless `zoom` is exactly 1 — `scroll + viewport / 2` is the world point at the viewport *centre*, at any zoom, so the corner moves as the player zooms. Ask `visibleWorldBounds` for the corner. `zoom` is positive screen pixels per world unit.
- `worldToScreen` and `screenToWorld` are inverse transforms. Their screen coordinates are logical CSS pixels relative to the camera's viewport, so device-pixel ratio and backing-canvas resizing do not change world coordinates. The main camera's viewport is the whole canvas, so a Phaser pointer's coordinates need no adjustment.
- `visibleWorldBounds` is the culling contract for grid and future chunk renderers. It scales with the viewport, never with the theoretical world size, and equals Phaser's own `camera.worldView`.
- Zoom operations preserve the world point under the screen cursor after explicit min/max clamping. The clamp comes first and the scroll correction is then computed for the clamped zoom, so the anchor holds *at* a limit and not merely inside the range. What this does to `scroll` is spelled out below, because it has already been mistaken for a defect once.

## The transforms are pinned to a real camera, not only to themselves

`src/rendering/camera/coordinates.ts` reimplements Phaser's camera maths as pure functions, so the renderer can convert coordinates without a live Phaser instance and the rules stay headlessly testable. The cost is that the module can be internally consistent and disagree with the engine that draws the frame — which is what issue #115 was. The two functions were each other's exact inverse and both modelled zoom as scaling about the corner, so the build cursor was displaced by `origin × (1 / zoom − 1)`: zero at zoom 1, half a screen at zoom 0.5.

Two layers hold it, and neither is sufficient alone:

- `tests/unit/camera-coordinates.test.ts` asserts **absolute** expected coordinates worked out by hand. A round trip through the pair's own inverse is not a check — it passes for any invertible transform, including a wrong one, and that is precisely the assertion that let #115 ship.
- `tests/browser/camera-coordinates.spec.ts` compares the pure functions against a **real Phaser camera** in a real browser at zoom 0.2, 0.5, 1, 2 and 3: `screenToWorld` against `camera.getWorldPoint`, `visibleWorldBounds` against `camera.worldView`, and a real mouse move against both. It also reads `originX`/`originY` off the camera, so changing the camera's origin fails a test instead of silently moving every build cursor.

A change to these functions that is checked only headlessly is not checked.

## An anchored zoom moves the scroll, and that is not drift

Holding a world point under a screen point while the zoom changes **requires** the scroll to move, unless that screen point is the middle of the viewport. Per axis, and derived from the transform above:

```
scroll_after - scroll_before = (screen_point - origin) * (1 / zoom_before - 1 / zoom_after)
```

This follows from the second and third bullets together: `scroll + viewport / 2` is the world point at the viewport *centre*, so anchoring a point that is not the centre has to move what the centre is looking at. It is easy to mistake for a bug, and it was: #209's follow-up measured a two-finger pinch, saw `scrollX` unchanged and `scrollY` moved by ~32, and could not say whether that was a defect or an artefact of the test — because the harness of the day exposed the scroll and not the zoom, and a scroll reading alone cannot tell a zoom from a pan. It was neither. The midpoint sat on the viewport's vertical centre line, where the x term of that product is exactly zero and the y term is not.

`tests/browser/world-scene-touch.spec.ts` pins both halves through the real pinch gesture: the world point under the fingers is held to three decimal places, and the scroll moves by exactly the amount above. It exercises the clamp at **both** ends of `ZOOM_BOUNDS` for the reason the last bullet in the contract states — `zoomAtScreenPoint` clamps *before* it computes the scroll, so at a limit the correction is the one the clamped zoom needs. Reverse that order and the camera still stops at 3, because `setZoom` receives the clamped value either way, while the world lurches out from under the fingers by the difference; a zoom-only assertion cannot see it, which is why the anchor is asserted at the clamp and not only inside the range.


## The pan is free, and the way home is drawn rather than enforced

There is no bound on `scroll`. A player can pan until the world is entirely
off screen, and issue #794 measured what that leaves: a solid black canvas, a
HUD still reading normally, and nothing saying which way the prison is. The
pan being *deterministically reversible* — 3,200px out and 3,200px back returns
the origin exactly — is not the same property as being recoverable by someone
who did not count their drags.

**What is bound instead is the answer to "where is it".** When the loaded world
is wholly outside `visibleWorldBounds`, `offscreenHomeIndicator`
(`src/rendering/camera/home-indicator.ts`) returns a screen-space point on a
ring inset from the viewport edge, on the ray from the viewport centre towards
the middle of that world, and the bearing along that ray;
`HomeIndicatorLayer` draws a chevron there at `setScrollFactor(0)`. The moment
any part of the world is visible again the function answers `undefined` and
nothing is drawn.

**The rectangle it points at is `WorldRenderView.loadedBounds` in world units**,
which is the same rectangle `frameCameraOnFirstWorld` centres a session's first
paint on and the same one `navigateToMinimapPoint` maps the minimap across. A
third definition here — the owned chunks, or a bounding box over placed
geometry — would disagree with both, and the owned chunks in particular exclude
the unowned-but-loaded ground the scene already draws.

**Why not clamp the pan**, which is the cheaper of the three shapes #794 names.
Every bound available to the renderer is that same materialised rectangle, and
for most of a session it is *smaller than the viewport*: a 32-tile starter chunk
is 2,048 world units against the 6,400 a 1280px viewport shows at
`ZOOM_BOUNDS.min`. A clamp to a rectangle smaller than the view either does
nothing or holds the camera still. It also costs something the game needs: a
build gesture reaches the simulation through `screenToWorld`, so a tile the
camera cannot be pointed at is a tile the player cannot build on, and this world
grows outwards by construction.

The marker is presentation like everything else on this page. It reads a camera
and a rectangle already read for the repaint, and writes one `Graphics` object.

**One thing the marker does not do, measured rather than assumed.** `.hud` is
`position: fixed; inset: 0` over the whole canvas and Phaser's camera viewport
*is* the whole canvas, so the ring is inset from the viewport edge and not from
the edge of the map a player can see. Read off the assembled page at 1280x720
with `document.elementFromPoint` and the bounding boxes of every opaque `.hud`
descendant: the due-north ring point `(640, 34)` falls inside `.hud-strip`
(`0,0 1280x81`) and the due-east point `(1246, 360)` inside `.save-panel`
(`1004,147 264x221`); due west and due south are clear. Pointing at the visible
map rather than at the canvas needs a safe-area rectangle the renderer can
read, and no such thing exists in this tree — it is a boundary decision, not a
constant, and `src/rendering/phaser/home-indicator-layer.ts` carries the same
measurement beside the code.
