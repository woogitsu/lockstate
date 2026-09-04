# 2026-09-04 — are the fixes real? Playing the six situations the last round's fixes were written for

**Played on `agent/playtest-are-the-fixes-real`, cut from `origin/main` at
`be244a24` — v0.0.469.** The instrument is
`tests/browser/playtest-2026-09-04-are-the-fixes-real.playtest.ts`, which is
**not a CI gate**: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `.playtest.ts` is collected only by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.
v0.0.469 (`be244a24`) was the newest `origin/main` when the branch was cut; it
may not be by the time this is read.

## The question

Six fixes landed between v0.0.451 and v0.0.469 (`be244a24`), each answering a
finding from the play-testing round of 2026-09-04. **A player does not read pull requests.**
Sitting down and playing the exact situation each fix was written for — does
the player experience the fix?

The trap this exists to catch is this repository's most expensive one: a fix
can be shipped, keyed, tested and **rendered by nothing** (#920 is exactly that
and is still open). So for each of the six the question is not "did they fix
it" but **"is there a gap between what the fix does and what a player gets"**.

## The answer, in one paragraph

**Four of the six reach the player completely, one reaches half of the surface
it was written for, and one changed the sentence without changing anything the
player can do about it.** #926 (the arm label), #943 (New prison), #942 (a run
of presses) and #944-for-small-crowds are real, measured, and work. #945's
sentence renders on the standing-object press at every viewport — and its
**sibling channel, a pending object order removed with the same control, is
still silent**, which is the exact shape #945 itself was filed about and which
#945's own issue text asserts was already fixed by #932. It was not. #944
separates six actors on a tile into six countable figures and separates
twenty-two into a smear: the step between adjacent ranks is `0.44 / (n-1)`
tiles, which is **1.34 screen pixels at n = 22**, and the tile holding 22 of
the prison's 28 people still reads as two figures at 100 % zoom. And #941's new
sentence is true, laid out and unclipped at all five viewports — while the
prison it describes produced **8 incidents, 8 lapsed, 0 resolved, 0 responders
ever dispatched and 31 injuries**, under a badge that still says `Covered` in
green.

**One thing found that no fix was written for and no issue knows**: on a prison
a player has just built, a run of 25 `Admit` presses yields **9 prisoners**,
because the Intake panel grows two blocks the moment the population passes
accommodation capacity and the button moves 57.7 px out from under the hand.
That is not #942 — the presses never reach a control at all.

## How to read this record

- **MEASURED** — a real run of this tree in a browser, output pasted.
- **VERIFIED** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **JUDGEMENT** — what a player would do or feel.
- **UNKNOWN** — not established in this pass.

Two channels are reported and never mixed: **HUD** (DOM `innerText`,
`getClientRects`, computed style, screenshots) and **STATE** (the worker tee's
`simulation/status-counts` and `simulation/delta`, and the `hud/incidents` and
`hud/incident-detail` projections through an in-page probe).

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5321 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-are-the-fixes-real.playtest.ts -g "act 1:"
```

| act | what it plays |
| --- | --- |
| `act 1:` | #941 — 17 prisoners, hire exactly what the panel asks for, watch eight incidents |
| `act 1b` | #941 — the new sentence's box at five viewports |
| `act 2` | #944 — 22 prisoners + 6 guards, screenshots of the stacks |
| `act 3:` | #942 — 25 `Admit` and 8 `Hire` presses at 1×, 2×, 4× and back again |
| `act 3b` | the same run on a prison nobody has been admitted to, hand held still |
| `act 4:` | #943 — play, press New prison, come back |
| `act 4b` | #943's sibling — Load pressed on the live prison, right after an autosave |
| `act 4c` | #943's sibling — Load pressed on the live prison after play nothing saved |
| `act 5` | #945 — a standing bed, a pending order, an occupied bed, and 900×600 |
| `act 6` | #926 — the arm label against its own button, 5 viewports × 3 states |

---

## 1. #941 — `Covered` says what it means, and the prison it describes is unchanged

### What a player reads now — MEASURED, act 1

Seventeen prisoners; `resolveOccupancyScaledGuardCount` is
`max(scheduled, ceil(occupants / 8))` with `scheduled` = 1
(`src/simulation/security/sector-staffing.ts:190`,
`src/simulation/security/default-sector.ts:113`, VERIFIED), so the sector asks
for **3**. The act hires one at a time and stops the moment the coverage
block's own `data-tone` turns `success`:

```
[act1] coverage with nobody hired: tone=danger  "0 of 3" Unguarded   "Nobody is on duty. Hire 3 to cover this population."
                                                  consequence: "No guard is posted here, so nobody in this sector is kept safe."
