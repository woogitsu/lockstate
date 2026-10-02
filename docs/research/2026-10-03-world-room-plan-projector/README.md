# World room-plan ghost versus the actual Phaser camera

Date: 2026-10-03. Isolated baseline: `46c1963ac27fbe1fd08a7f0f71098829b3196a3f`.
Browser lease belongs to Art; no browser or server was started here.

## Source finding

The composition root's room-plan bridge picks the ground square through actual
`Camera.getWorldPoint`, but its World forward projector uses
`(world - scroll) * zoom + viewportOffset`. Phaser4's actual camera scales around
the viewport origin and includes that origin in its combined matrix. At zoom1
the omitted terms cancel; at other zooms the shown footprint moves away from
the ground square picked by the same pointer.

At FullHD1920x1080, zoom1.25 and the default origin, the old projector adds
240px horizontally and135px vertically to the actual rendered ground point.
This is a measured source-camera mismatch, not an actual native screenshot.
World↔Angled replacement reinstalls the bridge and retains renderer view memory;
returning to a zoomed World view therefore keeps this wrong forward adapter.

The regression executes the unique project and pick callback bodies read from
`src/main.ts`. They are plain JavaScript bodies, evaluated unchanged rather than
duplicated in the test. The installed TypeScript7 package has no runtime parser
API; that initial test-loader failure is excluded from product evidence.

The reference is the installed, real `Phaser.Camera`: constructor, `preRender`,
`matrixCombined`, `getWorldPoint` and `TransformMatrix` all execute unchanged.
Only the unused GPU FilterList constructor is replaced to avoid browser-device
initialization in Node. No camera equation or origin is mocked.

## Obtained baseline

`tests/unit/ui-room-plan-world-camera-projector.test.ts` obtains **20 RED /4
GREEN**,236ms. Cases cross zoom0.2/0.5/1/1.25/2/3, viewport offsets0,0 and140,90,
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

Parent grants a scoped follow-up on only this `main.ts` forward callback, using
the actual rendered camera transform. Angled projection, picking, scene
producers, minimap behavior, tool/coordinator state, schemas, layout and copy
are outside that lease. Correction, actual callback removal mutation and
byte-exact restoration remain pending. Native acceptance is queued after the
current Art/root browser work; source evidence is not called native completion.
