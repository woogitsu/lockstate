# Kitchen fixtures inside their occupied squares

The existing Kitchen plan places `object.stove` and `object.prep-counter` at 2 x 1 each, and `object.fridge` at 1 x 1. All three already have authored Blender sources and oblique catalog IDs. Their source geometry, however, was centred around `(0,0)` while the production renderer anchors the images at the **minimum tile corner**. This is tracked as [#1957](https://github.com/woogitsu/lockstate/issues/1957), related to the broader art acceptance [#1869](https://github.com/woogitsu/lockstate/issues/1869).

| Existing source | Original evaluated X / Y bounds | Corrected export X / Y bounds |
| --- | --- | --- |
| Stove, 2 x 1 | `[-1.03,1.03] / [-0.61,0.45]` | `[0.073,1.927] / [0.0425,0.8375]` |
| Prep counter, 2 x 1 | `[-1.03,1.03] / [-0.528,0.47]` | `[0.073,1.927] / [0.0248,0.9230]` |
| Fridge, 1 x 1 | `[-0.50,0.50] / [-0.57,0.47]` | `[0.075,0.925] / [0.0155,0.8995]` |

The new Blender 5.2 exporter applies one world transform to each complete source assembly and rejects any evaluated mesh bound outside the authoritative footprint. Camera target metadata follows the same source transform; moving only the camera target would cancel in the world/image projection and leave the art shifted. The original `.blend` sources, object IDs, construction costs, collision and saved identities remain unchanged.

Each source now has 12 yaw x 6 elevation poses. A 256 px image with a 4-tile orthographic camera spans **exactly 64 pixels per world tile**. The smallest transparent border over all 72 frames is 27 px for the stove, 43 px for the prep counter and 37 px for the fridge. [Stove](./stove-yaw45-elev45.png), [prep counter](./prep-counter-yaw45-elev45.png) and [fridge](./fridge-yaw45-elev45.png) previews use the actual Blender geometry. Two full 216-frame renders produced byte-identical manifest SHA-256 values: stove `aa0f6c6dae827c3f3ed4df44b31d52f6e624d788918a2239191af31d61b482a2`, prep counter `5a9322f4ce02d8d37e858360713bb61cc8021c832b85a353a4ebc07af4cbe79c`, fridge `09151427b2f922038b92900cdf5bb965a5b5ac6e4ed7e394afe51f643ce37162`.

The source/scale/hash test checks all 216 referenced PNG bytes. Changing the first stove frame SHA to zeroes produced red 1/4, and byte-for-byte restoration returned 4/4 green. The existing prep counter frame-selection test was updated for content-hashed filenames.

The actual player flow now passes two serial browser stages with the normal 60-second test and 10-second assertion budgets. A new prison first built Storage Room and Delivery Bay with real worker orders and saved IndexedDB. A fresh page loaded that save, placed Kitchen at `(20,5)`, finished its worker queue, and verified authoritative fixture anchors `object.stove@(21,6)`, `object.prep-counter@(23,6)` and `object.fridge@(21,8)`. The [completed Full HD scene](./kitchen-worker-completed-fullhd.png) and [scene after Save/Load](./kitchen-loaded-fullhd.png) contain the Blender-authored stove, prep counter and fridge. In fixed fixture regions, exact authored palette pixel counts were **225 stove / 1697 prep / 672 fridge**, identical before and after Load.

For a production consumer mutation, `object.stove` was temporarily mapped to a missing oblique asset ID. The second browser stage then failed on the stove pixel assertion with **0** authored burner pixels, while the first setup stage passed (red 1/2). Restoring the exact mapping returned both stages to green (2/2). The mutation was not committed; the worktree mapping is unchanged. This evidence proves these three existing Kitchen fixtures are visible in this completed player scene, not that every camera angle or room arrangement is covered.
