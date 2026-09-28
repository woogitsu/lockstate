# Corridor bench, visual revision 2

The four-view reference in `corridor-bench-multiview-v2.png` and wood swatch in
`../textures/corridor-bench-wood-v1.png` were generated for this original
Lockstate asset. The front, rear and side views guide the Blender geometry;
the top view determines which features survive the game's overhead camera.

The Blender collection `furniture.corridor.bench.variants` keeps its existing
2 × 1 tile footprint and asset ID. It uses four separated timber slats, eight
exposed seat fasteners, a dark support frame, a lower tie and four floor anchors.
The wood swatch is packed into `environment.mvp.catalog.blend`; the runtime
uses only the sprite rendered from that Blender scene.
