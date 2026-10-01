# Full HD placement preview fit: owner review draft

This is a review draft. No new placement hotspot or automatic camera policy is approved for production here. The world grid and all room dimensions remain unchanged; camera fitting is presentation only.

The largest authored plan is cell-row-four, 7 by 16 squares (112), with four cells and a corridor. The real current screenshot demonstrates that default zoom can clip its far end below the Full HD map area. The small catalogue diagram still shows the entire plan, but it does not resolve visibility of the actual placement footprint.

## Variants to compare at 1920 by 1080

| Variant | Cursor meaning | Camera behaviour | Honest limitation |
| --- | --- | --- | --- |
| 1: origin square and bounded zoom | The cursor names the first plan square as today. | Only zoom out far enough to fit when allowed bounds permit. | Near an edge, the minimum camera zoom may still clip the footprint; report fits false rather than claiming success. |
| 2: centred plan and zoom | The cursor names the centre of the whole plan. The submitted origin remains its real top-left world square. | Zoom out to fit around that hotspot. | This changes the placement hotspot. Close to a screen edge it can still require a safe-target constraint. |
| 3: pan with locked anchor | The original world origin is frozen during fit until the next physical pointer movement. | Pan and zoom to show the entire plan inside a measured unobscured map rectangle. | The origin no longer follows the stationary cursor during the fit; moving the pointer resumes ordinary targeting. |

The camera agent is preparing a pure computeObliqueFit result with camera state, required zoom, actual projected bounds and a fits flag. The HUD agent prepares a separate explicitly enabled prototype adapter and actual game screenshots, retaining existing approved labels. No production default will select a new variant until the owner chooses after these proofs are ready.

## Proof requirements

- Actual Full HD game, real oblique projection and world grid.
- Preserve the complete 112-square authored footprint and mirror orientation.
- Measure all four projected bounds against the unobscured playfield rectangle, not merely SVG element count.
- Include a central target and an edge target that exposes each policy's limitation.
- Record camera zoom and exact submitted world origin; camera changes must not alter room dimensions, material quote or world square size.
- Use one browser worker shared with art and camera agents.

Screenshots and measurements pending the public camera fit API. This draft is intentionally incomplete and must not be called an integrated feature.
