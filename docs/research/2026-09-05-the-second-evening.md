# 2026-09-05 — the second evening: a player comes back to a prison they have forgotten, and reads the screen

**Played on `agent/playtest-the-second-evening`, cut from `413def1c`
(v0.0.476), which was still `origin/main` when the branch was taken and still
`origin/main` when the last act finished.** The application under test reports
itself on the status strip as `v0.0.476` in every act (MEASURED). The commit
hash beside it is **this branch's head, not `main`'s** — `a513eef` in act 1 and
`153d5e0` in acts 2 to 5, because the playtest server serves this worktree and
two commits of the instrument landed between the runs. No `src/` file differs
from `413def1c` in any of them: this pass is read-only on `src/`. The
instrument is `tests/browser/playtest-2026-09-05-the-second-evening.playtest.ts`,
which is **not** a CI gate: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `.playtest.ts` is collected only by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.

## The question

A player builds a prison one evening and comes back the next. They have
forgotten what they built, what they were doing, and what was going wrong.
**Does anything on the screen bring them back up to speed — or do they have to
reconstruct it?**

This is deliberately **not** the reload test.
`docs/research/2026-09-04-does-a-prison-come-back.md` established that a prison
comes back *mechanically* intact, tick for tick, and this pass reproduces that
at a newer version. The question here is what a *person* gets, which is a
different thing entirely: **the state is restored and the player's memory is
not.**

## The answer, in one line

**Every number comes back and nothing a player was *doing* does.** One press of
*Load* restores kernel tick `5905` to kernel tick `5905` — delta **0**
(MEASURED, act 1) — with the same 6 prisoners, the same `3 with no bed`, the
same 3 staff, the same 21,335 in funds and the same `DAY 3` on the strip, all
word for word. What does not come back is the working state around them: the
**tab the player had open** (`build` → `overview`), the **alerts row** they left
standing, the **refusal band** under it, and the **camera**, which comes back
**14 tiles** from where it was left, at the position a fresh prison starts from
(MEASURED, acts 1 and 5, the last read off a real `RemoveObject` rather than
inferred from pixels). And the largest block of prose on the arrival screen —
**74 words, 534 characters** — is the save report, which describes the *format* (`RNG stream states`, `entity id
liveness`, `navigation caches`) and contains not one word about this prison.
**No screen at any point in the round trip says what day it is, what the prison
was doing, or what the player should do next**; the word `ago` does not appear
on the cold page and neither does `last played`, `welcome back`, `left off` or
`continue` (MEASURED, act 1).

The load screen is worse than the arrival screen, and this pass **confirms the
prior record rather than softening it**: the whole identity of a save is the
string `New Prison (3 gen)`, with `title`, `aria-label` and `aria-current` all
`null` (MEASURED, act 1 and act 2) — and a prison's `updatedAt` is already in
the renderer's hand, three lines above where the row is built.

**The one place the game does well is the unfinished work it holds in the
simulation.** An order placed and not delivered came back exactly — `ON THE WAY
| 1 bought · 1,600 back if cancelled | 40 × Brick · 1,600 back | Cancel`, byte
for byte across the night (MEASURED, act 1) — and a designated room that is not
finished still says so. Both cost one tab press to find, and neither is
mentioned on the screen the player lands on.

## How to read this record

Following `docs/research/README.md`'s tiers, with the one this repository's
playtests add:

- **MEASURED** — a real run of this tree's own code in a browser, output pasted.
- **VERIFIED** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **JUDGEMENT** — what a player would do or feel. Legitimate, and marked.
- **UNKNOWN** — not established in this pass.

Two channels are reported and they are **never mixed**:

- **HUD** — `innerText` read out of the real DOM, or a real attribute on a real
  control. This is what a player sees.
