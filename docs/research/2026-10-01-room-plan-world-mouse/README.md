# Room-plan mouse bridge, Full HD

The integration branch combines the angled production composition root, square-wall Build bridge and the full twenty-plan catalogue. It is an integration draft; upstream save-format decisions and full CI still apply.

## Real browser evidence

`tests/browser/room-template-world-mouse.spec.ts` uses the production app at 1920x1080 and real pointer events. The first two cases select Basic cell, arm Place on map, show the complete 28-square ground footprint, read a worker catalogue-material quote, submit exactly one PlaceRoomTemplate, refuse a second overlapping placement, cancel with Escape and Save/Load. The catalogue case opens each of the twenty plans, checks its full ground extent, including a shell-free 8x8 yard, and verifies complete furniture occupancy: three squares in a basic cell and twenty in the canteen.

The two screenshots are the real armed ghost before placement. They prove UI and ground projection integration; they do not establish completion of Blender furniture artwork.

## Regression evidence

Removing `tool.arm()` from the real Place on map button made both production pointer cases fail: the world ghost stayed hidden. Restoring it made both pass. The full twenty-plan catalogue case also passed on the restored source.

A separate pending-preflight regression initially submitted the old cell after selection changed to Yard. A tool selection-revision guard now drops that stale request. All four RoomTemplateTool unit cases pass.

The quote is the catalogue value of required materials, not a promise of the final debit: held inventory can reduce what procurement buys. Mouse input keeps middle/right drags available for camera control and all validation remains in the worker.

Final production evidence: the complete five-case suite passed (5/5, one browser worker). The top-down/oblique pair also passed after adding real HUD yaw and elevation changes before the angled mouse placement (2/2). Additional Canteen and Yard cases submit the selected plan by mouse; Yard zoning completion remains an upstream coordinator responsibility. Seven focused tool, boundary, worker, catalogue, locale and completed-transaction suites passed 97 tests.

CI #1902 exposed a stale semantic-input consumer claim: main does not reference SemanticActionEvent; the new ObliqueWorldScene is the second, alternative production consumer. The explicit source-surface contract and INPUT documentation now name both concrete scenes, preserving rejection of any third consumer. That guard was red before correction and green afterwards. The new square count label was changed to genuine English/Polish plural entries rather than adding flat-count debt. The generated player-string record was refreshed using its generator; 118 focused contract and UI tests pass.
