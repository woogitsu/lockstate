# Refused template cancellation changes Undo selection eligibility

Read-only packed runtime diagnosis on published `39448e8956da264c1833a71cf9d4bb6faa30a689`, 2026-10-03. No production edit in this checkpoint.

## Actual reproduction

1. Purchase 648 bricks, await real delivery, then place mirrored 90° `cell-row-four` at (10,10).
2. Actual scheduled construction completes its shell and first bed, with three beds still materials-pending. Admit a real resident and await occupancy one.
3. Place and complete an independent ordinary full-square wall at (2,2). This is the newest accepted construction gesture. Funds stay −1,245 because its two bricks come from genuine purchased stock. The original physical bed retains its exact template source-order owner.
4. Continue live, or encode/decode/restore V8 NOW, before the next press.
5. Cancel the original completed template bed by actual current order revision. Existing occupied-room protection correctly refuses `unzone.room-occupied`; the captured gameplay snapshot is unchanged except kernel bookkeeping.
6. Immediately Undo. Expected: reverse the newer independent wall, retain the occupied template and its owners. Actual: the wall remains completed; the attempted cancellation set the hidden newer-action flag before its refusal, so Undo refuses.

Targeted baseline **2 RED / 2 legal GREEN**, first 4.91 s, published receipt 3.01 s. Both no-refusal controls, live and saved, correctly Undo only the independent wall. No fake world, treasury, history, owner or resident state was injected. The encoded Load is BEFORE the refused cancellation, so this is not #1985's loss of a previously accepted newer-action marker after Load.

## Existing accepted rule and deduplication

ADR0104's accepted option 2 uses the newest accepted command. Its 2026-09-23 amendment explains that this means the newest command which changed something; refused placement leaves eligibility as it was. Existing source comment on `noteActionThatDoesNotWriteTheUndoStack` also says accepted commands. This cancellation changes no prison or transaction and has already reported its refusal.

Full fresh bodies #1657, #1986, #1990, #1975, #956 and #1985 were read. Refused/Undo issue search found no matching cancellation report. #1657 protects the coupled reversal, #1990 preserves selection across deferred construction, #1986 guards conflicting Redo, #1975 protects physical ownership, and #1985 is the separately reserved persistent marker. None requires a new schema or policy here.

Cause: `SessionCommands` marks every non-construction command before the existing template cancellation preflight. Dedicated nonduplicate issue: [#1996](https://github.com/woogitsu/lockstate/issues/1996). Diagnostic `2c92853b29edbd22baf336c453491b7ced7206e8` was published before the source edit.

## Scoped cancellation family correction

After the exact source lease, only `session-commands.ts` changes. `CancelBuildOrder`, `CancelMaterialPurchase`, `RemoveObject` and `RemoveWall` defer eligibility marking to their existing successful outcome branches. A current-revision cancellable queue order marks the action after existing coupled preparation succeeds. Other non-construction command families retain their existing behavior; this record does not claim a general correction of all unrelated refusals.

Successful preparation is **not pure**: it may unzone and relocate residents before cancellation. Those accepted world changes still set the newer-action barrier. Current/stale/ownership/occupied refusals return without setting it. No new persisted field, V9 choice, message, tariff or reversal policy is implemented.

The final regression has **24 cases** across live and encoded Load-before-command: no-refusal control; occupied queue refusal; stale queue revision; occupied JIT supply refusal; pending object removal; pending object through RemoveWall; completed shell removal; explicit V8 unknown-owner compatibility input; and successful ordinary queue/wall/standing-object/stock cancellation. Each refused command has complete pre/post gameplay snapshots (kernel excluded), then genuine Undo of the newer independent wall. All four successful cancellation routes retain the existing newer accepted-action barrier before a subsequent Undo.

Expanded untouched published producer baseline: **14 RED / 10 controls GREEN**, [expanded-baseline.txt](expanded-baseline.txt). Two real production mutations:

- Restore upfront marking for these cancellation routes: **14 RED / 10 GREEN**, [negative-refusal.txt](negative-refusal.txt).
- Disconnect only the five successful cancellation marker calls: **8 RED / 16 GREEN**, [negative-success.txt](negative-success.txt). The original generic marker for other accepted action families remains active.

Every source swap/mutation restores exact original bytes in `finally`; the worktree is detached during those runs and returned to its own branch afterward. Final restoration: **24 GREEN**, 11.04 s, [restored.txt](restored.txt), SHA-256 in [exact-restoration.json](exact-restoration.json). No browser was launched.

The first expanded fixture used `top` instead of the existing command edge `north`, causing six schema errors; a restored zero revision minus one caused one more invalid-input error. These seven were fixture errors before the command boundary, not production failures. Correct actual `north` commands and positive unequal stale revisions yield the fourteen genuine baseline failures above.

Neighboring/types/documentation gates are recorded when terminal.
