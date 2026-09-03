# Can a player read this?

**Date:** 2026-09-03 · **Version:** v0.0.422 (`31578e6`, `playtest/can-a-player-read-this`)
· **Method:** played in a real browser through
`tests/browser/playtest-2026-09-03-the-whole-screen-at-once.playtest.ts` and
`tests/browser/playtest-2026-09-03-can-a-player-read-this.playtest.ts`, both on
`tests/browser/playwright.playtest.config.ts`. **Neither is a CI gate**;
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/` and never
collects a `.playtest.ts`.

## The question

Not whether the text is grammatical. **Whether a person sitting down at this
game can work out what is happening to their prison and what to do about it,
from what is on screen.** That covers whether numbers are labelled, whether a
change is visible when it happens, whether a warning names an action, whether
two things that mean different things look different, and whether anything on
screen is quietly saying something untrue.

Every claim below starts from something observed in the running game. Where a
claim is refuted — including three of this pass's own opening hypotheses — the
refutation is recorded rather than the hypothesis quietly dropped
(`docs/AGENT_WORKFLOW.md` §4).

## What this pass proposes

**Nothing that is the owner's.** Every remedy below is a sentence a player
reads or a number a player is judged against, and `AGENTS.md`'s fourth
exclusion reserves both. Each finding therefore states **what the words must
convey**, never the words.

## The answer, in one paragraph

**A player can read every number on this screen and cannot read their prison.**
The labelling is good — 158 of 163 number tokens on screen name themselves one
or two hops away, and the one that does not is the clock's `×4`. The urgent
things arrive where the eye already is: admitting six prisoners into a two-bed
prison put `8` and `6 with no bed` on the strip while the player was on the
Build tab, and a 24,000 order put `-100` on the FUNDS chip while they were on
Regime. What is missing is everything between "a number" and "an emergency":
the tab a session opens on gains **not one sentence** across eight working
days, the readout that should tell a player whether to hire does not move when
they hire, a working camera control says it is not available, and the row that
names a prisoner puts a need and a risk tier side by side with no heading over
either.

## Ranked

| # | label | finding |
| --- | --- | --- |
| 1 | DEFECT | Four numbers about guards on one screen, two of them called coverage — and hiring a second guard moves neither of the two, while the wage bill triples |
| 2 | DEFECT | The minimap says it is not available and then answers a click; only a player who ignored the sentence is ever told |
| 3 | DEFECT | The tab a session opens on gains no sentence at all between an empty prison and a working one |
| 4 | DEFECT | A roster row is `name / activity / need / risk tier` with no heading over any column, and this pass misread it (§12) |
| 5 | REFUTED | "The numbers are not labelled." One unlabelled readout on the whole screen |
| 6 | FIXED | The clock says `PAUSED`, in a word and a second channel (#629 §1 closed) |
| 7 | CONFIRMED | A refusal from tick 0, in two places at once, still on screen on day 7 (#894) |
| 8 | CONFIRMED | All nine chips inert — zero listeners, measured by census and by pressing |
| 9 | NOT A DEFECT | An urgent change *is* visible on a tab that does not report it |
| 10 | TASTE | `EARNED TODAY` has no reference point on screen |
| 11 | MEASURED | The sentence explaining the overdraft badge is a tooltip; already the owner's call |

---

## 1. DEFECT — four numbers about guards on one screen, two of them called
coverage, and the two a hire is meant to move do not move

**Reproduction** (`act 2`): build a 6x6 cell with eight beds and a toilet,
admit six prisoners, hire three guards, run to day 8 at x4, then read the
status strip and the Security tab.

What is on screen at that moment:

| where | reads | what it counts |
| --- | --- | --- |
| strip, `STAFF` chip | `3` | staff |
| strip, `COVERAGE` chip | `6 · COVERAGE · Covered` | **prisoners** on the covered rung |
| Security panel, coverage block | `GUARD COVERAGE  1 of 1  Covered` | **guards** assigned of required |
| Security panel, held summary | `1 held · 2 free` | guards on post / in the pool |

Worker counts at the read: `prisoners: 6`, `staff: 3`,
`dailyWageBillMinorUnits: 240`.

**The two "coverage" readouts are different quantities off different
derivations, and neither says so.** `projectStatusMetrics`' `coverage`
descriptor is `value: counts.prisonersCovered`
(`src/ui/hud/projection.ts:844`) with its word from `coverageBadge` over the
prisoner rungs `prisonersUnguarded` / `prisonersUnderstaffed`. The panel's
summary is `hud.security.coverage-summary`, `'{assigned} of {required}'`, over
`HudStaffCoverageViewModel` — `required` is *"Guards the prison asks for,
summed over every sector"* and `assigned` *"Guards assigned to a sector —
already on post, or still walking there"* (`view-model.ts:1785-1792`) — with
its word from `describeStaffCoverage` over `shortage`.

So a player reading left to right gets `3 STAFF`, then `6 COVERAGE`, then opens
Security and gets `1 of 1` and `1 held · 2 free`. Four figures about two
populations. **Only `1 held · 2 free` names its own units.** `6` under a label
reading `COVERAGE` beside a security icon, in a prison holding six prisoners
and three guards, is a number a reasonable player will read as either — and
which one they pick changes what they do next, because one of them is the
number a hire moves and the other is not.

**The refuting samples, taken.**

- *"They are the same quantity read twice, and the difference is a stale
  publication."* Refuted at the source rather than by timing: the two read
  different fields of different view models, argued above, and the strip's own
  docblock (`projection.ts`, `coverageBadge`) says where the panel's two counts
  are *"readable in full"* — the panel — which only makes sense if they are not
  the chip's number.
- *"The words tell them apart."* Partly. The panel's label is `Guard coverage`
  and the strip's is `Coverage`, so the distinction is present in one word on
  one of the two. It is not present in the badge: **both render the single word
  `Covered`**, out of one shared string set (`hud.security.coverage-met`), and
  the strip's chip deliberately reuses the panel's vocabulary so *"the panel and
  the strip cannot come to disagree about what a rung is called"*. That is a
  good property for a *rung* and it is what makes the two readouts look like
  restatements of each other.

**The escalation this pass expected is REFUTED, and here is the sample that
did it.** The hypothesis was that the two could print *contradictory* words at
one instant — the panel `Covered` because `assigned === required` while the
guard is still walking, against the strip `Unguarded` because no prisoner is yet
on the covered rung. `assigned`'s own doc comment ("already on post, **or still
walking there**") is why that looked reachable. `act 7` sampled both readouts
**in one page evaluation**, once a second, on a six-prisoner prison: 20 samples
with nobody hired, 60 across a hire and the walk after it, 45 across a second
hire. **125 samples, `same word` on every one.** The transition is one sample
wide:

```
one guard hired  t+ 0s STRIP 0 "Unguarded" (danger) | PANEL 0 of 1 "Unguarded" (danger) | prisoners=6 staff=0
one guard hired  t+ 1s STRIP 6 "Covered"   (none)   | PANEL 1 of 1 "Covered"   (success)| prisoners=6 staff=1
```

There is no walk-to-post window at all at this scale. The word contradiction
does not exist and this record does not claim it.

**What those 125 samples found instead, and it is worse for a player than the
contradiction would have been.** Hold the population at six and hire a *second*
guard:

```
one guard hired  t+59s STRIP 6 "Covered" | PANEL 1 of 1 "Covered" | staff=1 | hint="This prison has the guards it asks for."
two guards hired t+24s STRIP 6 "Covered" | PANEL 1 of 1 "Covered" | staff=2 | hint="This prison has the guards it asks for."
```

**Neither coverage readout moves. Not the chip, not the summary, not the word,
not the sentence.** The only thing on screen that changes is the `STAFF` chip
counting up and the wage bill under `ON THE PAYROLL` — measured at `80 a day`
for one guard and `240 a day` for three. So the readout a player would use to
decide whether to hire is the one readout a hire cannot move, and the readout
that *does* move is the bill. A player who hires three guards to be safe has
paid three times the wage for a screen that is identical to the one-guard
screen except for two digits.

That is not `#893` — which is that `2 of 2 · Covered` reads identically whether
an incident can be answered — but it is its neighbour, measured from the other
side: the same `1 of 1 · Covered · This prison has the guards it asks for.`
renders at one guard and at three, with six prisoners either way.

