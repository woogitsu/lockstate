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
| `navigation.production.yard-crossing` | a population crossing one open 64×64 region, where one search is worth a large fraction of the whole budget; reports `tickOvershootRatio` | **production** |
| `actors.production.render-publication` | `LocomotionStore` + `encodeRenderActorsKeyframe` + `decodeRenderActorsPayload` + `actorsFromDelta` over one render-delta publication; the counted work behind ADR 0059's cost table | **production** |

For the same 250-request meal rush, the modelled scenario reports 4,780 work
units and the production one 16,087. Three mutations of real navigation code
turn **both drain scenarios** — `navigation.production.meal-rush` and
`navigation.production.lockdown-return` — red, and leave every modelled
checksum bit-identical. Measured on the smoke profile:

| mutation of `src/` | `production.meal-rush` | `production.lockdown-return` | `production.single-request-budget` |
| --- | --- | --- | --- |
| `heuristic()` returns `0` (`local-search.ts:99`) | `totalExpansions` 24,195 > 16,900 | 27,672 > 20,900 | `expansionsForGuidedRequest` 2,077 > 70 |
| region-Dijkstra early exit removed (`region-dijkstra.ts:81`) | 19,415 > 16,900 | 21,472 > 20,900 | passes, structurally |
| `workBudgetPerTick` 2,000 → 8,000 (`new-session.ts:66`) | `maxExpansionsInOneTick` 8,035 > 2,400 | 8,063 > 2,400 | `workBudgetPerTick` 8,000 ≠ 2,000 |

`navigation.production.single-request-budget` answers two of the three, and the
third is a property of its layout rather than a gap in its bounds: it builds a
single open region (`regionCount: 1` is one of its pinned metrics), so
`runRegionDijkstra` has no second region to keep expanding into and the early
exit has nothing to exit. Mutating it leaves that scenario's every metric
byte-identical, and no bound can see a number that did not move.

The budget mutation used to be the same shape of silence, and that one *was* a
gap. `expansionsForOneRequest` came back byte-identical at 4,030 — the search
never reads the budget — and the only two metrics that moved,
`workBudgetPerTick` and `budgetOvershootRatio` (2.015 → 0.504), were bounded by
nothing, so the scenario reported a single request taking *half* the per-tick
allowance instead of twice it and stayed green. Both are bounded now
(`workBudgetPerTick: { equals: 2_000 }` and a floor under the ratio), which is
the rule below about a ceiling not being enough, applied to a denominator that
grew rather than to a workload that broke.

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

**And how a `.mjs` benchmark is typechecked against that `.ts`.** It is not the
`registerHooks` resolver, which is a runtime arrangement TypeScript never sees.
Until #602 those calls were checked by nothing at all: `benchmarks/` was outside
every `tsconfig` `include`, so PR #581's fourth parameter, inserted *second*
into `LocomotionStore.advance`, left `actor-render-publication.mjs` calling it
with three arguments and neither `pnpm typecheck` nor `pnpm test` could see it.
`tsconfig.tools.json` now covers `benchmarks/`, `scripts/` and `tooling/` with
`checkJs` — but that alone reports nothing here, because each loader below
imports by `import()` of a **computed** URL string and TypeScript resolves no
non-literal dynamic import, so every production symbol would arrive as `any`.
The five loaders therefore carry `@returns` types written as
`Pick<typeof import('../src/…'), 'X'>`: derived from production, so they follow
a signature that changes and fail to compile against a symbol that disappears.
What that does **not** check is the wiring — that the key `LocomotionStore` is
assigned `locomotion.LocomotionStore` and not something else — which runs
through `any` and only a benchmark run would notice.

Loading the production graph costs roughly 500 ms once per process (most of it
`runtime/new-session.ts`, imported so the work budget is *read* rather than
copied). `actors.production.render-publication` loads a second graph for the
same reason -- `worker/state-machine.ts` for `RENDER_DELTA_PUBLISH_INTERVAL_MS`
and `clock/fixed-step-clock.ts` for the kernel step, so a publication's cadence
is read rather than copied -- which is about 300 ms more.

**This paragraph used to close "which runs in about 12 s in total", and that
could not be reproduced.** Measured on 2026-08-28 on the shared container, by
running the two binaries directly rather than through `pnpm` (which aborts in a
worktree with `ERR_PNPM_UNSAFE_MODULES_DIR`): the smoke profile's twelve
scenarios take **1.5 s** and the verification step **0.8 s**, so
`verify:benchmark`'s own work is about **2.3 s**. Both figures are wall clock on
a machine that was not quiet, and neither includes `pnpm`/corepack start-up,
which is where the difference may live. The old number is named here rather than
overwritten silently, because a benchmark document that quietly re-baselines its
own cost is the shape of thing this file exists to refuse.

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

