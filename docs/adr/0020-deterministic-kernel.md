# ADR 0020: Deterministic Kernel and Scheduler

## Status
Accepted

## Context
Lockstate requires a fully deterministic headless simulation foundation that runs identically across clients, isolating all game logic from presentation concerns like framerate or DOM interactions. The architecture must guarantee strict multi-rate system scheduling, ordered command application, and reproduceable state snapshots without relying on ambient JavaScript nondeterminism (e.g., `Math.random()` or wall-clock `Date.now()`).

## Decision
We chose to implement a bespoke `Kernel` class that operates completely independent of the rendering loop. 

### Fixed Step Pacing
The kernel executes precisely 20 ticks per second (50ms step). Systems evaluate their schedule using integer tick intervals and phases (e.g., `tick % interval === phase`), rather than floating-point time deltas. This enforces strict determinism regardless of CPU power or rendering frame rates.

### System Ordering
To prevent registration-order instability, every registered system must define an explicit integer `order` and a stable string `id`. Systems are deterministically sorted primarily by `order` and secondarily by `id`.

### Ordered Command Queue
Commands are submitted with an explicit `executeAtTick` and a contiguous sequence number. The kernel tracks the expected sequence and safely rejects duplicates, gaps, and commands scheduled in the past. At the start of a tick, all due commands are dispatched in strict sequence order before any systems run.

### Named RNG Streams
Instead of a single global RNG which couples unrelated systems (e.g., UI animations perturbing pathfinding), subsystems claim named `Xoshiro128**` RNG streams. RNG state is strictly versioned and serialized, enabling fast deterministic snapshot restoration.

## Consequences

**Positive:**
- Complete deterministic guarantee across simulation states.
- 100% decoupling from Phaser render ticks, enforcing strict separation of concerns.
- Easy to test and benchmark headless logic. Multi-rate schedules have proven extremely fast (~1.6ms to process 5,000 active systems).

**Negative:**
- Requires careful handling of continuous inputs. Developers must adapt to building systems around 50ms intervals instead of continuous frame loops.
- Snapshot payloads will include the state of all RNG streams, which adds a minimal overhead but remains lightweight compared to typical save data sizes.

## Amendment, 2026-08-27: two of the four Decision headings state something the kernel has never done, and the one number in Consequences measures a model of the kernel rather than the kernel

*This amends **the "Fixed Step Pacing" and "Ordered Command Queue" headings and
the third Positive consequence**. No decision moves. The design is unchanged and
so is its determinism: what has gone wrong is that three sentences describing the
mechanism describe it inaccurately, and two of the three were inaccurate in the
commit that wrote them. The form is the one ADR 0029's amendment and ADR 0034 §9
established — the old wording is quoted rather than overwritten, and what the
tree does instead is recorded beside it.*

*Status is untouched: this ADR remains **Accepted**. Read at `792bf94`
(v0.0.121); every `file:line` below was opened on that tree, every symbol was
grepped, and the two dispatch orders quoted below were produced by running the
real `Kernel` through `benchmarks/production-modules.mjs`'s resolver rather than
reasoned about.*

### 1. Commands are not dispatched in sequence order. They are dispatched in `(executeAtTick, sequence)` order — and have been since this document's own commit

"Ordered Command Queue" says:

> At the start of a tick, all due commands are dispatched in strict sequence
> order before any systems run.

The second half is exact (`src/simulation/kernel/kernel.ts:202-216`: the drain
loop runs to completion before the system loop begins, and the tick advances
after both). The first half names the wrong key. `submitCommand` sorts the queue
by `executeAtTick` **first** and by `sequence` only as the tie-break
(`kernel.ts:141-144`), `restoreState` re-sorts the same way (`:297-300`), and
`Kernel.restore` a third time (`:319-322`). Sequence decides the order only
among commands that share a tick.

That comparator is in `aae2fbc`, the commit that added both the kernel and this
ADR: `git show aae2fbc:src/simulation/kernel/kernel.ts` has
`if (a.executeAtTick !== b.executeAtTick) return a.executeAtTick - b.executeAtTick;`
at its line 75. **The sentence was false on the day it was written**, on
2026-08-22, and it has stayed false through every release since.

Two runs of the shipped class, not a reading of it:

- Restored at tick 10 with a queue of `{A, seq 0, tick 9}`, `{B, seq 1, tick 7}`,
  `{C, seq 2, tick 8}`, one `step()` dispatches **`B` → `C` → `A`**.
