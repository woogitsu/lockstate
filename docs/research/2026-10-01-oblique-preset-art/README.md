# Oblique room preset art integration, 2026-10-01

This checkpoint exercises all 20 built room plans through the actual `ObliqueWorldScene` and the current Blender module registry at 1920×1080. The browser harness instantiates each plan's square walls, room-specific numeric zoning, and fixtures. It does not simulate workers constructing the plans or the production Build dialog.

| Plan | 45° yaw, 45° elevation | Additional view |
| --- | --- | --- |
| Classroom | [Screenshot](classroom-basic-fullhd-yaw45-elev45.png) | 135°/65° and −45°/25° checked in the browser test |
| Kitchen | [Screenshot](kitchen-basic-fullhd-yaw45-elev45.png) | [135° yaw, 65° elevation](kitchen-basic-fullhd-yaw135-elev65.png); −45°/25° checked |
| Infirmary | [Screenshot](infirmary-basic-fullhd-yaw45-elev45.png) | 135°/65° and −45°/25° checked |
| Laundry | [Screenshot](laundry-basic-fullhd-yaw45-elev45.png) | 135°/65° and −45°/25° checked |

The 20 browser cases plus a catalog coverage guard pass. Across these plans, the catalog includes 19 distinct fixture types. Every plan is checked at all three poses. At each pose the test requires every projected wall and fixture to have a loaded catalog frame, requires the number of textured images to match the number of projected solids, verifies every built fixture remains projected, and requires zero fallback draw commands. Cutaway may hide walls that obstruct fixtures. The test also compares the world's actual zoning numeric IDs against the room content registry. The selected frame is checked against the catalog's nearest authored yaw and elevation, since some models use 30°/40° steps.

Visual inspection confirms distinct desks and shelving, kitchen appliances and sink, infirmary beds, and laundry machines. Full rear walls and reduced foreground walls follow the room zoning. The cutaway rule from `7858861415` hides the two foreground squares that formerly covered the sink and right washing machine at 45° yaw; both fixtures are now fully visible in the saved screenshots. The square wall shapes are still plain and repetitive. These screenshots prove asset integration and this specific cutaway improvement, not visual completion of the game or release readiness.

Reproduce with `tests/browser/oblique-preset-art-qa.spec.ts` (single Playwright worker). The standalone HTML/TypeScript harness is in the same test directory.
