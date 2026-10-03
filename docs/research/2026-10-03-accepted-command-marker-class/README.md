# Existing #1996: complete SessionCommands newer-action class audit

Read-only production diagnosis on published `b8115afaad90ecedb0af86d5451684679ecb6422`, 2026-10-03. No production edit, migration, locale, pricing, browser or release claim. The parent requested a whole-class inventory and reviewed design before any source implementation.

Fresh open-Issue search for Undo/refused found #1996 and the distinct pending #1985. #1996's full body and ADR0104's accepted changed-command amendment were read. No duplicate Issue is created. V8 Load is before the subsequent command in every saved reproduction; #1985's persistence of an earlier accepted-action marker is not changed or inferred here.

## Inventory of all nineteen current command types

The existing protocol packs nineteen variants. SessionCommands currently exempts five construction/history commands, marks five reversals only on accepted outcomes, and marks the remaining nine upfront. This table records actual domain contracts read from the current producers; it does not claim every successful path was newly run in this diagnostic.

| Command | Current marker | Actual result contract and unchanged boundary |
| --- | --- | --- |
| PlaceBuildOrder | History owns marker | Accepted order is registered; failed placement opens no gesture under ADR0104. |
| PlaceObject | History owns marker | Queued placement registers an order; refused full-footprint admission changes no history. |
| PlaceRoomTemplate | History owns marker | Accepted full-plan obligation owns a transaction; preflight refusal leaves history/Redo intact. |
| Undo | History owns marker | Existing eligible transaction is reversed; no-transaction/eligibility/ownership/occupancy refusal does not become a newer unrelated action. |
| Redo | History owns marker | Existing admitted transaction is reapproved; conflict/no-transaction refusal does not become a newer unrelated action. |
| CancelBuildOrder | Accepted cancellation only | Valid current-revision cancellable order passes existing collective preparation; absent/terminal/stale/occupied/unknown-owner refusal preserves eligibility. |
| CancelMaterialPurchase | Accepted cancellation only | `ok:true` refunds a real pending delivery and performs existing coupled withdrawal; not-pending/collective refusal preserves eligibility. |
| RemoveObject | Accepted removal only | `removed`/`order-cancelled` are real changes; absent or collective refusal preserves eligibility. Standing removal keeps existing best-effort relocation. |
| RemoveWall | Accepted removal only | Existing object-first arm or real shell cancellation changes the world; absent/collective refusal preserves eligibility. |
| UnzoneRoom | Accepted removal only | `unzoned` removes actual instances; invalid/empty/occupied refusal preserves eligibility. Genuine spare relocation is a success-side effect, not a pure preparation claim. |
| ZoneRoom | Upfront | `zoned` creates a real instance/zoning; `refused` is unchanged. No successful no-op domain variant exists. |
| AdmitPrisoner | Upfront | `admitted` allocates a real entity/intake; immediate `no-accommodation`/`population-full` refusal is unchanged. Later intake processing is separate. |
| PurchaseMaterials | Upfront | `ok:true` charges/adds a delivery; `ok:false` preserves funds/deliveries. Positive quantity success is a real purchase. |
| SellMaterials | Upfront | `ok:true` withdraws stock/credits funds; `ok:false` changes neither. Positive quantity success changes stock even if a future zero-valued material existed. |
| HireStaff | Upfront | `hired` creates a real employee/charges hiring cost; `refused` is unchanged. |
| ReleaseGuardAssignment | Upfront | `released` drops a genuine claim/route; unknown/not-held refusal is unchanged. The service itself decides existing claimant teardown. |
| DismissStaff | Upfront | `dismissed` destroys a real employee and performs existing cleanup; unknown-staff refusal is unchanged. |
| EditRegimeBlock | Upfront | `refused` is unchanged. `applied` may canonically reproduce the same category set: array allocation alone is not a saved gameplay change. |
| DismissAlert | Upfront, deliberate acknowledgement | `dismiss` returns the count marked, possibly zero. Existing event-log and SessionCommands contracts explicitly treat an absent/already dismissed row as success and housekeeping as a later action; retain this exception, rather than introducing a refusal or changing its policy. |

