# Testing contract

Lockstate treats tests as executable architecture. A feature is not complete because it appears to work in a browser; its behavior, boundaries and failure modes must be verifiable at the lowest appropriate layer.

## Supported commands

```bash
pnpm typecheck
pnpm test
pnpm test:watch
pnpm test:browser
pnpm verify
pnpm verify:assets
pnpm verify:deployment
pnpm verify:sql
```

`pnpm test` runs the complete Vitest suite once and fails when no test is discovered. `pnpm verify` typechecks test and production sources, runs the test suite and builds the production Cloudflare package.

`pnpm verify:sql` is separate from `pnpm verify` because it needs a PostgreSQL server: it applies every migration in `supabase/migrations/` and runs every pgTAP suite in `supabase/tests/` against a scratch database, using the compatibility harness in `scripts/sql/`. It is the check that can run when the Supabase local stack's container images are unreachable; it proves the SQL, not the hosted platform around it (see `docs/CLOUD_SAVE.md` for the cloud-save schema and `docs/TRUSTED_SERVICES.md` for the entitlement/challenge schema). Separate from `pnpm verify` does **not** mean optional: it is a required CI step (see "Database provisioning" below). `pnpm test:browser` runs the Chromium project (`tests/browser/`) and is deliberately **not** part of `pnpm test` or `pnpm verify` — the ordinary suite stays fast, headless and browser-free. Separate is not optional: CI runs it as a required `browser` job, which provisions its own Chromium (see "Browser provisioning" below).

The persistence measurement harness is likewise opt-in: `pnpm exec vitest run --config tests/perf/vitest.perf.config.ts`. Its files are named `*.perf.ts` so the default suite never collects them, and it asserts only correctness invariants — never elapsed time (see `docs/BENCHMARKING.md`).

`pnpm verify:assets` is separate from `pnpm verify` for the same reason and by
the same rule: it reads the runtime atlas PNGs, which live in Git LFS, so it is
the only check that needs LFS content. CI runs it as a required `assets` job, so
ordinary runs stay on a cheap pointer-only checkout (see
[ADR-0014](./adr/0014-art-storage-and-runtime-asset-delivery.md)). Only `*.png`
is LFS-tracked; the atlas manifests and `asset-registry.json` are plain files, so
nothing in `pnpm verify` needs LFS content at all.

Separate does **not** mean optional, and a pointer-only checkout cannot pass it
silently. The validator recognises a Git LFS pointer and fails naming it rather
than treating an unfetched file as valid art, and the job asserts the PNG
signature and a size floor on every atlas before it even runs the validator. That
assertion is not belt-and-braces theatre: it is what caught `actions/checkout`
with `lfs: true` leaving pointers in place on this runner.

The `assets` job provisions `git-lfs` with `scripts/provision-git-lfs.sh` and
then fetches content with an explicit, path-scoped `git lfs pull` rather than
using `lfs: true`. On a self-hosted runner the workspace is already at the target
commit from the previous job, so checkout is a no-op, the LFS smudge filter never
runs, and `lfs: true` downloads objects that never reach the working tree. An
explicit pull materialises regardless, and takes a path filter so the job fetches
only the ~17 MB it reads instead of all 55 MB. Provisioning lives in the job that
uses it, idempotent and with no third-party apt repository, exactly as
`scripts/provision-postgres.sh` does for `verify:sql`.

The rejection modes themselves are proven in the ordinary suite.
`tests/contract/runtime-atlas-validation.test.ts` drives the same validator
against tiny synthetic fixtures — a missing direction, a short frame list, a
duplicate logical id, a drifting pivot, an oversized atlas, an out-of-bounds
rectangle, a stale registry — so a validator that stopped rejecting anything
fails `pnpm test` without needing any art at all.

## Database provisioning for `pnpm verify:sql`

`scripts/provision-postgres.sh` installs and starts what `pnpm verify:sql` needs on a Debian/Ubuntu machine and is safe to re-run:

```bash
scripts/provision-postgres.sh   # needs root or passwordless sudo
pnpm verify:sql                 # 63 pgTAP assertions
```

It is deliberately **version-agnostic**. It uses whichever PostgreSQL major version is already installed, or failing that whichever one the distribution ships, and installs the matching `postgresql-<major>-pgtap`. No third-party apt repository is added and no major version is pinned anywhere: the schema is executed and green on **PostgreSQL 16.13 + pgTAP 1.3.2** and on **18.6 + pgTAP 1.3.4**, and Ubuntu 26.04 does not package 16 at all. It then ensures the cluster is running and that the invoking user has a login role with SUPERUSER — the compatibility harness creates extensions and roles, so CREATEDB alone is insufficient. Set `DATABASE_URL` to point `pnpm verify:sql` at an existing server instead; the role step then does nothing.

