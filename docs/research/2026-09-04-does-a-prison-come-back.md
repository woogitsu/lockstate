# 2026-09-04 — does a prison come back, and does the game tell the truth about what was saved and what was restored?

**Played on `playtest/does-a-prison-come-back`, cut from a fresh `origin/main`
at v0.0.442 (`3d2a8bda`).** The instrument is
`tests/browser/playtest-does-a-prison-come-back.playtest.ts`, which is **not**
a CI gate: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `.playtest.ts` is collected only by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.

## The question

`tests/determinism/` pins the save format and the schema is at version 5.
`docs/research/2026-09-02-what-does-not-survive-a-reload.md` walked the schema
field by field through `restoreSimulationRuntime`. **Neither ever pressed *Save
now*, reloaded the page, and pressed *Load*** — which is the only route a
player has. Four acts do exactly that: an honest round trip, a save taken
during a live incident response, the autosave, and the unhappy paths.

## The answer, in one line

**The prison itself comes back exactly — kernel tick `17690` in, kernel tick
`17690` out, every roster row, every name, every need percentage and every
figure on the status strip identical — and the sentence the game says about it
is accurate as far as it goes. What is not honest is *"Saved"*: it stands
unchanged on screen while the simulation runs on past what was written, because
the autosave is scheduled only by an accepted player command, and 80 seconds of
a running clock with nothing pressed produced 1,626 ticks of play and zero
saves.** Two further presses destroy work with no warning at all: *Load*
discarded **2,461 ticks** (MEASURED) with no confirmation and no dialog, and
*Delete* on the active prison leaves a **live, playable prison on screen that
can never be saved again** — the clock runs, `Admit` submits a real command and
gets a real refusal, and the panel says *"No active prison — create or load one
first."* The brief's mid-incident window is real, is visible, and the interface
**does** have an honest word for it: two guards read **`Guard · Unclaimed`**
with a live Release control, for six ticks of simulation — or for ever, because
a Load leaves the clock stopped and the window closes only on a kernel update.

## How to read this record

Following `docs/research/README.md`'s tiers, with the one this repository's
playtests add:

- **MEASURED** — a real run of this tree's own code in a browser, output pasted.
- **VERIFIED** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **UNKNOWN** — not established in this pass.

Two channels are reported and they are **never mixed**:

- **HUD** — `innerText` read out of the real DOM, or a real attribute on a real
  control (`disabled`, a bounding box, `document.elementFromPoint`). This is
  what a player sees.
- **STATE** — a `simulation/request-projection` round trip to the worker using
  the same envelope `src/ui/simulation-projections.ts` posts, or a figure off
  `simulation/status-counts`.

`hud/held-guards` is the one projection here that is **both**: the Staff
panel's held-guards block renders it (`src/ui/hud/staff-panel.ts:1044`,
`.hud-staff__held`), so this record reads the projection *and* the rows,
separately. `hud/incidents`, `hud/incident-detail` and `hud/security` are
STATE only. **VERIFIED for this tree by grep** — the three ids, searched across
`src/ui/` and `src/main.ts`, return one hit, and it is a comment in
`src/ui/simulation-staff-coverage.ts:35` explaining why that module reads
`hud/staff` instead. Nothing requests any of the three, so no number this
record takes from them is on a player's screen.

### One instrument bug found and fixed mid-pass, because it produced a false reading

The first run of act 4 reported *"ticks discarded without a warning = 0"*. That
number was an artefact of reading the tick off `simulation/clock-state`: the
worker publishes that message at most every 250 ms **and only when the tick has
moved**, so on a stopped clock the last message survives a page reload's worth
of staleness and reports the *pre-reload* tick as if it were the restored one.
Every tick in this record is therefore read off a **projection reply's own
`payload.tick`** (`src/simulation/worker/state-machine.ts:1389`), which is the
kernel tick at the moment the projection was taken and is answered while
paused. The corrected reading for the same act is **2,461**.

## The prisons, and how they were built

All four acts use `buildAndPopulate` from `tests/browser/playtest-harness.ts`:
an enclosed 6×6 cell at tiles (12,12)–(17,17) drawn with the mouse, beds, one
toilet, admissions, guards hired from the Security tab.

| Act | Prison | What it asks |
| --- | --- | --- |
| 1 | 4 beds, 6 admissions, 3 guards, run to day 8 | the honest round trip: save, reload the page, load, diff every panel |
| 2 | 1 bed, 8 admissions, 4 guards | save *during* a live response; watch the guards across the reload |
| 3 | a bare `New prison`, nothing built | does the autosave notice correspond to a save that loads |
| 4 | a bare `New prison` | no save, two saves, Load over newer play, Delete |

