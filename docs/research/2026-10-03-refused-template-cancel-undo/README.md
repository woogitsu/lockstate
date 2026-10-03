# Refused template cancellation changes Undo selection eligibility

Read-only packed runtime diagnosis on published `39448e8956da264c1833a71cf9d4bb6faa30a689`, 2026-10-03. No production edit in this checkpoint.

## Actual reproduction

1. Purchase 648 bricks, await real delivery, then place mirrored 90° `cell-row-four` at (10,10).
2. Actual scheduled construction completes its shell and first bed, with three beds still materials-pending. Admit a real resident and await occupancy one.
3. Place and complete an independent ordinary full-square wall at (2,2). This is the newest accepted construction gesture. Funds stay −1,245 because its two bricks come from genuine purchased stock. The original physical bed retains its exact template source-order owner.
4. Continue live, or encode/decode/restore V8 NOW, before the next press.
5. Cancel the original completed template bed by actual current order revision. Existing occupied-room protection correctly refuses `unzone.room-occupied`; the captured gameplay snapshot is unchanged except kernel bookkeeping.
6. Immediately Undo. Expected: reverse the newer independent wall, retain the occupied template and its owners. Actual: the wall remains completed; the attempted cancellation set the hidden newer-action flag before its refusal, so Undo refuses.

Targeted baseline **2 RED / 2 legal GREEN**, 4.91 s. Both no-refusal controls, live and saved, correctly Undo only the independent wall. No fake world, treasury, history, owner or resident state was injected. The encoded Load is BEFORE the refused cancellation, so this is not #1985's loss of a previously accepted newer-action marker after Load.

## Existing accepted rule and deduplication

ADR0104's accepted option 2 uses the newest accepted command. Its 2026-09-23 amendment explains that this means the newest command which changed something; refused placement leaves eligibility as it was. Existing source comment on `noteActionThatDoesNotWriteTheUndoStack` also says accepted commands. This cancellation changes no prison or transaction and has already reported its refusal.

Full fresh bodies #1657, #1986, #1990, #1975, #956 and #1985 were read. Refused/Undo issue search found no matching cancellation report. #1657 protects the coupled reversal, #1990 preserves selection across deferred construction, #1986 guards conflicting Redo, #1975 protects physical ownership, and #1985 is the separately reserved persistent marker. None requires a new schema or policy here.

Cause: `SessionCommands` marks every non-construction command before the existing template cancellation preflight. Intended narrow scope: execute the existing coupled current-revision preflight before the generic accepted-action marker; successful non-Undo construction cancellation keeps its existing marker. Source lease, production negative, restoration and wider gates are pending. No browser was launched.