**What the words must convey**, without this pass authoring them: which
population each number counts. The strip's chip is the one that needs it — the
panel already says `Guard`.


## 2. DEFECT — the minimap says it is not available, and then answers a click

**Reproduction** (`act 8`, 27.6 s, no build needed): open the app, press
**New prison**, wait, read the minimap panel; press once in the surface;
read it again.

| | on arrival, nothing pressed | after one press |
| --- | --- | --- |
| sentence on it | `Minimap is not available yet` | `No map is drawn here yet — click to jump the camera there` |
| surface `cursor` | `pointer` | `pointer` |
| placeholder `cursor` | `pointer` | `pointer` |
| listeners on the surface | `click` | `click` |
| `role` / `tabIndex` / `aria-label` / `title` | `(none)` / `-1` / `(none)` / `(none)` | same |
| surface box | `224x224@99,501` | same |
| panel `data-collapsed` | `false` | `false` |

**The sentence swap is the proof the camera moved.** `src/ui/hud/hud.ts:1479`
is `if (navigated) minimapPlaceholder.textContent =
t(HUD_MESSAGE_KEY.minimapNavigable);`, and `navigated` is
`onMinimapNavigate`'s return — `false` exactly when the click "lands while no
world has ever been loaded". So the second row of that table cannot be reached
without the camera having actually gone somewhere.

