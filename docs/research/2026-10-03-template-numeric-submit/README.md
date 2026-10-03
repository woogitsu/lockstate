# Accepted numeric plan retains original map press ownership

2026-10-03; subject7c9a16a10cc02eb09869a4aad7fbef2884434a65. Production unchanged; source-only genuine callback/worker reproduction. Native pending ROOT; no browser/server started.

## Actual reproduction

Actual main map-ghost adapter, RoomTemplateWorldBridge, RoomTemplateTool, createRoomTemplatePreview, both Scene classes, real Phaser World camera and actual worker preflight/commands/state machine.

1. Selectq1 BasicCell and arm through actual Place on map callback; physical primary event shape button0/buttons1 starts a map press at stationary FullHD cursor900,460. Independently computed retained origin is World11,11 or Angled10,11.
2. Open actual Room plans, keep the same selection/q1. Use public coordinate input callbacks for X20/Y5; invoke actual Place room plan button click listener (keyboard activation's native default is not fabricated).
3. Actual worker accepts q1 plan20,5: one command and18queued shell orders. Numeric success does not stand down shared map tool or change its revision.
4. Close plans, then deliver owning primary release button0/buttons0 with no new canvas pointerdown. Existing bridge still owns old selection/press and sends a second q1 command at original map origin. Actual worker snapshots contain both pending identities and36shell orders.

| Renderer | Before old map release | After old map release | Worker orders |
| --- | --- | --- | --- |
| World | q1Cell20,5 | q1Cell20,5 and11,11 | 36 |
| Angled | q1Cell20,5 | q1Cell20,5 and10,11 | 36 |

Two regression cases RED (armed=true after numeric acceptance and actual2commands instead of1), four legal controls GREEN: leave dialog unchanged, or make numeric31,31 footprint unowned/disabled and do not activate it. The rightful original map release still submits one original18order plan. Both disjoint accepted plans fit real owned32x32land; no invented mouse chord, copied verdict or snapshot mutation.

## Existing contract and deduplication

Fresh complete body/comments of #1908 say an accepted command disarms its original tool; later extension protects matching accepted completion across renderer disposal while preserving newly selected/rearmed tool. Numeric accepted callback is a separate missing consumer of that same contract. #1934 only guards stale numeric status; #2002 busy/session; #2004 construction cancellation; #2001 middle-release; #2006 secondtouch. No new input/layout/copy/save rule is proposed. Reuse/extension of #1908 proposed to coordinator rather than duplicate Issue.

Scoped correction proposal: only numeric accepted handler in src/ui/hud/room-template-preview.ts. Capture tool revision before awaiting placeAt; when result.ok, same revision and tool still armed, standDown that accepted original owner. Do this before local dialog status early return so edited numeric presentation cannot strand accepted ownership. Preserve new selected/rearmed tool, rejected preflight, numeric submit lock and local status guards. Main/bridge/Scene stay unchanged. Lease requested; no production fix performed.

## Evidence limits

This is actual source callback and authoritative worker proof, not trusted native pointer/key acceptance. Minimal display/DOM plumbing and static empty presentation feed do not manufacture tool/command/worker state. Both actual preflights independently evaluate worker occupancy. Public numeric input/click handlers represent browser default activation but do not prove actual Enter behavior. Native legal held primary plus keyboard-open/coordinates/Enter/close/release is queued only after ROOT confirms scope.

Actual command and pending/order receipts are in actual-commands.jsonl, full initial2RED/4GREEN in initial.log. Queue acceptance is not an upfront1530debit: future furniture is deferred; these are36actual shell orders/two plans, not a claim of completed/paid40orders. No negative/restore result yet; producer mutation follows authorized correction, not diagnosis.
