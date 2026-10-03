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