- **STATE** — a `simulation/request-projection` round trip to the worker (its
  reply's own `payload.tick`, answered while paused), or a figure off
  `simulation/status-counts`.

**Every tick in this record is a projection reply's `payload.tick`, never
`simulation/clock-state`.** That is the instrument bug
`docs/research/2026-09-04-does-a-prison-come-back.md` found and it would bite
here exactly as it did there: the clock is stopped on both sides of the night,
so the tee's last `clock-state` message survives the page reload and would be
read as the restored tick.

### The unit this record answers in: interactions, not seconds

"How long until the player is oriented" has no honest answer in seconds. A
playtest's wall clock is the machine's — and this one shared a box with another
tester's suite throughout — and `docs/AGENT_WORKFLOW.md` forbids resting a claim
on it. **One interaction is one press of one control a player would have to
decide to make.** Reading what is already on screen costs nothing and is not
counted. `Interactions` in the instrument is a real counter wrapped around every
click on the evening-two side, and it prints its own log.

## Reproduction

Run one act at a time. The port is this round's; use your own.

```
LOCKSTATE_BROWSER_TEST_PORT=5332 node --experimental-transform-types \
  --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-the-second-evening.playtest.ts -g "act 1"
```

| Act | What it does | Runtime |
| --- | --- | --- |
| 1 | the whole experiment: a real prison built, paused, left mid-order with a problem brewing; `page.reload()`; then a cold read with every press counted | 2.7 m |
| 2 | three prisons in three measurably different states, each saved; every row read exactly | 43.5 s |
| 3 | a prison in trouble against an empty one, every surface diffed line by line | 2.9 m |
| 4 | the Rooms tab against the rooms actually owned, and a prison switch with no reload | 1.6 m |
| 5 | a wall run queued on a stopped clock and a camera moved on purpose, across the night | 47.8 s |

Every runtime above is what Playwright reported for that act on this container,
and **none of them is evidence of anything about the game**: act 1 took 10 m
under another tester's suite and 2.7 m when the box was quieter, for identical
work. They are here so the next reader can budget, not so anything can be
concluded.

**Act 1 cannot be two tests and that is not a shortcut.** Playwright gives every
`test()` a fresh browser context, IndexedDB is per-context, and a save written
in one test is not there in the next. The hard break between the evenings is a
real `page.reload()`, which is what closing the tab and coming back does.

---

# 1. The screen a returning player lands on is about the save format, not about their prison

**MEASURED, act 1.** A prison built with the mouse — a walled 6×6 cell, 3 beds,
a toilet, 6 prisoners admitted, 3 guards hired, 40 bricks ordered and not yet
delivered — was **paused**, read panel by panel, saved by hand, and the page was
reloaded. Then *Load*, and the arrival screen read before a single further
press:

```
[act1] HUD evening two, the arrival screen :: {
 "activeTab": "overview",
 "clockDay": "3",
 "strip": "... | 6 | PRISONERS | 3 with no bed | 0 | HIGH RISK | 3 | STAFF | 6 | COVERAGE | Covered | 1 | ROOMS | 0 | INCIDENTS | Clear | 0 | CONTRABAND | 21,335 | FUNDS | 414 | EARNED TODAY | DAY | 3 | Through the day | 46% | ... | Speed 1× | PAUSED",
 "alerts": "No active alerts",
 "refusal": ".hud__refusal: not laid out",
 "event": ".hud__event: not laid out",
 "minimap": "MINIMAP | Collapse | MINIMAP IS NOT AVAILABLE YET | ALERTS | No active alerts",
 "sidePanel": "INTAKE | Collapse | Admit a prisoner | 3 waiting with no bed to sleep in | ...",
 "aside": "... | New Prison (3 gen) | Load | Delete | Loaded. | Restored: kernel tick and command queue, RNG stream states, world terrain and ownership, construction orders and undo/redo, entity id liveness, prisoners, needs, actions and cell assignments, jobs, containers and utility networks, doors, security sectors, guards and patrols, contraband, intelligence and searches, incidents, gangs and tunnels, prisoner and staff names. Not carried by this save version: room and topology caches (recomputed from the world), navigation caches and in-flight path requests (re-issued on the next tick)."
}
```

**The prison itself is exact.** Kernel tick `5905` in, kernel tick `5905` out:

```
[act1] STATE evening one :: tick=5905 clock={"mode":"paused"} counts={"tick":5905,"prisoners":6,...,"treasuryMinorUnits":21335,...,"staff":3}
[act1] STATE evening two after Load :: tick=5905 clock=null counts={"tick":5905,"prisoners":6,...,"treasuryMinorUnits":21335,...,"staff":3}
[act1] STATE tick delta across the night = 0
```

That reproduces `docs/research/2026-09-04-does-a-prison-come-back.md` at a newer
version and adds nothing to it. **What this pass is about is the other column of
that reading.** The largest thing that arrives between the cold page and the
arrival screen is the save panel's detail line: **74 words and 534 characters**
(**DERIVED**, counted over the quoted string) naming eleven restored save
*scopes* and two caches. Two other sentences arrive with it and both are about
the prison — the Intake panel's `3 waiting with no bed to sleep in` and its
`IN INTAKE / 3 of 6 / 3 at Cell Assignment` — and between them they are shorter
than a fifth of it. It is the longest run of prose this pass saw on any
screen of this game, and it is the first thing that appears when a player comes
back. It names `RNG stream states`, `entity id liveness`, `navigation
caches and in-flight path requests`. It does not name the day, the prison, the
population, the money, or anything the player did.

**This is not a false sentence and the record says so.** Every scope in it is
real: it is `CURRENT_SAVE_RESTORED_SCOPE` resolved key by key
(**VERIFIED**, `src/ui/save-panel.ts:327` — `describeRestoredScope` maps
`scope.restored` and `scope.notCarriedByThisSaveVersion` through
`joinScopeLabels` into `save.detail.restored-scope`, which is
`'Restored: {restored}. Not carried by this save version: {notCarried}.'`,
**VERIFIED**, `src/content/default-locale-en.ts:2364`). The finding is that this
is the **only** sentence the arrival offers, and it is addressed to somebody
debugging a save format rather than to somebody who wants to know what they were
doing. The owner's ruling on #226 forbids "improving" these thirteen strings in
place (`src/content/default-locale-en.ts:2380`, *"Do not 'improve' these sentences
here; change the report, if it should change, as its own decision."*), which is
exactly why the proposal in §9 adds a line beside it rather than editing it.

**JUDGEMENT.** A player reading this screen learns that their prison has 6
prisoners and 21,335 in the bank, because those are on the strip and the strip
is always there. They learn nothing about why they left, what they had started,
or what was about to go wrong.

---

# 2. The tab the player was working on is thrown away, and the arrival tab is the arrival tab

**MEASURED, act 1.** The player was on the Build tab, drawing and ordering, and
left it open. The instrument recorded that deliberately before saving:

```
[act1] HUD the tab the player leaves on = build
```

After the reload and *Load*:

```
[act1] ARRIVAL DIFF activeTab
    left    :: build
    arrived :: overview
```

**MEASURED, act 5**, on a completely different prison (a bare one with a wall run
queued): `activeTab` `build` → `overview` again.

**The mechanism, and why this is not the same finding as the prior record's.**
`docs/research/2026-09-04-many-prisons.md` §6 measured that the active tab
*survives a prison switch* — `data-active-tab` read `regime` before and after —
and explained it correctly: the tab is `HudState` on the main thread and a
session switch does not touch it. **A page reload does**, because a reload
rebuilds the main thread from nothing, and the same sentence that made the
switch work makes the night fail. Both readings are of the same mechanism from
opposite sides; only this one is the returning player's.

**What it costs.** The Build tab is where an order in flight, a construction
queue and the arm state live. A player who left mid-build lands on a tab that
shows none of them and is not told the tab moved.

---

# 3. The camera resets to the arrival position — measured at 14 tiles, from the world rather than from a screenshot

**MEASURED, act 5.** The screen-to-tile transform is read from a real
`RemoveObject` command the world resolved, so this is where the camera is and
not an inference from pixels. The same screen point, three times:

```
[act5-default-camera] CAMERA the point (700, 300) is tile 15,13 (over CANVAS)
[act5-moved-camera]   CAMERA the point (700, 300) is tile 29,13 (over CANVAS)
[act5-after-load]     CAMERA the point (700, 300) is tile 15,13 (over CANVAS)
[act5] CAMERA default=tile 15,13 | moved=tile 29,13 | after the night=tile 15,13
```

The camera was panned 14 tiles east with the arrow keys, saved there, and came
back at the arrival position. **DERIVED**: 14 tiles at `TILE = 64` px is 896 px,
which is 62% of the 1440 px viewport. **JUDGEMENT**: a player who had walked the
camera over to the block they were building comes back looking at somewhere
else, with nothing on screen saying the view moved.

Act 1 saw the same thing less precisely and is worth quoting because it shows
what a screenshot alone can and cannot settle: three md5s of the world crop, at
the *same kernel tick*, all different —

```
[act1] CAMERA evening two md5 = 0693f0bec076; as left = 594dd7ff4d82; panned = 594dd7ff4d82; default = 199930f614a6
```

— so the returning frame matched neither what was left nor the frame taken at
the default camera earlier that evening. **I do not know why the third hash
differs from the default-camera hash** and this record does not guess; act 5's
tile probe is the reading that settles the direction, and it says the camera is
at the arrival position.

**Consistent with the code**, and this is why it is not a defect report:
`WorldScene`'s only persisted setting is the keyboard binding table
(**VERIFIED**, `src/rendering/scene/world-scene.ts:284` —
`loadInputSettings(options.keyValueStore).keyboardBindings` is the sole read of
that store in the renderer). Nothing anywhere stores a camera. So the camera
comes back at its default because there is nowhere for it to come back from.

---

# 4. The load screen cannot say which prison is which, cannot say what state any of them is in, and the one number it does show ran backwards

**MEASURED, act 1.** The whole cold page before *Load*:

```
[act1] HUD evening two, the load screen :: {
 "status": "Local saves only — no network required.",
 "list": "New Prison (3 gen) | Load | Delete",
 "rows": [{"label":"New Prison (3 gen)","active":null,"title":null,"accessibleText":"New Prison (3 gen) Load Delete"}]
}
```

and the words a returning player would look for:

```
[act1] HUD does the cold page contain "last played"? no
[act1] HUD does the cold page contain "welcome back"? no
[act1] HUD does the cold page contain "you were"? no
[act1] HUD does the cold page contain "left off"? no
[act1] HUD does the cold page contain "ago"? no
[act1] HUD does the cold page contain "continue"? no
```

(`"day "` returns YES and is not evidence of anything: it matches the status
strip's own `DAY --` and `Through the day`, which are painted with no session at
all.)

**MEASURED, act 2**, with three prisons made deliberately different and each
saved by hand:

```
[act2] STATE prison 1 :: {"label":"bare","tick":56,"day":"1","funds":25000}
[act2] STATE prison 2 :: {"label":"some bricks","tick":115,"day":"1","funds":23800}
[act2] STATE prison 3 :: {"label":"a lot of bricks","tick":175,"day":"1","funds":21400}
[act2] HUD the list a returning player sees :: "New Prison (2 gen) | Load | Delete | New Prison (3 gen) | Load | Delete | New Prison (3 gen) | Load | Delete"
[act2] HUD distinct row texts = 2 of 3
[act2] HUD does the word "rename" appear anywhere on the page? no
[act2] HUD does the word "name" appear anywhere on the page? no
```

Every row carries nothing else at all — no tooltip, no accessible name, no
screen-reader text, no field to type in:

```
[act2] HUD what a row carries :: [
 {"text":"New Prison (2 gen) Load Delete","title":null,"ariaLabel":null,"ariaCurrent":null,"srOnly":[],"inputs":0},
 {"text":"New Prison (3 gen) Load Delete","title":null,"ariaLabel":null,"ariaCurrent":null,"srOnly":[],"inputs":0},
 {"text":"New Prison (3 gen) Load Delete","title":null,"ariaLabel":null,"ariaCurrent":null,"srOnly":[],"inputs":0}
]
```

**`docs/research/2026-09-04-many-prisons.md` §2 is confirmed and one detail of
it has moved.** That record measured *"six identical rows"* and `1 distinct of
3`; this pass measures **2 distinct of 3**, and the difference is not an
improvement. The row with the different string is the **active** one
(`active: "true"`, row 0, which `orderPrisonsForDisplay` puts first because it
sorts by `updatedAt` descending — **VERIFIED**, `src/ui/save-panel.ts:474`,
`return [...prisons].sort((a, b) => b.updatedAt - a.updatedAt);`), so the prison
the player is actually in reads **`(2 gen)`** while the two dormant ones read
**`(3 gen)`**. The only varying field on the whole screen runs *opposite* to how
much play each prison has had, because it counts retained save generations and
nothing else.

**The name is a literal and there is no rename** — re-verified rather than
inherited: `this.controller.createPrison(prisonId, 'New Prison')`
(**VERIFIED**, `src/ui/save-panel.ts:726`), rendered through
`'save.list.item': '{name} ({count} gen)'` (**VERIFIED**,
`src/content/default-locale-en.ts:2303`) with
`name: prison.displayName ?? prison.prisonId` (**VERIFIED**,
`src/ui/save-panel.ts:680`).

**And the row is holding the answer while it prints the question.** The object
being rendered is a `PrisonSlotMetadata`, which carries `createdAt` and
`updatedAt` as required fields (**VERIFIED**,
`src/persistence/local/slot-metadata-schema.ts:82-83`), and the very function
that orders the list already reads `updatedAt` off it. Three lines below that
sort, the row is built from `displayName` and a generation count and nothing
else.

---

# 5. The alerts row and the refusal band are cleared by the night — which is right, and nothing says so

**MEASURED, act 1.** The prison was left with a refusal standing on the band and
its row in the alerts column:

```
[act1] ARRIVAL DIFF alerts
    left    :: Nothing was removed — there is no object on that tile, and none being built there. | Warning
    arrived :: No active alerts
[act1] ARRIVAL DIFF refusal
    left    :: Nothing was removed — there is no object on that tile, and none being built there.
    arrived :: .hud__refusal: not laid out
```

**MEASURED, act 5**, independently, on the bare prison: the same refusal
standing before the save, `No active alerts` and no band after it.

**The brief's inherited claim needs splitting, and the split is the finding.**
*"The alerts column does not survive a reload"* is **false as stated** at
v0.0.476 (`413def1c`) and true of one of its two producers.

- **A refusal-sourced row does not survive, deliberately.** `RefusalLog` is not
  snapshotted, with a written argument: *"this holds a notice about an action
  the player took moments ago, not a condition of the prison, so restoring it
  means a loaded prison raising an alert about a wall somebody failed to place
  last week, with nothing on this channel able to dismiss it"* (**VERIFIED**,
  `src/simulation/refusals/refusal-log.ts`, under *"What it deliberately does
  not do"*; the session field carries the same reason at
  `src/simulation/runtime/new-session.ts:208`).
- **An event-sourced row does survive.** In the first run of act 1 — the one
  whose clock was left running, so a contraband event landed between the reading
  and the save — the arrival screen carried
  `Contraband found: Phone. Day 5 | Warning | Clear this alert` where the
  pre-reload screen had carried a refusal row. That is ADR 0084 decision 3
  working: the log is snapshotted and republished with `restored: true`, which
  rebuilds the list and is ignored by the band (**VERIFIED**,
  `src/ui/simulation-events.ts:717`, `if (message.payload.restored === true) return undefined;`,
  under a comment that says *"A restored record is not an announcement"*).

So **the design is already the one this question would have asked for**: a stale
refusal from yesterday would be worse than nothing, and it is not there. What is
missing is a sentence. The load report names two things as *"Not carried by this
save version"* and both are internal caches; the two things a player can
actually see disappear — the band and its alert row — are named nowhere.
`docs/research/2026-09-04-does-a-prison-come-back.md` §4.1 found exactly this and
this pass reproduces it at v0.0.476 (`413def1c`) with the same wording still on
screen.

---

# 6. What does come back: an order in flight and a queued build, exactly, one press away

**MEASURED, act 1.** 1,600 spent on 40 bricks with the clock stopped, so the
delivery could not land overnight. The Build panel before the night and after
it, byte for byte the same string:

```
[act1] HUD deliveries with the clock stopped :: ON THE WAY | 1 bought · 1,600 back if cancelled | 40 × Brick · 1,600 back | Cancel
```

and on the Build tab of evening two, after the reload and *Load*:

```
... | ON THE WAY | 1 bought · 1,600 back if cancelled | 40 × Brick · 1,600 back | Cancel | ENTER COORDINATES
```

**MEASURED, act 5**, for the half-drawn block:

```
[act5] HUD build queue as left    :: QUEUED | 7 waiting · 0 being built
[act5] HUD build queue on return  :: QUEUED | 7 waiting · 0 being built
```

**This is the part of the question that is simply fine**, and it is worth saying
plainly because the rest of this record is not: a player's unfinished work is
held, is named, carries its refund, and is one tab press from the arrival
screen. What it is not is *announced* — nothing on the arrival tab says an order
is in flight or that seven walls are waiting, and a player who does not think to
press Build will not find out.

---

# 7. The Rooms tab hides the only line that names a room the moment every room is finished

**MEASURED, act 1.** The Rooms tab of the built prison, on both evenings:

```
ROOMS | ... | Staff Room | Classroom | Canteen | Kitchen | Cell | Selected | Holding Cell | Laundry | Shower Room | Delivery Bay | Garbage Room | Storage Room | Infirmary | Reception | Common Room | Yard | Security Office | Solitary Cell | Utility Room | ENTER COORDINATES | Draw on map | Remove rooms | DRAG A RECTANGLE ACROSS THE TILES THIS ROOM SHOULD COVER. | NOT READY | 1 of 1 | Cell at 12, 12 is missing | a door — nobody can get in | NEEDS AT LEAST 2 × 3 TILES | MUST BE ENCLOSED | NEEDS 1 × BED | NEEDS 1 × TOILET | ENCLOSURE | Walled in on every side
```

**The brief's inherited claim is half right and the correction matters.** The
eighteen rows *are* the type catalogue and not a list of rooms owned — but below
them there is a real readout about a room the player actually drew:
`NOT READY / 1 of 1 / Cell at 12, 12 is missing / a door — nobody can get in`.
`hud.rooms.needs-count` is `'{unfinished} of {total}'` (**VERIFIED**,
`src/content/default-locale-en.ts:2223`), so `1 of 1` is *one unfinished of one
room in the prison* — a total, on screen.

**Two limits on it, both verified, and together they are the finding.**

1. **It names at most one room.** `ROOM_NEEDS_ROOMS_LIMIT = 1` (**VERIFIED**,
   `src/ui/hud/rooms-panel.ts:407`), with a stated reason: *"the block names one
   room completely — every object it is short, with how many of each — rather
   than one line each from several rooms"*.
2. **It disappears entirely once nothing is unfinished.** **VERIFIED**,
   `src/ui/hud/rooms-panel.ts:1486`:
   `const shown = needs !== undefined && needs.unfinishedRooms > 0 ? needs : undefined;`
   followed by `needsBlock.hidden = shown === undefined;` — so the `{unfinished}
   of {total}` count goes away with the block that carries it.

**DERIVED**: a returning player whose prison is *finished* — the ordinary
outcome of a good evening — opens the Rooms tab and is shown eighteen room types
they could build and not one word about the rooms they have. The only surface
anywhere that counts them is the strip's `1 ROOMS` chip.

---

# 8. How long until the player is oriented, counted

**MEASURED, act 1.** Every press on the evening-two side was counted by the
instrument's own counter:

```
[act1-evening-two] INTERACTIONS TOTAL = 6
[act1-evening-two]   1. press Load on the only prison row
[act1-evening-two]   2. open the overview tab
[act1-evening-two]   3. open the build tab
[act1-evening-two]   4. open the rooms tab
[act1-evening-two]   5. open the security tab
[act1-evening-two]   6. open the regime tab
```

Scored against the four questions written down on evening one before anything
was saved:

| Question | Answerable from the screen? | Interactions |
| --- | --- | --- |
| *What is the state of my prison?* — day, population, money, staff, rooms | **Yes, immediately.** The strip carries `DAY 3`, `6 PRISONERS`, `3 with no bed`, `3 STAFF`, `1 ROOMS`, `21,335 FUNDS` before any press | **0** |
| *What did I just order?* | **Yes**, on the Build tab: `ON THE WAY / 1 bought · 1,600 back if cancelled / 40 × Brick · 1,600 back` | **2** (Load, then Build) |
| *What is going wrong?* | **Partly.** `3 with no bed` is on the strip at 0 presses and the Intake panel repeats it; the Cell's missing door needs the Rooms tab | **0** for the beds, **2** for the door |
| *What was I doing?* | **No.** Nothing anywhere records an action. The Build tab's `Brick wall / Selected` is the panel's arrival selection and not a memory: `let selectedId = model.buildables[0]?.definitionId;` (**VERIFIED**, `src/ui/hud/build-panel.ts:838`), and `Brick wall` is the first row of the rendered catalogue in every act | **∞** |
| *What should I do next?* | **No.** No surface proposes anything; `continue`, `next` and `left off` are absent from the page | **∞** |
| *Which prison is this, and when was I last here?* | **No.** `New Prison (3 gen)`, no timestamp anywhere | **∞** |

**The moment a player could act with confidence is press 2** — the Build tab,
where the order in flight and the queue are — and they arrive there by guessing
rather than by being told. **JUDGEMENT**, and the honest form of it: five of the
six presses were spent finding out that four of the five tabs had nothing to say
about the night that had passed.

---

# 9. Two claims this pass was handed and could not reproduce

Both were given to be verified rather than inherited, and both fail at v0.0.476
(`413def1c`).

**"A prison switch with no reload lands the new prison on a black screen."**
**MEASURED, act 4, and refuted.** A prison was built, saved, *New prison*
pressed, and the world under the HUD screenshotted with no page reload at any
point. Sampling every third pixel of the 900×560 crop:

```
[act4] HUD distinct colours sampled in the world after the switch = 1535 (1 would be a flat field)
```

and, from the saved frames, `act4-world-on-new-prison.png` carries **104**
distinct sampled colours against **2,593** for the built prison before the
switch and **2,616** after switching back. Opened by eye, the new prison's frame
is a full field of drawn dirt tiles with the tile grid visible; the returned
prison's frame draws the walls, the floor, two prisoners and a guard. Whatever
was seen before is not happening on this tree. **I did not establish what
changed or when** — this is a refutation of a claim, not a diagnosis of a fix.

**"The Rooms tab shows the eighteen-row type catalogue rather than a list of the
rooms you own."** **MEASURED, act 4, and half right** — see §7. The eighteen
rows are exactly the type catalogue, every one of them
(`room.staff-room` … `room.utility-room`, `18` rows against `STATE rooms
actually owned = 1`), and nothing on the page enumerates owned rooms
(`hasOwnedList: false`). But the panel does carry `NOT READY / 1 of 1 / Cell at
12, 12 is missing / a door — nobody can get in`, which names a room the player
drew and counts the rooms they have — until every room is finished, at which
point §7's verified `needsBlock.hidden` takes the count away with it.

---

# 10. Proposals, ranked by what they buy

The owner asked this round for **ideas, better UI and better HUD**. These are
proposals, not changes: this pass is **read-only on `src/`**. Every one names
what the player sees, where, and instead of what — and where a proposal needs a
sentence, the code that would render it is opened and the sentence is shown to
be true, per `AGENTS.md` reservation 4 as released on 2026-09-04.

They are ranked by what they buy a returning player, cheapest first within a
rank.

## P1 — "Waiting on you": one panel on the Overview tab, built from view models the HUD already holds

**What a player sees.** A new collapsible section at the top of the Overview
tab — above Intake, on the tab a reload lands on — listing what the prison is
waiting for its owner to do. On the act 1 prison it would read:

```
WAITING ON YOU
40 × Brick is on the way
Cell at 12, 12 is missing a door — nobody can get in
3 prisoners have no bed
```

and on act 5's prison:

```
WAITING ON YOU
7 orders are waiting to be built
```

and on a prison with nothing outstanding, **nothing at all** — the section is
absent, exactly as `.hud-rooms__needs` is absent when no room is unfinished
(`src/ui/hud/rooms-panel.ts:1486`).

**Why this is the top proposal.** It answers three of the six questions in §8's
table at **zero** interactions instead of two or infinity, it is useful in every
session rather than only on the second evening, and — the part that matters for
cost — **it needs no new projection and no new claim.**

**Every line is a sentence the HUD already renders, from a field already on
`HudViewModel`** (**VERIFIED**, `src/ui/hud/view-model.ts:1570, 1578, 1594`):
`roomNeeds?: HudRoomNeedsViewModel`, `buildQueue?: HudBuildQueueViewModel` and
`pendingDeliveries?: HudPendingDeliveriesViewModel` are top-level optional
fields on the model the whole HUD draws from, and the fourth line's number is
`prisonersWithoutBed(counts)`, a pure function of `counts.prisoners -
counts.occupiedPlaces` (**VERIFIED**, `src/ui/hud/projection.ts:300`) that the
status strip's badge already calls. So the panel is a second *reader* of four
things, not a second *source* — which is the property `docs/HUD_PROJECTIONS.md`
contract 3 asks for and the property a duplicated derivation would not have.

**On the strings.** Three of the four lines can be the existing keys verbatim:
`hud.rooms.needs-doorway` is `'a door — nobody can get in'`, `hud.rooms.needs-object`
is `'{count} × {object}'` and `hud.build.deliveries-count` is
`'{count} bought · {total} back if cancelled'` (**VERIFIED**,
`src/content/default-locale-en.ts:2273, 2232, 1542`). The only genuinely new
sentence is the section's own heading and the queue line. `'{count} orders are
waiting to be built'` would be **true**: `HudBuildQueueViewModel.total` is
documented as *"the whole queue"* and not the drawn window, precisely so *"a
header that counted only the rows it drew would tell a player with thirty queued
walls that they have"* fewer (**VERIFIED**, `src/ui/hud/view-model.ts:791-795`),
and the number is the same one `hud.build.queue-count`'s `{count}` already
prints as `7 waiting · 0 being built` (MEASURED, act 5, both sides of the
night).

**What it costs.** One panel module under `src/ui/hud/`, wired in
`src/ui/hud/hud.ts` beside the Intake panel, plus a `hud.css` rule. No worker
message, no projection, no save-format change. **The one real risk is the rail
height**: issue #985 (opened 2026-09-05) records the rail as documented over
budget by 30 px before an alerts band exists, and the Overview tab is where a new
section would land. That is a layout decision, and the honest form of this
proposal is "on the Overview tab, whose fold budget #985 is already measuring".

## P2 — the save row says when it was last saved, and the row is already holding the number

**What a player sees.** `New Prison (3 gen)` becomes

```
New Prison · saved 14 hours ago
```

or, with more than one prison, three rows that differ.

**The number is in the renderer's hand already.** The row is built from a
`PrisonSlotMetadata`, whose `createdAt` and `updatedAt` are required fields
(**VERIFIED**, `src/persistence/local/slot-metadata-schema.ts:82-83`), and the
function that orders the list reads `updatedAt` off it three lines above where
the label is written: `return [...prisons].sort((a, b) => b.updatedAt - a.updatedAt);`
(**VERIFIED**, `src/ui/save-panel.ts:474`). The label today is
`'{name} ({count} gen)'` fed `displayName ?? prisonId` and a generation count
(**VERIFIED**, `src/ui/save-panel.ts:679` and `:683`,
`src/content/default-locale-en.ts:2303`).

**The word must be "saved" and must not be "played", and this is the whole
truth argument.** `updatedAt` is written on every slot write
(`src/persistence/local/repository.ts:300, 390, 512, 621, 670, 728`) and is
deliberately **not** bumped by a successful load — the code says so in terms:
*"Returning before the first write keeps a successful load from bumping
`updatedAt` on every prison the player opens"* (**VERIFIED**,
`src/persistence/local/repository.ts:720-722`). And
`docs/research/2026-09-04-does-a-prison-come-back.md` §2 measured 80 seconds of
running clock producing 1,626 ticks of play and **zero** saves, so a prison can
be played for a long time without `updatedAt` moving at all. A row reading *last
played* would therefore be false on the exact prison a player most wants to
find. **`src/ui/account/save-list-projection.ts:155` already makes that mistake
in a parked module**: `lastPlayedAt: slot.updatedAt`, on a projection that
`tests/foundation/trusted-tier-reachability-contract.test.ts` keeps out of the
production graph. Nothing renders it today, so nothing false reaches a player —
but it is the wrong name to inherit when something does.

