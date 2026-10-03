# Room-plan preflight across an actual session replacement

Issue [#2002](https://github.com/woogitsu/lockstate/issues/2002), read-only diagnosis2026-10-03.

Base `458f8eaad142de927f889f78d5adc8ac85eb73d3`. Source has not been edited.

## Actual boundary and results

The probe delays only transport delivery of a real worker preflight reply. It uses actual `SimulationWorkerStateMachine`, `SimulationWorkerChannel`, `WorkerPerSessionHost`, `SimulationCommandSender`, room-template ports/tool and the exact current `main.ts` worker-availability callback extracted without rewriting it. Load restores a genuinely purchased pending Cell through encoded/decoded V8. No world/entity/runtime/owner fixture injection.

`baseline.txt`: **2 RED / 1 legal GREEN**,2.61s. In both New and Load, the current worker returns clear, but fresh placement returns busy and sends zero commands. Entire authoritative capture before/after is identical; treasury25,000; orders0→0 for New,18→18 for Load. Correct old-worker reply suppression is retained. Advancing the original15,000ms timer in the offline fake clock settles the abandoned request, then actual fresh placement succeeds with18 additional shell orders/one pending plan. No native timing claim and no payment/debit claim for these initial-stock-backed shell orders.

`baseline.test.ts.txt` is the exact executed corrected probe; `run.cjs.txt` is its exact executed stdout+stderr capture runner. Raw transcript comes directly from Node child stdout/stderr. Initial extraction omitted the callback's closing brace and failed suite import (`Expected '}', got '<eof>'`,0tests). That was a fixture parsing error, corrected before this baseline; initial console output was not retained as a raw file.

## Existing behavior inspected

Fresh Issues searches: preflight session, room template busy, room plan timeout, projection disposed. Complete #1947 (armed preview across session), #1934 (numeric status after different selection), #1907/#1908 (pointer interruption/accepted ghost) do not cover surviving busy ownership. Existing tool, dialog-status, channel/session-host and projection-disposal cases were read; no repeated catalogue matrix was run.

## Proposed production scope

Only `src/ui/room-template-tool.ts`: ephemeral placement ownership token and abandonment on existing standDown. Unconditionally invalidate the old selection revision even for a numeric, unarmed operation. Old completion/finally must neither submit into a replacement session nor clear a newer pending operation. Current `main.onWorkerAvailability` already calls standDown on successful/failed claims, so no new main/host/bridge/persistence/protocol/locale/tariff changes are proposed.

No producer-negative proof exists yet. This checkpoint is diagnosis, not an accepted regression or completed fix. Browser is exclusively held by root; no own browser, CI lookup or run was started.
## First implementation checkpoint

Expanded source baseline `expanded-baseline.txt`:7 RED /1 same-session legal GREEN,3.28s (4New/Load armed or numeric,2cancel/rearm,1replacement-request overlap). `fixed.txt`:8GREEN3.06s after the tool-only token/reset correction. Final neighboring gates and production mutations are still pending at this checkpoint. Current permanent spec is `tests/unit/ui-room-template-session-preflight.test.ts`; it additionally checks that stale finally cannot open another worker request while the replacement's real query is pending.

## Terminal source proof

The correction is only17 diff lines in RoomTemplateTool (12added/5removed): an ephemeral symbol owns the pending placement; standDown always invalidates its revision and abandons its busy token; finally releases only its own token. Existing main/session/bridge boundaries remain unchanged. Old reply suppression remains on the genuine worker channel; the old requester still settles through its original timer, but cannot block a replacement session or unlock its newer operation.

The final9 cases add an actual numeric unarmed cancellation without rearming. They retain genuine current-worker preflight, exact18 added shell orders, preserved previous orders, full authoritative snapshot immutability on refusal/stale settlement and exactly one submitted replacement command. No payment claim is inferred from these stock-backed shell orders.

Detached-HEAD producer runs against real `src/ui/room-template-tool.ts`, followed by finally byte restoration:

| Actual mutation | RED | Retained controls | Duration |
| --- | ---: | ---: | ---: |
| Keep abandoned busy token in standDown |7|2|2.77s|
| Allow old finally to clear any busy token |3|6|2.67s|
| Only invalidate revision when armed |1|8|3.54s|

Exact restored9GREEN3.18s. SHA256 `34d63c43892c698005fe93abde19cca2b7f8cd33ace93e283373dfde152d8317`, byte comparison true, tracked production diff0 and named branch restored; `mutation-receipt.json` records the actual results. Subsequent strict TypeScript found four optional-simulation accesses in the test; those were corrected with optional access and retained expected values, no production/guard change. Initial errors remain in `app-ts-fixture-errors.txt`. Final current9GREEN7.82s in `final.txt`.

Bounded neighbors:141GREEN across10 actual files,6.44s, including the9 cases, tool/dialog/world bridge/fit, stationary renderer handoff, projection requester, worker channel/session host and actual room-template session. Both app/tools TypeScript exit0; production client build6.91s, actual worker `worker-DZrcqB02.js`.

Documentation first59GREEN/3RED preserved in `docs-before-metadata-ref-refresh.txt`: inherited Bookshelf Blender identifier was read as a Git citation, three published branch refs were missing locally, and the research-index walk exceeded its unchanged5s case guard. The initial docs wrapper had yielded a running process when the final9-case capture was started, so these two offline processes briefly overlapped; this is not a serial execution claim. Both terminated before the final docs run. Exactly named published Bookshelf/HUD/root branches were fetched once. Root authorized only the inherited metadata distinction `build_hash=9e2066aef7ef` and own continuous index row. Final docs62GREEN/8files4.12s with `GIT_NO_LAZY_FETCH=1`; no budget/allowlist/guard/source-anchor changes.

`producer-mutations.cjs.txt`, `bounded-gates.cjs.txt` and `final-run.cjs.txt` preserve the exact executed helper bytes. `baseline.test.ts.txt` remains the exact initial3-case probe. Expanded baseline used an intermediate8-case spec that was subsequently strengthened; this document does not claim the final9-case file is byte-identical to that intermediate source. Evidence SHA manifest identifies retained current bytes and copy verification. Active helper files are moved to own TEMP after verification.

No browser/native/remote CI execution, merge, schema, tariff or copy claim. Root retains the sole browser lease. Source checkpoint `9597520dd24985da7d49047eb1822d2964044ea5` follows published diagnosis `f592667ae77687c4f9553975a003fe1929935097` on `codex/template-preflight-session-audit-20261003`; later evidence includes the9th control and strict test typing cleanup.


Final complete-record documentation confirmation after adding the published source citation:62GREEN/8files4.95s. Only the exact owned branch ref was refreshed to make9597520 publicly reachable locally; guards/budgets remain unchanged.
