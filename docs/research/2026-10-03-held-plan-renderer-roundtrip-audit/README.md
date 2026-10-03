# Held q1 mirrored renderer roundtrip audit

**Observed no finding** in one source/worker sequence, isolated root integration04bb28215a3e0d526613b39c86d174139e39bf97. No Issue, production change, browser or server.

## Actual sequence

Public Basic cell dialog selects90 degrees and Mirror. Original primary pointer stays held at screen900,460 while the actual main View select and LiveRendererSelection replace World with Angled, then a fresh World scene. Actual main deactivate/activate/changed bodies capture camera memory, restore the logical centre and reinstall the ghost.

Original World centre768,768 and zoom1.25 transfer to first Angled while its own default zoom1.4 and angles35/65 degrees remain. Public Angled pan/zoom/yaw then produce the observed centre992,832, zoom1.75, yaw50 degrees. The second factory creates a genuinely new World camera with default zoom0.75; actual restoration instead yields zoom1.25 and latest centre992,832. The actual memory contains both mode records. Ghost auto-fit remains enabled.

All three scenes are real production scene classes; World uses the real Phaser camera and affine matrix. The actual new World ghost remains clear with28 polygons and the tool stays armed. No placement occurs during transitions. Original stale release leaves the **whole paused worker snapshot** unchanged. A fresh down also leaves it unchanged; fresh release sends exactly one real PlaceRoomTemplate at independently inverted origin14,12, q1/mirror, and creates18 shell orders. The accepted pending plan has that same origin and transform and stands the tool down.

[Observed camera records, actual command and whole hashes](./observed-roundtrip.json), [single fixture](./held-roundtrip.test.ts), [raw GREEN](./second-run.txt), [fresh all-state Issues dedup](./fresh-dedup.json). One case GREEN; audit/app/tools strict typechecks exit0; [research-index contract](./index-contract.txt)5GREEN. Only this record and its canonical first-column row were added.

## Prior coverage and boundaries

Read before execution: renderer-stationary-hover, renderer-placement-receipt, LiveRendererSelection, renderer-view-memory, renderer-selection-control and primary-button cancellation tests. #1967 current body also read. Their separate cursor/accepted-receipt/navigation/camera causes were not filed again. This joins original held press, two real scene replacements and mode-specific restoration before stale/fresh releases.

Actual public dialog/main callbacks, bridge, scene camera capture/restore, worker state machine/channel/feed/command sender and session host are used. Only Phaser scene hosting/Create readiness, texture readiness and raster destination are plumbing. World camera preRender remains real; Angled pose is initialized at factory bootstrap and changed thereafter by public callbacks/actual restoration. Source EventTarget events are not trusted browser actions. No fake command feed, worker verdict, projection, history or save payload is introduced.

This read-only audit had no producer mutation and claims no new negative sensitivity. Native selector/popup behavior, browser rendering, construction completion, Save/Load of this roundtrip, other renderer failures, CI and deployed behavior remain unestablished. Root owns native work and source mutations.

## Preserved observer/setup failures

The initial generator failed before making a fixture because PowerShell stdin encoding damaged a Unicode absolute path; dedup alone was safely committed4b67120572. Relative path and explicit UTF8 corrected that setup. Prepared fixture checkpoint776ddd188f was then pushed.

The first actual case was RED before any assertion: [original raw run](./first-run.txt) shows Expected closing brace, got end of file. The source extraction excluded the public select callback's final brace. Only extraction was corrected to include it; production bytes were untouched. Restored source observation is1GREEN44ms. No game defect was inferred from this harness error.
