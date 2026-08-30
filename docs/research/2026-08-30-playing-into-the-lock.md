# Playtest: what the player sees on the way into ADR 0075's lock, what happens at the bottom, and whether an ambitious build gets there

**Date:** 2026-08-30
**Branch measured:** `agent/675-play-into-the-lock`, cut from `main` at
`v0.0.257`, which carries [#640](https://github.com/matmaxalez/lockstate/pull/640)
(a build order buys its own materials at the press) and
[#655](https://github.com/matmaxalez/lockstate/pull/655) (the shared harness's
`waitForQueueEmpty` regex).
**Reproduction:** `tests/browser/playtest-into-the-lock.playtest.ts`, run with
`LOCKSTATE_BROWSER_TEST_PORT=5190 ./node_modules/.bin/playwright test -c tests/browser/playwright.playtest.config.ts tests/browser/playtest-into-the-lock.playtest.ts`.
Nothing in CI collects `.playtest.ts`.

**Four runs, what each was of, and which two are the pair.**

| run | acts | result | what it added, or what it cost |
| --- | --- | --- | --- |
| 1 | act 3 only | `1 passed (2.7m)` | the first ambitious-wing cost; **refuted this file's own first instrument** (§0) |
| 2 | acts 3, 4 | abandoned | showed that clamping the wing to the box the HUD leaves free measures the harness, not the game |
| **A** | all four | `1 failed, 2 passed (11.0m)` | the descent, escapes A and B, act 4's refund. Act 2 died at escape C on a locator click the HUD covers |
| **B** | all four | see §8 | the same file with escape C driven by `page.mouse`, and act 3 clamped to the owned world |

**A and B are the pair for the descent**, and their `DESCENT RESULT` lines are
identical character for character apart from the autosave generation id. Runs 1
and 2 are quoted only where they are the thing being corrected.

**The question, and what is deliberately not re-litigated.**
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§4 already measured the arithmetic of the wall route to the segment — 312
funded, the 313th refused, **40 left** — and already refuted issue
[#641](https://github.com/matmaxalez/lockstate/issues/641)'s *"a single
sustained drag reaches it"*: one drag is at most 20 segments, one screenful is
116, and reaching the floor took 24 drags. **Both reproduce here** (§1) and
neither is this pass's contribution. What this pass asks is what that record
left open: what the player is *told* on the way down, what a mouse can do at the
bottom, and whether ambition arrives there without aiming.

**Contention.** Run A was taken on a machine whose load average had fallen to
3.1 from the 8–14 of earlier in the day, with one other agent's `vitest` run
alongside (issue [#667](https://github.com/matmaxalez/lockstate/issues/667)).
**Every figure this document rests on is a tick, a treasury value or panel text
— all of which come from the simulation and are identical across runs — and not
a wall-clock millisecond.** Where a duration is quoted it is labelled and is not
part of any claim; §1 uses one such duration to *correct* a wall-clock figure in
an earlier record, and marks it as the weakest thing here.

**LFS.** `git lfs checkout` was run in the worktree before any browser work:
`file public/assets/actors/actor.guard.base.idle.png` → `PNG image data, 260 x
3104`. Nothing below is a claim about rendering, but a worktree that had skipped
it would have run green with no art and said nothing
(`docs/AGENT_WORKFLOW.md`, §2).

## Claim tiers

- **MEASURED** — produced by a run of the playtest, quoted from its output.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **UNKNOWN** — could not be established here.

Nothing below is tiered **FROM MEMORY**.

---

# Part C — which of ADR 0075's three accepted decisions would have caught this

ADR 0075 is `docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md`,
**Accepted, 2026-08-29**. It records three decisions and says the ordering is
the substance: *"decision 1 gets a prison its first bed and pays for growth
after that; decision 2 is what happens when the money runs out anyway; and
decision 3 is the way out of holding the wrong thing."* Taken against the wall
route, one of the three catches it, one does not, and one catches a different
prison from the one this route produces.

## Decision 1 — development grants at population thresholds: **no**, and the ADR says so itself

The decision is *"one-off per threshold, with the first threshold very low"*,
and it is paid **for population crossing a line**.

**A prison at the wall lock has no prisoners and cannot get one.** ADR 0075's
own "why it is terminal" gives the chain: state income is paid per occupied
place, an occupied place needs a standing `sleep-surface`, and both buildables
that place one are priced in `item.wood-plank`. So no threshold above zero can
ever be crossed from the locked state, and a threshold *at* zero is not a
threshold — it is the starting grant the ADR already names and declines to
treat as a mechanic: *"**The very low first threshold is a starting grant in
disguise, and this ADR says so rather than letting it pass.**"*

A starting grant of `G` does not remove the lock either. It moves it: the wall
route's floor is `floor((25,000 + G) / 80)` segments instead of
`floor(25,000 / 80)`, and one more drag arrives at the same place. The ADR
states this conclusion in its own terms, about a different route, and it holds
unchanged here:

> **So: the first threshold alone does not close the class.** It gets the
> prison started; the recurring pressure that the payroll route demonstrates is
> answered by decision 2's ladder and its loan, not by this.

## Decision 2 — the balance may go negative, and loans are the way out: **yes, and only this one**

This is the decision that dissolves the lock rather than moving it, and the
reason is a single sentence of the ADR's own:

> **Its precondition is named in ADR 0017's own text and is not met today.**
> `Treasury.spend` refuses rather than overdrawing
> (`src/simulation/economy/treasury.ts:111`), so there is no negative balance
> for a ladder to respond to. **Building this means changing that.**

Changing that *is* the remedy here. `Treasury.spend` is the whole of the lock:
**VERIFIED, read**, `src/simulation/economy/treasury.ts:111-116` is four lines,
`if (!this.canAfford(amountMinorUnits)) return false;`, and `canAfford` is
`amountMinorUnits <= this.balance`. With overdraw permitted, a balance of 40
buys a plank at 65 and lands at −25; a bed stands; a prisoner is admitted; the
income line starts; the loan is the instrument that keeps the hole
serviceable. Nothing else in the three decisions touches the refusal.

The ADR also says why the loan is not optional beside it, and the sentence is
about exactly the state this route reaches:

> **The loan is not a nice-to-have beside the ladder. It is what keeps
> decision 8 honest.** With no floor and no terminal state, a prison can reach
> a position from which recovery is arithmetically impossible … **a hard-lock
> again, only slower, and dressed as a mechanic.**

## Decision 3 — sell-back at a loss: **not as written**, because the wall route holds no stock to sell

Decision 3 is *"a command that converts **stock** back into money at a fraction
of the purchase price"*, and its justification names the prison it was written
against:

> **This is the general answer to "the money is in the wrong shape"**, which is
> what ECON-002 is underneath: **the 625-brick prison is not poor, it is
> illiquid.**

The 625-brick prison holds 625 bricks in a container. **The wall-drag prison
holds none.** **VERIFIED, read**:

- `ConstructionMaterialsProvider.tryAllocate` is *"all-or-nothing: either every
  requirement is satisfied and **consumed**"* (`src/simulation/construction/materials-provider.ts:3-8`).
- The just-in-time sink buys the **deficit** only —
  `const deficit = requirement.quantity - this.stock.availableOf(requirement.itemId) - inFlight;`
  (`src/simulation/economy/just-in-time-materials.ts:164`) — so it never
  over-buys and the container never accumulates.

Two bricks per segment are bought, delivered, allocated, consumed, and written
into the world's edge layers. So a `SellMaterials` over stock, dropped into this
prison, would find nothing to sell.

**It reaches this prison only through a demolition step that decision 3 does not
mention and the interface barely supports.** `ConstructionSystem.cancelOrder`
(`src/simulation/construction/system.ts:594-612`) reverses the geometry of a
`completed` order and then hands its materials back —
`this.materialsProvider.release(order.materialsAllocated)` — so bricks *can*
return to the container. What can aim that command is the measured part, and it
is Part B's subject.

**This is the sharpest thing the pass has to say about the ADR**: #640 did not
only make the lock reachable by a gesture, it moved the illiquidity from the
container into the world. Decision 3 was written for money in the wrong shape
*in a warehouse*; the wall route puts it in the wrong shape *in the map*.

---

# Part A — what the player sees between 25,000 and 40

## 0. The instrument this section needed, and the first one it tried

**MEASURED, and it is recorded because the first reading was useless in the
flattering direction.** The obvious probe — "does anything on the visible HUD
match a money word" — answers **true on the very first drag of a fresh session
and on every drag after it**, because two pieces of furniture are permanently on
screen:

```
[L1] BASELINE lines that already match a money word (furniture, present at every balance): ["Funds","Buy"]
```

`Funds` is the status strip's label beside the balance; `Buy` is the Build
panel's procurement disclosure toggle. Both are identical at 25,000 and at 40.
A probe that counts them cannot tell a warning from a wall, so the descent
captures the visible-line set at the moment the wall tool is armed and reports
only the lines that were **not** in it, discarding the bare-number line so that
the counter counting does not read as the game speaking.

## 1. The descent reproduces, to the segment — and the wall-clock figure beside it does not

**MEASURED.** The treasury falls by exactly 80 on every segment and the floor is
where [#641](https://github.com/matmaxalez/lockstate/issues/641) and
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§4 put it. Run A, three consecutive drags across the bottom:

```
[L1 +133.9s] drag 23 (column 20): +12 -> 301 segment(s); treasury=1880 ... fundsChip="1,880 FUNDS" tone=null; newOnScreen=["95%","Saved (generation gen-mtg4mnn9-5).","Queued","255 waiting · 1 being built"]
[L1 +139.2s] drag 24 (column 21): +12 -> 313 segment(s); treasury=920  ... fundsChip="920 FUNDS"   tone=null; newOnScreen=["99%","Saved (generation gen-mtg4mnn9-5).","Queued","265 waiting · 1 being built"]
[L1 +144.6s] drag 25 (column 22): +12 -> 325 segment(s); treasury=40   ... fundsChip="40 FUNDS"    tone=null; newOnScreen=["4%","The materials were not ordered — there are not enough funds.", ... ,"Waiting for 80 to buy materials."]
```

**312 funded, 40 left**: `25,000 − 40 = 24,960 = 312 × 80`, and the strip agreed
— `40 | FUNDS`.

**This pass's own segment number is 325 and the true one is 313, and the
difference is this file's instrument rather than the game.** Both the treasury
and the refusal band are read from worker publications
(`simulation/status-counts` is skipped entirely when the payload equals the last
one, `src/simulation/worker/status-counts.ts`), so a dump taken 150 ms after a
drag can answer from before it — visible above, where drag 24 reports 920 for a
prison that had already spent down to 40. §4's detector broke out of its loop
*inside* the run that crossed the line and got 313; this one samples after each
whole drag and attributed the same event to the next one. **313 is the number.**

**The 24-drag count reproduces; the "six and a half minutes" beside it does
not.** §4 records *"24 separate drags across rows **and** columns, six and a
half minutes of continuous dragging"*. Run A reached the same place in **25
order-producing drags** — the extra one is the sampling artifact above — and
took **145 seconds** from the first drag to the refusal, on a machine whose load
average had fallen to 3.1. §4's own runs were taken with other agents holding
browser suites throughout, and that record says so and says which of its figures
are ticks rather than milliseconds. So: **the gesture count is a property of the
game and reproduces; the duration was a property of the machine.** Marked in
both directions rather than replacing it, and it is this document's weakest
claim (§9).

## 2. Nothing warns them. The first sentence about money arrives *after* the money is gone

**MEASURED, and this is the answer to the brief's first question.**

Across every one of the 24 drags that spent the treasury from 25,000 down to
40, the set of lines newly on screen was:

- the in-game day's progress percentage (`4%`, `7%`, `10%` … `99%`),
- the autosave notice (`Saved (generation gen-mtg4l9ls-3).`),
- the Queued fold's header and its count (`Queued`, `129 waiting · 1 being built`).

**Nothing else. In particular, nothing about money at any balance.** The first
new sentence about money in the whole session:

```
[L1 +144.6s] THE FIRST NEW SENTENCE ABOUT MONEY arrived at segment 325, treasury 40:
  "The materials were not ordered — there are not enough funds. | Waiting for 80 to buy materials."
```

That is the **first press the prison could not pay for**. Every sentence the
game has about the state of the player's money arrives on the press *after* the
last one it could afford.

### 2a. The one number that is always there never changes its appearance

**MEASURED**, on every drag, at every balance: `tone=null`. The Funds chip reads
`25,000 FUNDS` at the top and `40 FUNDS` at the bottom and is drawn identically.

**VERIFIED, read**, and it is deliberate: `src/ui/hud/projection.ts:400-438`
builds the `funds` descriptor with `tone: undefined`, and `createStatChip`
deletes the attribute for `undefined` (`src/ui/primitives/stat-chip.ts:51`). The
comment beside it gives the reason, and half of that reason is sound and the
owner's — *"'Low on money' is a threshold, and a threshold is a balance
decision"*, which ADR 0017 decision 5 reserves to
[#29](https://github.com/matmaxalez/lockstate/issues/29).

**The other half had expired and is corrected on this branch.** It argued that
the slope ran the wrong way for a warning, because the state pays in once a day
while the treasury had no outgoing side at all. That was written on 2026-08-25
in `4f711d5` (#311) and was falsified twice: `916ac46` (#455) made wages
recurring, and `a87b0d3` (#640) made a wall order buy its own materials.
`git merge-base --is-ancestor 4f711d5 916ac46` holds, so the sentence predated
the first thing that falsified it rather than having been wrong when written.

**The class, not the instance.** The sibling assertion in
`tests/foundation/documentation-claims-contract.test.ts` already pinned the
*income* direction of exactly this claim, and its own docblock records that the
phrase had by then been written wrong twice. The outgoing direction was ungated.
Gating it found **two** sites, not one — the second is
`src/simulation/economy/income.ts`, whose 300-per-place payback arithmetic ends
in a clause written to expire and which had. Both are corrected in both
directions, and the gate is now the thing that keeps them corrected.

**What is *not* proposed here.** Nothing in this pass says the chip should have
a tone, and nothing here chooses a number. That is #29's.

### 2b. What the game *does* say, and where — corrected against `2026-08-30-a-wall-that-buys-itself.md` §3

That record, written from `agent/627-just-in-time-materials` at `61dbee8`,
reported: *"the shortfall figure exists on the wire and reaches no pixel … no
`src/ui/` module reads it … `HudBuildQueueViewModel` has exactly three
members."* **True of the tree it measured, and false of what merged.** Both
directions are kept.

**MEASURED on `main` at v0.0.257**, on the press that ran out:

```
shortfall line: {"present":true,"hidden":false,"laidOut":true,"text":"Waiting for 1,040 to buy materials."}
```

**VERIFIED, read**: `hud.build.queue-shortfall` is
*"Waiting for {total} to buy materials."* (`src/content/default-locale-en.ts:583`),
`queueShortfall` is appended to the panel body **after** `queueSection.element`
rather than inside it (`src/ui/hud/build-panel.ts:1520`) with the reason written
beside it — *"A player who never opens the fold still reads it"* — and it is
painted from `shown.materialsFunding.shortfallMinorUnits`
(`src/ui/hud/build-panel.ts:1698-1703`). `git log -S` puts both the string and
the wiring in `a87b0d3`, the merge of #640 itself: the gap was closed during
that pull request's own review, after the playtest that recorded it.

So at the bottom the player has two sentences and two numbers, both outside any
fold: **40** on the strip, and *"Waiting for 1,040 to buy materials."* under the
Build panel's queue. Nothing relates them, and the shortfall is the one that
moves as the queue is worked (§4).

---

# Part B — what happens at the lock, and what a mouse can do about it

ADR 0075 exhausted the escapes **through the command router**, and its table is
what makes *"there is no escape"* a claim rather than a list. This part
exhausts the escapes a player has a **mouse** for, which is a different
question and has a different answer in one place.

## 3. The state at the bottom, in full

**MEASURED**, run A, at the press that ran out:

```
counts: treasury=40 rooms=0 accommodation=0 prisoners=0 staff=0 wageBill=0 unpaid=0
strip:  ... | 0 | PRISONERS | 0 | STAFF | ... | 0 | ROOMS | ... | 40 | FUNDS | 0 | EARNED TODAY | DAY | 2 | Through the day | 4% | ...
funds chip: {"present":true,"text":"40 FUNDS","tone":null,"badge":null}
queue fold: {"present":true,"hidden":false,"collapsed":"true","headerText":"QUEUED 287 waiting · 1 being built"}
shortfall line: {"present":true,"hidden":false,"laidOut":true,"text":"Waiting for 1,040 to buy materials."}
refusal band: hidden=false text="The materials were not ordered — there are not enough funds."
```

40 in the bank, a plank costs 65, nothing is standing that a plank paid for, and
there are no prisoners and no staff — so neither income line nor payroll can
move the number. That is ADR 0075's closed state, reached by dragging.

## 4. Escape A — wait: the treasury does not move, and the sentence does not change

**MEASURED.** Three minutes with nothing pressed, sampled every three seconds:

```
[L1 +147.0s]   ESCAPE A (wait) t+458ms:    header="QUEUED 287 waiting · 1 being built" treasury=40 band="The materials were not ordered — there are not enough funds." shortfall="Waiting for 1,040 to buy materials."
[L1 +329.7s] ESCAPE A RESULT: waited 180 s with nothing pressed; treasury 40 -> 40
```

The queue drained from 287 to about 240 while it ran — **the prison visibly
builds itself for three minutes while the band says there is not enough money**,
which is the shape §3 of the earlier record already reported and which
reproduces on `main`.

**The queue draining is also the proof that the container is empty.** The order
that cannot be funded never starts, and it needs two bricks; if there were two
spare bricks anywhere in the prison it would have taken them
(`tryAllocate` is checked on every scheduled construction tick). So the
315-segment prison holds **0 bricks** and **312 walls**, which is what Part C's
reading of decision 3 turns on.

## 5. Escape B — the Queued fold: three rows, and no money comes back

**MEASURED.** The fold is **collapsed on arrival** (`collapsed="true"`), and
opened it reads, verbatim:

```
[L1 +333.6s] ESCAPE B: fold open reads "QUEUED | 224 waiting · 0 being built |
  Brick wall · 22, 19 · West | Awaiting Materials | Cancel |
  Brick wall · 22, 21 · West | Awaiting Materials | Cancel |
  Brick wall · 22, 10 · West | Awaiting Materials | Cancel |
  and 221 more behind these — undo takes back a whole run."; 3 cancellable row(s) laid out
```

**Three Cancel controls against 224 waiting orders**, which is
`BUILD_QUEUE_ROW_LIMIT = 3` (`src/ui/hud/build-panel.ts:545`) doing exactly what
it says. And every row reads *"Awaiting Materials"* — the order whose materials
will never be bought is spelled identically to the 223 whose materials are
already paid for.

**Twelve presses, and the balance does not move:**

```
[L1 +336.8s]   ESCAPE B press 1:  treasury=40 ... shortfall="Waiting for 1,040 to buy materials."
[L1 +343.8s]   ESCAPE B press 4:  treasury=40 ... shortfall="Waiting for 800 to buy materials."
[L1 +357.9s]   ESCAPE B press 10: treasury=40 ... shortfall="Waiting for 320 to buy materials."
[L1 +362.5s]   ESCAPE B press 12: treasury=40 ... shortfall="Waiting for 160 to buy materials."
[L1 +362.7s] ESCAPE B RESULT: 12 Cancel press(es); treasury 40 -> 40
```

**VERIFIED, read**, and this is why: `ConstructionSystem.cancelOrder`
(`src/simulation/construction/system.ts:594-612`) hands the order's materials
back to the container — `this.materialsProvider.release(order.materialsAllocated)`
— and touches the treasury nowhere. Money spent on a wall does not come back
as money at any point, by any route this command can take.

**What the presses *do* do is worth stating, because it is a genuinely good
behaviour and it is invisible.** The shortfall fell from 1,040 to 160 over the
twelve presses: each cancelled order released two bricks into the container, the
just-in-time pass netted them off demand
(`src/simulation/economy/just-in-time-materials.ts:164`), and an order that
could not be funded became one that could. **The queue heals itself, one
cancellation at a time, and the only sign of it is a number in a sentence about
waiting.**

## 6. Escape C — `Undo`: takes the wall back, keeps the money

**MEASURED**, run B, five presses:

```
[L1 +369.0s]   ESCAPE C undo 1: treasury=40 header="QUEUED 208 waiting · 1 being built" ...
[L1 +380.0s]   ESCAPE C undo 5: treasury=40 header="QUEUED 205 waiting · 1 being built" ...
[L1 +384.4s] ESCAPE C RESULT: five Undo presses; treasury 40 -> 40
```

Undo works — the queue falls — and the balance does not move, because
`undo()` delegates to the same `cancelOrder`
(`src/simulation/construction/system.ts:537-552`). **VERIFIED, read**:
`src/input/bindings.ts:64` binds `KeyZ` to `edit.undo` with no modifier, in the
`world` and `construction` contexts only, which is why the world has to hold
focus for it to mean anything.

**A harness correction, kept because it is a trap.** Run A lost the whole of
act 2 here. `page.locator('#game-root canvas').click()` fails Playwright's
actionability check — the strip, the rail and the tab bar are absolutely
positioned over the canvas, so the point it aims at is covered and the click
waits for a hit target that never frees. Every gesture in this file now goes
through `page.mouse`, as the shared harness's own `press` and `drag` already
did.

## 7. Escape D — the Remove tool cannot see a wall, and the one sentence about refunds is about objects

**MEASURED.** The hint under the Remove control, verbatim:

```
[L1 +386.7s] ESCAPE D: the Remove hint reads "Press any tile of an object to take it away. One still being built is cancelled and its materials come back; a finished one is not refunded."
```

Pressed on three tiles the descent had walled:

```
[L1 +388.2s]   ESCAPE D press at tile (12,12): commands=["RemoveObject"] band="The build order failed — that order already exists."
[L1 +389.6s]   ESCAPE D press at tile (13,12): commands=["RemoveObject"] band="Nothing was removed — there is no object on that tile, and none being built there."
[L1 +395.5s] ESCAPE D RESULT: three Remove presses on walled tiles; treasury 40 -> 40
```

*"there is no object on that tile"* — on a tile with a wall on it. That is
correct and deliberate: **VERIFIED, read**, `src/main.ts:1936` says so in as
many words — *"There is no wall removal behind this and the control does not
claim one … Taking a **wall** down is `Undo` for a finished one, and … a press
on its row for one that is still queued."*

**The consequence is the finding, not the refusal.** `hud.build.remove-hint`
(`src/content/default-locale-en.ts:529`) is the **only** shipped sentence that
tells a player what happens to materials when they take something back — *"its
materials come back; a finished one is not refunded"* — and it is attached to
the one tool that cannot touch a wall. A player who spent 24,960 on walls and
wants to know whether any of it is recoverable is reading a sentence about beds.

## 8. Escape E — buying a plank: refused, and the refusal says less than the code knows

**MEASURED.** The fold, opened, and the press:

```
[L1 +399.4s] ESCAPE E: the procurement fold, open, reads "QUANTITY | − | + | Buy 1 × Wood Plank · 65 | Arrives while the clock runs, into the stock a build draws from."
[L1 +399.8s] ESCAPE E: ON THE WAY reads ".hud-build__deliveries: not laid out"; 0 refundable row(s) laid out
[L1 +403.1s] ESCAPE E RESULT: bought 1 plank at 65 from 40; treasury -> 40; band="Nothing was bought — the purchase was refused and no money was spent."
```

The control names the price — `Buy 1 × Wood Plank · 65` — beside a strip
reading 40, which is the comparison
`BuildQueueMaterialsFundingViewModel` says it exists for, and it is a genuinely
good screen. **What the refusal says is the problem.**

`hud.refusal.purchase-materials` is *"Nothing was bought — the purchase was
refused and no money was spent."* (`src/content/default-locale-en.ts:796`). It
does not mention money, the price, the balance or the shortfall. **The exact
diagnosis exists and goes to the console:**

```
[console.warn] HUD action failed {"actionId":"purchase-materials","error":{"message":"The last reported balance of 40 cannot cover 65."}}
```

**VERIFIED, read**, `src/main.ts:2396-2399`: the main thread pre-checks
`total > viewModel.counts.treasuryMinorUnits` and throws with both numbers in
it, and the HUD's gated-action handler turns any throw into that one generic
sentence. The docblock above it explains why the pre-check exists and is right
— without it the press *"would be the exact failure #82 and #207 are about — a
button that reports success and does nothing"* — and names the other path:
*"The `throw` below and that alert row sit on opposite sides of `sender.submit`,
so a press produces exactly one of them and never both."*

**So the pre-check shadows the better sentence.** The worker's own refusal is
`purchase.insufficient-funds` — *"The materials were not ordered — there are not
enough funds."* — and it cannot fire on this press, because the throw happens
first. The player asking the game directly whether they can afford a plank is
the one player who is not told it is about money. **Reported, not fixed: the
remedy is a sentence, and copy is the owner's under `AGENTS.md`.** §10 carries
the proposal.

## 9. Escape F — placing a bed anyway: refused for a reason that is not money

**MEASURED.**

```
[L1 +408.5s] ESCAPE F: placing a bed produced ["PlaceObject"]; treasury 40 -> 40; accommodation=0; band="The object was not placed — it has to stand in a room you have zoned."; shortfall="Waiting for 80 to buy materials."
```

Correct, and worth recording because it changes what the player believes. At the
bottom of the treasury, the game's answer to *"put a bed here"* is a lesson
about zoning. Nothing on that screen suggests the bed was also unaffordable.

## 10. Escape G — running the clock: 5,100 ticks, and nothing moves

**MEASURED**, at ×4, past two in-game day boundaries — the cadence
`StateIncomeSystem` pays on and `PayrollSystem` bills on:

```
[L1 +411.4s] ESCAPE G: fast-forwarding from tick 7923; clock={"mode":"running","speed":4}
[L1 +475.1s] ESCAPE G RESULT: ran to tick 13023; treasury=40 accommodation=0 prisoners=0
```

`40 → 40`. With no occupied place there is nothing to be paid for and with no
staff there is nothing to bill, which is exactly ADR 0075's terminality
argument, observed rather than reasoned.

**So: seven escapes, six of them nothing.** Wait, cancel, undo, remove, buy,
place, run — the balance is 40 at the end of every one of them. The seventh is
§11, and it is the only place this pass found anything the ADR's table does not
have.

## 11. Escape H — the one that gives the money back, and the clock that takes it away again

**MEASURED, run B, and this is the finding this pass did not expect.**

`ProcurementSystem.cancel` is the only command in the fourteen-member union that
credits the treasury, and ADR 0075's escape table measures it **refusing** —
`cancel-purchase.not-pending` — because in that prison the delivery had landed.
A just-in-time purchase is a pending delivery for
`PROCUREMENT_DELIVERY_DELAY_TICKS = 100` ticks
(`src/content/procurement-catalog.ts:62`), which is five seconds at ×1 — **or
for ever, if the clock has never been started.** A new session's clock is
constructed `paused` and nothing on screen says so
([`2026-08-30-what-the-game-never-says.md`](./2026-08-30-what-the-game-never-says.md)
§1); act 4 therefore never presses Play.

**One wall run of fifteen segments, with the clock never touched:**

```
[L4 +36.1s] a 15-segment run with the clock stopped: treasury -> 23800 (1200 spent)
[L4 +40.2s] ON THE WAY, with the clock still stopped: "ON THE WAY | 15 bought · 1,200 back if cancelled |
   2 × Brick · 80 back | Cancel | 2 × Brick · 80 back | Cancel | 2 × Brick · 80 back | Cancel |
   and 12 more on the way — these arrive first, and the rest come into view as they land."; 3 row(s) laid out
[L4 +59.3s] ACT 4 RESULT: 12 delivery cancellation(s) with the clock stopped; treasury 23800 -> 24760 (recovered 960 of the 1200 spent)
```

**The money comes back.** Eighty a segment, in full, twelve times — and the fold
says so before you press: *"15 bought · 1,200 back if cancelled"*. This is a
real escape, it is the only one in the game, and ADR 0075's table does not have
it because its prison could not reach it.

**And then the clock takes it back.**

```
[L4 +59.9s] THE REFUND, ABOUT TO MEET THE CLOCK: treasury=24760, queue="QUEUED 15 waiting · 0 being built"
[L4 +68.7s] ACT 4 ADDENDUM: six seconds after pressing Play, treasury 24760 -> 23800 (960 taken back out); queue="QUEUED 15 waiting · 1 being built"
```

**Every minor unit, straight back out, on the first ticks after Play.**
**VERIFIED, read**, and it is not a defect in any single place:
`ConstructionSystem.update` calls `procureForPendingOrders` on **every**
scheduled construction tick (`src/simulation/construction/system.ts:852`), the
fifteen build orders are still queued and still want their bricks, and the
just-in-time sink dutifully buys them again. Each half is right on its own.

**So the refund is real and it is not an escape.** It only sticks if the player
also cancels the fifteen *orders* — three rows at a time, in a different fold,
under a different heading, with nothing anywhere connecting the two. **Nothing
in the interface says that.** The sentence the player is given is *"1,200 back
if cancelled"*, and after they cancel and start the clock they have 1,200 less
than that sentence promised.

**This is the sharpest thing in the pass, and it is not about the lock.** It is
about the one control that could have been a way out of it.

---

# Part D — whether an ambitious build gets there without trying

## 12. One prison wing is 121 wall segments and 9,680 — 39% of the treasury, with nothing said

**MEASURED**, and reproduced in three runs (1, A, B). A "wing" here is the shape
a player draws before furnishing anything: a rectangle filling the visible
world, a corridor down the middle of it, and cell partitions off the corridor —
about sixteen cells.

| run | wing 1 | treasury after | spent |
| --- | --- | --- | --- |
| 1 | 119 segments | 15,480 | 9,520 |
| A | 121 segments | 15,320 | 9,680 |
| B | 121 segments | 15,320 | 9,680 |

`tone=null` and `shortfall=""` on every single one of those drags.

## 13. Three wings is 68.8% of the way to the floor, and the game says nothing at any point

**MEASURED**, run B, three wings at three camera positions inside the owned
world:

```
[L3 +230.2s] WINGS: wing 1 +121 segment(s), treasury after 15320
[L3 +230.2s] WINGS: wing 2 +108 segment(s), treasury after 10120
[L3 +230.2s] WINGS: wing 3 +88 segment(s), treasury after 7880
[L3 +307.0s] ACT 3 SUMMARY: 317 wall segment(s) over three wings; 17200 spent of 25,000 (68.8%), 98 wall segment(s) still affordable, 120 bed(s) still affordable
```

**The honest reading, and it is not the one this pass set out to write.** Three
ambitious wings do **not** reach the lock. They reach 68.8% of it, with 7,880
left — which is 98 more wall segments or 120 beds. The wings overlapped
(`"The build order failed — that order already exists."` on many runs), so 317
ordered is 215 funded; a player drawing three *disjoint* wings would be at about
29,000 and would have hit the floor during the third. **This pass did not play
that, and the arrival is therefore arithmetic on a measured wing cost rather
than a played arrival.** See §16.

**What is played, and is enough for the brief's question:** a player doing
nothing unusual — no fencing, no repeated dragging over empty ground, three
recognisable prison outlines — spends **more than two thirds of everything they
will ever have** before placing a single bed, and the game does not remark on it
once. The Funds chip reads `7,880 FUNDS` in the same grey it read `25,000
FUNDS` in.

## 14. Two things that are FINE, with the evidence, so they are not re-checked

**14a. Changing your mind is free.** MEASURED in runs A and B, identically:

```
[L3 +265.7s] CHANGED THEIR MIND: 9 order(s) cancelled; treasury 7800 -> 7800
[L3 +305.5s] REDRAW RESULT: 9 segment(s) redrawn on virgin ground after 9 cancellation(s); treasury 7800 -> 7800, which is 0 for what would cost 720 at full price
```

Nine cancelled orders released eighteen bricks into the container; nine new
orders drawn somewhere else took them back out; **720 of wall was redrawn for
nothing.** ADR 0017 decision 7's *"holding is permitted, never required"* is
doing real work here, and a player who lays a perimeter in the wrong place is
not punished for moving it. This is good and it should not be traded away by
any remedy to the rest of this document.

**14b. The prison a player builds is nowhere near the cliff.**
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§1 measured a complete working prison — 24-segment perimeter, designation, bed,
toilet, two admissions, one guard — at **2,105 of 25,000**, and nothing here
disturbs that. The gap between 2,105 and 24,960 is the whole subject: it is
entirely made of wall the player drew and does not yet need.

## 15. One thing that is not about money at all, found on the way

**VERIFIED, read, and MEASURED as a side effect.** The whole owned world of a
new session is **32 x 32 tiles**: `src/simulation/runtime/new-session.ts:385-387`
is `new SparseWorld(32)` with a single chunk loaded and owned. Run A's act 3
panned east past it and drew sixteen consecutive runs onto ground that does not
exist, each answered *"The build order failed — that tile is outside the map."*

Two figures follow, and the second is the one worth keeping. The map holds
`32 x 32 x 2 = 2,048` tile edges. The opening treasury funds **312** of them —
**15%**. So the world is not what stops a player from spending everything on
wall; there is four and a half times more wall available than money.

Not filed as a defect: one owned chunk is ADR 0019's and #649's subject, and
`PurchaseParcel` has never existed
([`2026-08-30-two-subsystems-with-no-entrance.md`](./2026-08-30-two-subsystems-with-no-entrance.md)).
Recorded because the ratio is the honest scale of the wall route.

---

# Part E — what this proposes, what it changed, and what it does not know

## 16. The weakest claim, and what would change my mind

**The weakest claim is §13's arithmetic step**: that a player drawing three
*disjoint* ambitious wings arrives at the floor during the third. What is
measured is the cost of one wing (121 segments, 9,680, three times) and the
total of three overlapping ones (215 funded segments, 17,200, 68.8%). The step
from those to *"the third wing ends it"* is multiplication, not play.

**What would refute it**: a run that draws three non-overlapping wings inside
the 32 x 32 world and finishes with money left. **What would confirm it**: the
same run reaching `purchase.insufficient-funds` mid-wing. This pass did not do
either, because its camera pans put wings 2 and 3 partly over wing 1, and it
says so rather than rounding the number up.

**The second weakest is §1's wall-clock correction.** That the same descent took
145 s here and *"six and a half minutes"* there is two measurements on two
machines at two load averages, and neither record can say what a player's
machine does. What is solid is the **25 drags**, which is a property of the
gesture and reproduced identically in runs A and B. Read the duration as "not
six and a half minutes on an idle machine", not as a corrected constant.

**Not established at all (UNKNOWN):**

- Whether any *save/reload* path changes anything at the bottom. Not played.
- What happens to the wall route once a prison has staff, so payroll is also
  draining. §5 of the earlier record already named this gap and it is still open.
- Whether a player would in fact keep drawing after the first
  `"that tile is outside the map"`. Assumed no; not tested with a person.

## 17. What this pass changed, and why each was in scope

Two comment corrections and one gate, none of which is a balance number or a
player-facing string:

1. **`src/ui/hud/projection.ts`** — the comment that decides the Funds chip has
   no tone reasoned from an absolute the code contradicts (§2a). Corrected in
   both directions, with the commits that falsified it and the
   `git merge-base --is-ancestor` that orders them.
2. **`src/simulation/economy/income.ts`** — the same class, milder: a payback
   figure qualified with a clause written to expire, which had. Corrected the
   same way; the 300 rate is untouched and stays #29's.
3. **`tests/foundation/documentation-claims-contract.test.ts`** — a gate for the
   claim in the charge direction, mirroring the one that already existed for the
   credit direction. Red first, naming both sites; green after. It is what keeps
   1 and 2 corrected.

## 18. Proposals — each is copy or a number, and therefore the owner's

**Nothing below is implemented on this branch.** Every one needs either a
player-facing sentence or a balance value, and `AGENTS.md` reserves both.

1. **The refund the clock undoes (§11) is the one to fix first, and it may need
   no new copy at all.** The problem is not the sentence *"1,200 back if
   cancelled"* — that sentence is true when it is read. The problem is that
   cancelling a delivery leaves the order that will re-buy it. Options, cheapest
   first: (a) cancelling the last delivery for an order also cancels the order;
   (b) an order whose delivery the player cancelled stops asking, until touched
   again; (c) a sentence in the fold saying the order will re-order. **(a) and
   (b) are behaviour, not copy, and could be built under the mandate — but they
   change what a control does, and #640's author deliberately kept the two
   commands apart, so this is put up rather than taken.**
2. **The refusal on the Buy control should say what the console already says
   (§8).** `hud.refusal.purchase-materials` is generic; the pre-check that fires
   it holds both numbers. New copy, so the owner's. It is the smallest change in
   this document and it removes the only place where asking the game about money
   gets an answer that is not about money.
3. **Whether the Funds chip should change appearance, and at what balance
   (§2a), is #29's** and this pass does not propose a number. What it can
   report is that the number falls from 25,000 to 40 in twenty-five gestures
   with no change of any kind on screen.
4. **A wall order's price is not shown anywhere before the press.** The Buy
   control renders `Buy 1 × Wood Plank · 65`; the buildable list renders
   `Brick wall` and nothing else, and the arm hint says how to drag and not what
   it costs. This is the same gap
   [`2026-08-30-the-naive-route.md`](./2026-08-30-the-naive-route.md) §3 records
   for the two-bricks-a-wall requirement, one layer along: now that the drag
   spends money, the drag has a price and does not say it. Copy, so the owner's.

## 19. The standing directive, and the answer against it

The owner's directive is *"gra ma być łatwa przyjazna do grania, a nie jakieś
ukryte funkcje"* — easy and friendly to play, with no hidden mechanics.

Measured against it, the wall route is not a hidden mechanic; it is a **hidden
price**. Every individual piece is honest: the strip shows the balance, the
queue shows the shortfall when there is one, the fold shows the refund, the
refusals are true. What is hidden is the relationship between a gesture and its
cost — and the one place the game volunteers a number about money before it is
too late is inside the procurement fold, which is the exact fold
[#627](https://github.com/matmaxalez/lockstate/issues/627) exists so that the
player never has to find.

That is the same sentence
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§2b ends on, arrived at from the other direction, and it is now true of one more
thing: **the only way out of the lock is also in there.**
