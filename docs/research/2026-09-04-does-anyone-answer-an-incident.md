# 2026-09-04 — does anyone answer an incident, and can a player tell a handled one from an expired one?

**Played on `playtest/does-anyone-answer-an-incident`, cut from a fresh
`origin/main` at v0.0.439 (`ce7fe617`).** The instrument is
`tests/browser/playtest-2026-09-04-does-anyone-answer-an-incident.playtest.ts`,
which is **not** a CI gate: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `.playtest.ts` is collected only by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.

## The question

`src/simulation/incidents/incident.ts:23-28` makes `'lapsed'` reachable from
every non-terminal state, `'responding'` included, and both `'lapsed'` and
`'resolved'` are terminal. So an incident can end without anybody having done
anything, from any point in its life. **Does that happen in ordinary play, how
often, what does it look like on screen, and is a player told which of the two
endings they got?**

## The answer, in one line

**A guard does answer, reliably and in under a second — and the player is told
nothing that separates the two endings.** With six guards, **15 incidents out
of 15 ended `resolved` with zero injuries**; with none, **19 out of 19 ended
`lapsed` with 114 prisoner-injuries and three escapes** — and the two prisons'
alert columns hold the same rows, in the same order, saying the same sentence.
The one exception is an escape, which has its own sentence and works exactly as
issue #683 says. **The brief's "a guard who was on the way and then wasn't" is
real and reachable**: pressing Release on the two held responders of a
`'notified'` assault produced `active@10350 → notified@10350 → lapsed@10960`,
two prisoners injured, and the screen answered *"The prison is under control
again — no incident is still open."* **`'responding' → 'lapsed'` specifically
was not reached in 39 incidents**, for a structural reason (§7): the
`'responding'` branch never checks the deadline, so an incident whose response
record survives to arrival always resolves.

## How to read this record

Following `docs/research/README.md`'s tiers, with the one this repository's
playtests add:

- **MEASURED** — a real run of this tree's own code in a browser, output pasted.
- **VERIFIED** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **UNKNOWN** — not established in this pass.

Two channels are reported and they are **never mixed**:

- **HUD** — read out of the DOM: the alerts list, the event band, the status
  strip's Incidents chip, the refusal band, the Staff panel. This is what a
  player sees.
- **STATE** — read off the `hud/incidents` and `hud/incident-detail` read
  models, pulled straight off the worker by the instrument's own probe.
  **Nothing under `src/ui/` requests either projection** (§6), so nothing in
  this channel is on a player's screen at all. Every state name, tick and
  outcome below is STATE unless it is quoted as a sentence.

## The prisons, and how they were built

All three acts use `buildAndPopulate` from `tests/browser/playtest-harness.ts`
with the same shape: an enclosed 6×6 cell at tiles (12,12)–(17,17) drawn with
the mouse, **one bed**, one toilet, and **eight admissions**. Seven of the
eight prisoners therefore have nowhere to live, which is what
`src/simulation/incidents/sector-risk.ts`'s own measured note says actually
pushes `needsPressure` over the line — *"what reaches it in practice is
homelessness, not neglect."*

The acts differ in one variable:

| Act | Guards hired | Purpose |
| --- | --- | --- |
| 1 | 6 | a prison with coverage: does anybody come? |
| 2 | 0 | a prison with nobody to send: does the player learn that? |
| 3 | 6 | abandon a live response on purpose, with a real gesture, and see how it ends |

Run one act at a time (`-g` is a regex):

```
LOCKSTATE_BROWSER_TEST_PORT=5391 node --experimental-transform-types \
  --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-does-anyone-answer-an-incident.playtest.ts -g "act 1"
```


---

## 1. A guard does answer, and the whole thing is over in 70 ticks

**MEASURED**, and it is not one reading: **all 15 of act 1's resolutions and
both of act 3's have the identical shape**, offsets included.

```
[act1] incident.riot.10   riot sev=8 :: active@53100 -> notified@53100 -> responding@53110 -> resolved@53170
[act3] incident.assault.2 assault sev=3 :: active@15150 -> notified@15150 -> responding@15160 -> resolved@15220
```

Four states, **70 ticks end to end**, every time. Read against
`DEFAULT_INCIDENT_RESPONSE_POLICY` (`response-system.ts:25-30`,
VERIFIED — `responseDeadlineTicks: 600`, `containmentTicks: 60`):

