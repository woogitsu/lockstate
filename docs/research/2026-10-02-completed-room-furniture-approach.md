# Furniture footprints preserve completed room approaches

## Fresh issue evidence and scope

Fresh REST reads opened the complete bodies of existing
[#1700](https://github.com/woogitsu/lockstate/issues/1700),
[#1710](https://github.com/woogitsu/lockstate/issues/1710),
[#1672](https://github.com/woogitsu/lockstate/issues/1672), and
[#1639](https://github.com/woogitsu/lockstate/issues/1639).
#1700 protects later furniture against a pending Cell, #1710 describes later
ordinary walls against a completed row, #1672 concerns an obstruction before
the template, and #1639 concerns authored mirrored fixture footprints.
Bounded issue searches found no exact completed later-furniture report. This
record identifies the completed counterpart explicitly, without treating the
pending-only #1700 reader as a completed-room defense.

The isolated branch starts at root `74ab00891a`, including the #1692 adjacent
plan correction. Prerequisite `6bbe678b2e` is cherry-picked as `13dac4a318`;
that is the completed wall reader already handed to the coordinator. The old
ordinary-door furniture checkpoint `49d683728a` is not an ancestor here.
Only source checkpoint `d6802fa2b6` is the new correction.

## Actual commands and observed gameplay

Each test dispatches real packed commands and completes the four-cell row,
including all eight fixtures. The shared 7x2 corridor cannot legally be a
Yard because the existing Yard minimum is 8x8. The fixture therefore builds
four ordinary perpendicular end walls and four passable boundary doors, then
designates the enclosed corridor as a legal Holding Cell. Geometry, orders,
zoning and completion are produced by the actual session, not injected.

The ordinary PlaceObject wire has no orientation field. Genuine standalone
commands use a 2x1 desk for horizontal corridors and a 1x2 bed for vertical
corridors, so the second footprint tile covers the same completed entrance.
At the unrotated lower western Cell, the desk anchor is (10,18) and its second
tile is the reserved approach (11,18). Two additional mirrored 90-degree desk
cases exercise the live placement service used by authored fixtures; they do
not add an orientation field to the standalone command.

On unchanged production all 26 bad placements are ordered and actually
complete on the approach. The obtained baseline has 26 failures and eight
legal passes in 9.40s. Cases cover both mirrors and all four room rotations,
after encoded completed Save/Load, partial construction saved and resumed to
completion, and a compatible older V7 save omitting completed metadata. Eight
neighbouring multi-tile objects actually finish and remain legal after Load.

The budgeted session navigation requests prisoner and guard routes through
the registered doors before and after actual object completion. Both contexts
still find routes through the furniture-occupied approach. This is a physical
entrance-occupancy defect under the existing approach reservation rule, not an
observed unreachable route: current navigation does not make furniture opaque.
The correction does not change traversal policy or claim to repair it.

## Shared live guard and atomicity

The combined tile reader at
`src/simulation/construction/room-template-coordinator.ts:207` preserves pending
claims and uses the same standing-door plus zoned-interior evidence as #1710.
The wall reader and furniture reader share the cardinal lookup at
`src/simulation/construction/room-template-coordinator.ts:212`. This removes
duplicate world geometry logic while preserving square and separating-edge
wall behavior.

The actual composition root wires the tile reader at
`src/simulation/runtime/new-session.ts:1630`. ObjectPlacementService already
checks every oriented footprint tile before making an order; the correction
supplies completed claims to that existing check. No save ledger, new command
field, refusal copy, history policy or navigation rule is introduced.

Every bad placement now uses the existing tile-occupied refusal, naming its
second tile. No build order is made. Tests compare treasury and all persisted
session fields except the kernel envelope, which advances its command sequence
for an actual dispatched press. The internal oriented service call leaves the
entire snapshot unchanged. Both routes remain valid after refusal and another
encoded Save/Load. Neighbouring furniture remains buildable.

## Mutation and exact restoration

Switching only the production object callback back to the pending-only reader
repeats 26 failures and eight legal passes in 10.31s. Exact byte restoration of
new-session has SHA256
`1CCD20027122F5DB4C898B1CC179FCF72DF8B5F3F636016C8340539D6243EB03`.

The restored completed-furniture, completed-row wall access, pending furniture,
completed transaction and adjacent-template atomicity suites pass 146 tests in
five files in 12.49s. Both TypeScript targets and the production build pass.
The source-anchor, quotation and commit-citation documentation contracts pass
23 tests in three files. An inherited #1692 citation initially lacked the
published pending-wall documentation branch in the local origin cache;
fetching that branch resolved the citation without a document or guard edit.
This is authoritative runtime, command, construction, navigation and encoded
persistence evidence; no browser, workflow edit, CI polling or merge was used.
