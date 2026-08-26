# Lockstate — Security Audit

Auditor role: SECURITY. Repository: `/workspace/lockstate` @ `fcecad2` (v0.0.108), audited 2026-08-26.
Read-only audit. No file in the repository was modified.

## Method and scope note

Every claim below was checked against the actual file, not against the documentation that
describes it. The documentation in this repository is unusually accurate — several claims I
set out to falsify (no `createClient` in `src/`, no injection sink in `src/`, `sourcemap:
false`, no service-role key anywhere) turned out to be true — so this report concentrates on
(a) the places where a control's *only* guard is a convention nothing enforces, (b) the
CI/CD supply chain, and (c) abuse/cost surfaces that the SQL tier bounds per row but not per
account.

Two structural facts frame everything:

1. **The trusted tier is not deployed.** There is no `functions/` tree under `supabase/`, no Worker
   `main` in `wrangler.jsonc`, and no `createClient` call anywhere in `src/` (confirmed:
   `grep -rn "createClient\|import.meta.env" src/` returns nothing). Cloud save, entitlements,
   challenges and telemetry are all built, unit-tested and **unwired**. Most findings below are
   therefore *latent* — they become live at the commit that wires them, which is precisely
   when nobody re-reads them.
2. **`authenticated` means "anyone".** `supabase/config.toml:212` enables anonymous
   sign-ins, so every RLS policy and grant written for `authenticated` is reachable by any
   HTTP client after one unauthenticated `/auth/v1/signup` call. The schema's comments know
   this; the abuse-surface findings all follow from it.

---

## Findings

| ID | Title | Severity | Status |
|---|---|---|---|
| SEC-01 | `deploy.yml` trusts a `workflow_run` conclusion without checking the run's event or head repository; the job it gates publishes the live public site | High | SUSPECTED (absence of check CONFIRMED) |
| SEC-02 | Anonymous sign-in with no CAPTCHA and no account-creation control beyond a per-IP hourly limit | Medium | CONFIRMED |
| SEC-03 | Unbounded number of `save_versions` rows per prison — no retention or pruner exists | Medium | CONFIRMED (documented as open) |
| SEC-04 | `submit_challenge_evidence` has no per-account submission cap and no rate limit; 8 MB per row, callable by any anonymous identity | Medium | CONFIRMED |
| SEC-05 | `challenge_leaderboard` is a non-`security_invoker` view whose only control is a revoked grant, and no suite asserts view rights | Medium | CONFIRMED |
| SEC-06 | No standing gate keeps DOM-injection sinks out of `src/`, and none re-establishes CSP/renderer compatibility | Low | CONFIRMED |
| SEC-07 | `provision-supabase-cli.sh` installs an unverified downloaded binary as root inside the workflow that holds the Supabase access token and DB password | Low | CONFIRMED |
| SEC-08 | `create_prison()` leaks prison-UUID existence through `23505` — the oracle class already closed for challenges | Low | CONFIRMED |
| SEC-09 | DoS-by-save: unbounded array counts in the save schema give a crafted import ~180× memory amplification, and the import path reads the whole file with no size bound | Low | CONFIRMED |
| SEC-10 | Email/password auth is configured weak-by-default (no confirmations, 6-char minimum, no complexity, no reauth on password change) | Low | CONFIRMED (latent) |
| SEC-11 | `delete-branches.yml` uses a floating action tag with `contents: write`, breaking the SHA-pinning convention every other workflow follows | Low | CONFIRMED |
| SEC-12 | No dependency-vulnerability or secret scanning in CI; no Dependabot, no CodeQL, no `pnpm audit` | Low | CONFIRMED |
| SEC-13 | Auth/session lifecycle does not exist yet: no token storage decision, no sign-out path, and one orphaned cache-clear function | Info | CONFIRMED |
| SEC-14 | `prisons.slot_index` is client-writable with only a `>= 0` bound | Low | CONFIRMED |
| SEC-15 | Self-hosted runners execute same-repo PR code in a reused workspace, and the LFS credential is written into that workspace's `.git/config` | Low | SUSPECTED |
| SEC-16 | Telemetry session id is derived from `Math.random()` | Info | CONFIRMED |

Counts: **1 High, 4 Medium, 9 Low, 2 Info.** No Critical.

---

## SEC-01 — `deploy.yml` trusts a `workflow_run` conclusion without checking the run's event or head repository

**Severity: High. SUSPECTED exploitability; the missing check is CONFIRMED.**

Evidence:

- `.github/workflows/deploy.yml:33-36` — the trigger:
  ```yaml
  on:
    workflow_run:
      workflows: [CI]
      types: [completed]
      branches: [main]
  ```
- `.github/workflows/deploy.yml:114` — the only gate on the triggering run:
  `(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success')`
- `.github/workflows/deploy.yml:131` — what it then builds:
  `ref: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.ref }}`
- `.github/workflows/ci.yml:28`, `:156`, `:283` — every CI job is skipped for a fork PR:
  `if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository`
- `docs/DEPLOYMENT.md:167` — what the `staging` job publishes to:
  "`lockstate.io` is served by **`lockstate-staging`** — the Worker the `staging` job deploys".