- `active → notified` on **the same tick the incident opened**. `tryDispatch`
  runs from `IncidentResponseSystem.update` over `openIncidents()`, claims the
  responders and transitions in one pass (`response-system.ts:429-441`), so
  there is no interval in which an incident exists and nobody has been sent.
- `notified → responding` **10 ticks later** — one scheduled interval of this
  system. The responders do not walk there; `mountResponse` requests a route
  and `advanceResponse` sets the guard's tile the moment the route resolves
  (`response-system.ts:818`), which is the same teleport
  `2026-09-02-playing-what-landed-today.md` measured for contraband sweeps.
- `responding → resolved` **exactly 60 ticks later**, which is
  `containmentTicks` to the tick.

**DERIVED.** At 1× the simulation runs 20 ticks a second
(`FixedStepClock`'s `stepMilliseconds = 50`, VERIFIED), so an answered incident
lasts **3.5 seconds at 1×** and **0.875 seconds at 4×**. At 4× the opening
sentence and the closing sentence land inside the same second.

That is also why act 3 took three attempts (§7): a poll loop watching
`hud/incidents` every 300–400 ms at 4× **routinely missed the entire life of an
incident**. Several of act 1's fifteen were first seen already `resolved`. The
instrument's `seenAtTick` values are therefore coarse and are never used as
evidence below; **every tick quoted in this record comes from a `timeline`.**

## 2. Act 1 — six guards, and everything resolves

**MEASURED**, `act1`, one prison, six guards hired before the watch began
(`[act1] running from tick 7577 with 6 guards hired`). Every incident's exact
timeline, read off `hud/incident-detail` at the end of the run:


```
[act1] === 15 incident(s) in the log ===
[act1] incident.assault.1 assault sev=3 required=2 :: active@12150 -> notified@12150 -> responding@12160 -> resolved@12220 :: injured=0 damage=1
[act1] incident.riot.2   riot sev=7 required=4 :: active@14700 -> notified@14700 -> responding@14710 -> resolved@14770 :: injured=0 damage=3
[act1] incident.riot.3   riot sev=8 required=4 :: active@19500 -> notified@19500 -> responding@19510 -> resolved@19570 :: injured=0 damage=4
[act1] incident.riot.4   riot sev=8 required=4 :: active@24300 -> ... -> resolved@24370 :: injured=0 damage=4
[act1] incident.riot.5   riot sev=8 required=4 :: active@29100 -> ... -> resolved@29170 :: injured=0 damage=4
[act1] incident.riot.6   riot sev=8 required=4 :: active@33900 -> ... -> resolved@33970 :: injured=0 damage=4
[act1] incident.riot.7   riot sev=8 required=4 :: active@38700 -> ... -> resolved@38770 :: injured=0 damage=4
[act1] incident.riot.8   riot sev=8 required=4 :: active@43500 -> ... -> resolved@43570 :: injured=0 damage=4
[act1] incident.riot.9   riot sev=8 required=4 :: active@48300 -> ... -> resolved@48370 :: injured=0 damage=4
[act1] incident.riot.10  riot sev=8 required=4 :: active@53100 -> ... -> resolved@53170 :: injured=0 damage=4
[act1] incident.riot.11  riot sev=8 required=4 :: active@57900 -> ... -> resolved@57970 :: injured=0 damage=4
[act1] incident.riot.12  riot sev=8 required=4 :: active@62700 -> ... -> resolved@62770 :: injured=0 damage=4
[act1] incident.riot.13  riot sev=8 required=4 :: active@67500 -> ... -> resolved@67570 :: injured=0 damage=4
[act1] incident.riot.14  riot sev=8 required=4 :: active@72300 -> ... -> resolved@72370 :: injured=0 damage=4
[act1] incident.riot.15  riot sev=8 required=4 :: active@77100 -> ... -> resolved@77170 :: injured=0 damage=4
[act1] summary={"total":15,"stillOpen":0,"resolved":15,"lapsed":0,"totalInjured":0,"totalPropertyDamage":56,"escapes":0}
[act1] responseMetrics={"incidentsResolved":15,"incidentsLapsed":0,"respondersDispatched":58,"routeFailures":0}
[act1] EDGE TALLY [["active -> notified",15],["notified -> responding",15],["responding -> resolved",15]]
```

(The elided middles are `notified@T -> responding@T+10`, identical in every
row; the full log is reproducible from the run command above.)

**Fifteen incidents, fifteen resolutions, zero lapses, zero injuries**, over
about 70,000 ticks — 29 in-game days. Every single one walked the same four
states with the same offsets: `notified` on the opening tick, `responding` ten
ticks later, `resolved` sixty ticks after that. The riots arrive on a
**4,800-tick metronome** (53100, 57900, 62700, 67500, 72300, 77100), which is
`DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` exactly (VERIFIED,
`trigger-system.ts:84`) — a prison whose conditions never improve fires again
on the first sample past the window, which is what that constant's docblock
says it should do.

`respondersDispatched: 58` = 2 for the assault + 4×14 riots, against
`requiredResponders` of 2 and 4. **DERIVED:** the six-guard roster was never
the binding constraint, which is why this act cannot say anything about a
starved response (§10).


## 3. Act 2 — no guards, and everything lapses

**MEASURED**, `act2`, the same prison with **no guards at all**, watched over
the same wall-clock window:

```
[act2] === 19 incident(s) in the log ===
[act2] incident.assault.1        assault       sev=3  :: active@6200  -> lapsed@6810  :: injured=2 damage=3  escaped=false
[act2] incident.riot.2           riot          sev=7  :: active@8150  -> lapsed@8760  :: injured=8 damage=7  escaped=false
[act2] incident.riot.3           riot          sev=10 :: active@12950 -> lapsed@13560 :: injured=8 damage=10 escaped=false
[act2] incident.riot.4           riot          sev=10 :: active@17750 -> lapsed@18360 :: injured=8 damage=10 escaped=false
[act2] incident.riot.5           riot          sev=10 :: active@22550 -> lapsed@23160 :: injured=8 damage=10 escaped=false
[act2] incident.riot.6           riot          sev=10 :: active@27350 -> lapsed@27960 :: injured=8 damage=10 escaped=false
[act2] incident.riot.7           riot          sev=10 :: active@32150 -> lapsed@32760 :: injured=8 damage=10 escaped=false
[act2] incident.riot.8           riot          sev=10 :: active@36950 -> lapsed@37560 :: injured=8 damage=10 escaped=false
[act2] incident.riot.9           riot          sev=10 :: active@41750 -> lapsed@42360 :: injured=8 damage=10 escaped=false
[act2] incident.riot.10          riot          sev=10 :: active@46550 -> lapsed@47160 :: injured=8 damage=10 escaped=false
[act2] incident.escape-attempt.11 escape-attempt sev=8 :: active@48000 -> lapsed@48610 :: injured=1 damage=8  escaped=TRUE
[act2] incident.riot.12          riot          sev=10 :: active@51350 -> lapsed@51960 :: injured=7 damage=10 escaped=false
[act2] incident.riot.13          riot          sev=10 :: active@56150 -> lapsed@56760 :: injured=7 damage=10 escaped=false
[act2] incident.escape-attempt.14 escape-attempt sev=7 :: active@60000 -> lapsed@60610 :: injured=1 damage=7  escaped=TRUE
[act2] incident.riot.15          riot          sev=10 :: active@60950 -> lapsed@61560 :: injured=6 damage=10 escaped=false
[act2] incident.riot.16          riot          sev=10 :: active@65750 -> lapsed@66360 :: injured=6 damage=10 escaped=false
[act2] incident.riot.17          riot          sev=10 :: active@70550 -> lapsed@71160 :: injured=6 damage=10 escaped=false
[act2] incident.escape-attempt.18 escape-attempt sev=6 :: active@72000 -> lapsed@72610 :: injured=1 damage=6  escaped=TRUE
[act2] incident.riot.19          riot          sev=10 :: active@75350 -> lapsed@75960 :: injured=5 damage=10 escaped=false
[act2] summary={"total":19,"stillOpen":0,"resolved":0,"lapsed":19,"totalInjured":114,"totalPropertyDamage":171,"escapes":3}
[act2] responseMetrics={"incidentsResolved":0,"incidentsLapsed":19,"respondersDispatched":0,"routeFailures":0}
[act2] EDGE TALLY [["active -> lapsed",19]]
```

**Nineteen incidents, nineteen lapses, 114 prisoner-injuries, three prisoners
gone.** `respondersDispatched: 0` — the pool never had one to send, so
`tryDispatch` returned early on every pass (`claimableResponders` answering
`undefined`, `response-system.ts:465`) and no incident ever left `'active'`.

Every lapse took **exactly 610 ticks**: `responseDeadlineTicks` is 600 and this
system's schedule is every 10 ticks, so `isPastDeadline` first answers true on
the sweep at `startedAtTick + 610`. That is DERIVED and it holds for all
nineteen without exception.

Two secondary observations, both MEASURED:

- **Severity is higher without guards.** Act 1's riots are severity 8, act 2's
  are 10. `severity = round(score * 10)` (`trigger-system.ts:513`, VERIFIED)
  and `staffingShortfallWeight` is `0.3` (`sector-risk.ts:113`), so a fully
  unstaffed sector scores three points higher on the same neglect. Guards make
  the incident smaller *and* answer it; the two effects are not separated here.
- **The prison visibly empties.** The riots' `participants` count falls 8, 8,
  7, 6, 5 as the three escapes succeed, and act 2's roster ends five prisoners
  where act 1's ends eight.


## 4. The screen says the same thing either way

This is the finding the brief was after, and it is a **HUD** claim: every
sentence below was read out of the DOM in the same poll iteration in which the
STATE channel recorded the terminal transition beside it. (A caveat this record
owes itself: the DOM read runs a few hundred milliseconds after the projection
read, so a screen sample is paired with a transition, not timestamped against
it. That is why only *terminal* pairings are quoted — a terminal state cannot
have moved on by the time the DOM was read.)

**A lapse** — act 2, `incident.assault.1`, `active → lapsed`, two prisoners
injured, verbatim from the run:

```
[act2] incident.assault.1 (assault, sev 3, required 2) active -> lapsed outcome{injured:2 damage:3 escaped:false}
[act2]     SCREEN band="The prison is under control again — no incident is still open."
[act2]     SCREEN alerts=["A fight has broken out between two prisoners. Day 3 Warning Clear this alert",
                          "The prison is under control again — no incident is still open. Day 3 Info Clear this alert", ...]
[act2]     SCREEN incidents-chip="0 INCIDENTS Clear"
```

**A resolution** — act 1, `incident.assault.1`, `responding → resolved`, nobody
injured, verbatim:

```
[act1] incident.assault.1 (assault, sev 3, required 2) responding -> resolved outcome{injured:0 damage:1 escaped:false}
[act1]     SCREEN band="The prison is under control again — no incident is still open."
[act1]     SCREEN alerts=["A fight has broken out between two prisoners. Day 6 Warning Clear this alert",
                          "The prison is under control again — no incident is still open. Day 6 Info Clear this alert", ...]
[act1]     SCREEN incidents-chip="0 INCIDENTS Clear"
```

Byte for byte the same band and the same chip. And here are the two prisons'
**whole screens** at the end of their runs — act 1's after fifteen resolutions
with nobody hurt, act 2's after nineteen lapses with 114 injuries and three
prisoners gone:

```
act 1, HUD, end of run (15 resolved / 0 lapsed / 0 injured):
  incidentsChip = "0 INCIDENTS Clear"
  band          = "The prison is under control again — no incident is still open."
  alerts        = ["A fight has broken out between two prisoners. Day 6 Warning Clear this alert",
                   "The prison is under control again — no incident is still open. 15× Day 33 Info Clear this alert",
                   "A riot has broken out — 8 prisoners have stopped taking orders. 14× Day 33 Critical Clear this alert",
                   "Contraband found: Tool. 2× Day 25 Warning Clear this alert",
                   "Nothing was removed — there is no object on that tile, and none being built there. Warning"]
```

The alerts column of a prison that answered everything and a prison that
answered nothing carry **the same rows in the same order** — an "opened" row
per type, an all-clear row with an occurrence count, and whatever else the
session happened to say. Nothing in either column is a statement about an
outcome.

Act 2's own end-of-run screen was not captured: that run stopped making
progress on the final Staff-panel read, after its incident dump had already
been written, and was killed rather than waited out. So the act-2 side of this
comparison is the last
mid-run sample instead — `"The prison is under control again — no incident is
still open. 7× Day 16 Info"` sitting beside `"A riot has broken out — 8
prisoners have stopped taking orders. 7× Day 16 Critical"`. Reported rather
than quietly substituted.

**VERIFIED, and this is a decision rather than an oversight.**
`reportAllClearIfCalm` (`response-system.ts:268-272`) is called from both
terminal transitions and emits one outcome-agnostic `incidents.all-clear`; its
own docblock argues the case at length and is worth quoting rather than
paraphrasing:

> It is also the only true thing to say after a **lapse**. An incident that
> ran its course was not "resolved" — participants were injured, and an escape
> attempt means somebody is gone — but the prison does have nothing open, and
> that is all this claims. What it cost is `IncidentOutcome`, which the
> `hud/incidents` projection renders per incident.

The sentence is honest. The **referral is not reachable**: §6.

This generalises, played rather than read, what
`docs/research/2026-09-02-playing-incidents-and-response.md` finding 2 recorded
for a riot alone. The addition here is the counterfactual — the same run
design with guards, producing the opposite outcome and the identical screen.

### The one thing that does differ, and it is not a label

**DERIVED from the MEASURED timelines.** A resolved incident closes ~70 ticks
after it opens; a lapsed one closes at `responseDeadlineTicks` plus one system
interval — **exactly 610 ticks, in all nineteen of act 2's lapses and in act
3's first attempt's `active@9850 -> lapsed@10460`**. So the gap between the
"opened" alert and the "all clear" alert is roughly **0.9 seconds against 7.6
seconds at 4×**, and about **3.5 seconds against 30 seconds at 1×**.

That gap is the only observable difference, it is a duration rather than a
statement, no surface names it, and a player who looks away — which at 4× means
looking away for one second — sees neither end of it.

## 5. The escape is the exception, and it works

**MEASURED**, act 2, `incident.escape-attempt.11`, `active → lapsed` with
`escaped: true`:

```
SCREEN band="Yusuf Bakker broke out — no guard reached them in time."
SCREEN alerts=[... "A prisoner is trying to break out. Day 21 Critical ...",
                   "Yusuf Bakker broke out — no guard reached them in time. Day 21 Critical ..."]
```

The all-clear row's occurrence count did **not** advance on this tick.
Measured across three consecutive terminal transitions in the same run: `10×`
at `riot.10`'s lapse, still `10×` at this escape, `11×` at `riot.12`'s lapse.
One suppression, exactly where it belongs. That is `reportAllClearIfCalm`'s `escapeAnnounced`
gate (`response-system.ts:270`, VERIFIED) doing exactly what issue #683 and the
owner's 2026-08-31 ruling 6 say it should: the escape sentence is written, the
contradicting all-clear is suppressed rather than replaced, and no wording was
invented to fill the hole. **Confirmed correct, live, end to end** — the one
incident ending a player is actually told about.

It is also the shape of what the other three types do not have.

## 6. Nothing on screen can be asked which ending it was

**VERIFIED.** `hud/incidents` and `hud/incident-detail` are served by the
worker (`src/simulation/worker/projection-catalog.ts:417` and `:435`) and carry
everything this pass needed: `state`, `terminal`, the full `timeline`, and
`outcome` with `injuredCount`, `propertyDamage` and `escaped`
(`src/simulation/presentation/incident-projection.ts`). A grep for either id
across `src/ui/` and `src/main.ts` returns **nothing**; the ten ids the
interface does request are `hud/build-queue`, `hud/held-guards`,
`hud/pending-deliveries`, `hud/prisoner-detail`, `hud/prisoner-population`,
`hud/prisoner-roster`, `hud/room-detail`, `hud/room-list`, `hud/staff` and
`hud/status-strip`.

**This is already known and already gated, and this record is not claiming to
have found it.** `tests/foundation/projection-reachability-contract.test.ts`
names both ids in `UNPAINTED_PROJECTION_IDS` and says why, quoting its own
entry:

> `'hud/incidents'`: No reader. `docs/research/audit-2026-08-26/10-product-roadmap.md:328`
> names the panel this waits on, "Incident notification + response controls,"
> and it is not built.

What this pass adds is the **price of that absence at the table**: it is not
only that a panel is missing, it is that the sentence the shipped interface
*does* say defers to a surface that does not exist. `reportAllClearIfCalm`'s
docblock says the cost "is `IncidentOutcome`, which the `hud/incidents`
projection renders per incident" — and no player can reach that projection.

**What a player *can* see while a response is running** — and this is a real
signal, MEASURED: the Staff panel's held-guard rows label a responder
`Incident Response` (`src/content/simulation-message-keys.ts:321-330`,
`guard-claim` namespace, VERIFIED). It is a live claim rather than a history:
it appears when the response mounts and is gone when the response ends, so at
4× it is on screen for well under a second, and after the fact it says nothing
at all.

## 7. `'responding' → 'lapsed'` — the edge exists, and nothing in these runs reached it

The brief's sharpest question. **VERIFIED by enumeration**, then tested by
playing.

`lapse` has exactly three call sites, all in
`src/simulation/incidents/response-system.ts`:

| line | reached from | incident state |
| --- | --- | --- |
| `:432` | `tryDispatch` | `'active'` only — `update` calls it only for `'active'` (`:421`) |
| `:801` | `advanceResponse`'s **no-record** branch | `'notified'` or `'responding'` |
| `:827` | `advanceResponse`'s `'notified'` branch | `'notified'` only |

So `'responding' → 'lapsed'` has **one** producer: `:801`, and it fires only
when `this.responses` holds no record for an incident that is already
`'responding'`. The `'responding'` branch itself (`:831-850`) never checks the
deadline — it waits `containmentTicks` and resolves — so **an incident that
reaches `'responding'` with its response record intact always resolves,
however late it is.**

A record disappears in three ways (`responses.delete` at `:396` and `:775`,
plus the map not surviving a restore):

1. `releaseResponse` — called only from the two terminal transitions, so it
   cannot produce this edge.
2. `releaseResponder` (`:389-400`) — the player takes the **last** responder
   off a live response through ADR 0034's Release control, the record is
   deleted, and its own docblock states the consequence outright:

   > **A response left with no responders is abandoned, and the incident is
   > left open.** The record is deleted and nothing is transitioned: the
   > incident keeps running and lapses at its own deadline.

3. A save/restore taken mid-response, where
   `redispatchInterruptedResponses` (`:580-598`) cannot refill — the pool is
   too small, the sector is unregistered, or (for an incident already
   `'responding'`) the guards it could claim are not at the scene.

**MEASURED across 39 incidents in three prisons: `'responding' → 'lapsed'`
did not occur once — but `'notified' → 'lapsed'` did, and act 3 has it.** The edge tallies are in §8.

**MEASURED, three attempts, and the two failures are evidence too.** Act 3
sets out to abandon a live response deliberately, with a real gesture — ADR
0034's Release control on the Staff panel's held-guard rows. What each attempt
established:

1. **Attempt 1** (poll `hud/incidents` at 4×, pause when `'responding'`
   appears): by the time the first poll returned an incident at all it was
   already `responding`, and the next poll had it `resolved`.
   `active@15150 -> notified@15150 -> responding@15160 -> resolved@15220`.
2. **Attempt 2** (pause the instant *any* incident is seen, then step): the
   Pause press was issued while the incident read `'responding'` and the
   incident still resolved — `responding@15110 -> resolved@15170`. A browser
   press lands tens of ticks late; `containmentTicks` is 60; at 4× the press
   loses the race to the containment timer.
3. **Attempt 3** (never let the clock free-run: 600 ms bursts of 1×, about 12
   ticks each, with the clock paused between them): **this one worked, and
   landed one state earlier than aimed.** It caught `incident.assault.2` in
   `'notified'` after 32 bursts, with the Staff panel reading

   ```
   held = "ON DUTY | 3 held · 3 free | Guard · Sector Post | Release
           | Guard · Incident Response | Release
           | Guard · Incident Response | Release | ..."
   ```

   — two responders held for this incident, named as such, which is the one
   moment a player can see that anybody came. Three Release presses later the
   block read `"0 held · 6 free | Nobody is assigned right now."`, and the
   incident, with its record now deleted, ran to its deadline:

   ```
   [act3] incident.assault.2 notified -> lapsed
          (timeline [active@10350, notified@10350, lapsed@10960])
          outcome={"injuredCount":2,"propertyDamage":3,"escaped":false}
   [act3]     SCREEN band="The prison is under control again — no incident is still open."
   [act3]     SCREEN incidents-chip="0 INCIDENTS Clear"
   ```

   **So the brief's "a guard who was on the way and then wasn't" does happen,
   it is a player's own doing, and the game's answer to it is "the prison is
   under control again."** The two prisoners the response would have protected
   are in the `outcome` and nowhere on screen. Exactly 610 ticks, like every
   other lapse.



**Why the `'responding'` half stays out of reach without pausing, DERIVED from
§1:** `'responding'` lasts `containmentTicks` = 60 ticks, which is 3 seconds at
1× and 0.75 seconds at 4×. Opening the Security tab, expanding the roster,
finding the held rows and pressing Release on each does not fit inside three
seconds of real time — attempt 2 could not even land a single Pause press
inside it. The clock has to be paused for a player to act inside that window at
all, and pausing *is* a gesture a player has, so this is a reachable edge
rather than an unreachable one. It is simply not one anybody hits by accident,
and 39 incidents of ordinary play did not.

**The `'notified'` half is much easier**, because `'notified'` lasts as long as
the routes take rather than 60 fixed ticks, and act 3 reached it. Both halves
share the same consequence at the screen: nothing.

## 8. Counting the endings

**MEASURED.** Every edge every incident actually walked, off
`hud/incident-detail`'s `timeline`, across all five runs (act 1, act 2, and act
3's three attempts):

| edge | act 1 (6 guards) | act 2 (0 guards) | act 3 (×3) | total |
| --- | --- | --- | --- | --- |
| `active → notified` | 15 | 0 | 3 | 18 |
| `notified → responding` | 15 | 0 | 2 | 17 |
| `responding → resolved` | 15 | 0 | 2 | 17 |
| `active → lapsed` | 0 | 19 | 2 | 21 |
| **`notified → lapsed`** | 0 | 0 | **1** | **1** |
| **`responding → lapsed`** | 0 | 0 | 0 | **0** |

**39 incidents: 17 resolved, 22 lapsed.** Of the 22 lapses, 21 were
`active → lapsed` — nobody was ever sent — and exactly one came after a
dispatch, and that one was manufactured on purpose with three Release presses
against a paused clock.

So the brief's hypothesis is **confirmed in substance and corrected in detail**:

- **Confirmed:** an incident really does end with nobody having done anything,
  and in an unguarded prison it is the *only* thing that happens — nineteen
  times out of nineteen, `respondersDispatched: 0`.
- **Confirmed, with the reproduction:** an incident can end after a responder
  was dispatched. That is `notified → lapsed`, §7 attempt 3.
- **Corrected:** the specific edge the brief named, `'responding' → 'lapsed'`,
  was not reached once. It requires the response record to vanish *after* the
  responders have arrived, which needs a Release press inside a 60-tick window
  or a restore — see §7 and §10.

## 9. What this pass did not reach

- **A restore taken mid-response.** Route 3 to `'responding' → 'lapsed'` in §7
  is VERIFIED by reading only. `tests/integration/incident-response-restore.test.ts`
  exercises the re-dispatch path at the unit boundary; nobody has driven it
  through a real save and reload in a browser with a response in flight, and
  this pass did not either.
- **`gang-retaliation`.** Zero fired in any act. The three types that did fire
  were `riot`, `assault` and `escape-attempt`. UNKNOWN whether its endings look
  any different; nothing in `response-system.ts` branches on type except the
  escape sentence and the assault adjudication, so DERIVED they do not, but
  that is not a measurement.
- **More than one incident open at once.** `reportAllClearIfCalm` is explicitly
  designed for that case (*"Two incidents that close on the same tick produce
  one line rather than two"*), and the shipped single-sector topology never
  produced it here. So the behaviour a player would see when one of two
  incidents closes — **nothing at all** — is VERIFIED by reading and UNMEASURED.
- **Whether a player would notice the duration difference of §4.** That is a
  question about a person, not about the code, and no instrument here answers
  it.
- **Act 2's end-of-run screen.** That run stopped making progress on its final
  Staff-panel read, *after* writing its incident dump, and was killed rather
  than waited out; so §4's act-2 side is a mid-run sample. Every incident
  figure for act 2 is intact and pasted; only the closing screen is missing.
  Act 1 ran the identical code path to completion, so this is a stall in the
  instrument's own last step rather than a claim about the game.
- **`'responding' → 'lapsed'` itself**, which is §10's first bullet.

## 10. My weakest claim, and what would change it

**The weakest claim in this record is §7's "nothing in these runs reached
`'responding' → 'lapsed'`, and here is the structural reason."** The
measurement is solid — 39 incidents, zero on that edge — but the *reason* rests
on an enumeration of `lapse`'s three call sites plus one fixture repeated three
times: one bed, eight admissions, one sector, six guards or none. Two things
would change it:

- **A prison whose guard pool is smaller than a second, overlapping incident's
  `requiredResponders`**, so that a response is mounted and then starved. This
  fixture never had that: act 1 dispatched 58 responders against requirements
  of 2 and 4 from a roster of six, and the pool was never the binding
  constraint. `claimableResponders` (`response-system.ts:453-466`) draws from
  `unassignedGuardIds`, so a prison that posts most of its guards could
  plausibly starve one.
- **A save and reload taken while an incident is `'responding'`** — route 3 in
  §7, VERIFIED by reading only, never driven through the real persistence path
  in a browser by anybody.
- **The same Release gesture act 3 landed, but 10 ticks later.** Attempt 3
  caught `'notified'`; catching `'responding'` needs the presses to fall inside
  a 60-tick window and act 3's burst was 12 ticks, so it is a matter of a
  tighter burst and a rerun rather than of a different mechanism. That is the
  cheapest thing anybody could do to refute this section.

What would *not* change it is more of the same fixture: fourteen consecutive
act-1 riots all took the full four-state path with identical +10/+70 offsets,
and nineteen act-2 incidents all took `active → lapsed` at exactly +610. The
sample that could have refuted the pattern is the one that produced it.

**Second-weakest: §4's "the screen says the same thing either way" is a claim
about *these* screens.** Every DOM read is paired with a transition rather than
timestamped against it (the caveat is stated in §4), and the whole record has
**one sector**, so no incident ever closed while another was still open. In
that case `reportAllClearIfCalm`'s `openIncidentCount > 0` guard
(`response-system.ts:269`) suppresses the all-clear entirely and the player is
told **nothing at all** about the ending — which is worse than what is measured
here, is VERIFIED by reading, and is UNMEASURED. A second sector would settle
it.

## 11. Sentences and decisions the owner is owed

Player-facing wording is the owner's alone; this record authors none. What is
owed, stated as what the words must convey rather than as the words:

1. **A closing line for a riot, an assault and a gang-retaliation that says
   which ending it was.** Today all three share `incidents.all-clear` with a
   resolution. Escape already has its own (`incidents.escape-succeeded`), and
   §5 shows the shape works; the other three have no equivalent. This is the
   same sentence `2026-09-02-playing-incidents-and-response.md` asked for and
   it is still owed.
2. **Whether a lapse's cost — who was hurt, what was damaged — should reach the
   player at all, and where.** `IncidentOutcome` carries `injuredEntityIds` and
   `propertyDamage`; `reportAllClearIfCalm`'s own docblock defers to a
   projection that nothing renders (§6). Either the deferral is wrong or the
   panel is owed.
3. **Whether "the prison is under control again" should be said at all after a
   lapse**, given that in act 2 it was said **sixteen** times (DERIVED: 19
   lapses less the 3 escapes whose own sentence suppresses it) over a prison
   that had by then taken 114 prisoner-injuries and lost three prisoners.
4. **What the Release control should say when the row it sits on reads
   `Incident Response`.** MEASURED: the block's own helper line is *"A released
   guard stays hired and goes back to the pool."* — true, and about staffing
   only. Act 3 pressed Release on two `Incident Response` rows and the
   consequence was that the assault those two were answering ran to its
   deadline and injured both participants (§7). The control describes what the
   guard does and not what the incident does, and a player cannot predict the
   second from the first. Whether that deserves a sentence, a confirmation, or
   nothing at all is the owner's; this record only shows that the gap is real
   and reachable in one press.
