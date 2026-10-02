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

Only this World minimap viewport producer is proposed for correction using
existing visibleWorldBounds. No camera motion, pan bounds, picking, navigation,
layout, copy, schema or simulation policy changes. Correction, production
negative, exact restoration and native actual zoom/indicator proof are pending.
