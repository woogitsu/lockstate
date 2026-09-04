# Is there a way back? — played, 2026-09-04

**Played on `playtest/is-there-a-way-back`, cut from `origin/main` at
`a7925dcd` (v0.0.444).** Instrument:
`tests/browser/playtest-2026-09-04-is-there-a-way-back.playtest.ts`. **Nothing
under `src/` was changed by this record** — verified with
`sha256sum -c` and `git status --short src/`, both clean. §5 explains why the
causal claim in §1 needed no mutation, and the closing "Instrument failures"
section reports every failure of this run, including the one mutation this
session could not take.

The owner ruled on 2026-09-04, in their own words:

> **"Zawsze musi istnieć droga powrotu"**

("There must always be a way back.")
[ADR 0096](../adr/0096-what-a-way-back-is-and-what-guarantees-one.md) —
`Proposed, 2026-09-04. Not self-approved.` — reads that sentence as an
**economic** guarantee: *"from every state a player can reach, the prison can
reach a strictly positive state income within a bounded number of in-game
days"*. This record asks the question that definition does not: **when a
player wants to take back the thing they just did, can they?**

---

## The findings, most load-bearing first

1. **§7** — the game already owns the owner's sentence for a destroyed
   purchase, and the one press that destroys the most gets silence, justified
   in two files by two premises that ADR 0076's own amendment withdrew.
2. **§2** — `KeyZ` after a hire keeps the hire and takes a wall down, and says
   the build queue changed while the queue block is not on the screen.
3. **§1** — undo on a finished wall run returns nothing in either currency,
   and `KeyY` buys the same materials again.
4. **§6** — the `Remove` control cannot take a wall down, and the line that
   withholds the queue row from a standing wall says it can. `KeyZ` is the only
   route, so a finished wall is permanent without a keyboard.
5. **§5** — the discriminating A/B, plus the fold the priced Cancel sits behind.
6. **§4** — the refutation: a delivery in flight has an exemplary way back, and
   the sweep that would have found a stock sell-back found nothing.
7. **§3** — `Escape` leaves the tool armed and says nothing.

## The answer in one paragraph

**Yes, there is a way back — and it is priced, silent, and reaches further
than the player asked.** `KeyZ` really does reverse a finished wall run: the
geometry comes down, and the Rooms panel's own verdict for the same rectangle
flips from `Walled in on every side` to `Open on at least one side`. But the
materials the run consumed are destroyed rather than returned — **the funds
chip does not move by one minor unit** — and the way back from *that* is a
second purchase: `KeyY` rebuilt the same three edges and cost **240**, the
full catalogue price of the six bricks already paid for. The only two
sentences the game says across the whole round trip are *"The last change to
the build queue was undone."* and *"The last change to the build queue was
redone."* Neither names money, neither names a wall, and the queue was empty
when both were said. Two further presses of the same key took down another
six edges — **480** at catalogue price — and **no number on the screen moved
at all**.

---

## Claim tiers

- **MEASURED** — read off the running application in this run, quoted.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **ARITHMETIC** — derived from constants that were opened.

---

## 1. Undo on a finished wall run: the geometry comes back, the money does not

