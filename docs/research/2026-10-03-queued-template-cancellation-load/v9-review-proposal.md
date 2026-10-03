# Combined V9 review package — not implemented

2026-10-03. One owner decision combining [#1985](https://github.com/woogitsu/lockstate/issues/1985) and [#2021](https://github.com/woogitsu/lockstate/issues/2021). No persistence/production change is included in this diagnostic branch.

## Exact proposed fields

```json
{
  "payload": {
    "construction": {
      "newerActionThanTheStackTop": false,
      "orderRevisions": {
        "room-template-1-1-wall-0": 2
      }
    }
  }
}
```

`newerActionThanTheStackTop` is the exact existing boolean, not inferred from history, order sequence, world positions or commands. Current V9 capture writes its actual value. Absent historical value means `false`.

`orderRevisions` is an optional JSON object, mapping exact nonempty order-ID strings to integers from 0 through `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991), inclusive. No fractional, negative, NaN, infinite, unsafe, string-coerced or null value is accepted. The shape is a record, not an array of tuples; absent means `{}`. Each JSON key denotes one Map entry, including any explicit zero. Serialize every existing Map entry losslessly; do not filter terminal orders or infer entries from the saved order list. Use own enumerable keys/Object.entries and Map on restoration, avoiding inherited-property/prototype semantics. Duplicate-key raw JSON is not a second Map entry; the normal JSON decoder semantics remain unchanged. No arbitrary new map-size cap or order-ID pattern is proposed.

## Compatibility and migration

Freeze the existing V1 through V8 validators and their nested historical construction shapes. Extend only V9's construction schema. Existing V1–V8 envelopes retain their existing validation/migration path; the final V8→V9 step clones already validated payload data and adds only `newerActionThanTheStackTop:false` and `orderRevisions:{}` when absent. All existing world, history, templates (pending/completed/undone), owners, common-room filth, queued commands and other fields remain data-equivalent. No queued command or expectedRevision is rewritten.

V9 capture takes the raw boolean and a copy of the current counter Map. Restore resets both runtime fields to those explicit saved values before due queued commands can execute. Missing optional counters restore an empty Map, preserving the existing `revisionOf(id) ?? 0` behavior. Historical saves with a queued nonzero token and no counters retain today's safe stale refusal; migration cannot recover lost counters and must not guess. Current V9 saves preserve a matching token across Load; a genuinely stale token still refuses after Load because its stored counter differs.

Keep the existing `cancel-build-order.stale-cancellation` refusal and all present PL/EN text unchanged. No new message, UI protocol, tariff, cancellation/refund policy, ownership inference or queued-command rebase is part of this package. No reset or synthetic reconstruction of the newer-action flag is allowed.

## Required implementation proof if approved

1. The published normal/mirrored queued cancellation 2 RED cases become GREEN with identical live/Load funds, terminal orders, templates and unchanged command bytes; fresh-row controls remain GREEN.
2. Genuine stale queued token remains atomically refused live/Load; no treasury/world/order/history mutation. State transition after capture still invalidates the older token.
3. #1985 later independent action remains protected after encoded Load; Undo without a later action and explicit false keep their existing behavior.
4. Every existing V1–V8 data-preserving case remains valid; original historical validators reject inappropriate V9-only fields as before. Missing optionals get only the specified defaults; V9 true/false, empty/nonempty maps, zero/MAX_SAFE counters, unusual exact string keys and malformed values receive meaningful coverage.
5. Mutate the real counter capture/restore and flag capture/restore paths independently and observe failing regressions, then restore exact source bytes. No browser/latency acceptance is inferred from kernel tests.

## Alternative

Defer both fields and retain the known V8 history-protection loss (#1985) and safe cancellation refusal (#2021). Do not claim either defect fixed. Rebasing queued revisions, sequence heuristics or silently persisting a field in V8 are excluded.

Recommended clickable package: **Approve V9, the exact boolean plus optional ID→safe-integer revision record, frozen V1–V8 and data-preserving defaults; keep existing refusal text and policies.** This document is a review draft, not an owner approval or implemented release result.
