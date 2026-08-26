# Lockstate audit 07 — Build / CI-CD / Deployment / Supply chain / DX

Auditor scope: `.github/workflows/*`, `scripts/*`, `tooling/*`, `wrangler.jsonc`, `public/_headers`,
`vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`,
`supabase/migrations/*`, `supabase/tests/*`, release/versioning, DX.

Method: read the real files; executed `pnpm build` (twice, for reproducibility), `pnpm verify:sql`,
`wrangler deploy --dry-run --strict`, a migration double-apply experiment, and a dependency
install-script / licence sweep over `node_modules/.pnpm`. No repo file was created, modified or
deleted. `dist/` and `.wrangler/` confirmed gitignored (`.gitignore:5`, `.gitignore:10`) before building.

Container baseline honoured: Git LFS content is not provisioned, so `public/assets/**/*.png` are
~131-byte pointer files. `pnpm verify:assets` and the browser image-decode spec are expected to fail
here and are **not** reported as defects. (OPS-01 is a different finding — it is about what happens
to those pointers on the *deploy* path, which is a real gap independent of this container.)

---

## Findings

| ID | Title | Severity | Status | Anchor |
|---|---|---|---|---|
| OPS-01 | Deploy can publish Git LFS pointer text as game art; no build/deploy gate detects it | **High** | CONFIRMED | `.github/workflows/deploy.yml` (no LFS anywhere), `scripts/verify-cloudflare-build.mjs:105` |
| OPS-02 | `workflow_dispatch` publishes any branch to the Worker serving lockstate.io — no CI, no verify, no approval | **High** | CONFIRMED | `.github/workflows/deploy.yml:37`, `:113`, `:131` |
| OPS-03 | A fork pull request skips every gate and presents as green | Medium | CONFIRMED (condition) / SUSPECTED (merge effect) | `.github/workflows/ci.yml:28`, `:156`, `:283` |
| OPS-04 | 12 of 23 migrations are not re-appliable; idempotency attempted but uneven, untested | Medium | CONFIRMED (executed) | `supabase/migrations/20260822190000_create_profiles.sql:17` +11 others |
| OPS-05 | No dependency-update or vulnerability mechanism, though the policy names one | Medium | CONFIRMED | `.github/` (no dependabot/renovate), `docs/DEPENDENCY_POLICY.md:38` |
| OPS-06 | 3,617 lines of `.mjs` + 920 of shell sit outside `tsconfig` and outside any linter | Medium | CONFIRMED | `tsconfig.json:20` |
| OPS-07 | One self-hosted WSL2 runner is the entire pipeline, and it hosts active development | Medium | CONFIRMED | `ci.yml:29`, `version.yml:107`, `ci.yml:378` |
| OPS-08 | No post-deploy verification; a partial deploy is undetectable | Medium | CONFIRMED | `deploy.yml:81`, `deploy.yml:236`, `deploy.yml:338` |
| OPS-09 | Supabase CLI installed from an unverified tarball, then handed DB credentials | Medium | CONFIRMED | `scripts/provision-supabase-cli.sh:44` |
| OPS-10 | `delete-branches.yml` + `deletebranches.sh`: dead, unpinned, write-scoped branch deleter | Low | CONFIRMED | `.github/workflows/delete-branches.yml:14`, `deletebranches.sh:11` |
| OPS-11 | Deployed build identity is never read back; benchmarks gate determinism, not performance | Low | CONFIRMED | `scripts/verify-benchmark-result.mjs`, `docs/BENCHMARKING.md:80` |
| OPS-12 | No CODEOWNERS, no LICENSE, no repo security policy (and no CHANGELOG — which is fine) | Low | CONFIRMED | repo root, `docs/SECURITY.md:1` |
| OPS-13 | README alone does not reach the full gate set | Low | CONFIRMED | `README.md:37` |
| OPS-14 | Production deploy builds three times; `miniflare` in the graph is an upstream alpha | Info | CONFIRMED | `deploy.yml:303`, `pnpm-lock.yaml:1714` |

Counts — **High 2, Medium 7, Low 4, Info 1.**

---

## What CI actually gates today