[act1] after hire 1 (staff=1):    tone=warning "1 of 3" Understaffed "Hire 2 more to cover this population."
[act1] after hire 2 (staff=2):    tone=warning "2 of 3" Understaffed "Hire 1 more to cover this population."
[act1] after hire 3 (staff=3):    tone=success "3 of 3" Covered      "Only free guards answer incidents."
[act1] === the panel stopped asking for more at 3 guard(s) hired: badge "Covered" ===
```

The whole panel, as one string off the DOM:

```
STAFF
GUARD COVERAGE
3 of 3
Covered
Only free guards answer incidents.
WHO TO HIRE
Guard | Selected | Hire Guard · 80
Costs 80 now and 80 a day in wages, including today.
A new guard starts unassigned.
ON DUTY
3 held · 0 free
Guard · Sector Post | Release   (×3)
A released guard stays hired and goes back to the pool.
ON THE PAYROLL
240 a day
```

**The sentence renders, and it is not #920's failure mode.** `noteLaidOut=true`
in every reading. Act 1b measures its box at all five shipped viewports:

```
[act1b] 1440x900  note="Only free guards answer incidents." box=238x13 scrollH=13 clamp=none    overflow=visible
[act1b] 1280x720  note="Only free guards answer incidents." box=238x13 scrollH=13 clamp=none    overflow=visible
[act1b] 1024x768  note="Only free guards answer incidents." box=238x13 scrollH=13 clamp=none    overflow=visible
[act1b] 900x600   note="Only free guards answer incidents." box=238x13 scrollH=13 clamp=1       overflow=hidden
[act1b] 375x812   note="Only free guards answer incidents." box=333x13 scrollH=13 clamp=none    overflow=visible
```

`scrollHeight` equals the box height in every cell, including the 900×600 one
where `hud.css` clamps `.hud-staff__note` to a single line. **Nothing is
clipped.** The fix's own claim about the clamp holds.

### And the sentence is true — VERIFIED

`hud.security.coverage-met-hint` is at
`src/content/default-locale-en.ts:1917`. The dispatch path it describes:
`IncidentResponseSystem.claimableResponders` draws from
`claimableGuardIds` (`src/simulation/security/post-eligibility.ts:103`), which
is `GuardRoster.unassignedGuardIds()` filtered by role
(`src/simulation/security/guard-roster.ts:236`); a posted guard is
`'travelling'` or `'on-post'`, never `'unassigned'`. The measurement below is
the same claim from the other side.

### What then happens to that prison — MEASURED, act 1

Eight incidents over in-game days 5 to 12, every timeline read off
`hud/incident-detail`:

```
incident.assault.1 sev=3 required=2 :: active@11550 -> lapsed@12160 :: injured=2  damage=3
incident.assault.2 sev=4 required=2 :: active@13950 -> lapsed@14560 :: injured=2  damage=4
incident.assault.3 sev=4 required=2 :: active@16350 -> lapsed@16960 :: injured=2  damage=4
incident.assault.4 sev=5 required=3 :: active@18750 -> lapsed@19360 :: injured=2  damage=5
incident.assault.5 sev=5 required=3 :: active@21150 -> lapsed@21760 :: injured=2  damage=5
incident.riot.6    sev=7 required=4 :: active@22950 -> lapsed@23560 :: injured=17 damage=7
incident.assault.7 sev=5 required=3 :: active@23800 -> lapsed@24410 :: injured=2  damage=5
incident.assault.8 sev=5 required=3 :: active@26200 -> lapsed@26810 :: injured=2  damage=5

