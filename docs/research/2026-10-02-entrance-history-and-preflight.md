# Entrance claims through Undo, Redo and a later furniture placement

## Accepted history rule and obtained controls

The isolated checkout starts at published `3e713f62fc`. Live reads of #1657
and #1700 were compared with the existing full reversible room transaction
and construction history implementation. No new history or persistence rule
is introduced here.

Two actual command flows use a mirrored Cell: a partially completed normal
plan and a fully completed quarter-turned plan. Both pass through real save
envelopes and decoding. Undo removes the whole template and releases its
pending approach claim. After another Load, Redo restores the room obligation
and claim; Save/Load keeps that claim, and construction finishes with exactly
two fixtures. These controls already passed before this correction.

A new accepted `PlaceObject` after Undo is a new construction action, so it
clears the old Redo stack. That existing rule is preserved. A subsequent actual
Redo leaves construction/history, world and encoded simulation exactly
unchanged in both flows. Reapplying the earlier room despite the new furniture
would contradict the existing history rule, rather than repair it.

## Reproduced gap: existing #1672

After the Cell is undone, a later chair can legitimately use its now released
outside approach. Before this correction, a fresh `PlaceRoomTemplate` there
still reported clear preflight and submitted eighteen new shell orders across
that blocked entrance. Measured order counts changed from 19 to 37 in the
partial flow and from 21 to 39 in the completed flow. The four failed cases
cover a still-building and an already-standing chair, after encoded Save/Load.

Checkpoint `c1548595c9` shares the rotated outward doorway geometry between
the pending claim and incoming preflight. The latter checks both active object
footprints and standing objects, returning the existing `object-occupied`
reason on the doorway square before any order is submitted. An unsafe outside
coordinate uses the existing bounds refusal. No command, save or player-copy
field changes, and no duplicate issue is created for #1672.

## Obtained correction evidence

The eight history/entrance cases and nine reverse-order approach cases pass.
The four rejected-placement cases compare the complete saved simulation,
construction orders/history, world, entities and treasury across paused
command dispatch; the preflight read itself changes no snapshot field.

Suppressing the production incoming-approach check restores the four failures
and eighteen wrongly submitted shell orders, while the four history controls
stay green. Exact byte restoration is verified with SHA256
`C9D9E92075A0C5AFAFD5F7196C0F8BBE824BBDA2C149C60A6C6D681E5D28D7E7`.
Restored history, approach, full completed-template transaction and safe-origin
suites pass 41 tests in four files. Both TypeScript targets pass.

No browser, input edit, workflow edit, CI polling or merge was performed. This
establishes the actual command/snapshot boundary, not browser or deployment
acceptance. Inherited documentation limitations of the starting checkpoint
were previously recorded and are not changed by this scoped evidence.