| Check | Command / mechanism | Workflow · job | Trigger | Blocking |
|---|---|---|---|---|
| TypeScript strict typecheck (`src` + `tests` only) | `tsc -b` via `pnpm verify` | ci.yml · `verify` | push `main`, PR (same-repo), dispatch | Yes |
| Unit / integration / contract / determinism suite (2628 tests) | `vitest run` via `pnpm verify` | ci.yml · `verify` | same | Yes |
| Production Vite build + generated wrangler config + `_headers` immutability + no `.map` | `pnpm verify` → `scripts/verify-cloudflare-build.mjs` | ci.yml · `verify` | same | Yes |
| Content cross-reference validation is present in the emitted chunk | `vite.config.ts:36` plugin, every build | ci.yml · `verify` | same | Yes |
| Benchmark **determinism** (checksums + metrics), harness math | `pnpm verify:benchmark` | ci.yml · `verify` | same | Yes |
| Wrangler dry-run (prod + staging) and real workerd preview: 9 security headers, both cache-policy directions, SPA fallback | `pnpm verify:deployment` → `verify-deployment-preview.mjs` | ci.yml · `verify` | same | Yes |
| Migrations apply in order + 11 pgTAP suites / 287 assertions | `provision-postgres.sh` + `pnpm verify:sql` | ci.yml · `verify` | same | Yes |
| Working tree unchanged by verification | inline (`ci.yml:123`) | ci.yml · `verify` | same | Yes |
| Runtime atlas contract on **real pixels** + explicit pointer/PNG-signature guard | `git lfs pull` + `pnpm verify:assets` | ci.yml · `assets` (needs `verify`) | same | Yes |
| Real-browser Chromium suite + "did not skip its way to green" guard | `provision-playwright-browsers.sh` + `pnpm test:browser` | ci.yml · `browser` (needs `assets`) | same | Yes |
| Lockfile frozen | `pnpm install --frozen-lockfile` | every installing job, all 4 live workflows | all | Yes |
| Browser-visible-secret scan (`env` **and** `bundle`) | `scripts/check-deploy-secrets.sh` | deploy.yml · both jobs | CI success on `main`, dispatch | Yes — **deploy time only, never on a PR** |
| Full re-verify against the shipped commit | `pnpm verify` | deploy.yml · `production` | dispatch only | Yes |
| Migrations verified locally before any hosted apply | `pnpm verify:sql` | migrate-database.yml | dispatch only | Yes (runs for dry runs too) |
| Typed project-ref confirmation vs. environment secret | inline (`migrate-database.yml:112`) | migrate-database.yml | dispatch only | Yes |
| Lint / format | — | — | — | **No such check exists** |
| Dependency vulnerabilities / licence policy | — | — | — | **No** |
| Test coverage threshold | — | — | — | **No** (no coverage tooling installed) |
| Wall-clock performance budget | — | — | — | No — deliberate, `docs/BENCHMARKING.md:80` |
| LFS pointers in the **deployed** artefact | — | — | — | **No — OPS-01** |
| Live site after a deploy | — | — | — | **No — OPS-08** |
| Anything at all on a **fork** PR | all three jobs skip | ci.yml:28/156/283 | fork PR | **No — OPS-03** |
| CI on a dispatched staging deploy of an arbitrary branch | — | deploy.yml:113 | `workflow_dispatch` | **No — OPS-02** |

Read the top block as genuinely strong: for a same-repo PR, seven independent gate families run and
all are blocking. The holes are not in the middle of the pipeline; they are at the two ends —
the deploy path (OPS-01, OPS-02, OPS-08) and the entry conditions (OPS-03).

---

## Detail

### OPS-01 — Deploy can publish Git LFS pointer text as game art · High · CONFIRMED

`grep -n "lfs\|LFS" .github/workflows/deploy.yml` returns **nothing**. Neither deploy job provisions
Git LFS, runs `git lfs pull`, or checks that the atlases are image data. Both check out with
`persist-credentials: false` and no `lfs:` (`deploy.yml:127`, `:258`), then build and upload.

`scripts/verify-cloudflare-build.mjs` runs after *every* build including the deploy build, and checks
the generated wrangler config, `assets.directory`, `index.html`, the `_headers` immutable policy
(`:110`) and the absence of `.map` files (`:114`). It never opens an image.

Executed here: `pnpm build` wrote pointer text straight into the deployable directory —

```
-rw-r--r-- 1 root root 131 dist/assets/actors/actor.guard.base.idle.png
$ head -c 45 dist/assets/actors/actor.guard.base.idle.png
version https://git-lfs.github.com/spec/v1
```

— and `verify-cloudflare-build.mjs` passed, and `wrangler deploy --dry-run --strict` read all 51
files and exited 0.

**Risk.** Whether lockstate.io gets real atlases is currently a property of *incidental runner
state*, not of any gate: the self-hosted workspace happens to hold materialised LFS content because
ci.yml's `assets` job pulled it at that commit. `scripts/provision-git-lfs.sh` states it "DOES NOT
TOUCH GIT FILTER CONFIGURATION", so a fresh `actions/checkout` in the deploy job restores pointers
unless the smudge filter is configured for that job. A cold workspace, a second runner, an `lfs
prune`, or a deploy dispatched without a preceding `assets` run publishes ~131-byte text bodies under
`200 image/png` for every actor atlas and every `/game-content/source-art/` sheet. `docs/TESTING.md:98`
names this exact failure as the one `app-shell.spec.ts` exists to catch — but that spec runs on a
workspace where LFS *was* pulled, never on the artefact being uploaded.

**Fix.** The repository already owns the guard: `tooling/source-art-lfs-guard.mjs` exports
`assertSourceInputsAreImages` and `LFS_POINTER_PREFIX`, and it is unit-driven in
`tests/foundation/art-catalog-generator-contract.test.ts`. Call it from
`scripts/verify-cloudflare-build.mjs` over `dist/assets/actors/*.png` and
`dist/game-content/source-art/*.png` — that puts the refusal on every build path including the deploy
build, at zero new dependency cost. Separately, add `bash scripts/provision-git-lfs.sh` plus a
path-scoped `git lfs pull --include="public/assets/actors"` to both deploy jobs so the artefact is
correct rather than merely checked.

