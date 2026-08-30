# Playtest: `main` after fifteen changes — what a 90-day sentence looks like from the chair

**2026-08-30.** Mouse-driven playtest in a real Chromium at 1440x900, driving
the assembled page (`index.html` + `src/main.ts`) through a `Worker` tee that
records every command sent and every reply received. The script is
`tests/browser/playtest-after-today.playtest.ts`, collected by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI runs.

Played on **`origin/main` at `898a16a` (v0.0.252)**, in a worktree taken from it
with `git lfs checkout` run first — 62 objects, 93 MB, confirmed with
`file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104` rather than `ASCII text`, because
`docs/AGENT_WORKFLOW.md` records a browser playtest that ran green with no actor
sprites on screen at all.

**Whether anything else was on the machine, sampled throughout rather than
once.** `docs/AGENT_WORKFLOW.md` records an integrator who checked `ps` before a
run and drew a conclusion about the run; so a sampler wrote
`ps -eo args | grep -c "[p]laywright/test/cli"` and the configs behind it every
sixty seconds for the whole of both runs, 60 samples between 16:46 and 17:46
UTC. **Another agent's `tests/browser/playwright.config.ts` suite was on the
machine for 24 of them** — from 17:21:41 to the end of the window, which is all
of run B's act 3 — and one 18-second `vitest run tests/foundation/` of this
pass's own was at 17:21:29. **Run A's act 3 was uncontended throughout; run B's
was contended throughout.**

**It cost nothing measurable, and that is a number rather than an
impression.** Every figure in this record is a tick, a treasury amount or panel
text, and the tick is what the contention could have moved. At ×4 the clock
defines 80 ticks per wall second (`FixedStepClock(50)`,
`src/simulation/worker/state-machine.ts:216`, times a speed of 4). Measured
across the whole of run B's contended act 3 — tick 11,686 at t+167.1 s to tick
119,032 at t+1,508.8 s — **80.005 ticks per wall second**; across the whole of
run A's uncontended act 3 — tick 8,409 at t+125.8 s to tick 118,613 at
t+1,503.5 s — **79.991**. **A difference of 0.02%**, and the two runs finished
419 ticks apart on a ~110,000-tick horizon. So the contention cost this record
nothing, and that is a comparison rather than an assurance.

The brief was the owner's, in their own words: *"znajdź bugi i błędy grając, bo
ja nie mogłem postawić więzienia itp grając sam"* — find defects **by playing**
— under the standing design directive *"gra ma być łatwa przyjazna do grania, a
nie jakieś ukryte funkcje"*.

## The question

Fifteen changes landed on `main` on 2026-08-30 and nobody had played the result.
Three of them are what this pass is aimed at:

