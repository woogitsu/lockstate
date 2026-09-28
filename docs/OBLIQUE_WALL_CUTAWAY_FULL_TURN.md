# Cutaway wall module for the full camera turn

`wall.interior.module.cutaway` is the lowered interior wall variant from the existing Blender wall kit. It now has its own transparent 24 yaw × 3 elevation catalog. Poses run from -180° through 165° in 15° steps, with elevations 25°, 45°, and 65°. The catalog shares the full wall's 512 × 512 canvas, 64 px/tile orthographic projection, world-origin camera target, and exact `(256, 256)` pivot. No painter, projector, camera, HUD, or gameplay files change here.

The common module registry exposes the cutaway logical ID. The existing selector and `ensureObliqueModuleFrameTexture` use the same lazy loading contract as the full wall: only selected image requests are sent. The Blender registry producers preserve the new entry on regeneration.

## Verification

- Blender 5.2 rendered 72 frames. A second render produced identical SHA-256 digests for every PNG and the manifest.
- All 72 cutaway poses match full-wall yaw/elevation ordering, while each cutaway image hash differs from its full-height counterpart.
- Total PNG payload: **814,725 bytes**; individual frames range from 8,225 to 13,374 bytes.
- Full HD Chromium preview requested 48 cutaway frames while sweeping every yaw at low (25°) and high (65°) elevations: **537,524 bytes** transferred. It requested one image at startup, selected frames on demand, and all requests returned HTTP 200.
- The preview kept the cutaway pivot at screen coordinate `(1370, 585)` under the pointer for all 48 visited poses. Captures for yaw -90°, 0°, and 90° at each tested elevation are produced by `tooling/qa-oblique-art-browser.mjs` in the system temporary directory. At yaw 0°, the low wall has a readable pale cap and gray face; an end-on view is narrow as expected.
- The contract test failed before the manifest existed and passed after rendering. TypeScript passed.

This proves the module and preview contract. Replacement of the geometric wall placeholder in the game scene depends on the separate ObliqueWorldScene painter selecting the cutaway logical ID.
