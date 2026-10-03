# Legal V9 revision exhaustion — diagnostic and owner review

Obtained 2026-10-03. Isolated branch `codex/v9-active-revision-limit-audit-20261003`, exact base `4074c305ba69aa920074fb7f02bae45730a0327e` (production identical to integrated `2102c1700f79f5f5191edfcb3e64bdc571b3e697`). No production, format, wire, copy, tariff or budget change. This is diagnostic evidence and must not be imported as a GREEN fix.

## Genuine reproduction

The probe buys a brick square at (3,3) through packed `PlaceBuildOrder` in the actual seed73 runtime. One genuine tick leaves the actual order `materials-pending` and treasury24,920. A V9 envelope captured from that runtime sets only this existing order's approved revision field to `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). `createSaveEnvelope` validates it and computes its actual checksum; JSON encode/decode and actual runtime restoration accept it. There are no planted orders, world/entity changes or simulation verdicts.

| Real next operation | Actual state / funds | Actual revision | Next normal Save |
| --- | --- | --- | --- |
| Matching packed CancelBuildOrder at tick1 | cancelled /25,000 (existing80 refund) | 9,007,199,254,740,992 | rejected at construction.orderRevisions |
| Ordinary material/build ticks through tick171 | completed /24,920 | 9,007,199,254,740,992 | same rejection |
| Unused explicit MAX key, normal wall completion | completed | untouched unused MAX, ordinary wall counter | full Save/Load succeeds |
| Already completed MAX key,20 further ticks without targeting it | completed /24,920 | unchanged legal MAX | full Save/Load succeeds |

[Measured four-case raw output](./raw/measured-two-red-two-legal.txt): **2 RED /2 legal GREEN,2.33s**. The two RED cases assert that an accepted V9 input followed by ordinary gameplay remains saveable. [Exact executed corrected probe](./raw/executed-probe.test.ts.txt) is inert evidence; it is not collected by the release suite. The first run had a fixture treasury-path error in the cancellation assertion and one genuine completion RED; [original output](./raw/original-fixture-error.txt) is retained as such. The corrected cancellation uses the actual runtime treasury and independently checks the exact80 refund.

## Protocol and failure surfaces

Opened actual producers on this exact source:

- `src/simulation/construction/system.ts:1710`: `setState` writes the state, then increments a JavaScript number without exhaustion handling. Once at2^53, additional `+1` cannot distinguish subsequent transitions.
- `src/persistence/save-schema.ts:278`: V9's explicit revision ledger requires nonnegative safe integers. `createSaveEnvelope` parses the payload before computing the checksum.
- `src/simulation/protocol/commands.ts:78`: cancellation expectedRevision is `z.number().int().nonnegative()`. On the installed Zod4, the actual `packCommand` parse rejects the unsafe fresh token before enqueue.
- `src/simulation/runtime/session-commands.ts:233`: invalid unpacked commands return unchanged; they do not enter the stale-cancellation domain refusal. The matching MAX cancellation above does enter normally and has already mutated/refunded before the later Save failure.

The separate actual assigned-order protocol measurement obtained **1 GREEN/4 deliberately unselected cases,2.26s**: read its real overflowed token, call the same packed producer, observe the throw before enqueue, and compare the entire actual runtime snapshot unchanged. This establishes the exception boundary, not successful public browser handling. [Raw output](./raw/protocol-measured.txt), [exact executed source](./raw/executed-protocol-measured.test.ts.txt). The earlier protocol probe mistakenly expected the pack to succeed and unpack to return null; its [one fixture RED](./raw/protocol-boundary.txt) and [exact source](./raw/executed-protocol-probe.test.ts.txt) remain separate.

The existing stale-cancellation message means a token mismatch; it would not truthfully explain a matching exhausted token. The existing invalid save/direct-restore errors describe invalid input, whereas this input was explicitly approved and accepted. No existing domain exhaustion refusal was found in these paths. The loss of distinct unsafe increments is JavaScript arithmetic/source evidence; no unsafe queued command or native UI claim is made.

## Deduplication

[Fresh search receipt](./raw/fresh-duplicate-search.json) checked issues for orderRevisions, revision overflow and MAX_SAFE_INTEGER. It returned #2021 (lost V8 queued counter), unrelated difficulty #972 and historical continuation #428. #2021's full body concerns absence after Load, not an accepted maximal V9 counter overflowing through an ordinary transition. #1985 concerns the separate newer-action boolean. This is a distinct approved-range boundary.

## Concrete decision options — none implemented

1. **Version an exact monotonic token representation.** Preserve the entire currently approved number range and extend exhausted counters to an exact decimal integer representation, with a coordinated next-version save migration and corresponding command-token representation. Increment/compare exact integers internally; migrate existing numeric tokens losslessly; update queued command data only through that coordinated versioned contract. This preserves continued construction and stale-token distinction, but requires explicit format/wire approval and their historical/queued-command migration tests. Recommended durable option if full legal-range operation is required.
2. **Keep V9 but add an explicit atomic exhaustion outcome.** Before any affected transition, allocation, refund, geometry, resident relocation or coupled history mutation, detect insufficient safe counter capacity and refuse/defer the complete operation. Keep MAX unchanged so Save remains legal and old tokens are not mistaken for fresh transitions. This needs owner-approved exhaustion behavior and a truthful refusal/error surface; the order cannot continue until a separately specified recovery exists. Merely checking inside setState is too late for surrounding allocation/progress/preparation side effects.
3. **Defer the edge fix.** Retain current approval and code, document that a valid imported active MAX counter can invalidate future saves and fresh cancellation packing. Ordinary low counters remain unaffected; this is not universal V9 correctness.

Saturation alone loses stale-token distinction after the first exhausted transition. Wrapping/resetting can equal an old queued token. A smaller decoder ceiling contradicts the explicit approved upper bound and only postpones exhaustion; a terminal MAX row can later be targeted by Undo/Redo/removal. None is applied here. The legal untouched-terminal control demonstrates a narrow unchanged-state boundary, not immunity from future actions.

No browser/server/build/full-suite or production mutation was performed. No performance claim. Original failures, exact executed inert probes and successful controls are retained for review.
