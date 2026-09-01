# Playtest: the people surface — a bare word on a roster row, a search that names itself, and an all-clear that never says which incident it clears

**Date:** 2026-09-01
**Branch:** `docs/playtest-people-2026-09-01`, cut from `origin/main` at
**v0.0.341** (`5cc6227b`). The strip's own version line confirms this
throughout the run (`v0.0.341 · <commit>`, the commit moving with each of this
branch's own commits as the instrument was fixed forward).

**Surface:** residents, staff, risk classification, guard deployment and
coverage, contraband searches, incidents (fights, riots, escapes), and what the
game tells the player at each point — the surface named untouched in this
branch's brief, after money, rooms, save/reload and the alerts channel were
each played earlier the same day.

**The brief, in the owner's words:** *"znajdź bugi i błędy grając"* — find
defects **by playing**, desktop first. The design directive under it: *the
game must be easy and friendly to play — no hidden functionality. Anything a
player can only discover by accident is itself a defect.*

## Reproduction

`tests/browser/playtest-2026-09-01-the-people.playtest.ts`, one act at a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5330 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-01-the-people.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`*.spec.ts` only, and `playwright.playtest.config.ts` is the one that matches
`*.playtest.ts`. Every act drives `index.html` + `src/main.ts` in real
Chromium at 1280x800 through a `Worker` tee, with real mouse gestures on the
real controls — no synthetic view model is ever injected, and every quoted
sentence below is read off the DOM (`innerText`, `textContent`,
`getAttribute`), never off simulation state.

**LFS**: `git lfs checkout` was run in the worktree first (62 objects, 93 MB),
confirmed with `file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104`.

**Contention.** `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"`
returned other agents' processes at points during this pass — a one-minute
load average as high as 8.2 during the first run, between 0.7 and 5.4
afterward. Per this branch's brief, **no finding below rests on wall-clock
timing, frame rate or latency** — every claim about *when* something happened
is a simulation tick, read from `simulation/clock-state` publications, which
run at a fixed rate independent of how loaded the box is. The one genuine
contention artefact this pass hit (§0) is reported as an instrument bug, not a
game defect, for exactly that reason.

## Claim tiers

- **MEASURED** — this pass drove the real page and the quoted output is
  verbatim console/log output from that run.
- **VERIFIED, read** — a source file was opened at the cited line and quoted.
- **REASONED** — follows from MEASURED or VERIFIED facts, stated as such.
- **UNKNOWN** — not established, and named as such.

## The acts

| act | what it played | result |
| --- | --- | --- |
| 1 | a 6x6 cell, six beds, one guard, six admissions; read the Regime tab's roster badges and "Today's blocks" | `1 passed (1.4m)` |
| 2 | a 6x6 cell, twelve beds, twelve admissions, three guards; read every coverage state, the Held Guards fold, and a real contraband find | `1 passed (1.9m)` |
| 3 | a fresh, unfurnished prison spent down to the starter rung; read the FUNDS badge, the refusal band, and a hire attempt at the same balance | `1 passed (29.0s)` |
| 4 | a 6x6 cell, two beds, fourteen admissions, zero guards; a live incident recorded from before the clock ever ran | `1 passed (1.5m)` |

---

## §0 — An instrument bug found and fixed in this pass: `.hud-minimap` sits over the world canvas

**This is reported here because the deliverable asks for it explicitly, and
because it very nearly produced a false finding of its own** — the exact
failure mode this branch's brief warned about (*"a drag that walked onto a HUD
label"*).

Act 1's first run built a 6x6 cell at tiles (12,12)-(17,17) — the same
rectangle `tests/browser/playtest-harness.ts`'s `buildAndPopulate` and
`tests/browser/ui-contraband-name.spec.ts`'s headless fixture both use — with
the mouse. The west wall's drag produced 3 of 6 expected `PlaceBuildOrder`
commands, twice, identically, on two separate runs:

```
wall run west: 3 command(s) -> ["12,12 west","12,13 west","12,14 west"]
```

A re-drag over exactly the missing three tiles did not help, and neither did a
direct `press()` at each missing tile's screen point — it **produced zero
commands**, not a wrong one. Reading what was actually under the pointer
(`document.elementsFromPoint`) at one of those points answered why:

```
press at 12,15 (screen 384,368) produced NOTHING; elementsFromPoint: [
  {"tag":"DIV","cls":"ui-panel__body", "rect":{...,"top":363.8,"left":13,"right":409,"bottom":717.8}},
  {"tag":"SECTION","cls":"ui-panel hud-minimap","rect":{"x":12,"y":317.8,"width":398,"height":401,...},"pointerEvents":"auto"},
  {"tag":"CANVAS","cls":"","rect":{"x":0,"y":0,"width":1280,"height":800}},
  ...
]
```

**`.hud-minimap` (`src/ui/hud/hud.ts:1307-1326`, styled at
`src/ui/hud/hud.css:275`) is docked over the left of the world canvas, is a
real panel with `pointer-events: auto`, and at 1280x800 measured
`x:12 y:317.8 w:398 h:401` — a 398x401px rectangle of the visible map a mouse
cannot reach through.** The three missing tiles (screen `y` 368, 432, 496) all
fall inside that rectangle; the three that succeeded (`y` 176, 240, 304) sit
above it.

**This is not a new discovery.**
`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` already
measured the same panel blocking canvas tiles, at 900x600, and ruled explicitly:
*"This is a measurement and not a defect claim. The camera pans, so a small
window is not a hard limit on prison size. What it does bound is a single
gesture: a wall run or a room drag whose pointer leaves the canvas is not the
run the player drew."* This pass's contribution is narrow and stated as such:
the same mechanism reproduces at **1280x800**, one of the desktop viewports
this project treats as primary (not only at a cramped 900x600), and this pass
traced the exact cause (`elementsFromPoint`, not inference) rather than
measuring tiles-covered from outside.

**Fix, in the instrument, not the game**: `buildResilientCell` in the
`.playtest.ts` file now reads `.hud-minimap`'s live bounding rect right after
calibration and shifts the whole build rectangle right by however many tiles
clear it, before drawing anything. Every act after this fix built and zoned
its cell on the **first** attempt (previously: 12 failed zoning attempts, no
cell, no admissions, an empty roster — a total washout of act 1's first two
runs). The fix is committed in this branch's own history
(`0e474347`, `d9330b45`) with the diagnostic that found it kept in place.

**What this pass does not claim**: whether a *player* — who is not running a
scripted rectangle at fixed tile coordinates — routinely tries to build under
the minimap's fixed screen position, and how often. The prior record's
"the camera pans" answer is the reason this is not re-opened as a fresh product
finding here.

---

## §1 — A risk-tier badge says a bare word, and three of its four words are indistinguishable to a player

**The question the brief asked directly**: *"The roster is sorted by risk
tier, and a high-risk chip sits on the status strip. Does a player learn what
a tier means anywhere?"*

**MEASURED, act 1.** Six prisoners admitted into a fresh six-bed cell, one
guard hired, clock run to tick 4,544 (a few seconds of real intake processing).
The Regime tab's roster, read directly off the DOM:

```
roster rows on screen: [
  {"name":"Marta Jansen","activity":"Using Toilet","badgeText":"Low","badgeTitle":null,"riskTier":"1","classificationGroup":"general-population"},
  {"name":"Rafal Pereira","activity":"Using Toilet","badgeText":"Low","badgeTitle":null,"riskTier":"1","classificationGroup":"general-population"},
  {"name":"Petra Farkas","activity":"Using Toilet","badgeText":"Minimal","badgeTitle":null,"riskTier":"0","classificationGroup":"general-population"},
  {"name":"Delia Rossi","activity":"Using Toilet","badgeText":"Minimal","badgeTitle":null,"riskTier":"0","classificationGroup":"general-population"}
]
```

Every one of the four laid-out rows carries `badgeTitle: null` — no `title`
attribute at all. The panel's own full text confirms there is nothing else on
the row either:

```
Marta Jansen / Using Toilet / Sleep / Low
```

(`Sleep` here is the prisoner's lowest-met need, not part of the tier badge —
`hud-regime__roster-need`, a separate cell on the same line.)

### 1a. The badge has no accessible name anywhere, and this codebase has a mechanism for exactly this that the badge does not use

**VERIFIED, read.** The roster badge is built by `createStatusBadge`
(`src/ui/primitives/status-badge.ts:26-45`); its whole `update` function sets
`dataset['tone']`, `label.textContent` and an optional icon — no `title`, no
screen-reader text, nothing else. Compare `createStatChip`
(`src/ui/primitives/stat-chip.ts:44-93`), used for the status strip's own
chips: it carries a `setDescription` method whose own docblock states the
rule this codebase already follows elsewhere — *"the meaning never depends on
a tooltip: touch has no hover, and a hover-only label is an unreachable
label... written into the DOM as screen-reader text and into `title`, and
neither is the only copy."*

**MEASURED, act 3**, that this second mechanism is real and in active use: the
FUNDS chip's own accessible description, read straight off the assembled
page's `panelText('.hud-strip')` at a negative balance:

```
FUNDS | 55 left | 55 left before deliveries stop — past that, no materials can be
ordered until the state pays what it owes.
```

So the codebase's own pattern for "a number that needs a sentence to be
understood" exists, is wired up, and is on screen for money. The risk-tier
badge — four words a player cannot look up anywhere else in the game, arrived
at by a formula nowhere on screen — carries none of it.

### 1b. Two of the four words are unreachable by ordinary play, and nothing says so

**VERIFIED, read.** `src/main.ts:918`'s `ADMISSION_REQUEST` hard-codes
`priorIncidents: 0` for every admission the Intake panel's "Admit" button
sends — there is no control that lets a player set it. `classifyPrisoner`'s
screening draw at `priorIncidents: 0` can only reach tiers 0 and 1 (`Minimal`,
`Low`) — this is what
`docs/research/2026-08-30-what-a-classification-can-reach.md` already
established at length and is not re-derived here. Reaching tier 2 (`Medium`)
or tier 3 (`High`) requires `ClassificationReviewSystem`'s **24,000-tick**
re-review, which promotes a prisoner only after disciplinary infractions
accumulate against them — a process nothing in the Intake panel, the Regime
tab, or anywhere else on screen mentions exists.

**MEASURED across every act in this pass that admitted anyone** (34 admissions
total across acts 1, 2 and 4, all under 10,000 ticks — nowhere near the
24,000-tick review boundary): `prisonersHighRisk` read **0** in every
`simulation/status-counts` publication this pass observed, across three
separate prisons. The two words a player will actually see in an ordinary
session are `Minimal` and `Low` — exactly what act 1 shows above — and the
other two (`Medium`, `High`) are not merely rare, they require actively
neglecting a prisoner for a full in-game day or more, a fact this pass found
nowhere stated.

### 1c. The high-risk status-strip chip is unlabelled by its own design, read and confirmed rather than assumed

**MEASURED, act 1**, at the moment the roster above was read:

```
high-risk chip: {"value":"0","title":null,"srText":""}
```

**VERIFIED, read** — this is not an oversight of the same shape as 1a.
`src/ui/hud/projection.ts`'s `high-risk` chip descriptor sets `description:
undefined` deliberately, with its own long docblock's stated reason: *"nobody
has set the number at which [a count of high-risk prisoners] becomes [a
problem]... a permanent amber chip on a mature prison would be exactly the
status strip where several things are always amber."* That reasoning is about
the chip's **tone**, and it is sound on its own terms. It does not extend to
the chip's **word** carrying no explanation at all — the chip is captioned
`HIGH RISK`, a phrase with no definition anywhere else on screen, sitting one
tab away from a roster whose badges use unrelated vocabulary (`Minimal` /
`Low` / `Medium` / `High`) for the same underlying fact.

### 1d. What the "Today's blocks" section does say, and what it does not connect

**MEASURED, act 1**, at the same moment:

```
TODAY'S BLOCKS
General Population   22% THROUGH   Allows Recreation, Free Association, Hygiene
High Risk             72% THROUGH   Allows Recreation, Free Association
```

**A different playtest sample (a different act, or the same clock at a
different tick) showed a starker contrast**, quoted here because both are
real and the difference is instructive:

```
General Population   Allows Work, Education, Free Association
High Risk             Allows Sleep, Meal, Hygiene
```

So a player who reads this block *does* learn, indirectly, that
"General Population" and "High Risk" are two different regimes with different
permitted activities — this is the one place in the game that gives the
classification group any behavioural meaning at all, and it is real,
player-facing information. **What it does not do** is connect to the roster
one paragraph below it: the block names two *groups* (`General Population`,
`High Risk`); the roster badges name four *tiers* (`Minimal`, `Low`, `Medium`,
`High`). `classificationGroupIdForTier` (`src/simulation/prisoners/
classification.ts:58-60`) — **VERIFIED, read** — maps tiers 0, 1 and 2 all
onto `general-population` and only tier 3 onto `high-risk`, so a `Medium`
prisoner is, behaviourally, identical to a `Minimal` one, and the badge next
to their name gives no reason to think otherwise. Nothing on screen states
this collapse; a player would have to notice that three different roster
words never change which block above them applies.

**What would change this assessment**: reaching an actual `Medium`-tier
admission on screen (this pass never did — see 1b) and reading whether that
specific prisoner's row visibly participates in the `High Risk` block or the
`General Population` one. That is a further, cheap measurement this pass did
not take because no admission in any of its three built prisons ever reached
tier 2.

---

## §2 — Guard deployment, coverage and a contraband search: checked, and correct

**MEASURED, act 2.** A twelve-bed cell, twelve prisoners admitted, guards
hired one at a time, each state read off the Security tab's coverage block
before the next hire:

| guards hired | coverage summary | badge | tone | hint |
| --- | --- | --- | --- | --- |
| 0 (empty prison) | `0 of 0` | `Covered` | success | "This prison has the guards it asks for." |
| 0 (12 admitted) | `0 of 2` | `Unguarded` | danger | "Nobody is on duty. Hire 2 to cover this population." |
| 1 | `1 of 2` | `Understaffed` | warning | "Hire 1 more to cover this population." |
| 3 | `2 of 2` | `Covered` | success | "This prison has the guards it asks for." |

Every state, badge word and hint text matches `describeStaffCoverage`
(`src/ui/hud/staff-panel.ts:264-296`) exactly — this is the panel doing what
its own source says it should, read off the real screen rather than assumed
from the code. **The third hired guard does not move the summary past `2 of
2`**, because coverage counts posted guards against the requirement, not the
whole roster — a spare guard is deliberately outside what this block counts
([ADR 0048](../adr/0048-what-a-sectors-occupants-are.md)), and this pass's
read of it matches that intent rather than finding a discrepancy.

**What the brief asked to look for beyond the filed #740 (`Travelling`/
`Returning`, unmerged PR #781): whether the search mechanism is otherwise
invisible.** It is not, entirely. Once the spare (third) guard is claimed for
a search, the Held Guards fold — a real, laid-out panel a player can open —
reads:

```
held guards right after hiring: [{"label":"Guard · Sector Post","guard":"0"},{"label":"Guard · Sector Post","guard":"1"}]
tick 6095: [{"label":"Guard · Sector Post","guard":"0"},{"label":"Guard · Sector Post","guard":"1"},{"label":"Guard · Contraband Search","guard":"2"}]
```

`Guard · Contraband Search` is a real, authored sentence
(`guard-claim.search: 'Contraband Search'`,
`src/content/simulation-message-keys.ts:298`) that names exactly what the
third guard is doing and why it briefly leaves the roster of postable spares.
Coverage does not dip while this is happening — `2 of 2`, unchanged, matching
[ADR 0053](../adr/0053-who-may-stand-a-security-post.md)'s rule that a search
never claims a posted guard.

**And the find itself, read off the alerts log**:

```
tick 7440: "Contraband found: Currency. Day 4"
```

(the trailing `Warning` / `Clear this alert` in the raw log line are the row's
own tone label and dismiss control, concatenated by this pass's blunt
`textContent` read — not part of the sentence). This confirms #703 ruling 13's
sentence (`hud.alert.event.contraband.discovered`, `'Contraband found:
{item}.'`) on a real search, naming the real item (`Currency`), on the real
page.

**Checked and found correct**, all four: the coverage ladder's three states,
the search's visibility through Held Guards, the fact that a search does not
show as a coverage gap, and the contraband find's sentence.

---

## §3 — Hiring while broke on a fresh, unfurnished prison: the starter rung, checked at every layer, and correct

**The brief's question**: *"Payroll and insolvency reach the roster: hiring is
refused at the deliveries rung, and #785 landed a starter rung today for a
fresh unfurnished prison. Try to hire while broke and read the refusal."*

**MEASURED, act 3.** A fresh prison, never zoned (`roomCapacity: 0` the whole
act), spent down on plank purchases alone, one plank (65 minor units) at a
time near the boundary:

```
plank press 4: -1065 -> -1130 | refusal band: not laid out
[console] HostRefusalError: The last reported balance of -1130 cannot cover 65.
plank press 5: -1130 -> -1130 | refusal band: "Nothing was bought — deliveries are refused until the state pays what it owes."
```

`-1130 - 65 = -1195`, which is below `-1185` — the **starter** rung
(`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`,
`src/simulation/economy/treasury.ts:506-508`) — but *above* the ordinary
`-1250` rung a furnished prison would be judged against. The refusal fired at
exactly the shallower, starter-aware threshold, not the ordinary one.

**The FUNDS badge agrees with that same threshold, to the minor unit**:

```
funds chip/badge before the hire attempt: ... CONTRABAND | -1,130 | FUNDS | 55 left |
55 left before deliveries stop ...
```

`-1,130 - (-1,185) = 55` — the badge is reading the **starter** floor here,
not the ordinary `-1,250` one (which would have shown `120 left`). Then the
hire attempt, at the same balance:

```
[console] HostRefusalError: The last reported balance of -1130 cannot cover 80.
hire result: treasury -1130 -> -1130, staff=0
refusal band after the hire attempt: "Nobody was hired — hiring is refused until the state pays what it owes."
```

`-1130 - 80 = -1210`, again below `-1185`, again refused, again at the
starter-aware threshold.

**VERIFIED, read** — this consistency is not a coincidence of one run's
numbers; all three layers this pass could find read the *same* live signal.
The host's pre-flight (`src/main.ts:2537-2551` for purchases, `:2748-2757` for
hiring) computes `pressFloorMinorUnits(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
viewModel.counts.roomCapacity === 0)`; the kernel's own gate
(`src/simulation/runtime/session-commands.ts:375`) computes
`isFreshUnfurnishedPrison` from `roomInstances.totalResidentCapacity === 0`;
and the FUNDS badge (`src/ui/hud/projection.ts:504-508`) computes
`isFreshUnfurnishedPrison = counts.roomCapacity === 0` for the same
`deliveriesRungFloorMinorUnits` call the host's pre-flight uses. Three call
sites, one live boolean, and this pass's numbers show them agreeing rather
than the "control says yes and the worker says no some ticks later" failure
`src/ui/affordability.ts`'s own docblock names as the thing this whole module
exists to prevent.