summary={"total":8,"stillOpen":0,"resolved":0,"lapsed":8,"totalInjured":31,"totalPropertyDamage":38,"escapes":0}
responseMetrics={"incidentsResolved":0,"incidentsLapsed":8,"respondersDispatched":0,"routeFailures":0}
```

**Eight of eight lapsed. `respondersDispatched: 0` — nobody was ever sent, not
once.** Every timeline is two states, `active -> lapsed`; `notified` is never
reached. The riot injured all seventeen prisoners. Against the round before the
fix — seven fights, seven lapses, zero contained — the prison is unchanged.

The coverage block at the end of that run is byte-identical to the one at the
start: `tone=success`, `3 of 3`, `Covered`,
`"Only free guards answer incidents."`, `3 held · 0 free`.

### A control at six guards — MEASURED, act 1's first run

The same prison shape with six hired (3 held, 3 free) is a different prison:

```
summary={"total":8,"resolved":5,"lapsed":3,"totalInjured":36}
responseMetrics={"incidentsResolved":5,"incidentsLapsed":3,"respondersDispatched":11}
```

The three that lapsed were the **two riots asking for four responders** and one
assault that opened before the hires landed. So with three free guards the
assaults (asking 2–3) are answered and the riots (asking 4) are not.

### The finding — DERIVED and JUDGEMENT

**The fix replaced a true sentence with a truer one, and did not change what a
player can do.** Three things sit between the new sentence and an action:

1. **The badge and the tone did not move.** `Covered`, `tone=success`, green,
   at exactly the count that dispatches nobody. `describeStaffCoverage`'s
   `shortage <= 0` branch (`src/ui/hud/staff-panel.ts:448-453`, VERIFIED) is one
   rung and carries one badge.
2. **The two halves of the fact are in two blocks.** *"Only free guards answer
   incidents"* is in `GUARD COVERAGE`; `3 held · 0 free` is in `ON DUTY`,
   below `WHO TO HIRE` and a three-row roster. A player has to carry the first
   down to the second.
3. **`consequenceKey` is `undefined` on this rung** — measured
   `consequence: "" (laid out: false)` — where the `Unguarded` rung has
   *"No guard is posted here, so nobody in this sector is kept safe."* The rung
   that produces the worst measured outcome in this record is the one with no
   consequence line.

The fix's own reasoning for naming no number is sound and is quoted in
`hud.security.coverage-met-hint`'s docblock: `requiredResponderCount` is
`max(1, ceil(severity * 0.5))` and the honest reserve is 2 to 5. **The
measurement above is the cost of that soundness**: 2 to 5 is exactly the range
a player cannot guess, and the run at three free guards shows guessing low
still loses every riot.

---

## 2. #944 — a shared tile draws both, up to about eight of them

### What the worker publishes — MEASURED, act 2

22 prisoners and 6 guards, decoded off the `simulation/delta` keyframe:

```
[act2] STACKS: tile(16,16) 16P+6G on 1 distinct point(s) | tile(12,12) 6P+0G on 1 distinct point(s)
[act2] every actor: ["P@12.000,12.000" ×6, "P@16.000,16.000" ×16, "G@16.000,16.000" ×6]
```

Every actor on a tile is published at the **identical** sub-tile position, which
is the input `crowd-spread.ts` exists to fan out. The simulation-side stacking
#944 §3 asks about is unchanged and was never in this fix's scope.

### What the screen draws — MEASURED, screenshots opened

Screenshots are in
`…/scratchpad/are-the-fixes-real/`: `2-full-frame.png`,
`2-the-block.png`, `2-cell-magnified.png`, `2-stack-of-6-at-12-12.png`,
`2-stack-of-22-at-16-16.png`.

- **`2-stack-of-6-at-12-12.png` (×8, six prisoners):** six distinct figures,
  cascading south-east, six separate heads and six separate pairs of shoes,
  countable by eye. Before the fix this tile drew one. **The fix works, and
  works better than its own docblock claims** — that says *"two or three read
  as two or three figures"*, and six read as six.
- **`2-stack-of-22-at-16-16.png` (×8, sixteen prisoners and six guards):** one
  extruded orange slab with four or five head outlines visible along its top
  edge, and **one** blue guard at the south-east end. The six guards read as
  one guard.
- **`2-full-frame.png`, the player's actual view at 100 %:** the (12,12) tile
  is a legible huddle; the (16,16) tile is one orange figure and one blue
  figure. **At 100 % zoom the tile holding 22 of the prison's 28 people still
  reads as two figures**, which is the pre-fix reading for that tile.

### Why, in numbers — VERIFIED then DERIVED

`crowdSpreadOffset` is `progress = rank / (count - 1)` against
`CROWD_SPREAD_SPAN_TILES_X = 0.44` and `CROWD_SPREAD_SPAN_TILES_Y = 0.3`
(`src/rendering/actors/crowd-spread.ts:86`, `:95`, `:176-178`, VERIFIED). At
`TILE` 64 the step between adjacent ranks is therefore
`28.16 / (n - 1)` screen pixels east and `19.2 / (n - 1)` south:

| actors on the tile | step east | step south |
| --- | --- | --- |
| 2 | 28.2 px | 19.2 px |
| 6 | 5.6 px | 3.8 px |
| 9 | 3.5 px | 2.4 px |
| 16 | 1.9 px | 1.3 px |
| 22 | **1.34 px** | **0.91 px** |

**DERIVED:** the step falls below 4 px east at `n ≥ 9`. A character frame is
authored 256×384 for a 1×1 footprint, so at 100 % zoom a figure is tens of
pixels wide; a 1.34 px step exposes about 3 % of the figure behind.

**The bound is not a defect in the fix — the fix's docblock states it in
advance** (*"twenty-two read as a crowd standing on one tile rather than as one
person"*, and *"it reports the crowd; it does not count it"*). What this record
adds is the number at which the report stops being readable — **about eight** —
and the observation that the prison shape #944 was filed about puts 79 % of its
population past that number.

---

## 3. #942 — a run of presses is a run, and a different thing eats the run

### The command sender — MEASURED, act 3

One prison, six beds, one zoned cell, warmed up to a settled panel layout, then
twelve runs. Every press re-reads the control's box, so every press lands on
the control (checked with `elementFromPoint` before each one):

| speed | Admit presses | commands submitted | prisoners | Hire presses | commands | staff |
| --- | --- | --- | --- | --- | --- | --- |
| 1× | 25 | **25** | 10 → 35 | 8 | **8** | 0 → 8 |
| 2× | 25 | **25** | 35 → 60 | 8 | **8** | 8 → 16 |
| 4× | 25 | **25** | 60 → 85 | 8 | **8** | 16 → 24 |
| 4× again | 25 | **25** | 85 → 110 | 8 | **8** | 24 → 32 |
| 2× again | 25 | **25** | 110 → 135 | 8 | **8** | 32 → 40 |
| 1× again | 25 | **25** | 135 → 160 | 8 | **8** | 40 → 48 |

```
[act3] === console lines mentioning a command sequence: 0 ===
[act3] === console lines mentioning a refusal/rejection: 0 ===
```

**150 admissions and 48 hires, every one landed.** The console line the defect
used to print — *"The simulation has not reported its command sequence yet"* —
appears **not once**. Run in both directions so the growing population cannot
be confused with the speed. #942 is real and reaches the player.

### But the run a player actually makes still loses two thirds of itself — MEASURED, act 3b

A fresh prison, six beds built, **nobody admitted yet**, and the hand held
still: 25 presses on the point `Admit` occupied when the run began.

```
[act3b] intake panel before a single press:
        "INTAKE | Collapse | Admit a prisoner |
         A prison needs a cell before it can admit anyone. It does not need a free bed:
         an arrival with none waits until a bed is free."
