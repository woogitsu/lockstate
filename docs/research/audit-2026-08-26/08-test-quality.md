# 08 — Test Quality & Coverage Audit

**Repo:** `/workspace/lockstate` · **Auditor scope:** test quality, mutation survival, coverage gaps
**Container baseline:** `pnpm typecheck` clean; `pnpm test` = 233 files, 2628 pass, 1 skipped, ~37 s
**Excluded as container artefacts (not findings):** Git-LFS atlas pointers (browser image-decode spec, `pnpm verify:assets`).

## Executive summary

**Verdict: a strong, self-aware suite with five specific holes — and the holes are not where the
file count suggests.** 233 test files for 574 sources is not padding: the anti-vacuity discipline,
the differential navigation testing and the 400-tick replay fingerprint are better than most
production codebases achieve. But **7 of 16 one-line mutations survived all 2,604 tests**, and every
survivor sits in something the repo's own documents call load-bearing.

| Severity | Count | IDs |
|---|---|---|
| High | 4 | TST-01, TST-02, TST-03, TST-04 |
| Medium | 5 | TST-05, TST-06, TST-07, TST-08, TST-09 |
| Low | 3 | TST-10, TST-11, TST-12 |
| Info | 1 | TST-13 |

The three that matter most:

- **Money has no unit test.** No test imports `treasury.ts`; the one `spend()` call in the suite
  never spends the exact balance, so `canAfford`'s `<=` → `<` passes everything (TST-01).
- **The navigation budget is configured everywhere and enforced nowhere.** Setting the per-tick
  work budget to `Number.MAX_SAFE_INTEGER` — unbounded A*, explicitly forbidden by `AGENTS.md`
  boundary 9 — passes all 2,604 tests (TST-04).
- **One test cannot detect the defect it was written for.** `projection-ordering.test.ts` defends
  the room projection's occupant sort in 30 lines of prose, but feeds it a registry that already
  sorts — so deleting the sort is invisible (TST-02).

One CI hazard worth flagging outside the test-quality frame: `adr-status-queue-anchor-contract`
is currently at exactly its staleness budget while `version.yml` auto-bumps the patch version on
every merge to `main`, so **the next merge turns `pnpm test` red with no code change** (TST-06).

---

## 0. Method, and one limitation

No coverage provider is installed (`@vitest/coverage-v8` / `-istanbul` are absent from
`node_modules`; `package.json` declares neither). Per the audit rules I did **not** install one.
Instead I did two things that are strictly stronger than a line-coverage number:

1. **Real mutation testing.** I copied the tree to a scratch sandbox (`/tmp/.../scratchpad/mut`,
   `node_modules` symlinked, repo untouched), applied 16 one-line mutations, and ran the **full
   2,604-test suite** against each. `tests/foundation/ci-configuration-contract.test.ts` was
   excluded from mutant runs only because it shells out to `git ls-files` and the sandbox has no
   `.git` — a sandbox artefact, not a defect. Raw results:
   `/tmp/.../scratchpad/audit/mutation-results.txt` and `-2.txt`.
2. **Static import-reachability mapping** of all 296 `src/**` modules against all 233 test files
   plus 13 helpers, transitively (`/tmp/.../scratchpad/map.mjs`).

**Headline: this is a genuinely strong suite that has already been through at least one
self-directed mutation-testing pass** (`tests/helpers/field-sensitivity.ts:1-60` documents issue
#264 killing tautological hash tests; `tests/determinism/projection-ordering.test.ts:75-84`
literally guards its own fixture against becoming vacuous). The findings below are therefore not
"this suite is weak" — they are the specific seams that pass survived.

**7 of 16 mutations survived the entire suite.** Every survivor is in an area the repo's own
documents call load-bearing.

---

## (a) Surviving-mutation table

Full suite (232 files / 2,604 tests) run per row. "Caught by N" = tests that went red.

