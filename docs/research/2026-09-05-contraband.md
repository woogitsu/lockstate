# 2026-09-05 — contraband: does a player know it exists, can they do anything about it, and does any of it reach the screen?

**Played on `agent/playtest-contraband`, cut from `b984445f` — v0.0.475, which
was still `origin/main` when this run started and when it finished.** Nothing
under `src/` was changed; `git diff origin/main..HEAD -- src/` is empty. The
instrument is `tests/browser/playtest-2026-09-05-contraband.playtest.ts`, three
acts, and every act below was run and its output is quoted.

Evidence tiers, per the common brief: **MEASURED** (from a run, quoted) ·
**VERIFIED, read** (the file was opened at that line) · **REASONED** (follows
from a stated MEASURED/VERIFIED fact) · **JUDGEMENT** (what a player would do or
feel, said so).

## The question, as given

Contraband is a whole subsystem with its own ADR, its own document, its own
search machinery and its own risk model — and nobody in this repository has ever
played it. Does a player know it exists, can they do anything about it, and does
any of it reach the screen?

## The verdict, in one paragraph

**It works, it is invisible until it fires, and the one thing standing between a
player and the whole subsystem is a guard the game tells them they do not need.**
Contraband is introduced, searched for, found, confiscated and announced — but
only after the player hires **one more guard than the Staff panel asks for**, and
the Staff panel says **"Covered"** at the number that finds nothing. MEASURED, in
one prison across three phases: at 1 guard and at 2 guards, over 21,451 ticks
(≈9 in-game days), **zero** discoveries; at 3 guards, the first find at tick
27,651 and a second at 35,422. When it does fire the player is told well —
a `warning`-toned chip reading `2 · CONTRABAND · Tool`, an events-band sentence
*"Contraband found: Tool."*, and a dismissible alert row that aggregates
repeats — and that is the **entire** surface: sweeping all five tabs of a prison
that had found something returned the same four lines on every tab, all of them
from the always-on chrome and none from any tab's own content. **The player
cannot order a search: `commands.ts` declares fifteen command types and none is
one** (VERIFIED), so ADR 0073's Option B is genuinely unbuilt, exactly as the ADR
asks. The one control that touches a search at all is **Release** on a
`Guard · Contraband Search` row — which cancels the sweep, is not labelled as
doing so, and could not be reached on any of three attempts at ×4: twice refused
with the designed *"that guard is already off duty"*, and once the row was gone
before a Pause press could land. And a live `hud/contraband` projection carries 40
completed searches, one item missed, full provenance for every find and an empty
intelligence ledger — pulled here out of the running worker, and drawn by
nothing.

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5329 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-contraband.playtest.ts -g "act 1"
```

- **act 1** — one guard, then two, then three. 12 beds, 12 admissions, ~7 min.
- **act 2** — the whole surface a player can see, swept. 12/12/3, ~8 min.
- **act 3** — the only contraband control a player has is Release. 12/12/3, ~6 min.

Acts 2 and 3 pull `hud/contraband` out of the live worker through a **projection
probe** the file installs: a second `Worker` wrapper registered after
`installTee`, because the tee deliberately drops `simulation/projection` from its
buffer. Two mistakes in that probe are recorded in the file itself rather than
tidied away — it cleared its capture array by assignment (orphaning the init
script's closure) and it did not filter by `replyTo` (the Security tab pulls
`hud/staff` and `hud/held-guards` about once a second and evicted every
contraband reply). Both produced a confident, wrong `[]`.

---

## 1. The guard threshold — a player who does what the game asks finds nothing

**MEASURED, act 1**, one prison, three phases, same seed and same prisoners:

| phase | guards | Staff panel says | ON DUTY | discoveries |
|---|---|---|---|---|
| A, ticks 0–13,478 | 1 | `1 of 2 · Understaffed · Hire 1 more to cover this population.` | `1 held · 0 free` | **0** |
| B, ticks 13,478–21,451 | 2 | `2 of 2 · Covered · Only free guards answer incidents.` | `2 held · 0 free` | **0** |
| C, ticks 21,451–35,422 | 3 | `2 of 2 · Covered` | `2 held · 1 free` | **2** (ticks 27,651 and 35,422) |

Quoted from the run:

```
[contraband] phase A-one-guard discoveries: []
[contraband] phase B-two-guards discoveries: []
[contraband] phase C-three-guards discoveries: [{"tick":27651,"type":"contraband.discovered","categoryNameKey":"contraband.tool.name"}]
[contraband] hires at ticks: second=13478 third=21451
[contraband] every contraband.discovered: [{"tick":27651,...},{"tick":35422,...}]
```

**Why**, VERIFIED, read: `SectorSearchDutySystem.update`
(`src/simulation/contraband/sector-search-duty.ts:123-130`) skips a sector unless
`this.assignedGuardCount(sector.id) !== 0` **and**
`claimableGuardIds(this.guards).length >= policy.requiredGuardCount`.
`claimableGuardIds` is the *unassigned*, post-eligible pool (ADR 0053), never a
posted guard. The sector's requirement is not the constant ADR 0073 was written
against: `resolveOccupancyScaledGuardCount`
(`src/simulation/security/sector-staffing.ts:190`) returns
`max(scheduledGuardCount, ceil(occupants / 8))` with
`DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8` (`:147`), so **twelve prisoners require
two guards** and the first *spare* guard is the third.

**REASONED, and this is the finding**: the number of guards that makes
contraband findable is `ceil(population / 8) + 1`, and the Staff panel's own
readout tells the player the requirement is met at `ceil(population / 8)` and
calls it **Covered**. ADR 0073 predicted this coupling in the abstract — *"a
prison that hires exactly its posted requirement finds nothing, and the first
hire past it is what makes contraband findable"* — but it wrote it against a
constant of one, and against a panel that did not yet say *Covered* at that
number.

**JUDGEMENT**: a player who reads *"Hire 1 more to cover this population"*, hires
one more, sees *Covered*, and stops, will never see the word Contraband change
from `0` no matter how long they play, and nothing on screen connects the two
facts. That is not the subsystem failing; it is the subsystem's precondition
being invisible.

**Cost, MEASURED**: the third guard is `Hire Guard · 80` and
`ON THE PAYROLL 240 a day` (up from 160). So the price of the whole contraband
subsystem is 80 up front and 80/day, and nothing says so.

---

## 2. What a player is told when something is found — this part is good

**MEASURED, act 1 and act 2.** When a sweep finds something, three surfaces move
at once, and all three are in the always-on chrome rather than in a tab:

- the **status-strip chip**: `"2 / CONTRABAND / Tool [tone=warning]"` — the count
  and a badge naming the category, tone `warning`;
- the **events band**: `"Contraband found: Tool."`;
- an **alert row**: `"Contraband found: Tool. 2× Day 15 / Warning / Clear this alert"`.

The alert row is dismissible — MEASURED, act 2:

```
[contraband] alert rows: [
  {"id":"event-1","dismissible":"true","text":"A fight has broken out between two prisoners. Day 4 Warning Clear this alert"},
  {"id":"event-2","dismissible":"true","text":"No incident is still open — ... Day 4 Warning Clear this alert"},
  {"id":"event-3","dismissible":"true","text":"Contraband found: Tool. Day 5 Warning Clear this alert"},
  {"id":"refusal-13","dismissible":"absent","text":"Nothing was removed — ..."}]