Run one act at a time (`-g` is a regex, so escape parentheses):

```
LOCKSTATE_BROWSER_TEST_PORT=5417 node --experimental-transform-types \
  --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-does-a-prison-come-back.playtest.ts -g "act 1"
```

Constants used in the arithmetic below, all VERIFIED: `DAY_LENGTH_TICKS = 2_400`
(`src/simulation/prisoners/regime.ts:12`), `stepMilliseconds = 50`
(`src/simulation/clock/fixed-step-clock.ts:29`) so 20 ticks a second at ×1,
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000`
(`src/persistence/session/session-controller.ts:10`), and the response system's
`schedule = { intervalTicks: 10, phaseTicks: 0 }`
(`src/simulation/incidents/response-system.ts:89`).

---

# 1. Delete leaves a live, playable prison that can never be saved again — and warns neither before nor after

**MEASURED, act 4d, and this is the finding this pass would fix first.**

The prison was created, saved three times, and its one row's **Delete** pressed.
No confirmation was asked for at any point (`HUD dialogs while Delete runs = 0`),
and the panel then said:

```
[act4d] HUD after Delete :: [idle] Prison deleted. | list No prisons yet.
[act4d] HUD load buttons remaining = 0
```

**The prison was still on screen, and still running.** The status strip kept
painting it, the clock kept its position, and pressing **Play** made the kernel
advance at the correct rate:

```
[act4d] HUD strip while the deleted prison plays :: ... | 25,000 | FUNDS | 0 | EARNED TODAY | DAY | 1 | Through the day | 47% | ... | Speed 1× | ×1
[act4d] STATE kernel tick after pressing Play on the deleted prison: 1063 then 1140
```

**And it still accepts commands.** The `Admit` control was enabled, the press
submitted, and the simulation refused it for a real simulation reason:

```
[act4d] HUD admit control disabled=null
[act4d] HUD refusal band :: Nobody was admitted — this prison has no room to hold anybody.
```

While every one of those things was true, the save panel said:

```
[act4d] HUD after Save now on a deleted prison :: {"status":"No active prison — create or load one first.","kind":"idle","detail":"","list":"No prisons yet."}
```

**So the game offers a fully working prison that it has already thrown away.**
Every minute of play after that press is unrecoverable: the only exits the panel
offers are *New prison*, which replaces it, and a page reload, which loses it.
Nothing on screen says the prison in front of the player is orphaned; the one
cue is a sentence in a different panel asserting that no prison is active, next
to a clock that is visibly running one.

**The sample that could have refuted it and did not, stated exactly.** Act 4 was
run twice, on separate ports with separate browsers and separate IndexedDB.
**Both runs** measured the orphaned session: the empty list, the strip still
painting the prison with its funds and clock position, and *Save now* answering
*"No active prison"*. **The clock-and-command half was added for the second run
and is therefore one observation** — `Play` advancing the kernel 1063 → 1140,
`Admit` enabled, the press submitted and refused with a real simulation
sentence. The refutation this looked for was the session being torn down by the
delete: a stopped clock, a `.hud__unavailable` notice, or a `protocol/error`
from the projection probe. None appeared — the projection answered and the tick
moved — but a second run of the clock-and-command probe is what would harden it
from one sighting to two.

**What words would have to convey** (no shipped string is authored here — the
locale file is another agent's this hour): the delete of the *active* prison
needs to say, before it happens, that the prison currently on screen is the one
being deleted and that play will not be saveable afterwards; and afterwards the
screen needs to stop asserting a prison the game has disowned. `AGENTS.md`
exclusion 4 makes the sentence the owner's; the shape of the defect — a
player-visible promise the code does not keep — is why it is reported rather
than patched.

---

# 2. The autosave is scheduled by *commands*, not by play — so a watched prison is never saved, while the panel goes on saying "Saved"

**MEASURED, act 3, two windows of 80 seconds each, nothing pressed inside either.**

`New prison` wrote generation 1 and the panel said so. Then the clock was
started and **nothing else was touched for 80 seconds**:

```
[act3a] STATE clock = {"mode":"running","speed":1}, tick = 64
[act3]   +1s t=93 [saved] Saved (generation gen-mtmlg2b0-1). | list New Prison (1 gen) | Load | Delete
[act3a] STATE tick after the 80 s window = 1690
[act3a] distinct panel states in the window = 1
```

**1,626 ticks of simulation — DERIVED, 0.68 of an in-game day — and not one
autosave.** The status line held the sentence *"Saved (generation
gen-mtmlg2b0-1)"* throughout, which was true of generation 1 and false as a
description of the prison on screen.

Then **one** command was submitted (a `PurchaseMaterials` from the Build panel)
and the window repeated:

```
[act3b] STATE one PurchaseMaterials submitted at about tick 1792
[act3]   +1s  t=2076 [saved] Saved (generation gen-mtmlg2b0-1). | list New Prison (1 gen) | Load | Delete
[act3]   +32s t=2713 [saved] Saved (generation gen-mtmlj5di-2). | list New Prison (1 gen) | Load | Delete
```

**An autosave fired 32 seconds after the command and not before it.** That is
exactly what the code says: `AutosaveScheduler` is dirty-driven, and the only
producer of dirt is an accepted command —
`commandSender?.onCommandAccepted(() => controller.markDirty())`
(**VERIFIED**, `src/main.ts:3226`), fed from
`if (message.payload.status === 'queued') this.accepted?.();`
(**VERIFIED**, `src/ui/simulation-commands.ts:347`). The transport is not a
command: `SimulationCommandSender.setClock` posts `simulation/set-clock`, not
`simulation/submit-command` (**VERIFIED**, `src/ui/simulation-commands.ts:287`).

So the rule, stated plainly: **pressing Play does not schedule a save, and
neither does anything the prison does on its own.** Wages, state income,
prisoner needs, an incident and its whole response can all happen inside a
window that no autosave will ever cover.

## 2.1 What that costs across a reload, measured

Act 3 then played on for a further 45 seconds, pressing nothing, and reloaded:

```
[act3c] HUD what the panel says at the moment of the reload :: [saved] Saved (generation gen-mtmlj5di-2). | list New Prison (1 gen) | Load | Delete
[act3c] STATE kernel tick at the moment of the reload = 4617
[act3c] HUD clock at the moment of the reload :: DAY | 2 | Through the day | 93%
...
[act3c] STATE kernel tick after Load = 2634
[act3c] STATE ticks between the last pre-reload reading and what came back = 1983
[act3c] HUD clock after Load :: DAY | 2 | Through the day | 9%
```

**1,983 ticks gone — DERIVED, 0.83 of an in-game day — with the words "Saved
(generation gen-mtmlj5di-2)" the last thing the panel had said.** The clock
readout is the honest half of this: `DAY 2 · 93%` before, `DAY 2 · 9%` after.
Nothing named the gap.

`LifecycleSaveHandler` does attempt a best-effort save on `pagehide`
(**VERIFIED**, `src/persistence/session/lifecycle.ts:106`, fire-and-forget by
design and documented as such). **It did not land here**: the fresh page's list
read `New Prison (2 gen)`, and the generation that came back was the 30-second
autosave's, at tick 2634. That is the documented "may simply not complete"
outcome, MEASURED once on a same-tab reload — it is not evidence that the
handler is wrong, only that it is not a floor a player can rely on.

**The sample that could have refuted it and did not.** Act 1 pressed *Save now*
by hand with the clock paused, and its round trip lost **0** ticks
(§4). So this is not "the save format loses ticks"; it is specifically the
absence of a save, in a window the panel describes as saved.

**What words would have to convey.** Either the status line stops asserting a
past-tense *"Saved"* once the session has moved past the generation it names, or
the panel gains a plain statement of what is not yet written. The second is a
new player-facing promise and therefore the owner's; the first is a change to
shipped copy and equally so.

---

# 3. Load and Delete both destroy play with no confirmation; Load discarded 2,461 ticks and said only "Loaded."

**MEASURED, act 4c.** The prison was saved at kernel tick 961, then played on to
3422 with the clock paused at the end so nothing could drift, and **Load** was
pressed on its own row:

```
[act4c] STATE tick before pressing Load = 3422 (last save was at 1208)
[act4c] HUD panel before pressing Load :: [saved] Saved (generation gen-mtmm4dfm-4). | list New Prison (3 gen) | Load | Delete
[act4c] HUD mid-load status :: {"status":"Loading…","kind":"saving",...}
[act4c] HUD mid-load dialogs :: 0
[act4c] STATE tick after Load = 961
[act4c] STATE ticks discarded without a warning = 2461
[act4c] HUD after Load :: [saved] Loaded.
```

**2,461 ticks — DERIVED, 1.03 in-game days — discarded by one press, with zero
dialogs, zero confirmations and a one-word verdict.** The clock readout again
tells the truth and only in arrears: `DAY 2 · 42%` before, `DAY 1 · 40%` after.

The same holds for **Delete** (§1): no dialog, no arming step, and the row for
the *active* prison carries the same two buttons in the same wording as any
other row. `.save-panel__item` marks the active prison with
`dataset.active = 'true'` (**VERIFIED**, `src/ui/save-panel.ts:672`) and
nothing in the panel's copy uses it.

## 3.1 "Load an older save over a newer prison" is not a gesture the panel offers

**VERIFIED.** `SessionController.loadPrison` (`src/persistence/session/session-controller.ts:303`)
walks `repository.loadCurrent(prisonId, { skip: attempted })` — the **newest
readable** generation, retrying older ones only when a newer one is refused by
validation. There is exactly one *Load* button per prison, so the three retained
generations behind `New Prison (3 gen)` are not separately reachable and an
older save can only be loaded by a save being *broken*. The count is therefore a
statement about a fallback window, not a menu; act 4 tried the only load the
panel has, and it gave the newest.

That is a coherent design (`docs/PERSISTENCE.md`'s retention window is a
recovery mechanism, not a save-slot feature), and it is written down here
because the label `(3 gen)` invites the other reading.

---

# 4. The round trip itself is exact, and six of twelve HUD lines still differ — every one of them explained

**MEASURED, act 1.** A prison built and run to day 8, the clock **paused** so
the before-reading and the save describe the same tick, every panel read, *Save
now*, a real `page.reload()`, then *Load*, then every panel read again.

```
[act1] STATE tick=17690 clock={"mode":"paused"}        (before)
[act1] STATE tick at save = 17690
[act1] STATE tick off clock-state after Load = -1 (kernel says 17690)
[act1] STATE tick delta across the round trip = 0
```

The simulation side is identical, and not only in the tick. The held-guards
projection came back with the same guard, the same claim, the same phase, the
same sector **and the same name** (`Lars Sandoval`); the counts came back with
the same treasury (`23690`), the same `rooms/roomCapacity/roomOccupants`
(`1/4/4`), the same wage bill (`240`); the Regime panel came back listing the
same four prisoners in the same order doing the same things at the same need
percentages (`Malik Xavier · Association · Bladder 69% · Low`, …).

The instrument compares twelve HUD readings. **Six differed. All six are
accounted for, and none of them is the save format losing state:**

| # | Line | Before → after | What it is |
| --- | --- | --- | --- |
| 1 | strip, `EARNED TODAY` | `435` → `445` | **the pre-save reading was the stale one.** `status-counts` publishes on change; the last publication before the pause was tick 17670 (`435`), the save captured 17690, and the restored session republished at 17690 (`445`). The restore is *more* accurate than the screen it replaced. |
| 2 | strip, speed | `Speed 4×` → `Speed 1×` | known and decided. `docs/research/2026-09-02-playing-the-clock.md` records *"a reload always returns to a paused session with no retained speed, consistent with ADR 0051's own decided scope"*. Re-verified, not newly found. |
| 3 | refusal band | a sentence → not laid out | known. Finding A of `docs/research/2026-09-01-what-survives-a-reload.md`: `RefusalLog` is not snapshotted. Re-verified. |
| 4 | alerts column | one `refusal-13` row → `No active alerts` | the same cause as #3: the only row this prison had was refusal-sourced. The **event** rows do survive — act 2 carried `event-1` and `event-2` across its own reload intact, which is ADR 0084 working. |
| 5 | Build panel | `Toilet Selected` → `Brick wall Selected`, and the whole `QUANTITY / Buy 1 × Brick · 40` fold gone | main-thread UI state. The armed tool, the selected buildable and the open fold live in `HudState`, not in a save. |
| 6 | Rooms panel | `Cell Selected` → `Staff Room Selected`, and `ENCLOSURE / Walled in on every side` gone | same: the room selection and `HudViewModel.zoning`'s verdict about the last rectangle are main-thread state. |

(The seventh differing string, the held row's box moving from `y=734` to
`y=710`, is #3's reflow: the refusal band's box is gone, so the rail moves up
24px. Counted as one of the six above.)

## 4.1 The load's own sentence is accurate, and it is a sentence about the save format

The detail line after *Load* reads, in full (HUD, MEASURED):

> Restored: kernel tick and command queue, RNG stream states, world terrain and
> ownership, construction orders and undo/redo, entity id liveness, prisoners,
> needs, actions and cell assignments, jobs, containers and utility networks,
> doors, security sectors, guards and patrols, contraband, intelligence and
> searches, incidents, gangs and tunnels, prisoner and staff names. Not carried
> by this save version: room and topology caches (recomputed from the world),
> navigation caches and in-flight path requests (re-issued on the next tick).

Eleven restored scopes and two not carried, matching `CURRENT_SAVE_RESTORED_SCOPE`
exactly (**VERIFIED**, `src/simulation/runtime/restore-session.ts:202`). Every
claim in it held. **And the two things it names as not carried are internal
caches, while the three things a player could actually see change — the refusal
band, its alerts row, and the tool/room selection — are not in either list.**
That is not a false statement; `notCarriedByThisSaveVersion` is scoped to save
sections and says so. It is the one surface that could have named the visible
losses and does not, which is why the honest reading of *"Not carried by this
save version: room and topology caches, navigation caches"* is "nothing else was
lost" — and three things were.

Whether the report should widen is a product question with a real argument on
the other side: `src/content/default-locale-en.ts:1958-1961` records the owner's
ruling on #226 that these thirteen strings were *moved, not chosen*, and warns
*"Do not 'improve' these sentences here; change the report, if it should change,
as its own decision."* This record names the gap and makes no change.

## 4.2 What a returning player lands on

**MEASURED, act 1.** On the freshly reloaded page, before *Load*:

```
[act1] HUD fresh clock :: DAY | -- | Through the day | --
[act1] HUD fresh strip :: ... | 0 | PRISONERS | 0 | HIGH RISK | 0 | STAFF | 0 | COVERAGE | Covered | 0 | ROOMS | 0 | INCIDENTS | Clear | 0 | CONTRABAND | 0 | FUNDS | 0 | EARNED TODAY | DAY | -- | ...
[act1] HUD fresh alerts :: ["empty :: No active alerts"]
[act1] HUD on the fresh page :: [idle] Local saves only — no network required.
[act1] HUD on the fresh page, list :: New Prison (3 gen) | Load | Delete
[act1] STATE tick on the fresh page = -1
```

There is **no session at all** — the projection probe gets `protocol/error`,
reported as `-1` — and the strip nevertheless paints a full row of zeros under a
green `Covered` and a `Clear`. The `.hud__unavailable` notice is not laid out
and correctly so: it is wired only to a failed *worker*
(`hud.setUnavailable` from `onWorkerAvailability`, **VERIFIED**,
`src/main.ts:3181`), not to "no prison is loaded". **The one honest cue on the
whole screen is `DAY --`**, and nothing invites the player to press the Load
button sitting in the rail. This is small and it is a first-thirty-seconds
question rather than a save-integrity one; it is recorded rather than ranked.

---

# 5. The mid-incident restore: `Guard · Unclaimed`, a live Release button, and a window the clock closes rather than time

**MEASURED, act 2.** The brief's hypothesis was that a restore brings back
guards mid-response whose response has vanished, that the window closes on the
system's first scheduled update, and that **nobody had seen what it looks like
on screen**. All three are right, and the screen turns out to have an honest
word for it.

## 5.1 The save, taken with a response live

A severity-3 assault was caught in flight at ×1 by polling `hud/incidents` every
120 ms, the clock paused on the spot, and only then saved:

```
[act2] STATE caught incident.assault.2 as 'notified' at tick ~15434; after the pause press it reads 'responding'
[act2] STATE incident timeline at save: [{"state":"active","atTick":15400},{"state":"notified","atTick":15400},{"state":"responding","atTick":15410}]
[act2] STATE tick at save = 15434
```

**HUD at the moment of the save** — the Staff panel's held block, all three rows
laid out with their real boxes:

```
[act2]   header :: ON DUTY 3 held · 1 free (3 laid-out row(s), 0 pooled spare(s))
[act2]   row0 :: Guard · Sector Post       :: button="Release" disabled=false laidOut=1177,758 238x44
[act2]   row1 :: Guard · Incident Response :: button="Release" disabled=false laidOut=1177,810 238x44
[act2]   row2 :: Guard · Incident Response :: button="Release" disabled=false laidOut=1177,862 238x44
```

**STATE at the same moment**: `claim: 'incident-response'`, `deploymentPhase:
'on-search'` for entities 1 and 2 (`Noel Xavier`, `Ewan Jansen`);
`countsByClaim` `incident-response: 2`, `unattributed: 0`.

## 5.2 After the page reload and Load: two rows read `Unclaimed`

**STATE**, first sample after *Load*:

```
[act2] STATE tick right after Load = 15434
[act2] STATE incidents right after Load = ... "incidentId":"incident.assault.2","state":"responding","startedAtTick":15400,"ageTicks":34 ...
[act2] STATE the same incident's timeline after Load = [{"active",15400},{"notified",15400},{"responding",15410}]
[act2]   t=15434 claims=[deployment 1, incident-response 0, search 0, unattributed 2]
          rows=[..., {entityId 1, claim "unattributed", deploymentPhase "on-search"},
                     {entityId 2, claim "unattributed", deploymentPhase "on-search"}]
