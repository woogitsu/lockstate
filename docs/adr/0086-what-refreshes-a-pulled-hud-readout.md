# ADR 0086: What refreshes a pulled HUD readout

> **0086 was assigned by the sweep this corpus requires, not by reading one
> file.** `docs/adr/README.md`'s **Next free number: 0086** line agrees with
> `max + 1` off disk (highest on disk is `0085-what-the-hud-corner-is-for-and-what-the-strip-may-drop.md`).
> **The remote sweep was performed rather than asserted**, per ADR 0082's
> header and the practice ADRs 0083–0085 follow: `git ls-remote --refs --heads
> origin` returned every head on the remote, and `git ls-tree -r --name-only
> <head> -- docs/adr/` was read out of each one. The highest four-digit prefix
> appearing on **any** remote head is `0085`; no head names `0086`. The brief
> that commissioned this draft predicted 0086 and told this agent not to trust
> the prediction without the sweep — the sweep confirms it.
>
> **The number is nevertheless provisional.** A branch that has not pushed is
> invisible to this sweep. If 0086 collides, this file, its row in
> `docs/adr/README.md`, its **Next free number** line and every citation of
> "ADR 0086" are renumbered together; this draft pre-commits to that rather
> than arguing for its number.

## Status

**Proposed, 2026-09-01. Not self-approved.**

