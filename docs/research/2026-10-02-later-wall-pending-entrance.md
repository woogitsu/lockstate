# Ordinary walls submitted after a pending room plan

## Verified issue and ancestry

The isolated checkout starts at root `4f499a2fa5`. Fresh REST reads opened
existing #1700 (later furniture), #1663 (later zoning) and search results for
pending template wall approaches. Existing open
[#1696](https://github.com/woogitsu/lockstate/issues/1696) describes this exact
ordinary full-square wall command, so there is no new Issue. GraphQL was rate
limited; REST succeeded without CI polling.

The old `54fef47278` correction exists locally but is not an ancestor of this
root. It supplied a live construction reader and handled unrotated south doors.
The current correction ports that interface onto the existing shared mirrored
and rotated doorway geometry, rather than adding a persistent reservation.

## Obtained baseline and correction

An actual `PlaceRoomTemplate` creates a pending Cell. A later ordinary
`PlaceBuildOrder` separating legacy edge is already refused because one of its
two tiles intersects the pending rectangle. A later square wall on the outside
approach is approved: its tile lies outside that rectangle. This baseline fails
24 cases covering both mirrors, four rotations and three session stages: fresh
pending, saved pending, and a partially completed plan saved, undone, saved,
redone and saved again. Eight positive controls remain green.

Source checkpoint `e9d071eb21` wires
`setPendingRoomTemplateDoorApproachClaims` at
`src/simulation/runtime/new-session.ts:1629`. Construction asks that reader
before approving an order. The coordinator checks opaque wall squares on the
exact approach or a legacy edge separating it from the door. The original
template's placement sequence is exempt. Undo withdraws the pending claim.
No copy, save field, history policy or economy number changes.

The corrected ordinary command uses existing `failed/unbuildable`. Its failed
diagnostic order remains in the order book, as ordinary construction refusals
already do; it receives no funding or reversible history. Tests compare all
original orders, history fields, treasury, world, saved simulation and entities.
The production worker build queue remains identical across each rejected press.
Adjacent square walls and a wall placed on the released approach after Undo
are accepted in all eight orientations. A saved partially completed, undone
and redone mirrored 270-degree Cell still finishes with two fixtures after the
two refused wall commands; its approach remains clear.

## Mutation and restored gates

Disconnecting the new production session reader gives 24 failures and eight
passes, reproducing the approved later square wall. Exact byte restoration of
new-session has SHA256
`60922751481BF240B001411BE5661DEC008AF70643E26EB9333B4AFC592A6073`.

The restored later-wall, entrance-history, completed-template transaction and
reverse-order furniture-approach suites pass 72 tests in four files. Both
TypeScript targets and the production build pass. Source insertion displaced
three live quoted anchors in WORLD, ADR 0047 and the ADR index. Their source
amendments retain historical coordinates and identify the checked current
symbols; quotation budgets and guards remain unchanged.

The weakest claim is browser presentation: these are real authoritative
command, worker projection and encoded persistence results, without a new
native browser run or a deployment claim. No browser, HUD/input/art change,
workflow change, CI polling or merge was performed.