**What it costs, honestly.** `SavePanelLocalizer` is a two-method structural
port — `format` and `formatNumber` (**VERIFIED**, `src/ui/save-panel.ts:27-30`)
— so a relative time needs either a third method on that port or a preformatted
string passed in. `Localizer` itself has `formatDate`, and **it defaults to
`timeZone: 'UTC'` on purpose** (**VERIFIED**,
`src/services/localization/format.ts:165-173`, *"Inheriting the machine's zone
makes output depend on where the code runs"*) — so an absolute timestamp on this
row would read UTC to a player in Warsaw unless a zone is passed, which is a
decision and not a detail. A relative form (`Intl.RelativeTimeFormat`) sidesteps
the zone entirely and is what the sketch above uses.

## P3 — restore the tab the player was on, using the store the renderer already has

**What a player sees.** They come back on the Build tab they left on, not on
Overview.

**MEASURED**, §2: `build` → `overview`, twice, on two different prisons.
**VERIFIED**: the composition root already hands the renderer a browser
key/value store — `keyValueStore: resolveBrowserKeyValueStore()`
(`src/main.ts`, in the `new WorldScene({...})` call) — and the renderer's only
use of it today is `loadInputSettings(options.keyValueStore).keyboardBindings`
(`src/rendering/scene/world-scene.ts:284`). So a per-browser store that survives
a reload, degrades to an in-memory stand-in when a browser blocks site data, and
is already wired, exists.

**Not a save-format change, deliberately.** The active tab is `HudState` on the
main thread and putting it in the snapshot would make one player's UI preference
part of a prison's identity — and would then have to answer what happens when
the same save is opened on a second device. Per-browser is the right scope, and
it is also the cheaper one.

**One caveat this proposal owes.** `docs/research/2026-09-04-many-prisons.md` §6
notes that the tab surviving a *switch* is "correct for the returning player and
odd for the new one" — a brand-new bare prison shown on the Regime tab. Making
the tab survive a reload inherits that oddity; the answer is the same one that
record implies, which is that a *create* may reset the tab where a *load* does
not.

## P4 — say what a load did not bring back, where the player can see it

**MEASURED**, §5: the refusal band and its alerts row are gone, correctly, and
the load report's *"Not carried by this save version"* names two internal
caches. `docs/research/2026-09-04-does-a-prison-come-back.md` §4.1 already
established that the honest reading of that sentence is *"nothing else was
lost"* and that three visible things were.

**This one is deliberately left as a decision rather than a sketch.** The
thirteen save-report strings carry the owner's #226 ruling in the locale file
itself — *"Do not 'improve' these sentences here; change the report, if it
should change, as its own decision."* (**VERIFIED**,
`src/content/default-locale-en.ts:2379-2382`) — and
`notCarriedByThisSaveVersion` is scoped to save *sections*, so widening it would
be a change to what the structure means and not to its wording. The proposal is
therefore: **decide whether the report is about the save format or about the
player's screen**, and if it is the second, the band and the alerts row belong
in it.

