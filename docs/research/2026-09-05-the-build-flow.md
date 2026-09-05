# The build flow, end to end — and what it should be instead

**Date:** 2026-09-05
**Tree played:** `b984445f` (**v0.0.475**), which was `origin/main` when this
pass started and still was when it finished — `git fetch origin && git log -1
origin/main` gave `b984445f chore(release): v0.0.475` at both ends. Worktree
`/workspace/wt-the-build-flow`, branch `agent/playtest-the-build-flow`. Nothing
under `src/` differs from that commit: this branch adds one `.playtest.ts` and
this file. The running page confirmed it from inside — the status strip read
`v0.0.475 · b984445` on the first runs and `v0.0.475 · 2aefacc` after the
instrument was committed, `2aefacc` being this branch's instrument-only commit.

**Question, as given:** *building is this game's primary verb — the thing a
player does most, from the first minute to the last. Play it as a whole flow,
end to end, many times, and then say what it should be instead.*

**Viewports:** 1920×1080, 1440×900, 1280×720, 1024×768. The default is
1440×900 unless a line says otherwise.

**Instrument:** `tests/browser/playtest-2026-09-05-the-build-flow.playtest.ts`,
acts 1 to 10. **Nothing in CI collects it** — `tests/browser/playwright.config.ts`
is `testMatch: /.*\.spec\.ts$/` — so it is evidence and never a gate.

Every claim below is labelled **MEASURED** (from a run of that file, quoted) ·
**VERIFIED, read** (the file was opened at that line) · **REASONED** (follows
from stated MEASURED/VERIFIED facts) · **JUDGEMENT** (what a player would do or
feel). Nothing is from memory.

---

## The verdict, in one paragraph

**Building works, costs the right money, and is invisible.** A cell went up
first try in 22 interactions and the ledger is honest to the minor unit — but
**seven of those 22 change the prison and fifteen operate the interface**; the
catalogue that is the whole of what a player may build shows **5 of its 21 rows
through a window with a 0.0px scrollbar gutter**, hiding 701px with nothing on
screen saying so; **the panel contains no digit at all** until a placement has
already happened, and the digits that then appear are refunds; the money readout
is **identical in text, badge and colour from 25,000 down to 1,000**; and — the
finding this pass did not expect — **the world does not change when a wall is
built.** The clipped world at *"16 waiting · 0 being built"*, at *"16 waiting ·
1 being built"* and at *"0 waiting · 0 being built"* is one byte-identical
image, and it stays that way for **eleven seconds after the panel says the walls
are up**, because the renderer's snapshot feed marks itself dirty on a command
being *accepted* and never on a construction *completing*, so the next thing
that draws the wall is a 30-second consistency poll. The best moment in building
— a translucent grey plan turning into bright cream brickwork — happens off
screen, on a timer, after the player has stopped looking.

---

## How to reproduce each act

From the worktree root, one act at a time:

```bash
LOCKSTATE_BROWSER_TEST_PORT=5330 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-the-build-flow.playtest.ts -g "act N"
```

| act | what it plays |
| --- | --- |
| 1 | the catalogue as a container, at three viewports, filter swept |
| 2 | reaching row seventeen by wheel, by filter, by keyboard |
| 3 | the newcomer, who fences a square by pressing four tile centres |
| 4 | one cell end to end, every interaction ledgered |
| 5 | what a thing costs, and what the Buy control says per row |
| 6 | the world at queued, being built, and finished |
| 7 | the screen as area — every HUD island measured |
| 8 | the FUNDS chip from 25,000 downward |
| 9 | when, in seconds, a finished wall appears |
| 10 | what fits on a catalogue row |

A bare `playwright test <file>` finds no config and every navigation fails with
*"Cannot navigate to invalid URL"*, which reads like a broken app.

---

## 1. DEFECT — the world does not change when a wall is built, for up to thirty seconds

This is new, it is the most player-damaging thing in the flow, and it took a
refuting sample to find the mechanism rather than the symptom.

**The symptom** (act 6, MEASURED). Four wall runs, sixteen orders, one 8×8-tile
clip of canvas screenshotted at three moments. The md5 of the clip:

| moment | the panel said | clip md5 |
| --- | --- | --- |
| bare ground | — | `447bf87aae6af5151a6cc01e06e51c0a` |
| sixteen queued, paused | `16 waiting · 0 being built` | `81fc2de63fd11fbfa4344ea3a9ff80eb` |
| being built, 1× | `16 waiting · 1 being built` | `81fc2de63fd11fbfa4344ea3a9ff80eb` |
| finished, 4× | `0 waiting · 0 being built` | `81fc2de63fd11fbfa4344ea3a9ff80eb` |

**Three states, one image, byte for byte.** The same held for furniture: a bed
queued inside a zoned cell and the same bed finished — with
`accommodationCapacity` going 0 → 1 on the worker channel — are both
`7bf3a66fe2f4d65999602483f8567d4a`.

**The refuting sample, which is where the mechanism is** (act 9, MEASURED).
Four walls, one run, hashed once a second from the moment the clock started:

```
[A9] four walls queued (paused): 0db5e11eb1 — differs from bare: true
[A9] the panel said the queue was empty at t+19371ms, tick 387
  t+16003ms tick 321 queue "QUEUED 1 waiting · 1 being built" clip 0db5e11eb1 (SAME AS QUEUED)
  t+20153ms tick 408 queue ".hud-build__queue: not laid out" clip 0db5e11eb1 (SAME AS QUEUED)
  t+24203ms tick 484 queue ".hud-build__queue: not laid out" clip 0db5e11eb1 (SAME AS QUEUED)
  t+28323ms tick 571 queue ".hud-build__queue: not laid out" clip 0db5e11eb1 (SAME AS QUEUED)
  t+30380ms tick 612 queue ".hud-build__queue: not laid out" clip 32742dfa6c (CHANGED)
```

