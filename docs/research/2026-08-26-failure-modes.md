# What failing should look like, and the cheapest honest route to it

Research record for the open product question *"the game has no failure mode."*
Nothing in the repository was changed to produce it, and it recommends no code.

Read at `main` @ `87516a8` (**v0.0.84**). Every repository claim below was
opened at that commit or measured by driving that tree; where a measurement is
quoted, the shape of the session that produced it is stated so it can be
re-run and disagreed with.

## How to read the evidence labels

The tiers are [`docs/research/README.md`](./README.md)'s and the reasons are
there. What each one means in this record specifically:

- **VERIFIED** — I opened the artifact and quote it, or I drove this tree and
  report what it did. For external material that means a file fetched from
  `raw.githubusercontent.com`: an unofficial community mirror of a shipped data
  file or a machine decompilation. A mirror can be stale or edited. It is not a
  vendor specification and it is never evidence of intent.
- **MEASURED** — a sub-case of VERIFIED, used where the claim is about
  behaviour rather than text: I ran this tree through its real kernel and real
  command router and report the numbers. The session shape is always given.
  Nothing measured here was left behind in `tests/`; these were throwaway
  probes and the record is the artifact.
- **SEARCH-SUMMARY** — a real page exists and a search tool summarised it; I
  never opened the page. Hearsay. **Nothing labelled SEARCH-SUMMARY carries
  weight in any conclusion below**, and where a search summary offered precise
  figures they are reproduced once, flagged, and used for nothing.
- **FROM MEMORY** — believed, unchecked.
- **UNKNOWN** — I could not establish it and am not guessing.

One note on tooling, because the previous round recorded the opposite and it
has changed: `2026-08-25-economy-rate.md` reports `WebFetch` returning
`EGRESS_BLOCKED` on both Prison Architect wikis. Web *search* answered in this
session, and `raw.githubusercontent.com` fetches answered directly over
`curl`. So the mirror route the tier definitions were written around still
works, and search is available as the weak tier it is described as.

---

## 0. The premises I was handed, and what happened to them

The brief that produced this record stated several things as established. Two
did not survive, one survived in a stronger form than it was stated in, and one
survived only as a claim about modules rather than about behaviour. They are
first because the rest of the record depends on them.

### 0.1 "The game has no failure mode except running out of money" — **false, and false in the direction nobody expected**

**Running out of money is not a failure mode either.** VERIFIED.

`Treasury.spend` refuses rather than overdrawing and returns `false`
(`src/simulation/economy/treasury.ts`). The balance is validated as a
non-negative safe integer in the constructor, in `credit` and in `restore`, so
a negative balance is not representable. And nothing debits the balance on a
schedule: the only two callers of `credit` are `ProcurementSystem.cancel` (a
refund) and `StateIncomeSystem.update` (the income line), and the only
outgoings are a material purchase and a one-off hire charge, both of which the
player chooses to make.

So "out of money" in this game means *every discretionary purchase is refused
and nothing else changes*. It is not a spiral, it has no floor to hit, and it
cannot get worse on its own. `treasury.ts` says this itself, at length, and
names the missing piece exactly: decision 8's ladder is "still unreachable,
because `spend` refuses rather than overdrawing and nothing debits the balance
on a schedule". The premise is not merely wrong; the file the premise is about
already records the correction.

Worse for the premise: in a running prison the balance only goes **up**.
Measured on a session with one zoned `room.cell`, one bed, one admitted
prisoner, run ten in-game days: the balance is 27,935 — 25,000 opening, minus
65 for the plank, plus ten days at 300. MEASURED. Once the player stops
building, the treasury is monotonically non-decreasing. There is no downward
slope anywhere in the game.

### 0.2 "money is spent on materials and staff" — **true of materials, and misleading about staff**

VERIFIED. `StaffHiringService.hire` spends `wageBand.minPerDay` once, at the
tick the `HireStaff` command is dispatched, and `src/simulation/staff/hiring.ts`
is explicit that this "is an engagement charge and **not** a payroll: it does
not recur, it creates no schedule". `wageBand` is authored for all eight roles
in `src/content/staff-role-catalog.ts` and read in exactly one place, for that
one-off charge. Staff cost money to *acquire* and nothing to *keep*.

### 0.3 "earned per occupied place at day's end" — **true, and it is the only line that moves the balance up**

VERIFIED and MEASURED. `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` is 300;
`StateIncomeSystem` runs on `{ intervalTicks: 2400, phaseTicks: 2399 }` and
credits `300 × totalOccupancy` at the end of each in-game day.

### 0.4 "occupancy is hard-gated" — **true, and harder than stated**

The brief describes the gate as living in the registry. It also lives at the
**command**. MEASURED: `AdmitPrisoner` sent to a prison with no furnished cell
is refused outright with reason `admit.no-accommodation`, and no entity is
spawned at all. There is no queue of unhoused arrivals in a real session; there
is a refusal.

That matters more than a detail of placement, and §3 is about why: the same
gate that makes overcrowding unrepresentable is what makes a riot unreachable.

### 0.5 "incidents, riots, sector risk, contraband and informants all exist as simulation systems" — **true of the modules; not true of any session**

The modules exist and are substantial. `IncidentTriggerSystem` and
`IncidentResponseSystem` are registered on the kernel in
`src/simulation/runtime/new-session.ts`. But **no incident of any kind can fire
in a session a player can start**, for three independent reasons, all VERIFIED
by reading and confirmed by measurement:

1. `IncidentTriggerSystem` iterates `incidentSectorIds`, a mutable array
   constructed empty. The only writer anywhere in `src/` is the *restore* path
   (`session-systems.ts`, repopulating it from a save that already had entries).
   No command writes it. Its loop body therefore never executes.
2. `SecuritySectorRegistry` is likewise only ever populated on restore, so
   there are no sectors for a watcher to watch.
3. There are eleven commands in the protocol —
   `PlaceBuildOrder`, `CancelBuildOrder`, `ZoneRoom`, `UnzoneRoom`,
   `PurchaseMaterials`, `AdmitPrisoner`, `HireStaff`, `PlaceObject`,
   `RemoveObject`, `Undo`, `Redo` (`src/simulation/protocol/commands.ts`) — and
   **none of them creates a sector, a deployment schedule, a search policy, a
   gang, a tunnel or a contraband item.**

