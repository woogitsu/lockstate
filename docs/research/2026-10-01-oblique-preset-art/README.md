# Oblique room preset art integration, 2026-10-01

This checkpoint exercises four built room plans through the actual `ObliqueWorldScene` and the current Blender module registry at 1920×1080. The browser harness instantiates each plan's square walls, zoning, and fixtures. It does not simulate workers constructing the plans or the production Build dialog.

| Plan | 45° yaw, 45° elevation | Additional view |
| --- | --- | --- |
| Classroom | [Screenshot](classroom-basic-fullhd-yaw45-elev45.png) | 135°/65° and −45°/25° checked in the browser test |
| Kitchen | [Screenshot](kitchen-basic-fullhd-yaw45-elev45.png) | [135° yaw, 65° elevation](kitchen-basic-fullhd-yaw135-elev65.png); −45°/25° checked |
| Infirmary | [Screenshot](infirmary-basic-fullhd-yaw45-elev45.png) | 135°/65° and −45°/25° checked |
| Laundry | [Screenshot](laundry-basic-fullhd-yaw45-elev45.png) | 135°/65° and −45°/25° checked |

The four browser cases pass at all three poses. At each pose they require every projected built wall and fixture to have a loaded catalog frame, require the number of textured images to match the number of built solids, and require zero fallback draw commands. The selected frame is checked against the catalog's nearest authored yaw and elevation, since some models use 30°/40° steps.

Visual inspection confirms distinct desks and shelving, kitchen appliances and sink, infirmary beds, and laundry machines. Full rear walls and reduced foreground walls follow the room zoning. The foreground walls still hide portions of low fixtures in these small rooms, especially the right laundry machine and kitchen sink. Their PNG frames load correctly; further cutaway and depth tuning is needed to make all fixtures easy to read at every angle. The square wall shapes are currently plain and repetitive. These screenshots prove asset integration, not visual completion of the game or release readiness.

Reproduce with `tests/browser/oblique-preset-art-qa.spec.ts` (single Playwright worker). The standalone HTML/TypeScript harness is in the same test directory.