### OPS-02 — Dispatch publishes an arbitrary branch to the public site · High · CONFIRMED

`deploy.yml:37-43` exposes `workflow_dispatch` with `target: [staging, production]`, default
`staging`. The staging job's condition (`:113-115`) accepts `github.event_name ==
'workflow_dispatch' && inputs.target == 'staging'` with no constraint on the ref, and its checkout
(`:131`) resolves to `github.ref` for that path — i.e. whatever branch the operator selected in the
Actions UI. The staging job then installs, checks secrets, builds and deploys. It does **not** run
`pnpm verify` (contrast `:302-303` in the production job).

`docs/DEPLOYMENT.md:141` records the staging gate as "none", and `:167` records that
`lockstate-staging` is the Worker serving `lockstate.io` through a hand-attached Custom Domain. So the
sequence "dispatch Deploy · target=staging · branch=my-wip" replaces the public site with an
unreviewed build that no gate has seen. Nothing detects it afterwards (OPS-08), and it persists until
someone merges something.

This is the one place where the repository's otherwise careful reasoning has a genuine blind spot:
`deploy.yml`'s header argues at length about `workflow_run` versus `push` so that "a merge cannot
publish the site before the gates that judge it have returned" — and the dispatch door bypasses that
argument entirely.

**Fix.** Either (a) constrain the dispatch path — `&& github.ref == 'refs/heads/main'` — or (b) add
`pnpm verify` to the staging job as the production job already does, or both. Independently: now that
staging *is* production, give the `staging` GitHub Environment required reviewers; `docs/DEPLOYMENT.md:186`
already argues that environment approval, not an `if:`, is what actually blocks a deploy.

### OPS-03 — A fork PR skips every gate and presents as green · Medium · CONFIRMED / SUSPECTED

All three CI jobs carry the identical condition (`ci.yml:28`, `:156`, `:283`):

```yaml
if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
```

For a fork PR this is false and all three jobs skip. GitHub reports a skipped job with the `skipped`
conclusion, which branch protection counts as satisfied for a required status check — so such a PR
shows a complete green check list with zero gates executed. I cannot read this repository's branch
protection from here, hence CONFIRMED for the condition and SUSPECTED for the merge consequence.

The condition itself is the *correct* mitigation for a self-hosted runner: fork code must not execute
on it. What is missing is the compensating control. Note also that the string "fork" appears in no
workflow comment and in no document — the only unreasoned condition in a repository that argues every
other line of YAML at length, which suggests it was added defensively rather than designed.

Mitigating: `ci.yml:191` describes this as a private repository, so external fork PRs are not the
common case; the exposure is org-member forks.

**Fix.** Add one hosted-runner-independent aggregation job and make *that* the single required check:

```yaml
gate:
  if: always()
  needs: [verify, assets, browser]
  runs-on: ubuntu-latest   # or self-hosted; it runs one shell line
  steps:
    - run: |
        for r in "${{ needs.verify.result }}" "${{ needs.assets.result }}" "${{ needs.browser.result }}"; do
          [ "$r" = success ] || { echo "::error::a gate did not pass ($r)"; exit 1; }
        done