### The reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=43201 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-is-there-a-way-back.playtest.ts --grep "act 1"
```

By hand, at 1440×900:

1. `New prison`. **MEASURED**: funds `"25,000 · FUNDS"`, `treasuryMinorUnits: 25000`.
2. Build tab. Calibration: **tile (0,0) top-left = (−304, −574)**.
3. Two Fast-forward presses → `{"mode":"running","speed":4}`.
4. Select `wall-brick`, `Place on map`, and lay the four sides of the 2×3 cell
   at tiles (12,12)–(13,14) as **four separate drags**, so each side is one
   undo transaction:
   - north, (496,194) → (560,194) — 2 orders, `12,12 north` and `13,12 north`
   - south, (496,386) → (560,386) — 2 orders, `12,15 north` and `13,15 north`
   - west, (464,226) → (464,354) — 3 orders, `12,12/12,13/12,14 west`
   - east, (592,226) → (592,354) — 3 orders, `14,12/14,13/14,14 west`
5. Wait for the Build panel to read `0 waiting · 0 being built` (**2,816 ms**).
6. Rooms tab, `Cell`, `Draw on map`, drag (12,12)→(13,14), `Designate 2 × 3`.
7. Press **`Z`** once, with the pointer anywhere on the world.

### What the screen showed, quoted

| moment | funds chip | `treasuryMinorUnits` | `rooms` | the band |
| --- | --- | --- | --- | --- |
| fresh prison | `"25,000 · FUNDS"` | 25000 | 0 | `""` |
| after the four drags | `"24,200 · FUNDS"` | 24200 | 0 | `""` |
| ring finished | `"24,200 · FUNDS"` | 24200 | 0 | `""` |
| zoned | `"24,200 · FUNDS"` | 24200 | **1** | `""` |
| **after one `Z`** | **`"24,200 · FUNDS"`** | **24200** | **1** | `"The last change to the build queue was undone."` |
| after one `Y` | **`"23,960 · FUNDS"`** | **23960** | 1 | `"The last change to the build queue was redone."` |

**Every figure above is MEASURED.** The 800 the ring cost is **ARITHMETIC**
that agrees with it: ten tile edges, `wall-brick` requires 2 × `item.brick`
(`src/simulation/construction/definition.ts:89`) at 40 each
(`src/content/procurement-catalog.ts:100`) — 20 bricks, 800, and
25,000 − 24,200 = 800 exactly.

**The geometry did come down, and the panel says so itself.** Before the
press the Rooms panel read `ENCLOSURE · Walled in on every side`. After the
press, the same 2×3 rectangle re-drawn reads:

> `AREA · 2 × 3 tiles at 12, 12` · **`OPEN ON AT LEAST ONE SIDE`**

So this is not a claim that undo does nothing. **It is a claim about what it
gives back: nothing.** 24,200 before the press, 24,200 after it, and the six
bricks the east run consumed are gone in both currencies.

### And the way back from the way back costs the trip twice

`Y` put the east run back — and took **240**: 24,200 → 23,960, which is
exactly 3 edges × 2 bricks × 40. **MEASURED.** So the round trip `Z` → `Y`
returns the world to where it started and leaves the prison 240 poorer, and
the only thing on screen that recorded it is a funds figure that changed for
no stated reason.

### Two more presses, and the loss stops being visible at all

Presses three and four each answered `The last change to the build queue was
undone.` — the alerts list collapsed them to `2×` and then `3×` — and each
took down another run: the east run again (the one `Y` had just re-bought)
and then the west run. **MEASURED**: funds `"23,960 · FUNDS"` before press
three and `"23,960 · FUNDS"` after press four, with six of the ring's ten
edges now down.

**So the destruction of 480 of standing wall — ARITHMETIC, 6 edges × 2 bricks
× 40 — moved no number on the screen.**
There is no stock readout anywhere in the interface (§4), the funds chip
cannot move because no money is involved, and the band says the same eleven
words it says for a free undo of a queued order.

### Why, in the code — every line opened

- **VERIFIED, read.** `ConstructionSystem.undo()`
  (`src/simulation/construction/system.ts:554`) pops one transaction and calls
  `cancelOrder` for each order in it, *including a `completed` one*: the
  comment at `:570` says so, and gives the reason — *"leaving that wall
  standing while the order reads `cancelled` would make the undo stack a
  lie"*.
- **VERIFIED, read.** `cancelOrder` (`system.ts:722`) sets
  `hadGeometry = stateAtCancellation === 'completed'` (`:730`) and calls
  `revertConstruction` (`system.ts:1529`), which rewrites the tile edge from
  whatever *other* completed order still claims it and otherwise to 0. That is
  the geometry coming down.
- **VERIFIED, read.** The refund branch: the allocation is emptied
  unconditionally at `system.ts:738`, and the arm at `:739` —
  `stateAtCancellation === 'in-progress' || hadGeometry` — empties it **into
  nothing**, running neither `materialsProvider.release` nor
  `refundAllocatedMaterials`. The `refundSurplusOf` call at `:764` then
  returns at `:823`, which passes only `'approved'` and `'materials-pending'`.
- **VERIFIED, read.** `redo()` (`system.ts:601`) returns the order to
  `'approved'` and restores no allocation, so the just-in-time pass buys the
  materials again. That is the 240.
- **VERIFIED, read.** The two sentences are
  `'hud.alert.event.construction.undone': 'The last change to the build queue was undone.'`
  and its `redone` twin (`src/content/default-locale-en.ts:883-884`), raised by
  `createConstructionCommandHandler` at
  `src/simulation/construction/handler.ts:174` and `:178`.

### This is a ruled behaviour, and that is not the finding

**VERIFIED, read.** [ADR 0076](../adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
`Amendment, 2026-09-01` records the owner's ruling — *"Taking a finished
object away returns nothing. Not its materials, not its money."* — states that
it is read as *"a completed order returns nothing"* so a wall goes the way a
bed does, and prices the redo in advance: *"`Redo` then rebuilds and pays
again, and that is arithmetic rather than a second decision […] the pair costs
one order's materials."* **So the mechanism is decided and this record does
not reopen it.**

**What is new here is the other half, which that amendment does not claim to
have covered: what the player is told.** The amendment's own accepted cost is
*"a misplaced bed is a permanent loss, undo of a built wall stops being
free"* — a cost that only exists as a design pressure if the player can
perceive it. **Measured, they cannot.** The band says *the build queue* was
changed while the queue read `0 waiting · 0 being built`; no sentence names
the wall, the bricks or the price; and the one number that does move — funds,
on the `Y` — moves on the press that *gave the wall back*, so the screen
associates the cost with the recovery rather than with the destruction.

**This is [ADR 0096](../adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
decision 4's shape at a place that ADR does not look.** Its decision 4 lists
four things a player must learn and all four are about the economy's floor.
None of them is *"the key you press to change your mind spends money"*.

### What could have refuted this and did not

- **The press could have been free.** It is, when the crew has not started:
  ruling 20 refunds `approved`, `materials-pending` and `assigned`, and
  `docs/research/2026-09-03-what-cancel-actually-gives-back.md` measured all
  three. That record's §5 closes with *"`completed` was not measured — it has
  no queue row, and reaching `cancelOrder` for it means `Undo`, a different
  press"*. **This is that press, and it is the state where the refund stops.**
  So the finding is not "undo destroys money"; it is "undo destroys money
  once the run has finished, and the screen does not distinguish the two
  cases" — the band is the same eleven words either way.
- **The wall could have stayed up**, which would have made this a geometry
  bug rather than a pricing one. It did not: `OPEN ON AT LEAST ONE SIDE`,
  quoted above, off the panel.
- **The money could have come back late** — on the next construction tick, or
  at the day boundary. It did not: 24,200 was still the reading four in-game
  days and 3,600 ticks later, at the end of the act.
- **§5 is the discriminating sample**, and it is what ties the missing 240 to
  the order's *state* rather than to `Undo` as such.

---

## 2. `Z` after a hire takes the wall down instead, and says the same eleven words

**This is the load-bearing finding of this record, because it destroys work
the player was not thinking about and the sentence it prints points at a
control that is not on the screen.**

### The reproduction

`--grep "act 2"`, or by hand at 1440×900:

1. `New prison`, Build tab, calibrate (again **(−304, −574)**), two
   Fast-forward presses.
2. Select `wall-brick`, `Place on map`, drag (496,194) → (560,194) — the north
   side of the cell, `12,12 north` and `13,12 north`, one transaction.
3. Wait for `0 waiting · 0 being built`. **MEASURED**: funds
   `"24,840 · FUNDS"` — 160 for four bricks.
4. Security tab. The control reads `"Hire Guard · 80"`. Press it once.
   **MEASURED**: funds `"24,760 · FUNDS"`, `staff: 1`,
   `dailyWageBillMinorUnits: 80`.
5. **Change your mind about the guard and press `Z`.**

### What the screen actually showed

**MEASURED**, all of it, in one press:

| reading | before `Z` | after `Z` |
| --- | --- | --- |
| `staff` | 1 | **1** |
| `dailyWageBillMinorUnits` | 80 | **80** |
| funds chip | `"24,760 · FUNDS"` | `"24,760 · FUNDS"` |
| the band | `""` | **`"The last change to the build queue was undone."`** |
| `.hud-build__queue` | — | **`not laid out`** |

The command that left the page was `{"type":"Undo"}` — submitted, accepted,
with the keyboard focus still on the Hire button (`button.ui-action
hud-staff__hire`), so the key was not swallowed by a text field. The staff
panel afterwards is identical to the staff panel before, down to
`ON THE PAYROLL · 80 a day`.

**And the wall is gone.** Re-arming `wall-brick` and re-dragging the same two
edges was **accepted** — two fresh `PlaceBuildOrder`s at `12,12 north` and
`13,12 north` — and the queue then read `QUEUED · 1 waiting · 1 being built`.
A duplicate claim on a standing wall would have been refused
(`duplicateClaim`, `src/simulation/construction/system.ts:498`, which skips
`cancelled` orders and matches on definition, location and edge), so an
accepted re-drag is the player-visible proof that the edges were free.

Rebuilding cost **160**: 24,760 → 24,520, of which 80 is the guard's wage at
the day boundary the run crossed (day 1 → day 2) and 160 is the four bricks.
**ARITHMETIC over MEASURED figures**, and the wage half is why the delta is
240 rather than 160.

### So what happened, in one sentence

**A player who hires a guard, regrets it, and presses the one key this game
binds to "take that back" keeps the guard, keeps the wage, loses a wall they
were not thinking about, and is told that the build queue changed — while the
build queue block is not on the screen at all.**

### Why, in the code — every line opened

- **VERIFIED, read.** `edit.undo` is `KeyZ` in the `world` and `construction`
  contexts and nothing else (`src/input/bindings.ts:64`; `edit.redo` is `KeyY`
  at `:65`). There is no second undo binding, and no undo control anywhere in
  the HUD — `grep -rn 'edit.undo' src/` returns six lines, four of them
  declarations.
- **VERIFIED, read.** The key reaches `ConstructionSystem.undo()` and nothing
  else: `world-scene.ts:757` routes `'edit.undo'` to `this.editHistory?.undo()`,
  `editHistory` is the `BuildTool` (`src/main.ts:392` and `:2074`, both
  `editHistory: buildTool` / `editHistory: tool`), the HUD turns it into an
  `undo` intent (`src/ui/hud/hud.ts:1936`) and `src/main.ts:2314` submits
  `{ type: 'Undo' }`.
- **VERIFIED, read.** So the undo stack holds *construction transactions*
  only. `registerTransactionOrder` (`system.ts:513`) is called from
  `src/simulation/construction/handler.ts:120` for a `PlaceBuildOrder` and
  from `src/simulation/objects/object-placement-service.ts:502` for a
  `PlaceObject`. Nothing else in `src/` pushes anything onto it — a hire, a
  designation, an admission and a regime change are not on it and cannot be.
- **VERIFIED, read, and this is the part that turns "cannot" into
  "destroys".** `undo()` does not first ask whether the newest *player action*
  was a build. It pops the newest transaction it holds, however old
  (`system.ts:554-586`). Two ADRs state the "cannot" half and neither states
  this one: [ADR 0025](../adr/0025-guard-hiring-surface.md) at `:476` — *"undo
  reverses construction orders and hiring writes none, so there is nothing for
  undo"* — and [ADR 0022](../adr/0022-room-zoning-surface.md) at `:614`,
  *"writes no construction order so `Undo` reaches nothing"*. **`Undo` does
  not reach nothing. It reaches the last wall.**
- **VERIFIED, read.** The sentence is unconditional: the handler raises
  `construction.undone` whenever `undo()` answers `true`
  (`handler.ts:174`), and the string is
  `'The last change to the build queue was undone.'`
  (`src/content/default-locale-en.ts:883`). It cannot say which transaction it
  took, because the owner's ruling on #749 is that the sentence names no count
  and `ConstructionSystem` deliberately keeps the transaction size to itself
  (`system.ts:532-553`). **Naming no count is not the same as naming no
  subject**, and this is where the difference costs a player a wall.

### The way back from the hire does exist, and it is #912's control

**MEASURED.** A sweep of every `button`/`[role=button]` on the Security tab
for the words *dismiss, release, fire, sack, let go* found six, and exactly
one is enabled:

```
{"text":"Dismiss","className":"ui-action","disabled":false,"laidOut":false}
```

**Enabled and not laid out** — `getClientRects().length === 0`. That is
[#912](https://github.com/matmaxalez/lockstate/issues/912) verbatim, and ADR
0096's decision 1 quotes it as the reason its definition says *"actions the
interface offers, not actions the kernel would accept"*. This record does not
re-file it; it corroborates it from a second direction, and it is the reason
`Z` is the press a player reaches for.

### What could have refuted this and did not

- **`Z` could have refused.** It does refuse, honestly, when there is nothing
  on the stack: `undo()` returns `false`, the handler raises no event and the
  band stays silent (`handler.ts:174`, and act 1's own presses three and four
  are the positive control). **So the game is capable of not acting on this
  key.** What it is not capable of is preferring "nothing to undo" over "undo
  something the player did ten minutes ago".
- **The wall could have survived** and the press could have been a harmless
  no-op with a misleading band. The accepted re-drag rules that out.
- **The hire could have been on the stack**, which would have made this
  finding vanish. `staff: 1 → 1` and `dailyWageBillMinorUnits: 80 → 80` rule
  it out, and the `registerTransactionOrder` call sites explain why.
- **The key could have been swallowed** by the focused Hire button, which is
  the shape that has produced withdrawn findings here. The focus was recorded
  (`button.ui-action hud-staff__hire`) and the `{"type":"Undo"}` command was
  captured on the wire, so the press landed.

---

## 3. `Escape` does not put the tool down, and says nothing about it

Smaller than §1 and §2, and reported at that weight: this is a playability
finding, not a false promise, because nothing in the tree claims otherwise.

### The reproduction and what the screen showed

`--grep "act 3"`. **MEASURED**, in five readings:

| step | arm control | funds |
| --- | --- | --- |
| after `Place on map` | `data-armed="true"`, label `"Stop placing"` | `"25,000 · FUNDS"` |
| after **`Escape`** | `data-armed="true"`, label `"Stop placing"` | `"25,000 · FUNDS"` |
| the band after `Escape` | **`.hud__event: not laid out`** | — |
| a drag on clear canvas at (1008,482), proved `canvas` by `elementFromPoint` | — | **`"24,840 · FUNDS"`** |
| after pressing the arm control instead | `data-armed="false"`, label `"Place on map"` | — |

The post-`Escape` drag produced two real orders — `20,16 north` and
`21,16 north` — **with the clock paused at tick 0**, and cost 160. The drag
after the arm toggle produced `[]`.

So `Escape` leaves the tool armed, prints nothing, and the next gesture on the
world spends money. **Two presses — `Escape`, then one drag the player thought
was a look-around — cost 160 with no warning.**

### Why, in the code

- **VERIFIED, read.** `Escape` is `build.cancel`
  (`src/input/bindings.ts:36`) and the scene answers it with
  `this.cancelAllGestures()` (`src/rendering/scene/world-scene.ts:748`, the `case` at `:743`), which
  is `cancelBuild(); cancelObject(); cancelArea();`
  (`world-scene.ts:1099-1103`) — three *gestures*, and `setArmed` is not among
  them.
- **VERIFIED, read.** Nothing overstates it. `input.action.build.cancel` is
  the one word `'Cancel'` (`src/content/default-locale-en.ts:1997`) and
  `docs/INPUT.md:8` describes the action as *"cancelling a wall run"*, which
  is exactly what it does. **So this is not a promise the code does not
  keep** — it is a key a player will press for a purpose the game never
  offered, with no feedback either way, and the design directive it fails is
  *"gra ma być łatwa przyjazna do grania"* rather than `AGENTS.md`'s fourth
  exclusion.

### What could have refuted this and did not

- **The tool could have disarmed and the label lagged.** The drag is what
  rules that out: it produced two accepted `PlaceBuildOrder`s and moved the
  funds chip by 160.
- **The press could have been swallowed.** The arm-toggle arm of the same act
  is the control: identical drag, `[]` commands, so the drag path itself is
  sound and it is the arming that survived `Escape`.
- **The point could have been under the HUD**, which is the classic false
  negative here. `elementFromPoint(1008, 482)` returned `canvas`.

---

## 4. One way back is exemplary, and it stops the moment the truck lands

**This section is the refutation half of this record, and it is worth more
than the confirmation beside it.** The brief I was given hypothesised that
ways back are missing or hidden across the board. **For a purchase in flight
that is plainly false, and the delivery block is the model the other three
sections fail to meet.**

### The way back that works

`--grep "act 4"`. **MEASURED**, clock paused throughout, so nothing here is a
lead artefact:

| step | funds chip | `treasuryMinorUnits` |
| --- | --- | --- |
| `New prison` | `"25,000 · FUNDS"` | 25000 |
| `Buy 10 × Brick · 400` | `"24,600 · FUNDS"` | 24600 |
| press the delivery row's `Cancel` | **`"25,000 · FUNDS"`** | **25000** |

The block said, before the press, in its own words:

> `ON THE WAY` · `1 bought · 400 back if cancelled` · `10 × Brick · 400 back` ·
> `Cancel`

and afterwards the band said:

> `"The delivery was cancelled — 400 back."`

**A way back that is visible without hunting, priced before the press, priced
again on the row, and confirmed afterwards with the amount.** Every one of
those four properties is missing from §1 and §2. The comparison is the useful
part of this section: the repository plainly knows how to do this.

### And it ends at the delivery

Buying 10 more (25,000 → 24,600) and running the clock past
`PROCUREMENT_DELIVERY_DELAY_TICKS = 100`
(`src/content/procurement-catalog.ts:62`) to **tick 428** left the deliveries
block **`not laid out`** — nothing on the way — and funds at **24,600**, where
they stayed.

Then the sweep, which is the sample that could have refuted ADR 0096 §4 and
did not. Every tab, every `button`/`[role=button]`/`a`/`input`/`select`, and
every text node on the page, against
`/sell|sold|refund|return|reclaim|buy ?back|liquidate|scrap|salvage|resell|dispose/i`:

| tab | controls on the page | matches |
| --- | --- | --- |
| overview | 109 | **0 controls, 0 text nodes** |
| build | 109 | **0 controls, 0 text nodes** |
| rooms | 109 | **0 controls, 0 text nodes** |
| security | 109 | **0 controls, 0 text nodes** |
| regime | 109 | **0 controls, 0 text nodes** |

**So ADR 0096 §4's claim — *"There is no player command that sells stock out
of a container, at any ratio"* — is confirmed by playing, not merely by
reading.** 400 goes in, ten bricks arrive, and there is no gesture anywhere in
the interface that turns them back into money. **VERIFIED, read**, the same
conclusion from the other end: `ProcurementSystem.refundMaterials` and
`previewRefundMaterials` (`src/simulation/economy/procurement.ts:367`, `:389`)
are reached only from
`JustInTimeMaterialsService.refundAllocatedMaterials` and its preview twin
(`src/simulation/economy/just-in-time-materials.ts:822` and `:927`), whose own
callers are `ConstructionSystem.cancelOrder` and the queue row's price
preview. **Every path into them starts at an order**, and there is none that
starts at a container.

### And the player cannot see the stock at all, which is what makes §1 silent

**MEASURED.** The complete list of words anywhere on the page about stock or
materials, with ten bricks sitting in the container:

```
["Brick wall",
 "Buy 10 × Brick · 400",
 "Arrives while the clock runs, into the stock a build draws from.",
 "10 × Brick · 400 back"]
