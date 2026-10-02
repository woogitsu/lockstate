# World minimap viewport versus actual visible ground

Date: 2026-10-03. Isolated base `254774e88184a7957cc424951bdf3fa73636e979`.
No browser or server was launched; Art/root owns the exclusive native lease.

## Confirmed source reproduction

Actual `WorldScene.update` publishes the minimap viewport x/y from raw Phaser
scroll. The scene's own cameraState contract and the real camera show that
scroll is not the visible top-left ground coordinate except at zoom 1. The
indicator therefore shifts relative to the ground the user can actually see.
At FullHD1920x1080, scroll100,200, zoom1.25, it emits top-left ground100,200;
real `Camera.getWorldPoint` emits292,308 at the viewport top-left.

`tests/unit/world-scene-minimap-real-camera.test.ts` runs the real scene update,
its cameraState, real SparseWorld/WorldRenderView, projectMinimap and actual
sink. Only the Phaser host Scene shell and unused GPU FilterList constructor
are replaced for Node; actual Camera/preRender/getWorldPoint/matrix remain
unchanged. First-world framing is already complete to retain a deliberately
panned camera, exactly as an active session does. No expected camera math is
copied from the producer: all four ground corners come from getWorldPoint.

24 cases cross zoom0.2/0.5/1/1.25/2/3, viewport offsets0,0/140,90 and non-square
64x32 extents at shifted chunk origins. Actual baseline **20 RED / 4 zoom1
controls GREEN**, 1.95s, maxWorkers2. No native completion is claimed.

[Preserved original source receipt](actual-camera-baseline.log).

## Scope and duplicate review

Fresh all-state minimap+zoom and minimap+viewport searches were read. #1674
covers routing/pixels and angled visible bounds, explicitly retaining the
ordinary World route. #794 covers off-world recovery; neither names this
World viewport-origin producer. #1988 is the separately corrected main room-plan
forward adapter; this indicator has its own scene producer and reference.

Only this World minimap viewport producer changes, using
existing visibleWorldBounds. No camera motion, pan bounds, picking, navigation,
layout, copy, schema or simulation policy changes. The original source baseline is 20 RED / 4 controls. The corrected producer
passes24/24. A production-only mutation restores both raw-scroll x/y clauses
at their unique producer locations: **20 RED / 4 controls**, 1.12s. A finally
restores the exact corrected source bytes; restored **24/24 GREEN**,1.13s.
The existing pixel projection and registered wheel controls plus this regression
are **40/40 GREEN**,3 files,1.03s,maxWorkers2. App/tools TypeScript passes.

Exact restored whole world-scene.ts SHA256:
`5c4e27ee263cb2e88d4258a4d7729e2cecb399e07e4a41af13727fcfdba6ab06`.

- [Actual producer negative](minimap-visible-origin-producer-red.log).
- [Exact byte-restored cases](minimap-byte-restored-green.log).
- [Focused pixel/wheel controls](minimap-related-restored-green.log).
- [App/tools TypeScript](minimap-fixed-typecheck.log).

## Paired native fixture remains queued

`room-template-world-camera-origin.spec.ts` now reads the corrected visible
minimap bounds rather than the previous raw-scroll contract. Both100%/200%
FullHD cases compare its rectangle-derived ground edges with all4 actual SVG
ghost corners and physical pointer containment, retain all28 squares and
quote, and require the exact real-worker preflight/placement origin with no
extra Build/Remove command. The main projection and minimap producer each have
independent real-camera source regressions; either original producer should
fail this paired native correspondence. The earlier254774 raw-scroll fixture
must not be used against this changed visible-bounds producer.

The native file is compiled only, not run. Baseline, each producer negative,
exact restored native outcome, screenshots and hosted CI remain pending behind
the exclusive browser lease. No timeouts/retries/config/worker changes.