| # | Behaviour | One-line mutation | Caught? | Evidence |
|---|---|---|---|---|
| M1 | **Money conservation** | `treasury.ts` `canAfford`: `amountMinorUnits <= this.balance` → `< this.balance` | **NO — survived** | `src/simulation/economy/treasury.ts:83`; only `spend()` call in suite is `tests/integration/staff-hiring-loop.test.ts:156`, which spends `BALANCE − (WAGE−1)` — never the exact balance |
| M2 | Money conservation (refund) | `procurement.ts`: `credit(delivery!.paidMinorUnits)` → `credit(0)` | Yes — 4 tests | `src/simulation/economy/procurement.ts:201`; `tests/integration/economy-purchase-cancellation.test.ts`, `economy-money-conservation.test.ts` |
| M3 | **Entity-id reuse** | `entity-store.ts`: drop the generation bump on `destroy` | Yes — 19 tests / 10 files | `src/simulation/entity/entity-store.ts:165` |
| M4 | **Navigation budget** | `navigation-system.ts`: `workBudget: workBudgetPerTick` → `× 4` | **NO — survived** | `src/simulation/navigation/navigation-system.ts:127`; every test supplies its own `workBudgetPerTick` (`tests/helpers/prisoner-fixture.ts:42`, `tests/unit/operations-scale.test.ts:40`, …) and none asserts expansions-per-tick ≤ budget |
| M5 | Save-migration chain | `save-migrations.ts`: drop `* NEED_SCALE` in `upgradeNeedLevels` | Yes — 3 tests | `src/persistence/save-migrations.ts:173`; `tests/migrations/save-v3-to-v4.test.ts` |
| M6 | **Worker fault recovery** | `state-machine.ts`: `options.recoverable ?? false` → `?? true` | Yes — but only **1 test** | `src/simulation/worker/state-machine.ts:454` |
| M7 | Incident lifecycle (deadline) | `response-system.ts` `isPastDeadline`: `>` → `>=` | Yes — 1 test | `src/simulation/incidents/response-system.ts:418` |
| M8 | **Incident lifecycle (staffing)** | `response-system.ts` `requiredResponderCount`: `Math.ceil` → `Math.floor` | **NO — survived** | `src/simulation/incidents/response-system.ts:151`; see TST-03 |
| M9 | Room occupancy claims | `room-instance-registry.ts` `useOccupancyOf`: ignore the `capability` filter (reintroduces #326) | Yes — 2 tests | `src/simulation/prisoners/room-instance-registry.ts:311-317` |
| M10 | **Projection ordering** | `room-projection.ts`: drop `.sort(compareEntityIds)` on `occupantEntityIds` | **NO — survived** | `src/simulation/presentation/room-projection.ts:400`; see TST-02 — the test that exists for this cannot see it |
| M11 | Autosave durability | `session-controller.ts`: `markDirty()` never marks the session dirty | Yes — 2 tests | `src/persistence/session/session-controller.ts:229`; `tests/unit/persistence-session-controller.test.ts:211-212` |
| M12 | **Refusal codes** | `refusal-log.ts`: swap `unbuildable` ↔ `unbuildable-terrain` wire ids | **NO — survived** | `src/simulation/refusals/refusal-log.ts:116-117`; see TST-09 |
| M13 | **Navigation budget (extreme)** | `workBudget: Number.MAX_SAFE_INTEGER` — literally unbounded A*, forbidden by `AGENTS.md` boundary 9 | **NO — survived** | as M4 |
| M14 | Refusal sequence | `refusal-log.ts`: `sequence` always `1` | Yes — 6 tests / 4 files | `src/simulation/refusals/refusal-log.ts:88` |
| M15 | Money persistence | `treasury.restore()` ignores the snapshot balance | Yes — 4 tests / 3 files | `src/simulation/economy/treasury.ts:132-136`; `tests/integration/economy-state-income-persistence.test.ts:202` |
| M16 | Room occupancy (edge) | `occupancyOf` returns `1` for an *unknown* instance instead of `0` | **NO — survived** | `src/simulation/prisoners/room-instance-registry.ts:286`; no test ever queries occupancy of an unregistered instance |

### Mutation score

| Batch | Applied | Survived | Killed |
|---|---|---|---|
| 1 (M1–M12) | 12 | 5 — M1, M4, M8, M10, M12 | 7 |
| 2 (M13–M16) | 4 | 2 — M13, M16 | 2 |
| **Total** | **16** | **7 (44 % survival)** | **9** |

**Of the ten behaviours the audit brief named, five would not go red on a one-line break** and a
sixth is only partly defended:

| Behaviour | Verdict |
|---|---|
| Money conservation | **Unguarded at the boundary** (M1 survives; M2/M15 killed) |
| Navigation budget | **Unguarded** (M4 *and* M13 survive) |
| Incident lifecycle | **Partly unguarded** — deadline killed (M7), staffing rule survives (M8) |
| Projection ordering | **Unguarded** (M10 survives, and the test written for it cannot see it) |
| Refusal codes | **Unguarded pairing** (M12 survives; sequence killed by M14) |
| Room occupancy claims | **Partial** — capability filter killed (M9), unknown-instance default survives (M16) |
| Save migration chain | Defended (M5) |
| Entity id reuse | Strongly defended (M3, 19 tests / 10 files) |
| Worker fault recovery | Defended, but by **one test** (M6) |
| Autosave durability | Defended (M11) |

Two mutants were killed by **exactly one test each** (M6 worker fault, M7 incident deadline) and
two by two tests (M9, M11) — real, but single points of failure.

---

## (b) Findings

### TST-01 · HIGH · CONFIRMED — `Treasury` has no test of its own, and the money guard is off-by-one-blind
`src/simulation/economy/treasury.ts:82-83` · `src/simulation/economy/treasury.ts:94-98`

No test file imports `src/simulation/economy/treasury.ts`. `canAfford` is never called by any test.
The **only** direct `spend()` call in all 233 files is
`tests/integration/staff-hiring-loop.test.ts:156`, and it deliberately spends
`TREASURY_STARTING_BALANCE − (WAGE − 1)` — i.e. always leaves a remainder. So the boundary case
"spend exactly the balance you have" is never executed, and changing `<=` to `<` (M1) leaves the
whole suite green while silently making every prison unable to spend its last coin.

`treasury.ts`'s own header calls the balance "authoritative simulation state" that
"`docs/DETERMINISM.md`'s fingerprint hashes". It is not in the fingerprint the tests use — see TST-05.

**Fix:** add an `economy-treasury.test.ts` under `tests/unit/` asserting the three boundaries directly:
`spend(balance) === true` and leaves 0; `spend(balance + 1) === false` and leaves the balance
unchanged; `spend(0) === true`; `credit` at `Number.MAX_SAFE_INTEGER − 1`; `restore` rejecting a
negative and a non-integer. Five assertions kill M1 and M15.

### TST-02 · HIGH · CONFIRMED — `projection-ordering.test.ts` cannot detect the removal of the sort it exists to defend
`tests/determinism/projection-ordering.test.ts:1-84` · `src/simulation/presentation/room-projection.ts:400`

This is the most interesting failure in the suite, because the test is *well written* and still
does not work. Its 30-line header states its purpose precisely: the projection's own sort must be
pinned so it "should not become a consequence of a decision taken in the registry". It even
carries a third test (`:75-84`) that guards its own fixture from becoming vacuous.

But its source is a **real `RoomInstanceRegistry`**, and
`src/simulation/prisoners/room-instance-registry.ts:489` sorts:

```ts
public occupantsOf(instanceId: string): readonly EntityId[] {
  return [...(this.occupants.get(instanceId) ?? [])].sort((a, b) => a - b);
}
```

So `room-projection.ts:400`'s `.sort(compareEntityIds)` operates on already-sorted input.
Deleting it (M10) passes all 2,604 tests — including this file. The defence-in-depth layer the
comment argues for has silently become untested, which is exactly the state the comment says it
exists to prevent.

**Fix:** narrow `RoomProjectionSource.roomInstances`
(`src/simulation/presentation/room-projection.ts:34-35`) from the concrete `RoomInstanceRegistry`
to a structural interface exposing only the methods the projection calls, then have this test inject
a stub whose `occupantsOf` returns `OCCUPANTS` unsorted. That is the only way to test *this layer's*
contract, and it improves the module boundary as a side effect.

### TST-03 · HIGH · CONFIRMED — the incident staffing rule's rounding is untested, and its integration assertion is tautological
`tests/unit/incident-response.test.ts:50-51` · `tests/integration/incident-response-restore.test.ts:89`

`requiredResponderCount` is `Math.max(1, Math.ceil(severity * respondersPerSeverityPoint))`
(`src/simulation/incidents/response-system.ts:151`), and the interface comment at `:13` calls out
"rounded up" as the contract. With the shipped `respondersPerSeverityPoint: 0.5`, the only two
severities any test samples are **2 and 8** — both even, so `severity * 0.5` is an exact integer
and `ceil ≡ floor ≡ round`. Changing `ceil` to `floor` (M8) passes everything. A severity-3
incident would silently dispatch 1 guard instead of 2.

The integration test is worse: `tests/integration/incident-response-restore.test.ts:89`
re-implements the production formula and compares production output to it —

```ts
const REQUIRED_RESPONDERS = Math.max(1, Math.ceil(SEVERITY * DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint));
```

— which is used in nine assertions (`:306, :321, :330, :449, :471, :516, :599, :657`). Its comment
says "Derived from the policy, not copied", but deriving it by duplicating the expression is the
tautology `tests/helpers/field-sensitivity.ts:1-22` was written to eliminate: the assertion holds
for *any* implementation of `requiredResponderCount`, including `floor`.

**Fix:** in the unit test, assert an **odd** severity: `expect(response.requiredResponderCount(3)).toBe(2)`
and `expect(response.requiredResponderCount(1)).toBe(1)`. In the integration test, replace the
re-derived constant with the literal `4` beside a comment stating why.

### TST-04 · HIGH · CONFIRMED — the navigation work budget is configured everywhere and enforced nowhere
`src/simulation/navigation/navigation-system.ts:127`

`AGENTS.md` architectural boundary 9: *"Pathfinding must be budgeted and hierarchical. Never run
unrestricted full-map A* per agent per frame."* Two mutations test that:

- M4 — `workBudget: this.options.workBudgetPerTick * 4` → **all 2,604 tests pass**
- M13 — `workBudget: Number.MAX_SAFE_INTEGER` (a literally unbudgeted search) → **all 2,604 tests pass**

`tests/unit/navigation-path-request-queue.test.ts` tests `PathRequestQueue.processTick`'s budget
behaviour thoroughly and correctly (`:17` at-least-one-per-tick, `:27` defer once spent, `:219`
never lose a deferred request). The untested part is the **wiring**: nothing checks that
`NavigationSystem` hands the queue the budget it was configured with. Every test supplies its own
value (`tests/helpers/prisoner-fixture.ts:42` = 2,000; `tests/unit/operations-scale.test.ts:40` =
4,000; `tests/unit/contraband-scale.test.ts:27` = 6,000;
`tests/determinism/navigation-cache-agreement.test.ts:68` = 100,000), and no assertion anywhere in
the suite compares observed expansions against the configured ceiling — grep for
`toBeLessThan.*workBudget` returns nothing.

**Fix:** one test on the real `NavigationSystem`: enqueue enough requests to exceed a small
configured budget, step one tick, and assert (i) total expansions ≤ `workBudgetPerTick` (via the
existing stats surface used at `tests/unit/navigation-work-budget-and-cache.test.ts:17`) and
(ii) at least one request is still pending. This kills both M4 and M13 and turns boundary 9 from a
prose claim into an executable one.

### TST-05 · MEDIUM · CONFIRMED — the determinism fingerprint covers 23 of 42 runtime subsystems, and nothing enforces the list
`tests/helpers/determinism-state.ts:96-131`

`fullRuntimeState` is documented as *"Every snapshot and metrics surface the runtime exposes — the
broadest state two runs can be compared on"* and is the basis of
`tests/determinism/session-replay.test.ts`, `iteration-order.test.ts:460,472` and
`rng-stream-isolation.test.ts:207`. It reads 28 surfaces off 23 of the 42 members declared on
`SimulationRuntime` (`src/simulation/runtime/new-session.ts:72-195`). The 19 it does not read:

`treasury`, `procurement`, `stateIncome`, `refusals`, `actorIdentity`, `topology`, `roomZoning`,
`placedObjects`, `roomCapacity`, `objectPlacement`, `jobSystem`, `electricity`, `water`,
`staffHiring`, `guardRelease`, `securitySchedules`, `searchPolicies`,
`searchContainerLocations`, `incidentSectorIds`.

At least five of those expose a snapshot the helper could read —
`Treasury.snapshot()` (`treasury.ts:128`), `ProcurementSystem`, `ActorIdentityRegistry`,
`PlacedObjectRegistry`, `UtilityNetwork.getSnapshot()`
(`src/simulation/operations/utility-network.ts:144`). A determinism divergence in money, in
placed objects, or in either utility network therefore produces **no hash difference**, and the
list is hand-maintained: a 43rd subsystem added tomorrow is silently outside the fingerprint.

**Fix:** make the omission explicit and checked. Add a keyed record in the helper —
`{ [K in keyof SimulationRuntime]: 'hashed' | 'derived-no-state' | 'config-only' }` — so `tsc`
fails when a member is added without a decision, and move `treasury`, `procurement`,
`actorIdentity`, `placedObjects`, `electricity` and `water` into the hashed set.

### TST-06 · MEDIUM · CONFIRMED — a foundation test will turn `pnpm test` red on the next merge, with no code change
`tests/foundation/adr-status-queue-anchor-contract.test.ts:89,165-172`

`ANCHOR_STALENESS_BUDGET_RELEASES = 10`. `docs/adr/STATUS-QUEUE.md:22` is anchored at **v0.0.98**;
`package.json` ships **0.0.108**. `patchReleasesBetween` therefore returns exactly **10**, and the
assertion is `toBeLessThanOrEqual(10)` — passing by zero margin. `.github/workflows/version.yml:140-147,206-232`
bumps the patch version on **every push to `main`** (`npm version patch`), so the next merge makes
this 11 and the suite goes red for a reason unrelated to any code in the diff.

Worse, the gate cannot verify what it is for. Its own failure message pleads
*"do not raise `ANCHOR_STALENESS_BUDGET_RELEASES` to make this pass"* — an admission that the test
detects a stale **string**, not an unreviewed document. Editing the sha and version on
`STATUS-QUEUE.md:22` satisfies it in full without reading §§3-6, which is the work it is asking for.

**Fix:** move this to a non-blocking check (a scheduled CI job that opens an issue, or a
`verify:docs` script outside `pnpm test`). A CI gate that fires on calendar time rather than on a
change teaches the team to edit the constant, which is the opposite of what it wants.

### TST-07 · MEDIUM · CONFIRMED — the restored-scope completeness gate only checks one direction
`tests/unit/restored-scope.test.ts:136-155` · `src/simulation/runtime/restore-session.ts:172-187`

`restored-scope.test.ts` verifies the scope list against **itself**: no entry lost, none duplicated,
each moves to the right side when a section is absent (`:99-106`, `:136-155`). Nothing verifies it
against the **save schema**. `save-schema.ts:885-933` declares and restores an `economy` section
(`treasury.balanceMinorUnits`), and `save.scope.economy` **does not exist anywhere in the
repository** — grep returns zero hits in `src/` and `tests/`. So the player-facing sentence at
`:159-170` ("Not carried by this save version: …") under-reports what a load actually restored, and
the gate that exists to keep that honest cannot see it.

**Fix:** drive the assertion off the schema. Enumerate the optional section keys of
`savePayloadV5Schema` and require each to map to at least one `RestoredScopeEntry`, failing on any
section with no label — the same enumerate-rather-than-name discipline
`tests/helpers/field-sensitivity.ts:23-27` argues for.

### TST-08 · MEDIUM · CONFIRMED — the one skipped test is skipped in CI too, so the claim it makes is verified nowhere
`tests/determinism/art-pipeline-determinism.test.ts:83-96`

The single skipped test is *"Blender-to-atlas pipeline determinism produces byte-identical
artefacts from two independent runs"*, gated by `it.skipIf(!canRunLive)` where `canRunLive` requires
a Blender binary matching the pinned version (`:68-79`). The skip mechanism itself is correct — an
external binary is a legitimate gate. The problem is that **no CI workflow provisions Blender**:
grep for `blender` across `.github/workflows/` returns nothing, while the same directory explicitly
provisions Git LFS (`ci.yml:312`) and Playwright's Chromium (`ci.yml:373`).

So the pipeline's determinism guarantee is asserted by a test that has never run on any machine but
a developer's. The sibling test at `:98` (every entry point calls
`pipeline_common.require_blender_version()`) is a source grep, not a determinism check.

