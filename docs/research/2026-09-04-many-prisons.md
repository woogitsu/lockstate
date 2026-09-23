# 2026-09-04 — a player who has more than one prison: the list, the slots, switching, naming, deleting, and what a "session" is

**Played on `agent/playtest-many-prisons`, cut from `0e614c7` (v0.0.451).** The
instrument is `tests/browser/playtest-2026-09-04-many-prisons.playtest.ts`,
which is **not** a CI gate: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `.playtest.ts` is collected only by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.

## The question

`docs/research/2026-09-04-does-a-prison-come-back.md` played the save, reload
and load of **one** prison and stopped there. The README's product targets say
*"multiple prisons per account; five free save slots is the current product
direction"*, so the next question is the one that starts where that record
ended: **a player who already has one prison wants a second.** Make several,
switch between them, come back to them, try to name one, run past five, delete
one — and find out what a player can actually see and do about the fact that
they have more than one.

## The answer, in one line

**Switching between prisons works perfectly and choosing between them does
not.** A prison switched away from and returned to comes back exact — kernel
tick `13622` in, `13622` out, the same 23,015 in funds, the same room, the same
four prisoners with the same names and the same need percentages, on the same
tab (MEASURED, act 3). Everything around that is unlit. **Six prisons produce
six rows reading the identical string `New Prison (1 gen)`** (MEASURED, act 4),
there is no way anywhere on the page to name or rename one (`inputsInPanel: 0`,
`anythingSayingRename: false`, MEASURED, act 2), the only thing separating the
prison you are in from the five you are not is **font weight and colour**
(`700`/`rgb(134, 178, 207)` against `400`/`rgb(219, 226, 233)`, MEASURED), and
**Delete asks nothing and then reports nothing about what it destroyed** — 0
dialogs of any kind, and the sentence afterwards is *"Prison deleted."*, with
the two survivors still reading exactly what the deleted one read (MEASURED,
act 5). And **the press that makes the second prison silently discards the
first one's unsaved play**: prison A at tick 211 with 1,600 spent went back to
tick 0 and 25,000 with **0 dialogs** (MEASURED, act 1).

The README's five-slot figure is **not a promise this build breaks**; it is a
promise this build has not started. Six presses of *New prison* gave six
prisons, and the words *slot*, *limit* and *five* appear nowhere on the page
(MEASURED, act 4).

## How to read this record

Following `docs/research/README.md`'s tiers, with the one this repository's
playtests add:

- **MEASURED** — a real run of this tree's own code in a browser, output pasted.
- **VERIFIED** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **UNKNOWN** — not established in this pass.

Two channels are reported and they are **never mixed**:

- **HUD** — `innerText` read out of the real DOM, or a real attribute or
  computed style on a real element. This is what a player sees.