**One correction to a fact this pass had assumed going in.** An earlier
research pass the same day
(`2026-09-01-what-the-funds-chip-promises.md`, §"D1"), played against
`v0.0.323`, quoted the hire refusal's host-side sentence as *"Nobody was
hired — that would go past what the state will carry."* This pass, against
`v0.0.341`, reads a different sentence for the same `HostRefusalError` path —
*"Nobody was hired — hiring is refused until the state pays what it owes."*
**Both are correct readings of their own commit.**
`src/content/default-locale-en.ts:1082-1083`'s own comment names the reason:
the owner's **ruling 23** of 2026-08-31 (*"Te same słowa co host"*) rewrote
`hud.refusal.hire-staff-past-floor` and `hud.refusal.purchase-materials-past-
floor` to say the same words the worker-side `insufficient-funds` sentences
already said, unifying what used to be two different sentences for one
underlying condition. That ruling landed the same day as both playtests; this
one simply ran later against the tree it had already reached. **Checked and
found correct** — the wording this pass read is the current, ruled-on
wording, not a drift from it.

---

## §4 — An incident that opens and resolves: the events band holds its terminal outcome, and a merged "all-clear" does not say which incident it clears

**The brief's question**: *"ADR 0084's dwell floor (600ms, severity
promotion) landed today in #778, so the events band now holds a terminal
outcome instead of losing it. Play an incident that resolves and see whether
a player can follow what happened."*