**Fix:** either add Blender to the `assets` job so the test actually runs, or make the skip loud —
assert in a second, always-running test that a `LOCKSTATE_REQUIRE_BLENDER` env var is set in CI, so
a silent skip cannot be mistaken for a pass.

### TST-09 · MEDIUM · CONFIRMED — 15 of ~35 refusal reason→wire-id pairings are unverified
`src/simulation/refusals/refusal-log.ts:114-120` · `tests/unit/simulation-refusals.test.ts:105-133`

`simulation-refusals.test.ts` checks the **key set** (`:133`, against `BUILD_ORDER_FAIL_REASONS`)
and the **value set** (`:105-126`, every value is a declared `RefusalReason`) — but not the
**pairing**. Swapping `unbuildable` ↔ `unbuildable-terrain` in the table (M12) passes all 2,604
tests, so a player who builds on water-adjacent terrain is told the wrong thing.

The file does have real behavioural pairing tests (`:247`, `:257`, `:293`, `:307` …), and
`runtime.refusals.last` is asserted for **20** distinct reasons across the suite — out of ~35
declared. The three unpaired build reasons (`unbuildable`, `unbuildable-terrain`, `water-blocked`)
are precisely the gap M12 walks through.

Note also `:129-134`: its own comment concedes *"`BUILD_REFUSAL_REASONS` is a `Record` over the
union, so `tsc` already guarantees this"*. The residual value (comparing the union to the runtime
tuple) is real but narrow — this is the clearest case in the suite of an assertion that mostly
restates the type system.

