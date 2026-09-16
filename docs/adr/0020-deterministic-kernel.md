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

> **The middle clause is kept and is not a date on anything below it**
> (`docs/AGENT_WORKFLOW.md` §4: mark both directions). It says the anchors were
> *opened* at `792bf94`, which was true; a reader meeting it reasonably
> concludes there is nothing under it to check, and that conclusion is wrong.
> `374065b2` and `a7aa52ed` both re-aimed anchors inside this document beneath
> that unchanged sentence — two of the seven commits tabulated in
> `docs/adr/README.md`'s section *"A global anchor pin in an ADR is advisory,
> and does not date what is below it"*. Swept again on 2026-09-15 against
> `origin/main` at `e044a3e8`: of the rooted anchors below, six still landed on
> what their sentence names and eleven did not. The eleven are re-aimed in
> place, each carrying the number it used to hold. The per-anchor pins
> (*"as of `83d9616`"*) are left exactly as they are — that is the form that
> works, and this section is why.

### 1. Commands are not dispatched in sequence order. They are dispatched in `(executeAtTick, sequence)` order — and have been since this document's own commit

"Ordered Command Queue" says:

> At the start of a tick, all due commands are dispatched in strict sequence
> order before any systems run.

The second half is exact: `Kernel.step()` in `src/simulation/kernel/kernel.ts`
runs three numbered steps in order -- the `while (true)` drain loop to
completion, then `// 2. Execute systems due at this tick`, then `// 3. Advance
tick` and `this._tick++` (`:228-245` as of `83d9616`; this sentence cited
`:202-216`, which #444 found had drifted onto the doc comment above the loop). The first half names the wrong key. `submitCommand` sorts the queue
by `executeAtTick` **first** and by `sequence` only as the tie-break -- both
sorts are written out as `if (a.executeAtTick !== b.executeAtTick) return
a.executeAtTick - b.executeAtTick;` followed by `return a.sequence - b.sequence;`,
in `Kernel.submitCommand` and again in `Kernel.restoreState`
(`kernel.ts:150-153` and `:323-326` as of `83d9616`; this sentence cited
`:141-144` and `:297-300`, which had drifted onto the past-tick refusal and onto
a comment), and
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

The second case needs no save file. `src/ui/simulation-commands.ts:319-324` (the anchor read `:129-130`)
projects `executeAtTick` as `lastTick + ceil(elapsed × speed / 50) + 20` while
the clock runs and as a bare `lastTick` while it is paused (`:320`), so a player
who issues an order and then pauses within the twenty-tick lead has issued two
commands whose sequence order and tick order disagree. The kernel then applies
the later one first.

This is not a determinism defect and is not reported as one: both keys are
persisted (`src/persistence/save-schema.ts:88-95`; the anchor read `:75-82`, was
re-aimed to `:79-87` by this branch, and had drifted **a second time** by the
time `origin/main` was merged on 2026-09-16 — `:79-87` is now a docblock about a
schema-version tally), the comparator is total, and
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

> **Answered on 2026-08-27 — see "Decision, 2026-08-27" at the end of this
> document. The paragraph above is left exactly as written, because it is the
> question the decision was taken against, and one of its two premises did not
> survive being measured: guarding `submitCommand` would not have made the
> sentence true.**

### 2. The kernel has no tick rate. `FixedStepClock` has a 50 ms *simulated* step, and the wall-clock rate is 20, 40 or 80 ticks per second

"Fixed Step Pacing" opens:

> The kernel executes precisely 20 ticks per second (50ms step).

`src/simulation/kernel/` contains no `50` and no time value of any kind — `grep
-rn "50" src/simulation/kernel/` is empty, and `Kernel.step()` takes no argument
and reads no clock. Pacing lives one module over, in
`FixedStepClock` (`src/simulation/clock/fixed-step-clock.ts:29`, `stepMilliseconds
= 50`), which the worker constructs as `new FixedStepClock(50, { mode: 'paused' })`
at `src/simulation/worker/state-machine.ts:254` and again at `:1067` (the anchors
read `:203` and `:724`, were re-aimed to `:254` and `:1045` on 2026-09-15, and
the second went stale **again** before this branch merged `origin/main` on
2026-09-16 — `:1045` is a bare `try {`). That clock
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
`DEFAULT_LEAD_TICKS = 20` (`src/ui/simulation-commands.ts:118`; the anchor read `:64`) inherits the same
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
scenarios explicitly, and `docs/BENCHMARKING.md:41` (the anchor read `:38`) lists this one as
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
  that the id is not already taken (`kernel.ts:108-112`; the anchor read `:107-110`). Neither "integer" nor
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
  (`kernel.ts:392`), `restoreState` assigns the queue directly (`:373`), and
  the save schema validates `tick` and each `executeAtTick` as independent
  non-negative integers and never their relation
  (`src/persistence/save-schema.ts:88-95` and `:97-104`; those four anchors read
  `:315-316`, `:296`, `:75-82` and `:84-91` until 2026-09-15, were re-aimed to
  `:392`, `:373`, `:79-87` and `:88-95` then, and **the two save-schema ones went
  stale a second time** before this branch merged `origin/main` on 2026-09-16.
  `queuedCommandSchema` is `:88-95`, `kernelSnapshotSchema` is `:97-104`, and the
  two kernel anchors still hold. The claims were re-checked at the new lines: all
  four hold). The kernel's own comment states this
  and says the missing check belongs at the save boundary (`:252-262`; the anchor read `:189-199`); it is
  still not there.
- **"100% decoupling from Phaser render ticks."** Holds: `grep -rn "from
  'phaser'" src/simulation/` is empty, and
  `tests/unit/rendering-module-boundaries.test.ts:82` asserts the absence. It is
  an absence claim with a gate under it, which is the only kind worth writing.

### What was checked and found intact

`tick % system.schedule.intervalTicks === system.schedule.phaseTicks`
(`kernel.ts:202`) is verbatim the "Fixed Step Pacing" formula. Systems sort by
`order` then `id` (`:114-118`). RNG streams are named, are `Xoshiro128**`, and
carry `algorithm: 'xoshiro128**', version: 1` in every serialized state
(`src/simulation/rng/xoshiro128starstar.ts:1-5`, `:54`), so "strictly versioned
and serialized" is exact. `snapshot()` includes every stream (`kernel.ts:290-296`; these three anchors read
`:213`, `:113-116` and `:226`).
`Math.random`, `Date.now` and `new Date(` do not occur anywhere under
`src/simulation/`; the single ambient time source is `() => performance.now()`
injected at the worker boundary (`src/simulation/worker/worker.ts:24`).