Why it matters concretely. The `staging` job is not a staging deploy; per `docs/DEPLOYMENT.md:167`
and `:171` it *is* the public site. The job checks three things about its trigger — that the
triggering workflow was named `CI`, that its branch was `main`, and that it concluded
`success` — and nothing else. It does **not** check
`github.event.workflow_run.event == 'push'` or
`github.event.workflow_run.head_repository.full_name == github.repository`.

For a `pull_request`-triggered CI run, `workflow_run.head_branch` is the *head* branch name.
A fork whose PR is opened from a branch literally named `main` therefore satisfies
`branches: [main]`. That fork PR's CI run has every job skipped by the guards at ci.yml:28/156/283 —
and if GitHub records an all-skipped workflow run as `conclusion: success` (this is the part I
could not settle from the repository alone, and it is the whole of the SUSPECTED label), the
deploy fires, checks out `workflow_run.head_sha` — the attacker's commit — and runs
`wrangler deploy` against the Worker serving `lockstate.io`, with `CLOUDFLARE_API_TOKEN` in
the environment. Every safety step in between (`check-deploy-secrets.sh`, `vite build`) inspects
the attacker's own tree and would pass.

The repository is private, so the attacker must be someone who can fork it — a collaborator, or
a compromised collaborator account. That narrows who, not what: the outcome is arbitrary
JavaScript served from the project's own origin, under a CSP that permits `script-src 'self'`,
to every visitor.

Recommended fix (cheap, and independent of how GitHub resolves the skipped-conclusion
question):

```yaml
if: >-
  (github.event_name == 'workflow_run'
   && github.event.workflow_run.conclusion == 'success'
   && github.event.workflow_run.event == 'push'
   && github.event.workflow_run.head_repository.full_name == github.repository)
  || (github.event_name == 'workflow_dispatch' && inputs.target == 'staging')
```

Then pin it in `tests/foundation/ci-configuration-contract.test.ts`, which already pins the
CI loop guard (`version.yml`) and the whole `_headers` set, so the precedent exists. Separately,
prefer `if: ${{ !cancelled() && ... }}`-style explicit success over relying on a skipped run's
conclusion, and consider making the fork-PR guard a *failure* rather than a skip so a fully
skipped CI run cannot read as a pass.

---

## SEC-02 — Anonymous sign-in with no CAPTCHA and no account-creation control beyond a per-IP hourly limit

**Severity: Medium. CONFIRMED.**

Evidence:

- `supabase/config.toml:212` — `enable_anonymous_sign_ins = true`
- `supabase/config.toml:237` — `anonymous_users = 30` (per hour, per IP address)
- `supabase/config.toml:247-250` — the `[auth.captcha]` block is present only as a comment;
  `grep -rn -i captcha` over the whole repository returns nothing but those comment lines.
- `supabase/migrations/20260823100000_bound_free_tier_capacity.sql:6-9` states the consequence
  in the schema's own words: "the `authenticated` role is effectively 'anyone who can make an
  HTTP request', since a fresh identity costs one unauthenticated call to `/auth/v1/signup`."
- `docs/adr/0013-free-tier-cloud-save-capacity.md:240-249` (§7) names this as "recorded, not
  implemented".

Why it matters concretely. Each anonymous identity is a full `authenticated` principal with
5 free save slots (`base_save_slot_capacity()`), each accepting 4 MiB rows
(`max_save_payload_bytes()`), with no cap on how many rows (SEC-03). 30 identities/hour/IP is
720/day/IP; with 20 MiB reachable per identity in one round of uploads that is ~14 GB/day of
Postgres JSONB per source address, and rotating source addresses multiplies it linearly. The
cost lands on the project's Supabase bill, and JSONB in `save_versions` is the most expensive
place to put it.

Recommended fix. Enable a CAPTCHA provider for the anonymous sign-in path
(`[auth.captcha]` with hCaptcha or Turnstile) in the hosted project *and* in
`supabase/config.toml` so the local stack exercises the same path; lower
`auth.rate_limit.anonymous_users`; and land the abandoned-anonymous-account cleanup job
ADR 0013 §7 names. Because the hosted project's auth settings are not in this repository, add
an assertion to `scripts/verify-supabase-stack.mjs` (or a new deploy-time check) that reads
the project's auth configuration back, so "CAPTCHA is on" becomes a checked fact rather than a
dashboard memory.

---

## SEC-03 — Unbounded number of `save_versions` rows per prison

**Severity: Medium. CONFIRMED. Documented as open, not overlooked.**

Evidence:

- `supabase/migrations/20260822190200_create_save_versions.sql:6-38` — `save_versions` has a
  per-prison unique `(prison_id, revision)` and no cardinality bound of any kind.
- `supabase/migrations/20260823100000_bound_free_tier_capacity.sql:186-188` — the only count
  trigger in the schema is `prisons_enforce_slot_capacity`, on `prisons`, on
  `insert or update of owner_id`. `grep -n "count(\*)"` across all migrations finds no
  per-prison version count anywhere.
- `docs/adr/0013-free-tier-cloud-save-capacity.md:206-244` (§5, §6) and `:301-305`: "Until §5
  and §6 land, a single identity can still store an unbounded *number* of revisions inside its
  five bounded slots."

