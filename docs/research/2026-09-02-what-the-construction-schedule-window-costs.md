# What closing the construction schedule window would cost

**2026-09-02.** Measured on `measure/the-construction-schedule-window`, cut
from `origin/main` at `8a417573`.

## The question

[#717](https://github.com/matmaxalez/lockstate/issues/717)'s live half is that a
build order cancelled after its bricks have landed and before `tryAllocate` has
run gives back **nothing**: there is no delivery left to turn around, and the
order has not reached `assigned`, which is the state ruling 20's refund arm
pays. [ADR 0076](../adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
amendment names it as case 3 and reserves the remedy it would close with — *"Not
decided either: whether surplus stock can be sold back."*

A second remedy was proposed that appears to need no decision at all: set
`ConstructionSystem.schedule.intervalTicks` to 1 and the window closes, because
the order would reach `assigned` in the same tick the delivery lands and the
existing refund arm would pay there. No new economic surface, no price, no
save-format change. **This record is the measurement of that proposal, and it
recommends against it.**

Everything below is VERIFIED — driven on the real `Kernel` and the real session
command router, never on a service method by hand, and re-runnable as
`node --experimental-transform-types scripts/report-construction-schedule-cost.mjs`.

## 1. The premise is false: interval 1 narrows the window to one tick and does not close it

`ProcurementSystem.order` is 110 (`src/simulation/economy/procurement.ts:149`)
and `ConstructionSystem.order` is 100
(`src/simulation/construction/system.ts:207`). `Kernel.registerSystem` sorts
ascending and `Kernel.step` iterates in that order
(`src/simulation/kernel/kernel.ts:201-205`), so **construction runs before
procurement inside every tick, at every interval** — a deposit made at order 110
on tick T is never visible to the allocation attempt at tick T.

Procurement's own class comment already says exactly this, and names the only
edit that would change it: *"Making the same-tick property real would mean
moving below 100, which is a deliberate reviewed edit rather than a free one."*

Measured, one `wall-brick` order placed at tick 1, its delivery arriving at tick
101, a fresh session per cancellation:

| `intervalTicks` | bricks land | order leaves `materials-pending` | ticks in the window | cancels returning 0 |
| --- | --- | --- | --- | --- |
| 10 (shipped) | 101 | 110 | 9 | ticks 102–110 |
| 1 | 101 | 102 | 1 | tick 102 |

So the window narrows from ten kernel ticks to one. At ×1 that is 500 ms down to
50 ms, which is a real reduction in how reachable the state is by a human press —
and it is not the closure the proposal was made on.

**What does close it, measured as the decisive mutation.** With
`ProcurementSystem.order` mutated 110 → 90 *and* `intervalTicks: 1`, the bricks
are never observable in the container between two ticks at all — deposited and
allocated inside tick 101 — and a cancellation returns the full 80 at every tick
until the crew starts. Restored by hand and verified with `sha256sum -c`. Note
that the mutation needs **both** halves: at order 90 with `intervalTicks: 10` the
window is 9 ticks again, unchanged, because construction still only runs every
tenth tick. And `order` is not a free edit — ADR 0020 makes declared order part
of the determinism contract, ADR 0009 makes it a replay guarantee over stored
saves, and `tests/determinism/kernel-system-order.test.ts:415-416` pins
`construction` at 100 and `procurement` at 110 in a full ordered list.

**The drag the issue is about does not improve at all.** One drag of 328
`wall-brick` segments spends 26,240 in a single tick, taking the balance to
−1,240; at tick 101 all 328 sit `materials-pending` with 656 bricks on the shelf
and a one-plank `PurchaseMaterials` is refused. Cancelling all 328 at that tick
leaves the balance at −1,240, the shelf at 656 bricks and the plank still
refused — **identically at `intervalTicks: 10` and at `intervalTicks: 1`**,
because the cancellations are dispatched at the head of the tick, before
construction runs at either interval.

## 2. The cost that is not CPU: every building gets ten times faster

`update`'s `in-progress` arm is `order.progress += 10` **per scheduled tick**
(`src/simulation/construction/system.ts:1224`). The interval is therefore the
build clock, not only a polling rate. At `intervalTicks: 1` a `wall-brick`'s
`workRequired: 50` is spent in five kernel ticks instead of fifty.

Measured on the same one-wall probe: at interval 10 the order is still `assigned`
at tick 112; at interval 1 it is `in-progress` at 103 and `completed` by 109.
Measured through the save boundary in
`tests/determinism/job-performing-restart-bound.test.ts`, whose scenario pins
milestones as literals: `wallMaterialsAllocated` 20 → 16 and `wallCompleted`
**80 → 27**.

That is a player-visible pacing change, and it is a reversal of a decision the
code states in place. `update`'s docblock records why the mock crew became a
crew of one — ADR 0028 measured *"a hundred objects take the same wall-clock
time as one"* — and closes *"the per-order tick cost is unchanged, so a single
order still finishes exactly when it used to."* `intervalTicks: 1` is precisely
the edit that makes that sentence false. Under `AGENTS.md`'s fourth exclusion, a
change to how fast the prison builds is not a free increment.

It also moves money the wrong way for #717's own subject. Ruling 20 pays nothing
for `in-progress` and nothing for `completed`, so at interval 1 an order becomes
permanently unrefundable ten times sooner. Measured on the 328-segment drag,
cancelling everything at tick 200: 26,080 comes back at interval 10 (one wall
finished) against 24,880 at interval 1 (sixteen finished). **The remedy shrinks
one loss window by 9 ticks and accelerates a larger one by 10×.**

## 3. The CPU cost, in counted work, and what the wall clock adds

`docs/BENCHMARKING.md` settles the unit — *"counted work only, never a
duration"* — and records two real regressions of `src/` that both measured
*faster* than the code they regressed on this runner. So the figures a
conclusion may rest on are counters.

`update` does not do constant work per call. It builds and sorts the whole order
book twice (`orderedOrders()` at the top, and again inside
`procureQueuedMaterials` → `pendingOrderDemand`), scans it once for a busy crew,
and walks it once. Over 400 ticks, 328 queued segments, counted on two
production collaborators every one of those passes goes through:

| `intervalTicks` | `update` calls | order-book sorts | sorted elements | `BUILDABLE_REGISTRY.get` | `tryAllocate` |
| --- | --- | --- | --- | --- | --- |
| 10 | 40 | 80 | 26,240 | 71,292 | 3,608 |
| 1 | 400 | 800 | 262,400 | 211,737 | 33,128 |
| ratio | 10.00× | 10.00× | 10.00× | 2.97× | 9.18× |

An idle session — the shape
[#261](https://github.com/matmaxalez/lockstate/issues/261) is about — pays 40 →
400 calls with an empty order book and therefore zero per-order work.

`BUILDABLE_REGISTRY.get` is 2.97× rather than 10× because at interval 1 the
queue *finishes*, and a terminal order is skipped before the lookup. **The two
configurations stop running the same workload**, which is §2 restated as a
counter rather than an artefact of the instrument.

**The wall clock, and the isolation statement.** This box was measured at load
average 18.65–19.10 during the run below and 9.59–11.90 during a repeat, so no
conclusion rests on a duration. Each `Kernel.step()` is timed on its own across
15 repeats and the **element-wise minimum per tick index** is taken:
`docs/BENCHMARKING.md`'s own reading of a duration here, because preemption is
one-sided and the minimum's error therefore runs one way.

| `intervalTicks` | 400 ticks, total | drag tick | steady µs/tick (min/med/max) |
| --- | --- | --- | --- |
| 10 | 34.317 ms | 21.063 ms | 1 / 2 / 2,634 |
| 1 | 163.902 ms | 20.570 ms | 25 / 42 / 2,697 |

The same figures at half the load: 37.759 ms against 163.136 ms. **The minimum
statistic moved by 10% on interval 10 and 0.5% on interval 1 across a 2× load
swing**, which is what makes it usable and is the only reason the wall clock is
quoted at all.

**In absolute terms this is affordable and it is not the reason to decline.** A
tick is 50 ms at ×1; 410 µs is 0.8% of one, at a queue depth of 328 orders on a
32×32 world whose treasury funds 312 wall segments. The CPU is not what costs
here.

## 4. Determinism, and the blast radius across the suite

`./node_modules/.bin/vitest run tests/determinism` on the unmodified tree:
**27 files, 181 passed, 1 skipped, 0 failed.**

At `intervalTicks: 1`, the same two files run alone: **4 failures, all
assertions, none a timeout** — and 0 failures on the same two files run alone at
interval 10.

- `tests/determinism/job-performing-restart-bound.test.ts` ×3 — `expected 16 to
  be 20`, `expected 21 to be 30`, `expected 27 to be 90`. Its
  `CONSTRUCTION_INTERVAL_TICKS = 10` at line 37 is a literal, and one of the
  three failing cases is named *"is re-quantised to one full ConstructionSystem
  interval by a build order waiting on the delivery"* — a determinism test whose
  subject **is** the ten.
- `tests/determinism/snapshot-restore-fidelity.test.ts` ×1 — a restored
  session's re-dispatched command reads `materials-pending` where the case pins
  `approved`, because one construction tick has already run.

`tests/determinism/kernel-system-order.test.ts` needs nothing, as expected: it
pins `order`, not `schedule`. Confirmed green at interval 1.

**Whole `vitest` suite at `intervalTicks: 1`, twice:** 45 failures in 21 files,
then 38 in 17. Of the second run's 38, **6 are `Test timed out in 5000ms`** and
**32 in 13 files are assertions**:

| file | assertion failures |
| --- | --- |
| `tests/unit/construction-crew-capacity.test.ts` | 7 |
| `tests/integration/construction-just-in-time-materials.test.ts` | 5 |
| `tests/integration/economy-refund-survives-the-clock.test.ts` | 5 |
| `tests/unit/construction-build-queue-projection.test.ts` | 4 |
| `tests/determinism/job-performing-restart-bound.test.ts` | 3 |
| `tests/unit/construction.test.ts`, `tests/unit/undo-redo.test.ts`, `tests/integration/object-removal-loop.test.ts`, `tests/integration/object-placement-loop.test.ts`, `tests/integration/door-construction-loop.test.ts`, `tests/integration/command-success-notices.test.ts`, `tests/integration/session-save-round-trip.test.ts`, `tests/determinism/snapshot-restore-fidelity.test.ts` | 1 each |

The 6 timeouts are reported as unresolved rather than labelled. Two are the pair
`docs/AGENT_WORKFLOW.md` already names
(`tests/foundation/comment-symbol-existence-contract.test.ts`,
`tests/unit/prisoners-sentence.test.ts`). A third,
`tests/determinism/contended-scan-order.test.ts` *"is stable when the whole
population ties on urgency"*, **fails the same way on the unmodified tree run
alone on this box** — measured, so it is not the change. The remaining three
(`tests/integration/contended-shower-fairness.test.ts` ×2 and
`tests/integration/incident-trigger-reachability.test.ts` ×1) were not isolated
and no claim rests on them.

**The browser suite was not run**, and a green `vitest` says nothing about it.
The specs that would have to be named and run for this change are
`tests/browser/ui-build-queue.spec.ts`,
`tests/browser/build-deliveries-outside-the-fold.spec.ts`,
`tests/browser/ui-pending-deliveries.spec.ts` and `tests/browser/app-shell.spec.ts` —
the last of which polls a pending delivery against a 20-second budget
(`docs/AGENT_WORKFLOW.md`'s second contention canary, #285/#703).

## 5. Every sentence whose argument depends on the ten

Swept because three sentences went stale on exactly this kind of number in one
day. None was corrected, because this record recommends against the change; the
list is what a future pass would owe.

**`src/`, load-bearing:**

- `src/simulation/construction/system.ts:209` — `// Run every 10 ticks (2 times per second)`.
- `src/simulation/construction/system.ts:491` — the `duplicateClaim`
  cost trade-off: *"`update()` already walks and sorts the full order list on
  every scheduled construction tick (`schedule.intervalTicks: 10`, twice a
  second, forever), which is a materially higher-frequency cost than one more
  unsorted pass per `PlaceBuildOrder` command."*
- `src/simulation/economy/procurement.ts:132` — *"Construction is also on
  `intervalTicks: 10` … so a deposit made at order 110 on tick T is visible to
  the allocation attempt at T+10 — measured: a delivery arriving on tick 100
  leaves `materials-pending` on tick 110."*
- `src/simulation/construction/materials-procurement.ts:221` — *"A purchase takes
  `PROCUREMENT_DELIVERY_DELAY_TICKS` to arrive, which is ten construction
  ticks."*
- `src/simulation/construction/materials-procurement.ts:281` — *"rather than up to
  ten ticks later."*
- `src/simulation/economy/just-in-time-materials.ts:98` — *"on each of the ten
  construction ticks that fit inside `PROCUREMENT_DELIVERY_DELAY_TICKS`"*; and
  `:338`, `:344`, `:494` — three more *"within ten ticks"* / *"each of the ten
  ticks"* arguments about the same cadence.
- `src/simulation/runtime/session-commands.ts:614` — *"up to ten ticks after the
  press instead of on it."*

**`tests/`, literals and prose:**
`tests/determinism/job-performing-restart-bound.test.ts:37`
(`CONSTRUCTION_INTERVAL_TICKS = 10`),
`tests/integration/construction-placement-order.test.ts:52`,
`tests/unit/construction-build-queue-projection.test.ts:122`,
`tests/unit/construction-unknown-buildable.test.ts:57`,
`tests/unit/construction-crew-capacity.test.ts:28`, and
`tests/unit/construction.test.ts`'s step-by-step `// Tick 10:` narration.

**`docs/`:** `docs/DETERMINISM.md:105` (*"one full `ConstructionSystem` interval
(10 ticks)"*), `docs/PERSISTENCE.md:541` (the same claim),
`docs/HUD_PROJECTIONS.md:1525` (*"which resolves itself in ten scheduled
ticks"*).

**`docs/adr/`, reported and not touched:**
[ADR 0028](../adr/0028-object-placement-and-derived-room-capacity.md) at `:194`
and `:495`,
[ADR 0031](../adr/0031-build-queue-cancellation-surface.md) at `:122`,
[ADR 0047](../adr/0047-raising-a-building-on-open-ground.md) at `:229`,
[ADR 0077](../adr/0077-when-a-route-stops-being-valid.md) at `:127`,
[ADR 0082](../adr/0082-what-order-build-orders-are-carried-out-in.md) at `:426`,
and [ADR 0076](../adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
at `:926` (*"wait ten ticks and `Undo`"*).

**ADR 0076 needs no correction and that is worth saying.** Its case 3 states the
window in the right unit — *"The window is one scheduled construction tick wide,
because the next `update` allocates and moves the order to `assigned`"* — which
is true at either interval. What the interval changes is what one scheduled tick
is worth in wall time, not the sentence.

**Two `file:line` citations of this value are already stale on `main`, before
any change here.** `src/simulation/economy/procurement.ts:132` and
`docs/research/2026-08-25-economy-rate.md:93` both cite
`construction/system.ts:100` for the schedule; line 100 of that file is a
docblock about `BuildabilityResult.reason` and the schedule is at `:210`. ADR
0047 `:229` cites `(:183)` for the same value; line 183 is `DoorPlacementSink`.
The `100` in all three looks like `ConstructionSystem.order`'s value read as a
line number.

## 6. Alternatives or complements

**Alternatives, no — and complements only in one direction.** ADR 0076 case 3 is
*"the delivery landed, the order had not allocated, the player gets bricks rather
than money"*, and the ADR is right that it *"closes only if a prison can sell
material back to the catalogue"*. The scheduling change does not reach it: at
interval 1 the bricks are still on the shelf for one tick with no money back, and
on the 328-segment drag the outcome is byte-for-byte what it is today. So the
owner's sell-back question does **not** stop being urgent, and nothing here
should be read as narrowing it.

The direction that does hold is the reverse: sell-back closes case 3 at every
interval, so it makes the scheduling change unnecessary rather than the other way
round.

## 7. Recommendation

**Do not take the scheduling remedy.** Not because it is expensive in CPU — 410
µs against a 50 ms tick at a queue depth no funded prison can exceed is
affordable — but because:

1. It does not do the thing it was proposed for. The window narrows from 9 ticks
   to 1 and stays open, and the drag in #717's own report does not change at all.
2. It makes every building ten times faster, which reverses a stated pacing
   decision and is player-visible — `AGENTS.md`'s fourth exclusion territory,
   not a free increment.
3. It moves 32 assertions in 13 files, four of them in `tests/determinism`, and
   it invalidates roughly twenty sentences that reason about the ten.

**Nothing here is a reason to take a different remedy either.** Closing the
window needs `ProcurementSystem.order` below 100 *and* `intervalTicks: 1`
together, which is the determinism-contract edit procurement's own comment
declines to make plus every cost above. Case 3 stays where ADR 0076 put it: with
the owner, as a price question.

## Named weakest claim, and what would change my mind

**The 328-segment drag is a layout of my own construction**, one wall per tile
across rows of thirty on the single 32×32 starter chunk, not a reproduction of
the gesture the original playtest made. The counts it produces match the figures
in the brief exactly (26,240 spent, −1,240, 656 bricks, plank refused, all 328
`materials-pending`), which is why I trust it, but a real drag might place edges
the tool picks differently and reach a different order count. Nothing in the
recommendation depends on the number being 328: the same finding holds for one
wall.

**What would change my mind on the recommendation:** a ruling that the 10× build
speed is *wanted* — the pacing is a placeholder and `update`'s own docblock says
so. If the owner decides building should be ten times faster, the interval change
becomes a pacing decision with a known and modest CPU bill, and the 32 assertions
become fixture work rather than evidence against it. It would still not close
#717's window.

**What would not change my mind:** a faster machine, or a lower load average.
The reason to decline is in §1 and §2, and neither is a duration.
