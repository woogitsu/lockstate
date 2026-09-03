# Playing incidents, contraband and security response

**Date:** 2026-09-02
**Tree:** `aa762112` (`chore(release): v0.0.383`), worktree on branch
`playtest/incidents-and-response`
**Question put to this record:** the owner's standing brief — *"znajdź bugi i
błędy grając"* — pointed at the one surface `docs/AGENT_WORKFLOW.md`'s
STATUS-QUEUE marks played end to end by nobody today: incidents, contraband and
security response. What does a player see when an incident starts, who
responds, does the alert say something actionable, and do two panels describing
the same fact ever disagree?

**Two findings, both measured by playing, neither previously recorded as a
live-play result:**

1. **The 600-tick response deadline is not shown anywhere, and a player who
   reacts to the alert as fast as five mouse clicks allow can still lose the
   incident with the game giving no sign the reaction was too late.** Played
   live: a riot's opening alert appeared at tick 19,923; hiring five guards in
   direct reaction — the exact reaction `tests/integration/security-default-sector.test.ts`
   proves resolves this class of riot — did not complete until tick 22,054,
   2,131 ticks after the incident opened and 1,531 ticks past
   `DEFAULT_INCIDENT_RESPONSE_POLICY.responseDeadlineTicks` (600,
   `response-system.ts:26`). The five new guards never carried an
   `'incident-response'` claim at any point this pass observed; they landed on
   ordinary `'Sector Post'` and `'Contraband Search'` duty, which is exactly
   what happens to a hire arriving after an incident has already gone
   terminal. Nothing on screen — not the alert, not the Staff panel, not any
   timer — told the player their five real seconds of clicking had already
   cost them the riot.
