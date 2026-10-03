# Loading Dock Door native player preparation ? 2026-10-03

## Scope and state

Prepared from clean source/export checkpoint `0d5ea8939a4475a9750d4ef22e890b9ea1df87e1`, in an independent worktree. This checkpoint adds one three-case player spec and preparation receipts only. No production source, renderer, catalog, save rules, timeout, retry, workflow or canonical test matcher changes. **No browser or server has been started; native acceptance and consumer-removal RED/exact-restoration remain pending with the parent.**

The [dedicated fixture](../../../tests/browser/dedicated-loading-dock-door-player-build.spec.ts) uses actual New prison, Storage Room at(5,5), Delivery Bay at(12,5), real worker construction and actual IndexedDB Save. Each independent q0/q1 target case loads that save, submits the third genuine Delivery Bay at(20,5), awaits every construction decrease, pauses, records live worker data, saves and loads through the UI. It compares the **whole paused worker data** byte-structure by equality and checks both real object owners separately. No completed objects, allocated materials, stock or pre-completed target save are injected.

## Independent actual kernel preparation

The production runtime factory used by the real worker was instantiated at seed73. Only normal `PlaceRoomTemplate` commands and normal scheduled kernel ticks were used. The capacity run completed in2531ticks. Capturing/restoring that real production capacity snapshot and then submitting each third Delivery Bay completed in1520ticks. [Actual completion receipt](offline-kernel-completion.json) records both completed orders, real material allocations, anchors and source owners. This is **offline preparation**, not a browser run or proof of IndexedDB/native rendering. The initial scratch harness called a nonexistent flush method and failed before construction; after inspecting Kernel's actual `dispatchDueCommands` API, the genuine run passed1/1. Scratch logs retain that initial setup failure.

| Object | Literal placedObjectId | Literal sourceOrderId | Orientation |
| --- | --- | --- | --- |
| Preserved capacity dock | object:13:6 | room-template-000000000001-2-object-000 | 0 |
| Third Delivery Bay q0 | object:21:6 | room-template-000000000002-2-object-000 | 0 |
| Third Delivery Bay q1 | object:24:6 | room-template-000000000002-2-object-000 | 1 |

The production template is6x6 with dock local(1,1), footprint3x1; its clockwise turn has local(4,1), footprint1x3. The spec requires exactly one capacity dock before target placement, exactly two afterward, unique placed owners and unique source orders, completed `loading-dock-door-wooden` orders at each owner's anchor, and matching orientation. The runtime world has literal `version:1`; this receipt makes no claim about a worker worldV8 owner plane or a persisted codec not read in the browser.

## Native palette and hardware inspection queue

Historical accepted q0 glazing RGB(31,94,99), rectangle(800,380,360,230), >100pixels remains unchanged, including historical minimap recenter(22.5,7.5). q1 uses the same glazing colour but rectangle(850,330,220,260) is **provisional pending actual native FullHD inspection**. q1 minimap target(23,8) is likewise prepared, not calibrated. Failure hooks preserve actual worker snapshot and FullHD; soft palette failures still allow Save/Load evidence to be captured. The queued final run must open completed/loaded images, preserve initial raw calibration failures, isolate the target from the capacity dock, remove only the default dock consumer to prove genuine RED at both orientations, and byte-restore/rebuild for finalGREEN under existing60s/10s/one-worker/zero-retry limits. No gate is weakened here.

A separate actual native hardware view is captured after Load: three15-degree right steps for q0, or three left steps for q1. The default world yaw is-45degrees; `objectArtYaw` adds orientation*90degrees. Thus both views select source yaw0, which looks at the authored -Y window/escutcheon face. Front hardware and back hinge visibility are inspection requirements; screenshot preparation is not accepted evidence.

## Prepared executable receipt

[Build receipt](prepared-build-receipt.json): app/tools TypeScript exit0, production build exit0, compiled worker `worker-BMAX00bm.js`,438431bytes, SHA256 `880fe29be7fcef75d3284e9e18b7a3a91aa665c4c9fd32a77ee483600bef17a0`. Descriptor Git blob LF digest and actual Windows CRLF digest are separately reported; they parse identically. The preserved model-source digest is the previously audited `7eeca158b9e5f92abb139ab8164f5dd7a2aa2f2ca47936e4b08e4ea6c79a3aac`.