### What a counted-work bound cannot see, measured

It bounds *how many times* production touches a thing and *how many bytes* it
spends on one. It cannot bound what happens between two of those touches, so a
change that made a per-actor step twice as expensive without changing how often
it runs would pass every bound in this repository.

That limit is worth stating next to its consolation, which is that on this
runner wall clock could not have caught those regressions either. Two mutations
of `src/` were made by hand while `actors.production.render-publication` was
being written, each one strictly more work than the code it replaced, and each
timed over 15 samples at 5,000 actors:

| mutation of `src/` | counted-work bound | wall clock, min / median |
| --- | --- | --- |
| unmutated baseline | — | 1.705 / 2.915 ms |
| `RENDER_ACTORS_RECORD_WORDS` 5 → 6, a 20% larger record | `payloadByteLength` 12,016 ≠ 10,016 | 1.553 / 2.979 ms |
| a third liveness pass in `encodeRenderActorsKeyframe` | `isIndexAliveCalls` 1,650 ≠ 1,100 | 1.493 / 2.399 ms |

Both regressions measured **faster** than the tree they regressed, by minimum
and by median. That is not a claim that the mutations are free; it is a
measurement of how much signal a duration carries on a shared machine, and it is
the reason the rule above is "counted work only, never a duration" rather than a
preference.

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

### If a timing threshold is ever proposed, the statistic matters more than the number

Recorded here because the list above asks for "observed variance" and does not
say how to read it. Measured on the shared container on 2026-08-28, three
consecutive smoke-profile runs on an unchanged tree, with two other agents
working — same scenario, same three samples per run, three different ways of
reducing them:

| statistic of `navigation.production.single-request-budget` | range across the three runs |
| --- | --- |
| mean of the samples | 7.004 – 8.586 ms (**23%**) |
| median of the samples | 6.889 – 7.201 ms (4.5%) |
| **minimum** of the samples | 6.731 – 6.834 ms (**1.5%**) |

The minimum is fifteen times tighter than the mean, and not by luck: preemption
is one-sided. Another process can only make a sample slower, so the minimum over
repeats is the closest available estimate of uncontended cost and its error runs
in one direction only. A mean or a p95 mixes the code's cost with the runner's
load and cannot tell them apart.

None of that makes a wall-clock gate advisable here -- see the section above,
where two real regressions both measured *faster* than the code they regressed
-- but if one is ever proposed, it should be a minimum over many repeats, and
the six items above should be recorded for it first.

## Wall-clock evidence that is deliberately not a gate

`scripts/report-navigation-cost-model.mjs` measures what one expanded search
node costs in wall clock, on the production navigation modules, and prints what
ADR 0007's `workBudgetPerTick` therefore buys. It runs nothing in CI and gates
nothing, for the reason immediately above.

It exists for **#413**, whose remaining half is that
`path-request-queue.ts`'s budget counts expanded search nodes rather than wall
clock. Counted work is the right unit for a deterministic kernel — ADR 0009's
replay guarantee, the save format and the named RNG streams all depend on the
tick computing the same thing everywhere — and it is only *honest* if one unit
costs roughly the same everywhere **and** if the budget is what a tick's cost is
made of. The script measures both, in three sections.

**The table this section used to carry was measured with an instrument that
over-attributed, and both the table and the conclusion drawn from it are
withdrawn.** It read:

> | `meal-rush` | full | 51,901 | 3.270 / 3.368 / 3.847 | 6.54 ms |

and concluded *"The shipped budget already exceeds the allowance #413 states, as
a floor … 2,000 expansions cost at least 3.1 ms in the cheapest shape and at
least 6.5 ms in the dearest."* Every number in it was really measured. What was
wrong is the denominator: the script divided **the whole scenario run** by its
expansions, and a run also contains one lazy `buildNavigationGraph` rebuild
(12–17 ms, paid on the first `NavigationSystem.update`) and, on every tick, a
`PathRequestQueue.processTick` prelude proportional to queue depth. Neither is
an expansion. On `meal-rush` full, about two thirds of what the quotient charged
to expansions was one of those two. The conclusion does not survive the
correction: an expansion in that shape costs about 1.28 µs, so 2,000 of them
cost about 2.6 ms, and the budget does **not** exceed a 3 ms allowance on the
term it bounds.

Marking both directions rather than overwriting, per `docs/AGENT_WORKFLOW.md`
§4: the withdrawn reading was not a guess, it was a rigorous measurement of the
wrong quantity, which is the failure this document is most likely to repeat.

### 1. The unit: one `findRoute`, timed on its own

Measured 2026-08-28 at `21e5f66` (v0.0.156) plus this branch, nine repeats,
minimum per row — one corner-to-corner route across one open square region,
which is the shape with the largest frontier:

