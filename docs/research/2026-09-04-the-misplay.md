# The misplay — every first-half-hour mistake made on purpose, and the route out of each measured, 2026-09-04

**Played on `agent/playtest-the-misplay`, cut from `main` at `0e614c7`
(v0.0.451).** Instrument:
`tests/browser/playtest-2026-09-04-the-misplay.playtest.ts`, five acts, each
runnable alone. **Nothing under `src/` was changed** — `git status --short src/`
clean throughout.

**The question as given:**

> A player gets it wrong. They put the wall in the wrong place, they buy sixty
> bricks instead of six, they zone the room a tile short, they hire a guard
> they did not want, they build a cell facing the wrong way. Can they get back?
> And what does the game say to them while they try?

**What this record deliberately does not re-measure**, because two dated
records already settle it:
`docs/research/2026-09-04-is-there-a-way-back.md` played the *finished* wall
case end to end (issues [#927](https://github.com/matmaxalez/lockstate/issues/927),
[#928](https://github.com/matmaxalez/lockstate/issues/928)), and
`docs/research/2026-09-03-what-cancel-actually-gives-back.md` priced every
cancellable build-order state against the tick the command executes at
([#853](https://github.com/matmaxalez/lockstate/issues/853)). This record picks
up the mistakes neither of them made: the **queued** wall run, the
**double-press**, the **room**, the **over-buy**, and the **hire and the
admission**.

---

## Claim tiers

- **MEASURED** — read off the running application in this run, quoted from its
  output.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **ARITHMETIC** — derived from constants that were opened.
- **JUDGEMENT** — what I think a player would do or feel, said as such.

---

## The answer in one paragraph

**Yes, a player can get back from nearly every mistake in the first half hour —
and the game tells them so in exactly two of the six cases.** The mistakes that
cost money have complete, correct, findable routes back: six walls drawn on the
wrong line returned **480 of 480** while paused, one order at a time, each press
answered *"The order was cancelled — the money it cost is refunded."*; sixty
bricks bought instead of six returned **2,400 of 2,400**, answered *"The
delivery was cancelled — 2400 back."* The mistakes that destroy something have
routes back that say **nothing at all**: taking a mis-placed room out moved no
number and put no sentence on the screen; taking a standing bed off a tile
destroyed the 65 it cost and put no sentence on the screen; dismissing a guard
hired by mistake kept the 80 already paid and put no sentence on the screen. The
mechanism is one line: **`src/simulation/runtime/session-commands.ts` records an
event on exactly one of the ten commands it routes** — the delivery
cancellation at `:515` — so `UnzoneRoom`, `RemoveObject`, `DismissStaff`,
`HireStaff`, `AdmitPrisoner`, `PlaceObject`, `ZoneRoom`, `PurchaseMaterials` and
`ReleaseGuardAssignment` are all silent on success by construction. And one
mistake has **no route back at all**: an admitted prisoner. Meanwhile the
sentence that *is* on the screen is usually about something else — a refusal
from a press two minutes earlier survived every single act of this run,
including a run of six successful cancellations and a successful removal of the
very room it complained about ([#780](https://github.com/matmaxalez/lockstate/issues/780)).

---

## The findings, most player-damaging first

| # | in one sentence | already known? |
| --- | --- | --- |
| 1 | Three of the game's five ways back — remove a room, remove a standing object, dismiss a guard — say **nothing at all** when they work, and two of them destroy a purchase while saying nothing. | the *class* is #927; **these three instances are new**, and `RemoveObject` is on neither channel #927/#932 is about |
| 2 | A refusal from a press the player has already fixed stays on the screen for the rest of the session, including through the successful fix. | #780, **confirmed live and extended**: it survived 6 successful cancellations, a hire, an admission and the removal of its own subject |
| 3 | An admitted prisoner has no route back of any kind: 141 controls across the five tabs, **zero** name one, and no removal command for a prisoner exists in the protocol. | **new** |
| 4 | The only route back from an unwanted hire is behind a fold that is shut on arrival, so the screen after the mistake reads `ON THE PAYROLL / 80 a day` with no row and no Dismiss. | sibling of #862 (Build queue); **the staff instance is new** |
| 5 | Un-zoning a room leaves every object inside it standing on bare ground, reachable by no panel, and the game never mentions it. | **new** |
| 6 | A double-press on **Buy** buys twice and on **Hire** hires twice, with no confirm; a double-press on a wall drag, an object tile, Admit and Designate is refused with a named reason and costs nothing. | **new** |
| 7 | The confirmation for a cancelled delivery renders its figure **unformatted** (`2400 back`) where the row that priced it renders `2,400 back`, against a docblock that claims the two "render alike". | **new** |
| 8 | Discarding a rectangle the panel refused folds the whole Rooms panel away, taking the requirement text the player needs in order to correct the mistake off the screen. | **new** |
| 9 | **The refutation, and it is the largest single result:** the two money mistakes and the two size/placement mistakes are handled *exemplarily* — priced before the press, refused before the press where the panel can tell, and confirmed with the amount afterwards. | ADR 0096's economic reading; the per-control detail is new |

---

## 1. Three of the five ways back say nothing at all

### The reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5314 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-misplay.playtest.ts -g "act 3"
LOCKSTATE_BROWSER_TEST_PORT=5314 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-misplay.playtest.ts -g "act 5"
```

### What each way back says, measured

Every row below is **MEASURED** in this run. The "what the game said" column is
`.hud__event` read layout-aware — a sentence inside a shut fold is correctly
absent — and `(not laid out)` means the band is not on the screen at all.

| the mistake | the way back | money | what the game said |
| --- | --- | --- | --- |
| six walls on the wrong line, queued | queue row `Cancel` ×6 | **+480 of 480** | *"The order was cancelled — the money it cost is refunded."* ×6 |
| sixty bricks instead of six | delivery row `Cancel` | **+2,400 of 2,400** | *"The delivery was cancelled — 2400 back."* |
| a room zoned in the wrong place | Rooms → `Remove rooms` → `Remove 8 × 8` | 24,935 → **24,935** | **`(not laid out)` — nothing** |
| a bed standing on the wrong tile | Build → `Remove` → press the tile | 24,935 → **24,935** | **`(not laid out)` — nothing** |
| a guard hired by mistake | roster row `Dismiss` ×2 | 24,920 → **24,920** | **`(not laid out)` — nothing** |

The room removal, quoted from act 3:

```
[act3] 3f the confirm control for a removal reads "Remove 8 × 8"
[act3] 3f removal: rooms 1 -> 0 | worker 24935 -> 24935 | accommodationCapacity 0 -> 0
[act3] 3f what the game said about the removal: {"refusal":"The room was not zoned — it
        overlaps a room that is already there.","event":"(not laid out)"}
```

The standing bed, quoted from act 3 — and note the treasury:

```
[act3] 3g armed Remove on that tile: 1 command(s) -> [{"type":"RemoveObject","x":8,"y":13}]
        | worker 24935 -> 24935 (0) | {"refusal":"The object was not placed — something is
        already standing there.","event":"(not laid out)"}
```

The bed had cost **65** — **MEASURED**, `worker 25000 -> 24935 (-65)` on the
placement press in the same act, which is one wood plank at
`src/content/procurement-catalog.ts:101`. So the removal destroyed a 65 purchase, moved
no number a player can see, and said nothing.

The dismissal, quoted from act 5:

```
[act5] hired one guard: staff 0 -> 1 | worker 25000 -> 24920 (-80) | dailyWageBill 80
[act5] after ONE dismiss press: "Dismiss Guard · Unassigned? Their wage stops and they do not come back."
[act5] after TWO dismiss presses: staff 1 -> 0 | worker 24920 -> 24920 (0) | dailyWageBill 0
[act5] what the game said: {…,"event":"(not laid out)"}
```

### Why, in the code — every line opened

- **VERIFIED, read.** `src/simulation/runtime/session-commands.ts` routes ten
  commands and its own header names them: *"a refused wall, a refused purchase,
  a refused zoning rectangle, a refused un-zoning, a refused hire, a refused
  admission, a refused object placement, a refused object removal, a
  cancellation with nothing left to refund and a release of a guard nothing was
  holding are the same kind of fact about the session"*. **`grep -n
  "events\.record" src/simulation/runtime/session-commands.ts` returns exactly
  one line: `:515`, `events.recordDeliveryCancelled(outcome.refundedMinorUnits,
  context.tick)`.** Every other success path in that file calls only
  `refusals.supersede(...)` — the `UnzoneRoom` arm at `:239`, the `RemoveObject`
  arm at `:673`.
- **VERIFIED, read.** The other three success sentences a player can reach come
  from `src/simulation/construction/handler.ts`: `:156`
  `recordBuildOrderCancelled`, `:174` `recordConstructionUndone`, `:178`
  `recordConstructionRedone`. So the whole set of player-command successes the
  game will speak about is **four**: cancel an order, cancel a delivery, undo,
  redo.
- **VERIFIED, read.** `ObjectPlacementService.remove`
  (`src/simulation/objects/object-placement-service.ts:582`) has two success
  arms and they are not equivalent. A **pending** order is taken back through
  `this.orders.cancelOrder(pending.order.id)` (`:608`) — which is the channel
  #927 and PR #932 are about, so it inherits whatever they land. A **standing**
  object is taken away by `this.placedObjects.remove(object.placedObjectId)`
  (`:586`) and **never reaches `cancelOrder` at all**. That is the finding's
  sharpest edge: *fixing the Cancel channel does not reach the standing-object
  case*, because that case is on neither channel.
- **VERIFIED, read.** The non-refund on a dismissal is deliberate and argued:
  `src/simulation/staff/dismissal.ts:113-130`, *"Money: neither refund nor
  severance, and that is deliberate … A refund would make hire-then-dismiss a
  way to get money back for a day already worked"*. **So the 80 is not a
  defect.** What is measured here is that nothing on the screen says the 80 is
  gone, in a game whose owner's recorded reasoning is *"silence about a loss is
  the worst option"* (quoted in #927 from
  `src/content/default-locale-en.ts:852-856`).

### What this costs a player, and how sure I am

**Cost: certain for the two destructive cases, and a JUDGEMENT for the third.**
Removing a standing bed destroys 65 and removing a room destroys nothing but
also confirms nothing; both are measured. Whether a player *notices* is a
judgement, and the previous record already established the condition that makes
it invisible: there is no stock readout anywhere in the interface
(`2026-09-04-is-there-a-way-back.md` §4, a five-tab sweep at 109 controls each).

### What could have refuted this and did not

- **The sentence could have been in the alerts list rather than the band.**
  `panelText` on the whole `.hud` was dumped after each press in acts 3 and 5
  and no removal, dismissal or un-zoning sentence appears anywhere in it.
- **The band could have been occupied by something with a longer dwell.** It
  was not occupied at all — `event: "(not laid out)"`, which is the band
  `hidden`, not a band showing something else.
- **The removal could have failed.** It did not: `rooms 1 -> 0` off the worker,
  and the follow-on probe in 3g changed refusal from *"something is already
  standing there"* to *"it has to stand in a room you have zoned"*, which is
  only possible if both the object and the zoning are gone.

---

## 2. A refusal outlives its subject through the whole session (#780)

**MEASURED, and the most persistent thing in this run.** Calibration presses the
`Remove` control on empty tiles, which is a mistake a player makes too — aiming
Remove and missing. It produced:

> `Nothing was removed — there is no object on that tile, and none being built there.`

That sentence was then **still the only thing on the refusal band** after, in
act 1: a six-order wall run accepted, the QUEUED block opened, **six successful
cancellations each of which moved the treasury**, a clock start, a clock stop
and three `KeyZ` presses. Quoted from the last line of act 1:

```
[act1] final screen: {"refusal":"Nothing was removed — there is no object on that tile,
        and none being built there.","event":"The order was cancelled — the money it cost
        is refunded."}
```

So the screen carries a refusal and a success **at the same time, about
different things**, with nothing to say which is current.

In act 3 the same mechanism produced the version #780 calls the sharpest:

```
[act3] #780 check — the 3d refusal was "The room was not zoned — it overlaps a room that
        is already there."; after a successful removal the band reads "The room was not
        zoned — it overlaps a room that is already there."
```

**The player did the fix the sentence implies — they removed the room that was
in the way — and the sentence is still there afterwards.** That is the recovery
path being contradicted by the screen at the moment it succeeds.

- **VERIFIED, read.** The mechanism is exact-subject keying, and it is
  deliberate: `session-commands.ts`' header says every branch calls
  `refusals.supersede` on its success path *"passing the same key its own
  `record` call would have used"*, and *"a role, an item or a tile that does not
  match the standing refusal's own leaves that refusal exactly as it was"*. So a
  removal at a *different* rectangle cannot clear a refusal about this one, by
  design.
- **VERIFIED, read.** There is no dismiss control for the band:
  `src/ui/hud/hud.ts:1094-1098` — *"It does **not** auto-dismiss … so a host
  refusal stays until the same action later succeeds, and a simulation refusal
  until another replaces it or the session ends"*.

**Cost, JUDGEMENT:** in the misplay context this is worse than #780 states,
because the refusal band is where the game explains mistakes. A player learning
the game reads it, fixes the thing, and the explanation does not change — so the
one channel that teaches them what went wrong cannot tell them they have
succeeded.

**Already known:** #780, open, filed 2026-09-01. This adds two things: the
survival is not bounded by a timeout or a tab change (measured across five tab
switches and 5,980 ticks in act 5), and the stale sentence is present *in the
recovery path*, not only after an unrelated success.

---

## 3. An admitted prisoner has no route back

**MEASURED.** Act 5 admitted one prisoner into a built, zoned, furnished cell
and then swept every tab for any control or line of text matching
`/release|discharg|free|expel|transfer|deport|evict|let go|send away|remove
prisoner|un-?admit/i`:

```
[act5] admitted: prisoners 0 -> 1
[act5] tab overview: 19 controls, 0 naming a route back []
[act5] tab build:    44 controls, 0 naming a route back []
[act5] tab rooms:    40 controls, 0 naming a route back []
[act5] tab security: 20 controls, 0 naming a route back []
[act5] tab regime:   18 controls, 0 naming a route back []
[act5] prisoners still 1 at tick 5980
```

141 visible controls, **zero**. The four text lines that matched are all about
something else (*"It does not need a free bed"*, *"0 held · 0 free"*, *"A
released guard stays hired and goes back to the pool"*, *"Allows Recreation,
Free Association"*).

- **VERIFIED, read.** The protocol has no such command.
  `grep -n "z.literal('" src/simulation/protocol/commands.ts` lists fifteen:
  `PlaceBuildOrder`, `CancelBuildOrder`, `ZoneRoom`, `UnzoneRoom`,
  `PurchaseMaterials`, `CancelMaterialPurchase`, `AdmitPrisoner`, `HireStaff`,
  `PlaceObject`, `RemoveObject`, `ReleaseGuardAssignment`, `DismissStaff`,
  `DismissAlert`, `Undo`, `Redo`. `AdmitPrisoner` is the only prisoner command
  and there is no inverse of it.
- **VERIFIED, read.** The asymmetry is named in the tree, from the other side:
  `src/ui/hud/staff-panel.ts:1171` — *"a dismissal, unlike a release, cannot be
  undone by waiting"*. For a prisoner it is the reverse: waiting is the **only**
  route, because a sentence expires.

**Cost, and its bound.** An admission is not free — the prisoner needs a bed and
eats — and it is the single press on the Overview tab that a new player is most
likely to make early and by accident, because the Admit control sits at the top
of the default tab and is never disabled. **How much it costs is not measured
here** and the bound is not established: a sentence does expire
(`tests/unit/prisoners-sentence.test.ts` exists), so this is "no *player* route
back" rather than "permanent". I did not measure how long.

**JUDGEMENT, and stated as the weaker half:** this may well be correct design —
a prison you can empty on a whim is not a prison. It is reported because the
brief asked whether every mistake has a route back, and this is the one that
does not, and because **nothing on the screen says so**: the Admit control
carries the hint *"A prison needs a cell before it can admit anyone"* and no
word about the press being one way.

---

## 4. The only way back from an unwanted hire is behind a shut fold

**MEASURED.** Act 5 hired one guard and then read the roster block as the player
finds it:

```
[act5] roster with the clock as the player found it:
        {"sectionCollapsed":"true","rows":3,"rowsLaidOut":0,"labels":[]}
[act5] roster block text: "ON THE PAYROLL\n80 a day"
[act5] the ON THE PAYROLL block was folded shut; opening it
[act5] roster after opening the block:
        {"sectionCollapsed":"false","rows":3,"rowsLaidOut":1,"labels":["Guard · Unassigned Dismiss"]}
```

So immediately after the mistake the screen says the prison is paying 80 a day
and offers **no row and no control**. Three roster rows exist in the DOM and
none of them is laid out. Opening the fold is one press — but it is a press on a
header a player has to notice, and the block's own explanatory sentence (*"A
dismissed staff member leaves the prison for good, and their wage stops."*) is
inside the fold too, so the thing that would tell them the control exists is
behind the thing they have to find.

- **VERIFIED, read.** `src/ui/hud/staff-panel.ts:1389` — `collapsed: true` on
  the roster section. `:165` — `STAFF_ROSTER_ROW_LIMIT = 3`.
- **VERIFIED, read.** It is the same decision as the Build queue's, one panel
  over: `src/ui/hud/build-panel.ts:2146`, `collapsed: true`, with the comment
  *"a queue then costs this panel a header and a count, and costs it a list only
  when the player asks for one."* `:608` — `BUILD_QUEUE_ROW_LIMIT = 3`.

**Already known as a class:** #862 makes exactly this argument about the Build
queue. **The staff instance is new**, and it is the sharper of the two for a
misplay, because the Build queue at least names its own escape hatch (see §9)
and the roster block names nothing while it is shut.

**Not measured, and it matters:** the clock was paused when the roster was first
read. A second read after 56 ticks of running clock gave the identical
`rowsLaidOut: 1` once the fold was open, so the fold — not a missing publication
— is what hides the control. I did not check whether the fold state persists
across a reload.

---

## 5. Un-zoning a room orphans the furniture inside it

**MEASURED, act 3, in four presses.** A yard was zoned in the wrong place, a bed
was placed inside it and built, the room was removed, and then the tile was
probed three times:

| press | commands | what the game said |
| --- | --- | --- |
| place a bed inside the yard | `PlaceObject{bed-wooden, 8,13}`, **−65** | (band held a stale refusal) |
| → queue row | — | `Bed · 8, 13 · North · 65 back / Approved / Cancel` |
| remove the room `8 × 8` | `rooms 1 -> 0` | **nothing** |
| place a bed on that tile | 1 command | *"The object was not placed — something is already standing there."* |
| `Remove` armed, press that tile | `RemoveObject{8,13}`, **±0** | **nothing** |
| place a bed on that tile again | 1 command | *"The object was not placed — it has to stand in a room you have zoned."* |

The last two rows are the proof, and they are why this is a measurement rather
than an inference: before the removal the tile was blocked by an **object**;
after it the tile was blocked by the **absence of a room**. So the bed really was
standing on an un-zoned tile, and the `RemoveObject` really did take it away.

- **VERIFIED, read.** `RoomZoningService.unzone`
  (`src/simulation/rooms/zoning.ts:755`) writes `world.setZoning(tile, 0)` for
  every cleared tile and `roomInstances.unregister(...)` for every affected
  instance, and touches no placed object. Its long docblock covers residents in
  detail (issue #478's relocation) and does not mention furniture.
- **VERIFIED, read.** Nothing in the interface lists placed objects: the Build
  panel's only lists are the catalogue, the queue (`PENDING_BUILD_ORDER_STATES`,
  which excludes `completed`) and the deliveries. So a standing bed on an
  un-zoned tile appears on no panel and is reachable only by pressing its tile
  with `Remove` armed — which requires knowing it is there.

**Cost, MEASURED for the money and JUDGEMENT for the rest:** 65 per bed,
destroyed with no sentence. The larger cost is a JUDGEMENT: a player who zones a
cell, furnishes it, decides the cell is in the wrong place and removes it now has
invisible furniture on bare ground blocking the tiles, and the only symptom is
that a later placement there is refused with *"something is already standing
there"* about a thing no panel will name.

**Not established:** whether an orphaned object still counts toward anything —
capacity, needs, a room's requirement list — was **not measured**. `accommodation
Capacity` was 0 before and after, but the yard is not accommodation, so that
figure proves nothing about it.

---

## 6. The impatient double-press: four are absorbed, two are not

**MEASURED, act 2**, one prison, six controls, each pressed twice with nothing in
between.

| the order given twice | second press | cost | what the game said |
| --- | --- | --- | --- |
| the same wall drag | 3 real `PlaceBuildOrder`s | **0** | *"The build order failed — that order already exists."* |
| the same object tile (unzoned) | 1 real `PlaceObject` | **0** | *"The object was not placed — it has to stand in a room you have zoned."* |
| `Admit a prisoner`, no cell | press landed | **0** | *"Nobody was admitted — this prison has no room to hold anybody."* |
| `Designate`, same rectangle | gesture repeated whole | **0** | the same enclosure refusal, unchanged |
| **`Buy 5 × Brick`** | **a second purchase** | **−400 for 10 bricks** | **nothing** |
| **`Hire Guard · 80`** | **a second guard** | **−160, `staff 0 -> 2`** | **nothing** |

Quoted:

```
[act2] 2a second identical drag: 3 command(s), worker 24760 -> 24760 (0)
[act2] 2a what the game said after the second drag: {"refusal":"The build order failed —
        that order already exists.",…}
[act2] 2b two Buy presses of 5 × Brick: worker 24760 -> 24360 (-400)
[act2] 2e two Hire presses: staff 0 -> 2, worker 24360 -> 24200
```

**The four absorbed cases are good behaviour and are the point of the table.**
The build order's idempotence is not luck — it is a real command answered with a
real, named refusal, which is exactly what a player needs.

**The two that are not absorbed are not defects either**, and this is where the
measurement stops and a decision begins: pressing Buy twice *should* buy twice,
and pressing Hire twice *should* hire twice, if the player meant it. What is
measured is the **asymmetry in what the game does about the risk**:

- **The Buy double-press has a complete way back** — the second delivery is its
  own row with its own `Cancel` and its own price (§9).
- **The Hire double-press has none**: the second guard's 80 is gone
  (`dismissal.ts:113-130`, deliberate), and the control that would take the
  guard off the payroll is behind the fold in §4.
- **VERIFIED, read.** The hire is a single press with no confirm
  (`src/ui/hud/staff-panel.ts:802`, `hire.element.classList.add('hud-staff__hire')`)
  while the **dismissal** is a two-press confirm
  (`:1218-1245`, `pressDismiss`), so the game asks *"are you sure"* about
  removing a guard and not about adding one — and adding one is the press that
  cannot be undone for free.

---

## 7. The delivery confirmation renders its own figure differently from the row

**MEASURED, act 4:**

| | text |
| --- | --- |
| the row, before the press | `60 × Brick · 2,400 back` |
| the band, after the press | `The delivery was cancelled — 2400 back.` |

- **VERIFIED, read.** The row's figure is pre-formatted:
  `src/ui/hud/build-panel.ts:1938` passes
  `localizer.formatNumber(delivery.paidMinorUnits)` into
  `formatPendingDeliveryText`.
- **VERIFIED, read.** The band's figure is not: `src/ui/simulation-events.ts:877`
  returns `{ total: event.refundedMinorUnits }` — a raw integer — for
  `'economy.delivery-cancelled'`.
- **VERIFIED, read, and this is why it is worth a section.** The docblock
  immediately above that line asserts the opposite, in terms:
  `src/ui/simulation-events.ts:869-876` — *"the same units — minor units,
  unconverted — so the two render alike … A player who reads the row before
  pressing reads the same figure in the confirmation afterwards."* The figure is
  the same; **the rendering is not**, and "render alike" is the claim the
  measurement contradicts.

**Cost: small, and I say so.** `2400` and `2,400` are the same number and a
player will not be misled about the amount. It is reported because it is a
player-visible string disagreeing with a comment that was written to promise
exactly this property, in the one sentence in the game that confirms a refund —
and under the 2026-09-04 release of `AGENTS.md` reservation 4 the wording is now
this repository's to fix.

---

## 8. Discarding a refused rectangle folds the Rooms panel away

**MEASURED, act 3.** A 2×2 cell was drawn (below the 2×3 minimum), the panel
disabled `Designate 2 × 2` and explained why, and the only way on from there is
`Discard`. After that press:

```
[act3] a rectangle was still pending; pressing "Discard" to get out of it
[act3] the whole Rooms panel was folded shut and had to be re-opened before anything
        could be chosen
```

So the panel that holds the eighteen room types, the requirement list and the
"too small" note collapses to its 45px header at the moment the player says *"no,
not that"* — with the tool still armed.

- **VERIFIED, read.** This is `folded()` doing what it is written to do:
  `src/ui/hud/rooms-panel.ts:522` — `const folded = () => (drawing() ? drawingFolded : playerFolded)` —
  applied at `:1771` (`panel.setCollapsed(folded())`), where `drawing()` is
  *"armed and there is nothing to confirm yet"* (`:521`). `Discard` clears
  `pending` and leaves `armed` true, which is precisely a drawing pass.
- **VERIFIED, read.** The fold is deliberate and well argued — `:452-475` records
  the measurement that motivates it: at 375×812 *"the largest square of bare
  world anywhere on that page is 16px"*, so a panel that did not fold could not
  be drawn under at all.

**So this is a consequence rather than an oversight**, and the finding is the
consequence: the fold was designed for the state *before* a rectangle exists and
`Discard` returns the player to that state, which is the one moment they most
need the requirement text they were just reading. **JUDGEMENT** on the cost, and
it is small for a mouse player (one press on the header) and larger for anyone
who has to find it.

---

## 9. The refutation: what this game does well, with the numbers

**This is the largest single result in the run and it is a negative one.** The
brief's premise — that a misplaying player is stranded — is false for four of the
six mistakes, and the four are handled better than the two that fail.

### 9a. Six walls on the wrong line: 480 spent, 480 back, one order at a time

**MEASURED, act 1, clock paused throughout** so every `Cancel` executes at the
tick its own row was priced at:

```
[act1] straight after the wrong run: worker=24520 (spent 480)
[act1] 6 order(s) queued, 3 row(s) with a Cancel
[act1] Cancel #1..#6: each +80, each "The order was cancelled — the money it cost is refunded."
[act1] after pressing every Cancel on offer: worker=25000, 480 back of 480 spent
```

**Six presses recovered every minor unit**, even though the block draws only
three rows — because the pool refills as each order goes. **ARITHMETIC** agrees:
6 edges × 2 bricks × 40 = 480 (brick 40,
`src/content/procurement-catalog.ts:100`; `wall-brick` needs
`{ itemId: 'item.brick', quantity: 2 }`,
`src/simulation/construction/definition.ts:89`).

**And the panel names its own escape hatch.** With three of six drawn it read:

> `and 3 more behind these — undo takes back a whole run.`

**VERIFIED, read:** `src/content/default-locale-en.ts:1375`,
`'hud.build.queue-more': 'and {count} more behind these — undo takes back a whole run.'`
That is ADR 0031 decision 4 keeping its promise — *"The sentence under the rows
says so, so the absence is stated to the player rather than left as a gap."*
The gap that remains is the one #928 names: the sentence says "undo" and undo is
`KeyZ`, which a touch player does not have.

### 9b. Sixty bricks instead of six: priced before, priced on the row, confirmed after

**MEASURED, act 4:**

```
[act4] quantity 6:  submit "Buy 6 × Brick · 240"      disabled=null unavailable=null
[act4] quantity 60: submit "Buy 60 × Brick · 2,400"   disabled=null unavailable=null
[act4] bought 60 × Brick: worker 25000 -> 22600 (-2400)
[act4] the delivery row reads "60 × Brick · 2,400 back Cancel"
[act4] delivery cancelled: worker 22600 -> 25000 (2400) | event "The delivery was cancelled — 2400 back."
```

The control states the total before the press, the row states the refund before
the second press, and the band states the amount after it. That is the model the
three silent ways back in §1 fail to meet — and it is the same conclusion
`2026-09-04-is-there-a-way-back.md` §4 reached, reproduced here at a different
quantity on a later tree.

### 9c. #772 is closed in behaviour, and the number it prints is right

**MEASURED, act 4.** The Buy control no longer looks identical when the press
would be refused:

```
[act4] quantity 6000: shortfall "Not enough money — you need 213,815 more."
[act4] quantity 1000: submit "Buy 1000 × Brick · 40,000" aria-disabled=true
[act4] shortfall line: "Not enough money — you need 13,815 more."
[act4] after the unaffordable press: worker 25000 -> 25000
        | refusal "Nothing was bought — deliveries are refused until the prison earns the money."
```

**The figure looks wrong and is right, and I checked because it looked wrong.**
40,000 − 25,000 is 15,000, not 13,815. The difference is 1,185, and it is the
overdraft the prison is allowed:

- **VERIFIED, read.** `src/ui/affordability.ts:298` —
  `spendableMinorUnits = balanceMinorUnits - overdraftFloorMinorUnits`, and
  `:319` — the shortfall is `chargeMinorUnits - spendableMinorUnits`.
- **ARITHMETIC** from constants opened:
  `src/simulation/economy/treasury.ts:354`,
  `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS = -1_250`; `:507`, the starter
  floor is that plus `STARTER_RUNG_MARGIN_MINOR_UNITS`, which is
  `STARTER_PLANK_PRICE_MINOR_UNITS` (`:504`) — and a plank is **65**
  (`src/content/procurement-catalog.ts:101`), giving a starter floor of
  **−1,185**. 25,000 − (−1,185) = 26,185, and
  40,000 − 26,185 = **13,815** exactly, 240,000 − 26,185 = **213,815** exactly.

So the sentence is true of a prison that may spend to −1,185, and the control,
the label, the shortfall line and the simulation's own refusal all agree.
**#772's "half that is a decision" has been decided and shipped**; the issue is
still open and its behavioural half is not reproducible on this tree.

### 9d. A room a tile short is stopped before the press, and told why

**MEASURED, act 3**, and this is the single best-behaved control in the run:

```
[act3] 3a: room.cell 7,12..8,13 | confirm read "Designate 2 × 2" disabled=true
        | its own note: "TOO SMALL — THIS ROOM NEEDS AT LEAST 2 × 3 TILES."
[act3] 3a: panel said ["AREA","2 × 2 tiles at 7, 12","TOO SMALL — THIS ROOM NEEDS AT
        LEAST 2 × 3 TILES.","NEEDS AT LEAST 2 × 3 TILES","MUST BE ENCLOSED","NEEDS 1 ×
        BED","NEEDS 1 × TOILET"]
```

The requirement list is on the screen **before** the drag, the deficiency is
named **during** it, and the control is disabled rather than left to fail.
**VERIFIED, read:** `src/content/room-catalog.ts:92-97` is where the 2×3 comes
from (`{ type: 'minimum-size', minWidth: 2, minHeight: 3, minTiles: 6 }`).

The other three room mistakes are refused with their own specific sentence, each
**MEASURED**:

| the mistake | what the game said |
| --- | --- |
| a legal cell with no wall round it | *"The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."* (and the panel said `OPEN ON AT LEAST ONE SIDE` before the press) |
| a room overlapping one already there | *"The room was not zoned — it overlaps a room that is already there."* |
| a room in the wrong place | accepted, and `Remove rooms` takes it out — the *sentence* is what §1 measures |

### 9e. The route back off a mis-placed room is a peer control, not a hidden one

**MEASURED.** `Remove rooms` is in the visible control list on arrival at the
Rooms tab, with no fold opened:

```
[act3] 3f controls visible on the Rooms tab: [… "ENTER COORDINATES","Draw on map",
        "Remove rooms", "OVERVIEW","BUILD","ROOMS","SECURITY","REGIME"]
```

**VERIFIED, read**, and the tree says why it is a peer:
`src/ui/hud/rooms-panel.ts:996-1023` — *"It is the recovery from every mistake
this panel can make, and a recovery folded behind a toggle is a recovery a player
in trouble has to find … which is why it is always visible."* That sentence is
kept by the code. It is worth naming beside §4, where the recovery from a hire
**is** behind a fold: the repository has already had this argument once and
reached the right answer in one panel and not the other.

---

## 10. One thing measured on the way that is not this question

**A pooled queue row that has just been cancelled keeps its box and a button
still reading `Cancel`, and it is dead.** **MEASURED**, act 1, computed style of
all three controls right after the first cancellation:

```
[act1] how the three Cancel controls LOOK: [
  {"dead":true, "label":"Cancel","opacity":"0.5","cursor":"not-allowed","box":"78x44"},
  {"dead":false,"label":"Cancel","opacity":"1",  "cursor":"pointer",    "box":"78x44"},
  {"dead":false,"label":"Cancel","opacity":"1",  "cursor":"pointer",    "box":"78x44"}]
```

It **is** distinguishable — half opacity and a `not-allowed` cursor — so this is
not a control that lies. It cost this instrument a run anyway, and the reason is
worth recording for the next reader: only `aria-disabled` marks it (`disabled`
would be cleared by the busy group, `src/ui/hud/build-panel.ts:2283-2298`), so a
`hasText: 'Cancel'` locator resolves to it and waits out its whole timeout. On a
touch device there is no cursor and 0.5 opacity is the only signal. **Not
measured on touch**, and flagged as the `touch-only` tester's surface rather than
chased.

---

## 11. What this does not establish, and my weakest claim

### Not reached

- **The clock running.** Acts 1 and 3 are paused by choice, so that a cancel
  executes at the tick its row was priced at; `2026-09-03-what-cancel-actually-gives-back.md`
  already measured what a *running* clock does to that (36–55 ticks of lead), and
  nothing here re-measures it. **So every "480 of 480 back" figure in this record
  is the paused best case**, and a player who does not pause gets the behaviour
  that record documents.
- **A wall drawn *through* something.** The brief asked for it. A wall drawn on
  top of an **existing wall order** was measured (2a, refused
  `build.duplicate-order`); a wall drawn through a **standing object** or across
  a **zoned room boundary** was not.
- **A cell built facing the wrong way.** No buildable in this tree has an
  orientation a player chooses beyond the wall's tile edge, so I could not make
  this mistake; the wall's edge chooser was not exercised.
- **How long an admitted prisoner stays.** §3's "no route back" is about player
  controls; the expiry of a sentence is a real bound on the cost and it is
  unmeasured.
- **Whether an orphaned object still counts** toward capacity, needs or a room's
  requirement list (§5).
- **A second viewport.** Everything is 1440×900. Three of the findings (§4, §8,
  §10) are about folds and pixels and will read differently at 900×600 and
  375×812.

### Instrument failures, reported because two cost a reading

1. **`.hud-rooms__arm` is a toggle and clicking it blind puts the tool down.**
   `Discard` leaves the tool armed, so the control reads `Stop drawing`, and the
   click meant to arm it disarmed it — after which the drag produced nothing and
   the confirm read `Designate 0 × 0`, which looks exactly like a drag the world
   refused. That is what act 3's first 3b reading was, and it is withdrawn;
   `armRooms` now reads the label first, the way `armBuildable` does in the
   shared harness.
2. **A cancelled queue row is dead but still says `Cancel`** — §10. The first
   run of act 1 timed out on it and read as a broken button.
3. **`simulation/clock-state` is not published until the clock is touched.**
   `currentClock` returned `null` and `currentTick` `-1` on every fresh prison in
   this run, before any transport press. Nothing here depends on it, but a reader
   who expects `tick=0` should know.
4. **Several tiles in the first draft of this instrument were off-screen** at
   1440×900 (tile 30 is x=1648). Every world press in the final file is guarded
   by `elementFromPoint` and the guard is what caught it.

### My weakest claim, and what would change my mind

**That §1's three silences are silences a player would notice, rather than
silences that are correct.** The mechanism is not in doubt — one
`events.record*` call in `session-commands.ts`, and I opened it — and the
measurements are unambiguous. What I cannot establish from a playtest is that
each of the three *should* speak. A removal a player just asked for is arguably
self-evident from the room disappearing, and the dismissal already says *"Their
wage stops and they do not come back."* **The one of the three I would still
defend under pressure is the standing object**: 65 destroyed, no sentence, no
figure anywhere on the page, and it is on neither of the two channels #927 and
PR #932 are fixing — so it will still be silent after that work lands. **What
would change my mind about the other two:** a player-facing argument that a
disappearing room and a disappearing roster row are their own confirmation. What
would change my mind about the object case is a measurement showing a figure for
it somewhere on the page; I swept `.hud` after each press and found none.

Second weakest: **§3's sweep is a vocabulary sweep**, and a route back that is
named in words my regex does not contain — a room-based transfer, something on a
prisoner detail surface I never opened — would not have appeared. The protocol
grep is the strong half and the sweep is the corroboration, not the other way
round.

---

## How to re-run it

```
LOCKSTATE_BROWSER_TEST_PORT=5314 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-misplay.playtest.ts -g "act N"
```

`git lfs checkout` first in a worktree, and
`ln -sfn /workspace/lockstate/node_modules <worktree>/node_modules`.
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so nothing
in CI collects this file: it is evidence, not a gate, and it asserts nothing
about the figures it reports beyond `assertCanvasAt`.

Measured wall-clock cost on a container also running four other testers: act 1
2.8m, act 2 2.9m, act 3 4.4m, act 4 2.2m, act 5 3.8m.