### 4a. A clean single incident, recorded live, and the dwell floor working exactly as designed

**MEASURED, act 4 (second run — see §4c for why a first run's recording is
discarded).** A 6x6 cell, two beds, fourteen admissions, zero guards. The band
recorder (`tests/browser/alert-dwell.ts`) was armed on `.hud__event` **before
the clock was ever started**, so no frame is missed:

```
recorder armed at tick 4251, before the clock has run at all
first incident opened: {"tick":4652,"type":"incidents.assault-opened"}
resolution event: {"tick":5261,"type":"incidents.all-clear"}
band recording: 434 frames over 18326ms, 197 writes, 3 spans
every span the band held, in order: [
  "147f \"\"",
  "177f \"A fight has broken out between two prisoners.\"",
  "110f \"The prison is under control again — no incident is still open.\""
]
```

Three clean states, in the right order, each held for a real, multi-frame
span rather than a single flicker: nothing, then the opening sentence for 177
frames, then the resolution sentence for 110 frames. The alerts log carries
the same two rows, permanently:

```
["A fight has broken out between two prisoners. Day 2WarningClear this alert",
 "The prison is under control again — no incident is still open. Day 3InfoClear this alert",
 ...]
```

**Checked and found correct.** For one incident opening and resolving on its
own, a player watching the screen sees the fight named, held on screen for a
real span, and then sees it end, held on screen for another real span — ADR
0084 decision 4's dwell floor doing exactly what it was built to do, on a real
`IncidentResponseSystem` resolution rather than a synthetic view model.

