# Lockstate — Determinism & Simulation-Correctness Audit

Auditor scope: ambient nondeterminism, RNG, fixed-step clock/tick ordering, floating point,
iteration order, entity model, navigation determinism, save/restore fidelity, worker protocol,
provable simulation logic bugs.

Method: read the real code paths; every CONFIRMED finding below was traced, and most were
additionally **executed** against the repository's own modules (read-only probes run through
`vitest` with an out-of-tree config; no repository file was modified). `pnpm vitest run
tests/determinism` was green at audit time (18 files, 138 passed, 1 skipped) — every defect
below survives that suite.

Repository version: `package.json` 0.0.108.

---

## Findings summary

| ID | Title | Severity | Status |
| --- | --- | --- | --- |
| DET-01 | Guard-name RNG draws bypass the kernel's RNG after a restore (orphaned `NamedRngStreams` closure) | **Critical** | CONFIRMED (executed) |
| DET-02 | A snapshot missing an RNG stream restores silently, then throws inside `Kernel.step()` and kills the session | **High** | CONFIRMED (executed) |
| DET-03 | The master seed is not persisted; production restores hard-code seed `0` | **High** | CONFIRMED |
| DET-04 | A `faulted` worker still serves `simulation/request-snapshot`, so a half-executed tick can be saved | **High** | CONFIRMED (executed) |
| DET-05 | `Kernel.step()` uses `!==` on the command head: one past-tick command silently wedges the whole queue forever | **High** | CONFIRMED (executed) |
| DET-06 | `Kernel.step()` is not transactional: a throw mid-tick leaves systems half-applied at an un-advanced tick | **High** | CONFIRMED |
| DET-07 | Restore tests pass a seed production never passes — the suite systematically exercises a different path | **Medium** | CONFIRMED |
| DET-08 | Ambient-nondeterminism contract does not forbid implementation-defined `Math.*`, `setTimeout`, `Date.parse`, or comparator-less numeric `sort()` | **Medium** | CONFIRMED |
| DET-09 | `FixedStepClock` accumulator is unbounded; a throttled worker builds an unbounded catch-up backlog | **Medium** | CONFIRMED |
| DET-10 | `setLoadedChunks` has exactly one production caller: the navigation graph is frozen at session start, and new vs restored sessions derive it differently | **Medium** | CONFIRMED |
| DET-11 | Three systems' counters are neither snapshotted nor documented as exclusions | **Low** | CONFIRMED |
| DET-12 | `registerSystem` validates neither `intervalTicks >= 1` nor `phaseTicks < intervalTicks`: a mis-declared system silently never runs | **Low** | CONFIRMED |
| DET-13 | Generation wraparound at 4,096 recycles a stale `EntityId` into validity (ABA) | **Low** | CONFIRMED (latent) |
| DET-14 | `canonicalJson`/`deterministicStateHash` collapse `-0` to `0` | **Info** | CONFIRMED |
| DET-15 | `ContainerRegistry.loadSnapshot` throws on a container id this build does not register | **Info** | CONFIRMED |

Counts: **1 Critical, 5 High, 4 Medium, 3 Low, 2 Info.**

---

## DET-01 — Guard-name RNG draws bypass the kernel's RNG after a restore

**Severity: Critical. CONFIRMED (traced and executed).**

`src/simulation/runtime/new-session.ts:250-256` builds the session's `NamedRngStreams` into a
local `const rng` and hands it to the kernel. One consumer then captures that **local object**
in a closure instead of reading `SimulationContext.rng`:

```
src/simulation/runtime/new-session.ts:416
  const securityGuards = new GuardRoster(DEFAULT_GUARD_CAPACITY, actorIdentity, () => rng.get(ACTOR_IDENTITY_RNG_STREAM));
```

`GuardRoster.hire` draws through that resolver (`src/simulation/security/guard-roster.ts:67`,
`:78`). Every other consumer draws through `context.rng` (`intake-system.ts:293`, `:300`,
`search-system.ts:338`).

The restore path then **replaces** the kernel's stream container rather than loading into it:

```
src/simulation/kernel/kernel.ts:206
  this._rng = new NamedRngStreams(snapshot.rngStates);
```

called from `src/simulation/runtime/restore-session.ts:326`, *after*
`createNewSimulationRuntime` (line 323) has already wired the closure at line 416 to the
throw-away instance. From that moment the session has **two** distinct streams both named
`identity.actor-name`: the kernel's (restored, snapshotted) and the orphan (freshly derived,
invisible to every snapshot).

### Executed evidence

Probe: create a runtime at seed 999, hire a guard, capture, restore, hire one more guard.

| | `identity.actor-name` before hire | after hire |
| --- | --- | --- |
| never-restored runtime | `[447056182, 1278010376, 1192639160, 872134369]` | `[3464152999, 1888890839, 1604744273, 1088669016]` |
| restored runtime | `[447056182, 1278010376, 1192639160, 872134369]` | **unchanged** |

