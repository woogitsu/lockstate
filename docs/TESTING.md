# Testing contract

Lockstate treats tests as executable architecture. A feature is not complete because it appears to work in a browser; its behavior, boundaries and failure modes must be verifiable at the lowest appropriate layer.

## Supported commands

```bash
pnpm typecheck
pnpm test
pnpm test:watch
pnpm test:browser
pnpm verify
pnpm verify:deployment
pnpm verify:sql
```

`pnpm test` runs the complete Vitest suite once and fails when no test is discovered. `pnpm verify` typechecks test and production sources, runs the test suite and builds the production Cloudflare package.

`pnpm verify:sql` is separate from `pnpm verify` because it needs a PostgreSQL server: it applies every migration in `supabase/migrations/` and runs every pgTAP suite in `supabase/tests/` against a scratch database, using the compatibility harness in `scripts/sql/`. It is the check that can run when the Supabase local stack's container images are unreachable; it proves the SQL, not the hosted platform around it (see `docs/CLOUD_SAVE.md` for the cloud-save schema and `docs/TRUSTED_SERVICES.md` for the entitlement/challenge schema). Separate from `pnpm verify` does **not** mean optional: it is a required CI step (see "Database provisioning" below). `pnpm test:browser` runs the opt-in Chromium project (`tests/browser/`) and is deliberately **not** part of `pnpm test` or `pnpm verify`.

The persistence measurement harness is likewise opt-in: `pnpm exec vitest run --config tests/perf/vitest.perf.config.ts`. Its files are named `*.perf.ts` so the default suite never collects them, and it asserts only correctness invariants — never elapsed time (see `docs/BENCHMARKING.md`).

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

A single non-DOM Web API can be reviewed and approved narrower than a full browser/E2E environment: `fake-indexeddb` (a pure-JS, dependency-free `indexedDB` implementation, devDependency-only) is approved for testing `src/persistence/local/indexeddb-store.ts` specifically — see `docs/PERSISTENCE.md`. Tests using it import a fresh `IDBFactory` instance explicitly per test rather than the `/auto` global-polluting entry point, so the default Vitest environment stays `node` and unaffected for every other test.

## Test layers

| Layer | Purpose | Normal location |
| --- | --- | --- |
| Unit | One pure module, algorithm or invariant | Colocated `src/**/*.test.ts` |
| Contract | Typed boundary, schema, protocol or repository contract | `tests/contract/` or a named folder under `tests/` |
| Integration | Two or more real project modules wired together | `tests/integration/` |
| Determinism | Same initial state and command stream produce identical state/hash | `tests/determinism/` |
| Migration | Versioned fixture upgrades and forward-only save compatibility | `tests/migrations/` |
| Browser E2E | Real browser storage/durability, real `DOMException` names, real quota exhaustion | `tests/browser/`, opt-in via `pnpm test:browser` |
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