- Through the front door only — `submitCommand('P', 0, 20)` then
  `submitCommand('Q', 1, 0)`, both accepted because both are at or ahead of the
  current tick — `Q` (sequence 1) dispatches at tick 0 and `P` (sequence 0) at
  tick 20.

The second case needs no save file. `src/ui/simulation-commands.ts:129-130`
projects `executeAtTick` as `lastTick + ceil(elapsed × speed / 50) + 20` while
the clock runs and as a bare `lastTick` while it is paused (`:128`), so a player
who issues an order and then pauses within the twenty-tick lead has issued two
commands whose sequence order and tick order disagree. The kernel then applies
the later one first.

This is not a determinism defect and is not reported as one: both keys are
persisted (`src/persistence/save-schema.ts:75-82`), the comparator is total, and
every client restoring the same bundle dispatches in the same order. It is the
*documented* ordering that is wrong, and the sentence is load-bearing — the
overdue-drain fix in `bb8a57e` (#422) quotes exactly this sentence as its
authority, at `kernel.ts:176-179`, and
`tests/determinism/kernel-system-order.test.ts` already names the real key in a
case title: *"orders the pending command queue by (tick, sequence)"*.

**What the sentence should say:** *at the start of a tick, every command whose
`executeAtTick` has arrived or passed is dispatched before any system runs, in
ascending `(executeAtTick, sequence)` order.*

**Whether the code should instead be changed to match the sentence is a question
for the owner and is not decided here.** Dispatching strictly by sequence would
mean running a command before its scheduled tick, which no reading of this
document supports; the honest options are to correct the sentence, or to make
`submitCommand` refuse an `executeAtTick` below the highest already queued so the
two orders can never disagree. The first is a documentation fix; the second is a
behaviour change to a boundary the HUD already depends on.

### 2. The kernel has no tick rate. `FixedStepClock` has a 50 ms *simulated* step, and the wall-clock rate is 20, 40 or 80 ticks per second

"Fixed Step Pacing" opens:

> The kernel executes precisely 20 ticks per second (50ms step).

`src/simulation/kernel/` contains no `50` and no time value of any kind — `grep
-rn "50" src/simulation/kernel/` is empty, and `Kernel.step()` takes no argument
and reads no clock. Pacing lives one module over, in
`FixedStepClock` (`src/simulation/clock/fixed-step-clock.ts:29`, `stepMilliseconds
= 50`), which the worker constructs as `new FixedStepClock(50, { mode: 'paused' })`
at `src/simulation/worker/state-machine.ts:203` and again at `:724`. That clock
multiplies elapsed real time by the player's chosen speed before dividing by the
step (`:69-70`), and the ladder is `[1, 2, 4]` (`:17`). So the kernel advances
50 ms of *simulated* time per tick — which is the durable half of the sentence
and the half determinism rests on — while consuming **20, 40 or 80 wall-clock
ticks per second** depending on the transport control.

This was also true in `aae2fbc`: `git show aae2fbc:src/simulation/clock/fixed-step-clock.ts`
already declares `speed: 1 | 2 | 4` on its first line and already multiplies by
it. The clock landed in `b904a1b`, 53 minutes before this ADR, and
`git merge-base --is-ancestor b904a1b aae2fbc` confirms it. **Second sentence
false on arrival**, and for the same reason as the first: the document describes
a neighbouring module from memory.

**What the sentence should say:** *the kernel advances in fixed 50 ms simulated
steps. How many of those a second of real time buys is `FixedStepClock`'s
business and the player's — 20 at ×1, 80 at ×4 — and no simulation code may
depend on it.* The `// 1 second at the kernel's 20 Hz` beside
`DEFAULT_LEAD_TICKS = 20` (`src/ui/simulation-commands.ts:64`) inherits the same
conflation: twenty ticks is one second of simulated time and a quarter-second of
real time at ×4.

### 3. "~1.6ms to process 5,000 active systems" cites a benchmark that re-implements the kernel, and states no unit, machine or commit

The third Positive consequence reads:

> Easy to test and benchmark headless logic. Multi-rate schedules have proven
> extremely fast (~1.6ms to process 5,000 active systems).

The figure appears nowhere in this repository except in that sentence — no
result file, no fixture, no commit message. The scenario it can only have come
from is `benchmarks/scenarios/kernel-throughput.mjs`, whose `full` profile is
`operationsPerIteration: 5000, // 5000 synthetic systems` (`:110-114`), and which
was added in `aae2fbc` — this ADR's own commit.

That scenario does not run the kernel. Its own comment says so:
*"Minimal standalone implementation of Kernel logic for benchmark (since we can't
easily import TS directly here)"* (`:33`). Since #410 the repository classifies
scenarios explicitly, and `docs/BENCHMARKING.md:38` lists this one as
**"modelled — mock systems"**, under a rule stating that a modelled scenario's
numbers *"hold for any implementation — including one this repository does not
have"* and that such a scenario *"can never be a gate"*. The model has since
drifted from the thing it models in a way this ADR is entitled to care about: its
drain loop is `while (_commands.length > 0 && _commands[0].executeAtTick === _tick)`
(`:74`), the strict-equality form the production kernel abandoned in `bb8a57e`
because it wedged the queue.

