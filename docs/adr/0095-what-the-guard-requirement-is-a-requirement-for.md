# ADR 0095: What the guard requirement is a requirement for

## Status

**Proposed, 2026-09-03. Not self-approved.**

**Nothing here is implemented.** This branch carries this document and one
measurement instrument,
`tests/integration/security-coverage-versus-response.test.ts`, which
characterises the behaviour described below without asserting any decision
about it. No system, view model, locale key or content value is changed by the
branch this document arrives on.

It answers [issue #893](https://github.com/matmaxalez/lockstate/issues/893),
found by playing, and it needs the owner for two reasons rather than one:

1. Decisions 2 and 3 below would amend
   [ADR 0053](./0053-who-may-stand-a-security-post.md) decision 3, which is the
   single-function rule about what a security duty may claim. An implementing
   agent does not approve its own amendment to a decision it is amending
   (`docs/AGENT_WORKFLOW.md` §3).
2. **The recommended decision's deliverable is a sentence a player reads**, and
   `AGENTS.md`'s fourth exclusion reserves that. This document says what the
   sentence must *convey* and authors none of it. `hud.security.coverage-met-hint`
   is quoted below only as evidence of what is currently said.

**No ADR's `Status` word is touched by this document**, ADR 0053's and ADR
0073's included.

**The number is provisional.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`). 0095 was the stated next free number in
[the index](./README.md) at the time of writing, and the stated number is a
ceiling rather than a reservation, so a remote sweep was performed rather than
asserted: `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
`git ls-tree --name-only <head> -- docs/adr/` over all **146** heads
`git ls-remote --refs --heads origin` returned. The highest four-digit prefix on
any head was **0094**, and `gh`'s open pull request list (six: #896, #892, #891,
#844, #812, #355) holds nothing at 0095 or above. If 0095 collides anyway,
renumber this file, its row in [`README.md`](./README.md), and every citation of
it (`grep -rn "0095" src/ tests/ docs/`).

- Related: issues [#893](https://github.com/matmaxalez/lockstate/issues/893),
  #457, #29;
  [ADR 0048](./0048-what-a-sectors-occupants-are.md),
  [ADR 0053](./0053-who-may-stand-a-security-post.md),
  [ADR 0073](./0073-who-orders-a-contraband-search.md),
  [ADR 0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md),
  [ADR 0034](./0034-releasing-a-claimed-guard.md),
  [ADR 0092](./0092-who-decides-where-a-guard-stands.md);
  [`docs/SECURITY.md`](../SECURITY.md),
  [`docs/INCIDENTS.md`](../INCIDENTS.md),
  [`docs/CONTRABAND.md`](../CONTRABAND.md)

## Context

### What the code does, verified on `ac58c457` (v0.0.427)

Four facts, each of which is correct on its own, and their composition is the
finding.

1. `DeploymentSystem.assignUnassignedGuards` fills a sector to
   `requiredGuardCountFor` and stops
   (`src/simulation/security/deployment-system.ts:182`-`:197`). Arrival sets
   the phase to `'on-post'` (`:207` for a guard already standing there,
   `:270` in `onArrivedAtPost` for one that walked).
2. `GuardRoster.unassignedGuardIds()` is
   `allGuardIds().filter(id => deploymentPhase === 'unassigned')`
   (`src/simulation/security/guard-roster.ts:236`-`:237`). **A posted guard is
   not unassigned**, and nothing in `src/` returns a posted guard to that phase
   except `unassign`, which no scheduled path calls for a healthy post.
3. `claimableGuardIds` is that pool, filtered by role and nothing else:
   `return source.unassignedGuardIds().filter((entityId) => isEligible(source.getStaffRoleId(entityId)));`
   (`src/simulation/security/post-eligibility.ts:107`).
4. **Four claimants call it**, and all four therefore claim from what posting
   has left over: `DeploymentSystem` itself
   (`deployment-system.ts:194`), `IncidentResponseSystem.claimableResponders`
   (`src/simulation/incidents/response-system.ts:463`),
   `SectorSearchDutySystem` (`src/simulation/contraband/sector-search-duty.ts:126`)
   and `SearchSystem.assignQueuedOrders`
   (`src/simulation/contraband/search-system.ts:287`-`:290`).

So posting spends the whole requirement out of the pool that answers incidents
and walks searches, and never gives any of it back.

**A trap for the next reader, recorded because it cost the integrator a
near-miss.** The comment at `response-system.ts:456` reads *"`claimableGuardIds`,
not `unassignedGuardIds()`"*, which scans as though responders come from
somewhere else. They do not. That comment draws its distinction on the
**role-filter** axis — ADR 0053, only a post-eligible role counts — and says
nothing about the unassigned axis. One level down settles it.

### What the player is told

`describeStaffCoverage` (`src/ui/hud/staff-panel.ts:302`-`:342`) has three
rungs and reads three numbers: `required`, `assigned`, `shortage`, copied
across the worker boundary unchanged by `staffCoverageFromProjection`
(`src/ui/simulation-staff-coverage.ts`, whose own docblock says
*"What it computes, which is nothing"*). `shortage <= 0` with `assigned > 0` is
the top rung:

> `hud.security.coverage-met`: `Covered`
> `hud.security.coverage-met-hint`: `This prison has the guards it asks for.`

That sentence is **true about posting and silent about everything else the same
guards would have done.**

### The ladder, measured

`tests/integration/security-coverage-versus-response.test.ts`, seed `0x893`,
one prison, twelve prisoners against one bed so that
`resolveOccupancyScaledGuardCount` asks for `ceil(12 / 8) = 2`, sixteen in-game
days, and the *only* difference between rows is the hire count:

| hired | panel badge | spare pool | resolved | lapsed | dispatched | contraband | routeFailures |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `Understaffed` | 0 | 0 | 9 | 0 | 0 | 0 |
| **2 — the requirement** | **`Covered`** | 0 | **0** | 9 | **0** | **0** | 0 |
| 3 | `Covered` | 1 | 0 | 9 | 0 | **2** | 0 |
| 4 | `Covered` | 2 | 3 | 6 | 6 | 2 | 0 |
| 6 | `Covered` | 4 | **10** | **0** | **34** | 2 | 0 |

Four things in that table are the subject of this document.

**The panel's own advice buys nothing the panel speaks about.** Rows 1 and 2
differ by exactly the hire the `Understaffed` hint asks for. Every outcome
column is identical. Following the advice moves the badge and moves nothing
else.

**There is not one threshold above the requirement. There are three, and they
are exact rather than emergent.** Each is `required` plus what a claimant asks
for at the moment it claims:

- `required + 1` to search at all — the `'sector'` policy's
  `requiredGuardCount: 1`
  (`src/simulation/contraband/default-search-policies.ts:65`);
- `required + 2` to answer a severity-3 assault and `required + 4` to answer a
  severity-8 riot — `max(1, ceil(severity * respondersPerSeverityPoint))` with
  `respondersPerSeverityPoint: 0.5`
  (`response-system.ts:300`, `:26`).

Row 6's 34 dispatches are 3 assaults × 2 plus 7 riots × 4, exactly. That the
arithmetic closes is what makes these identifiable as the two claim rules rather
than as an unexplained step.

**`routeFailures` is 0 in every row**, so this is a claim that was never made
rather than a route nobody could walk. The obvious confound is refuted rather
than assumed.

**And the escape hatch works.** Hiring `requiredResponderCount(severity)`
guards *while* an incident is open resolves it: a prison at its requirement has
no shortage, so `assignUnassignedGuards` posts nobody new and the hire stays
claimable for the response system's next update. The last case of the
instrument measures exactly this. No channel in the game says it exists.

### What is documented, and the one sentence that is wrong

The **search** coupling is deliberate and stated in terms, twice.
`SectorSearchDutySystem`'s docblock:

> a prison that hires exactly its posted requirement never searches, and the
> first guard hired past that requirement is what makes contraband findable.
> Nothing here takes a guard off a wall.

and `docs/CONTRABAND.md` "Who orders a search" says the same. ADR 0073's
consequences price it: *"a guard away searching is a guard not suppressing riot
pressure … This is a real balance coupling and it is stated rather than
discovered."* **So issue #893 is wrong to call the contraband threshold
undocumented.** It is documented in the source, in `docs/CONTRABAND.md` and in
an ADR. What is true is that it is documented nowhere a *player* can reach, and
that it is a different number from the response thresholds.

The **response** coupling is stated in `docs/INCIDENTS.md`, and the statement
contains a false step:

> `DeploymentSystem` and `IncidentResponseSystem` draw from the same
> `unassignedGuardIds()` pool, so a staffing shortfall — the term that makes a
> riot possible at all — exists exactly when the responder pool is empty. A riot
> in a one-sector prison therefore cannot be answered by the guards whose
> absence caused it; it is answered by guards hired *after* it starts, inside the
> 600-tick `responseDeadlineTicks`. That is coherent play rather than a defect…

**"Exists exactly when" is the error.** An empty pool is *implied* by a
shortfall and does not imply one: row 2 of the table has `shortage: 0` and
`spare: 0`. The paragraph's conclusion — that this is coherent play — rests on
the reader picturing a prison that is *visibly* short, where the panel is
already telling the player to hire. The prison in row 2 is being told the
opposite. That sentence is corrected on this branch, with the row-2
counter-example, because a wrong load-bearing claim in a reference document is
not this decision's to leave standing while the decision waits.

### Where the two budgets already are, and the number already on screen

`staffingShortfall` is `shortage / required`, so **posted guards buy
prevention**: `docs/INCIDENTS.md`'s own reachability table shows one guard
turning a rioting prison quiet. **Spare guards buy response and search.** The
game is therefore already a two-budget design, and it is a good one — the
interesting question *"do I post this guard or keep them free?"* is exactly the
opportunity cost ADR 0053's research isolates as the thing that makes a staffing
choice a decision at all.

**The Staff panel already renders the second budget.** Immediately below the
coverage block, `hud.security.held-summary` is
`'{held} held · {unassigned} free'` (ADR 0034's on-duty block), so a player at
their requirement reads `Covered · This prison has the guards it asks for.`
directly above `2 held · 0 free`. The missing thing is not the free count. It is
that **no number anywhere says how many free are needed**, and the block that
is supposed to be about having enough guards says the prison has enough while
the block below it says it has none spare.

### What comparable management sims do

The families ADR 0053 identified split again on this axis, and the split is
informative.

**Prison Architect** is the closest comparison, and it is a two-budget design
in which the player can see both budgets. Deployment assigns guards to sectors
and to patrol routes; a guard not so assigned is free, and free guards are what
answer a callout — the same split Lockstate has. The difference is that the
assignment is the player's explicit gesture there and derived here, so a
Prison Architect player who posts every guard has *chosen* to, and can see on
the same screen that they have. **Stated as a shape rather than quoted**: ADR
0053 did the sourced version of this research and this document does not repeat
it, so what is claimed here is only the structure, and the structure is the part
the argument uses.

**RimWorld** is the one-budget design: there is no post, and drafting a colonist
pulls them off whatever they were doing, with the interruption as the cost. That
is candidate 3 below, and note what it implies — RimWorld can do it because
*every* pawn has a job to be pulled off, which is the same precondition ADR 0053
identified as absent here for its competence scalar.

**Two Point Hospital** splits the difference: staff assigned to a room stay in
it, and a roaming pool handles what arrives. What is worth borrowing is that
its staffing readouts are **per duty** — a room states the staff type it wants
and says when it is short of one — rather than one aggregate over the whole
payroll, which is the shape decision 1 proposes.

## Decision

**Recommended: decision 1 alone. Decisions 2 and 3 are recorded as rejected for
now, with the measurements that reject them and the conditions that would
reopen them.**

### 1. The requirement is right; the account of it is wrong, and the fix is a second published figure

`requiredGuardCountFor` stays exactly as ADR 0048 decision 3 left it, and the
pool stays one pool. What changes is that the coverage read model publishes a
**response and search reserve** beside `required`/`assigned`/`shortage`, and
`describeStaffCoverage` gains a rung between `Covered` and `Understaffed` for
the state row 2 of the table is in: *every post filled, nothing spare*.

**Why a second figure rather than a bigger first one.** See the refutation of
candidate 1 under "What was rejected" — raising `required` is not a partial fix
that helps a little, it is strictly worse at identical cost, because the same
number is the posting cap and the advice.

**What the reserve figure should be, and this is the open part.** The response
requirement is severity-dependent and severity is not known before an incident
opens, so a published reserve is necessarily an estimate of the worst incident
this sector can currently produce. Two candidate definitions, and this document
does not choose between them because the choice is balance rather than
architecture:

- `requiredResponderCount` of the highest severity the game can produce — the
  reserve that answers anything. There is no exported ceiling constant to reach
  for: a riot's severity is clamped inline to 10
  (`src/simulation/incidents/trigger-system.ts:373`) and an assault's to
  `ASSAULT_SEVERITY_CEILING`, 5 (`src/simulation/incidents/flashpoint.ts:373`),
  so taking this option means authoring that ceiling somewhere it can be read
  by both the response system and a projection. At 10 the figure is
  `ceil(10 × 0.5) = 5`, against the 4 that actually sufficed in the measured
  prison.
- a reserve derived from the sector's current risk band, so a calm prison is
  asked for less. It tracks the prison the player has, and it moves on its own
  between pulls — which puts it in
  [ADR 0086](./0086-what-refreshes-a-pulled-hud-readout.md)'s territory, since
  the Staff panel's coverage block is a *pulled* readout on a cadence
  (`StaffCoverageReader`) and a figure that drifts while nothing is pressed is
  a figure whose refresh rule has to be decided before the figure exists.

The first is a constant and honest about being a ceiling; the second is
informative and unstable. **The first is recommended** on the same ground ADR
0048 chose a constant divisor: a number a player can plan against beats a number
that is right on average.

**What the sentence must convey, in the two states, authored by nobody here:**

- At the requirement with nothing spare — the row-2 state, a *new* rung: that
  every post is filled, **and** that a prison with nobody spare cannot answer an
  incident or run a search, **and** roughly what it costs to have both (the
  reserve figure). It must not read as a failure — the posts really are filled —
  and it must not read as sufficiency either.
- At `Covered` with a reserve — the existing rung: that the prison can both hold
  its posts and answer what happens. The current sentence, *"This prison has the
  guards it asks for"*, would become true of exactly this state and could stand.

**What this costs.** A field on `StaffCoverageRowViewModel` and its sum in
`projectStaff`, three lines in `staffCoverageFromProjection`, one rung in
`describeStaffCoverage`, two locale keys, and the save schema is untouched
because nothing new is persisted — the reserve is derived at read time from
content and the incident policy, exactly as `required` is derived from occupancy.
It adds no command, no control and no RNG.

**What it does not fix, said plainly.** A player who reads the new rung and
declines to hire the reserve still gets a prison where nothing is answered. This
decision makes the game legible, not easier. That is the correct division:
`AGENTS.md`'s fourth exclusion is about promises the code does not keep, and the
defect in #893 is a promise, not a difficulty.

### 2. Posting does not reserve. *Rejected for now.*

The shape would be: `assignUnassignedGuards` leaves `R` claimable guards
unposted, so a prison hiring its requirement is short of posts but able to
answer.

**Why not.** It inverts which budget the player controls. A shortfall the player
cannot clear by hiring — because the reserve rule re-opens it — is the worse
half of #893's own complaint, not its cure: the panel would then say
`Understaffed` for ever, and *that* sentence would be the false one. It also
puts a second copy of the staffing rule where ADR 0053 decision 3 put one
(`sector-search-duty.ts`'s own comment declines to do exactly this, for exactly
this reason), and it silently changes what every existing coverage assertion in
`tests/integration/security-*.test.ts` means.

**What would reopen it.** A second sector. With two sectors the reserve can be
*a sector*, not a rule inside one, and ADR 0092's post/duty surface is what
makes that authorable by a player rather than derived behind their back.

### 3. Responders may be claimed from posted guards. *Rejected for now, and it is the one worth revisiting.*

The shape would be: `claimableResponders` may take an `'on-post'` guard,
`walkBackToPost` (which already exists,
`deployment-system.ts:170`-`:178`) returns them, and the sector runs short
*during* the incident.

**It is the option that makes the panel's existing sentence true**, and its
effect was measured rather than argued. Mutating `claimableGuardIds` to filter
`allGuardIds()` instead of `unassignedGuardIds()` and re-running the instrument:
the row-2 prison — two guards, `Covered` — goes from `0 resolved / 9 lapsed / 0
dispatched` to **`3 resolved / 6 lapsed / 6 dispatched`**. It answers its three
assaults and still loses all seven riots, because two guards cannot make the four
a severity-8 riot asks for. So it does not trivialise the game; it makes the
requirement mean *"can answer small things"* instead of *"can answer nothing"*.
Five of the instrument's six cases go red under that mutation, which is also
the proof that the instrument is load-bearing.

**Why not now, on three counts.**

*It is the largest change to what a claim means.* `'on-search'` is a phase with
two producers, and `releaseOrphanedClaims` defines a responder *negatively* —
an `'on-search'` guard no search job names — precisely so that a save can be
recovered without a record. A third origin for an `'on-search'` guard, one who
has a sector to go back to, has to be reconciled against ADR 0033's
abandon-and-remount and ADR 0034's release surface, and a guard whose post was
taken while a save was open is a new restore case rather than an existing one.

*The naive form breaks the one-function rule.* `DeploymentSystem` calls the same
`claimableGuardIds`, so widening it would let deployment re-post the very guard
a response is holding. The correct form is a *second* function beside it — the
claim pool for a duty that may pre-empt a post — which is an addition to ADR
0053 decision 3 rather than an edit to it, and that is the amendment this
document is not entitled to make alone.

*And the drama it buys needs decision 1 anyway.* A posted guard leaving raises
`staffingShortfall` mid-incident, so answering a riot makes the next one likelier
— which is good play and is exactly the tension a player cannot see today,
because no readout distinguishes posted from spare. Decision 1 is a precondition
for decision 3 being legible, not an alternative to it.

**What would reopen it.** ADR 0092's `SetSectorPost` landing, which gives a
player something to say about where the pre-empted guard came from; or an owner
ruling that a prison at its requirement must be able to answer *something*,
which is a product position and a defensible one.

### 4. Nothing here retunes a number

`respondersPerSeverityPoint`, `DEFAULT_SECTOR_PRISONERS_PER_GUARD`, the sector
policy's `requiredGuardCount` and `DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS` are all
left where they are. Every one of them is documented in its own module as a
directional default rather than a balance decision, `docs/BENCHMARKING.md`
forbids a threshold set from a single controlled run, and this document has one
prison. The instrument is what a retuning pass should argue against.

## Consequences

### What a player sees, if decision 1 is taken

- A prison that has filled its posts and has nobody spare reads as its own state
  rather than as `Covered`, and is told what a reserve costs. **This is a visible
  change to an existing save**, and it is the correct one: that prison was never
  able to answer anything.
- `Covered` becomes a statement about both budgets, so the existing sentence
  becomes true of the state that still shows it.
- Nothing is taken away and no gesture changes. The Staff panel's hire button,
  the roles it offers and the release surface are untouched.

### What it does not change

- **No persisted state, no `SAVE_SCHEMA_VERSION` bump, no migration, nothing in
  `supabase/migrations/`.** The reserve is derived at read time from the
  incident policy and content, the way `required` is derived from occupancy.
- **No RNG and no new stream**, so ADR 0038 decision 2's absent-stream rule is
  not engaged.
- **No simulation behaviour at all.** Decision 1 is a read model and a sentence.
  A prison that ignores the new rung plays exactly as it plays today, which is
  what makes this separable from decisions 2 and 3 and shippable before them.

### What it costs elsewhere

- `tests/integration/staff-coverage-readout.test.ts` and
  `tests/unit/ui-hud-messages.test.ts` gain the new rung and its two keys.
- `docs/SECURITY.md`'s coverage section and `docs/INCIDENTS.md`'s response
  section each gain a sentence naming the reserve, and
  `docs/INCIDENTS.md`'s "exists exactly when" paragraph is corrected on this
  branch regardless of whether any decision here is taken.
- `tests/foundation/unconsumed-content-contract.test.ts` is the gate that would
  catch a locale key added without a reader, which is the failure mode
  `AGENTS.md`'s fourth exclusion names — so the key and the rung must land in one
  change, never a key first.

## Open questions

1. **Which reserve definition?** The ceiling constant or the risk-derived one.
   Recommended above, not settled; it is a balance judgement and #29 owns the
   surrounding numbers.
2. **Does the reserve belong to the sector or to the prison?** Today one sector
   is derivable, so the two are the same number. `projectStaff` sums per-sector
   shortages rather than netting them, and a reserve almost certainly should
   *not* sum — two sectors do not each need their own riot squad if neither is
   rioting. That is a decision for the day a second sector exists, and it is the
   same day decision 2 becomes available.
3. **Should a search sweep and a riot response draw from the same reserve?**
   They do today. A reserve figure that covers a riot also covers every search,
   so decision 1 needs no separate search number — but if decision 3 is ever
   taken for responses and not for searches, they stop being one reserve and
   this question is live.
4. **Is `requiredResponderCount` the right shape at all?** It asks for four
   guards for a severity-8 riot in a prison whose whole requirement is two, so
   the reserve is larger than the posted force in every small prison. Whether a
   response should instead scale with the *prison* rather than with the incident
   is a question this document raises and does not answer.

## What would change my mind

**The weakest claim here is that decision 1 is sufficient**, and the honest
statement of its limit is that it converts a lie into a bill. A player told
*"you need five spare guards to answer a riot"* in a prison whose whole
requirement is two may reasonably read that as the game asking for something
absurd — and question 4 is the reason they might be right. If the reserve figure,
once computed, is routinely larger than the posted requirement, then the defect
is not the account after all: it is `requiredResponderCount`, and decision 4's
refusal to retune is what needs revisiting first.

Two smaller things would move me:

- **ADR 0092's post surface landing before this is settled.** It makes decisions
  2 and 3 authorable rather than derived, and a derived reserve is a worse
  answer than a player-placed one.
- **A measurement in a nine-room prison.** #893 names this as its own weakest
  claim and it is right to: every figure here comes from one twelve-prisoner,
  one-bed, one-sector prison at a single seed. If a larger prison's incident rate
  turns out to be need-driven rather than quiet-period-driven, the flat zero in
  row 2 is still real — it is a fact about the claim pool, not about the threat —
  but the ladder's spacing, and therefore the reserve figure, would need
  re-measuring.
