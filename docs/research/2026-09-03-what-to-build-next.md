# What to build next, decided by playing it

**Date:** 2026-09-03
**Tree:** worktree `research/what-to-build-next`, cut from `origin/main` at
`ab0bab5b` (v0.0.426), `git lfs checkout` run so every actor atlas decodes.
**Question put:** what is the highest-value thing to build next, and why —
judged by the experience of playing, not by architectural interest.
**Standing directives this answers to:** *"znajdź bugi i błędy grając"* (find
defects by playing) and *"gra ma być łatwa przyjazna do grania, a nie jakieś
ukryte funkcje"* (easy and friendly to play, not a set of hidden features).

Nothing in `src/` was changed and no player-facing sentence was authored. Where
something needs words, this record says only what they must **convey**;
`AGENTS.md`'s fourth exclusion keeps the wording with the owner.

---

## 0. How this was obtained

Four playtests were written and run against the real application through
`tests/browser/playwright.playtest.config.ts`. Every number below came out of
one of them; the code citations were each opened afterwards.

1. **Arrival and every control.** New prison, day 1, paused: every panel's text
   on all five tabs, every visible control per tab, and the whole screen's text.
2. **The naive attempts.** Press Admit with nothing built; place a wall; draw
   four wall runs around a 6×6 square the way somebody who has never seen the
   game draws them; designate it.
3. **Three in-game days of a working prison.** A six-bed cell built and zoned
   with the mouse, six prisoners admitted, two guards hired, then *watched and
   not touched* from day 5 to day 9 — every panel, both bands and the counts
   series sampled roughly every 400 ticks.
4. **What the screen shows.** The hover ghost (screenshotted, not inferred),
   the refusal band's DOM, and whether a roster row can be pressed.

**Classification is kept strict throughout**, because blurring it is how this
corpus has produced false findings before: **DEFECT** (does the wrong thing),
**HIDDEN** (does the right thing, undiscoverable — a defect under the owner's
directive), **MISSING** (not built), **TASTE** (works, discoverable, not fun).

---

## 1. The answer in one paragraph

**Build the prisoner inspector: make a roster row open the person the worker
already fully describes.** `hud/prisoner-detail` is implemented, routed and
answered in the worker with all six needs, the classification, the gang, the
sentence and the tile — and **nothing in `src/ui/` or `src/main.ts` asks for
it**. The roster that would open it already carries each prisoner's entity id
in the DOM. It is the cheapest large increase in what a player can see, it
needs no protocol change and no balance number, and it is the surface every
other invisible mechanic in this game — the withheld grant, a discharge, a
gang, a sentence — has to land on before it can be shown at all.

**The honest larger answer is that the game is not yet fun and this does not
fix that.** §6 gives the measurement: a correct prison with six prisoners and
no canteen, shower or yard banked **+1,640 every day for four consecutive
days** and was never asked for anything. What is missing is *pressure*, and
pressure is a balance decision, not a feature.

---

## 2. The ranked list

### 1st — A prisoner inspector (a roster row opens a person)

**What it is.** A click (and a keyboard equivalent) on a Regime roster row
pulls `hud/prisoner-detail` for that prisoner and shows what comes back.

**Evidence.**

- The route exists and is answered: `src/simulation/worker/projection-catalog.ts:308`,
  `'hud/prisoner-detail'`, `target: 'entity'`. Its own comment describes a UI
  that does not exist — *"a prisoner released between the click and the reply
  is a race the UI handles"*.
- What it returns (`src/simulation/presentation/prisoner-projection.ts:190`
  onward): name, intake stage, `classified`, classification group, risk tier,
  **all six needs** (`:199-200`, *"All six needs, always in `NEED_IDS` order"*),
  current action, location tile, room instance, accommodation, `gang` with a
  reputation, and a sentence with `lengthTicks`, `endTick` and
  `priorIncidentsAtIntake`.
- Each need carries `unmetForStateIncome`
  (`src/simulation/presentation/prisoner-projection.ts:149`) — the projected
  form of the very predicate that withholds money.
- **It has no reader.** `grep -rn 'hud/prisoner-detail' src/ui src/main.ts`
  returns nothing. So do `hud/incidents`, `hud/incident-detail` and
  `hud/contraband`: **four of the fourteen `hud/*` routes are answered by the
  worker and asked for by nobody.**