- **STATE** — a `simulation/request-projection` round trip to the worker (its
  reply's own `payload.tick`, which is answered while paused), or a figure off
  `simulation/status-counts`.

**Every tick in this record is a projection reply's `payload.tick`, never
`simulation/clock-state`.** That is the instrument bug the previous record
found and it bites harder here than it did there: creating or loading a prison
leaves the clock paused, so the tee's last `clock-state` message is the
*previous prison's* and would be read as this one's.

## Reproduction

Run one act at a time. The port is this round's; use your own.

```
LOCKSTATE_BROWSER_TEST_PORT=5315 node --experimental-transform-types \
  --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-many-prisons.playtest.ts -g "act 1"
```

| Act | What it does | Runtime |
| --- | --- | --- |
| 1 | one prison played and left unsaved, then *New prison*, then back to the first | 41 s |
| 2 | three prisons with visibly different play; every row read exactly; every naming affordance counted | 2.7 m |
| 3 | a real prison (walls, a zoned cell, 3 beds, 4 prisoners, 2 guards, day 6), a second prison, and back | 4.5 m |
| 4 | *New prison* six times; the whole page searched for the word "slot" | 50 s |
| 5 | three prisons, delete the middle one | 1.4 m |
| 6 | two browser contexts and two tabs of one | 1.2 m |

---

# 1. Asking for a second prison throws the first one's unsaved play away, without asking and without saying so afterwards

**MEASURED, act 1.** A prison was created, 40 bricks were bought (1,600 spent,
an accepted command), the clock was run for six seconds and paused. The panel
at that moment:

```
[act1] STATE prison A just before the player asks for a second :: {"tick":211,"clock":{"mode":"paused"},"day":"1","funds":23400,"rooms":0,"prisoners":0,"staff":0,"activeTab":"build"}
[act1] HUD panel just before :: {"status":"Saved (generation gen-mtmwlm14-1).","detail":"","list":"New Prison (1 gen) | Load | Delete"}
```

Then *New prison* was pressed:

```
[act1] HUD dialogs while the second prison is created = 0 (was 0); native = 0 []
[act1] STATE prison B :: {"tick":0,"clock":{"mode":"paused"},"day":"1","funds":25000,...}
```

**Nothing was asked.** The counter covers both a DOM dialog (`dialog`,
`[role="dialog"]`, `[role="alertdialog"]`, `[aria-modal="true"]`) and a native
`confirm`/`alert`/`prompt` — the second matters because Playwright
auto-dismisses an unlistened native dialog, which would look exactly like no
confirmation at all. Neither fired.

Going back to prison A — the bottom row, since the list is newest-write-first —
returned it faithfully to the only state that was ever written:

```
[act1] STATE what came back when the player returned to prison A :: {"tick":0,"clock":{"mode":"paused"},"day":"1","funds":25000,...}
[act1] STATE what was on screen before they left A     :: {"tick":211,...,"funds":23400,...}
[act1] HUD which row is active after the load :: [{"index":0,...,"activeAttribute":null,...},{"index":1,...,"activeAttribute":"true",...}]
```

**211 ticks and 1,600 of spending, gone.** The third line is why that reading
is about prison A and not about prison B: both prisons' generation 1 is a bare
world at tick 0 with 25,000, so the numbers alone cannot say which one came
back, and `data-active` can — row 1, the older prison, is the active one.

## 1.1 Why, and why it is not simply the autosave finding again

**VERIFIED.** `SessionController.createPrison` writes the slot, then
`await this.host.startNew(masterSeed)` and `this.adoptSession(prisonId)`
(`src/persistence/session/session-controller.ts:166-167`) — it never captures
or saves the outgoing session. `adoptSession` disposes the autosave scheduler
and replaces `this.session` (`:434-437`), and the host is
`WorkerPerSessionHost`, whose docblock in `src/main.ts:3164-3166` states the
rule: *"A worker per session, not per page (issue #149): the host claims one
that has hosted nothing each time a prison is created or loaded"*. The
authoritative simulation is terminated with everything it held.

The previous record established that Load discards unsaved play
(2,461 ticks, 0 dialogs) and that the autosave fires only after an accepted
command. **This is a third button with the same property and a different
meaning to a player.** *Load* at least names an act of going back; *New prison*
is the only route the game has to the thing the README calls "multiple prisons
per account", so the gesture a player must make to **keep** a prison is the one
that destroys their progress in it. The player-visible cost is bounded by the
30-second autosave interval **when a command was accepted**, and unbounded when
none was — `DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000`
(**VERIFIED**, `src/persistence/session/session-controller.ts:10`).

**What words would have to convey**, if the fix is a sentence rather than a
save: that the prison currently on screen has play in it that is not written,
and how much. **No shipped string is authored here**, because the honest fix is
almost certainly not a string: `createPrison` could capture and save the
outgoing session before `startNew`, and then there would be nothing to warn
about.

**The sample that could have refuted it and did not.** Act 3 ran the same
sequence on a prison whose last state *had* been written by hand (*Save now*
pressed, clock paused), and lost nothing at all: tick `13622` before, `13622`
back. So this is not "switching corrupts a prison"; it is specifically the
absence of a save at the moment of the switch.

---

# 2. Six prisons, six identical rows: the list cannot tell a player which prison is which, and nothing on the page can name one

**MEASURED, act 4.** *New prison* pressed six times, and the list after the
sixth, quoted whole:

```
[act4]   list = "New Prison (1 gen) | Load | Delete | New Prison (1 gen) | Load | Delete | New Prison (1 gen) | Load | Delete | New Prison (1 gen) | Load | Delete | New Prison (1 gen) | Load | Delete | New Prison (1 gen) | Load | Delete"
```

**MEASURED, act 2**, with three prisons deliberately made *different* — 10, 30
and 55 bricks bought, and each run for a different length of time:

```
[act2] STATE prison 1 after 10 bricks :: {"tick":100,...,"funds":24600,...}
[act2] STATE prison 2 after 30 bricks :: {"tick":171,...,"funds":23800,...}
[act2] STATE prison 3 after 55 bricks :: {"tick":203,...,"funds":22800,...}
[act2] HUD distinct row labels = 1 of 3
```

Three prisons in three measurably different states, and **one distinct row
label between them**.

## 2.1 The name is a literal, and there is no rename

**VERIFIED.** Every prison is created under the same hard-coded display name:
`this.controller.createPrison(prisonId, 'New Prison')`
(`src/ui/save-panel.ts:726`). The row is
`'save.list.item': '{name} ({count} gen)'`
(`src/content/default-locale-en.ts:2076`) fed with
`name: prison.displayName ?? prison.prisonId` (`src/ui/save-panel.ts:679`).
`displayName` is on the slot schema (`src/persistence/local/slot-metadata-schema.ts`)
and `PrisonSaveRepository.create` writes whatever it is given
(`src/persistence/local/repository.ts:301`) — so the *storage* supports a name
and the *interface* never asks for one.

**MEASURED, act 2**, the whole page searched for a way in:

```
[act2] HUD naming affordances anywhere on the page :: {"inputsInPanel":0,"buttonsInPanel":["New prison","Save now","Export","Import","Load","Delete","Load","Delete","Load","Delete"],"anythingSayingRename":false,"anythingSayingName":false}
```

Zero inputs, zero `contenteditable`, four panel actions and two per row, and
the words *rename* and *name* appear nowhere in the page's text.

## 2.2 What a row does say, and what it does not

The row carries a name that is a constant and a generation count. It does
**not** carry: when the prison was last played, what day it reached, how much
money it has, how many prisoners live in it, or how big it is. Every one of
those exists in the running simulation and three of them are already on the
status strip for the *active* prison.

The generation count is the one varying field and it is the wrong number for
this job in two separate ways.

- **It measures the retention window, not the prison.** The previous record
  established that the three generations behind `(3 gen)` are not separately
  loadable, so the count *"is a statement about a fallback window, not a
  menu"*. A row reading `(3 gen)` beside one reading `(1 gen)` says which
  prison has been *saved* more often, which correlates with play only by
  accident.
- **It is stale.** MEASURED, act 2: after a 40-second window containing one
  accepted command, the panel's status line read `Saved (generation
  gen-mtmwsu3t-4).` and the row for that same prison still read `New Prison (1
  gen)`; pressing *Save now* — which calls `refresh()` — changed it to `New
  Prison (3 gen)` with no further play. **VERIFIED**: `reportBackgroundSave`
  calls `setStatus` and nothing else (`src/ui/save-panel.ts:613-615`), and
  `src/main.ts:3199` is the only thing wired to it. The previous record found
  this same contradiction from the other side (status `gen-…-9` beside list
  `1 gen`); what act 2 adds is that it makes the **only varying field in the
  list** wrong for as long as the player does not press anything.

## 2.3 The active prison is marked by weight and colour and by nothing else

**VERIFIED**, `src/styles.css:148-151`:

```css
.save-panel__item[data-active='true'] .save-panel__item-label {
  font-weight: 700;
  color: var(--accent);
}
```

**MEASURED**, the computed styles of two rows in one list:

```
{"index":0,"label":"New Prison (1 gen)","activeAttribute":"true","fontWeight":"700","colour":"rgb(134, 178, 207)",...}
{"index":1,"label":"New Prison (1 gen)","activeAttribute":null,"fontWeight":"400","colour":"rgb(219, 226, 233)",...}
```

`data-active` is a data attribute, not an ARIA one, so the accessible name of
the active row is `New Prison (1 gen) Load Delete` — the same string as every
other row's. A player who cannot see the weight difference has nothing.
(Colour-and-weight-only is partly the keyboard and touch testers' surface this
round; it is recorded here because it is the *only* signal distinguishing two
prisons, which is this question's subject.)

---

# 3. The list is ordered by when a prison was last *written*, not last played — so the prison you are in can sit below one you are not

**MEASURED, act 3.** A real prison (day 6, 4 prisoners, 2 guards) was saved by
hand, a second prison was made, and the first was loaded back. The list
afterwards:

```
[act3] HUD prison A save panel on the way back :: {"status":"Loaded.",...,"list":"New Prison (1 gen) | Load | Delete | New Prison (3 gen) | Load | Delete"}
```

The prison the player is now playing — day 6, `(3 gen)` — is the **bottom**
row, under a prison they have not touched since creating it.

**VERIFIED, and this is a documentation-versus-code disagreement inside one
file.** `orderPrisonsForDisplay`'s docblock opens *"The order the prison list
is rendered in: **most recently played first**"*
(`src/ui/save-panel.ts:456`), and its body is
`[...prisons].sort((a, b) => b.updatedAt - a.updatedAt)` (`:473-475`).
`updatedAt` is written on create (`src/persistence/local/repository.ts:300`)
and on save (`:390`), and a plain load deliberately does not touch it —
`confirmGeneration` returns before its first write with the comment *"Returning
before the first write keeps a successful load from bumping `updatedAt` on
every prison the player opens"* (`src/persistence/local/repository.ts:721-723`).
So the sort key is *most recently written*, the comment says *most recently
played*, and the two disagree exactly when a player switches prisons — which is
the only situation the ordering exists for.

**When the comment became false is UNKNOWN, and the reason is worth recording
because the next agent will hit it too.** `docs/AGENT_WORKFLOW.md` §3 requires
establishing *when* a document became false, not merely that it is. That cannot
be done in this container: **the checkout is shallow**, grafted at `f00c7d1`
(`.git/shallow` holds `f00c7d15…` and `3b0a5395…`, 302 commits reachable), so
`git log -S "most recently played first" -- src/ui/save-panel.ts`,
`git log -S "b.updatedAt - a.updatedAt"` and `git log -S "keeps a successful
load from bumping"` **all three return the same single commit — the graft
boundary `f00c7d1`** — which is an artefact of the shallow clone and not a
date. All that is established here is that the code and its own comment
disagree in the tree that was played.