**Fix:** replace the set-equality assertion with a table-driven pairing test: one row per
`BuildOrderFailReason`, each row producing the refusal through the real command path and asserting
the exact wire id. That is a strict superset of what `:133` proves.

### TST-10 · MEDIUM · CONFIRMED — `src/main.ts` (2,168 LOC) is never loaded, and its only guard is a substring grep
`src/main.ts` · `tests/foundation/composition-root-contract.test.ts:150-167`

The static import map shows 11 `src/**` files that no Vitest test loads even transitively.
`src/main.ts` is by far the largest at **2,168 LOC** — the biggest file in the repository and the
application composition root. Its only Vitest coverage is
`composition-root-contract.test.ts:150-158`, which does `expect(source).toContain(wiring.source)` —
a grep over the file's text. It proves a call *appears*, never that it *works*; a wiring reordered
into a broken sequence, or guarded by an `if (false)`, passes.

The same file contains the clearest bookkeeping-as-test in the suite (`:160-167`):

```ts
expect(wiring.reason.trim().length, `${wiring.what} needs a reason`).toBeGreaterThan(120);
expect(wiring.reason, `${wiring.what} should name its issue`).toMatch(/#\d+/u);
```

That asserts a **prose comment is longer than 120 characters and mentions an issue number**. It is
satisfiable by padding a sentence and enforces documentation hygiene, not behaviour.