```

**There is no stock readout.** The third string is the only sentence that
mentions the stock and it names no quantity; the fourth is the delivery row,
which disappears once the goods land. So the player owns a quantity of bricks
the interface never states — which is exactly why §1's destruction of twelve
of them moves nothing on the screen. **The two findings are the same absence
seen from two sides.**

### Instrument caveat, stated because it looks like a contradiction

`delivery rows on screen: 3` both before and after the truck landed. That
count is `document.querySelectorAll('.hud-build__delivery-row').length` and the
block **pools its rows** (`src/ui/hud/build-panel.ts:1520`, `PENDING_DELIVERY_ROW_LIMIT` rows built once), so it counts
the pool and not what is painted. The reliable read is the block's own text,
which is `not laid out` after landing. Anyone re-running this should read the
text, not the row count.

---

## 5. One method, two states: the discriminator, and the fold in front of it

**Act 5 is the sample that ties §1's missing money to the order's *state*
rather than to `Undo`, and it needed no `src/` edit to do it.** Both presses
end at `ConstructionSystem.cancelOrder`; the only difference is when they are
taken. One prison, one session, one buildable.

### Arm A — `Cancel` on a queued order, clock paused

**MEASURED.** Paused deliberately: the previous cancellation record measured
presses landing 36–55 ticks late against a ten-tick transition, so a running
clock makes the state at the press unknowable.

| step | funds chip | `treasuryMinorUnits` | the band |
| --- | --- | --- | --- |
| `New prison` | `"25,000 · FUNDS"` | 25000 | `""` |
| one drag, 2 orders queued | `"24,840 · FUNDS"` | 24840 | `""` |
| press row 0's `Cancel` | **`"24,920 · FUNDS"`** | **24920** | **`"The order was cancelled — the money it cost is refunded."`** |

**+80, exactly what the row advertised** (`aria-label="Cancel: Brick wall ·
12, 12 · North · 80 back"`), and **a sentence that names the money.** The
press was a coordinate press at (1376,736), and `elementFromPoint` there
returned `span.ui-action__label` — the button's own label, so the press landed
on the control.