[act3b] Admit sits at {"x":1173,"y":720.25,"width":246,"height":44} before the run
[act3b] 25 presses at one point in 7798ms: 9 on the control, 16 off it, first miss at press 5
        -> 9 AdmitPrisoner command(s) | prisoners 0 -> 9
[act3b] Admit sits at {"x":1173,"y":662.578125,"width":246,"height":44} after the run
[act3b] intake panel after:
        "INTAKE | Collapse | Admit a prisoner | 3 waiting with no bed to sleep in |
         A prison needs a cell before it can admit anyone. … |
         IN INTAKE | 3 of 9 | 3 at Cell Assignment"
```

**Twenty-five presses, nine prisoners.** The button moved **57.7 px** upward
because the panel grew a *"3 waiting with no bed to sleep in"* line and an
`IN INTAKE` section, and the presses from the fifth onward landed on whatever
is now at y = 720.

**JUDGEMENT.** This is indistinguishable, from the player's chair, from the
defect #942 fixed: a run of presses, a fraction of the prisoners. It is a
different mechanism — the presses never reach a control, so no command is
submitted, no refusal is logged and nothing appears on screen — and no open
issue names it (searched; nothing matched).

**A note for the other tester's surface, in one line:** the alerts list
accumulates and is never cleared by anything the run did — after twelve runs it
held eight rows including *"A riot has broken out — 110 prisoners have stopped
taking orders. Day 9"* still sitting beside a Day 11 row.

---

## 4. #943 — a new prison keeps the old one, and Load still does not

### The path the fix took — MEASURED, act 4

Prison A: 1 zoned cell, 3 beds, 5 prisoners, 2 guards, **never saved by hand**.

```
[act4] prison A before New prison :: {"tick":6735,"prisoners":5,"rooms":1,"staff":2,"funds":22935,"accommodation":3}
[act4] save panel before :: rows=["0: New Prison (1 gen) active=true buttons=Load/Delete"]
[act4] DOM dialogs at the moment of pressing New prison: 0
[act4] native dialogs so far: []
[act4] prison B :: {"tick":6857,"prisoners":0,"rooms":0,"staff":0,"funds":25000,"accommodation":0}
[act4] save panel after New prison :: rows=["0: New Prison (1 gen) active=true", "1: New Prison (3 gen) active=null"]
[act4] prison A on the way back :: {"tick":6857,"prisoners":5,"rooms":1,"staff":2,"funds":22935,"accommodation":3}
```

**Nothing was lost.** Prisoners, rooms, staff, funds and accommodation all
identical; the tick came back 122 ticks *ahead* of the reading taken before the
press, which is the capture having run later than the reading. Prison A's row
went from `(1 gen)` to `(2 gen)` — that generation is the capture. #943 is real
and reaches the player.

**Still zero dialogs**, DOM and native both counted. The press is now safe and
still silent; the fix says so itself —
`SessionController.getLastOutgoingCapture()`'s docblock (VERIFIED):
*"Nothing in `src/ui/` reads it yet."*

### The sibling the fix deliberately left alone — MEASURED, acts 4b and 4c

`loadPrison` captures the outgoing session only when the prison being loaded is
a **different** one; the fix's commit argues that at length and says what the
row actually needs is a confirmation.

Act 4b pressed `Load` on the live prison's own row right after an autosave and
lost nothing (tick 7153 → 7337, funds 23,015 both sides), which is the benign
case. Act 4c asked it properly, using the fact the fix itself records — the
autosave is **command-driven, not play-driven**:

```
[act4c] save panel once the autosave has run :: status "Saved (generation gen-mtniziyd-4)." rows=["0: New Prison (1 gen) active=true"]
[act4c] the prison when it was last saved   :: {"tick":8905,  "funds":23755, ...}
[act4c] after 90s of watching and pressing nothing :: {"tick":16148, "funds":25975, ...}
[act4c] save panel after that watching :: status "Saved (generation gen-mtniziyd-4)." rows=["0: New Prison (1 gen) active=true"]
[act4c] === came back to :: {"funds":23015, ...}
[act4c] strip after :: "… 23,015 FUNDS … DAY 3 … 31% …"
[act4c] dialogs: [] + 0 DOM dialog(s)
```

**Ninety seconds of running clock produced no new save** — same generation id,
same `(1 gen)` — because nothing was pressed and nothing marked the session
dirty. Pressing `Load` on that prison's own row then took the treasury from
**25,975 back to 23,015** and the clock back to **Day 3, 31 %**, with **zero
dialogs of any kind**.

**UNKNOWN:** the exact kernel tick after the load. `currentTick` reads the
newest `simulation/clock-state` message, and with the clock paused after a load
no new one arrives, so the 16,291 it answered is pre-load residue. The treasury
and the day are read off `simulation/status-counts` and the status strip
respectively and are post-load; the tick is not, and is not used above.

---

## 5. #945 — the standing object says so; its sibling on the same control does not

### The press the fix was written for — MEASURED, act 5a

A zoned cell, a bed built on (13,16), then `Remove` armed and pressed on it:

```
[act5] 5a the bed IS standing: accommodationCapacity=4 (was 3)
[act5] 5a removal produced 1 command(s): [{"type":"RemoveObject","x":13,"y":16}]
[act5] 5a accommodation 4 -> 3
[act5] 5a BAND: "The object was removed — the money it cost does not come back."
[act5] 5a NEW ALERT ROWS: ["The object was removed — the money it cost does not come back. Day 3 Warning Clear this alert"]
```

The sentence reaches **both** surfaces — the event band and the alerts list —
and act 5d repeats the press at 900×600, where `hud.css` drops the alerts
panel:

```
[act5] 5d pressed … tile (14,12) at 900x600: [{"type":"RemoveObject","x":14,"y":12}] | accommodationCapacity 2 -> 1
[act5] 5d BAND at 900x600: "The object was removed — the money it cost does not come back."
[act5] 5d NEW ALERT ROWS: ["The object was removed — the money it cost does not come back. 3× Day 4 …"]
[act5] 5d where a sentence can land at 900x600: event band laid out | alerts list laid out | alerts panel ABSENT
```

**#945 reaches the player, on both surfaces, at both viewports measured.**

Act 5c removed an **occupied** bed with nowhere to rehouse the resident
(capacity 3, occupants 3): capacity 3 → 2, occupants 3 → 3, and the money
sentence held the band for about 2.5 s uncontested. No relocation notice,
because there was nothing to relocate to — which is the stranded case
`relocation-notice-loop.test.ts` is about, not a defect.

### The sibling on the same control — MEASURED, act 5b

**The same `Remove` control, on the same tile, one tick earlier.** With the
clock **paused**, so no tick can pass between the two presses and the order is
provably still an order:

```
[act5] 5b clock before the order: {"mode":"paused"} at tick 6926
[act5] 5b ordered a bed at (16,16) with the clock paused:
        [{"type":"PlaceObject","orderId":"object-15382c54-…","definitionId":"bed-wooden","x":16,"y":16}]
