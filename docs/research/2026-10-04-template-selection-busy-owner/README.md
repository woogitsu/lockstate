# New plan selection retains an abandoned preflight busy owner

## Actual original source/worker result

Existing Issue https://github.com/woogitsu/lockstate/issues/2002 has a remaining generation boundary on published `94c4143fca0d1577c3438a502ae78045e95d1054`. A pending real placement query belongs to an older tool selection revision. Changing the selected Cell's mirror/clockwise rotation or invoking `arm()` through the existing Place on map route increments that revision, so its old result correctly cannot place. However, the abandoned operation's busy token remains. A new placement immediately returns busy without reaching its current worker query.

This test runs actual SimulationWorkerStateMachine, SimulationWorkerChannel, WorkerPerSessionHost, SimulationCommandSender, RoomTemplateTool and its real preflight projection port. It starts a genuine Cell purchase at10,10 and captures/encodes/decodes its V10 snapshot. The second Cell targets20,10, with mirror and one clockwise quarter turn for selection replacement. Only transport delivery of actual worker query replies is held; no verdict/world/stock/state is substituted. The public panel's existing selection and Place on map handlers call these exact tool methods. DOM/native gesture timing is not measured.

Original eleven-case suite:2RED/9legalGREEN,4.46s. Adding an explicit no-op same-selection control retains2RED/10legalGREEN,2.72s. Nine existing New/Load, delayed same-generation, stand-down and token ownership controls already work. No-op same selection keeps its selection revision and busy owner; a genuine delayed old request still buys exactly once after its reply.

## Deduplication and authorized scope

Fresh all-state preflight/busy/selection search returns only#2002; its complete current body was read. This reuses that Issue rather than opening a duplicate. Existing #2002 symbol owner and finally guard must remain. Parent granted only RoomTemplateTool select-change and arm busy-token resets at their existing revision invalidation boundaries. No-op selection must remain busy. No main/bridge/worker, schema, layout, copy, tariff or format changes.

## Evidence boundary

`raw/original.txt`, `raw/original-with-noop.txt`, `raw/original-executed-regression.test.ts.txt` and fresh duplicate search are the original executed evidence. Fixed, independent producer omissions and exact restoration will be recorded after execution. No browser/server/build/full suite/CI budget change or measured native latency claim.
