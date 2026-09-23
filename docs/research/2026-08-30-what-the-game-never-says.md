# Playtest: what does Lockstate require the player to know, that it never tells them?

Recorded 2026-08-30 against `origin/main` at **`e5f597f` (v0.0.230)**, in a real
Chromium at 1440x900, driving the assembled page (`index.html` + `src/main.ts`)
through a `Worker` tee — not a harness page. The script is
`tests/browser/playtest-hidden-requirements.playtest.ts` and it **is in this
tree**, collected by `tests/browser/playwright.playtest.config.ts`, which
nothing in CI runs. The build stamps its own commit into the HUD, so every dump
below carries `v0.0.230 · e5f597f` as its first three lines.

Two runs, both pasted from:

- **Run 1**, the three acts as first written. `3 passed (10.0m)`.
- **Run 2**, the same three acts with two probes added — `visibleText` (§7) and
  the Staff panel's fold state. `3 passed (13.3m)`. **No change under `src/`
  between them**, and none at all: the branch this was played on changes
  `tests/browser/` and `docs/` only.

Running twice was not redundancy. §8 records a finding that Run 1 supported and
Run 2 refuted, and it is kept for that reason.

**`main` moved while this was being written**, to `dac0077` (v0.0.231), which
is #626's *"An occupied place already means a bed that exists — pin it, and
publish the count"* plus its release bump. It touches
`src/simulation/economy/income.ts`, `status-strip-projection.ts` and
`protocol/types.ts`; it adds no reader in `src/ui/`, changes no surface named in
Part A, and every `file:line` below is read at `e5f597f`.

