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

## Production code or a model of it

Every scenario declares which it is, because the distinction turned out to
matter (#410). A **production** scenario imports `src/` through
`benchmarks/production-modules.mjs` and measures what the shipped modules
count. A **modelled** scenario re-implements the same *shape* of algorithm in
`.mjs`, so its numbers hold for any implementation — including one this
repository does not have. A modelled scenario is directional evidence and can
never be a gate. Which one a file is, is declared in its own first lines and
checked against its imports by
`tests/foundation/benchmark-scenario-kind-contract.test.ts` — see scenario rule
9 below, which is the rule that table used to record by hand.

| Scenario | Subject | Kind |
| --- | --- | --- |
| `foundation.integer-mix` | harness/schema smoke test only | modelled by design (it models nothing) |
| `world.chunk-size-sparse-edge`, `world.chunk-size-dense-prison` | chunk storage/culling; **ADR 0004 was decided on these** | modelled — hand-rolled chunk storage, no `SparseWorld` import |
| `entity.soa.benchmark` | SoA entity storage | modelled — declares its own `EntityStore` |
| `kernel.throughput.benchmark` | tick loop, command queue, multi-rate scheduling | modelled — mock systems |
| `navigation.meal-rush`, `navigation.lockdown-return`, `navigation.mixed-destination` | navigation work budget/queue/flow field | modelled — see the file header for what it costs |
| `navigation.production.meal-rush`, `navigation.production.lockdown-return` | `NavigationSystem` + `PathRequestQueue` + `RouteCache` + `FlowFieldCache` draining a population | **production** |
| `navigation.production.single-request-budget` | one `findRoute` against `DEFAULT_NAVIGATION_SYSTEM_OPTIONS.workBudgetPerTick` | **production** |

For the same 250-request meal rush, the modelled scenario reports 4,780 work
units and the production one 16,087. Three mutations of real navigation code
(a disabled A\* heuristic, a removed region-Dijkstra early exit, a work budget
raised from 2,000 to 8,000) each turn every production scenario red and leave
every modelled checksum bit-identical.

### How a `.mjs` benchmark imports `.ts`

`benchmarks/production-modules.mjs` registers a `module.registerHooks`
resolver that maps `src/`'s extension-less specifiers (`./door`, written for
`moduleResolution: "Bundler"`) onto the `.ts` files beside them, and the
`benchmark`/`benchmark:smoke`/`verify:benchmark` scripts pass
`--experimental-transform-types` because `SparseWorld`, `PathRequestQueue` and
`NavigationSystem` use parameter properties, which Node's default strip-only
type stripping refuses. No build step and no new dependency. Running the
harness without the flag fails with one actionable line rather than a syntax
error from inside a production file.

Loading the production graph costs roughly 500 ms once per process (most of it
`runtime/new-session.ts`, imported so the work budget is *read* rather than
copied). The three production scenarios add about 1.4 s to the smoke profile,
which runs in about 12 s in total.

## Counted-work gates: `metricBounds`

Harness v2 lets a scenario profile declare `metricBounds` — `{ max }`,
`{ min }` and/or `{ equals }` against a named top-level metric. The harness
enforces them after a run and `scripts/verify-benchmark-result.mjs` enforces
them again against the stored result, so a violation fails `pnpm benchmark`,
`pnpm benchmark:smoke` and `pnpm verify:benchmark`.

Rules, none of them optional:

- **Counted work only, never a duration.** The CI policy below is unchanged;
  `samplesMs` and `summary` are not reachable from a bound.
- **A bound is a literal a human wrote down after a measured run.** A bound a
  scenario computes from its own output holds for every implementation and
  gates nothing — that is exactly the defect #410 was filed about.
- **A ceiling alone is not enough.** A change that breaks the workload lowers
  every work count, and a ceiling calls that an improvement. Pin the outcome
  too (`resolvedOk`/`resolvedFailed` with `equals`), or bound the quantity
  semantically (`maxExpansionsInOneTick` is pinned at 20% over ADR 0007's
  `workBudgetPerTick`, so raising the budget fails even though total work
  falls).
- **Changing a bound is a reviewed act.** Re-baseline deliberately, with the
  run that justifies it attached, exactly like any other budget decision here.

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
9. Say in its own file, in the first lines, whether it drives production code
   or models it — and if it models it, never let its `description` claim
   otherwise. A scenario named after a subsystem it does not import is the
   defect #410 was filed about.