So the world stayed *identical to the unbuilt, ghosted state* for **11.0
seconds after the Build panel stopped showing a queue at all**, and changed at
**t+30.4 s** — which is the poll, not the build.

**The mechanism** (VERIFIED, read). `src/rendering/feed/simulation-snapshot-feed.ts`
lists in its own header exactly when it asks the worker for geometry:

> - once when a session becomes ready, to get the initial world;
> - after any command is accepted, since commands are what change geometry,
>   and again once the simulation reaches the tick that command was scheduled
>   for, which is when it actually changed any;
> - when the clock *starts*, since that is when orders queued against a paused
>   prison run;
> - on an interval only while the simulation clock is running.

**A construction completing is on none of those lines.** A wall is scheduled
twenty ticks after the press (`projectExecuteTick`, quoted in that file) and
*finishes* hundreds of ticks later, so the "reached the scheduled tick" refresh
draws the *planned* order and nothing draws the built one. What eventually does
is `const DEFAULT_POLL_INTERVAL_SECONDS = 30;` in the same file. 30.4 s is that
constant.

**Why this matters more than it sounds** (MEASURED, and then JUDGEMENT). The two
states are not subtly different — they are the strongest visual contrast in the
whole game. `test-results/the-build-flow-P1-sixteen-walls-queued-paused.png` is
a barely-lighter brown wash on brown dirt (`PLANNED_ALPHA = 0.35`,
`src/rendering/world/appearance.ts:276`, over `EDGE_WALL_APPEARANCE`'s grey
`0x8f8f8f`, over dirt `0x6a5744`). `test-results/the-build-flow-A9-after-nudge.png`
is bright cream photographic brickwork with a dark base. **The single most
satisfying moment building has to offer is the transition between those two
pictures, and the player is not in the room when it happens.**

**Already known, at a different altitude.** `docs/research/2026-09-02-the-open-issue-backlog.md`
records issue **#576** half **B** as still open with the same cause — *"The feed
still marks dirty on the command's scheduled tick and never on a construction
completion"* — citing `src/rendering/feed/simulation-snapshot-feed.ts:298-320`
and `DEFAULT_POLL_INTERVAL_SECONDS = 30`. What is new here is the **player**
measurement: the number of seconds a player waits (11.0 after the panel goes
quiet, up to 30 from the last command), and that the wait covers the whole
visual payoff of the primary verb.

**What would change my mind:** a run at a viewport or scroll position where a
camera event fires between completion and the poll, putting the wall on screen
promptly. Camera motion does force a repaint — act 9's nudge changed the clip —
so a player who happens to pan will not see this. A player who watches will.

---

## 2. HIDDEN — 75.9% of the catalogue is off screen and the list gives no sign of it

**MEASURED** (act 1), one prison, Build tab, arrival state, `Everything`:

| viewport | list box | list content | hidden | % hidden | rows wholly visible | scrollbar gutter |
| --- | --- | --- | --- | --- | --- | --- |
| 1920×1080 | 358 | 924 | 566 | 61.3% | 8 of 21 | **0** |
| 1440×900 | 223 | 924 | **701** | **75.9%** | **5 of 21** | **0** |
| 1280×720 | 88 | 924 | 836 | 90.5% | **2 of 21** | **0** |
| 1024×768 | 124 | 924 | 800 | 86.6% | 2 of 21 | **0** |

924px is twenty-one rows of exactly 44px (act 10: `rowHeight: 44`, 21 rows).
**At no viewport tested does more than 8 of 21 fit**, and the gutter
(`offsetWidth − clientWidth`) is **0.0px at all four**, so nothing in the layout
says the list continues.

The Rooms catalogue is the same shape one tab over (act 10, MEASURED):
`clientHeight 252, scrollHeight 837, hidden 585, gutter 0` — **69.9% hidden**,
5 of 18 rows visible. Both catalogues the flow crosses have the property.

**The third instance the brief names was not reproduced.** With one prison the
save panel's list is `clientHeight 53, scrollHeight 53, hidden 0` (act 10) — no
scroll at all. It presumably reappears with several prisons; this pass did not
make several, and the claim is left UNKNOWN rather than repeated.

**The floor is deliberate and the token's reason for it is stale.** VERIFIED,
read: `src/ui/tokens.css:415` is
`--hud-build-catalogue-floor: calc(2 * var(--tap-target));` and
`src/ui/hud/hud.css:1809` is
`.hud-build[data-queued] { --hud-build-catalogue-floor: var(--tap-target); }`.
The token's own comment justifies the Rooms panel's one-row floor by saying
*"`BUILDABLE_REGISTRY` has two entries, so the Build panel's two-row floor **is**
its list's height and the list donates nothing"*. That sentence is **false at
v0.0.475 (`b984445f`)**: MEASURED, the registry renders 21 rows and 924px, and the list
donates 701px at the default viewport. `hud.css`'s own note at `:1217` has
already been corrected for this twice and says so; the token's has not been
corrected once. Per `docs/AGENT_WORKFLOW.md` §4 the durable fix is to delete the
tally rather than update it — this is a one-line documentation correction, not a
code change, and it is handed over rather than made (this pass is read-only on
`src/`).

