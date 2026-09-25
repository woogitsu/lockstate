# ADR 0031: Withdrawing one queued build order — where a player aims, and what a long queue looks like

## Status

**Accepted, 2026-08-26 — with open question 4 promoted to blocking.** The three
decisions and the surface that shipped with this document (#367) are approved as
written. What is *not* approved is leaving the catalogue as the donor
indefinitely: **open question 4 ("is the catalogue the right donor?") is now a
condition on this acceptance rather than a note.** The catalogue needs a surface
of its own — its own scroll, a filter, or a different donor — before more rows
arrive, and until it has one this decision is approved knowing the price is
rising.

Why the promotion, stated with the arithmetic so the next reader can check it:
the amendment at the foot of this document measured the price at **four**
`BUILDABLE_REGISTRY` rows and reported that at 900x600, with a queue, three of
the four are behind a scroll. ADR 0028 phase 4 then landed **21** rows. At the
44px row height and the 44px list box this document measured at that viewport,
that is **one row of twenty-one visible** — derived from this ADR's own two
figures rather than re-measured, and flagged as derived. The trade decision 3
makes is still the right one: a reachable queue beats a complete list. But
"choosing what to build means scrolling a list showing one of twenty-one
options" is not a price this ADR argued for, and accepting it silently would be
accepting a different decision from the one written down.

The implementing change was on the same branch as this document and this ADR
arrived with it, which is the shape §2 of
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) warns about: such a document reaches
`main` unapproved from the moment it merges and can sit there unnoticed. Its
rule was followed — the queue entry was in the same commit — and it still sat
for a day, which is the evidence that the rule makes such an ADR *visible*
rather than *safe*.

The wording of that last sentence is deliberate, and worth a line because it
will look like a stylistic tic to the next editor: naming the status this
document used to hold, next to this document's own number, trips
`adr-status-reference-contract.test.ts`. That gate matches on the status word and
**cannot tell a general statement about a shape from a claim about a particular
ADR** — `docs/adr/README.md` records the same blind spot for the same reason. The
sentence says "unapproved" instead, and the gate's inability to read it is the
cost of a gate that catches real drift.

### The number

**0031, and it started as 0030.** This document took 0030 on the strength of
`docs/adr/README.md`'s stated next-free, and said so plainly: the check that
statement cannot make was not available from inside the session that wrote it —
`gh` is not installed on that machine, so the open pull requests were not
enumerated the way [ADR 0029](./0029-concurrent-room-use-claims.md)'s author
enumerated them. It recorded the exposure rather than glossing it, because it is
exactly the condition under which 0024 through 0027 collided, and it committed in
advance: *if an unmerged branch is holding 0030, this document is the one that
renumbers.*

**An unmerged branch was holding 0030** — the incident-response restore change,
which allocated the same number in the same hour for
`0030-restoring-an-interrupted-incident-response.md`. So this document renumbered,
exactly as it said it would, and the pre-commitment is why the collision cost a
`git mv` rather than an argument about who was first.

Worth keeping for whoever allocates the next number: the stated next-free in a
file is a claim about merged history, and two branches reading it in the same hour
both read it correctly and still collide. The enumeration ADR 0029's author ran is
the only thing that catches that, and it has to be run *by whoever can see the
open pull requests* — which, when the author cannot, means the number is
provisional until someone checks.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every `file:line`, count and
figure below was read on disk at `87516a8` (v0.0.84) or produced by running this
tree. Every viewport measurement was taken in Chromium through
`tests/browser/ui-harness.html` and is reproduced by the spec named beside it.

---

## Context

### The half-surface, and why it survived seven reviews

`CancelBuildOrder { orderId }` has had a schema member
(`src/simulation/protocol/commands.ts`), a decoder, a `commandJson` case, a
handler branch (`src/simulation/construction/handler.ts`) and a complete
implementation behind it (`ConstructionSystem.cancelOrder`, which also reverses
the world geometry a completed order wrote and refunds its materials) since #16.

**Nothing in the application could construct one.**
`tests/foundation/unconsumed-command-contract.test.ts` measured it and accounted
for it: it was the last command on that gate's `AWAITING_PRODUCER` list, and the
count at the foot of that file read *ten produced and one unproduced*.

