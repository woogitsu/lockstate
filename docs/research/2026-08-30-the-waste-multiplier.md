# The waste multiplier: what an unaided first prison actually costs

**Date:** 2026-08-30. **Branch:** `agent/641-waste-multiplier`, cut from
`origin/agent/627-just-in-time-materials` (PR
[#640](https://github.com/matmaxalez/lockstate/pull/640)) at `4bc4aab`,
v0.0.237.
**Question:** [#641](https://github.com/matmaxalez/lockstate/issues/641). The
owner ruled on 2026-08-30 to raise the starting treasury and then, asked for the
number, ruled: **measure the waste first.**

**This record changes no balance value and no price.** It measures so the owner
can choose.

## The claim it exists to test

[`2026-08-30-what-the-whole-economy-costs.md`](https://github.com/matmaxalez/lockstate/blob/agent/641-economy-costing/docs/research/2026-08-30-what-the-whole-economy-costs.md) costed the whole
economy. **It is on `agent/641-economy-costing` and not on this branch**, so it
is linked to that branch rather than by a relative path — and concluded *"the
economy is not short of money"*. Its §9 named its own weakest claim and asked
for exactly one thing:

> the economy is not short of money **for a player who does not waste any**, and
> I do not know the waste multiplier. […] At 3× break-even moves day 4 → day 12;
> at 10× the argument weakens considerably. […] What would change my mind: a
> browser playtest of an unaided first prison that records the treasury at every
> press, giving a measured ratio between what was spent and what the finished
> prison needed.

**The answer is 2.2× to 2.8×**, and the shape of the number matters more than
the number.

## 1. How every figure here was obtained

`tests/browser/playtest-waste-multiplier.playtest.ts`, run under
`tests/browser/playwright.playtest.config.ts` (port 5184, 600 s timeout). Four
profiles, played with the mouse against the real application — real renderer,
real worker, real command router, nothing stubbed.

- **MEASURED** — a treasury value or a panel string quoted from a run's console
  output. Every number in §2–§5 is this.
- **DERIVED** — computed from a shipped catalogue, cited by `file:line`.

**Nothing load-bearing here is a millisecond.** Every action is stamped with the
**tick** it was pressed at, and the ledger is reconstructed afterwards from the
whole `simulation/status-counts` stream, attributing each treasury movement to
the most recent action at or before its tick. The worker publishes counts at
most every `STATUS_COUNTS_PUBLISH_INTERVAL_MS` = 500 ms
(`src/simulation/worker/state-machine.ts:106`), so two debits inside one window
arrive as a single observed decrease — which sums to the same total. The
per-action attribution is therefore coarse and the **totals are exact**.

**Contention.** `ps -eo etime,args | grep "[p]laywright/test/cli"` was checked
and empty before each of the three runs, per `docs/AGENT_WORKFLOW.md` §2.

**Ten sessions across three runs**, and one of them is invalid — §6 says which
and why, because the way it went wrong is the most instructive thing in this
record.

| run | commit | result |
| --- | --- | --- |
| 1 | `e3e4e09` | `3 passed (8.1m)` |
| 2 | `6c7e59b` | `3 passed (13.1m)` |
| 3 | `5375903` | `4 passed (12.3m)` |

**The table names the published commits, which are not the ones the runs were
performed at.** The runs happened on this branch while it was still based on
`agent/627-just-in-time-materials`.
[#640](https://github.com/matmaxalez/lockstate/pull/640) then squash-merged, so
that base is not an ancestor of `main`, and the integrator rebased this branch
onto `main` rather than merging — a plain merge produced add/add conflicts on
everything both sides carried. The rebase rewrote all three shas. **The trees
and the subjects are unchanged**, so every number below still belongs to the
run beside it; the anchor moved and the measurement did not.

The original run-1 sha still resolves, on `origin/wip/641-waste-multiplier`;
the other two were only ever ancestors of a branch head that no longer exists
and are therefore not cited here — an unresolvable sha in a document is what
`tests/foundation/documentation-commit-citation-contract.test.ts` exists to
stop, and it caught this table on the first push after the rebase. Its
`UNPUBLISHED_BY_ORIGIN` list stays empty: an entry belongs there only when the
anchor genuinely cannot move, and here it could.

## 2. The denominator, measured rather than quoted

**Profile 0 — the control.** The same prison the other profiles finish with, a
2×3 `room.cell` in ten `wall-brick` with one `bed-wooden` and one
`toilet-brick`, played without a single mistake:

```
[0/control]   build: trace the 2x3 cell perimeter: -800
[0/control]   build: place a bed inside the cell: -65
[0/control]   build: place a toilet inside the cell: -40
[0/control]   free: admit one prisoner: +300
[0/control] gross debits 905 | gross credits 300 | opening 25000 | closing 24395
```

**905**, twice, to the minor unit — run 3 deliberately, run 2 by accident (§6).
It is `10 × 80 + 65 + 40` exactly, and it sits **15 above** the costing
document's canonical **890** — which is the whole of that record's door-for-a-
wall substitution, `80 − 65`. An unaided player does not know a door seals a
perimeter more cheaply than a wall, so they pay 905 where a perfect player pays
890.

Everything below is a ratio against **905**, because a denominator measured in
the same harness on the same tree is worth more than one quoted from another
document. Ratios against 890 and against the 2,105 of PR
[#655](https://github.com/matmaxalez/lockstate/pull/655)'s playtest are printed
beside it in the raw output.

## 3. The multiplier

| profile | run 1 | run 2 | run 3 | **× the 905 control** |
| --- | --- | --- | --- | --- |
| **A — the careful first-timer** | 1,985 | *invalid, §6* | 1,985 | **2.19×** |
| **B — the ordinary first-timer** | 2,345 | 2,570 | 2,410 | **2.59× – 2.84×** |
| **C — the enthusiastic drag** | 10,080 | 24,480 | 24,480 | *not a prison, §5* |

**So: 2.2× for a player who makes one mistake and notices it, 2.6–2.8× for one
who makes several and does not.** Profile A reproduced to the minor unit across
two runs; profile B varied by 9% because the game itself refused a different
number of duplicate wall orders each time (§4.2).

Against the costing's own thresholds — *"At 3× break-even moves day 4 → day 12;
at 10× the argument weakens considerably"* — **this is the 3× case, not the 10×
case, and §8 of that record survives.**

Where break-even actually lands is **DERIVED, not measured here**: no session in
this pass ran further than the first day boundary after admission, so the
following is arithmetic on the costing's own §4 grant curves and nothing more.
A cells-only prison's cumulative grant runs 300, 560, 820, 1,080, 1,300, 1,480,
1,660, 1,840, **2,020** — so profile A's 1,985 is repaid on **day 9**. A cell
with one guard grants 300 for four days and then decays to 220, against an 80
wage every day — so it nets 220, 220, 220, 220, 180, then 140 for ever, and its
cumulative reaches 1,060 on day 5 and **2,460 on day 15**. Profile B's 2,410 is
repaid on **day 15**.

Two things about that pair of numbers. It is **worse** than the costing's own
projection for 3× (*"day 4 → day 12"*), and the extra three days are not the
waste — they are **profile B's guard**, hired on day 1 with nobody to guard, and
still drawing 80 a day against the 40 of `safety` income a single prisoner
unlocks. The costing's §5 already priced that exactly: one prisoner and one
guard is **−40 a day**. And day 15 at ×1 is 30 real minutes. **The honest cost
of an ordinary player's waste is not insolvency; it is a longer wait**, and the
single largest component of the wait is a hire the game gave no reason to make
yet.

## 4. The four shapes of waste, and they are not the same kind of loss

### 4.1 Undone geometry is *illiquid*, not destroyed — and this is the finding

Profile A traces a 6×6 perimeter, thinks better of it, and takes it back with
`Undo` (`KeyZ`, `src/input/bindings.ts:64`). **Run 3**, verbatim (run 1 gave the
same eight figures at different ticks):

```
press "trace a 6x6 perimeter with the wall tool" at tick 2510: 25000 -> 23080 (-1920) | 24 PlaceBuildOrder command(s)
press "Undo (KeyZ) #1 of the 6x6" at tick 4836: 23080 -> 23080 (0)
press "Undo (KeyZ) #2 of the 6x6" at tick 5061: 23080 -> 23080 (0)
press "Undo (KeyZ) #3 of the 6x6" at tick 5269: 23080 -> 23080 (0)
press "Undo (KeyZ) #4 of the 6x6" at tick 5473: 23080 -> 23080 (0)
press "trace the 2x3 cell perimeter" at tick 6249: 23080 -> 23080 (0) | 10 PlaceBuildOrder command(s)
press "place a bed inside the cell" at tick 11694: 23080 -> 23015 (-65)
press "place a toilet inside the cell" at tick 12286: 23015 -> 23015 (0)
```

Read those eight lines together. **The undo refunds nothing, and the ten walls
that follow it cost nothing, and so does the toilet.** The mechanism is
DERIVED and deliberate on both sides:

- `JustInTimeMaterialsService` *"never credits the treasury. There is no refund
  path here, in either direction"*
  (`src/simulation/economy/just-in-time-materials.ts`). The money left at the
  press and it does not come back.
- `ConstructionSystem.cancelOrder` releases `materialsAllocated` to the
  container (`src/simulation/construction/system.ts:565`), and nothing clears
  that field when an order completes — it is written once at allocation
  (`system.ts:768`). `undo()` delegates to `cancelOrder`, so **the bricks come
  back in kind**.
- The next order's just-in-time deficit nets off what the container already
  holds, so a subsequent build draws on them and buys nothing.

So profile A's 1,985 decomposes exactly:

| | |
| --- | --- |
| bricks bought by the 6×6 (24 segments × 2) | 48, for 1,920 |
| planks bought for the bed | 1, for 65 |
| **consumed by the prison that stands at the end** | 21 bricks + 1 plank = **905** |
| **still in the container, useful, and unspent** | 27 bricks = **1,080** |
| **destroyed** | **0** |

`905 + 1,080 = 1,985`. **Half of profile A's "waste" is not waste at all.** It
is the opening balance converted into a material the player still owns and can
still build with — an *illiquidity*, not a loss. The multiplier is 2.19× and the
destroyed fraction is zero.

**And nothing on screen says the 27 bricks exist.** The Build panel has a
deliveries block for material *on the way*
(`'hud.build.deliveries': 'On the way'`, `src/content/default-locale-en.ts:566`)
and the whole locale file contains no readout of material **held**: the only
other occurrence of the word is `'hud.build.buy-hint': 'Arrives while the clock
runs, into the stock a build draws from.'` (`:519`). A player who undoes a
6×6 has 1,080 of goods and no way to see them. That is a product observation,
and the copy that would fix it is the owner's under `AGENTS.md`.

### 4.2 Abandoned geometry is destroyed, and it is the bulk of a bad session

Profile B draws two wall runs across open ground that enclose nothing, then does
two further things before ever reaching for `Undo` — which pops one transaction,
so the runs are out of its reach for the rest of the session. Run 3:

```
press "drag one wall run across open ground, row 11 (encloses nothing)" at tick 823: 25000 -> 24120 (-880) | 11 PlaceBuildOrder command(s)
press "drag a second run at right angles, column 6 (still encloses nothing)" at tick 1272: 24120 -> 23640 (-480) | 6 PlaceBuildOrder command(s)
```

**1,360 for 17 wall segments that are not part of any room.** Their bricks were
consumed by geometry, so they neither refund nor return; the only escape is an
`Undo` the stack can no longer reach.

One consolation, and it is measured rather than assumed: **some of it is
accidentally recovered.** In all three runs the cell perimeter drawn afterwards
overlapped the stray row, and the game refused the duplicate segments — *"The
build order failed — that order already exists."* — so the ten-segment cell cost
720 in runs 1 and 2 (nine paid) and **640** in run 3 (eight paid). A wall that
happens to be in the right place is a wall.

Profile B's run 3 total decomposes exactly the way profile A's does, and the
shares are the point:

| | |
| --- | --- |
| consumed by the prison standing at the end | 8 new walls + 2 reused stray walls + bed + toilet = **905** |
| destroyed — stray geometry that never became a room | 1,360 − 160 reused = 1,200 |
| destroyed — the bed that was removed | 65 |
| recurring — the early hire and two days of its wage | 80 + 160 = 240 |
| **gross debits** | **2,410** |

**Half of an ordinary bad session is destroyed value and half of a careful one
is not.** That is the difference between profile A's zero destroyed and profile
B's 1,265, and it is the whole reason these shapes are kept apart.

### 4.3 A removed object is destroyed, and the game says so before you press it

Profile B builds a bed, then changes its mind about which tile it wants:

```
press "place a bed inside the cell" at tick 5886: 22840 -> 22775 (-65) | 1 command(s)
press "remove the finished bed, having changed your mind about the tile" at tick 6253: 22775 -> 22775 (0) | 1 command(s)
press "place the bed again, one tile over" at tick 6784: 22775 -> 22710 (-65) | 1 command(s)
```

**65 destroyed.** The removal itself is free and returns nothing; the second
plank is bought fresh. DERIVED: `ObjectPlacementService.remove` deletes the
object from `PlacedObjectRegistry`
(`src/simulation/objects/object-placement-service.ts:448,453`) and never touches
the order, so `materialsAllocated` is never released. Removing an order still
*building* does cancel it (`:472`) and does give the material back.

**The game states this asymmetry in advance**, which is worth recording because
so much of #629's sweep found the opposite: `'hud.build.remove-hint'` reads
*"Press any tile of an object to take it away. One still being built is
cancelled and its materials come back; a finished one is not refunded."*
(`src/content/default-locale-en.ts:506`). ADR 0076's decision B — full refund by
either route — is not implemented, and this is what "not implemented" costs a
player: 65 per change of mind, disclosed.

### 4.4 An object placed before the room exists costs nothing — an empty category

The brief for this pass listed *"objects placed in the wrong room, or before the
room existed"* as a shape of waste. **The first half is not one.** Measured in
all three runs:

```
press "place a bed on open ground at (9,14), before any room exists": 23640 -> 23640 (0)
  | band The object was not placed — it has to stand in a room you have zoned.
press "press Remove on the tile where that bed is not": 23640 -> 23640 (0)
  | band Nothing was removed — there is no object on that tile, and none being built there.
```

A refused placement mints no order, so `JustInTimeMaterialsService` is never
asked and no money leaves. The refusal is what makes it not a shape of waste,
and the probe stays in the script so the empty category keeps its evidence.

### 4.5 An early hire is recurring, and it is small

Profile B hires a guard on day 1 with no prisoners. The control reads
`"Hire Guard · 80"`; the charge is 80, and `PayrollSystem` bills 80 again at
every in-game day boundary. Over the session that was **80 + 240** in run 2
(three boundaries crossed) and **80 + 160** in run 3.

It is the smallest of the four shapes here, and the only one that keeps
growing. The costing already established the counterpart: hiring to the
requirement is profitable from two prisoners onward and ten guards against one
prisoner takes 41 in-game days to reach arrears. **A first-timer's early hire is
a rounding error, not a trap.**

## 5. Where the balance gets to, and it is 520

The costing's §6 found the single failure mode — *"cash below 65, no plank in
stock, nothing plank-built to reverse"* — and put it at `floor(25,000 / 80) =
312` wall segments, adding that *"312 is two or three rooms' worth of wall — an
ordinary first build, not a reckless one"*. That was arithmetic against the
price list. **Profile C presses the mouse instead.**

It measures the tile window the mouse can reach at the default camera and 100%
interface scale by asking `document.elementFromPoint` rather than guessing —
`{"left":5,"right":22,"top":10,"bottom":21}`, eighteen tiles by twelve — and
then draws wall runs across it, reading the balance after every drag. Runs 2 and
3, identically:

```
press "wall drag 30: (22,10) -> (22,21)" at tick 14865: 1480 -> 520 (-960) | 12 PlaceBuildOrder command(s), 306 segments so far
segments drawn 306 | lowest balance seen 520
gross debits 24480 | gross credits 0 | opening 25000 | closing 520
```

**306 wall segments in 22 drags, without the camera ever moving, and 520 left.**
Six segments short of the lock. The probe stopped because it ran out of *usable*
tile edges, not because it ran out of money: 30 gestures were planned across the
window and **8 were skipped** because one of their two ends sat under a HUD
panel rather than over the canvas. 306 is therefore a floor on what one
screenful buys, not a ceiling — the window's full geometry is 216 horizontal
edges plus 216 vertical, and a player who does not have to satisfy an automated
reachability check would reach more of them than this probe could.

Two things follow, and they sharpen #641 rather than restating it.

- **The lock is one screenful.** #641's own correction, after PR #655's
  playtest, was that *"reaching 313 took 24 separate drags over six and a half
  minutes"* and therefore *"not by one gesture"*. That stands. What this adds is
  the other half: those drags need **no camera movement at all**. 312 is not a
  number a player has to hunt for across the map; it is what is under the
  cursor when the game opens.
- **The game says nothing.** At a balance of 520 with 306 wall orders queued,
  `grep -oiE "(afford|money|funds|low|warn|short|cannot|unfunded|treasur)"` over
  a dump of the entire `.hud` — every panel, every band, folded sections
  included — matches exactly one token: **`FUNDS`**, the label on the number
  itself. No warning, no reserve, no preview. The costing said *"there is no
  warning, no reserve, and no preview of what a drag will cost"* from the code;
  this is that sentence measured by playing.

**In no session that finished a prison did the balance go anywhere near 65.**
The minimums were 23,015 (A, both runs) and 22,430–22,655 (B, three runs). **The
floor is not reached by wasting money on a prison. It is reached by drawing
wall**, and those are different failures that #641 has so far discussed as one.

## 6. The session that was invalid, and why it is in here

Run 2's profile A reported this:

```
press "trace a 6x6 perimeter with the wall tool" at tick 3581: 25000 -> 25000 (0) | 6 PlaceBuildOrder command(s)
...
gross debits 905 | MULTIPLIER against the 890 minimum viable prison: 1.02x
```

**A multiplier of 1.02× is what a session with no waste in it looks like, and
that is exactly what happened — for a reason that has nothing to do with the
game.** `calibrate` (`tests/browser/playtest-harness.ts`) arms the Build panel's
Remove tool, bisects the screen-to-tile transform with it, and clicks it a
second time to put it back. One of those clicks did not land. The four gestures
of the 6×6 therefore produced six `RemoveObject` commands instead of
twenty-four `PlaceBuildOrder`s, cost nothing, and built nothing; the refusal
band read *"Nothing was removed"* where run 1's had read the zoning refusal; and
the session went on to play a flawless prison.

Had this been the only run, this record would have reported **1.02×** and
concluded there is no waste at all.

What caught it was not the multiplier — it was the **command count in the
note**, `6 PlaceBuildOrder command(s)` against run 1's `24`, printed beside
every press for exactly this reason. The fix is `setRemoveTool`, which reads the
panel's own `data-removing` attribute (`src/ui/hud/build-panel.ts:1072`) instead
of toggling and asserting nothing.

And then the accident was promoted: its 905 is the control in §2, reproduced
deliberately in run 3 to the minor unit. **The session stays in this record
because a pass that only reports its valid runs is one where nobody can tell how
close it came to a false finding.**

## 7. What this means for the starting treasury

The owner's options were **50,000 / 100,000 / 250,000**. Two measured facts bear
on the choice, and they point in different directions.

**The multiplier says the treasury is already sufficient.** An ordinary first
prison costs 2,410–2,570 gross. 25,000 buys **ten of them**; 50,000 buys twenty;
250,000 buys a hundred. At 2.8× waste a first prison is **10.3%** of the opening
balance, and §3's arithmetic repays it on **day 15** — 30 real minutes at ×1,
against a perfect player's day 4. Nothing measured here is short of money, and
raising the treasury buys nothing for *affordability*, because affordability was
never the constraint. What waste costs is **the wait**, and no opening balance
shortens a wait.

**The only thing a bigger treasury buys is distance from the drag trap**, and
that distance is linear and measurable in the unit §5 established — one
screenful of exhaustive walling is **306 segments**:

| opening balance | segments to the lock | **screenfuls** |
| --- | --- | --- |
| 25,000 (today) | 312 | **1.0** |
| 50,000 | 625 | 2.0 |
| 100,000 | 1,250 | 4.1 |
| 250,000 | 3,125 | 10.2 |

On that criterion:

- **50,000 is measurably insufficient.** Two screenfuls is 44 drags and one
  camera pan. Run 2 did 22 drags in a few minutes without meaning anything by
  it; doubling that is a determined session, not a safe distance.
- **100,000 is the smallest of the three that puts the trap outside anything
  measured here as ordinary drawing** — four screenfuls, ~90 drags, three
  camera pans.
- **250,000 is not wrong, and it buys distance the measurement cannot show is
  needed**, at the cost of an early economy in which 100 first prisons are
  affordable and money is not a thing the player thinks about.

**The recommendation is 100,000**, and it is a recommendation about a number the
owner sets. What must be said with it: **no figure on that table closes the
trap.** At 250,000 the same gesture reaches the same state ten screenfuls later,
and ADR 0075 decision 1's development grant — already Accepted, and what the
costing recommended first — is still the thing that closes it. A larger opening
balance postpones; the grant restores.

## 8. What was not reached

- **Real players.** Every mistake here was scripted by me. §9.
- **Any profile that panned the camera**, so "screenful" means the default
  camera at 100% interface scale and nothing broader.
- **The balance below 65.** Profile C got to 520 and ran out of reachable tile
  edges, not money. Six more segments would have done it; the harness had no
  gesture left that did not need a camera pan.
- **Waste in a *second* room.** Every profile builds one cell. Whether the
  multiplier falls as a player learns is exactly the question a second session
  would answer, and it is unmeasured.

## 9. My weakest claim

**That these are a first-timer's mistakes.** I chose every one of them. The
sources are real — the 6×6 is the costing's *"the shape a player naturally
drags"*, the abandoned run is `2026-08-30-the-naive-route.md`'s *"sixty bricks
for half a perimeter"*, the removed bed is ADR 0076's asymmetry, the early hire
is `2026-08-30-what-the-game-never-says.md`'s payroll finding — but assembling
them into one session and calling the result "an unaided first prison" is an
interpolation, not an observation. **2.2×–2.8× is the spread of my scripts
across ten sessions, not the spread of players.** A real first-timer might make
three of these mistakes twice each, or none of them and two I did not think of.

The number is also **structurally bounded from below in a way a player is not**:
every profile here reaches a working prison. A session that never gets there has
an undefined multiplier and is the failure the owner actually reported.

**What would change my mind:** a session played by a person who has not read the
code, recorded the same way. Failing that, the single most useful next
measurement is the one §8 names — the *second* room, which is where a learning
curve would show up and where a multiplier that stays at 2.8× would mean
something quite different from one that falls to 1.2×.

**What would not change it:** more runs of these same scripts. Profile A
reproduced to the minor unit twice and profile C twice; the variance in this
pass is not sampling noise, it is which mistakes I wrote down.
