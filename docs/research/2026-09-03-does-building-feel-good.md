# Does building feel good? — 2026-09-03

Building is the primary verb of this genre, and the question this record
answers is not whether a drag works. That was settled twice on 2026-09-03:
four drags on the gridlines do enclose a 4×4 room, sixteen orders exactly on
the perimeter, `rooms 0 → 1` first try. This is about whether performing the
act is worth performing.

**The short answer: the machinery under building is honest and the telling of
it is not.** Money is never taken without being given back correctly, a
refusal costs nothing, a cancel refunds to the minor unit, and a finished wall
looks good. Almost every figure and rule that would let a player act on any of
that is either behind a fold, outside the panel, on a key nobody is told
about, or simply absent — and in two places the game states something that is
not true.

Every claim below was obtained by playing the real application through
`tests/browser/playtest-2026-09-03-does-building-feel-good.playtest.ts`
(acts A, D, F, G, H, I, J, K, L and M), at **1440×900**, on this branch. The act and the log line are named
so each can be re-run. **Nothing in CI collects that file**
(`playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`), so it is evidence and
never a gate.

## Ranked, by what would most improve how building feels

1. **Say what a thing costs on its row, before the press** (finding 3). The
   Security tab already does it; nothing has to be designed.
2. **Say that a furniture row needs a room, on the row** (finding 1). Eighteen
   of twenty-one rows, and the Rooms tab already proves this codebase can state
   a requirement before a gesture (finding 7a).
3. **Make the placement hint match the selected row** (finding 2). It is the
   only thing here that is actively wrong, and `occupiesEdge` is already on the
   view model.
4. **Give the Build panel a height it fits in** (finding 4). Until it has one,
   every fix above competes for space that does not exist, and the queue's own
   header renders outside the panel.
5. **Fix the first Undo, or stop announcing it** (finding 5). A false sentence
   is worse than a missing one.
6. **Put a whole-run undo on a control and name its key** (finding 6).
7. **Let a warning be dismissed** (finding 7). Half of it already exists: the
   alerts list gives an `Info` row a `Clear this alert` press and gives the
   refusal-derived `Warning` row none.
8. **Say something when a build finishes** (finding 8). The event band exists
   and construction never uses it.
9. **Widen the arm control so its label fits** (finding 10).

## What is measured here, and what is not

The world origin is **(-304, -574)**, measured by bisection in four separate
runs and confirmed a fifth time in act K from the tiles the orders actually
named. At 1440×900 exactly one rectangle of canvas has no HUD island over it:
roughly **x 420..1160, y 90..430**, which is tiles 12..22 × 11..15. Act H
proved it rather than assuming it — of the 55 tile centres in that rectangle,
**0** are under a HUD island.

That matters more than it sounds. **A press on a point the HUD covers submits
nothing at all** — no command, no refusal, no band — so a measurement taken
there is indistinguishable from a game that ignored the press. Three readings
in this playtest's first drafts were that and not findings: a single wall press
at screen y = -62, a bed at x = 1264 behind the Build panel, and eleven
"dead zone" presses at y 66..81 under the status strip. The HUD occlusion is
**#878**'s subject and is not re-derived here. What it cost is recorded because
it will cost the next playtest the same three runs otherwise.

---

## 1. HIDDEN — 18 of the 21 rows the Build tab offers cannot be built yet, and the panel never says so

**Reproduction** (act H, `[H2]`). New prison → Build tab. For each catalogue
row that is not a wall or a door, arm it and press a tile centre inside the
clear rectangle. Result: **0 accepted, 18 refused, 0 silent.** Every single one
comes back

> The object was not placed — it has to stand in a room you have zoned.

Every row's text is its bare name: `Bed`, `Toilet`, `Stove`, `Storage Rack`.
The full Build panel text captured at that moment contains no sentence about
rooms, no disabled row, and no marker of any kind. The player finds the rule
by pressing eighteen times.