Its entry gave the reason, and the reason was correct. `Undo` is not
equivalent — it is payload-free by protocol and pops the last *transaction*, so
a twelve-segment drag undoes as one wall. And a generic "cancel" button with no
target would have been worse than nothing, because the player could not say
*which* order. The narrowing #328 forced on that entry is the same argument from
the other side: a pending **object** order can be withdrawn individually by
pressing its tile with the Build panel armed to Remove, but that route sends
`RemoveObject` and cancels the order inside its handler, so it produces this
command not at all — and it reaches object orders only, because
`orderBuildingObjectAt` walks the orders whose buildable declares a
`placesObjectId`.

So the missing piece was never a button. It was that **no order id reached the
main thread at all.** `src/simulation/protocol/commands.ts` said so in terms,
while arguing that `RemoveObject` carries a tile: an order id is something
*"nothing on screen shows and no snapshot carries"*. Verified on the pre-change
tree: no member of `PROJECTION_IDS` named construction, `status-counts.ts`
mentioned no order, and the only readers of
`ConstructionSystem.allOrders`/`getOrder` outside that directory were inside
`src/simulation/objects/object-placement-service.ts`.

### What #348 changed

`ConstructionSystem.update` now advances **one order at a time**: it reads
`crewBusy` once before the walk and an `assigned` order that finds the crew busy
waits. Before it, every `assigned` order started on the tick it was assigned and
every `in-progress` order advanced on every scheduled tick.

Measured, not asserted — the arithmetic is fixed by three numbers that are not
this document's to choose (`wall-brick` needs `workRequired: 50`, `in-progress`
advances `+10`, and the system's schedule is `intervalTicks: 10, phaseTicks: 0`):

| queue | first wall finishes | last wall finishes |
| --- | --- | --- |
| 1 wall | tick 70 | tick 70 |
| 12 walls (`tests/unit/construction-geometry.test.ts`) | tick 70 | tick **730** |

`tests/unit/construction-crew-capacity.test.ts` pins the per-wall cost at
**+60**: one scheduled tick to take the crew and five to work.

That is the whole difference. A queue stopped being a flicker and became a
long-lived thing a player waits on — and *nothing on screen said one existed*.
Not the length, not which order the crew was on, not that eleven of twelve
segments had not started. So this ADR answers two questions at once, and the
first is the one that makes the second worth answering.

### One consequence a player meets, stated up front

An order id is minted at the composition root as
`order-${crypto.randomUUID()}`, and `ConstructionSystem` orders orders by
**ascending id** — which is not cosmetic, because that walk is what decides
which order takes the crew. So within one dragged run the build sequence is
*not* the order the run was drawn in. The sequence is real; it is simply not the
player's gesture replayed. Decision 4 is what follows from that.

---

## Decision

### 1. The pending queue becomes a projected read model, not a copy on the main thread

A new projection, `hud/build-queue`, over
`src/simulation/presentation/construction-projection.ts`, catalogued in
`src/simulation/worker/projection-catalog.ts` and read through
`simulation/request-projection`.

**A pull, not a publication**, for the two reasons `hud/room-list` is one: a
queue is `O(orders)` to walk and nobody reads it from the Rooms tab. It rides
the `simulation/status-counts` cadence rather than a timer of its own, because
an order finishing changes the queue and moves no figure on the status strip.

**Rejected: the main thread remembering the orders it submitted.** It already
mints the ids, so this needs no simulation change at all — and it is exactly the
second, drifting authority `AGENTS.md` boundary 1 forbids. The host would not
learn that an order had completed, failed, or been undone, so the list would
name walls that were built minutes ago, and every row would be a control aimed
at an order that no longer exists.

**Rejected: publishing the queue on the counts channel.** A queue has no
ceiling — a drag along thirty tiles is thirty orders — and the counts channel
carries a fixed set of scalars up to twice a second whether a panel is open or
not.

### 2. Aiming is per-order and per-id, and `Undo` keeps the gesture