### 4b. Two incidents close together, and the "all-clear" that resulted never names either one

**MEASURED, act 4 (first run, kept for this finding — see §4c).** The same
recipe, a slightly earlier build, produced an assault **and** a riot close
together:

```
first incident opened: {"tick":5151,"type":"incidents.assault-opened"}
resolution event: {"tick":5762,"type":"incidents.all-clear"}
alerts log at the end: [
  "A fight has broken out between two prisoners. Day 3WarningClear this alert",
  "The prison is under control again — no incident is still open. 2× Day 4InfoClear this alert",
  "A riot has broken out — 14 prisoners have stopped taking orders. Day 3CriticalClear this alert",
  ...
]
```

Two distinct **opening** sentences, each naming its own incident by kind
(`A fight has broken out...`, `A riot has broken out — 14 prisoners have
stopped taking orders.`) — but **one merged row** for both resolutions,
`2× Day 4`, and the sentence it repeats — *"The prison is under control again
— no incident is still open."* — names no incident at all, by design.

**VERIFIED, read** — this is not a bug in the merging mechanism.
`src/content/default-locale-en.ts:335-346`'s own comment states the rule the
owner supplied on 2026-09-01: *"Two arrivals of one sentence on day 3 are one
row reading `2× Day 3`; two different sentences on day 3 are two rows, each
naming itself."* The merge is working exactly as specified — it merges
identical sentences, and `hud.alert.event.incidents.all-clear` has always
been one blanket sentence (`'The prison is under control again — no incident
is still open.'`, unparameterised) regardless of which incident just closed.
What this pass adds is a real instance where that pre-existing genericity has
a visible cost: a player who watched a fight *and* a riot both open cannot
tell, from the alerts log alone, whether the row that follows means "the
fight is over," "the riot is over," or both. The two **opening** sentences
are specific (`fight`, `riot — 14 prisoners...`); the one **closing** sentence
that answers them is not, and merging compounds rather than causes that.