The mitigation is real and should be said plainly: `tests/browser/app-shell.spec.ts` (5,263 LOC,
31 tests) drives the assembled page and is a required CI job (`ci.yml:282-392`). `main.ts` is
covered — just at the slowest layer available, with no unit-level seam.

**Fix:** extract the wiring sequence from `main.ts` into an injectable `composeApplication(deps)`
that a Node test can call with stubs, and assert the *order* and *arguments*. Keep the grep as a
backstop.

### TST-11 · LOW · CONFIRMED — magic content counts pinned in three places
`tests/foundation/buildable-category-contract.test.ts:64,89-92`

```ts
it('leaves the largest group well under the whole registry', () => {
  expect(largest).toBe(6);
  expect(BUILDABLE_REGISTRY.size).toBe(21);
});
```

The title says "well under"; the assertion pins two exact integers. The test one line above
(`:78-81`) already proves every registry row is listed exactly once, which is the property that
matters — `:89-92` adds no detection and makes adding a 22nd buildable a three-place edit (the
count, the `largest`, and the "twenty-one rows" in the title at `:64`).

**Fix:** assert the relation the title claims — `expect(largest).toBeLessThan(BUILDABLE_REGISTRY.size / 2)`
— and drop the literals from the title.

### TST-12 · LOW · CONFIRMED — two large HUD panels have no direct test
`src/ui/hud/rooms-panel.ts` (871 LOC) · `src/ui/hud/staff-panel.ts` (424 LOC)