## Decision, 2026-08-27: `submitCommand` keeps admitting a command scheduled behind one already queued

*This closes the one question §1 of the amendment above left open. It changes no
code and no persisted format; it records a **decision not to change one**, which
is a decision and is recorded as one so nobody re-opens it from the same
sentence. Status is untouched: this ADR remains **Accepted**. Read at `fa12249`
(v0.0.121); every `file:line` below was opened on that tree, and every number
quoted was produced by running the shipped classes rather than reasoned about.*

> **A second global pin, and it dates what is below it no more than the first
> one does.** Read it as "opened at `fa12249`" and check anything you intend to
> rely on. Swept 2026-09-15; the anchors under it are re-aimed in place with
> the numbers they used to hold kept beside them.

### The delegation this rests on

The owner delegated the judgement in these words, quoted verbatim:

> "Z tym ci.yml to nie wiem, żrob by było dobrze z tymi ADR tak samo, zrób dobrze."
>
> ("About that ci.yml I don't know, do it so that it's right — same with those
> ADRs, do it right.")

That is **an approval of the judgement being delegated, not of the text below.**
Nobody has signed off on this reasoning; the owner asked for it to be got right
and has not read it. A reader who disagrees with it should treat the decision as
open and say so, rather than treating this heading as settled precedent.

### The decision

`Kernel.submitCommand` **keeps** its three refusals — duplicate sequence,
sequence gap, and `executeAtTick < tick` (`kernel.ts:119-147`; the anchor read `:119-137`) — and gains no
fourth. A command whose `executeAtTick` is below the highest tick already in the
queue is admitted, exactly as today, and the queue keeps dispatching in ascending
`(executeAtTick, sequence)` order.

### Every caller, and what each one submits

There is **one** caller in `src/`:
`src/simulation/worker/state-machine.ts:1152`, inside `handleSubmitCommand`
(`:1139`; the anchor read `:786`, was re-aimed to `:1130`/`:1117` on 2026-09-15,
and **both went stale a second time** before this branch merged `origin/main` on
2026-09-16 — `:1130` is now the `payload:` key of `handleSetClock`'s reply), which
forwards `commandId`, `sequence`, `executeAtTick` and the packed command straight
off a `simulation/submit-command` message. Nothing else in `src/` calls it —
`Kernel.restore` and `restoreState` deliberately do not (below), and the only
other occurrences of the name in `src/` are the Zod schema for that message
(`src/simulation/protocol/types.ts:266-269`; the anchor read `:249`) and comments. `grep -rn submitCommand
src tests` puts every other call site under `tests/`, and a test-only need would
not have been a product need in any case.

So the census is really a census of one message, and its `executeAtTick` is
computed in exactly one place:
`SimulationCommandSender.projectExecuteTick` (`src/ui/simulation-commands.ts:290-291`),
read at `:401`. It returns `lastTick` while the clock is paused and
`lastTick + ceil(elapsed × speed / 50) + leadTicks` while it runs, with
`DEFAULT_LEAD_TICKS = 20` (`:118`). **Those four anchors read `:127-131`,
`:202` and `:64`**, and one sentence they carry has stopped being true besides
the numbers: the projection is today
`this.lastTick + Math.ceil(((elapsed + margin) * this.clockSpeed) / TICK_MILLISECONDS)`
(`:319-324`), so the lead sits **inside** the ceiling and is scaled by speed
rather than added after it, and that estimate is wrapped by ADR 0056's
monotonicity floor, `Math.max(this.projectFromClock(...), this.highestSubmittedTick)`
(`:290-291`). The paragraph is kept as written because the case it builds — a
pause collapsing the projection onto `lastTick` — is the case the blockquote
below records ADR 0056 as having closed.

**Yes, something legitimately submits a tick below the highest already queued,
and this is the timing.** The player gives an order while the clock runs — it is
projected twenty-odd ticks into the future — and then pauses. `handleSetClock`
answers with the kernel's exact tick (`state-machine.ts:1126-1131`, which posts
`tick: this._kernel!.tick`; the anchor read `:763-773`, was re-aimed to
`:1101-1115` on 2026-09-15, and that landed on the tail of the *previous* method
even before `origin/main` was merged on 2026-09-16), the HUD's
projection collapses onto it, and the next order given during that pause carries
a *lower* tick and a *higher* sequence than the one still queued. Driven through
the shipped sender against the shipped worker, with a real `Kernel` and a real
`FixedStepClock` inside it, that is:

- order one accepted as `queued`, sequence 0, `scheduledForTick` **62**;
- the pause reported at tick **42**;
- order two accepted as `queued`, sequence 1, `scheduledForTick` **42**.

Both `queued`, no refusal, and the kernel then holds sequence 1 at the head.
`tests/determinism/command-queue-admission.test.ts` is that run.

### What the refusal would have caught, stated at its strongest

Not nothing. `Undo` and `Redo` travel in the same command stream and count
positions in it, so a pause that backdates an order can invert an undo against
the order it was meant to undo. Measured on a real `ConstructionSystem` with the
real command handler: place `first` at tick 0; while running, place `second`
projected to tick 21; pause and press Undo, projected to the current tick 1. The
Undo dispatches at tick 1, **before** `second` exists, and the outcome is
`{"first":"cancelled","second":"assigned"}` — the player's earlier wall is
cancelled and the wall they were trying to take back gets built. That is a real,
reachable, player-visible defect and it is the strongest case for the guard.

It is still not a case *for this guard*, for four reasons, in descending order of
weight.

**1. The refusal cannot establish the invariant it exists for.** §1 above offered
"correct the sentence, or make `submitCommand` refuse" as two routes to the same
end. They are not. `Kernel.restore` states outright that it bypasses this
validation — *"Bypassing submitCommand validation as this is a restore from valid
state"* (`kernel.ts:392`) — `restoreState` assigns the queue directly
(`:373`), and `kernelSnapshotSchema` validates `tick` and each `executeAtTick` as
independent non-negative integers and never their relation
(`src/persistence/save-schema.ts`). So a restored session can hold exactly the
shape the front door would be refusing, no downstream reader could rely on the
guard, and this ADR's original sentence would have stayed false for restored
sessions either way. **Correcting the sentence was never one of two options; it
was the only one.**

**2. The cost is not one refusal, it is every refusal for the length of the
pause.** `FixedStepClock.pump` returns `0` while paused
(`src/simulation/clock/fixed-step-clock.ts:68`) and the worker's tick loop runs
only while the clock is pumping (`state-machine.ts:392-398`; the anchor read
`:269-282`, was re-aimed to `:353-359` on 2026-09-15, and that landed on two
unrelated private fields). **One word of the claim is corrected rather than
overwritten** (`docs/AGENT_WORKFLOW.md` §4): `onTickLoop`'s own guard admits
`running` **and** `paused` (`:393`), so the loop does run while paused — what
makes nothing drain is `FixedStepClock.pump` returning `0`, which the sentence
before this one already says. So while the player is
paused *nothing drains the command queued ahead*. It stays the highest tick in
the queue, and every further order given during that pause meets the same
refusal. Pausing to give orders carefully is the ordinary way this game is
played; the guard turns the build controls off for the whole of it.

**3. It refuses the first order after a load.** A save taken while orders are in
flight carries them, and this repository's own determinism scenario is exactly
that shape: captured at tick 0 with build orders still pending at ticks 30 and
70. The restored session arrives `paused` at tick 0, so the player's very first
action meets a queue whose highest tick is seventy ahead of anything the HUD will
aim at. Not hypothetical: applying the guard as a mutation broke
`tests/unit/worker-status-counts.test.ts`'s *"keeps carrying the standing refusal
beside counts that do move"*, which is that flow.

**4. A refusal costs the HUD its sequence baseline.** `SimulationCommandSender`
clears `sequenceSynced` on any rejection (`src/ui/simulation-commands.ts:579`; the anchor read `:243-246`)
because a rejection means its idea of the sequence is wrong in an unknown
direction. So each refusal disables `submit` until the next `simulation/snapshot`
re-baselines it — the correct response to a real desync, and an expensive one for
a command that was never desynced.

> **"On any rejection" is no longer true**, and the sentence is kept rather
> than overwritten (`docs/AGENT_WORKFLOW.md` §4). `observeRejection` now
> excepts one case: a `past-tick` refusal of the command this class most
> recently submitted rewinds `nextSequence` and returns without clearing the
> baseline, *"because `sequence` is compared against the counter this class
> advanced when it sent that command"*. Every other rejection still drops the
> baseline, so ground 4's cost argument holds for the guard it was written
> about — the guard would have thrown `invalid-state`, not `past-tick`.

### The four shapes of "refuse", and why the shape does not rescue it

- **Throw**, which is what `submitCommand` already does. Safe at this boundary,
  and worth saying because it is easy to assume otherwise: the fault path #415
  and #424 exist for is a throw *inside the tick loop*
  (`state-machine.ts:410-411`, the `catch (e)` that calls
  `this.fault('internal-error', ...)`; the anchor read `:307`, was re-aimed to
  `:393` on 2026-09-15, and `:393` is the loop's *state guard* rather than its
  fault path), which becomes a terminal `internal-error`.
  `handleSubmitCommand` catches separately (`:1170-1188`) and posts a `rejected`
  command-result with `recoverable: true`, and `COMMAND_REJECTION_FAULT_CODES`
  maps the kind to a fault code exhaustively (`:231-235`; these four anchors read `:307`, `:804-821`,
  `:180-184` and, below, `:801`) — a fourth
  `CommandRejectionKind` fails to compile until it is mapped, which is the design
  working. Rejected on cost, not on mechanism.
- **Drop.** Refused for the reason already recorded in `step()`: ADR 0009 makes
  the command stream replay evidence and `Undo`/`Redo` count positions in it, so
  discarding a command puts a hole in the log a replay reproduces from. Dropping
  is corrupting where late is merely late.
- **Clamp** — raise `executeAtTick` to the highest queued. Deterministic, and it
  adds no state: the clamp would be a pure function of the queue. But it makes
  the worker's acknowledgement untrue — `handleSubmitCommand` reports
  `scheduledForTick: msg.payload.executeAtTick` (`:1168`; the anchor read `:801`,
  was re-aimed to `:1146` on 2026-09-15 and went stale **a second time** before
  this branch merged `origin/main` on 2026-09-16), the tick the main
  thread *asked* for, so a clamp silently disagrees with what the HUD is told
  unless that line changes too. And it puts the fix in the wrong layer: the
  kernel would be second-guessing a projection it cannot see.
- **Reschedule to the current tick.** Strictly worse than clamping: the same
  silent rewrite, and it does not even fix the inversion, because the command
  ahead is still ahead.

### Determinism, and why this is not a save-schema question

This decision adds no field, no map iteration, no clock read and no random draw.
The comparator is unchanged and total, both its keys are already persisted, and
every client restoring the same bundle dispatches in the same order — which the
amendment above already established, and which `docs/DETERMINISM.md` already
states correctly: *"The pending queue is sorted by `(executeAtTick, sequence)` —
a total order — both on submission and on restore, so a restored queue dispatches
identically to a live one."* No save version moves, and neither
`docs/PERSISTENCE.md` nor ADR 0038 is engaged. That the code-adjacent document had
the key right all along is itself part of the argument: this ADR was the only
place that said otherwise.

### What is left open, and is the owner's rather than this document's

The inversion in "What the refusal would have caught" is **not fixed by this
decision and is not closed by it.** Its correct home is one module over, in
`SimulationCommandSender.projectExecuteTick`: return
`Math.max(projection, highestTickThisSenderHasSubmitted)`. That makes the two
orders agree at the source, refuses nothing, adds one cached echo to a class that
holds only cached echoes, and touches neither the kernel, the save format nor
determinism. It is a change to *when a paused order runs* — it would run in the
order the player gave it rather than on the first step after play — so it is a
product decision, it needs its own issue, and it is deliberately not taken here.
It would also be incomplete on its own, because a restored queue can hold
commands ahead of anything that sender has submitted; one more reason the
sentence had to be corrected rather than the code.

**That issue is #437**, and the inversion was reproduced a second time before it
was filed, by a different reader and from this section's description alone —
which is the only reason it is stated as a defect here rather than as a
prediction. The independent run reports the three commands accepted with no
refusal at `(sequence 0, tick 0)`, `(sequence 1, tick 21)` and `(sequence 2, tick
0)`, and, once the queue drains, `first` **cancelled** with `second` still alive
at `materials-pending`, `undoStack` empty and `redoStack` holding `first`. The
stacks are the part this section understated: after the inversion the player
cannot undo again, and Redo offers back a wall they never asked to remove.

> **Taken, 2026-08-28, as [ADR 0056](./0056-keeping-a-players-orders-in-the-order-they-gave-them.md)**
> — the `Math.max` above, with the restored-queue incompleteness closed by
> seeding the floor from the snapshot's own pending queue. Two consequences for
> *this* section, recorded here because a reader arrives at it from the decision
> and not from #437. **The decision itself stands and is not re-opened.** But
> grounds 2 and 3 above are costs of refusing an `executeAtTick` *below* the
> highest queued, and **the shipped sender no longer submits one** — so against
> today's front door the rejected guard is inert rather than expensive, and the
> end-to-end numbers quoted under *"Every caller"* (62, pause at 42, then 42)
> now read 62, pause at 42, then 62. Ground 1 is untouched and is what the
> decision rests on: `Kernel.restore` still bypasses `submitCommand` and
> `kernelSnapshotSchema` still never validates the tick relation, so a guard
> here still could not establish its invariant.
> `tests/determinism/command-queue-admission.test.ts` was updated with the new
> observations and still pins admission, against `Kernel` directly for the two
> cases the front door no longer reaches.
>
> **One correction to the paragraph above**, which ADR 0056 measured: the run it
> quotes sent no `transactionId`, and the shipped HUD sends one per gesture
> (`src/main.ts:2934`; the anchor read `:1915`). Re-run that way the redo stack is **empty too**, because
> `second` arriving after the `Undo` opens a gesture of its own and
> `registerTransactionOrder` clears it. So *"Redo offers back a wall they never
> asked to remove"* understates it in turn: through the real front door there was
> nothing to press at all, and the wrongly cancelled wall was unrecoverable.

### The guard

`tests/determinism/command-queue-admission.test.ts` pins this decision, and was
mutation-tested against the guard it rejects. With that guard added to
`submitCommand`, the end-to-end case reports `Cannot schedule command behind one
already queued: tick 42 < queued 62`, two of its four cases fail, and so do
`tests/unit/kernel.test.ts` and `tests/unit/worker-status-counts.test.ts`. The
dispatch *ordering* stays pinned where it was, in
`tests/determinism/kernel-system-order.test.ts`.

## Amendment, 2026-08-28: dispatch is no longer tied to the start of a tick

*This amends **the "Ordered Command Queue" heading** for a second time, and
records where the decision now lives. Status is untouched: this ADR remains
**Accepted**. Nothing about ordering, sequencing or replay changes.*

The heading says, and the 2026-08-27 amendment above restates:

> At the start of a tick, all due commands are dispatched in strict sequence
> order before any systems run.

The clause corrected there was *"in strict sequence order"*. The clause
corrected here is **"at the start of a tick"**.

`Kernel.step()` no longer holds the drain loop itself: it is
`Kernel.dispatchDue`, reached from `step()` as step 1 and from the public
`Kernel.dispatchDueCommands()`, which dispatches every due command and advances
nothing. The worker calls that second entry point from `handleSubmitCommand`
while the clock's control is `paused`, because the tick loop runs only in the
`running` state and a command a player gave during a pause would otherwise
produce nothing they could see until they pressed play.
[**ADR 0051**](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
(*"What a player sees for an order given while the clock is paused"*) carries the
reasoning, the alternatives and the open questions. It was drafted with a
placeholder number and landed as 0051; this sentence still said `XXXX`
afterwards, which is corrected here rather than left for the next reader.

**What the sentence should now say:** *every command is dispatched at the tick
its `executeAtTick` names, in ascending `(executeAtTick, sequence)` order,
before any system runs at that tick.*

That is the property determinism rests on, and it is unchanged by the new
caller: `_commands` is sorted by `(executeAtTick, sequence)` and drained from
the head by one loop, so a command dispatched during a pause at tick *N* is
dispatched at tick *N*, in the same position `step()` would have dispatched it,
before any system has run at tick *N*. A replay from a snapshot taken before
the pause re-dispatches it identically; a snapshot taken during the pause
carries its effect and no longer carries the command.

The section *"`submitCommand` keeps admitting a command scheduled behind one
already queued"* is **not** amended and its cost argument still holds. A
command carrying the twenty-tick lead it was given while the clock ran is not
due, so the paused drain leaves it alone: it remains the highest tick in the
queue for the length of the pause, and every further order given during that
pause still has the shape the rejected guard would have refused.
`tests/determinism/command-queue-admission.test.ts` measures both halves.

> **This document contradicts itself here, and the contradiction is corrected
> rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4). The last sentence but
> one is false of the shipped front door, and it has been since three hours
> after it was written. It arrived in `fd2584d5` (2026-08-28 11:39 +0200);
> `a7aa52ed` (2026-08-28 14:51 +0200) added the ADR 0056 blockquote three
> sections above, which says the opposite in as many words — *"the shipped
> sender no longer submits one … the end-to-end numbers … now read 62, pause at
> 42, then 62"* — and did not carry this paragraph with it. Re-read on
> 2026-09-15: `projectExecuteTick` is
> `Math.max(this.projectFromClock(leadTicksOverride), this.highestSubmittedTick)`
> (`src/ui/simulation-commands.ts:290-291`), so the second order in a pause
> takes the queued 62 rather than the clock's 42 and **does not** have the
> shape the rejected guard would have refused. The first half of the sentence
> — that a command carrying its lead is not due and the paused drain leaves it
> alone — is unaffected and still true, which is why the sentence is kept and
> marked rather than deleted. The decision the section records is untouched:
> ground 1 of it, that `Kernel.restore` bypasses `submitCommand` so a guard
> could not establish its invariant, never depended on the sender at all.
