# Compacted dirt terrain, visual revision 1

`dirt-terrain-multiview-v1.png` is an original four-view material reference generated with OpenAI image generation on 2026-09-24. It shows true overhead dirt, low oblique detail, a soil section and a 3 × 3 repeat preview. The reference informed muted warm brown earth, fine grit and faint scuffs; it is not runtime art.

The playable `terrain.dirt.compacted` sprite comes from `environment.mvp.catalog.blend`. Its Blender material uses periodic four-dimensional noise: sine and cosine of each tile coordinate feed the noise texture, so opposing edges receive identical values. A few small deterministic mineral grains stay inside the border. The 1 × 1 render has no transparent margin and replaces the colour fallback only for unzoned `dirt`; zoned rooms keep their institutional floor, and other terrain keeps its fallback.
