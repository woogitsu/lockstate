# Camera and coordinate contract

The renderer owns camera state; it is not prison simulation state and must not be written to saves as authoritative gameplay data.

- World coordinates are continuous logical coordinates. Tiles are integer cells, including at negative positions. How many world units a tile spans is a presentation choice owned by the renderer (`TILE_SIZE_PX`, see [RENDERING.md](./RENDERING.md)), not part of this contract.
- `CameraState.scroll` is the world coordinate at the viewport's top-left corner; `zoom` is positive screen pixels per world unit.
- `worldToScreen` and `screenToWorld` are inverse transforms. They operate on logical CSS pixels, so device-pixel ratio and backing-canvas resizing do not change world coordinates.
- `visibleWorldBounds` is the culling contract for grid and future chunk renderers. It scales with the viewport, never with the theoretical world size.
- Zoom operations preserve the world point under the screen cursor after explicit min/max clamping.
