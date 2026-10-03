# Occupied template material cancellation

## Baseline checkpoint

Read-only gameplay diagnosis on `9dc2abd1205ad9d6ce19f12187396e028b4c58b2`, 2026-10-03. No production change is included in this checkpoint.

The existing `room-template-rotated-history.test.ts` covers all 20 templates × four rotations × mirror, including genuine completion, partial and completed encoded Load, Undo and Redo. A separate bounded probe built legal Storage and Delivery Bay first, then mirrored 90° Infirmary, Kitchen, Canteen, Utility, Security and a four-cell block. All six completed after a partial encoded Load with no missing required capability and doorway access. That probe establishes no new defect and is not a replacement for the existing matrix.

The missed lifecycle is cancellation of a just-in-time delivery after a template has been zoned and partially furnished. The permanent test uses only packed production commands and real scheduled ticks:

1. Purchase 648 bricks: funds 25,000 → −920. Wait for the actual delivery.
2. Place `cell-row-four` at (10,10), mirrored, rotated 90°. Real construction completes its shell and first bed; three beds remain materials-pending. Funds are −1,245.
3. Admit a prisoner and wait for actual accommodation. Occupancy is one.
4. Sell three stocked bricks for 60. Scheduled procurement purchases one plank for 65; funds are −1,250 and the delivery is genuinely pending.
5. Cancel that actual JIT delivery, either live or after encoded V8 Load.

Both cases refund 65 before removing all 66 template orders, walls, doors and physical objects. One occupied room instance remains registered although its bed and shell are gone. At tick 3,731 the delivery is `jit:3730:item.wood-plank:0`, scheduled arrival 3,830. The diagnostic expects the existing atomic occupied-room refusal, before any refund or world/order/history change.

The same real purchase and partial construction without a resident remains a legal control: all 66 orders cancel together, every room and object is removed, funds become −1,185, and another encoded Load plus 150 ticks does not repurchase the canceled delivery. Targeted baseline: **2 RED / 2 legal GREEN**, 3.02 s, in [baseline.txt](baseline.txt).

## Cause and intended boundary

`CancelMaterialPurchase` cancels/refunds procurement first, then calls `withdrawOrdersAwaitingMaterial` and `reconcileCancelledShells`. Unlike queue cancellation, manual removal and Undo, it does not prepare the exact coupled template reversal. Reconciliation individually attempts unzoning and then cancels all orders, even when the occupied zone refuses.

This is the occupied all-or-nothing template rule already represented by #1657/#1608, reached through #687's accepted JIT demand-withdrawal path. Ordinary stock purchases and ordinary unoccupied JIT withdrawal retain their existing refund and ordering rules. A correction must inspect the exact withdrawal before refunding, collectively validate affected template zones/ownership, and retain the existing `unzone.room-occupied` reason. No new persistence field, message, tariff or policy is proposed.

## Fixture errors retained

Earlier local setup attempts are not production failures: purchasing 998 bricks was refused by the existing overdraft limit; purchasing 654 left insufficient headroom to complete the first bed. The correct 648-brick purchase reaches the actual cancellation boundary. The initial non-Cell probe also incorrectly called a nonexistent `RoomInstanceRegistry.allSorted()` method; changing the probe to the existing explicit catalogue reader yielded six successful completions.

## Scoped correction and production negatives

After the coordinator granted the three exact production leases, ConstructionSystem gained a pure reader of the same newest-first material withdrawal candidates, evaluated with the selected pending delivery quantity subtracted. The command collectively prepares all exact affected template memberships before procurement can refund. Coordinator checks existing physical ownership and unzones the union of affected zones once, so a free member cannot disappear before another member refuses. Ordinary stock deliveries bypass template withdrawal preparation.

The packed regression now has **10 GREEN** cases: occupied refusal live/encoded Load, unoccupied reversal live/Load, a genuine completed independent spare with actual resident relocation live/Load, ordinary stock cancellation beside an occupied template live/Load, and one delivery affecting both an occupied and unoccupied template live/Load. The pure withdrawal reader is checked against an immutable complete snapshot. Refused commands retain the complete captured gameplay snapshot except kernel command bookkeeping, including treasury, procurement, physical registry, geometry, construction history and resident claims.

Actual isolated production mutations, each followed by exact original-byte restoration in `finally`:

- Disable the System withdrawal reader: **4 RED / 6 legal GREEN**, [negative-reader.txt](negative-reader.txt).
- Disconnect the actual supply command preflight: **4 RED / 6 legal GREEN**, [negative-command.txt](negative-command.txt).
- Unzone each affected template separately instead of their union: **2 RED / 8 controls GREEN**, [negative-collective.txt](negative-collective.txt). The mixed-template cases detect the partial mutation before occupied refusal.

Exact restored run: **10 GREEN**, 3.96 s, [restored.txt](restored.txt). Restored producer SHA-256 values are recorded in [mutation-restoration.json](mutation-restoration.json). The worktree was detached during negatives and returned to its own branch after the terminal restoration. No browser was launched, and no persistence, locale, tariff or workflow file changed. Neighboring gates are recorded separately when terminal.

Fresh dedicated entry-point issue: [#1995](https://github.com/woogitsu/lockstate/issues/1995). Diagnostic checkpoint `a2b057d42d79059d7a72a8fe40cea83d297483e2` precedes the source correction.