### Arm B — `KeyZ` on the same buildable, finished

**MEASURED**, in the same prison ten seconds later:

| step | funds chip | `treasuryMinorUnits` | the band |
| --- | --- | --- | --- |
| one drag, run finished | `"24,760 · FUNDS"` | 24760 | — |
| press `Z` | `"24,760 · FUNDS"` | **24760** | `"The last change to the build queue was undone."` |
| 2.5 s later | `"24,760 · FUNDS"` | **24760** | unchanged |

**So the discriminator is the state, measured: pending pays 80 and says so;
finished pays nothing and says the same eleven words it says either way.**
`ARM A: 25000 -> 24840 -> 24920`. `ARM B: 24920 -> 24760 -> 24760 -> 24760`.

**And the game already owns the honest sentence.** `hud.alert.event.order-cancelled`'s
text is *"The order was cancelled — the money it cost is refunded."*
(`src/content/default-locale-en.ts`, quoted off the screen above). A player who
has read that once will read *"The last change to the build queue was
undone"* as its quieter cousin.

### The fold in front of arm A, which is a finding of its own

**The `Cancel` that paid the 80 is not on the screen when a player queues an
order.** MEASURED, at 1440×900, immediately after the drag:

```
A queue section data-collapsed=true
A the queue header reads "QUEUED 2 waiting · 0 being built" aria-expanded=false
A queue row 0: {"hidden":false,"rects":0,"rowBox":"0,0 0x0","buttonBox":"0,0 0x0",
                "buttonLabel":"Cancel: Brick wall · 12, 12 · North · 80 back",
                "display":"flex","visibility":"visible"}
A queue row 1: {... "buttonLabel":"Cancel: Brick wall · 13, 12 · North · 80 back" ...}
A NO PRESSABLE QUEUE ROW at 1440x900 while the section is collapsed
```