**What a new player is therefore told.** A 224x224 panel, open on arrival and
present on all five tabs, states in its only sentence that a feature does not
exist. The feature works. **The only player who is ever corrected is the one
who ignored the sentence** — and the correction is a one-way latch
(`hud.ts:1479` is the sole writer; nothing resets it), so it is the *first*
press that is wasted, once per session, for every player who reads before
pressing.

**The refuting sample, taken.** `cursor: pointer` on both the surface and the
placeholder is a genuine affordance, so this is not a wholly hidden feature for
a mouse player — which is why it is filed as a defect about a *sentence* rather
than as HIDDEN. What that sample also shows is the shape of the problem: the
cursor says press me and the words say there is nothing here, on the same
224x224 box. And it does not rescue a keyboard player at all: `<div>`,
`tabIndex -1`, no `role`, no `aria-label`, no `title` — the surface cannot be
focused, so the swap can never fire and the sentence denying the feature is the
only thing that player will ever be told.

**What the words must convey**, without this pass authoring them: that the
square is a camera control now, and that what is missing is the drawn map
rather than the ability to jump. The second sentence already in the catalogue
(`hud.minimap.navigable`) says exactly that. The change is *when* it is shown,
not what it says — and choosing that is a player-visible promise, so it is the
owner's.


## 3. DEFECT — the tab a player arrives on gains nothing when the prison
starts working

**Reproduction** (`act 2`, one browser session, no reload): read the whole
visible text of all five tabs on a fresh prison at day 1; build a 6x6 cell with
eight beds and a toilet, admit six prisoners, hire three guards, run to day 8 at
x4; read all five tabs again. Compare line by line.

| tab | lines on the fresh prison | of those, word-for-word identical on the working prison |
| --- | --- | --- |
| Overview (the tab a session opens on) | 58 | **52** |
| Build | 95 | 89 |
| Security | 69 | 60 |
| Regime | 66 | 54 |

Every line that *arrived* on the Overview tab across those eight days:

```
6            (the PRISONERS chip)
3            (the STAFF chip)
26,630       (the FUNDS chip)
586          (the EARNED TODAY chip)
8            (the day)
33%          (through the day)
Speed 4× / ×4
Nothing was removed — there is no object on that tile, and none being built there.
Warning
Saved (generation gen-mtlvhvhs-8).
```