Re-run at `792bf94` (v0.0.121) in the container this amendment was written in,
`node --experimental-transform-types scripts/run-benchmarks.mjs --profile full`
reports `kernel.throughput.benchmark@1 (full): 4.204 ms mean, 10.306 ms p95,
1189467 ops/s, checksum 0x39a821e7`. That is not evidence the old number was
wrong — a different machine is a different number, which is the point — but the
profile measures **100 ticks** of 5,000 systems per iteration (`TICKS = 100`,
`:61`), so "1.6 ms to process 5,000 active systems" does not name which of the
two quantities it is, and neither reading can be reproduced from what the
sentence carries.

**Label: UNVERIFIABLE, and it should be withdrawn rather than restated with a
fresh number.** A performance claim in this ADR needs a scenario that imports
`src/simulation/kernel/kernel.ts` through `benchmarks/production-modules.mjs`, in
the shape #410 already built for navigation. Until one exists, the honest
sentence is that multi-rate scheduling is *cheap in a model of it* and unmeasured
in the kernel.

### 4. Three claims that are true today and are the shape that rots

Flagged, not corrected — nothing below is wrong on this tree.

- **"every registered system must define an explicit integer `order` and a stable
  string `id`."** `SystemRegistration` types them `number` and `string`
  (`src/simulation/kernel/system.ts:14-15`) and `registerSystem` checks **only**
  that the id is not already taken (`kernel.ts:107-110`). Neither "integer" nor
  "stable" is enforced at runtime, and `NamedRngStreams` — the neighbouring
  registry in this same decision — does validate its key shape
  (`src/simulation/rng/streams.ts:13`). A `NaN` order makes the comparator return
  `NaN` and the resolved order implementation-defined, which is the one input to
  this ADR's determinism guarantee that nothing rejects.
  `tests/determinism/kernel-system-order.test.ts` pins the *sorting*, not the
  *admission*.
- **"safely rejects duplicates, gaps, and commands scheduled in the past."** True
  of `submitCommand` and of nothing else. `Kernel.restore` says outright
  *"Bypassing submitCommand validation as this is a restore from valid state"*
  (`kernel.ts:315-316`), `restoreState` assigns the queue directly (`:296`), and
  the save schema validates `tick` and each `executeAtTick` as independent
  non-negative integers and never their relation
  (`src/persistence/save-schema.ts:75-82` and `:84-91`). The kernel's own comment states this
  and says the missing check belongs at the save boundary (`:189-199`); it is
  still not there.
- **"100% decoupling from Phaser render ticks."** Holds: `grep -rn "from
  'phaser'" src/simulation/` is empty, and
  `tests/unit/rendering-module-boundaries.test.ts:82` asserts the absence. It is
  an absence claim with a gate under it, which is the only kind worth writing.

### What was checked and found intact

`tick % system.schedule.intervalTicks === system.schedule.phaseTicks`
(`kernel.ts:213`) is verbatim the "Fixed Step Pacing" formula. Systems sort by
`order` then `id` (`:113-116`). RNG streams are named, are `Xoshiro128**`, and
carry `algorithm: 'xoshiro128**', version: 1` in every serialized state
(`src/simulation/rng/xoshiro128starstar.ts:1-5`, `:54`), so "strictly versioned
and serialized" is exact. `snapshot()` includes every stream (`kernel.ts:226`).
`Math.random`, `Date.now` and `new Date(` do not occur anywhere under
`src/simulation/`; the single ambient time source is `() => performance.now()`
injected at the worker boundary (`src/simulation/worker/worker.ts:24`).