One row per pending order; pressing a row's Cancel dispatches
`{ kind: 'cancel-build-order', orderId }`, which `src/main.ts` turns into
`CancelBuildOrder`. It is the only construction dispatch in that file that mints
no identifier: the id came out of the simulation and goes back unchanged.

The two controls divide the work, and the division is the answer to "why is this
not a second undo button":

| the player means | the control | what it names |
| --- | --- | --- |
| "not that wall" | a queue row | one order, by id, anywhere in the queue |
| "not that whole run" | `Undo` (`KeyZ`) | the last transaction, whatever it covered |

**No pre-check on the main thread.** Whether an order still exists is not
something this thread may decide: the queue on screen is a snapshot on a
cadence, so an order can finish between the publication and the press. The
simulation decides, and `createConstructionCommandHandler` is deliberately
idempotent about an id that names nothing. This is the opposite of
`purchase-materials`, which *does* pre-check, because "the balance I was last
told about cannot cover this" is a refusal this thread can make honestly.

### 3. The block is `hidden` while nothing is queued, collapsed when it appears, and the catalogue pays for the 45px

The panel's always-visible budget is the tightest in the interface. Measured at
900x600, Build tab, one prison saved, coordinates folded — the state a player
arrives in — the body holds 291.2px of content in a 291.2px box and there is
**7.8px** between the last section's bottom edge and the fold (`buyToggle`'s
comment in `src/ui/hud/build-panel.ts` records the measurement and #174 closed
the overflow it is a budget against). A collapsed `.ui-section` is 45px. So an
always-drawn block was never affordable, at any size.

Two rules follow:

- **No box until something is queued.** An empty queue is the arrival state, so
  the panel's arrival height is unchanged from what #174 left. Measured at
  1440x900, 1280x800, 1280x720, 1024x768, 900x600 and 375x812: the section is
  not laid out, the panel's overflow is 0, and its last visible section is still
  "Enter coordinates".
- **Collapsed when it appears**, so a queue costs a 1px border and a 44px
  header rather than a list.

**That was not enough, and the measurement that says so is the most important
one in this document.** Both rules above were measured through
`tests/browser/ui-harness.html`, whose aside slot is empty — so
`.hud__aside:empty { display: none }` fires and the Build panel gets the whole
rail, 128.7px more than the application ever gives it. On the **assembled page**,
where the rail also holds the save panel, a queue with the block *collapsed* put
the panel over its box and the block's own header below the panel's unscrolled
fold:

| viewport | panel overflow, collapsed | queue header vs fold |
| --- | --- | --- |
| 1280x720 | 15px | **14px below** |
| 900x600 | 37px | **37px below** |
| 1440x900 / 1024x768 / 375x812 | 0 | above |

That is issue #174 for a third time, and on a control rather than a readout: a
player who queued six walls would have been told so by a header they could not
see, with the cancel controls behind it and nothing saying the panel scrolls.

**So the 45px is paid for, out of the one block this panel is allowed to take
height from.** `--hud-build-catalogue-floor` drops from two rows to one while a
queue exists (`.hud-build[data-queued]` in `hud.css`); the catalogue list becomes
the scroll container it already is at twelve entries, and the panel fits. It is a
*floor*, so it donates nothing where nothing is needed — a flex item shrinks only
under pressure. Re-measured on the assembled page with six queued: `panelScrolls`
false, `panelScrollTop` 0 and the header above the fold at **all five**
viewports, with the list absorbing 111px, 0px, 75px, 132px and 66px respectively.
The 0 is 1440x900, where the catalogue keeps both rows because nothing had to be
donated.

This is deliberately **against that token's own stated argument** — two rows
because "one row plus a scrollbar is not a list you can choose from". That
reasoning is right about the state it was written for, the panel's default, where
choosing what to build is its whole job. A panel with a queue has a second job.
Between a two-row catalogue and a reachable queue, at the two viewports where
they do not both fit, this decides for the queue — and a player who wants the
list back finishes or cancels the queue. The Rooms panel already ships a one-row
floor, so a scrolling one-row catalogue is a state this interface has rather than
one invented here.

