# What a restore costs an errand

**Issue [#882](https://github.com/matmaxalez/lockstate/issues/882). Measured
2026-09-03 on `f7adf652` (v0.0.419), headless, through `captureSessionSnapshot`
/ `restoreSimulationRuntime` and the real kernel.** Every figure below was
obtained by running; every `file:line` was opened at that commit.

This record answers four questions and decides nothing. The decision it feeds
is stated at the end and is the repository owner's.

---

## 1. The defect reproduces headless, and the mechanism in #882 is right

**VERIFIED.** A prisoner housed through the real commands, one errand submitted
inside `GENERAL_POPULATION_REGIME`'s second work block, a snapshot taken on a
travelling tick, and the restored runtime stepped to completion.

| what | tick |
| --- | --- |
| errand offered | 1,640 |
| carry selected, pickup leg | 1,661 |
| pickup dwell | 1,721–1,740 |
| drop-off leg walked | 1,741–1,792 |
| **continuous completion** | **1,801** |
| snapshot taken, mid-walk on the drop-off leg | 1,781 |
| after load: `action.carry` / **`idle`** at (20,18), job still `assigned`, 10 bricks in hand | 1,781 |
| the work block ends; the prisoner selects `action.use-toilet` and **walks the goods back to the cell**, arriving (4,6) | 1,801 → 1,877 |
| toilet, meal, toilet, sleep — holding the delivery throughout | 1,877–2,961 |
| carry re-selected | 2,981 |
| **restored completion** | **3,081** |

**1,280 ticks against ADR 0093 decision 5's corrected bound of 40.**

The three facts #882 reads at the line all hold, with one citation corrected:

1. A restored traveller is dropped to `idle` — but that is
   `src/simulation/prisoners/prisoner-operations-runtime.ts:867`, not
   `action-system.ts:896`. The line #882 names is a different drop-to-idle (the
   *stranded request* exit of `continueTravelling`), and the difference matters
   because that exit is the one a fix can use; see §5.
2. `carryAvailableFor` (`src/simulation/prisoners/action-system.ts:1227`)
   already answers `true` for a prisoner holding an active job. Confirmed.
3. The gate at `src/simulation/prisoners/action-system.ts:1251` reads
   `isActionCategoryAllowed(CARRY_ACTION, block.allowedCategories)` **before**
   it and `&&` short-circuits. Confirmed.

**And one thing neither the issue nor the ADR says, which is why the promise
holds continuously.** No path that advances an action in flight consults the
regime block at all: `allowedCategories` is read at exactly two lines in
`action-system.ts` (`:1251` and `:1254`), both inside `planIdleSelection`.
`continueTravelling`, `arrive` and `continuePerforming` never ask. So *"a carry
outlasts its block"* is not a guarantee the carry code keeps — it is a
guarantee **nobody is asked for**, and it survives only as long as nothing
makes an in-flight carrier idle. A restore is the only thing that does today.

## 2. The worst case, by construction: 1,280 ticks, and the ceiling is ~1,340

**VERIFIED by construction, not by sampling.** The cost decomposes into terms
that can each be read off authored data, and the construction maximises each:

- **The regime gap dominates.** `GENERAL_POPULATION_REGIME`'s work blocks are
  500–1,000 and 1,300–1,800 (`src/simulation/prisoners/regime.ts:109` and
  `:112`). The largest interval between the end of one and the start of the
  next is **1,800 → 2,900** — 1,100 ticks — which is the same figure ADR 0093
  decision 2 already states for a delivery waiting in a bay. A save whose
  restored carrier's first reconsideration lands just past 1,800 loses all of
  it.
- **Plus an action that outlasts the work block's opening.** The prisoner is
  not idle at 2,900: `action.sleep` selected at 2,761 runs its
  `minDurationTicks: 200` to 2,961, so the carry is re-selected at 2,981. Sleep
  is selectable up to 2,781 (the sleep block runs to absolute 2,800), which
  puts the ceiling on this term at **+200 and one cycle**.
- **Plus the walk the wandering created.** The restored carrier walks to its
  cell and must walk back: 2,981 → 3,069 for (4,6) → (24,20). This term grows
  with the prison, so the total is **not bounded by a constant** — it is
  bounded by the route from the carrier's cell to the leg's destination.
- **Two reconsideration cycles**, which is the whole of the cost ADR 0093
  decision 5 predicted.

