# Cloudflare Workers Static Assets deployment

## Contract

Lockstate is delivered as an assets-only Cloudflare Worker through the official Cloudflare Vite plugin. The browser simulation remains client-side. No Node.js or PHP application server is required in production, and a server-side Worker entry point must not be added merely to serve the SPA.

Repository sources of truth:

- `wrangler.jsonc` defines Cloudflare environments, routing and SPA fallback.
- `vite.config.ts` enables `@cloudflare/vite-plugin` and disables public browser source maps.
- `public/_headers` defines the browser security and cache policy.
- `scripts/` contains cross-platform build, dry-run and smoke-test gates.

The Vite plugin creates a generated, flattened Wrangler configuration during `vite build`, including the actual client asset directory. Preview and deployment use that generated configuration through `.wrangler/deploy/config.json`. Do not hard-code `assets.directory` in the input configuration and do not commit `dist/` or `.wrangler/`.

## Environments

| Purpose | Cloudflare environment | Worker name | Public routing |
| --- | --- | --- | --- |
| Local development | top-level | `lockstate-development` | local Vite/workerd only unless deliberately deployed |
| Staging | `staging` | `lockstate-staging` | `workers.dev` and version preview URLs enabled |
| Production | `production` | `lockstate` | Custom Domain `lockstate.io`; `workers.dev` and preview URLs disabled |

The Cloudflare Vite plugin selects an environment at **build time** through `CLOUDFLARE_ENV`. Supplying an environment only to `vite preview` or a later `wrangler deploy` cannot change a configuration that was already flattened by the build. Repository scripts set the same environment for the build and every following Wrangler command.