```

**So there is history, and it is bounded and aggregated.** VERIFIED, read:
`MAX_EVENT_ALERT_ROWS = 8` (`src/ui/simulation-events.ts:488`), oldest dropped,
cleared on `simulation/stopped` and on `simulation/ready`, and a dismissal is
sent to the worker so it survives a reload (ADR 0084 decisions 3 and 4). The
repeats collapse: two finds on different ticks produced **one** row reading
`2× Day 15` — MEASURED — so the list says *how many* and *which day the latest
was*, not when each happened.

**The badge is honest about mixed hauls**, VERIFIED, read
(`src/simulation/presentation/status-strip-projection.ts:739`,
`soleDiscoveredContrabandNameKey`): the name is published only when the whole
confiscation ledger is one category, because *"a badge qualifies the whole
count"*. Both of act 1's finds were tools, so the badge stood; a mixed prison
would show the count with no word.

**This corrects a claim inherited from the last day.** The brief carried a
tester's measurement of `2 CONTRABAND` in the strip *"with two contraband alerts
standing and an unchanged canvas — nothing drawn, anywhere"*. The count and the
alerts reproduce exactly. **The canvas half does not reproduce as stated, and it
does not mean what it says either way**: MEASURED, act 1, the canvas digest moved
across every phase (`169611b/cfa5f495` → `166615b/96376acf` →
`168988b/76ccafe3`), but a prison with twelve walking prisoners repaints
constantly, so a *changed* canvas is no evidence that anything contraband-shaped
was drawn and an *unchanged* one would be evidence of a stalled renderer rather
than of a missing sprite. The honest form of the claim is the one section 3
makes by enumeration: **nothing in the world view and nothing in any panel names
contraband**, and the digest cannot decide that question in either direction.

---

## 3. The whole surface, swept — four lines, and the same four on every tab

**MEASURED, act 2**, in a prison that had already found a tool at tick 10,221.
Every tab was opened and its whole `.hud` `innerText` filtered for
`contraband|search|seiz|confisc|smuggl|intelligen|informant|weapon|drug|phone|currency|tool`:

```
[contraband] tab overview: 71 lines;  contraband-shaped = ["CONTRABAND","Tool","Contraband found: Tool.","Contraband found: Tool. Day 5"]
[contraband] tab build:    113 lines; contraband-shaped = [same four]
[contraband] tab rooms:    103 lines; contraband-shaped = [same four]
[contraband] tab security:  87 lines; contraband-shaped = [same four]
[contraband] tab regime:    99 lines; contraband-shaped = [same four]
```

**All four lines are the chip, the band and the alert row** — the chrome that is
on screen whatever tab is open. **No tab contributes a single contraband-shaped
line of its own.** The Security tab, which is where ADR 0073's Option B would put
a search control, contributes nothing.

Every visible control was enumerated too, so *"there is no Search button"* is a
list rather than an assertion — MEASURED, act 2:

```
[contraband] tab security controls (26): ["button:Pause","button:Play at normal speed","button:Fast forward",
 "button:Collapse","button:ALERTS","button:Clear this alert" x3,"button:100%","button:New prison","button:Save now",
 "button:Export","button:Import","button:Load","button:Delete","button:WHO TO HIRE","button:Guard Selected",
 "button:Hire Guard · 80","button:Release","button:Release","button:ON THE PAYROLL 240 a day",
 "button:OVERVIEW","button:BUILD","button:ROOMS","button:SECURITY","button:REGIME"]