Opened, the rows put the panel between 22px and 157px into overflow depending on
the viewport, and opening scrolls the section into view — which is the buy row's
own behaviour (`paintBuy`) and legitimate for the same reason: the player opened
it. `hud.css` already documents the expanded numeric fallback and the open buy
row as the two states where this panel legitimately scrolls; this is the third,
with the same argument. Measured on the assembled page after that scroll, every
Cancel is 78x44, hit-tests to itself, and sits inside the panel's visible box at
all five viewports.

`tests/browser/ui-build-queue.spec.ts` measures the panel in isolation and
`tests/browser/app-shell.spec.ts`'s #88 sweep measures it assembled — the second
is the one that can see this class of defect at all. Both measure **boxes and
`offsetParent`**, never `toContainText`. That is #220's lesson, applied to a
control rather than a message: #220 found a row that was `offsetParent === null`
with a 0x0 box at *every* viewport while a rendered-text assertion passed.

### 4. A long queue shows its head, counts its tail, and offers no way to page into it

The block draws at most `BUILD_QUEUE_ROW_LIMIT` rows — **three** — and
`src/ui/simulation-build-queue.ts` asks the projection for exactly that window
rather than the projection's default hundred. The header states the whole
queue's length and how much of it is moving; `hud.build.queue-more` states how
many orders are behind the last row.

**There is deliberately no stepper, and this is the decision most open to being
overruled.** The argument: since #348 the list is the crew's *schedule*, and
ascending id is the order the crew works it in. Row one is being built; rows two
and three are next. An order thirteenth in line will not be touched for another
six hundred ticks, so it is not one a player needs to reach — and the request
"I have changed my mind about that whole run" already has a control, which is
`Undo`. The sentence under the rows says so, so the absence is stated to the
player rather than left as a gap.

What that costs, stated plainly: a player who wants the wall at one particular
tile, and whose order for it happens to sort thirteenth, cannot reach it from
this block. They can undo the run, or wait for it to come into view. If that
proves to be the common case rather than the rare one, the fix is a window
offset — the projection is already paged and `MAX_PROJECTION_PAGE_LIMIT` already
bounds it, so it is one chrome intent and one control, not a redesign.

**Rejected: rows created per order.** Beyond the height, the HUD's busy group
(`createBusyGroup`) has `add` and no `remove`, so a block that built a row per
order would grow that group without bound over a session and keep every dead
button in it. The three rows are pooled and repainted, and each cancel reads its
order id **at press time** rather than capturing it at construction.

### 5. The queue names orders, not labels; the label crosses two boundaries

The projection emits `definitionId` — a stable content id — and no name. What a
buildable is *called* is `buildableLabelKey`'s answer in `src/main.ts`, because
the buildable registry carries a hard-coded English `name` and no key at all
(`docs/HUD_PROJECTIONS.md` gap 32) and an object-placing buildable is named by
its object's own `nameKey` instead.

Neither side of the boundary may hold it: the projection may not emit translated
text (ADR 0011) and the HUD may not read the buildable registry (`AGENTS.md`
boundary 1). So the lookup is injected into the reader as a function from the
one place that legitimately knows.

A row whose buildable the host cannot name **keeps its place**, which is the
opposite of `roomNeedsFromProjections` (that skips a room the catalogue cannot
name). The difference is what the row is for: a nameless room need is a sentence
with a hole in it, and a nameless build order is still an order a player may
want to cancel — dropping it would hide the only control that reaches it.

### 6. What a row says it is waiting for reuses the enum labels that already existed

`build-order-state` in `src/content/simulation-message-keys.ts` already labelled
all eight members of `BuildOrderLifecycleState`, and **nothing rendered any of
them** — no projection emitted an order state. `PENDING_BUILD_ORDER_STATES` is
therefore exempted from that table rather than given a group of its own: a
second namespace would author a second English word for the same five facts.

One label changes as a consequence, and it is a correction rather than a
preference. `assigned` read "Assigned", which names what the simulation did to
the order; an `assigned` order has its materials and is waiting for the crew,
and since #348 that is the state a queue of eleven walls spends its whole wait
in. It now reads **"Awaiting the Crew"**, which is the same choice
`materials-pending` already made with "Awaiting Materials". The stable id is
untouched — it is persisted in `save-schema.ts`, and a label is not an id
(ADR 0011).

