# Remaining source-level wall/actor depth defect during pose loading

2026-10-03. Read-only diagnosis from Pan/Dock `1ffc57d1e9ca71f0b44ef769fe5228313a17adb3`, which contains the dedicated-pan fixture. This is the same display-depth family as existing [Issue1913](https://github.com/woogitsu/lockstate/issues/1913), freshly read with its zero comments and exact acceptance. No new duplicate Issue, source fix or native claim accompanies this checkpoint.

## Reproduction and legal controls

`tests/unit/oblique-pending-wall-depth.test.ts` runs the actual `ObliqueWorldScene.create/update/restoreCameraView`, real world projector, texture selection, `paintAsset`, `paintRaised`, registered ground-pointer callback, and registered loader completion. The world is an actual owned `SparseWorld` immutable snapshot containing one whole occupied full wall at (5,5), no zoning, and one actor on a separate clear tile. Actual validated wall/prisoner catalogue metadata is read unchanged. Phaser display and loader plumbing are observed in Node; native images and Chromium are not run.

At yaw0/elevation45 and yaw180/elevation65, the rear actor ground point intersects the independently projected full-wall roof. The real painted five-face fallback geometry matches that independent roof at precision3; ground picking still reaches the correct separate clear tile. Actual sorted order is actor then wall. Nevertheless, while the wall texture is missing/loading, the actor PNG **or** actor fallback has display depth2 and the fallback wall has depth1. All four rear-wall ordering assertions are RED. No state or occupied square was changed to produce them.

Final original source: **4 RED, 10 GREEN**. Fully loaded wall+actor PNG, fully loaded wall+actor fallback, actors in front of both wall representations, and the real loading-complete callback that restores correct authored wall depth are legal GREEN controls. Existing world projection/actor/geometry suites are **14/14 GREEN**. Strict diagnostic TypeScript exits0. The earlier14 failures due to an omitted `game.renderer.type` in the observation plumbing are preserved as setup failures, not product evidence.

## Cause and proposed scoped correction

`ObliqueWorldScene.create` gives the shared `raisedGraphics` depth1. `paintRaised` correctly sorts/assigns actor Graphics and authored solid/actor PNGs to2..2.9, but draws every still-loading solid prism into the shared lower layer. This specifically affects the ordinary fallback window after a supported pose change; it does not establish a defect in loaded-art cutaway SAT, visibility extents, camera picking or the logical footprint.

Propose only the scene fallback-painter surface: stable per-solid Graphics at the already accepted sorted display depth, updating their depth as actors move, retaining across unchanged/pose paints, and destroying withdrawn/loaded solids plus shutdown references. Keep actor/front/loading-complete controls, actual projected five-face geometry, existing worker occupancy and source picking. Parent has granted this narrow source lease after the reproduced4RED. Publish diagnosis before implementing; production-only fallback-depth negative and byte-exact restore plus native pixel acceptance remain outstanding.

Raw original/fixture-setup logs and unchanged producer hashes are beside this file. The diagnostic contains deliberate failing assertions and must not be integrated as a green release gate before its scoped correction. No browser/server was launched.