Six numbers, all of them on the status strip that is on screen on every tab
anyway; the speed readout; **a refusal from tick 0 (§5)**; an autosave notice.
**Not one sentence about the prison.** The Intake panel's only prose is the
same hint it carried when the prison was empty — *"A prison needs a cell before
it can admit anyone. It does not need a free bed: an arrival with none waits
until a bed is free."* — and the minimap square still says it is not available
(§2).

**The refuting samples, taken.**

- *"Nothing is wrong, so there is nothing to say."* This is the sample that
  matters and it does not clear the finding. The prison is not merely
  untroubled, it is *running*: six people are being housed, fed and paid for,
  three guards are on the payroll for 240 a day, and 1,545 of state income has
  accrued today. None of that is a warning; all of it is what the player built
  and would like to see. The comparison is against a prison in which **nothing
  whatsoever has happened**, and the tab they arrive on cannot tell the two
  apart except by six digits.
- *"The information is elsewhere."* Confirmed, and it is why this is filed as a
  defect about a tab and not a missing feature. The Security tab does gain
  real lines — `1 of 1`, `1 held · 2 free`, `Guard · Sector Post`, `Release`,
  `ON THE PAYROLL`, `240 a day` — and the Regime tab carries a roster block
  with a count and an `and 4 more`. So the prison is legible; it is legible
  only to a player who goes looking, on tabs named after the tools that change
  things rather than after the prison.
- *"The strip is the prison summary, and it is always there."* True, and it is
  the reason six of the ten arriving lines are numbers. It is also the whole of
  what a player gets: nine bare counts, no sentence, and — measured in §7 —
  nothing pressable to take them anywhere.

**What the words must convey**, without this pass authoring them: on the tab a
session opens on, what the prison is currently doing to the people in it.
Which facts those are is a design call and therefore the owner's; the gap is
that the count is presently zero.

## 4. REFUTED — "the numbers on screen are not labelled"

This pass opened by assuming a legibility problem it could not find.

`probeNumbers` walks every visible leaf in `.hud` and `.save-panel` whose text
contains a digit, and reports **`hops`**: the number of steps from that leaf up
to the nearest ancestor whose *visible* text (screen-reader-only spans removed)
contains a word of three or more letters, together with that ancestor's text.
It is a distance rather than a verdict because the verdict version got the
answer wrong — see §11.

Measured across all five tabs, at 1440x900:

| Prison | tokens on screen | named 0–2 hops away | named further away or not at all |
| --- | --- | --- | --- |
| fresh, day 1, nothing built | 125 | 125 | **0** |
| built, 8 prisoners, 2 guards, day 4 | 163 | 158 | **5** |

Every one of the five is the same readout seen once per tab: the clock's
**speed value**, `×4`, whose only naming word is the screen-reader-only
`Speed 4×` beside it. So the honest count of *distinct* unlabelled readouts on
screen is **one**, and it carries the `×` glyph.

The chip values are labelled one hop away — `span.ui-stat__body` reading
`0Prisoners`, `25,000Funds` — and the panels label theirs in the leaf itself:
`Needs at least 3 × 3 tiles`, `Costs 80 now and 80 a day in wages.`,
`0 held · 0 free`, `2 waiting with no bed to sleep in`, `Buy 1 × Brick · 40`.

**What would change my mind:** a viewport narrow enough to drop a chip's label
while keeping its value. This pass measured 1440x900 only; the sibling pass
measures 375x812.

## 5. FIXED — the clock now says whether it is running

`2026-08-30-what-the-game-never-says.md` §1 recorded that a new session's clock
is constructed paused and *"no word on screen says so — the whole sighted clock
readout is `Day 1 / 0% / ×1`, and `×1` is what a running clock prints too"*.

Measured on `31578e6`, reading the sighted clock text and the computed
background luminance of all three transport buttons in each state:

| state | sighted clock reads | button background luminances |
| --- | --- | --- |
| a new session arrives | `Day 1 / 0% / PAUSED` | `[0.4141, 0, 0]` |
| after pressing Play | `Day 1 / 9% / ×1` | `[0, 0.4141, 0]` |
| after two Fast forwards | `Day 1 / 64% / ×4` | `[0, 0, 0.4141]` |
| after pressing Pause | `Day 1 / 70% / PAUSED` | `[0.4141, 0, 0]` |