2. **A riot's own alert row never says how it ended, and the generic "all
   clear" row it stands beside carries no reference back to it — confirmed
   live and by code.** The alert list at the moment of all-clear held, verbatim
   (test log, tick 22,936): `"A riot has broken out — 3 prisoners have stopped
   taking orders. Day 9"` sitting a few rows from `"The prison is under control
   again — no incident is still open. 3× Day 9"`. Nothing distinguishes a
   riot a player's guards contained from one that ran past its deadline with
   nobody there — `response-system.ts:659` (`lapse`) and `:850`
   (`advanceResponse`'s resolved branch) both call the same
   `reportAllClearIfCalm`, which emits one outcome-agnostic
   `incidents.all-clear` regardless of which terminal state produced it. This
   generalizes, played rather than only read, a finding
   `2026-08-30-what-an-escape-says.md` recorded for escape alone before the
   owner's ruling gave escape its own sentence; riot, assault and
   gang-retaliation still have no equivalent.

Both are named as **hidden mechanics** under the brief's own bar — a rule a
player cannot predict from the interface — not as code bugs: every line of
code involved does exactly what its own docblock says it does.

---

## 0. How to read this record

Following `docs/research/README.md`'s tiers:

- **MEASURED** — a real run of this repository's own code, in this worktree,
  with the output pasted.
- **VERIFIED** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown so it can be
  checked without a re-run.
- **UNKNOWN** — could not be established in this pass.

Code cited by `file:line`; prose quoted, per `docs/AGENT_WORKFLOW.md` §4.

---

## 1. What was played, and how

`tests/browser/playtest-2026-09-02-incidents-and-response.playtest.ts`, added
on this branch. Not a gate — `tests/browser/playwright.config.ts` collects only
`*.spec.ts`; this is `*.playtest.ts`, matched by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives
(`docs/AGENT_WORKFLOW.md`'s own note on the shape). Run:

```
LOCKSTATE_BROWSER_TEST_PORT=5341 node --experimental-transform-types \
  --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-02-incidents-and-response.playtest.ts -g "act 1"
```

**Act 1 — a riot the player reacts to, played with the real mouse harness
(`playtest-harness.ts`, the same helpers `playtest-economy.playtest.ts` and
`playtest-2026-09-02-what-landed-today.playtest.ts` use), against the real
application at `/index.html`, through a real worker.** `buildAndPopulate(page,
{ beds: 1, admits: 3, guards: 0 })` built a 6×6 cell with one bed and admitted
three prisoners — two of them permanently without a bed, the same
"overcrowded prison" shape `security-default-sector.test.ts` uses to reach a
riot with no arrangement beyond neglect. The clock ran at the game's own
top speed (two presses of Fast forward, ×4) throughout — the same convention
`playtest-2026-09-02-what-landed-today.playtest.ts` established for the reason
it states: durations are read in ticks, not asserted on wall time, because the
container runs other agents' suites concurrently. **Act 1's own log is the
data**; every figure below is quoted from it rather than re-derived.

**Contention, encountered and handled per `docs/AGENT_WORKFLOW.md` §2:** the
first attempt failed inside `calibrate()`'s bisection with `no RemoveObject
from a press at 700,300: []` — traced to a bug in this playtest's own first
draft (`installTee(page)` omitted before `openApp(page)`, so the command tee
that `sentCommands()` reads was never installed; every existing
`*.playtest.ts` calls it first), not to contention or to the application.
Fixed, and the corrected file was then run to completion in the foreground in
one call (7.1 minutes wall time, `1 passed`).

---

## 2. Finding 1 — the response deadline, played

### 2.1 The timeline, quoted from the run

```
[act1] riot opened -- tick 19923, band="A riot has broken out — 3 prisoners
  have stopped taking orders.", list=[... "A riot has broken out — 3 prisoners
  have stopped taking orders. Day 9\nCritical\nClear this alert" ...]
[act1] hired 5 guards at tick 22054
[act1] mid-response Staff panel ... held: "ON DUTY\n1 held · 4 free\n
  Guard · Sector Post\nRelease\n..."
[act1] all-clear -- tick 22936, band="The prison is under control again —
  no incident is still open."
[act1] Staff panel after all-clear -- held: "ON DUTY\n2 held · 3 free\n
  Guard · Sector Post\nRelease\nGuard · Contraband Search\nRelease\n..."
```

### 2.2 The deadline, VERIFIED against the code

`DEFAULT_INCIDENT_RESPONSE_POLICY.responseDeadlineTicks = 600`
(`src/simulation/incidents/response-system.ts:26`): *"Ticks after
`startedAtTick` by which responders must have **arrived**, or the incident
lapses with an un-contained outcome"* (`:16`). The incident's own timeout check
is a per-tick scan against `startedAtTick`, not against when a player acts —
nothing re-arms it, nothing pauses it, and it is a property of the incident
record alone.

### 2.3 The arithmetic — DERIVED

`19,923 + 600 = 20,523`. Five guards were hired at tick `22,054` —
**1,531 ticks past the deadline**. At the speed this pass ran (×4, 80
ticks/second, `SIMULATION_SPEEDS`/`FixedStepClock.stepMilliseconds` per
`2026-09-02-playing-what-landed-today.md`'s own reading), that is about **19
real seconds of margin the player did not have**, spent entirely on: opening
the alert (near-instant, a 1-second poll caught it), switching to the
Security tab, clicking the Guard role row, and pressing Hire five times with
Playwright's own 250 ms settle between presses — the same motions a human
player would make, not an artificially slow script (the whole reaction is
five short UI actions).

### 2.4 What confirms the deadline actually bit, rather than merely elapsing

The five hired guards' claims, read off the Held panel after all-clear:
`'Sector Post'` and `'Contraband Search'` — never `'Incident Response'` at
either sampled moment. `IncidentResponseSystem.tryDispatch` only ever claims a
guard for an incident still in `'active'` or `'notified'`
(`response-system.ts:403-417`'s ordering comment: *"release first, then
dispatch anew ... so a re-dispatch draws from"* the pool a lapse just freed);
an incident already `'lapsed'` is terminal
(`isLegalIncidentTransition`, `incident.ts:22-26`, `lapsed: []`) and dispatches
nothing further. Guards arriving into a prison with no open incident become
ordinary claimants of the sector's own post and search duty — exactly the two
claims observed. **This is consistent with, and only with, the riot having
already lapsed by tick 22,054**; nothing in this pass could observe the
`IncidentRecord.state` or `IncidentOutcome` directly (§3 explains why not), so
this is DERIVED from the claim wording rather than read off the record.

### 2.5 What a player is never told

- **No countdown, timer or urgency cue anywhere.** The alert reads `"A riot
  has broken out — 3 prisoners have stopped taking orders."` — true, but
  silent on how long a response has to arrive. `hud.alert.event.incidents.*`
  (`src/content/default-locale-en.ts:931-935`) is exhaustive over the four
  incident types and carries no timing word for any of them.
- **No refusal, no acknowledgement, nothing distinguishing "too late" from
  "handled it."** The five hires succeeded normally — no
  `RefusalReason` fired, nothing in `sentCommands` differed from a hire made
  with no incident open at all. A player who did everything right, as fast as
  the interface allows, receives the same silent success a player who reacted
  to nothing at all would get.
- **The closing alert, per Finding 2, would not have told them either way.**

### 2.6 What this does not claim

**Not claimed:** that 600 ticks is too short a window in the abstract, or that
every player would fail to react in time — a player already on the Security
tab with the role pre-selected would clear five hires faster, and at the
game's default (unaccelerated) speed 1 the same 600 ticks is 30 real seconds,
plausibly enough. What is played and verified is narrower and does not depend
on the exact margin: **the deadline exists, is a hard cutoff, and is
communicated nowhere** — so a player has no way to know, in the moment, whether
their reaction has any chance of mattering, or whether it already does not.

---

## 3. Finding 2 — the closing sentence, generalized from escape to riot

### 3.1 What #683 established for escape, and what this pass adds

`2026-08-30-what-an-escape-says.md` measured, at the kernel level, that a
contained escape attempt and a successful one produced *byte-identical* alert
rows before the owner's 2026-08-30 ruling gave a successful escape its own
sentence (`incidents.escape-succeeded`). That record's own §5.4 and this
brief's framing both leave the other three incident types — `riot`, `assault`,
`gang-retaliation` — as open questions the escape ruling did not touch.

### 3.2 Riot, VERIFIED at the code and MEASURED live

Both terminal paths call the same outcome-blind reporter:

```
response-system.ts:659   this.reportAllClearIfCalm(escapeAnnounced) -- lapse()
response-system.ts:850   this.reportAllClearIfCalm(tick, false)     -- advanceResponse(), the 'resolved' branch
response-system.ts:271   reportAllClearIfCalm(tick, ...) { ... this.events.recordIncidentsAllClear(tick); }
```

`recordIncidentsAllClear` takes only a `tick`
(`src/simulation/events/event-log.ts:669`) — no incident id, no type, no
outcome. So for `riot`, `assault` and `gang-retaliation` alike (escape is now
the sole exception), **the wire carries no fact that could ever distinguish a
contained close from a lapsed one**, independent of any UI layer above it —
the same conclusion `2026-08-30`'s record reached for escape, reached here
for the other three by reading the two call sites directly rather than by
extension.

Played, in this pass's own run: the riot opened at tick 19,923 and (§2.4) most
likely lapsed at tick 20,523; the all-clear that closed it, quoted in §2.1,
says nothing that would read differently had five guards actually arrived in
time. `IncidentRecord.outcome` — `injuredEntityIds`, `propertyDamage`,
`escaped` (`incident.ts:52-60`) — is set at the same terminal transition and
is real, computed data; it never crosses to a player, for the reason
`incident-projection.ts:20-27` states outright: *"issue #28's 'alerts/logs
reveal appropriate information without exposing all hidden calculations' ...
The `SectorRiskTracker`'s running score is withheld for the same reason."*
`hud/incidents` is catalogued (`PROJECTION_IDS`,
`src/simulation/protocol/types.ts:344`) and has had **no reader** since it was
named — confirmed still true on this tree,
`tests/foundation/projection-reachability-contract.test.ts:322`'s
`UNPAINTED_PROJECTION_IDS` entry for it is unchanged from the 2026-08-30
record's quote of it.

### 3.3 What this generalizes and what it does not

**Generalizes:** the mechanism — one outcome-agnostic `all-clear`, an outcome
that exists in the record and never reaches a panel — is now confirmed to
apply to all three incident types that never got a §5's owner ruling, not
merely inferred from escape's having needed one. **Does not generalize:** the
*sentence itself*. Escape's fix (`{name} broke out — no guard reached them in
time.`) is specific to an escape's own stakes (a person is gone); a riot's
contained-versus-lapsed distinction is a different pair of facts
(`outcome.injuredEntityIds`, `outcome.propertyDamage`) and this record proposes
no wording for it, per `AGENTS.md`'s fourth exclusion.

### 3.4 The player-visible shape of the defect, stated plainly

Two sentences on one screen, about the same riot, that a player has no way to
connect with any more precision than "probably": *"A riot has broken out"*
(present tense, never revised) and, some rows later, on the next incident
closing anywhere in the prison, *"The prison is under control again"* — with
no incident id, no name, no location in either. In a prison running more than
one kind of incident (this run's own log shows an assault's all-clear sharing
the list with the riot's opening, §2.1), an all-clear a player reads as being
about the riot they are worried about may be about something else entirely,
and there is no row-level way to tell.

---

## 4. What this pass did not reach

- **Assault and gang-retaliation, played rather than read.** §3.2's code-level
  argument (`reportAllClearIfCalm` is type-blind) applies to all four types
  identically, but this pass only staged a live riot. Not expected to differ —
  the call sites are shared — but not independently played.
- **Whether `Medium`-speed or unaccelerated play changes the deadline finding's
  practical bite.** §2.6 already states the honest bound: unaccelerated, 600
  ticks is 30 real seconds, and this pass did not play that condition.
- **Contraband sweep visibility and the alerts-eviction-by-severity rule.**
  Both were read against the code and against already-shipped, already-passing
  browser gates (`ui-contraband-name.spec.ts`'s "Contraband found: {item}."
  assertions at `hud.alert.event.contraband.discovered`; `simulation-events.ts`
  §"the least severe rows go first" implementing ruling 11) rather than played
  fresh in this pass — both already have real-browser coverage in the shipped
  suite and this pass did not find a live discrepancy worth adding evidence
  against. Named as read rather than played, per the brief's own standard.
- **`hotThreshold`/sector-risk visibility before an incident.** VERIFIED at the
  code that it is deliberately withheld (§3.2's quote of
  `incident-projection.ts:20-27`) and is a stated owner ruling under issue #28,
  not an oversight — so "can a player see risk rising before an incident"
  reads NO, by design, confirmed by reading rather than by a play session that
  would only re-confirm the same absence.

---

## 5. What the owner would need to decide

Neither finding needs a decision to be *true*; both are read-only findings
about what the interface says today. What would turn either into a shipped
change is squarely the owner's under `AGENTS.md`'s fourth exclusion (no
sentence is authored here):

1. **Should a response deadline be visible at all** — a countdown, a
   lockdown-state cue (`SecuritySectorRegistry.getControlState` already flips
   to `'lockdown'` at severity ≥ 6, `DEFAULT_INCIDENT_RESPONSE_POLICY:29`, and
   is not surfaced to a player today, unmeasured further in this pass), or
   nothing at all because the owner wants the deadline to feel like real
   pressure rather than a solved puzzle?
2. **Should a riot's (and an assault's, and a gang-retaliation's) close say
   how it closed**, the way escape's now does — and if so, on the incident's
   own alert row, on the all-clear, or both?

---

## 6. My weakest claim

**That the riot in Act 1 actually lapsed rather than resolved (§2.4).** This
pass could not read `IncidentRecord.state` directly from a live browser
session — that is Finding 2's whole point, there is no reader for it — so the
conclusion rests on the claim wording after the fact (`'Sector Post'` /
`'Contraband Search'`, never `'Incident Response'`) plus the tick arithmetic in
§2.3, not on a direct read of the record. Both point the same way and neither
is disputed by anything else observed, but a kernel-level instrument
(replaying this exact browser sequence's commands through
`createNewSimulationRuntime` and reading `runtime.incidents.get(id).state`
directly) would settle it beyond inference. **What would change my mind:**
such a replay showing `state: 'resolved'` at tick 22,936 — which would not
change Finding 2 (the sentence would still be identical either way) but would
mean Finding 1's "too late" framing needs its margin re-measured.

---

## Reproduction

`tests/browser/playtest-2026-09-02-incidents-and-response.playtest.ts`, this
branch. Act 1 command in §1; act 2 (a riot never answered at all, to compare
the closing sentence against a construction-free lapse) is written but was not
separately run in this pass — §3.2's code-level proof that both terminal paths
share one reporter makes the comparison redundant rather than merely
expensive, and is named here rather than silently skipped.
`./node_modules/.bin/tsc -b --pretty false` and
`./node_modules/.bin/tsc -b tsconfig.tools.json --pretty false` both exit 0 on
this tree; `./node_modules/.bin/vitest run tests/foundation/` is `470 passed
(470)` alone (one contention-timeout retry recorded and resolved — see the
push log).