## P5 — restore the camera

**MEASURED**, §3: 14 tiles, from the world. **VERIFIED**: nothing stores a
camera, because `keyValueStore` is read exactly once in the renderer and for the
keyboard bindings. The same store P3 uses would hold `{x, y, zoom}` per prison
id.

**Ranked last of the five on purpose.** It is the largest of them — it needs a
camera read on `WorldScene`, a write on a cadence or on unload, and a decision
about what a *new* prison's camera is — and a returning player who lands at the
arrival position can still see their prison, because the arrival position is
where the prison is. It is comfort, where P1 is orientation.

## What I am deliberately not proposing

**A "welcome back" banner.** It would have to be dismissed, it would have to
decide what "back" means for a player who reloads twice in a minute, and every
true thing it could say is a thing P1 says on a surface that is useful every
session rather than once. `docs/AGENT_WORKFLOW.md` §3's rule about deciding
rather than deferring applies in both directions; this is a decision not to.

**Naming a prison, in this record.** It is the obvious fix and it is *not* free:
`PrisonSaveRepository` writes `displayName` at create
(`src/persistence/local/repository.ts:301`) and has **no rename** — the only
thing in that file that renames anything is the quarantine path
(`:539`). So a rename is a new repository method, a new slot write, a new
control, and a decision about what an unnamed prison is called. It is already
recorded as a gap by `docs/research/2026-09-04-many-prisons.md` §2.1 and this
pass adds nothing to it except the confirmation in §4.