Measured maximum over a sweep of 34 offer ticks (1,600 to 1,798 in steps of
6) × two drop-off geometries × every travelling tick in [1,740, 1,900) —
about 2,600 restores: **1,280**, at capture 1,781. The cliff is exact and 20-tick quantised — capture at 1,780
costs 20 ticks, capture at 1,781 costs 1,280 — because the next reconsideration
falls on the other side of 1,800.

The structural ceiling for this one-chunk fixture is **1,100 + 220 + 120 ≈
1,340**; the 1,280 measured is 20 ticks of sleep alignment and a short walk
short of it. A bigger prison raises the last term without limit.

**#882's 380 is the same defect at the other boundary, and it is near that
boundary's own worst case.** The 1,000 → 1,300 gap is 300 ticks; a full sweep of
all 112 travelling ticks at that boundary measured a maximum of **360** (offer 940, capture 1,003–1,020,
continuous 1,121, restored 1,481). So #882's figure is right in kind and its
geometry differs by 20; what it is not is the worst case. **The worst case is
3.4× it**, and the reason is which of the two work blocks the errand was in.

## 3. A save taken outside a work block: the same cost, no new failure

**VERIFIED.** #882 did not reach this case. It is not worse and it is not
different:

| capture | leg | continuous | restored | delay |
| --- | --- | --- | --- | --- |
| 1,800 (day-tick 1,800, recreation) | pickup | 1,881 | 3,101 | 1,220 |
| 1,830 | drop-off | 1,881 | 3,061 | 1,180 |
| 1,872 (last travelling tick) | drop-off | 1,881 | 3,081 | 1,200 |

Slightly *less* than the in-block capture, for the arithmetic reason that a
capture already past 1,800 has less of the 1,100-tick gap left to lose. Stock
was conserved in all three (100 bricks in, 90 + 10 out).

## 4. A pre-0093 job state does not leak

**VERIFIED, and the answer is that two of the three unreachable states are
inert rather than dangerous.** `JobLifecycleState` still declares `'reserved'`,
`'travelling'` and `'performing'`
(`src/simulation/operations/job.ts:5`) and `carryItemJobSchema` still validates
all eight (`src/persistence/save-schema.ts:669`), so a pre-0093 save can carry
any of them. Injected into the snapshot bundle at a mid-pickup and a mid-drop-off
capture and restored:

| injected | state after load | outcome |
| --- | --- | --- |
| `'travelling'` | `'assigned'` | rewritten by `JobBoard.loadSnapshot` (`src/simulation/operations/job.ts:261`), resumes, completes |
| `'performing'` | `'performing'` | **survives unchanged**, resumes, completes |
| `'reserved'` | `'reserved'` | **survives unchanged**, resumes, completes |

All six runs completed with stock conserved and with completion ticks identical
to the un-injected restore (1,821 on the pickup leg, 3,081 on the drop-off).
**The reason is that nothing reads a non-terminal `state` for a carry in
progress**: `activeJobFor` filters on `isTerminalJobState`, `compensateHeldStock`
excludes only `'available'`, and the leg — not the state — says where the goods
are. So a `'performing'` job restored from a pre-0093 save is indistinguishable
from an `'assigned'` one on every path a carrier takes.

**What it does inherit is exactly the defect in §1**: it is 380 or 1,280 ticks
late like any other restored errand. It does not leak.

## 5. The goods cannot be lost, and here is what was tried

**VERIFIED. Four attempts, all conserving.** The invariant asserted each time is
`depot + site + in-hand = 100`, where *in-hand* is the job's quantity while the
job is active on its drop-off leg — the one place a quantity is held by nothing
but the job.

| attempt | outcome |
| --- | --- |
| **two restores in a row** (restore at 1,781, snapshot the restored runtime, restore again) | identical state, same 1,280-tick completion. Also tried restore → step 119 ticks → restore again: same completion tick, conserved. |
| **restore then cancel** (pickup leg and drop-off leg) | `CarryJobExecutor.cancel` → `compensateHeldStock` (`src/simulation/operations/carry-executor.ts:195`): the pickup case released a 10-brick reservation, the drop-off case put 10 bricks back in the depot. Depot returned to 100 both times; the carrier went idle on the next cycle. |
| **restore then the carrier released** | `failDepartedCarrier`: job `failed`, `failReason: 'carrier-departed'`, `assignedWorkerId` cleared, 10 bricks back in the depot on the drop-off leg and the reservation released on the pickup leg. |
| **restore whose save no longer names the destination container** | job `failed` with `'unknown-destination-container'` and the 10 bricks went back to the depot. |