One click on the header, and the same rows measure:

```
A after opening the fold: data-collapsed=false
A opened queue row 0: {"rects":1,"rowBox":"1177,714 238x44","buttonBox":"1337,714 78x44", ...}
A opened queue row 1: {"rects":1,"rowBox":"1177,766 238x44","buttonBox":"1337,766 78x44", ...}
```

**VERIFIED, read, and it is deliberate**: `queueSection` is built with
`collapsed: true` (`src/ui/hud/build-panel.ts:2100`) and the comment above it
gives the reason — *"a queue then costs this panel a header and a count, and
costs it a list only when the player asks for one"*. The body is `hidden`
while collapsed (`src/ui/primitives/collapsible-section.ts:87`), which is why
the rows compute `display: flex` and measure `0x0`.

**So this is not a bug and it is still a finding.** ADR 0096 decision 1 says
the guarantee is over *"actions the interface offers, not actions the kernel
would accept"*, and its own weakness 1 names this control as the exit from the
measured §10c queue lock: *"The queue lock's exit is a cancel control, not a
rung"*. A prison sitting at −1,240 with 45 orders standing has its exit
**inside a fold that is shut on arrival**, and the only thing the panel says
while it is shut is `QUEUED · 2 waiting · 0 being built`, which names no way
back. Under the owner's directive *"a nie jakieś ukryte funkcje"* that is worth
the owner's attention even though every line of it was written on purpose.

