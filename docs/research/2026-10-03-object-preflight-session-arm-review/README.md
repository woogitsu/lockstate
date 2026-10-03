# Individual object preflight session-arm review

2026-10-03. Independent review of exact 8a8aa7a02b6ba98136bb628a9d403df40b4c1108 and descendant0133444974a5d14dcf0884c7162f940cd09fbee8 (actual ancestor verified). Own isolated worktree at013; no browser/server. Initial request read-only; root then authorized a minimal confirmed lifecycle correction.

## Confirmed finding

013 main.ts ready callback411 and worker-availability callback4607 call ObjectTool.setArmed(false). The Build panel keeps its existing armed/removal/selected state across Load; Hud.setUnavailable only changes the unavailable notice. Existing public oblique-room-object-load-gesture.spec.ts expressly cancels the held outgoing press, then requires a fresh press to send one PlaceObject without another arm-button click. New disarm violates this: ObjectTool.place returns immediately when disarmed, while the UI still says Stop placing. Both placement and removal are affected.

The new focused test extracts and executes the real composition-root callbacks, then drives the real ObjectTool, real revision observer and actual release method. Ready and availability × placing/removing: **4 RED**, all at actual armed=false vs expectedtrue. [Baseline](./raw/baseline.txt). A first test-import attempt produced0 tests because installed TypeScript7 exposes version metadata rather than the removed parser API; [fixture error](./raw/initial-fixture-import-error.txt) is retained and is not product evidence. Corrected test uses bounded extraction of the actual existing JavaScript-compatible callbacks, not a copied callback implementation.

## Reviewed authoritative path and planned correction

Scene commitGesture still calls ObjectTool.place; it does not read or trust allowed/blocked preview to admit a command. ObjectTool.place reports the HUD gesture, the composition root submits packed PlaceObject, and ObjectPlacementService.place executes the shared preflight again before minting the order. Real query is advisory and write-free: footprint/allocation/history/treasury mutation occurs only after admission in place. Catalogue reference and duplicate-order ordering remain intact. This review found no other confirmed runtime defect at these reviewed commits; native integration remains outside this source proof.

Minimal correction: invalidate old preview owner/aim/readout while retaining armed/removing/definition/footprint. Preserve cancelConstructionGesture at worker availability and also cancel it at ready/stopped publication. Old asynchronous replies cannot own a fresh aim, and fresh releases still pass through actual place regardless of preview.
