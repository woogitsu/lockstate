# Authored Storage Room rack visual

Issue #1869 listed seven buildable objects without complete oblique assets. On this branch's base, all seven already have object aliases, Blender sources, rendered manifests, and registry entries. This increment instead gives the existing `object.storage-rack` a dedicated visual in the Storage Room plan, which places two racks. The default generic wooden rack stays in other rooms. The game object ID, one-square footprint, construction materials/work, capabilities, and save identity do not change.

## Source and repeatability

- Blender generator: `tooling/blender/create-storage-room-rack.py`.
- Source: `assets/source/blender/furniture.storage-room.timber-rack.blend`, SHA-256 `36c75d364d604ee666adf42b287a75f24e3a174bf7b0892a829aeb8a0dc9d435`.
- Source mesh bounds (before bevel evaluation): X `[0.114, 0.886]`, Y `[0.124, 0.876]`, Z `[0, 1.295]` in tile units. No mesh extends outside the same 1 x 1 occupied square.
- Materials: sealed timber, painted blue-grey rack frame, kraft supply cartons, pale paper labels, and reusable tray. Stored supplies are visual detail only.
- Exporter: `tooling/blender/render-storage-room-rack-oblique.py`. Resolution 256 x 256, ortho span 4 tiles, exact nominal 64 px/tile, target `[0.5, 0.5, 0.70]`, pivot `[128, 128]`.
- Manifest: `public/game-content/oblique-furniture.storage-room-rack.v1.json`, 12 yaw x 6 elevation = 72 SHA-checked transparent PNG poses. Two full rerenders produced the same manifest SHA-256 `e349630ecb0366167310e8a37460ab81583cde34cda2c5987272f48fa2eaf2cc`.
- [Twelve-view pose sheet](./poses.png) is assembled only from frames whose bytes match the manifest and whose alpha bounds stay inside the image border.
- [Old and new at the same 64 px/tile scale](./old-versus-new.png) shows the generic open frame beside the stocked three-shelf variant. The old 512 px source was cropped centrally to 256 px for this comparison; neither sprite was rescaled.

## Runtime scope and current checks

The production registry maps the new manifest, and the contextual selector chooses it only for a **built** `object.storage-rack` wholly inside a published `room.storage-room` rectangle. The old `furniture.storage.rack.wooden` remains the fallback elsewhere. Before implementation, the focused context test failed 1/5 on this difference and passed 5/5 after it. Manifest and source hash tests plus the inherited Classroom context pass, 12/12 total; TypeScript and rendered-art catalog validation pass. Mutating the first frame SHA to zeros failed byte integrity; restoring the manifest passed.

## Actual player route at Full HD

The bounded `tests/browser/storage-room-rack-player-build.spec.ts` uses the repository's ordinary 60-second case and 10-second assertion limits. In the actual 1920 x 1080 application, a player started a prison, placed the Storage Room plan at (4,4), advanced time with the real speed controls, and watched each worker queue transition. Two rack orders completed at (5,5) and (7,5). The [completed view](./player-completed-fullhd.png) shows both Blender racks. Independent frame-color counts in their two image rectangles were `[1581, 1486]`, each above the 800-pixel gate. Save/Load retained both placed-object anchors and the [loaded view](./player-loaded-fullhd.png) had the same pixel counts.

The baseline passed 1/1 under the normal browser budgets. Mutating only the production Storage Room selector to the old generic rack made the browser test fail with zero qualifying frame pixels rather than over 800. Restoring the selector passed 1/1 in 35.9 seconds. The mutation did not change the object identity, construction, materials, or save data.