Why it matters concretely. `create_save_version()` requires
`p_new_revision = current_revision + 1`, so a client can push revision 1, 2, 3, … forever,
each row up to 4 MiB (measured and enforced by `save_versions_enforce_size`, so the *row* is
bounded and the *history* is not). Five slots × unbounded revisions × 4 MiB is unbounded. This
is a cost and availability problem, not a confidentiality one — RLS keeps every row inside its
owner — but combined with SEC-02 it is the cheapest denial-of-wallet in the system.

Recommended fix. Implement ADR 0013 §6's retention (20 versions per prison) as a trigger on
`save_versions`, not in `create_save_version()` alone — the same argument ADR 0013 already
makes for putting the slot cap on the table. Note the trap the ADR itself flags at `:235-237`:
pruning must never delete the row `prisons.current_version_id` points at, and it must not
delete a `(prison_id, revision, checksum)` a client may still legitimately replay for
idempotency. Until it lands, a total-bytes-per-owner cap is the cheaper interim control.

---

## SEC-04 — `submit_challenge_evidence` has no per-account submission cap and no rate limit

**Severity: Medium. CONFIRMED. Latent while no definition is published.**

Evidence:

- `supabase/migrations/20260824110100_close_challenge_definition_oracle.sql:261` —
  `grant execute on function public.submit_challenge_evidence(...) to authenticated;`
  i.e. to anyone with one anonymous signup.
- `supabase/migrations/20260824100000_bind_challenge_evidence_to_payload.sql:76-78` — the
  per-row ceiling is 8,000,000 bytes of `evidence`, plus 32 KiB of `claimed_metrics`
  (`20260824101000_bound_client_writable_columns.sql:156-158`).
- Dedup is on `(challenge_id, challenge_version, evidence_digest)`
  (`20260824100000…:290-292`). Any single changed byte — or, as that file's own comment at
  `:243-250` records, a re-encoded numeric scale — is a new digest and a new row.
- No count trigger and no rate limit: `grep -n "create trigger"` across all migrations lists
  nine triggers, none of which counts rows per account on `challenge_submissions`.
- `docs/adr/0009-challenge-verification-strategy.md`, "Gates before public ranking", item 3
  asks for "a security review of the submission endpoint (rate limits, abuse, account-scoping,
  storage cost)" — so the *review* is gated, but the grant is already live.

Why it matters concretely. Once a single challenge definition is published, one anonymous
identity can insert unlimited 8 MB rows for as long as the window is open, each one a distinct
digest. That is a 3,000× larger per-row budget than a `user_settings` payload and 2× the save
row budget, with none of the counting the save path has. The one thing standing in the way
today is the foreign key to `challenge_definitions` plus the fact that the Z2 publisher does
not exist (`20260824100000…:22-27`) — an accident of deployment order, not a control.

Recommended fix. Before the first definition is published: add a per-`(user_id, challenge_id,
challenge_version)` submission cap as a trigger on `challenge_submissions` (the ADR 0013 shape
— a count invariant of the table, not of one caller), and a per-account rate limit inside
`submit_challenge_evidence` keyed on `submitted_at`. Make the definition's own
`limits.maxEvidenceBytes` — which the client must already read and verify — the enforced
ceiling rather than the 8,000,000 abuse ceiling.

---

## SEC-05 — `challenge_leaderboard` is a non-`security_invoker` view whose only control is a revoked grant

**Severity: Medium. CONFIRMED.**

Evidence:

- `supabase/migrations/20260823090100_create_challenge_tables.sql:285-293` — the view is
  created with a plain `create or replace view`, so on PostgreSQL 15+ it defaults to
  `security_invoker = false` and reads `challenge_submissions` with its **owner's** rights,
  bypassing `challenge_submissions_select_own` entirely.
- `:299` — the only thing keeping that closed:
  `revoke all on public.challenge_leaderboard from anon, authenticated, service_role;`
