# Oblique wall module runtime art

The first production-shaped camera module is `wall.interior.module.full`.
`tooling/blender/render-oblique-wall-frames.py` isolates its existing Blender
collection and renders nine transparent 512 × 512 PNGs at yaw −45°/0°/+45°
and elevation 25°/45°/65°. The camera targets the world ground pivot at
(0, 0, 0), which appears at (256, 256) in every frame; the wider transparent
canvas fits the full height without clipping while preserving 64 px/tile.
The generated
[`oblique-modules.v1.json`](../public/game-content/oblique-modules.v1.json)
records the source SHA and each content-hashed frame URL and SHA. Re-rendering
the same source with Blender 5.2.1 reproduced all nine PNG hashes.

`parseObliqueModuleCatalog` rejects missing and duplicate poses. The runtime
`selectObliqueModuleFrame` takes `yawRadians` and `elevationRadians` from the
oblique camera state, snaps each to the nearest authored pose, and returns a
catalog-owned URL. `registerObliqueModuleTextures` preloads those URLs into
Phaser's texture manager and rejects missing images. The normal game scene's
oblique painter is being developed separately; this PR does not claim the
module is already painted in the game.

## Browser evidence

Open `/art-angle-preview.html` with Vite and run
`node tooling/qa-oblique-art-browser.mjs`. The Phaser preview uses the same
runtime catalog, selector and texture loader. At 1920 × 1080, it loaded all
nine PNGs with HTTP 200 and changed the visible texture from 0°/45° to
+45°/25° when the angle buttons were pressed. It shows an enlarged inspection
view next to the authored 64 px/tile view. The two screenshots are written to
the system temporary directory as `lockstate-oblique-wall-yaw0-elev45.png`
and `lockstate-oblique-wall-yaw45-elev25.png`.

The wall is isolated against transparency, unlike the earlier whole-cell
camera study. The raised coping, pale plaster face and blue-grey skirting
remain legible at normal scale in both tested poses. A full game proof awaits
the separate oblique world painter, which owns the scene and its draw order.