On the live runtime the hire advances the kernel stream. On the restored runtime the identical
hire leaves it untouched — the draw went to the orphan.

### Failure scenario

1. Player runs a prison, hires guards, saves at tick T. The save carries an advanced
   `identity.actor-name`.
2. Player loads it. `HireStaff` (`session-commands.ts:296`) → `StaffHiringService` →
   `GuardRoster.hire` → orphan stream, seeded from `masterSeed` (which production passes as
   `0`, see DET-03) at draw position zero.
3. Player hires three guards and saves again. The new save's `identity.actor-name` is
   *identical to the previous save's* — three name draws happened and none was recorded.
4. Load that save and hire again: the same three names are drawn from the same stream position.
5. Worse, because prisoners and guards share this one stream by design
   (`actor-identity.ts:156-166`), a continuous session interleaves prisoner-intake and
   guard-hire draws on one sequence while a restored session splits them across two. The
   persisted `ActorIdentitySnapshot` therefore diverges between "run 600 ticks" and "run 300,
   save, load, run 300" for the same command stream. Under ADR 0009 that is a replay
   verification failure, not a cosmetic one.

A probe with interleaved hires and admissions happened to produce matching *names* because
`ActorIdentityRegistry`'s uniqueness retry (`actor-identity.ts:355-366`) re-drew past the
collision — which is precisely why this is invisible to behavioural tests while the RNG state
diverges underneath.

### Why the suite misses it

`tests/determinism/snapshot-restore-fidelity.test.ts:322-323` hires guards, but only ever
*before* a capture; no test hires after a restore. `tests/determinism/rng-stream-isolation.test.ts:191-192`
notes that a hire mints a name — on a fresh runtime.

### Fix

Make the kernel's stream container the single source. Either:

- **(preferred)** have `Kernel.restoreState` *load into* the existing `NamedRngStreams`
  (add `NamedRngStreams.loadSnapshot(states)` that reseeds the existing `Xoshiro128StarStar`
  objects in place and rejects a state naming an unregistered stream), so every captured
  reference stays valid; or
- pass the resolver as `() => kernel.rng.get(ACTOR_IDENTITY_RNG_STREAM)` so it re-reads the
  kernel's current container on every call.

Add a regression test that hires a guard **after** a restore and asserts a byte-identical
bundle against a continuous run. Also grep for the pattern generally: any closure over a
pre-restore runtime collaborator has the same defect shape.

---

## DET-02 — A snapshot missing an RNG stream restores silently, then throws inside `Kernel.step()`

**Severity: High. CONFIRMED (traced and executed).**

`Kernel.restoreState` (`src/simulation/kernel/kernel.ts:206`) constructs the stream container
from **only** what the bundle carries. Nothing reconciles it against the streams the current
build's systems will actually claim, and `NamedRngStreams.get` throws for an unknown name
(`src/simulation/rng/streams.ts:20-24`). No migration touches `rngStates`
(`src/persistence/save-migrations.ts`: V1→V2, V2→V3, V3→V4 all copy `payload.kernel` verbatim),
and `namedRngStreamStateSchema` (`src/persistence/save-schema.ts:40-51`) imposes no required
set of names.

### Executed evidence

Probe: capture a bundle, delete the `identity.actor-name` entry from `kernel.rngStates`,
restore, admit a prisoner, step.

```
streamsAfterRestore: ["contraband.detection","contraband.intelligence","prisoners.classification"]
error: "RangeError: Unknown RNG stream: identity.actor-name"
```

The restore itself **succeeded**. The throw arrives later, from inside `IntakeSystem.update`,
i.e. from inside `Kernel.step()`.

### Failure scenario