| open region | expansions | route ms at min | µs per expansion |
| --- | --- | --- | --- |
| 32×32 | 987 | 1.35 | 1.370 |
| 64×64 | 4,030 | 6.29 | 1.560 |
| 128×128 | 16,162 | 34.07 | 2.108 |
| 256×256 | 65,200 | 199.89 | 3.066 |

**An expansion is not a constant amount of time, and it is close enough.** It
moves 2.2× over a 66× range in search size — against 7.0× before the frontier
heap landed (#413 recorded 15–20 µs and rising). At the dearest, 2,000
expansions are 6.13 ms of search; at the cheapest, 2.74 ms.

### 2. The tick: `NavigationSystem.update`, timed per tick

Same run, element-wise minimum per tick index across repeats, one open 64×64
region, the shipped budget of 2,000:

| pending | tick 0 | steady tick | steady expansions | worst tick after 0 | its expansions | prelude at steady |
| --- | --- | --- | --- | --- | --- | --- |
| 250 | 12.43 ms | 4.06 ms | 2,332 | 6.96 ms | 4,026 | 0.42 ms |
| 5,000 | 16.37 ms | 6.79 ms | 2,332 | 9.82 ms | 3,979 | 3.15 ms |

**The two steady rows differ by 2.7 ms on identical counted work.** That gap is
`processTick`'s prelude — it sorts every pending entry and computes a
flow-field group key, `routeContextFingerprint` included, for every pending
request every tick, including the ones the tick will never reach — and no budget
value changes it. Tick 0 is the one-off graph rebuild, and no budget value
changes that either. A fourth term is gated rather than timed:
`navigation.production.yard-crossing` reports `tickOvershootRatio` at 2.04
(smoke) and 2.46 (full), because the queue tests `usedBudget >= workBudget`
before a request and never inside one.

So the reading #413 needs is not that the unit is wrong. It is that the budget
bounds one of four terms, and not the largest one at scale. Whether the budget
may therefore be non-deterministic is not a number and is not settled here; it
is the architectural question #413's own comment hands to an ADR.

## Current smoke scenario

`foundation.integer-mix@1` is a deterministic CPU workload used only to exercise the harness, result schema and checksum validation. It is deliberately not the simulation RNG, not an entity model and not a performance target for gameplay code. Its throughput must never be presented as Lockstate simulation capacity.

## Delivered: navigation work-budget/queue/flow-field scenarios (issue #22)

`navigation.meal-rush`, `navigation.lockdown-return` and `navigation.mixed-destination` (`benchmarks/scenarios/navigation-actor-tiers.mjs`) **model** a path-request queue, work budget and flow-field sharing at the 250 (smoke) and 5,000 (full) actor tiers — they import nothing from `src/` and gate nothing about it; the file's own header now says so, and the scenarios that do drive the production modules are `navigation.production.*` (#410). **This sentence said they "measure `src/simulation/navigation/`"** and admitted the mirror only in a trailing clause deferring to two other documents. Each returns `{ checksum, metrics }`, where `metrics` carries work units (expanded search nodes), cache hit/miss, flow-field activation counts and per-tick latency distribution, deterministically re-verified by `scripts/verify-benchmark-result.mjs` exactly like the checksum. The remaining two tiers (1,000/2,500) and a memory reading are covered by the separate, non-CI-gating `scripts/run-navigation-actor-tier-report.mjs` — see `docs/NAVIGATION.md`'s Performance section and `docs/adr/0007-navigation-work-budgets-and-flow-fields.md` for evidence, rationale and why these are a hand-rolled mirror rather than an import of the production modules.

A fourth production scenario, `navigation.production.yard-crossing`, drives a
shape none of the three above covers and #413 needed: many requests whose
searches each have a large frontier. In a prison block a request costs 60–130
expansions, so a 2,000-expansion budget buys twenty of them and the
always-process-one overshoot is invisible; in one open yard region a single
request is worth 2,667 expansions and the busiest tick spends 2.04× (smoke) to
2.46× (full) what it budgeted. That ratio is bounded from **below**, so the
scenario's subject cannot quietly disappear, and `ticksToDrain` is bounded from
above so a re-calibration of the budget has to arrive with its cost re-measured.

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
- worker snapshot/delta encode, transfer and decode cost — **the delta half of
  this shipped** as `actors.production.render-publication`, which drives
  `encodeRenderActorsKeyframe`, `decodeRenderActorsPayload` and `actorsFromDelta`
  over a real population and bounds the counted work in all three. What is still
  open is the two words in the middle: **transfer**, meaning a real
  `postMessage` of a 100 KB buffer rather than an in-process hand-over, which is
  ADR 0059's own open question 1; and **snapshot**, which goes through
  `captureSessionSnapshot` and shares nothing with the delta path;
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
