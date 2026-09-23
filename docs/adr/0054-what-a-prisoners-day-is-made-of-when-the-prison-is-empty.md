# ADR 0054: What a prisoner's day is made of when the prison is empty

## Status

**Accepted by the owner on 2026-09-23, together with
[ADR 0052](./0052-drawing-the-world-with-the-source-art-sheets.md), without the
review pass that decision 8 of 2026-08-29 made a condition.** Offered a choice
that included that review pass as the recommended option, they chose the one
labelled:

> Akceptuj oba

("Accept both.") What is accepted is the Decision section as written, all four
decisions. **`hygiene` and `recreation` are room-gated by design**, no regime
block may leave a housed prisoner with nothing to start, `work` is authored as
`action.laundry-work` in `room.laundry`, and ADR 0041's candidate walk stays
unbounded.

**The provenance is the weaker kind, and one part of it is a refusal.** The
ruling is the *label of a clickable option the integrating session wrote and
the owner chose*, not a sentence they typed. `AGENTS.md` records it as ruling
21 of the section *"Instructions recorded that are not releases"*. **The review
pass was put to the owner as the recommended option and they declined it**, so
this acceptance waives #535 decision 8's condition and does not show it was
met. ADR 0052's Status block records the one review that was posted on #535
(2026-08-29, *"Recommend: Accept — and read it knowing the dependency it names
is being closed as it lands"*) and the later comments that said no review had
happened. Neither is resolved here.

**Where later ADRs have overtaken this one: nowhere in its decisions, which
was checked rather than assumed.** Every later ADR that cites this one builds
on it:

- [ADR 0078](./0078-what-keeps-a-prisoner-safe.md) decision 3 leaves
  `hygiene`'s and `recreation`'s rates, their room gating and *"ADR 0054
  decision 1"* untouched in terms.
- [ADR 0113](./0113-how-a-regime-is-edited-and-whose-day-it-is.md) (accepted
  2026-09-14) enforces decision 2's invariant at decode time:
  `allowedCategories.min(1)` is *"the same invariant ADR 0054 added
  `'free-association'` to guarantee"*.

What moved is one dependency that decision 1 names. Its third leg quotes HUD
gap 7, *"the simulation defines no warning or critical threshold for any
need"*, and open question 2 asks what that threshold is. The per-prisoner need
bar #542 built bands on `STATE_INCOME_UNMET_NEED_LEVEL`. So a need that is
withholding grant is now shown to the player, as #535's 2026-08-29 review
predicted. That change is not an ADR, and it does not answer open question 2 as
a statement of what is *bad*. The question stays open, and the sentence that
would answer it is still the owner's to have true.

---

**Proposed, 2026-08-28.** Not self-approved. *(The state of this document
before the ruling above.)*

It answers issue #440 — *"two of seven action categories have no action, so half
the general-population day has nothing to do"* — and issue #436 — *"two needs
have no cell-side route at all"* — because **they are one defect seen from two
directions**, and #440 says so itself (*"this issue should be decided in the
same ADR rather than a competing one"*). It also takes
[ADR 0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
open questions 1 and 3, which #436 is.

**Two of #440's clauses are measured false and this document says so before it
decides anything.** An agent's brief is not evidence and neither is an issue;
the numbers below are from the real kernel on the real command path.

**The number is provisional** in the ordinary way: numbers are assigned
centrally after drafts return (`AGENTS.md`, *"a number is not reserved until it
appears in `docs/adr/README.md`"*), and 0053 was handed to another agent in the
same pass. If 0054 collides, this file, its row in the index and every citation
of it get renumbered together.

## Context

### What #440 says, clause by clause, against what the code does

`ACTION_CATEGORIES` has seven members (`src/simulation/prisoners/regime.ts:1`).

**Clause 1 — "two of seven action categories have no action". False since
2026-08-27.** `action.free-association` was appended at `e642f1b` for
[ADR 0042](./0042-attaching-consequences-to-the-simulation-loop.md) decision 1.
`work` was the only category left with nothing authored under it, and ADR 0042's
own text already carries the correction (*"Half of that is no longer true"*).
Derive it rather than trusting any version of the sentence:

```
grep -o "category: '[a-z-]*'" src/simulation/prisoners/actions.ts | sort -u
```

**Clause 2 — "a riot in a prison without a yard leaves every rioter with zero
legal actions". False, twice over.**
`tests/unit/prisoners-free-association.test.ts` drives the real riot schedule
through the real `ActionSystem` in a prison with no yard and no common room and
measures `unmetDemandCycles: 0` and `actionsCompleted: 30` over a whole riot
day; `tests/unit/prisoners-action-catalog.test.ts` records the riot schedule's
idle-tick figure as `0`. And separately, the riot regime still cannot be entered
at all: `applyRiotRegimeOverride` has no caller in `src/`
(`src/simulation/incidents/riot-regime.ts:52`) and `ActionSystem` holds its
schedules as a `private readonly` constructor field with no setter
(`src/simulation/prisoners/action-system.ts:106`), which is ADR 0042 step 2's
work and not this document's. **That last sentence stopped being true on
[ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md)**, which did that
work: `applyRiotRegimeOverride` is deleted, the schedule array is still
`readonly` and still has no setter, and the regime a riot imposes is resolved
per participant at the point of use instead. Marked rather than rewritten.

**Clause 3 — "half the general-population day has nothing to do". True, and
larger than the arithmetic in the issue.** Measured on the real kernel, one
prisoner, ten in-game days, a prison of cells and nothing else zoned:

```
idle 1,442 of 2,400 ticks a day     unmetDemandCycles 560 of 1,190 cycles
actions ever performed by anybody: action.sleep, action.use-toilet, action.eat-in-cell
hygiene 0.0 and recreation 0.0 at every sample, from the second day to the tenth
```

The same prison at four prisoners: 1,442 idle ticks a day each, 2,240 unmet
cycles, the same three actions, the same two needs on the floor.

### Where #440's diagnosis is wrong, and it is the whole decision

**The empty `work` category costs zero ticks.** No block of any schedule this
repository ships or builds at runtime allows `work` alone: both
`['work', 'education']` blocks also allow `education`, which is authored.
Measured in the same prison with a furnished classroom, canteen, shower room,
yard and common room, those two blocks are already full —
`action.classroom-education` performs 9,000 of their 10,000 ticks and
`unmetDemandCycles` is **0** for the whole run. Authoring a `work` action would
therefore have moved no number a prisoner or a player can see, and an
`own-accommodation` one would have been a second `action.free-association` under
a different name.

**What empties the day is room-gating, not an empty category.** Six of the ten
entries in `DEFAULT_ACTIONS` target a zoned room; only `action.sleep`,
`action.eat-in-cell`, `action.use-toilet` and `action.free-association` resolve
from the prisoner's own accommodation. Three general-population blocks listed
only categories served by the room-gated six —
`[500, 1000)` and `[1300, 1800)` (`work`/`education`, 1,000 ticks) and
`[1000, 1200)` (`recreation`, 200 ticks) — as did `HIGH_RISK_REGIME`'s
`[2000, 2200)` supervised yard. **That is exactly #436's subject**: `hygiene` is
served by `action.shower` alone and `recreation` by three actions that all name
a room, so a prison that has not built the room decays both to the floor and
keeps them there. #440 counts the ticks; #436 counts the needs; they are the
same four blocks.

### Why it matters now, and it did not when either issue was filed

[ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 2 made
`needsPressure` the mean deficit over all six needs across every prisoner
standing on owned land (`src/simulation/runtime/new-session.ts:712-722`), and
decision 3 raised `needsPressureWeight` to `1` against a `hotThreshold` of
`0.65` (`src/simulation/incidents/sector-risk.ts:71-77`). Two needs pinned at
zero are therefore a **floor of 0.3333 on `needsPressure` that no play can
lower**. Measured: 0.3935 at the end of the cell-only run and 0.4817 at its
peak, against 0.2248 once a yard is zoned — and a yard requires no object at
all. `tests/integration/security-default-sector.test.ts` already drives a riot
out of exactly this.

So the pressure is real, it is escapable by building, and the thing that is
wrong is narrower than either issue states: **a prisoner whose need cannot be
met stands motionless rather than doing anything at all**, for 1,442 ticks of
every 2,400.

## Decision

### 1. `hygiene` and `recreation` are room-gated by design, and stay so

#436 asks whether they are room-gated by design or unserved by omission. **By
design.** No cell-side sibling for `action.shower`, and none for the recreation
actions.

The argument ADR 0041 used for the opposite conclusion about `hunger` is the
argument for this one, and the difference is what changed underneath it. ADR
0041 wrote: *"the alternative is not 'a canteen is required' — it is 'prisoners
never eat'. A requirement the game never enforces, never reports and never
resolves is not a design."* Two of those three are now met. It **is** enforced:
ADR 0048 turns an unmet need into `needsPressure`, `needsPressure` into a hot
sector and a hot sector into a riot, in a prison a player can build. It **does**
resolve: `room.yard` needs no object and takes recreation from 0 to 254.9 in the
measurement above; `room.shower-room` needs two shower heads, two bricks apiece.
A cell-side route to both would delete that loop and leave the shower room and
the yard with nothing to be for — which is the *duller* game, and
`AGENTS.md` makes playability part of correctness in both directions.

**The third is not met, and it is not this document's to meet.** Nothing on
screen tells a player that hygiene is at zero. `PrisonerRosterRowViewModel`
carries `lowestNeed`, and the Regime panel renders no need bar, saying why:
*"`docs/HUD_PROJECTIONS.md` gap 7 records that the simulation defines no warning
or critical threshold for any need, so a bar here could show a level and could
not say whether it was bad"* (`src/ui/hud/regime-panel.ts:50-57`). That is a
projection change and a threshold decision, it is the readout #436's third
acceptance criterion asks to be *named* rather than built, and it is named here:
**HUD_PROJECTIONS gap 7 is the surface this ruling depends on, and it is the
owner's, because a threshold is a statement to a player about what is bad.**

> **Amended 2026-08-29 (#535 decision 6). The decision is untouched; the
> paragraph above is now factually stale and is marked rather than rewritten,
> because the sentence a reader would rely on is the one that changed.**
>
> **"Nothing on screen tells a player that hygiene is at zero" is no longer
> true, and "the Regime panel renders no need bar" is no longer true.** Each
> roster row now draws that prisoner's worst need as a segmented bar with the
> need's word beside it. The quoted comment at `regime-panel.ts:50-57` no longer
> exists in that form either -- it is quoted in place there, with the reason it
> expired.
>
> **What has not changed is the leg this document actually rests on.** The bar
> is toned off `STATE_INCOME_UNMET_NEED_LEVEL` (#488), which is a statement
> about what the state declines to pay for. The player-facing threshold -- "a
> statement to a player about what is bad" -- is still unmade and still the
> owner's, exactly as the paragraph above rules. So the ruling stands and the
> surface it depends on is still open; what moved is that a player can now see
> the *level* and see that the prison is losing grant income over it, which is
> the half #436's third criterion asked to be named.

> **Amended 2026-08-28, on #436's re-verification pass. The decision stands. Its
> first leg is narrower than the paragraph above states, and its rejection of
> alternative C is stronger than that section argues.** Both halves are marked
> rather than rewritten, because the sentence being corrected is the one a
> reader would otherwise rely on.
>
> **"It *is* enforced" is true only of an understaffed prison, and the split was
> never measured.** Measured now on the real command path, one furnished cell
> per prisoner (bed and toilet), no shower room and no yard, twenty in-game
> days, `tests/integration/room-gated-needs.test.ts`:
>
> | prison | peak sector risk | riots |
> | --- | --- | --- |
> | 8 prisoners, **1 guard** (coverage satisfied) | **0.4824** | **0** |
> | 8 prisoners, **0 guards** | 0.7979 | 3 |
> | 1 prisoner, 1 guard | 0.4837 | 0 |
>
> `hotThreshold` is `0.65` and `contrabandPressure` is structurally zero, so in
> a staffed prison the score *is* `needsPressure`, and two needs pinned at zero
> for twenty days never reach the line. **The chain from an unmet need to a riot
> closes only when `staffingShortfall` is carrying the rest of it**, and one
> guard hire is the whole of the difference between three riots and none. The
> repository already asserted the same shape one case over and nobody drew the
> conclusion: `tests/integration/incident-trigger-reachability.test.ts` calls
> its beds-only fixture *"one guard away from rioting"* and asserts it *"does
> not, once a single guard is hired"*. So ADR 0041's three-part bar —
> *enforced*, *reported*, *resolves* — is met at **one and a half** of three by
> this ruling, not two: resolution is real and cheap, enforcement is real and
> conditional, and the readout is still owed.
>
> **What that does not do is rescue alternative C, and this is the measurement
> that settles it.** The obvious repair — give the two needs a cell-side sibling
> at a low rate, so the pressure survives — does not work at any rate, because
> the loser is precisely the unguarded prison that sits near the line. Measured
> by appending a hypothetical `action.wash-in-cell` (`own-accommodation`,
> `hygiene`) and `action.rest-in-cell` (`own-accommodation`, `recreation`) to
> `DEFAULT_ACTIONS`, running, and removing them again:
>
> | sibling rate vs `action.shower`'s 4 | cells-only, 1 guard: peak risk | cells-only, 0 guards: peak risk / riots |
> | --- | --- | --- |
> | none (today) | 0.4837 | 0.7979 / **3** |
> | 1 (a quarter) | 0.1948 | 0.4948 / **0** |
> | 0.25 (a sixteenth) | 0.3484 | 0.6484 / **0** |
>
> Even at a sixteenth of a shower's rate the riot is gone, because
> `selectBestAction` drives *any* available route toward satiation — the rate
> sets how fast a need recovers, never a floor it stops at. (ADR 0041 measured
> the same thing from the other side: with `action.eat-in-cell` reachable,
> hunger *"never falls below 179.5"*.) **A cell-side sibling is therefore not a
> weaker version of the room; it is the deletion of the room's reason to
> exist**, and the *Alternatives* section's C was right for a reason it did not
> have. What follows is that closing the enforcement gap has to be done in
> `DEFAULT_SECTOR_RISK_POLICY` or in a per-prisoner consequence (#442, #80,
> #443) and not in the action catalogue.

### 2. No regime block may leave a housed prisoner with nothing to start

`'free-association'` is added to the four blocks whose every category was
served only by a room-gated action: `GENERAL_POPULATION_REGIME`'s
`[500, 1000)`, `[1000, 1200)` and `[1300, 1800)`, and `HIGH_RISK_REGIME`'s
`[2000, 2200)`.

`action.free-association` targets `own-accommodation` and declares no need
effect, so `scoreAction` gives it exactly 0 — the floor, since no authored
effect is negative — and it can never displace a candidate addressing a need
that is even slightly unmet. **Adding it to a block therefore changes nothing at
all in a prison that has the rooms**, and in a prison that has not it is the
difference between milling about on the wing and standing still. It is the same
answer ADR 0042 decision 1 gave the riot regime, applied to the schedule a
player watches.

It deliberately does **not** serve the need. ADR 0041's amendment already drew
the distinction and it is the load-bearing one here: *"Only B fixes the hygiene
need; the fallback already fixes the wasted cycle."*

### 3. `work` is authored as a room a player builds, not dropped and not faked

`action.laundry-work` — category `work`, target `room.laundry`,
`requiredObjectCapability: 'laundry'`, `hygiene: 1` a tick, 120-tick shift,
**appended** to `DEFAULT_ACTIONS`.

- **`room.laundry` rather than a new room.** It has been in
  `src/content/room-catalog.ts` since the catalogue shipped, is zonable, and has
  been furnishable since ADR 0028 phase 4 (`washing-machine-brick`, two bricks
  apiece). `src/simulation/construction/definition.ts` recorded of its
  capability that it *"is gated by **nothing** … a laundry job system is what
  would consume it"*. This is that consumer, and the comment is corrected in the
  same commit.
- **`hygiene` rather than a new need or none.** `room.laundry`'s own authored
  `category` in the room catalogue is `'hygiene'` — content that has said what
  the room is for since it shipped, with nothing reading it. An action with no
  effect would score 0 and be indistinguishable from association, which is ADR
  0042 step 6's *"author it badly"*.
- **1 a tick against `action.shower`'s 4**, which is the convention the
  catalogue already uses for a second route to a need (`action.eat-in-cell` 3
  against `action.eat-meal` 4; `action.common-room-recreation` 2 against
  `action.yard-recreation` 3), now pinned by a test over all three pairs.
- **It does not weaken decision 1.** The laundry is a *room*: a prison with no
  shower room and no laundry still has no hygiene at all. What it adds is a
  second building that answers the same pressure, so the player has a choice
  rather than a checklist — and it gives the work blocks a reason to exist
  beyond education, since `action.classroom-education` serves `recreation` and
  this serves `hygiene`.

### 4. ADR 0041 open question 1: the candidate walk stays unbounded

*"Should a fallback be bounded?"* **No, and decision 2 is why the question
changes shape.** The walk stops at the first candidate that resolves, and an
action fulfilling nothing scores exactly 0, so association can only ever be
*last* in the ranking — the walk cannot reach it while anything better resolves.
Bounding the walk would reintroduce the standing-still ADR 0041 removed. The
bound that was actually wanted is a **terminal**, not a limit: every block now
holds one candidate that resolves for any housed prisoner, so the walk ends at
an action rather than at the end of the list.

A prisoner with **no accommodation** still exhausts the walk and still counts an
`unmetDemandCycle`, and that is correct and deliberate: it is the one thing the
counter can still mean, and it means "this person has nowhere to live".

## Alternatives, with their real costs

**A — author a roomless `work` action (`own-accommodation`, no need effect).**
The obvious reading of #440. Rejected on the measurement: it moves no tick,
because no block allows `work` alone, and it duplicates
`action.free-association` under a second id — two catalogue entries, two save
indices and two locale keys for one behaviour. It would also have made the
`work` category permanently un-buildable-toward, which is the opposite of what
a management sim wants from prison labour.

**B — drop `work` from `ACTION_CATEGORIES` and from the two schedules.**
ADR 0042 names this as the *"cheaper interim if step 6 slips"* and
`tests/unit/prisoners-action-catalog.test.ts` carries it as the recorded reason.
Rejected: it deletes a category `docs/ROADMAP.md` phase 9 wants, it changes the
same two schedules this document changes anyway, and it moves no measurement in
either direction. It buys tidiness at the cost of content ADR 0017 decision 4
says not to delete. It stays the right answer if decision 3's laundry turns out
to be a bad shape — the two blocks would then read `['education']` and
`['education', 'free-association']`.

**C — give `hygiene` and `recreation` cell-side siblings (#436's other half).**
The symmetric reading of ADR 0041, and it is the one this document spends the
most words rejecting because it is the one that looks most obviously right.
It closes the tick gap *and* the need gap in one move, at these costs: a prison
of cells alone would keep all six needs high, `needsPressure` would sit near
0.06 instead of 0.39, and **the riot ADR 0048 built in the week before this
would stop firing in any prison that had built cells** — the yard, the shower
room, the common room and the classroom would all become cosmetic. The
measurement that decides it is the one in *Context*: the escape from the floor
is already cheap (a yard costs no objects at all) and already works. Not taken.

**D — a bounded walk, so a room-gated action is all-or-nothing.** ADR 0041 open
question 1's other answer. It would restore the standing-still that ADR 0041
measured and removed, in exchange for making an unmet need *visible as
idleness* — which is not a readout, because a well-served prisoner is idle 360
ticks a day too on the reconsideration cadence alone. A player cannot tell 360
from 1,442 by watching. Rejected; the honest readout is HUD gap 7.

## Consequences

Measured before and after on the same probe, at `bb3a01e` in a pristine
worktree and on this branch, one prisoner, ten in-game days, real commands:

| prison | idle ticks/day | unmet cycles | `needsPressure` | hygiene | recreation |
| --- | --- | --- | --- | --- | --- |
| cells only | 1,442 → **610** | 560 → **0** | 0.3935 → 0.3935 | 0 → 0 | 0 → 0 |
| cells only, 4 prisoners | 1,442 → **610** | 2,240 → **0** | 0.3935 → 0.3935 | 0 → 0 | 0 → 0 |
| cells + yard | 1,256 → **540** | 488 → **0** | 0.2248 → 0.2235 | 0 → 0 | 254.9 → 254.9 |
| cells + laundry | 1,442 → **500** | 560 → **0** | 0.3935 → **0.2301** | 0 → **249.6** | 0 → 0 |
| cells + yard + shower + laundry | 1,140 → **400** | 440 → **0** | 0.068 → 0.0621 | 254 → 249.2 | 243.8 → 254.9 |

- **The remaining 610 is not empty content.** `unmetDemandCycles` is 0, so every
  reconsideration found something; what is left is `ActionSystem`'s twenty-tick
  cadence, which an action of 60 ticks fills 60 of every 80. A fully furnished
  prison sits at 360 on the same floor. **Whether the cadence should leave a
  gap at all is a different question and is not answered here.**
- **The neglect is untouched, and that is the point.** `needsPressure` in the
  cell-only prison is 0.3935 before and after — to four decimal places — and
  0.3898 rather than 0.3889 in the sector-risk integration run, which is *up*.
  Filling an empty block does not relieve the pressure a riot is made of.
- **`action.eat-in-cell`, `action.use-toilet` and the two loop files' counts
  move**, all by one or two twenty-tick cadences: an association that runs past
  a block boundary delays the first action of the next block. Every moved number
  in `tests/integration/` carries the reason beside it, which is #436's
  acceptance criterion 5.
- **`room.laundry` leaves `unconsumed-content-contract`'s list** and `laundry`
  leaves `content-vocabulary-contract`'s `UNGATED_BY_ANY_ACTION`.
- **Determinism is unaffected by construction and shown rather than asserted.**
  No new randomness, no new save key, no new iteration order: one more entry in
  a list already walked in declaration order, and four blocks with one more
  string in an array. Two runs of the probe from one seed produce byte-identical
  JSON on both trees. `DEFAULT_ACTIONS` gained its entry by **appending**, so no
  existing `actionIndex` on disk moves and `SAVE_SCHEMA_VERSION` does not
  (ADR 0042 decision 1's correction of #440's out-of-scope note).
- **`docs/PRISONER_OPERATIONS.md` and `src/simulation/construction/definition.ts`**
  each described the state this changes and are corrected in the same commit, in
  both directions. #440's *Documentation impact* also names a simulation
  overview document under `docs/` that has never existed in this tree, so the
  action catalogue and the regime schedules are documented in
  `docs/PRISONER_OPERATIONS.md` and nowhere else.

## What would change my mind

**The weakest claim is that room-gating `hygiene` and `recreation` is a design
rather than an omission**, and it rests on one link: that ADR 0048's riot is a
consequence a player will actually experience and understand. The riot fires —
`tests/integration/security-default-sector.test.ts` drives one out of real needs
and real understaffing — but **nothing tells the player which need caused it**,
and the ruling is only as good as the readout it is waiting on. If HUD gap 7 is
not going to be closed, decision 1 is wrong and C is the honest answer, because
an invisible pressure with an invisible escape is the state ADR 0041 refused.

> **Amended 2026-08-28. Half of this paragraph is now measured, and it went the
> way the paragraph feared and the other way at the same time.** The link is
> weaker than stated — in a *staffed* prison the riot does not fire at all, so
> the neglect is invisible **and** inconsequential, not merely unlabelled (see
> decision 1's amendment for the numbers). But the escape route this paragraph
> offers if the link fails is closed: C does not preserve the pressure at any
> rate, measured. So the paragraph's *"decision 1 is wrong and C is the honest
> answer"* is withdrawn. The honest answer if the link cannot be repaired is a
> consequence or a threshold, not a catalogue entry, and both are outside this
> document.

Three smaller things would move me:

- **An owner ruling that a prisoner should never be idle at all**, in which case
  the twenty-tick cadence gap is the next thing to look at and it is a change to
  `ActionSystem`, not to content.
- **A measurement showing `action.laundry-work` displacing education in a way
  that reads badly.** The two compete on `hygiene: 1` against `recreation: 1`
  and split 3,600/4,800 in the fully built prison; a prison where the laundry
  swallows the classroom entirely would mean the rate is wrong, not the entry.
- **A decision to build prison labour as an income line (#29, ADR 0042 step 6).**
  Then `action.laundry-work` is the first of several and its need effect is the
  wrong axis; it should produce, and the shape of "produce" is that step's.

## Open questions

1. **Should the reconsideration cadence leave a gap?** 360 idle ticks a day in a
   fully furnished prison is `ActionSystem.schedule.intervalTicks` and nothing
   else. Starting the next action in the same cycle that completes one would
   remove it, and would change every count in `tests/integration/`.
2. **What is a need's warning threshold?** HUD gap 7, named above, and the
   thing decision 1 depends on. It is a statement to a player and therefore the
   owner's.
3. **Does `unmetDemandCycles` still measure anything worth measuring?** It is now
   0 in every prison with a housed population and non-zero only for a prisoner
   with no accommodation. That is a useful number under a different name, and it
   is ADR 0041 open question 2's territory (#435).