Producer contracts inspected: `src/simulation/runtime/session-commands.ts`, `src/simulation/protocol/commands.ts`, `src/simulation/rooms/zoning.ts`, `src/simulation/prisoners/prisoner-operations-runtime.ts`, `src/simulation/economy/procurement.ts`, `src/simulation/staff/hiring.ts`, `src/simulation/security/guard-release.ts`, `src/simulation/staff/dismissal.ts`, `src/simulation/prisoners/regime-registry.ts`, and `src/simulation/events/event-log.ts`.

## One bounded actual reproduction across each remaining class

Packed PlaceRoomTemplate completes a mirrored90-degree Yard at5,5. Its actual reversible zoning transaction is the newest gesture. The live or genuine encodedV8 continuation then sends one command below. Full non-kernel gameplay snapshots remain equal across each refused/no-op command; this verifies funds, world, history, runtime registries and template metadata, rather than merely inspecting the private marker. Immediately packed Undo should reverse the Yard under the existing changed-action rule. Actual: it remains zoned.

| Actual command class | Observed immediate result | Live/V8 Undo reproduction |
| --- | --- | --- |
| Re-zone the same actual Yard | `zone.duplicate-instance-id` | 2 RED |
| Admit into Yard-only prison | `admit.no-accommodation` | 2 RED |
| Buy1000 real bricks against actual initial funds | `purchase.insufficient-funds` | 2 RED |
| Sell1 absent wood plank | `sell.insufficient-stock` | 2 RED |
| Hire the existing catalog doctor role | `hire.no-duty-for-role` | 2 RED |
| Release a genuinely hired then dismissed guard | `release-guard.unknown-guard` | 2 RED |
| Dismiss that genuinely departed guard again | `dismiss.unknown-staff` | 2 RED |
| Edit known schedule at non-boundary1 | `edit-regime-block.unknown-block` | 2 RED |
| Reapply exactly the existing block categories in reverse input order | No refusal; canonical saved timetable unchanged | 2 additional RED under changed-action semantics |

Eight actual refusal routes produce16 RED. Canonical-same regime editing contributes2 distinct semantic no-op failures for the reviewed design to address explicitly. No-command controls genuinely Undo the Yard (2 GREEN). Absent DismissAlert acknowledgement controls genuinely keep it (2 GREEN), preserving the existing intentional exception. Final `baseline.txt`:18 RED/4 legal GREEN,2.60s; only the expected post-Undo room count fails. The whole post-command snapshot/refusal guards pass first. App TypeScript exits0.

Some valid packed consumer cases (unsupported doctor duty, absent schedule boundary) cannot be selected from a currently correct native menu; this is kernel/queued-command coverage, not a native-input claim. The stale guard references derive from actual HireStaff/DismissStaff commands, with no entity injection. The Yard-only intake refusal remains reachable through ordinary admission when a prison has a non-accommodation room.

### Fixture errors retained honestly

The first exploratory run addressed treasury through a nonexistent snapshot member; four otherwise legal controls failed that test-only dereference. `fixture-error.txt` preserves it. A subsequent stricter refusal check guessed overlap, but identical room identity is refused earlier as `zone.duplicate-instance-id`; `zone-fixture-error.txt` preserves those two test-only expectation errors. The permanent fixture now pins the actual existing refusal and reads pre-command funds directly from the real treasury. Neither initial error counts as a production finding.

## Concrete shared mechanism proposed for parent review

Scope: SessionCommands only, plus genuine regression tests and evidence. No source edits yet.

1. Move existing routing into an inner dispatcher returning a small transient command effect: unchanged, changed, history-owned, or accepted acknowledgement. This is not saved, sent on the wire, or inferred from snapshots/refusal counters.
2. The outer existing handler is the single writer of the newer-action marker, only after changed/acknowledgement. Existing history-owned commands still let ConstructionSystem manage their real transactions. The initial unconditional complement marker and the scattered special reversal writers are replaced together.
3. Domain branches derive their effect from their existing explicit `kind` or `ok` outcome, after preserving all current mutation/refusal/event ordering. A refused command returns unchanged; a real successful purchase/admission/zoning/employment/removal returns changed. No inference from a reused refusal-log count, order sequence, location or generation is used.
4. EditRegimeBlock reads only its targeted existing block and compares the successful canonical returned category set to that block. Equal membership means unchanged, including reordered/duplicate input. This bounded category comparison is not a whole-game snapshot or hash and changes no RegimeSchedule/save field.
5. DismissAlert explicitly returns accepted acknowledgement, including count0, retaining its existing deliberate policy and no-refusal behavior.
6. An exhaustive command-policy record over `SimulationCommand['type']` makes new command kinds choose their effect family at compile time, preventing a new unconditional complement from silently marking refused future commands.