- The precedent for wiring one is already in the tree:
  `src/ui/simulation-room-needs.ts:344` pulls `hud/room-detail` by id, from a
  list it pulled first. A prisoner reader is that module's shape.
- The click target already exists: `src/ui/hud/regime-panel.ts:667` writes
  `data-prisoner = entityId` on every pooled roster row (alongside
  `data-need`, `data-need-permille`, `data-need-unmet`).
- The row is **not** interactive today. Measured in the DOM as rendered:
  `rowCount 4, firstTag DIV, firstRole none, firstTabIndex none,
  buttonsInList 0`. `grep` over `regime-panel.ts` finds no `onActivate`, no
  `addEventListener`, no `tabIndex` and no `role`.
- What the roster shows instead: **four rows, one need of six.**
  `PRISONER_ROSTER_ROW_LIMIT = 4` (`src/ui/hud/regime-panel.ts:174`), and the
  reader asks for exactly that many from offset zero
  (`src/ui/simulation-prisoner-roster.ts:245-247`). In playtest 3 the panel
  read `PRISONERS | 4 of 6 … and 2 more` in **every one of the ten samples
  across three in-game days**, and the need column read `Hygiene` for all four
  rows in most of them. `+2 more` is a note, not a control
  (`rosterMore = eyebrowText(...)`).

**Cost.** UI only, medium: one translator module on
`simulation-room-needs.ts`'s pattern, one panel section, an activation
affordance on a pooled row (the held-guard list is the local precedent for
controls inside a pooled row), and tests. No protocol change, no simulation
change, no balance constant. **Copy: a heading and, if the withhold is drawn,
a legend** — the owner's. What it must convey: *these are the six things this
person needs; the marked ones are costing the prison money.* No number in the
game has to be invented to say it.

**What it unlocks — this is why it is first.** It is not a leaf.

- It is where **#890**'s explanation can be shown at all. #890 says *"the
  withheld amount is not on the wire at all"*, which is true of the **amount**
  and not of the **cause**: `unmetForStateIncome` is on the wire per need, and
  the Regime panel already tints the worst need `warning` from it
  (`src/ui/hud/regime-panel.ts:366`). So the *why* behind #890 can be made
  visible without a protocol addition; only a per-prison money figure needs one.
- It is where **#503**'s second half (a sentence ending, a prisoner leaving)
  becomes legible — the detail already carries `sentence.endTick`.
- It is where the third owed `Errand` sentence has somewhere to be said: the
  2026-09-03 errand record found `STATUS-QUEUE.md`'s *"the roster and the
  detail panel will say Errand"* to be **wrong about half of itself**, for
  exactly this reason.
- It is where gang membership, disciplinary history and location can appear
  without a new projection each time.

### 2nd — A room-shaped build gesture (what #886 is actually about)

**What it is.** Let a drag in the Build panel describe a **rectangle** of wall,
the way the Rooms panel's drag already describes a rectangle of floor, instead
of four independent runs whose edges the player must reason about.

**Evidence, and two corrections to #886 on the way.**

- **#886's "nothing says so" does not hold on `main`.** The Build panel's arm
  hint reads *"Click a tile edge to place a wall. Drag along it to lay a run.
  Two fingers, the middle button or the arrow keys still move the camera."* —
  `src/content/default-locale-en.ts:1087`, on screen in playtest 1 and 2, and
  in the tree since `67e366e8`, **2026-08-23**, eleven days before #886 was
  filed.
- **A ghost is drawn.** Screenshotted, not inferred: hovering tile (16,12)'s
  centre with `wall-brick` armed paints a pale bar on that tile's north edge,
  and the WHERE readout says `16, 12 · North`. A press there orders
  `16,12 north`. So click, ghost and readout agree.
- **A drag along the same line does not.** Dragging along row 11's centres laid
  `6,12 north … 11,12 north` — the *south* side of row 11. Dragging down column
  11's centres laid `12,11 west … 12,16 west` — the *east* side of column 11.
  The mechanism is two different tie-breaks for the same point: a click uses
  `pickEdgeAtWorld`, whose four distances are all exactly 0.5 at a tile centre
  and whose first branch wins (`src/rendering/build/edge-picking.ts:114`,
  north); a drag uses `pickEdgeOnAxis`, which is
  `withinY < 0.5 ? tileY : tileY + 1` (`:143`) and therefore takes the *next*
  tile at exactly 0.5.