**What would change this assessment**: whether the Incidents status-strip
chip, sampled at the moment the merged row appears, disambiguates by showing
`0` only once both incidents are actually closed (which would at least confirm
*something* closed) versus dropping to `0` after just one of two concurrent
incidents resolves while the sentence still claims none is open. This pass's
build never held two *simultaneously open* incidents long enough to sample
that distinction — the assault and the riot in this run did not overlap in
time by the evidence available (their events interleave in the alerts list
but this pass did not capture their individual open/resolve ticks, only the
first-opened and first-resolved pair its polling loop was watching).
**UNKNOWN**, and named as such rather than guessed.

### 4c. Why two different act-4 recordings are both kept, and neither is thrown away

The first run of act 4 armed the band recorder at a fixed tick (8,000),
carried over from a *different* recipe's measured assault time (13,250 ticks,
for a two-prisoner unguarded prison, per `staff-panel.ts`'s own comment). This
recipe — fourteen prisoners in two beds — ran hotter: its assault opened at
5,151 and resolved at 5,762, both **before** the recorder armed at 8,000. The
resulting recording was `110 frames, 1 span` — the band statically showing
the already-settled "all-clear" sentence the whole time, because
`alert-dwell.ts`'s own docblock is exact about this: *"There is no way to
recover a frame that has already gone by."* That recording could not, and
does not, support any dwell claim; it is not used for §4a. Its *alerts log*,
however, is a real, independent read of a real run (the assault-and-riot case
in §4b) and is kept for that.

