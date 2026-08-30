# Playtest: the naive route — is *ordering* why a prison could not be built?

**2026-08-30.** Mouse-driven playtest in a real Chromium at 1440x900, driving
the assembled page (`index.html` + `src/main.ts`) through a `Worker` tee that
records every command sent and every reply received. The script is
`tests/browser/playtest-naive-route.playtest.ts` and it **is in this tree**,
collected by `tests/browser/playwright.playtest.config.ts`, which nothing in CI
runs.

Two runs, both pasted below:

- **Run A** on `origin/main` at `9c453be` (v0.0.227) — the whole naive route.
- **Run B** at `afbcd74`, which is that same `main` plus this file's own
  playtest and **nothing under `src/`** (`git diff --stat 9c453be afbcd74 --
  src/` is empty) — the naive *quantity*.

The brief was the owner's: *"znajdź bugi i błędy grając, bo ja nie mogłem
postawić więzienia itp grając sam"* — find defects by playing, because I could
not build a prison playing on my own.

## The question

[#569](https://github.com/matmaxalez/lockstate/issues/569) was filed, then
retracted by its author. What the retraction left standing is a single named
candidate, quoted verbatim:

> the best evidence-backed candidate is **ordering** — the informed route (buy
> bricks → run the clock → build walls → *then* zone) reaches `"rooms":1`, and
> nothing on screen states that order; a wall order placed with no bricks reads
> *"Awaiting Materials"* only inside a queue that is folded on arrival. That is
> a product question, it is **not** proven to be the cause.

Every playtest in this repository so far has walked the *informed* order,
because `buildAndPopulate` (`tests/browser/playtest-harness.ts`) hard-codes it:
buy sixty bricks, run the clock, lay four wall runs, wait for the queue, then
designate. This pass deliberately does not.

## Claim tiers

`docs/research/README.md` labels every claim. Everything below is **VERIFIED**,
meaning one of exactly two first-party things: a number or a sentence pasted
verbatim out of one of the two runs named above, or a `file:line` in this
repository that was opened and read. **SEARCH-SUMMARY and FROM MEMORY do not
occur.** Three **UNKNOWN**s are marked inline, each with what would settle it.

---

## 1. The answer: ordering is not the cause. The naive route reaches a prison

**VERIFIED, Run A.** The route played was, in order and with nothing skipped:

1. Zone a 6x6 Cell at (12,12)–(17,17) with nothing bought and nothing built.
2. Try to put a bed inside it.
3. Lay the whole 24-segment perimeter **with an empty stock**.
4. Run the clock at 4x for four observations.
5. *Then* buy sixty bricks.
6. Zone again.

It works. Pasted:

```
ACT 1d commands sent by Designate: [{"type":"ZoneRoom","roomId":"room.cell","x":12,"y":12,"width":6,"height":6}]
counts after the naive Designate: {"tick":0,...,"rooms":0,...,"treasuryMinorUnits":25000,...}

ACT 2c: 24 build orders placed against an empty stock
funds now: 25000

ACT 3a bought 60 bricks at tick 5300; funds now 22600
ACT 3b: the queue emptied at tick 7321 (bought at tick 5300)

ACT 4 designate attempt 1 at t+9454ms, tick 8118: rooms=1
ACT 4: zoned=true after 1 Designate press(es), 9642ms
final counts: {"tick":8017,...,"rooms":1,...,"treasuryMinorUnits":22600,...}
```

Three facts in that transcript each falsify a part of the ordering hypothesis:

- **A wall order placed with nothing in stock is accepted, not refused.** All
  twenty-four went in; the refusal band carried no complaint about them. It is
  a wait, not a rejection — `ConstructionSystem` leaves such an order in
  `materials-pending` and retries it on every scheduled tick
  (`src/simulation/construction/system.ts:718-725`, *"stays materials-pending,
  retried next scheduled tick"*).
- **Buying afterwards drains that wait.** The purchase landed at tick 5,300 and
  the queue was empty by tick 7,321 — 2,021 ticks, about 20 wall-clock seconds
  at 4x, with the player doing nothing.
- **The zone-first refusal costs nothing and is fully recoverable.** `ROOMS`
  went 0 → 1 on the **first** Designate press after the walls were up. Money
  was untouched by both the refused designation and the twenty-four orders:
  25,000 before, 25,000 after, and the only spend in the whole run was the
  2,400 for the bricks.

So the retraction's candidate is **eliminated as a cause**. Doing every step in
the wrong order costs a player one refused press, one refused bed and no money
at all, and the route out of it is the same route in.

**This is a complete result and it is deliberately not a defect.** It says the
owner's complaint needs a different explanation.

## 2. What a new player actually sees, verbatim

**VERIFIED, Run A**, printing `document.querySelector('.hud').innerText` whole
at every step — which is the instrumentation rule #569's retraction exists to
record: *"A survey that enumerates known regions cannot find a message in a
region it did not know about. Print the container, not the parts."*

### On arrival, before anything is pressed

```
0 PRISONERS | 0 STAFF | 0 COVERAGE Covered | 0 ROOMS | 0 INCIDENTS Clear |
0 CONTRABAND | 25,000 FUNDS | 0 EARNED TODAY | DAY 1 | Through the day 0%
MINIMAP / Collapse / MINIMAP IS NOT AVAILABLE YET
ALERTS
INTERFACE SCALE 100%
PRISONS / New prison / Save now / Export / Import / New Prison (1 gen) / Load / Delete
INTAKE / Collapse / Admit a prisoner /
"A prison needs a cell before it can admit anyone. It does not need a free bed:
 an arrival with none waits until a bed is free."
OVERVIEW BUILD ROOMS SECURITY REGIME
```

The one instruction on the arrival screen names a **cell**, which is a Rooms-tab
noun. Nothing on it names a wall, a brick or a purchase. `/wall/i`, `/brick/i`,
`/material/i`, `/stock/i` and `/buy/i` are all **false** against that whole
dump.

### The rectangle drawn, before Designate

```
"ROOMS\nCollapse\nROOM TYPE AND AREA\nStaff Room\n…\nCell\nSelected\n…\
 ENTER COORDINATES\nDesignate 6 × 6\nDiscard\nAREA\n6 × 6 tiles at 12, 12\n
 OPEN ON AT LEAST ONE SIDE\nNEEDS AT LEAST 2 × 3 TILES\nMUST BE ENCLOSED\n
 NEEDS 1 × BED\nNEEDS 1 × TOILET"
Designate disabled attribute: null
```

The control is live. That is deliberate and reasoned
(`src/ui/hud/rooms-panel.ts:1560-1567` — only `pendingIsTooSmall()` disables
it, *"a disabled control is a report and not the only guard either way"*).

### The refusal

```
--- .hud__refusal: {"hidden":false,"box":{"w":1440,"h":32,"x":0,"y":48},
    "text":"The room was not zoned — this room type must be enclosed, and the
             area you drew is open on at least one side."}
```

**#569's retraction holds, re-measured on `9c453be`**: the band is a full-width
32px strip under the status strip, not folded behind anything. It is the
`role="status"` band at `src/ui/hud/hud.ts:955`.

### And the panel that was explaining the rules folds itself

The same dump ends:

```
ROOMS
Expand
OVERVIEW BUILD ROOMS SECURITY REGIME
```

**This extends a finding rather than contradicting one.**
`2026-08-29-playtest-ordering-and-the-second-room.md` §10 measured this fold
after a designation **succeeds**. It happens after a **refusal** too, and for
the same documented reason: `folded()` is `drawingFolded` whenever the tool is
armed with nothing pending (`src/ui/hud/rooms-panel.ts:513`), and the press
clears the pending rectangle either way. The consequence is worth stating
plainly and is not a claim about cause: at the exact moment the player is told
the area is *"open on at least one side"*, the block that had just listed
`MUST BE ENCLOSED` beside three other requirements is shut.

### What the player plausibly tries next

```
ACT 1e a bed placed inside the un-zoned area sent:
  [{"type":"PlaceObject","definitionId":"bed-wooden","x":14,"y":14}]
--- .hud__refusal: "The object was not placed — it has to stand in a room you
                    have zoned."
```

Correct, immediate, and in the same band.

## 3. The one place the naive route *does* dead-end: the quantity

**This is the finding of the pass, and it is not the ordering.** It is that the
game never states **how much material anything needs**, and the obvious guess is
wrong by exactly a factor of two.

**VERIFIED, read.** `wall-brick` requires two bricks:
`materialsRequired: [{ itemId: 'item.brick', quantity: 2 }]`
(`src/simulation/construction/definition.ts:89`). A brick costs 40
(`src/content/procurement-catalog.ts:100`).

**VERIFIED, Run B.** Everything the panel offers about that, pasted:

```
the selected catalogue row, verbatim: "Brick wall\nSelected"
BUY disclosure, verbatim, before typing:
  "QUANTITY\n−\n+\nBuy 2 × Brick · 80\nArrives while the clock runs, into the
   stock a build draws from."
default quantity in the field: "2"
```

The `2` is content's own number and is deliberate — the stepper opens on
`quantityPerPlacement`, *"one wall's worth, derived from content rather than a
round number somebody picked"* (`src/ui/hud/view-model.ts:262-267`, set at
`src/ui/hud/build-panel.ts:1368-1370`, sourced at `src/main.ts:669`). **Nothing
on screen says that is what it is.** There is no unit label, no "per wall", and
no requirement line on the catalogue row.

### So the player guesses one brick per wall. Here is what that buys

Run B: buy **24** bricks for a **24**-segment perimeter, let the delivery land
first so nothing here is about ordering, lay the perimeter, and watch.

```
bought 24 bricks; funds now 24040
24 wall orders placed against 24 bricks
poll 0 at tick 3525: "QUEUED | 12 waiting · 0 being built"
poll 1 at tick 3839: "QUEUED | 12 waiting · 0 being built"
poll 2 at tick 4174: "QUEUED | 12 waiting · 0 being built"
poll 3 at tick 4506: "QUEUED | 12 waiting · 0 being built"
poll 4 at tick 4833: "QUEUED | 12 waiting · 0 being built"
poll 5 at tick 5174: "QUEUED | 12 waiting · 0 being built"
```

Exactly half the perimeter is built and the other half stops dead. It was still
`12 waiting · 0 being built` when the run intervened at tick **8,260** — about
**4,700 ticks, near two whole in-game days**, unchanged.

### What the whole screen says at that moment

```
24,040 FUNDS | 0 EARNED TODAY | DAY 3 | Through the day 19% | Speed 4x
…
BUILD / Collapse / WHAT TO BUILD / … / Brick wall Selected / … /
Stop placing / Remove / Buy / WHERE / Point at the world /
"Click a tile edge to place a wall. Drag along it to lay a run. …" /
QUANTITY − + / Buy 24 × Brick · 960 /
"Arrives while the clock runs, into the stock a build draws from." /
ENTER COORDINATES /
QUEUED
12 waiting · 0 being built
```

and the word survey against that same dump:

```
--- /material/i anywhere in the visible HUD? false
--- .hud-build__queue: {"present":true,"hidden":false,"collapsed":"true",
                        "headerText":"QUEUED 12 waiting · 0 being built",
                        "bodyHidden":true}
funds at the stall: 24040
```

Three things are true at once and each matters:

1. **The player is not broke.** 24,040 of the starting 25,000 is still there, so
   nothing on the money surface suggests the problem is money.
2. **The queue says the crew is idle, not that materials are short.**
   `{count} waiting · {started} being built`
   (`src/content/default-locale-en.ts:531`) renders `12 waiting · 0 being
   built`. "0 being built" is the true reading of a stalled crew and reads as
   *nothing is happening*, not as *something is missing*.
3. **The word "Materials" is nowhere on screen.** It exists — `'materials-pending':
   'Awaiting Materials'` (`src/content/simulation-message-keys.ts:472`) — but it
   is a per-row label **inside** a fold that starts shut
   (`src/ui/hud/build-panel.ts:1555-1561`: `collapsed: true`, *"a queue then
   costs this panel a header and a count, and costs it a list only when the
   player asks for one"*).

Run A measured that reachability directly, over 5,096 ticks with twenty-four
orders standing:

```
REACHABILITY: "Awaiting Materials" in the visible HUD while nothing is unfolded? false
REACHABILITY: queue fold state at this moment: {"present":true,"hidden":false,
              "collapsed":"true","headerText":"QUEUED 24 waiting · 0 being built",
              "bodyHidden":true}
…
REACHABILITY: "Awaiting Materials" once unfolded? true
.hud-build__queue verbatim: "QUEUED\n24 waiting · 0 being built\n
  Brick wall · 17, 12 · North\nAwaiting Materials\nCancel\n…"
```

**So the retraction's second sentence is exactly right, and it is right about
the wrong route.** *"A wall order placed with no bricks reads 'Awaiting
Materials' only inside a queue that is folded on arrival"* — true, measured, and
harmless where the retraction pointed it (the player who bought nothing recovers
by buying, §1). It bites where the retraction did not look: the player who
bought **something**, watched half a wall go up, and has no way to learn that
the other half is short.

### There is no second channel

**VERIFIED, read.** A stalled order raises no alert, and this is structural
rather than an omission to be found by looking harder: `REFUSAL_LABEL_KEYS`
(`src/ui/simulation-alerts.ts:33`) is a `Record` over the closed `RefusalReason`
union, and a `materials-pending` order **was not refused** — it was accepted.
There is no reason id for it to map.

**VERIFIED, Run B**, reading the Alerts fold at the stall:

```
ALERTS fold at the stall: {"listPresent":true,"sectionCollapsed":"true",
  "headerText":"ALERTS","headerAriaExpanded":"false","listChildCount":1,
  "listText":"Nothing was removed — there is no object on that tile, and none
              being built there.Warning"}
ALERTS unfolded by hand: {"sectionCollapsed":"false","listChildCount":1,
  "listText":"Nothing was removed — there is no object on that tile, and none
              being built there.Warning"}
```

The single entry is **this harness's own artifact** and not something a player
would have: `calibrate()` presses "Remove" on bare ground to measure the
screen-to-tile transform. For a real player that list is empty. The honest
reading is therefore that the silence is *worse* than the dump shows, not
better — and the same applies to the `.hud__refusal` band, which at the stall
was carrying that same calibration sentence and would otherwise have been
`hidden`.

### And leaving the Build tab removes even the count

**VERIFIED, Run B.** The player who is stuck goes to the Rooms tab to try
zoning. There:

```
zoning the half-built perimeter: rooms=0
--- .hud__refusal: "The room was not zoned — this room type must be enclosed,
                    and the area you drew is open on at least one side."
--- .hud-build__queue: {"present":true,"hidden":true,"collapsed":"true",
                        "headerText":"Queued","bodyHidden":true}
--- /wall/i anywhere in the visible HUD? false
--- /brick/i anywhere in the visible HUD? false
--- /material/i anywhere in the visible HUD? false
```

The queue block is emptied on leaving the tab, deliberately and for a stated
reason (`src/ui/hud/build-panel.ts:1869-1875`: *"a block left behind would be a
list of ids that were true when the player walked away"*). The consequence for
this player is that the **only** surviving trace of twelve unbuildable walls —
the folded count — is gone, and the sentence they are looking at says the area
is open, which is true and is not the thing they need to know.

### It is recoverable, once you know

**VERIFIED, Run B.** Buying the missing twenty-four bricks drains it:

```
bought 24 more bricks; funds now 23080
recovery poll 0 at tick 8260: "QUEUED | 9 waiting · 1 being built"
RECOVERY: the queue drained at tick 8853
RECOVERY: zoning after the second purchase: rooms=1
--- .hud__refusal: {"hidden":true,"box":{"w":0,"h":0,"x":0,"y":0},"text":""}
```

So this is a **stall a player cannot diagnose**, not a state a save cannot leave.
That distinction is the whole reason it is written here as a measurement handed
over rather than as a fix.

## 4. What the game never says, as a table

**VERIFIED, Runs A and B**, by regex against the whole visible `.hud` innerText
at each moment (`innerText` reflects layout, so anything inside a shut fold is
correctly absent from it).

| moment | `/wall/i` | `/material/i` | any stock figure |
| --- | --- | --- | --- |
| arrival, Overview, nothing pressed | false | false | none |
| Rooms tab, Cell selected, 6x6 pending | false | false | none |
| immediately after the refused Designate | false | false | none |
| Build tab, 24 orders standing, empty stock, tick 1,315 | true (tab + catalogue) | **false** | none |
| … the same at ticks 2,581 / 3,847 / 5,096 | true | **false** | none |
| queue unfolded by hand | true | **true** | none |
| Run B, stalled at 12 of 24 walls | true | **false** | none |
| Run B, Rooms tab with 12 walls short | false | false | none |

**No figure anywhere on any of these dumps states how much material the prison
holds.** The only occurrence of the word "stock" in the shipped locale is inside
the buy hint — *"Arrives while the clock runs, into the stock a build draws
from"* (`src/content/default-locale-en.ts:510`) — which names the stock without
ever showing it.

**This paragraph is a measurement and not a diagnosis.** What would establish
the cause of the owner's session: the owner saying what quantity they bought and
whether any wall appeared. What would establish the impact: nothing in this
repository can. Nobody plays the game yet.

## 5. Reproduced from the previous pass, and one that did not reproduce

- **The Rooms panel calls a finished wall "open".** Reproduced in Run A:
  attempt 1 succeeded (`rooms=1`) while the panel note still read
  `["OPEN ON AT LEAST ONE SIDE","MUST BE ENCLOSED"]`. Same shape as
  `2026-08-29-playtest-ordering-and-the-second-room.md` §7 and consistent with
  its named mechanism (`DEFAULT_POLL_INTERVAL_SECONDS = 30`,
  `src/rendering/feed/simulation-snapshot-feed.ts:107`). **Not re-diagnosed
  here**; that record owns it.
- **The twelve-attempt retry loop was not needed.** `buildAndPopulate` retries
  the designation up to twelve times; the naive route zoned on **attempt 1**,
  9.6 seconds after the queue emptied. That is one sample and does not
  contradict §7 — 9.6s is longer than that record's 6s and 12s failures and
  shorter than its 30s poll — it just means the window had already closed.
- **The refusal band latches.** Reproduced: *"The object was not placed — it has
  to stand in a room you have zoned"* was the whole content of `.hud__refusal`
  for the rest of Run A, through 24 walls being built and the room being zoned.
  Deliberate (`src/ui/hud/hud.ts:946-950`, *"a simulation refusal [stays] until
  another replaces it"*), and already recorded twice. Not re-reported as new.

## 6. A correction to this pass's own instrumentation, before anyone quotes it

Run B's first execution printed:

```
.hud-alerts before unfolding: ".hud-alerts: ABSENT"
```

**That is a wrong selector, not a missing panel.** There is no element with the
class `hud-alerts`: the list is `hud-alerts__list` and its enclosing section is
built by `createCollapsibleSection` with no extra class
(`src/ui/hud/hud.ts:1252-1263`). Anyone reading that line without opening the
file would write down "the game has no alerts panel", which is false. The script
now addresses the section through `.hud-alerts__list`'s `closest('.ui-section')`
and Run B's numbers in §3 are from the corrected version.

It is recorded rather than quietly fixed because it is the same failure #569's
retraction is about, one size smaller: **a selector that answers `ABSENT` is
evidence about the selector until the file is opened.**

## 7. Two harness facts worth not re-deriving

- **`simulation/status-counts` stops publishing when nothing changes.** All four
  of Run A's clock observations read `counts: {"tick":0,…}` while `currentTick`
  read 1,315 / 2,581 / 3,847 / 5,096. That is `statusCountsEqual` skipping an
  identical payload, already documented in `playtest-harness.ts`'s `currentTick`
  comment. It is not a frozen simulation and it is not a defect.
- **The camera calibration rule holds again**, measured rather than assumed:
  `calibration: tile (0,0) top-left = (-304, -574)` at 1440x900, which is
  `(viewportW/2 − 1024, viewportH/2 − 1024)`.

## 8. What is handed over, and to whom

Nothing here is proposed as a code change by this pass, and one of the two
reasons is a rule rather than a judgement.

1. **The stalled-order silence (§3) is a product decision and the copy is the
   owner's.** Every route out of it that this pass can see needs a new
   player-facing sentence or a new number on screen — a stock readout, a
   requirement line on the catalogue row, a state word on the folded queue
   header, or a "short by N" line. `AGENTS.md` reserves any player-facing string
   to the owner, so this is reported and stopped, exactly as instructed.
   **What can be said without deciding any of it:** the Build panel already
   solved the neighbouring problem with no new sentence at all, by passing a
   `trailing` badge to a fold (`src/ui/hud/build-panel.ts:1561`), which is how
   the shut queue header comes to read `12 waiting · 0 being built` in the first
   place. The shape exists; what it should say does not.
2. **The Rooms panel's stale enclosure verdict (§5)** belongs to
   `2026-08-29-playtest-ordering-and-the-second-room.md` §7, which already hands
   it to whoever owns `src/ui/**` and `src/rendering/**` with a named mechanism
   and a named falsification. Reproducing it here adds a sample, not a claim.

---

## Weakest claim, and the cheapest thing that would falsify it

**Weakest: that §3 is what happened to the owner.** What is measured is that a
plausible purchase — one brick per wall — leaves half a perimeter standing, that
the state stays that way for two in-game days, and that no visible surface names
materials. **Nobody observed the owner's session.** #569 named its weakest claim
and was still wrong, and its retraction says so in as many words: *"Naming a
weak claim is not testing it."* So this one is named **and** the test is stated:

**The cheapest falsification: ask the owner what quantity of bricks they bought,
and whether any wall ever appeared.** If they bought none, §1 is the answer and
they were never stuck at all — the route works. If they bought enough, §3 is a
nice-to-have and the cause is elsewhere again. Only "bought some, saw some walls,
then nothing" makes §3 the explanation, and that is one sentence from them.

**Second weakest: that the guess is one-per-wall.** The stepper opens on `2`,
which is one wall's worth, so a player who presses `+` twenty-three times rather
than typing gets 25 bricks and the same stall one segment later; a player who
multiplies the visible `2` by 24 gets it right. This pass played the typed
guess. **UNKNOWN: which of those a real player does.** What would settle it: any
observed session, which nothing in this repository can supply.

## What this pass did not reach

- **A player.** Every impact statement above is withheld for that reason, per
  `docs/AGENT_WORKFLOW.md` §3.
- **Any viewport but 1440x900.** The previous pass established that the refusal
  band is 900x32 at 900x600; §3's fold behaviour was not re-measured there.
  **UNKNOWN** whether the stalled-queue header is even on screen at 900x600,
  where `build-panel.ts:1187` records the panel's always-visible budget as very
  small. What would settle it: run Run B at 900x600.
- **The half-built perimeter as drawn on the map.** This pass read text, never
  pixels, and one thing that follows must be said because it cuts against §3's
  framing. **VERIFIED, read:** the renderer maps `materials-pending` to the same
  `'planned'` appearance as an ordered wall
  (`src/rendering/world/structures.ts:27-32`, *"Ordered, waiting for materials,
  or waiting for a worker: a ghost"*), so the twelve stalled segments are almost
  certainly **drawn, as ghosts** rather than absent. The player therefore does
  see something — a perimeter half solid and half ghostly — and §3's "silence"
  is about the *reason*, not about the map. It also means the ghost carries no
  distinction between *waiting for materials* and *waiting for the crew*, which
  is precisely the distinction the queue's word list does draw
  (`src/content/simulation-message-keys.ts:466-474`). **UNKNOWN: what that
  actually looks like on screen**, and whether a ghost is legible as unfinished
  at all. What would settle it: the frame-hash or frame-diff method
  `2026-08-29-playtest-ordering-and-the-second-room.md` §7 already used — and a
  worktree run cannot settle it unless `git lfs checkout` has been run there,
  because a worktree carries LFS pointer text rather than sprites and a browser
  run passes anyway (`docs/AGENT_WORKFLOW.md` §2).
- **Prisoners, guards, incidents, a day boundary.** Neither run admitted anyone;
  the question was the first prison, not the running one. Those are covered by
  `2026-08-29-what-a-day-actually-pays.md` and
  `2026-08-30-does-a-prison-survive-being-reopened.md`.
- **Buying more than the treasury holds**, and every other route into
  `2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`. Untouched here.
- **Touch, trackpad, keyboard.** Mouse only.