```

**The incident came back mid-response and the response did not.** That is
`IncidentResponseSystem.getSnapshot` returning `{ metrics }` and nothing else
(**VERIFIED**, `src/simulation/incidents/response-system.ts:853`) against
`loadSnapshot`'s `this.responses.clear()` (`:895`). ADR 0033's residue,
reproduced through the interface for the first time.

**HUD in the same window** — and this is the part nobody had looked at:

```
[act2] HUD security in the window :: ... | ON DUTY | 3 held · 1 free | Guard · Sector Post | Release | Guard · Unclaimed | Release | Guard · Unclaimed | Release | ...
[act2]   row1 :: Guard · Unclaimed :: button="Release" disabled=false laidOut=1177,762 238x44
[act2]   row2 :: Guard · Unclaimed :: button="Release" disabled=false laidOut=1177,814 238x44
```

**`Guard · Unclaimed`.** The word is deliberate and it is correct:
`GuardReleaseService.claimOf` answers `'unattributed'` for an `'on-search'`
guard neither claimant names (**VERIFIED**,
`src/simulation/security/guard-release.ts:198-204`), and
`src/content/simulation-message-keys.ts:329` labels it `Unclaimed`, with the
comment naming this exact window: *"a real state a player can see — in the
window between loading a save taken during a response and that system's next
scheduled update."* **So the interface is not lying here. It has a word, the
word says "nothing is holding this", and it is on screen.**

What is *not* said anywhere: that the response was abandoned. The alerts column
across the reload carried its two event rows intact and gained nothing —

```
[act2] HUD alerts in the window :: ["event-1 :: A fight has broken out between two prisoners. 2× Day 7 / Warning / Clear this alert",
                                    "event-2 :: The prison is under control again — no incident is still open. Day 4 / Info / Clear this alert"]
