# Owner review draft: exact ownership of a placed construction object

**Status: PROPOSED, not approved or implemented.** One combined decision covers the saved owner field, compatibility/version treatment and ambiguous legacy cancellation/refusal policy below. No source, schema or player copy has been changed.

## Reproduction and published diagnostic

Base: published `41998ff60f`. Diagnostic commits `a8b45efd2cbe1c16969f9a2c59c3eb8c0d6130c5`, `acb76a586e` and final `fb1c1fdbcea24afcfb552ebb8c9e7b0a1558f79a`.

Actual packed commands complete Basic Cell at10,10, remove its old Bed, buy and complete an independent Bed at the same anchor, encode/decode/restore the save, then CancelBuildOrder for the old template fixture with its exact revision. The new order stays completed and its cost is not returned, but its physical object disappears. Normal0-to0 and rotated1-to0 replacements both fail, with current and absent legacy completed-template metadata.

Final diagnostic:12 cases, four failures and eight passing controls in3.31 seconds. A different-type Toilet replacement survives all four variants. Undo of the genuine newer Bed removes only that Bed and leaves the original template order completed, its other fixture and its room, in four variants. The latter controls prevent a blanket rule that retains any object whenever another completed order exists. The initial4-case baseline had two failures/two controls in4.61 seconds. Tools TypeScript passed at that initial checkpoint. No production mutation or fix is claimed yet.

Fresh related Issue bodies #1657, #1487 and #1658 and open same-anchor/old-order searches were read. #1657 concerns whole-template association and occupied reversal; #1487 concerns conflicting saved array order; #1658 concerns ghost geometry. This replacement ownership defect is distinct.

## What is actually persisted

`SAVE_SCHEMA_VERSION` is7. The verified field path is `payload.simulation.objects.placedObjects[]`. Its strict row schema currently stores placedObjectId, objectId, anchorTile and orientation. placedObjectId is derived from the anchor, so a replacement reuses the same ID. captureSessionSystems writes the registry snapshot into simulation.objects.placedObjects.

Construction orders persist their ID, anchor, object orientation, placementSequence and lifecycle/progress. History persists groups of order IDs. Revisions are per order, not a globally ordered completion clock. There is no persisted successful-placement owner or completion time. onOrderCompleted returns whether registry placement succeeded, but that success is not saved; onOrderReverted receives only object type and anchor.

- Orientation alone fails the actual0-to0 cases.
- Another-completed-order alone fails the genuine newer Undo controls.
- A transient map loses its proof on Save/Load.
- Largest placementSequence orders gestures, not successful physical replacement. Existing completion can be a no-op if registry placement refuses; Redo and manually removed stale completed orders must be audited. No largest-sequence reconstruction is proposed as proven.
- A single syntactically matching completed order is not, by itself, proof of successful placement. If older save data cannot prove the causal association, it remains unknown.

## Recommended combined decision

Approve an optional exact sourceOrderId on a placed object, written only when ConstructionSystem's actual completion successfully places that physical object. Carry order.id into the completion/reversion ports. A standing object's recorded owner differs from the old reversed order: preserve it as an independent purchase; do not cancel/refund its newer order. Matching owner: remove the physical object as today. Direct RemoveObject continues to remove the standing object without refund. Keep placedObjectId's anchor identity and all tariffs, geometry and history semantics.

The future saved path is `payload.simulation.objects.placedObjects[].sourceOrderId`, a nonempty string. Keep it absent for objects genuinely lacking recorded construction provenance; do not write undefined/null or fabricate ownership. Registry snapshots, capture and restore preserve it exactly. Invalid/missing/mismatched links are unknown ownership until proven, not permission to delete a physical object.

### Version and compatibility are part of this approval

**Recommend V8 with a data-preserving V7-to-V8 migration**, keeping all V1-to-V7 validators/migrations frozen. The current optional-field/no-version-bump rule in docs/PERSISTENCE requires absent to retain the old behaviour. The proposed ambiguous-owner refusal changes that old behaviour, so this draft does not claim the existing no-bump exception automatically applies. The owner could explicitly approve a current-version exception instead, but that is not the recommendation.

Migration copies all existing fields and keeps sourceOrderId absent when the old save did not record it. It must not guess by location, orientation, largest sequence, numeric template prefix or existence of another completed order. Existing saves still decode/load and residents, funds, queued work and placed objects remain. Only an association genuinely proven from persisted data may be derived. If no such proof exists, ownership stays unknown even when a convenient candidate exists. Older strict builds cannot read the new V8 output; that is the explicit format consequence of this decision.

### Unknown legacy ownership: atomic refusal, not guessing

Before any zone, shell, object, order, refund, delivery, resident or history mutation, inspect the complete old gesture's possible physical reversals. If a matching live object has unknown ownership and no persisted evidence proves the requested order owns it, refuse the whole operation atomically. Do not delete independently rebuilt furniture and do not partially unzone. This applies to coupled CancelBuildOrder/Undo and manual entries that reverse that gesture. The player's direct standing-object RemoveObject remains available; it can remove an ambiguous object deliberately before retrying. Existing cancel-price feasibility must represent that refusal rather than quote a refundable amount for an operation that will not proceed.

This is a protective legacy behaviour change and therefore requires the same combined approval; it is not described as an already settled default. It may block cancellation of an older otherwise valid template whose save lacks ownership proof. The exact legacy proof criterion must be demonstrated before implementation calls any inferred owner unambiguous.

### Proposed refusal copy in this same decision

Existing unzone.room-occupied would be false for the empty reproduction; stale-cancellation would be false at the exact current revision; build.unbuildable describes buying rather than reversing. Recommend one new reason/message key shared by the affected reversal routes: **construction.object-ownership-unknown**.

English: **This saved object has no clear construction owner. Remove it directly before undoing or cancelling this room plan.**

Polish: **Nie można ustalić, które zlecenie utworzyło zapisany obiekt. Usuń go ręcznie, zanim cofniesz lub anulujesz plan pomieszczenia.**

Both sentences are proposals awaiting owner approval. Existing occupied/use refusal text, ordinary cancellation/refunds and successful notices remain unchanged.

## Alternative: defer the combined change

Keep schema/version, legacy behaviour and player copy unchanged and defer this ownership fix. That preserves compatibility with current readers but knowingly retains the reproduced destruction of an independently purchased same-type replacement. Orientation-only or sequence guessing is not a complete accepted alternative.

## Required implementation evidence after approval

The12 packed cases must pass, including genuine newer Undo. Add recorded owner Save/Load and actual Redo/no-op/rebuild counterexamples; original-owner completion/reversal controls; unknown legacy refusal with complete immutable snapshots/revisions; provable legacy recovery only where supported; repeated/current/older version decode and frozen-validator contracts. Mutate the genuine owner check and refusal preparation independently, then byte-restore. Do not introduce the field, migration or copy before approval of this combined decision.