This is the part of the surface with the most player value per pixel: the five
words are five different answers to "why has nothing happened to my wall", and
two of them are acted on differently — one is fixed by buying brick and one by
waiting.

---

## Alternatives considered

- **Retire the command instead.** A real option, and the sixth review that
  raised this said as much: if arbitrary per-order cancellation is not wanted,
  the half-surface should go rather than sit accounted-for indefinitely. It is
  rejected because #348 answered the question the other way. Before #348 the
  queue was a flicker and "cancel the third one" was hypothetical; after it,
  eleven of twelve walls wait for hundreds of ticks and there is no other way to
  reach one of them. Retiring it would also have been a larger deletion than it
  looks: the schema member, the `commandJson` case, the handler branch and the
  gate's entry, with `ConstructionSystem.cancelOrder` staying because `undo()`
  delegates to it.
- **Extend the Remove gesture to wall orders.** The player presses the edge and
  the world finds the order. Rejected on scope and on shape: it would send
  `RemoveObject` (so `CancelBuildOrder` would still have no producer), it needs
  a tile-to-order index for edges, and a map gesture cannot show *sequence* —
  which is the thing #348 made worth showing.
- **A progress figure per row.** Rejected: `BuildOrder.progress` is a work
  counter against the definition's `workRequired`, and the only thing a player
  can act on is which order the crew is on, which `state` already says exactly.
- **An always-visible one-line queue readout, with the rows behind it.** This is
  what the Rooms panel's needs block does. Rejected here because that block is
  two lines of *text* and this one needs a tap target per order; the header of a
  collapsed section is already that one line, and it costs the same 45px whether
  the rows are behind it or not.

---

## Consequences

- `tests/foundation/unconsumed-command-contract.test.ts` moves to **eleven
  produced and none unproduced**, and its `AWAITING_PRODUCER` list is empty for
  the first time. That is not a state to defend: a twelfth command added with no
  producer belongs on that list with a reason, and fails the count until it is
  either wired or written down.
- `PROJECTION_IDS` gains a thirteenth member and
  `tests/foundation/projection-reachability-contract.test.ts` gains a second
  painter. That gate's ratio moves from ten-of-twelve to ten-of-thirteen
  catalogued read models with a route and no reader.
- The argument in `src/simulation/protocol/commands.ts` for `RemoveObject`
  carrying a tile loses half its premise — an order id *is* on screen now — and
  keeps its conclusion, because a standing object's order has left the queue and
  a restored object's order is not in the session at all. That comment is
  corrected in the implementing change rather than left to be discovered.
- Anything that later wants to reach past the head of the queue has the paging
  it needs already: the projection takes `offset`/`limit` and the protocol caps
  the window at `MAX_PROJECTION_PAGE_LIMIT`.
- The Build panel's catalogue shows one row instead of two, and scrolls, at
  1280x720 and 900x600 **while a queue exists**. `BUILDABLE_REGISTRY` has two
  entries today, so that is one of two hidden behind a scroll; a third buildable
  makes it two of three, which does not change the trade but does make it more
  visible. — *Both counts in this bullet are wrong; see the amendment at the foot
  of this document.*
- Three assertions in `tests/browser/app-shell.spec.ts` reached the numeric
  fallback's header as "the panel's last `.ui-section`" and now name it
  (`.hud-build__coordinates`), because the queue block is appended after it. The
  same file's #174 fold assertion gained a second half: whichever section is last
  *and visible* must be above the fold, which is the assertion that would have
  caught the defect in decision 3.

## Open questions

1. **Is decision 4's ceiling right?** Three rows and no stepper is an argument
   about what a player needs to reach, not a measurement. The measurement says
   three fits; whether the tail should be reachable is the owner's call, and the
   cost of changing the answer is one chrome intent and one control.
2. **Is a single-tap Cancel the right destructiveness?** Nothing confirms. The
   precedent is the Remove gesture, where pressing a tile takes an object away
   with no confirm, and a cancellation is cheap to undo by re-placing the order.
   A confirm step would cost this panel height it does not have.
