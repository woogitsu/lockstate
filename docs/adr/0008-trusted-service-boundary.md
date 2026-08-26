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