Both are reached only transitively through `src/ui/hud/index.ts` (which 16 test files import) and
through the browser suite. They are the 2nd and 5th largest files with no direct test import. Given
`vitest.config.ts` sets `environment: 'node'` with no DOM library, their pure formatting/view-model
functions are exactly the part that *can* be unit-tested cheaply — the pattern
`tests/unit/ui-hud-build-panel.test.ts` already establishes for the comparable
`build-panel.ts` (1,626 LOC).

**Fix:** mirror `ui-hud-build-panel.test.ts` for the two panels' exported formatters and
option-builders.

### TST-13 · INFO · CONFIRMED — import cost already exceeds test cost
Suite reports `Duration 51.61s (transform 12.00s, import 48.83s, tests 59.61s)` across 233 files.
Module *import* is now nearly as expensive as test execution, because 38 test files construct a
full runtime via `createNewSimulationRuntime` (108 call sites) and each file re-imports the
simulation graph in its own worker. Wall time is a healthy ~37 s today, but the growth term is the
number of *files*, not the number of assertions. The three slowest files —
`tests/unit/prisoners-actor-tier-scale.test.ts` (5.1 s / 4 tests),
`tests/unit/hud-projections-scale.test.ts` (3.9 s / 9 tests),
`tests/unit/prisoners-operations-scenario.test.ts` (2.6 s / 7 tests) — are 30 % of `tests/unit`'s
20 s for 20 tests. Worth watching; not worth acting on yet.

---

## (c) Coverage confidence by area

Confidence = *"would a silent one-line regression here go red?"*, from the mutation results plus
reading the tests. Test mass from the static import map and per-file timings.

| Area | src LOC / files | Where the test mass is | Confidence | Basis |
|---|---|---|---|---|
| `simulation/entity` | 470 / 4 | 10 test files kill M3 | **High** | M3 killed by 19 tests; `entity-id-unsigned.test.ts` covers generation wrap at 2,048/4,095 |
| `simulation/rng` + `determinism` | ~700 | 19 files import `rng/seed`; `ambient-nondeterminism-contract` scans all of `src/` | **High** | seed-sensitivity + stream-isolation asserted, not just self-equality |
| `persistence` (schema, migrations, checksum) | 4,346 / 28 | 35 files import `save-schema`; 5 dedicated migration files | **High** | M5 killed; V1→V5 chain test; only 113 LOC not directly imported |
| `simulation/navigation` (search correctness) | 2,039 | differential A*-vs-Dijkstra sweep, 40 seeds × 3 door costs | **High** | `navigation-local-search-admissibility.test.ts:216-260` |
| `simulation/navigation` (**budget**) | — | 14 queue tests, all with caller-supplied budgets | **Very low** | M4 + M13 both survive |
| `simulation/worker` + `protocol` | ~2,700 | 9 contract files, loopback worker helper | **Medium-high** | M6 killed but by one test; `protocol-fault-recovery.test.ts` is real |
| `simulation/prisoners` (rooms/claims) | ~2,000 | 13 files import `room-instance-registry` | **Medium** | M9 killed (2 tests), M16 survives |
| `simulation/incidents` | ~1,100 | `incident-response.test.ts`, `incident-response-restore.test.ts` (15 tests) | **Medium** | lifecycle/persistence strong; the staffing *rule* untested (M8), one assertion tautological |
| `simulation/presentation` (projections) | 3,082 / 1,145 LOC no direct import | `hud-projections.test.ts` (41 tests), `projection-reachability-contract` | **Medium** | ordering guard ineffective (M10); reachability well gated |
| `simulation/economy` | 731 / 3 | 10 files import the barrel; **0 import `treasury.ts`** | **Low** | M1 survives; no unit test for the money class |
| `simulation/refusals` | 311 / 2 | `simulation-refusals.test.ts` + 3 more | **Medium-low** | 20 of ~35 pairings behavioural; M12 survives, M14 killed |
| `persistence/session` (autosave) | ~600 | `persistence-local-autosave.test.ts` with fake timers; browser durability specs | **High** | M11 killed; fake timers used correctly |
| `src/ui` | 11,827 / 44 | 2,636 LOC no direct import; 190 browser tests | **Medium** | strong at the browser layer, thin at unit layer for `rooms-panel`/`staff-panel`/`primitives` |
| `src/rendering` | 4,381 / 28 | `rendering/phaser` (728 LOC) has no Vitest import at all | **Medium-low** | covered only by camera + world-scene browser specs |
| `src/services` (entitlements, challenges, telemetry, localization) | 3,021 / 28 | reached via barrels; `field-sensitivity` used on challenges | **Medium** | challenge signing/hashing genuinely well tested post-#264 |
| `src/main.ts` | 2,168 / 1 | **never loaded by Vitest** | **Low (unit) / Medium (e2e)** | grep-only contract; `app-shell.spec.ts` drives it for real |
| `src/input` | 717 / 10 | `input.test.ts` + browser world-scene specs | **Medium** | remapping/AZERTY asserted; gestures only via browser touch spec |