Before accepting implementation, run genuine success controls for each remaining outcome family, including actual changed regime, alert acknowledgement, guard claim release and repeated refusal/no-op after an already accepted newer action. These must still prevent reaching older templates. Existing five reversal controls remain intact. Mutate the actual shared producer toward premature marking and toward never marking successful changes, observe both directions red, then restore source bytes exactly and run bounded neighboring history/domain tests. No workflow, timeout, V9 or new copy is proposed.

## First coherent source checkpoint

The coordinator approved the reviewed typed-dispatch design within the existing #1996/ADR0104 rule, including the DismissAlert exception and targeted canonical regime comparison. Implementation touches only SessionCommands. The inner route returns a transient effect; exactly one outer writer records changed/acknowledgement. After the fifteen domain branches narrow the protocol union, the four remaining construction/history branches end in a `never` assignment, so a future unhandled command variant fails TypeScript rather than taking an unconditional fallback. Public command/wire/save APIs are unchanged.

Initial fixed22/22 GREEN2.58s (`fixed.txt`); application TypeScript exits0. Complete actual success/history coverage of all nineteen types, the two real producer negatives, exact restoration, neighboring/build/docs gates remain pending at this source checkpoint. No full acceptance claim yet.

## Complete accepted-command controls checkpoint

The expanded fixture executes every current command type through actual packed commands, live and after encoded V8 Load: nineteen types × two continuations, plus the original22 refusal/no-op/acknowledgement cases. `successfulTypes: Record<SimulationCommand['type'], true>` and the action switch's `never` check require new protocol kinds to acquire a genuine accepted control. No registry, worker state, event, entity or ownership is injected.

The first expanded run was52 GREEN/8 fixture failures (`success-fixture-error.txt`), not eight production defects. PlaceObject/RemoveObject incorrectly attempted a bed outside every room; ReleaseGuardAssignment incorrectly expected an empty sector to claim a guard; DismissAlert incorrectly expected automatic template zoning to emit an ordinary zoning event. The corrected scenarios genuinely complete an earlier Cell for admitted residents and legal furniture, hire/admit before selecting a real held guard, and designate an ordinary earlier Yard to produce the event being dismissed. The standing bed at19,19 is removed; the separate legal bed is ordered at20,19 inside the earlier Cell. No production rule is relaxed to accommodate these errors.

Final accepted controls60/60 GREEN3.33s (`accepted-controls.txt`); application TypeScript exits0. Each accepted non-history action is followed by both a canonical-same regime edit and a genuinely refused purchase; packed Undo still cannot cross the previously accepted action. All five history-owned commands retain their actual independent Undo/Redo behavior. Guard release clears a real claim, dismissal removes the real employee, standing bed removal changes the physical registry and actual alert dismissal records its real event ordinal. Absent DismissAlert remains the explicit count0 acknowledgement control. Producer negatives, exact restoration and bounded neighboring/docs/build gates are still pending here.

## Actual producer negatives and terminal runtime evidence

All three mutations change the real leased SessionCommands adapter in an isolated detached HEAD. Each is applied independently from the same original bytes, restored in `finally`, and followed by a byte equality check. No test, protocol, domain producer or saved field is changed to manufacture the failure.

| Actual producer mutation | Observed result | What the genuine commands detect |
| --- | --- | --- |
| Include `unchanged` in the single outer marker writer |18 RED/42 controls,3.69s|Eight refused routes and the canonical-same regime edit block eligible Yard Undo, live/V8.|
| Disconnect the single outer marker writer |30 RED/30 controls,3.28s|All fourteen accepted non-history types lose their existing later-action boundary; the original absent-alert acknowledgement controls also fail.|
| Disconnect the targeted canonical category equality reader |2 RED/58 controls,3.23s|Only the unchanged timetable edit incorrectly becomes a newer action.|

