# Whole wall squares and the far tiles of furniture

## VERIFIED: existing issue and actual baseline

The isolated baseline is integrated `76358386b8`, including completed-template
doorway ownership, legacy occupied Undo and completed adjacent-plan refusal.
Fresh GitHub reads opened the complete existing
[#1705](https://github.com/woogitsu/lockstate/issues/1705), #1608, #1669, #1687,
#99 and #1703 bodies. The #1657 re-read timed out; its full body had already
been read in the preceding completed-adjacency task. No duplicate Issue is
created. #99's salvage choices are outside this physical collision correction.

Designate a Yard through `ZoneRoom`, place a two-tile desk at (11,11) through
`PlaceObject`, then submit a full-square brick wall at its far tile (12,11).
On the baseline the wall actually completes and writes square structure 1
inside the desk footprint. This occurs for pending, encoded pending, encoded
in-progress, encoded completed, saved partial Undo/Redo, and saved completed
Undo/Redo states.

The same actual command is accepted inside Reception desk fixtures created by
`PlaceRoomTemplate`, normal/mirrored and all four rotations, after encoded
reload. Both the submitted-fixture interval and genuine completed furnishing
reproduce it. The coordinator has already released its pending rectangle, so
its reservation does not conceal the missing object check. Independent authored
6x6 reference positions identify the desk's far tile rather than deriving the
expected collision from the production footprint helper.

Baseline diagnostic `681d6fc9aa` records 22 red cases and four legal controls.
Adjacent square walls and existing legacy edge walls finish beside the desk.
Actual `RemoveObject` releases the footprint while pending or completed; a
later square wall can then finish, including after encoded reload.

## VERIFIED: source, mutation and restoration

Published correction `2e2d058870` adds a square-only reader to construction:
`src/simulation/construction/system.ts:619`,
`this.objectFootprintClaims?.(order.location) === true`. It refuses with the
existing `unbuildable` reason before material allocation or transaction
registration. The ordinary failed-order record remains the existing command
contract; this is not the complete-plan refusal rule from #1703.

`src/simulation/objects/object-placement-service.ts:896`,
`public claimsObjectFootprint`, reads the standing registry and existing
`ordersBuildingObjects` walk. That walk already resolves every footprint tile
with saved orientation, excludes cancelled/failed/completed orders, and leaves
completed occupancy to the real registry. Removing a completed object therefore
releases its tile even though its historic completed order still exists.
There is no second persisted reservation or duplicate footprint geometry.

The session wires that same service at
`src/simulation/runtime/new-session.ts:1630`, `construction.setObjectFootprintClaims`.
Restoration builds the same session, so encoded reload gets the same check.
Legacy edge walls bypass the square-only branch. Existing template shell work
does not self-block; no coordinator change is made.

The regression compares original orders and history, world, simulation and
entities across the refused command and checks the existing worker refusal.
The ordinary desk failure and its clear square survive encoded reload.
The mutation disconnects the production session wire and repeats 22 failures
with four legal controls still green in 3.58 seconds. Exact new-session byte
restoration has SHA256
`7B114BF9DA8048EA8A9F28652F098F344BD630361BB40A25DB304CC4C6372F2F`.
Restored verification passes 420 tests in eleven files in 24.57 seconds:
the new footprint regression, object placement, construction, construction
geometry, object registry/capacity, template session/completed transactions,
completed adjacency, rotated collision atomicity and rotated history.
Application/tools TypeScript and production build pass.

Five live documentation fragments shifted with the construction reader and
are re-anchored, retaining preceding coordinates in explicit historical
amendments. The generic rack index row is copied exactly from published root
`f5dba207fa`; its browser/art evidence is inherited, not rerun by this task.
No budget or guard changes.

## Limits

No browser, workflow, schema, player text, tariff, salvage, cancellation/refund
or history-policy change. No CI polling or merge. The weakest claim is native
presentation: this proves real commands and encoded runtime behavior without
a browser capture. A browser accepting a full-square wall on these same saved
desk tiles would require an independent UI command/worker investigation.
