# Testing contract

Lockstate treats tests as executable architecture. A feature is not complete because it appears to work in a browser; its behavior, boundaries and failure modes must be verifiable at the lowest appropriate layer.

## Supported commands

```bash
pnpm typecheck
pnpm test
pnpm test:watch
pnpm verify
pnpm verify:deployment
```

`pnpm test` runs the complete Vitest suite once and fails when no test is discovered. `pnpm verify` typechecks test and production sources, runs the test suite and builds the production Cloudflare package.

## Default environment

Vitest runs in the Node environment by default. Pure simulation, protocol, serialization, migration, economy, navigation and deterministic scheduling tests must not import Phaser, touch the DOM or require browser globals.

A future browser/E2E project may use Playwright or Vitest Browser Mode after a dedicated dependency and architecture review. Browser setup must remain explicit rather than silently changing the environment for every test.

## Test layers

| Layer | Purpose | Normal location |
| --- | --- | --- |
| Unit | One pure module, algorithm or invariant | Colocated `src/**/*.test.ts` |
| Contract | Typed boundary, schema, protocol or repository contract | `tests/contract/` or a named folder under `tests/` |
| Integration | Two or more real project modules wired together | `tests/integration/` |
| Determinism | Same initial state and command stream produce identical state/hash | `tests/determinism/` |
| Migration | Versioned fixture upgrades and forward-only save compatibility | `tests/migrations/` |
| Browser E2E | Real browser input, rendering shell, deep navigation and accessibility | Future explicit browser test project |
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

Deployment-sensitive work also requires `pnpm verify:deployment`. Performance-sensitive work requires a benchmark scenario and result evidence under the benchmark contract; elapsed-time assertions do not belong in unit tests.

## Coverage policy

There is no arbitrary repository-wide percentage threshold during the pre-alpha foundation. New behavior still requires tests. Coverage thresholds may be introduced only after representative systems exist and uncovered risk can be mapped to meaningful gates rather than a vanity number.

## Current executable baseline

`tests/foundation/repository-contract.test.ts` guards the pinned Node/pnpm metadata, strict compiler options, test-source inclusion and the rule that an empty suite cannot pass. It is a foundation contract, not a substitute for system-specific tests.
