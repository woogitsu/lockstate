# Oblique minimap pixel reuse

Issue [#2017](https://github.com/woogitsu/lockstate/issues/2017). Exact baseline: `38134e656aefcda42e599fcc71c02c26d2a9df96`. Source checkpoint: `2576a651683ded686e58411517664a9385d11313`.

## Measured defect and correction

The actual Oblique scene publisher previously recreated identical pixel buffers on each publication. Across 121 publications of the same immutable 16×16 world, it read 30,976 tiles rather than 256. This defeats the existing HUD pixel-identity guard. The ordinary WorldScene already keys minimap projection reuse by world identity and frame revision.

Oblique now retains the physical map projection by those same two keys. Camera viewport geometry is recalculated every publication. Either a replacement world or a changed revision rebuilds the map. Empty loaded bounds still publish no map; a subsequent loaded world recovers normally. No gameplay, input, persistence or test budget changes are included.

## Actual verification

The real scene publisher, immutable world and projection math execute; only Phaser/GPU construction is stubbed. The five controls preserve exact pixel identity and tile-read counts, actual ownership pixels after world replacement, revision invalidation, camera viewport changes, and empty-world recovery.

- Original source: **2 RED / 3 legal controls**.
- Fixed source: **5 GREEN**.
- Actual production cache omission: **2 RED / 3 controls**.
- Actual world-identity condition omission: **2 RED / 3 controls**.
- Actual revision condition omission: **1 RED / 4 controls**.
- Actual viewport frozen to the initial pose: **1 RED / 4 controls**.
- Exact source restoration: **5 GREEN**; Buffer equality true, production diff exit 0, branch restoration exit 0.
- Bounded neighboring minimap/camera gates: **51 GREEN / 5 files**.
- Application and tools strict types: both exit 0.

The mutation script ran from detached source checkpoint 2576a651683ded686e58411517664a9385d11313, restored the exact original bytes in `finally`, and returned to the owned branch. Its executed inert copy, raw outputs and receipt are retained here. Source SHA-256 during mutation/restoration: `3be01ce4aea9c7c9f8fdecc1acced68a53cc3752c97709cb5f36f9a105cdc68e`.

## Boundary

This proves elimination of redundant projection and pixel allocation. There was no browser/server execution here. It does not prove native elapsed improvement or claim to fix every PR2010 browser failure. The earlier hosted-snapshot diagnosis remains separately published at `53ea46dad21702fca93d612f8d42f87b5f9c596a` on `codex/ci2010-shared-failure-audit-20261003`.