```

A skipped need then *fails* the gate instead of satisfying it, and a fork PR is visibly blocked with a
reason rather than invisibly green.

### OPS-04 — Migrations are inconsistently idempotent, and nothing tests re-application · Medium · CONFIRMED

Executed: applied the compat harness plus all 23 migrations to a scratch database, then applied the
same 23 again. **Twelve failed on the second pass**, e.g.

```
20260822190000_create_profiles.sql:17   ERROR: policy "profiles_select_own" for table "profiles" already exists
20260822190200_create_save_versions.sql:44  ERROR: constraint "prisons_current_version_fk" ... already exists
20260824101000_bound_client_writable_columns.sql:62 ERROR: constraint "profiles_display_name_check" ... already exists
20260824130000_bound_scalar_columns.sql:40  ERROR: constraint "save_versions_save_schema_version_check" ... already exists
```

(also `20260822190100:32`, `20260822190400:16`, `20260822190500:18`, `20260823090000:61`,
`20260823090100:52`, `20260823100000:242`, `20260824110200:143`, `20260824120000:60`.)

Idempotency was clearly *intended*: the first pass emitted `drop ... if exists` NOTICEs from
`20260823090000:110`, `20260824100000:161` and `:268`, and `20260826130000:161-171`. So triggers and
some constraints are guarded and `CREATE POLICY` / `ADD CONSTRAINT` are not — an uneven application of
the repository's own convention, not a deliberate choice.

Why it matters, given the surrounding facts:
- `migrate-database.yml:24-25` claims "`supabase db push` skips already-applied migrations, so the two
  mechanisms reaching the same project is idempotent". True at the *ledger* level; false at the file
  level. The remote `supabase_migrations.schema_migrations` ledger is therefore the only thing
  standing between the pipeline and a hard error.
- `docs/DEPLOYMENT.md:243` already records that five of these migrations can **refuse mid-apply** on
  real rows (the ledger index, `save_versions_storage_path_shape`, and three non-`NOT VALID` CHECKs).
- `ADR 0016:80-81` records that migration rollback is not automated.

So the one situation with no automated way out — a migration that stopped partway, a restored
database whose ledger is out of step, a hand-run recovery — is also the situation where re-running the
file errors instead of converging.

Forward-only and ordering are otherwise sound: filenames are `YYYYMMDDHHMMSS_`, `verify-supabase-sql.mjs:83-88`
applies them in `sort()` order, and no migration edits or reverts an earlier one. Out-of-order
insertion is the residual risk (`supabase db push` applies anything absent from the remote ledger,
including a timestamp earlier than the latest applied one) and nothing in the repo guards it.

**Fix.** `DROP POLICY IF EXISTS` before each `CREATE POLICY`; wrap each `ADD CONSTRAINT` in a
`pg_constraint` existence check (the same shape the trigger drops already use). Then make it stay
true: add a second apply pass to `scripts/verify-supabase-sql.mjs` (apply → apply again → pgTAP), so
re-appliability becomes a CI-gated property rather than an intention. Optionally add a contract test
that every migration filename is strictly greater than the highest one already recorded as applied.

### OPS-05 — No dependency-update or vulnerability mechanism · Medium · CONFIRMED

`.github/` contains exactly `ISSUE_TEMPLATE/feature.yml` and the five workflows. There is no
`dependabot.yml`, no `renovate.json`, no CodeQL/OSV/Trivy workflow, and no `pnpm audit` step in any
workflow.

`docs/DEPENDENCY_POLICY.md:38` states "Automated dependency update tools may open pull requests; they
may not merge changes without the normal quality gates" and "Emergency security updates may be
expedited". Both describe governance for a mechanism that does not exist — the policy is written as if
updates arrive, and nothing makes them arrive. With 11 direct dependencies and 196 resolved packages
including `phaser`, `vite`, `wrangler` and `@supabase/supabase-js`, an advisory against any of them
reaches this repository only if a human happens to read it.

**Fix.** A `dependabot.yml` under `.github/` with two ecosystems — `npm` (weekly, grouped, so the exact-pin
discipline is respected one PR at a time) and `github-actions` (which also keeps the SHA pins from
going stale, cf. OPS-10). Plus a scheduled non-blocking `pnpm audit --audit-level high` so an advisory
surfaces as a run rather than as a merge blocker.

### OPS-06 — The build/deploy tooling is outside both the typechecker and any linter · Medium · CONFIRMED

`tsconfig.json:20` — `"include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]`. That leaves
**3,617 lines** of `.mjs` across `scripts/`, `tooling/` and `benchmarks/`, plus **920 lines** of shell
in `scripts/*.sh` and `.claude/hooks/`, with no static checking at all. There is no ESLint, Prettier,
oxlint, Biome or shellcheck configuration anywhere in the repository.

This is not hypothetical. `docs/TESTING.md:270` records the exact cost already paid: a guard in
`tooling/` was neutered by `if (pointers.length > 0 && false)`, "and `tooling/` is outside `tsconfig`'s
`include`, so `tsc` never saw it either". The repository's response was three hand-written `.d.mts`
shims (`build-identity.d.mts`, `source-art-lfs-guard.d.mts`, `validate-runtime-atlas.d.mts`) so tests
can drive the implementations typed — a good pattern, applied to 3 of 12 modules.

