# Benchmarking contract

Lockstate uses benchmarks as reviewable engineering evidence. Benchmarks do not replace correctness tests, and elapsed time must not be asserted from unit tests.

## Supported commands

```bash
pnpm benchmark
pnpm benchmark:smoke
pnpm verify:benchmark
```

- `pnpm benchmark` runs the fuller local profile and writes `benchmark-results/full.json`.
- `pnpm benchmark:smoke` runs the short profile and writes `benchmark-results/smoke.json`.
- `pnpm verify:benchmark` runs the smoke profile and validates its schema, deterministic checksum and calculated statistics. CI uses this command.

Generated files under `benchmark-results/` are ignored. A result intended to establish or change a baseline must be attached to the issue/pull request or deliberately copied into a future reviewed baseline location with its scenario version and hardware context.

## Why the repository owns the harness

Vitest provides experimental micro-benchmark support, but Lockstate needs a stable, versioned result format that can later cover simulation ticks, chunk streaming, navigation, serialization and save sizes. The repository-owned harness uses Node's stable high-resolution performance API through `node:perf_hooks` and adds no dependency.

## Result contract

Every JSON result contains:

- result schema and harness versions;
- generation timestamp and repository commit when available;
- Node/V8 version, operating system, architecture, CPU model/count and total memory;
- selected profile;
- scenario ID, scenario version, description and explicit seed;
- warm-up iterations and separately measured iterations;
- operations per measured iteration;
- one deterministic checksum and the number of unique measured checksums;
- raw duration samples;
- min, max, mean, median, p95, population standard deviation and throughput;
- an optional `metrics` object of scenario-specific structured evidence.

The validator recomputes the scenario checksum and statistical summary from the stored samples. A scenario that produces different checksums across measured iterations fails before a result is written.

## Optional structured metrics

A scenario's `run()` may return either the original bare string/number
checksum, or `{ checksum, metrics }` where `metrics` is any
JSON-serializable object of scenario-specific evidence the summary
statistics don't capture -- issue #22's navigation scenarios use it for
work units (expanded search nodes), cache hit/miss/eviction counts, queue
latency distribution and flow-field activation counts. `metrics` must be
exactly as deterministic as the checksum: the validator recomputes it and
requires a deep match, the same guarantee the checksum already gets.
Scenarios that only return a bare checksum are unaffected -- `metrics` is
absent from their result, not `null` or `{}`.

## Scenario rules

A benchmark scenario must:

1. Have a stable ID and integer version.
2. Define explicit `smoke` and `full` profiles.
3. Keep setup outside the measured section unless setup cost is the subject of the benchmark.
4. Accept explicit configuration, including a seed where the workload uses generated data.
5. Return a deterministic checksum or invariant that proves the workload executed.
6. Avoid live network services, wall-clock decisions and hidden mutable state.
7. Avoid Phaser/DOM imports unless it belongs to a future browser-rendering benchmark suite.
8. Increase its version when the workload or meaning of a sample changes.

Warm-up iterations allow JIT and allocation paths to stabilize. They are never mixed with measured samples.

## CI policy

The self-hosted WSL2 runner executes the smoke profile to prove that:

- the CLI works;
- the scenario completes;
- checksums are deterministic;
- JSON output matches the versioned contract;
- summary calculations are internally consistent;
- generated output remains ignored and the tracked worktree stays clean.

CI does **not** fail on wall-clock regression thresholds yet. Shared/self-hosted machines are noisy, and the current foundation workload is only a harness smoke test, not a gameplay model. Do not introduce a timing threshold until all of the following are recorded:

- representative subsystem and scenario version;
- controlled hardware/runner profile;
- warm-up and sample counts;
- repeated baseline runs and observed variance;
- target percentile and permitted regression;
- owner and review procedure for intentional baseline changes.

Correctness and deterministic checksum failures are hard gates immediately.

## Current smoke scenario

`foundation.integer-mix@1` is a deterministic CPU workload used only to exercise the harness, result schema and checksum validation. It is deliberately not the simulation RNG, not an entity model and not a performance target for gameplay code. Its throughput must never be presented as Lockstate simulation capacity.

## Delivered: navigation work-budget/queue/flow-field scenarios (issue #22)

`navigation.meal-rush`, `navigation.lockdown-return` and `navigation.mixed-destination` (`benchmarks/scenarios/navigation-actor-tiers.mjs`) measure `src/simulation/navigation/`'s path-request queue, work budget and flow-field sharing at the 250 (smoke) and 5,000 (full) actor tiers, each returning `{ checksum, metrics }` — `metrics` carries work units (expanded search nodes), cache hit/miss, flow-field activation counts and per-tick latency distribution, deterministically re-verified by `scripts/verify-benchmark-result.mjs` exactly like the checksum. The remaining two tiers (1,000/2,500) and a memory reading are covered by the separate, non-CI-gating `scripts/run-navigation-actor-tier-report.mjs` — see `docs/NAVIGATION.md`'s Performance section and `docs/adr/0007-navigation-work-budgets-and-flow-fields.md` for evidence, rationale and why these are a hand-rolled mirror rather than an import of the production modules.

## Planned scenario families

These are inputs to future measurement work, not accepted implementation decisions or budgets:

- chunk storage/culling candidates: 16×16, 32×32 and 64×64 logical tiles;
- fixed-step simulation throughput and backlog behavior;
- worker snapshot/delta encode, transfer and decode cost;
- save serialization, compression, checksum and migration cost;
- IndexedDB read/write and recovery behavior;
- renderer submission/culling and browser frame-time percentiles in a future browser harness.

Each family requires a dedicated issue, representative fixtures and architecture ownership before it can gate a pull request.

## Reporting benchmark evidence

Performance-sensitive pull requests should include:

- exact command and profile;
- commit SHA;
- scenario ID/version and configuration;
- hardware/runtime metadata from the JSON result;
- repeated results when making a budget decision;
- comparison method and practical interpretation;
- confirmation that correctness tests and deterministic checksums still pass.

A single fastest run is not evidence. Prefer medians and percentiles, retain raw samples, and explain outliers rather than deleting them without justification.
