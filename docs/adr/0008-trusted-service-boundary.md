# ADR 0008: Trusted Service Boundary and Threat Model for Product Features

## Status
Accepted

## Context
Lockstate's simulation is deliberately client-authoritative: the dedicated
simulation worker owns in-session truth, and `docs/ARCHITECTURE.md` forbids
moving normal gameplay server-side. That is correct for a single-player
management simulation, and issue #36 does not change it.

It is not correct for everything the product needs. Three feature families
(issue #36) consume or produce state whose value to a player exceeds the
cost of forging it in a browser:

- **Verified challenges/leaderboards** — a public ranking derived from a
  number the client reports is meaningless; the browser can report any
  number.
- **Account entitlements** (base and paid save-slot capacity) — an
  entitlement is a commercial right. If the client can write it, it is not
  a right, it is a suggestion.
- **Telemetry/crash diagnostics** — the risk direction is reversed here:
  the client is the *source*, and the danger is that it sends too much
  (personal data, save contents, secrets) rather than that it lies.

These share one question — where is the trust boundary, and what crosses
it — so they get one boundary ADR rather than three incompatible ones.
`docs/CLOUD_SAVE.md` already established the pattern for save data
(RLS + a `SECURITY DEFINER` RPC as the only write path, no service-role key
in the browser); this ADR generalizes it and states what may *not* follow
that pattern.

## Decision

### 1. Four trust zones

| Zone | Runtime | Trusted to | Credentials |
| --- | --- | --- | --- |
| **Z0 — untrusted client** | Browser tab: renderer, simulation worker, IndexedDB, local caches | Nothing. Every byte is attacker-controlled. | none |
| **Z1 — authenticated session** | Same browser, but carrying a Supabase JWT | Prove *who* the caller is, nothing about *what they claim* | anon/publishable key + user JWT |
| **Z2 — trusted server function** | Supabase Edge Function / Cloudflare Worker / `SECURITY DEFINER` SQL | Read and mutate server-authoritative state; enforce policy | service-role or elevated DB role, server-side only |
| **Z3 — external provider callback** | Payment/store webhook delivered to a Z2 endpoint | Nothing until its signature is verified; then, only the facts it is authoritative for | provider signing secret, server-side only |

Z0 and Z1 differ only in *identity*, never in *authority*. A JWT proves an
account; it never makes that account's claims about scores, capacity or
purchases true.

### 2. Authority classification

Every piece of state gets exactly one authority:

| State | Authority | Rationale |
| --- | --- | --- |
| Prison simulation state, saves, settings | Z0/Z1 (client-authoritative, RLS-scoped) | Single-player; forging it only affects the forger. `docs/CLOUD_SAVE.md`. |
| Challenge *definitions* | Z2 published, Z0 verifies signature | Client must be able to detect a tampered definition offline. |
| Challenge *submissions and rank* | Z2 | Public comparison; see [ADR 0009](./0009-challenge-verification-strategy.md). |
| Entitlement grants/revocations | Z2 only, and append-only even there | Commercial right. Client gets a read-only projection. A revocation is a further ledger *event*, never the removal of the grant it offsets. |
| Payment/store facts | Z3 → Z2 | Only the provider knows whether money moved. |
| Telemetry/diagnostic events | Z0 produced, Z2 gated | Client is the source but is never trusted with *retention* policy. |
| Consent state | Z0 authoritative | A consent decision the user cannot change locally is not consent. |

**Authority to write is not authority to erase.** Being the sole authority
over a piece of state does not include the right to destroy the record of
how that state came to be. Concretely, and settled in issue #163 after
issue #105 finding 3 found the table silent on it: **the trusted tier holds
no `TRUNCATE` on any table in `public`.** Supabase's default privileges
granted it ambiently to all three Data API roles;
`20260824090100_revoke_client_truncate.sql` revoked it from `anon` and
`authenticated`, and `20260824150000_revoke_trusted_truncate.sql` revokes it
from `service_role`. Clearing a table is an owner-role operation, not a
service-key one.

The rule exists because `TRUNCATE` is the one statement that reaches past
every control this schema has against removal: it ignores row level security
entirely, and it fires no row trigger, so the `entitlement_events_no_update`
trigger — which refuses an `UPDATE` even for the table owner — does not run.
Without the revoke, a role holding `SELECT` and neither `UPDATE` nor
`DELETE` on the ledger could still empty it in one statement. The
alternative ruling, that the trusted tier holds `TRUNCATE` deliberately for
operational recovery, was considered and declined: §3 step 6 requires a
trusted mutation to record actor, reason and prior value, and no audit trail
on the trusted write path exists yet (#105 finding 8), so a truncated ledger
would leave no record that it happened.

#### Amendment, 2026-08-26 (#382, issue #280 finding F14): a Data API role holds exactly the DML privileges its zone needs

**Nobody has approved this, and a reader acting on it should know that.** The two
paragraphs below are exactly as #382 wrote them, and they stay here in §2 beside
the `TRUNCATE` ruling they generalise — this heading adds a name and a date, so
that the ruling is findable and countable instead of folded into prose. #382
recorded it as decided, on the reading that it *applies* §2's existing zone
taxonomy rather than deciding anything new. That reading may well be right and it
is not checkable either way, which is what ruling 1 of
[`README.md`](./README.md)'s *"An amendment to an accepted ADR"* section settles;
its ruling 3 is why this amendment has a row in
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 rather than a status of its own. The
`Accepted` above is ADR 0008's and does not move either way. The warrant behind
the two paragraphs below is #382's judgement, not the owner's.

**Generalised, 2026-08-26 (issue #280 finding F14): a Data API role holds
exactly the DML privileges its zone needs on a table, and nothing else.**
`TRUNCATE` was the first ambient privilege Supabase's `grant all on tables`
left behind; `REFERENCES`, `TRIGGER` and — from PostgreSQL 17 — `MAINTAIN`
were the rest, and they were dismissed in
`supabase/tests/003_data_api_grants.test.sql` as carrying "no Data API
meaning". They do carry none *today*, and that is the problem with the
dismissal rather than a defence of it: `TRIGGER` is inert only because no
role can `EXECUTE` a trigger function, `REFERENCES` only because no role
holds `CREATE` on a schema, and neither condition was asserted anywhere.
`20260826120000_revoke_ambient_table_privileges.sql` revokes all three, and
the sweep that pins it reads privilege *letters* out of the ACL rather than
naming privileges, so it holds on a server version this schema has not been
run on yet.

The same migration revokes the `ALTER DEFAULT PRIVILEGES` entries that hand
those privileges back. That is the half the three preceding revokes left
open: each expanded `on all tables in schema public` at execution time, so
the next table created in `public` arrived TRUNCATE-able again, and the
mitigation was a schema-wide sweep that fails *after* the table exists.
Executed before the revoke, a freshly created table came out
`{…,anon=Dxt/root,authenticated=Dxt/root,service_role=Dxt/root}` with
`has_table_privilege('anon', …, 'TRUNCATE')` true; after it, with a null ACL.
The residue on sequences was `UPDATE`, which is `setval` — latent only
because every key in this schema is a `uuid` (#280 finding F15). **The rule
this settles for every future table is that a new relation in `public`
starts closed, and its migration opens exactly what it means to open.**

#### Amendment, 2026-08-26 (#382, issue #194): authority over a row is not authority over the record of when it was written

**Unapproved on the same terms as the amendment above**, and recorded here for
the same reason: the two paragraphs below are #382's text unchanged, and the only
warrant behind them is #382's judgement. This is the sharper of the two, because
it narrows an accepted classification — it says so itself, two sentences in — and
ruling 1 of [`README.md`](./README.md)'s *"An amendment to an accepted ADR"*
section uses exactly that word as its demonstration that "applies" and "amends"
cannot be told apart from outside the editor's head. See
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 for what the owner is being asked.

**Authority over a row is not authority over the record of when it was
written.** Decided 2026-08-26 for issue #194, and it is the one ruling in
this section that narrows the row above rather than the one below it: "Prison
simulation state, saves, settings — Z0/Z1 (client-authoritative)" is about a
row's *content*, and a `created_at`/`updated_at` column is not content. It is
the server's statement about when the write happened, so its authority is Z2
even on a table whose payload is Z0's. `20260824140000` established this for
`created_at` without naming it as a rule;
`20260826130000_server_stamp_updated_at.sql` completes it for `updated_at` on
`prisons`, `profiles` and `user_settings` — the server stamps them from a
`BEFORE INSERT OR UPDATE` trigger, and the columns are out of every client
grant, so a client that sends one is refused rather than silently corrected.

The rejected alternative was to keep the columns client-writable on the
argument that an offline-first client legitimately knows when the user
changed a setting. It was declined on two grounds, both executed. First,
`src/persistence/cloud/sync-engine.ts` states the reconciliation contract as
"silent last-write-wins is prohibited": ordering is decided by
`prisons.current_revision`, which a client cannot write (`42501`, reproduced),
and conflicts by an explicit user choice — so a client edit time has no
consumer in the design and one prohibited use. Second, without a trigger the
column was not merely untrustworthy but *wrong*: `default now()` fires only on
`INSERT`, so an `UPDATE` that did not name `updated_at` left it at the insert
value. Reproduced as `authenticated`: `payload` changed while `updated_at`
stayed at `2020-01-01`. Nothing in `src/` names it, so nothing was keeping it
current. **If a client-side edit time is ever needed for reconciliation it
gets its own column, named for what it is** (`client_edited_at`), so the trust
boundary is visible where the value is read rather than inferred from a grant.

### 3. Mandatory shape of a Z2 entry point

*What "trusted mutation path" covers is stated by the amendment of 2026-08-27 at
the foot of this document. Read it before applying the six steps to a path.*

Every trusted mutation path, without exception, is:

1. **Authenticate** — verify the JWT (user calls) or the provider signature
   (Z3 callbacks). No unauthenticated mutation endpoint exists.
2. **Authorize** — check the acting principal against the target row
   explicitly. `SECURITY DEFINER` bypasses RLS, so the check inside the
   function *is* the security control (same rule as `create_save_version`).
3. **Validate** — parse the request against a versioned schema, rejecting
   unknown fields. Fail closed: an unparseable request mutates nothing.
4. **Deduplicate** — every mutation carries a caller-supplied idempotency
   key (`provider_event_id` for Z3). A replay returns the original result
   and writes nothing new.
5. **Apply** — as an append to an audit log first; derived projections are
   computed from that log, never written independently.
6. **Audit** — record actor, reason, source, and prior/next value.

### 4. Rules that constrain implementation

- **No service-role credential ever reaches Z0/Z1.** Restated from
  `AGENTS.md` because this ADR is where it becomes load-bearing.
- **Client caches of Z2 state are projections, not sources.** They are
  timestamped, they expire, and they may only ever *reduce* what the client
  believes it is allowed to do as they age (see
  `src/services/entitlements/projection.ts`). A projection that can grant a
  right is a client-writable entitlement with extra steps.
- **The server re-checks at the point of effect.** A UI that hides a
  locked feature is a convenience; the Z2 function that creates the
  resource performs the real check.
- **Trusted services never run the simulation for normal play.** The only
  approved server-side simulation execution is bounded, offline replay of
  challenge evidence (ADR 0009).
- **No trusted-service call is on the frame or tick path.** All of them are
  asynchronous, failable and optional; losing connectivity degrades product
  features, never gameplay.

### 5. Threat model

| # | Threat | Actor capability | Asset | Mitigation |
| --- | --- | --- | --- | --- |
| T1 | Forged score submitted directly to the API | Any authenticated user with a HTTP client | Leaderboard integrity | Rank only replay-verified submissions; ADR 0009 |
| T2 | Tampered/patched client produces "valid" evidence | Local code modification | Leaderboard integrity | Evidence binds build/content/config; replay recomputes the outcome server-side; incompatible builds rejected |
| T3 | Replaying someone else's evidence | Network capture or public data | Leaderboard integrity | Submissions are account-scoped (`user_id` is `auth.uid()` and there is no owner parameter) and deduplicated on `evidence_digest`, a stored generated column the server computes from the payload. The caller-supplied `evidence_hash` keyed this until issue #105 finding 1 and now keys nothing — see `docs/TRUSTED_SERVICES.md`, "The dedup key is the payload, not the caller's claim", for the residual the global key leaves open |
| T4 | Direct write to `entitlements` via PostgREST | Authenticated session | Paid capacity | No insert/update/delete policy **and** revoked table grants; only Z2 writes |
| T5 | Editing the local entitlement cache | DevTools/localStorage | Paid capacity | Cache is advisory, clamped and expiring; capacity is re-checked server-side at slot creation |
| T6 | Forged or replayed payment webhook | Anyone who can reach the endpoint | Paid capacity, revenue | Signature verification before parsing effects; `(provider, provider_event_id)` uniqueness |
| T7 | Refund/chargeback leaves the right granted | Provider-side event | Revenue | Revocation is an ordinary ledger event; projection recomputes; over-capacity degrades read-only, never deletes saves |
| T8 | Diagnostics exfiltrate save contents or PII | Our own bug | Player privacy | Allow-listed attribute schema, redaction, no payload capture by default; ADR 0010 |
| T9 | Public source maps expose original sources | Build misconfiguration | IP, attack surface | `sourcemap: false` in the shipped bundle; private upload path only |
| T10 | Telemetry becomes tracking | Product drift | Player trust, legality | Opt-in consent, category gating, documented retention/deletion; ADR 0010 |
| T11 | Trusted call blocks the game | Bad integration | Playability | All service calls are off the tick/frame path and fail soft |
| T12 | Translated text changes simulation behavior | Content authoring drift | Determinism | Stable IDs are separate from message keys and text; ADR 0011 |
| T13 | Flooded, forged or back-dated events posted to an unauthenticated telemetry ingest | Anyone who can reach the endpoint, with no account and no credential | Diagnostic signal, storage cost, the retention promise | Server-side validation against the versioned envelope schema and a bounded body, batch and rate; the **server** decides the stored occurrence time and the weight an event carries, never the payload; append-only, with no account column to join to. Added 2026-08-27 with §3's scope clause, because scoping §3 by authority is what leaves this path outside steps 1, 2, 4 and 6 — see that amendment |

## Alternatives considered

- **Move the simulation server-side** so results are inherently trusted.
  Rejected: it contradicts `AGENTS.md`'s mandatory architecture, destroys
  offline play, and imposes per-player server cost for a single-player
  game. The verification problem is bounded to challenges; the solution
  should be bounded too.
- **Trust the client and moderate afterwards.** Rejected as a *primary*
  control: it makes fairness a cleanup task and gives the first mover a
  permanent, visible reward. Retained only as a *secondary* layer on top of
  verification.
- **Ship nothing trusted until a full anti-cheat exists.** Rejected: the
  entitlement and diagnostics boundaries are needed long before public
  ranking, and they are independently well-defined.

## Consequences

- A new source layer, `src/services/`, holds trusted-service *contracts*
  and the pure logic that runs on both sides of the boundary (schemas,
  ledger folds, verification pipeline, projections). It is not simulation
  code: nothing under `src/simulation/` may import it, and it may not
  import Phaser or touch the DOM.
- Server-side deployment units (Edge Function/Worker handlers) are
  deliberately *not* created by this issue; the modules they will host are,
  so the policy is testable in Node before any endpoint exists.
- Public ranking stays gated on ADR 0009's runner plus a security review.
- Each of entitlements, diagnostics and localization gets its own ADR
  refining this boundary rather than re-deciding it.

## Amendment, 2026-08-27: §3's "without exception" has an exception, and it is the oldest and busiest `SECURITY DEFINER` function in the schema

*This amends **§3, "Mandatory shape of a Z2 entry point"**. No decision moves and
no zone or authority row changes. What is recorded is that §3's scope is
unstated, and that under the only reading §1 supports it is contradicted by
shipped SQL — including by a gap §2 of this same document already admits. The
form is ADR 0029's and ADR 0034 §9's: the old wording is quoted rather than
overwritten.*

*Status is untouched: this ADR remains **Accepted**. Read at `792bf94`
(v0.0.121); every migration named below was opened on that tree.*

> **Corrected 2026-09-15: the pin sentence above is advisory, it is kept word
> for word rather than deleted, and it is false about part of what sits below
> it.** `docs/adr/README.md`'s section *"A global anchor pin in an ADR is
> advisory, and does not date what is below it"* — added by pull request #1231
> and not on `main` as this is written — names this very sentence as one of its
> rows, and this document is the worst of the shapes it found. Three things a
> reader should not infer from it:
>
> - **"below" reaches past the end of this amendment.** `002e1183` appended a
>   second amendment under it later the same day, carrying its own pin at
>   `30db0e9` — 108 commits further on. Every anchor in that section therefore
>   sits under *two* pins naming two different trees, and inherits from this one
>   a date at which it was never read. That is #1231's "worse shape" and it is
>   this row: the anchors were not moved under a stale pin, they were **added**
>   under one.
> - **The migrations are the half that held, and the word is doing real work.**
>   Re-checked 2026-09-15 by opening each one: every anchor into
>   `supabase/migrations/` in this document still lands on the statement its
>   sentence names. What rotted is everything the word *migration* excludes —
>   `vite.config.ts`, `src/services/telemetry/events.ts` and the anchors into
>   `supabase/tests/` — each corrected at its own site below.
> - **`(v0.0.121)` is the working version string, not the tag, and is kept.**
>   Checked rather than assumed: `package.json` reads `0.0.121` at `792bf94`,
>   so the parenthetical is honest — but `v0.0.121` the tag is `54418b6`, and
>   `792bf94` is fifty commits after it, first released in `v0.0.122`. A reader
>   who resolves the tag will land somewhere else.

### The sentence, and the function it does not describe

§3 opens:

> Every trusted mutation path, without exception, is:
> 1. **Authenticate** … 2. **Authorize** … 3. **Validate** … 4. **Deduplicate** —
> every mutation carries a caller-supplied idempotency key … 5. **Apply** — as an
> append to an audit log first; derived projections are computed from that log,
> never written independently. 6. **Audit** — record actor, reason, source, and
> prior/next value.

§1 defines Z2 as *"Supabase Edge Function / Cloudflare Worker / `SECURITY
DEFINER` SQL"*. Nine migrations declare `security definer` functions on this
tree; `public.create_save_version`
(`supabase/migrations/20260822190300_create_save_version_rpc.sql:53-153`) is one
of them, is the path every cloud save on `main` goes through, and is the function
§3 step 2 names as its own precedent (*"same rule as `create_save_version`"*).
Measured against the six steps:

- **Steps 1–3 hold.** `auth.uid()` is the only principal
  (`:104`), the owner check is explicit and fails closed on a NULL subject
  (`:104-106`), and the arguments are typed and pre-validated (`:79-84`).
- **Step 4 does not.** The signature (`:53-61`) carries no caller-supplied
  idempotency key. Replay safety is *derived* — a row already at
  `(prison_id, revision, checksum)` returns `idempotent_replay` (`:121-130`) —
  which is a good design and is not the one this step describes.
- **Step 5 does not.** `update public.prisons set current_version_id = …,
  current_revision = … ` (`:145-149`) writes the projection directly. Nothing is
  appended to a log and nothing is folded. The entitlements path is the only one
  in the schema shaped the way step 5 requires
  (`public.record_entitlement_event` → `public.recompute_entitlement_projection`,
  `supabase/migrations/20260823090000_create_entitlement_events.sql:215-251`).
- **Step 6 does not.** No actor, reason, source or prior value is recorded. Nor
  can it be: **§2 of this ADR already says so** — *"no audit trail on the trusted
  write path exists yet (#105 finding 8)"* — and uses that absence as an argument
  for revoking `TRUNCATE`. So this document asserts a mandatory step in §3 and
  records its absence in §2, three sections apart, and nothing mechanical can see
  that: the gates over `docs/adr/` compare a status word to a document and never
  a document to itself.

`public.submit_challenge_evidence` and `public.create_prison` are in the same
position for steps 5 and 6.

### Which is wrong, the document or the code

**The document, on scope — probably.** The defensible reading is that §3 governs
paths that mutate **server-authoritative** state, and `create_save_version`
mutates state §2's own authority table classifies as **Z0/Z1
(client-authoritative, RLS-scoped)**. The function's own closing comment takes
that view explicitly: *"a cloud save is client-authoritative state (ADR 0008's
authority table) … and no trusted path writes saves"*
(`20260822190300_create_save_version_rpc.sql:171-174`). Under that reading the
six steps are right and merely mis-scoped, and the fix is one clause in §3.

**But §3 as written does not permit that reading**, because §1 defines a zone by
its *runtime* and not by the authority of what it touches, and
`create_save_version` is `SECURITY DEFINER` SQL. An agent applying §3 literally
to the next RPC that touches a save will demand an idempotency key and an audit
log for it; an agent applying it by authority will not. Nothing in the document
tells them apart, and the two answers differ in real work.

**This is recorded, not decided.** It is the owner's call whether §3 gains
*"every mutation path over Z2-authoritative state"*, or whether the three
functions above acquire steps 4–6. No `Status` moves either way, and neither
answer makes any zone, authority row or threat-model row wrong.

*Added 2026-08-27, after the paragraph above and leaving it word for word: the
owner has answered, and the answer is the first of the two. The amendment at the
foot of this document is that answer; what it costs, and where its wording
departs from the draft quoted above, is stated there. This paragraph is left
standing rather than rewritten because a superseded question is the only record
of what was asked.*

### What was checked and found intact

Every code and SQL citation in this ADR resolves and every absolute in it holds
at `792bf94`. `20260824090100_revoke_client_truncate.sql`,
`20260824150000_revoke_trusted_truncate.sql`,
`20260826120000_revoke_ambient_table_privileges.sql`,
`20260824140000_protect_server_timestamps.sql` and
`20260826130000_server_stamp_updated_at.sql` all exist under
`supabase/migrations/`, and the last one creates `before insert or update`
triggers on exactly the three tables §2 names — `prisons` (`:161-163`),
`profiles` (`:166-168`) and `user_settings`. T3's `evidence_digest` is a real
column with a real unique constraint
(`20260824100000_bind_challenge_evidence_to_payload.sql:252`, `:291-292`). T9's
`sourcemap: false` is at `vite.config.ts:84`.

> **Corrected 2026-09-15. Everything in the paragraph above that is a migration
> re-verified exactly, opened line by line; the one anchor in it that is not a
> migration has drifted, which is the pin's own scope word showing through.**
> `vite.config.ts:84` is today a line of the comment block explaining
> `telemetryDefines()`. The claim is intact and the anchor is not: the line
> reading `sourcemap: false,` is at `vite.config.ts:91`, still inside the
> `build` block and still carrying the two-line comment the ADR's T9 row is
> about. The old number is left in the sentence, as a bare `:84`, because it is
> now a statement about a tree rather than about this one. The Consequences bullet holds in
both halves: `grep -rn "from '.*services/" src/simulation/` is empty, nothing
under `src/services/` imports Phaser or touches the DOM, and
`supabase/` holds `config.toml`, `migrations` and `tests` and no `functions`
directory at all, so the deployment units really are still uncreated while the
modules they will host exist. (That directory is named here without a rooted
path on purpose: `documentation-links-contract.test.ts` refuses a cited path
that is not on disk, and this one is absent by design.)

> **Corrected 2026-09-15, and this one is a fact rather than a number.** The
> first clause still holds — `supabase/` holds `config.toml`, `migrations` and
> `tests`, and there is still no `functions` directory. The conclusion drawn
> from it does not. **A server-side deployment unit exists**: `src/worker/`
> holds `index.ts`, `telemetry-ingest-route.ts` and `telemetry-ingest.ts`, and
> `index.ts` describes itself as *"The first code in this project that runs
> where a player cannot see it"* — the ADR 0046 telemetry ingest, named as
> `main` in `wrangler.jsonc`. So the sweep above proved the absence of an
> *Edge Function* and was read as proving the absence of a server tier; the
> tier arrived through Cloudflare instead. Both halves are marked rather than
> overwritten because the reasoning was sound on its own evidence and the
> evidence was incomplete.

Two forward commitments are worth a reader's attention and neither is a defect.
The Consequences bullet *"Each of entitlements, diagnostics and localization gets
its own ADR"* is met for diagnostics ([ADR 0010](./0010-telemetry-and-diagnostics-privacy.md))
and localization ([ADR 0011](./0011-localization-architecture.md)); for
entitlements the nearest document is
[ADR 0013](./0013-free-tier-cloud-save-capacity.md), which names itself *"an
engineering decision inside the boundary ADR 0008 already set"* rather than a
refinement of the boundary. And §4's *"No trusted-service call is on the frame or
tick path"* is currently true the uninteresting way: `docs/adr/STATUS-QUEUE.md`
§5 already records that nothing outside `src/services/telemetry/` imports that
layer at all. A rule that no call site can violate is not yet a rule that has
been tested.

## Amendment, 2026-08-27: §3 is scoped by authority, so telemetry ingest needs no exception

*This answers the amendment above, which recorded §3's scope as unstated and
left the choice to the owner. **The owner has chosen the "by authority"
reading**: §3 gains a scope clause, and an unauthenticated telemetry ingest
falls **outside** it. No exception is carved for telemetry, and none is needed.
Status is untouched: this ADR remains **Accepted**.*

*What is the owner's is the reading, and nothing else. **The wording of the
clause below is not theirs, and neither is any consequence drawn from it** — the
function-by-function application, the guard in part 3, the new
threat row T13, the account of what is unenforced and the amplification path in
part 7 are this editor's work under that choice. A reader who disagrees with a
consequence should treat that consequence as open; the reading itself is not
open. `docs/adr/README.md`'s "An amendment to an accepted ADR" section requires
an amendment to state that position in its own opening, and its ruling 3 is why
this one carries a row in [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 rather than
a status of its own — `adr-numbering-contract.test.ts` counts documents by their
`Status` line, so a section inside an Accepted ADR is invisible to every
mechanical gate in `docs/adr/`.*

*Read on the tree at `30db0e9`. Every SQL, test and source citation below was
opened there.*

> **Corrected 2026-09-15, on the same terms as the pin above and for the same
> reason: kept, not deleted, and no longer true of the non-SQL half.** This
> section's anchors into `supabase/migrations/` all still resolve; its two
> anchors into `src/services/telemetry/events.ts` and its two into
> `supabase/tests/003_data_api_grants.test.sql` do not, and are re-aimed where
> they are cited. Read this sentence as a record of where the section was
> written from, not as a statement that its numbers are current.
>
> **And one claim under it is not an anchor problem but a fact problem:
> the endpoint this amendment reasons about as unbuilt has been built.** See
> part 6 below, where it is corrected in place.

### Part 1. The clause

> **Scope.** §3 binds every mutation path over state that **§2's authority table
> assigns to Z2**, and only those. A path is measured by the state it is
> entrusted to *decide* — not by the runtime it happens to run in, and not by
> every column a statement inside it touches.

The amendment above drafted this as *"every mutation path over Z2-authoritative
state"*. That is the same decision; the wording is changed twice, and each
change buys something the draft does not.

- **"that §2's authority table assigns to Z2", rather than the bare adjective
  "Z2-authoritative".** A loose "Z2-authoritative" is an argument any future
  endpoint can make about itself, and it is unanswerable, because there is
  nothing to check the argument against. Naming the table moves the guard inside
  the clause: scope is decided by a **row**, and a row is a thing a reader can
  point at or fail to find. Part 3 of this amendment is that guard stated as an obligation.
- **"and only those", plus decide-versus-touch.** Without it the clause does not
  answer the case it was written for. `public.create_save_version` writes a save
  payload — Z0/Z1 by §2's first row — and in the same block writes
  `prisons.updated_at`, which §2's own 2026-08-26 amendment rules Z2-authoritative
  on exactly that table. Read as "touches any column whose authority is Z2", the
  clause pulls the function straight back into §3 and settles nothing. Read as
  "decides", it settles it: what that function is entrusted to decide is the
  content of a save, and a server-stamped timestamp is not something it decides
  at all.

**§1 is unchanged and is still a runtime taxonomy.** The clause does not
redefine Z2; it says which question §3 is answering. A path can run in Z2 and be
outside §3, and — part 2 below — a path can be inside §3 without running in Z2's
function-shaped form at all.

### Part 2. What the clause settles, path by path

Measured against the SQL rather than against the ADR. Every `security definer`
function in `supabase/migrations/` that any role may `EXECUTE`, plus the one Z2
write path that is a bare table grant:

| Path | What it is entrusted to decide | §2 row | §3? |
| --- | --- | --- | --- |
| `public.create_save_version` | a save version's content, and which version a prison points at | Prison simulation state, saves, settings — **Z0/Z1** | **outside** |
| `public.create_prison` | that a prison row exists, in a slot | same row | **outside** |
| `public.submit_challenge_evidence` | that a submission exists, filed `pending` against a definition | Challenge submissions and rank — **Z2** | **inside** |
| `service_role`'s column `UPDATE` on `challenge_submissions` | the verification verdict and the ranked score | same row | **inside** |
| `public.record_entitlement_event` | that a grant or revocation happened, and on whose authority | Entitlement grants/revocations — **Z2 only**; Payment/store facts — **Z3 → Z2** | **inside** |
| `public.recompute_entitlement_projection` | nothing on its own | derived from the row above | inside, but not an entry point |
| a telemetry ingest endpoint (not built) | nothing — the client is the source | Telemetry/diagnostic events — **Z0 produced, Z2 gated** | **outside** |
| a telemetry retention/deletion job (not built) | which events survive, and for how long | the *gated* half of that same row | **inside** |

**`create_save_version` — outside, and this is the concrete thing the owner
accepted.** Steps 4, 5 and 6 are not owed by it. The earlier amendment measured
that all three are absent and asked whether the document or the code was wrong;
under this clause the code is right and the document was mis-scoped. Steps 1–3
hold anyway and are not a courtesy: `auth.uid()` is the only principal, the
owner check fails closed on a NULL subject, and the arguments are typed and
pre-validated. The function's own closing comment already took this view —
*"a cloud save is client-authoritative state (ADR 0008's authority table) … and
no trusted path writes saves"*
(`supabase/migrations/20260822190300_create_save_version_rpc.sql:171-174`) — and
the clause is that comment promoted from a comment to a rule.

**The objection to that, stated because it is the weakest joint in this
amendment.** `prisons.current_revision` and `prisons.current_version_id` are out
of every client grant — `revoke update on public.prisons from authenticated,
anon` at `supabase/migrations/20260822190100_create_prisons.sql:107`, with the
comment above it naming `create_save_version` as *"the sole path able to advance
the pointer columns"* — and `src/persistence/cloud/sync-engine.ts` decides
reconciliation order from `current_revision`. A column no client may write, that
another subsystem trusts to order writes, looks very like the thing §2's
2026-08-26 amendment ruled Z2-authoritative. **The distinguishing test is that
amendment's own:** it separates a row's *content* from *the server's statement
about the write*. `updated_at` is computed by the server and the caller cannot
propose it. `current_revision` is `p_new_revision`, a caller-supplied argument
the server accepts or refuses; the server decides only whether it is next, which
is validation of content, not authorship of a fact. So the pointer columns fall
on the content side and `create_save_version` stays outside §3. **If a later
reader disagrees, the remedy is not to re-argue this paragraph: it is to add a
row to §2's table for the pointer columns, at which point §3 binds them by the
clause itself.** That is the shape this whole amendment is built to have.

**`create_prison` — outside, on the same ground**, and note what does *not*
follow. It calls `public.account_save_slot_capacity`, which folds the
entitlement ledger. Reading Z2 state is not mutating it, so the capacity read
does not pull the function into §3; what would is a path that *writes* capacity,
and no such path exists outside `record_entitlement_event`.

**`submit_challenge_evidence` — inside, and it very nearly meets the steps.**
Step 4's substance is met and by something stronger than the step describes: the
dedup key is `evidence_digest`, a stored generated column the server computes
from the payload, so a caller cannot choose it. The step's literal wording asks
for *"a caller-supplied idempotency key"*, and this is deliberately not one —
T3's row already records why the caller's claimed hash keys nothing. **This
amendment does not rewrite step 4**; it records that a server-derived key
satisfies its purpose more completely than a caller-supplied one, and leaves the
wording for whoever next edits §3. Steps 5 and 6 are owed: the submissions table
is close to being its own append log, but no actor, reason, source or prior
value is recorded for the verdict.

**The verdict write is inside §3 and has nowhere to put it.** `grant update
(verification_status, rejection_code, ranked_score, verified_at) on
public.challenge_submissions to service_role`
(`supabase/migrations/20260823090100_create_challenge_tables.sql:156-157`) is a
mutation over Z2-authoritative state — rank — performed by a bare table grant,
not by a function. §1's runtime list would not obviously have caught it: a
`service_role` PostgREST `PATCH` is not an Edge Function, a Worker or
`SECURITY DEFINER` SQL. **The clause pulls it in.** That is worth stating
plainly, because the by-authority reading is otherwise easy to read as a pure
loosening: here it binds a path the runtime reading arguably did not. What binds
it today is one trigger,
`public.enforce_challenge_verification_transition`, which makes the verdict
one-way; steps 4, 5 and 6 have no home on a bare grant, and giving them one
means the verifier writes through a function. Recorded as an obligation of the
replay runner, which is ADR 0009's and is not built.

**`record_entitlement_event` — inside, fully, and already shaped for it.** It is
the one path in the schema that meets steps 4 and 5 as written: a caller-supplied
`p_provider_event_id` keys the dedup for the Z3 path, an append to
`entitlement_events` precedes the projection, and the projection is recomputed
from the ledger rather than written independently. Step 6 is met in its first
three terms by columns rather than by a separate record — `actor_kind` and
`actor_id` are `not null` with checks at
`supabase/migrations/20260823090000_create_entitlement_events.sql:31-32`, and
`reason` and `source` travel with every event — and its fourth, prior/next
value, is implicit in the fold rather than recorded. **§2 of this document says
*"no audit trail on the trusted write path exists yet (#105 finding 8)"*, and
that sentence is left exactly as it is.** The measurement above does not
contradict it if it means a separate audit of trusted *operations*; it does if it
means the ledger. Marked in both directions rather than resolved, because
resolving it is #105's editor's call and not this amendment's.

**Telemetry ingest — outside, which is the decision.** §2 classifies the events
as *"Z0 produced, Z2 gated"*, with the rationale *"Client is the source but is
never trusted with retention policy."* What the ingest endpoint decides is
nothing: it records what an untrusted source said. So steps 1, 2, 4 and 6 are
not owed by it, and §3 step 1's *"No unauthenticated mutation endpoint exists"*
is not contradicted by building it. That sentence entered at `5979b43`, the
commit that created this ADR, and has never been edited
(`git log -S "No unauthenticated mutation endpoint exists" --all -- docs/adr/0008-trusted-service-boundary.md`).
It was vacuously true of HTTP the day it was written — the same commit's
Consequences say server-side deployment units are *"deliberately not created"* —
and it is non-vacuous, true and enforced about `SECURITY DEFINER` SQL, where
every entry point in the table above derives its principal from `auth.uid()` or
is granted to `service_role` alone. The clause is what makes that reading the
document's rather than a reader's.

> **Updated 2026-09-15: it is no longer vacuous about HTTP, and this is the
> clause being spent rather than tested.** An unauthenticated HTTP mutation
> endpoint now exists — `src/worker/index.ts`, which cites this amendment by
> name for its permission and says of itself that the ingest is *"unauthenticated
> by design"*. **Nothing above needs re-deciding**: the reading is that §3 binds
> by the authority of the state a path decides, the ingest decides nothing, so
> §3 step 1 does not reach it and is not contradicted. What changes is the
> reader's situation. Until 2026-09-03 a reader could satisfy themselves that
> step 1 held by observing that there were no endpoints; from the ingest onward
> they have to accept the clause to keep reading step 1 as true, and that is a
> heavier thing to ask of a sentence that still says *"without exception"* four
> hundred lines above. §3's own pointer to this amendment is what carries it.

**The retention job — inside, and this one is not obvious.** Deciding which
events survive *is* the half §2 assigns to Z2. A scheduled deletion is a
mutation over it, so §3 binds it: the job records what rule it applied, over
what window, and what it removed. That is a real obligation this clause creates,
not one it removes.

### Part 3. The clause is not a loophole, and §2's table is why

**A path may not claim this clause without pointing at a row.** Concretely, and
binding on every future change:

1. **To assert that §3 does not apply, name the §2 row that assigns the state to
   something other than Z2.** "It is not really Z2-authoritative" is not an
   argument; it is the absence of one.
2. **To assert that §3 does apply, name the row that assigns it to Z2.**
3. **If no row covers the state, the change adds one, in the same commit, before
   it claims either answer.** A new kind of state with no row is not
   out-of-scope by default. It is unclassified, and unclassified state does not
   get the benefit of the doubt.

This is the same discipline §2's 2026-08-26 amendment states for privileges — *"a
new relation in `public` starts closed, and its migration opens exactly what it
means to open"* — applied to authority instead of to grants. **Nothing asserts
it.** No test reads §2's table, and part 6 below is the wider version of that
admission.

### Part 4. What telemetry does **not** get out of: steps 3 and 5

The clause puts the ingest outside §3 as a whole. It does **not** put it outside
server-side validation or append-only storage, and those two bind whether or not
§3 formally reaches the path:

- **Step 3, validate.** The client validates its own envelopes and the client is
  Z0 — untrusted by this ADR's own first row. Two fields make this concrete
  rather than hygienic, and both are on the wire today:
  - `sampleRate` (`src/services/telemetry/events.ts:50`) exists so *"the receiver
    can weight instead of guessing"*. A receiver that weights by `1 / sampleRate`
    and believes the client is an amplifier: an event sent with `0.001` counts as
    a thousand. The server must weight from what it configured, not from what
    arrived.
  - `occurredAt` (`src/services/telemetry/events.ts:39`) is
    `z.number().int().min(0)` — any non-negative integer. A retention job that
    deletes on a stored client timestamp deletes nothing that was sent with a
    timestamp far enough in the future. The stored occurrence time must be the
    server's; keeping the client's is fine as a separate, clearly named column.

  > **Corrected 2026-09-15, in three directions, and the middle one is the
  > interesting one.**
  >
  > 1. **One anchor holds and one has drifted.** `occurredAt` is still
  >    `occurredAt: z.number().int().min(0),` (verbatim in
  >    `src/services/telemetry/events.ts`) at `events.ts:39`, exactly as cited.
  >    The `sampleRate` field is no longer at `:50` — that line opens the
  >    docblock above it — but at `src/services/telemetry/events.ts:64`.
  > 2. **The quotation attributed to the field is no longer in the file, and
  >    the code now argues this paragraph's own case.** `events.ts` used to say
  >    the receiver could *"weight instead of guessing"*; `98b8862e` replaced
  >    that with the refutation — the docblock there now reads *"It used to say
  >    the receiver can "weight instead of guessing" by it. That holds only
  >    for a *trusted* sender."* So the quotation above is a quotation of a
  >    deleted sentence and is left as history rather than re-attributed.
  > 3. **Both hazards are answered in shipped code.** `src/worker/index.ts`'s
  >    guard table names `receivedAt` stamped at the Worker against retention
  >    evasion, and `registrySampleRate` taken from the registry against
  >    aggregate amplification — which is what this bullet pair asked for,
  >    arriving after it was written. The obligation is discharged, not
  >    withdrawn.
- **Step 5, apply as an append.** Aggregates are folded from the stored events,
  never written independently. This is the same rule that makes the entitlement
  ledger auditable and it costs nothing here.

**Bounding the input — body size, batch size, request rate — is an obligation of
the telemetry pipeline's own ADR**, which lists it among the preconditions
ingestion must meet before it is deployed. It is named here by subject rather
than by section number on purpose: that document is under active edit, and
`docs/AGENT_WORKFLOW.md` §4 is explicit that a section anchor into a document
under edit is this corpus's least durable citation.

### Part 5. Threat model: T13 is added

Recommended and added, in §5's table above. The two existing telemetry rows do
not cover it: **T8** is *"Diagnostics exfiltrate save contents or PII"* with the
actor capability *"Our own bug"*, and **T10** is *"Telemetry becomes tracking"*
with the capability *"Product drift"*. Both model **us** as the actor. Neither
models a third party writing *into* the ingest, and an endpoint that anyone can
reach with no credential is exactly that actor's opportunity. T13 names flood,
forgery and retention evasion together because one mitigation set answers all
three, and because splitting them would suggest a receiver could sensibly
address one and not the others.

The row is stated as a threat rather than as a prohibition: the endpoint is
permitted, and what T13 records is the price of permitting it.

### Part 6. What is **not** gated, and it is the whole of §3 step 1's enforcement

Said plainly, because everything above would otherwise read as backed by CI.

**No test in this repository can see the surface this decision permits.** The
pgTAP suites are the only enforcement §3 step 1 has, and they sweep **database
roles**, not HTTP callers:

- `supabase/tests/003_data_api_grants.test.sql` asserts the exact table, column
  and function privilege set of `anon`, `authenticated` and `service_role`, each
  named as a literal — `has_function_privilege('service_role', p.oid, 'EXECUTE')`
  at `supabase/tests/003_data_api_grants.test.sql:607` is the shape, and the
  three role names are spelled out throughout. **Re-aimed 2026-09-15: that line
  is today the `authenticated` arm of the assertion above it. The
  `service_role` one this sentence means is
  `and has_function_privilege('service_role', p.oid, 'EXECUTE')),` (verbatim in
  `supabase/tests/003_data_api_grants.test.sql`), at
  `supabase/tests/003_data_api_grants.test.sql:634`; `:607` is kept as history.
  Nothing about the claim moved — the sweep is still by literal role name and
  still reaches no fourth role.** A fourth database role, created
  for a Worker to hold, is **swept by none of it**. The suite's separate
  PUBLIC-grantee assertion does not reach a named role either.
- **A Worker calling a `SECURITY DEFINER` function with a server-side key is
  `authenticated` or `service_role` to PostgreSQL**, whoever reached the Worker.
  The database cannot distinguish an operator from the open internet, and nothing
  in this repository observes who reached the Worker. There is no HTTP surface
  here to observe: the deployment units are still not created, exactly as this
  ADR's Consequences say.

  > **Corrected 2026-09-15. The last sentence is false and is the sharpest thing
  > this pass found in this document.** The Worker landed: `src/worker/index.ts`
  > is named as `main` in `wrangler.jsonc` and carries the ADR 0046 telemetry
  > ingest route. So there **is** an HTTP surface here now, and the rest of the
  > bullet is about the only part that has not changed — nothing in this
  > repository observes who reached it, and by design: `src/worker/index.ts`
  > records that it makes no `console` call at all, because a log line in a
  > Cloudflare Worker carries the visitor's IP into the account's log stream.
  > **The conclusion of this part survives its premise**: §3 step 1's
  > enforcement is still only the pgTAP suites, they still sweep database roles
  > by literal name, and they are still structurally blind to HTTP — which is
  > now a statement about a live endpoint rather than about a hypothetical one.
  > That makes part 6 more load-bearing than when it was written, not less.

So **§3 step 1's only enforcement is structurally blind to unauthenticated HTTP
ingest.** That is not an argument against the owner's choice — an authenticated
ingest would be equally invisible to it — but it means nothing red will appear if
this boundary is later got wrong, and no reader should infer otherwise from the
existence of eleven pgTAP suites. What holds the boundary here is review.

### Part 7. The amplification path, and the role that answers it

**If the Worker's server-side key is `service_role`, a publicly reachable Worker
holds the paid-entitlement write path.** `record_entitlement_event` is granted to
`service_role` and to nothing else
(`supabase/migrations/20260824110000_generalize_entitlement_idempotency.sql:346-348`),
and `supabase/tests/003_data_api_grants.test.sql` pins that as *"service_role may call exactly
one RPC: the Z3 -> Z2 payment-webhook write path"*
(`supabase/tests/003_data_api_grants.test.sql:609`; **re-aimed 2026-09-15 to
`supabase/tests/003_data_api_grants.test.sql:636` — the quoted sentence is still
in that file word for word, and `:609` now falls on the `authenticated`
assertion twenty-seven lines above it**). `service_role` additionally
holds the verdict `UPDATE` on `challenge_submissions`. So the blast radius of a
bug in an unauthenticated telemetry handler is not telemetry: it is entitlements
and leaderboard rank, reached through the same key.

**The mitigation is a dedicated least-privilege database role** holding `EXECUTE`
on the ingest function and nothing else — not `service_role`, and not
`authenticated`. Two things about it, both due before the ingest ships:

- Such a role is **unswept**, per part 6 above. Adding it means extending
  `003_data_api_grants.test.sql`'s role list in the same change; extending a
  pinned list is what adding a role looks like here.

  > **Re-read 2026-09-15: the deadline in "both due before the ingest ships"
  > has partly passed, and what that does and does not mean is worth stating
  > rather than leaving as an alarm.** The ingest handler has shipped. The role
  > has not, and neither has a destination: `src/worker/telemetry-ingest.ts`
  > takes its store as an injected `TelemetryIngestStore`, and
  > `src/worker/index.ts` records that **no key, token, project reference or
  > database credential appears in that file or anywhere under `src/`** — with
  > the path deliberately unclaimed unless a deployment sets
  > `LOCKSTATE_TELEMETRY_INGEST_PATH`. So the amplification this part warns
  > about is not open: there is no `service_role` key in front of the endpoint
  > because there is no key in front of it at all. **What has changed is that
  > the obligation is now the last thing between the ingest and a destination,
  > rather than one of several things between it and existing.** Stated as an
  > observation: nothing here measures what a deployment holds, and
  > `docs/AGENT_WORKFLOW.md` §3's *"Ask about state this repository cannot
  > read"* covers the rest.
- The role's key is a Z2 credential and §4's *"No service-role credential ever
  reaches Z0/Z1"* covers it by intent. It is worth reading as covering any
  elevated database role, not only the one Supabase happens to name
  `service_role`.

### Part 8. What this amendment does not change

No zone, no authority row, no rule in §4 and no existing threat row. §3's six
steps are untouched — including step 4's *"caller-supplied"*, which part 2 above
records as a poorer fit than the schema's own answer without rewriting it.
§3 step 1's sentence is untouched, and this amendment's position is that it was
never false: it is about the paths §3 governs, and after the clause an
unauthenticated telemetry ingest is not one of them.