This document decides nothing on its own authority. It answers issue
[#718](https://github.com/matmaxalez/lockstate/issues/718)'s general question —
*"what cadence should a pulled readout have when the thing it depends on is not
what makes the counts move?"* — by first establishing that **the premise the
issue rests on is not what the tree does**, then enumerating every pulled
readout the HUD has, then costing the four candidates the issue names plus a
fifth the codebase already contains. It recommends one. What it recommends is
architecture, so `AGENTS.md`'s "never self-approve an ADR" applies in full.

Nothing in this document is player-visible. No locale key, no sentence and no
control is added or changed by any option below, which is why the fourth
standing exclusion (*"anything that reaches a player as a promise the code does
not keep"*) is not engaged by the decision — only by how quickly a true
readout is repainted.

## Context

### 1. What issue #718 says, in its own words

> The Regime roster is **pulled** — on `select-tab`, and on each
> `simulation/status-counts` publication. That channel publishes **only when a
> count changes**. In a prison where no place is occupied, the only per-tick
> mover is the income accrual, and that is a constant 0 while nobody is housed.
> **Measured: a roster frozen at the moment of the last admission, for a full
> 30-second poll.**

Every clause of the mechanism in that paragraph is correct except the first
sentence's list of what refreshes the readout, and that one omission changes
the answer.

### 2. The correction: the pull layer does not ride the counts channel

`src/main.ts:1702` opens one listener for every worker-to-main message. It
computes six translations, and it returns early **only if all six say nothing**
(`src/main.ts:1735-1740`):

```ts
if (
  clock === undefined &&
  counts === undefined &&
  nextAlerts === undefined &&
  zoning === undefined &&
  refusal === undefined &&
  event === undefined
)
  return;
```

Every message that survives that check falls through to `src/main.ts:1795-1804`,
which refreshes **all nine** pulled readouts:

```ts
} else {
  refreshRoomNeeds();
  refreshBuildQueue();
  refreshIntakePipeline();
  refreshPendingDeliveries();
  refreshHeldGuards();
  refreshStaffRoster();
  refreshStaffCoverage();
  refreshRegime();
  refreshPrisonerRoster();
}
```

`hudClockFromWorkerMessage` (`src/ui/simulation-clock.ts:22-57`) returns a view
model for **every** `simulation/clock-state`, unconditionally — it has no
"nothing changed" arm. And `publishClockState`
(`src/simulation/worker/state-machine.ts:438-462`) posts one every 250 ms for
the whole life of a running session; its own docblock says so, and
`src/rendering/feed/simulation-snapshot-feed.ts:264-268` says it again from the
other side: *"the worker posts one of these up to four times a second for the
life of a running session"*.

**So the binding cadence of every pulled readout in the HUD is the clock
heartbeat at 250 ms, not the counts channel at 500 ms, and not the counts
channel's change gate at all.**

### 3. The re-measurement asked for, on `main` at `b04e45f8` (v0.0.319)

The issue was filed 2026-08-31; the brief asked whether the symptom still
happens. It was re-measured today on the real
`SimulationWorkerStateMachine`, driven through the real tick loop with a
15 ms wake and `FixedStepClock(50)` at ×1, over 30 simulated seconds. Prisons
were built through the real command path (`PurchaseMaterials`, `ZoneRoom`,
`PlaceObject`, `AdmitPrisoner`) and snapshotted into the worker. Every message
the worker actually posted was then classified by **the composition root's own
predicate** — the six translator functions above, imported from `src/ui/`, not
re-implemented.

| prison, clock ×1 running | `status-counts` msgs / 30 s | `clock-state` msgs / 30 s | refreshes / 30 s | longest gap |
| --- | --- | --- | --- | --- |
| empty; two furnished cells, nobody admitted | **1** | 118 | **120** | **255 ms** |
| two admitted, no bed, nobody housed | **1** | 118 | **120** | **255 ms** |
| two admitted and housed | 59 | 118 | 178 | 255 ms |

| clock paused | `status-counts` | `clock-state` | refreshes / 30 s | longest gap |
| --- | --- | --- | --- | --- |
| two admitted, no bed, nothing pressed | 1 | 0 | **2** | **30,000 ms** |
| same, one `AdmitPrisoner` at t=10 s | 2 | 0 | 3 | 10,005 ms |

Read the first two rows against the third. **The issue's diagnosis of the
counts channel is exactly right** — a prison with no occupied place publishes
`simulation/status-counts` once, at `simulation/initialize`, and never again in
thirty seconds, while a housed prison publishes 59 times. `occupiedPlaces === 0`
makes `stateIncomeAccruedTodayMinorUnits` a constant
(`stateIncomeForOccupiedPlaces`, `src/simulation/economy/income.ts:456-465`,
folded through `stateIncomeAccruedByTick`, `:502-513`), and with it constant
there is no per-tick mover left among the twenty integers `statusCountsEqual`
compares (`src/simulation/worker/status-counts.ts:105-111`).

**And the readouts refresh 120 times anyway**, at worst 255 ms apart, because
the clock is in the same predicate.

### 4. The mutation, which is what makes the claim above load-bearing rather than incidental

The same measurement was re-run with one thing removed: the
`hudClockFromWorkerMessage` term in the listener predicate. Nothing else
changed — same worker, same prisons, same messages, same 30 seconds.

| prison, clock ×1 running | refreshes / 30 s **without the clock term** | longest gap |
| --- | --- | --- |
| empty; nobody admitted | **1** | **30,000 ms** |
| two admitted, no bed, nobody housed | **1** | **30,000 ms** |
| two admitted and housed | 59 | 510 ms |

That is issue #718's measured symptom reproduced to the second — *"frozen …
for a full 30-second poll"* — from a one-term change to a boolean in
`src/main.ts`. The freeze is not hypothetical and it is not fixed. It is one
accident away, and the accident is an inviting one: `publishClockState` already
carries a "belt-and-braces" tick-equality check that its own docblock
(`state-machine.ts:415-427`) records as **dead**, and the obvious next
optimisation — having `hudClockFromWorkerMessage` return `undefined` when the
clock says nothing the HUD is not already showing, which is the same
change-gating the worker applies to the counts channel one layer down — would
silently drop nine readouts onto the counts channel and reintroduce the frozen
roster with `tsc` clean.

**Nothing in the repository would catch it.** `tests/foundation/composition-root-contract.test.ts:176-179`
pins the *presence* of the refresh calls inside that block, by matching source
text, under the label *"the coverage figures are refreshed on the counts
cadence, not only on arrival"* — it pins the call, not the cadence, and its own
label repeats the belief this ADR is correcting. `src/main.ts` is DOM code and
`vitest.config.ts` sets `environment: 'node'` with no jsdom, so the listener is
unreachable from `pnpm test` (`docs/AGENT_WORKFLOW.md` §2). The browser suite
would probably notice — `tests/browser/app-shell.spec.ts`'s *"a pending
delivery is on the panel with the fold shut, and costs it nothing while none
is … (#285, #703)"* polls a Build-panel readout in a prison with nobody housed
— but it would notice as a 20-second poll timing out, which
`docs/AGENT_WORKFLOW.md` already names as one of the three contention canaries
whose reds get read as load before they get read as defects.

### 5. Where the two readings of "measured" leave the issue

The 30 s figure in #718 is reproduced by two different states: the mutation
above, and **a paused clock** (table in §3, 2 refreshes in 30 s). A paused
prison publishes no `clock-state` at all, because `publishClockState` is silent
when the tick has not moved. This draft cannot tell which of the two the issue's
author had in front of them, because the measurement was a browser observation
and this pass is forbidden the browser.

It matters, and only one of the two is a defect:

- **If it was the paused case, it is not a defect.** While paused no tick runs,
  so nothing in any of the nine read models can change except as the direct
  effect of a command the player submits — and ADR 0051's paused drain makes
  each such command publish `simulation/status-counts` through the
  `dispatchedWhilePaused` gate (`state-machine.ts:576-582`). Measured: one
  `AdmitPrisoner` against a paused clock produced a second publication and a
  third refresh at exactly the moment it was submitted. A roster frozen while
  paused is a roster that is *correct*.
- **If it was the running case, it is not reproducible on `b04e45f8`** by the
  measurement in §3, and the mutation in §4 says what would have had to be
  different.

**The browser measurement this draft wants, named rather than guessed at**
(the brief reserves Playwright to another agent): open the Regime tab in a
prison with two admitted, unhoused prisoners, clock running at ×1, and record
`prisonerRoster` row content and `hud/prisoner-roster` request timestamps for
30 s. The prediction from §3 is ~118 requests, no gap above 260 ms, and visibly
moving need bars. A result that disagrees falsifies this ADR's §2 and most of
what follows.

### 6. The inventory — every pulled readout, what it depends on, and what publishes

This is the part the brief called the most valuable, and the part nobody had
done. `PROJECTION_IDS` has fifteen members; `PROJECTION_CATALOG`
(`src/simulation/worker/projection-catalog.ts:209-445`) binds each to the
runtime state that answers it. **Nine have a reader; six do not.** The
derivation is a grep for the quoted id under `src/` — `grep -rl "'hud/<id>'" src/ui/`
for each of the fourteen `hud/` ids, and `grep -rn "world/render-snapshot" src/`
for the fifteenth, which returns one comment in `src/simulation/codec/run-length.ts`
and no requester at all.

Every row below was opened. "Moves on a tick with no player command" is the
column that decides whether a readout can go stale at all.

| # | projection | reader (`src/ui/`) | tab | what its content depends on | moves on a bare tick? | which of the 20 counts moves with it |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `hud/status-strip` (Regime blocks) | `simulation-regime.ts:151` | regime | `regime[].blockProgress`, a **pure function of the tick** (`status-strip-projection.ts:710-723`) | **every tick** | **none** |
| 2 | `hud/prisoner-roster` | `simulation-prisoner-roster.ts:234` | regime | action phase, travelling, needs, risk tier, classification group, intake stage | **every tick** (needs decay; `ActionSystem` reconsiders every 20) | none, unless a tier crosses `prisonersHighRisk` or somebody is housed |
| 3 | `hud/prisoner-population` | `simulation-intake.ts:168` | overview | six intake stage counts + `waitingWithoutPlace` | yes — a stage advances on a scheduled intake tick | none while the arrival stays in the pipeline |
| 4 | `hud/build-queue` | `simulation-build-queue.ts:170` | build | order state and progress in `runtime.construction` | yes — the crew works per tick | none; a completed **wall** moves no count, a completed **bed** moves `roomCapacity`/`accommodationCapacity` |
| 5 | `hud/pending-deliveries` | `simulation-pending-deliveries.ts:149` | build | `ProcurementSystem.pendingDeliveries`, `refundableMinorUnits` | yes — a delivery lands on a tick | none; the money was debited at the press |
| 6 | `hud/held-guards` | `simulation-held-guards.ts:148` | security | `GuardReleaseService.claimOf` per guard | yes — a system ends its own claim | none; a released guard stays assigned, so `staffUnassigned` does not move |
| 7 | `hud/staff` (roster window) | `simulation-staff-roster.ts:143` | security | `assignment.deploymentPhase`, post tiles, patrol | yes — a guard walking to post changes phase | none |
| 8 | `hud/staff` (`limit: 0`, totals) | `simulation-staff-coverage.ts:124` | security | `required`/`assigned`/`shortage` summed over sectors | yes — `DeploymentSystem` runs every 10 ticks | `prisonersCovered`/`Understaffed`/`Unguarded` move **only** when the census changes |
| 9 | `hud/room-list` | `simulation-room-needs.ts:308` | rooms | room instances × `runtime.placedObjects` | yes — an object completes on a tick | none for a toilet, a shower or a bench |
| 10 | `hud/room-detail` | `simulation-room-needs.ts:332` | rooms | same, per room | yes | same |
| — | `hud/prisoner-detail`, `hud/security`, `hud/contraband`, `hud/incidents`, `hud/incident-detail`, `world/render-snapshot` | none | — | — | — | no `simulation/request-projection` reader; `tests/foundation/projection-reachability-contract.test.ts` carries each one's reason. `world/render-snapshot` is the one worth a second look: the world *is* on screen, but `SimulationSnapshotFeed` reaches it through `simulation/request-snapshot` (`:383`) rather than through this channel, which is why it has a cadence of its own — see §7 |

**The answer to "there may be others" is: there is no instance. There is only
the class.** All nine read models with a reader are refreshed by one predicate
in one listener, through the same nine-call block. Every one of the nine
has content that moves on a bare tick, and for every one of the nine there is a
change that moves it while all twenty counts stand still. The roster is not the
worst of them either — row 1 is, because `blockProgress` is a *continuous*
quantity and `docs/HUD_PROJECTIONS.md` §7 already says in terms what a coarse
cadence does to one of those: *"a day counter that only moved every two seconds
would be worse than none."*

Two further observations from building the table:

- **`blockProgress` is a pure function of the tick, and the main thread already
  has the tick.** That is precisely the argument
  `docs/HUD_PROJECTIONS.md` §9 gives for `projectClockPosition` being *"the one
  recorded exception"* to the pull route — *"it is a pure function of a tick and
  the main thread already has the tick, so it is computed there rather than
  requested."* The identical argument applies to row 1 and has not been applied.
- **Two readers ask the same projection on every refresh** (rows 7 and 8, with
  different windows), which is a deliberate decision recorded at
  `src/main.ts:1265-1277`. It doubles whatever cadence is chosen, on the tab
  that has three readers.

### 7. The precedent already in the tree, which is why this is not a green field

`SimulationSnapshotFeed` is a pulled readout that made exactly this decision
and paid for the wrong answer first. Its header
(`src/rendering/feed/simulation-snapshot-feed.ts:80-107`) records both halves:

> It arrived with `ea117cd` (2026-08-26) beside a `simulation/clock-state` case
> that had marked the world dirty on the running *state* since `d7b4a56`
> (2026-08-23), and the worker publishes one of those up to four times a second
> while the clock runs — so this interval was never the binding constraint and
> a thirty-second session cost 121 requests rather than 2 […]

The shape it settled on is three parts, and it is the only worked answer this
repository has to #718's question:

1. **Event-driven invalidation.** A `dirty` flag set by the things that can
   actually change what the readout shows — a command accepted, a
   pause→run transition — read at `:279` and `:304`.
2. **A long consistency poll** as a backstop for a change nobody thought of:
   `DEFAULT_POLL_INTERVAL_SECONDS = 30` (`:107`).
3. **A pinned count.** `tests/unit/rendering-feed.test.ts` pins the number of
   requests over thirty running seconds *against the worker's own publication
   cadence* — which is the trace the commit that got it wrong did not put on
   the wire.

Note what part 1 buys and does not buy. It works for the render feed because
its subject **cannot change without a command**: geometry is built by orders.
`SimulationSnapshotFeed`'s own subject is the only one in this document of which
that is true, and it is not even on this channel. **All ten rows of the
inventory move on a bare tick**, so an invalidation flag for them would have to
be set *inside* the systems that move them — which is the cost priced as option
C below.

### 8. Where the documentation says something else

`docs/HUD_PROJECTIONS.md` §9 states the counts cadence for each reader as it
was added, six times (`:572`, `:578`, `:590`, `:635`, `:663`, `:702`), and
`src/main.ts` repeats it in nine comments (`:1152`, `:1157`, `:1200`, `:1217`,
`:1878`, `:1889`, `:1912`, `:1919`, `:1925`), five of which quote a specific
wrong number: *"waiting up to 500ms for the next counts publication"*. The true
bound is 250 ms and the true source is the clock.

`docs/AGENT_WORKFLOW.md` §3 settles what to do about that — *"where a document
and the code disagree, the code is right and the document rotted"* — and it is
corrected in the same branch as this draft, separately from it, because it is a
statement of fact rather than a decision. **When it became false:** it was
false the day each sentence was written. `hudClockFromWorkerMessage` has been
in that listener since `f8393f00` (#459), which is the commit that introduced
`refreshPrisonerRoster` itself; `git show f8393f00:src/main.ts` has the clock
translator at `:1474` and the refresh call at `:1544`, inside the same
listener. No commit ever moved the clock into the predicate — it was always
there and nobody counted it.

## Decision

**The question, restated with the correction in it.** #718 asked what cadence a
pulled readout should have when its inputs are not what makes the counts move.
The tree's actual answer today is *"whatever the clock heartbeat happens to be,
by accident, undocumented and unguarded."* The decision is whether to make that
the answer on purpose, or to replace it.

### Option A — publish the counts every tick (drop the change gate)

**What it costs.** Everything issue #104 built the two gates to prevent. The
interval gate is checked *before* projecting precisely so the projection runs
twice a second rather than on all ~66 tick-loop wakes
(`state-machine.ts:510-516`), and `projectStatusStrip` is `O(P log P)` in
housed prisoners through `residentIdsWithExistingPlace`
(`status-strip-projection.ts:683-684`), measured at 0.28–1.2 ms whole at 250 to 5,000
actors (`:94-95`). At 66 wakes a second that is up to 79 ms of worker time per
second spent on a readout, and #104 names the failure mode by name: *"a
per-tick firehose that serialises every projection every tick and eats the
frame budget."*

**And it does not solve the problem**, which is the decisive objection rather
than the cost. The nine readouts are *pulls*; publishing counts more often only
changes how often the main thread is prompted to ask. It buys a 15 ms cadence
where a 250 ms one already exists, for nine round trips per wake.

**Refused.**

### Option B — give pulled readouts a timer of their own

**What it costs.** #718's own objection stands: *"introduces a cadence nothing
else in the HUD has."* A `setInterval` on the main thread is also the one thing
`src/ui/simulation-clock.ts:12-14` argues against for the clock — *"A HUD clock
that ticked on this thread would keep counting through a throttled tab, through
a paused simulation it had not heard about yet, and through a worker that had
died"* — and a roster poll has the identical failure: a background tab whose
timers are throttled to once a minute would poll a dead worker and then blank
nine blocks on the request timeout.

**What it buys** that nothing else does: a cadence that survives the clock being
paused. Measured, that is worth nothing today — §5 establishes that a paused
prison's readouts are correct — and it would become worth something only if
something ever changed state while paused without a command.

**Refused**, and the reason is worth recording because it is not the obvious
one: not "a new cadence is ugly" but "the cadence it would add is a *worse*
heartbeat than the one already on the wire, because the one on the wire is
generated by the thing that makes the state move."

### Option C — publish when the *projection's* inputs change

**What it costs.** This is the change-gate idea generalised: instead of
comparing twenty integers, compare — or mark dirty — the actual inputs of each
read model. `IntakeSystem` marks the intake readout dirty when it advances a
stage; `ConstructionSystem` marks the build queue dirty when an order
progresses; `NeedsSystem` marks the roster dirty when a need level crosses a
displayed segment; and so on for all nine.

Priced honestly, that is a write into eight or nine simulation systems for the
benefit of a readout, which inverts `AGENTS.md` boundary 1 — the systems would
have to know what the HUD draws. It also has no floor: `NeedsComponent` moves
every tick for every prisoner, so "the roster's inputs changed" is true on
essentially every tick of a populated prison, and the gate collapses to option
A for exactly the readout #718 is about.

**Refused as a general rule.** It is the right shape for a readout whose
subject genuinely cannot change without a command — which, of everything this
document looked at, is `world/render-snapshot` alone, and
`SimulationSnapshotFeed` already does it.

### Option D — accept the freeze and say why

**Not available on the facts.** §3 measures no freeze in a running prison, so
there is nothing to accept there; and §5 establishes that the paused freeze is
already correct rather than accepted. What *would* have to be accepted is the
state §4 produces, and that is not a state the tree is in.

### Option E — name the heartbeat that already exists, document it, and pin it (**recommended**)

**The decision in one sentence:** a pulled HUD readout is refreshed on the
**worker's clock heartbeat** — `simulation/clock-state`, ≤250 ms while the tick
is moving — plus its own `select-tab` arrival, plus any `simulation/status-counts`
that a player-initiated event forces out; and that is a deliberate contract
rather than a side effect of which translator returns `undefined`.

**Why the clock is the right heartbeat, argued rather than asserted.** #718's
question presupposes that a readout's cadence should be tied to its inputs.
The inventory says why that presupposition fails here: nine of the ten readouts
change *because a tick ran*, and nothing else. They do not share a set of
inputs; they share a **cause**. `simulation/clock-state` is the only signal on
the boundary that is a function of exactly that cause — it is published when
and only when the tick moved (`state-machine.ts:441-445`), it is silent when
the simulation is not advancing, it dies with the worker, and it is already
bounded at a rate the frame budget was designed around. It is not a timer bolted
onto the HUD; it is the simulation saying "I moved."

The counts channel is the wrong signal for the same reason, stated positively:
it reports *levels*, and it is change-gated on those levels precisely so a
steady prison costs the boundary nothing. That gate is correct and should stay.
It was never the pull layer's heartbeat; it only looked like one because it is
the channel each reader was added beside.

**What shipping this option involves**, in ascending order of commitment:

1. **The documentation correction** (§8). Not gated by this ADR — it is a false
   statement about present behaviour — and it is done in this branch.
2. **A regression gate that fails when the clock stops driving the pull layer.**
   This is the load-bearing half, and §4 is its red run: a pure predicate over
   worker messages, measured against the worker's own publication cadence over
   thirty running seconds, exactly as `tests/unit/rendering-feed.test.ts` pins
   the render feed's 2-vs-121 count. It needs the listener's decision extracted
   from `src/main.ts` into a pure function to be reachable from `pnpm test` at
   all (`environment: 'node'`, no jsdom) — the same move
   `docs/AGENT_WORKFLOW.md` §2 records for `orderPrisonsForDisplay`: *"the
   answer is to extract the decision into a pure function, not to report a
   survivor."* **Gated by this ADR**, because extracting it fixes the shape of
   the contract.
3. **Optionally, take row 1 off the pull route.** `blockProgress` is a pure
   function of the tick and the main thread has the tick; computing it beside
   `projectClockPosition` would remove the Regime panel's only continuous
   quantity from a request/reply round trip and make it exact rather than
   sampled. This is a real improvement and a real scope increase — it needs the
   regime schedules on the main thread, which is content, not state — and it
   should be its own issue rather than a rider on this one.

**What it costs.** Nothing at runtime: it is the behaviour that ships today.
The cost is one extraction and one test, and the ongoing constraint that
`hudClockFromWorkerMessage` may not be made conditional without a deliberate
replacement for the heartbeat.

**What it does not buy.** A paused prison still refreshes only on the player's
own commands. That is argued as correct in §5 rather than tolerated, and if the
simulation ever gains something that changes state while the clock is paused,
this decision is the thing that must be revisited — which is why it is written
as "the tick moved" rather than "every 250 ms".

## Consequences

1. **`docs/HUD_PROJECTIONS.md` §9 gains a stated cadence contract** for the
   pull route, in place of six per-reader sentences each naming the wrong
   channel. The six sentences are corrected in both directions rather than
   overwritten (`docs/AGENT_WORKFLOW.md` §4), because what they were reaching
   for — "this readout is not refreshed only on arrival" — was true.
2. **The nine `src/main.ts` comments** stop quoting 500 ms.
3. **`tests/foundation/hud-refresh-cadence-contract.test.ts` now owns the
   sentence "the pull layer is driven by the clock heartbeat,"** and it is
   shipped in this branch rather than gated by this ADR, because it records the
   cadence that exists rather than deciding the one that should. Four mutations
   were run against it and each produced a red in the test that names it: a
   "nothing changed" arm on `hudClockFromWorkerMessage`; the clock heartbeat
   slowed from 250 ms to 30 s in `publishClockState`; the clock term deleted
   from `src/main.ts`'s early return; and — as the contrast the file asserts
   outright — the same trace scored by the predicate #718 describes, which
   yields **one refresh in thirty seconds**. If the owner approves a different
   heartbeat, that file changes in the same commit; that is the whole of what
   it costs.
4. **`tests/foundation/composition-root-contract.test.ts`'s label is corrected
   in this branch**, not its assertion — it pinned the right lines under the
   wrong stated reason (*"refreshed on the counts cadence"*). The correction is
   marked in the entry's own `reason` rather than overwritten.
5. **`hudClockFromWorkerMessage` becomes load-bearing on purpose.** Any future
   change that makes it conditional — the obvious "return `undefined` when the
   clock says nothing new" — must replace the heartbeat in the same commit.
6. **Row 1 of the inventory stays on the pull route** unless the follow-up in
   E.3 is taken.
7. **`docs/HUD_PROJECTIONS.md` §9's tally is corrected in the same branch.** It
   read *"**Eight** of the fifteen catalogued read models still have a route and
   nobody on the end of it: **seven are read, by six modules**"*; by its own
   stated derivation — a grep for the quoted id under `src/ui/` — it is now six
   unread and nine read, by nine modules. `hud/status-strip` and
   `hud/prisoner-roster` gained readers with #451/#459 and the pair was never
   restated. `tests/foundation/projection-reachability-contract.test.ts` carries
   the same sentence and is another agent's surface; handed over.

## What stays the owner's

- **Approval of this ADR.** It is architecture and it is not self-approved.
- **E.3, taking `blockProgress` off the pull route**, if it is wanted: it moves
  regime *content* onto the main thread, which is a boundary question of its
  own and deserves its own issue rather than being folded in here.
- **Whether the paused-prison behaviour in §5 is acceptable as a product
  answer.** This draft argues it is *correct* — nothing moves, so nothing is
  stale — but "correct" and "what a player expects when they stare at a panel
  and it never changes" are different questions, and the second one is a
  playability judgement, which `AGENTS.md`'s standing mandate says counts as
  correctness here.

## The weakest claim, and what would change my mind

**The weakest claim is that the browser behaves like the harness.** §3 and §4
were measured on the real `SimulationWorkerStateMachine` with a real tick loop,
but with fake timers, a mocked `performance.now()` and no page: no rendering
thread competing for the main thread, no `requestAnimationFrame`, no tab
throttling, and no real `postMessage` latency. If the browser's main thread is
saturated enough that 250 ms of clock messages queue behind a frame, the
observed refresh interval will be worse than 255 ms — and if it is *much*
worse, the practical answer might look like a freeze even though the mechanism
is sound. The browser measurement named at the end of §5 is what would settle
it, and a result showing gaps well above 260 ms would push this ADR toward
option B's one genuine merit: a cadence that does not depend on the main
thread's own liveness.

**The second weakest claim is the reading of #718's "measured".** §5 gives two
states that both produce 30 s and says which one it cannot distinguish without
the browser. If the author's measurement was a running prison, something in it
is not modelled here and §2 is wrong.

## Amendment, 2026-09-02: the browser measurement §5 named landed, and this ADR's own bound is what it falsified

> **Proposed amendment, not self-approved — awaiting the owner's signature.**
> Drafted against `76e067c3` (v0.0.347) from a measurement already on `main`
> (PR #762, `73996787d4`) and issue
> [#765](https://github.com/matmaxalez/lockstate/issues/765), which named this
> ADR as owed the correction. Nothing below changes a decision — Options A
> through E and the recommendation are untouched, and `Status` remains
> **Proposed, 2026-09-01, not self-approved** — it corrects a *number* this
> document stated as a bound, and it must not be read as accepting this ADR by
> the back door. It must not merge as accepted before the owner signs it.

### 1. The measurement the weakest-claim section asked for

§5's own words: *"open the Regime tab in a prison with two admitted, unhoused
prisoners, clock running at ×1, and record … request timestamps for 30 s. The
prediction from §3 is ~118 requests, no gap above 260 ms, and visibly moving
need bars. A result that disagrees falsifies this ADR's §2 and most of what
follows."* PR #762 ran exactly that scenario in a real browser
(`tests/browser/playtest-2026-09-01-measurements-owed.playtest.ts`,
`docs/research/2026-09-01-the-measurements-that-were-owed.md` §5), through
`playtest-harness.ts`'s `buildAndPopulate({ beds: 0, admits: 2, guards: 0 })`,
four runs of 30 s each:

| run | requests / 30 s | shortest gap | median gap | longest gap | gaps > 260 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | **118** | 208.1 ms | 259.9 ms | **292.8 ms** | 58 |
| 2 | **118** | 220.5 ms | 259.0 ms | **290.1 ms** | 54 |
| 3 | **118** | 201.3 ms | 253.5 ms | **299.6 ms** | 46 |
| 4 | **119** | 89.5 ms | 257.6 ms | **293.1 ms** | 49 |

`hud/status-strip` was pulled the same number of times, in the same window, in
every run — the whole pull layer riding one heartbeat, not the roster reader
alone. Need bars moved visibly in every run (`data-need-permille`: 898→804→706
and 875→776→678 over the 30 s, ≈6.4 permille/s).

### 2. The verdict, split exactly as §5 asked it to be

**§2's mechanism — the binding cadence is the clock heartbeat, not the counts
channel — is CONFIRMED, not falsified.** 118 requests in 30 s, three runs out
of four (119 the fourth), in a prison whose `simulation/status-counts` channel
publishes once and falls silent, reproduces the harness's "120 times" table in
§3 to within one message, in a real browser with a real render thread. Nothing
about *which channel* refreshes the readout is in question.

**§5's own numeric bound — "no gap above 260 ms" — is FALSIFIED, and this is
the correction this amendment exists to make.** 46 to 58 of the roughly 118
gaps in every run exceed 260 ms; the median sits at 253–260 ms already, and the
tail reaches 292.8–299.6 ms across the four runs. The harness's 255 ms
(`§3`, `§4`, and "The weakest claim" above) is a fake-timer figure with no
render thread competing for the main thread; a browser adds roughly 5 ms of
median drift and a roughly 40 ms tail on top of it. **255 ms understates what a
player actually waits by about 18%** (299.6 / 255 ≈ 1.175).

**This is not the "well above 260 ms" result "The weakest claim" section named
as the trigger for option B.** 300 ms against a 260 ms bound is roughly 15%
over, not multiples over, and no run showed anything a player would read as a
freeze — every run kept moving need bars and landed within about 40 ms of the
predicted worst case, not seconds off it. So this amendment does **not** by
itself recommend re-opening the Decision toward option B; it corrects the
number the Decision was reasoned against, and leaves the choice of what (if
anything) to do about the gap between "no gap above 260 ms" and "no gap above
roughly 300 ms" to the owner, per "What stays the owner's" above.

### 3. What this does and does not touch elsewhere

`src/main.ts:1185` and the six comments at `:1923`, `:1936`, `:1954`, `:1959`,
`:1966` and `:1972`, plus `docs/HUD_PROJECTIONS.md:554`, stated 255 ms as if it
were the figure a player meets. They are corrected in the same commit as this
amendment to say **both** numbers and which measurement each is: 255 ms is the
harness's, measured with fake timers and no render thread; the browser's own
worst case is roughly 300 ms (292.8–299.6 ms across four runs). No player-
facing sentence, locale key or control changes — this ADR's own "Nothing in
this document is player-visible" holds exactly as before.

### 4. What is left for the owner

Two questions, neither answered here because both are judgement rather than
measurement:

- **Whether "no gap above ~300 ms at ×1 on a four-core container" is an
  acceptable restatement of §5's bound**, or whether a bound that is routinely
  missed by 40–50% of its own gaps was never the right shape for a bound and
  should be replaced with a percentile statement instead.
- **Whether this changes anything about the Decision.** Option E (name the
  heartbeat, document it, pin it) was recommended on a mechanism claim this
  measurement confirms, not on the 260 ms figure it falsifies — so the
  recommendation's own argument is unweakened — but the recommendation itself
  remains unapproved regardless, exactly as it was before this measurement.