`docs/INCIDENTS.md` already says the honest version of (1) and (2): "No
incidents, gangs, tunnels or watched sectors exist until a session/scenario
registers them." What is not recorded anywhere I could find is that **the
condition that sentence defers to does not exist**: there is no scenario type,
class or module under `src/` at all. Issue #33 has the scenario framework in
scope and it is unbuilt. So the deferral is not a deferral to a later caller;
it is a deferral to a caller that has never been written.

The reachability consequences are wider than the trigger. VERIFIED by grep over
`src/`, excluding each symbol's own defining module:
`resolveEscapeOpportunity`, `summarizeIncidents` and `toIncidentAlert` have
**zero callers**; `TunnelRegistry.start` and `TunnelRegistry.advance` are never
called; `GangRegistry.addMember` is called only by its own snapshot loader; and
`src/simulation/presentation/incident-projection.ts` is reached only by the
barrel export in `presentation/index.ts`. Issue #287 records this class of
finding under the name "two finished capabilities have no caller"; the incident
tree is a third and larger instance of it.

**Marked rather than rewritten, 2026-08-29 (issue #555).** Three of those
claims have since been acted on and are no longer true of `main`, and the
paragraph above is left standing because it is what the grep found on
2026-08-26. `toIncidentAlert` was **deleted** rather than given a caller — it
was superseded by `incident-projection.ts`, and the argument is in
`src/simulation/incidents/incident-summary.ts`, the file that was `alerts.ts`.
`incident-projection.ts` is no longer reached only by a barrel: `projectIncidents`
and `projectIncidentDetail` are served on the `hud/incidents` route by
`src/simulation/worker/projection-catalog.ts`. `GangRegistry.addMember` is
still reached only by its own snapshot loader, which is why no session a
player can start opens a gang-retaliation incident.

### 0.6 "the queue is currently empty, so a row you add is the only one" — **false**

`docs/adr/STATUS-QUEUE.md`'s own heading reads *"One decision is awaiting
approval"* and its §2 holds **ADR 0029** above the account of why the queue had
previously been emptied. VERIFIED by opening the file. Anything added there
would be the second row, not the only one. This record adds nothing to it; see
§6 for why.

### 0.7 "#348 made construction cost time as well as money" — **true**

VERIFIED at the source rather than taken from the brief:
`src/simulation/construction/system.ts` documents and implements one build
crew, whose freedom is "decided once, before the walk", with a waiting order
taking the crew in ascending id order. `docs/research/README.md`'s own
"overtaken" note on the older finding gives the measured figures (a twelve-wall
perimeter finishing at tick 730 rather than 70). So half of the original
complaint really is closed, and money is no longer the only constraint on
building.

---

## 1. What a real session actually does, measured

One shape of session, driven through the real kernel, the real decoder and the
real session command router — the same shape
`tests/integration/object-placement-loop.test.ts` uses, so it is a shape the
repository already agrees is a player-reachable prison. Commands:
`PurchaseMaterials` one `item.wood-plank`; `ZoneRoom` a 2×3 `room.cell`;
`PlaceObject` a `bed-wooden` inside it; step to tick 200; `AdmitPrisoner`; step
on.

**After ten in-game days (24,000 ticks).** MEASURED.

| Reading | Value |
| --- | --- |
| treasury | 27,935 (opened at 25,000) |
| rooms / roomCapacity / roomOccupants | 1 / 1 / 1 |
| activeIncidents | 0 |
| contrabandDiscovered | 0 |
| staff | 0 |
| incidents ever opened | 0 |
| trigger metrics (triggered / riots / retaliations) | 0 / 0 / 0 |
| response metrics (resolved / lapsed / dispatched / route failures) | 0 / 0 / 0 / 0 |
| watched sector ids | `[]` |
| registered security sectors | 0 |
| deployment schedules / search policies | 0 / 0 |
| intake (completed / failed / accommodation backlog ticks) | 1 / 0 / 0 |
| sector-risk tracker entries | 0 |
| prisoner needs (0–255) | hunger **0**, sleep 255, hygiene **0**, bladder 54, safety **253**, recreation **0** |

The needs row is the most interesting line in the table, and it is worth saying
out loud what it describes: **after ten days the one inmate is at zero hunger,
zero hygiene and zero recreation, and nothing in the game responds to any of
it.** VERIFIED that nothing responds — the only readers of `NeedsComponent`
outside its own module are `prisoners/utility-ai.ts` (which uses a deficit to
pick the next action), the sector-risk sampler in `new-session.ts` (which reads
`safety` only), and `presentation/prisoner-projection.ts` (which renders it).
There is no health, no injury, no death, no morale and no productivity for a
need at zero to feed.

### 1.1 The starvation is not a content gap, it is unconditional

A second probe traced the same prisoner's chosen action and needs every 200
ticks, then every 10 ticks across the second day. MEASURED: over a whole
in-game day the prisoner performs exactly two actions — `action.sleep` and
`action.use-toilet` — and `hunger` falls by exactly 10 levels per 200 ticks
throughout, which is `NEED_DECAY_PER_TICK.hunger` of 0.05 with no offsetting
gain ever applied. It is never restored, in any window, including the three
`meal` blocks the general-population regime authors at tick-of-day 400–500,
1,200–1,300 and 2,000–2,100 (`src/simulation/prisoners/regime.ts`).

That is not "the prison has no canteen". `action.eat-in-cell` targets
`own-accommodation` and declares **no** `requiredObjectCapability`
(`src/simulation/prisoners/actions.ts`), so a bare cell should satisfy it. Why
it is never selected is **UNKNOWN** — I did not trace the selection, and
`action.sleep`'s `minDurationTicks: 200` against a 100-tick meal block is a
plausible mechanism that I did not confirm. I am recording the measurement and
declining to name the cause. Two smaller observations from the same trace, both
MEASURED and both with **UNKNOWN** cause, in case they are the same bug seen
from two sides: `action.use-toilet` declares
`requiredObjectCapability: 'sanitation'` and visibly restores `bladder` in a
cell containing only a bed; and `action.sleep` runs continuously across
tick-of-day 380–520, a window in which the general-population regime allows
only `meal` and `hygiene`.

**These belong in an issue, not in this record's recommendations.** They are
named here because a failure mode built on unmet needs would be built on top of
them, and because the first thing anyone builds it will hit them.

---

## 2. The three shapes, and which of them this codebase can express

Definitions first, because the whole question turns on keeping them apart.

- A **loss condition** ends the run. The session is over; the player restarts,
  reloads, or takes a different prison.
- A **degradation spiral** makes things worse in a way that feeds itself, and
  the player can still climb out. It has a *slope*, and the slope is the point:
  each thing that goes wrong makes the next thing likelier.
- A **soft failure** is a metric going red with nothing enforcing it. The
  player is told, and the game does not care.

Against that, and this is the summary of §§0–1:

| Shape | Can this tree express it today? |
| --- | --- |
| Loss condition | **No.** Nothing anywhere in `src/` ends, halts or invalidates a session on any game-state condition. And for the money case it must not: see §2.1. |
| Degradation spiral | **No, and this is the real gap.** Nothing recurring debits the treasury, so there is no downward slope for a spiral to run down. Nothing converts an incident outcome into a later input. Nothing converts a need at zero into anything. There is no feedback edge in the graph at all. |
| Soft failure | **Yes — three of them already ship.** Three needs sit at zero and are rendered. `Treasury.spend` refuses and the refusal is surfaced through `RefusalLog` and the HUD's refusal notice. And the status strip carries an `activeIncidents` chip wired to the real `IncidentLog` (`src/simulation/worker/status-counts.ts`) that is structurally pinned at 0. |

So the honest statement of the gap is not "the game has one failure mode and
needs more". It is: **the game has three soft failures and no slope.** Every
signal a failure mode would need to read already exists and is already
displayed; nothing consumes any of them, and nothing gets worse.

### 2.1 One of the three shapes is already decided, and it is worth not re-deciding

[ADR 0017](../adr/0017-money-primary-resource-model.md) is **Accepted**, and its
decision 8 reads: *"Insolvency is a state, not a loss condition."* Its reasoning
section is explicit about the ladder — "at a negative balance the state stops
paying for discretionary things in a defined order and the prison degrades
visibly — deliveries refused first, then construction halted, then staff unpaid
with the morale and incident consequences that follow. No game-over, no silent
stall" — and about why: "a session that ends removes the interesting part, which
is digging out". VERIFIED by opening the ADR.

It also names its own cost, and the sentence deserves to be the frame for
everything in §4: **"degradation has to be authored and surfaced, or insolvency
becomes the same invisible stall as #89. That is real work, and it is the cost
of this answer."**

And it names the unblocker, in one sentence, correctly: the ladder "becomes
reachable when a recurring charge exists that the player cannot decline". That
is the single most useful sentence in the repository on this subject, and it was
written before this record.

---

## 3. Why the riot cannot fire — and the reason is not the missing producer

§0.5 establishes that nothing registers a watched sector. The natural reading is
that the incident pipeline is four pieces with a missing joiner, and joining
them is cheap. **That reading is wrong, and this is the finding I would most
want a reader to take away.**

I wired the pipeline by hand in a probe — registered a `SecuritySectorRegistry`
sector whose post tile is the cell's anchor tile, pushed a real
`constantDeploymentSchedule` requiring four guards, pushed the sector id into
`incidentSectorIds`, hired nobody, admitted one prisoner into the furnished
cell, and ran 60,000 ticks (25 in-game days). MEASURED:

| Reading | Value |
| --- | --- |
| coverage report | `required: 4, assigned: 0, shortage: 4` — maximum possible staffing shortfall |
| sector risk latest score | **0.3196** |
| consecutive hot samples | 0 |
| incidents opened | **0** |
| prisoner needs | hunger 0, sleep 255, hygiene 0, bladder 54, safety **253** |

The threshold is `hotThreshold: 0.6`, needing three consecutive hot samples
(`DEFAULT_SECTOR_RISK_POLICY`, `src/simulation/incidents/sector-risk.ts`). The
score never came within half of it, with every input the wiring can supply
pinned at its worst.

Here is the arithmetic, and it is a closed argument rather than a balance
observation. `scoreSectorRisk` is
`0.5·needsPressure + 0.3·staffingShortfall + 0.2·contrabandPressure`, clamped.

1. **`contrabandPressure` is structurally 0.** It is the maximum confidence of
   `IntelligenceLedger` records scoped to the sector, and nothing in `src/`
   creates a contraband item or an intelligence record — no command does, and
   grep finds no producer outside the contraband modules themselves. VERIFIED.
2. **So the maximum reachable score is `0.5·needsPressure + 0.3`**, and
   clearing 0.6 requires `needsPressure ≥ 0.6`.
3. **`needsPressure` is the `safety` need, and only the `safety` need.** The
   default sampler in `new-session.ts` computes
   `(NEED_MAX − needs.get(index, 'safety')) / NEED_MAX`, averaged over the
   prisoners standing on the sector's post tile. VERIFIED.
4. `needsPressure ≥ 0.6` therefore means **`safety ≤ 102`** out of 255.
5. **`safety` is the one need the entry condition guarantees is satisfied.**
   `safety` decays at 0.01 per tick, the slowest of the six. `action.sleep`
   raises it at 0.2 per tick — twenty times its decay — and `action.sleep`
   requires a `'sleep-surface'`, which is exactly what `AdmitPrisoner` refuses
   without (§0.4). MEASURED: `safety` never left 237–255 across ten and
   twenty-five in-game days.

**A prisoner can only exist in this prison if they have a bed; having a bed
means they sleep; sleeping pins `safety` near maximum; `safety` is the only need
the risk sampler reads. The hard gate on occupancy and the riot trigger are
wired in mutual exclusion.** VERIFIED, and it is the reason "just join the four
pieces" is not the cheap fix it looks like.

> ### CORRECTION, 2026-08-26 (#396, [ADR 0036](../adr/0036-a-derived-default-security-sector.md)): the mutual-exclusion finding is false, and §7 named it as this record's strongest claim
>
> §7 says of the paragraph above: *"The arithmetic in §3 is solid — I would
> defend the mutual-exclusion finding against anything."* The arithmetic is
> solid. **Step 5's premise is not**, and it fails at the first clause: *"a
> prisoner can only exist in this prison if they have a bed"*.
>
> `PrisonerOperationsRuntime.requestAdmission` refuses when **no room instance
> of any accommodation target exists**. It does not refuse when one exists and
> is full. So a prison with one zoned cell and one bed admits a second and a
> third arrival; `IntakeSystem` leaves them at the `accommodation-assignment`
> stage, they never reach `action.sleep`, and nothing raises their `safety`.
>
> MEASURED on this tree, one furnished cell and three `AdmitPrisoner` commands
> (`tests/integration/security-default-sector.test.ts`):
>
> | tick | housed prisoner `safety` | the two unhoused | their tile |
> | --- | --- | --- | --- |
> | 500 | 255 | 252 | (16, 16) |
> | 5,000 | 255 | 207 | (16, 16) |
> | 30,000 | 249 | **0** | (16, 16) |
>
> Their tile is the arrival tile, which is also the derived sector's post tile,
> so `resolveSectorOccupants` counts them and `needsPressure` is theirs alone.
`IncidentTriggerSystem` samples every 50 ticks, and MEASURED: the score is
> 0.598 at tick 15,450, reaches the `hotThreshold` of 0.6 exactly at **15,500**
> (the first hot sample), 0.6 again at 15,550, and 0.602 at **15,600**, where the
> three-sample window opens a **severity-6 riot** — with a sector registered by
> ADR 0036 rather than by a probe, and every other input exactly as this record
> describes it.
>
> **So the reachable pressure was overcrowding after all**, which is the reading
> `docs/research/README.md` records this record as having closed off. The probe
> in §3 could not have found it: it *"admitted one prisoner into the furnished
> cell"*, so there was nobody unhoused to be the pressure. That is issue #375's
> shape — a fixture arranged so the thing under test cannot happen — met in a
> research probe rather than in a test.
>
> What survives unchanged: `contrabandPressure` is still structurally 0,
> `needsPressure` is still `safety` alone, and §7's actual weakest claim — that
> widening the sampler is small — is still unmeasured. What is withdrawn is the
> mutual exclusion and the sentence that a *"starving, filthy, unguarded,
> entirely unstaffed prison scores 0.32 and is assessed as calm"*: an
> **overcrowded** one crosses the threshold at 0.602 and rises toward 0.8 as the
> unhoused arrivals' `safety` reaches zero, and it riots.

The corollary is the sharper form of the room-occupancy record's finding.
`docs/research/README.md` records that *"'pack the prison' is not the reachable
failure mode"* because occupancy is hard-gated. That is true, and this is the
part it did not reach: the gate does not merely remove overcrowding as a
pressure, **it removes the only pressure the risk model can read.** A starving,
filthy, unguarded, entirely unstaffed prison scores 0.32 and is assessed as
calm.

Two things follow that matter for costing anything in §4.

- **Widening the sampler is a content-free change with a real consequence.** A
  sampler that read `hunger`, `hygiene` and `recreation` — all three measured at
  zero — would take `needsPressure` to near 1.0 and the score to 0.8, and riots
  would begin firing in a prison that is currently silent. That is one function
  in `new-session.ts` and no new authored content. It is also the most
  dangerous change in this record, because it converts an unreachable system
  into one that fires immediately, on the back of a starvation whose cause is
  **UNKNOWN** (§1.1).
- **The 0.6 threshold and the 0.5/0.3/0.2 weights are declared as
  "directional defaults, not a committed balance decision"** in
  `sector-risk.ts`, which cites issue #28's exclusion of final balance. So the
  numbers are not the problem and moving them is not the fix. The *input set* is
  the problem.

---

## 4. What comparable games actually do

Ordered by how well I could source them, not by relevance. Every claim in §§4.1–4.3
comes from a file I fetched and read in this session.

### 4.1 RimWorld — one loss condition, it is population, and it is not terminal

**VERIFIED.** `RimWorld/GameEnder.cs` from a machine decompilation mirrored at
`Chillu1/RimWorldDecompiled`, fetched and read.

`CheckOrUpdateGameOver` runs one test, and it is a headcount. It returns early —
clearing `gameEnding` — if any map has a free colonist, if any pawn is carrying
a free colonist, if any player caravan or travelling transporter holds one, if
any colonist is on loan to a quest, or (with the Anomaly module) if the player
holds a corpse with death refusal. Only when every one of those fails does it
set `gameEnding = true` and `ticksToGameOver = 400`.

Three things are worth taking from the file rather than from the fact:

- **Money appears nowhere in it.** There is no wealth, debt or silver term in
  the end-game check at all. RimWorld's economy has no loss condition attached
  to it.
- **The ending is a letter, not a shutdown.** `GameEndTick` posts a
  `LetterDefOf.GameEnded` letter titled `"GameOver"` with body
  `"GameOverEveryoneDead"`. The simulation keeps ticking.
- **It offers a restart in place.** At `Mathf.Abs(ticksToGameOver) == 20000`
  (`NewWanderersDelay`), if `CanSpawnNewWanderers()` holds, it replaces that
  letter with a `GameOverCreateNewWanderers` choice letter. The same save
  continues with new people.

So RimWorld's "loss condition" is closer to a **narrated reset offer** than to
an end. The run ends; the file does not.

### 4.2 Oxygen Not Included — the same shape, and its own check contradicts its own text

**VERIFIED.** `Managed/main/GameFlowManager.cs` from the ONI decompilation
mirrored at `undancer/oni-data`, fetched and read.

`CheckForGameOver` returns immediately if `GenericGameSettings.instance.disableGameOver`
— so the loss condition is a setting — and otherwise tests
`Components.LiveMinionIdentities.Count == 0`. Population again, and again no
resource, no oxygen and no money term anywhere in the check.

The detail worth quoting is a dead branch. If the live count is non-zero the
method loops the duplicants asking `IsIncapacitated(item.gameObject)`, and that
method is:

```
public bool IsIncapacitated(GameObject go)
{
    return false;
}
```

So the incapacitation half never contributes. Meanwhile the shipped tooltip in
`Managed/main/STRINGS/BUILDING.cs` reads `NAME = "Colony Lost"`,
`TOOLTIP = "All Duplicants are dead or incapacitated"` — a description of a
condition the code does not implement. **VERIFIED, both files opened.** I draw
no inference about why; it is recorded because a repository that keeps a
STATUS-QUEUE for exactly this class of drift should know that shipped
commercial simulations carry it too.

### 4.3 Prison Architect — failure is an **opt-in toggle**, it is a *set*, and every member is warned first

**VERIFIED.** `data/language/base-language.txt`, the game's shipped localisation
table, mirrored at `originalfoo/Prison-Architect-API`, fetched and read. 2,960
lines. This is the single most directly applicable source in the record, and
four findings come out of it.

**(a) It is a toggle, listed among the other new-prison options.**

```
codex_option_failure                    Failure Conditions
codex_tooltip_failure                   An extra challenge! You will be sacked and it will be game over if you let things get too bad. (Riots, Bankruptcy, too many Deaths or Escapes, etc.)
```

It sits in the same block as `codex_option_intake` (Continuous Intake),
`codex_option_fogofwar`, `codex_option_gangs`, `codex_option_events` and
`codex_option_unlimitedfunds`. Whether it defaults on or off is **UNKNOWN** — a
localisation table cannot say — but its own wording, *"an extra challenge"*,
places it as something added to a baseline rather than as the baseline. Note the
neighbour: `codex_option_gangs` is also opt-in and also described as "extra
challenge", which is directly relevant to this repository, where `GangRegistry`
exists and has no producer.

**(b) It is seven named conditions, not one.** The `victory_*` keys enumerate
them: Bankruptcy, Uncontrolled Riot, Criminal Negligence (too many deaths),
Security Disaster (too many escapes), warden deaths, reoffenders, and illegal or
innocent executions. Money is **one of seven** and is not privileged.

**(c) Every one of them is two-stage: a warning with a deadline, then the
notice.** This is the structural finding.

```
victory_warning_bankrupt                You have 24 hours to avert financial disaster.
victory_warning_riot                    End this riot soon, or our government will be forced to assume control.
victory_warning_toomanydeaths           You face prosecution if too many more deaths occur today.
victory_warning_toomanyescapes          You will be fired if too many more escapes occur today.
```

and then, separately, an adviser warning pair and only afterwards a notice:

```
victory_adviserwarning_bankrupt1        We are bankrupt! Your disastrous management has led us to financial ruin.
victory_adviserwarning_bankrupt2        Find a way to fix this soon or you will be fired.
victory_advisernotice_bankrupt1         We have no choice but to declare bankruptcy and put the prison into administration. You have failed.
```

There is also a `victory_warning` / `victory_failure` / `victory_remaining` set
and a `victory_counter` reading `(*X today)`, so the pending state is a *counter
the player watches* rather than a surprise.

**(d) Insolvency has authored recovery, and the recovery is itself a mechanic.**
Two of them:

```
objective_grant_bailout                     Government Bailout
objective_grant_bailout_description         The government is deeply unhappy with your performance, but has decided your prison is too big to fail. Tax-payer funds will be issued to rescue the prison from bankruptcy. However you must balance your books - return your prison to a positive cashflow (daily income higher than expenses), and clear your debts with the bank.
```

```
researchtooltip_legaldefense            You're in a bad situation - something went terribly wrong and you've been put on notice. If it looks like you aren't going to be able to manage the situation, your lawyer can help get you off the hook. Completing this research will remove any current warnings that might otherwise result in you being fired.
```

A grant with conditions that is the reward for being in trouble, and a
purchasable clearing of pending warnings.

Two more from the same file, both directly relevant to §0.1:

- **Prison Architect's own answer to an unaffordable purchase is a refusal**, in
  the same words this repository chose independently:
  `failuremessage_cantafford  Insufficient Funds`. So `Treasury.spend`
  returning `false` is not a shortfall to be replaced; it is the genre-standard
  soft answer, and the loss condition is a *separate layer above it*.
- **A negative balance is represented as a loan, not as a negative number.**
  `research_bankloans` / `report_grants_bankloan_text` describe borrowing a lump
  sum against daily interest, with a credit rating that rises on payment and is
  "decimated" on a miss, and a maximum that rises with it — and
  `finances_category_loaninterest` puts the interest in the finance report as a
  recurring line. So the recurring charge and the negative balance arrive as one
  mechanism.

### 4.4 Theme Hospital — loss conditions are authored data, each with a *warning boundary* beside its *losing value*

This is the strongest structural match to what this repository needs, and it is
also the claim in §4 I am least sure of. Both halves stated plainly.

**What I opened.** CorsixTH is an open-source reimplementation of Theme
Hospital. Three files from `CorsixTH/CorsixTH` at `master`, fetched and read:
`Levels/example.level`, `Levels/original08.level`, and `Lua/endconditions.lua`.

**The mechanism (VERIFIED of CorsixTH).** A level authors `win_criteria` and
`lose_criteria` rows of the form
`Criteria.MaxMin.Value.Group.Bound`. `example.level` carries the legend for the
criteria numbers in the shipped file itself:

```
1 Total reputation
2 Balance total
3 Percentage people your hospital has handled
4 Percentage people have been cured
5 Percentage people have been killed
6 Hospital value
```

`endconditions.lua` names the same list (`reputation`, `balance`,
`percentage_cured`, `percentage_killed`, …), loads each row into a goal with a
`lose_value` and a separate `boundary`, and in `_checkLoseGroup` tests
`(measure - lose_value) * max_min > 0` for the actual loss while using
`boundary` only to build the Progress Report — including a `progress` fraction
`1 - ((measure - lose_value)/(boundary - lose_value))`. A group is a
**conjunction** (`met_count == total_count`), and groups are independent. The
check runs from `World:onEndYear` — once per in-game year — and `checkEndGame`
returns `"nothing"` if a level authors no goals at all.

Three properties are worth naming, because they are the design and not the
implementation:

- **The warning band is authored content, one field per criterion.** Every
  losing line ships with the threshold at which the player is *told* they are
  approaching it. This is precisely the "degradation has to be authored and
  surfaced" cost ADR 0017 names, discharged as a data field rather than as a
  system.
- **The report is derived from the same rows that end the run.** There is one
  definition of what failing means and the warning UI is a projection of it.
- **The cadence is coarse.** Annual. There is no per-tick loss check.

**Why the claim about *Theme Hospital* is weaker than the claim about CorsixTH.**
`original08.level` opens with a 2013 MIT copyright header naming a CorsixTH
contributor and the comment *"This is an extra configuration file loaded at
level 8 from the original game"* — a transcription, not shipped Bullfrog data —
and its very next line reads *"The win and lose on reputation would appear to be
the wrong way round"*, so the transcriber recorded a doubt about the numbers I
would otherwise be quoting. I therefore give the numbers once, as **what that
file contains** and not as what Theme Hospital shipped: lose criteria of
reputation with `lose_value` 200 and `boundary` 400; balance with `lose_value`
−1000 and `boundary` 10000; percentage killed with `lose_value` 25 and
`boundary` 20. The *shape* — three independent lose groups, each pairing a
losing value with a warning boundary — is VERIFIED of CorsixTH and is what §5
uses. The *figures* are VERIFIED of that file and **UNKNOWN** of the original.

### 4.5 Two Point Hospital — **SEARCH-SUMMARY only, and used for nothing**

No decompilation or shipped data file was reachable. A web search summarised
community pages as saying that a warning arrives at one negative balance, formal
bankruptcy at a larger one, and that at bankruptcy the player chooses between
reloading a save and restarting the hospital.

**The two figures the summary offered are exactly the kind of confidently
precise claim `README.md` records as having failed spot-checking last time**, so
they are recorded as unverified and are used nowhere: −150,000 warning,
−300,000 bankrupt. I did not open a page. Treat all of §4.5 as hearsay. The one
thing worth noting even at this tier is that the *shape* reported matches §4.3
and §4.4 — a warned band, then a line — which is weak corroboration and nothing
more.

### 4.6 The pattern across the four sourced games

Stated as findings, with the tier attached to each:

1. **Where a loss condition exists, it fires on the thing the game is *about*,
   not on money.** RimWorld and ONI both check population and nothing else
   (VERIFIED). Prison Architect's set is seven conditions of which bankruptcy is
   one (VERIFIED). Only Theme Hospital's shape puts a balance line among the
   losing criteria on equal footing (VERIFIED of CorsixTH).
2. **Where a loss condition exists, it is optional.** ONI has
   `disableGameOver` (VERIFIED); Prison Architect has `codex_option_failure`
   (VERIFIED). Both are switches at the level of the whole condition, not
   difficulty sliders.
3. **Where a loss condition exists, it is warned first.** Prison Architect
   warns with an explicit deadline and a visible counter (VERIFIED); Theme
   Hospital's shape authors the warning boundary next to the losing value
   (VERIFIED of CorsixTH). Neither surprises the player.
4. **"The run ends" is not the same as "the file ends".** RimWorld offers new
   wanderers in the same save (VERIFIED); ONI's game-over is a state machine
   state with a screen (VERIFIED); the Two Point Hospital summary describes a
   reload-or-restart choice (SEARCH-SUMMARY).
5. **An unaffordable purchase is refused, in every case I could source.**
   Prison Architect says `Insufficient Funds` (VERIFIED). Nothing in the sample
   overdraws a balance as an ordinary consequence; Prison Architect's route to
   debt is an explicit, researched, interest-bearing loan (VERIFIED).
6. **None of these four games has a *degradation spiral* as a distinct named
   mechanism.** They have soft failures in quantity, and a loss condition on
   top. What makes them feel like spirals is that their subsystems consume each
   other's outputs — which is exactly the property §2 finds missing here, and it
   is a property of the *graph*, not of a feature anyone shipped under that
   name. **FROM MEMORY as a general claim; VERIFIED only that no such mechanism
   appears in the four files I read, which is much weaker.**

---

## 5. The seams: what is nearest to carrying a failure mode

Four candidates. Each names existing modules and existing state, because a
proposal that does not is not usable here. They are not alternatives — B, C and
D each become cheaper if A lands — but they are separable and can be costed
separately.

### A. The recurring charge — a payroll

**What the player experiences.** You hire a guard. From then on, at the end of
every in-game day, the wage comes out alongside the state's payment coming in,
and the strip shows both. A prison with more guards than inmates loses money
every night. The number beside the balance stops being "what I have" and starts
being "which way I am going" — and for the first time, doing nothing is not
safe. When the balance can no longer cover the day, ADR 0017 decision 8's ladder
has something to respond to: deliveries refused first, then construction halted,
then staff unpaid.

**Which files.** A new system beside `src/simulation/economy/income.ts`, on the
same `{ intervalTicks: 2400, phaseTicks: 2399 }` cadence and in the same
120-ish order band. It reads `GuardRoster` for the headcount and
`src/content/staff-role-catalog.ts` for `wageBand` — both of which exist, and
`wageBand` is authored for all eight roles and currently read once, for the
one-off hire charge. `Treasury` needs a debit that can go below zero, which is a
change to a validated invariant in three methods and in `restore`.

**Save schema.** A payroll system with no accumulator adds no field, exactly as
`StateIncomeSystem` adds none — the argument in `income.ts` for why the day
boundary needs no stored partial applies unchanged. **But a treasury that can
go negative changes the *meaning* of an existing field**, which `treasury.ts`
and the save-schema history both treat as a version-bump trigger. Expect a
`SAVE_SCHEMA_VERSION` bump and a migration that has to decide what an old
non-negative balance means under the new rules (nothing, most likely — but
"nothing" is a decision a migration has to state).

**Determinism.** Low risk if it stays integer and stays on a declared schedule.
`headcount × wage` is exact. A new system's `order` is part of ADR 0020's
contract and pinned by `tests/determinism/kernel-system-order.test.ts`, so
placing it is a reviewed edit, which is the intended friction.

**New content.** None. `wageBand` is already authored.

**Why it might be wrong.** Three reasons, in descending order of how much they
worry me.

1. **It makes the game harder in the one place it is currently balanced, and
   the balance was chosen for the opposite reason.** `income.ts` records that
   300 was adopted over the research record's 200 *specifically* because "at 200
   a single guard would eat most of one prisoner-day the moment payroll exists",
   and that the owner's stated preference was "to start looser and tighten
   later". Payroll is the event that number was pre-paid for — which is an
   argument *for* — but it also means the rate is now provisional again and
   §5.A cannot be landed without reopening it.
2. **The ladder is the expensive half and this is the cheap half.** A debit is
   small. "Deliveries refused, then construction halted, then staff unpaid" is
   three behaviours, three surfaced states and three recoveries. Landing the
   charge without the ladder produces a balance that goes negative and does
   nothing, which is a *worse* soft failure than the one we have, because it
   looks like a spiral and is not one.
3. **It is issue #29's scope, not a free-standing change.** #29 asks for a typed
   append-only ledger with derived balance, and building a second bare
   `credit`/`debit` caller first is the thing that ledger exists to prevent.

### B. Widen the risk sampler, and give the incident pipeline a producer

**What the player experiences.** You are told, honestly, that a wing is getting
dangerous — because your inmates are starving and there is nobody watching
them — and if you ignore it long enough there is a riot, guards get pulled off
whatever they were doing to contain it, and if you have not hired enough of them
it lapses instead of resolving. For the first time the incident chip on the
status strip is not 0.

**Which files.** Two joins, and they are genuinely small.

1. `sampleSectorRisk` in `src/simulation/runtime/new-session.ts` reads `safety`
   only; widening it to the needs actually going unmet is one function body.
2. Something has to write `incidentSectorIds` and register a
   `SecuritySectorRegistry` sector. There is no command that does and no
   scenario framework to do it (§0.5), so this is where the real cost is: either
   a twelfth command with a producer in `src/main.ts`, or a derivation from
   state that already exists (rooms are the obvious candidate — a zoned room is
   a bounded region the registry could key a sector on).

**Save schema.** `SectorRiskTracker`, `IncidentLog`, `GangRegistry` and the
watched-sector list are **already in the save** (`session-systems.ts` snapshots
and restores all of them). Widening the sampler adds no field. A sector-creating
command may add nothing either, since sector definitions are already
snapshotted. This is the candidate with the least persistence exposure by a
wide margin.

**Determinism.** Both systems are already on the kernel with declared orders
(285 and 295) and already sort every iteration explicitly. The sampler is pure.
Risk is low — but note issue #352 records that a save taken during an incident
response permanently loses the responders and never lifts the lockdown, so this
candidate lands on a known defect and would make it reachable.

**New content.** None strictly. Localisation for anything newly surfaced.

**Why it might be wrong.** This is the candidate I would most want a second
opinion on before anyone starts.

1. **It fires immediately, on top of an unexplained starvation.** §1.1 measures
   `hunger` falling to zero unconditionally with an **UNKNOWN** cause. Widening
   the sampler to read `hunger` converts that into constant riots. The pressure
   would be real, the *reason* for it would be a bug, and the game would look
   balanced-and-brutal rather than broken. **Fixing §1.1 is a prerequisite, not
   a follow-up.**
2. **It makes two of four incident types permanently visible and two
   permanently absent.** `docs/HUD_PROJECTIONS.md` gap 29 already records that
   `IncidentTriggerSystem` opens only `riot` and `gang-retaliation`, so
   `assault` and `escape-attempt` stay declared and untriggerable. Shipping half
   a taxonomy is a decision, not an oversight, and should be made knowingly.
3. **A riot is not a failure mode.** It is a *degradation event*. On its own it
   produces an `IncidentRecord` with an `IncidentOutcome` — injuries, property
   damage, an escape flag — and §0.5 establishes that **nothing reads any of
   them.** Which is candidate C.

### C. The consequence receiver — make an outcome an input

**What the player experiences.** The riot ends and the prison is worse for it
afterwards: someone is in solitary who was not before, property damage costs
money to repair, an escape shows up in whatever the state thinks of you. Things
that happen start mattering later and elsewhere, which is the difference between
an event log and a game.

**Which files.** This is issue #80, filed by the owner and open, and it already
names the seam better than I can: `IncidentOutcome`'s `propertyDamage` is
declared as "consumed by a future repair-job/economy system", `escaped` as "the
one outcome later economy/story systems care about most", and
`ConfiscationLedger` records every find with the holder's id. All of it
terminates in a record nobody reads. #80 also records the correction that
`room.solitary-cell` **is** already an intake destination
(`prisoners/intake-system.ts` routes `high-risk` arrivals there) but not a
sanction destination, so nothing relocates an already-placed prisoner.

**Save schema.** New per-prisoner disciplinary state. #80 says so itself and
puts it in the payload. Expect a version bump.

**Determinism.** Moderate. A disciplinary record is ordered state and needs
canonical ordering; #80 lists that as a requirement.

**New content.** Yes — sanctions, and the strings for them.

**Why it might be wrong.** #80 opens with a design question it says must be
settled "first, not during": is adjudication a player decision, a staff task, or
automatic with override? Each produces a different game. That is an owner
decision and this record cannot shortcut it. And C is downstream of B: a
consequence receiver with no incidents to receive is the same unreachable
capability one layer up.

### D. A warned-band authority — the shape §4.3 and §4.4 both landed on

**What the player experiences.** Somewhere on the strip is a small, legible
statement of how badly the prison is doing against a small number of named
things, each with a line you are approaching and a line you have crossed. You
get told at the first line. Whether crossing the second ends anything is exactly
the decision in §6.

**Which files.** A projection, not a system — the same reading `Treasury` and
`RoomZoningService` take of themselves. It reads what already exists and holds
no state: `Treasury.balanceMinorUnits`, `IncidentLog` (already the source of the
strip's `activeIncidents`), `summarizeIncidents` (**which already computes
exactly this aggregate and has no caller** — `total`, `resolved`, `lapsed`,
`stillOpen`, `totalInjured`, `totalPropertyDamage`, `escapes`), and the needs
component. `src/simulation/presentation/` is where it belongs and
`docs/HUD_PROJECTIONS.md` is the contract it must satisfy. The authored
thresholds are content, one row per criterion with a warning boundary and a
losing value, in the shape §4.4 verified.

**Save schema.** None, if it stays derived. That is the whole argument for doing
D early: it is the only candidate that can be built with no persistence
exposure, because a projection over existing state is what `StateIncomeSystem`'s
"nothing to save, and that is the point" section already demonstrates is
possible.

**Determinism.** None at risk. It is a read.

**New content.** Yes, and this is the honest cost: authored thresholds, and
localisation for every warning. §4 says twice over that this is where the work
is, and ADR 0017 said it first.

**Why it might be wrong.** Two reasons.

1. **It has nothing to say yet.** Every input it would read is currently
   flat: the balance only rises, incidents are always zero, and the needs at
   zero are the same three needs in every session. D over today's tree is a
   panel of constants. It is the right *last* piece and a pointless first one.
2. **It is the piece most likely to be built twice.** Issue #104 records that
   seven of nine projections cannot be reached from the UI at all, and #33 has
   the reports-and-overlays surface in scope. A bespoke failure panel now is a
   thing to delete later.

### The ordering that falls out

Not a recommendation about *what* to build — §6 is where that decision sits —
but the dependency order is not a matter of taste, and it is worth stating
because three of the four candidates read better than they sequence:

**§1.1 (why nobody eats) → A (a slope) → B (a producer, with a widened sampler)
→ C (a receiver) → D (a surface).**

§1.1 is first because B is built on it. A is second because it is the only
candidate that creates a slope, and a slope is what §2 finds missing. D is last
because it is a projection of the other three and empty without them.

---

## 6. What this record does not decide

The brief invited an ADR if the research converged on one. It converged on
something narrower, and on one question that is not mine.

**What does not need an ADR.** The money case is decided. ADR 0017 decision 8 is
Accepted and says insolvency is a state and not a loss condition, with the
degradation order named. Nothing found here contradicts it — §4 corroborates it
from four directions, and §0.1 shows the tree has not yet reached the point
where it applies. A second ADR restating it would add a document and no
decision. The candidates in §5 are implementation and balance, and issue #28's
and #29's exclusions of final balance already cover them.

**What does need a decision, and it is the owner's.** ADR 0017 answered
"insolvency is not a loss condition". It did not answer **"is anything a loss
condition?"** — and the four games in §4 divide cleanly on it. Two shapes, with
their costs:

**Shape 1 — nothing ever ends a run.** Failure is a spiral and a surface, all
the way down: candidates A through D, no terminal state, ever.
*Costs:* every pressure must be authored and surfaced or it is invisible, which
is ADR 0017's own stated price paid four more times. A player who has lost in
every meaningful sense keeps playing, which is either the best thing about the
design or its central flaw depending on the audience. *Argues for it:* RimWorld
and ONI both put their only ending on population and neither on economy
(VERIFIED); it is the natural extension of a decision already Accepted; and it
needs no new architecture, only §5's joins.

**Shape 2 — a small named set of terminal conditions, opt-in and warned.**
Prison Architect's shape exactly: a `Failure Conditions` switch, a handful of
named conditions of which insolvency is *not* one (which keeps decision 8
intact), each with a warning, a deadline and a visible counter.
*Costs:* a session-lifecycle concept the simulation does not currently have —
nothing in `src/` ends, halts or invalidates a session on any game-state
condition, so this is genuinely new architecture and touches the worker state
machine, the save, and whatever the UI does about it. It also needs the setting
itself, which is close enough to issue #40's Cozy preset that the two should be
decided together rather than twice.

**I am not picking.** The two shapes have different audiences, and which
audience this game is for is not a fact about the repository. What I would ask
of whichever is chosen: **it should be an ADR before it is code**, because it
decides whether a session can end, and that is a lifecycle question that will
otherwise get settled inside an implementation. And it should be numbered after
0029, which is in the queue and awaiting approval (§0.6).

---

## 7. My weakest claim, and what would change my mind

**The weakest claim is §5.B's implicit premise that widening `sampleSectorRisk`
is a small change.**

The arithmetic in §3 is solid — I would defend the mutual-exclusion finding
against anything. What I am much less sure of is the inference I hung on it:
that because `needsPressure` reads one need and three others sit at zero,
reading those three is a one-function fix that makes the risk model work. That
treats a weighted sum of four numbers as if it were the model. It is more
likely that a sampler reading `hunger` at zero across every prisoner in every
session produces a score pinned near 1.0 and riots pinned at "always", which is
not a working risk model either — it is the same broken model with the sign
flipped. I measured the current state thoroughly and **measured nothing about
the widened one**; I did not run a probe with a modified sampler, because
modifying `src/` was outside what this record was allowed to touch, and I have
labelled the resulting claim accordingly rather than dressing it up.

**What would change my mind:** a probe that widens the sampler and runs the same
ten-day session. If the score sits above 0.6 from the first sampling point, §5.B
is not a join, it is a balance problem wearing a join's clothes, and the
candidate should be rewritten around a pressure model with a decay or a
saturation term rather than around the existing weighted sum. That probe is
cheap and I would want it run before anyone costs B seriously.

**Two more places I would want a second reader.**

- **§4.4's figures.** I have labelled the Theme Hospital numbers as VERIFIED of
  a community transcription and UNKNOWN of the original game, and the shape as
  VERIFIED of CorsixTH. If any conclusion in §5 or §6 turns out to depend on
  those figures rather than on that shape, the conclusion is wrong and not the
  labelling. I believe none does; that belief is worth checking.
- **§0.5's "zero callers" greps.** They are greps over `src/` excluding each
  symbol's defining module. A dynamic dispatch, a re-export chain or a string
  key would defeat them. I checked the barrel exports, which is where I would
  expect the miss, and found only `presentation/index.ts`. I did not check for
  indirection.

---

## Sources

Repository sources are cited inline by path and were opened at `87516a8`, not
searched. External sources, in the order they appear:

- **RimWorld** — `RimWorld/GameEnder.cs`, machine decompilation mirrored at
  `raw.githubusercontent.com/Chillu1/RimWorldDecompiled/master/`. Fetched and
  read in this session. Unofficial mirror; not vendor material.
- **Oxygen Not Included** — `Managed/main/GameFlowManager.cs` and
  `Managed/main/STRINGS/BUILDING.cs`, decompilation mirrored at
  `raw.githubusercontent.com/undancer/oni-data/master/`. Fetched and read.
  Unofficial mirror.
- **Prison Architect** — `main/data/language/base-language.txt`, the shipped
  localisation table, mirrored at
  `raw.githubusercontent.com/originalfoo/Prison-Architect-API/master/`. Fetched
  and read; 2,960 lines. Unofficial mirror of a shipped data file.
- **Theme Hospital / CorsixTH** — `CorsixTH/Levels/example.level`,
  `CorsixTH/Levels/original08.level` and `CorsixTH/Lua/endconditions.lua` from
  `raw.githubusercontent.com/CorsixTH/CorsixTH/master/`. Fetched and read.
  CorsixTH is a reimplementation; `original08.level` is a contributor's
  transcription and says so.
- **Two Point Hospital** — web-search summaries of community pages only. No page
  opened. SEARCH-SUMMARY; used for nothing.

No forum post, video or search snippet is cited anywhere above as evidence of
what a designer intended, and none of the four sourced games is quoted for
intent at all — only for what its shipped files do.