- **So four drags around a square produce a ring one tile off it in both
  axes**, and the rectangle the player then designates is refused. Measured:
  the ring for a 6×6 square drawn at tiles 6..11 × 11..16 came back at
  `y=12.north`, `x=7.west`, `x=12.west`, which encloses 7..11 × 12..15.
- **Changing the tie-break does not fix it, and this is the point.** With the
  other tie-break a player dragging along the boundary rows of their intended
  room is still off by one on two sides. The gesture is wrong, not the rounding:
  a room's walls are the edges *outside* its tiles, and no amount of care with
  a four-run gesture makes that intuitive. A rectangle gesture makes it
  unnecessary.

**Cost.** Moderate: a gesture mode, its preview, and the run generation (four
`edgeRunBetween` calls, no new command). ADR 0022 §4 is quoted in
`src/rendering/build/area-picking.ts:194` about area previews and should be read
first; this may want an ADR.

**Why 2nd and not 1st.** It is the **same surface** as #878, whose fix is in
flight. `docs/AGENT_WORKFLOW.md` §2 — *"serialise within a feature area"* —
makes this the next step for whoever holds #878, not a parallel agent's. It is
also a leaf: it makes building work and unlocks nothing else.

### 3rd — #878, reachable canvas — with a number that does not reproduce

**#878's headline is "84 of 308 visible tiles". I measured 194 of 308
(63.0%)** on `ab0bab5b`, 1440×900, Build tab open, by the same
`elementFromPoint` method over every visible tile centre. Per row:

| row | reachable x | what took the pointer elsewhere |
| --- | --- | --- |
| 9 | none | `hud-strip` |
| 10 | 5..26 | — |
| 11 | 5..22 | `display-scale` |
| 12–13 | 5..22 | `save-panel` |
| 14 | 5..22 | `ui-panel hud-build` |
| 15–21 | 11..22 | `ui-panel hud-minimap`, `ui-panel hud-build` |
| 22 | 5..26 | `hud-tabs__inner` |

The usable contiguous rectangle is about **12 × 12 tiles**, which is why
`buildAndPopulate`'s cell at 12..17 × 12..17 works and why my square at
6..11 × 11..16 did not: the minimap owns x < 11 from row 15 down. **Every short
or absent run in playtest 2 is attributed to that occlusion, not guessed at** —
the south run crossed five `hud-minimap` tiles and produced 0 commands; the west
run crossed two and produced 5 of 6.

I do not know why my figure differs from #878's by a factor of two and **the
difference matters before the fix is measured against it**. The decisive test is
one run of the same probe on the commit #878 was measured at; both numbers are
reproducible in a minute.

### 4th — The refusal band cannot be dismissed and outlives everything

**DEFECT, cheap, and #780 understates it.** Measured in playtest 3: a refusal
recorded by the calibration press at tick ~0 was still the band's text at
**tick 20,740, day 9** — through an assault, an all-clear and a contraband
discovery. The band has no control at all:

```
<div class="hud__refusal" role="status" aria-live="polite" data-source="simulation">
  <span class="hud-refusal__text">…</span>
</div>          buttons: []
```

And its alerts row carries `buttons: []` where every event row carries
`Clear this alert`, and no day stamp where every event row has one. So **the
first mistake a player makes leaves a warning on the most prominent strip on
screen for the rest of the session.** Cost: small. Leaf.

### 5th — Early-game pressure, which is a balance decision

See §6. **TASTE**, and reserved: it is a balance call, so it is put, not taken.

### 6th — Content that can be reached and does nothing

**MISSING, already filed as #595 for the rooms half.** Of the 18 room types the
Rooms catalogue offers, **7 have no reference anywhere in `src/` outside the
catalogue and the locale file**: garbage-room, holding-cell, infirmary,
reception, security-office, staff-room, utility-room. Holding Cell is the one
worth naming, because `intake-system.ts:70-71` knows only `room.cell` and
`room.solitary-cell`, so the room whose name says "overflow" is not one.
Separately, the staff catalogue declares **eight** roles
(`src/content/staff-role-catalog.ts:138-173`) and the Security panel offered
exactly one, Guard — measured, playtest 1.

---

## 3. What a player can do, end to end

Worth stating plainly, because it is shorter than the issue list suggests.

