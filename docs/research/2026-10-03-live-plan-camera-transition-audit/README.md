# Held q1 mirrored plan and camera transition audit

**Observed no finding** on isolated base d0fab410772b551fa5caff3e0dfd5923cadf01e4. One source case, no new Issue or production edit.

## Actual sequence

The public dialog selects Basic cell, quarter-turn 1 and mirror. With primary held at stationary screen900,460, actual main HUD callbacks pan right, yaw+15?, elevation?10? and zoom1.4?1.75. Actual scene camera target changes768,768?938.8998435224407,824.7410294080034. Independent ground-plane inverse moves origin10,11?12,11.

The main ghost's28 polygons independently project to the new origin; public quote is20 orders,35 brick,2 wood,1,530 materials catalogue value. Mirrored rotated furniture anchors/extents are4,2/2?1 and2,1/1?1, each q1. Before release, no command and whole paused worker state equal the initial state.

Original held primary release sends one actual PlaceRoomTemplate at12,11, q1/mirror. Real worker snapshot has17 exact perimeter walls plus a west-edge door at relative1,2; pending plan preserves origin and transforms. A second release changes no whole state. Public main Undo cancels18 orders and removes pending plan; Redo restores18 active orders and the same transformed pending plan. Real V8 encode/decode and WorkerPerSessionHost fresh-worker Load restore the whole paused snapshot exactly. Redo and loaded JSON SHA256 both f6dfe115a4b55ced8352d65e7ae66f30f5e2e57ae1bdf446fab2dd993d2f45cd. Actual submit-command trace is PlaceRoomTemplate, Undo, Redo.

## Evidence and limits

[Single fixture](./live-camera-sequence.test.ts), [observed values and whole snapshot hashes](./observed-sequence.json), [raw run](./observed-run.txt), [fresh dedup](./fresh-issues-dedup.json). Audit/app/tools strict typechecks exit0. Research-index contract5 cases pass.

Existing #2001/#2002/#1908/#2007 tests and current Issue bodies were read first; #1968/#1974 were read after dedup. Existing camera-coherence, renderer-receipt, held-dialog and history tests cover their separate original causes. This case joins actual changed pose, original held release, history and whole paused Load without repeating the192-case catalogue matrix.

Actual dialog/scene/main callback bodies, ghost bridge, worker state machine/channel/feed/command sender, save encoder/decoder and session host are used. No command feed, projection, verdict or save payload is substituted. DOM events are source harness events, not trusted browser input; scene hosting/raster output are plumbing. Camera pose is set only at bootstrap, then moved by public handlers.

This is a read-only observational audit. No producer mutation was requested or performed, so no new sensitivity/negative acceptance is claimed. Native UI, native View select popup, renderer replacement during held press, construction completion, deployed behavior and CI are unestablished.

**Next proposal:** one real World?Angled?World renderer roundtrip during a held q1 mirrored plan, checking actual camera-memory restoration and old-release cancellation before a fresh press; existing renderer receipt tests settle accepted requests after replacement but do not join that earlier-held gesture to both real camera implementations. Coordinate with the root browser lease before native work.

The first index check was2RED/3GREEN because this record placed its link in column2; that broke the index parser at the new row. Only this row was corrected to the canonical linked column1. Existing rows were preserved; restored index check5GREEN.