**And the panel's own reasoning routes around it, into §1.**
`BUILD_QUEUE_ROW_LIMIT`'s docblock (`src/ui/hud/build-panel.ts:564-566`) says:
*"the control for 'I have changed my mind about that whole run' is `Undo`,
which pops the transaction the run was drawn in. So the two controls divide the
work: `Undo` takes back a gesture, and a row takes back one order."* The
player-facing half of that is `'hud.build.queue-more'`:
*"and {count} more behind these — undo takes back a whole run."*
(`src/content/default-locale-en.ts:1209`). **That sentence is true while the
run is pending and becomes a bad recommendation the moment it is built** — and
§1 is the price.

---

## 6. The `Remove` control cannot take a wall down, and one line in the tree says it can

**MEASURED**, `--grep "act 6"`. A wall run standing at `12,12 north` and
`13,12 north`, funds `"24,840 · FUNDS"`. Arm `Remove` — the control's label
reads `"Stop removing"`, so it is armed — and press the tiles the edge
divides, each twice, each point proved `canvas` by `elementFromPoint` first:

| press | point | command produced | funds after | the refusal line |
| --- | --- | --- | --- | --- |
| (12,12) ×2 | (496,226) | `RemoveObject` | `"24,840 · FUNDS"` | *"Nothing was removed — there is no object on that tile, and none being built there."* |
| (12,11) ×2 | (496,162) | `RemoveObject` | `"24,840 · FUNDS"` | the same |
| (13,12) ×2 | (560,226) | `RemoveObject` | `"24,840 · FUNDS"` | the same |

Six real commands, six refusals, wall standing, band empty.

**And the control arm, in the same prison, on the same wall.** Disarm
`Remove`, press `Z` once: band *"The last change to the build queue was
undone."*, funds still `"24,840 · FUNDS"` — and re-dragging the run was
accepted (2 orders) and cost 160, taking the prison to `"24,680 · FUNDS"`.
**MEASURED.** So the wall was removable all along; it is the *control* that
cannot do it, and the key that can charges the player twice.

**So this sentence in the tree is false:**

> *"A queue that listed standing walls would be a demolition list wearing a
> queue's label, and **taking a finished wall down is the Remove gesture's job
> (ADR 0028 phase 3)** rather than this one's"*
> — `src/simulation/presentation/construction-projection.ts:83-85`

**VERIFIED, read, and the reason is structural.** `RemoveObject` reaches
`objectPlacement.remove({x, y})`
(`src/simulation/runtime/session-commands.ts:665`), which looks up a *placed
object* at a tile. A wall is an **edge value**, written by `writeEdge` and
reversed only by `revertConstruction` (`system.ts:1529`), and the only two
callers of the method that runs it are `CancelBuildOrder` — which
`PENDING_BUILD_ORDER_STATES` (`construction-projection.ts:87`) forbids from
naming a `completed` order — and `Undo`.

**That line matters because it is the justification for withholding the queue
row.** The projection declines to give a standing wall a row *on the grounds
that another control has the job*, and that control refuses six times out of
six.

### What it costs: a finished wall is permanent without a keyboard

**`KeyZ` is the only route in the whole interface to take a standing wall
down.** The Build panel's own docblock (`src/ui/hud/build-panel.ts:1135-1141`)
describes exactly this trap, for objects, as the reason the `Remove` control
was built:

> *"until it existed a placed object could be taken back only by `Undo`, and
> `Undo` is `KeyZ`. So on a touch device a misplaced bed was **permanent for
> the session** […] and `AGENTS.md` boundary 10 is not satisfied by 'it works
> with a keyboard' any more than by 'it works with a mouse'. […] That is
> precisely the state the Rooms tab shipped in and had to fix in a follow-up,
> and it is not worth repeating."*

**It was repeated, for the buildable a player draws most.** ADR 0076's
amendment names the same asymmetry from the other side — *"Splitting the rule
by buildable kind would close the inversion for beds, leave it open for the
buildable a player draws most"* — about the refund. This is the same sentence
about the *reachability*.

### What could have refuted this and did not

- **The press could have been aimed wrong.** A tile edge normalises to the
  lower-numbered tile, so the edge `12,12 north` is also `12,11`'s south side:
  both tiles were pressed, twice each. The third tile the run covers was
  pressed too.