**The fourth attempt had to be built by hand, and that is itself the finding.**
Un-zoning the storeroom cannot reach it: a storeroom is bound to
`CONSTRUCTION_MATERIALS_CONTAINER_ID`, which `new-session.ts` registers
unconditionally, and a bay's `container:<instanceId>` is registered on first use
and never removed — `ContainerRegistry` has **no unregister**
(`src/simulation/operations/inventory.ts:128`). So the `unknown-*-container`
failure paths are reachable only from a save whose `containers` array is missing
an id its `jobs` array names. The restore path even pre-registers every
container the save does name (`src/simulation/runtime/session-systems.ts:858`),
which is why dropping the row was the only way in.

**So this is a delay and a nonsense on screen, not a loss.** #882 said so from
one run; four adversarial paths agree.

## 6. Two things found beside the measurement

- **`ActionSystem.activeBlockCategories` has no caller.**
  `src/simulation/prisoners/action-system.ts:1192`; `grep -rn
  activeBlockCategories src/ tests/` returns that declaration and nothing else.
  Its own docblock says it was *"split out of `planIdleSelection` so that
  `arrive` can ask the same question without planning a selection, and so the
  two cannot answer it differently"* — and `arrive`
  (`src/simulation/prisoners/action-system.ts:1019`) does not ask. `tsconfig.json`
  sets no `noUnusedLocals`, so nothing catches it.
- **`Container.getSnapshot` is still not a fixed point of `loadSnapshot`** for a
  container emptied of an item — ADR 0093 recorded the fix as *"omitting rows
  that hold nothing"*, and `src/simulation/operations/inventory.ts:113` writes
  back only positive rows while `:105` emits every id either map has held. Not
  re-tested here; noted because §5's conservation checks had to compare
  quantities rather than snapshots.

## 7. What this leaves the owner, and what it does not

**The contradiction is inside ADR 0093, not between the ADR and the code.** Two
accepted sentences give opposite answers the moment anything asks an in-flight
carrier to re-select:

- decision 2, *Eligibility replaces `JobWorkerPool`*: *"A prisoner is offered a
  carry iff they are idle at a reconsideration, intake is `completed`, and their
  active block allows `work`."*
- Consequences: *"A carry outlasts its block. Like every action, it is not cut
  at a regime boundary."*

The code implements the first literally, which is why it breaks the second. The
issue's proposed reordering — consult `activeJobFor` before the category gate —
satisfies the second by **contradicting the first**: it would offer the carry in
a block that does not allow `work`. That is not a fix inside an accepted
decision; it is an amendment to one, and it is the owner's.

**A second candidate does not touch either sentence, and it is what decision 5
originally said.** Decision 5: *"A carrier is instead re-seated from the board
after it loads — `actionIndex` the carry, `travelling`, no request."* The
landing change did not build that; its own note says so, item 2 of *Three things
the landing change found that this document had wrong*, and claims the
re-selection route is *"the same one restore rule, reached without adding a
path"*. **That claim is false, and this record is the measurement that shows
it:** the two routes agree inside a work block and diverge by up to 1,280 ticks
across a block boundary, because one of them asks an eligibility question the
other never asks.

Re-seating asks nobody anything: the prisoner is never idle, so decision 2's
*iff* never applies, and the carrier walks on through the meal block exactly as
Consequences says a carry does — the *same* behaviour continuous play already
has, not a new one. `continueTravelling` already carries the exit it needs, at
`src/simulation/prisoners/action-system.ts:891`: a carrier travelling with no
outstanding path request re-requests the leg, and one whose job died under them
drops to idle at `:844`.

**Weakest claim in this record:** that 1,280 is within ~60 ticks of the true
worst case. The three terms are each read off authored data, but the sleep-alignment
term was not driven to its maximum by construction — the sweep never produced a
sleep starting at 2,781 — and the route term is unbounded in the prison's size,
so *"~1,340"* is a ceiling for this fixture's geometry and not for the game. What
would change my mind: a scenario in which the re-selected carry is refused
repeatedly at the top of a work block. `relievesAnUnmetNeed` can do that when a
furnished kitchen, laundry or classroom makes a need-serving `work`-block action
providable, and each refusal costs a 120-tick shift; hunger's decay of 0.05 a
tick against `action.kitchen-work`'s +1 bounds it to about one shift, so I
expect **+140 at most** — but I did not build that prison and did not measure it.