```

**And the command vocabulary settles the other half.** VERIFIED, read:
`src/simulation/protocol/commands.ts` declares fifteen `z.literal` command types
— `PlaceBuildOrder`, `CancelBuildOrder`, `ZoneRoom`, `UnzoneRoom`,
`PurchaseMaterials`, `CancelMaterialPurchase`, `AdmitPrisoner`, `HireStaff`,
`PlaceObject`, `RemoveObject`, `ReleaseGuardAssignment`, `DismissStaff`,
`DismissAlert`, `Undo`, `Redo` (lines 53, 63, 68, 104, 152, 194, 268, 304, 372,
431, 481, 530, 584, 590, 594) — and **none of them orders a search.** MEASURED,
act 1, what a whole session actually sent:

```
[contraband] every command this session sent: {"RemoveObject":13,"PurchaseMaterials":2,"PlaceBuildOrder":24,
  "ZoneRoom":1,"PlaceObject":13,"AdmitPrisoner":12,"HireStaff":3}
```

**A player cannot order a contraband search.** That is not a defect: ADR 0073
Part 2 recommends Option A first and explicitly says Option B *"should not be
built before A has been played"*, and `sector-search-duty.ts:26-32` says the same
in its own docblock — *"This is **not** a player command."* This record is the
first time A has been played, which is the precondition that ADR was waiting on.

---

## 4. The projection nothing draws, pulled out of the running worker

`hud/contraband` is a real route (`src/simulation/protocol/types.ts:343`,
`src/simulation/worker/projection-catalog.ts:406`) that no file under `src/ui/`
requests — **already known and already gated**, as a named exemption with a
stated blocker in
`tests/foundation/projection-reachability-contract.test.ts:368-369`, and
enumerated in `docs/research/2026-09-04-what-the-game-shows-nobody.md` §5. What
is new here is **what it actually holds in a played prison**, asked of the live
worker at tick 33,649 — MEASURED, act 2:

```json
"metrics":{"itemsDiscovered":1,"itemsMissed":0,"searchesCompleted":40,
           "searchesCancelled":0,"searchesQueued":0,"searchesActive":1}