3. **Should the block appear on the world as well as in the panel?** A queued
   wall is drawn as a planned edge, and nothing marks *which* pending order the
   crew is on. That is a rendering question and is deliberately not answered
   here.
4. **Is the catalogue the right donor?** Decision 3 takes 45px from it because it
   is the only block `hud.css` designates as shrinkable, and the alternative
   measured was a control below the fold. The other candidates were each measured
   too small — the placement readout is 20px, the arm hint one clamped line at
   these viewports, and the map block's four gutters are already at `--space-1`
   there — so nothing else in the panel can pay. If the answer is that the
   catalogue may not shrink, then the honest consequence is that this surface does
   not fit the right rail at 900x600 and belongs somewhere else, which is a larger
   question than this ADR.

---

## Amendment — 2026-08-26: the catalogue's donation is three rows of four, not one of two

**Everything above this line is unchanged**, and every measurement in it
reproduces on `main` at v0.0.88 — including the table in decision 3, which was
re-run for this amendment and matched to the pixel (111px, 0px, 75px, 132px and
66px absorbed by the list, at the five viewports in that order). One sentence in
*Consequences* does not: the two entries it attributes to `BUILDABLE_REGISTRY`.

### What was wrong

`BUILDABLE_REGISTRY` has held **four** entries since ADR 0028 phase 2 — a wall,
a door, a bed and a toilet. A catalogue row is 44px, so the list holds **176px**
of rows rather than 88px. Decision 3's own table already implied it and was read
past: a list that donates 132px cannot be two 44px rows.

Measured on the assembled page with six queued, list box against list content:

| viewport | list box / content | rows a player can see |
| --- | --- | --- |
| 1280x720 | 65 / 176 | 1 and part of a second |
| 1440x900 | 176 / 176 | all four |
| 1024x768 | 101 / 176 | 2 and part of a third |
| 900x600 | 44 / 176 | **1 of 4** |
| 375x812 | 110 / 176 | 2 and part of a third |

So while a queue exists the catalogue scrolls at **four** of the five viewports
rather than at the two the bullet named, and at 900x600 three of the four
buildables are behind that scroll rather than one of two.

### What this does and does not change

**The trade decision 3 makes is unchanged.** It weighed a reachable queue
against a scrolling catalogue and chose the queue; that argument does not turn
on whether one row or three is hidden, and the alternatives it measured — the
placement readout at 20px, the arm hint already clamped, the map block's gutters
already at `--space-1` — are all still too small to pay instead.

**The price is larger than the ADR stated**, which is exactly what open question
4 ("is the catalogue the right donor?") is for. It is now a question with a
number: at 900x600, with a queue, choosing what to build means scrolling a list
that shows one of four options.

**Decision 3's first bullet is unaffected, and is now measured where it can be
seen.** With nothing queued the list never drops below its two-row floor (two of
four visible at 900x600, all four at 1440x900), the block is not laid out, and
the panel arrives with "Enter coordinates" 7.8px inside its own fold. That claim
was measured only through `tests/browser/ui-harness.html`, whose aside slot is
empty — the surface #174 proved cannot see rail contention at all. It is now
asserted on the assembled page as well, at all five viewports, by "the Build
panel arrives inside its own fold, with nothing queued" in
`tests/browser/app-shell.spec.ts`. That test exists because the #88 sweep, which
was the only assembled-page measurement of this panel, now queues six orders
before its viewport loop and therefore no longer measures the arrival state at
all.

---