- **[#659](https://github.com/matmaxalez/lockstate/issues/659)** widened a
  sentence from 2–16 to **14–90 in-game days**
  (`src/simulation/prisoners/sentence.ts`, `MIN_SENTENCE_DAYS = 14`,
  `MAX_SENTENCE_DAYS = 90`). A day is `DAY_LENGTH_TICKS` = 2,400 ticks and a
  tick is 50 ms, so at ×1 a sentence went from *4–32 real minutes* to **28 real
  minutes to 3 real hours**.
- **[#660](https://github.com/matmaxalez/lockstate/issues/660)** gave a
  relocated resident a sentence: *"{name} had nowhere to sleep and moved to
  {room}."* (`src/content/default-locale-en.ts:461`).
- **[#635](https://github.com/matmaxalez/lockstate/issues/635)** put *"N with no
  bed"* on the PRISONERS chip.

And [ADR 0079](../adr/0079-a-sentence-long-enough-to-be-a-history.md) makes one
prediction it does not test:

> **Steady-state occupancy rises for a given admission rate**, by roughly the
> ratio of the means — 124,800 against 21,600, a factor of **5.8**. ADR 0050's
> 200,000-tick population harness was **not** re-run […]. That is stated as the
> largest gap rather than filled with an assumption, and it is the finding most
> likely to matter to the economy work in flight.

Two open pull requests, [#653](https://github.com/matmaxalez/lockstate/pull/653)
and [#668](https://github.com/matmaxalez/lockstate/pull/668), cost the economy
against a prison that may be 5.8× too small. This pass was asked to measure it.

## Claim tiers

`docs/research/README.md` labels every claim. Everything below is **VERIFIED**,
meaning one of exactly two first-party things: a number or a sentence pasted
verbatim out of one of the two runs named below, or a `file:line` in this
repository that was opened and read. **SEARCH-SUMMARY and FROM MEMORY do not
occur.** What could not be established is not marked inline and is collected in
one place instead — §7, *"What was not reached"* — because a pass that stops
five things short is better read as a list than as five asides.

Two runs, both pasted. **Both play the same game**: the branch this record is on
changes nothing under `src/` — `git diff --stat 898a16a..HEAD -- src/` is empty
— so the simulation, the HUD and every balance value in both runs are
`898a16a`'s. (Against **`898a16a`**, not against `origin/main`: `main` moved
four times while this pass was running, one of them #640 — see §5.1 — so a diff
against it would be a diff against other people's work, not a statement about
this branch.)

- **Run A**, 2026-08-30 16:46 UTC.
- **Run B**, 2026-08-30 17:16 UTC, with three instrumentation changes run A paid
  for and one act it re-attempts. **They are changes to what was *recorded*, not
  to what was played**, and each is named where its result is used: the alerts
  list is opened and read (§1.4, §7), every `simulation/event` the worker
  published is dumped (§7), and the tick of each individual admission is
  reconstructed from the counts publications (§1.4). Act 2 failed in run A for a
  reason that is itself a finding (§5.2) and succeeds in run B.

---

## 1. The ×5.8 prediction: right as arithmetic, unmeasurable as a steady state, and not the number the economy needs

ADR 0079's sentence is quoted at the top of this record. Taken apart, it makes
three separate claims, and they do not stand or fall together.

### 1.1 As a ratio of *times in system* it is right, and the intake overhead that could have spoilt it is ten ticks

**VERIFIED, code.** Little's law is `L = λ·W`. `W` here is not the sentence: it
is admission-to-departure, which is the intake pipeline plus the sentence.

- `sentenceEndTick` is written **once**, at the `'classification'` stage
  (`src/simulation/prisoners/intake-system.ts:493`,
  `this.records.sentenceEndTick[index] = context.tick + this.records.sentenceLengthTicks[index]!`).
- `INTAKE_STAGES` is
  `['queued', 'reception', 'classification', 'accommodation-assignment', 'completed', 'failed']`
  (`src/simulation/prisoners/components.ts:19`) and `IntakeSystem` advances
  **at most one stage per entity per scheduled tick**, on
  `schedule = { intervalTicks: 5, phaseTicks: 0 }` (`intake-system.ts:211`).

So a sentence starts about **ten ticks** after the press — two stage advances —
which is 0.004 in-game days against a mean sentence of 52. `W_new / W_old` is
therefore `124,800 / 21,600` to three significant figures whatever the overhead
does, and **5.8 is right**.

Note which stage that is: **classification is stage 3 and accommodation is
stage 4**. A prisoner who never gets a bed is already serving. And
`SENTENCE_BEARING_STAGES` in `PrisonerDischargeSystem` is
`['accommodation-assignment', 'completed', 'failed']`
(`src/simulation/prisoners/discharge-system.ts:46`), so they are released on time
too. That is not a detail; §1.3 is built on it.

### 1.2 There is no λ. Every arrival in this game is a press of one button

**VERIFIED, code, and confirmed by every run below.** `AdmitPrisoner` has
exactly one producer in `src/`: `src/main.ts:2522`, inside the Intake panel's
`onAdmit`. It reaches exactly one consumer,
`src/simulation/runtime/session-commands.ts:266`, which calls
`PrisonerOperationsRuntime.requestAdmission`. That method refuses for exactly
two reasons (`prisoner-operations-runtime.ts:902-906`):

```ts
if (!this.intakeSystem.hasAccommodationTarget()) return { kind: 'refused', reason: 'no-accommodation' };
if (!this.entityStore.canSpawn) return { kind: 'refused', reason: 'population-full' };
```

— no zoned accommodation at all, or the entity store exhausted at 5,000.
**Never "the beds are full."** Nothing anywhere in `src/` schedules an arrival,
and `grep -rn "admitPrisoner\|requestAdmission" src/` returns no producer but
that one.

So the "given admission rate" in ADR 0079's sentence is not a property of the
game. It is a property of the player, and the game has no opinion about it.
**"Steady-state occupancy rises ×5.8 for a given admission rate" is
arithmetically true and describes nothing the simulation does on its own.**

What it *does* describe, restated so it is about the game: **under the old
range a player had to press Admit 5.8× as often to keep a prison of a given
size full.** That is a real and probably good consequence of #659, and it is
not an occupancy figure.

### 1.3 What the economy actually reads is `occupiedPlaces`, and no sentence length moves it

**VERIFIED, code.** `StateIncomeSystem` credits per **occupied place**, not per
prisoner: `stateIncomeForOccupiedPlaces(source, source.roomInstances.residentIdsWithExistingPlace())`
(`src/simulation/economy/income.ts:418`), at
`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300` (`:103`) less
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40` per unmet need (`:335`).
`residentIdsWithExistingPlace` is places that **currently exist** — furnished
beds — so the paying population is `min(roster, furnished capacity)` and
**furnished capacity is a function of what the player built, which no sentence
length touches.**

The other side is not symmetric. Guard requirement is
`ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD)` with
`DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8`
(`src/simulation/security/sector-staffing.ts:147,190`), and the occupant count
for the derived sector *"counts the whole prison"*
(`src/simulation/security/deployment-system.ts:107-113`). **A prisoner with no
bed raises the guard bill and pays nothing.**

### 1.4 What a batch of twelve into six beds actually did

**VERIFIED, Run A, act 3.** Twelve `Admit` presses into a 6×6 cell with six
beds and one toilet, one guard hired, then ×4 for twenty-five wall minutes.
`occupiedPlaces` is in bold because it is the number the state pays for:

| tick | in-game day | `prisoners` | `roomOccupants` | **`occupiedPlaces`** | `accommodationCapacity` | treasury |
| --- | --- | --- | --- | --- | --- | --- |
| 8,409 | 4 | 12 | 6 | **6** | 6 | 23,720 |
| 18,735 | 8 | 12 | 6 | **6** | 6 | 30,360 |
| 28,575 | 12 | 12 | 6 | **6** | 6 | 34,560 |
| 38,855 | 17 | 12 | 6 | **6** | 6 | 39,560 |
| 49,192 | 21 | 11 | 6 | **6** | 6 | 43,560 |
| 59,360 | 25 | 10 | 6 | **6** | 6 | 47,560 |
| 69,694 | 30 | 7 | 6 | **6** | 6 | 53,040 |
| 79,943 | 34 | 7 | 6 | **6** | 6 | 58,000 |
| 89,620 | 38 | 6 | 6 | **6** | 6 | 62,960 |
| 99,766 | 42 | 5 | 5 | **5** | 6 | 67,700 |
| 110,121 | 46 | 4 | 4 | **4** | 6 | 71,120 |
| 118,613 | 50 | 3 | 3 | **3** | 6 | 74,320 |

**`occupiedPlaces` is `min(roster, 6)` at every single one of the 129 samples
this run took** — checked over the whole `every sample` array the run printed,
not over the twelve rows above: zero samples where
`occupiedPlaces !== min(prisoners, 6)`. While the roster stood at 12 it read 6 and would not rise,
however many people were waiting; each time somebody left while the roster was
still above 6 it stayed at 6, because the bed was refilled from the queue inside
one ten-second sample; and only once the roster fell *below* the bed count did
it start to track the roster — 5, then 4, then 3. `accommodationCapacity` stayed
6 throughout. The status strip said the same thing in words, and this is
#635's badge doing its job:

```
[act3] status strip: … | 12 | PRISONERS | 6 with no bed | 0 | STAFF | … | 1 | ROOMS | …
[act3] intake panel after 12 admissions: INTAKE
Admit a prisoner
6 waiting with no bed to sleep in
A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free.
IN INTAKE
6 of 12
6 at Cell Assignment
```

**The falls in the population, and what the player saw of each:**

- **tick 44,185–45,021**, `prisoners` 12 → 11. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**
- **tick 53,560–54,376**, `prisoners` 11 → 10. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**
- **tick 62,176–62,993**, `prisoners` 10 → 9. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**
- **tick 63,850–64,666**, `prisoners` 9 → 8. Band: `severity=info 1440x32 at (0,80) :: The prison is under control again — no incident is still open.` — **not the release sentence**
- **tick 68,019–68,836**, `prisoners` 8 → 7. Band: `severity=warning 1440x32 at (0,80) :: A fight has broken out between two prisoners.` — **not the release sentence**
- **tick 84,503–85,342**, `prisoners` 7 → 6. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**
- **tick 96,461–97,277**, `prisoners` 6 → 5. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**
- **tick 102,461–103,300**, `prisoners` 5 → 4. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**
- **tick 117,765–118,613**, `prisoners` 4 → 3. Band: `severity=info 1440x32 at (0,80) :: 1 released — their sentences are served.` — **the release sentence**

**Nine falls, 12 → 3, over 46.4 in-game days after admission** (the run ended
at tick 118,613, in-game day 50). **Seven of the nine left the release sentence
on the band**; the other two had it overwritten by an incident inside the same
ten-second window, because `.hud__event` holds one event and does not
auto-dismiss. §7 records what that means for reading these nine as
*discharges*.

**And one number here does not sit comfortably.** Under a uniform draw over
`{14 … 90}` days, the expected number of twelve prisoners whose sentence ends
within 46 days is `12 × 33/77 = 5.1`, with a standard deviation of 1.7. **Nine
were observed.** That is 2.3 standard deviations high, and twelve draws is not
a sample worth arguing from — so this is recorded as an *observation with a
question attached*, not a finding:

- The draw itself is uniform by construction — `drawSentenceLengthTicks` is
  `(MIN + rng.nextInt(77)) × DAY_LENGTH_TICKS` and
  `Xoshiro128StarStar.nextInt` rejects the unrepresentable tail before taking
  the modulus (`src/simulation/rng/xoshiro128starstar.ts:41-51`).
- **The candidate this pass can name is that a fall in `prisoners` is not
  necessarily a discharge** — see §7 — and **eight of these nine** fell after the
  reviews at tick 47,999 put the population at the tier that opens the escape
  gate.
- **What settles it** is the `simulation/event` stream, which names
  `prisoners.discharged` and `incidents.escape-attempt-opened` separately. Run
  A did not record it; run B does.

### 1.5 What the day boundary actually paid, and why it is below the ceiling

**VERIFIED, Run A, act 3.** From tick 8,409 (treasury 23,720) to tick 89,620
(62,960) is **39,240 minor units over 34 day boundaries** — an average of
**1,154 per day** with `occupiedPlaces` at 6 and one guard on the payroll.

The ceiling for that prison is `6 × 300 − 80 = 1,720`
(`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300`, `income.ts:103`; the guard's
80 is the `dailyWageBill` the run logged at hire). The 566 short is
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40` (`income.ts:335`) times
about **2.4 unmet needs per resident per day** — which is what a cell-and-toilet
prison is: ADR 0054 decision 3 states that *"a prison with no shower room and no
laundry still has no hygiene at all"*, and the roster's own worst-need column
read `Hygiene` for every visible prisoner from tick 28,575 onward.

**That is ADR 0079's own prediction, observed.** It states that under the old
range the withholding schedule fired *"for a lucky draw"* and under the new one
*"for every neglected prisoner"*, because the shortest drawable sentence
outlasts the hygiene and recreation crossings *"by more than eight in-game
days"*. A third of this prison's gross income was withheld, every day, for the
whole run.

### 1.6 Run B, and the event stream that settles what a fall in `prisoners` was

**VERIFIED, Run B, act 3.** The same twelve-into-six prison, run to tick 119,032
(in-game day 50), 45.6 in-game days after the batch was admitted. Two things it
has that run A did not.

**First, the tick each admission landed on**, reconstructed from the counts
publications rather than from a wall clock:

```
[act3] admissions, as (population@tick) from the counts publications: ["1@6147","2@6310","3@6474","4@6674","5@6884","6@7129","7@7462","8@7708","9@7911","10@8034","11@8280","12@8524"]
```

Twelve presses spread over **2,377 ticks** — very nearly one whole in-game day —
which is why run A's departures could only be given as bands.

**The trajectory, and `occupiedPlaces` doing exactly what it did in run A:**

| tick | in-game day | `prisoners` | `roomOccupants` | **`occupiedPlaces`** | `accommodationCapacity` | treasury |
| --- | --- | --- | --- | --- | --- | --- |
| 11,686 | 5 | 12 | 6 | **6** | 6 | 25,520 |
| 21,708 | 10 | 12 | 6 | **6** | 6 | 32,560 |
| 31,912 | 14 | 12 | 6 | **6** | 6 | 36,560 |
| 41,575 | 18 | 12 | 6 | **6** | 6 | 40,560 |
| 51,590 | 22 | 11 | 6 | **6** | 6 | 44,560 |
| 61,760 | 26 | 11 | 6 | **6** | 6 | 48,560 |
| 71,373 | 30 | 11 | 6 | **6** | 6 | 52,560 |
| 81,795 | 35 | 9 | 6 | **6** | 6 | 57,520 |
| 91,931 | 39 | 9 | 6 | **6** | 6 | 61,520 |
| 101,605 | 43 | 8 | 6 | **6** | 6 | 66,000 |
| 111,991 | 47 | 8 | 6 | **6** | 6 | 70,960 |
| 119,032 | 50 | 8 | 6 | **6** | 6 | 74,680 |

**121 samples, zero where `occupiedPlaces !== min(prisoners, 6)`** — the second
independent confirmation of §1.3, on a roster that never fell below the bed
count and so never left 6.

**Second, and this is what run A could not do at all: every `simulation/event`
the worker published.** Sixty-six of them. By type:

| event type | count |
| --- | --- |
| `incidents.all-clear` | 31 |
| `incidents.riot-opened` | 17 |
| `incidents.assault-opened` | 14 |
| `prisoners.discharged` | 3 |
| `incidents.escape-attempt-opened` | 1 |

and the four that are not incidents, with their ticks:

```
["48000:incidents.escape-attempt-opened","73340:prisoners.discharged(1)","81300:prisoners.discharged(1)","94440:prisoners.discharged(1)"]
```

**Four falls in `prisoners` were observed, and the stream names each one:**

| fall, sampled between | what the stream says | band at the time |
| --- | --- | --- |
| 48,031 – 48,891 | `incidents.escape-attempt-opened` at **48,000**, and **no discharge in that window** | *"A riot has broken out — 11 prisoners have stopped taking orders."* |
| 73,004 – 73,886 | `prisoners.discharged(1)` at **73,340** | *"1 released — their sentences are served."* |
| 80,908 – 81,795 | `prisoners.discharged(1)` at **81,300** | *"1 released — their sentences are served."* |
| 93,969 – 94,807 | `prisoners.discharged(1)` at **94,440** | *"A fight has broken out between two prisoners."* |

**So the weakest claim was a real one and it has an answer: one of four falls in
run B was a prisoner getting out, not a sentence ending.** §7 is rewritten
against this rather than left as a caveat.

#### The escape attempt opened one tick after the review that made it possible

**`ClassificationReviewSystem` is scheduled at `intervalTicks: 24,000,
phaseTicks: 23,999`, so a review pass runs on tick 47,999.
`incidents.escape-attempt-opened` is at tick 48,000.**

`canAttemptEscape` is `riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER &&
contrabandSeverity > 0` with the threshold at 3
(`src/simulation/incidents/flashpoint.ts:113,281-283`), and ADR 0079 states that
**no admission a player can make produces a tier 3**. This prison's twelve
arrivals were tiers 0 and 1; run A's roster shows the same population reaching
`High` across the same scheduled pass. **The review opened the gate and the
trigger walked through it on the next tick.** That is the sharpest single piece
of evidence this pass produced, and it is a *consequence of #659* that nothing
in ADR 0079's consequence list anticipates.

It is one occurrence. What would make it more than that is the same run at
several seeds, which is a headless job rather than a browser one.

#### Three sentences, resolved to whole in-game days

With the per-admission ticks in hand and `sentenceEndTick = classification tick
+ sentenceLengthTicks` (classification about ten ticks after the press,
§1.1), each discharge resolves to a narrow band:

| discharged at tick | sentence, in ticks | in in-game days |
| --- | --- | --- |
| 73,340 | 64,806 – 67,183 | 27.0 – 28.0 |
| 81,300 | 72,766 – 75,143 | 30.3 – 31.3 |
| 94,440 | 85,906 – 88,283 | 35.8 – 36.8 |

`drawSentenceLengthTicks` returns whole days, so the second and third are **31**
and **36** exactly and the first is **27 or 28**. All three are inside
`[14, 90]`, and all three are at the short end of it — which is what a 45-day
horizon can see and nothing more.

#### And a riot every three in-game days

Not what this pass was sent to measure, and too loud to leave out: **17 riots and
14 assaults in 45 in-game days**, in a twelve-prisoner prison with one guard and
no shower room. `incidents.all-clear` fires 31 times, once after each. The
eight-row alerts list is therefore **always full of incidents**: by tick 48,891
it held two riots, one escape attempt and four all-clears and had already
dropped everything older, and by tick 73,886 the escape-attempt row was gone.
**In a prison like this the durable record of who left survives about ten
in-game days.**

### 1.7 So what should #653 and #668 be costed against? — and a correction to the question

**The brief that produced this pass said the two open economy pull requests
*"costed the economy against a prison that may be 5.8× too small."* Both halves
of that need narrowing, and the narrowing is the useful part.**

**[#668](https://github.com/matmaxalez/lockstate/pull/668) does not depend on
population at all.** Read at its own PR body: it measures a **waste
multiplier** on *build* spend — *"a profile 0 control builds the same 2×3 cell
flawlessly for **905**"* against 1,985–2,570 for profiles that make mistakes —
and its conclusions are about walls, `Undo` and the treasury figure. Sentence
length does not enter its arithmetic anywhere. **The ×5.8 does not touch it.**

**[#653](https://github.com/matmaxalez/lockstate/pull/653) already costs per
*place*, not per prisoner**, which is the same quantity §1.3 identifies. Its own
table is *"Measured mean grant per **place-day**"*, and its structure is
therefore right. What is stale in it is one row: that table compares
*"2–16 days"* against *"**14–28** days"* — a range that was under consideration
and is **not what landed**. `MIN_SENTENCE_DAYS`/`MAX_SENTENCE_DAYS` are 14 and
90 (`src/simulation/prisoners/sentence.ts`), so the *"−14%"* on its cells-only
row is measured against a mean of 21 days where the shipped mean is 52.
**That is a re-measurement, not a re-costing**, and it is a much smaller job
than "the prison is 5.8× too small" implies. #653's other headline —
*"the economy is not short of money"* — is untouched by anything here.

**And what the ×5.8 would have done to a costing that *did* read the roster:**

**Not a prison 5.8× larger.** The three statements that follow from §1.1–§1.6,
separated because they need separate evidence:

1. **The ratio of times in system is 5.78.** Arithmetic on two constants, and
   ADR 0079 is right about it.
2. **`occupiedPlaces` is what the state pays for, and it is capped by furnished
   capacity** — measured pinned at 6 while the roster was 12 and while the
   roster fell to a smaller number. Longer sentences raise *average* occupancy
   toward that cap; they cannot raise it past the cap, so the largest effect a
   sentence change can have on income is bounded by
   `capacity / previous average occupancy`, and is 5.8 only for a prison that
   was 5.8× under-occupied.
3. **The guard bill is not capped that way.** It scales on the whole roster
   (§1.3), so the population that grows with sentence length is the population
   that costs and does not pay.

**What would change my mind on 2:** a session in which `occupiedPlaces` exceeds
the number of furnished beds, or an income credit that is not
`occupiedPlaces × 300` less withholding. Neither appeared in either run.

## 2. Nothing on screen says how long a prisoner is staying, and nothing ever did

**VERIFIED, code.** Exactly one read model carries a sentence:
`PrisonerDetailViewModel.sentence` — `lengthTicks`, `endTick`,
`priorIncidentsAtIntake` — at
`src/simulation/presentation/prisoner-projection.ts:214-219`. It travels on the
`hud/prisoner-detail` channel, and that channel is pinned as having **no
reader** by a contract test, in its own words
(`tests/foundation/projection-reachability-contract.test.ts:317-318`):

> No reader in `src/ui/` or `src/rendering/`. Blocked on a selection model that
> does not exist yet […] "there is no selection state, no highlight and no
> inspector."

The roster row that *is* rendered carries no sentence field at all:
`PrisonerRosterRowViewModel` (`prisoner-projection.ts:169-188`) has
`intakeStage`, `classified`, `classificationGroupId`, `riskTier`, `tile`,
`actionPhase`, `currentActionId`, `accommodation`, `gangId`, `lowestNeed` — and
nothing else.

**VERIFIED, Run A.** So the confirmation the brief asked for is a negative, and
here is what the negative looks like from the chair. Twelve prisoners, admitted
by tick 7,142, in-game day 3. The Regime panel's roster block, whole:

```
[act3] roster at admission:
PRISONERS
4 of 12
Ines Xavier
Sleeping
Safety
Low
Malik Pereira
Sleeping
Safety
Minimal
Rosa Kowal
Sleeping
Safety
Low
Omar Rossi
Sleeping
Safety
Minimal
and 8 more
```

A name, what they are doing, their worst need, and a risk tier. Four rows of
twelve, because `PRISONER_ROSTER_ROW_LIMIT` is 4
(`src/ui/hud/regime-panel.ts:156`). **No sentence, no release date, no elapsed
time, no "day 41 of 68".**

The vocabulary sweep over the whole visible HUD at that moment — every word a
player would need to see for a sentence to be on screen at all — is in §6.

**What that costs is a change of kind, not of degree.** Under the old range the
whole thing a player could not see lasted 4 to 32 real minutes. It now lasts
**28 real minutes to 3 real hours** at ×1, which is longer than a session. A
player looking at a full prison has no way to find out whether a bed frees in
ten minutes or in two hours, and the game offers no control that would tell
them: `hud/prisoner-detail` is the answer and nothing asks it.

**The one shipped sentence that mentions a sentence at all arrives when it is
over.** `hud.alert.event.prisoners.discharged` is
*"{count} released — their sentences are served."*
(`src/content/default-locale-en.ts:437`), recorded by
`PrisonerDischargeSystem` at `src/simulation/prisoners/discharge-system.ts:231`
and rendered on the `.hud__event` band. That is the first and only moment the
word appears.

**This is reported, not fixed.** Every route out needs player-facing copy, and
`AGENTS.md` reserves that to the owner: *"Anything that reaches a player as a
promise the code does not keep"* is the fourth exclusion, and a locale key with
no implementation behind it is the defect it names. Where it belongs is not in
doubt — the roster row is the surface, `PrisonerRosterRowViewModel` is the shape
that would have to carry it, and `hud/prisoner-roster` is the channel — but the
words are the owner's.

## 3. 97% of prisoners now get reviewed, and a review reaches the player as nothing at all

**VERIFIED, code.** `SIMULATION_EVENT_TYPES` has **eight** members
(`src/simulation/protocol/types.ts:1385-1394`), and they are the whole of what
can reach the alerts list or the event band, each with a label key and a
severity in `EVENT_PRESENTATION` (`src/ui/simulation-events.ts:127-144`):
`economy.wages-unpaid`,
`incidents.all-clear`, `incidents.assault-opened`,
`incidents.escape-attempt-opened`, `incidents.gang-retaliation-opened`,
`incidents.riot-opened`, `prisoners.discharged`, `prisoners.relocated`. **None
of them is a classification review**, and `ClassificationReviewSystem`
(`src/simulation/prisoners/classification-review-system.ts`) calls nothing on
`SimulationEventLog`: `grep -n "events\.\|SimulationEventLog"` over that file
returns no lines at all.

So the only surface a review can move is the **risk-tier badge on a roster
row**: `standingLabelKey` is `deriveSimulationMessageKey('risk-tier', riskTier)`
once `classified` is true (`src/ui/simulation-prisoner-roster.ts:133-136`), and
the tier words are `Minimal | Low | Medium | High`
(`src/content/simulation-message-keys.ts:225`). A promotion changes one word on
one row — for at most four prisoners, with no history and no notification.

**And only while the player is looking at that tab.**
`refreshPrisonerRoster` begins
`if (prisonerRosterReader === undefined || activeTab !== 'regime') return;`
(`src/main.ts:1547`), and leaving the tab calls `applyPrisonerRoster(undefined)`
(`:1896-1897`). So the roster is not merely the *only* surface a review can move —
it is a surface that does not exist unless the Regime tab is the active one. A
player on Overview, Build, Rooms or Security cannot see a review at any moment,
in principle.

ADR 0079 measures what #659 turned on: a first review goes from **14.00% to
97.27%** of prisoners and a second from **0% to 85.06%**, with mean reviews per
prisoner from 0.14 to 4.20. That is a mechanic that was effectively dead and is
now the ordinary case. **Its entire player-visible footprint is a word that
changes when nobody is looking at it**, and only if that prisoner happens to be
one of the four rows the roster draws.

### What that looked like in play

**VERIFIED, Run A, act 3.** Twelve prisoners were admitted by tick 7,142 — the
tick after the twelfth press — and classified about ten ticks after each of
them. (Run B's per-admission reconstruction shows how wide that "by" is: its
twelve presses landed at ticks 6,147 to 8,524, a spread of 2,377 ticks, very
nearly one whole in-game day.) `ClassificationReviewSystem` is scheduled at
`intervalTicks: 24,000, phaseTicks: 23,999`, so the first scheduled tick that
falls inside their eligibility window is **47,999**. The roster block either
side of it, pasted, with nothing else changed:

```
[act3] --- t+378s tick 28575 (day 12) {"prisoners":12,"roomOccupants":6,"occupiedPlaces":6,…}
    roster:
    Ines Xavier   Sleeping  Hygiene  Low
    Malik Pereira Sleeping  Hygiene  Minimal
    Rosa Kowal    Sleeping  Hygiene  Low
    Omar Rossi    Sleeping  Hygiene  Minimal
```

```
[act3] --- t+636s tick 49192 (day 21) {"prisoners":11,"roomOccupants":6,"occupiedPlaces":6,…}
    event band: "severity=info 1440x32 at (0,80) :: The prison is under control again — no incident is still open."
    roster:
    Ines Xavier   Using Toilet  Hygiene  High
    Malik Pereira Sleeping      Hygiene  High
    Rosa Kowal    Using Toilet  Hygiene  High
    Omar Rossi    Using Toilet  Hygiene  High
```

**Every visible prisoner went from `Minimal`/`Low` to `High` — tier 0 or 1 to
tier 3 — in one invisible step.** Tier 3 is the only tier
`classificationGroupIdForTier` answers `'high-risk'` for, and ADR 0079 states
that **no admission a player can make can produce one**: *"1 + 0 + a maximum
screening draw clamps at 2, so no admission a player can make produces a
high-risk prisoner."* A review can, and in a neglected prison it did, to the
whole visible population at once. That is consistent with
`docs/research/2026-08-30-what-a-classification-can-reach.md`, which measured
*"every reviewed prisoner in a neglected prison reached high risk while none did
in a well-run one"* — this is the first time it has been seen happen through the
assembled page.

**The player is told nothing.** The event band at that moment is showing an
older incident all-clear; four words changed on a panel that is not the one the
player has open, and no other pixel moved.

**And it moves back.** A later pass in the same run:

```
[act3] --- t+1268s tick 99766 (day 42) {"prisoners":5,"roomOccupants":5,"occupiedPlaces":5,…}
    roster:
    Malik Pereira Sleeping     Hygiene  High
    Rosa Kowal    Association  Hygiene  Medium
    Omar Rossi    Association  Hygiene  Medium
    Nadia Pereira Association  Hygiene  Medium
```

Three of the four have come **back down** from `High` to `Medium` — the same
system, the same silence, in the other direction. `tierIncreases` and
`tierDecreases` are both live now, which is exactly what ADR 0079 predicted; a
player watching the roster would see a word change twice in forty in-game days
and be given no reason either time.

**A second, smaller observation about that band, and it is a property rather
than a defect.** `.hud__event` does not auto-dismiss — deliberately
(`src/ui/hud/hud.ts:998-1001`, *"a message that clears itself on a timer is a
race against how fast the player reads. It is replaced by the next event or
emptied when the session ends"*) — so what it holds is the **last**
event, not a current state. At tick 49,192 it was still displaying an all-clear
from an incident that had closed some time before.

### What tier 3 unlocks, which is not only a badge

**VERIFIED, code.** Tier 3 is the gate on an escape attempt:

```ts
export const ESCAPE_ATTEMPT_MINIMUM_RISK_TIER = 3;                       // flashpoint.ts:113
export function canAttemptEscape(flashpoint: PrisonerFlashpoint): boolean {
  return flashpoint.riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER && flashpoint.contrabandSeverity > 0;
}                                                                        // flashpoint.ts:281-283
```

and `IncidentTriggerSystem` filters its escape candidates through exactly that
(`trigger-system.ts:343`). An escape is not cosmetic: a lapsed escape-attempt
incident writes `escaped: true` (`response-system.ts:551`) and
`onPrisonerEscaped` calls **the same `releasePrisoner`** a served sentence does
(`src/simulation/runtime/new-session.ts:1118`, *"A prisoner who got out is gone
(ADR 0061 decision 5)"*).

So the chain #659 turned on is: longer sentences → 97% of prisoners reviewed →
in a neglected prison the reviews reach tier 3 → **the risk-tier gate on escape
is open for the whole population**, where ADR 0079 states no admission a player
can make can open it. The second gate, `contrabandSeverity > 0`, still stands
and this pass did not measure whether anybody was carrying anything — see §7.

### The consequence nobody is told about: a prisoner who gets out

**VERIFIED, code.** `IncidentOutcome.escaped` is documented as *"True only when
an escape-attempt actually got out"* (`src/simulation/incidents/incident.ts:59`),
and `lapse` sets it for every lapsed escape-attempt
(`response-system.ts:551`). The block immediately after removes them:

```ts
if (outcome.escaped) {
  for (const entityId of incident.participantIds) this.onPrisonerEscaped(entityId, tick);
}
this.adjudicateAssaultIfAny(incident, tick);
this.reportAllClearIfCalm(tick);
```
(`response-system.ts:566-571`)

`onPrisonerEscaped` is wired to `prisoners.releasePrisoner`
(`src/simulation/runtime/new-session.ts:1117-1119`) — the same door a served
sentence leaves by.

**And the next line is `reportAllClearIfCalm`**, which records
`incidents.all-clear` whenever no incident is still open
(`response-system.ts:211-214`) — rendered as *"The prison is under control
again — no incident is still open."* (`default-locale-en.ts:488`).

**`SIMULATION_EVENT_TYPES` has a member for the attempt opening and none for it
succeeding.** So the player's whole account of a prisoner escaping is:

1. *"A prisoner is trying to break out."* (`danger`)
2. *"The prison is under control again — no incident is still open."* (`info`)
3. the PRISONERS chip is one lower.

The second sentence is true — no incident is open, because it ended — and it is
the **same sentence a contained attempt produces**. Nothing distinguishes
"we stopped them" from "they got out", and the count is the only tell.

**VERIFIED, Run B, act 3.** The escape route is not theoretical on this tree. By
tick 48,891 the eight-row alerts list of a neglected twelve-prisoner prison read,
whole:

```
[act3]     alerts list: "The prison is under control again — no incident is still open.\nInfo\nA riot has broken out — 12 prisoners have stopped taking orders.\nCritical\nThe prison is under control again — no incident is still open.\nInfo\nA riot has broken out — 12 prisoners have stopped taking orders.\nCritical\nThe prison is under control again — no incident is still open.\nInfo\nA prisoner is trying to break out.\nCritical\nThe prison is under control again — no incident is still open.\nInfo\nA riot has broken out — 11 prisoners have stopped taking orders.\nCritical\nNothing was removed — there is no object on that tile, and none being built there.\nWarning"
```

Two riots, an escape attempt, four all-clears — and **no `released` row at
all** — beside a population that had just fallen from 12 to 11. That is eight
rows, which is `MAX_EVENT_ALERT_ROWS` exactly
(`src/ui/simulation-events.ts:252`), so the list was already full and dropping
its oldest.

`incidents.escape-attempt-opened` is the only escape event there is, so what the
list *cannot* say is whether that attempt was contained or whether it is the
reason the count fell.

**The worker's own event stream can, and it does.** §1.6: that attempt is at
tick **48,000**, the fall is sampled between **48,031 and 48,891**, and there is
**no `prisoners.discharged` anywhere in that window** — the three this run
produced are at 73,340, 81,300 and 94,440. **The prisoner got out.** The player
was told *"A prisoner is trying to break out."*, then *"The prison is under
control again — no incident is still open."*, and the PRISONERS chip went from
12 to 11.

**Reported, not fixed**, for §2's reason: the missing thing is a sentence
addressed to a player, and that is the owner's.

## 4. The relocation notice, in a game rather than in a harness

**VERIFIED, code, first — because the shape of the test is forced by it.**
`ObjectPlacementService.remove` asks
`relocateResidentsLeftWithoutAPlace(roomInstanceId)`
(`src/simulation/objects/object-placement-service.ts:695-705`), which calls
`PrisonerOperationsRuntime.relocateExcessResidentsOf([instanceId])`. That method
takes the residents of **that instance** who no longer have a place and hands
each to `findBestAvailable` for a room with a free one
(`src/simulation/prisoners/prisoner-operations-runtime.ts:703-731`); each
successful move is one `SimulationEventLog.recordResidentRelocated`
(`src/simulation/events/resident-relocation-notice.ts:117`), which the HUD
renders as `hud.alert.event.prisoners.relocated` —
*"{name} had nowhere to sleep and moved to {room}."*
(`src/content/default-locale-en.ts:461`), severity `'info'`
(`src/ui/simulation-events.ts:143`).

**So a one-room prison can never produce the notice**: with a single cell
instance, the only room with a spare bed is the room the bed was just taken
from. Two cell instances are the minimum, which is why act 2 builds a 2×7
enclosure divided into a 2×3 and a 2×4 cell — 20 wall segments against the 24
a single 6×6 costs — and furnishes the north cell **first**, so the prisoner's
home is not a coin flip.

`tests/browser/ui-relocation-notice.spec.ts` already covers the notice, and it
covers something else: it drives `createNewSimulationRuntime` directly and
feeds `hudEventNoticeFromWorkerMessage` into the HUD harness. That is a real
prison and a real band; it is not the assembled page, not `src/main.ts`, and not
a mouse. **This is the first time the sentence has been produced by playing.**

### It appears, and here it is

**VERIFIED, Run B, act 2.** A 2×7 enclosure divided into two cells; the north
cell furnished first and one prisoner admitted into it; the south cell furnished
afterwards; then the mouse presses the north cell's bed with the Remove tool:

```
[act2] sample before the removal: {"tick":7331,"day":4,"prisoners":1,"roomOccupants":1,"occupiedPlaces":1,"accommodationCapacity":2,…}
[act2] event band before the removal: "hidden, 0x0 at (0,0)"
[act2] RemoveObject commands from the press on the occupied bed: [{"type":"RemoveObject","x":12,"y":12}]
[act2] +0ms after the removal -- event band: "severity=info 1440x32 at (0,80) :: Jonas Costa had nowhere to sleep and moved to Cell."
[act2] +3000ms after the removal -- event band: "severity=info 1440x32 at (0,80) :: Jonas Costa had nowhere to sleep and moved to Cell."
[act2] +10000ms after the removal -- event band: "severity=info 1440x32 at (0,80) :: Jonas Costa had nowhere to sleep and moved to Cell."
[act2]   /had nowhere to sleep/i in the visible HUD? true
```

**It works.** One press, one sentence, a named prisoner, on a full-width
1440×32 `role="status"` band at y=80 — present immediately and still there ten
seconds later, because the band does not auto-dismiss.

The simulation behind it is right too. `accommodationCapacity` falls from 2 to
1 (the bed is gone) while `occupiedPlaces` **stays 1** — the resident is
living somewhere a bed exists, which is ADR 0076 decision A(ii)'s whole point,
and the state keeps paying for them:

```
[act2] sample after the removal: {"tick":9135,"day":4,"prisoners":1,"roomOccupants":1,"occupiedPlaces":1,"accommodationCapacity":1,…}
```

### Two observations about the sentence, neither of them a defect

**It says "Cell", not *which* cell.** `{room}` is the destination's room
**catalogue** `nameKey`, resolved in two hops —
`roomInstances.getById(toInstanceId)?.roomCatalogId` then
`rooms.getById(roomCatalogId)?.nameKey`
(`src/simulation/events/resident-relocation-notice.ts:105-106`) — and both
rooms in this prison are `room.cell`. So the sentence a player reads in a prison with two
cells is *"Jonas Costa had nowhere to sleep and moved to Cell."* There is
nothing else it could say today — a room **instance** has an anchor tile and no
name, and this repository does not author player-facing copy — so this is
recorded rather than proposed.

**The durable copy is behind a fold, and the visible copy is transient.** The
alerts list read `"ALERTS LIST not laid out"` at every observation until the
script opened it by hand, and then held it:

```
[act2] alerts list once unfolded by hand: "Jonas Costa had nowhere to sleep and moved to Cell.\nInfo\nNothing was removed — there is no object on that tile, and none being built there.\nWarning"
```

That is the design working as `src/ui/hud/hud.ts:962-983` describes it, and it
has a cost this pass measured elsewhere: §1.4's nine departures include two
whose release sentence had already been pushed off the band by another event
within ten seconds. **A notice that matters after the moment it happens is only
recoverable from a section that starts shut.**

## 5. What stopped a player, in the order they meet it

### 5.1 The first wall a new player orders still parks, and the word "material" is nowhere on screen

**VERIFIED, Run A, act 1.** The just-in-time materials fix
([#640](https://github.com/matmaxalez/lockstate/issues/640)) is **not on
`main`**, and the confirmation the brief asked for is this. New prison, Build
tab, arm Brick wall, drag one six-tile run, buy nothing, run at ×4 and watch:

```
[act1] queue right after one wall run: "QUEUED\n6 waiting · 0 being built"
[act1] after 23.604s of x4, tick 465: queue "QUEUED\n6 waiting · 0 being built"
[act1] after 44.41s of x4, tick 2138: queue "QUEUED\n6 waiting · 0 being built"
[act1] after 80.5s of x4, tick 5020: queue "QUEUED\n6 waiting · 0 being built"
```

Tick 5,020 is in-game day 3. Nothing has moved and nothing will. What the whole
visible HUD says about why, with nothing unfolded by hand:

```
[act1]   /awaiting materials/i in the visible HUD? false
[act1]   /material/i in the visible HUD? false
[act1]   /brick/i in the visible HUD? true
[act1]   /buy/i in the visible HUD? true
[act1]   /stock/i in the visible HUD? false
[act1]   /purchase/i in the visible HUD? false
```

`/brick/i` and `/buy/i` are true because the Build catalogue lists "Brick wall"
and the panel has a "Buy" control — neither is a sentence about *these* orders.
The reason is one press away and it is a press nobody is told to make:

```
[act1] queue data-collapsed before unfolding: true
[act1] queue data-collapsed after the header press: false
[act1] queue after unfolding: "QUEUED\n6 waiting · 0 being built\nBrick wall · 14, 12 · North\nAwaiting Materials\nCancel\n…"
[act1]   /awaiting materials/i once the queue is unfolded? true
```

**Run B, same act, independently:**

```
[act1] after 48.222s of x4, tick 585: queue "QUEUED\n6 waiting · 0 being built"
[act1] after 70.353s of x4, tick 2350: queue "QUEUED\n6 waiting · 0 being built"
[act1] after 107.026s of x4, tick 5287: queue "QUEUED\n6 waiting · 0 being built"
[act1]   /awaiting materials/i in the visible HUD? false
[act1]   /material/i in the visible HUD? false
[act1]   /awaiting materials/i once the queue is unfolded? true
```

This reproduces `docs/research/2026-08-30-the-naive-route.md` rather than
extending it, and it is here because the brief asked for it to be confirmed on
today's `main` rather than assumed. **It is the earliest thing a player meets
and it was live at `898a16a` in both runs.**

### And it stopped being true while this pass was running — this section is history, not a live defect

**VERIFIED, `git log`.** [#640](https://github.com/matmaxalez/lockstate/issues/640)
landed on `main` as **`a87b0d3`, *"Buy a build order's materials when it is
placed"*, at 2026-08-30 19:03:04 +0200 — 17:03 UTC** — which is **inside act 3
of run A** (16:49–17:15 UTC) and **before act 1 of run B** (17:16 UTC). Both
runs still measured the old behaviour, because both play `898a16a`, which is
the commit this record names at the top and the tree the worktree is checked
out at.

So the honest form of this section is blunt: **§5.1 describes a game that no
longer exists.** It is a measurement of `898a16a`, kept because that is the
commit the rest of this record plays and because the owner's original complaint
was about exactly this; it is **not** a statement about `main`.

**And the successor measurement already exists, so this section does not need a
re-run and should not get one.** `16d8b2a` — *"The naive build route works now
— played six times, and one claim of mine refuted (#655)"* — carries
`docs/research/2026-08-30-a-wall-that-buys-itself.md`, which played the route
**without ever calling `buy()`** on the post-#640 tree, six times, and answers
it:

> **The wall does get built, with no procurement press — the answer to #627**
> […] `[A1 +75.3s] TREASURY AT THE PRESS: 25000 -> 24520 (delta -480) for 6 wall segment(s)`

and

> **What stops a player next: nothing did, and that is the finding** […] on
> this branch, **the naive route completes.**

Read the two together and the shape is: the money now leaves the treasury on the
press that draws the wall, so *"6 waiting · 0 being built"* forever is a state
`main` cannot produce any more. **Anyone quoting §5.1 as a live defect is
quoting the wrong record; quote that one.**

`docs/research/README.md`'s standing rule is what makes keeping this section
right rather than deleting it: *"when the code moves on, a record here does not
become wrong, it becomes older."*

### 5.2 The control that looks like "start drawing" is the one that stops it, for a second room

**VERIFIED, Run A, act 2, from the failure rather than from the pass.** After
one room has been designated the Rooms tool **stays armed** — deliberately, so a
second rectangle can be dragged without touching the panel — and the panel
**folds itself** on the way (`drawingFolded`, `src/ui/hud/rooms-panel.ts:439-465`,
*"a panel that covers the thing it operates on is not a panel the player can
draw on"*). So a player coming back to the Rooms tab for a second room sees:

```
[act2] designate south: panel data-collapsed=true catalogue data-collapsed=false
```

A folded panel. Opening it and pressing the control that starts drawing —
`armButton`, which toggles: `armed = !armed`, `rooms-panel.ts:958` — **turns
drawing off**. The drag then draws nothing, no pending rectangle exists, and
Designate is never rendered. Playwright's page snapshot at the moment the run
died shows exactly that state: the panel expanded, `radio "Cell Selected"
[checked]`, no Designate control anywhere, and the arm button reading
**"Draw on map"** — which is `hud.rooms.arm`, the *disarmed* label
(`src/content/default-locale-en.ts:803-804`; the armed one is "Stop drawing").

**The label does tell the truth, and that is the whole of the mitigation**: a
player who opens the panel and reads the button before pressing it is told the
tool is already armed. The panel is folded on arrival, so that reading costs a
press first — and the fold is there for a good measured reason, which is why
this is a report and not a proposed change.

**Run B confirms both halves in one pair of lines.** The script now reads the
label instead of pressing blind, and prints it:

```
[act2] designate north: the arm control reads "Draw on map" before anything is pressed
[act2] designate north attempt 1: rooms=1 …
[act2] designate south: panel data-collapsed=true catalogue data-collapsed=false
[act2] designate south: the arm control reads "Stop drawing" before anything is pressed
[act2] designate south attempt 1: rooms=2 …
```

**"Draw on map" for the first room and "Stop drawing" for the second**, and once
the press is skipped the second cell is accepted on the **first** attempt. So
the state is real, the label is honest, and the whole cost is that a player has
to open a folded panel to read it before touching the control that looks like
the way in.

**It cost this pass a run**, which is the honest way to say how discoverable it
is. The script did the obvious thing — open the panel, pick Cell, press the
control that starts drawing — and then waited on a `Designate` that was never
going to be rendered. In run A that wait ended as a `TimeoutError:
locator.click: Timeout 30000ms exceeded` and the act failed; in the run before
it, with no action timeout set, the same wait would have run to the 900-second
test timeout, and the run was abandoned by hand instead.

## 6. The vocabulary sweep

**VERIFIED, both runs.** Every observation point dumps
`document.querySelector('.hud').innerText` whole rather than the panels this
pass expected to matter — `docs/research/2026-08-30-the-naive-route.md` §6
records why: *"A survey that enumerates known regions cannot find a message in a
region it did not know about. Print the container, not the parts."* `innerText`
reflects layout, so a word inside a folded section does not appear in it, which
makes *"could a player read this without unfolding anything?"* a substring test.

Eleven words, swept over the whole visible HUD the moment twelve prisoners had
been admitted:

```
[act3] VOCABULARY at just after admission: present=[] absent=["sentence","sentenced","days left","release","released","discharge","review","reviewed","reclassif","tier","due out"]
```

**All eleven absent.** Not "the sentence is not shown" — the *vocabulary* of
sentences, releases and reviews does not occur anywhere a player can read
without opening something. The sweep at the end of the same run, after nine
people had left, is different in exactly the way that proves the point:

```
[act3] VOCABULARY at end of run: present=["sentence","release","released"] absent=["sentenced","days left","discharge","review","reviewed","reclassif","tier","due out"]
```

Three words have appeared, and all three are the same string:
`"1 released — their sentences are served."`, standing on the event band. **The
only way the word "sentence" ever reaches a player in this game is after
somebody's is over.** `review`, `tier` and `days left` are still absent at the
end of a fifty-day session in which the whole population was reclassified
twice.

**And run B's end-of-run sweep, on the same script and the same commit, is back
to all eleven absent:**

```
[act3] VOCABULARY at end of run: present=[] absent=["sentence","sentenced","days left","release","released","discharge","review","reviewed","reclassif","tier","due out"]
```

Run B had **three** releases — the event stream names their ticks — and by the
end of it none of the three words was on screen, because the band holds one
event and the last one was an incident. **So the three words run A had at the
end were not a property of a prison that has released somebody. They were a
property of what happened to be on the band in the last few seconds**, and the
difference between the two runs is the clearest statement this record can make
about how much of the game's account of itself is transient.

The eleven words are `sentence`, `sentenced`, `days left`, `release`,
`released`, `discharge`, `review`, `reviewed`, `reclassif`, `tier`, `due out`.
The list is in the script (`VOCABULARY`) so that a reader can see what was
*looked for* as well as what was found — a sweep that reports only its hits
cannot be checked.

## 7. The weakest claim, and what this pass did not reach

### The weakest claim, and it is a method one

**That the falls in the population in §1.4 are *discharges*.** A fall in
`prisoners` is "somebody left", and `releasePrisoner` — the one door out — has
**two** callers in `src/`:

- `PrisonerDischargeSystem`, for a sentence that ended
  (`src/simulation/prisoners/discharge-system.ts:184`);
- the incident runtime's escape hook, for a prisoner who got out
  (`src/simulation/runtime/new-session.ts:1118`), which is reached from
  `IncidentResponseSystem` when an escape-attempt incident lapses
  (`response-system.ts:551,566-568`).

Both destroy the entity and free the bed, and the counts publication reads
identically. So the number this pass can defend is *departures*, not *releases*.

**Why it matters more on this tree than it would have last week** is §3: the
escape gate is `riskTier >= 3`, and act 3's own reviews put the whole visible
population at tier 3 at tick 47,999 — after which **eight of run A's nine
falls** occurred.

**What would change my mind, and what run B did about it:** the worker publishes
`prisoners.discharged` and `incidents.escape-attempt-opened` as separate members
of `SIMULATION_EVENT_TYPES`, and the `Worker` tee keeps every one. Run B dumped
that stream whole.

**It was a real doubt, and the answer is one in four.** §1.6 has the table; the
short form is that run B's four falls resolve to **three
`prisoners.discharged`** (ticks 73,340 / 81,300 / 94,440) and **one
`incidents.escape-attempt-opened` at tick 48,000 with no discharge anywhere in
that window**. So a fall in `prisoners` is genuinely ambiguous, it was ambiguous
in play and not only in principle, and this record's own §1.4 figure for run A —
**nine falls** — is an **upper bound on run A's discharges** and not a count of
them.

**What that does to the number §1.4 flagged as uncomfortable.** Under a uniform
draw, 5.1 of twelve would end within 46 days; run A saw nine falls. Run B shows
a mechanism that inflates falls above discharges, so the gap is at least partly
explained rather than merely suspicious — and it is **not** explained in run A,
because run A did not record the stream. The honest statement is that **run A's
discharge count is unknown and lies somewhere in `[0, 9]`**, and that run B's,
which is known, is **three in 45.6 in-game days against an expectation of 4.7.**

**This is what the second run bought.** The instrumentation that answered it was
written *because* the first run could not, which is the only reason a second run
of the same script is worth anything.

### What was not reached, stated rather than glossed

1. **A steady state.** Arithmetic, not an omission: at ×4 — 80 ticks per wall
   second, `SIMULATION_SPEEDS` is `{1, 2, 4}` — four mean sentences is 104 wall
   minutes *before* a prison is built. **Nothing in this record is a
   steady-state occupancy measurement and nothing in it should be quoted as
   one.** What would settle it is ADR 0050's population harness re-run at the
   new range, headlessly, which needs no browser at all — and that is the same
   thing ADR 0079 said nobody had done.
2. **The long tail.** No sentence longer than the run's horizon was observed at
   all, so nothing here says anything about the 90-day end of the range.
3. **A count of reviews per prisoner.** ADR 0079 predicts 85% of prisoners
   reach a *second* review, and run A plainly contains more than one pass —
   `ClassificationReviewSystem`'s scheduled ticks are 23,999, 47,999, 71,999 and
   95,999, and the roster's words moved at least twice (up by 49,192, back down
   by 99,766). **What this pass did not do is count them**, per prisoner or at
   all: no review is observable except as a word on at most four rows of a panel
   that only refreshes on one tab, so the 85% is neither confirmed nor
   challenged here.
4. **How much contraband was in the prison.** This one is *partly* answered and
   the answer is a correction to how it was first written here. `canAttemptEscape`
   is `riskTier >= 3 && contrabandSeverity > 0`, and run B produced *"A prisoner
   is trying to break out."* — so **at least one prisoner was carrying
   something**, which the `CONTRABAND` chip could never have told anybody: it
   counts what has been *found*, and it read `0` in every sample of both runs.
   What is still unmeasured is how many were carrying and how much.
5. **The whole `[14, 90]` distribution.** Twelve draws per run is not a sample
   of 77 values, and the departures observed sit at the short end of the range.
   Whether that is the draw or the horizon is not separable from these runs, and
   nothing in this record should be read as a claim about the distribution's
   shape. `drawSentenceLengthTicks` uses `Xoshiro128StarStar.nextInt`, which
   rejects the unrepresentable tail before taking a modulus
   (`src/simulation/rng/xoshiro128starstar.ts:41-51`), so it is uniform by
   construction; what is unmeasured is whether this game draws it once per
   prisoner as intended, and `tests/unit/prisoners-sentence.test.ts` is where
   that lives rather than here.

## 8. The one thing this proposes, and the five it hands over

`docs/AGENT_WORKFLOW.md` §5 asks for proposals the owner can say yes or no to,
kept separate from the reporting. There is exactly one here, because every
other route out of what this pass found needs a sentence addressed to a player,
and `AGENTS.md`'s fourth exclusion reserves those — *"Anything that reaches a
player as a promise the code does not keep. A locale key with no implementation
behind it is the defect that forced the telemetry decision; do not add one, in
any tree."*

### The proposal: narrow ADR 0079's occupancy consequence, marking rather than overwriting

**Decision in one sentence.** ADR 0079's *"Steady-state occupancy rises for a
given admission rate […] a factor of **5.8**"* should gain a sentence recording
that the factor is a ratio of **times in system**, that this game has **no
arrival rate** for it to multiply, and that the population the economy reads —
`occupiedPlaces` — is `min(roster, furnished capacity)` and is therefore not
multiplied by it at all.

**What the code does today**, with `file:line`: §1.1, §1.2 and §1.3 above; the
load-bearing three are `src/main.ts:2522` (the only `AdmitPrisoner`),
`src/simulation/prisoners/prisoner-operations-runtime.ts:902-906` (the two
refusals, neither of them "the beds are full") and
`src/simulation/economy/income.ts:418` (income over
`residentIdsWithExistingPlace()`).

**Options and their real costs.**

1. **Leave it.** Costs nothing now and costs the next economy pass the same
   half-day: the sentence reads as an instruction to cost against a prison
   5.8× larger, and two pull requests are in flight against it.
2. **Add a marked amendment** — a paragraph under the existing bullet, in the
   form this repository already uses for a correction that must not erase what
   it corrects. Cheap, and it is one file.
3. **Rewrite the bullet.** Refused for the reason `docs/AGENT_WORKFLOW.md` §4
   gives: *"A correction is no more durable than the claim it corrected […]
   Mark both directions rather than overwriting."* The original arithmetic is
   right and the reason it was written is still good.

**Recommendation: option 2**, and **not by this pass** — ADR 0079 landed today
as `9a25700` and the amendment belongs with whoever owns that surface, with this
record cited. That is the handover, not a request for permission.

**What would change my mind.** A session in which `occupiedPlaces` exceeds the
number of furnished beds, or one in which the state credits anything other than
`occupiedPlaces × 300` less withholding. Neither occurred in 129 samples.

### Five handovers, none of them mine to close — and one of them already closed by somebody else

1. **A sentence, anywhere, that says how long a prisoner is staying** (§2).
   The surface is the roster row, the shape is
   `PrisonerRosterRowViewModel`, the channel is `hud/prisoner-roster` — and the
   words are the owner's.
2. **Anything at all that tells a player a review happened** (§3). The
   simulation has no event type for it and the HUD has no row for it.
3. ~~**#640** (§5.1)~~ — **nothing to hand over.** It was closed by `a87b0d3`
   while this pass was running, and the check this row originally asked for has
   already been done by somebody else: `16d8b2a` played the route six times on
   the post-#640 tree and found that *"the naive route completes"*. Left in the
   list, struck through, because a handover that quietly disappears reads as one
   that was forgotten.
4. **The Rooms arm control for a second room** (§5.2). Not a copy question —
   the label is already honest — so this one is a design question about the
   fold, and it belongs with whoever owns `src/ui/hud/rooms-panel.ts`.
5. **A sentence for a prisoner who got out** (§3, *"The consequence nobody is
   told about"*). `SIMULATION_EVENT_TYPES` has `incidents.escape-attempt-opened`
   and nothing for the attempt succeeding, so a successful escape is followed by
   the same all-clear a contained one produces. **This one is a strictly larger
   change than a locale key** — the event type, its schema member, its
   `EVENT_PRESENTATION` row and its wording all have to exist — and the wording
   is the owner's, so it is handed over whole rather than started.