"searchOrders":[{"orderId":"contraband.sector-sweep.security-sector.prison.56","scope":"sector",
  "state":"searching","targets":[{"kind":"prisoner","id":"8"},…4 targets…],
  "currentTargetIndex":1,"progress":{"permille":250,"filled":3,"segments":10},
  "assignedGuardEntityIds":[2]}]
"discovered":{"total":1,"rows":[{"itemId":"contraband.intake.8.7715","categoryId":"contraband.tool",
  "legalContext":"controlled","severity":6,"foundAtHolder":{"kind":"prisoner","id":"8"},
  "searchOrderId":"contraband.sector-sweep.security-sector.prison.17","foundByStaffEntityId":2,
  "tick":10220,"provenance":{"sourceType":"prisoner","sourceId":"8","introducedAtTick":7715}}]}
"intelligence":[]  "informants":[]
"discoveredByCategoryId":[currency 0, drug 0, phone 0, tool 1, weapon 0]
```

**So the game knows, and does not say, all of this:** that forty searches have
been completed; that one is running right now, 25% through a four-person sweep,
walked by guard 2; that the item found was a tool, `controlled`, severity 6,
carried by prisoner 8 since tick 7,715 and taken at tick 10,220; and that four of
the five catalogue categories have never been seen. The player is told exactly
one number and one word: `1 · CONTRABAND · Tool`.

**`itemsMissed` moves too**, MEASURED in act 3: `"itemsMissed":1` at tick ~10,900
with `itemsDiscovered: 0` — a search stood next to a concealed item, failed the
detection roll, and nothing anywhere records that for the player. VERIFIED, read:
`search-system.ts:422-424` increments it when `rng.nextFloat() >= probability`.

---

## 5. Issue #573, re-checked at v0.0.475 — still true, and now measured in play

Issue #573 says intelligence has no producer, so `intelligenceConfidenceBonus` is
dead weight and `contrabandPressureWeight` is structurally zero. **Both halves
still hold**, and the second is now also MEASURED rather than only read:

- **VERIFIED, read**: `grep -rn "\.report(" src/` returns exactly one call site,
  `src/simulation/contraband/informants.ts:87`, inside `reportInformantTip`; and
  `reportInformantTip` has **no caller in `src/`** — its only callers anywhere are
  `tests/unit/contraband-intelligence.test.ts`.
- **MEASURED**: the live projection above answers `"intelligence":[]` and
  `"informants":[]` in a prison at tick 33,649 that has run 40 searches. So the
  bonus term is `0` on every one of those forty, in play, not merely in theory.
- **VERIFIED, read**: `contrabandPressure` is fed only from the intelligence
  ledger (`src/simulation/runtime/new-session.ts:1315-1316`,
  `for (const record of intelligence.forTarget('sector', sectorId))`), so
  `DEFAULT_SECTOR_RISK_POLICY.contrabandPressureWeight = 0.2`
  (`src/simulation/incidents/sector-risk.ts:114`) weights a term that cannot move.
  `sector-risk.ts:100-102` already says so in a comment.

**One correction to #573's trailing list.** It reports that
`tests/browser/app-shell.spec.ts` *"at roughly line 1743"* carries a false
sentence about `submitOrder` having no caller. **That sentence is gone at
v0.0.475**: `grep -n "submitOrder still has no caller" tests/browser/` returns
nothing. The rest of #573 stands.

**And one thing #573 does not say, which the play shows.** The *other* contraband
term is emphatically **not** structurally zero: `flashpoint.contrabandSeverity`
is a live input to the assault score and a **precondition** of an escape attempt
— `src/simulation/incidents/flashpoint.ts:267` and `:282`
(`return flashpoint.riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER && flashpoint.contrabandSeverity > 0`).
So concealed contraband does change the game; it is the *suspicion* half that is
inert, not the *possession* half.

---

## 6. The one control that touches a search, and what pressing it does

**VERIFIED, read**: `GUARD_CLAIM_KINDS` includes `'search'`
(`src/simulation/security/guard-release.ts:25`), resolved live for an
`'on-search'` guard at `:201-203`, and
`src/content/simulation-message-keys.ts:327` labels it **`Contraband Search`**.
`guard-release.ts:220` — `if (claim === 'search') this.search.releaseGuard(guardId);`
— means the Staff panel's **Release** button on that row **aborts the sweep.**

**MEASURED, act 3**, polling the ON DUTY list every 1.5 s of page time for a
whole run:

```
[contraband] FIRST "Contraband Search" row at tick 10232:
  [{"guard":"0","text":"Guard · Sector Post Release"},
   {"guard":"1","text":"Guard · Sector Post Release"},
   {"guard":"2","text":"Guard · Contraband Search Release"}]
