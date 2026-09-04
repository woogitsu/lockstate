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

## 2. `Z` after a panel action reaches past it, and says the same eleven words

*(Filled from act 2 — see below.)*

---

## 3. `Escape` does not put the tool down

*(Filled from act 3 — see below.)*

---

## 4. Money into materials is a one-way door, and the sweep that looked for the exit

*(Filled from act 4 — see below.)*

---

## 5. The mutation

*(Filled below.)*

---

## 6. What this does not establish, and my weakest claim

*(Filled below.)*
