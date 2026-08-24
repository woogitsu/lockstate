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

`pnpm verify:sql` is separate from `pnpm verify` because it needs a PostgreSQL server: it applies every migration in `supabase/migrations/` and runs every pgTAP suite in `supabase/tests/` against a scratch database, using the compatibility harness in `scripts/sql/`. It is the check that can run when the Supabase local stack's container images are unreachable; it proves the SQL, not the hosted platform around it (see `docs/CLOUD_SAVE.md` for the cloud-save schema and `docs/TRUSTED_SERVICES.md` for the entitlement/challenge schema). Two of the six suites assert nothing about behaviour: `003_data_api_grants` pins the whole privilege surface for all three Supabase roles, and `005_function_security_declarations` pins the function *declarations* — `prosecdef` and the pinned `search_path` — read back from `pg_proc`, because a suite that pinned privileges exhaustively and never read those two columns let a dropped `search_path` pass every assertion (#105 finding 5). The sixth, `006_client_writable_column_bounds`, asserts every size bound in both directions — it refuses a value past the ceiling *and* admits one exactly at it, because a database that refuses what the TypeScript contract permits is a defect rather than hardening (#105 finding 4). Separate from `pnpm verify` does **not** mean optional: it is a required CI step (see "Database provisioning" below). `pnpm test:browser` runs the Chromium project (`tests/browser/`) and is deliberately **not** part of `pnpm test` or `pnpm verify` — the ordinary suite stays fast, headless and browser-free. Separate is not optional: CI runs it as a required `browser` job, which provisions its own Chromium (see "Browser provisioning" below).

The measurement harness is likewise opt-in: `pnpm exec vitest run --config tests/perf/vitest.perf.config.ts`. Its files are named `*.perf.ts` so the default suite never collects them, and it asserts only correctness invariants — never elapsed time (see `docs/BENCHMARKING.md`). It covers persistence decode/save cost and, since #136, what one HUD repaint costs the localization runtime with its `Intl` formatters cached versus built per call (`tests/perf/localization-format-cache.perf.ts`) — reported as a ratio and a per-repaint figure, with the *guard* against the cache disappearing being a construction **count** in `tests/unit/services-localization.test.ts` and `tests/browser/ui-shell.spec.ts` rather than anything timed.

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
pnpm verify:sql                 # 184 pgTAP assertions
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
- It is devDependency-only and outside the production build graph — verified by building `HEAD` and `HEAD + browser project` side by side and confirming a **byte-identical** bundle. The claim is the identity, not the size: the two builds matched at 1,384.01 kB (gzip 360.73 kB) when that check was run, and the bundle has grown a great deal since — `docs/PERSISTENCE.md` records the step to 1,607.50 kB when the session runtime was wired in, and a production build today reports 1,602.36 kB (gzip 421.88 kB) for `index-*.js` plus 243.67 kB for the worker chunk. Re-running the comparison means building both sides again; the figure above is evidence from one run and not a current measurement.

It exists because `fake-indexeddb` structurally cannot prove three things: durability across a real page navigation, what a real browser's `DOMException`s are actually named, and behavior under a genuinely exhausted storage quota (driven here through CDP `Storage.overrideQuotaForOrigin`, asserted via `navigator.storage.estimate()` so an ineffective override fails the test rather than passing vacuously). It found one real adapter defect — see `docs/PERSISTENCE.md`.

