# Is there a way back? — played, 2026-09-04

**Played on `playtest/is-there-a-way-back`, cut from `origin/main` at
`a7925dcd` (v0.0.444).** Instrument:
`tests/browser/playtest-2026-09-04-is-there-a-way-back.playtest.ts`. Nothing
under `src/` was changed by this record; one mutation was taken, watched and
restored by hand, and §5 gives its hashes.

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
- **§5's mutation is the strongest refuting sample available**, and it is what
  ties the missing 240 to that one branch rather than to anything else.

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

## 5. The mutation

*(Filled below.)*

---

## 6. What this does not establish, and my weakest claim

*(Filled below.)*