## Local development

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` uses the top-level development environment and the Workers runtime provided by the Vite plugin.

Run all repository and deployment gates without Cloudflare credentials:

```bash
pnpm verify
pnpm verify:deployment
```

`verify:deployment` performs production and staging builds, validates generated configuration, runs Wrangler dry-runs, and starts a local production-like preview. The smoke test verifies:

- `/` returns the Lockstate SPA shell;
- a direct deep route falls back to the same shell;
- HTML requires revalidation;
- security headers are present;
- a fingerprinted `/assets/*` file receives a one-year immutable browser cache policy;
- no public source map is included in deployable assets.

## Build and preview

Production:

```bash
pnpm build
pnpm preview
```

Build and open a fresh production preview in one command:

```bash
pnpm preview:production
```

Staging:

```bash
pnpm build:staging
pnpm preview
```

Or:

```bash
pnpm preview:staging
```

Dry-run packages:

```bash
pnpm deploy:dry-run:staging
pnpm deploy:dry-run:production
```

Dry-runs validate the generated deployment package and write ignored output below `.wrangler/dry-run/` without publishing it.

## Deployment

Staging:

```bash
pnpm deploy:staging
```

Production deployment is intentionally guarded. After staging and browser verification:

```bash
LOCKSTATE_PRODUCTION_DEPLOY=1 pnpm deploy:production
```

PowerShell:

```powershell
$env:LOCKSTATE_PRODUCTION_DEPLOY = '1'
pnpm deploy:production
```

Wrangler credentials must be supplied by the operator or by the protected release workflow `.github/workflows/deploy.yml`, which reads them from GitHub Environment secrets — normally through `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use a least-privileged token. Never store Cloudflare tokens, Supabase service-role keys or production secrets in the repository, frontend bundle, issue text or logs.

Ordinary CI (`.github/workflows/ci.yml`) validates packages but does not publish. Publishing is `.github/workflows/deploy.yml` — see "Automated deployment" below.

## Automated deployment

| What | When | Gate |
| --- | --- | --- |
| Frontend → Cloudflare **staging** | automatically, on every merge to `main` | none |
| Frontend → Cloudflare **production** | manual dispatch only | `production` environment approval |
| Migrations → Supabase **staging** | automatically, on every merge to `main`, through Supabase's own GitHub integration | none |
| Migrations → Supabase **production** | manual dispatch of `migrate-database.yml` | environment approval **and** a typed project ref |

**A merge to `main` can now change a hosted database.** That is a recent and deliberate change, and it inverts what this table said until 2026-08-23, so it is worth being precise about what is known.

The mechanism is not in this repository. Supabase's GitHub integration is configured in Supabase's own dashboard with a production branch of `main`; nothing here can see it, and no workflow in `.github/workflows/` runs `supabase db push` on a push. What was observed on 2026-08-23:

| Time (UTC) | Event | `supabase migration list` |
| --- | --- | --- |
| 18:42:10 | `migrate-database.yml` run `32658871514`, dry run | nine local migrations, **`Remote` empty for every one** |
| 18:44:14 | PR #87 merged to `main` | — |
| 18:45:25 | `migrate-database.yml` run `32659046172`, dry run | **`Remote` populated for all nine**, matching `Local` |

`migrate-database.yml` has three runs in its entire history — one that failed at `Link the project` before reaching the database, and the two above. All three are `workflow_dispatch`; in both successful ones the `Apply migrations` step was skipped, because neither ran with `dry_run` unchecked. So the nine migrations went from unapplied to applied inside a 71-second window containing a merge, and no GitHub Actions run applied them. **Inferred, not proven from here:** that the integration specifically did it. It is the only configured mechanism that does this, and it had been enabled minutes earlier; a hand-applied `supabase db push` in that window is excluded by the absence of any reason to think so, not by the evidence.

**Read that row as "on every merge", not "when migration files change".** PR #87 touched `deploy.yml`, this document and an ADR — no file under `supabase/migrations/` — and the migrations were applied anyway. The integration applies whatever is *pending* on a push to the configured branch. A pull request that changes nothing about the schema still triggers the apply; a merge is the trigger, not the diff.

The reasoning that put migrations in their own workflow has not changed, and is what keeps production out of the arrangement above: `supabase db push` is irreversible, rollback is not automated (see "Rollback"), and attaching it to a merge means any pull request can alter a database as a side effect of being merged. That is tolerable for a disposable project holding no player data and intolerable for one that does — which is why `migrate-database.yml` remains the only path to production, gated by environment approval and a typed project ref, and why the integration must never be repointed at a production project. [ADR 0016](./adr/0016-migration-delivery-mechanism.md) argues that split and asks a reviewer to accept it; it is **Proposed, not accepted**, so it records the open decision rather than sanctioning what the table above describes.

### What currently serves lockstate.io

**One Worker, not two.** `lockstate.io` is served by **`lockstate-staging`** — the Worker the `staging` job deploys — through a Custom Domain attached by hand in the Cloudflare dashboard. Production and staging are the same thing for now, by the owner's decision.

Two consequences follow, and the second is a trap:

- **A merge to `main` already updates the public site.** The `staging` job runs on every push to `main`, so `lockstate.io` tracks `main` with no further configuration. Nothing needs to be enabled for that to happen; it is happening.
- **Dispatching the `production` job would silently take the domain away.** A Workers Custom Domain is an account-scoped record with exactly one owner. `wrangler.jsonc` declares `lockstate.io` under `env.production`, whose Worker is named `lockstate` — a Worker that has never been deployed. Running that job transfers the live domain onto it, and wrangler does not warn. Do not dispatch it until production is genuinely meant to take over, and expect a few seconds of the site serving a freshly-created Worker when you do.

Staging deploys cannot damage the arrangement: `routes` appears only under `env.production` in `wrangler.jsonc`, never at the top level, so the staging environment neither inherits it nor manages any route. Wrangler leaves routes it was not told about alone.

The domain is therefore **not reproducible from this repository** — it exists because someone clicked "Add Domain". Nothing here can confirm that binding either: this document and `deploy.yml`'s comments record it, but only Cloudflare → Workers → `lockstate-staging` → Settings → Domains & Routes shows the live state, so re-check it there before acting on anything below that depends on it. Moving it into configuration is the right fix when production and staging stop being the same thing.

The production job re-runs `pnpm verify` against the exact commit being shipped. CI having passed on `main` earlier is a statement about a different moment.

### Credentials

Put every value into **GitHub Environment secrets** directly, under Settings → Environments. No token should pass through a message, a file, a commit or an issue — GitHub masks environment secrets in logs; a chat transcript does not.

Create environments `staging` and `production`, and give `production` **required reviewers**. That approval, not the workflow's `if:` condition, is what actually stops an unattended production deploy.

The two environments do **not** take the same set. `deploy.yml` reads four values; `migrate-database.yml` reads three others:

| Secret | `staging` | `production` |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | yes |
| `CLOUDFLARE_ACCOUNT_ID` | yes | yes |
| `VITE_SUPABASE_URL` | yes | yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | yes |
| `SUPABASE_PROJECT_REF` | yes | **deliberately absent** |
| `SUPABASE_ACCESS_TOKEN` | yes | **deliberately absent** |
| `SUPABASE_DB_PASSWORD` | yes | **deliberately absent** |

The three migration secrets stay out of `production` until a distinct production Supabase project exists (ADR 0016 §2). Copying the staging values across would be worse than omitting them: `migrate-database.yml` compares the project ref you type against that secret, so a confirmation you believe means "yes, production" would compare true against the *staging* ref and apply the migration there. With the secret absent the workflow fails instead, which is the right answer to "migrate production" while no production database exists.

Where the values come from:

| Secret | What it is | Where |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | scoped API token, **not** the Global API Key | Cloudflare → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | account identifier | Workers overview, or the dashboard URL |
| `VITE_SUPABASE_URL` | project URL | Supabase → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **publishable/anon** key | same page |
| `SUPABASE_ACCESS_TOKEN` | personal access token | Supabase → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | project ref | Supabase → Project Settings → General |
| `SUPABASE_DB_PASSWORD` | database password | set when the project was created |

Scope the Cloudflare token to `Account → Workers Scripts → Edit` for the one account. The Global API Key authenticates everything the Cloudflare login can do, including DNS and billing, and cannot be scoped or rotated independently.

### Why `VITE_` is the dangerous prefix

Everything named `VITE_*` is **inlined into the browser bundle** by Vite and published to every visitor. That is correct and intended for `VITE_SUPABASE_PUBLISHABLE_KEY`, which is designed to be public and is useless without a JWT identity behind it.

It is catastrophic for a secret / service-role key. `AGENTS.md` forbids service-role keys in client code, ADR 0008 classifies the browser as an untrusted zone, and issue #20's real-stack verification established that `service_role` bypasses RLS entirely — a published one hands every visitor every row.

`scripts/check-deploy-secrets.sh` runs before each deploy and refuses one whose `VITE_SUPABASE_PUBLISHABLE_KEY` looks like a secret key, including a `service_role` JWT, which it detects by decoding only the role claim. It prints no part of any value. A failure there has caught a real mistake.

## Database migrations

The SQL under `supabase/migrations/` has been executed against a local PostgreSQL (`pnpm verify:sql`) and against the local Supabase stack (`supabase test db`, plus `pnpm verify:stack` over real HTTP). **It has also been applied to a hosted project**: as of 2026-08-23 the nine migrations `20260822190000` through `20260823100000` are applied, confirmed by `supabase migration list` through a dry-run of `migrate-database.yml` reporting the same timestamps local and remote. The seven added since — `20260824090000_pin_trigger_function_search_path`, `20260824090100_revoke_client_truncate`, `20260824100000_bind_challenge_evidence_to_payload`, `20260824100100_harden_submit_challenge_evidence`, `20260824110000_generalize_entitlement_idempotency`, `20260824110100_close_challenge_definition_oracle` and `20260824110200_validate_save_version_storage_path`, the SQL-tier hardening for #105 — are **not** applied there yet, so the hosted project still carries the pre-#105 function declarations, the ambient client `TRUNCATE`, the caller-asserted challenge-evidence dedup key, the webhook-only ledger idempotency key and an unvalidated `save_versions.storage_path`. Two of the seven can refuse to apply rather than change a row, which is deliberate: the ledger's new natural-key index if two provider-less `entitlement_events` rows are identical in every recorded field, and the `save_versions_storage_path_shape` CHECK if any row already carries a non-null `storage_path`. Read the dry run before applying, and each migration's header names the query that answers whether the condition holds. That was the `staging` environment — it is the only one carrying `SUPABASE_PROJECT_REF` (see "Credentials" above). The dry run *confirmed* the state; it did not create it. What applied them is covered under "Automated deployment". Target a disposable project first.

Run `migrate-database.yml` with **dry run left checked**: it links the project and prints `supabase migration list` without applying anything. Read that list, then re-run with dry run unchecked.

Before it provisions the Supabase CLI or links anything, the workflow runs `pnpm verify:sql` against a PostgreSQL it provisions locally — applying every migration in order and running the whole pgTAP suite. A migration set that does not apply locally fails the run before it can reach a hosted project. This gate runs for a dry run too: a dry run whose SQL does not apply locally is worth failing. It closes an asymmetry that stood until then, where `deploy.yml` re-ran the whole gate before a *reversible* Worker deploy while this workflow ran no verification at all before an *irreversible* `supabase db push`.

A fresh Supabase project is not empty — its own bootstrap runs before these migrations. That is precisely how issue #20's real-stack verification discovered the platform no longer grants the Data API roles table privileges by default, which had left every RLS policy in this schema unreachable.

Rollback of a migration is **not** automated, and the Worker rollback below does not touch it — see "Rollback".

## Custom-domain prerequisites

Before the first production deployment:

1. The `lockstate.io` zone must be active in the Cloudflare account used by Wrangler.
2. The deployment token must be permitted to update the Worker and its Custom Domain.
3. `lockstate.io` is already attached — as a Custom Domain on the `lockstate-staging` Worker (see "What currently serves lockstate.io"). Detaching it from that Worker is the first step of the cutover, not a precondition to confirm absent. What still needs confirming is that no *other* conflicting origin or CNAME claims the hostname.
4. Run `pnpm deploy:dry-run:production` before authenticated deployment.
5. After deployment, verify HTTPS, `/`, a deep route and one fingerprinted asset.

Custom Domains match exact hostnames. This foundation intentionally declares only the canonical root hostname `lockstate.io`. Do not attach `www.lockstate.io` to a second Worker. When the canonical-host policy is accepted, create an appropriate proxied DNS record and Cloudflare Redirect Rule from `www` to the root hostname, then document it here.

The `lockstate-staging` Worker keeps its `workers.dev` URL, but it is also the Worker serving the public `lockstate.io` site today, so **Cloudflare Access must not be placed in front of it** while that is true — doing so would gate the public site. Once the `production` Worker has taken the domain over, staging stops being public and should be protected with Cloudflare Access before it holds non-public functionality or user data.

## Cache policy

Cloudflare Static Assets normally sends revalidation-safe HTML and asset headers (`Cache-Control: public, max-age=0, must-revalidate` with an `ETag`). Lockstate preserves revalidation for HTML and SPA fallback responses so new deployments are discovered promptly, and states it rather than relying on the default: `/index.html` carries that same `max-age=0, must-revalidate` explicitly. The `/*` rule sets no cache policy at all: it carries the nine security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`), which `scripts/verify-deployment-preview.mjs` asserts against a real preview response and `tests/foundation/ci-configuration-contract.test.ts` pins as an exact set of names all covered by that verifier. The Content-Security-Policy, HSTS and the cross-origin isolation trio arrived with [ADR-0021](./adr/0021-http-response-security-headers.md), which closes #105 finding 12; read it before widening any directive, because two of them are load-bearing for the renderer — Phaser installs its default textures from `data:` URIs and loads every atlas through a `blob:` URL, so narrowing `img-src` breaks the game rather than hardening it. What no check covers is whether the policy still *lets the renderer run*: the verifier reads headers off a response and never opens a browser, so a Phaser upgrade that began needing `'unsafe-eval'` would pass CI and break production.

Vite emits content-hashed files directly into `/assets/`. `public/_headers` gives those fingerprinted files:

```text
/assets/:file
  Cache-Control: public, max-age=31536000, immutable
```

`:file` matches a single path segment, so that rule deliberately does **not** cover `/assets/actors/*`. Runtime art is published from `public/`, which Vite copies verbatim without fingerprinting, so re-rendering an atlas reuses its URL; that subtree therefore revalidates (`max-age=300, must-revalidate`) rather than inheriting the immutable rule. The sheets under `/game-content/source-art/*` are immutable because their filenames are content-hashed, so their URL changes with their bytes. This is the policy [ADR-0014](./adr/0014-art-storage-and-runtime-asset-delivery.md) records and [ART_PIPELINE.md](./ART_PIPELINE.md) describes.

Overlapping `_headers` rules **concatenate** into a single `Cache-Control` instead of overriding each other, which is why every rule here has to be exclusive of the others. A mutable stable-name file under `/assets/` therefore needs either its own exclusive rule or its own versioned URL and cache contract — that applies to future large game-content manifests, localization bundles and downloadable data packs.

`pnpm verify:deployment` asserts both directions against the workerd preview: `/assets/actors/asset-registry.json` must not be `immutable` and must be `must-revalidate`, a content-hashed `/game-content/source-art/` sheet must be `immutable`, and each must carry exactly one `max-age` (the concatenation bug produced two).

## Release checklist

1. Confirm the release branch is current and CI is green.
2. Run `pnpm install --frozen-lockfile`, `pnpm verify` and `pnpm verify:deployment`.
3. Deploy staging and perform a browser smoke test in a fresh uncached session.
4. Confirm the expected commit and generated asset hashes.
5. Deploy production using the explicit guard variable.
6. Verify `/`, a deep route, security headers and a fingerprinted asset on `lockstate.io`.
7. Record the deployed Worker version ID in release notes.

## Rollback
Every Worker deployment creates a version. List production versions and deployments:

```bash
pnpm exec wrangler versions list --name lockstate
pnpm exec wrangler deployments list --name lockstate
```

Roll back production to a reviewed version:

```bash
pnpm exec wrangler rollback <VERSION_ID> --name lockstate --message "Rollback: <reason>"
```

For staging, use `--name lockstate-staging`. The Cloudflare dashboard provides the same operation under the Worker's **Deployments** page.

A rollback creates a new deployment that points traffic to an earlier Worker version. It restores Worker code, Static Assets, bindings and compatibility settings captured by that version. It does **not** roll back external state in Supabase, KV, R2, D1 or other stores; future schema and data changes need independent recovery procedures.
