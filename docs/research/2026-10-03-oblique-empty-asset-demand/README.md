# Empty Angled scene image demand

Fresh nonduplicate [Issue #2018](https://github.com/woogitsu/lockstate/issues/2018) records an avoidable eager image batch. This is source/counter evidence, not native latency or GPU profiling.

## Obtained original producer measurement

The unchanged private eager loader ran against the real 64-entry published registry and all parsed catalog descriptors, before any world frame. The actual producer requested 64 selected PNGs. Actual encoded file sizes or committed LFS declared sizes total **738,609 bytes**. Catalog image dimensions correspond to **36,634,624 bytes of full-resolution RGBA**. This last number is a pixel-data equivalent, not a measured GPU allocation. No browser, network image decoder or GPU was launched.

The unchanged demand selector received an empty raised projection and requested **zero images**. It already selects actual item asset IDs and orientation-local camera frames, queues missing textures, tracks failed/loading keys, uses fallback graphics, and repaints on completion. Catalog/HUD skin validation is separately eager and must remain available.

[Full measured entries](./actual-producer-measurement.json) retain selected URL/hash/dimensions/encoded size for every catalog. [Exact executed source probe](./executed-producer-probe.test.ts.txt) is archived inert; its physical source SHA256 is `5e245d32030afec7ec447a2f6bff1fc57d47b464d843c13d0e0c6b616f492446`. The probe observes actual loader calls; it stubs Phaser port completion, not image bytes, verdicts or game state. The producer was not changed. The source subject is `subject=c29cf94da492aa9697d062795b825fe222fab21c`, a descendant of the published minimap-cache chain. Initial counter-only run and repeated capture run each passed the single probe; output is retained in producer-measurement files. The final capture writes its counter JSON directly because console output was absent from the terminal reporter; this is measurement instrumentation, not a production change.

## Compatible bounded implementation plan

Keep the complete eagerly verified descriptor map, including dynamic room skins. Replace unrelated raised-model boot requests with the existing demanded-item queue. Floor textures still determine scene readiness. Serialize floor and demanded-model image batches through the same actual Phaser loader; wait only for required floor keys before readiness. Preserve graphics while any actual demanded texture loads, repaint on completion, use current orientation/skin on subsequent paint, and invalidate late callbacks at shutdown. No new dependency, camera/gameplay/persistence rule, retry, timeout or CI setting.

Coverage will exercise the actual scene loader producer with observed Phaser ports: empty boot excludes unrelated models, floor readiness, required placed/actor/pending models, orientation and skin changes, concurrent floor/demand serialization, failed texture fallback and late completion after shutdown. Native timing remains pending an actual frozen-subject profile.

## Deduplication and boundaries

Fresh issue searches for texture/preload/on-demand found no specific existing eager empty-scene image report. Actor-depth #1913, facing #1927 and the broader asset pipeline #32 describe different defects. Original avoidable request count is preserved before implementation. No production fix, mutation proof or native acceptance is claimed in this initial diagnostic checkpoint.

## First coherent implementation checkpoint

Actual empty-boot regression before production edits: 1 RED (six other selected-out tests), because unrelated model PNGs were queued before any frame. Initial fixture named a nonexistent cot manifest and failed at import; that is retained as a fixture error, not production RED. Initial fixed test expected a pending square wall PNG, but the current projection intentionally gives that wall its existing fallback; retained as a fixture assumption error (1 RED / 6 GREEN). The corrected coverage checks actual pending cot frames and retains the square-wall fallback contract.

Current implementation: 8 lifecycle tests GREEN; application and tools strict types both exit 0. Eager descriptor/skin validation is untouched. Floor and raised images now share serialized loader batches; floor key completion controls readiness; demanded orientation/skin and late shutdown completion guards remain explicit. Production-negative/exact-restoration proof and bounded neighbors are still pending this first source checkpoint.

## Obtained actual producer negatives and restoration

The mutation run detached exact fixed `b9281725ce6ff7452bec9deda2618a9ebd584149` before edits and returned to its own branch in finally. Six genuine source mutations were tested:

| Actual producer alteration | Obtained negative |
|---|---|
| Reinstate original eager selected-model boot batch | 1 RED, 7 deliberately unselected |
| Disconnect actual demand selector | 4 RED, 4 GREEN |
| Ignore item orientation in actual selected-frame query | 2 RED, 6 GREEN |
| Remove loader-busy serialization condition | 1 RED, 7 unselected; actual fake loader port also reports the forbidden overlapping start as one unhandled error |
| Remove late shutdown/generation completion guard | 1 RED, 7 unselected |
| Read generic chair catalog for the actual Classroom skin | 1 RED, 7 unselected |

Every mutation was followed by finally exact physical source-byte restoration. Original and final source SHA256: `ed4a8ae130c039c8f19bd2cf48e6ec924c38f8e9d28e0193cc3222d5bf5d7bce`. Production diff was empty. The restored actual lifecycle suite passed **8/8**. [Structured original receipt](./mutation-receipt.json), named negative output files and [exact executed mutation driver](./executed-mutation.cjs.txt) are retained. No browser, network decoder, server or GPU was launched.