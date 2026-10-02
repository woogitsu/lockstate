# Completed four-cell row keeps its doorway approach

## Existing issue and ancestry

Fresh REST opened the full body of existing open
[#1710](https://github.com/woogitsu/lockstate/issues/1710), which describes a
completed row at (10,10), its lower western Cell's approach at (11,18), and
the north-facing registered door edge at (11,20). The same later ordinary
wall is accepted after Save/Load. This is the existing defect, so no new
Issue was created. The accompanying search found no additional matching
Save/Load access Issue.

The isolated branch starts at root `5045385613`. Old correction `46da5c2f85`
exists locally but is not an ancestor of that root. It derived completed
approaches from a standing door and zoned interior, without a new saved
reservation, but handled only the vertical direction. This correction
retains that world-derived rule in all four cardinal directions. The pending
approach reader from #1696 stays active.

## Actual runtime reproduction

The test dispatches packed PlaceRoomTemplate and PlaceBuildOrder commands
through the real session kernel. It finishes the entire row, including all
eight fixtures, rather than treating shell completion as a finished room.
The budgeted runtime navigation system requests routes for prisoner and guard
contexts from the shared corridor into the lower Cell. Both routes must
include its exact outside approach, cross a registered door, and end at the
unoccupied furnished interior destination.

On unchanged production, the later opaque square wall on the approach is
approved and actually completed. The subsequent prisoner route returns
unreachable. The legacy separating edge causes the same actual loss of
access. This obtained baseline has 40 failures and eight passes in 9.67s:

- 32 square-wall cases: both mirrors and four rotations, each on live
  completion, encoded completed Save/Load, saved partial construction resumed
  to completion, and an older compatible V7 save omitting completed metadata.
- Eight separating legacy-edge cases after encoded completed Save/Load.
- Eight positive controls: an adjacent square and a perpendicular legacy
  edge actually finish; prisoner and guard access survives another Save/Load.

Coordinates are independent literal transforms of the authored 7x16 row.
Expected points and edges do not call the production rotation or build-plan
adapter.

## Correction and atomic refusal

Source checkpoint `6bbe678b2e` adds the combined construction reader at
`src/simulation/construction/room-template-coordinator.ts:172`. It looks from
the candidate approach through a standing perimeter door into the zoned room
interior. It rejects only an opaque square on that approach or a legacy edge
separating approach and door. Perpendicular edges remain legal. Coordinates
are checked before reading the sparse world.

The actual session construction callback at
`src/simulation/runtime/new-session.ts:1629` now consumes that combined
reader. Protection survives older saves without completed gesture metadata;
it derives from standing geometry and zoning, not a new persistence field.
The furniture reader and pending-template sequence exemption are unchanged.

The ordinary command uses the existing failed/unbuildable outcome. As for
other ordinary build refusals, one failed diagnostic order remains, but no
funding or reversible history is attached. Each test compares original
orders, history fields, treasury, world, saved simulation, and entities before
and after the refused press. Both actual routes remain valid immediately and
after encoded Save/Load. No copy, format or history policy changes.

## Production mutation and restored gates

Switching the production session callback back to the pending-only reader
reproduces 40 unreachable failures and eight legal passes in 12.74s. Exact
byte restoration of new-session has SHA256
`361A39430D9418EC2CCEC9387D389C09F8234BB760E92005B1742E003155CAD9`.

The restored completed-row access, pending later-wall, entrance-history and
completed-template transaction suites pass 111 tests in four files in
10.77s. Both TypeScript targets and the production build pass. Existing
documentation source-anchor and quotation contracts pass 15 tests before
this evidence record is added. With this record and index entry, those two
contracts plus commit citations pass 23 tests in three files. The first
citation run lacked the newly published Shower source branch in the local
origin cache; fetching that one branch resolved its two inherited citations,
without altering the Shower documentation or any contract.

This is authoritative command, construction, budgeted navigation and encoded
persistence evidence. The scope is the confirmed four-cell row defect; it
does not establish runtime route acceptance for the other nineteen templates
or native browser presentation. No browser, workflow edit, CI polling or
merge was performed.