[act2] HUD event band in the window :: .hud__event: not laid out
```

— and the incident's own timeline never records the interruption, so after the
re-dispatch there is no trace on any surface that the first response ever
existed.

## 5.3 Can a player press something? Yes, and the press lands

The rectangle was proved clear before pressing, because a press on a HUD-covered
point submits nothing and reads exactly like being ignored:

```
[act2] HUD release control probe :: {"present":true,"button":true,"text":"Release","disabled":false,
        "box":{"x":1330,"y":710,"w":85,"h":44},"topmostIsTheButton":true,"topmost":"SPAN.ui-action__label"}
```

`document.elementFromPoint` at the button's centre returns the button's own
label span, contained by the button. The press then moved real state:

```
[act2] STATE held before the Release press :: {"hired":4,"held":3,"unassigned":1}
[act2] STATE held after the Release press  :: {"hired":4,"held":2,"unassigned":2}
[act2] HUD refusal band after the press :: .hud__refusal: not laid out
[act2]   row0 :: Guard · Unclaimed :: button="Release" disabled=false laidOut=1177,757 238x44
[act2]   row1 :: Guard · Unclaimed :: button="Release" disabled=false laidOut=1177,809 238x44
```

**So the panel is live during the window and a Release inside it is accepted.**

**The limit of this reading, stated because it is the honest one:** the probe
took the *first* held row, and at `y=710` that was `Guard · Sector Post`, not an
`Unclaimed` one. **What is MEASURED is that the panel accepts a Release during
the window**; what is *not* measured is a Release aimed at an `Unclaimed` row
specifically. The two remaining rows kept enabled Release buttons at the same
geometry after the press, so the control is reachable — but "pressing Release on
an Unclaimed guard succeeds" is **UNKNOWN** in this pass. A one-line change to
the probe (`.hud-staff__held-row` filtered on its label) would settle it.

## 5.4 How wide the window is

Restarting the clock closed it:

```
[act2] STATE clock restarted from tick 15434
[act2]   closing :: t=15446 unattributed=0 claims=[deployment 1, incident-response 2, search 0, unattributed 0]
[act2] STATE window closed at tick 15446; width from the load tick 15434 is 12 tick(s)
[act2] STATE ... responseMetrics ... "respondersDispatched":4 ...
```

- **Observed width: at most 12 ticks** (15434 → 15446). That is a *sampling*
  bound: the loop polls a projection every 60 ms, so it cannot resolve better.
- **DERIVED true width: 6 ticks.** The sweep runs from
  `IncidentResponseSystem.update`, whose `schedule` is
  `{ intervalTicks: 10, phaseTicks: 0 }` (**VERIFIED**, `:89`), so the first
  update at or after the load tick 15434 is **15440**. 6 ticks is **0.3 s at
  ×1** and **0.075 s at ×4** (DERIVED).
- **Wall-clock width while paused: unbounded.** Thirteen consecutive samples,
  spanning roughly three seconds of real time, all read kernel tick `15434` and
  all read `unattributed: 2`. A *Load* leaves the session **paused** (act 4c:
  `Speed 1× | PAUSED` after every load), and the flag that owes the sweep is
  cleared by the first `update` (**VERIFIED**, `:293`, `:415`), which a stopped
  kernel never runs. **So a player who loads a save taken mid-response and does
  not press Play sees `Guard · Unclaimed` for as long as they like.** That is
  the reading the harness round trip could not produce, and it is the answer to
  "how wide is the window": in ticks, six; in the thing a player experiences,
  however long they leave the clock alone.

The close is a *re-dispatch*, not a resumption: `respondersDispatched` went
`2 → 4` for two incidents needing two responders each, the rows returned to
`Guard · Incident Response`, and the incident's timeline is byte-identical to
what it was before the reload. ADR 0033's amendment working as written.

**Not exercised, so UNKNOWN**: the *other* orphaned claim. A response also
claims the incident sector's `'lockdown'` control state, and this run's
severity-3 assault never triggered one — `STATE sectors` read
`control: "normal"` before the save, in the window, and after. A restore taken
during a severe enough incident to lock a sector is a separate reading, and
`hud/security` is not painted anywhere, so a player could not see it either way.

---

# 6. The prison list's generation count is refreshed only by a pressed action, so the panel contradicts itself

**MEASURED, act 1 and act 3, independently.**

Act 1, immediately before pressing *Save now* — the status line naming
generation 9 while the list claims one generation exists:

```
[act1 BEFORE] HUD save.status :: [saved] Saved (generation gen-mtmlmb8f-9).
[act1 BEFORE] HUD save.list   :: New Prison (1 gen) | Load | Delete
[act1] HUD after Save now, list :: New Prison (3 gen) | Load | Delete
```

Act 3, the same shape with a two-line proof: an autosave moved the status line
from generation 1 to generation 2 and left the list at `(1 gen)`, and only the
reload's own re-read corrected it to `(2 gen)`.

**Cause, VERIFIED.** `SavePanel.reportBackgroundSave`
(`src/ui/save-panel.ts:613`) calls `setStatus` and nothing else — its own
docblock says *"Surfaces a background autosave outcome without stealing focus
or clearing the detail line."* Every list re-read goes through `refresh()`, and
its only callers are the four mutating handlers (`requestCreate`,
`requestSaveNow`, `requestLoad`, `requestDelete`). So the count is the count as
of the player's last press, and the retention window (`keep: 3`,
`src/persistence/local/generation-policy.ts:7`) fills in silently behind it.

Nothing is lost by this and nothing is at risk; it is a panel disagreeing with
itself in the same 200 pixels, on the one screen a player goes to when they want
to know what has been saved.

---

# 7. What the unhappy paths do say, and it is accurate

**MEASURED, act 4a and 4b.** Everything here checked out, and it is recorded
because "the refusals are honest" is a result:

| Gesture | HUD verdict | Correct? |
| --- | --- | --- |
| Load with nothing saved | **the control does not exist.** `list :: No prisons yet.`, and `HUD load buttons remaining = 0`. The four header buttons are all laid out at 44px tall. | yes — there is nothing to aim at, so nothing pretends there is |
| *Save now* with no prison | `No active prison — create or load one first.` | yes |
| *Export* with no prison | `Nothing to export — no valid active save.` | yes |
| *Save now*, then *Save now* again | `Saved (generation gen-mtmm477n-2)` → `Saved (generation gen-mtmm4atp-3)`, list `(2 gen)` → `(3 gen)` | yes — two saves, two generations, both named |
| two clicks inside one gate window (a double click) | `disabledAfterFirstClick=true`, and exactly **one** new generation (`-4`) | yes — `AsyncActionGate` disabled the control between the two clicks, so the second reached a dead button rather than a second write |

## 7.1 One side observation, seen once, outside this question

On the **first** run of act 2, every one of `buildAndPopulate`'s eight `Admit`
presses failed over 38 seconds with *"The simulation has not reported its
command sequence yet; try again in a moment"*, and the prison admitted nobody.
**Cause, VERIFIED**: `sequenceSynced` is set to `false` whenever a command is
**rejected** (`src/ui/simulation-commands.ts:328`) and the only thing that sets
it back is a `simulation/snapshot` (`:321`, `baseline`). One refused bed
placement during construction therefore stopped every subsequent command until a
snapshot happened to arrive. The failures reached `console.warn` as *"HUD action
failed"*; the intake panel showed no warning of its own.

**It did not reproduce on the second run** (all eight admissions landed), so
this is **one sighting** with a verified mechanism and no reproduction, and it
belongs to whoever owns the command channel rather than to this pass. It touches
this question only at the edge: the recovery mechanism is a snapshot, and a save
is one of the things that produces one. The instrument carries a heal-and-retry
block for it, which the second run never entered.

---

# 8. Ranked, with what each finding rests on

| # | Finding | Tier | Where |
| --- | --- | --- | --- |
| 1 | **Delete leaves a live, playable, unsaveable prison on screen; no warning either side** | MEASURED ×2 runs | §1 |
| 2 | **The autosave is command-driven, so a watched prison is never saved while the panel says "Saved"**; 1,626 ticks / 80 s with zero saves, 1,983 ticks lost across a reload | MEASURED + VERIFIED cause | §2 |
| 3 | **Load discards unsaved play with no confirmation**; 2,461 ticks, 0 dialogs | MEASURED | §3 |
| 4 | **The mid-incident window is real, visible as `Guard · Unclaimed`, actionable, 6 ticks wide — and unbounded while the clock is stopped** | MEASURED + DERIVED | §5 |
| 5 | **The list's generation count contradicts the panel's own status line** | MEASURED ×2 acts + VERIFIED cause | §6 |
| 6 | **The round trip is exact and the restore report is accurate**; the report names two internal caches as not carried and none of the three visible losses | MEASURED | §4 |
| 7 | A returning player lands on a full row of zeros with `DAY --` and no invitation to load | MEASURED | §4.2 |
| 8 | One sighting: a rejected command silently stops the command channel until a snapshot | MEASURED ×1, not reproduced | §7.1 |

## What was deliberately not filed

- **The save panel losing 130px below its own fold on the Build and Rooms
  tabs.** Already §11 of `docs/research/2026-08-31-playing-the-twelve.md`. Not
  re-measured and not re-filed; it is the reason the readings above name which
  tab was showing.
- **`RefusalLog` not surviving a reload.** Finding A of
  `docs/research/2026-09-01-what-survives-a-reload.md`. Re-verified in act 1 and
  credited there, not claimed here.
- **Play resuming at ×1 rather than the interrupted speed, and a reload
  returning a paused session.** Both in
  `docs/research/2026-09-02-playing-the-clock.md`, and the second is stated
  there as consistent with ADR 0051's decided scope. Re-verified, not re-filed.
- **`hud/incidents`, `hud/incident-detail` and `hud/security` being painted by
  nobody.** The orphan census of 2026-09-04 owns that ground. Re-confirmed here
  by one grep, because this record's STATE channel depends on it, and otherwise
  used as a premise.
- **The cloud-save path.** Not touched at all: `AGENTS.md` reserves it, and this
  pass never left local storage.

## The weakest claim in this record, and what would change my mind

**§5.3.** The claim *"a player can press something during the window"* rests on
a Release press that landed on the `Sector Post` row rather than on an
`Unclaimed` one, because the probe took the first held row and the layout put
`Sector Post` first. What is proven is that the block is live and accepts a
Release inside the window, with the pressed rectangle verified clear by
`elementFromPoint`; what is assumed is that the two `Unclaimed` rows behave the
same way, on the evidence that they carry enabled buttons of identical geometry.
**A single run pressing Release on a row whose label reads `Unclaimed` would
settle it either way**, and if that press were refused — or accepted and then
undone by the sweep six ticks later — the finding's wording would have to
change.

The second weakest is **§2's generalisation**. The two 80-second windows were
run on a **bare** prison, with nothing built and nobody admitted. The mechanism
is verified at three file:line sites and does not depend on population, but the
*measurement* does not itself prove that a busy prison produces no accepted
commands of its own accord. A window run on act 1's populated day-8 prison would
either confirm it or reveal a producer of dirt I have not found.

**§1 is the one I would most like to be wrong about**, and the sample that
would refute it is a run where the deleted prison's clock refuses to start or
its projection stops answering. Two runs saw the orphaned session; **one** saw
it run and accept a command.
