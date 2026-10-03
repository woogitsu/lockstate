# Remaining source-level wall/actor depth defect during pose loading

2026-10-03. Read-only diagnosis from Pan/Dock `1ffc57d1e9ca71f0b44ef769fe5228313a17adb3`, which contains the dedicated-pan fixture. The initial read-only checkpoint `e83743bd2d1236b3c2714baaf6540606a65340ec` identifies the same display-depth family as existing [Issue1913](https://github.com/woogitsu/lockstate/issues/1913), freshly read with its zero comments and exact acceptance. No new duplicate Issue or native claim was made. The correction and its current source-only acceptance are recorded below.

## Reproduction and legal controls

`tests/unit/oblique-pending-wall-depth.test.ts` runs the actual `ObliqueWorldScene.create/update/restoreCameraView`, real world projector, texture selection, `paintAsset`, `paintRaised`, registered ground-pointer callback, and registered loader completion. The world is an actual owned `SparseWorld` immutable snapshot containing one whole occupied full wall at (5,5), no zoning, and one actor on a separate clear tile. Actual validated wall/prisoner catalogue metadata is read unchanged. Phaser display and loader plumbing are observed in Node; native images and Chromium are not run.

At yaw0/elevation45 and yaw180/elevation65, the rear actor ground point intersects the independently projected full-wall roof. The real painted five-face fallback geometry matches that independent roof at precision3; ground picking still reaches the correct separate clear tile. Actual sorted order is actor then wall. Nevertheless, while the wall texture is missing/loading, the actor PNG **or** actor fallback has display depth2 and the fallback wall has depth1. All four rear-wall ordering assertions are RED. No state or occupied square was changed to produce them.

Final original source: **4 RED, 10 GREEN**. Fully loaded wall+actor PNG, fully loaded wall+actor fallback, actors in front of both wall representations, and the real loading-complete callback that restores correct authored wall depth are legal GREEN controls. Existing world projection/actor/geometry suites are **14/14 GREEN**. Strict diagnostic TypeScript exits0. The earlier14 failures due to an omitted `game.renderer.type` in the observation plumbing are preserved as setup failures, not product evidence.

## Cause and proposed scoped correction

`ObliqueWorldScene.create` gives the shared `raisedGraphics` depth1. `paintRaised` correctly sorts/assigns actor Graphics and authored solid/actor PNGs to2..2.9, but draws every still-loading solid prism into the shared lower layer. This specifically affects the ordinary fallback window after a supported pose change; it does not establish a defect in loaded-art cutaway SAT, visibility extents, camera picking or the logical footprint.

The proposed scope was only the scene fallback-painter surface: stable per-solid Graphics at the already accepted sorted display depth, updating their depth as actors move, retaining across unchanged/pose paints, and destroying withdrawn/loaded solids plus shutdown references. Keep actor/front/loading-complete controls, actual projected five-face geometry, existing worker occupancy and source picking. Parent has granted this narrow source lease after the reproduced4RED. Diagnosis was committed and pushed before implementation. Its original source-only baseline is retained above. The production negative and byte-exact restore are now complete; native pixel acceptance remains outstanding.

Raw original/fixture-setup logs and unchanged producer hashes are beside this file. The initial diagnostic commit contains deliberately failing assertions; integrate its correction as a pair rather than claiming that initial checkpoint is green. No browser/server was launched.

## Scoped correction and exact restoration

The current source keeps a stable per-visible-solid fallback Graphics map. Each prism uses the same accepted 2..2.9 sorted depth as authored walls and actors. Actor-only fast repaints update that depth without allocating new Graphics. A completed texture, withdrawn/cull-removed solid, or scene shutdown destroys the corresponding fallback and clears its retained map entry. All five painted faces, occupied wall square, ground picking, full/low cutaway selection and loaded-art ordering remain unchanged.

Parent expanded the narrow lease to the existing fallback-counter reads in `tests/browser/oblique-art-runtime.ts` and `oblique-preset-art-qa.ts`. They now aggregate real shared and per-solid command buffers, preserving every original assertion and timeout. A test executes both exact reader expressions against the actual recorded five-face fallback, observes20 recorded vertices while missing, then0 after the real loading-complete callback. Those20 are the Node observation plumbing's vertex records, not a claim about native Phaser command-buffer cardinality.

- Fixed scoped suite: **17/17 GREEN**. Added lifecycle controls exercise16 actor-crossing fast repaint frames without a new fallback object, removal, authored-texture replacement and shutdown cleanup.
- Unique actual production mutation changes only `fallback.clear().setDepth(2 + 0.9 * index / projection.raised.length)` to depth1: **5 RED / 12 unchanged legal GREEN**. Four original rear-wall controls and the actor-crossing ordering control fail; front actors, ground footprint geometry, loaded PNG ordering, loader completion, cleanup and both QA buffer readers remain legal.
- `finally` restores the exact original producer bytes. SHA256 before/after matches in `fallback-depth-mutation.json`; final same suite **17/17 GREEN**.
- Strict fixed-source consumer TypeScript (the unit suite plus both named browser harnesses): exit0. Seven bounded neighbouring Scene/geometry/camera suites: **99/99 GREEN**, `maxWorkers=2`. Production build, including app/tools TypeScript and verified static output: exit0.

No browser/server or remote CI was launched. Actual FullHD missing-texture occlusion pixels, screenshots and built-client loading/replacement acceptance remain queued with root. This checkpoint changes no art source, asset calibration, scene projection geometry, camera/input policy, gameplay, persistence, UI copy, workflow or browser configuration. The shared research index is handed to root integration.