**Can:** start a prison; read a top strip of live figures (prisoners, high risk,
staff, coverage, rooms, incidents, contraband, funds, earned today, day, progress
through the day); pause, play, run at ×2 and ×4; buy materials; place walls,
doors and the whole object catalogue by click, drag or typed coordinates;
designate any of the eighteen catalogued room types by drag or by typed
rectangle; cancel a queued order or a pending delivery; admit a prisoner;
hire and release guards; save, export, import and reload; watch prisoners sleep,
eat, wash, use a toilet, associate and run errands, each named in the roster.

**Cannot:** see any prisoner past the fourth; see any of a prisoner's other five
needs; select anything in the world (a bare click orders nothing and opens
nothing, and `src/input/bindings.ts` has no select action); see where an incident
is or who is in it; see any contraband beyond a count and one name; assign a
guard to a place; dismiss a refusal; see the map (the minimap reads *"MINIMAP IS
NOT AVAILABLE YET"*); learn that Z and Y undo and redo a build gesture, which
`src/input/bindings.ts:64-65` binds and nothing on screen mentions (**HIDDEN**).

**Invited to and then not supported:** the Rooms catalogue invites eighteen room
types and seven do nothing; the arm hint invites a drag along an edge and the
drag lands on the other one; the intake note *"A prison needs a cell before it
can admit anyone"* was still on screen on day 9 with a finished cell and six
residents housed.

---

## 4. What is genuinely good, and should not be broken

A ranking that lists only faults misleads. Measured, and better than expected:

- **The roster row is the best-instrumented thing in the game.** Name, activity
  (`Sleeping`, `Eating in Cell`, `Association`, `Using Toilet`, `Errand`), the
  worst need as a word *and* a bar *and* a permille in the DOM, and a risk-tier
  badge. It changed correctly through every sample of three in-game days.
- **Refusals say what is missing.** *"Nobody was admitted — this prison has no
  room to hold anybody."* on an Admit with no cell.
- **Incidents reach the player.** An assault opened at tick 10,200 and an
  all-clear at 10,810 both appeared as dated, severity-toned, dismissible alert
  rows, and the strip's INCIDENTS chip moved.
- **Contraband reaches the player**, with the item named: *"Contraband found:
  Tool."*
- **The typed-coordinate forms are complete**, including the North/West edge
  choice a wall needs (`Place order`) and a width/height rectangle for rooms
  (`Use these tiles`). Measured as present; that they build a prison end to end
  is VERIFIED by `docs/research/2026-09-03-does-the-errand-walk.md`, which
  placed every order through them, not by me.

---

## 5. Correction offered to #890

#890 is right about the mechanism and about the silence. One sentence in it is
narrower than it reads: *"The withheld amount is not on the wire at all … So no
panel could display it even if one were written."* The **amount** is not on the
wire. The **cause** is: `PrisonerNeedViewModel.unmetForStateIncome`
(`src/simulation/presentation/prisoner-projection.ts:149`) is the projected form
of `isNeedUnmetForStateIncome`, it is already published for the roster's worst
need and for all six in the detail, and `regime-panel.ts:366` already renders a
`warning` tone from it. So a panel that says *which needs are costing money*
needs no protocol work; only a panel that says *how much* does.

---

## 6. The measurement behind "not fun yet"

Playtest 3, from the counts series the worker published (340 samples), a prison
with one six-bed cell, one toilet, no canteen, no shower room, no yard, six
prisoners and two guards:

| day boundary | treasury | net | occupants | gross accrued that day | wages |
| --- | --- | --- | --- | --- | --- |
| 4 | 22,080 → 22,980 | +900 | 3 | 887 | 0 |
| 5 | 22,820 → 24,460 | +1,640 | 6 | 1,779 | 160 |
| 6 | 24,460 → 26,100 | +1,640 | 6 | 1,790 | 160 |
| 7 | 26,100 → 27,740 | +1,640 | 6 | 1,770 | 160 |
| 8 | 27,740 → 29,380 | +1,640 | 6 | 1,790 | 160 |
| 9 | 29,380 → 30,780 | +1,400 | 6 | 1,535 | 160 |

1,790 over six occupants is **298 of the 300 ceiling**
(`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`, `income.ts:115`). So for four
consecutive days a prison serving **two of six needs** was paid essentially in
full, and grew its treasury by 26% of its starting balance.

The first withhold appears at the **day-9** boundary: 1,535 against 1,790 is
−255, and 6 × 40 is 240 (`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`,
`income.ts:347`). That timing is exactly what the constants predict: hygiene
falls at 0.02 a tick (`needs.ts:115`) from `NEED_MAX` 255 to
`STATE_INCOME_UNMET_NEED_LEVEL` 51 (`income.ts:307`) in 10,200 ticks — **4.25
in-game days** — and these prisoners were admitted late on day 4.

**So the incentive #890 is about is not only invisible in the first week; it is
not yet operating.** Both records are true and they measure different windows:
#890 ran twenty days and saw roughly a third of the grant; this ran nine and saw
nearly all of it. #503's 300 → 260 → 220 → 180 curve, measured at v0.0.163, was **not
re-run here** — it is a one-prisoner scenario and this was a six-prisoner one —
but it is not consistent with the constants on `main` today: an erosion of 40 at
the *first* day boundary needs a need crossing 51 from 255 inside 2,400 ticks,
which no rate in `NEED_DECAY_PER_TICK` does (the fastest, bladder at 0.08, takes
2,550, and a toilet keeps it topped up). The decay rates were retuned in between
and `needs.ts` carries the ruling in its own comments, so #503's shape reads as
older rather than wrong. Re-running its exact prison would settle it.

Over three in-game days of watching, the prison produced **three** messages —
an assault, an all-clear, a contraband find — and asked for **nothing**. No
quota, no inspection, no arrival it did not wait for a press to receive, no
failure state within reach: prisoners arrive only when Admit is pressed
(`AdmitPrisoner` is a command; nothing schedules one), and the treasury only
rose. **A game with no pressure has nothing for a panel to be about**, which is
why §1's honest answer is two paragraphs rather than one.

---

## 7. The strongest argument against the recommendation

**A detail panel deepens a surface only four prisoners can reach, and the number
a player actually watches is not on it.**

- The roster shows four rows whatever the population, and its own reader refuses
  paging with a good reason: entity indices are recycled behind a wrapping
  generation, so *"'page 3' would silently be a different three prisoners after
  a release"*, and it names the real fix as **a filter or an indexed accessor in
  the prisoner runtime** (`src/ui/simulation-prisoner-roster.ts:217-223`). A
  prison of thirty gets an inspector for four of them. If what makes a prison
  legible at scale is *finding* a person, this is the wrong order of work and
  the simulation-side accessor comes first.
- The two most-measured player-facing defects in this repository — #503 and #890,
  filed five days apart on the same mechanism — are about a **prison-wide money
  figure**. A per-prisoner panel does not show it, and a tone or a sentence on
  the EARNED TODAY chip would reach every player, including those who never open
  the Regime tab. That is a smaller change with wider reach, and it is blocked
  only on the owner's copy.
- The mitigating fact, stated so the argument can be weighed rather than won:
  the ordering landed on 2026-08-31 under the owner's #703 ruling, so the four
  rows are the **four highest-risk-tier** prisoners rather than the four oldest —
  *"the first window is now the window worth having"* (same docblock). An
  inspector on those four is an inspector on the four that matter.

## 8. My weakest claims, and what would settle each

- **"194 of 308"** is one probe, one viewport, one tab, one commit. If #878's 84
  was measured the same way, one of us is wrong about something structural.
  Settle it by running the probe at the commit #878 cites.
- **The day-9 withhold is inferred from one boundary.** −255 against a predicted
  −240 is close but the residue is unexplained, and I did not read any
  prisoner's hygiene level directly — `data-need-permille` is in the DOM and I
  sampled the word, not the number. Settle it by reading
  `[data-prisoner][data-need-permille]` across the boundary.
- **I did not measure what the WHERE readout says during a drag**, only during a
  hover. `HUD_MESSAGE_KEY.buildTargetRun` exists (`build-panel.ts:534`), so the
  drag readout may well be honest about the edge it is going to lay; I have not
  earned the claim that it lies. Settle it by reading `.hud-build__target` with
  the mouse button held down.
- **The cost of the inspector is an estimate**, not a spike. Nobody has written
  the translator; the closest analogue took a module of its own.
- **"Nothing asks anything of the player"** rests on three in-game days at ×4 in
  one prison. A twenty-day run of the same prison is what #890 did, and it found
  the money bite this run only saw beginning.