**On the missing linter, honestly.** This codebase substitutes ~28 executable "contract" tests under
`tests/foundation/` for a lint config, and they enforce far more than any rule set could: module
boundaries, unconsumed content, reachability, documentation-claim agreement, header sets, line
endings, workflow shape. For `src/`, a `typescript-eslint` recommended set would be largely redundant
against `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + those tests. The
genuine, concrete cost is elsewhere and mechanical: no floating-promise detection, no unused-export
detection, and above all **no checking of the 4,500 lines that build and deploy the product**. A
missing Prettier costs this repository essentially nothing (single author-team, consistent style
observed throughout); a missing `checkJs` over `scripts/` and `tooling/` costs it real defect classes.

**Fix.** A second project — `tsconfig.tools.json` with `allowJs: true`, `checkJs: true` over
`scripts/`, `tooling/`, `benchmarks/` — referenced from `tsc -b` so `pnpm typecheck` covers it, and
`shellcheck scripts/*.sh .claude/hooks/*.sh` as one step in the `verify` job. Both are additive and
neither needs a style debate.

### OPS-07 — One self-hosted runner is the whole pipeline, and it is a development host · Medium · CONFIRMED

Every job in ci.yml, deploy.yml, version.yml and migrate-database.yml targets
`[self-hosted, Linux, X64, wsl2]`. `version.yml:107-122` records — measured, with run IDs — that
`ubuntu-latest` does not work in this repository at all: the only two workflows that ever asked for it
failed in four seconds with no step recorded.

Two consequences:
- **Availability.** While that one WSL2 machine is offline, nothing can be verified, versioned or
  deployed. There is no fallback and no second runner.
- **Isolation.** `ci.yml:378-386` states the runner "shares its host with active development". Same-repo
  PR code — test files, `scripts/*.sh`, `vite.config.ts` plugins, `provision-*.sh` — executes
  unsandboxed on a developer workstation, on a workspace that persists between jobs and runs. That
  persistence is not incidental: it is the direct cause of `ci.yml:54-85` (a committed `node_modules`
  symlink surviving into later runs) and `ci.yml:116-122` (LFS content from one job leaking into
  another job's clean-tree measurement). Every job re-running `actions/checkout` is the mitigation and
  it is a good one, but it does not make the host safe from arbitrary `run:` steps.

**Fix.** Diagnose the hosted-runner failure and move the jobs that need nothing local onto
`ubuntu-latest` — `verify` needs only Node, pnpm and Postgres, all of which hosted runners provide
(`provision-postgres.sh` already handles Debian/Ubuntu apt). Keep `assets` and `browser` self-hosted.
Failing that, register a second runner and move the runner off the development host.

### OPS-08 — No post-deploy verification · Medium · CONFIRMED

Both deploy jobs end at `wrangler deploy` (`deploy.yml:236` staging, `:338` production). `deploy.yml:81-83`
states the consequence in terms: "No step inspects the deployed site afterwards, so a partly applied
deploy would not be detected by this workflow. The next successful run overwriting it is what would
end it." The `docs/DEPLOYMENT.md:284-292` release checklist puts the live check on a human (steps 4, 6, 7).

The remedy is already written. `scripts/verify-deployment-preview.mjs` asserts, against real HTTP
responses: `200` on `/`, deep-link SPA fallback byte-identical to `/`, all nine ADR-0021 headers with
exact values, HTML revalidation and non-immutability, a fingerprinted `/assets/` file immutable at
one year, `/assets/actors/asset-registry.json` explicitly *not* immutable and `must-revalidate`, a
content-hashed source-art sheet immutable, exactly one `max-age` per response (the `_headers`
concatenation bug), and no `.map` in the deployable set. It only ever runs against a `vite preview`
it starts itself (`:65-133`) — there is no origin argument.

**Fix.** Give that script an optional origin (skip the spawn when one is supplied) and add a final
step to both deploy jobs: staging against `steps.deploy.outputs.url`, production against
`https://lockstate.io`. That converts checklist steps 4–7 into a gate, catches a half-published
Worker, and — with one added assertion on the badge text — also closes OPS-11.

### OPS-09 — Unverified Supabase CLI binary, then handed database credentials · Medium · CONFIRMED

`scripts/provision-supabase-cli.sh:38-51` builds a GitHub release URL, `curl --fail --silent
--show-error --location --retry 3 --output` (`:44`), untars and `install -m 0755` (`:48`/`:50`). The
version is pinned (`:18`, `2.115.0`) but there is no SHA-256 or signature verification, and no `--`
before `"$url"`.

The binary this installs is the one `migrate-database.yml:127-145` then runs with
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` in its environment — over
the only path to a production database, against an operation `ADR 0016:80` records as having no
automated rollback.

Worth stating the contrast: `provision-postgres.sh:63-133` and `provision-git-lfs.sh:54-59` install
from the signed distribution archive and explicitly add no third-party apt source
(`provision-postgres.sh:27`, `provision-git-lfs.sh:25-28`). This script is the single exception to an
otherwise deliberate rule.

**Fix.** Pin the release's SHA-256 next to `REQUIRED_VERSION` and `sha256sum -c` before `install`.
Supabase publishes checksums per release, so this is a two-line change that closes the last
unverified fetch in the provisioning set.

### OPS-10 — `delete-branches.yml` and `deletebranches.sh` · Low · CONFIRMED

- `.github/workflows/delete-branches.yml:14` — `uses: actions/checkout@v4`. This is the **only**
  unpinned action in the repository; ci.yml, deploy.yml, version.yml and migrate-database.yml all pin
  `actions/checkout` and `actions/setup-node` to 40-character SHAs with a `# v6` comment. A mutable
  tag plus `permissions: contents: write` (`:6-7`) and checkout's default `persist-credentials: true`
  is the highest-leverage supply-chain shape in the repo, on the one workflow nobody watches.
- `:11` `runs-on: ubuntu-latest` — which `version.yml:113-116` records as never having worked here:
  this workflow "has run exactly once, and failed the same way in the same four seconds".
- No `timeout-minutes` (every job in the four live workflows has one).
- `deletebranches.sh:11-43` is one `git push origin --delete` of 33 literal branch names from a single
  cleanup dated 2026-08-23 (`:2`). With `set -e` and one push, it fails wholesale the moment any of
  those refs is already absent — so it is inoperable today. It is still a landmine: if a future branch
  reuses one of those names (`claude/browser-gate`, `claude/deploy-pipeline`, `claude/world-renderer`
  are all plausible again), a dispatch deletes it.

Why it is here at all: it is the residue of a one-off cleanup that was committed rather than run and
discarded, and then wrapped in a workflow. Its own header (`:8`) tells the reader to verify by hand
first, which is the tell.

**Fix.** Delete both files. Branch cleanup is a repository setting ("Automatically delete head
branches") or a workflow that derives its list from `git branch -r --merged origin/main` at run time —
never a committed list of names. If they stay: pin the action by SHA, add `timeout-minutes`, and make
the script compute its own list.

### OPS-11 — Build identity is never read back from the deployed site; benchmarks gate determinism, not performance · Low · CONFIRMED

Versioning itself is in good shape — see the solid section. The gap is narrow: nothing reads the
*live* page to confirm the badge is not `lockstate-unknown-unknown`.
`tooling/build-identity.mjs:26-31` documents that every resolver returns `''` on failure and the build
succeeds, and `docs/DEPLOYMENT.md:105` names `lockstate-unknown-unknown` as "the one thing to look at
first". `tests/browser/app-shell.spec.ts` asserts against it — on a local build, in a job that runs
before the deploy. OPS-08's fix covers this with one extra assertion.

`scripts/verify-benchmark-result.mjs` re-executes every scenario and compares `checksum`,
`uniqueChecksumCount`, `version`, `seed` and `metrics` (`:48-70`), and self-tests the summary maths
(`:27-46`). It asserts **no wall-clock budget**. `docs/BENCHMARKING.md:80-86` records that as a
deliberate decision with the preconditions for changing it (stated machine, target percentile,
permitted regression). Not a defect — listed only so the gate table above is not misread as
"performance is covered".

### OPS-12 — Governance files · Low · CONFIRMED

- **No `CODEOWNERS`.** This is the useful absence. Nothing routes a change to
  `supabase/migrations/`, `.github/workflows/` or `public/_headers` to a required reviewer — and
  `docs/DEPLOYMENT.md:163` and `ADR 0016 §2` both state that the binding constraint they rely on
  (never repoint the Supabase integration at production) "is enforced by nothing mechanically".
  A CODEOWNERS entry plus a required review is the closest available mechanical enforcement.
- **No `LICENSE`.** Defensible for `"private": true` (`package.json:4`), but the absence should be
  stated rather than left to inference — `THIRD_PARTY_NOTICES.md` reasons carefully about *inbound*
  licences and says nothing about outbound.
- **No repository security policy.** `docs/SECURITY.md` is the in-game security design (sectors,
  guard rosters, patrols). A reader looking for vulnerability disclosure finds it and is misled; a
  `SECURITY.md` at the root, or a rename, is a five-minute fix.
- **No `CHANGELOG.md` — and this genuinely does not matter today.** With 108 patch releases in four
  days, one per merge, a hand-maintained changelog would be noise, and `version.yml:15-17` writes none
  by design. The tag range `v0.0.N..v0.0.N+1` *is* the changelog and `docs/DEPLOYMENT.md:98-101`
  explains how to read it, which is a better answer at this cadence. It starts mattering the day a
  version is communicated to someone who cannot read the repository, or the day releases stop being
  one-per-merge — not before.

### OPS-13 — README does not reach the full gate set · Low · CONFIRMED

`README.md:37-45` gives corepack → `pnpm install --frozen-lockfile` → `pnpm verify` →
`pnpm verify:benchmark` → `pnpm verify:deployment` → `pnpm dev`, and `:51-54` adds
`scripts/provision-git-lfs.sh` + `git lfs pull` + `pnpm verify:assets`. It never mentions
`pnpm verify:sql` / `scripts/provision-postgres.sh`, nor `pnpm test:browser` /
`scripts/provision-playwright-browsers.sh` — two of the five things CI gates.

Judged honestly: a new contributor gets running and reproduces most of CI from README alone, which is
more than most repositories manage. They will be surprised by a red `verify:sql` or `browser` job on
their first PR touching `supabase/` or `src/ui/`. `docs/TESTING.md` documents both properly and the
README links to it, so this is one hop rather than a hole. Four lines in "Getting started" closes it.

### OPS-14 — Triple build; alpha in the graph · Info · CONFIRMED

- A production deploy builds three times: `deploy.yml:303` (`pnpm verify` → build #1),
  `:325` (`build production` for the bundle scan → #2), `:338` (`cloudflare-task.mjs deploy production`,
  which builds again internally — `scripts/cloudflare-task.mjs:62-68` then `:95` → #3).
  `deploy.yml:310-316` already proposes folding the scan into `verify-cloudflare-build.mjs`, which
  removes #2; #1 versus #3 is deliberate (different `env:`). Worth doing — it is a third of the
  release's wall clock on a single runner.
- `pnpm-lock.yaml:1714` resolves `miniflare@5.20260820.0-alpha` via `wrangler`/`@cloudflare/vite-plugin`.
  Transitive and dev-only — it never reaches the bundle — but it *is* the runtime under
  `vite preview`, so the thing that proves the production cache and security-header policy
  (`verify-deployment-preview.mjs`) runs on an upstream alpha. Nothing to change here; worth knowing
  when a header assertion behaves strangely.

---

## What is genuinely solid

This is among the more carefully engineered CI/deployment setups I have audited, and most of what
would normally be a finding is already documented with the incident that motivated it.

**Workflow security.**
- Every action in the four live workflows is pinned to a 40-character SHA (`ci.yml:33`, `:38`;
  `deploy.yml:128`, `:134`; `version.yml:176`; `migrate-database.yml:69`, `:89`), and **only
  first-party `actions/*` are used** — zero third-party actions, so the supply-chain surface is
  GitHub's own.
- **No script injection anywhere.** Every operator-supplied value reaches a `run:` block through
  `env:` (`migrate-database.yml:113-115`, then compared as `"$CONFIRMED" != "$SUPABASE_PROJECT_REF"`),
  never interpolated into a script body. `github.event.*` appears only in `if:` conditions and in a
  checkout `ref:`.
- `pull_request`, never `pull_request_target`. **Secrets are unreachable from CI entirely** — the only
  credential in ci.yml is `github.token`, and it is injected for one command with a cleanup trap
  (`ci.yml:196-206`, `:317-328`).
- Least privilege: workflow-level `contents: read` everywhere except `version.yml` (`contents: write`,
  `:149-154`), which also holds the repository's only `persist-credentials: true` — written out
  explicitly rather than left to a default, with the reason, at `:178-185`.
- `timeout-minutes` on every job in the four live workflows.
- No `continue-on-error` anywhere. Every `|| true` is diagnostic or load-bearing and annotated
  (`ci.yml:135`, `:201`; `deploy.yml:227-231`).

**Deploy ordering.** `deploy.yml` triggers on `workflow_run` and tests `conclusion == 'success'`
explicitly (`:113-114`, with the "completed is not passed" reasoning at `:110-112`), and checks out
`workflow_run.head_sha` rather than the branch head (`:131`, reasoning at `:122-126`). Both traps are
closed *and* pinned by `tests/foundation/ci-configuration-contract.test.ts:1408` and `:1511`, so
neither can regress silently. `ci.yml:12-20` makes `cancel-in-progress` conditional on the event so a
`main` run is never cancelled — a subtle, correct choice with the shipped-commit-with-no-gate incident
recorded inline.

**Supply chain.** All 11 direct dependencies are exact-pinned; `pnpm-lock.yaml` is `lockfileVersion 9.0`
with an `integrity` hash on **every one of 196** resolutions; **zero** `overrides`, zero
`patchedDependencies`, zero git or tarball resolutions. `pnpm-workspace.yaml` allows build scripts for
exactly `esbuild` and `workerd` — and a sweep of `node_modules/.pnpm` confirms those are exactly the
two packages in the graph with a real `postinstall` (the other `prepare` scripts do not run for
registry installs). `docs/DEPENDENCY_POLICY.md` compliance is real, not aspirational. Licences:
MIT (73), Apache-2.0 (12), `MIT OR Apache-2.0` (3), ISC, 0BSD, BSD-3-Clause, CC0-1.0, plus MPL-2.0
(`lightningcss`) and LGPL-3.0-or-later (`@img/sharp-libvips-linux-x64`, via `miniflare`) — the two
weak-copyleft entries are dev-time only and neither is linked into the shipped bundle.
`--frozen-lockfile` in every installing job, and `THIRD_PARTY_NOTICES.md` is accurate: no file in
`src/`, `scripts/`, `tooling/` or `tests/` carries a third-party copyright, SPDX line or
"adapted from" attribution.

**Build correctness.**
- **Reproducible:** two consecutive `pnpm build` runs produced byte-identical SHA-256 for every
  emitted `.js`, `.css`, `.html` and `.json`.
- **No source maps ship, twice over:** `sourcemap: false` (`vite.config.ts:84`) *and* a `.map` sweep
  of the deployable directory that fails the build (`verify-cloudflare-build.mjs:114-122`).
- **No environment variable reaches the client.** `grep -rn "import.meta.env" src/` returns nothing —
  the bundle exposes zero env values today, and `docs/DEPLOYMENT.md:233-239` explains why the two
  `VITE_` requirements are nonetheless enforced ahead of the client that will read them.
- `dist/.assetsignore` keeps `wrangler.json` and `.dev.vars` out of the served asset set.
- tsconfig strictness is maximal for `src`/`tests`: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `isolatedModules`, `verbatimModuleSyntax`. The
  only relaxation is `skipLibCheck: true` (`:16`) — normal, low-risk, and the right trade against
  Phaser's declarations.
- `vite.config.ts:36-68` inspects the *emitted, minified* chunk for the content-validation marker and
  refuses an empty client environment — a gate that cannot pass vacuously, written because the check
  it protects had been absent from every shipped build (#315).

**Deployment.** Staging/production separation is enforced on the artefact, not by convention:
`verify-cloudflare-build.mjs:66-96` asserts the Worker name, `workers_dev`, `preview_urls` and the
route set per environment, and that staging carries **no** production custom-domain route. Production
deploy needs `LOCKSTATE_PRODUCTION_DEPLOY=1` (`cloudflare-task.mjs:18-27`) *and* a GitHub Environment.
`wrangler deploy --strict` is a real flag (verified against `wrangler 4.125.0 --help`: "prevents
uploads when there are conflicting remote changes") — a genuine safety measure, not a typo. ADR-0021's
nine headers **do** ship and **are** verified against a real workerd response in CI, and the
`_headers` concatenation trap is asserted in both directions.

**Secret hygiene.** `scripts/check-deploy-secrets.sh` is the best-argued script in the repository:
two modes that provably do not subsume each other, an `env` sweep enumerated with `compgen -v` rather
than a hard-coded name list, a `bundle` scan that **refuses when there is nothing to scan** (`:184-193`),
a JWT decoded only far enough to read the role claim, `TOKEN`/`KEY` deliberately excluded from the
name blocklist with the reasoning, and nothing ever printing any part of any value.

**Versioning.** 108 contiguous tags `v0.0.1` … `v0.0.108`, HEAD is exactly `v0.0.108`, `package.json:3`
agrees, and the tag's commit is authored by `github-actions[bot]` with the expected subject. The race
handling is real engineering: `git push --atomic` of branch and tag together, recompute-from-`origin`
on rejection, three attempts, and a failure message that states precisely what was and was not left
behind (`version.yml:206-247`). The loop guard is two independent statements and one half is asserted
mechanically against the commit-message template.

**Toolchain pinning consistency.** `24.19.0` appears in `.node-version`, `engines`, the CI
"Verify toolchain versions" step (`ci.yml:49-52`), and is *read from* `.node-version` by the session
hook (`.claude/hooks/session-start.sh:43`) rather than repeated — with the stale-literal incident
(#124) recorded. pnpm `11.22.0` in `packageManager`, `engines`, and asserted in CI.

**Test-infrastructure integrity.** `verify-supabase-sql.mjs` derives a per-run scratch database name
from `GITHUB_RUN_ID` with the observed collision reproduced in the comment (`:49-71`) and drops it in
a `finally`. The pgTAP suite genuinely runs: 287 assertions across 11 suites, executed here, all
passing. Playwright refuses to reuse a server it did not start (`playwright.config.ts:91`) because
attaching to another checkout produced a green run on a deliberately broken token. Three CI steps
exist purely to make a *vacuous* pass impossible: the PNG-signature/size floor in `assets`
(`ci.yml:214-246`), the "no passing tests" and "skipped its way to green" guards in `browser`
(`ci.yml:398-403`), and the non-empty client-chunk requirement in the Vite plugin.

**And the contract tests.** `tests/foundation/ci-configuration-contract.test.ts` (1,525 lines) pins the
deploy trigger, the checkout ref, the concurrency policy *and its reasoning*, the version-bump
workflow's guard and permissions, the header set in both inclusion directions plus the exact name set,
the LF attribute coverage for every executable with a shebang, and refuses a `provision-*.sh` that no
workflow calls — while rejecting a mere mention in a log line as a call site. This is the mechanism
that makes the rest of the YAML trustworthy, and it is why so few of my findings are about the
workflows' interiors.

---

## Prioritized top 5

1. **OPS-01 — Put the LFS-pointer guard on the deploy path.** `tooling/source-art-lfs-guard.mjs`
   already exists and is tested; call it from `scripts/verify-cloudflare-build.mjs` over
   `dist/assets/actors/*.png` and `dist/game-content/source-art/*.png`, and add `provision-git-lfs.sh`
   + a path-scoped `git lfs pull` to both deploy jobs. Highest severity-to-effort ratio in this report:
   the site's entire art layer currently depends on incidental runner state.
2. **OPS-02 — Close the dispatch door onto the public site.** Constrain the staging job's
   `workflow_dispatch` path to `refs/heads/main`, or run `pnpm verify` in it as the production job
   does; and give the `staging` environment required reviewers now that it *is* production.
3. **OPS-03 — Make a skipped gate fail.** One `gate` job with `needs: [verify, assets, browser]`,
   `if: always()`, and an explicit `result == success` check per need, made the single required status
   check. Turns a fork PR's silent green into a visible, explained block.
4. **OPS-04 — Make the migrations actually re-appliable, then gate it.** Guard the 12 `CREATE POLICY`
   / `ADD CONSTRAINT` sites, then add a second apply pass to `verify-supabase-sql.mjs`. This is the
   one finding touching an operation with no automated rollback.
5. **OPS-05 — Add `dependabot.yml` (npm + github-actions) and a scheduled `pnpm audit`.** The policy
   already describes the process; this gives it a mechanism, and the `github-actions` ecosystem keeps
   the SHA pins from going stale.

Runner-up, cheap and high value: **OPS-08** — give `verify-deployment-preview.mjs` an origin argument
and run it against the deployed URL. It converts four manual release-checklist steps into a gate and
closes OPS-11 in the same change.
