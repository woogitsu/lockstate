# ADR 0013: Free-tier cloud-save capacity and where it is enforced

## Status

**Proposed — pending human approval.** Not accepted.

This ADR deliberately mixes two kinds of statement, and the difference
matters more than anything else in it:

| | What | State |
| --- | --- | --- |
| **Decided already** | Five free save slots; an absolute ceiling of 50 total | Existing product rules (`README.md`, `src/services/entitlements/products.ts`). Issue #57 implements them at the database tier. **No approval is being asked for.** |
| **Decided already** | Over-capacity degrades read-only | Existing commitment (`docs/TRUSTED_SERVICES.md`, ADR 0008 threat T7). Implemented here. |
| **Decided here** | The enforcement mechanism (trigger + RPC) | An engineering decision inside the boundary ADR 0008 already set. Implemented; reviewable as code. |
| **PROPOSED** | 4 MiB per stored save version | **Implemented with the proposed figure**, in one function, so approving a different number is a one-line change. |
| **PROPOSED** | 20 retained revisions per prison | **Not implemented.** Needs a retention mechanism, which is its own change. |
| **PROPOSED** | 256 MiB of stored payload per account | **Not implemented.** Depends on the revision-depth decision and on the JSONB-vs-Storage question. |

A reviewer is being asked to sign off on three numbers — 4 MiB, 20
revisions, 256 MiB — and on nothing else.

## Context

`supabase/config.toml` sets `[auth] enable_anonymous_sign_ins = true`
because anonymous auth is this project's identity model
(`docs/CLOUD_SAVE.md`). The consequence, restated because it is the whole
reason this ADR exists: **the `authenticated` role is effectively "anyone
who can make an HTTP request".** A fresh identity costs one unauthenticated
call to `/auth/v1/signup` — no email, no cost, no meaningful rate limit.

Against that, before issue #57 nothing at the database tier bounded what one
identity could store:

- `prisons_insert_own` enforces ownership and `prisons_owner_slot_unique`
  prevents duplicate slot indices, but neither caps *how many* slots an
  owner creates. The five-free-slots rule lived only in
  `src/services/entitlements/products.ts` — the tier ADR 0008 classifies as
  **untrusted** (Z0/Z1).
- `create_save_version()` validated the revision sequence, the
  payload/storage-path exclusivity and the idempotency key, but placed no
  bound on `p_byte_size` or on the length of `p_payload`. The two need not
  even have agreed: `p_byte_size` was *recorded*, not enforced, so the
  column could say 10 while the row held ten megabytes.

`docs/TRUSTED_SERVICES.md` used to claim the point of effect re-checked
capacity server-side. The security audit of PR #55 corrected that claim
rather than the code, because closing it properly needs product decisions
before schema, and inventing them inside a privilege fix would have been
exactly the "do not invent replacement architecture" failure `CLAUDE.md`
forbids.

This is a **capacity, cost and abuse** concern. It is **not** a
confidentiality concern: no data crosses an ownership boundary, and every
RLS policy and `auth.uid()` check that protects one player's data from
another is untouched.

## Decision

### 1. The free tier is five slots, and that is enforced by the database

`BASE_SAVE_SLOTS = 5` and `MAX_TOTAL_SAVE_SLOTS = 50` are not new. This ADR
does not choose them; it moves them from a tier that cannot enforce anything
into the one that can. Capacity for an account is

```
least(50, 5 + grantedSaveSlots)
```

where `grantedSaveSlots` is read from `public.entitlements` — the
server-authoritative projection recomputed from the append-only ledger,
which the client may read and may not write (ADR 0008 threat T4). Nothing
the client sends is an input to the capacity calculation, because there is
no argument for it to send: `create_prison()` takes no owner parameter and
no capacity parameter.

`public.base_save_slot_capacity()` and `public.max_save_slot_capacity()`
hold the two numbers, one function each.

### 2. Enforcement is a trigger, with an RPC as the front door

Issue #57 lists three candidate mechanisms and argues for the third. Both
the first and the third are used here, for different jobs.

**`prisons_enforce_slot_capacity`, a `BEFORE INSERT OR UPDATE OF owner_id`
trigger, is the enforcement.** The reasoning:

