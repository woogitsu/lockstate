# Angled ground band audit ? 2026-10-02

## VERIFIED: saved image inspection

The inspected 2560?1080 real Build screenshot from the target-readability acceptance contains a horizontal RGB(0,0,0) strip. At y990,1000,1010,1020 and1030 the exposed band runs from x548 through2195. At the same x1800, y980 is RGB(140,121,103), and y1040 returns to RGB(133,113,96). The left part is obscured by the minimap; the right rail begins at2196. See [original acceptance image](../2026-10-02-build-target-readability/target-2560.png).

## VERIFIED: source distinction

`ObliqueWorldScene` uses VOID_COLOR0x0b0e12, not black0. `projectObliqueWorldFrame` visits materialised chunks inside inverse-projected viewport bounds and emits exact projected tile quads. A fixed world boundary at the shown rotated yaw projects diagonally; terrain visible immediately above and below this horizontal strip does not establish an ordinary world edge. `paintGround` paints fallback quads, then authored floor Mesh2D batches at depth0.1, then zoning/grid overlay at0.2. No coverage/render source has been changed.

## UNKNOWN: runtime cause

The image alone does not distinguish a scene/mesh artifact, transient framebuffer/screenshot capture, or another compositor layer. No new Issue is filed yet. A bounded actual production capture of page and canvas at the same pose, plus nearby rotated pose, is prepared for the shared browser lease. A pixel inspection or synthetic projection passing would not establish repaired production rendering.