CI runs that script and then `pnpm verify:sql` on the self-hosted runner, so the SQL is executed on every pull request. The same script is what `.claude/hooks/session-start.sh` uses for remote containers, so the two environments cannot drift into provisioning different databases.

A service container was rejected: `scripts/verify-supabase-sql.mjs` shells out to a local `psql` client that would have to be installed regardless, no published PostgreSQL image ships pgTAP, and the reason this check exists at all is to keep working where container images cannot be pulled.

## Default environment

Vitest runs in the Node environment by default. Pure simulation, protocol, serialization, migration, economy, navigation and deterministic scheduling tests must not import Phaser, touch the DOM or require browser globals.

A browser/E2E project may use Playwright or Vitest Browser Mode after a dedicated dependency and architecture review. Browser setup must remain explicit rather than silently changing the environment for every test.

**Approved browser project (issue #19).** `@playwright/test` (exact-pinned devDependency) drives Chromium against `tests/browser/`, run **only** via `pnpm test:browser` — never as part of `pnpm test` or `pnpm verify`. It stays explicit in exactly the way this section requires:

- Its specs are named `*.spec.ts`, and the root Vitest config collects only `*.test.ts`, so no browser file can be picked up by the default suite by accident.
- It uses its own Vite config and dev server (`tests/browser/vite.config.ts`), not the production Cloudflare build.
- It is devDependency-only and outside the production build graph — verified by building `HEAD` and `HEAD + browser project` side by side and confirming a byte-identical bundle (1,384.01 kB, gzip 360.73 kB).

It exists because `fake-indexeddb` structurally cannot prove three things: durability across a real page navigation, what a real browser's `DOMException`s are actually named, and behavior under a genuinely exhausted storage quota (driven here through CDP `Storage.overrideQuotaForOrigin`, asserted via `navigator.storage.estimate()` so an ineffective override fails the test rather than passing vacuously). It found one real adapter defect — see `docs/PERSISTENCE.md`.

The **browser UI** (`tests/browser/ui-shell.spec.ts`, #65 and the HUD shell) is here on the same principle, not as a general licence to test UI in a browser. Four claims cannot be settled below this layer: that a real click on a real `disabled` button does nothing; that no `unhandledrejection` event fires; what a *computed* font stack and numeric variant actually resolve to; and what `getBoundingClientRect` / `elementFromPoint` report for a layout at a given viewport. Everything else about the UI — the tab/collapse state machine, the view-model → display mapping, the async-action gate's refusal and rejection-ownership rules, the design-token contract — is proven headlessly in `tests/unit/ui-*.test.ts`, in the default `node` environment with no DOM. The browser layer found two layout defects that no unit test could have (a strip whose min-content width carried the tab bar off a 375px screen, and a minimap frame overlapping the tab bar at 768px); both now have assertions rather than a remembered viewport.

The same three reasons apply to a **save-format migration**, which is why `tests/browser/local-save-migration.spec.ts` covers V1 → V2 (#50) here as well as in-process: a migration bites in production on a record an *older build* left in real origin storage, transported by structured clone rather than JSON and read back in a later page load by a build that only knows the new version. Its V1 records are built from the same checked-in `tests/fixtures/persistence/save-v1-in-progress.json` the in-process `tests/migrations/save-v1-to-v2.test.ts` uses, so the two layers cannot drift into disagreeing about what a V1 save looked like. This is an addition to the browser layer, not a replacement: the in-process migration tests remain the fast, primary proof, per "use the lowest layer that proves the behavior" above.

The **assembled application** (`tests/browser/app-shell.spec.ts`) is the newest addition and the only place the real `index.html` is ever loaded. Every other spec here drives a purpose-built harness page, which is the right shape for a module under test but means the page a player opens — renderer, HUD and save panel in one document, over real storage and real HTTP — had no coverage at all. Six claims exist only once the pieces are assembled, and none can be settled a layer down: that Phaser's `Scale.RESIZE` canvas really is the size of the window and follows it across a resize; that `elementFromPoint` **and a real press** at the centre of the screen reach the canvas rather than the HUD, whose root is `pointer-events: none`; that every runtime atlas is fetched over HTTP and *decodes* at its manifest dimensions (a Git LFS pointer is served as `200 image/png` and only a decoder can tell the difference); that a prison created through the real save panel — panel → session controller → simulation worker snapshot → IndexedDB — is still listed after a real navigation; that every HUD control renders at the 44px `--tap-target` (the token is applied by CSS convention, and a token test cannot check a *rendered* box — a 24px control is one of the defects this layer already found by measuring); and that **every interactive control on the page is reachable** — `elementFromPoint` at each control's own centre resolves to that control or something inside it, on every tab and at every viewport the suite visits. That last one is the general form of a defect this layer had been blind to (#88): the save panel and the Build panel were two independently-positioned `fixed` layers, the Build panel covered the save panel on the Build tab, and all five of its buttons did nothing while every existing assertion stayed green — because presence and reachability are different properties and only the second is what a player has. It deliberately does not re-test the HUD state machine, the responsive layout, the computed font stack, the camera transforms or the atlas schema: those are already proven in `tests/unit/ui-*.test.ts`, `tests/browser/ui-shell.spec.ts`, the Phaser-free `src/rendering/**` tests and `tests/contract/runtime-atlas-validation.test.ts`, and a browser test that repeats a headless one costs CI minutes and proves nothing new.

A single non-DOM Web API can be reviewed and approved narrower than a full browser/E2E environment: `fake-indexeddb` (a pure-JS, dependency-free `indexedDB` implementation, devDependency-only) is approved for testing `src/persistence/local/indexeddb-store.ts` specifically — see `docs/PERSISTENCE.md`. Tests using it import a fresh `IDBFactory` instance explicitly per test rather than the `/auto` global-polluting entry point, so the default Vitest environment stays `node` and unaffected for every other test.

## Browser provisioning for `pnpm test:browser`

`@playwright/test` is pinned but its browser binaries are not in the package and are not checked in, so a machine that has never run the suite fails with "Executable doesn't exist". `scripts/provision-playwright-browsers.sh` installs what the suite needs and is safe to re-run:

```bash
scripts/provision-playwright-browsers.sh   # no root, no apt, no third-party repository
pnpm test:browser                          # 31 tests
```

The suite starts its own dev server on port 5183 and **never reuses one that is already listening**. It used to reuse outside CI, which meant a run could attach to a server started from a different checkout of this repository — the suite then loaded that tree's `src/**` and reported on code the developer was not editing. That was observed, not theorised: a deliberately broken design token came back green because the page under test came from another worktree. Refusing to reuse turns that into a loud "port is already used"; set `LOCKSTATE_BROWSER_TEST_PORT` to run a second checkout alongside the first. The CI job sets it to a port the kernel just handed out, because the self-hosted runner shares its host with active development and 5183 is regularly taken there — the first run of that job died on exactly this.

Chromium only — `playwright.config.ts` pins `browserName: 'chromium'` and nothing here launches a second engine. It runs headless (the config never sets `headless: false`), so no display, xvfb or `DISPLAY` is required. The download is ~280 MiB (Chromium, the headless shell and ffmpeg) and unpacks to ~920 MB under `PLAYWRIGHT_BROWSERS_PATH`, default `~/.cache/ms-playwright`.

**Idempotent**, in the same style as `scripts/provision-postgres.sh`: it checks before it acts, and the check is the launch the suite itself performs. When the browser is already on disk and runs, it downloads nothing and exits in a few seconds — which, on the self-hosted runner that keeps its cache between jobs, is every run after the first.

It also carries the two environment-specific facts observed on Ubuntu 26.04 under WSL2, so nobody has to remember them:

- Playwright 1.56.1 has no build listing for Ubuntu 26.04 and refuses outright (`ERROR: Playwright does not support chromium on ubuntu26.04-x64`). The script retries with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, which downloads the 24.04 build; that build runs correctly and needs no override at run time. The retry happens **only** after an unmodified install has failed with that exact message, so it stops overriding by itself on a Playwright release that supports the host natively, and it never masks an unrelated install failure.
- `playwright install --with-deps` fails for the same reason, needs root, and installs a list of packages on the assumption that one is missing. The script launches the browser instead, and if that ever fails it reports exactly which library `ldd` says is missing. On this host nothing is: `ldd` on both the Chromium binary and the headless shell reports no missing library, and the suite is green against a browser tree installed into an empty directory.

CI runs that script in the `browser` job and then `pnpm test:browser`, so the layer that found the adapter defect in `docs/PERSISTENCE.md` and the two HUD layout defects above runs on every pull request instead of when a human remembers. The job is ordered after `assets` for two reasons, neither a data dependency: a browser run is a couple of minutes on a single self-hosted runner and there is no point spending it on a tree that does not build; and `assets` has already materialised the runtime atlases into the shared workspace, so the job's own path-scoped `git lfs pull` transfers nothing. That pull stays regardless, because the job has to be correct on a cold workspace — `app-shell.spec.ts` asks a real browser to decode the art, and a pointer-only checkout is exactly what it exists to catch. The job also fails if the suite skipped its way to green: `playwright test` already errors when no test matches and `forbidOnly` is on under CI, but neither covers a suite that ran and skipped.

## Test layers

| Layer | Purpose | Normal location |
| --- | --- | --- |
| Unit | One pure module, algorithm or invariant | Colocated `src/**/*.test.ts` |
| Contract | Typed boundary, schema, protocol or repository contract | `tests/contract/` or a named folder under `tests/` |
| Integration | Two or more real project modules wired together | `tests/integration/` |
| Determinism | Same initial state and command stream produce identical state/hash | `tests/determinism/` |
| Migration | Versioned fixture upgrades and forward-only save compatibility | `tests/migrations/` |
| Browser E2E | Real browser storage/durability, real `DOMException` names, real quota exhaustion, save migration off real storage, and the assembled page: canvas sizing, hit-testing, image decode | `tests/browser/`, via `pnpm test:browser` (own command, required CI job) |
| Measurement | Reported size/timing evidence with no timing assertions | `tests/perf/`, opt-in via its own Vitest config |
| Benchmark | Repeatable performance evidence, never correctness by elapsed time | `benchmarks/` and `docs/BENCHMARKING.md` |

Use the lowest layer that proves the behavior. Do not use a browser test to cover logic that can be proven by a fast headless unit or contract test.

## Naming and placement

- Use `*.test.ts` for executable Vitest files.
- Colocate narrow unit tests with their implementation.
- Put cross-module, persistence, protocol and integration fixtures under `tests/`.
- Keep reusable test-only helpers under `tests/helpers/`; production modules must not import them.
- Use descriptive behavior names. A failing test should identify the broken invariant without opening the implementation first.
- Avoid large snapshots for evolving UI or state. Prefer focused structural assertions and purpose-built fixture checks.

## Determinism and isolation

Tests must not depend on:

- execution order or another test's side effects;
- current wall-clock time;
- live network services;
- unseeded randomness;
- the developer's keyboard layout, locale, timezone or home directory;
- mutable process globals that are not restored;
- files left by a previous run.

Inject clocks and deterministic RNG interfaces into production code. Use fake timers only when the test owns the complete timer lifecycle, and always restore them. Seed values and command streams must be visible in the test or fixture so failures can be reproduced.

Vitest is configured to clear/restore mocks, stubbed environment variables and stubbed globals between tests. Tests remain responsible for closing workers, servers, database handles, timers and temporary directories they create.

## Network and external services

Unit and contract tests must not make live network calls. Supabase, Cloudflare and other provider behavior should be exercised through explicit adapters, local emulators where justified, recorded schema fixtures or separate deployment smoke tests. A test requiring credentials is not part of the ordinary pull-request test gate.

## Worker and renderer boundaries

- Simulation tests import the headless simulation API directly, not a Worker wrapper.
- Worker protocol tests validate message parsing, version negotiation, invalid-message rejection and round trips independently of Phaser.
- Renderer tests consume immutable snapshots/deltas and must not mutate worker-owned state.
- Phaser scene tests belong to an explicit renderer/browser layer and cannot become the only proof of simulation behavior.

## Fixtures and migrations

Persistent fixtures are versioned inputs, not opaque generated blobs. Keep them small enough to review, record the schema/build version and never rewrite an old fixture merely to make a migration test pass. Add a new expected fixture or migration when the contract changes.

## Pull-request evidence

Every issue and pull request must state which layers changed and include the commands actually executed. At minimum, ordinary changes require:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Deployment-sensitive work also requires `pnpm verify:deployment`. Work touching `supabase/` or `scripts/sql/` requires `pnpm verify:sql` locally as well — CI runs it, but reviewing SQL that has never been executed is what produced the defects recorded in `docs/CLOUD_SAVE.md`. Performance-sensitive work requires a benchmark scenario and result evidence under the benchmark contract; elapsed-time assertions do not belong in unit tests.

## Coverage policy

There is no arbitrary repository-wide percentage threshold during the pre-alpha foundation. New behavior still requires tests. Coverage thresholds may be introduced only after representative systems exist and uncovered risk can be mapped to meaningful gates rather than a vanity number.

## Current executable baseline

`tests/foundation/repository-contract.test.ts` guards the pinned Node/pnpm metadata, strict compiler options, test-source inclusion and the rule that an empty suite cannot pass. It is a foundation contract, not a substitute for system-specific tests.

`tests/determinism/` is the executable form of `docs/DETERMINISM.md` and, through [ADR 0009](./adr/0009-challenge-verification-strategy.md), of the challenge-verification guarantee: same seed plus same command stream reproduces an identical state hash, `snapshot() → restore() → run N ticks` equals running those ticks straight through, named RNG streams cannot perturb each other, and system order is a property of the declarations rather than of registration order. `ambient-nondeterminism-contract.test.ts` is a static contract in the spirit of `navigation-no-phaser.test.ts`: it walks the real transitive import graph out of `src/simulation/` and rejects clock, locale, DOM, storage and randomness sources, with a single per-file allow-list that fails when an entry goes stale. A determinism test that cannot fail is worse than none, so every test there is written against a break that was actually demonstrated — see that directory's table in `docs/DETERMINISM.md`.
