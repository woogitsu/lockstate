# Existing1487: conflicting imported object rows on current template/V8 integration

Read-only production diagnosis at b8f796e14bc95939b9803ee40b9d5291c4fbd37f,2026-10-03; own branch codex/construction-next-collision-audit-20261003. No production edits, browser or hosted CI.

## Actual data boundary

Create seed73 runtime; actual packed PlaceRoomTemplate cell-basic10,10; genuine all construction completion produces exactly Bed11,11 and Toilet12,14 with V8 exact sourceOrderId fields. The existing Issue1487 concerns damaged/imported saved rows, not duplicates minted by legal current commands. Build valid checksummed V8 envelopes from that actual snapshot, replacing only the save-file placedObjects rows with two conflicting imported entries at11,11. Test both array permutations through real JSON/decodeSaveEnvelope/restoreSimulationRuntime. No live state injection or renderer replacement.

Two actual cases fail: Bed versus Toilet at the same anchor chooses whichever row occurs first; Bed orientation0 versus1 does the same. Each load drops exactly one row. Packed RemoveObject11,12 really runs after both imports: it removes the normal Bed's far tile, but preserves the alternate Toilet or rotated Bed whose footprint does not cover that square. Thus accepted Load changes subsequent removal and physical ownership solely by input array order. Treasuries remain equal; ordinary genuinely saved nonconflicting rows keep both exact owners and far-tile removal in both permutations (one legalGREEN).

[Baseline2RED/1legalGREEN](./baseline.txt),211ms tests/2.49s total. [Actual before/after tuples](./actual-import-removal-tuples.json) include physical owner/orientation rows, real command kernel sequences and treasuries; SHA256 points to the full raw snapshots retained in .local-import-collision. Application TypeScript and diff checks pass. This is a diagnostic, not a mutation-verified correction.

## Existing fix ancestry, not a duplicate new Issue

Fresh full1487 body asks deterministic conflict choice with existing invalid-row dropping, no format/copy. Current loadSnapshot sorts only anchor y/x, and stable-sort ties therefore retain imported array order. Existing published fix f76c5e6596 on codex/restore-conflicting-objects-20260927 adds objectId then orientation tie-break and a24line unit regression. That commit is NOT an ancestor of this integration (git merge-base --is-ancestor exit1); current V8 producer5a63fe6a66 only adds the optional sourceOrderId to placedObjectAt and did not remove an inherited comparator. No new Issue needed, no foreign branch changed.

Proposed root-reviewed scope: reuse the prior comparator/test rather than invent a different conflict rule, then extend only the equal-V8-row final tie with the exact optional sourceOrderId so competing provenance also resolves independently of array order. This is canonical imported-data conflict selection, not inference of actual object ownership from location/sequence and not a claim that corrupted rows become trustworthy. Existing atomic unknown-ownership refusal remains. Registry-only production lease requested; no comparator/persistence edits implemented here yet.

## Exact prior comparator/test reuse

Root granted registry-only source scope and exact f76c5e6596 comparator/test reuse first. Applied the original two-file patch without modification: anchor y/x, objectId code-unit order, then orientation; saved instanceId remains ignored because it is derived. Existing V8 sourceOrderId fields remain byte-for-byte untouched. No inference or schema/copy change.

[17GREEN/two files](./prior-reuse-fixed.txt),232ms/2.36s. Genuine production comparator negative disconnects only both tie-breaks, restoring the actual old anchor-only sorter: [4RED/13GREEN](./prior-reuse-negative.txt),226ms/2.32s (the reused two unit cases and the two actual V8 imported command cases). Detached mutation work excluded from branch sweep; finally exact bytes restored, [matching source hashes](./prior-reuse-restore.json). [Restored17GREEN](./prior-reuse-restored.txt),224ms/2.29s. Wider source/provenance/documentation gates remain pending at this coherent reuse checkpoint. An equal-type/orientation sourceOrderId tie has not been implemented: it requires separate actual diagnosis and narrower grant.
