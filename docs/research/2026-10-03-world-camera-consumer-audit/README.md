# Remaining World camera consumers after zoom and pan

Date: 2026-10-03. Isolated baseline `8cb61ea64cc208689f653ca3d771e494f7e99d2e`.
No browser/server launch. The exclusive native browser lease belongs to Art/root.
Main room-plan and minimap source corrections are outside this audit's surface.

## Actual baseline: already correct

`world-camera-culling-square-callbacks.test.ts` runs actual WorldScene.create
registrations, middle-pointer pan callbacks, actual WorldScene.update culling,
worldPointOf, full-square hover/drag/commit handlers and actual BuildOverlay
rectangle producer. The host Phaser Scene shell and graphics destination are
replaced for Node; the installed real Camera, preRender, getWorldPoint and
matrixCombined execute unchanged. The unused GPU FilterList constructor is
replaced only to avoid browser device initialization.

24 cases cross six supported zooms0.2/0.5/1/1.25/2/3, viewports1920x1080 and
960x540, and both physical callback pan directions. After actual middle-down,
move and up, camera scroll is checked; preRender completes the same frame
against which the original pick and culling are compared.

- Actual tile consumer receives the exact engine-derived four-corner range
  with the existing one-tile margin.
- Four screen points match actual Camera.getWorldPoint, including opposite
  viewport edges and an interior pointer.
- The registered hover picks a whole square and actual preview fills exactly
  its64x64 ground rectangle.
- Left-drag emits precisely four chosen squares, with no early placement and
  no edge-wall placement call; release calls the actual placement port once.

Initial combined baseline **24/24 GREEN**,1.62s,maxWorkers2.
The final file splits culling and picking into independent groups for legal
controls during each mutation: **48/48 GREEN**,1.08s,maxWorkers2.
[Original receipt](original-world-callbacks-green.log).

## Limits and remaining proof

These are actual source handlers and tool-port calls, not native compatibility
mouse events, drawn browser pixels or actual authoritative worker commands.
The second viewport is a logical resize control, not actual200%UI acceptance.
World's accepted full-canvas viewport has offset0 and origin0.5; unsupported
custom viewport offsets/rotation are not turned into a defect.

No production change or new Issue is warranted by this baseline. Existing
angled144/32 matrices were not rerun or duplicated. Approved temporary producer controls were run sequentially at one unique
source location each, with exact byte restoration in finally after every run:

| Producer control | Actual RED | Legal GREEN controls | Exact-restored result |
| --- | --- | --- | --- |
| worldPointOf adds64 to picked x | 24 picking cases | 24 culling cases | 48/48 GREEN,1.04s |
| visibleTiles uses raw scroll as visible ground origin | 20 non-unit zoom culling cases | 4 zoom1 culling +24 picking cases | 48/48 GREEN,1.05s |

The original source is already correct. No permanent producer change remains.
Restored whole world-scene.ts SHA256 matches its original baseline:
`5c4e27ee263cb2e88d4258a4d7729e2cecb399e07e4a41af13727fcfdba6ab06`.
App/tools TypeScript passes. All processes terminal; no browser/server launched.

- [Final independent-group baseline](world-consumer-original-48-green.log).
- [Picking producer negative](world-consumer-pick-x-producer-red.log).
- [Picking exact restore](world-consumer-pick-x-restored-green.log).
- [Culling producer negative](world-consumer-cull-scroll-producer-red.log).
- [Culling exact restore](world-consumer-cull-scroll-restored-green.log).
- [App/tools TypeScript](world-consumer-typecheck.log).