Static totals: of 296 `src/**` modules, **200 are imported directly by a test**, 85 only
transitively, and **11 never loaded at all** (2,460 LOC, of which `src/main.ts` is 2,168).

## (d) What is genuinely solid

This deserves saying without hedging, because it is unusual.

1. **The suite has already been mutation-tested against itself, and the lessons are encoded.**
   `tests/helpers/field-sensitivity.ts:1-60` exists because issue #264 proved that
   `expect(f(x)).toEqual(f(x))` hash tests survived reducing the signed payload to `{id, version}`.
   The fix was not "add a tamper test" but "enumerate every leaf and require all of them to change" —
   the general solution. `tests/unit/prisoners-regime.test.ts:19-38` records the same pattern:
   a `not.toThrow()` test sampling every 137th tick was replaced with an exhaustive 4,800-iteration
   walk that checks *exactly once* rather than *at least once*.

2. **Anti-vacuity assertions are a habit, not an exception.** `session-replay.test.ts:87-101`
   asserts eight subsystems actually did work before comparing hashes.
   `snapshot-restore-fidelity.test.ts:130-150` proves the recycled entity index and stale free-list
   entry really exist. `projection-ordering.test.ts:75-84` guards its own fixture from being sorted
   into uselessness. `adr-status-queue-anchor-contract.test.ts:136-144` explains that zero regex
   matches would make everything below pass by reading nothing. This is the single best quality
   signal in the repository.

3. **Replay/differential determinism testing is real, not toy-sized.**
   `session-replay.test.ts` runs 400 ticks with checkpoints every 50, hashing ~285 KB of canonical
   state across 28 subsystem surfaces, and asserts seed-sensitivity (`:107-111`) as well as
   equality. `snapshot-restore-fidelity.test.ts` restores at multiple ticks, checks
   restore-idempotence as a fixed point (`:184-188`), and pins the documented in-flight-navigation
   loss so it cannot drift. `navigation-local-search-admissibility.test.ts:230-260` is a genuine
   differential test — bounded A* against an independently implemented bounded Dijkstra over 40
   seeded layouts × 3 door-cost multipliers, asserting reachability agreement *and* exact cost.
   No property-testing library is present, and for these cases none is needed.

4. **The browser layer is not decorative.** 13 specs, 190 tests, 15,151 LOC, and it is a
   **required CI job** (`.github/workflows/ci.yml:282-392`) with `reuseExistingServer: false`
   deliberately chosen after a cross-worktree false-green was observed
   (`tests/browser/playwright.config.ts:76-92`). It covers the flows that only a browser can
   settle: durability across a real navigation, a real exhausted quota, real `DOMException`
   names, computed font stacks, a real `pagehide`, a second finger via CDP, and a Phaser camera's
   own answer for a mouse position.

5. **Most foundation tests are high-value guardrails, not bookkeeping.** The reachability family
   (`message-kind-reachability`, `unconsumed-command/content/action`, `fault-code-reachability`,
   `projection-reachability`, `unreachable-invariant`) catches a class of defect nothing else can:
   a declared-but-unwired enforcer. `unreachable-invariant-contract` was written after #159 found
   `assertGaplessDeploymentSchedule` exported and never called
   (`tests/helpers/invariant-enforcers.ts:7-15`). `ci-configuration-contract.test.ts` is 1,525 LOC
   of genuine supply-chain verification — CSP concessions, HSTS max-age, and
   *"checks out the commit the triggering CI run tested, not the branch head"* (`:1408`) — which is
   a real deployment-integrity property, not paperwork. `rpc-status-vocabulary-contract` checks its
   own non-vacuity in both directions (`:102-136`).

6. **Test isolation is clean.** `vitest.config.ts` sets `clearMocks`, `restoreMocks`,
   `unstubEnvs`, `unstubGlobals` and `passWithNoTests: false`. Timer-dependent tests use
   `vi.useFakeTimers()` with an `afterEach` restore (`tests/unit/persistence-local-autosave.test.ts:16-22`).
   `Math.random` appears in tests only as the *subject* of the ambient-nondeterminism scanner.
   `Intl`/`toLocale*` appear only where locale behaviour is the thing under test. I found no
   order-dependence, no shared mutable module state, no floating promises (`closeSession` and
   `markDirty` are both synchronous), and no filesystem/network dependence outside the deliberate
   repo-scanning foundation tests. `pnpm test` and a full-suite rerun in a fresh sandbox produced
   identical results.