This is small on its own and it compounds with §2 — a list of identical labels
whose only remaining information is its order, and the order does not mean what
its author wrote down.

---

# 4. Delete asks nothing, names nothing, and leaves no way to check

**MEASURED, act 5.** Three prisons; the *middle* row's Delete pressed — a
prison the player was not in:

```
[act5] HUD the row about to be deleted reads :: "New Prison (1 gen) | Load | Delete"
[act5] HUD dialogs before Delete = 0; native = 0
[act5] HUD dialogs during/after Delete = 0; native = 0 []
[act5] HUD after Delete :: {"status":"Prison deleted.","detail":"","list":"New Prison (1 gen) | Load | Delete | New Prison (1 gen) | Load | Delete"}
[act5] HUD is there any undo, restore or recycle control? ["New prison","Save now","Export","Import","Load","Delete","Load","Delete"]
```

**The known half is that there is no confirmation** — issue #582's LS-03 says
so, from reading: *"`save-panel.ts:606-611` calls
`controller.deletePrison(prisonId)` with **no dialog**"*. Re-measured here on a
real page at v0.0.451 (`0e614c7`), and re-VERIFIED at the line it has moved to:
`requestDelete` is `src/ui/save-panel.ts:774-781` and its whole body is the
call, a status, a cleared detail and a refresh.