The second run armed the recorder before the clock started at all, which
costs nothing (an armed recorder is inert until the band's content changes)
and produced the clean three-span recording §4a reports. Both runs are
reported rather than only the "good" one, because this branch's brief asks
for a sceptic-reproducible trail, and a discarded first attempt with its
reason for being discarded is part of that trail.

---

## What this pass checked and found correct, gathered in one place

- The Regime roster's sort order — descending risk tier, ties by ascending
  entity id — matches on screen: act 1's four rows read `Low, Low, Minimal,
  Minimal`, tier 1 before tier 0, in that order.
- The `high-risk` status-strip chip's lack of a badge or tone is a documented,
  reasoned decision (`src/ui/hud/projection.ts`'s own docblock), not an
  oversight — separate from §1c's finding, which is about the chip having no
  *description* at all, a narrower claim than "should have a badge."
- The staff coverage ladder's three states (`Unguarded` / `Understaffed` /
  `Covered`), their tones and their hint sentences (§2).
- A contraband search's visibility through the Held Guards fold, and that
  coverage does not falsely dip while a spare guard searches (§2).
- The contraband-found sentence naming the real item (§2).
- The starter rung's consistency across the host pre-flight, the kernel gate
  and the FUNDS badge, to the minor unit (§3).
- The current hire/purchase refusal wording matches the owner's ruling 23
  unification, confirmed still in force five days and many commits later
  (§3).
- ADR 0084 decision 4's dwell floor, on a real single incident (§4a).

## What this pass did not reach

- **A `Medium` or `High` tier admission on screen.** Every prison this pass
  built stayed under the 24,000-tick review boundary, so §1's claim that a
  `Medium` roster badge is behaviourally indistinguishable from a `Minimal`
  one is REASONED from `classificationGroupIdForTier`'s code, not watched on a
  live roster row. A run that neglects one cell for a full in-game day or more
  and reads the roster at that point would settle it directly.
- **Whether two incidents can be simultaneously open long enough for a player
  to see both open before either resolves**, and what the Incidents chip and
  alerts log do in that window specifically (§4b's named UNKNOWN).
- **Touch and keyboard.** Mouse only, desktop viewport only, per this
  branch's brief.
- **PR #781 / issue #740's `Travelling`/`Returning` deployment states.**
  Deliberately not re-investigated — filed already, and the brief says not to.
- **Guard search cadence and cost** beyond the one find this pass watched —
  how often a spare guard is claimed, for how long, against how many guards.
  `ADR 0073` already prices this as an open measurement question and this pass
  does not add to it.
