# World room-plan ghost versus the actual Phaser camera

Date: 2026-10-03. Isolated baseline: `46c1963ac27fbe1fd08a7f0f71098829b3196a3f`.
Browser lease belongs to Art; no browser or server was started here.

## Source finding

The composition root's room-plan bridge picks the ground square through actual
`Camera.getWorldPoint`, but its World forward projector uses
`(world - scroll) * zoom + viewportOffset`. Phaser 4's actual camera scales around
the viewport origin and includes that origin in its combined matrix. At zoom 1
the omitted terms cancel; at other zooms the shown footprint moves away from
the ground square picked by the same pointer.

At FullHD 1920x1080, zoom 1.25 and the default origin, the old projector adds
240px horizontally and 135px vertically to the actual rendered ground point.
This is a measured source-camera mismatch, not an actual native screenshot.
World↔Angled replacement reinstalls the bridge and retains renderer view memory;
returning to a zoomed World view therefore keeps this wrong forward adapter.

The regression executes the unique project and pick callback bodies read from
`src/main.ts`. They are plain JavaScript bodies, evaluated unchanged rather than
duplicated in the test. The installed TypeScript 7 package has no runtime parser
API; that initial test-loader failure is excluded from product evidence.

The reference is the installed, real `Phaser.Camera`: constructor, `preRender`,
`matrixCombined`, `getWorldPoint` and `TransformMatrix` all execute unchanged.
Only the unused GPU FilterList constructor is replaced to avoid browser-device
initialization in Node. No camera equation or origin is mocked.

## Obtained baseline

`tests/unit/ui-room-plan-world-camera-projector.test.ts` obtains **20 RED / 4
GREEN**, 236ms. Cases cross zoom0.2/0.5/1/1.25/2/3, viewport offsets0,0 and140,90,
and backing-to-CSS ratios1/2. The four zoom1 controls pass all four footprint
corners. Other zooms fail the real-camera forward assertion. Each fixed case
will additionally inverse-pick all four shown corners through `getWorldPoint`.
Backing-to-CSS ratios are coordinate conversion checks, not native UI-scale or
page-zoom acceptance. Those need the queued browser100%/200% cases.

See [actual real-camera baseline](world-projector-baseline-real-camera.log).

## Other inspected hypotheses and scope

| Boundary | Read-only finding |
| --- | --- |
| Native minimap mouse/keyboard activation | Current HUD uses event.detail0 for the centre and physical pointer coordinates for other clicks; inactive sessions/zero-size surfaces return early. Existing native normalization tests cover this. No new defect claimed. |
| Session replacement with armed room plan | Current session claim explicitly stands the shared room-plan tool down before the replacement worker takes ownership. No retained-origin bug claimed from that source. |
| Renderer change with armed room plan | Old bridge is withdrawn and a bridge is installed against the new active scene; shared tool identity remains. The concrete forward projection error above is outside the prior angled144/32 matrices. Asynchronous accepted-placement disposal remains an unproven hypothesis. |

Fresh all-state room/ghost/zoom and top-down/origin searches were read. Full
bodies of #1603 (prior canvas overlay), #1906 (bridge integration), and #1914
(angled preview refresh) were read. Their evidence covers other producers;
none states this World's missing camera-origin term as an existing finding.
No Issue is created by this diagnostic checkpoint yet.

## Scoped correction and producer negative

Only the World forward callback in `src/main.ts` changes: it delegates to
`camera.matrixCombined.transformPoint(point.x, point.y)`, the rendered-frame
matrix which the actual ground picker inverts. This retains camera origin,
zoom, scroll and viewport offset without adding those offsets twice. Angled
projection, picking, scene producers, minimap behavior, tool/coordinator state,
schemas, layout and copy remain outside this change.

The corrected callback passes **24/24** cases. A temporary production mutation
replaces its unique return statement with the original origin-omitting formula:
**20 RED / 4 zoom 1 controls GREEN**, 252ms. The mutation changes no test or
reference camera. A `finally` restores the corrected source bytes and checks
exact identity; the restored 24 cases are **24/24 GREEN**, 226ms.

Restored whole `src/main.ts` SHA256:
`4a2461e3655cdf5bfceb53eb62674cddcf711885125bf6f1c3b36587ea40d0d3`.
The focused projector plus existing world bridge and renderer-selection suites
then pass **40/40**, 3 files, 575ms, with maxWorkers=2. App and tools TypeScript
checks pass. No browser/server process was launched for any of these checks.

Receipts:

- [Producer omission negative](projector-origin-omission-producer-red.log).
- [Byte-restored real-camera cases](world-projector-byte-restored-green.log).
- [Focused neighboring suites](projector-related-restored-green.log).
- [App/tools TypeScript](typecheck-fixed.log).

Native FullHD 100%/200% acceptance is queued after Art/root browser work.
Real callback and camera evidence establishes the source defect; it does not
claim native pointer placement, actual UI scale, screenshots or hosted CI.
