# Concurrent offline catalog fallback — #1960 extraction

## Verified starting state

Issue #1960 was open when read on 2026-10-02. It names the existing fix
`a82f43b852`, already published on the integration stack. That commit is not
an ancestor of the requested dependency base `71e25921a6`.

The fresh isolated checkout reproduced the report using the existing four
registry tests: one failed, three passed. Two simultaneous callers shared
one rejected fetch. The first returned its own fallback, while the second
rejected with `offline` instead of returning its different fallback.

## Scoped extraction and obtained evidence

The existing production fix was extracted, together with the existing retry
regression from `31fc3fcd75`. The latter commit's unrelated cumulative camera
design checkpoint was excluded; this record describes only this checkout.
Each caller now awaits the shared request inside its own recovery path.
Failure evicts only that request's cached promise. Fallback results are copied,
so a caller clearing its returned map does not mutate the supplied fallback.

The four registry tests passed. Both application and tools TypeScript targets
passed. A deliberate production mutation retained the failed cached promise:
the retry regression failed, reporting one fetch instead of two (one failed,
three passed). Exact byte restoration was verified with SHA256
`A4313FDDC3CE35EB5B981155F6F45907890BCD7EDBD1550D4D38026B76595899`.
The restored registry and object-mapping suites passed, 21 tests in two files.

## Limits

This is an extraction of already implemented behavior, not a second fix or a
new issue. No workflow, save format or simulation command was changed. No
browser or CI polling was used, and nothing was merged. The tests establish
loader fallback, retry and map isolation; they do not establish actual browser
offline rendering or production deployment.