---

# 11. Three quarters of the interface reads the same on a prison in trouble as on an empty one — and the Build tab differs by one line

**MEASURED, act 3.** A prison was built (a walled cell, 2 beds, 7 admitted, 2
guards) and run 4,800 further ticks at ×4 until five prisoners had nowhere to
sleep and three pieces of contraband had been found. Then *New prison*, in the
same browser, at the same viewport, and every surface read again.

```
[act3] STATE trouble :: tick=10212 counts={"prisoners":7,...,"roomCapacity":2,"accommodationCapacity":2,"roomOccupants":2,"treasuryMinorUnits":23660,...,"staff":2}
```

The troubled prison's arrival surfaces:

```
"clockDay": "5",
"strip":  "... | 7 | PRISONERS | 5 with no bed | 0 | HIGH RISK | 2 | STAFF | 7 | COVERAGE | Covered | 1 | ROOMS | 0 | INCIDENTS | Clear | 3 | CONTRABAND | 23,660 | FUNDS | 150 | EARNED TODAY | DAY | 5 | ...",
"alerts": "Contraband found: Currency. 2× Day 3 | Warning | Clear this alert | Contraband found: Phone. Day 3 | Warning | Clear this alert | Nothing was removed — there is no object on that tile, and none being built there. | Warning",
```