Cross-checked against the worker rather than the paint: the tick moved
`242 → 424` over eight seconds after Play and `1691 → 1691` over eight seconds
after Pause. Two channels, both moving, both agreeing with the simulation. The
readout named in #629 §1 is closed.

## 6. CONFIRMED (#894) — one refusal from tick 0, rendered twice, still on
screen on day 7

The `calibrate` helper presses one empty tile with the Remove tool at the very
start of a build, at tick 0. On day 7 — tick 18,391, seven in-game days and one
autosave generation later — the whole visible text of the Build tab contains
**two** copies of the sentence that press produced:

```
| Nothing was removed — there is no object on that tile, and none being built there.
| MINIMAP
| Collapse
| MINIMAP IS NOT AVAILABLE YET
| ALERTS
| Nothing was removed — there is no object on that tile, and none being built there.
| Warning
```

One in the `.hud__refusal` band, one as a row in the folded-open alerts list,
with no dismiss control on either in that dump — while a contraband alert row
measured in the same session did carry one (`Contraband found: Currency. Day 3
Warning Clear this alert`). This is `HUD_PROJECTIONS.md` gap 34, which ADR 0084
declined to reopen; recorded here only because the reproduction is longer than
the day-9-from-tick-0 one already on file and because **the same sentence
occupies two places on the screen at once**, which the existing record does not
say.

## 7. CONFIRMED — all nine status chips are inert, measured by pressing them

Already on file and not re-filed; recorded because the measurement is stronger
than the one it confirms. `installListenerCensus` patches
`EventTarget.prototype.addEventListener` from before the app's first script, so
this is a census of every listener the application actually installed rather
than a search for the ones a reader expected:

```
CHIP prisoners     <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP high-risk     <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP staff         <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP coverage      <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP rooms         <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP incidents     <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP contraband    <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP funds         <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
CHIP earned-today  <div> cursor=auto  tabIndex=-1 role="" listeners=[] descendantsWithListeners=0 title=""
```

Not one listener on any chip, and none on any of their descendants either. Four
were then pressed with `{ force: true }` and the whole HUD text diffed either
side of each press; every line that changed was the clock advancing:

```
PRESS prisoners     changed 6 line(s) on screen: ["25,570","93","8","8%"]
PRESS coverage      changed 5 line(s) on screen: ["279","23%","Allows Work, Education, Free Association","28% THROUGH"]
PRESS incidents     changed 4 line(s) on screen: ["488","41%","97% THROUGH","49% THROUGH"]
PRESS funds         changed 6 line(s) on screen: ["607","51%","40% THROUGH","Allows Meal"]
```

`cursor: auto` is the honest half: nothing invites the press. The consequence
for §3 is that the one surface a player has on every tab is a row of nine
numbers that goes nowhere.

## 8. NOT A DEFECT — an important change *is* visible on a tab that does not
report it

This was the pass's third hypothesis and the strip answers it.

**Reproduction** (`act 3`, event 1): build a cell with **two** beds, admit two
prisoners, run to day 5, then sit on the **Build** tab — where a player who has
just finished building actually is — and admit six more from Overview without
coming back. Diff the whole visible text of the Build tab either side.

Every line that arrived, on a tab that has no intake panel on it:

```
8               (the PRISONERS chip, up from 2)
6 with no bed   (a warning badge that was not there before)
23,900 / 49 / 6 / 9%   (funds, earned today, the day, day progress)
```

`prisonersInIntake: 6`, `roomOccupants: 2`, `accommodationCapacity: 2` at the
read. So the fact that six people have nowhere to sleep reached the screen
*with a word on it*, on a tab that does not own the subject, at the moment it
happened. Reproduced twice, in two separate sessions, with the same two lines
(`8`, `6 with no bed`).

