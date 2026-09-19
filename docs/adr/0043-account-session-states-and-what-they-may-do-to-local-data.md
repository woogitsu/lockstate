# ADR 0043: Account session states, and what each may do to local data

## Status

**Proposed.** This document decides the *client-side* identity model for issue
#34 and the rule every transition in it obeys. It is not self-approved: it
records a decision that has to exist before any account UI can be written, and
whoever integrates it should either accept it or say which transition is wrong.

**The number was a placeholder; 0043 was assigned on landing.**
`docs/AGENT_WORKFLOW.md` §2 assigns ADR numbers centrally, after drafts come
back, because two agents once took `0034` within an hour. This draft carried
`XXXX` and did not edit `docs/adr/README.md`. 0043 was one of the two gaps that
README's own paragraph records as genuinely free, so taking it left the stated
next free number (0045, `max(on disk) + 1`) correct and untouched. Its sibling
gap 0042 went to the consequence-loop ADR in the same integration pass.

## Context

### The premise this ADR was written under, and how it did not survive

ADR 0044's open question 1 — *"Does cloud save ship?"* — has been answered yes,
and its own summary of what remains is: *"the server half is verified, the
client half is written, `#338`'s non-UUID prison id is fixed, and the two
deploy secrets are already required. What is missing is an account UX (#34) and
the decision itself."*

Two of those four are exactly right. The third is not, and the difference is
what this ADR exists for.

**There is no client identity layer at all.** Not "an unwired one" — none.
Walking `src/` for the whole surface of Supabase auth returns nothing:

- no `createClient` anywhere in `src/` (`tests/foundation/documentation-claims-contract.test.ts`
  already holds this, and `docs/ARCHITECTURE.md` states it in prose);
- no `signInAnonymously`, `linkIdentity`, `updateUser`, `getSession` or
  `onAuthStateChange` call site;
- every occurrence of the string `anonymous` under `src/` is unrelated —
  `<anonymous>` stack frames in `src/services/telemetry/diagnostics.ts`, one
  staff-panel comment, and the `telemetry.consent.gameplay` string;
- `SupabaseCloudSaveClient` (`src/persistence/cloud/supabase-client.ts:59`) and
  `SupabaseEntitlementsReadClient` (`src/services/entitlements/client.ts:63`)
  each take a `SupabaseClient` in their constructor, and nothing anywhere
  constructs one.

So "the client half is written" is true of the **save transport** and false of
the **identity** it is transported under. What #34 waits on is therefore not
only a UX; it is a model of who the player is, which nothing in the repository
has ever expressed. This ADR is that model.

### Three further gaps the same walk found, recorded because they bound #34

1. **`resolveSyncConflict('keep-local')` cannot be executed against the engine
   that defines it.** It returns `{kind:'retry-push', newRevision}`
   (`src/persistence/cloud/sync-engine.ts:74`), and `PrisonSyncEngine.push`
   takes `(prisonId, envelope)` and uploads at `envelope.revision`
   (`:23-24`) — there is no parameter the computed `newRevision` can be handed
   to. Re-pushing at the cloud's real baseline means composing a *different*
   envelope, and the only composer, `SessionController.buildEnvelope`
   (`src/persistence/session/session-controller.ts:314`), derives the revision
   from `session.revision + 1`. The vocabulary of safe conflict choices exists;
   one of the four cannot be carried out.

2. **Offline work of more than one save cannot resume.**
   `PrisonSaveRepository.markPendingSync` overwrites
   (`src/persistence/local/repository.ts:437`), and `SessionController.saveNow`
   calls it with the *current* revision after every save (`:367`). Five offline
   saves from cloud revision 3 leave local revision 8 and
   `dirtySinceRevision: 8`; `create_save_version` accepts only
   `v_current_revision + 1`
   (`supabase/migrations/20260822190300_create_save_version_rpc.sql:132`), so
   the push is answered `conflict` and, by (1), the resolution that would fix
   it cannot be performed. #20's acceptance criterion *"offline pending work
   resumes idempotently"* has no code path.

3. **Account deletion has no server half either.** ADR 0044's asymmetry — three
   trees whose server half is live — holds for saves, entitlements and
   challenges. It does not hold for #34's privacy criterion: `profiles`
   deliberately has no delete policy and its migration says *"account deletion
   is a trusted server-side operation"*
   (`supabase/migrations/20260822190000_create_profiles.sql:28`), and no such
   operation exists — the 23 migrations declare 17 functions and none of them
   deletes an account. `user_settings` is in the same position on the client
   side: the table and its four RLS policies exist and `src/` does not contain
   the string `user_settings`.

### What the server does guarantee, read rather than assumed

`pnpm verify:sql`'s 321 assertions are 54 + 104 + 35 + 33 + 8 + 23 + 11 + 12 +
25 + 10 + 6, summed from the `select plan(N)` line of each of the eleven suites
in `supabase/tests/`. They are worth what they say and no more. For #34
specifically:

- **Identity upgrade preserves data because GoTrue keeps the `id`, not because
  a migration does anything.** `docs/CLOUD_SAVE.md:1525` states this plainly
  and adds that it *"is not exercised by a pgTAP test here because it is a
  GoTrue-level auth flow"*, and that `pnpm verify:stack` covers anonymous
  sign-in but **not** the upgrade step. So "linking preserves prisons" is, on
  the evidence available today, an untested property of a third-party auth
  service. A client that treats it as guaranteed is trusting a claim nobody has
  executed — which is the direct reason for this ADR's decision 3.
- **The free-tier cap is enforced in the database**, by
  `enforce_prison_slot_capacity` against `public.base_save_slot_capacity()`
  (`supabase/migrations/20260823100000_bound_free_tier_capacity.sql:45`), and
  the client copy `BASE_SAVE_SLOTS` (`src/services/entitlements/products.ts:24`)
  says of itself *"MIRRORED IN SQL, and the SQL is the authoritative copy…
  Changing either value here without changing it there makes the client's
  arithmetic disagree with the server's"*. **No test held that agreement.** One
  now does.

## Decision

### 1. Three identity states, and the unhappy ones are states, not flags

`src/ui/account/account-session.ts` models exactly five:

| state | meaning |
| --- | --- |
| `local-only` | No cloud identity. Carries a `reason`: `never-signed-in`, `signed-out`, `sign-in-failed`, `session-expired`. |
| `signing-in` | An anonymous sign-in is in flight. |
| `anonymous` | A real `auth.users` row exists. May carry `lastLinkFailure`, so a failed upgrade is offerable for retry rather than forgotten. |
| `linking` | An identity link is in flight, against a known `accountId`. |
| `linked` | A permanent identity is attached to that same `accountId`. |

The reason a failed sign-in is `local-only { reason: 'sign-in-failed' }` rather
than a boolean beside a state is the defect this repository keeps finding: a
machine that models only the happy path pushes every unhappy one into ad-hoc
flags that no exhaustiveness check can see. Every state above is reachable and
every one is asserted.

**Connectivity is deliberately not in this machine.** Online/offline is
orthogonal to who the player is, and folding it in doubles the state count to
express one bit. It is an input to the save-list projection and a `reason` on
the two failure events instead.

**Direct email sign-in from `local-only` is deliberately not modelled.** #34's
test requirement is `local→anonymous→linked`, and a direct sign-in creates a
*different* `auth.users` row, so adopting existing local prisons into it is a
data-migration flow rather than an upgrade. It is named here as out of scope
rather than half-modelled.

### 2. Every transition declares what it may do to local data, and only one may

`applyAccountEvent` returns a `localData: 'preserved' | 'discarded'` on every
transition, and `discard-local-saves` is the only member of
`DESTRUCTIVE_ACCOUNT_EFFECTS`. #34's architecture note — *"local data is not
deleted merely because linking fails"* — is therefore a property of the type
that a test enumerates over the **whole** state × event cross product, rather
than a sentence in a comment. The cross product is exhaustive by construction:
the test builds `Record<AccountSessionState['kind'], …>` and
`Record<AccountEvent['type'], …>`, so adding a state or an event that the
invariant has not been re-checked against fails to typecheck.

Exactly one event discards: `delete-local-data`, #34's privacy entry point. It
does **not** change the identity state, because deleting the saves on this
device is not signing out and saying otherwise would misreport the cloud half
of what the player just did.

### 3. Linking failure returns to the *same* anonymous account

`linking → link-failed → anonymous` keeps the `accountId` it went in with. That
is the whole content of "non-destructive": the anonymous identity still owns
its cloud prisons, the local repository is untouched, and the only difference
from before the attempt is a recorded `lastLinkFailure` the UI can offer a
retry from. Given that the upgrade step is the one flow neither pgTAP nor
`pnpm verify:stack` exercises (see Context), the client's failure path is the
only place this can currently be held at all.

### 4. Slot capacity is the entitlement layer's, and it does not apply to local play

`src/ui/account/cloud-slot-availability.ts` computes nothing. It folds the
identity state together with `evaluateSaveSlotEntitlement` /
`evaluateSaveSlotAccess` (`src/services/entitlements/projection.ts`), which
already implement ADR 0013's degradation ladder — `verified` → `cached`
(offline grace) → `base` — and already guarantee `existingSlotsRemainPlayable`.
Re-deriving the number "5" anywhere else would be the third copy of it.

What it adds is the half the entitlement layer cannot know: **a cap exists only
when there is a cloud identity.** In `local-only` the projection reports
`applies: false`, and local prisons are unlimited. A five-slot cap on a player
who has never signed in would be inventing a restriction the server does not
impose — `enforce_prison_slot_capacity` counts rows in `public.prisons`, and a
local-only player has none.

### 5. `src/ui/account/`, and why not `src/persistence/`

`tests/unit/services-layer-boundaries.test.ts:147` refuses any import of
`src/services/` from `src/persistence/`. Decision 4 requires the entitlement
projection, so a home under `src/persistence/` would have had to re-implement
it. `src/ui/` may depend on both, `src/ui/save-panel.ts` already type-imports
`src/persistence/`, and #34 is filed as `[Product]`.

The secondary effect is deliberate and is stated so it is not mistaken for
luck: these modules import **nothing** from `src/persistence/cloud/`. The cloud
metadata the projection folds in is declared structurally where it is consumed.
`src/persistence/cloud/` therefore stays parked exactly as ADR 0044 decided,
`tests/foundation/trusted-tier-reachability-contract.test.ts` keeps passing
unchanged, and the gate fires on the commit that *actually* wires cloud save —
which is the event ADR 0044 built it to catch.

### 6. Message keys are not authored until something renders them

The pure layer emits status **ids** (`'sync-pending'`, `'conflict'`,
`'recoverable'`), never `LocalizationKey`s. ADR 0044's open question 3 records
a live grievance: ten trusted-tier strings ship inside the bundle through
`defaultMessageCatalogEn` while no code renders them. Adding
`account.status.*` keys now would make that eleven-plus. The id → key mapping
is written in the same change as the panel that resolves it.

## Consequences

- An account UI can be written against a model that already answers what
  happens when linking fails offline. It could not before.
- The three gaps in Context are now written down where a build can be pointed
  at them, instead of being rediscovered — which is the failure mode ADR 0044
  exists to stop, applied to itself.
- One new gate, `tests/foundation/account-metadata-boundaries.test.ts`, holds
  the client/SQL capacity agreement that `products.ts` asserts in prose. It
  reads the migration off disk, so changing `base_save_slot_capacity()` without
  changing `BASE_SAVE_SLOTS` now fails in `pnpm test` rather than as a slot
  that looks available and is not.
- Nothing here is reachable from `src/main.ts` yet, by design. These modules
  live outside the two roots ADR 0044's gate scans, so no allow-list entry is
  created and none is needed; the follow-up that renders them is what turns
  them on.

## What would change my mind

The weakest decision is **1's exclusion of connectivity from the machine**. It
keeps the state count at five and it is the reason `sign-in-failed` has to
carry a `reason` discriminator that duplicates information the connectivity
input already has. If the account UI turns out to need "offline" as a first
class *identity* state — for instance because a session can be present but
unverifiable, which is a real GoTrue condition this model currently collapses
into `linked` — then the right change is a sixth state, not another flag.

The second weakest is **4's `applies: false` for `local-only`**. It is correct
about the server's behaviour today. It is a product claim as much as a
technical one: it says local prisons are unlimited for ever, and nobody has
decided that. If the owner wants a local cap, it belongs here as a separate
policy value, not smuggled in as the cloud one.

## References

- Issues [#34](https://github.com/matmaxalez/lockstate/issues/34) (this UX),
  [#19](https://github.com/matmaxalez/lockstate/issues/19) (the local
  repository this projects) and
  [#20](https://github.com/matmaxalez/lockstate/issues/20) (the sync and
  identity-upgrade half, whose *"anonymous identity can be linked/upgraded
  without losing existing prisons"* criterion is still unticked).
- [ADR 0008](./0008-trusted-service-boundary.md) — the trust boundary the
  entitlement projection is a client-side cache under.
- [ADR 0013](./0013-free-tier-cloud-save-capacity.md) — the capacity model
  decision 4 delegates to rather than restates.
- [ADR 0044](./0044-what-happens-to-a-service-tier-nothing-calls.md) — the
  parked-tree decision this change is careful not to trip, and whose open
  question 1 it follows on from.
- [CLOUD_SAVE.md](../CLOUD_SAVE.md) — "Anonymous identity upgrade" is the
  source for decision 3's claim about what is and is not exercised.