the empty one's:

```
"clockDay": "1",
"strip":  "... | 0 | PRISONERS | 0 | HIGH RISK | 0 | STAFF | 0 | COVERAGE | Covered | 0 | ROOMS | 0 | INCIDENTS | Clear | 0 | CONTRABAND | 25,000 | FUNDS | 0 | EARNED TODAY | DAY | 1 | ...",
"alerts": "No active alerts",
```

and the line-by-line sameness, per surface:

```
[act3] SAMENESS strip         :: 24 of 34 lines on the troubled prison are word-for-word on the empty one
[act3] SAMENESS minimap       :: 4 of 12
[act3] SAMENESS tab:overview  :: 14 of 19
[act3] SAMENESS tab:build     :: 56 of 57
[act3] SAMENESS tab:rooms     :: 40 of 47
[act3] SAMENESS tab:security  :: 22 of 31
[act3] SAMENESS tab:regime    :: 17 of 43
[act3] SAMENESS whole HUD     :: 149 of 197 lines on the troubled prison are word-for-word on the empty one
```

**149 of 197 is 75.6%** (**DERIVED**). The brief handed this pass the figure
**62%** to verify rather than inherit; **I measure 76%**, and the two are not in
conflict because they are not the same measurement — mine is line-level across
all five tab panels plus the always-present surfaces, at v0.0.476 (`413def1c`),
on a prison made deliberately worse. The direction is the same and the number is worse.