**The half this pass adds is what the screen says afterwards.** The sentence is
*"Prison deleted."* — it names no prison, because there is no name to give and
`requestDelete` does not pass one. The row is gone and **the two rows that
remain read exactly what the deleted one read**. So a player who pressed the
wrong Delete cannot find out that they did, cannot find out which one went, and
has no undo, no tombstone and no recycle bin: the eight buttons on the panel
after the press are the four actions and two rows' worth of Load/Delete.

`repository.delete` iterates `metadata.generationIds`, deletes each generation
record and then the slot, in one transaction
(**VERIFIED**, `src/persistence/local/repository.ts:308-317`). There is no
soft-delete path in the module.

**The player cost, stated as a claim about cause and not about frequency.** The
mechanism for destroying the wrong prison is: two adjacent rows carrying the
same string, a Delete on each, no confirmation, and no post-hoc way to tell
which went. Whether a real player does this, and how often, is **UNKNOWN** —
nobody plays this game yet.

---

# 5. Five free save slots: the build has no limit and the page never mentions one

**MEASURED, act 4.** Six presses of *New prison*, one after another:

```
[act4] after pressing New prison 1 time(s) :: rows=1 status="Saved (generation gen-mtmwn5m2-1)."
[act4] after pressing New prison 2 time(s) :: rows=2 status="Saved (generation gen-mtmwn98a-2)."
[act4] after pressing New prison 3 time(s) :: rows=3 status="Saved (generation gen-mtmwndup-3)."
[act4] after pressing New prison 4 time(s) :: rows=4 status="Saved (generation gen-mtmwnk6f-4)."
[act4] after pressing New prison 5 time(s) :: rows=5 status="Saved (generation gen-mtmwntg7-5)."
[act4] after pressing New prison 6 time(s) :: rows=6 status="Saved (generation gen-mtmwnzjl-6)."
[act4] HUD does the word "slot" appear anywhere on screen? false
[act4] HUD does the word "limit" appear anywhere on screen? false
[act4] HUD does the word "five" or "5 " appear near a prison count? false
```