**Refuting sample.** Two, both taken.

- *Is the rule real, or is placement broken?* **The rule is real and it is the
  right rule.** Act M zoned a Cell over the same tiles and then placed a Bed at
  (14,12) and a Toilet at (15,13) by pointer: `1 order(s)` each, no refusal,
  and the prison finished at `rooms=1 roomCapacity=1
  accommodationCapacity=1`. Furniture belonging to rooms is good design. Only
  the announcement is missing.
- *Does a refused press cost anything?* No. Act H had placed two walls before
  the sweep, taking 25,000 to 24,840 (2 × 80), and the first read after the
  eighteen refusals — act H `[H3]` — is **24,840**. Eighteen refused
  placements, nothing debited. The refusal is clean; only its announcement is
  late.

**And this codebase already knows how to do it.** One tab over, act G `[G4]`
read the Rooms panel with Staff Room selected:

> NEEDS AT LEAST 3 × 3 TILES / MUST BE ENCLOSED / NEEDS 1 × DESK / NEEDS 2 × CHAIR

Requirements, stated before the gesture. The Build panel is the one place in
the interface that does not do this.

**What a fix must convey** (not the words — those are the owner's): that a
furniture row needs a zoned room before it can be placed, said on or beside the
row, before the press.

---

## 2. DEFECT — the placement hint tells the player to click a tile edge to place a wall, whatever they have selected

**Reproduction** (act I, `[I4]`). Select each of `wall-brick`, `door-wooden`,
`bed-wooden`, `toilet-brick`, `storage-rack-wooden` in turn and read
`.hud-build__note`. All five give the same sentence:

> Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.

A bed does not sit on a tile edge. `HudBuildableViewModel.occupiesEdge` is
derived from `occupiesTileEdge` (`src/ui/hud/view-model.ts:641`), and
`bed-wooden` places an object instead. The correct gesture for it is a press on
the tile, and the hint names the wrong one.

There is one arm-hint key — `hud.build.arm-hint`
(`src/content/default-locale-en.ts:1114`) — and `build-panel.ts:1271` swaps it
out only for the *Remove* hint:

```ts
armHint.textContent = t(removing ? HUD_MESSAGE_KEY.buildRemoveHint : HUD_MESSAGE_KEY.buildArmHint);
```

**Refuting sample.** *Is `.hud-build__note` the wrong element?* No — the text
read back is byte-identical to `hud.build.arm-hint`, and there is no second
arm-hint key in the locale file to have been read instead.

This is the one finding here that actively misleads rather than merely
withholds. It is also the cheapest: the panel already knows `occupiesEdge` per
row.

---

## 3. HIDDEN — nothing tells the player what a build costs, before or after

**Reproduction.** Act F `[F1]` walks all 21 rows with the panel in the state it
arrives in and reports, for every one of them, *"numerals anywhere in the
panel: `""`"*. **Zero digits in the whole Build panel**, twenty-one times.
`.hud-build__buy` is `not laid out`. Act G `[G5]` then sweeps every visible
element in the panel for `title`, `aria-label`, `aria-description`,
`data-cost`, `data-price`: three attributes exist in total —
`title=Collapse`, `aria-label=Category`, `aria-label=What to build` — and
**none contains a digit**.

The price does exist, one press away. With the Buy fold open the submit button
reads

> Buy 2 × Brick · 80

which is the true per-placement cost of a wall: brick at 40
(`src/content/procurement-catalog.ts:100`) × 2 per wall
(`src/simulation/construction/definition.ts:89`). Act A confirmed it in the
treasury — a five-segment drag took funds 25,000 → 24,600, exactly 5 × 80,
**at the moment of the drag and with the clock paused**.

So the only price in the interface is on the face of a control labelled *Buy*,
framed as a shopping trip rather than a price tag, inside a fold that arrives
shut.

**Refuting sample, and the comparison that makes this a finding rather than a
preference.** The **Security** tab does it right. Act G `[G4]`:

> WHO TO HIRE / Guard / Selected / **Hire Guard · 80** / Costs 80 now and 80 a day in wages. / A new guard starts unassigned.

Price on the button face, the ongoing cost spelled out, nothing folded. The
same codebase, the same session, one tab away. Whatever the Build panel's
height budget is, it is not a reason the pattern cannot exist — it is a reason
to argue about where.

---

## 4. DEFECT — the Build panel needs 765px, has 437px, and does not scroll

**Reproduction** (act I, `[I3]`), 1440×900, one 5-tile run queued:

| element | box | verdict |
| --- | --- | --- |
| `.hud-build > .ui-panel__body` | top 77, bottom 514, clientHeight **437**, scrollHeight **765**, `overflow-y: visible`, `max-height: none` | — |
| `ui-section hud-build__catalogue` | 85 → 181 | inside |
| `hud-build__map` | 181 → **565** | **clipped**, 51px past the bottom |
| `ui-section hud-build__coordinates` | 565 → 610 | **entirely below the panel** |
| `ui-section hud-build__queue` | 610 → **842** | **entirely below the panel** |
| the QUEUED section's own header | 611 → 655 | **entirely below the panel** |

328px of content renders outside the box it belongs to, and
`overflow-y: visible` with `max-height: none` means nothing can bring it back.

The screenshot `H03` shows what that looks like with seven deliveries pending:
the catalogue has collapsed to **one visible row out of twenty-one**, the
deliveries block's last line is cut off mid-sentence — *"and 4 more on the way
— these arrive first, and the rest come into view as they"* — and the QUEUED
block is nowhere on the panel at all.

**Refuting sample.** *Is it merely cosmetic — is the content still reachable?*
Partly, and the answer is worse than a clean yes or no. At 1440×900 act I
pressed the QUEUED header at y 611 and it opened; a Cancel at y 653 worked and
refunded correctly. So the content is *clickable while looking broken* — it
floats over the world below a panel that appears to have ended. What is not
reachable is anything past about y 820, where `H03` shows the cut.

This is the finding that makes finding 6 possible, and it is why finding 3's
"the panel has no room for a price" defence does not settle anything: the panel
is already 75% over its budget with the price still hidden.

---

## 5. DEFECT — the first Undo does nothing and the game says it undid something

This is the one place building actively lies, and it took four acts to
establish because there was an innocent explanation to refute first.

**Reproduction** (act K, `[K1]`). Fresh prison → Build tab → arm Brick wall →
drag a 5-tile run. Six orders land at `13,13 north` … `18,13 north`, treasury
25,000 → 24,520 (480 taken), queue `6 waiting · 0 being built`. Click a clear
point in the world. Press **Z** once.

- One command goes out: `{"type":"Undo"}`. So it is not an input-binding miss.
- Treasury: 24,520 → **24,520**.
- Queue: **`6 waiting · 0 being built`**.
- The event band: **"The last change to the build queue was undone."**
- The alerts list keeps it as an `Info` row, dated Day 1.

Act J then pressed a **second** Z on the same state: treasury 24,520 → 25,000,
all 480 back, and the queue block gone. So the mechanism is not broken in
general — the second press does exactly the right thing.

**Refuting samples, all three taken.**

- *Did a refused Remove earlier in the session eat the first undo?* No. Act K
  ran the identical walk on two prisons differing by exactly one press — K1
  with **no** Remove press anywhere, K2 with one refused Remove at an empty
  tile — and both gave the same result: one `Undo` command out, treasury
  unchanged, queue unchanged, the same sentence on the band. The theory the act
  was written to test is refuted.
- *Was the first Z merely slow?* **No — act L settled it.** One Z, then nothing
  pressed but the transport. Four reads while paused across 11 s: treasury
  24,520, queue `6 waiting`, every time. Then the clock at 1× for eight more
  reads, and the queue **drained normally** — `6 waiting`, then `5 waiting · 1
  being built`, 4, 3, 2, 1, empty — reaching tick 500 with the treasury still
  at **24,520**. All six walls were *built*, not undone. The event band read
  *"The last change to the build queue was undone."* for all twelve of those
  reads.
- *Is the Undo command being sent at all?* Yes — one `{"type":"Undo"}`, read off
  the worker tee.

The sentence is `hud.alert.event.construction.undone`
(`src/content/default-locale-en.ts:910`), and the simulation is emitting it, so
the kernel believes it undid something. Whatever it undid, it was not the run
the player had just drawn.

---

## 6. HIDDEN — the only control that takes back one order is behind a fold whose header is a count, and the one that takes back a run is a key nobody is told about

**Reproduction, part one** (act D). Twelve orders placed, seven survive, and the
panel offers: `QUEUED / 7 waiting · 0 being built`. Three row elements exist in
the DOM, every one of them `hidden: true` with height 0, and
`.hud-build__queue-more` is `not laid out`. A player who wants to cancel one
order sees a count and nothing else.

**Refuting sample, taken, and it clears the mechanism completely** (act I,
`[I1]`). One press on `.hud-build__queue .ui-section__header` sets
`aria-expanded="true"`, lays out **3 of 3** rows with full and genuinely good
text —

> Brick wall · 13, 13 · North · 80 back / Approved / Cancel

— shows the "more" line, and one Cancel refunds **exactly +80** (24,520 →
24,600). Nothing is broken. It is also deliberate: `BUILD_QUEUE_ROW_LIMIT`'s
comment in `src/ui/hud/build-panel.ts` says the block *"is collapsed when it
appears, so a queue costs a header and not a list until the player asks for
one"*, and the height measurement behind that decision is real.

So this is discoverability alone — except that the section it collapses into is,
per finding 4, rendered **outside the panel**, so the press that opens it does
not look like part of the Build panel at all.

**Reproduction, part two** (act I, `[I2]`). Every line of text in `.hud` and
`.save-panel` matching `/key|keyboard|press [A-Z]|Z|shortcut|undo/i` — the
whole HUD, one prison, one read. Exactly **one** line comes back, and it is the
arm hint's *"the arrow keys still move the camera"*.

Meanwhile `src/input/bindings.ts:64` binds `edit.undo` to bare **`KeyZ`**, and
`build-panel.ts`'s own comment calls it the answer to *"I have changed my mind
about that whole run"*. There is no Undo control: the Build panel's actions are
`Place on map`, `Remove`, `Buy`. The only mention of undo anywhere in the
interface is inside `hud.build.queue-more` —

> and 3 more behind these — undo takes back a whole run.

— which names no key, and which act D measured as `not laid out` until the fold
is opened.

**A player is told about a whole-run undo, by a word, in a sentence, inside a
fold, in a section rendered outside the panel, and is never told which key it
is.** That is the shape the owner's second directive names.

---

## 7. TASTE — a refusal stays on screen for the rest of the session and there is no press to acknowledge it

**Reproduction** (act A). One Remove press at an empty tile — a thing a new
player does within a minute of finding the Remove button — puts

> Nothing was removed — there is no object on that tile, and none being built there.

across the top of the world and adds it to ALERTS as a `Warning` row. It was
still there **1,870 ticks later**, after a completed five-wall run
(screenshot `A07`). Act F `[F2]` looked for a way out: `.hud__refusal`,
`.hud-alerts__list` and `.hud__event` between them offer **zero** buttons at
that moment.

Act H `[H1]` is the sharper version. Place a wall at `18,13 north` — succeeds.
Press the same edge again — refused, band reads *"The build order failed — that
order already exists."* Place a **different** wall at `20,13 north` — succeeds,
and appears in the queue as `Approved`. The band is unchanged, and the alerts
list still carries it as a `Warning`.

**Refuting sample, and why this is TASTE rather than DEFECT.**
`src/ui/hud/hud.ts` (the `.hud__refusal` docblock, around line 1040) states the
contract and the reason:

> It does **not** auto-dismiss. A message that clears itself on a timer is a
> race against how fast the player reads, and there is no press to acknowledge
> it — so a host refusal stays until the same action later succeeds, and a
> simulation refusal until another replaces it or the session ends.

"That order already exists" is a simulation refusal, so persisting is exactly
what it is built to do — and act G confirmed the replacement half works, the
band moving from that sentence to *"The object was not placed — it has to stand
in a room you have zoned."* Nothing is broken. What the design left out is the
acknowledging press its own comment names as absent.

**And act K found that half of it already exists.** Reading each alerts row's
own controls, the `Info` row carries a **`Clear this alert`** press and the
refusal-derived `Warning` row does not.

---

## 8. TASTE — a finished wall changes nothing the player was looking at

Stated carefully, because a finished *room* does: act M's ROOMS chip went
`0 → 1` and the Rooms panel moved off `NOT READY`. It is the wall and the
furniture — most of what a player actually does — that land in silence.

**Reproduction** (act A, at 1× on purpose). Five walls ordered; funds move
once, 25,000 → 24,600, at the instant of the drag. Across the next 1,870 ticks:
the FUNDS chip never moves again, ROOMS stays `0`, INCIDENTS stays `Clear`, and
the two dynamic sections of the Build panel — `ON THE WAY` and `QUEUED` —
disappear as they empty. **The Build panel's text after the build (`A07`) is
identical to its text on arrival (`A03`).** The wall sprite is the only
evidence anything happened.

It is a good sprite. That is not a consolation: it means the world is doing all
of the work and none of the rest of the screen is doing any.

**Refuting sample.** *Is there an events channel that could have said so?* Yes
— `.hud__event`, the *"where the prison says what it just did"* band. It was
`not laid out` throughout act A and on the empty prison in act G. Construction
completing produces no event sentence. (Note the asymmetry with finding 5: a
*failed* undo produces one.)

**And the refund window is five seconds of clock.** The `ON THE WAY` block,
with its `2 × Brick · 80 back / Cancel` rows, was present at tick 25 and gone
by tick 148 in act A — and the two reads are 6.2 s of wall clock apart for 123
ticks, which is the 50 ms step running in real time at **1×**. A delivery lands
100 ticks after purchase (`src/content/procurement-catalog.ts`), so the window
in which those rows exist is **5 s at 1× and about 1.25 s at 4×**, plus
however long the player happens to leave the game paused. A control that exists
for a second and a quarter at the speed the game invites you to run is not a
choice a player gets to make.

---

## 9. TASTE — the money is taken invisibly, and the only figure shown for it is a refund

The drag debits immediately and with the clock paused (act A: 25,000 → 24,600
before a single tick). The only number the panel then shows about it is

> 5 bought · 400 back if cancelled

— the amount you would get **back**, never the amount you paid. Nothing named
400 beforehand (finding 3), and nothing names it as a price afterwards. A player
watching the FUNDS chip drop 400 has to work out for themselves that the drag
did it.

---

## 10. DEFECT (small, visual) — the arm button's label is clipped mid-word

`A03`, `A05`, `A07` and `H03`, four screenshots across three separate runs at
1440×900 and 100% interface scale: the button reads **`Place on ma`** and
**`Stop placin`**, its text running under the neighbouring `Remove`, with a
stray icon sitting at x ≈ 1170 outside the button group.

**Refuting sample.** Not a font-loading artefact — it is identical in all four
shots, and the neighbouring `Remove` and `Buy` labels are complete in every
one.

---

## What is *right*, and should not be broken while fixing the above

Stated because a ranked list of complaints reads as a verdict on the whole
thing, and this is not one.

- **A wall looks good.** Five brick segments at tile scale, act A `A07`.
- **The money is honest.** A refused placement costs nothing (18 refusals,
  treasury unchanged). A cancelled order refunds exactly what its row says
  (`80 back` → +80, act I). A cancelled run refunds in full (+480, act J).
- **A queued order's row says everything a player needs**: what, where, which
  edge, what it pays back, what state it is in.
- **A planned order is visible in the world** as a translucent block before
  anything is built (`H03`), so the drag has an immediate consequence on screen.
- **The insolvency copy is exact.** Driven to a negative treasury, the strip
  reads `FUNDS -1,160` beside `25 left` — *"25 left before deliveries stop —
  past that, no materials can be ordered until the state pays what it owes."*
  A standing overdraft is designed, and it is explained. (Two money figures of
  opposite sign side by side is **#870**'s subject and is not claimed here.)
- **Three tabs already do guidance well.** Intake: *"A prison needs a cell
  before it can admit anyone."* Regime: *"No prisoners yet. Build a cell with a
  bed to take somebody in."* Rooms: a per-room-type requirements list. Every
  one of them is better at telling a player what to build than the Build tab
  is.

---

## The action count: 19

**One usable cell, from `New prison` to a room the simulation counts as
accommodation: 19 interactions, and it worked first try.** Act M, every press
narrated and ledgered.

| stage | interactions | what they were |
| --- | --- | --- |
| the walls | **8** | New prison, Build tab, select Brick wall, arm, and **four drags** |
| the room | **5** | Rooms tab, select Cell, arm the zone tool, one drag, Confirm |
| the furniture | **6** | Build tab, select Bed, arm, press the tile, select Toilet, press the tile |
| **total** | **19** | plus **6** transport presses to start and stop the clock, so 25 presses of any kind |

Outcome at tick 1,339: `rooms=1`, `roomCapacity=1`,
**`accommodationCapacity=1`**. Money: 25,000 → 23,615, which is 1,385 and is
exactly right — sixteen walls at 80, a bed at 65, a toilet at 40.

**19 is a good number, and this is the finding that most argues building is
nearly there.** Four drags is the right cost for a room's walls; the zone
gesture worked first attempt from tile centre to tile centre; the bed needed no
edge chooser. Nothing in that sequence is fiddly.

What is expensive is everything *around* it. Of the 19, **six are selecting and
arming** — select a row, then press a second control to arm it, for each of
three buildables — and three are tab changes, because building a cell is spread
across two tabs and the player has to go Build → Rooms → Build. That is nine of
nineteen spent on the interface rather than on the prison.

And the count is only 19 **because this walk already knew four things the game
never says**: that walls go on gridlines and rooms on tile centres, that
furniture needs the room first, that the room wants a bed and a toilet
specifically, and that the clock has to be running for any of it to happen. A
player learning those by experiment does not spend 19.

---

## 7a. The guidance the Build tab lacks exists — on the Rooms tab

Worth its own heading because it is the single best thing in this playtest and
it is in the wrong place.

**Reproduction** (act M). Press 10 selects `Cell` in the Rooms panel, before any
drag, and the panel says:

> NEEDS AT LEAST 2 × 3 TILES / MUST BE ENCLOSED / NEEDS 1 × BED / NEEDS 1 × TOILET

Then after the room is zoned and before the furniture exists:

> NOT READY / 1 of 1 / **Cell at 13, 11 is missing 1 × Bed, 1 × Toilet** / NEEDS AT LEAST 2 × 3 TILES / MUST BE ENCLOSED / NEEDS 1 × BED / NEEDS 1 × TOILET / ENCLOSURE / Walled in on every side

That is exactly *what to build next*, named by room, by position, and by
quantity — and it confirms the enclosure separately. It is the answer to the
question the Build tab cannot answer, and it is one tab away from the Build
tab, reachable only after the player has already worked out unaided that walls
come first and that a room has to be drawn over them.

**Refuting sample.** Does anything on the Build tab carry it? No — act F `[F1]`
and act H `[H2]` both dumped the whole Build panel and neither contains a
sentence about rooms, requirements or what to place next.

---

## The four obvious wrong things, and what the game does about each

Asked directly, because they are the moments a player's opinion of building is
formed.

| the wrong thing | what happens | verdict |
| --- | --- | --- |
| drag a room with no walls | the pre-confirm panel says `MUST BE ENCLOSED` and the refusal band explains it in a sentence (settled earlier on 2026-09-03; `src/ui/room-tool.ts:158`) | **handled well** |
| place furniture with no room | eighteen rows all refused, correctly and for free, with nothing said in advance (finding 1) | **HIDDEN** |
| run out of money mid-build | act F drove the treasury to -1,160 and the strip read *"25 left before deliveries stop — past that, no materials can be ordered until the state pays what it owes"*. A run ordered at -1,160 still built, from stock already bought. The overdraft is designed and explained | **handled well** |
| cancel halfway | one order's Cancel refunds exactly its stated `80 back` (act I); a whole run comes back for its full 480 on the *second* Z (act J). But the per-order control is behind a fold outside the panel (finding 6) and the first Z lies (finding 5) | **mixed** |
| press Remove and miss | a red band and an ALERTS `Warning` for the rest of the session, with no press to clear it (finding 7) | **TASTE** |

## The weakest claim in this record

**Finding 5's mechanism, not its behaviour.** What is measured is airtight:
one `{"type":"Undo"}` goes out, nothing in the build queue or the treasury
moves across 500 ticks, all six orders build, and the band asserts an undo
happened. What is *not* established is **what** that Undo actually popped — it
is plainly popping something, since the kernel emits
`hud.alert.event.construction.undone`, and this playtest never found out what.
So the finding should be relayed as "the first Undo does not undo the run and
says it did", not as a diagnosis. What would change my mind about the
behaviour: the same walk on a prison where some earlier build transaction
exists, showing the first Z taking *that* back — which would make this an
off-by-one in the transaction stack rather than a no-op, and would change the
fix without changing the fact that the band lied.

Second weakest: finding 4's *"does not scroll"*. `overflow-y: visible` with
`scrollHeight 765 > clientHeight 437` is what was measured, and no wheel
gesture over the panel and no keyboard scroll was tried. If some ancestor
scrolls, the sections below the box are ugly rather than at risk. What would
change my mind: a wheel event over `.hud-build` moving any ancestor's
`scrollTop`, or the same measurement at a taller viewport putting the QUEUED
section inside the box.

## One thing corrected in the record, not in the game

**The game normalises a tile edge to the lower-numbered tile, and a playtest
that does not know this will report a working perimeter as a broken one.** The
south edge of (13,14) comes back from the worker as `13,15 north`; the east
edge of (16,12) as `17,12 west`. One boundary, named one way — not two
boundaries. Act B compared the sixteen segments its four drags produced against
a list written in the south/east spelling, concluded eight were missing, queued
eight duplicates and then hung. The perimeter was correct the whole time:
*"FOUR DRAGS WANTED 16 SEGMENTS AND PRODUCED 16"*, `13,11 north` … `16,11
north`, `13,15 north` … `16,15 north`, `13,11 west` … `13,14 west`, `17,11
west` … `17,14 west`. Exactly the perimeter of (13,11)-(16,14), no gap, no
overlap.

## What this record does not touch

- `src/rendering/build/edge-picking.ts` and
  `src/rendering/scene/world-scene.ts` — other agents own them, and the
  mid-line tie-break between the ghost and the run is PR **#892**.
- The HUD occlusion of the canvas is **#878**. Its headline "84 of 308 tiles
  reachable" is contested and no number for it is quoted here; what is measured
  above is only that the rectangle acts H–L used is clear, and that a press on
  a covered point submits nothing at all.
- The two money figures in the status strip are **#870**.
- The seven room types with no reference outside the catalogue are **#595**.
