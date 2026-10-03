# Square-aligned dense toilet from the existing Blender source

The existing `object.toilet` has a 1 x 1 occupied-square footprint. The root runtime already maps it to `fixture.cell.toilet_sink`, but its registered oblique manifest offered only nine camera poses. Draft PRs [#1817](https://github.com/woogitsu/lockstate/pull/1817) and [#1887](https://github.com/woogitsu/lockstate/pull/1887) contain 72 poses from the same Blender source. This branch imports that authored pose work into a fresh root checkout without editing those PR branches.

## Measured source/export defect and correction

The source is `assets/source/blender/environment.mvp.catalog.blend`, SHA-256 `57db9afb7e48996cef9aaedda72b8e874e865eb56862ee4add8b177a9713887d`. Its `fixture.cell.toilet_sink` collection had its origin at `(21,0,0)` and mesh bounds X `[20.595,21.520]`, Y `[-0.515,0.5777]`, Z `[0.005,1.1025]`. The draft exporter moved that origin to `(0,0,0)`, leaving mesh X `[-0.405,0.520]`, Y `[-0.515,0.5777]` relative to a production **minimum-corner** object anchor. That overhang is tracked as [#1952](https://github.com/woogitsu/lockstate/issues/1952).

The revised standalone Blender 5.2 exporter puts the collection origin at `(0.5,0.5,0)` and scales X/Y to `0.80` without altering the original source. Blender evaluated bounds after that transform are X `[0.176,0.916]`, Y `[0.088,0.9622]`, Z `[0.005,1.1025]`, wholly inside the authoritative square. The exporter checks evaluated bounds before rendering. The original draft standalone exporter referenced a lighting helper absent from `pipeline_common.py` and failed before the first frame; this version configures the same environment-catalog key/fill/ambient values directly.

## Reproducible art and current checks

- Manifest: `public/game-content/oblique-cell-toilet.v1.json`, 12 yaw x 6 elevation = 72 poses, exact 512 px / 8 tile orthographic span = 64 px/tile, pivot `[256,256]`, camera target `[0,0,0]`.
- Two complete Blender renders produced identical manifest SHA-256 `13ba83d97fb6b178fc92fd774e718562953a576f1be874017ab06f4a7b28eab3`.
- All 72 PNG bytes match the manifest; none touches a transparent image corner. Their alpha boxes stay within X `[183,329]`, Y `[167,323]` across angles.
- [Twelve-view contact sheet](./poses.png) is assembled from SHA-checked frames; views are enlarged for inspection, not claimed as pixel-scale comparison.
- Focused object mapping/art tests pass 24/24 with TypeScript green. Changing the first manifest frame SHA to zeroes made the art test fail 1/2 on that exact frame; restoring the original bytes returned it to 2/2.

The old 72 draft frames introduced by the imported commit were removed from this derived branch only after confirming the published PR #1887 still holds them and no JSON manifest references any of their filenames.

## Actual player proof at 1920 x 1080

The [real player browser spec](../../../tests/browser/toilet-dense-player-build.spec.ts) used the oblique production scene. The player placed Storage Room and Delivery Bay, waited for their real worker queues, saved to IndexedDB, loaded that save in a fresh browser context, placed Basic cell, waited for its worker queue, and found the existing `object.toilet` at authoritative anchor `(22,9)`. It saved and loaded again. The first room setup and the toilet stage passed 2/2 within the normal test and assertion budgets, without injected construction commands.

- [Worker-completed Full HD screenshot](./worker-completed-fullhd.png) and [reloaded Full HD screenshot](./loaded-fullhd.png) both show the toilet in the finished cell.
- In the fixed 50 x 60 pixel screen region around this toilet, the authored teal glaze RGB `(49,127,135)` appears in **141 pixels** before Save and **141 pixels** after Load.
- Temporarily mapping `object.toilet` to a missing authored asset changed that exact production pixel oracle to **zero** and failed the toilet stage (1/2 total tests passed). The map was restored byte-for-byte, and the same browser spec passed 2/2 again. The mutation confirms that the image proof exercises the production asset consumer rather than merely a generic fallback.