- **The press could have landed on a panel.** `elementFromPoint` returned
  `canvas` at all three points.
- **The command could have been swallowed.** Each press produced a real
  `RemoveObject` on the wire and a real refusal sentence back, so the whole
  round trip worked and the answer was *no such object*.
- **`Remove` could have needed a second gesture** (a drag rather than a
  press). It does not: the same control removes a bed with one press, which is
  what `calibrate` in this repository's own playtest harness relies on to
  measure the tile transform.

---

## 7. The silence in §1 is deliberate, and the two premises it rests on were both withdrawn

**This is the sharpest thing in this record.** The game does not lack a
sentence for "you just destroyed something and nothing came back". **It has
one, it is the owner's, and it was written for exactly this reason** —
`'hud.alert.event.construction.order-cancelled-underway'`:

> *"The order was cancelled. Anything already spent past the point of no return
> stays spent."*
> — `src/content/default-locale-en.ts:881`

and the docblock above it (`:852-856`) records the owner's reasoning for why a second
sentence exists at all:

> *"**Two sentences for one control, which is ruling 2**: before the crew
> started, the money comes back; after, ruling 20 of 2026-08-31 destroys the
> materials on purpose. The owner's reasoning is **"silence about a loss is the
> worst option"**, and it is why the second sentence exists at all rather than
> the first being stretched to cover both."*

**The press that destroys the most gets the silence anyway**, and two places
in the tree reason it out. Both give the same two grounds, and **both grounds
are false against the code as it stands.**

`src/content/default-locale-en.ts:872-878`:

> *"A cancelled order that had already **finished** gets no sentence here.
> Neither of the two below is true of it — the money did not come back and
> **the materials are not gone, they went into the container (ADR 0076
> decision B)** — **no control can reach that press**, and inventing a third
> sentence for it would be exactly the promise-the-code-does-not-keep that
> `AGENTS.md`'s fourth exclusion reserves."*

`src/simulation/events/event-log.ts:569-577`:

> *"**`'completed'` records nothing, and it is the one exclusion worth
> arguing.** […] the money did not come back […] **and the materials are not
> gone either (ADR 0076 decision B puts them back in the container)**. **No
> control can reach that press today** — `PENDING_BUILD_ORDER_STATES` excludes
> `'completed'`, so no Build-panel row names one — and it is reachable only by
> an order finishing between a projection and the press that answers it."*

**Premise 1 — "the materials are not gone, they went into the container" —
was withdrawn by the owner on 2026-09-01 and the code already follows the
withdrawal.** **VERIFIED, read**: `cancelOrder`'s arm at `system.ts:739` is
`stateAtCancellation === 'in-progress' || hadGeometry`, and its own comment
says *"`hadGeometry` moved into this arm on 2026-09-01"*; ADR 0076's
`Amendment, 2026-09-01` states *"nothing comes back in either currency"* and
*"undoing a wall run that has already been built now destroys its bricks"*.
**MEASURED**: §1 and §5 arm B, three prisons, zero minor units returned.

**Premise 2 — "no control can reach that press" — is refuted by six measured
presses in this record.** `KeyZ` reaches `cancelOrder` on a `completed` order
directly and by design: `undo()` calls it for *every* cancellable order in the
popped transaction, `completed` included, with a comment at `system.ts:570`
saying so. It is not a race between a projection and a press; it is the
ordinary press. The narrow half of premise 2 is true and is a different
claim — **no Build-panel *row* names a completed order** — and it is what makes
`KeyZ` the only route (§6).

**What follows, and it is the opposite of what those two comments conclude.**
They conclude that a third sentence would be a promise the code does not keep.
With both premises corrected, the code *does* keep it: the materials really are
destroyed, the press really is reachable, and the sentence the owner already
approved for `in-progress` — *"Anything already spent past the point of no
return stays spent"* — is **true of a finished order too**. The reservation
`AGENTS.md`'s fourth exclusion protects is against a sentence the code does not
honour; this one is the reverse case, a loss the code inflicts and no sentence
reports.

**Whether the answer is that sentence reused, a third one, or something the
`construction.undone` event carries, is not decided here** — the event
`Undo` raises is `construction.undone`, not
`construction.order-cancelled-*` (`handler.ts:174` against `:156`), so a
sentence would have to reach a different channel, and **no wording is authored
in this record.** What is established is that the ground the silence stands on
has moved out from under it in two files.

---

## 8. What this does not establish, and my weakest claim

### Not established

- **Nothing here prices a fix.** Where a sentence should land, whether `Undo`
  should refuse a `completed` order instead of destroying it, and whether a
  wall wants a Remove route are decisions with costs this record does not
  cost. §7 establishes that two comments justify a silence on withdrawn
  grounds; it does not decide what replaces the silence.
- **No `src/` change was made and none is proposed as a diff.** `sha256sum -c`
  and `git status --short src/` are both clean.
- **Only 1440×900 was played.** Every geometry figure here — including §5's
  `0x0` rows and the `1177,714 238x44` they become — is that viewport's. The
  fold is `collapsed: true` at every viewport by construction, but the *rects*
  are not a claim about 900×600 or 375px.
- **The undo stack across a save was not played.** `ConstructionSystem`
  snapshots `undoStack` and `redoStack` (`system.ts:1627-1628`, restored at
  `:1693-1694`), so a `KeyZ` after a reload should reach a transaction from
  before the save — which would make §2's shape worse. **Not measured, so not
  claimed.** PR #925 covers the reload itself.