Event 2, the same shape for money: order 600 bricks (24,000) from Build, return
to **Regime**, and the FUNDS chip reads **`-100`** on arrival — the balance
crossing into the overdraft is on screen on a tab that has nothing to do with
money.

**The refuting sample is the finding above**, inverted: what the strip cannot
do is carry a *sentence*, and §3 is what that costs. Both are true — the strip
is the reason an urgent change is never missed and the reason an ordinary one is
never explained.

## 9. TASTE — `EARNED TODAY` is a number with no reference point anywhere on
screen

`EARNED TODAY` is `counts.stateIncomeAccruedTodayMinorUnits` unmodified
(`projection.ts:1048`), and its descriptor comments say so: *"No tone and no
badge, for the same reason `funds` has neither: 'a good day' is a threshold, and
nobody has set one."* Measured values within one session on a six-prisoner
prison: `0`, `279`, `310`, `586`, `1,296`, `1,485` — the same day, sampled a few
seconds apart, because it accrues continuously and resets at the boundary.

Filed as TASTE and not as a defect because it is discoverable, correct and
labelled. Recorded because it is the one chip on the strip that a player has no
way to judge: `586` is not comparable to the `FUNDS` chip beside it, not
comparable to yesterday, and not comparable to what the prison could earn.
Whether it should be judged against anything is a design call and therefore the
owner's.

**Not to be confused with a lie.** An earlier reading of this pass suspected
one: the chip read `279` while the worker's latest published
`stateIncomeAccruedTodayMinorUnits` was `1545`. Refuted — the two reads were
several seconds apart on a clock running at x4, and the chip is that field
read directly with no arithmetic. Recorded because the suspicion was wrong and
the reason it was wrong is a sampling rule this record depends on elsewhere.

## 10. MEASURED, and already the owner's call — the one sentence that explains
the overdraft badge is hover-only

Recorded rather than filed, because the owner ruled on it on 2026-09-01 and the
ruling is in the code's own docblocks. The measurement is here because the
consequence is easy to underestimate from the ruling's wording.

While the balance is negative the FUNDS chip carries a badge stating a bare
remainder — measured at `1,150 left` on a prison at `-100` — and a full
sentence, `1,150 left before deliveries stop — past that, no materials can be
ordered until the state pays what it owes.` The sentence is
`StatChip.setDescription`, which writes the chip's `title` **and** a
`screenReaderText` span (`src/ui/primitives/stat-chip.ts:93-94`). `.ui-sr-only`
is `width: 1px; height: 1px; clip-path: inset(50%)`
(`src/ui/primitives/primitives.css:73`).

So on screen, for a sighted player who does not hover, the whole of what the
chip says is **`-100`** and **`1,150 left`** — 1,150 left of what, unstated. The
sentence that answers it is a tooltip. Both were on screen (in `innerText`)
during act 3's overdraft window and both vanished together when the state paid
and the balance went positive, which is the badge behaving exactly as its
docblock says it should.

The width argument the ruling weighed this against is real and measured
elsewhere (a strip carrying every badge is 1,627px of content in a 1,256px row
at 1280). This record only notes that the trade landed the *explanation* of a
number on a hover, and that a hover is not a channel a player is told exists.

## 11. This pass's instrument was wrong twice, and both are recorded

- **The number probe measured itself.** The first `probeNumbers` asked whether
  a word appeared inside the number's "smallest grouping" and stopped its
  upward walk on any class matching `^ui-[a-z]+$`. `ui-value` is one. So every
  chip value in the status strip reported *its own `<span>`* as its grouping,
  found no word in it, and was counted unlabelled. That run reported **71
  unlabelled numbers on a populated prison** and every one was an artifact.
  The rewrite reports a distance with no threshold to get wrong, and §3 is its
  answer.
- **The affordance probe counted the insides of working buttons.** A
  `<span class="ui-action__label">` inside a real `<button>` inherits
  `cursor: pointer` and carries no listener of its own, so the first sweep
  reported **101 "looks pressable and is not"** on the Build tab. It now skips
  any element with a pressable ancestor.

Both are why this record leads with a refutation.