- A `CHECK` constraint cannot count sibling rows, so it is not a candidate
  at all.
- A `SECURITY DEFINER` create-slot RPC bounds nothing on its own. It bounds
  something only once `INSERT` on `prisons` is revoked from `authenticated`,
  which makes the cap contingent on a *grant* staying revoked rather than on
  an invariant being true. That is a weaker guarantee than it looks: the
  same class of mistake — a privilege that was assumed rather than asserted
  — is what defects 4, 5 and 6 in `docs/CLOUD_SAVE.md` all were.
- The property being defended, "an owner never holds more prisons than their
  capacity", is a property of the *table*. Something that is true of a table
  belongs on every write path into it — the RPC, a direct PostgREST insert,
  a future admin tool, a backfill — not on one blessed door. This repository
  already reaches for exactly this shape when the property must hold for
  every role: `entitlement_events_no_update` is a trigger for the same
  reason, and its comment says so ("even a privileged connection cannot edit
  history").
- The precedent that `create_save_version()` is `SECURITY DEFINER` does not
  transfer. That function is `SECURITY DEFINER` because it must write
  columns the client is *forbidden* to write (`current_revision`,
  `current_version_id`) and must do so under a row lock. Slot creation needs
  neither: the client is allowed to write every column of a new `prisons`
  row. What it needs is a count invariant, which is a different tool.

**`public.create_prison()` is the front door**, and it is what gives ADR
0008 §4's "the server re-checks at the point of effect" a real, named,
documented re-check that `docs/TRUSTED_SERVICES.md` can point at. It exists
because the trigger alone answers with an exception, and:

- "You are at your slot limit" is a normal, expected, actionable outcome —
  the same class of event as the `conflict` that `create_save_version()`
  already returns as a discriminated `status`. `PrisonSyncEngine` and the UI
  must be able to tell it from "something broke", and a status is a better
  contract to write against than an error code.
- The numbers a capacity UI needs — `used_slots`, `capacity` — come back
  with the status, so "4 of 5 slots used" needs no second round trip.

It returns `status ∈ {'created', 'at_slot_limit', 'slot_taken'}`. The
trigger still fires underneath it. That redundancy is the point.

**Both refusals are distinguishable, never an opaque constraint violation.**
The trigger raises SQLSTATE `LS001` (slot limit) and `LS002` (payload too
large) — user-defined SQLSTATE classes, since the SQL standard reserves
class values beginning `0`–`4` or `A`–`H` and leaves the rest to
implementations. Measured against the running stack, PostgREST maps an
unrecognised SQLSTATE to **HTTP 400** and surfaces `code`, `message`,
`details` and `hint` in the body, so a client sees
`{"code":"LS001", "details":"used_slots=5 capacity=5", …}` and not
`23514 violates check constraint`.

### 3. Over-capacity degrades read-only

The trigger fires on creation and on nothing else. An account that ends up
over capacity — a refund, a chargeback, an expiring grant (ADR 0008 threat
T7) — keeps every prison it has. Those prisons stay listable, stay
pullable, and stay saveable: `create_save_version()` is unaffected by the
slot cap, so play continues. Only creating *another* slot is refused.

This matches what `docs/TRUSTED_SERVICES.md` already commits to for the
client-side projection (`existingSlotsRemainPlayable`), and it is the same
judgement: destroying or locking a player's saves because their capacity
shrank would be a far worse failure than briefly carrying an over-capacity
account.

### 4. Per-save payload bound — **PROPOSED: 4 MiB (4,194,304 bytes)**

Enforced by `save_versions_enforce_size`, a `BEFORE INSERT` trigger, which
also **measures** the stored bytes for a JSONB-backed version and overwrites
the caller's `byte_size` claim with the measurement. The column stops being
an assertion and becomes a fact, and the bound is applied to the fact.

Reasoning for the figure:

- `docs/PERSISTENCE.md:742-745` measures the envelope across four benchmark
  tiers at **42.0 KiB** for a small prison (25 prisoners) and **2.86 MiB** for
  x-large (3,000), at save-schema V3. V4 (#259) adds a known,
  population-proportional delta on top — two bytes per prisoner per need, so
  ~0.3 KiB and ~35 KiB respectively.
  **Those figures replace the 66.0 KiB / 29.4 KiB pair this bullet used to
  cite, and the replacement is not cosmetic.** That pair was pre-#50: the
  `EntityStoreSnapshot` padding it described no longer exists, `entities` fell
  to 129-135 B at every tier, and a small prison's envelope fell to 36.7 KiB
  before #70's `simulation` and `identity` sections took it back up to 42.0 KiB
  (`docs/PERSISTENCE.md`, "Entity snapshot serialized at capacity, not
  population (#50) — resolved"). The 66.0 KiB and 29.4 KiB numbers do still
  appear in that document, at `:832` — in the **before** column of the table
  recording that fix — which is why a spot check for the strings passes while
  the claim built on them is false.
- On those figures 4 MiB leaves roughly 97× headroom over a small prison but
  only about **1.4×** over the largest tier already measured — a little less
  once V4's delta is counted. **That is a materially weaker position than the
  "roughly an order of magnitude of headroom" this bullet claimed on the
  superseded numbers, and the approval asked for in the Status table above
  should be given or withheld against these figures rather than those.** What
  the bound still does unambiguously is cap the worst case a hostile client can
  force into a single row.
- It sits below the size at which JSONB stops being a reasonable home. A
  payload approaching this bound is precisely the signal that the Storage
  path is needed — which is the still-open question in `docs/CLOUD_SAVE.md`,
  "Storage placement". **This bound is not a decision about that threshold
  and must not be read as one.** If the benchmark that issue #20 asks for
  puts the JSONB/Storage line at, say, 1 MiB, this number should move down
  to meet it rather than stay as a second, contradictory limit.

The number lives in `public.max_save_payload_bytes()` and nowhere else.

### 5. Total stored bytes per account — **PROPOSED: 256 MiB. Not implemented.**

Derivation, so the figure is arguable rather than arbitrary: 5 slots × 20
retained revisions × ~2 MiB of realistic payload ≈ 200 MiB, rounded up.

Not implemented because a total-bytes cap without a retention policy is a
trap: it converts "your prison is full of history" into "you can no longer
save", which violates §3 — an account at its byte ceiling would lose the
ability to save existing prisons, not just to create new ones. The
acceptable shapes are (a) prune oldest revisions to make room, or (b) refuse
and tell the player to prune, and choosing between them is a product
decision about what a player sees, not a schema detail. It should be decided
together with §6.

### 6. Revision history depth — **PROPOSED: 20 versions per prison. Not implemented.**

`save_versions` is append-only and unbounded today: a client that pushes a
save every 30 seconds writes 2,880 rows a day, for one prison, forever.
That is a larger uncontrolled quantity than slot count ever was.

20 was proposed as "roughly a day of ordinary autosaving at the current
`DEFAULT_AUTOSAVE_INTERVAL_MS`". **That justification is arithmetically wrong
and is withdrawn here.** `DEFAULT_AUTOSAVE_INTERVAL_MS` is 30,000 ms
(`src/persistence/session/session-controller.ts:9`), so 20 autosaves is **ten
minutes**, not a day — and the paragraph immediately above computes 2,880 rows
a day from that same constant. A day of ordinary autosaving is 2,880
revisions, 144× the proposed number.

**The number itself is left at 20, because moving it is the owner's decision
and not an editor's** (issue #274, Q2). The choice being put is between two
different retention policies, not between two phrasings: keep 20, in which
case the retained window is the last ten minutes of autosaving *or* the last
twenty manual saves, and the question is whether that is what "restore an
earlier generation" should mean; or keep "roughly a day" as the requirement,
in which case the number moves toward 2,880 and §5's 256 MiB — derived as 5
slots × 20 retained revisions × ~2 MiB — moves with it. The nearest existing
precedent in the repository is neither figure: the local repository (#19)
retains **3** generations (`PrisonSaveRepositoryOptions.keepGenerations` in `src/persistence/local/repository.ts`, "Current
generation plus this many previous safe copies. Default 3") and does not keep
them forever.

Not implemented here because pruning means deleting rows, and `prisons`
carries a foreign key to `save_versions.id` (`prisons_current_version_fk`)
that the current version must always satisfy. A correct pruner has to be
written and tested against that, and against the idempotent-replay lookup on
`(prison_id, revision, checksum)`, which a prune can silently turn into a
"conflict" for a client retrying an old upload. That is a change of its own.

### 7. Anonymous-identity churn is a separate lever — not addressed

Capping what one identity can store does not cap how many identities there
are. The other half of the same problem is GoTrue rate limiting on
`/auth/v1/signup` and cleanup of abandoned anonymous accounts. Issue #57
names it explicitly as a separate lever and it is **recorded, not
implemented**: it is configuration and an operational job, not schema, and
it may well be the cheaper half.

## Alternatives considered

- **Revoke `INSERT` on `prisons` and make `create_prison()` the only path.**
  Rejected as the *primary* control for the reasons in §2 — it makes the
  bound contingent on a grant rather than on an invariant. It remains
  available as an additional hardening step, and would be a small change on
  top of what is here; it is not taken because the trigger is the primary
  control (§2) and a grant-contingent bound is weaker. The client-wiring
  objection this bullet used to give — that it would be a breaking change to
  `SupabaseCloudSaveClient.registerPrison` — has expired: `registerPrison` has
  gone through the `create_prison()` RPC since #192
  (`src/persistence/cloud/supabase-client.ts:131`), and there is no `.insert`
  into `prisons` anywhere in `src/`. The alternative has still *not* been
  taken, so §2's argument stands unchanged — the table-level INSERT grant was
  revoked and immediately re-granted per column in
  `supabase/migrations/20260824140000_protect_server_timestamps.sql:68-69`, and
  `supabase/tests/004_free_tier_capacity.test.sql` still drives the trigger
  through that grant. What has changed is only the cost of taking it, and that
  is a fact for whoever decides rather than a decision made here.
- **A `CHECK` constraint.** Not possible: a `CHECK` cannot count sibling
  rows. Stated because it is the first thing anyone reaching for a cap
  tries.
- **Enforce only in the application tier, as today.** Rejected: that tier is
  Z0/Z1, which ADR 0008 trusts with identity and nothing else. A cap the
  client enforces is a suggestion.
- **A byte cap as a `CHECK` on `save_versions.payload`.** Rejected: a
  `CHECK` must be immutable, so the limit would be inlined into the
  constraint and changing it would be a migration rewrite — the opposite of
  the "one line" property this ADR requires of a proposed number. It also
  yields `23514`, an opaque violation, rather than a distinguishable code.
- **Return `payload_too_large` as a fourth `create_save_version()` status.**
  Rejected for now, and this is a wiring constraint rather than a design
  preference: `SupabaseCloudSaveClient.uploadVersion` switches exhaustively
  over three statuses with no default, so a fourth would silently return
  `undefined` into `PrisonSyncEngine`. Adding the status and the client
  branch together is the correct follow-up; adding the status alone would be
  a bug.
- **Charge for capacity instead of bounding it.** Not an alternative: paid
  capacity already exists (`entitlements`) and is what raises the cap. The
  question here is only what the *free* tier is.

## Consequences

- `docs/TRUSTED_SERVICES.md`'s "the point of effect re-checks capacity" is
  true again, and points at a named function.
- A client that is over capacity gets a specific, actionable answer instead
  of a generic failure, in both shapes: `status = 'at_slot_limit'` from
  `create_prison()`, and `code = 'LS001'` from any other insert path.
- `save_versions.byte_size` is now a measurement for JSONB-backed rows. Any
  future consumer may treat it as true rather than as a claim — including a
  total-bytes cap, if §5 is approved.
- Three numbers stay open (§4 approval, §5, §6), plus identity churn (§7).
  Until §5 and §6 land, a single identity can still store an unbounded
  *number* of revisions inside its five bounded slots. The exposure is
  materially smaller than before — 4 MiB per row instead of no bound, and
  five slots instead of no bound — but it is not closed, and this ADR
  should not be read as claiming it is.