The build adds a fifth named stream (say `incidents.escape`). Every save written by any earlier
build now restores without complaint and then dies the first time that system draws:
`onTickLoop`'s catch (`src/simulation/worker/state-machine.ts:238-256`) calls
`this.fault('internal-error', …)` with the default `recoverable: false`, which transitions the
worker to `faulted` (`:449-455`) and stops the tick loop permanently. The player sees a prison
that loads, runs for a few seconds, and then stops for good. The same applies today to any
released save predating `identity.actor-name` (#75).

This finding also composes with DET-04 and DET-06: the throw lands mid-tick, and a snapshot can
still be taken afterwards.

### Fix

Reconcile at restore time rather than trusting the payload:

1. Give `NamedRngStreams` a `loadSnapshot` that keeps registered streams and reseeds them from
   the payload, deriving any stream the payload lacks via `deriveXoshiroState(masterSeed, name)`
   — which requires DET-03.
2. Fail *loudly and early* on the reverse case (a payload naming a stream this build does not
   register) with `snapshot-incompatible` at `handleInitialize`, not with a `RangeError` fifty
   ticks later.
3. Record in `docs/PERSISTENCE.md` that adding an RNG stream is a save-compatibility event.

---

## DET-03 — The master seed is not persisted; production restores hard-code seed `0`

**Severity: High. CONFIRMED.**

`savePayloadV5Schema` (`src/persistence/save-schema.ts:1042-1050`) has exactly six fields:
`kernel`, `world`, `construction`, `entities`, `simulation`, `identity`. There is no
`masterSeed`. `docs/PERSISTENCE.md`'s "What is deliberately excluded from the payload" section
(line 153 onwards) does not mention it either — the omission is undocumented.

`restoreSimulationRuntime(bundle, masterSeed = 0)`
(`src/simulation/runtime/restore-session.ts:321`) therefore defaults, and **both** production
callers take the default:

- `src/simulation/worker/state-machine.ts:558` — `restoreSimulationRuntime(snapshot.data as …)`
- `src/persistence/session/runtime-host.ts:85` — `restoreSimulationRuntime(bundle).runtime`

Consequences:

- The seed of a loaded session is permanently lost, so ADR 0009's replay verification cannot
  be reconstructed from a save alone. (`src/services/challenges/evidence.ts:57` carries a
  `seed` in challenge evidence — a separate, parallel record that can silently disagree with
  the save it describes.)
- Any future stream derivation at restore time (the fix for DET-02) has no seed to derive from.
- Combined with DET-01, every loaded prison in the world draws its guard names from
  `deriveXoshiroState(0, 'identity.actor-name')` — the same names, in the same order,
  regardless of the seed the session was created with.

**Fix.** Add `masterSeed: uint32Schema` to the payload (a V6 bump, or an `.optional()` field
with `0` as the documented migration value — the same route `entities`/`simulation`/`identity`
took), thread it from `handleInitialize`'s `source.masterSeed` through `captureSessionSnapshot`,
and pass it at both restore call sites. Then delete the `= 0` default so a missing seed is a
compile error rather than a silent zero.

---

## DET-04 — A `faulted` worker still serves `simulation/request-snapshot`

**Severity: High. CONFIRMED (traced and executed).**

`handleRequestSnapshot` (`src/simulation/worker/state-machine.ts:677-680`) guards only on
`!this._kernel || !this._runtime`. Unlike `handleSetClock` (`:594-597`, rejects unless
`paused`/`running`) and `handleSubmitCommand` (`:622-624`, returns on `shutting-down`/`faulted`),
it has **no state guard**.

### Executed evidence

Probe: handshake, initialize, `fault('internal-error', …)`, then request a snapshot.

```
stateAfterFault: "faulted"
replies: [ { kind: "simulation/snapshot", tick: 0 } ]
```

The faulted worker answered with a full session bundle.

### Failure scenario

`onTickLoop`'s catch (`:238-256`) is the only thing standing between a throw inside
`Kernel.step()` and the worker. It faults *mid-tick* (see DET-06). The main thread does not
terminate the worker on a fault (`src/simulation/worker/client.ts:132-138` states this
explicitly), and `AutosaveScheduler` / the `pagehide` best-effort save are dirty-driven and
still armed. So: a system throws at tick T after nine of fifteen systems have already mutated
state for tick T; the worker faults; autosave fires; a snapshot of a **half-executed tick** is
written to IndexedDB with a valid checksum. Loading it replays tick T from the top, so
`prisoners.needs-decay` decays twice for that tick, `construction` advances twice, and if
`T % 2400 === 2399` the state income for that day is **paid twice**.

**Fix.** Refuse a snapshot in `faulted` (and `shutting-down`) with `invalid-state`, as the
sibling handlers do. Independently, fix DET-06 so a fault cannot leave a partial tick behind.

---

## DET-05 — One past-tick command at the head silently wedges the command queue forever

**Severity: High. CONFIRMED (traced and executed).**

```
src/simulation/kernel/kernel.ts:158-165
  while (true) {
    const nextCommand = this._commands[0];
    if (nextCommand === undefined || nextCommand.executeAtTick !== this._tick) break;
    …
  }
```

The head test is `!==`, not `<=`. The queue is sorted ascending by
`(executeAtTick, sequence)`, so a head whose `executeAtTick` is **below** the current tick can
never be reached again: the loop breaks on the first iteration of every subsequent tick, and
every command behind it — for the rest of the session — is never dispatched.

`submitCommand` rejects `executeAtTick < this._tick` (`:132-137`), but `restoreState`
(`:201-212`) and `Kernel.restore` (`:214`, explicitly "Bypassing submitCommand validation")
do not, and `kernelSnapshotSchema` (`src/persistence/save-schema.ts:83-91`) enforces no
cross-field invariant between `tick` and `commands[].executeAtTick`.

### Executed evidence

Probe: `restoreState({ tick: 100, commands: [{seq 0, at 50}, {seq 1, at 101}] })`, then 20 steps.

```
dispatched: []      tick: 120      pending: ["stale","fresh"]
```

Nothing dispatched, no error, no log. The player's build orders simply stop taking effect.

**Reachability today** is via a save produced by another build, a future migration, or a
hand-edited file whose checksum was recomputed — not via `submitCommand`. The severity is in
the failure *mode*: total, silent, permanent.

**Fix.** Use `<=` and make the past-tick case explicit — dispatch it immediately (a command
that was due is due) or drop it with a recorded refusal. Add a `.superRefine` on
`kernelSnapshotSchema` asserting `every(c => c.executeAtTick >= tick)`, and the same assertion
in `restoreState`, so a malformed queue is rejected at the boundary instead of deadlocking
behind it.

---

## DET-06 — `Kernel.step()` is not transactional

**Severity: High. CONFIRMED.**

```
src/simulation/kernel/kernel.ts:149-176
  step(): void {
    …dispatch due commands…
    for (const system of this._systems) { if (due) system.update(context); }
    this._tick++;                       // ← only reached if nothing threw
  }
```

There is no `try`/`finally`, no staging, and no rollback. A throw from any `system.update`
leaves the earlier systems' mutations applied while `_tick` still reads T. The only handler is
`onTickLoop`'s catch (`state-machine.ts:238-256`), which faults the worker — so the corrupt
state is not merely transient, it is the state a subsequent snapshot captures (DET-04).

Reachable throw sites inside a tick include `NamedRngStreams.get` (DET-02),
`EntityStore.spawn`'s `'EntityStore capacity exhausted'`
(`src/simulation/entity/entity-store.ts:118`), `GuardRoster.require`'s
`Unknown guard entity id` (`guard-roster.ts:98`), `RoomInstanceRegistry.register`'s duplicate
check (`room-instance-registry.ts:163`), and `PathRequestQueue.enqueue`'s
`Path request id already pending` (`path-request-queue.ts:108`). The codebase is aware of the
class — `EntityStore.canSpawn` (`entity-store.ts:104`) exists precisely because "a throw out
of a command handler is a throw out of `Kernel.step()`" — but the guard is per-call-site rather
than structural.

**Failure scenario.** A prison at 5,000 prisoners; a `PlaceObject` command handler that reaches
a spawn without a `canSpawn` pre-flight throws at order 250, after intake, needs decay,
construction, procurement, state income, navigation have all run for tick T. Worker faults;
autosave writes tick T with those six systems' effects applied; the reload double-applies them.

**Fix.** Decide and document a tick-fault policy. Minimum: wrap the systems loop so `_tick++`
still happens (or the whole tick is marked poisoned and the runtime is refused for snapshot),
and record which system threw in the fault payload. Add `docs/DETERMINISM.md` prose stating
that a tick is all-or-nothing and that a poisoned runtime may not be serialised.

---

## DET-07 — The restore suite passes a seed production never passes

**Severity: Medium. CONFIRMED.**

Every restore in `tests/determinism/` and `tests/integration/` supplies the seed explicitly —
`snapshot-restore-fidelity.test.ts:103, 121, 160, 184, 197, 242`,
`job-performing-restart-bound.test.ts:162, 267, 317`,
`incident-response-restore.test.ts:138`, and the integration loops. Production supplies none
(`state-machine.ts:558`, `runtime-host.ts:85`).

So the two determinism-critical properties the suite claims to pin — "restore-and-continue
equals never-restoring" and "the round trip is idempotent" — are pinned for a code path the
application does not execute. This is what let DET-01 and DET-03 survive a 2,267-test suite.
(`status-counts-publication.test.ts:56` and `projection-request.test.ts:72` do use the
seedless form, but neither compares state across the boundary.)

**Fix.** Make the seed non-optional (DET-03) so the discrepancy cannot exist. Until then, add a
test that restores through the **real** `SimulationWorkerStateMachine`'s
`simulation/initialize` message — as `clock-transport.test.ts` and
`protocol-fault-recovery.test.ts` already do for their own concerns — and compares state.

---

## DET-08 — Holes in the ambient-nondeterminism contract

**Severity: Medium. CONFIRMED.**

`tests/determinism/ambient-nondeterminism-contract.test.ts:37-52` is a genuinely good guard:
it walks the real transitive import closure from `src/simulation/`, keeps a two-entry
allow-list with stated reasons, asserts the allow-list is not stale, and self-tests every regex
against a sample. Its scope claim ("anything the simulation can reach is in scope
automatically") holds.

What it does **not** forbid, each of which is a cross-engine or cross-run hazard:

1. **Implementation-approximated `Math` functions.** ECMAScript explicitly permits
   implementation-defined results for `Math.sin/cos/tan/atan/atan2/exp/log/pow/cbrt/hypot/…`
   and for the `**` operator on non-exact values. Two engines (or two versions of V8) may
   differ in the last bit. `Math.sqrt` is exactly specified; the others are not. **Verified
   clean today** — a grep across `src/simulation`, `src/content`, `src/shared` finds none of
   them, and no `**` operator — which is exactly why the prohibition is cheap to add and
   valuable to add *now*, before the first pathfinding heuristic or economy curve wants one.
2. **`setTimeout`/`setInterval`/`queueMicrotask`/`Promise`** inside simulation code. The only
   current use is the worker shell's tick loop (`state-machine.ts:228`), which is legitimate
   pacing and would need one allow-list entry — the same shape as the existing
   `performance.now()` entry.
3. **`Date.parse` / `Date.UTC`.** `new Date` and `Date.now` are forbidden; `Date.parse` of a
   non-ISO string is explicitly implementation-defined and is not matched by
   `/\bnew\s+Date\b/` or `/\bDate\s*\.\s*now\b/`.
4. **Comparator-less `.sort()` on numbers.** `[].sort()` compares string representations, so
   `[2, 10].sort()` is `[10, 2]`. That is deterministic, so it is not a *replay* hazard — but
   it silently contradicts the "ascending id / ascending tile index" canonical-order claims in
   `docs/DETERMINISM.md`, and a reviewer reading `.sort()` cannot tell which case it is. Every
   bare `.sort()` I checked in `src/simulation` is over strings (`incident.ts:178`,
   `gangs.ts:64`, `sparse-world.ts:643`, `placed-object-registry.ts:136`,
   `utility-network.ts:87`, `job.ts:79`, …) and so is correct today.
5. **Destructured globals.** `const { randomUUID } = crypto; randomUUID()` evades
   `/\bcrypto\s*\.\s*(?:randomUUID|getRandomValues)\b/`. Acknowledged in spirit by the file's
   own "guard against honest mistakes" comment.

Related scope gap: **`src/services/challenges/**` is outside both determinism scanners.** The
ambient contract asserts services are *not* reachable from simulation
(`ambient-nondeterminism-contract.test.ts:177`), and `canonical-iteration-contract.test.ts`
scans `src/simulation`, `src/content`, `src/persistence` only. Yet challenge verification is
the consumer that makes determinism a product guarantee (ADR 0009). It is clean today (no
`Map`/`Set` enumeration, no ambient source found), so bringing it into scope costs nothing.

**Fix.** Add patterns 1-3 to `FORBIDDEN` with an allow-list entry for the worker's
`setInterval`; add a `sort()`-with-no-comparator pattern (or a lint rule) reported as a
warning-grade violation with an allow-list; extend `canonical-iteration-contract.test.ts`'s
`SCANNED_ROOTS` to `src/services/challenges`.

---

## DET-09 — Unbounded clock accumulator and catch-up backlog

**Severity: Medium. CONFIRMED.**

`FixedStepClock.pump` (`src/simulation/clock/fixed-step-clock.ts:59-74`) adds
`elapsed * speed` to `this.accumulator` and subtracts only `executed * stepMilliseconds`,
where `executed = Math.min(available, budget)`. Nothing bounds the accumulator, and
`onTickLoop` supplies a hard `budget = 5` per wake
(`src/simulation/worker/state-machine.ts:240-241`).

Under normal foreground operation the budget is generous: 5 ticks × 50 ms = 250 ms of
simulated time per 15 ms wake, roughly 16 s of simulation per real second at ×1. The exposure
is **timer throttling**. If a browser throttles the worker's `setInterval` toward 1 Hz, the
clock accrues 1,000 ms of wall time per second while the loop can spend at most 250 ms of it —
a 750 ms/s backlog. One hour backgrounded accumulates ~2.7 × 10⁶ ms ≈ 54,000 ticks; on
refocus the worker is pinned for ~160 s of catch-up during which the HUD's day counter races
and every command the player issues is rejected as `past-tick` (see DET-05's neighbour,
`projectExecuteTick`, which extrapolates from the *last reported* tick).

`docs/DETERMINISM.md` states the intent — "heavy simulation lag must be handled by the worker
queue preserving backlog … without altering the 50 ms semantic interval" — but records no
ceiling, and `backlogMilliseconds` (`:76`) has no reader in `src/`.

**Fix.** Decide a policy and write it into `docs/DETERMINISM.md`: either clamp the accumulator
to a documented maximum (dropping simulated time explicitly, and telling the HUD so), or keep
the backlog and surface it — publish `backlogMilliseconds` on `simulation/clock-state` so the
HUD can show "catching up" and `SimulationCommandSender` can hold off. Also scale `budget` with
measured tick cost rather than fixing it at 5.

Note the *correct* halves, which I verified: `setControl` pumps before it swaps
(`:54-57`), and a paused clock returns before accumulating (`:68`), so paused wall time is
discarded and pre-pause backlog survives — exactly as documented, and pinned by
`tests/determinism/clock-transport.test.ts`.

---

## DET-10 — The navigation graph's chunk set is frozen at session start

**Severity: Medium. CONFIRMED.**

`NavigationSystem.setLoadedChunks` (`src/simulation/navigation/navigation-system.ts:65`) has
exactly **one** production caller: `src/simulation/runtime/new-session.ts:248`. Everything else
is a test. `ensureGraph` (`:113-121`) derives its chunk states from
`this.loadedChunkPositions` alone, so geometry in any chunk outside that fixed set is invisible
to region building, portal discovery, `geometrySignature` staleness and therefore to route and
flow-field cache invalidation.

Two concrete consequences:

1. **New and restored sessions derive the set differently.** Line 248 reads
   `[initialChunk]` when the runtime builds its own world, and
   `world.snapshot().ownedChunks` when a world is supplied (which is the restore path,
   `restore-session.ts:322-323`). These agree today only because nothing changes chunk
   ownership at runtime — `SparseWorld.setOwned` has exactly one caller
   (`new-session.ts:243`) and no command reaches `setParcelOwned`. The moment a
   "buy parcel" command exists, a continuous session keeps navigating one chunk while a
   session restored from its save navigates two: different regions, different portal
   numbering, different routes. That is a restore-fidelity divergence with no test standing in
   front of it.
2. **World edits outside the set are invisible to pathfinding.** A wall completed in an
   unloaded chunk changes `geometryRevision` on a chunk that `computeGeometrySignature` never
   sees (`region-graph.ts:62-66` is fed only the filtered loaded set), so
   `isNavigationGraphStale` (`:186-192`) returns false and actors path straight through it.

**Fix.** Give chunk-set ownership to one place that both session paths use — derive it inside
`NavigationSystem` from `SparseWorld` (adding the chunk enumeration `region-graph.ts:71-76`
already notes `SparseWorld` lacks), or make `setLoadedChunks` a documented obligation of every
world mutation with an assertion that every dirty chunk is in the set. Add an
`iteration-order`-style test that the same prison yields the same graph whether reached
directly or through a save.

---

## DET-11 — Three systems' counters are neither snapshotted nor documented as excluded

**Severity: Low. CONFIRMED.**

`docs/PERSISTENCE.md`'s "What is deliberately excluded from the payload" is otherwise
exhaustive and careful (topology, navigation caches, `requestSequence` counters,
`JobSystem.performingSince`, `IncidentResponseSystem`, `RefusalLog`). It does not name:

- `IntakeSystem.completedCount` / `failedCount` / `accommodationBacklogTicks`
  (`src/simulation/prisoners/intake-system.ts:96-98`) — the system has no `getSnapshot` at all.
- `ActionSystem.unmetDemandCycles` / `actionsStarted` / `actionsCompleted` / `routeFailures`
  (`src/simulation/prisoners/action-system.ts:67-70`) — no `getSnapshot`.
- `ClassificationReviewSystem.reviewsCompleted` / `tierIncreases` / `tierDecreases` /
  `groupChanges` (`src/simulation/prisoners/classification-review-system.ts:147-150`) — no
  `getSnapshot`.

None is read by simulation logic, so this is not a state divergence — I checked, and the
authoritative intake state lives in the `intakeStage` component that *is* carried. But #70
deliberately added `getSnapshot`/`loadSnapshot` to `DeploymentSystem` and `PatrolSystem`
precisely so metrics would survive a load, so these three are an inconsistency rather than a
decision, they are HUD-visible counters that reset to zero on every load, and a replay verifier
that hashed a projection would see them diverge.

**Fix.** Either carry them (the `deployment: { metrics }` / `patrol: { metrics }` shape at
`session-systems.ts:519-520` is the precedent, and an optional field needs no version bump) or
add them to the exclusions list with the reason. Same for the missing `masterSeed` entry
(DET-03).

---

## DET-12 — `registerSystem` does not validate a system's schedule

**Severity: Low. CONFIRMED.**

`Kernel.registerSystem` (`src/simulation/kernel/kernel.ts:107-117`) checks only for a duplicate
id. `SystemSchedule` (`kernel/system.ts:3-6`) constrains nothing, and the predicate is
`this._tick % intervalTicks === phaseTicks` (`:169`). Therefore:

- `phaseTicks >= intervalTicks` → the modulo can never equal the phase → the system **never
  runs**, silently, for the whole session.
- `intervalTicks === 0` → `tick % 0` is `NaN`, never equal to anything → same.
- Negative or fractional values → same class.

Every declared schedule in `src/simulation` is currently valid (I enumerated all fifteen:
intervals 1, 5, 10, 20, 50, 2400 with phases 0 or `interval - 1`), and
`kernel-system-order.test.ts` pins the declared order — but nothing pins schedule validity, so
a typo in a new system (`phaseTicks: 10, intervalTicks: 10`) ships as a system that does
nothing, with no error anywhere.

**Fix.** Validate in `registerSystem`: `Number.isInteger(intervalTicks) && intervalTicks >= 1`
and `Number.isInteger(phaseTicks) && phaseTicks >= 0 && phaseTicks < intervalTicks`, throwing
as the constructor's other range checks do (`:73-74`).

---

## DET-13 — Generation wraparound recycles a stale `EntityId` into validity

**Severity: Low (latent). CONFIRMED.**

`EntityStore.destroy` bumps the generation with `(this.generations[index]! + 1) & 0xFFF`
(`src/simulation/entity/entity-store.ts:165`), a 12-bit field. After 4,096 destroy/spawn cycles
on one index the generation returns to its starting value and a long-dead `EntityId` becomes
`isAlive` again (`:186-195`) — classic ABA. The consequences are not confined to the store:
`ActorIdentityRegistry` is keyed by `(kind, entityId)` and documents that "a destroy path must
release", `RoomInstanceRegistry.occupants` holds raw ids, and `IntakeSystem.occupantViewsOf`
already filters for liveness precisely because "`release` is never called for a destroyed
prisoner (#31)".

Unreachable today: I grepped `src/` and **nothing destroys a simulation entity** — the only
`.destroy(` calls are Phaser teardown in `src/rendering/`. The store's own doc comment
(`:56-58`) makes the same claim for the `>>> 0` discussion. So this is a latent defect that
becomes live on the same day #31 lands a release path.

**Fix.** When the release path is implemented: either detect wraparound (refuse to recycle an
index whose generation would wrap, retiring the slot) or widen the generation and narrow the
index, and add a test that drives one index through 4,097 cycles. Record the choice as an
amendment to ADR 0026 before the release path ships, not after.

---

## DET-14 — `canonicalJson` collapses `-0` to `0`

**Severity: Info. CONFIRMED.**

`canonicalJson` (`src/simulation/determinism/canonical.ts:7-14`) delegates
numbers to `JSON.stringify`, and `JSON.stringify(-0) === "0"`. So two states differing only by
the sign of a zero hash identically under `deterministicStateHash` (`:17-24`) — a false
*equality*, which is the direction that hides a divergence rather than inventing one.

`NaN`/`Infinity` cannot reach a payload: `isJsonValue` requires `Number.isFinite`
(`src/shared/json.ts:30-32`) and gates `versionedPayloadSchema`'s `structured-clone` data
(`src/simulation/protocol/types.ts:43-45, 59-66`). And `-0` is not currently producible in
persisted float state — `scoreSectorRisk`'s `Math.max(0, …)` (`incidents/sector-risk.ts:48`)
returns `+0`. So this is a note on the hash's precision, not a live bug.

**Fix.** In `canonicalJson`, emit `"-0"` for `Object.is(value, -0)`, and assert in
`tests/helpers/determinism-state.ts` that the hash distinguishes them.

---

## DET-15 — `ContainerRegistry.loadSnapshot` throws on an unknown container id

**Severity: Info. CONFIRMED.**

`ContainerRegistry.loadSnapshot` (`src/simulation/operations/inventory.ts:123-127`) calls
`this.require(containerId)`, which throws `Unknown container id "…"`. A save written by a build
that registered a container this build does not (or a container whose id was renamed) therefore
fails the whole restore with a message that names the id but not the cause, surfacing as
`snapshot-incompatible` via `handleInitialize`'s catch. It also does not clear containers absent
from the snapshot — harmless today because a restored runtime starts with empty containers, but
it means `loadSnapshot` is not idempotent-by-construction the way its siblings are.

**Fix.** Skip-and-report an unknown container id rather than throwing (the same tolerance
`ActorIdentityRegistry` shows a `poolId` mismatch), and clear known containers first so the
load is a replacement rather than a merge.

---

## What is genuinely solid

This is a determinism story that has been thought about hard, and most of it holds up under
tracing. Specifically verified correct:

- **`Xoshiro128StarStar` is a faithful implementation.**
  `src/simulation/rng/xoshiro128starstar.ts:24-35` matches the reference `next()` operation for
  operation, including `rotl`'s `>>> (32 - shift)` (correct for both shifts used, and correct
  on the negative int32 intermediates the XORs produce, because `>>>` applies ToUint32).
  `nextInt` (`:41-51`) is proper rejection sampling with an unbiased limit, and the
  `boundExclusive === 2**32` edge is handled. The all-zero state is refused at construction and
  patched at derivation (`seed.ts:30`).
- **Stream derivation and isolation.** `deriveXoshiroState` is a pure function of
  `(masterSeed, streamName)` through FNV-1a + SplitMix64 (`seed.ts:21-32`), stream names are
  regex-constrained so the FNV walk is code-point-stable, duplicates are refused
  (`streams.ts:11-15`), unknown names throw rather than silently self-seeding, and `snapshot()`
  sorts by name so registration order cannot reach a save.
- **System ordering.** Fifteen systems with fifteen **distinct** `order` values
  (50, 55, 60, 100, 110, 120, 150, 250, 260, 265, 270, 280, 285, 290, 295), sorted by
  `(order, id)` on every registration (`kernel.ts:113-116`), exposed read-only for pinning
  (`:99-101`), and actually pinned. `Kernel.step` evaluates the schedule *before* incrementing,
  and `StateIncomeSystem`'s comment (`economy/income.ts:233-238`) shows someone reasoned about
  exactly that.
- **Command ordering.** Total order on `(executeAtTick, sequence)`, applied on submit and again
  on both restore paths; duplicate/gap/past-tick refusals carry a typed discriminant
  (`CommandRejectionKind`) mapped exhaustively at the worker boundary. The main thread's
  optimistic sequence with snapshot re-baselining and forward-only advance
  (`src/ui/simulation-commands.ts:194-206, 286-290`) is a sound recovery design.
- **Quantised needs decay.** `NEED_SCALE = 200` with every rate a whole number at that scale
  (0.05→10, 0.03→6, 0.02→4, 0.08→16, 0.01→2, 0.015→3), so `decayNeed` is exactly linear in
  ticks and `intervalTicks` genuinely cannot change the outcome. This is the fix for a real
  past bug (#259) and it is done properly, in the stored units, with the sub-level remainder
  persisted.
- **Integer money.** Treasury and procurement work in minor units with `Number.isSafeInteger`
  guards and a `MAX_PURCHASE_QUANTITY` bound chosen to keep `price × quantity` exact
  (`economy/procurement.ts:100-108, 158-170`). `stateIncomeAccruedByTick` uses one
  `floorDiv` whose remainder is provably zero at the payment boundary
  (`economy/income.ts:209-220`). No float money anywhere.
- **Navigation determinism.** A*'s open-set selection breaks ties on the tile key with a total
  comparator (`local-search.ts:141-148`), region Dijkstra on the region id (`region-dijkstra.ts:62-66`);
  the Manhattan heuristic's admissibility precondition is stated, tied to
  `MINIMUM_DOOR_COST_MULTIPLIER`, and enforced in `DoorRegistry.register`. The region graph
  sorts chunks by position, assigns region ids by a deterministic tile scan, and sorts portals
  by door id with an explicit "never `localeCompare`" comment (`region-graph.ts:83-85, 152-160`).
  The work budget defers requests without truncating a search, so it changes latency and not
  results (`path-request-queue.ts:173-174`).
- **Cache invalidation is unusually rigorous.** `DoorDependency` records **both** the access
  verdict and the traversal cost, and `doorDependenciesStillHold` compares the cost whenever
  access is allowed (`route-dependencies.ts:79-92`). An `open → closed` transition (same access,
  different cost) therefore *does* evict — the exact stale-route hazard I went looking for, and
  it is closed. The registry-wide `accessRevision` fast path plus per-door `accessVersion` keeps
  it cheap, and `portalIsUncrossable` keeps invalidation proportionate with a measured
  justification.
- **Canonical ordering is pervasive and enforced twice.** Nearly every `getSnapshot` sorts;
  `canonical-iteration-contract.test.ts` is a genuinely good static contract whose comment
  documents its own limits honestly (lookup-then-spread, `src/rendering/` exclusion) and whose
  scanner distinguishes `Map.entries()` from `Array.entries()` with pinned fixtures in both
  directions. `EntityQuery.execute`'s comment was *corrected* to the narrower guarantee it
  actually delivers, which is the opposite of the usual drift.
- **The `-0`/NaN boundary.** `isJsonValue` requires finiteness, so no non-finite value can
  cross the worker protocol or reach a save.
- **Documentation discipline.** `docs/DETERMINISM.md` and `docs/PERSISTENCE.md` record known
  limitations with *measured bounds* rather than adjectives (`performingSince` = 5 ticks;
  `IncidentResponseSystem` = up to `containmentTicks` = 60). Several comments in the code
  explicitly correct earlier over-claims. The findings above are mostly gaps in that record, not
  contradictions of it.

---

## Prioritized top five

1. **DET-01 — orphaned RNG closure after restore.** A live, silent, save-corrupting
   determinism break in the guarantee ADR 0009 sells as a product feature. One-line
   reachability, executed proof. Fix `Kernel.restoreState` to load into the existing stream
   container rather than replacing it, and add a hire-after-restore regression test.
2. **DET-03 — persist the master seed.** It unblocks DET-02's fix, removes DET-01's
   "everyone gets seed 0" amplification, closes DET-07 by making the parameter non-optional,
   and is a prerequisite for replay verification from a save. Smallest change with the widest
   effect.
3. **DET-02 — reconcile RNG streams at restore.** Today, adding one named RNG stream bricks
   every existing save with a `RangeError` fifty ticks after a successful load. Do this before
   the next stream is added, not after.
4. **DET-04 + DET-06 — make a faulted tick unserialisable.** Add the missing state guard to
   `handleRequestSnapshot` and decide the tick-fault policy. Together they are the path from
   "a system threw" to "a save with a half-applied tick and a valid checksum", which includes
   double-paid state income.
5. **DET-05 — `<=` in the command-dispatch head test, plus a schema invariant.** A one-token
   change plus a `superRefine` that converts a permanent, silent, whole-queue deadlock into a
   rejected save.

Runners-up worth scheduling: **DET-08** (add the `Math.*`/timer prohibitions while the tree is
still clean — the cheapest determinism insurance in the list) and **DET-10** (settle chunk-set
ownership before any parcel-purchase command exists).