**#902 is closed and its fix was reverted, and the reason is a rule rather than
an oversight** (VERIFIED, read: `13c50289`, *"revert(hud): withdraw the edge
fade; #902 is not this file's to decide"*). The reverted change worked and was
gated on rendered pixels. It cannot ship because
`tests/unit/ui-design-tokens.test.ts` forbids `gradient(` anywhere under
`src/ui/`, stating *"Separation comes from a 1px hairline and a background step,
and from nothing else."* **That constraint shapes proposal B below**: the honest
signal available here is a word or a number, not a shadow.

---

## 3. ADR 0035's category filter is built, is reachable, and solves the reach problem at one viewport out of three

Checked because the brief asked whether it exists and whether it merely moves
the problem.

**Built and reachable** (MEASURED, act 1). `.hud-build__category` is present at
every viewport with nine options:

```
["*=Everything","structure=Walls and doors","furniture=Furniture","food-service=Catering",
 "utility=Utility","medical=Medical","security=Security","sanitation=Plumbing","storage=Storage"]
```

**What each option leaves to scroll** (MEASURED, act 1):

| group | rows | hidden px at 1440×900 | hidden px at 1280×720 | hidden px at 1024×768 |
| --- | --- | --- | --- | --- |
| Everything | 21 | 701 | 836 | 800 |
| Walls and doors | 2 | **0** | **0** | **0** |
| Furniture | 7 | 85 | 220 | 184 |
| Catering | 4 | **0** | 88 | 52 |
| Utility | 5 | **0** | 132 | 96 |
| Medical | 3 | **0** | 44 | 8 |
| Security | 2 | **0** | **0** | **0** |
| Plumbing | 3 | **0** | 44 | 8 |
| Storage | 2 | **0** | **0** | **0** |

So: **at 1440×900 the filter removes the scroll entirely for seven of eight
groups.** At 1280×720, where the window is on its 88px two-row floor, five of
eight still scroll. It is a real fix at the size the game is played at and a
partial one below that — ADR 0035's own claim, *"A filter buys reach, not
height"*, is exactly right and the table above is what it buys.

**What it does not do is get chosen.** ADR 0035 decision 4 makes `Everything`
the arrival state on three stated reasons, the third of which is about keeping
the `#88` sweep honest. **MEASURED consequence:** a player who never touches the
`<select>` gets the 701px column and no sign of it, and the arrival state is the
one 100% of players see. Reaching row 17 (`medicine-cabinet-wooden`) from
arrival, three ways (act 2):

- **wheel: 6 notches of 100px** (600px of scrolling) before the row is wholly in
  the window;
- **keyboard: 16 `ArrowDown` presses**, and typing `s` moves the focus nowhere —
  MEASURED, `after typing "s" → wall-brick`, so there is no typeahead;
- **filter: one choice**, *if the player guesses that a Medicine Cabinet is
  filed under `Medical` and not under `Furniture`.* Nine options, and no row
  anywhere says which group it is in.

---

## 4. HIDDEN — the Build panel prices nothing, and the one price it has is not a price

**Zero digits, three viewports** (MEASURED, act 1):
`numerals anywhere in the Build panel: []` at 1440×900, 1280×720 and 1024×768,
in the arrival state. The 2026-09-03 record measured this on an
earlier tree and it is unchanged at v0.0.475 (`b984445f`).

**Digits appear only after money has already been spent, and they are refunds**
(MEASURED, act 4). Sixteen walls queued:

> ON THE WAY / **16 bought · 1,280 back if cancelled** / 2 × Brick · 80 back / Cancel

1,280 is 16 × 80 and is exactly what was taken — the panel is telling the player
the price, in the past tense, labelled as a refund.

**The one forward-looking figure is one press away and it is not the row's
price** (MEASURED, act 5). One press on `.hud-build__buy-toggle` and the fold
reads:

> QUANTITY / − / + / **Buy 2 × Brick · 80** / Arrives while the clock runs, into the stock a build draws from.

Sweeping six rows with that fold open:

```
wall-brick:          quantity 2, control reads "Buy 2 × Brick · 80"
door-wooden:         quantity 1, control reads "Buy 1 × Wood Plank · 65"
bed-wooden:          quantity 1, control reads "Buy 1 × Wood Plank · 65"
toilet-brick:        quantity 1, control reads "Buy 1 × Brick · 40"
dining-table-wooden: quantity 3, control reads "Buy 3 × Wood Plank · 195"
chair-wooden:        quantity 3, control reads "Buy 3 × Wood Plank · 195"
```

**A chair costs 65 and the control under it reads 195.** VERIFIED, read: the
quantity is reset only when the *material* changes, not when the row does —
`src/ui/hud/build-panel.ts`, in `paintBuy`:

```ts
if (material.itemId !== quantityItemId) {
  quantityItemId = material.itemId;
  setQuantity(material.quantityPerPlacement);
  return;
}
setQuantity(quantity);
```

with the comment *"A different material is a different purchase, so the quantity
goes back to one placement's worth rather than carrying 200 bricks over onto a
door."* The rule is deliberate and defensible **for a shopping control**. What
it exposes is that this was never a price tag: two buildables sharing a material
(`chair-wooden` and `dining-table-wooden` are both `item.wood-plank`) keep each
other's quantity, so the figure is the price of *one placement* only for the
first row a player looks at.

**Nothing is broken and the money is exact.** MEASURED, act 4, end to end:
25,000 → 23,615, **spent 1,385 = 16 × 80 (walls) + 65 (bed) + 40 (toilet)**,
to the unit, at the moment of each gesture. The ledger is honest. It is simply
never shown before the press.

**Where the price already lives, and this is the load-bearing fact for proposal A**
(VERIFIED, read). `HudBuildableViewModel.material` is
`{ itemId, labelKey, unitPriceMinorUnits, quantityPerPlacement, maxQuantity }`
(`src/ui/hud/view-model.ts:600-621`), supplied per row at mount by
`purchasableMaterialFor` (`src/main.ts:664-684`), which returns
`unitPriceMinorUnits: priced.unitPriceMinorUnits` and
`quantityPerPlacement: requirement.quantity`. So **`unitPriceMinorUnits ×
quantityPerPlacement` is already sitting on the object the catalogue loop reads,
inside the loop, and equals what a placement debits** — MEASURED three times in
one run (80, 65, 40). The catalogue does not price anything because
`createListRow({ icon, label })` at `build-panel.ts:986` does not pass it, not
because it does not have it.

Derived from the registry, that is the whole table (VERIFIED, read,
`src/simulation/construction/definition.ts` × `src/content/procurement-catalog.ts`
at `item.brick` 40 and `item.wood-plank` 65):

| 40 | 65 | 80 | 130 | 195 |
| --- | --- | --- | --- | --- |
| Toilet, Shower Head, Fridge, Waste Bin, Utility Panel | Wooden door, Bed, Chair, Medical Bed, Medicine Cabinet, Storage Rack | Brick wall, Washing Machine, Stove, Prep Counter, Security Console | Bench, Desk, Bookshelf | Dining Table, Loading Dock Door |

Five distinct prices across twenty-one rows.

---

## 5. DEFECT — the money readout says nothing across the whole range a player builds in

**MEASURED** (act 8). Seven purchases of 100 bricks, 25,000 down to 1,000, the
FUNDS chip's text, badge, badge tone and computed colour read at every step:

```
funds 25000 → {"text":"25,000 | FUNDS","badge":null,"badgeTone":null,"colour":"rgb(238, 242, 246)"}
funds 21000 → {"text":"21,000 | FUNDS","badge":null,"badgeTone":null,"colour":"rgb(238, 242, 246)"}
funds 17000 → … funds 13000 → … funds 9000 → … funds 5000 → …
funds  1000 → {"text":"1,000 | FUNDS","badge":null,"badgeTone":null,"colour":"rgb(238, 242, 246)"}
```

**96% of the grant spent; badge `null` and colour `rgb(238, 242, 246)` at every
one of seven readings.** Act 5 reproduced it on the build path rather than the
purchase path — four wall runs, 25,000 → 18,600, chip identical at all five
readings.

**VERIFIED, read**, `src/ui/hud/projection.ts:618-623`:

```ts
function overdraftTone(counts: HudCountsViewModel): BadgeTone | undefined {
  const remaining = overdraftRemaining(counts);
  if (remaining === undefined || counts.treasuryMinorUnits >= 0) return undefined;
  …
```

so the tone — and, through it, `overdraftBadge` and `overdraftDescription`,
which both early-return on `tone === undefined` — is absent for the **entire**
non-negative range. That is by design and the design is argued at length in that
file's comment: *"A prison in credit is not carrying a facility it is being
asked to think about — it is simply solvent, and the number above says so."*

**The argument is right about a badge and wrong about the moment.** JUDGEMENT,
grounded in the act 4 ledger: the player who has just spent 1,385 of 25,000 on a
cell has no way to know whether that was cheap or ruinous, because the only
comparison the interface offers is a number they must have memorised. A prison
that is *solvent and just spent 5.5% of everything it has* is a different state
from a prison that is solvent and idle, and the chip renders them identically.

---

## 6. DEFECT — the newcomer's fence is accepted, silently, and is not a fence

**MEASURED** (act 3). New prison, Build tab, `Brick wall` armed by the panel's
own controls, then the thing a person does when told to wall off a square:
press the four tile centres of a 2×2.

```
press at tile centre (14,12) → PlaceBuildOrder wall-brick x:14 y:12 edge:"north"
press at tile centre (15,12) → PlaceBuildOrder wall-brick x:15 y:12 edge:"north"
press at tile centre (14,13) → PlaceBuildOrder wall-brick x:14 y:13 edge:"north"
press at tile centre (15,13) → PlaceBuildOrder wall-brick x:15 y:13 edge:"north"
[A3] four presses at tile centres: 4 command(s), 0 refusals of their own
[A3] funds after the newcomer's fence: 24680
```

**Four accepted orders, 320 spent, and the result is two parallel lines.** Every
press snapped to the *north* edge of the tile pressed, so the player who drew a
box got the top edge of each of four tiles. Nothing refused, nothing warned, and
the queue then reads four rows that each look correct in isolation:

> Brick wall · 14, 12 · North · 80 back / Approved

The hint the panel gives while the wall is armed is true and complete — *"Click a
tile edge to place a wall. Drag along it to lay a run."* — and MEASURED it is
what the panel shows for `wall-brick`. What it cannot do is tell a player **which
edge their pointer is currently on**, before they commit. Issue **#886** is this
subject and this pass adds only the interaction count: **4 presses, 320, zero
feedback of any kind, and the error is discovered at the Rooms tab.**

**The Rooms tab then handles it well, and that deserves saying.** Act 3, the
same square dragged as a Cell, immediately after mouse-up:

> Designate 2 × 2 / Discard / AREA / **2 × 2 tiles at 14, 12** / TOO SMALL — THIS ROOM NEEDS AT LEAST 2 × 3 TILES. / NEEDS AT LEAST 2 × 3 TILES / MUST BE ENCLOSED / NEEDS 1 × BED / NEEDS 1 × TOILET

and the confirm control carries `disabled=""` — MEASURED. **The brief's premise
that "the room rectangle a player has just dragged is cleared on mouse-up" is
false at v0.0.475 (`b984445f`)**: the panel keeps it, names it, judges it, offers Discard, and
disables the press that would fail. `test-results/the-build-flow-A3-after-room-drag.png`
also shows the rectangle still painted in the world. This is the best-designed
gesture in the flow and it should be the model for the others.

---

## 7. The whole flow, ledgered: 22 interactions, 7 of them about the prison

**MEASURED** (act 4), New prison → `accommodationCapacity: 1`, first try, no
refusals, no retries. Final counts `{"tick":1892,"rooms":1,"roomCapacity":1,
"accommodationCapacity":1,"treasuryMinorUnits":23615}`; **1,893 ticks**; **1,385
spent**.

```
 1. press New prison                     12. press the Rooms tab
 2. press the Build tab                  13. press the Cell row
 3. press the Brick wall row             14. press the Rooms arm control
 4. press Place on map                   15. drag the room rectangle
 5. drag the north wall run              16. press Confirm (attempt 1)
 6. drag the south wall run              17. press the Build tab
 7. drag the west wall run               18. press the Bed row
 8. drag the east wall run               19. press Place on map
 9. press Fast forward (1x)              20. press the tile for the bed
10. press Fast forward (2x)              21. press the Toilet row
11. press Fast forward (4x)              22. press the tile for the toilet
```

| what the interaction is for | count |
| --- | --- |
| **changes the prison** — 4 wall drags, 1 room drag, 2 furniture presses | **7** |
| starting a prison | 1 |
| tab switches (Build → Rooms → Build) | 3 |
| choosing a row in a catalogue | 4 |
| arming a tool | 3 |
| confirming a room | 1 |
| running the clock | 3 |
| **operates the interface** | **15** |

**68% of the flow is overhead**, and the 2026-09-03 record's headline figure of
19 is reproduced and slightly improved (22 including three clock presses, where
that record counted 19 plus six transport presses).

**Three of the fifteen are the clock, and the panel does now say so.** MEASURED,
the map block gains a line the moment a tool is armed: *"An order is queued now
and built while the clock runs."* That is one of the four things the 2026-09-03
record said the flow only works because the walker already knew; it is now
stated. **The other three are still unstated on the Build tab**: that walls go
on gridlines and rooms on tile centres, that furniture needs a room first — this
is now on the object arm hint, *"Click a tile inside a designated room to place
it"*, but only after arming and only for the row already chosen — and that a
Cell specifically wants a bed and a toilet.

**Two of the 2026-09-03 record's findings are fixed, and one is partly fixed.**
Reported here per §3's *"already fixed, here are the numbers"*:

- **Finding 2 (the hint named the wrong gesture for 19 of 21 rows) is FIXED.**
  VERIFIED, read: `armedHintKey` (`build-panel.ts:349-352`) chooses on
  `placesObject`, and `hud.build.arm-hint-object` exists. MEASURED, act 4: with
  Toilet armed, `.hud-build__note` reads *"Click a tile inside a designated room
  to place it. One press, one object."*
- **Finding 1 (nothing says a furniture row needs a room) is PARTLY fixed** — by
  the same sentence, which is on the hint rather than the row, so it arrives
  after the player has already chosen and armed.
- **Finding 4 (765px of content in a 437px box, sections rendering outside the
  panel) is FIXED.** MEASURED, act 1, at all three viewports: `.hud-build >
  .ui-panel__body` has `clientHeight == scrollHeight` (350/350 at 1280×720,
  386/386 at 1024×768) and `.hud-build` itself likewise, so nothing renders
  outside the panel in the states this pass reached.

**And the Rooms panel says what to build next, well.** MEASURED, act 4, cell
zoned and empty:

> NOT READY / 1 of 1 / **Cell at 13, 12 is missing** / **a door — nobody can get in** / 1 × Bed / 1 × Toilet / … / ENCLOSURE / Walled in on every side

Named by room, by position, by quantity, and it now names the door. It is still
one tab away from the tab that would act on it.

---

## 8. HIDDEN — nothing acknowledges any part of building, ever

**MEASURED** (acts 4 and 6). `.hud__event` — the band described in the code as
*"where the prison says what it just did"* — read at every phase of two full
builds:

| moment | `.hud__event` |
| --- | --- |
| sixteen walls queued | `not laid out` |
| one wall being built | `not laid out` |
| sixteen walls finished | `not laid out` |
| a room zoned, `rooms 0 → 1` | `not laid out` |
| a bed finished, `accommodationCapacity 0 → 1` | `not laid out` |

**Five moments, five silences.** The status strip is likewise unmoved:
MEASURED, before and after the sixteen walls finish, every chip identical except
the day-progress percentage and the speed.

This confirms the 2026-09-03 record's finding 8 at v0.0.475 (`b984445f`) and extends it to
zoning and to furniture. `docs/research/2026-09-04-what-the-game-acknowledges.md`
has already established the shape at the registry level — **twenty event types,
nineteen reachable, 9 bad news, 6 undo, 2 recovery, 1 neither, 0
acknowledgements** — and names `session-commands.ts:194-216` (the accepted
`ZoneRoom` outcome) as a site where a true claim is computed and nothing is
published. That is the same gap this act walks into from the player's side.

---

## 9. The screen, as area: the island that says it is empty is bigger than the catalogue

**MEASURED** (act 7), every laid-out HUD box, arrival state, Build tab:

| box | 1920×1080 | 1440×900 | 1280×720 |
| --- | --- | --- | --- |
| `.hud-minimap` (panel) | 398×372 = 148,056px² (7.1%) | 148,056px² (**11.4%**) | 148,056px² (**16.1%**) |
| `.hud-minimap__surface` (the placeholder alone) | 224×224 = **50,176px²** | 50,176px² | 50,176px² |
| `.hud-alerts__list` | 372×32 = 11,904px² | 11,904px² | 11,904px² |
| `.hud-build` (whole panel) | 264×667 = 176,154px² | 264×532 = 140,514px² | 264×397 = 104,874px² |
| **`.hud-build__list`** (every buildable) | 238×358 = **85,085px²** | 238×223 = **52,955px²** | 238×88 = **20,944px²** |
| `.hud-build__map` (arm + hint + readout) | 246×150 = 36,839px² | 36,839px² | 36,839px² |

and what that island contains (MEASURED, verbatim):

> `"MINIMAP\nCollapse\nMINIMAP IS NOT AVAILABLE YET\nALERTS\nNo active alerts"`

**The placeholder square alone — 50,176px², drawn to say a feature does not
exist — is 95% of the whole buildable catalogue's area at 1440×900 and 2.4× it
at 1280×720.** The panel around it is 2.8× and 7.1× the catalogue.

**This is the answer to ADR 0035's "There are no pixels."** That sentence is
true and was correctly measured — of the **rail**. It is not true of the
**screen**. Naming the difference is the point: the rail has 7.8px of slack and
the screen has 148,056px² of announced emptiness, and no decision this
repository has taken has ever put those two facts side by side.

---

## The improvement proposals

Ranked by interactions saved or errors prevented per unit of change. Every one
traces to a measurement above. Each says plainly whether it is cheap or a
rebuild. **This pass is read-only on `src/`: these are proposals, not changes.**

### A. Put the price on the row, in the badge slot the row already has. *Cheap.*

**What the player sees.** Each catalogue row gains a trailing badge carrying the
placement price as a bare numeral — `Brick wall … 80`, `Bed … 65`, `Dining
Table … 195` — in the same slot that today carries the word `Selected`.

**Why it costs nothing.** MEASURED, act 10: every row is 238px, the icon is
16px, an unselected row's label box is **198px**, and the `Selected` badge on
the selected row takes **67px**, leaving 123px, in which `Brick wall` is
`labelClipped: false`. **A two- or three-digit badge is strictly narrower than
the 67px badge already shipping**, so the widest row this design has ever laid
out is the one it already lays out. No new height, no new plumbing: VERIFIED,
read, `unitPriceMinorUnits × quantityPerPlacement` is on
`HudBuildableViewModel.material` inside the very loop at `build-panel.ts:986`
that builds the row, and MEASURED it equals what a placement debits (80, 65, 40,
three for three, act 4).

**The trade it forces, and the code already names it.** VERIFIED, read,
`build-panel.ts:965-966`, beside the line that sets the row's `aria-checked`:

> `aria-checked` is the *machine* carrier of which buildable is chosen, as it
> is in `rooms-panel.ts`; the badge above stays the visual one.

**The answer is already written one panel over.**
MEASURED, act 10: the selected row's `backgroundColor` is `rgba(0, 0, 0, 0)` —
**identical to every unselected row**. So the badge is currently the *only*
visual mark of which buildable is armed, and freeing it needs a replacement.
`src/ui/hud/hud.css:2517-2527` is that replacement, shipped, for the Regime
panel's roster:

> The selected row, and it is a **background step and nothing else**:
> `tests/unit/ui-design-tokens.test.ts` allows separation from "a 1px hairline
> and a background step, and from nothing else", the row already carries a
> badge whose tone is the prisoner's classification -- a second tint over it
> would put two meanings on one rectangle […] `aria-checked` is what says
> "selected" to a screen reader, and `data-selected` is what says it to a probe.

The Build catalogue's rows already set **both** of those attributes — VERIFIED,
read, `build-panel.ts:963-967` sets the badge, then `data-selected`, then `aria-checked`. So
`.hud-build__list [aria-checked='true'] { background: var(--surface-sunken); }`
is one line, is the rule the design tokens test already sanctions, and is a
literal copy of a decision this repository has already taken about exactly this
conflict.

**On truth, and on pricing.** No sentence is authored — a numeral is not a
promise, and `AGENTS.md` reservation 4 is about a sentence being true of the
code that renders it. The number is true: MEASURED three times against the
treasury. It is also **not a balance decision**: ADR 0017 decision 5 and ADR 0028
decision 4 reserve *choosing* prices to #29, and this changes no price — it
displays one the simulation already charges. The badge does need an accessible
name; `createStatusBadge` writes `label.textContent = next.text`
(`status-badge.ts:64`) and nothing else, so a bare `80` would be read as "80" by
a screen reader. **That is a real gap in this proposal and it is named rather
than glossed**: either the badge text carries the currency-free figure with the
row label supplying the context (which is how the strip already quotes money —
`25,000 FUNDS`, no unit), or the row needs an `aria-description`. Deciding which
needs a string, and a string needs the verify-then-write pass this proposal does
not do.

**What it buys:** the single most-repeated question in the flow — *what does
this cost* — answered on the row, before the press, for all 21 rows at once,
where today it costs one press and gives the wrong answer for any row that
shares a material with the last row looked at (act 5).

### B. Say how many rows there are, in the control that already exists. *Cheap.*

**What the player sees.** The category `<select>`'s options carry their counts:
`Everything (21)`, `Walls and doors (2)`, `Furniture (7)`, `Catering (4)`,
`Utility (5)`, `Medical (3)`, `Security (2)`, `Plumbing (3)`, `Storage (1)` —
and, closed, the control therefore reads `Everything (21)` on arrival.

**Why this shape and not a scroll shadow.** The scroll shadow was built, worked,
and was reverted (VERIFIED, read, `13c50289`) because
`tests/unit/ui-design-tokens.test.ts` forbids `gradient(` under `src/ui/` and
states *"Separation comes from a 1px hairline and a background step, and from
nothing else."* A count is text, so it is not in that rule's way at all. And it
is the *right* signal: MEASURED, the gutter is 0.0px at four viewports, so what
is missing is not a prettier edge but the fact that **21 exists** when 5 are on
screen.

**Where the numbers come from.** `buildCategoryOptions` already derives the
option list from the rows themselves (`build-panel.ts:443`, and ADR 0035 decision
2 turns on that derivation), so it is already iterating exactly the set whose
size this needs. No new data crosses any boundary.

**The one measured risk, named.** `hud.css`'s own note on `.hud-build__category`
says the control is `max-width: 50%` and that *"the eyebrow ellipsizes first …
because the filter's own text **is** its value — a clipped option name would be a
control that misreports its state"*. Appending four characters to the longest
option (`Walls and doors (2)`) moves it closer to that clip at the 264px rail
and at the 375px phone width. **That is the measurement this proposal owes and
did not take**, and it is the thing that would sink it.

**What it buys:** the arrival state stops lying by omission, at zero layout cost
and without touching ADR 0035 decision 4's default.

### C. Redraw the world when a build finishes. *Cheap in code, and it is the biggest single win.*

**What the player sees.** A wall stops being a grey ghost and becomes cream
brickwork **when it is built**, instead of up to thirty seconds later.

**The change.** VERIFIED, read: `SimulationSnapshotFeed.handleMessage` sets
`this.dirty = true` on `simulation/command-result` with `status === 'queued'`
and again when the clock reaches `awaitedCommandTick`. There is no case for a
construction completing. The feed already receives the small worker messages —
the playtest harness's own tee filters out only `simulation/delta`,
`simulation/snapshot` and `simulation/projection` and everything else arrives —
so what is needed is a signal from the construction system that geometry
changed, and one more `this.dirty = true`.

**Honesty about scope.** *This is a proposal about which messages the renderer
listens to and it is not mine to design past that point.* Whether the right
signal is a new worker message, a bump on an existing revision the feed already
reads, or ADR 0040 slice 4's plan to carry chunk geometry on the delta channel,
is an architecture question with an ADR already circling it — and
`AGENTS.md` says propose an ADR rather than decide architecture inside
implementation code. What this pass establishes is the **player** cost of not
deciding: 11.0 seconds of nothing after the panel goes quiet, up to 30 from the
last press, across the whole visual payoff of the game's primary verb.

**What it buys:** the transition in finding 1 — the strongest visual moment
building has — actually happens while the player is watching it. Nothing else in
this list changes as much for as little.

### D. Show the edge the press will take, before the press. *Medium.*

**What the player sees.** With a wall armed, the tile edge nearest the pointer is
drawn as the ghost — which `BuildOverlay` already does for a run — **and the
placement readout in the map block, which today reads `Point at the world` and
then `{x}, {y} · {edge}`, is the confirmation.** MEASURED, act 3: it already
carries the edge (`hud.build.target-value` is `'{x}, {y} · {edge}'`), so the
information is on screen; what it is not is *where the player is looking*, which
is the pointer.

**Why it is medium rather than cheap.** The mid-line tie-break between the ghost
and the run is PR **#892** and `src/rendering/build/edge-picking.ts` is another
agent's surface. This proposal is therefore a statement of what the player needs
and a handover, not a design.

**What it buys, measured:** act 3's four presses at four tile centres cost 320
and produced two parallel lines with no refusal. Every one of those four presses
would have been visibly wrong before it was made.

### E. Make the Rooms panel's "missing" list say what the missing things cost, and total it. *Medium.*

**What the player sees.** The block that already reads
*"Cell at 13, 12 is missing / a door — nobody can get in / 1 × Bed / 1 × Toilet"*
gains the figure per line and a sum: `1 × Bed 65`, `1 × Toilet 40`, and
`105 to finish this cell`.

**What it is derivable from, exactly, and this is the brief's question.** A
room's total is `Σ over the room's unmet requirements of (quantity ×
unitPriceMinorUnits × quantityPerPlacement)` where the requirement quantity is
what the panel already renders and the last two factors are the same
`HudBuildMaterialViewModel` fields proposal A uses. **MEASURED, act 4**, the cell
that finished at `accommodationCapacity: 1` cost 65 + 40 = 105 in furniture, and
16 × 80 = 1,280 in walls, totalling the 1,385 the treasury actually moved. The
arithmetic is exact and it is arithmetic the interface already has both halves
of.

**Two caveats, both real.** First, the walls are not derivable from the room's
requirement list — the perimeter is the player's choice of rectangle, and
`2 × (w + h)` segments at 80 is derivable only *after* a rectangle is dragged,
which is exactly the state where the Rooms panel already renders
`AREA / 2 × 2 tiles at 14, 12`. So the honest split is: **the furniture total is
derivable at any time; the wall total is derivable only from a dragged
rectangle, and that is the moment to show it.** Second,
`purchasableMaterialFor` returns the **first priced requirement only**
(VERIFIED, read, `main.ts:664-684`) and `main.ts` says a two-material buildable
would get a control for one of them — every one of the 21 rows has exactly one
requirement today, so the sum is exact today and would silently understate the
day a two-material buildable lands. **A total that can silently understate is
worse than no total**, so this proposal is conditional on either a
multi-requirement material view model or a contract test pinning the
one-requirement property.

**What it buys:** it answers *"what am I about to spend"* at the one moment the
player has already committed to a shape and not yet to the money — the state
act 3 measured the panel handling better than anything else in the flow.

### F. Reclaim the minimap placeholder's square for the catalogue. *A rebuild, and the honest thing to say is that it is a layout decision nobody has taken.*

**The measurement that justifies raising it at all** is finding 9: 50,176px² of
placeholder saying a feature does not exist, against 52,955px² for every
buildable in the game at 1440×900 and 20,944px² at 1280×720; and 148,056px² for
the island as a whole, fixed at every viewport, 16.1% of a 1280×720 screen.

**What it is not.** It is not "move the catalogue into the minimap" — the
minimap is a real planned feature and its slot is presumably its slot. It is
that **the panel that holds the primary verb's catalogue is 264px wide and
squeezed to a two-row floor while the screen carries an island six times its
list's area announcing that it is empty**, and that ADR 0031 decision 3's *"There
are no pixels"* and ADR 0035's repetition of it are both true of the rail and
neither is true of the screen.

**Why this pass does not design it.** Three accepted ADRs sit on this budget
(0022's tab decision, 0031 decision 3's donation, 0035 decision 3's zero-cost
placement), all with real measurements behind them, and moving the catalogue out
of the rail reverses trades this repository deliberately made. That is an ADR,
and per `AGENTS.md` it is proposed rather than decided inside a playtest.

---

## Ranked, by what it buys against what it costs

| # | proposal | what it buys, measured | cost |
| --- | --- | --- | --- |
| 1 | **C — redraw on completion** | 11.0 s of dead screen removed from every build; the one visual payoff the verb has | one message and one `dirty = true`, in front of an architecture question |
| 2 | **A — price on the row** | 21 prices, before the press, replacing 1 press that gives the wrong figure whenever two rows share a material | zero pixels; one CSS line copied from `hud.css:2527`; one accessible-name decision |
| 3 | **D — show the edge first** | 4 wrong presses and 320 prevented in the newcomer walk; #886 | another agent's surface (#892) |
| 4 | **B — counts in the filter** | the arrival state stops hiding 701px silently | zero layout; one clip risk, unmeasured |
| 5 | **E — total the room** | *what will this cost* answered at the one moment it is askable | conditional on the one-requirement property being pinned |
| 6 | **F — the catalogue's container** | 5 of 21 rows becomes a number somebody has chosen | an ADR reversing three accepted trades |

**The single smallest change that buys the most is C**, and it is not close: it
is the only one on the list where the player's experience changes without the
player learning anything.

---

## What is right, and must not be broken

- **The money is exact.** 1,385 spent for 16 walls, a bed and a toilet, to the
  unit, at the moment of each gesture, MEASURED.
- **The zoning gesture is the best-designed thing in the flow.** Drag, and the
  panel names the rectangle, judges it, states every unmet rule, offers Discard,
  and **disables** the press that would fail. MEASURED, act 3.
- **The Rooms panel says what to build next, by room, position and quantity**,
  and now names the missing door. MEASURED, act 4.
- **A refused press costs nothing** and a queued order's row says what, where,
  which edge and what it pays back. MEASURED, act 3.
- **The category filter is real and it works.** Seven of eight groups need no
  scroll at 1440×900. MEASURED, act 1.
- **The arm hint now matches the row.** Two sentences, chosen on `placesObject`.
  MEASURED, act 4; VERIFIED, `build-panel.ts:349-352`.
- **A finished wall is beautiful.** `test-results/the-build-flow-A9-after-nudge.png`.

---

## What this pass did not reach

- **Touch.** Every gesture here was a mouse. `docs/research/2026-09-04-touch-only.md`
  owns that surface and reports four finger-drags on lists to finish a prison;
  nothing here re-derives or contradicts it.
- **The save panel's list as a third instance of the fold.** With one prison it
  does not scroll at all (`53/53`, MEASURED). UNKNOWN with several.
- **Whether the Buy control's refusal at an unaffordable quantity says anything
  useful.** Act 8's press stopped landing at 1,000 funds against a 4,000
  purchase and the `disabled` attribute read `null`, so the control is refusing
  by some route this pass did not identify. Measured, not diagnosed.
- **The `Undo` findings** of 2026-09-03 (findings 5 and 6). Not re-run; not
  contradicted.
- **Any viewport below 1024×768**, and any interface scale but 100%.
- **`git log -S` dating** for the stale token comment in finding 2. The checkout
  is shallow, so *when* `--hud-build-catalogue-floor`'s comment became false is
  UNKNOWN by construction; that it is false now is MEASURED.

---

## The weakest claim in this record

**That proposal A's badge is free.** The width arithmetic is measured — 67px for
`Selected`, 123px of label left beside it, `Brick wall` not clipped — but
`Brick wall` is one of the shorter labels, and the row this design would have to
survive is `Loading Dock Door`, which was measured only *without* a badge
beside it. Act 10 reports `labelScrollWidth: 198` for every unselected row,
which is the flex box's width and not the text's, so **it does not establish
that any long label fits in 123px**, and a clipped buildable name is a real cost
against an unclipped price. What would change my mind: rendering the badge on
every row at 264px and 375px and reading `labelClipped` per row — one act,
not run.

**Second weakest: finding 1's thirty seconds as a general figure.** What is
measured is one run, at one camera position, with the pointer parked off the
canvas so nothing forced a repaint. A player who pans, zooms or opens a panel
mid-build gets their wall sooner, and this pass did not measure how often that
happens in ordinary play. The *mechanism* is not in doubt — the dirty list is
read and a construction completing is not on it — but the eleven seconds is a
worst case a player can avoid by accident, not a floor.