[contraband]   summary line: "3 held · 0 free"
[contraband] held-row samples: 93; samples showing a search row: 17
```

So **a searching guard is on the panel a noticeable minority of the time** —
**17 of 93** samples in one run and **9 of 70** in a second (18% and 13%; the two
runs are on different seeds and the second shared the machine with another
tester's suite). This is the only place inside a *tab* where contraband work
appears at all, and it appears as a status word on a staff row rather than as
anything about contraband.

**Pressing Release on it was refused, both times.** MEASURED, act 3, pressing as
soon as the row was read, with no probe in between:

```
[contraband]   after Release, alerts: "Nothing was released — that guard is already off duty."
[contraband]   after Release, staff: … ON DUTY | 2 held · 1 free | Guard · Sector Post | Release | Guard · Sector Post | Release …
"metrics":{"itemsDiscovered":0,"itemsMissed":1,"searchesCompleted":3,"searchesCancelled":0,…}
```

**That refusal is the designed case, not a defect.** VERIFIED, read:
`src/content/default-locale-en.ts:783-786` — *"`not-held` is the one a player
provokes by pressing a row the list had already stopped being true about — a
response that closed or **a search that finished** between the publication and
the press."* **REASONED**: at ×4 a sector sweep leg is short enough that the
round trip from reading the row to landing the click outruns it, so the control
the panel offers on a searching guard is, at that speed, one a player is more
likely to miss than to hit. `searchesCancelled` stayed `0`.

**And pausing first did not help either, which is the discriminating attempt.**
MEASURED, act 3, third attempt: on a later sighting the clock was paused *before*
pressing, and the held-guard rows were re-read after the pause landed:

```
[contraband] PAUSED at tick 17044; rows now:
  [{"guard":"0","text":"Guard · Sector Post Release"},{"guard":"1","text":"Guard · Sector Post Release"}]