- `:295-298` acknowledges the mechanism in a comment ("a non-`security_invoker` view runs with
  its owner's rights") but nothing enforces it: `grep -rn "security_invoker"` over the whole
  repository finds four *comments* and zero assertions —
  `supabase/tests/` never reads `pg_class.reloptions` or `relrowsecurity` for a view's
  invoker setting, while `003_data_api_grants.test.sql:258-264` does sweep
  `relrowsecurity` for every `relkind in ('r','p')`.

Why it matters concretely. This is exactly the pattern the schema elsewhere refuses: a control
"whose exclusivity depends on a grant staying revoked"
(`20260822190100_create_prisons.sql:47-52`). ADR 0009's gate 4 anticipates granting this read
once the display-name privacy question is answered. The moment someone does, the view returns
**every** verified submission's score for every account, RLS notwithstanding — which is
arguably the intent for a leaderboard, but nothing in the schema, the tests or the ADR says
that the grant is *also* an RLS bypass, and suite 003's sweep will pass as soon as the new
grant is added to its expectation table. The same default silently applies to every future view
in `public`.

Recommended fix. Two parts. (1) Recreate the view `with (security_invoker = true)` and, if a
cross-account leaderboard read is genuinely wanted, express it as an explicit
`SECURITY DEFINER` function or a dedicated policy — so the RLS bypass is written where a
reader will see it. (2) Add a sweep to `supabase/tests/003_data_api_grants.test.sql` asserting
that every view in `public` either sets `security_invoker = true` or appears in a declared
allow-list with a reason, in the same shape as suite 008's `unconstrained-by-decision`
mechanism. Part (2) is the durable half.

---

## SEC-06 — No standing gate keeps injection sinks out of `src/`, and none re-establishes CSP/renderer compatibility

**Severity: Low. CONFIRMED.**

Evidence:

- The property holds today: `grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML\|document\.write\|eval(\|new Function"` over `src/` returns **zero** matches. Every UI text path is
  `textContent` (`src/ui/primitives/dom.ts:25`), every attribute name is a static literal
  (`:26`, and `grep -rn "setAttribute([a-z]" src/` finds only that one generic line), and no
  CSS references an external URL (`src/styles.css:1-4` are build-time `@import`s only).
- Nothing enforces it. `ls tests/foundation/` lists 27 contract tests — for ADR numbering,
  comment stripping, unconsumed commands, deployment headers, fault-code reachability — and
  none of them greps `src/` for a DOM sink. `docs/adr/0021-http-response-security-headers.md`,
  "Consequences", rests its whole rationale on the claim: "`src/` was already clean of
  injection sinks (#105 found zero …), so the policy's real subject is the 1.6 MB of
  third-party bundle".
- ADR 0021 admits the second half itself, under "Consequences": "**The CSP's runtime
  compatibility with the renderer has no standing gate.** It was established by execution for
  this change and nothing re-establishes it." Confirmed: `tests/browser/playwright.config.ts`
  serves through `tests/browser/vite.config.ts`, which loads no Cloudflare plugin and applies
  no `_headers`.

Why it matters concretely. Two different regressions ship green. A future HUD panel that
reaches for `innerHTML` with a save-derived room or prisoner name turns the CSP's
`script-src 'self'` into the only barrier — and `'self'` does not stop injected markup from
loading the app's own bundle or from exfiltrating via `img-src 'self' data: blob:`. And a
Phaser upgrade that begins needing `'unsafe-eval'`, or a Vite change that emits a `blob:`
worker, passes every check in the repository and produces a blank page in production.

Recommended fix. (1) Add a `dom-sink-contract.test.ts` under `tests/foundation/` in the existing style:
sweep `src/**/*.ts` for the sink list and fail with an explanation, with an explicit
allow-list of nothing. This is the same reverse-inclusion trick the header contract already
uses. (2) Add a browser job that builds `dist` and drives `vite preview` through the
Cloudflare plugin, asserting zero uncaught CSP violations besides Zod's known probe — ADR 0021
already specifies exactly this job.

---

## SEC-07 — `provision-supabase-cli.sh` installs an unverified downloaded binary as root, inside the workflow holding the Supabase credentials

**Severity: Low. CONFIRMED.**

Evidence — `scripts/provision-supabase-cli.sh`:

- `:18` — `REQUIRED_VERSION="${SUPABASE_CLI_VERSION:-2.115.0}"` (version pinned, but
  overridable from the environment)
- `:39-44` — downloads `https://github.com/supabase/cli/releases/download/v${REQUIRED_VERSION}/supabase_linux_${arch}.tar.gz` with `curl --fail --location --retry 3`
- `:45-51` — untars and `sudo install -m 0755 … /usr/local/bin/supabase` with **no checksum,
  no signature and no size check**
- `.github/workflows/migrate-database.yml:106` runs it, and `:128-145` of the same job hold
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` and then run
  `supabase db push` against the production project.

Why it matters concretely. A GitHub release asset is mutable by whoever controls the upstream
repository or account; the pinned *tag* does not pin the *bytes*. A replaced asset gets root
on a persistent self-hosted runner and, one step later, is handed the credentials that can
rewrite the production database schema. The contrast with the project's own policy is the
point: `docs/DEPENDENCY_POLICY.md` requires exact versions and a committed
`pnpm-lock.yaml` (196 `integrity:` entries), and this is the one binary in the pipeline with
neither. `scripts/provision-postgres.sh` and `provision-git-lfs.sh` are clean by comparison —
they use distro `apt-get` only, with no added repository or key
(`grep -n "sources.list\|apt-key\|add-apt" ` returns nothing).

Recommended fix. Pin the SHA-256 of the tarball next to the version and verify it before
extracting (`sha256sum -c`), and refuse to run if `SUPABASE_CLI_VERSION` is set without a
matching pinned digest. Upstream publishes checksums with each release, so this is a two-line
change plus a digest that a reviewer updates alongside the version — the same discipline the
lockfile already applies to everything else.

---

## SEC-08 — `create_prison()` leaks prison-UUID existence through `23505`

**Severity: Low. CONFIRMED.**

Evidence — `supabase/migrations/20260823100000_bound_free_tier_capacity.sql`:

- `:267-271` — the signature takes a caller-supplied `p_prison_id uuid`.
- `:318-321` — the only existence probe is on `(owner_id, slot_index)`; nothing checks whether
  `p_prison_id` is already taken.
- `:323-325` — `insert into public.prisons (id, …) values (coalesce(p_prison_id, gen_random_uuid()), …)`.

Why it matters concretely. Passing another account's prison id returns
`23505 duplicate key value violates unique constraint "prisons_pkey"`, while an unused id
returns `status = 'created'`. That is a boolean existence oracle for arbitrary prison UUIDs,
available to any anonymous identity — the same class of leak
`20260824110100_close_challenge_definition_oracle.sql` was written to close for challenge
definitions ("two different answers, so a caller that cannot see a row can still ask whether
it exists"). Practical impact is small because `gen_random_uuid()` v4 ids are not guessable and
the oracle reveals only existence, but the asymmetry is real, and the probe leaves a committed
row behind on a miss (consuming one of the prober's own slots), which is its own noisy
side effect.

Recommended fix. Make the collision a discriminated status rather than an exception —
`create_prison` already returns `'slot_taken'`, so `'prison_id_taken'` (with a null id, matching
the `conflict` shape `submit_challenge_evidence` uses) is the established answer — or, better,
drop `p_prison_id` and let the server allocate, returning the id it chose. Note that
`SupabaseCloudSaveClient.uploadVersion`'s exhaustive `switch` over the status union
(`src/persistence/cloud/supabase-client.ts:141-150`) means adding a status is a typed change,
not a silent one, which is the good version of this problem.

---

## SEC-09 — DoS-by-save: unbounded array counts and an unbounded import read

**Severity: Low. CONFIRMED.**

Evidence:

- `src/persistence/save-schema.ts:144` — `chunks: z.array(serializedChunkStateSchema)`, with
  **no** `.max()`. The *per-chunk* allocation is correctly bounded (`:142`,
  `chunkSize … .max(WORLD_CHUNK_SIZE_LIMIT)` = 64, and `src/simulation/world/coordinates.ts:71`
  enforces it again inside `SparseWorld.fromSnapshot`), so each chunk costs four 64×64 byte
  planes = 16 KiB. The *count* is unbounded.
- Same pattern at `:88-89` (`rngStates`, `commands`), `:143` (`ownedChunks`), `:503`
  (`roomInstanceOccupancy`) and many peers.
- `src/ui/save-panel.ts:752` — `text = await file.text();` with no prior size check on the
  chosen file, so the whole file becomes one JS string before any schema runs.
- The bounded counterexample, for contrast: `entityStoreSnapshotV2Schema`
  (`src/persistence/save-schema.ts:246-286`) caps `capacity` at `0xf_ffff` and its
  `superRefine` requires the RLE runs to cover exactly that, so the entity plane *is* bounded.
  The world plane is not.

Why it matters concretely. A minimal chunk object is ~90 bytes of JSON and costs 16 KiB of
`Uint8Array` on restore — roughly 180× amplification. A ~25 MB crafted `.lockstate.json`
therefore asks for several GB and terminates the tab. The reachable paths are the Import
control (a file the player chose — so this is realistically a *shared save file*, which is a
normal thing in a management game) and a cloud pull, which RLS confines to the owner's own
account. Nothing is corrupted: `decodeSaveEnvelope` runs before any write, and the checksum,
schema and migration chain all hold. The impact is a crash, not a compromise — which is why
this is Low and not higher.

Recommended fix. Put a `.max()` on the collection schemas that drive allocation — `chunks`
above all, plus `commands`, `ownedChunks` and `roomInstanceOccupancy` — derived from the
largest world the game can actually produce, in the same spirit as
`docs/adr/0013`'s per-row byte bound. Add a byte ceiling on the import file before `file.text()`
(`file.size` is available on a real `File`; the `SavePanelImportFile` port at
`src/ui/save-panel.ts:306-308` would gain a `size` member), and reuse
`max_save_payload_bytes()`'s 4 MiB figure so local and cloud agree.

---

## SEC-10 — Email/password auth is configured weak-by-default

**Severity: Low. CONFIRMED. Latent — no code uses this path.**

Evidence — `supabase/config.toml`:

- `:260` — `enable_confirmations = false`: an email address is never proven.
- `:216` — `minimum_password_length = 6`; `:219` — `password_requirements = ""`.
- `:262` — `secure_password_change = false`: no reauthentication to change a password.
- `:203`/`:255` — signups enabled.
- `[auth.mfa.totp]` at `:336-338` — both `enroll_enabled` and `verify_enabled` are `false`.

Why it matters concretely. Nothing uses it today — there is no auth code in `src/` at all
(SEC-13) — and `:174-178` records that "the client's only sign-in path is anonymous sign-in".
But this file is the repository's statement of intended auth configuration, and it is the file
someone will copy into the hosted project's settings. With confirmations off, the first person
to type someone else's address owns that identity; with a 6-character minimum and no
complexity rule, an account that later carries a purchased entitlement is guessable; and with
`secure_password_change = false`, a stolen session is a permanent takeover. The anonymous
identity model makes this worse rather than better, because the documented upgrade path
(`:206-211`, `linkIdentity`/`updateUser` keeping the same id) turns an unverified email into
the durable owner of an existing prison and its entitlements.

Recommended fix. Decide these before the auth wiring lands, not after: turn
`enable_confirmations` on, raise `minimum_password_length` to at least 10 with
`password_requirements = "lower_upper_letters_digits"`, set `secure_password_change = true`,
and — if `enable_signup` for email is not needed at all while anonymous is the only path —
set `[auth.email] enable_signup = false` so the surface does not exist yet.

---

## SEC-11 — `delete-branches.yml` uses a floating action tag with `contents: write`

**Severity: Low. CONFIRMED.**

Evidence — `.github/workflows/delete-branches.yml`:

- `:6-7` — `permissions: contents: write`
- `:14` — `uses: actions/checkout@v4` — a mutable tag, with no `persist-credentials: false`,
  where every other workflow in the repository pins
  `actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6`
  (`ci.yml:33`, `:179`, `:299`; `deploy.yml:128`, `:258`; `migrate-database.yml:69`;
  `version.yml:176`) and sets `persist-credentials: false` everywhere except the one place
  that documents why not (`version.yml:184-186`).
- `:32` — `run: bash deletebranches.sh`, and `deletebranches.sh:11-44` is a hard-coded
  `git push origin --delete` of 33 named branches — a script whose work was done once, in
  August 2026, and which is still wired to a `contents: write` workflow.

Why it matters concretely. A mutable tag is a supply-chain hole by definition: `v4` is
repointable by the action's publisher. Here it is paired with repository write access and a
retained credential. The blast radius is branch deletion (all branches named in the script are
already gone, so a re-run is a no-op today), but the token is `contents: write` and the
checkout keeps it.

Recommended fix. Pin the SHA like every sibling workflow, add
`persist-credentials: false` (the script pushes with the ambient `GITHUB_TOKEN`, and if it
needs the checkout credential, say so where the exception is made), and delete the workflow and
`deletebranches.sh` outright — a one-off cleanup script from three months ago is not a standing
capability worth keeping armed. Add the pinning rule to
`tests/foundation/ci-configuration-contract.test.ts`, which is where the repository already
pins workflow facts.

---

## SEC-12 — No dependency-vulnerability or secret scanning in CI

**Severity: Low. CONFIRMED.**

Evidence:

- `ls -a .github/` — only `ISSUE_TEMPLATE/` and `workflows/`. No `dependabot.yml`.
- `grep -rn "pnpm audit\|npm audit\|dependabot\|codeql\|osv" .github package.json docs/DEPENDENCY_POLICY.md` — zero matches.
- `docs/DEPENDENCY_POLICY.md`, "Upgrade process", is entirely manual: "Read release notes and
  migration guidance for every direct dependency being changed", and "Emergency security
  updates may be expedited".

Why it matters concretely. The dependency surface is admirably small — three runtime
dependencies (`@supabase/supabase-js`, `phaser`, `zod`) and eight dev — all exactly pinned,
with build scripts denied except `esbuild` and `workerd`
(`pnpm-workspace.yaml`). But "emergency security updates" presupposes something tells you an
advisory exists, and nothing in this repository does. Phaser 4.2.1 is 1.6 MB of code that
ADR 0021 itself calls "unaudited"; `@supabase/supabase-js` pulls five sub-packages
(`pnpm-lock.yaml:1470-1476`) that will one day handle a real JWT.

Recommended fix. Add a scheduled workflow running `pnpm audit --audit-level=high` (advisory
only at first, so it does not block merges on an unfixable transitive), plus Dependabot
security updates scoped to `security-updates-only` so it cannot open version-bump PRs that
`--frozen-lockfile` would then reject. Both are consistent with the policy's "Automated
dependency update tools may open pull requests; they may not merge changes".

---

## SEC-13 — The auth/session lifecycle does not exist yet

**Severity: Info. CONFIRMED.**

Evidence:

- `grep -rn "createClient\|signInAnonymously\|signOut\|getSession\|persistSession\|storageKey" src/` — **zero** matches. `src/persistence/cloud/supabase-client.ts:1` imports
  `SupabaseClient` as a *type* only and `:60` takes one by constructor injection.
- `grep -rn "import.meta.env" src/` — zero matches, so the `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY` that `scripts/check-deploy-secrets.sh:74-79` *requires* for
  every deployment are inlined nowhere and read by nothing.
- The only sign-out-shaped code in the repository is
  `src/services/entitlements/projection.ts:192-194`, `clearCachedEntitlementProjection`, which
  has no caller.
- `public/_headers` — `connect-src 'self'`, which ADR 0021 flags as latent breakage #1.

Why this is in the report at all. Everything an auditor would normally check here — where the
JWT lives, whether sign-out clears it, whether the refresh token survives a tab close, whether
the anonymous-to-real upgrade re-scopes local caches — is an open decision, and the defaults
will decide it if nobody does. `@supabase/supabase-js` defaults to `persistSession: true` with
the session (access **and** refresh token) in `localStorage`, readable by any script on the
origin; the CSP is strong enough that "any script on the origin" is currently a narrow set, but
SEC-06 is what keeps it that way. And the sign-out path has to clear three things that live in
three different stores today: the Supabase session, the entitlement projection
(`lockstate.entitlements.projection`), and the telemetry consent decision
(`lockstate.telemetry.consent`) — the last of which arguably should *not* be cleared, since
consent is per-device rather than per-account.

Recommended fix. When cloud save is wired: decide token storage explicitly (and write it
down — this repository's habit of recording the decision beside the code is exactly right
here); write one `signOut()` that clears the Supabase session *and* calls
`clearCachedEntitlementProjection`, with a test that asserts no `lockstate.*` key survives
except consent; and widen `connect-src` to the exact Supabase project origin, never to `*`.
The `_headers` file and ADR 0021's "Latent consequences" §1 already say who owns that line.

---

## SEC-14 — `prisons.slot_index` is client-writable with only a lower bound

**Severity: Low. CONFIRMED.**

Evidence:

- `supabase/migrations/20260826130000_server_stamp_updated_at.sql:185-186` — the current grant:
  `grant update (display_name, game_version, slot_index) on public.prisons to authenticated;`
- `supabase/migrations/20260822190100_create_prisons.sql:16` — the only constraint:
  `constraint prisons_slot_index_positive check (slot_index >= 0)`
- `supabase/tests/008_scalar_column_constraint_coverage.test.sql:69` declares it covered as a
  `range-check`, and the suite's own header (`:35-38`) is honest that it asserts *coverage*,
  "not that any bound is the right number".

Why it matters concretely. An `integer` with no upper bound means a client can set
`slot_index = 2147483647` on its own row. Today nothing consumes it as a bound —
`grep -rn "slotIndex" src/` finds only pass-through in the cloud client — so the impact is a
nonsense value in the owner's own row. It becomes live the moment a slot picker iterates
`0..max(slot_index)` or an array is sized from it, which is the natural way to build that UI.

Recommended fix. `check (slot_index >= 0 and slot_index < public.max_save_slot_capacity())` —
the ceiling already exists as a function, and using it keeps the number in one place, which is
the convention the rest of this schema follows.

---

## SEC-15 — Self-hosted runners execute same-repo PR code in a reused workspace holding a credential

**Severity: Low. SUSPECTED.**

Evidence:

- `.github/workflows/ci.yml:29`, `:160`, `:295` — every job runs on
  `[self-hosted, Linux, X64, wsl2]`, and `ci.yml:163-177` and `:284-293` state plainly that
  "a self-hosted runner keeps its workspace between jobs" and that the workspace is "already at
  the target commit from the `verify` job".
- `.github/workflows/ci.yml:196-206` and `:317-328` write the LFS credential into that reused
  workspace: `git config --local 'http.https://github.com/.extraheader' "AUTHORIZATION: basic
  $(printf 'x-access-token:%s' "$LFS_TOKEN" | base64 -w0)"`, with a `trap cleanup EXIT` that
  unsets it.
- `ci.yml:6` — the workflow triggers on `pull_request`, and the fork guard at `:28` means
  same-repo PRs *do* run. So arbitrary PR-authored code (a test, a build script, a
  `vite.config.ts` plugin) executes on the runner host.

Why it matters concretely. The trap is the right shape, and a trap is not a guarantee: it does
not run on `SIGKILL`, on a runner crash, or on a workflow cancellation that hard-kills the step —
and `deploy.yml`'s own concurrency comment (`:60-64`) is careful to say partial-cancellation
behaviour is "unknown, which is not the same as safe". A `.git/config` left holding
`x-access-token:<token>` in a workspace that the next job (and the next PR) reuses is readable
by any code that job runs. The token is a job-scoped `GITHUB_TOKEN` with `contents: read`, so
the leak is bounded to repository read on a private repository — real, but small.

I am marking this SUSPECTED because whether two jobs from different workflows can share one
workspace concurrently on this runner is a runner-configuration fact I cannot read from the
repository.

Recommended fix. Prefer `git -c http.https://github.com/.extraheader=…` for the single
`git lfs pull` invocation over `git config --local`, so nothing is ever written to disk. If the
config form must stay, run the cleanup in an `if: always()` step as well as the trap.

---

## SEC-16 — Telemetry session id is derived from `Math.random()`

**Severity: Info. CONFIRMED.**

`src/services/telemetry/diagnostics.ts:112-115` — `createTelemetrySessionId(random = Math.random)`
composes two 32-bit draws. The id is a correlation handle, not a secret, and ADR 0010 requires
exactly what this does (rotating, never persisted, never derived from the account id), so there
is no confidentiality claim to break. Worth one line only because `crypto.getRandomValues` is
free here and removes the question entirely; `Math.random` is also seeded per-realm in ways
that can, in principle, correlate two ids created close together — which is the one property
this id is supposed not to have.

---

## What is genuinely solid here

This is, with real qualification, one of the better-reasoned security postures I have audited
in a project this size. Specifically:

- **No secret reaches the client, and it is checked twice.**
  `scripts/check-deploy-secrets.sh` sweeps the *class* of `VITE_`-prefixed variables via
  `compgen -v` rather than a name list (`:161-176`), then scans the built artefact for
  `sb_secret_`/`sbp_`/`service_role`/PEM blocks and decodes every JWT-shaped string in `dist/`
  to read its role claim (`:200-222`) — and prints no part of any value. It also catches the
  route that bypasses `VITE_` entirely: a non-public credential appearing in the artefact by
  any means (`:226-255`). Both modes run in `deploy.yml` before and after the build. A grep of
  the whole repository for `supabase.co`, `eyJhbGciOi`, `sb_secret_` and `sbp_` finds nothing
  but this script and its documentation.
- **The CSP is real, measured, and gated by execution.** `public/_headers` carries nine
  security headers including `default-src 'none'` with no `'unsafe-eval'`, and ADR 0021 records
  each allowance traced to a *named line* in Phaser's loader rather than attributed to "Phaser".
  `scripts/verify-deployment-preview.mjs:46-59` asserts the exact values against a real workerd
  response, `ci.yml:97` runs it, and
  `tests/foundation/ci-configuration-contract.test.ts:244-303` asserts the *reverse* inclusion
  so a header added to `_headers` and checked nowhere fails. Removing a header from both places
  in one change still fails. That is a genuinely complete gate, and it is rare.
- **The SQL tier is the most carefully built part of the system.** RLS is enabled on every
  table *and* swept for (`003_data_api_grants.test.sql:258-264`). Every grant is
  revoke-then-grant and per column where it matters, with the reason PostgreSQL cannot subtract
  a column privilege from a table grant written out three separate times. Every `SECURITY
  DEFINER` function pins `search_path = public, pg_temp` with `pg_temp` last, performs its own
  `auth.uid()` check with `IS DISTINCT FROM` so a null subject fails closed, and takes a
  per-key advisory lock rather than racing a "look, then insert". The entitlement ledger is
  append-only against the table owner, `TRUNCATE`/`REFERENCES`/`TRIGGER`/`MAINTAIN` are revoked
  from all three Data API roles *and* from `ALTER DEFAULT PRIVILEGES` so the next table starts
  closed, and the challenge dedup key is a stored generated column the caller cannot supply.
  Several of these exist because a previous audit demonstrated the hole by execution and the
  migration header records the transcript.
- **Untrusted input is validated at every boundary, with the right nuance.** Both directions of
  the worker protocol are Zod-parsed (`src/simulation/protocol/decode.ts:136-157`), a malformed
  message is a *recoverable* fault rather than a session-ending one, and the decoder provably
  touches no simulation state before rejecting. Saves are schema-parsed per declared version,
  migrated one version at a time with the output re-validated against the destination schema,
  and checksum-verified against the payload *as written* rather than as migrated. The
  `TrustedSaveEnvelope` brand is backed by a module-private `WeakSet` so a cast cannot forge
  it and the failure mode is "validate anyway". `isJsonValue` rejects cycles, non-finite
  numbers, symbol keys, getters and depth over 64. `detachedJsonValueSchema` clones the one
  `z.custom` field that Zod returns by reference — a subtle aliasing bug found and fixed with
  the perf measurement that justified where the clone lives.
- **No injection sink and no dynamic attribute name anywhere in `src/`.** All UI text is
  `textContent`; every `setAttribute` name is a literal.
- **The client-trust boundary is respected where it is implemented.** The entitlement
  projection is clamped on load, expires, degrades only downward, and rejects a
  future-dated cache (`src/services/entitlements/projection.ts:101-122`). The challenge
  pipeline never reads the claimed score for anything but contradiction, ranks the replay's
  metrics, and compares the claimed evidence hash it once ignored. Nothing signs anything in
  the browser — signatures run only server→client.
- **CI/CD hygiene is above average.** `permissions: contents: read` at the top of every
  workflow but the one that pushes, `persist-credentials: false` on every checkout but that
  one (with the exception documented in the diff that introduced it), SHA-pinned actions,
  no `pull_request_target`, and no `${{ github.event.* }}` free-form value interpolated into a
  `run:` block anywhere — `migrate-database.yml:114` correctly passes the operator's typed
  string through `env:` and compares it in the shell.
- **Telemetry is conservative by construction and honest about being unwired.** Consent
  defaults to all-false including diagnostics, is versioned so a wider policy re-asks,
  redaction runs unconditionally after validation with the value patterns enumerable by a test,
  crash stacks are reduced to a basename, and ADR 0010 states plainly that no `record()` call
  exists yet and that wiring the first one is the moment consent must be obtained.

The recurring quality is that this repository writes down what a control does *not* cover.
That habit is why most of the findings above are latent rather than live, and it is also why
they are findings: the pattern of "correct today, wrong at the commit that wires it" is the
one this project keeps rediscovering, and SEC-01, SEC-05 and SEC-06 are three more instances
of it.

---

## Prioritized top 5

1. **SEC-01** — Add `workflow_run.event == 'push'` and
   `workflow_run.head_repository.full_name == github.repository` to `deploy.yml:114`, and pin
   it in the CI configuration contract. This is the only finding whose worst case is arbitrary
   attacker code served from `lockstate.io`, and the fix is two expression clauses.
2. **SEC-05** — Recreate `challenge_leaderboard` `with (security_invoker = true)`, and add a
   view-rights sweep to `supabase/tests/003_data_api_grants.test.sql`. Do it *before* ADR 0009's
   gate 4 is answered, because the grant that answers it is the grant that opens the bypass.
3. **SEC-02 + SEC-03 + SEC-04 together** — The storage/cost surface is one problem with three
   doors: enable a CAPTCHA on anonymous sign-in, land ADR 0013 §6's revision pruner, and add a
   per-account submission cap to `challenge_submissions` before the first challenge definition
   is published. Any one alone leaves the other two open.
4. **SEC-06** — Add a `dom-sink-contract.test.ts` under `tests/foundation/` and the `_headers`-applying
   browser job ADR 0021 already specifies. Both are small, and both convert a property that is
   currently true by luck into one that stays true by construction — which is the standard the
   rest of this repository holds itself to.
5. **SEC-07 + SEC-11 + SEC-12** — Supply chain: verify the Supabase CLI tarball's SHA-256, pin
   (or delete) `delete-branches.yml`, and add advisory-only `pnpm audit` plus Dependabot
   security updates. Individually minor; collectively they close the gap between
   `docs/DEPENDENCY_POLICY.md`'s stated discipline and what the pipeline actually enforces.