The brief is [#629](https://github.com/matmaxalez/lockstate/issues/629), the
owner's standing directive stated in their own words after hitting #627 live:

> gra ma być łatwa przyjazna do grania, a nie jakieś ukryte funkcje jak tu, że
> trzeba zamawiać materiał budowlany
>
> *(the game is to be easy and friendly to play, not hidden mechanics like this
> one, where you have to order building material)*

so the acceptance test applied at every observation point below is **not**
"is the information present somewhere" — #627 settled that it is not enough —
but:

> would a player who has never read the code get through this without being
> told?

**A caveat on freshness, stated first.** Another agent is changing material
procurement (`src/simulation/construction/**`) as this is written. Everything
below was measured at `e5f597f`. **§1 buys bricks and places wall orders, so it
is the one part of this record that would need re-measuring after that lands**;
§2 and §4 touch neither, and the last bullet of *What this pass did not reach*
says so again where a reader looking for limits will find it.

## Claim tiers

`docs/research/README.md` labels every claim VERIFIED / SEARCH-SUMMARY / FROM
MEMORY / UNKNOWN. Everything here is **VERIFIED**, meaning one of exactly two
first-party things: a number or a sentence pasted verbatim from Run 1 or Run 2,
or a `file:line` in this repository that was opened and read. **SEARCH-SUMMARY
and FROM MEMORY do not occur.** Five **UNKNOWN**s are marked inline — at
§1, §2, §4 and twice in *What this pass did not reach* — each with what would
settle it.

---

# Part A — findings, ranked by how early a new player meets them

## 1. The clock starts stopped, and no word on screen says so — second 0

**This is the earliest wall in the game: it is on screen before any tab is
pressed, and it survives the entire first prison.**

**VERIFIED, read.** A new session's clock is constructed paused
(`src/simulation/worker/state-machine.ts:216`,
`new FixedStepClock(50, { mode: 'paused' })`) and nothing in `src/` starts it —
[ADR 0051](../adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
established that and it is unchanged: *"the only caller of
`SimulationCommandSender.setClock` is the `set-clock` intent branch … which runs
when the player presses a transport control."*

A command submitted against a paused clock is **dispatched immediately** — the
behaviour ADR 0051 proposed, and which `src/main.ts:2432-2435` records as
shipped in a comment beginning *"**That is no longer why**: since ADR 0051 the
worker dispatches a due command as soon as it is submitted against a paused
clock"*. **That ADR's own Status line still reads "Proposed, 2026-08-28. Not
self-approved."**, so what is cited here is the code and the measurement, not an
accepted decision. So the game answers every press. Only time does not pass.

### What the player did, and what it cost

Run 2, Act 1: the *informed* material route — buy first, then build, the order
`buildAndPopulate` hard-codes and the one #625 proved works — with exactly one
thing changed: **the transport was never touched.**

```
clock on arrival, from the worker: null
tick on arrival: -1
counts on arrival: {"tick":0, …,"treasuryMinorUnits":25000,…}
calibration: tile (0,0) top-left = (-304, -574)
after buying 60 bricks, funds = 22600 at tick -1
ACT 1d: 24 wall orders placed, clock still never touched
```

Then four observations, fifteen seconds of real time apart:

```
ACT 1e.1 — waiting, tick -1
ACT 1e.2 — waiting, tick -1
ACT 1e.3 — waiting, tick -1
ACT 1e.4 — waiting, tick -1
queue verbatim: "QUEUED\n24 waiting · 0 being built"
deliveries verbatim: "ON THE WAY\n1 bought · 2,400 back if cancelled\n60 × Brick · 2,400 back\nCancel"
counts: {"tick":0,…,"treasuryMinorUnits":22600,…}
```

**2,400 left the treasury for sixty bricks that can never arrive**, and the
panel says they are *on the way*. Twenty-four wall orders stand at
`24 waiting · 0 being built` for as long as the player waits.

Then one press:

```
tick before Play -1, tick 2s after Play 56
clock after Play: {"mode":"running","speed":1}
ACT 1h: the queue drained at tick 428
```

### What the screen said the whole time

**VERIFIED, Run 2**, printing the whole `.hud` with every `.ui-sr-only` span
dropped — see §7 for why that correction had to be made. This is the complete
clock readout on arrival:

```
Day
1
0%
×1
```

That is all of it. Three icon buttons sit beside it with no visible text.

- **No word for "paused", "stopped" or "not running" is on screen at any point
  in Act 1.** `/stopped/i` is `false` at every observation, in both the
  laid-out and the sighted-readable text.
- **`×1` is the whole speed readout, and it says `×1` while the clock is
  stopped.** `speed.textContent = \`×${…viewModel.clock.speed}\``
  (`src/ui/hud/status-strip.ts:237`) is written from the speed alone; the mode
  is not consulted. Measured: `data-clock-mode=paused | speed readout="×1"` at
  ACT 1b, 1c and every 1e; `data-clock-mode=running | speed readout="×1"` two
  seconds after Play. **The two states print the same three characters.**
- **The one cue that does exist is a colour on a 44px icon.**
  `transportPressedStates` maps `paused` to a pressed Pause button
  (`src/ui/hud/projection.ts:102-106`) and `status-strip.ts:241-243` sets it;
  the only styling behind it is
  `.ui-icon-button[aria-pressed='true'] { color: var(--accent); background: var(--accent-soft); … }`
  (`src/ui/primitives/primitives.css:313-317`). Measured:
  `[{"label":"Pause","pressed":"true",…},{"label":"Play at normal speed","pressed":"false",…},…]`.
- **`data-clock-mode` is written and read by nothing.**

  ```
  $ git grep -n "clock-mode\|clockMode" -- src/
  src/ui/hud/status-strip.ts:244:    root.dataset['clockMode'] = viewModel.clock.mode;
  $ grep -rn "clock-mode" --include=*.css src public
  (no matches)
  ```

  ADR 0051's *"The interface says so"* cites that attribute as one of three
  ways the UI reports the pause. It is the one of the three that reaches
  nobody, and the ADR is not wrong about the other two — it is narrower than it
  reads, because a stamped attribute with no reader is not a statement to a
  player.

### The sentence that would have said it has had no renderer since 2026-08-23

**VERIFIED, read and dated.** The shipped locale contains exactly the sentence
this situation needs:

```
'hud.build.note': 'An order is queued now and built while the clock runs.'
```

(`src/content/default-locale-en.ts:483`). It is declared in `HUD_MESSAGE_KEY`
as `buildNote` (`src/ui/hud/messages.ts:131`). **Nothing renders it:**

```
$ git grep -n "buildNote\|hud\.build\.note"
src/content/default-locale-en.ts:483:  'hud.build.note': 'An order is queued now and built while the clock runs.',
src/ui/hud/messages.ts:131:  buildNote: 'hud.build.note',
```

and it is `0` occurrences in every HUD dump of both runs:

```
$ grep -c "An order is queued now and built while the clock runs" run-full.log
0
```

**When it stopped being rendered is checkable.** `git log -S` gives one commit
that removed a use, `67e366e`, *"Point at the world to build, instead of
dialling in a coordinate (#74)"*, 2026-08-23, which deleted the Build panel's
footer:

```
-  const footer = element('div', {
-    className: 'hud-build__footer',
-    children: [submit.element, eyebrowText(t(HUD_MESSAGE_KEY.buildNote), 'hud-build__note')],
-  });
```

That change was about replacing coordinate entry with pointing, and the note
went with the footer it happened to live in. `tests/unit/ui-hud-messages.test.ts`
gates that every `HUD_MESSAGE_KEY` **resolves**, not that anything renders it,
so an orphan key passes.

### Why this is the #629 class rather than "the player will work it out"

Three properties, each measured above, compose:

1. **Every press answers.** Money moves, the delivery block lists the purchase,
   the queue block counts the orders, and a zone-first `ZoneRoom` is refused in
   the band exactly as it is with the clock running. Nothing reads as broken.
2. **The readout is identical to #627's.** A paused prison's Build panel says
   `24 waiting · 0 being built`. #625's brick-shortage stall says
   `12 waiting · 0 being built`. `{count} waiting · {started} being built`
   (`src/content/default-locale-en.ts:558`) cannot distinguish *no materials*,
   *no crew* and *no clock* — so the player who diagnoses one of the three has
   learned nothing about the other two.
3. **The delivery block is a promise the pause does not keep.** *"ON THE WAY …
   60 × Brick"* stood unchanged across four observations and 2,400 was already
   spent. That is the shape `AGENTS.md` reserves to the owner from the other
   direction, and it is named here rather than acted on.

ADR 0051's own Consequences flagged the money half in advance — *"Money moves
while the clock is stopped … it is the part of this decision most likely to
want a second look"*. This record is that second look, with the figure:
**2,400 of 25,000, at second zero, for goods that cannot arrive.**

**UNKNOWN: what the map looks like while paused.** ADR 0051's decision says the
wall *"appears immediately as a ghost"*, and `structuresFromConstruction` maps
`approved` to `planned` (`src/rendering/world/structures.ts:24-39`). This pass
read text and never pixels. What would settle it: the frame-hash method
`2026-08-29-playtest-ordering-and-the-second-room.md` §7 used — in a worktree
where `git lfs checkout` has been run, because otherwise every actor sprite
fails to decode and the run passes anyway (`docs/AGENT_WORKFLOW.md` §2). It was
run here, so this tree could do it.

## 2. A guard's wage is charged every day, and nothing on screen ever names a recurring cost — minute one

**Second-earliest: the Security tab is one press from arrival and needs no
prison, no room and no prisoner.**

**VERIFIED, read.** A hire charges one day of the role's `wageBand.minPerDay`
as an engagement fee — `staffHireCostMinorUnits` delegates straight to
`staffDailyWageMinorUnits` (`src/simulation/staff/hiring.ts:121-126`), which
reads `role.wageBand.minPerDay` (`src/simulation/economy/wages.ts`,
`staffDailyWageForRole`). A Guard's band is
`{ minPerDay: 80, maxPerDay: 140 }` (`src/content/staff-role-catalog.ts:150`).
`PayrollSystem` then bills **the same figure again at every in-game day
boundary** for as long as that employee is on the roster
(`src/simulation/economy/payroll.ts:154`, `:168` order 130, `:170`
`schedule = { intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 }`).

### What the panel offers before the press

**VERIFIED, Run 2, Act 2a**, the whole Staff panel verbatim with nothing hired:

```
"STAFF\nGUARD COVERAGE\n0 of 0\nCovered\nThis prison has the guards it asks for.
\nWHO TO HIRE\nGuard\nSelected\nHire Guard · 80\nTaken from the treasury on hire.
 A new guard starts unassigned.\nON DUTY\n0 held · 0 free\nNobody is assigned right now.
\nA released guard stays hired and goes back to the pool."
hire control reads: "Hire Guard · 80"
the roles the panel offers: [{"id":"staff-role.guard","text":"Guard | Selected"}]
```

`Hire {role} · {total}` and *"Taken from the treasury **on hire**. A new guard
starts unassigned."* (`src/content/default-locale-en.ts:659-660`). Both
sentences are true and both describe a **one-off**. Nothing on the panel, the
strip or anywhere else says the 80 comes back tomorrow.

### What it actually costs

**VERIFIED, Run 2, Act 2**, one guard, then two in-game day boundaries:

```
counts after one hire:   {…,"treasuryMinorUnits":24920,"dailyWageBillMinorUnits":80,"unpaidWagesMinorUnits":0,"staff":1}
counts after payday 1:   {…,"treasuryMinorUnits":24840,"dailyWageBillMinorUnits":80,"unpaidWagesMinorUnits":0,"staff":1}
counts after payday 2:   {…,"treasuryMinorUnits":24760,"dailyWageBillMinorUnits":80,"unpaidWagesMinorUnits":0,"staff":1}
```

25,000 → 24,920 on the press, then −80 and −80 again. The word survey against
the whole HUD at each of those three moments:

```
--- /wage/i    — laid out: false | readable by a sighted player: false
--- /per day/i — laid out: false | readable by a sighted player: false
--- /daily/i   — laid out: false | readable by a sighted player: false
```

**The counter exists and crosses the protocol.** `dailyWageBillMinorUnits` is
projected at
`src/simulation/presentation/status-strip-projection.ts:530` and typed at
`src/simulation/protocol/types.ts:317`; the harness reads it off
`simulation/status-counts` in every line above. **No module under `src/ui/`
reads it:**

```
$ git grep -n "dailyWageBill" -- src/ui/
(no matches)
$ git grep -ln "dailyWageBill" -- src/
src/simulation/economy/index.ts
src/simulation/economy/payroll.ts
src/simulation/economy/wages.ts
src/simulation/presentation/status-strip-projection.ts
src/simulation/protocol/types.ts
```

That is [#538](https://github.com/matmaxalez/lockstate/issues/538)'s
"crosses the protocol, no reader in `src/ui/`" table, still true for this field
at `e5f597f`, and this record adds what it costs a player rather than
re-stating the shape.

**The code says so about itself, which is the strongest single citation here.**
`src/content/default-locale-en.ts:138-155`, verbatim:

> There is still no payroll or running-cost key, and no rate, budget or
> forecast key — but **the reason has changed** … Since ADR 0042 step 3
> something does: `PayrollSystem` bills every employee's wage at the end of
> every in-game day, and `simulation/status-counts` carries both what that
> costs and what has gone unpaid. **What is missing is the *panel*.**

And `payroll.ts:80-82` says *"a hire is a standing cost rather than a one-off,
and the Funds readout says so before anything goes wrong."* Narrowed by
measurement: the Funds readout says `24,840`. It states a balance, and a
balance falling by 80 a day beside an `Earned today` of 0 is a subtraction the
player has to perform, from two numbers taken a day apart, with nothing naming
the term.

### The one sentence in the game that implies an ongoing wage is inside a fold that starts shut

**This is #627's exact shape, found a second time, and it is the reason §2 is a
#629 defect rather than a missing feature.**

**VERIFIED, Run 2 and read.** The Staff panel's roster section is created
`collapsed: true` (`src/ui/hud/staff-panel.ts:713-717`) and is passed **no
`trailing` badge**. With one guard hired:

```
ON THE PAYROLL fold after one hire:
  {"present":true,"hidden":false,"collapsed":"true","headerText":"ON THE PAYROLL",
   "headerAriaExpanded":"false","bodyHidden":true,
   "bodyText":"Guard · UnassignedDismissDismissDismissA dismissed staff member leaves
               the prison for good, and their wage stops.","rowCount":1}
```

and the whole visible Staff panel then ends
`"…goes back to the pool.\nON THE PAYROLL"` — a header, and nothing under it.

Pressed open by hand:

```
ON THE PAYROLL unfolded by hand:
  {…,"collapsed":"false","headerAriaExpanded":"true","bodyHidden":false,…}
--- /wage/i — laid out: true | readable by a sighted player: true
```

and the sentence that turns it true is
`hud.security.roster-hint` (`src/content/default-locale-en.ts:697`):

> A dismissed staff member leaves the prison for good, and **their wage stops**.

**That is the only place in the shipped interface where a wage is implied to be
a thing that continues.** It is a hint about *dismissal*, it names no figure and
no cadence, and it is behind a fold nothing opens — which is #627's
*"Awaiting Materials"* — `src/content/simulation-message-keys.ts:472`, inside
the Build panel's shut queue fold — restated on a different panel. The panel's own
authoring comment already knew the mechanism, at
`src/content/default-locale-en.ts:688-693`: *"`hud.security.hire-hint` two
blocks up already told them the wage is taken on hire, and `PayrollSystem` goes
on taking it every in-game day until this control is pressed."* The player is
not told the second half of that sentence anywhere.

**The contrast that makes it a defect rather than a taste question is inside
this repository**, exactly as #569 argued it for Alerts: the Build panel's queue
section is *also* `collapsed: true` and passes `trailing: queueCount`
(`src/ui/hud/build-panel.ts:1555-1561`), which is why its shut header still
reads `24 waiting · 0 being built`. Two folds, one intent apart, and only one of
them says anything while shut.

Opened, the rows read `{name} · {claim}` — `Guard · Unassigned` — through
`formatStaffRosterText` (`src/ui/hud/staff-panel.ts:319-327`), reusing
`hud.security.held-row`. **No row carries a wage.**

### And the panel actively reassures while the payroll empties the treasury

**VERIFIED, Run 1, Act 2e-2g.** Sixty guards, no prison, no prisoners.
Run 1 is quoted here rather than Run 2 because its descent is the clean one —
all sixty hires landed inside one in-game day, so every step below is exactly
one day's bill. Run 2 reproduced the same end state from a different starting
balance, because how many paydays elapse while a player makes fifty-nine
presses is a function of real time and not of the game:

```
ACT 2e after the mass hire: {…,"treasuryMinorUnits":14760,"dailyWageBillMinorUnits":4800,"staff":60}
ACT 2f day boundary near tick 12000: funds=9960 bill=4800 unpaid=0 staff=60
ACT 2f day boundary near tick 14400: funds=5160 bill=4800 unpaid=0 staff=60
ACT 2f day boundary near tick 16800: funds=360  bill=4800 unpaid=0 staff=60
ACT 2f day boundary near tick 19200: funds=0    bill=4800 unpaid=4440 staff=60
```

Four in-game days of visible approach to insolvency, in 4,800 steps. And on
every one of them the Staff panel — the panel that owns the control that caused
it — reads:

```
GUARD COVERAGE
0 of 0
Covered
This prison has the guards it asks for.
```

That sentence is true about coverage and is the only verdict on staffing the
game offers. Opened by hand at the moment of insolvency, the payroll block adds
nothing to it (Run 2):

```
ON THE PAYROLL fold at the unpaid payday:
  {…,"collapsed":"false","bodyHidden":false,"rowCount":3,
   "bodyText":"Guard · UnassignedDismissGuard · UnassignedDismissGuard · Unassigned
               Dismissand 57 moreA dismissed staff member leaves the prison for good,
               and their wage stops."}
```

Three rows, an "and 57 more" line, and no figure.

**UNKNOWN: whether a player reads *"This prison has the guards it asks for"* as
a verdict on the whole staffing decision.** What would settle it: an observed session; nothing in this
repository can supply one.

## 3. What a paused clock and a brick shortage have in common — a ranking note, not a fourth finding

Findings 1 and 2 are both instances of one shape that #627 named and this pass
found twice more, so it is stated once:

| the state | what the game shows | what it does not show |
| --- | --- | --- |
| no bricks (#627) | `12 waiting · 0 being built`, funds healthy | that a wall needs two bricks |
| clock paused (§1) | `24 waiting · 0 being built`, funds *fell* | that the clock is stopped |
| sixty guards (§2) | funds falling 4,800 a day | that a hire recurs |

In all three the number on screen is *correct*, and in all three the quantity
the player needs is one the simulation computes and no surface renders.

---

# Part B — candidates that are FINE, with the evidence

These are complete results. They exist so nobody re-checks them.

## 4. Intake: #538's "nothing says so" no longer holds at `e5f597f`

[#538](https://github.com/matmaxalez/lockstate/issues/538) reports that a full
prison keeps accepting prisoners it cannot house **and that nothing says so**.
Played: one 6x6 cell, **one** bed, one toilet, four admissions.

**The first half reproduces exactly. The second half is refuted.** Both runs
produced identical figures at every one of the four presses; Run 2 is quoted.

```
ACT 3b admission 1: disabled-before=null prisoners=1 inIntake=0 occupants=1 accommodationCapacity=1
ACT 3b admission 2: disabled-before=null prisoners=2 inIntake=1 occupants=1 accommodationCapacity=1
ACT 3b admission 3: disabled-before=null prisoners=3 inIntake=2 occupants=1 accommodationCapacity=1
ACT 3b admission 4: disabled-before=null prisoners=4 inIntake=3 occupants=1 accommodationCapacity=1
```

The Admit control is never disabled and never refuses — #538's mechanism,
unchanged. But the Intake panel says so, on the Overview tab, unfolded, with no
press required:

```
.hud-intake now: "INTAKE\nCollapse\nAdmit a prisoner\n3 waiting with no bed to sleep in\n
 A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival
 with none waits until a bed is free.\nIN INTAKE\n3 of 4\n3 at Cell Assignment"
no-place attribute: 3
```

That is `hud.intake.no-place` — *"{count} waiting with no bed to sleep in"*
(`src/content/default-locale-en.ts:635`) — and the pipeline block beneath it.
The count tracked the population on every one of the four presses (`1`, `2`,
`3` after admissions two, three and four) and was still correct an in-game day
later:

```
.hud-intake a day later: "…3 waiting with no bed to sleep in…IN INTAKE\n3 of 4\n3 at Cell Assignment"
counts a day later: {…,"prisoners":4,"prisonersInIntake":3,"roomOccupants":1,…}
```

and it is on screen rather than merely in the DOM — the sighted-text walk at
that moment carries `3 waiting with no bed to sleep in` and
`In intake / 3 of 4 / 3 at Cell Assignment` verbatim.

**What #538 asks for beyond this is a remedy, and the locale deliberately does
not give one** — its own comment says the line *"states the prison's condition
and promises no remedy"* (`src/content/default-locale-en.ts:629-634`). Under #629 that is
the right side of the line: the requirement is not hidden. Whether the *remedy*
should be named is a copy decision and therefore the owner's.

**#538 should be re-read against this measurement rather than closed on it**:
its `accommodationBacklogTicks` half was not re-tested here, and a prisoner
whose *preferred* room type exists and is full — its actual reproduction, with
`room.solitary-cell` — is a different state from four arrivals sharing one bed.
**UNKNOWN**, and what would settle it: replay #538's own seven-room prison.

## 5. An unpayable payday is legible, at full width, the moment it happens

**VERIFIED, both runs, Act 2g**, at the first payday the prison could not meet:

```
Run 1  --- .hud__event: {"present":true,"hidden":false,"severity":"warning",
                         "box":{"w":1440,"h":32,"x":0,"y":48},
                         "text":"Payday went unpaid — your staff are owed 4440."}
Run 2  --- .hud__event: {"present":true,"hidden":false,"severity":"warning",
                         "box":{"w":1440,"h":32,"x":0,"y":48},
                         "text":"Payday went unpaid — your staff are owed 3720."}
--- /payroll/i — laid out: true  | readable by a sighted player: true
--- /owed/i    — laid out: true  | readable by a sighted player: true
```

A full-width 32px band in the fourth grid row, `role="status"`, tone `warning`,
outside every fold — `src/ui/hud/hud.ts:1002-1013`, and the reasoning that put
it there rather than in the alerts list is the one #569 wanted:
*"The alerts section starts folded … so a row appended to that list is a 0x0
box at every viewport until somebody opens it."*

**This one is fine and it is worth saying why it is fine**: it is the fix for
the class, already applied, once. The gap §2 records is not that the failure is
silent — it is that the four in-game days of visible approach were.

## 6. Three smaller candidates from the brief, each answered

- **"Does a room type have to be enclosed, and is that discoverable before the
  refusal?"** Yes, and already recorded: the Rooms panel prints
  `NEEDS AT LEAST 2 × 3 TILES / MUST BE ENCLOSED / NEEDS 1 × BED / NEEDS 1 × TOILET`
  before Designate is pressed, re-measured here at ACT 3d
  (`.hud-rooms a day later: "…NEEDS AT LEAST 2 × 3 TILES\nMUST BE ENCLOSED\nNEEDS 1 × BED\nNEEDS 1 × TOILET\nENCLOSURE\nWalled in on every side"`).
  The known caveat is #625's and is not re-derived: the panel folds itself after
  a **refused** press, so that block shuts at the moment it becomes relevant
  (`src/ui/hud/rooms-panel.ts:513`).
- **"Does anything say a cell needs a bed before the player zones a bedless
  cell?"** Yes — the same `NEEDS 1 × BED` line, before the press; and the
  Intake hint on the arrival screen says it in a sentence:
  *"A prison needs a cell before it can admit anyone. It does not need a free
  bed: an arrival with none waits until a bed is free."* Measured on arrival in
  both runs.
- **"Is guard coverage legible?"** Yes. With four prisoners and no guards the
  status strip carried `0 COVERAGE / 0 understaffed · 4 unguarded`
  (Run 2, ACT 3d) and the Staff panel carries
  `hud.security.coverage-short-hint` — *"Hire {count} more to cover this
  population."* This is the counter-example that makes §2 sharp: the same panel
  states a staffing **requirement** clearly and states the **cost** of meeting
  it not at all.

---

# Part C — observations whose cause or impact is not established

Stated separately, per `docs/AGENT_WORKFLOW.md` §3: *"a measurement is not a
diagnosis, and neither is a cause an impact."*

## 7. This pass's own instrumentation was wrong once, and it is recorded rather than corrected away

Run 1's word survey reported, at every observation point in Act 1:

```
--- /paus/i anywhere in the visible HUD? true
```

Read alone that says *the game tells the player it is paused*, and it is an
artifact. `createIconButton` puts its label in a `screenReaderText` span
(`src/ui/primitives/icon-button.ts:31`), which is
`element('span', { className: 'ui-sr-only', text })`
(`src/ui/primitives/dom.ts:60-62`), and `.ui-sr-only` is clipped rather than
removed — so `Pause`, `Play at normal speed`, `Fast forward` and `Speed 1x` are
all in `innerText` and **none of them is on screen**.

Run 2 walks the live DOM's text nodes, drops any whose parent is inside
`.ui-sr-only` or has no client rects, and reports both figures:

```
--- /paus/i — laid out: true | readable by a sighted player: false
```

It is written into the script and into this record because it is #625 §6's
failure one size along, and that record's sentence covers it exactly: **a survey
answers about the probe until the file is opened.**

## 8. A riot is legible while it is live — and this pass read it wrong from one run

Not part of the brief; measured on the way past, and kept because **the first
reading of it was wrong and the second run is what corrected it.** Four
prisoners were admitted into one bed with no guards; an assault and a riot both
opened.

**Run 1 sampled a day later, after the riot had closed**, and showed:

```
--- .hud__event: {…,"severity":"info","text":"The prison is under control again — no incident is still open."}
Incidents chip (visible text): "0 / Incidents / Clear"
ALERTS fold a day later: {"sectionCollapsed":"true","listChildCount":5,
 "listText":"A fight has broken out between two prisoners.Warning
  The prison is under control again — no incident is still open.Info
  A riot has broken out — 4 prisoners have stopped taking orders.Critical
  The prison is under control again — no incident is still open.Info
  Nothing was removed — …Warning"}
```

From that alone the draft of this section read *"a riot happened and the band
that reported it had already moved on"*, which is a claim about the interface.
**Run 2 falsifies it.** Its sample landed while the riot was open:

```
--- .hud__event: {"present":true,"hidden":false,"severity":"danger",
                  "box":{"w":1440,"h":32,"x":0,"y":80},
                  "text":"A riot has broken out — 4 prisoners have stopped taking orders."}
```

and the visible strip at that moment read:

```
1
Incidents
Riot
```

So a live riot is a `danger`-toned full-width band **and** a chip whose badge
names it — the two channels §5 credits for the unpaid payday, working here too.
What Run 1 measured was a sample taken after the incident closed, which is the
interface being *correct*, not silent. The alerts list keeps both rows either
way, behind a fold that starts shut.

**What survives as a real observation, and it is not a defect claim:** the riot
arrived in a beginner-shaped prison — four prisoners, one bed, no guards, day
four — and the only forewarning was the strip's `0 understaffed · 4 unguarded`,
which is ADR 0078's ladder saying exactly the right thing. Whether that is
enough forewarning is a product question and no impact is claimed here.

**The method note is the point of keeping this section.** One run produced a
plausible interface criticism; the second run, differing only in when it
sampled, refuted it. `docs/AGENT_WORKFLOW.md` §3's *"a measurement is not a
diagnosis"* is what that is, and it was caught by running twice rather than by
being careful.

## 9. Two harness facts worth not re-deriving

- **While the clock is paused the worker publishes no `simulation/clock-state`
  at all**, so `currentTick()` answers `-1` and `currentClock()` answers `null`
  for the whole of Act 1 — not a frozen harness. `onTickLoop` is the only
  caller of `publishClockState` and the loop runs only in the `running` state
  (ADR 0051's own reading of `state-machine.ts:273-292` and `:308-310`,
  re-confirmed here by the `-1`s).
- **The camera calibration rule holds again**, measured rather than assumed:
  `tile (0,0) top-left = (-304, -574)` at 1440x900 in all three acts of both
  runs, which is `(viewportW/2 − 1024, viewportH/2 − 1024)`.

---

# Part D — what is owed, and to whom

**Nothing here is proposed as a code change by this pass, and the reason is a
rule rather than a judgement.** `AGENTS.md` reserves *"anything that reaches a
player as a promise the code does not keep"* to the owner, and #629 states the
mirror of it explicitly: *"Not licence to invent copy. New player-facing strings
remain the owner's alone. The rule tells you **that** something must reach the
player, never **what words**."*

So: what is owed, where it would go, and what already exists to hang it on.

| # | what the player is never told | where a statement would go | what already exists there |
| --- | --- | --- | --- |
| 1 | that the clock is stopped | the clock group in `.hud-strip` (`status-strip.ts:141-150`), beside `Day 1 / 0% / ×1` | `data-clock-mode` is already stamped on the strip and read by nothing — a CSS rule or a word could use it with no new plumbing |
| 1b | that building needs the clock to run | the Build panel | **the sentence already exists and is unrendered**: `hud.build.note`, *"An order is queued now and built while the clock runs."* Restoring a renderer for it is not new copy |
| 2 | that a hire recurs every day | `hud.security.hire-hint`, which today says *"Taken from the treasury on hire."* | one existing key, one sentence |
| 2b | what the standing payroll is | the `ON THE PAYROLL` fold's shut header | `createCollapsibleSection` takes a `trailing` badge and the Build panel's queue already uses one — the mechanism needs no new string, only a figure, and `dailyWageBillMinorUnits` is already on the wire |

Item 1b is the cheapest and is worth stating plainly: **one of the four is a
string this repository already ships and has not rendered since 2026-08-23.**
Whether it should come back, and where, is still the owner's — a note in a
panel that no longer has a footer is a placement decision, not a restoration.

---

# Weakest claim, and the cheapest thing that would falsify it

**Weakest: that §1 is a wall a real player hits, rather than one this playtest
built by refusing to press a button it could see.** What is measured is that the
game answers every press while stopped, spends money, promises a delivery, and
prints no word for "paused" — not that a person fails to press Play. A player
who has ever used a management sim presses Play in the first ten seconds.

**#569 named its weakest claim and was still wrong, and its retraction says why:
naming a weak claim is not testing it.** So the test is stated, and it is
cheap:

> **Show a first-time player the arrival screen and ask them to build a cell,
> without saying the word "clock". Time how long the treasury sits at a
> spent-but-undelivered balance before they press a transport control.** Under
> ten seconds → §1 is a legibility note about `×1` and the unrendered
> `hud.build.note`, not a wall. Longer, or a question about why nothing is
> happening → §1 is #627's symptom with a second cause, and the two are
> indistinguishable from the queue header.

**A cheaper half-test was drafted here and it does not work, so it is written
down as refuted rather than deleted.** The draft said: #627 reports `40 waiting ·
0 being built` with *"FUNDS 25,000 — untouched"*, and §1's paused prison shows a
treasury that has *fallen*, so untouched funds would prove the clock was
running. **That inference is invalid.** #627's player had bought nothing — their
own words are *"where am I supposed to buy these things?"* — and a treasury
nobody has spent from reads 25,000 whether the clock is running or stopped. The
transcript does not discriminate.

What follows from that, and it matters for how §1 is filed: **§1 does not
compete with #627 and does not weaken it.** #627's player was never told they
needed to buy, which is true independently of the clock. §1 is a *second* cause
of the same queue header, and the only thing the two share is that the header
cannot tell them apart (§3).

**Second weakest: that "nothing on screen names a recurring wage" is complete.**
It is a negative claim across a whole interface, which
`docs/AGENT_WORKFLOW.md` §4 warns rots first. It is backed by regex over the
full `.hud` text at seven observation points across Act 2 and by two greps, not
by an exhaustive enumeration of surfaces. **What would change it:** any surface
this pass did not open — the Regime tab, the save/export panels, a tooltip, a
`title` attribute. `title` in particular is *not* covered: the survey reads text
nodes, and `createIconButton` sets `title: options.label`
(`src/ui/primitives/icon-button.ts:34`).

# What this pass did not reach

- **A player.** Every impact statement above is withheld for that reason.
- **Any viewport but 1440x900.** `STAFF_ROSTER_ROW_LIMIT`'s own docblock
  (`src/ui/hud/staff-panel.ts:122-147`) says in as many words that *"the fold
  measurement for the expanded block has not been taken, because this
  environment has no browser"* and leaves it to *"the browser job"*. Run 2 takes
  it at **one** viewport — opened, `bodyHidden:false`, one row laid out at
  1440x900 — and at no other. **UNKNOWN** whether §2's `ON THE PAYROLL` header,
  or the expanded block under it, is on screen at 900x600, where
  `HELD_GUARD_ROW_LIMIT`'s measurement put a fourth held row 9.0px below the
  fold.
- **Pixels.** Text only, in all three acts. §1's UNKNOWN about the ghosts is the
  one place that matters.
- **ADR 0064's withholding as a thing a player can diagnose.** It is implemented
  (`stateIncomeForPrisonerDay`, `src/simulation/economy/income.ts:383-387`) and
  Act 3 saw `EARNED TODAY` at `229` (Run 1) and `73` (Run 2) with one resident
  in each — both prorated accruals sampled at different points in the day
  rather than withheld amounts, so nothing here separates a withholding from a
  proration.
  **UNKNOWN**, and what would settle it: run one prison with a shower room and
  one without for ten in-game days and read `stateIncomeAccruedTodayMinorUnits`
  at each day boundary — the shape
  `2026-08-29-what-a-day-actually-pays.md` already uses.
- **Touch, trackpad, keyboard.** Mouse only.
- **Anything that depends on material procurement behaviour**, which another
  agent is changing under `src/simulation/construction/**` as this is written.
  §1 buys and orders, and would need re-measuring after that lands; §2 and §4
  touch neither.
