# New plan selection retains an abandoned preflight busy owner

## Actual original source/worker result

Existing Issue https://github.com/woogitsu/lockstate/issues/2002 has a remaining generation boundary on published `94c4143fca0d1577c3438a502ae78045e95d1054`. A pending real placement query belongs to an older tool selection revision. Changing the selected Cell's mirror/clockwise rotation or invoking `arm()` through the existing Place on map route increments that revision, so its old result correctly cannot place. However, the abandoned operation's busy token remains. A new placement immediately returns busy without reaching its current worker query.

This test runs actual SimulationWorkerStateMachine, SimulationWorkerChannel, WorkerPerSessionHost, SimulationCommandSender, RoomTemplateTool and its real preflight projection port. It starts a genuine Cell purchase at10,10 and captures/encodes/decodes its V10 snapshot. The second Cell targets20,10, with mirror and one clockwise quarter turn for selection replacement. Only transport delivery of actual worker query replies is held; no verdict/world/stock/state is substituted. The public panel's existing selection and Place on map handlers call these exact tool methods. DOM/native gesture timing is not measured.

Original eleven-case suite:2RED/9legalGREEN,4.46s. Adding an explicit no-op same-selection control retains2RED/10legalGREEN,2.72s. Nine existing New/Load, delayed same-generation, stand-down and token ownership controls already work. No-op same selection keeps its selection revision and busy owner; a genuine delayed old request still buys exactly once after its reply.

## Deduplication and authorized scope

Fresh all-state preflight/busy/selection search returns only#2002; its complete current body was read. This reuses that Issue rather than opening a duplicate. Existing #2002 symbol owner and finally guard must remain. Parent granted only RoomTemplateTool select-change and arm busy-token resets at their existing revision invalidation boundaries. No-op selection must remain busy. No main/bridge/worker, schema, layout, copy, tariff or format changes.

## Evidence boundary

`raw/original.txt`, `raw/original-with-noop.txt`, `raw/original-executed-regression.test.ts.txt` and fresh duplicate search are the original executed evidence. Fixed, independent producer omissions and exact restoration will be recorded after execution. No browser/server/build/full suite/CI budget change or measured native latency claim.

## Terminal verification

Published diagnosis `5986a5d695`, source `a0e88a2600ed0a1f25f7876f32c2761f5b73ef8c`, branch `codex/template-identity-next-audit-20261004`.

- Fixed12GREEN,2.70s. Both new generations reach their genuine worker query, settle their old response without any whole-snapshot mutation, retain the current busy token against a third attempt, and purchase exactly18 new shell orders only when their current reply arrives. Existing orders remain unchanged; actual submitted mirror/q1 request is asserted literally.
- Omit only selection-change reset:1RED/11GREEN,3.20s. Omit only arm reset:1RED/11GREEN,3.21s. Existing symbol-owner `finally` remains unchanged in both mutations and production.
- Mutations detached exact source checkpoint. Finally byte-exact restore12GREEN,3.19s; SHA256 `fe68fa26b95046f3402af7811da4ad982c4a78e6f130f57b9c7a8ab9c185130f`, source diff zero, branch restored.
- Bounded neighboring suite141GREEN/11files,6.59s: actual session queries, standalone tool, world bridge, numeric submit/session ownership, projection requester, room command protocol, genuine room session and unchanged source-anchor/quotation/research-index gates. Application/tools strict types exit0. No citation, guard or budget changes.

Raw fixed/negative/restored outputs, actual executed inert mutation recipe and `mutation-receipt.json` are preserved; `sha256.json` records their exact stored bytes. No-op same selection, delayed same-generation completion, outgoing New/Load queries and existing stand-down still behave as before. This is query responsiveness/operation ownership evidence, not native latency or physical completed-fixture acceptance.