**The sharpest single reading is the Build tab: 56 of 57.** The one line that
differs is `New Prison (3 gen) | Load | Delete` — a second row in the *save
list*, not a fact about either prison. Everything else on that tab — the
nineteen buildables, the eight categories, the arm controls, the coordinate
fields, the `Buy 1 × Brick · 40` fold — is character for character the same on a
prison that has been played for five days and on one made forty seconds ago.

**One row in that table is an artifact and is marked rather than dropped.**
`SAMENESS sidePanel :: 0 of 20` compares the wrong pair: the troubled reading
was taken with `activeTab: security` and the empty one with `activeTab: regime`,
because a *create* does not touch the tab (`docs/research/2026-09-04-many-prisons.md`
§6's mechanism, seen from the third side). The per-tab rows below it are the
valid comparison and are what the 149/197 is computed from.

**Why this matters to the second evening specifically.** A returning player is
looking for the difference between "my prison" and "a prison". Three quarters of
what is on screen cannot supply it, so the whole burden falls on the strip's
nine numbers and on the alerts column — and §5 measured the alerts column being
emptied of its refusal row by the very reload that brought the player back.
`docs/research/2026-09-03-can-a-player-read-this.md` §3 measured the same class
on the Overview tab alone (52 of 58) and this extends it to the whole interface.

---

# 12. What this pass did not reach

- **A prison left overnight with a live incident.** Act 1's first run caught a
  contraband event landing between the reading and the save and that is what §5
  quotes; a *response in flight* across a page reload was measured by
  `docs/research/2026-09-04-does-a-prison-come-back.md` §5 and is not
  re-measured here.
- **A second evening on a prison with more than one save generation to choose
  from.** Every load in this pass took the current generation; what a player
  sees when `(3 gen)` matters is untouched.
- **The touch and keyboard routes.** Every press here is a mouse press at
  1440×900. Whether a returning player can reach the Build tab with the keyboard
  alone is another tester's surface.
- **Any claim about seconds.** The box was shared with another tester's suite
  throughout — act 1 took 10 m under load and 2.7 m when it was quieter, for the
  same work — which is exactly why §8 counts interactions.
- **What the arrival camera *is*.** §3 establishes that it is not where the
  player left it and that the returning frame does not match a frame taken at
  the default camera earlier in the same evening. I did not establish why those
  two differ.

---

## One line seen outside this question and not pursued

Act 3's troubled prison reached `5 with no bed` out of 7 prisoners with
`roomCapacity: 2`, and the strip read `2 | STAFF | 7 | COVERAGE | Covered` — the
`COVERAGE` chip's number tracking the population rather than the guards.
`docs/research/2026-09-03-can-a-player-read-this.md` §1 already measured that
class in detail and named the two different view-model fields behind the one
word, so this is a re-sighting rather than a finding, and it is recorded in one
line rather than pursued.

---

## The weakest claim in this record, and what would change my mind

**The weakest claim is §3's camera reading, specifically the part that says the
camera comes back at *the arrival position*.**

What is solid is that it does not come back where it was left: the same screen
point resolved to tile `29,13` before the night and tile `15,13` after it
(MEASURED, act 5), from a real `RemoveObject` the world answered, and 14 tiles
is not a rounding error. What is weaker is the identification of `15,13` as *the
arrival position* rather than as some other position that happens to coincide
with it — the evidence is that the same probe read `15,13` on the same prison
before it was panned, in the same act, which is one prison and one viewport.
Act 1's screenshot hashes actively fail to agree with it: at an identical kernel
tick, the returning frame's md5 matched neither the frame as left nor the frame
taken at the default camera minutes earlier — three distinct digests, quoted in
full in §3 — and **I do not know what the third difference is.**

**What would change my mind**: the same tile probe run at three viewports and on
a prison built somewhere other than tiles (12,12)–(17,17). If the returning tile
is `15,13` regardless of where the prison is, the camera is at a fixed default
and this record is right. If it tracks the prison, the camera is being placed by
something — and "resets to the arrival position" is the wrong sentence for what
is a *re-centring*, which would change P5 from "store the camera" to "store the
camera *only when the player has moved it*".

**A second, smaller one**: §11's 75.6% is a *line-level* count over
`innerText` split on the flattening separator, so a panel that renders one long
sentence as one line and another that renders four short ones weight the same.
The figure is a useful comparator against itself and against
`docs/research/2026-09-03-can-a-player-read-this.md` §3's 52-of-58, and it is not
a measurement of screen area. Counting pixels of laid-out text would change the
number and, I expect, not the direction.