[act5] 5b removal command with the clock still paused: [{"type":"RemoveObject","x":16,"y":16}]
[act5] 5b accommodationCapacity 3 -> 3 | queue after ".hud-build__queue: not laid out"
[act5] 5b NEW ALERT ROWS: []
[act5] 5b BAND (sticky — it keeps the last event): "The object was removed — the money it cost does not come back."
```

**Zero new alert rows.** No removal sentence, and no `order-cancelled` sentence
either. And the band still holds **5a's** sentence, which is *false* of what the
player just did: a cancelled order refunds.

### Why — VERIFIED

```
src/simulation/objects/object-placement-service.ts:671-674
    const pending = this.orderBuildingObjectAt(tile);
    if (pending !== undefined) {
      this.orders.cancelOrder(pending.order.id);
      return { kind: 'order-cancelled', orderId: pending.order.id, … };
    }
```

`cancelOrder` is called **directly on `ConstructionSystem`**, not through the
command handler. The line that speaks for a cancelled order is
`src/simulation/construction/handler.ts:156` —
`if (stateAtCancellation !== undefined) events.recordBuildOrderCancelled(stateAtCancellation, context.tick);`
— and it is inside the **`CancelBuildOrder` command** branch, which this route
never enters. `src/simulation/runtime/session-commands.ts:695-716`, the
`RemoveObject` success branch, records nothing at all and says so in a comment.

**So the same order, cancelled two ways, says two different things:** cancelled
from the Build panel's queue row it speaks; cancelled by arming `Remove` and
pressing its tile it is silent.

**This corrects #945's own premise.** That issue's §1 labels the pending arm
*"the channel #932 fixed"* and contrasts it with the standing arm. #932 made the
**`CancelBuildOrder` and `Undo` commands** state-aware; it did not reach
`ObjectPlacementService.remove`'s pending arm, which takes neither command. The
fix inherited the premise, scoped itself to `kind === 'removed'`, and the
sibling stayed exactly where it was. **#945's own weakest-claim shape — two
channels, one fixed — reproduced itself one level down.**

**Also MEASURED, and it is the same fact from the player's side:** the event
band is **sticky**. It holds the last event until another displaces it, so the
silent press leaves the previous press's sentence on screen. `.hud__event`
read `"The object was removed — the money it cost does not come back."` at the
moment the player had just cancelled an order that refunds.

---

## 6. #926 — the arm label stays in its box, everywhere, in every state

**MEASURED**, act 6, five viewports × three Build-panel states, plus the Rooms
panel's arm on the same sweep. `pastButtonPx` is `label.right − button.right`
(negative is inside), `overNeighbourPx` is `label.right − Remove.left`:

```
1440x900 / 1280x720 / 1024x768 / 900x600, all three states:
  button 108.4x44.0 (116.8 while removing), label 66.4x30.0 (74.8 while removing)
  pastButtonPx -9.0   overNeighbourPx -17.0   rowHeight 44.0
  .hud-rooms__arm "Draw on map": button 114.7x44.0, label 72.7x30.0, pastButtonPx -9.0, rowHeight 44.0
