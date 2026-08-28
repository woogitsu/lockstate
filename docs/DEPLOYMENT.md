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
- no public source map is included in deployable assets;
- `dist/.assetsignore` lists `wrangler.json` and `.dev.vars`, each on a line of its own;
- `/wrangler.json` is not served — it falls through to the SPA shell.

### The generated Wrangler config is kept off the origin by a file we do not write

`assets.directory` in the generated config is `.`, so Cloudflare serves `dist/`
itself, generated Wrangler config included. The only thing excluding
`wrangler.json` and `.dev.vars` from the public origin is `dist/.assetsignore`,
and **this repository does not own that file**. `@cloudflare/vite-plugin` emits
it during the client build, concatenating any `.assetsignore` file the
repository supplies under `public/` in front of its own two names. (There is no
such file here today, and adding one is not the point of this section — its
possible future existence is the hazard.) The next reader would
otherwise reasonably assume the exclusion comes from configuration here; it does
not, and that is why it is now gated from two sides (issue #439):

- `scripts/verify-cloudflare-build.mjs` reads the built file and requires both
  names, **each on a line of its own**. Presence alone is not enough: the
  plugin's concatenation has no separator, so an `.assetsignore` added under
  `public/` whose last line lacked a trailing newline would fuse it onto the
  first plugin name
  (`…somethingwrangler.json`) and silently un-ignore both. A
  `includes('wrangler.json')` check passes on that exact string.
- `scripts/verify-deployment-preview.mjs` probes `/wrangler.json` against the
  workerd preview and requires the body to **be** the SPA shell. A 404 cannot be
  used as proof of absence here, because `not_found_handling` is
  `single-page-application` and an ignored path answers 200 with the shell.

The two fail for different reasons: the first catches the file going missing or
malformed, the second catches the file being present and the runtime not
honouring it.

`.dev.vars` is deliberately checked only on the build side. This build does not
produce one — CI passes secrets through `env:`
(`scripts/check-deploy-secrets.sh`) — so an HTTP probe of it would answer with
the shell whether or not the exclusion works, and would be green for a reason
unrelated to what it claims.

**What is at stake today, stated plainly.** `dist/wrangler.json` carries the
Worker and environment names, the production route, and the absolute
build-workspace path. It carries **no credentials**. `.dev.vars` would be the
real prize and there is none. So this gate defends a hole that is currently
shut, which is the cheapest moment to build one.

> Correction to issue #439, which named the fusion case "the one worth the
> gate". At `@cloudflare/vite-plugin@1.53.1` that case cannot currently happen:
> the plugin's `readAssetsIgnoreFile` normalises what it reads, appending a
> newline when the content does not end in one, so the missing newline is put
> back before the concatenation. The hazard is real but it is a **regression**
> hazard rather than a live one — it returns the day that normalisation is
> removed or the file is assembled another way. That puts it in the same class
> as the issue's first hazard (a plugin upgrade changing the behaviour), and the
> check covers both without needing to know which.

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

### Build identity

Every build stamps itself with its `package.json` version and the short commit it was made from. One value, resolved once in `tooling/build-identity.mjs` and passed as a Vite `define`, reaches three places that used to hold three unrelated placeholders:

- the badge in the top-left corner of the page (`src/ui/brand-badge.ts`), so a player and a bug report can say which build they are looking at — this is what the whole seam exists for;
- `SaveEnvelope.gameVersion`, so a save names the build that wrote it (`src/main.ts`; it was the literal `lockstate-dev` for every build ever made);
- the simulation worker's `workerBuildId` in its ready handshake (`src/simulation/worker/worker.ts`; it was `dev-build`, under a comment saying it was to be injected "in the future").

The spelling is `lockstate-<version>-<commit>`, joined with `-` and not semver's `+` because both destinations validate it as an `identifierSchema`, which rejects `+`.

Four things an operator needs to know:

- **The version is bumped by CI, one patch per merge, and the tag marks where a version begins.** `.github/workflows/version.yml` runs on every push to `main`, rewrites `package.json`'s `version` to the next patch, commits that one file and tags the commit `v0.0.N`. Before it existed `package.json` sat at `0.0.0` with no tags anywhere, so every build ever made shared a version and only the commit identified anything. Two consequences follow from *when* it runs, and both matter when reading a bug report:
  - The tag is on the commit that **introduces** a version, not on a commit that was built as one. A merge lands as commit A, CI judges A, `deploy.yml` publishes A carrying the *previous* number, and only then does the bump commit go on top. So every build made while `main` sits inside `v0.0.N..v0.0.N+1` reports `0.0.N`, and that range is exactly the work that shipped under it. The commit beside the version on the badge is still the exact answer whenever one is needed.

    That last sentence was **false for every staging deploy** between the seam landing and the commit that added `tests/foundation/build-commit-identity-contract.test.ts`, and it is recorded here rather than quietly repaired: the badge carried a version read out of the tree that was built and a commit read out of `GITHUB_SHA`, which in that job names a different commit. The bullet on the resolution order below has the run and the numbers. It is true again, and it is now the *only* one of these four bullets a test can keep true — which is why it has one.
  - A bump can be **missed**, and never mis-numbered. The workflow retries a rejected push three times, recomputing the next patch from whatever `main` holds, so two bumps racing take two consecutive numbers. If all three attempts are rejected the run fails and that merge gets no bump — one version then covers two merges instead of one. No tag is ever reused and no number is ever published twice; the range simply gets longer.

  Nothing in the build reads a tag. `tooling/build-identity.mjs` reads the `version` *field*, which stays bare semver; the `v` on the tag is there because `v<major>.<minor>.<patch>` is the shape the badge puts on screen (`brand.build` in `src/content/default-locale-en.ts`), so the tag list and the screen spell it the same way.
- **The commit comes from the environment before `git`, and an explicit override before the environment.** `LOCKSTATE_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA` and `GITHUB_SHA` are consulted in that order, then `git rev-parse --short=7 HEAD`. The environment before `git` because a shallow or detached CI checkout still carries the SHA while a hosted build image may have no `.git` at all; `LOCKSTATE_COMMIT_SHA` before both of the others because it is the only one a person sets on purpose. Set it to override.

  **That order is a correction, and the sentence it replaced was false in both halves.** `LOCKSTATE_COMMIT_SHA` used to come *last*, so the override this paragraph promised could not override anything inside GitHub Actions, where `GITHUB_SHA` is always set — executed against the old order, `GITHUB_SHA=2a53baa… LOCKSTATE_COMMIT_SHA=64cd379…` resolved to `2a53baa`. And the ambient value it lost to was the wrong commit in the one job that publishes the site: a `workflow_run` run is not checked out at the commit that triggered it, so `deploy.yml`'s `staging` job takes `ref: github.event.workflow_run.head_sha` deliberately while GitHub sets `GITHUB_SHA` to the default branch's tip. Deploy run `33005151972` (`success`) is the recorded instance — `head_sha` `2a53baa`, `chore(release): v0.0.118`, and a checkout log resolving `ref: 64cd3799e0ab…`, which is `64cd379` and carries `0.0.114`. That deploy built one commit's tree and stamped it with another seven commits on, and the commit it named was the one that had *not* been built. That job now passes `LOCKSTATE_COMMIT_SHA` explicitly, and `tests/foundation/build-commit-identity-contract.test.ts` holds both halves so neither can quietly come back.
- **Nothing fails when it cannot be resolved.** A missing value renders as `unknown` and the build succeeds — a deploy must not break because it ran from a tarball. So `lockstate-unknown-unknown` on screen means the injection did not happen, not that the page is broken, and it is the one thing to look at first if a badge says nothing useful. `tests/browser/app-shell.spec.ts` asserts against it, which is why an unwired `define` fails CI rather than shipping.
- **`PRE-ALPHA` beside the version is authored, not derived.** It is the `brand.stage` entry in `src/content/default-locale-en.ts` and no code computes it. Nothing in the repository declares a release stage, so this string is the claim: **change it by hand when the project's stage changes.** The version and commit next to it cannot go stale in that way; this one can.

Neither value is a secret. Both are baked into a public bundle, and a commit already published in a public repository is not a credential.


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
| Frontend → Cloudflare **staging** | automatically, on every merge to `main` **whose CI concludes `success`** | CI passed on that exact commit, and the CI run was a push from this repository — see "What can publish the staging Worker". A merge whose CI does not conclude `success` is **not** published, and says so — see "When the automatic path does not publish" |
| Frontend → Cloudflare **staging** | by hand, `workflow_dispatch` of `deploy.yml` with `target=staging` | the ref must be `main`, and that is the whole gate: no CI, no approval |
| Frontend → Cloudflare **production** | manual dispatch only | `production` environment approval |
| Migrations → Supabase **staging** | automatically, on every merge to `main`, through Supabase's own GitHub integration | none |
| Migrations → Supabase **production** | manual dispatch of `migrate-database.yml` | environment approval **and** a typed project ref |
| Patch version bump + `v0.0.N` tag on `main` | automatically, on every merge to `main`, from `version.yml` | none |

**A merge to `main` can now change a hosted database.** That is a recent and deliberate change, and it inverts what this table said until 2026-08-23, so it is worth being precise about what is known.

The mechanism is not in this repository. Supabase's GitHub integration is configured in Supabase's own dashboard with a production branch of `main`; nothing here can see it, and no workflow in `.github/workflows/` runs `supabase db push` on a push. What was observed on 2026-08-23:

| Time (UTC) | Event | `supabase migration list` |
| --- | --- | --- |
| 18:42:10 | `migrate-database.yml` run `32658871514`, dry run | nine local migrations, **`Remote` empty for every one** |
| 18:44:14 | PR #87 merged to `main` | — |
| 18:45:25 | `migrate-database.yml` run `32659046172`, dry run | **`Remote` populated for all nine**, matching `Local` |

`migrate-database.yml` has three runs in its entire history — one that failed at `Link the project` before reaching the database, and the two above. All three are `workflow_dispatch`; in both successful ones the `Apply migrations` step was skipped, because neither ran with `dry_run` unchecked. So the nine migrations went from unapplied to applied inside a 71-second window containing a merge, and no GitHub Actions run applied them. **Inferred, not proven from here:** that the integration specifically did it. It is the only configured mechanism that does this, and it had been enabled minutes earlier; a hand-applied `supabase db push` in that window is excluded by the absence of any reason to think so, not by the evidence.

**Read that row as "on every merge", not "when migration files change".** PR #87 touched `deploy.yml`, this document and an ADR — no file under `supabase/migrations/` — and the migrations were applied anyway. The integration applies whatever is *pending* on a push to the configured branch. A pull request that changes nothing about the schema still triggers the apply; a merge is the trigger, not the diff.

The reasoning that put migrations in their own workflow has not changed, and is what keeps production out of the arrangement above: `supabase db push` is irreversible, rollback is not automated (see "Rollback"), and attaching it to a merge means any pull request can alter a database as a side effect of being merged. That is tolerable for a disposable project holding no player data and intolerable for one that does — which is why `migrate-database.yml` remains the only path to production, gated by environment approval and a typed project ref, and why the integration must never be repointed at a production project. [ADR 0016](./adr/0016-migration-delivery-mechanism.md) argues that split and the owner has accepted it; it is **Accepted**, retroactively for the §1 mechanism that was already live, so the arrangement in the table above is approved architecture rather than an open decision. What that acceptance makes binding is §2: production is a separate Supabase project and the integration is never reconfigured to point at it. **Nothing enforces that mechanically** — the ADR says so in terms — so repointing the integration is a two-click dashboard change that would violate an Accepted decision with no trace in this repository.

### What can publish the staging Worker

Exactly the two **staging** rows above, because `deploy.yml`'s `staging` job has one `if:` with two `||` alternatives and nothing else in `.github/workflows/` reaches that Worker. A local `pnpm deploy:staging` does, with operator wrangler credentials — see "Deployment" above; this section is about what the repository's own automation can publish. This section is a restatement of it; the comment above it carries the full argument, and `tests/foundation/ci-configuration-contract.test.ts` pins every term.

**Automatically:** a completed `CI` run whose `conclusion` is `success`, whose `event` is `push`, and whose `head_repository` is this repository, on `main`. The last two terms are about a fork, and neither is implied by the trigger's `branches: [main]`. `ci.yml` triggers on a bare `pull_request`, so a pull request opened from a fork starts a CI run that *belongs to this repository*; `branches:` matches the triggering run's head branch, and a fork names its own branches. The `Checkout` step deliberately takes `workflow_run.head_sha`, so what gets built is the triggering run's commit — the fork's. Before those two terms, the only thing between an unreviewed commit and this Worker was that run's `conclusion`.

**What was not protecting it.** Every job in `ci.yml` carries `github.event.pull_request.head.repo.full_name == github.repository` — three jobs today, and `ci-configuration-contract.test.ts` now requires it of a fourth — so every job of such a run skips. Whether GitHub then reports that run's `conclusion` as `skipped` or as `success` is established by nothing in this repository, and that is the difference between the paragraph above describing something latent and something live. It is not worth settling by experiment, because the terms are right either way: the protection was a property of *another workflow*, uncommented there, that one unguarded job added to `ci.yml` would have flipped with nothing connecting the two files. Both files now state the requirement where it applies.

**By hand:** a `workflow_dispatch` of `deploy.yml` with `target=staging`. It checks out `github.ref` and runs no `pnpm verify` — the `production` job's "Verify before shipping" step has no counterpart in `staging`, because the automatic path's gate is the CI run that triggers it and a dispatch has no triggering run. It is restricted to `main`, so it publishes the branch the automatic path publishes anyway; it still publishes it with no CI result and no approval. Two stronger gates are available and neither is taken here: requiring the dispatched ref's own CI to have passed, and giving the `staging` environment required reviewers the way `production` has them (see "Credentials" — that approval, not an `if:`, is what actually blocks an unattended deploy). Both are the owner's call, not this workflow's.

### When the automatic path does not publish

Read this row of the table as **"on every merge whose CI concludes `success`"**, because the difference is not rare. Over the sixty most recent completed CI runs started by a push to `main` — 2026-08-25T18:08Z to 2026-08-26T19:45Z — thirty-eight concluded `success`, fourteen `failure` and eight `cancelled`. Twenty-two merges in those twenty-six hours were therefore never published as themselves.

**Until #424 that was invisible**, and the invisibility was the defect rather than the redness. When the `staging` guard rejects a run, every job in `deploy.yml` skips, and GitHub reports a run whose every job skipped as `skipped` — no red X, no notification, nothing that distinguishes it from a run with nothing to do. A blocked deploy looked exactly like a slow one. On 2026-08-26 no Deploy run concluded `success` between `32994037499` at 17:25:21 and `33005151972` at 19:26:26 — 2h01m — and seven consecutive runs in between (`32996050125`, `32996093805`, `32997470428`, `33004133740`, `33004481382`, `33005039649`, `33005071431`) all concluded `skipped`. What ended it was a later merge going green by itself, not anyone noticing. One run inside that window, `32996017285`, did publish: its `Deploy to Cloudflare (staging)` step concluded `success` at 17:46:31 and the job was cancelled at 17:46:35, so the run is filed as `cancelled` although the site was updated. So what was continuous across the two hours is the silence, not the staleness.

`deploy.yml`'s **`staging-blocked`** job is the answer, and it is deliberately the smallest one: its guard is the `staging` guard's automatic alternative with `conclusion == 'success'` negated, and all it does is fail. So a blocked deploy concludes `failure` and is reported by the same machinery that reports every other failure — no notification tier, no external service. It fires for `cancelled` as well as `failure`; the reasoning, including why a cancelled CI run on `main` is common and what it usually means, is written above the job.

**Three states, not two, and the third is the normal one.** A commit on `main` can be:

1. **published** — its CI concluded `success` and the `staging` job ran;
2. **blocked** — its CI completed without concluding `success`, so `staging-blocked` failed and said which commit and why;
3. **never judged at all** — no CI run exists for it, so no Deploy run exists either, and nothing is wrong.

State 3 is what `version.yml` produces after every merge. Its bump commit is pushed with the workflow's own `GITHUB_TOKEN`, which starts no workflow run, so `main`'s tip is normally a `chore(release)` commit with no CI run, no Deploy run and no publication of its own — by design, since it differs from the commit CI has just judged by one string. **Any check of the form "has `main`'s current head been deployed?" is therefore permanently false and permanently useless here**, and any check of the form "has the commit that failed been superseded?" has to walk back over the bump commit before it can answer. That is why the signal lives inside the deploy path, where the triggering CI run is in hand, rather than in a watchdog that polls the branch.

**Nothing drains the backlog, and that is the current decision rather than an oversight.** `deploy.yml` triggers on CI *completion*, so a commit whose CI did not pass gets no second attempt: the next merge whose CI passes publishes its own commit and carries the earlier ones along. Making a successful CI run publish `main`'s head instead of its own commit would drain the backlog and would also make what gets published less predictable; #424 records that as a real trade-off wanting an ADR, and it has not been taken. Until it is, the guarantee is only that a gap is now **announced**, not that it closes itself.

**To publish a blocked commit sooner**, either fix `main` and let the next merge carry it, or dispatch this workflow by hand with `target=staging` — which publishes the current tip of `main`, gated by nothing, and so is a different act from re-attempting that commit. See "What can publish the staging Worker" above.

### What currently serves lockstate.io

> **Measured 2026-08-27. The deploy reaches**
> **`https://lockstate-staging.matmaxalez94.workers.dev/`**, and that is the
> URL to open to see the current build. The two paragraphs below describe an
> arrangement that is not in force.
>
> **`lockstate.io` does not receive the deploy, and that is deliberate — the
> owner has it switched off.** It is not a defect and it is not an incident.
> Recorded 2026-08-27, in the owner's words: *"Nikt nie gra, tylko ja znam tę
> domenę. Lockstate.io ma wyłączony deploy, to nie błąd."*
>
> **What the two hosts actually serve**, compared rather than assumed, and kept
> because it is how you can tell at a glance which one you are looking at:
>
> | | `workers.dev` | `lockstate.io` |
> |---|---|---|
> | bundle | `assets/index-ByAs-HH3.js` | `assets/index-CwVFOnxX.js` |
> | `Content-Security-Policy`, `Strict-Transport-Security`, `Cross-Origin-{Opener,Embedder,Resource}-Policy` | present | absent |
> | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | present | present |
>
> The five that differ entered `public/_headers` at `cea6849` (2026-08-24), so
> the domain is pinned to a build from before it. Derive the distance rather
> than trusting a number here: `git rev-list --count cea6849..origin/main`.
>
> Caching is not the explanation — a path that has never existed, answered by
> the SPA fallback, returns from `lockstate.io` without those five headers and
> from `workers.dev` with all of them on the same request. That is worth
> knowing only so nobody re-investigates it: **the difference is the switched
> -off deploy, not a cache and not a header bug.** `public/_headers` is applied
> correctly wherever the current build is published.
>
> **What this does change, and it is the only thing:** a merge to `main`
> publishes to the `workers.dev` host, not to `lockstate.io`. Any sentence
> below or in an ADR that treats a merge as "updating the public site" is
> describing the arrangement, not today. **When the domain is switched back
> on, that stops being true and this note has to go** — the paragraphs below
> are then correct again, which is why they were marked rather than deleted.

**One Worker, not two.** `lockstate.io` is served by **`lockstate-staging`** — the Worker the `staging` job deploys — through a Custom Domain attached by hand in the Cloudflare dashboard. Production and staging are the same thing for now, by the owner's decision.

Two consequences follow, and the second is a trap:

- **A merge to `main` already updates the public site.** The `staging` job runs on every push to `main`, so `lockstate.io` tracks `main` with no further configuration. Nothing needs to be enabled for that to happen; it is happening. **Not in force on 2026-08-27** — the owner has the domain's deploy switched off, so a merge updates `lockstate-staging.matmaxalez94.workers.dev` and `lockstate.io` stays where it is. See the note above; this bullet becomes true again when the domain is switched back on.
- **Dispatching the `production` job would silently take the domain away.** A Workers Custom Domain is an account-scoped record with exactly one owner. `wrangler.jsonc` declares `lockstate.io` under `env.production`, whose Worker is named `lockstate` — a Worker that has never been deployed. Running that job transfers the live domain onto it, and wrangler does not warn. Do not dispatch it until production is genuinely meant to take over, and expect a few seconds of the site serving a freshly-created Worker when you do.

Staging deploys cannot damage the arrangement: `routes` appears only under `env.production` in `wrangler.jsonc`, never at the top level, so the staging environment neither inherits it nor manages any route. Wrangler leaves routes it was not told about alone.

The domain is therefore **not reproducible from this repository** — it exists because someone clicked "Add Domain". Nothing here can confirm that binding either: this document and `deploy.yml`'s comments record it, but only Cloudflare → Workers → `lockstate-staging` → Settings → Domains & Routes shows the live state, so re-check it there before acting on anything below that depends on it. Moving it into configuration is the right fix when production and staging stop being the same thing.

The production job re-runs `pnpm verify` against the exact commit being shipped. CI having passed on `main` earlier is a statement about a different moment.

### The first server entry point lands with the ingest, not before

**Decided by the owner on 2026-08-27, and recorded here because this is the section a person checks before touching what serves the live site.** Nothing in this repository executes it yet: there is still no `main` in `wrangler.jsonc`, no Worker handler anywhere, and this section adds none.

**What was decided.** Telemetry ingest needs the project's first server-side execution surface — a `main` entry point in `wrangler.jsonc`. The owner was offered two orders: separate staging from production first, so that a server entry point could be exercised somewhere that is not the public site; or add the Worker **together with** the ingest, as one deliberate change. **They chose the second**, with the condition that **exactly what lands on `lockstate.io` is written down and approved before the change merges**.

**Why the condition is the whole of the decision.** `lockstate.io` is served by `lockstate-staging` (see "What currently serves lockstate.io" above), and the `staging` job publishes on every merge to `main` whose CI concludes `success`. The gate on that row of the table above is a **CI conclusion, not an approval**. So the merge that adds a `main` is the act that puts executing code on the public site; there is no later step at which anyone is asked. Whether the `staging` GitHub Environment carries required reviewers is a repository setting no file here can read — `deploy.yml` says so in a comment above the job, and "What can publish the staging Worker" above names environment reviewers as one of two stronger gates and says **"neither is taken here"**.

#### What "approved before merge" has to contain

A checklist, so the next change has one rather than a memory of this paragraph. Each item is a sentence somebody writes in the pull request and the owner says yes to; none of it is automatic.

1. **What lands on `lockstate.io`.** Name the commit, and state in one line that merging it publishes a Worker with an executing `main` to the live site on the next CI success, with no further approval.
2. **Which requests the handler claims, and what happens to the rest.** Adding a `main` puts a fetch handler in front of **every** request to the domain, the SPA shell and every fingerprinted `/assets/*` file included. Write out the paths the handler answers and state explicitly that everything else falls through to Static Assets unchanged. `assets.not_found_handling` is `single-page-application` in every environment today (`wrangler.jsonc`) and that must still be true afterwards.
3. **What the Worker may hold.** Only what the ingest needs: the ingest path, the destination it writes validated events to, and one database credential.
4. **What it must not hold.** Not a `service_role` key — that role may call `record_entitlement_event`, the paid-entitlement write path, so a `service_role` Worker key puts entitlements behind a public endpoint. The credential is a **dedicated least-privilege database role**, and `supabase/tests/003_data_api_grants.test.sql` gains it in the same change, because that suite names its roles as literals and will not otherwise see one. No credential of any kind under a `VITE_` name (see "Why `VITE_` is the dangerous prefix" below). No route the ingest does not need.
5. **What it must do before it stores anything.** Server-side validation against the versioned envelope schema, and a bounded body, batch and request rate. The stored occurrence time and the weight an event carries are the **server's**, never the payload's. [ADR 0008](./adr/0008-trusted-service-boundary.md)'s 2026-08-27 amendment states why those two bind even though the ingest is outside §3, and the telemetry pipeline's own ADR lists the ingestion preconditions in full.
6. **Whether `public/_headers` changes, stated either way.** A same-origin ingest leaves `connect-src 'self'` intact and needs no change; if a change turns out to be needed it is [ADR 0021](./adr/0021-http-response-security-headers.md)'s and the owner sees it on its own terms rather than as a side effect of telemetry.
7. **Rollback, and how it differs from today's.** A bad static asset serves a stale page. A `main` that throws on the SPA shell takes the whole site down, on a domain whose binding is not reproducible from this repository. Say what reverts it and who can run that at 02:00.
8. **The trap, restated because it is the one that costs the domain.** Do not reach for the `production` job as a way to try a server entry point somewhere safer first. Dispatching it transfers `lockstate.io` onto the Worker `lockstate`, which has never been deployed, and **wrangler does not warn** — it prints no diff of what currently holds the Custom Domain and asks nothing. See "What currently serves lockstate.io" above.
9. **The ADR bullet that goes false, amended in the same commit.** See below.

#### What this does to ADR 0002, and when

[ADR 0002](./adr/0002-cloudflare-static-assets.md) is `Accepted`, and the sentence people expect to be the problem is not the one that is.

- **The rejected alternative is honoured, not overturned.** ADR 0002 rejected *"Add a Worker server entry point now"* *"because no trusted server behavior is currently required. A placeholder server would add routing and security surface without product value."* The owner's choice is precisely **not** to add a placeholder: the entry point arrives carrying the ingest, which is the product value that rejection said was missing. What dates in that bullet is the word *"currently"*, and dating is what an ADR's alternatives are for.
- **The Decision bullet does go false, and on a known commit.** *"Deploy the current application as an assets-only Worker with no application-server entry point"* stops being true in the commit that adds `main` to `wrangler.jsonc` — not before, and not on the day the decision to do it was recorded.
- **This document's Contract paragraph survives untouched.** It says *"a server-side Worker entry point must not be added merely to serve the SPA"*. An ingest handler is not that, and the sentence needs no edit.

**So ADR 0002 is amended when the change lands, not now** — in the same commit that adds `main`, as a dated `Amendment` section that quotes the Decision bullet rather than overwriting it, which is the form `docs/adr/README.md`'s *"An amendment to an accepted ADR"* section requires. Amending it today would put a document ahead of the code, which is the defect this corpus keeps paying for; ADR 0002's own "Operational note, 2026-08-24" is the precedent for recording a state of the world **in the commit where it is true**. What keeps the obligation from being a memory in the meantime is this section and the row in [`docs/adr/STATUS-QUEUE.md`](./adr/STATUS-QUEUE.md) §2, both of which name the bullet.

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

`scripts/check-deploy-secrets.sh` enforces that, and issue #344 corrected the shape of the enforcement: it used to state a rule about *everything* prefixed `VITE_` while checking one hard-coded variable name, and to inspect only the environment — never the artefact the rule is about. It now runs in two modes, and `deploy.yml` calls both in both jobs before anything is published.

| Mode | When | What it establishes |
| --- | --- | --- |
| `env` | before the build | Every required name is set; `VITE_SUPABASE_URL` is `https://`; and **every** `VITE_`-prefixed variable that is set — enumerated with `compgen -v`, not listed in the script — carries neither a secret-shaped value nor a name that declares a secret. |
| `bundle` | after the build, before the upload | Nothing secret-shaped appears anywhere under `dist/`, and no value of a non-public credential this pipeline holds appears there either. |

Neither mode subsumes the other, which is why both run. `env` catches a secret that is configured but not yet *read* by any module — Vite only inlines a `VITE_` variable something references, so the bundle cannot show that one. `bundle` catches everything that never goes through a `VITE_` name at all: a credential committed into a source file, a value spliced in through Vite's `define`, a file dropped into `public/`. The shapes both modes recognise are the `sb_secret_` and `sbp_` prefixes, the literal `service_role`, a JWT whose payload claims `service_role` (decoded far enough to read the role claim and no further), and a PEM private key block. A name containing `SECRET`, `SERVICE_ROLE`, `PRIVATE_KEY`, `PASSWORD` or `CREDENTIAL` is refused on the name alone, whatever its value. `TOKEN` and `KEY` are deliberately *not* in that list: both have legitimate public forms — `VITE_SUPABASE_PUBLISHABLE_KEY` is the required one — and a gate that refused them would be deleted rather than fixed.

Neither mode prints any part of any value; a refusal names the variable or the file and describes the shape. A failure there has caught a real mistake.

`bundle` refuses, rather than passes, when there is no build output to look at. A bundle check that goes green with nothing in front of it is the defect it exists to close.

#### The two Supabase names are required ahead of the client that will read them

**Nothing in the shipped artefact reads either of them today, and that is deliberate rather than an oversight.** No module outside `src/persistence/cloud/` reads `import.meta.env` or `VITE_SUPABASE_*`; `src/persistence/cloud/supabase-client.ts` imports `@supabase/supabase-js` as a **type** only, so the dependency is erased at compile time and the string `supabase` does not appear in `dist/` at all. `docs/ARCHITECTURE.md` states this as "contract and SQL only — not reachable from the app", and `tests/foundation/documentation-claims-contract.test.ts` fails if a module outside `src/persistence/cloud/` starts reading that configuration without the documentation changing with it.

So a deploy is refused for the absence of two values the build then discards. That is recorded here rather than relaxed, and the requirement stays **strict**, for one reason: the alternative failure is worse and silent. Vite inlines an empty string for an unset `VITE_` variable without complaint, so the first deploy after cloud save is wired would ship a bundle that cannot reach the backend, and the failure would surface as a runtime error in a visitor's browser. A secret that is set and unread costs nothing; a secret that is unset on the day something starts reading it costs a bad deploy nobody notices.

What would make it right to drop either name from the required list: a decision that cloud save is not going to be wired, or a Supabase client that reads its configuration from somewhere other than `import.meta.env`. Neither has been decided. Until one is, read `env` mode's green line as what it says — that the *configuration* is present and correctly shaped — and `bundle` mode's as the one that says something about what was shipped.

## Database migrations

The SQL under `supabase/migrations/` has been executed against a local PostgreSQL (`pnpm verify:sql`) and against the local Supabase stack (`supabase test db`, plus `pnpm verify:stack` over real HTTP). **It has also been applied to a hosted project**: as of 2026-08-23 the nine migrations `20260822190000` through `20260823100000` are applied, confirmed by `supabase migration list` through a dry-run of `migrate-database.yml` reporting the same timestamps local and remote. **Everything dated after `20260823100000` is not applied there yet.** That is the whole of the claim, deliberately without a count: run `ls supabase/migrations/ | awk 'substr($0,1,14) > "20260823100000"'` and read the answer, because this sentence has now carried a wrong number twice.

`substr($0,1,14)` rather than the whole filename, and the correction is worth keeping visible because it is the same failure one layer down. This paragraph replaced a rotting count with a command that computes it — and the command was wrong. It read `awk '$0 > "20260823100000"'`, which compares the *entire* filename, so `20260823100000_bound_free_tier_capacity.sql` is greater than the bare boundary by virtue of being longer and the answer came back **15** where the truth is **14**. The migration it wrongly counted as unapplied is the boundary migration itself — the one the sentence above calls applied. A self-checking command is only better than a count if it is the right command; comparing the timestamp field is the whole of the fix. It said "seven" while twelve had been added, was corrected to **twelve**, and #382 then added `20260826120000_revoke_ambient_table_privileges` and `20260826130000_server_stamp_updated_at` without this paragraph moving — so it said twelve while fourteen had been added, and **the pair it omitted included a privilege revocation, which is the same class of control this paragraph enumerates as missing.** A count beside a directory that computes it is the shape that keeps failing here; the derivation replaces it. Because they are unapplied, the hosted project still carries the pre-#105 function declarations, the ambient client `TRUNCATE` for both the client roles and `service_role`, the caller-asserted challenge-evidence dedup key, the webhook-only ledger idempotency key, an unvalidated `save_versions.storage_path`, unbounded text, `jsonb` and scalar columns on both tiers, the table-level INSERT grants that let a client stamp its own `created_at`, the ambient table privileges `20260826120000` revokes, and the server-side `updated_at` stamping `20260826130000` adds. Read the date rather than a list of names — that instruction was already here and this paragraph still went stale twice, which is why the count is gone rather than corrected. Two of them can refuse to apply rather than change a row, which is deliberate: the ledger's new natural-key index if two provider-less `entitlement_events` rows are identical in every recorded field, and the `save_versions_storage_path_shape` CHECK if any row already carries a non-null `storage_path`. They are not the only two that can refuse, though — `20260824101000`, `20260824120000` and `20260824130000` add CHECK constraints without `NOT VALID`, so PostgreSQL validates the existing rows and one that violates a new bound stops the migration. Read the dry run before applying, and each migration's header names the query that answers whether the condition holds. That was the `staging` environment — it is the only one carrying `SUPABASE_PROJECT_REF` (see "Credentials" above). The dry run *confirmed* the state; it did not create it. What applied them is covered under "Automated deployment". Target a disposable project first.

Run `migrate-database.yml` with **dry run left checked**: it links the project and prints `supabase migration list` without applying anything. Read that list, then re-run with dry run unchecked.

Before it provisions the Supabase CLI or links anything, the workflow runs `pnpm verify:sql` against a PostgreSQL it provisions locally — applying every migration in order and running the whole pgTAP suite. A migration set that does not apply locally fails the run before it can reach a hosted project. This gate runs for a dry run too: a dry run whose SQL does not apply locally is worth failing. It closes an asymmetry that stood until then, where `deploy.yml`'s `production` job re-ran the whole gate before a *reversible* Worker deploy while this workflow ran no verification at all before an *irreversible* `supabase db push`.

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
