# Dedicated authored Kitchen stove detail source

Source preparation based on published integration `e43ec87516d94d40eec12018fca8f945faed455e`. Canonical `object.stove` / numeric ID 9 / `stove-brick`, authoritative 2x1 footprint and food-preparation capability remain unchanged. Existing asset ID `furniture.kitchen.stove.variants` and descriptor `oblique-furniture.kitchen-stove.v1.json` remain the production identities.

## Existing counterpart and truthful scope

The original stove already has the shared 256 px/span 4=64 pixels-per-tile pipeline and a genuine normal Kitchen worker/SaveLoad consumer proof documented under `2026-10-02-kitchen-square-fixtures` (existing Issues 1957/1869). This is new authored detail geometry on that retained source, not a claimed camera defect or duplicate pose densification. A fresh all-state GitHub title lookup for stove hit the explicit API rate limit; it was not repeatedly polled. Existing local source history identifies original authoring commit `257847541a93bd95ef8847db619c232986110ae8` and prior shared alignment `110458a0a5e162c9e6caa2a4b78eec412aeb9188`.

Original source `assets/source/blender/furniture.kitchen.stove.variants.blend` stays byte-identical: 119040 bytes/SHA256 `cbf3ed97f84e126ddb309ea55559810ac156d430371dcb9c074e7b7e1c3523d9`. Native evaluated original bounds [-1.0299999714,-.6099999547,0]..[1.0299999714,.4499999881,2.2300000191], 29 meshes with 6 authored material RGBA sets. Its actual native preview was opened before authoring.

## Actual new geometry while retaining authorship

`refine-kitchen-stove-angled.py` loads that exact original source, retains all 29 original mesh assemblies/materials, and bakes the previously approved XY fit (.9,.75) into the dedicated centered source. Original vertex comparison matches that fit with maximum error 1.1920928955078125e-7; added geometry does not alter the fitted assembly.

The dedicated `furniture.kitchen.stove.angled.blend` adds 51 physical meshes: 4 closed elliptic cast-iron burner collars with central openings; 8 crossed pot supports; 8 oven seal rails and 4 hinges; 10 side vent recesses and 10 raised louvres; 6 control-knob index marks; 1 rolled splash lip. All added geometry uses only the original cast iron/brushed steel materials. Original enamel, glass, orange burner cores and status green are retained. No palette or gameplay rules change.

Total 80 meshes, measured source bounds [-.9269999266,-.4575000107,0]..[.9269999266,.3400000036,2.2460000515]. Source SHA256 `540c8b22be73848bb1520fae9ffeabfce7711bb0c629161e529b6d6ae33ca5fc`. Complete original/added names and native counts are in the source provenance JSON.

The stove-only wrapper imports the unchanged shared square exporter and uses unit source scales plus one min-corner translation (1,.5,0). Actual prepared bounds [.0730000734,.0424999967,0]..[1.9269999266,.8399999738,2.2460000515]. All evaluated vertices fit 2x1 at quarter turns 0/2 and 1x2 at 1/3; all 72 native camera offsets/forward vectors pass independent verification. Shared 256/span 4=64 pixels-per-tile and actual height-midpoint target [1,.5,1.1230000257492065]. The new source/own wrapper preview was rendered and opened; SHA256 `ff5ab3510a6a1f49d136597955ef9720fdfd926377bf178bc313d50a1aba0873`.

Pinned Blender 5.2.1 LTS upstream build ID 9e2066aef7ef, executable SHA256 `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`. Both own entrypoints explicitly assert the pinned version.

## Completed production export and negative controls

The existing production descriptor now references the dedicated source and its 72 content-addressed poses. The only shared exporter catalogue change is the stove MODELS tuple (dedicated source, unit XY scales, actual midpoint target); shared functions/default callbacks and prep-counter/fridge rows stay byte-identical. The existing square-fixture stove target assertion follows the measured midpoint.

Two full exports produce all 73 identical files (72 PNGs plus descriptor), descriptor SHA256 `adeabb2e5abb1e59603564a163d6c2949449ebb844281e04a81be1a72b893c0a`. Every decoded actual frame has a transparent border; minimum clearance 33 px. The complete contact sheet and the actual runtime-selected source poses yaw300/elevation40 and yaw30/elevation40 were opened and inspected. Their PNG hashes are respectively `1c60dccb6ab8` and `e654758736c0` filename prefixes; no clipping was observed.

Five native production mutations each exit 1: remove an authored collar; move an added vent outside measured bounds; shrink the loaded Y fit; change actual orthographic span; move the actual camera off its declared vector. Exact wrapper bytes are restored and native verification exits 0 for all four footprint turns and 72 camera poses. A real exported PNG byte mutation makes the integrity assertion red; exact PNG byte restoration makes it green. Full recorded return codes, exact byte comparisons and hashes are in `export-verification.json`. These controls check loaded/evaluated geometry and camera state, beyond descriptor metadata.

Seven focused suites pass 58 cases with one pre-existing optional live-Blender skip; both own entrypoints also ran through pinned native Blender, independently of that skip. App/tools TypeScript checks pass.

## Native acceptance pending

Real Kitchen workers, normal/90 degree isolated palette regions, actual SaveLoad, default stove consumer-only mutation and exact restoration remain pending an exclusive browser grant. No stove browser has launched. Existing prep counter/fridge source, registry, mapping and gameplay rules remain unchanged. No hosted acceptance claim.

### Queued native route

`dedicated-kitchen-stove-player-build.spec.ts` reuses the accepted real two-stage route: native Storage Room at5,5 and Delivery Bay at12,5, actual worker completion, IndexedDB save consumed by the normal/90 Kitchen stage at20,5. Snapshot anchors/orientations include all three real Kitchen fixtures: normal stove21,6/prep23,6/fridge21,8, rotated stove24,6/prep24,8/fridge22,6 (orientation1). Every queue step keeps the existing10-second progress guard and60-second case budget. This preparation does not inject world objects or completion and changes no buildable/save rules.

Burner183/109/52 and cast-iron44/50/52 are source-derived provisional candidates, with explicitly provisional rectangles/thresholds. They remain unaccepted until actual loaded player pixels, isolated region calibration, stove-only mapping-removal negative runs and exact restoration. The existing Kitchen triple spec remains unchanged. No browser or workflow config is added.
