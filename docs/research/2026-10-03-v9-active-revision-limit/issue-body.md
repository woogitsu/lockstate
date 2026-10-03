## Actual current V9 boundary, diagnostic only

Exact source `4074c305ba69aa920074fb7f02bae45730a0327e` (production equals integrated `2102c1700f79f5f5191edfcb3e64bdc571b3e697`). No format, wire, copy, refunds, production or budgets changed.

Buy an actual wall-brick square at3,3 through packed PlaceBuildOrder in seed73. At tick1 it is materials-pending and funds24,920. Capture its real session; set only its existing V9 orderRevisions entry to the explicitly approved MAX_SAFE_INTEGER. Real createSaveEnvelope validation/checksum, JSON decode and runtime restoration accept this legal data.

- Matching actual packed CancelBuildOrder: cancelled, refund80, funds25,000, counter9,007,199,254,740,992; next normal Save throws at construction.orderRevisions.
- Genuine material/build ticks: completed at tick171, funds24,920, same unsafe counter; normal Save throws.
- Unused explicit MAX key and untouched completed MAX key: ordinary ticks and whole Save/Load succeed.

Actual scoped result **2 RED/2 legal GREEN,2.33s**. Initial treasury-path fixture error retained separately. Probes are published as inert source receipts, not failing release tests.

The actual fresh overflow counter is also rejected by packCommand's installed Zod4 integer validation **before enqueue**. Separate corrected protocol measurement1GREEN/4 deliberately unselected cases compares the entire runtime snapshot unchanged. No successful cancellation/queued-token/native claim is made for that unsafe value; the earlier mistaken expectation that packing succeeded is preserved as a fixture error.

[Complete exact-source evidence, raw outputs, executed inert probes and owner options](https://github.com/woogitsu/lockstate/tree/ff504a35a9cabe375dc2014dae2a144bc6887776/docs/research/2026-10-03-v9-active-revision-limit).

## Cause and dedup

ConstructionSystem.setState writes state then does revision+1. Save requires Number.isSafeInteger; cancellation packing requires a safe integer on installed Zod4. At2^53 further +1 cannot represent distinct transitions.

Fresh remote searches for orderRevisions, revision overflow and MAX_SAFE_INTEGER returned only #2021 (lost V8 queued counter), unrelated #972 and old continuation #428. #1985 is the independent later-action marker. This case imports the approved exact V9 value successfully and breaks only on its ordinary next transition.

## Reserved decision, not implemented

1. Version exact monotonic tokens (for example a coordinated exact decimal integer representation) in save and cancellation wire, with lossless old-number/queued-token migration. This preserves the full approved legal range and continuing gameplay; it needs explicit format/wire approval. Recommended durable option if the full accepted range must remain operable.
2. Keep V9 and define an explicit **atomic exhaustion outcome before any affected allocation/refund/geometry/relocation/history mutation**. Leave MAX unchanged and saveable, preserve stale distinction, but the order cannot advance without separately approved recovery. A truthful exhaustion refusal/error behavior is required; a check only inside setState is too late for surrounding side effects.
3. Defer, honestly retaining this imported boundary.

Saturation loses stale-token distinction. Wrapping/resetting can collide with old queued tokens. Arbitrarily narrowing the decoder ceiling contradicts the approved bound and merely postpones exhaustion. Existing stale-cancellation copy describes a mismatch, not an exhausted matching token. Existing invalid-input restore errors do not describe an input already approved and accepted. No such shortcut or new failure/copy rule is implemented.

No browser/server/build/fullverify or producer mutation was executed. Await owner decision; do not treat this diagnostic as a GREEN release fix.
