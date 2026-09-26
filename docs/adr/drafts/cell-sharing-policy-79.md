# Draft: the player decision in cell sharing (#79, ADR 0027)

**Status:** two owner choices requested; no policy accepted by this draft. The
owner already chose a recorded assessment with later reassessment on
2026-09-25. This draft does not replace ADR 0027 or reserve an ADR number.

## Current playable state

`IntakeSystem` ranks available cells using `rateCellSharing` and the occupants
already assigned there. The rating currently uses classification distance.
`RoomInstanceRegistry` stores a room rectangle and its occupants. The player
cannot inspect the rating, assign a particular prisoner to a particular cell,
or see a cell-specific consequence in the incident system. These are the live
parts of #79 after the original capacity-only defect was fixed.

The existing incident trigger samples a **security sector**. A
`SecuritySectorDefinition` has a post tile and doors, but no area or list of
cells. A room rectangle can identify its own tiles; it cannot yet say which
sector owns it. Using the closest post tile would invent a sector boundary and
can choose across a wall. This is why a risk number cannot simply be added to
the present sector sampler.

The owner chose **record at assignment and reassess when circumstances change**.
The in-flight PR #1376 introduces V7 for another save change. The assessment
must be added after that branch lands, with the next migration and deterministic
reassessment triggers. This choice does not answer the two policies below.

## Choice 1: how a player overrides the assessment

### A. Automatic placement with an explicit transfer command (recommended)

Intake keeps ranking cells and placing a prisoner without pausing time. The
cell/occupant panel shows the recorded rating, the reasons and the last
assessment time. The player can choose another valid cell with a new command;
the command records an override, and that placement's risk can affect later
incidents. Capacity, security and reachability remain hard constraints.

This preserves the current intake flow and makes the risky choice deliberate.
It requires a transfer UI, command codec and deterministic replay path. A
recorded rating remains inspectable after reassessment.

### B. Hold high-risk placements for approval

Intake leaves a prisoner awaiting accommodation when every candidate exceeds
a threshold. The player approves one proposed cell or chooses another; the
approval is a command. The UI must show an explicit pending queue and a safe
default when the player does nothing. The threshold and its label need a
separate, testable product definition.

This gives the player control before co-occupancy but can stall the intake
loop. It also requires the same command/replay work plus a new waiting state.

Both options keep the rating visible and allow a consequential override, as
#79 requires. Neither silently forbids a risky cell.

## Choice 2: how a cell's risk reaches a security sector

### A. Assign a cell room to a sector explicitly (recommended)

Each cell room gets a sector id. A prison with the default sector assigns it
automatically; where several sectors exist, the player can change the
assignment in the room/sector UI. The assignment is saved and migrated,
validated when a sector disappears, and read by the existing sector risk
sampler. The recorded cell-sharing risk contributes only to the assigned
sector. A room's rectangle does not become a new definition of sector area.

This makes the relation visible and editable instead of guessing it from the
post tile. It adds room-sector state and UI, and needs tests for reassignment,
sector removal, save/restore and replay.

### B. Derive a sector from geometry

Define a spatial sector area, then map each cell rectangle to exactly one
sector. The mapping must be deterministic across walls, doors, topology
changes and save/restore, and must say what happens when a cell spans an area
boundary. This is a larger change to what a security sector means throughout
deployment, occupancy and incidents, not just cell sharing.

### C. Defer the incident coupling

Record and display assessments and permit overrides now, but leave the
incident trigger unchanged. This is a valid delivery stage, but #79 remains
open because risky pairings have no consequence through the existing trigger.

## Implementation and acceptance after the choices

1. Land #1376 first. Add the assessment snapshot, stable reason codes,
   reassessment triggers and migration at the next version; preserve the
   original assessment separately from its latest revision.
2. Exercise two real prisoners in a cell with two placed beds. Show the rating
   and reasons before and after a deterministic change of classification or
   affiliation. Save between those events and obtain the same result on load.
3. Add the chosen player command/UI and sector relation. Assert that replay of
   the same seed and command stream produces the same allocation and incident
   outcomes, with a real browser test at 1920×1080.
4. Keep first-night accommodation (#81) and the content of rating band names
   as separately decided work. This draft grants no implicit answer to them.