Exact final restore60/60 GREEN3.31s (`restored.txt`). `producer-restoration.json` records the checkpoint, independent statuses, production diff0 and matching before/after SHA256 `c46e801353fc1b6475c488bc748bef6c28c5a22562da076ee7ea4525afc14d1e`. The named branch is restored; no production mutation is left active.

Bounded neighboring gates120/120 GREEN across twelve actual files,13.21s (`neighbors.txt`): existing occupied cancellation/refusal and manual Unzone selection, Undo recency, Redo admission atomicity, room zoning, guard release, hiring, dismissal, admission, regime editing/producers and procurement sell-back. Application TypeScript and tools TypeScript each exit0; production client build GREEN7.58s. These are source/kernel/domain checks, not native browser or remote CI acceptance.

The first original eight documentation gates yielded61 GREEN/1 failure13.24s: only the new record's absent research-index row (`docs-before-index.txt`). All source-anchor, quotation and citation guards already passed, so no live-fragment correction is proposed. No budget, allowlist, guard or historical citation is changed. Final index/documentation gate is pending this checkpoint.

Preparation boundaries retain their existing sequencing: collective cancellation/removal and successful un-zoning may genuinely relocate residents or unzone instances before their guaranteed accepted reversal; they are not described as pure queries. The shared marker uses the explicit accepted outcome after that sequence, never a refusal count or whole-session snapshot. A valid current-revision cancellable order has no further domain refusal between accepted collective preparation and its existing construction cancellation. Ordinary malformed/unknown/refused commands acquire no independent gesture here. The separately pending #1985 Load persistence question remains outside this scope.

## Final bounded documentation gate and nineteen-type outcome audit

Parent granted only the own research row in the existing continuous table. The first insertion left a blank line before that row; the index guard caught it (`index-fixture-error.txt`,61 GREEN/1 row-placement failure,5.00s). The row is now contiguous with all existing rows preserved. Final original eight documentation gates62/62 GREEN10.39s (`docs.txt`), with process-local `GIT_NO_LAZY_FETCH=1` and the exact published own branch fetched. No anchor/quotation/citation change was needed and no foundation test, budget or guard was edited. Testing stops after these bounded green gates.

| Current command | Final accepted effect | Refused or unchanged effect |
| --- | --- | --- |
| PlaceBuildOrder |history-owned|History registers only accepted orders; this adapter writes no unrelated-action marker.|
| PlaceObject |history-owned|Existing refused placement writes no gesture.|
| PlaceRoomTemplate |history-owned|Existing authoritative refusal writes no gesture.|
| Undo |history-owned|Existing history/collective refusal retains eligibility.|
| Redo |history-owned|Existing atomic preflight and history refusal retain eligibility.|
| CancelBuildOrder |changed after current-revision cancellable membership and accepted collective preparation|unchanged for absent/terminal/stale/collectively refused targets.|
| CancelMaterialPurchase |changed on existing `ok:true`|unchanged on existing refusal.|
| RemoveObject |changed on existing actual removal/order cancellation|unchanged on absent or collective refusal.|
| RemoveWall |changed on existing object-first removal or shell cancellation|unchanged on absent or collective refusal.|
| UnzoneRoom |changed on existing `unzoned`|unchanged on refusal.|
| ZoneRoom |changed on existing `zoned`|unchanged on refusal.|
| AdmitPrisoner |changed on existing `admitted`|unchanged on immediate refusal.|
| PurchaseMaterials |changed on existing `ok:true`|unchanged on refusal.|
| SellMaterials |changed on existing `ok:true`|unchanged on refusal.|
| HireStaff |changed on existing `hired`|unchanged on refusal.|
| ReleaseGuardAssignment |changed on existing `released`|unchanged on refusal.|
| DismissStaff |changed on existing `dismissed`|unchanged on refusal.|
| EditRegimeBlock |changed on existing applied, different canonical targeted categories|unchanged on refusal or equal canonical categories; other blocks are not compared.|
| DismissAlert |explicit existing acknowledgement, including count0|No new refusal/no-op policy is introduced.|

The source's final narrowed command switch uses `never`; the test's complete `Record` and action switch also require explicit coverage of a future command type. All nineteen accepted cases have live/V8 packed controls, including real claimed-guard release and real alert dismissal. The original absent-alert acknowledgement and canonical-same edit remain distinct, proven controls. No browser, remote CI, merge, release or V9 claim is made.
