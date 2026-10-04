# Full-template order identity admission

Measured on published `124c898d6f9ceadc1651430fce53101992105e80`, 2026-10-04. Verified nonduplicate [Issue#2031](https://github.com/woogitsu/lockstate/issues/2031).

## Original actual kernel failure

Actual packed `PlaceBuildOrder` buys a square brick wall at2,2 with a valid nonempty ID `room-template-000000000001-0-wall-005`. The next actual command buys `cell-basic` at10,10, mirrored, clockwise90°. The geometric worker query returns clear without writing. Template expansion tries to reuse that owned ID; `ConstructionSystem.submitOrder` throws `BuildOrder ... already exists` after inserting earlier shell orders. The independent wall is outside the template rectangle.

With `room-template-000000000001-2-object-000` instead, the purchase admits18 shell orders and records a pending template despite an existing future furniture ID. Completion cannot submit that fixture. The regression requires the complete generated identity set to be admitted before any shell/history/stock/funds/owner mutation.

Original6-case source run is4RED/2GREEN,339ms case execution. Both failures reproduce after actual encoded currentV10 Save/Load. The two legal controls use a different ID, complete a mirrored270° Cell, encode/load, Undo and Redo while preserving the independent completed wall and exact furniture owners. No world/stock planting, renderer feed replacement, browser, build or native input was used. Current UI ID minting is not claimed to produce this collision; this is a valid command/restored order-book boundary.

## Scope and deduplication

Fresh remote full search and Issues#514/#2027 were read. #514 concerns duplicate geometry under different IDs; #2027 concerns malformed empty IDs and historical opaque queues. This case uses distinct geometry and a legal nonempty ID already owned by an independent purchase. Parent granted only `RoomTemplateCoordinator.place`: check all generated shell **and future fixture** IDs before the first submission, preserving existing refusal/copy and independent ledger. No identifier namespace restriction, historical migration, save/wire format, tariff, HUD or camera change.

Executed original source and output are retained in `raw/`. Diagnosis checkpoint `227b68be2b` preceded production fix `0c0dd5c894`.

## Actual fixed and negative results

The production change adds five lines to `RoomTemplateCoordinator.place`: find any pre-existing ID across **all** generated orders and return existing `structure-occupied` before submission. The geometric query intentionally has no command sequence and continues to answer only geometry; release still calls real authoritative placement. Active and terminal order IDs remain owned by their existing ledger rows. No global namespace restriction or historical queue rejection was introduced.

The final8 cases add two real cancelled-order controls, live and encodedV10Load. Fixed8GREEN,2.70s. At detached exact `0c0dd5c89470ec08d6dd5675f306abaf41fa0caa`, disconnecting the real `claimedOrder` reader produces6RED/2legalGREEN. All four original collision cases and both cancelled-history cases fail again; legal independently owned purchases still pass. A `finally` byte restoration returns8GREEN,2.64s, with source SHA256 `264b4a68fc675e8590a5a9e11b92e67306b0e628f64c6cded5b3c625c9d0bf3f` before and after, production diff0, then the own branch is restored. The full pre/post snapshots compare world, treasury, procurement/stock, order state, exact revisions, marker, history, room/template metadata and object ownership; kernel command consumption is excluded deliberately.

Bounded existing neighbors:130GREEN across six suites,6.61s: `room-template-session`, `room-template-build-plan`, `room-template-completed-transaction`, `room-template-rotated-collision-atomicity`, `room-template-redo-admission-atomicity` and `room-template-replacement-order-ownership`. Application and tooling strict TypeScript both exit0. No full catalogue160-case rerun, browser, server, build, hosted CI or latency claim.

The original report's future fixture completion failure is source-derived: the existing `ObjectPlacementService.preflight` returns `duplicate-order` for that owned ID when the coordinator later attempts furnishing. This regression measures immediate admission atomicity, not a timed completion journey for the conflicting fixture. Original legal controls do exercise actual completion/Undo/Redo and encodedV10Load.

Raw original/fixed/omission/restored results, byte restoration receipt and current executed regression source are retained under `raw/`; `sha256.json` pins these actual bytes. All neighboring and type outputs are actual executed results. No native user gesture is claimed.

Final bounded documentation checks (`documentation-links-contract`, `documentation-source-anchor-contract`, `documentation-anchor-quotation-contract`) are25GREEN/3suites,9.75s with `GIT_NO_LAZY_FETCH=1`. No citation coordinate correction, budget, tolerance or allowlist change was required.