## (e) Top five highest-value tests to add

Ordered by mutants killed per line of test code.

1. **`economy-treasury.test.ts`** (new, under `tests/unit/`) — direct boundary tests for `Treasury.spend`,
   `canAfford`, `credit`, `restore`. ~30 lines; kills M1 and hardens M15. This is the highest
   value/effort ratio in the audit: money is the primary resource per
   `src/simulation/economy/treasury.ts:1-10` and its guard class has no test.

2. **A navigation-budget enforcement test** on the real `NavigationSystem` — configure a small
   `workBudgetPerTick`, enqueue more work than it allows, step one tick, assert expansions ≤ budget
   *and* at least one request still pending. ~25 lines; kills M4 and M13 and makes `AGENTS.md`
   boundary 9 executable for the first time.

3. **Fix `projection-ordering.test.ts` to inject an unsorted source** (narrowing
   `RoomProjectionSource.roomInstances` to a structural interface to allow it). ~15 lines changed;
   kills M10 and restores the defence-in-depth the file's own comment argues for. Then apply the
   same question to every other "this layer sorts what it is handed" claim — grep
   `src/simulation/presentation/` for `.sort(` and ask, for each, whether its input is already
   canonical.

4. **Odd-severity assertions for `requiredResponderCount`,** plus de-tautologising
   `incident-response-restore.test.ts:89`. ~5 lines; kills M8 and removes nine assertions that hold
   for any implementation.

5. **A table-driven refusal-pairing test** covering all ~35 `RefusalReason` values through the real
   command path, replacing the set-equality assertion at
   `tests/unit/simulation-refusals.test.ts:133`. ~60 lines; kills M12 and closes the 15 unverified
   pairings — and is a strict superset of the assertion it replaces.

**Runner-up (structural, not a test):** make `tests/helpers/determinism-state.ts` exhaustive by
construction (TST-05). It is the difference between "the fingerprint covers the subsystems someone
remembered" and "the fingerprint covers the runtime".

## Appendix — suite ergonomics

**Structure is coherent.** `unit` / `integration` / `contract` / `determinism` / `migrations` /
`foundation` / `browser` map onto real distinctions — layer, boundary, property, version, repo,
real-browser — and files land in the right one. The one soft spot is `unit` at 155 files / 36 k LOC:
several of its members (`prisoners-operations-scenario`, `operations-scale`, `contraband-scale`,
`hud-projections-scale`) build a full runtime and step hundreds of ticks, which is `integration`
work by any reading, and they are also the slowest files in the suite.

**Helper reuse is good but uneven.** `tests/helpers/navigation-fixture.ts` is used by 25 files,
`canonical-iteration.ts` by 23, `determinism-scenario.ts` by 15, `prisoner-fixture.ts` by 9. Against
that, `createNewSimulationRuntime` is called **108 times across 38 files**, each followed by
hand-rolled room registration, guard hiring and policy pushes — 12 separate
`roomInstances.register({…})` literals across 8 files. That ad-hoc setup is both the duplication
problem and the import-cost problem (TST-13); a `buildFurnishedPrison(seed, opts)` helper alongside
`determinism-scenario.ts` would absorb most of it.

**Growth outlook.** ~37 s wall for 2,628 tests is comfortable, and the per-file import cost
(48.8 s of the 51.6 s reported total, parallelised) is the term that scales. At the current
trajectory — 233 files for 574 sources — the suite stays under a minute for a good while, but the
fix when it stops is consolidating full-runtime scenarios into shared fixtures, not sharding.

**Weak-assertion sweep, for the record.** `expect(true)`: **0**. Snapshot tests: **0** (nothing to
absorb a wrong value). Empty test bodies: **0**. `toBeTruthy()`: **1**. `toBeDefined()`: 119, and
the ones I sampled are all paired with a real assertion on the same value
(`projection-ordering.test.ts:59-62`, `session-replay.test.ts:100`) — the pattern is a null-guard
before the real check, not the assertion itself. `not.toThrow()`: 30, and the sampled ones assert
a documented "this is a no-op, not an error" contract with a companion state assertion
(`persistence-session-controller.test.ts:254-255`, `prisoners-regime.test.ts:213-224`). Mock-only
assertions: 33, concentrated in `economy-money-conservation.test.ts` (`.not.toHaveBeenCalled()` on
a `creditSpy`) and `persistence-local-autosave.test.ts` — in both cases the mock *is* the boundary
under test, which is legitimate. **This is a far cleaner sweep than the file count would predict;
the real defects are the five surviving mutations, not weak assertion style.**
