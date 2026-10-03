# Authoritative room-template rotation acceptance

## Scope and authorization

**VERIFIED, repository and coordinator instruction.** Based on approved integration checkpoint `4df4429595efda2171fdcfb4775a8928d3bfbcad`; the owner's exact decisions are recorded in [the camera integration record](../../design/2026-09-28-adjustable-camera/README.md). The owner approved optional template history arrays with absent meaning empty, optional clockwise `quarterTurns` and build-order `objectOrientation` with strict integer domain 0..3 and absent meaning zero, and rectangular minimum side requirements in either orientation while retaining `minTiles`.

This implements the core/persistence portion of [the existing draft](../../adr/drafts/room-template-quarter-turn-state-1586.md). It assigns no ADR number and does not change the draft's historical proposal. UI controls and renderer orientation consumers are separate integration changes.

## Actual production path

**VERIFIED, opened source and exercised runtime.** Shared geometry applies mirror first, then clockwise rotation around the retained minimum x/y world origin. Only final rotated extents must fit safe integer bounds. Build expansion converts doors to existing canonical north/west edges, preserves square walls, and retains fixture facing in each order. No new edge vocabulary or content identity is introduced.

The strict command and worker preflight target accept optional `quarterTurns`. The coordinator derives placement, pending rectangle claims, zoning, cancellation and Undo/Redo from that saved request. Both fixture placement and template preflight reserve rotated unfinished footprints. Construction completion forwards the order's facing into the existing placed-object registry. The saved request and order fields use existing V7 and room-template section version 1; old absent values retain zero orientation and omitted empty history arrays.

Core commits: `337ba21d4e` shared geometry/order type, `5cf14ad7b4` matching strict saved order domain, and `31900bdbd17e59e46bdc214d6997b7b79bd07183` authoritative command/construction/history consumers with regressions. Default commands continue omitting `quarterTurns`; explicit zero is also accepted.

## Runtime evidence

**VERIFIED, local Vitest output on 2026-10-02.** [The integration suite](../../../tests/integration/room-template-rotated-history.test.ts) passed 179 cases:

- All 20 authored plans, normal and mirrored, at all four quarter turns: 160 cases. Each saves and decodes the real queued command, unfinished shell, unfinished fixtures when present, completed world, and undone transaction before Redo. Expectations independently transform authored unrotated scalar rectangles; they do not call the production rotation or construction adapter.
- Exact completed fixture IDs, anchors and facing, square walls, canonical doorway edges, every zoned rectangle, and actual worker room-detail missing-capability count and doorway/gap access are checked after construction, completed Save/Load and Redo.
- Invalid command and worker target values -1, 4, 0.5, string 1 and null are rejected. A valid worker request is checked before each invalid target, so rejection cannot pass through an unrelated malformed envelope.
- Saved pending/undone/completed request and order domains reject those same invalid values. A real old-style command with omitted rotation completes at zero; old section shape with absent history arrays restores without introducing history entries.
- Rotated desk second-tile occupancy is checked in both worker preflight and object placement. Odd-turn pending interior claims and final extents are checked independently, including owned chunk boundaries and the actual worker projection producer.
- Two cases undo a genuinely partly completed mirrored shell, verify all shell geometry removed, encode/decode the undone state, then Redo through completed fixture and doorway assertions.

The existing zoning suite also checks both exact Cell minima (2x3 and 3x2), narrow rectangles that fail in either orientation, and a custom area floor 8 above side minima 2x3. Both orientations still refuse area 6 and accept area 8.

## Meaningful mutation and exact restoration

**VERIFIED, observed output.** Replaced only the production `ConstructionSystem.finalizeConstruction` handoff's `order.objectOrientation ?? 0` with constant zero. Running the eight Basic Cell mirror/turn cases yielded **6 failed, 2 passed**, exit 1: every nonzero orientation had completed object facing zero instead of the requested 1, 2 or 3. This mutation leaves the geometry and test expectations intact and therefore tests the real order-to-registry handoff.

The complete original `system.ts` byte array was restored in `finally`. SHA256 before and after was `CC6996C23378F7BF6DC0928A6BFD8612F91691E23501961FE734D533D7CFAF04`.

After restoration, the final command covered the new integration matrix, Delivery Bay worker readiness, existing template session/completed/history/build-plan/command/reservation suites, zoning, persistence schema and aliasing, simulation vocabulary coverage and saved enum contracts: **13 files, 519 passed**, exit 0. Both application and tools TypeScript builds then exited 0. The new numeric `QuarterTurns` type has an explicit geometry-domain exemption in the vocabulary gate; selectable words belong to the HUD's authored keys.

The earlier shared-helper mutation dropped world-origin X translation: two independent concrete coordinate cases went red; exact restoration returned the 88 helper/rotation/construction-geometry cases to green.

## Limits and weakest claim

**UNKNOWN here:** current remote CI, browser controls, rendered facing, player comprehension and freight throughput. This worktree performed no browser run or deployment. Its strongest evidence is actual scheduled simulation, strict encoded persistence and worker projections. The weakest inference would be that those checks alone establish a complete player-facing rotation flow; that requires the separately owned UI/renderer integration and its real browser acceptance.