The fifth and the sixth are indistinguishable from the first. Nothing refuses,
nothing warns, and no surface mentions slots at all.

**This is not the build breaking a promise, and it should not be reported as
one.** The README's sentence is in a section headed *"Product targets"* and
reads *"multiple prisons per account; five free save slots is **the current
product direction**, with future optional paid expansion"* (README.md:30) —
a direction, with its own hedge. And **the cap it describes is a cloud cap that
this build has no way to reach**: `BASE_SAVE_SLOTS = 5` says of itself *"the
number here bounds a UI and not a right… `public.base_save_slot_capacity()`…
is what actually refuses a sixth slot"*
(**VERIFIED**, `src/services/entitlements/products.ts:16-24`), and ADR 0043
records that *"there is no client identity layer at all"*, so there is no
account for a slot to belong to. `BASE_SAVE_SLOTS` is imported only by
`src/services/entitlements/{projection,client,ledger}.ts` and its own tests —
**VERIFIED by grep across `src/` and `tests/`** — and nothing under
`src/persistence/local/` reads it. `PrisonSaveRepository.create` has no
capacity check (`src/persistence/local/repository.ts:287-306`).

**What is worth recording is the direction the honesty runs in.** The build is
*more* generous than the direction, which costs a player nothing today. What it
costs is later: a player who has made nine local prisons before any account
exists is a player some future sign-in has to refuse, and `projection.ts:129`
already names that state — *"How many existing slots exceed the currently
trusted capacity"* — with the mitigation already decided at `:133`:
*"Over-capacity only stops **new** slots"*. So the shape of the answer exists
in the code and the number does not reach the local path. **No finding is
claimed about which behaviour is right**; the observation is that a player is
told nothing either way, at any point.

---

# 6. Switching is exact — money, buildings, people, clock and tab all come back

**MEASURED, act 3, and this is the part of the question that is simply fine.**
A prison built with the mouse — 24 wall segments, a zoned 6×6 cell, 3 beds, a
toilet, 4 prisoners admitted, 2 guards hired, run to in-game day 6 — was saved
by hand with the clock paused. Then *New prison*, then straight back.

```
[act3] === before :: {"tick":13622,"clock":{"mode":"paused"},"day":"6","funds":23015,"rooms":1,"prisoners":4,"staff":2,"activeTab":"regime"}
[act3] === after  :: {"tick":13622,"clock":{"mode":"paused"},"day":"6","funds":23015,"rooms":1,"prisoners":4,"staff":2,"activeTab":"regime"}
```

Every panel agrees. The Regime panel came back listing the same four prisoners
in the same order, doing the same things, at the same need percentages:

```
[act3] HUD prison A regime panel               :: ... PRISONERS | 4 of 4 | Ewan Haddad | Medium | Association | Bladder | 46% | Jonas Fontaine | Low | Association | Bladder | 46% | Wanda Tamm | Minimal | Association | Bladder | 46% | Ewan Kowal | Minimal | Idle | Bladder | 36%
[act3] HUD prison A regime panel on the way back :: ... PRISONERS | 4 of 4 | Ewan Haddad | Medium | Association | Bladder | 46% | Jonas Fontaine | Low | Association | Bladder | 46% | Wanda Tamm | Minimal | Association | Bladder | 46% | Ewan Kowal | Minimal | Idle | Bladder | 36%
```

**The tab you left on is the tab you come back to** — `data-active-tab` read
`regime` before, while prison B was active, and after. That is a real answer
and a slightly accidental one: the active tab is `HudState` on the main thread
and a session switch does not touch it, which is *also* why prison B, a bare
world, was shown on the Regime tab. Correct for the returning player and odd
for the new one.

Two lines differ across the switch and both are already accounted for:

| Line | Before → after | What it is |
| --- | --- | --- |
| strip, speed | `Speed 4×` → `Speed 1×` | known and decided. `docs/research/2026-09-02-playing-the-clock.md`: *"a reload always returns to a paused session with no retained speed, consistent with ADR 0051's own decided scope"*. Re-observed across a **switch** rather than a reload. |
| strip, `EARNED TODAY` | `595` → `608` | the pre-switch reading was the stale one, exactly as `docs/research/2026-09-04-does-a-prison-come-back.md` §4 row 1 measured for `435 → 445`: `status-counts` publishes on change, and the restored session republishes at the captured tick. The restore is the **more** accurate reading. |

---

# 7. What a "session" is, and the one sentence about it that a player sees once

**MEASURED, act 6.** Three surfaces, one machine.

```
[act6] HUD context one, after making a prison :: {"status":"Saved (generation gen-mtmwy9x0-1).",...}
[act6] HUD every sentence the page says about where saves live :: ["Save now","Saved (generation gen-mtmwy9x0-1)."]
[act6] HUD context two, same URL, same machine :: {"status":"Local saves only — no network required.",...,"list":"No prisons yet."}
[act6] HUD context two rows = 0
[act6] HUD a second tab of context one :: {"status":"Local saves only — no network required.",...,"list":"New Prison (1 gen) | Load | Delete"}
[act6] HUD does either tab say the prison is open elsewhere? one=null three=null
```

Three separate things in that:

**The one honest sentence is the idle state, and it is gone after the first
press.** `'save.status.idle': 'Local saves only — no network required.'`
(**VERIFIED**, `src/content/default-locale-en.ts:2078`) is set once in the
constructor (`src/ui/save-panel.ts:580`) and every subsequent `setStatus`
replaces it. Filtering the whole page for any sentence containing *save*,
*local*, *network*, *account*, *cloud*, *browser*, *device* or *sign*, after
one prison had been made, returned two strings and neither is about where
anything lives. **A player who has played for five minutes has nothing on
screen telling them their prisons are in this browser.**

**And "local" is the weaker half of the truth.** What context two shows is that
the prisons are not on the machine, they are in the storage partition: same
computer, same URL, `rows = 0`, no explanation offered and none needed by the
game, which has no concept of the player who owns them. That is #582's *"a
session has no identity"* seen from the player's side rather than the
repository's, and ADR 0043 already records the cause — *"There is no client
identity layer at all. Not 'an unwired one' — none."*

**Two tabs of one partition see the same prison and neither says so.** #582's
FINAL-006 predicts what happens next (a stale tab overwriting newer progress)
and notes *"There is no UI warning that the game is open in another tab
either."* That prediction is not tested here — I made two tabs and did not race
them — but the *absence* is MEASURED: neither page's text matches
`/another tab|elsewhere|already open/i`.

---

# 8. What I did not reach

- **I did not race two tabs.** #582 FINAL-006 and FINAL-004 are both
  concurrency claims and both stay READ-ONLY as far as this pass goes; act 6
  establishes only that no warning exists.
- **I did not delete the active prison.** The previous record measured that
  (a live, playable, unsaveable prison) and I deliberately deleted a
  *non-active* row instead, which is the case a multi-prison player meets and
  nobody had pressed.
- **I did not export and re-import a prison to see whether that is a rename in
  disguise.** `Import` writes into a prison (`'save.status.imported': 'Imported
  the save file into this prison (generation {generation}).'`) and may be a
  route to a second copy; unplayed.
- **I did not measure what a large list does to the panel.** Six rows fit; the
  panel is a scroll container (`src/styles.css:56-68`) and 20 prisons were not
  tried.
- **I did not establish whether `displayName` survives a save/load round trip**,
  because nothing can set it to anything but `'New Prison'`.

# 9. My weakest claim

**That §3's ordering finding costs a player anything.** What is MEASURED is one
list in one act where the active prison was the bottom row, and what is
VERIFIED is that the code's own comment says something the code does not do.
The step from there to "a player picks the wrong row" is JUDGEMENT and it leans
on §2 — if the rows carried names, the order would be a convenience rather than
the only information present. **What would change my mind:** a build where
prisons have names, or a measurement showing that `updatedAt` is bumped often
enough in ordinary play (by the command-driven autosave) that the order is
right nearly always anyway. The second is testable and I did not test it.

The runner-up is §1's player cost. The 211 ticks lost in act 1 is a real
measurement of a small prison; the **size** of the loss for a real player
depends entirely on when they last submitted a command, which the previous
record established can be never. I measured the mechanism, not its
distribution.
