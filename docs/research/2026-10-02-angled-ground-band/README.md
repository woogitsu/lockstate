# Angled ground band audit ? 2026-10-02

## VERIFIED: saved image inspection

The inspected 2560?1080 real Build screenshot from the target-readability acceptance contains a horizontal RGB(0,0,0) strip. At y 990, 1000, 1010, 1020 and 1030 the exposed band runs from x 548 through 2195. At the same x 1800, y 980 is RGB(140,121,103), and y 1040 returns to RGB(133,113,96). The left part is obscured by the minimap; the right rail begins at 2196. See [original acceptance image](../2026-10-02-build-target-readability/target-2560.png).

## VERIFIED: source distinction

`ObliqueWorldScene` uses VOID_COLOR 0x0b0e12, not black 0. `projectObliqueWorldFrame` visits materialised chunks inside inverse-projected viewport bounds and emits exact projected tile quads. A fixed world boundary at the shown rotated yaw projects diagonally; terrain visible immediately above and below this horizontal strip does not establish an ordinary world edge. `paintGround` paints fallback quads, then authored floor Mesh2D batches at depth 0.1, then zoning/grid overlay at 0.2. No coverage/render source has been changed.

## UNKNOWN: runtime cause

The image alone does not distinguish a scene/mesh artifact, transient framebuffer/screenshot capture, or another compositor layer. No new Issue is filed yet. A bounded actual production capture of page and canvas at the same pose, plus nearby rotated pose, is prepared for the shared browser lease. A pixel inspection or synthetic projection passing would not establish repaired production rendering.
