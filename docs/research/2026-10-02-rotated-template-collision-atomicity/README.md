# Rotated fixture collision command atomicity

## Concrete coverage gap

**VERIFIED, read existing tests.** The rotation/history matrix and template session tests exercise fixture geometry, second-tile preflight and service-level refusal. They did not compare funds and full saved order/history state before and after an actual colliding `PlaceRoomTemplate` command on a partially built, encoded-and-restored rotated fixture.

The new [focused integration suite](../../../tests/integration/room-template-rotated-collision-atomicity.test.ts) uses a legitimate turn-1 desk at anchor (9,9), placed through the internal object service on an open Yard whose bounds end at (9,9). Its occupied second tile (9,10) is outside room zoning. A turn-1 Cell starting at (9,10) intersects only this second tile, while the desk anchor is outside that plan. The test explicitly confirms the collision tile has no zoning, square structure or legacy edge, so another refusal cannot conceal a missing rotated-object claim.

## Observed checks

**VERIFIED, executed on 2026-10-02.** All four scenarios pass: live pending fixture; actually partly built fixture after encoded Save/Load; partial fixture after encoded Undo/Redo; completed fixture after encoded Undo/Redo.

Each calls the actual worker preflight producer and observes `object-occupied` at (9,10), then sends a strict `PlaceRoomTemplate` through the real kernel command handler. Paused dispatch advances no simulation ticks and makes the financial comparison independent of payroll or construction progress. Refusal reports `build.unbuildable` at the same tile. Treasury, all construction order/history fields, template metadata and every saved authoritative gameplay field remain identical; no new shell order or Undo entry is added. Only the command queue/sequence and nonpersistent refusal notice change.

This found a coverage gap, not a production defect. No production code or persistent schema was changed.

## Mutation and restoration

**VERIFIED, observed output.** Replaced only the coordinator commit path's `const verdict = this.preflight(built.plan)` with an unconditional successful verdict, retaining the live worker preflight. All **4 cases fail**, exit 1, specifically at construction snapshot equality: the command adds 17 wall orders and one door, changes the current transaction and/or Undo stack, despite the independent preflight correctly refusing the second tile.

The full original coordinator byte array was restored in `finally`; before and after SHA256 is `92E8B18EC352B728687E7FD475941E6416EC5B526BA8D764ABFC7D18A21D2D14`. Restored focused atomicity, existing template session/placement and object placement loop suites pass **4 files, 77 cases**. Application TypeScript build exits 0.

## Limits

The source fixture uses the internal orientation-aware object service to isolate this specific boundary; standalone player `PlaceObject` controls still default to zero. The refused room gesture uses the real command path. No browser or remote CI was run. The weakest inference would be that this four-case command proof establishes every UI collision workflow; it establishes the authoritative second-tile refusal and unchanged gameplay state for these four states.
