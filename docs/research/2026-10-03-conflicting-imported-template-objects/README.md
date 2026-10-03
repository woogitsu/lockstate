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

## Separately measured V8 exact-owner tie, pending narrower grant

After the exact prior fix4fc26ab78f, actual Cell Bed is removed through packed RemoveObject at11,12; independent normal Bed is genuinely purchased/completed at11,11 with sourceOrderId=independent-rebuilt-bed. Both actual old and new construction orders remain completed. A damaged imported save additionally contains the old physical Bed row. Both rows have identical anchor/type/orientation, but different exact sourceOrderId values; both V8 envelope permutations decode normally.

The existing comparator ties, retaining whichever row appears first. Actual packed CancelBuildOrder names an original template square with its actual revision: old-row-first Load cancels the old template and removes both physical objects; new-row-first Load cancels the old template and retains the independently rebuilt Bed. Both treasuries stay23405. [Specific remaining1RED/17GREEN](./equal-owner-baseline.txt),291ms/2.38s. [Exact before/after owner/order/command tuples](./equal-owner-command-tuples.json) retain the raw snapshot SHA. This is imported-data normalization, not a claim that legal current commands create duplicates or that a file's conflicting owner fields prove original physical ownership.

Requested narrower source scope: append optional exact sourceOrderId code-unit ordering to the established comparator (absence canonical empty), without modifying any stored owner field, current/legacy provenance validation, or refusal/copy/schema. No such field tie implemented yet. No new Issue: existing1487 remains the canonical imported-conflict surface.

## Granted exact V8-field tie and producer proof

After the published specific remainingRED, root granted only the final optional sourceOrderId code-unit tie-break after the reused anchor→objectId→orientation order, absence canonical empty. Comparator reads the explicit saved string only; it changes no saved field or V8 shape and makes no ownership inference. Original invalid-row dropping remains.

[21GREEN](./owner-tie-fixed.txt),421ms/2.58s. Seven actual integration cases plus14 original registry units now cover original imported type/orientation ambiguity, equal explicit old/new owner rows with real collective Cancel, normal current-owner rebuild/old-Cancel preservation, nonconflicting absent-owner atomic refusal, and equal exact/absent saved-owner conflict with existing atomic refusal in both permutations. Unknown refusal compares full gameplay snapshot except kernel dispatch progress; direct physical RemoveObject remains available after refusal. Ordinary rows retain exact stored owner/orientation bytes. A corrupted import's canonical row is not evidence of the original physical owner; no legal duplicate-current-command claim is made.

Disconnect ONLY the actual final saved sourceOrderId reader, retaining the earlier object/orientation ties: [2RED/19GREEN](./owner-tie-negative.txt),409ms/2.52s. Exact bytes restored in finally, [matching hashes](./owner-tie-restore.json); mutation detached from branch sweep. [Restored21GREEN](./owner-tie-restored.txt),411ms/2.47s. Wider existing ownership/template/migration/build/docs gates follow this coherent checkpoint; no browser/hosted CI claim.

## Inherited renderer fixture failures and scoped legal correction

First broader gate [222GREEN/4RED](./neighbours.txt),11.04s/11files: all four failures are room-template-rebuilt-render-identity's normal replacement purchases at the mirrored90° original Bed anchor. The newly integrated1651 occupancy guard correctly refuses the standalone Bed whose far square is on a completed perimeter wall; the replacement order does not exist before any Load/render call.

Attribution is independently measured: temporarily use ONLY the original b8f796 registry blob, run the unchanged16-case renderer test and obtain [same4RED/12GREEN](./renderer-inherited-baseline.txt),3.38s. Finally [byte restore](./renderer-baseline-restore.json) to the committed current comparator hashB2270802354EBD39E519DD333AB9D1506F05F23BE85A8D166CB679C28815AE4D/source diff0. Therefore these are inherited invalid purchase fixtures, not a comparator regression, and neither renderer nor collision production is weakened.

Root granted only three invalid purchase setup poses to use legal unmirrored90° (current known-owner, pending ghost, legacy ownerless). The actual authored Bed anchor is14,11, with the standalone normal Bed's second square14,12; q0 remains11,11 and11,12. Independent literal anchor and real floor/physical-clear assertions are added before those purchases. Other mirrored direct-removal/legacy-facing/invalid-owner controls remain unchanged. Every original model count/key/owner/orientation/footprint/SaveLoad/absence assertion is retained; sixteen cases remain. [Corrected16GREEN](./renderer-corrected.txt),3.33s. This is a fixture correction supporting existing1980 coverage, separate from the canonical comparator producer proof; no new renderer production edit/native claim.

## Terminal original bounded source gates

[226GREEN/11files](./neighbours-terminal.txt),11.09s/two workers:

- tests/integration/conflicting-imported-template-objects.test.ts
- tests/unit/objects-placed-object-registry.test.ts
- tests/unit/objects-room-capacity.test.ts
- tests/integration/room-template-replacement-order-ownership.test.ts
- tests/integration/room-template-occupied-cancel-atomicity.test.ts
- tests/integration/room-template-rebuilt-render-identity.test.ts
- tests/integration/room-template-economy-transitions.test.ts
- tests/integration/template-deferred-history-order.test.ts
- tests/integration/object-placement-loop.test.ts
- tests/migrations/save-v7-to-v8-object-ownership.test.ts
- tests/determinism/canonical-iteration-contract.test.ts

Both application/tools TypeScript pass. [Production client build](./build.txt) passes5.50s with existing plugin/chunk warnings. Initial documentation gate61GREEN/1missing own research-rowRED,20.20s; [original retained](./docs-initial.txt). Granted own row alone gives [62GREEN/eightfiles](./docs-terminal.txt),13.40s. No existing registry citation fails or requires correction; no historical anchor/budget/guard changes. Final index receipt closure follows. No native/hosted CI claim; ordinary current legal commands still do not create duplicate physical saved rows. Source leases released with committed production diff0.

## Final own-index receipt closure

Final index names the existing1487 record, measured inherited fixture errors and exact correction without erasing those original results. [Final62GREEN/eightfiles](./docs-final.txt),15.01s, with unchanged quote/citation budgets and tolerances. No current registry line citation required amendment. Source hash remainsB2270802354EBD39E519DD333AB9D1506F05F23BE85A8D166CB679C28815AE4D, committed production diff0; source/test/docs leases released. No new duplicate Issue, foreign branch mutation, browser/native/CI claim or save/copy/tariff change. No native fixture proposed for legally minted duplicates because this surface is explicitly damaged/imported saved data; actual strict codec/restored-kernel commands provide the measured boundary.
