# Wall drags through tile centres at 1920×1080 (#886)

## Decision this record supports

Choose how the Build tool should handle a player's intent to enclose a room when a four-sided outline is drawn through tile centres. The edge preview and the Rooms panel's pre-confirm enclosure warning already exist. This record proposes a further interaction choice; it does not change the game.

## Method and result

**MEASURED in Chromium on `main` at `7a9f64ee` (v0.0.759), 2026-09-25.** I ran the repository's `playtest-886-do-four-drags-enclose.playtest.ts` at **1920×1080** in a fresh prison. For this temporary run only, the playtest searched for bare canvas starting at screen x=600: the first unmodified candidate at x≈32 was exposed while Build was open but became covered by the Zones panel during the subsequent room drag. The test file was restored after the run. The chosen blocks began at tiles (11,9) and (11,15), with every wall-press target checked as `CANVAS`. Both cases purchased the same material, completed the build queue, and drew four four-segment runs.

| Gesture on a 4×4 | Commands observed | Rooms panel before Confirm | Room count after Confirm |
| --- | --- | --- | --- |
| Trace the four **outer gridlines** | 16 edge orders on the intended perimeter: north row 9, south row 13, west column 11, east column 15 | No open-side warning | **0 → 1** |
| Trace through the four **boundary tile centres** | 16 orders, but south lands on north edges of row 18 instead of row 19 and east on west edges of column 14 instead of column 15 | `OPEN ON AT LEAST ONE SIDE` | **1 → 1**; refusal says a finished wall or door is needed along every side |

The two modes submit the same number of orders. This is an *edge-choice error*, not a truncated drag or a missing construction order. Moving the test block clear of the HUD made the room-designation gesture itself reliable. The result agrees with [the earlier issue retest](https://github.com/woogitsu/lockstate/issues/886#issuecomment-5819767607), now at the requested Full HD size.

**VERIFIED in code.** `pickEdgeAtWorld` selects the nearest edge, resolving exact centre ties toward north and west; `pickEdgeOnAxis` repeats that choice for horizontal and vertical drags. `BuildOverlay` already paints those actual segments during a drag. The armed Build hint already says “Click a tile edge to place a wall. Drag along it to lay a run.” The Rooms panel already exposes an `open` enclosure result before Confirm. These existing cues are truthful. The remaining mismatch is that “draw the outline of my room through these tiles” and “pick four tile edges” are different gestures, and the former has no unique edge for a single centre-line run.

## Two owner choices

### A. Add a wall-perimeter gesture (recommended)

Offer **Perimeter** beside the existing **Line** wall mode in Build, with Perimeter the first suggested route for enclosing a room at Full HD. The player drags one rectangle around the intended tiles; before release, a four-sided edge ghost and total segment/material count show the exact perimeter. On release, issue the existing edge build orders for its boundary. Keep Line for corridors, partitions, doors and repairs. No new world geometry or save shape is required: the game already represents a perimeter as those edge orders.

This directly matches the failed player's intention and reduces four ambiguous drags to one gesture. It requires a visible mode control, a rectangle preview, duplicate-edge/cost handling and a browser test that takes a new player from walls to an enclosed Cell. Existing line users retain their route. The mode's label and hint are new player-facing copy, so their final wording belongs with the owner's decision.

### B. Refuse an ambiguous centre-line wall run

Keep Line as the only wall gesture. When its initial press falls near a tile's axis midpoint, show both candidate edge rails and require the player to move/press near one gridline before committing; do not spend material on the ambiguous run. Once an edge is chosen, retain the current run preview and orders. This is a smaller change and makes accidental inner walls impossible, but players must still construct four sides and learn edge placement. It introduces a failed gesture and needs an accessible explanation for touch, keyboard and mouse.

## Recommendation and limits

**Recommend A.** At 1920×1080, the game has room for an explicit Line/Perimeter choice. The present hint, ghost and pre-confirm warning did not prevent the centre-drag failure in the measured interaction. A gives the player a direct route from “draw my room” to a perimeter; B protects their budget but leaves the core mental-model gap in place.

**UNKNOWN:** A cold player has not yet tried either new interaction. This is a scripted reproduction, not a usability study or evidence about which label they will discover first. A's cost and duplicate handling also need an implementation spike before a final behavior change. The deciding evidence would be a cold-player attempt to enclose one Cell without coaching, with success, wrong-edge orders, and use of the mode control recorded.