The **browser UI** (`tests/browser/ui-shell.spec.ts`, #65 and the HUD shell) is here on the same principle, not as a general licence to test UI in a browser. Five claims cannot be settled below this layer: that a real click on a real `disabled` button does nothing; that no `unhandledrejection` event fires; what a *computed* font stack and numeric variant actually resolve to; what `getBoundingClientRect` / `elementFromPoint` report for a layout at a given viewport; and what the DOM builders in `src/ui/hud/**` actually put on the page — the default suite runs in the `node` environment, so nothing headless ever executes `status-strip.ts`, and "the clock reads `--` until a session reports one" (#94) is a rendered-output claim rather than a mapping one. Everything else about the UI — the tab/collapse state machine, the view-model → display mapping that decides *what* the builders are told to show, the async-action gate's refusal and rejection-ownership rules, the design-token contract — is proven headlessly in `tests/unit/ui-*.test.ts`, in the default `node` environment with no DOM; a browser assertion on rendered text is paired with the mapping assertion underneath it rather than standing in for one. The browser layer found two layout defects that no unit test could have (a strip whose min-content width carried the tab bar off a 375px screen, and a minimap frame overlapping the tab bar at 768px); both now have assertions rather than a remembered viewport.

Two claims were added here for the same reason and are worth naming, because both are about a *number the browser reports* rather than about rendered text:

- **Where the Build panel's last section is** (#143). The panel used to be its own only scroll container, so every catalogue row it gained pushed the "Enter coordinates" header further down inside it: at 1280x720 with a twelve-entry catalogue the header sat at y=845..889 in a panel clipped at y=638. The assertion measures the header's rectangle against the panel's client box at all five viewports the suite visits, with the panel unscrolled — a computed-`overflow-y` assertion would have passed *before* the fix as well, since the panel already had it. The catalogue is fed to the panel as view-model data, so the harness hands the real panel twelve entries; `BUILDABLE_REGISTRY` has two and the assembled app cannot yet show a third at all.
- **How many `Intl.NumberFormat` instances one repaint builds** (#136). The harness's `HudLocalizer` counts `formatNumber` calls and a `Proxy` construct trap counts constructions across one real `hud.update()`: 10 values formatted, 0 formatters built. Nothing headless executes the strip, so this is the only layer that can count what a real repaint really does.

Neither is a timing assertion; both are counts and positions, which is what keeps them out of `docs/BENCHMARKING.md`'s way.

The same three reasons apply to a **save-format migration**, which is why `tests/browser/local-save-migration.spec.ts` covers V1 → V2 (#50) here as well as in-process: a migration bites in production on a record an *older build* left in real origin storage, transported by structured clone rather than JSON and read back in a later page load by a build that only knows the new version. Its V1 records are built from the same checked-in `tests/fixtures/persistence/save-v1-in-progress.json` the in-process `tests/migrations/save-v1-to-v2.test.ts` uses, so the two layers cannot drift into disagreeing about what a V1 save looked like. This is an addition to the browser layer, not a replacement: the in-process migration tests remain the fast, primary proof, per "use the lowest layer that proves the behavior" above.

The **assembled application** (`tests/browser/app-shell.spec.ts`) is the only place the real `index.html` is ever loaded. Every other spec here drives a purpose-built harness page, which is the right shape for a module under test but means the page a player opens — renderer, HUD and save panel in one document, over real storage and real HTTP — had no coverage at all. Eight claims exist only once the pieces are assembled, and none can be settled a layer down: that Phaser's `Scale.RESIZE` canvas really is the size of the window and follows it across a resize; that `elementFromPoint` **and a real press** at the centre of the screen reach the canvas rather than the HUD, whose root is `pointer-events: none`; that every runtime atlas is fetched over HTTP and *decodes* at its manifest dimensions (a Git LFS pointer is served as `200 image/png` and only a decoder can tell the difference); that a prison created through the real save panel — panel → session controller → simulation worker snapshot → IndexedDB — is still listed after a real navigation; that every HUD control renders at the 44px `--tap-target` (the token is applied by CSS convention, and a token test cannot check a *rendered* box — a 24px control is one of the defects this layer already found by measuring); that pressing a real transport button reaches the real simulation worker over `postMessage` and comes back as a day counter that moves on screen (#94 — every layer of that is proven separately, and the defect was that they were not connected); and that the interface still mounts, and says why, when `Worker` construction throws (#82); and that **every interactive control on the page is reachable** — `elementFromPoint` at five points across each control (its centre and four points 20 % in from its edges) resolves to that control or something inside it, on every tab and at every viewport the suite visits, *and* every control is accounted for rather than merely visited: a control that is never laid out in any state the test reaches has escaped the check, so the two the responsive rules deliberately drop below 720px are named in the spec and anything else appearing there fails. That last one is the general form of a defect this layer had been blind to (#88): the save panel and the Build panel were two independently-positioned `fixed` layers, and with the Build panel's numeric fallback expanded — one tap from the default — it covered 91 % of the save panel at 1280x720 and all five of New prison, Save now, Export, Load and Delete did nothing, while every existing assertion stayed green — because presence and reachability are different properties and only the second is what a player has. Five sample points rather than one for the same reason at a smaller scale: on that layout at 900x600 the centre alone found 11 unreachable controls and the five found 13, the extra two being buttons whose lower fifth had been carried off the bottom of the viewport. It deliberately does not re-test the HUD state machine, the responsive layout, the computed font stack, the camera transforms or the atlas schema: those are already proven in `tests/unit/ui-*.test.ts`, `tests/browser/ui-shell.spec.ts`, the Phaser-free `src/rendering/**` tests and `tests/contract/runtime-atlas-validation.test.ts`, and a browser test that repeats a headless one costs CI minutes and proves nothing new.

The **camera transforms** (`tests/browser/camera-coordinates.spec.ts`) are here for a reason that is narrower than the others and, on the evidence, the most necessary. `src/rendering/camera/coordinates.ts` reimplements Phaser's camera maths as pure functions so the renderer can convert coordinates without a live engine instance and the rules stay testable in the default environment. That reimplementation can be internally perfect and disagree with the engine that actually draws — and it was, for the whole life of the module. Issue #115: both functions modelled zoom as scaling about the viewport's corner while Phaser scales about its centre, so the build cursor was displaced by `origin × (1 / zoom − 1)` and a player could not place a wall where they clicked. The headless test could not fail, because it round-tripped each function through the other. Only a real camera can settle the claim, and only a real browser can hold one: `docs/CAMERA.md` explains why, and the spec compares `screenToWorld` against `camera.getWorldPoint` and `visibleWorldBounds` against `camera.worldView` at five zoom levels, drives a real mouse, and asserts that the old formula genuinely disagrees so a regression cannot pass. It deliberately does not re-test the tile-edge rule, `TILE_SIZE_PX`, zoom clamping or the culling margin: those are pure and already proven headlessly.

**Whether a DOM lifecycle event reaches its handler at all** (`tests/browser/lifecycle-save.spec.ts`) is here for a reason this layer had not been used for before: a fake event target is not merely a weak proof, it is a *vacuous* one. It receives whatever a test dispatches at it, so it agrees with the browser no matter which object the browser really dispatches at. `LifecycleSaveHandler`'s unit tests were complete and green while its `pagehide` listener, registered on `document`, never fired once in production (issue #92) — `pagehide` is dispatched at `Window` and window events do not propagate down to the document. The spec therefore drives a real navigation to obtain real, browser-generated lifecycle events (recorded synchronously into `sessionStorage`, which survives the navigation even though the fire-and-forget save may not) and requires both of them, in the order the browser delivered them. It deliberately does not assert *which object* each listener is registered on: `visibilitychange` bubbles from `document` up to `window`, so an implementation that registered both listeners on `window` would receive both events and be correct in production, and failing it would pin the wiring's shape rather than its contract — which injected target each listener lands on is a statement about `LifecycleSaveOptions.targets`, and the unit tests make it there. It also does not assert that the lifecycle save reached IndexedDB: that save is best-effort by design and the interval autosave is the durability mechanism, so asserting it would test the wrong contract. Confirmed to have teeth by restoring the #92 wiring — both listeners back on `document` — under which the whole unit file still passes and this spec records `['visibility-hidden']` where it requires `['pagehide', 'visibility-hidden']`.

A single non-DOM Web API can be reviewed and approved narrower than a full browser/E2E environment: `fake-indexeddb` (a pure-JS, dependency-free `indexedDB` implementation, devDependency-only) is approved for testing `src/persistence/local/indexeddb-store.ts` specifically — see `docs/PERSISTENCE.md`. Tests using it import a fresh `IDBFactory` instance explicitly per test rather than the `/auto` global-polluting entry point, so the default Vitest environment stays `node` and unaffected for every other test.

## Browser provisioning for `pnpm test:browser`

`@playwright/test` is pinned but its browser binaries are not in the package and are not checked in, so a machine that has never run the suite fails with "Executable doesn't exist". `scripts/provision-playwright-browsers.sh` installs what the suite needs and is safe to re-run:

```bash
scripts/provision-playwright-browsers.sh   # no root, no apt, no third-party repository
pnpm test:browser                          # 59 tests
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
| Browser E2E | Real browser storage/durability, real `DOMException` names, real quota exhaustion, save migration off real storage, whether a real DOM lifecycle event reaches its handler, agreement between a pure transform and a real Phaser camera, and the assembled page: canvas sizing, hit-testing, image decode | `tests/browser/`, via `pnpm test:browser` (own command, required CI job) |
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

`tests/foundation/ci-configuration-contract.test.ts` is its sibling for the files that describe how the project is built, checked out and deployed. Issue #138 found several of those enforced by nothing, each for the same reason: the configuration and the check that is supposed to enforce it live apart, so editing one and not the other leaves the suite green. It asserts three agreements mechanically:

- **Every header `public/_headers` sets is asserted somewhere in `scripts/verify-deployment-preview.mjs`**, and every header on the `/*` rule appears in that script's `SECURITY_HEADER_BASELINE` with the same value. Note the direction. The verifier checks its baseline against a real preview response, which catches a header *deleted from or weakened in* `public/_headers` — the mutation that used to survive, where removing three of the four security headers left every gate green. This test checks the reverse inclusion, which catches a header *added to* `public/_headers` and asserted nowhere. Neither direction substitutes for the other. A third check holds the exact set of header *names* the `/*` rule must carry, which is the one direction the two inclusion checks cannot cover: deleting a header from `public/_headers` **and** from `SECURITY_HEADER_BASELINE` in the same change satisfies both of them, and that is precisely the shape of #138's surviving mutation one level down. There is now a **Content-Security-Policy**, along with HSTS and cross-origin isolation ([ADR-0021](./adr/0021-http-response-security-headers.md), closing #105 finding 12). Note what is and is not gated. `pnpm verify:deployment` runs `vite preview`, which serves `dist/` through workerd and so applies `public/_headers` exactly as production does — that is a real check that the headers reach a real response, and CI runs it. Nothing checks that the policy still lets the renderer run, because the verifier never opens a browser and the browser suite's server (`tests/browser/vite.config.ts`) deliberately loads no Cloudflare plugin and therefore applies no `_headers` at all. The renderer's requirements were measured by execution when the policy landed and are recorded in ADR-0021; a Phaser upgrade that began needing `'unsafe-eval'`, or a build that started emitting a `blob:` worker, would pass every check here and break the page.
- **Every executable file with a shebang is matched by a `.gitattributes` LF pattern.** Mode bits come from `git ls-files -s` and the resolved attribute from `git check-attr`, so this tracks what git will really do on checkout instead of re-implementing gitattributes pattern matching.
- **Every `scripts/provision-*.sh` is called by a workflow or by `.claude/hooks/session-start.sh`**, or is listed in the test's `INTENTIONALLY_MANUAL` map with the reason. That map is empty today; all four scripts are wired to a gate.
`tests/foundation/unconsumed-content-contract.test.ts` makes "declared but unconsumed" a checked state instead of something a sweep rediscovers (issue #141). A content id referenced by nothing -- no `.ts` file under `src/` or `tests/`, excluding `src/content/` itself, because content referencing content is not consumption -- must appear in one of two lists with a reason: `PROTECTED_BY_DECISION` for the ids an accepted decision depends on, `AWAITING_CONSUMER` for the ones nothing names yet. Both directions fail: an id that is removed from a catalog while a list still accounts for it, and an id that gains a consumer while a list still says it has none. The first is the point -- `room.delivery-bay`, `room.storage-room` and `object.loading-dock-door` are all unreferenced *and* load-bearing for ADR 0017 and #99, and deleting one of them leaves the other 144 test files green.

It gates the narrower measure deliberately. "No consumer in `src/` outside the catalogs" is the honest answer to "does the game use this" and covers 58 of the 62 declared ids; gating that would mean 58 entries whose reason is uniformly "the system that would use it is not wired yet". `src/content/validate-catalog.ts` already argues this trade-off for enum discovery, and its conclusion holds here: a list nobody reads enforces nothing.

`tests/foundation/unreachable-invariant-contract.test.ts` makes "an exported invariant enforcer that nothing calls" a checked state rather than something a sweep rediscovers (issue #159). Every exported `assert*` function under `src/` must have a production call site — in another `src/` module, or elsewhere in its own module, which is the shape `assertGaplessSchedule`'s module-load loop over `DEFAULT_REGIME_SCHEDULES` has — or appear in `INTENTIONALLY_UNWIRED` with the reason. A call from `tests/` is recorded and is deliberately **not** sufficient: #158 declined to write a test for `assertGaplessDeploymentSchedule` because "testing a function nothing calls only converts dead code into tested dead code", so a gate satisfiable by that change would be a gate in name only. Both directions fail: an enforcer that loses its last production call site, and an allow-list entry that gains one or that names a function the scan no longer finds. `assertGaplessDeploymentSchedule` is the one entry, because whether to wire it into the deployment-schedule construction path or delete it is an open owner decision (#159 item 1), not an implementation detail. Its scanning rules live in `tests/helpers/invariant-enforcers.ts` and are exercised against fixtures in both directions, the same split `canonical-iteration-contract.test.ts` uses; comments are stripped with `canonical-iteration.ts`'s existing stripper rather than a second copy of that rule, and that is load-bearing — with the stripper replaced by an identity function, a commented-out call reads as a real one and the gate's main assertion goes green while nothing calls the enforcer.

`tests/foundation/art-catalog-generator-contract.test.ts` guards the one generator in this repository whose output is committed. Issue #141 found `tooling/build-source-art-catalog.mjs` invoked by nothing at all — not `package.json`, not a workflow, not another script — so editing an input silently did not regenerate the committed catalog. It is now `pnpm content:source-art`, and the test asserts it stays reachable, stays documented with the command an operator types, and refuses git-lfs pointer inputs **before** it deletes the published output. That last one is an ordering assertion because the generator cannot be run in a pointer-only checkout without destroying 23 tracked images — measured with the guard removed: it exits 0, reports success, and republishes 132-byte pointer files under content-addressed names.

`tests/foundation/documentation-claims-contract.test.ts` asserts documentation claims against the code, for the subset of them that is mechanically checkable (issue #121). `docs/ARCHITECTURE.md` declares its contracts binding, so a false sentence in it is a defect: it once listed "compressed immutable save versions" and "Supabase cloud sync" among things the app has, when nothing compresses anything and no module in `src/` can reach the cloud client at all — which sent one agent looking for a compression ratio and another for a wiring bug. Both claims are now asserted, in the direction that matters: the test fails when the *code* makes the sentence false, so the sentence gets rewritten in the same change instead of quietly becoming a lie. `docs/ROADMAP.md`'s Phase 0 claims about a linter and a pull-request template are asserted the same way, in both directions.

`tests/foundation/documentation-links-contract.test.ts` asserts every relative markdown link resolves to a file that exists. A confident pointer to an absent file is this repository's most frequent defect, and this covers the subset of it that is mechanically checkable: a link target is unambiguously a path, while a filename backticked in prose may be a module, a concept, or an example. It deliberately does not check the latter.

`tests/foundation/localization-key-completeness.test.ts` is the [ADR 0011](./adr/0011-localization-architecture.md) gate widened past the HUD. It scans every `.ts` file under `src/` (comments stripped) for a `<name>Key: '<literal>'` declaration and asserts each one resolves to real text in the bundled default locale, which is `defaultMessageCatalogEn` -- `src/content/default-locale-en.ts` merged under `src/services/localization/default-catalog.ts`'s service strings, so neither file alone is the whole default locale. A key field is typed as a well-formed identifier and never as "a key that exists", so a typo type-checks, passes schema validation and renders as the raw identifier on screen. It is scanned rather than assembled from imported catalogs on purpose: a list of catalog modules is a list that goes stale, which is how nine declared `input.action.*` descriptions had no entry anywhere while the suite was green. Every `*Key` field name must be classified as translatable or explicitly exempted with a reason, so a new key-shaped field cannot land in neither list.

`tests/unit/ui-hud-messages.test.ts` remains the narrower and stronger gate for the HUD specifically: it works from the `HUD_MESSAGE_KEYS` registry rather than from a scan, so it also checks placeholder filling, key spelling, that no HUD module hard-codes a `hud.*` literal outside `messages.ts`, and `AGENTS.md` boundary 1 (`src/ui/hud/**` may not import `src/simulation/**`).

`tests/determinism/` is the executable form of `docs/DETERMINISM.md` and, through [ADR 0009](./adr/0009-challenge-verification-strategy.md), of the challenge-verification guarantee: same seed plus same command stream reproduces an identical state hash, `snapshot() → restore() → run N ticks` equals running those ticks straight through, named RNG streams cannot perturb each other, and system order is a property of the declarations rather than of registration order. `ambient-nondeterminism-contract.test.ts` is a static contract in the spirit of `navigation-no-phaser.test.ts`: it walks the real transitive import graph out of `src/simulation/` and rejects clock, locale, DOM, storage and randomness sources, with a single per-file allow-list that fails when an entry goes stale. `canonical-iteration-contract.test.ts` is the second static contract of that family and covers the one rule in `docs/DETERMINISM.md` that had no guard at all (#132): it scans `src/simulation/`, `src/content/` and `src/persistence/` for enumerations of a `Map`/`Set` that reach no sort, and every one it finds must be either sorted or recorded in its allow-list with the reason insertion order is safe there. Its scanning rules live in `tests/helpers/canonical-iteration.ts` and are exercised against fixtures in both directions, the same split `tests/unit/simulation-message-keys.test.ts` uses with `src/content/validate-catalog.ts` — a static contract is only as good as its pattern, and a pattern that quietly stops matching leaves a green suite and no guard. Persistence was added by #177, which also had to make the scanner tell an array's `.entries()` from a `Map`'s — it does so from array-only usage of the same receiver expression in the same file, and both directions of that rule are fixture-pinned. Its scope is still a real limit: a `Map`-order walk in `src/rendering/` is not covered, deliberately, because rendering is not simulation and its sprite pools iterate insertion order by design. A determinism test that cannot fail is worse than none, so every test there is written against a break that was actually demonstrated — see that directory's table in `docs/DETERMINISM.md`.