## Amendment — 2026-09-11: decision 4's "row count is the price" step is
withdrawn; the row limit is 64 and the fold still arrives shut (#862)

**Decision 3 and its box measurements are untouched.** The catalogue is still
the only donor, it still gives up nothing more than it did, and the panel's
arrival state — nothing queued, coordinates folded — is unchanged to the pixel.
What this amendment corrects is decision 4's own step from a height budget to a
*row count*, which issue #862 measured as false: with fourteen orders queued, at
every viewport the browser suite visits, opening the fold reached three of
fourteen and the other eleven had no row in the DOM at all — not a row below the
fold, no row. `Undo` is not the substitute decision 4 offered for them: it pops
the whole transaction the run was drawn in, so getting one of fourteen back
costs all fourteen.

### What was wrong, and what it conflated

Decision 4 said the block "draws at most `BUILD_QUEUE_ROW_LIMIT` rows —
**three**" and argued the *number of rows* from the panel's height budget. Those
are two different things pinned to one constant: what a list costs a flex-column
panel is its **box**, not how many rows sit inside it, and a box can hold more
rows than it shows if the box itself scrolls. `.hud-build__list` — the catalogue
one section up in this same panel — has always done exactly that, and this ADR
already relies on it (decision 3's own "the catalogue scrolls" language). The
queue list never had the same treatment; `BUILD_QUEUE_ROW_LIMIT` bounded both the
box and the pool at once, so raising the pool looked like it required raising the
box.

### What changed

`BUILD_QUEUE_ROW_LIMIT` is now **64** (`src/ui/hud/build-panel.ts:740`) —
**this read `:737` when it landed, which was wrong by three lines and is
corrected here rather than quietly**: the declaration was opened at the end
of the window and read 740, and a citation computed instead of opened is the
one thing `docs/adr/STATUS-QUEUE.md`'s header forbids by name. It shipped
through an integration pass that did not re-open it, and the next anchor's
delta read is what found it —
`MAX_RUN_SEGMENTS` (`src/rendering/build/edge-picking.ts:46`), the longest run one
drag can place, so the pool holds a row for every order one gesture can produce.
`.hud-build__queue-list` (`src/ui/hud/hud.css:2210`) now carries its own
`max-height: calc(var(--tap-target) * 3 + var(--hud-build-map-gutter) * 2)` with
`overflow-y: auto` and `flex: 0 0 auto` — the box stays exactly the height three
rows already measured at, at every viewport, to the pixel, and rows past the
third are reached by scrolling that box rather than by not existing. The pool
itself is now built **on demand** (`ensureQueueRows`, same file) rather than up
front, because an eagerly-built 64-row pool would have put fifty-eight never-laid-out
`Cancel` buttons on `app-shell.spec.ts`'s #88 sweep's exempt list, which is a
different thing from a genuine exemption. `tests/browser/ui-build-queue-reach.spec.ts`
is the gate: fourteen orders, all six viewports, every row's cancel measured with
an `offsetParent`, a real tap-target box, a centre inside the panel's *visible*
box after its own list is scrolled to it, and a hit test that resolves to the
button itself.

**"There is deliberately no stepper, and this is the decision most open to being
overruled"** — decision 4's own words — **is the sentence #862 overrules, on the
trigger decision 4 itself named**: *"If that proves to be the common case rather
than the rare one."* A batch is the common case; it is what one drag produces,
and #348 (this same ADR's own decision 4) is why the batch then sits queued for
hundreds of ticks rather than finishing before a player can look at it. The fix
taken is not the window-offset stepper decision 4 sketched as the fallback — a
scrollable, on-demand pool reaches every order in one gesture's worth without a
second control, and 64 already covers what one gesture can produce.

### What is unchanged

**The fold still arrives collapsed.** Arriving open was measured and reverted:
in the UI harness, with fourteen queued, an open arrival put the panel's own
overflow at 0 at five of the six viewports by shrinking the catalogue's list from
245px of 924px of rows to 89px — two rows of twenty-one — and at 12px over its
box at 900x600 with nothing having scrolled, where the catalogue is already flat
on its one-row floor with nothing left to give. Open question 4 is what this
promotion to blocking is about, and an arrival that spends the same donor a
second time is the thing this document's Status section already refused. So one
press on the header is still required to see any row at all; what changed is
that the press now reaches every order rather than three of them. Whether the
fold should also default open is a trade between two player-visible surfaces —
a two-row catalogue against a queue the player never has to open — and it is not
this amendment's to make; the figures above are recorded so whoever takes that
question next does not have to remeasure them.

**Open question 4 is not reopened and not closed.** This change spends nothing
further from the catalogue; it only stops a *second* constant (the row pool)
from riding on the first (the box height) now that the two are pulled apart.