375x812:
  arrival  pastButtonPx -45.7 | armed -49.3 | removing -50.0   rowHeight 44.0
```

Against the pre-fix figures in the fixing commit — 17.8 px past its own button
and 9.8 px over `Remove` at every viewport 900 px wide or wider — the label is
now **9.0 px inside** its button in every one of those cells, and the row is
44.0 px tall in every state at every viewport, which is what the fix promised
about the height budget. `6-actions-row-*.png` shows *"Place on map"* wrapped
onto two lines inside the blue button with `Remove` untouched. **#926 is real
and reaches the player.**

**One instrument artefact, recorded so the number is not misread:**
`overNeighbourPx` for `.hud-rooms__arm` reads +738 to +1283 because
`.hud-rooms__confirm` is not laid out until a rectangle has been drawn, so its
`getBoundingClientRect()` is the origin. It is not an overlap.

---

## 7. What was not reached

- **A removal that relocates somebody.** Act 5c's prison had capacity 3 and
  three residents, so removing a bed stranded a resident rather than moving
  one, and the `prisoners.relocated` notice never fired. The ordering claim in
  `2f5d31b3` — that the `'warning'` takes the band and the `'info'` waits in
  the dwell slot — is therefore **untested here**. The shape that would test it
  is a room with one free bed and an occupied bed removed.
- **A pending order cancelled from the Build panel's queue row**, to confirm
  from the player's side that that path does speak. Only the code was opened.
- **#941 at other populations.** One population (17, asking for 3) and two
  guard counts (3 and 6).
- **#944 between 6 and 22 actors.** The step table is DERIVED arithmetic; only
  6 and 22 were photographed, so "about eight" is a computed threshold and not
  a measured one.
- **Act 4c's post-load kernel tick**, for the reason given in §4.
- **A `900x600` calibration.** `calibrate`'s bisection found no probe point at
  that viewport that answered with a `RemoveObject`; act 5d re-used the
  1440×900 origin and verified it by the tile the command reported.

## 9. Improvement proposals

Each is grounded in a measurement above. **Proposals only — this branch is
read-only on `src/`.** Where one would put a sentence on screen, the code that
would render it is opened and the sentence is shown to be true, per
`AGENTS.md` reservation 4's partial release of 2026-09-04.

### 9.1 Close #945's sibling with the sentence that already exists — no new string

**What a player sees today:** cancelling an object order from the Build panel's
queue row says *"The order was cancelled — the money it cost is refunded."*;
cancelling the same order by arming `Remove` and pressing its tile says
nothing, and leaves the previous press's *"the money it cost does not come
back"* on the band (§5, MEASURED).

**What to do:** at
`src/simulation/objects/object-placement-service.ts:671-674` the pending arm
already holds `pending.order`, so `pending.order.state` is at the call site.
Hand it to the same `RemovedObjectNoticePort` shape #945 added — or a second
method on it — and let it reach
`SimulationEventLog.recordBuildOrderCancelled(stateAtCancellation, tick)`
(`src/simulation/events/event-log.ts:655-666`, VERIFIED), which switches on the
state and picks between `construction.order-cancelled` and
`construction.order-cancelled-underway`.

**Why no new string is needed, and why the objection #945 raised does not
apply here.** #945 refused to reuse *"the order was cancelled"* for a standing
bed because a standing bed **is not an order any more**. A pending object
placement **is** an order — `cancelOrder` is what this arm calls — so the
sentence names exactly what the player did. And the refund clause is true of
this arm by the owner's ruling 20 of 2026-08-31 (ADR 0076's amendment), quoted
in `object-placement-service.ts:246-259`: money back for an order the crew has
not started, nothing for one it has, which is precisely the split
`recordBuildOrderCancelled` already makes.

**Cost:** one field through one port, no schema change, no locale change, no
new event type. **What it buys:** the same order cancelled two ways stops
saying two different things, and the sticky band stops asserting a loss that
did not happen.

### 9.2 Put the free-guard count where the `Covered` badge is

**What a player sees today:** `3 of 3 / Covered` in `GUARD COVERAGE`, and
`3 held · 0 free` in `ON DUTY`, separated by `WHO TO HIRE`, a price, two notes
and a three-row roster (§1, MEASURED). The sentence between them —
*"Only free guards answer incidents."* — is true and names the quantity the
player cannot see from where they are reading.

**What to do, in ascending cost:**

1. **Move nothing, add nothing: render `hud.security.held-summary` in the
   coverage header as well**, beside `3 of 3`. The key already exists and
   already renders `{held} held · {unassigned} free`
   (`src/ui/hud/staff-panel.ts:1168-1171`, VERIFIED). Drawing an existing true
   string in a second place carries no truth burden at all. The header would
   read `GUARD COVERAGE 3 of 3 · 3 held · 0 free · Covered`.
2. **Take the tone off `success` when nobody is free.** `describeStaffCoverage`
   takes only `HudStaffCoverageViewModel`, which carries `required`,
   `assigned`, `shortage` and **not** `unassigned`
   (`src/ui/hud/view-model.ts:1860-1867`, VERIFIED); `unassigned` lives on
   `HudHeldGuardsViewModel` (`:975-982`). So this costs one argument. With it,
   `shortage <= 0 && unassigned === 0` returns `tone: 'warning'` with the badge
   word **unchanged** — the requirement really is met, and the badge says only
   that.
3. **Fill the consequence line, which is empty on this rung** (measured
   `consequence: "" (laid out: false)`) while the `Unguarded` rung has one. A
   sentence that would be true on the `unassigned === 0` branch:

   > **No guard is free, so nobody can be sent to an incident.**

   **Opened to establish it, not inferred.** `unassigned` is
   `entityIds.length - rows.length` over the whole roster
   (`src/simulation/presentation/guard-release-projection.ts:213-216`,
   VERIFIED), so `unassigned === 0` means every roster member is held and in
   particular no guard is unassigned. The only thing that puts a guard on an
   incident is `IncidentResponseSystem.claimableResponders`
   (`src/simulation/incidents/response-system.ts:499`; its two callers are
   `:482` and `:635` and there is no other, VERIFIED by grep over
   `src/simulation`), which draws from `claimableGuardIds(this.guards)`
   (`:509`) → `GuardRoster.unassignedGuardIds()` filtered by role
   (`src/simulation/security/post-eligibility.ts:103`,
   `src/simulation/security/guard-roster.ts:236`). With no unassigned guard
   that set is empty, and `requiredResponderCount` is `max(1, …)` — never
   zero — so no incident can be claimed. It promises **no outcome**: it says
   who can be sent, not that an incident is coming and not that sending
   anybody would contain it, which keeps it inside `describeStaffCoverage`'s
   own refusal to predict and PR #854's refusal of a containment claim.

   Measured against this: 8 incidents, 8 lapsed, `respondersDispatched: 0`.

**What this does not do, deliberately:** name a number to hire. The reserve is
2 to 5 and depends on what happens, which is balance and the owner's (#941
option 1). Options 1–3 make the *state* visible; they do not size it.

### 9.3 A count on a crowded tile, with the threshold derived rather than chosen

**What a player sees today:** six actors on a tile read as six figures; 22 read
as one orange slab and one guard (§2, MEASURED, screenshots).

**The threshold is computable rather than a matter of taste.** The step between
adjacent ranks is `CROWD_SPREAD_SPAN_TILES_X / (n - 1)` tiles = `28.16 / (n-1)`
screen pixels at `TILE` 64 (VERIFIED, `crowd-spread.ts:86,:176-178`). It falls
below 4 px — under a tenth of a figure's width — at **n ≥ 9**. So: draw a small
count over a tile whose group exceeds eight, and leave the cascade alone below
that, where it already works.

This is a new world-space affordance and #944 §4.3 says so; it wants an ADR,
and this record does not write one. What it adds to #944's own pricing is the
number 8 and the reason for it.

**What would be worse, and why:** widening the fan. The renderer does not know
where the room's walls are, so a fan that leaves the tile claims ground no
snapshot named — `crowd-spread.ts:63-73` argues this and is right.

### 9.4 Stop the Intake panel moving the button a player is pressing

**What a player sees today:** 25 presses, 9 prisoners, the button 57.7 px from
where it started, the first miss at press 5 (§3, MEASURED).

**What to do:** the two blocks that appear are the *"N waiting with no bed to
sleep in"* line and the `IN INTAKE` section, and both appear **below the
panel's header and above `Admit a prisoner`**. Either

1. **reserve their height** — render them always, empty, at their occupied
   height, so the control never moves; or
2. **put `Admit a prisoner` above everything that can grow**, so nothing that
   arrives can displace it.

Option 2 costs no layout budget and is the one the row order already almost
has. Neither needs a string. **Grounded on:** a run at a fixed point loses 16
of 25 presses, and the same run with the position re-read loses none — the
difference is entirely the geometry.

**And the class, not the instance:** any panel that grows a row while a control
below it is being pressed has this defect. The sweep worth running is every
`.hud-*__list`/section that appears conditionally above a button.

### 9.5 `Load` on the live prison: capture, or ask

**What a player sees today:** 90 s of running clock produces no save, and
pressing `Load` on that prison's own row takes the treasury from 25,975 to
23,015 and the clock back to Day 3, with zero dialogs (§4, MEASURED).

#943's own commit rules out capturing on this path, and the reasoning is
sound: a save written into the retained window `loadPrison` is walking makes
`no-valid-generation` unreachable and turns a real refusal into a fake
recovery. It names what is actually needed — *"a confirmation before the
revert … a sentence for the player and a change to `src/ui/save-panel.ts`"* —
and says neither is in that commit.

**Two candidates, and the second is cheaper than it looks:**

1. **The confirmation** #943 names. It needs a sentence, and the sentence has
   to be true of a save panel that cannot currently say how much would be lost:
   `getLastOutgoingCapture()` describes the *outgoing* save, not the gap.
2. **Make the autosave play-driven as well as command-driven.** The 90-second
   loss exists because `src/main.ts` marks the session dirty only on
   `onCommandAccepted` — which #943's own commit quotes as the reason its
   capture cannot be conditional on dirtiness. A prison that has advanced
   thousands of ticks has changed, whether or not anybody pressed anything, and
   a tick-count threshold beside the command hook would close both this row and
   the *"watched rather than played"* case #943 measured. That is a persistence
   decision and probably an ADR.

**What is measured and what is not:** the loss is measured. Which of the two
answers is right is a decision, not a finding, and this record does not take
it.

## 8. My weakest claim, and what would change my mind

**That the 22-actor tile "still reads as two figures" to a player.** It rests
on one screenshot at one zoom level, judged by eye, plus a step-size
calculation. The step arithmetic is solid; the reading of the picture is not a
measurement. **What would change my mind:** a count of distinct silhouettes
extracted from the frame programmatically, or the same tile photographed at the
zoom levels the wheel actually reaches — at 200 % the 1.34 px step becomes
2.7 px and the picture may separate. I did not zoom, and that is the single
cheapest experiment that could overturn this section.

Second-weakest: **that act 3b's lost presses are what a real player's hand
does.** A player pressing a button twenty-five times may well track it with
their eyes. The measurement is exact about what happens when they do not; it is
JUDGEMENT that they often will not.
