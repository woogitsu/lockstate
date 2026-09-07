# What `Cancel` actually gives back, read off the worker — 2026-09-03

**Question.** [#853](https://github.com/matmaxalez/lockstate/issues/853) reports
a Build-panel queue row advertising `80 back` for an order in `assigned`
("Awaiting the Crew") whose `Cancel` moved the FUNDS chip by nothing across
eight seconds. `tests/integration/construction-queue-row-pays-what-it-shows.test.ts`
(landed with #843, `4652dbfc`) asserts the opposite in its *"the money case at
`assigned`: the catalogue value of the material it is holding"* case. **Both are
true. This record settles which mechanism makes them both true, from the
worker's own state rather than from the chip.**

Measured on `docs/what-cancel-actually-gives-back`, cut from `origin/main` at
v0.0.401 (`d0957d6b`) — which already carried that test — with
`tests/browser/playtest-2026-09-03-what-cancel-actually-gives-back.playtest.ts`.
`origin/main` (`402453a9`) was merged into the branch **after** every
measurement below and nothing was re-taken against it; its three files are a
workflow, the release bump and a documentation gate, none of which this
question touches.
Nothing in `src/` was changed, and no player-facing string was touched:
`AGENTS.md`'s fourth exclusion puts the row's wording with the owner.

---

## The answer in one paragraph

**The credit is real, the chip is honest, the integration test is right about
the state, and #853's press was right about what it saw.** What separates them
is neither the state nor the projection: it is **the tick the command executes
at**. The integration test's `dispatch` submits with
`executeAtTick: runtime.kernel.tick` and calls `step()` immediately — zero
lead, so the press runs at the tick the row was priced at. A browser press runs
at whatever `SimulationCommandSender.projectExecuteTick` chose, and
`projectFromClock` (`src/ui/simulation-commands.ts:188-192`) adds an elapsed
estimate **plus `DEFAULT_LEAD_TICKS`, which is 20** (`:77`), whenever the clock
is running. Measured in the browser: **36 to 55 ticks of lead.** An `assigned`
order becomes `in-progress` on the next scheduled construction pass, ten ticks
away (`ConstructionSystem.schedule.intervalTicks: 10`, `system.ts:210`), so the
state the row was priced at is three to five passes stale by the time the
command runs — and ruling 20 pays `0` for `in-progress`.

With the clock **paused**, `projectFromClock` returns the bare reported tick and
the lead is **0** — the browser's own equivalent of the test's fixture — and
every state then pays exactly what its row advertised.

---

## 1. What each state advertises, and what comes back in which currency

Every figure below is a **worker** read. The treasury, the construction
container's brick stock, every pending delivery and every order's state and
allocation come out of one `simulation/request-snapshot`
(`src/simulation/worker/state-machine.ts:1251`, which calls
`captureSessionSnapshot` and mutates nothing). The advertised figure comes out
of a `hud/build-queue` `simulation/request-projection`, whose
`cancelRefundMinorUnits` is exactly
`ConstructionSystem.previewCancelRefundMinorUnits(order.id)`
(`src/simulation/presentation/construction-projection.ts:359`) — the same read
the row is painted from. The DOM row's text and the FUNDS chip were read
alongside, so a disagreement would be a measurement rather than a hypothesis.

**Clock paused, so the command executes at the tick the row was read (lead 0,
recorded per press) and no system runs between the two snapshots.** A brick is
40 minor units and a `wall-brick` needs two, so 80 is one segment's catalogue
value.

| state at the press | row said | worker projection | money (worker treasury) | bricks in the container | bricks in flight | chip |
| --- | --- | --- | --- | --- | --- | --- |
| `planned` | — | — | — | — | — | — |
| `approved`, with its own just-in-time delivery on the road | `80 back` | 80 | **+80** | 0 | −2 | +80 |
| `approved`, against a delivery the player bought by hand | `0 back` | 0 | 0 | 0 | 0 | 0 |
| `materials-pending`, delivery on the road | `80 back` | 80 | **+80** | 0 | −2 | +80 |
| `assigned` | `80 back` | 80 | **+80** | **0** | 0 | +80 |
| `in-progress` | `0 back` | 0 | 0 | 0 | 0 | 0 |
| `completed` | no row, so no `Cancel` in the Build panel | — | — | — | — | — |

**The currency is money in every paying case, and materials never come back.**
The two currencies are different code paths and it matters which:

- `approved` and `materials-pending` pay through `refundSurplusOf` →
  `refundSurplusDeliveries` → `ProcurementSystem.cancel`, which credits the
  delivery's **recorded** `paidMinorUnits`. The bricks were never in the
  container; the whole delivery is cancelled. Measured: seven orders cancelled
  one at a time took the treasury 24,440 → 25,000, exactly 7 × 80, with
  in-flight bricks falling by 2 each time and the container at 0 throughout.
- `assigned` pays through `refundAllocatedMaterials` →
  `ProcurementSystem.refundMaterials`, which credits the **catalogue** price of
  the allocation and destroys it. Measured: 23,400 → 23,480, and **the
  container's brick count was 26 before and 26 after**. That is ruling 20's
  *"pieniądze zamiast cegieł"* observed rather than read.

Both figures were 80 here because the brick's catalogue price has never moved
and each order's own just-in-time delivery was exactly its own two bricks. They
are not the same number by construction, and `ProcurementSystem.refundMaterials`'
own docblock says why it prices from the catalogue where `cancel` does not.

### The two rows that are dashes, and why they are not gaps in the measurement

- **`planned` is not reachable through any command.** `submitOrder` writes
  `order.state = 'approved'` synchronously (`system.ts:398`). Across every run
  in this record, no order was ever observed in `planned`.
- **`completed` has no queue row.** `PENDING_BUILD_ORDER_STATES`
  (`construction-projection.ts:87`) is the five states the projection publishes,
  and `completed` is deliberately not one of them, so the Build panel draws no
  row and no `Cancel` button for a finished order. It is reached through `Undo`,
  which is a different press and out of scope here.

### The brief's count of the priced states needs correcting

The brief asked for *"each of the four cancellable states that
`previewCancelRefundMinorUnits` prices"*. Counted from the method:
`isCancellable` is `state !== 'cancelled' && state !== 'failed'`
(`system.ts:48`), so **six** states are cancellable, and the method reaches a
pricing call for **three** of them — `approved` and `materials-pending` through
`previewSurplusRefundMinorUnits`, `assigned` through
`previewAllocatedRefundMinorUnits` — and hard-returns `0` for the other three.
Four is the count of states that *choose a currency* in `cancelOrder`'s own
comment, which is a different question.

---

## 2. Why #853 saw `0` where the test sees `80`

**Clock at 1×, seven and then seven more presses, each reading one DOM row and
clicking with nothing in between, with the order the command actually named read
off the wire.**

| | presses | paid what the row said |
| --- | --- | --- |
| aimed at an order that was `assigned` when its row was read | 10 | **3** |
| — of those, the *first* paying row (the next order the crew will start) | 8 | 1 |
| — of those, the *last* of the three drawn rows | 2 | 2 |
| aimed at an order already `in-progress` when its row was read | 2 | 2 (both said `0`, both paid `0`) |
| named a **different** order than the row described | 2 | — |

Leads recorded on those presses: **36, 37, 38, 38, 39, 39, 39, 40, 40, 41, 41,
41, 47, 50, 52, 55 ticks.** One press submitted at tick 153 was scheduled for
tick 192.

So the failure is not a narrow race a fast player loses occasionally. It is a
**deterministic ~2 seconds of simulation time** between the figure being priced
and the command running, against a state machine that moves an order out of
`assigned` every ten ticks. It bites hardest on the row at the top of the list —
the one nearest the crew, and the one a player is most likely to click — which
paid what it said **once in eight presses**. A row two walls further back paid
what it said both times it was pressed, because a wall is 50 ticks of work
(`workRequired: 50`, `progress += 10` per pass) and 40 ticks of lead does not
clear it.

### #853's own eight-second reproduction, with the worker beside the chip

Sampled every 150 ms for eight seconds after the press, worker treasury and
chip together: **treasury flat at 23,400 across all eleven samples and 152
ticks; chip flat at 23,400 with it.** The order had been `assigned` when the
projection was asked (80) and was `in-progress` by the time the row was read a
few tens of milliseconds later — the row itself then read
`In Progress · 0 back`.

**That rules out the projection-lag explanation, which was the reason this pass
was asked for.** The chip was not hiding a credit. There was no credit, because
the state the press landed on pays nothing.

---

## 3. #853's report, judged clause by clause

- *"the queue row advertises `80 back` for an order in state `assigned`
  ('Awaiting the Crew')"* — **holds.** Confirmed from both sides: worker
  projection 80, DOM row `Brick wall · 13, 16 · North · 80 back Awaiting the
  Crew`.
- *"pressing its `Cancel` issues `CancelBuildOrder` and removes the row"* —
  **holds.** Read off the wire: `{"type":"CancelBuildOrder","orderId":"…"}`.
- *"the FUNDS chip does not move at all across eight seconds"* — **holds, and
  the worker agrees with it.** Not a chip defect.
- *"the 80 may have gone back as material, not money"* — **refuted.** In the
  `assigned` measurement the container's brick count was unchanged at 26 while
  the treasury rose by exactly 80. In the failing press nothing came back in
  either currency.
- *"the stock the order was allocated from had not landed"* — **cannot be the
  explanation.** An order does not reach `assigned` without `tryAllocate`
  succeeding against real container stock. In every run here the 40 bricks had
  landed — held 40, in flight 0, `deliveries: []` — before any order became
  `assigned`. A deliveries panel reading `On the way 40 × Brick · 1,600 back`
  beside an `assigned` order is a stale panel, not a state. **Not measured
  here**, and flagged as its own question.
- *"`CancelBuildOrder` carries only `orderId`, so nothing can compare the figure
  shown against the figure paid"* — **holds**, and this record is what that
  absence costs.
- *"`approved:0 → materials-pending:0 → assigned:80 → in-progress:0`"* — **the
  first two are right for the run they were taken on and wrong as a general
  claim.** #853 bought 40 bricks by hand first, and
  `refundSurplusDeliveries` will not cancel a delivery whose order id is not a
  `jit:` one — stock the player chose to hold, the distinction #687 drew through
  `isJustInTimePurchaseOrderId`. Measured directly: with a hand-bought 40-brick
  delivery still on the road, an `approved` order advertised `0 back` and paid
  `0`, and the delivery's id was a `order-…` UUID rather than a `jit:` one. With
  no hand-bought stock, the same state advertises 80 and pays 80.

**Which of the coordinator's three options it is:** option 1 (a chip or units
problem) is refuted — when money is credited the chip shows it immediately and
exactly, and when the chip is flat the worker is flat. Option 2 is right in
spirit and wrong in its detail: the browser flow does differ from the fixture,
but not because the money left at the press with nothing to give back — it
differs in the **tick the command executes at**, zero lead against 36–55.
Option 3 is right about the *mechanism* #853 inferred and wrong about its
*observation*, which was accurate.

**So the integration test is green about a state a player does reach and a press
a player cannot make while the clock runs.** Its fixture is unrepresentative in
its lead, not in its state.

---

## 4. Three things measured on the way that are not this question

Recorded because each cost a run and each is reachable by a player.

1. **A pooled queue row can submit a `CancelBuildOrder` for a different order
   than its label described.** `row.cancel`'s handler reads `row.orderId` *at
   press time*, deliberately (`src/ui/hud/build-panel.ts:1893`), and the three
   rows are a pool re-pointed on every publication. Two presses out of seven
   moved the treasury by 80 while the order whose row had been read went on to
   `completed`. A third press failed outright — Playwright reported
   `subtree intercepts pointer events` and then `element is not visible` — which
   is the same pool moving under the pointer.
2. **A just-in-time purchase can be silently skipped as a duplicate.** The id is
   `jit:<tick>:<itemId>:<inFlightBefore>`
   (`src/simulation/economy/just-in-time-materials.ts:74`). Cancelling an order
   lowers the in-flight total, so the next purchase **at the same tick**
   composes an id the cancelled purchase already used; `ProcurementSystem`
   answers `duplicate-order`, which the caller treats as already satisfied.
   Measured: after cancelling one of two orders at tick 0, a six-segment drag at
   tick 0 placed six orders, bought nothing, and left the treasury exactly where
   it was — 2 bricks in flight against a demand of 14. Reachable because
   ADR 0051 lets a player do all of that while paused, at one tick. The id's own
   docblock argues that a collision now means *"a restored session re-running the
   tick it was saved on"*; this is a second way to reach it.
3. **The Build panel's QUEUED block is collapsed on arrival**
   (`createCollapsibleSection({ collapsed: true })`, `build-panel.ts:1912`), so a
   fresh prison draws its header and its count and no rows. `panelText` reads
   `QUEUED / 2 waiting · 0 being built`, every `.hud-build__queue-row` has no
   client rect, a `data-order` locator never resolves, and the `Cancel` click
   waits until the test's own timeout — which reads exactly like a broken
   button. `BUILD_QUEUE_ROW_LIMIT` is 3 (`:576`), so a queue of fourteen has
   three rows and eleven orders with no control at all.

---

## 5. What this does not establish

- **Nothing here is a diagnosis of intent, and nothing here is a proposal.**
  Whether a row that prices a state two seconds before the press can honour it
  is a decision about a player-visible promise, which is the owner's
  (`AGENTS.md` exclusion 4). The options are not costed in this record.
- **The lead is not established as the *only* cause.** It is established as
  sufficient: leads of 36–55 ticks were recorded against a ten-tick transition,
  and every paused press at zero lead paid what its row said. A second
  contributing cause is not ruled out.
- **`completed` was not measured** — it has no queue row, and reaching
  `cancelOrder` for it means `Undo`, a different press.
- **The stale deliveries panel #853 also reports was not measured.**
- **Weakest claim: the tally in §2 is 14 instrumented presses across two runs on
  one machine, not a distribution.** The split between the first drawn paying
  row (1 of 8) and the last (2 of 2) rests on two presses on the second arm, and
  two presses cannot carry a rate. What would change my mind about the *shape*
  is a run where a press at zero lead on a genuinely `assigned` order paid
  anything other than the catalogue value; that did not happen in any of the
  nine zero-lead presses recorded here.
- One further caveat on the run conditions: another agent's browser suite was
  running on the same container during the first two runs of this file. The
  paused measurements are insensitive to that — they advance no clock and assert
  no wall-clock budget — but the lead figures in §2 include an elapsed-time
  estimate and would be smaller on a quieter machine, which makes them an upper
  bound on the lead rather than a floor. The transition they have to beat is ten
  ticks, and `DEFAULT_LEAD_TICKS` alone is 20.

## How to re-run it

```
LOCKSTATE_BROWSER_TEST_PORT=5231 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-03-what-cancel-actually-gives-back.playtest.ts
```

`git lfs checkout` first in a worktree. `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file: it is
evidence, not a gate, and it asserts nothing about the figures it reports.
