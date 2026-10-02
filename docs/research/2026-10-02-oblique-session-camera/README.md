# Oblique camera across prison sessions — 2026-10-02

Production Full HD browser case: `tests/browser/oblique-camera-new-prison-frame.spec.ts` at 1920×1080. The first prison is panned beyond its 32×32 map until the minimap viewport disappears. Starting a new prison must bring the viewport back on the new map without replacing the scene.

## Evidence

- **Observed before fix:** browser case failed after 20.6 s: `.hud-minimap__viewport` remained hidden after New prison. [Off-map first prison](./old-prison-off-map-fullhd.png).
- **Fixed production:** the session availability callback asks the existing oblique scene to frame only a snapshot with a revision newer than the outgoing snapshot. Browser case passed 1/1 in 16.5 s. [Framed new prison](./new-prison-framed-fullhd.png).
- **Production mutation:** removing only the callback while preserving the scene method made the same case fail in 20.1 s; restoring it passed 1/1 in 20.3 s.

The revision gate matters because the render feed retains the outgoing snapshot until the replacement worker publishes its first world snapshot. This changes the camera position in memory only. No save field or angle preference was added. The images show the minimap and actual world after the browser actions; this case does not assert Save/Load persistence of camera pose.