Rule 9 is the one rule here with a gate:
`tests/foundation/benchmark-scenario-kind-contract.test.ts`. Every file in
`benchmarks/scenarios/` opens with exactly one of two markers,
`// MODELLED, NOT PRODUCTION.` or `DRIVES PRODUCTION CODE, NOT A MODEL OF IT.`,
and the gate checks the marker against the mechanical fact — whether the file
imports `benchmarks/production-modules.mjs`, the only route from a `.mjs`
benchmark into `src/` — in **both** directions. A file claiming to drive
production code while importing nothing is the false gate #410 was about, and
nothing else in the harness can see it. A modelled scenario's `description`
must also open with `MODELLED, not production:`.

It exists because the rule above did not sweep. #410 fixed the three modelled
navigation descriptions by hand and left the class: measured on the tree that
added the gate, four of the six scenario files — `entity-soa.mjs`,
`kernel-throughput.mjs`, `world-chunk-size.mjs` and `foundation-smoke.mjs` —
opened with a bare seed constant and said nothing, for the whole of rule 9's
life. `kernel.throughput.benchmark`'s description read *"Evaluates headless
**Kernel** tick loop throughput"* while importing nothing from `src/`, and
`Kernel` is the exported production class at
`src/simulation/kernel/kernel.ts` — #410's defect verbatim, in the file beside
the one #410 corrected. Fixing four descriptions is what the previous pass did;
this time the class is checked.

Warm-up iterations allow JIT and allocation paths to stabilize. They are never mixed with measured samples.

## CI policy

The self-hosted WSL2 runner executes the smoke profile to prove that:

- the CLI works;
- the scenario completes;
- checksums are deterministic;
- JSON output matches the versioned contract;
- summary calculations are internally consistent;
- generated output remains ignored and the tracked worktree stays clean.

CI **does** fail on a counted-work regression, through `metricBounds` above.
Counted work is deterministic — same seed, same number, any machine — so it
carries none of the reasons the wall-clock policy below exists.

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

`navigation.meal-rush`, `navigation.lockdown-return` and `navigation.mixed-destination` (`benchmarks/scenarios/navigation-actor-tiers.mjs`) **model** a path-request queue, work budget and flow-field sharing at the 250 (smoke) and 5,000 (full) actor tiers — they import nothing from `src/` and gate nothing about it; the file's own header now says so, and the scenarios that do drive the production modules are `navigation.production.*` (#410). **This sentence said they "measure `src/simulation/navigation/`"** and admitted the mirror only in a trailing clause deferring to two other documents. Each returns `{ checksum, metrics }`, where `metrics` carries work units (expanded search nodes), cache hit/miss, flow-field activation counts and per-tick latency distribution, deterministically re-verified by `scripts/verify-benchmark-result.mjs` exactly like the checksum. The remaining two tiers (1,000/2,500) and a memory reading are covered by the separate, non-CI-gating `scripts/run-navigation-actor-tier-report.mjs` — see `docs/NAVIGATION.md`'s Performance section and `docs/adr/0007-navigation-work-budgets-and-flow-fields.md` for evidence, rationale and why these are a hand-rolled mirror rather than an import of the production modules.

**These three are modelled** (see the table above), and #410 replaced them as
the gate rather than deleting them: `navigation.production.meal-rush` and
`navigation.production.lockdown-return` drive the same two shapes through
`src/simulation/navigation/` and carry the counted-work bounds. The modelled
three remain registered as a cheap directional reference and as the workload
`scripts/run-navigation-actor-tier-report.mjs` reports on. Nothing gates on
`navigation.mixed-destination`; it has no production counterpart yet.

## Planned scenario families

Two families that were on this list have since been delivered, and neither is
an input to future work any more. Chunk storage/culling candidates (16×16,
32×32 and 64×64 logical tiles) shipped as `world.chunk-size-sparse-edge` and
`world.chunk-size-dense-prison`, and their measurements are what
[ADR-0004](./adr/0004-chunk-size-selection.md) decided the production chunk
size on — the one case so far where a family on this list did go on to gate a
decision. **That is worth stating plainly rather than as a credit: those two
scenarios hand-roll chunk storage and import no `SparseWorld`, so an accepted
architectural decision rests on a model of the production module rather than on
the module.** #410 converted the navigation family and deliberately left this
one; re-deciding the chunk size against the real `SparseWorld` is its own piece
of work and is not claimed here. Fixed-step simulation throughput shipped as
`kernel.throughput.benchmark` (tick loop, command queue and multi-rate system
scheduling; backlog behaviour under a starved tick is still unmeasured). Both
are registered in `benchmarks/registry.mjs` and run under `pnpm benchmark`.

The rest are still inputs to future measurement work, not accepted implementation decisions or budgets:

- backlog behavior under a tick the scheduler cannot keep up with;
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
