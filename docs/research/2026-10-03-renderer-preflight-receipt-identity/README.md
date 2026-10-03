# Current-target renderer preflight receipt

## Actual original failure

PR #2010 exact source head `345a7d83de4909cd59d9cfb988f71baf471e5325`, hosted run `37111391449`, artifact case 29 failed at the final receipt observer: expected `yard-basic`, received `cell-basic`. This was an assertion failure, not one of the other artifact journey timeouts. The preceding clear Yard preview, 64 polygons and zero submitted PlaceRoomTemplate commands had already passed. The original failure remains a failure; corrected native acceptance is pending.

[Extracted hosted failure](./hosted-failure-29.txt) preserves the complete case-29 block with original timestamps. It is a UTF-8 text extraction from the previously retained full hosted log, whose SHA256 is `71bf7dbae248e912938731804a5f69e9b33acd433e4a508cefa4a4383766ee91`. The extracted file SHA256 is `116d149c89b14f84fd757ab7b34d3ea6d907d6590348ebfe9f35efef722d0e54`. [Original error context](./original-error-context.md.txt) is copied byte-exact from the downloaded terminal artifact; SHA256 `d828478924f40269396fbf64260e68cd747aea1a993c52686180e5c563d4d12d`.

[Original fixture](./original-fixture.spec.ts.txt) retains the executed fixture source. The failed exact head and this preparation's base `8fec2b6497e8381fd394cd7eb12ee2c3525c4f05` both contain Git blob `git-blob=b198f5a17f4a86769e9c75e2e9b77a94060931c0` for `tests/browser/room-template-renderer-preflight-receipt.spec.ts`. The archived physical Windows source bytes have SHA256 `54aac67e21007af49d4f511ba62684439a2f9f927b79f696ba28a1ee639eaedb`; Git LF normalization is distinct from that physical archive digest.

## Bounded consumer correction

The observer holds and later redispatches the exact original worker reply. Releasing that Cell reply can append it after a valid new Yard reply. Therefore the last delivered reply is not evidence of the current tool's selected target.

The corrected observer records actual outgoing request IDs and targets without changing their messages or verdicts. Immediately before public Yard rearming it records a request-list boundary. It then requires the latest request after that boundary to select Yard with the unchanged default mirror=false and quarterTurns=0, and requires the real delivered reply with that exact request ID to match the entire target, including its actual origin and optional mirror/turn fields. Historical matching Yard replies cannot satisfy this guard. The original Cell hold/release observer and its equality check remain unchanged.

A two-pixel physical move can remain within the same picked world tile. The existing bridge deduplicates unchanged origin, tool revision and world revision, so no extra Yard request is required in that case. The guard also accepts a genuinely new origin query if the move crosses a tile; it requires that latest actual query's corresponding reply rather than any earlier matching template.

Both original renderer directions, public native stale-release gesture, zero rearmed placement commands, clear status, 64 polygons, Escape withdrawal, and non-rearm accepted-command checks remain. No budgets, retries, config, production sources, worker data or verdicts changed.

## Obtained checks and pending execution

Application strict types: exit 0, [original output](./app-types.txt). Tools strict types: exit 0, [original output](./tools-types.txt). These successful tools emit no text; the receipt records their exit status explicitly.

No browser or server was launched. No production mutation was authorized or executed for this consumer-only correction. This record does not claim a producer negative, native acceptance, performance improvement or hosted-CI repair beyond the identified observer defect. The coordinator will execute the exact affected case and meaningful existing stale-consumer tests under its exclusive browser lease.

Bounded documentation checks: links 10/10 GREEN; citations initially 1 RED / 7 GREEN because the already published preparation branch was absent from local origin refs, then 8/8 GREEN after fetching only that exact named branch. Both outputs remain archived; no citation allowlist or guard changed.

Own continuous research-index row: 5/5 GREEN. Together these bounded documentation checks passed 23 tests across three files.