- **No prisoner was in a cell for any of it.** Undoing a *bed* order calls
  `ObjectPlacementService.onOrderReverted`, which relocates residents left
  without a place (`object-placement-service.ts:715-726`), and whether a
  relocated prisoner can be put back where they were is the "consequences are
  not undoable" question this record did not reach.
- **`Escape` was pressed once per act, not in a distribution.** §3 is one
  press and one drag.

### My weakest claim, and what would change it

**The weakest claim in this record is §5's reading of the fold as a way-back
gap rather than as a height-budget trade the repository made knowingly.**
Everything about it is measured — `data-collapsed=true`, `aria-expanded=false`,
`0x0` rows, the header's exact text — and the *interpretation* is the soft
part: `BUILD_QUEUE_ROW_LIMIT` and `queueSection`'s own comments argue the fold
from a measured height budget, `hud.build.queue-more` and
`hud.build.queue-shortfall` are deliberately appended *outside* the fold so a
player who never opens it still reads them, and #625 is cited as the record of
what folding a *requirement* cost. So the repository has thought about this
exact hazard and drawn the line elsewhere.

**What would change my mind:** a played run in which a person who has just
queued an order finds the Cancel without being told where it is. That is a
question about a human, not about the DOM, and this record cannot answer it —
which is why §5 states the geometry and hands the reading to the owner rather
than filing it as a defect.

**The second weakest is §3.** `Escape` leaving the tool armed is measured, but
calling it a gap assumes a player expects `Escape` to disarm. Nothing in the
tree promises that, the arm control's label says `"Stop placing"` while armed,
and a player who has read it once knows where the off switch is.

**§1, §2, §6 and §7 are the ones I would defend hardest**, and each has a
one-command falsifier: re-run act 1 and watch the treasury after `Z`; re-run
act 2 and watch `staff` and the re-drag; re-run act 6 and watch the six
refusals; and for §7, open the two docblocks quoted and compare them with
`system.ts:739` and ADR 0076's amendment.

---

## Gates, and how to re-run this

| command | result |
| --- | --- |
| `tsc -b --pretty false` | **exit 0** |
| `tsc -b tsconfig.tools.json --pretty false` | **exit 0** |
| `tsc -p tsconfig.json --noEmit --listFiles` | the new `.playtest.ts` **is** in the program |
| `vitest run tests/foundation` | **52 files, 475 tests, all pass** |
| act 1 · act 2 · act 3 · act 4 · act 5 · act 6 | each **1 passed**, 0.9–2.0 min |

`vitest run tests/foundation` **failed first**, 2 of 475, and it was the
container rather than this branch: `documentation-commit-citation-contract`
reported *"this checkout is shallow, so no citation can be resolved"* and
listed 53 pre-existing citations in files this branch does not touch.
`git fetch --unshallow` fixed it and the suite then passed 475/475. Anyone
re-running this in a fresh container should unshallow **first**, or they will
read 53 other people's citations as their own regression.

```
LOCKSTATE_BROWSER_TEST_PORT=43201 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-is-there-a-way-back.playtest.ts --grep "act 1"
```

One act at a time. `--grep` is a regex, which is why no act title has
parentheses in it. `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, so **nothing in CI collects this file**: it is
evidence, not a gate, and it asserts almost nothing about the figures it
reports.

## Instrument failures, reported because two of them cost a reading

1. **A `pkill -f` pattern matched the shell running it.**
   `pkill -9 -f 'vite/bin/vite.js --config tests/browser'` killed the loop's
   own bash, because that string was in the loop's command line. Two acts
   never ran. `fuser -k -9 43201/tcp` does the same job without the
   self-reference.
2. **`playwright.playtest.config.ts` sets no `actionTimeout`, so a
   `locator.click` on an element with no box waits for ever.** Act 1's first
   run stalled in its last helper — the Rooms panel hides its arm row while a
   rectangle is pending — and lost two readings; act 5's first run stalled on a
   queue row inside the collapsed fold. Both are fixed in the instrument: a
   pending rectangle is discarded first, every click carries an explicit
   timeout, and the queue rows are read by geometry and pressed by coordinate
   the way `playtest-860-a-row-cancels-what-it-named.playtest.ts` does.
   **The second stall is how §5's fold was found**, so the trap paid for
   itself.
3. **A `src/` mutation could not be taken.** The plan for §1's causal claim
   was to widen `cancelOrder`'s `hadGeometry` arm, watch the treasury rise,
   and restore by hand. **The harness's permission layer refused the write to
   `src/`**, and the brief this record was written under forbids `src/`
   outright, so it was not attempted a second way. §5's two arms are the
   replacement and are better evidence: they discriminate the same branch
   *in the shipped code* rather than in an edited copy.
4. **`git lfs` is not installed in this container** — `git lfs checkout`
   answers *"The most similar command is log"* — so the atlases are 131-byte
   pointer files and every actor is missing. The
   `Atlas image … did not load` / `The source image could not be decoded`
   console output in every act is that, and nothing in this record depends on
   an actor being drawn.
5. **GitHub's issue search was rate-limited** for this session
   (*"API rate limit already exceeded"*), so the check for a pre-existing issue
   covering §1 and §7 was done against `docs/` and `src/` rather than against
   the issue tracker. ADR 0076's amendment and `docs/research/2026-09-03-what-cancel-actually-gives-back.md`
   are what establish that §1's *mechanism* is known; whether an issue already
   carries §7 is **not established**.
6. **The counts channel goes quiet when nothing changes.** Several tables above
   show a `treasuryMinorUnits` whose `tick` lags the clock by hundreds — that
   is `statusCountsEqual` suppressing an identical publication, and it is why
   "the treasury did not move" is read off *both* the worker sample and the
   funds chip in every row.