[contraband]   the row was gone before the pause landed -- no paused press made
```

The row that had been read one iteration earlier was **already gone** by the time
a Pause click and a 400 ms settle had completed. **REASONED**: at ×4 the
`Guard · Contraband Search` row is stale inside roughly one second of page time,
which is less than the time it takes to notice it and move a pointer to it. So
three attempts in two runs reached the control zero times.

**JUDGEMENT**: even if it landed, the row does not say what Release would cost.
It reads `Guard · Contraband Search` beside a button whose panel-level note is
*"A released guard stays hired and goes back to the pool."* — true, and silent
about the fact that the sweep in progress is discarded.

---

## 7. Does it matter? — what I can and cannot say

**What is VERIFIED**: contraband severity is a term in the assault score and a
hard precondition of an escape attempt (§5), so possession does change the
game's behaviour; confiscation removes the item from `byHolder` immediately
(`docs/CONTRABAND.md`, *Items*), so a find lowers that term for real.

**What is not MEASURED, and I am not going to pretend it is.** Act 1's three
phases were meant to be the comparison, and they are not clean enough to carry
it: assaults occurred in every phase (six `incidents.*` events in phases A and B
alone, ten by the end), the discoveries were two items in a twelve-prisoner
prison, and nothing isolates the assault rate from the needs pressure that
dominates `scoreSectorRisk` at `needsPressureWeight: 1`. **The honest statement
is: I found no measurable difference in incidents between a prison that searches
and one that does not, at this population and this length, and the effect size I
would need to see it is not something one prison can give.**

**And nothing in the game presents the link either way.** No sentence, badge or
panel anywhere connects a contraband find to safety, to incidents, to money or to
a need. MEASURED — the tab sweep in §3 is that enumeration.

---

## 8. What a player would actually experience, start to finish

**JUDGEMENT**, grounded in §1–§6. You build a cell, admit twelve people, and the
Staff panel tells you to hire two guards. You do. It says **Covered**. You play
for nine in-game days and the strip's `0 · CONTRABAND` never moves — which reads
as *"my prison is clean"*, which is exactly the false reading issue #552 was
filed about, arrived at by a different route: not a counter that *cannot* move,
but one that *will not* until you do a thing nothing has asked you to do. If you
happen to hire a third guard — for incident cover, say, since *"Only free guards
answer incidents"* is on the same panel — then some time later a line appears at
the bottom of the screen saying **"Contraband found: Tool."**, the chip turns
amber and reads `1 · CONTRABAND · Tool`, and an alert row records it. You have no
way to ask where it was, who had it, how many searches it took, whether anything
was missed, or what to do next. Pressing the only nearby button takes the guard
off the search you did not know was happening.

---

## 9. Improvement proposals

Every one is grounded in a measurement above. Per the common brief's limit, each
proposed string is paired with the code that would render it, so its truth can be
established before anybody writes it. **None of these was implemented — this
playtest is read-only on `src/`.**

### P1 — say what the third guard buys, on the panel that asks for the second

**Grounded in §1.** The Staff panel already computes everything needed: it knows
`required` and it knows how many guards are free (`3 held · 0 free` /
`2 held · 1 free` are MEASURED strings from `hud-staff__held-summary`). A line in
the coverage block, shown when `free === 0` and `required` is met, of the form
*"Nobody is spare — searches, and anything else that needs a free guard, wait."*

**Truth check**: `describeStaffCoverage` (`src/ui/hud/staff-panel.ts`) already
maps the covered case, and the panel already renders *"Only free guards answer
incidents."* in exactly this slot — MEASURED, quoted in §1 — so a second
consequence of the same fact is the same kind of sentence about the same value.
The claim *"searches wait"* is true of
`sector-search-duty.ts:126` (`claimableGuardIds(...).length < policy.requiredGuardCount` → `continue`),
which is the guard this proposal is describing. **This is the single highest-value
change on the list**: it is one sentence, in the place the player already is,
about a number already on screen, and it is the whole difference between a
subsystem that exists and one that does not.

### P2 — a contraband block on the Security tab, fed by the route that already exists

**Grounded in §3 and §4.** `hud/contraband` is built, paged, gated and empty of
readers; §4 shows it carrying forty searches, a live sweep with a progress
`BoundedValue`, per-find provenance and a per-category tally. A collapsed block
in the Security tab with three lines would spend almost none of that and answer
the questions §8 says a player cannot ask:

- **Searches**: `40 completed · 1 running` — straight from `metrics`.
- **Found**: the `discoveredByCategoryId` tally as chips, categories with `0`
  included (the projection already declares them, which is why the panel would
  not reshuffle).
- **Now**: when `searchOrders` is non-empty, the live order's `progress`
  through the existing `segmented-bar` primitive, which already takes a
  `BoundedValue`.

**Truth check**: every figure above is a field MEASURED in §4's payload, so no
sentence would assert anything the projection does not already publish. The
blocker named in `projection-reachability-contract.test.ts:369` is real and is
about `ConfiscationLedger.all()` being unbounded — which bites the *paged find
list*, not the metrics or the tally, so the three lines above can ship without
touching it.

### P3 — do not offer Release on a searching guard without saying what it costs

**Grounded in §6.** The row reads `Guard · Contraband Search` and the button
beside it discards the sweep (`guard-release.ts:220`, VERIFIED). Either the
button's confirm state names it — *"Release · the search in progress is
abandoned"* — or the row is not releasable while `claim === 'search'`. The first
is preferable: ADR 0034 exists to make a stuck claim releasable, and removing the
control would put the claim back out of reach.

**Truth check**: `releaseGuard` on the search claimant is what `:220` calls, and
`SearchSystem` cancels the order when its guards are taken (which is also why
`searchesCancelled` exists as a metric), so the sentence would be true of the
code that runs. **Measure first**: §6 could not land a press at ×4 at all, so the
value of a better label is bounded by whether the control is reachable in
practice — see §11.

### P4 — the alert row should say where, not only what

**Grounded in §2 and §4.** The row reads *"Contraband found: Tool."*. The
projection has `foundAtHolder: {"kind":"prisoner","id":"8"}` and
`foundByStaffEntityId: 2` for the same find. The events channel already carries
`categoryNameKey`; carrying the holder kind would let the sentence read
*"Contraband found on a prisoner: Tool."* without naming anyone.

**Truth check**: `ContrabandRegistry` ground truth is explicitly not for the UI
(`docs/CONTRABAND.md`, *Hidden state vs. player-visible intelligence*), but a
**confiscated** item's holder is already published to the projection as
*"Confiscated evidence, not hidden state"* (`contraband-projection.ts:113`), so
the holder *kind* is inside what the architecture already permits. This is a
protocol change to `SimulationEvent` and therefore larger than P1 and P2, and it
is listed last for that reason.

### P5 — the honest small one: the chip's tooltip

**Grounded in §2 and §8.** The chip reads `0 · CONTRABAND` for the whole of a
normally-staffed game, and `0` reads as *clean*. The chip primitive already
carries a `trailing` slot and a `tone`. A title of the form *"Items found by
searches this session."* would make `0` mean *"nothing has been found"* rather
than *"there is none"* — which is exactly what
`status-strip-projection.ts:451` already says in its own comment about the field
(*"Cumulative items found by searches this session."*), and therefore
demonstrably true of the code that renders it.

---

## 10. What I did not reach

- **Whether searching changes anything measurable.** §7. One prison, twelve
  prisoners, two finds. What would settle it is a paired run at a population
  where `contrabandSeverity` is not swamped by `needsPressure` — and, because
  nothing in the UI seeds a session, "paired" would have to mean many runs rather
  than two.
- **How much contraband exists but is never found.** The projection publishes
  `itemsMissed` (a failed roll) but nothing publishes the *concealed* count, by
  design, so I can measure finds and misses and not the denominator. "How often,
  out of what" is therefore answered only in its first half: **2 finds in 35,422
  ticks in act 1; 1 find and 1 miss in ~26,000 ticks in act 3; 40 completed
  sweeps for 1 find in act 2.**
- **Drugs and weapons.** Every find in every act was a tool or currency. ADR 0073
  and ADR 0080 both say the reachable band widens with risk tier, and act 1
  ended with `HIGH RISK 3`, but I never saw a `contraband.drug.name` or
  `contraband.weapon.name` badge and I am not going to claim from three runs that
  they are unreachable.
- **The `'delivery'` scope.** Unreachable by construction (#141's delivery bay
  does not exist), so not played.
- **A save/reload across a live sweep.** `SearchSystem`'s restore convention is
  documented and unit-tested; I did not exercise it through the UI.

## 11. My weakest claim, and what would change my mind

**That the Release control on a searching guard is effectively unreachable
(§6).** It rests on three attempts in two runs, all at ×4: two presses refused
with the designed `not-held` refusal, and one where the row vanished before a
Pause press landed. That is consistent and it is still three. **What would change
my mind** is a run at ×1, which I did not do: a sweep leg lasts the same number
of *ticks* either way, so at ×1 a player has four times the wall-clock window and
the control may be perfectly reachable — in which case the honest claim shrinks
to *"at ×4 this row is stale before you can press it"*, which is a speed
observation about one row rather than anything about contraband. **What would
make it worse** is a paused press that is *also* refused with the row still on
screen: that would mean the panel is publishing a claim the command layer no
longer agrees with, which is plumbing rather than timing. I did not obtain that
case — my paused attempt never got a row to press. **Three attempts is not a
measurement of a control**, and the number I would want is ten, half of them at
×1.

A second, smaller one: **the 18% visibility figure** (17 of 93 samples) is a
page-clock sample of a tick-driven state, taken in one prison at one speed. It is
the right order of magnitude for "a spare guard spends a noticeable minority of
its time searching" and it should not be quoted as a rate.
