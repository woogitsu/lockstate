# ADR 0087: Whether a refusal is an event or a condition of the prison

> **0087 was taken over a held 0086, and the sweep is the authority.** On this
> branch, cut from `main` at `b04e45f8` (v0.0.319), the highest ADR on disk is
> **0085** and [`README.md`](./README.md) read `Next free number: 0086`. So
> `max + 1` off disk and the stated next-free line agreed at 0086 — **and both
> were wrong**, for the reason this corpus has recorded eight times: disk sees
> only what has merged. The remote sweep was **performed rather than
> asserted**: one `git fetch origin '+refs/heads/*:refs/remotes/origin/*'
> --prune`, then `git ls-remote --refs --heads origin` (**402 heads**) with
> `git ls-tree --name-only <head> docs/adr/` read out of every one of them and
> the four-digit prefixes collected. Maximum on any head: **0086**, on
> `docs/718-what-cadence-a-pulled-readout-has` alone, as
> `0086-what-refreshes-a-pulled-hud-readout.md` — unmerged and therefore
> invisible from the index. Nothing at 0087 or above anywhere. The number is
> therefore **0087**, taken above the held one exactly as 0073 and 0082 were.
>
> The brief that commissioned this document said *"expect 0087, verify by
> sweep, and report any disagreement"*. There is no disagreement to report:
> the brief's expectation and the sweep agree, and the two answers that
> disagree with both — `max + 1` off disk and the stated next-free line — are
> the two the sweep exists to overrule.
>
> The number is provisional on the terms 0080 through 0085 each set for
> themselves: if it collides with an ADR landing from a branch cut after this
> sweep, this file, its row in the index and every citation of it get
> renumbered together. Resolving such a collision is the integrator's, not
> this draft's.
>
> **Re-swept after a fast-forward, because `main` moved twice while this was
> being finished.** The branch was cut at `b04e45f8` (v0.0.319); before this
> file was pushed the worktree was fast-forwarded to `origin/main` at
> `a64709f6` (v0.0.321), which carries **`8d04de84`** — the owner's acceptance
> and implementation of [ADR 0084](./0084-what-the-alerts-channel-owes-a-player.md).
> Neither fast-forward added an ADR *file* (`git diff --stat b04e45f8 a64709f6
> -- docs/adr/` touches exactly three: `0084`'s own file, `README.md`'s
> next-free line, and `STATUS-QUEUE.md`'s owner-facing tracking — no new
> `NNNN-*.md`), so no renumbering follows from it. The remote
> sweep was repeated at the new tip regardless, rather than trusted from the
> first pass: `git ls-remote --refs --heads origin` now returns **403** heads
> (one more than the first sweep's 402), and `git ls-tree --name-only <head>
> docs/adr/` read out of every one of them again finds nothing at 0087 or
> above — the maximum is still **0086**, still only on
> `docs/718-what-cadence-a-pulled-readout-has`, still unmerged. **0087 stands.**
> What the second sweep changed is not the number but a citation in this
> document: ADR 0084 landing mid-pass falsifies Cost 6 as first written, and
> that section is corrected below with the ground it was corrected against
> rather than silently rewritten (`docs/AGENT_WORKFLOW.md` §4: mark both
> directions).

## Status

**Proposed, 2026-09-01. Not self-approved**, for decisions 1, 3 and 4.

**Decision 2 is amended, and the amendment is signed: the owner ruled on it on
2026-09-01, on issue [#767](https://github.com/matmaxalez/lockstate/issues/767).**
See §*Amendment, 2026-09-01: the ruling is both — a standing condition and a
crossing event* at the foot of this file. It records the owner's answer to the
question this document put to them — *"a persistent indicator ... plus a
one-off notice at the moment of crossing"* — which is **more** than decision
2's own recommendation of the indicator alone, and prices what that costs (more
rows on the events band) in the amendment rather than leaving decision 2's
original cost table standing unqualified. **Implemented in the same branch**:
`PrisonCondition` (`src/simulation/protocol/types.ts`), the pure producer
`computeStandingPrisonConditions`
(`src/simulation/presentation/status-strip-projection.ts`) and the crossing
system `InsolvencyRungSystem`
(`src/simulation/economy/insolvency-rung-system.ts`) all exist on disk as of
this amendment, so what was signed can be seen running rather than only
described.

Decisions 1, 3 and 4 are unaffected by the amendment and remain as originally
stated below: one recommended without reservation, the other three (now: the
other two, since 2 is settled) recommended with a named gate. **Decision 2
still could not have been executed without new player-facing sentences**,
which `AGENTS.md`'s fourth exclusion reserves to the owner; the amendment
records that the crossing event's two sentences were written to be the
clearest available rather than presented as settled, and are the owner's to
confirm or replace, exactly as the rest of this Status already says about
every string in this corpus.

**Nothing in `src/` was changed by the pass that first wrote this document.**
No file under `src/` was edited by that pass; five other agents were working
there at the time, including in the files it cites most. The amendment below
is a separate, later pass and is the first to touch `src/`.

## Context

### The question

Issue [#657](https://github.com/matmaxalez/lockstate/issues/657), split out of
[#640](https://github.com/matmaxalez/lockstate/issues/640) on the owner's
ruling of 2026-08-30 (*"withdraw-only now, ADR later"*):

> **Is a refusal an event caused by a press, or a condition of the prison?**

Today the answer is *both*, in one channel, and the seam is visible in four
places at once. This document inventories every producer, prices what the
ambiguity already costs, and recommends an answer.

### The three channels this repository already has

The taxonomy is not invented here. `SimulationEventLog`'s own docblock states
it, at `src/simulation/events/event-log.ts:50-51`, explaining why issue #507
became a channel rather than two more fields:

> That is the whole reason issue #507 is a channel rather than two more
> siblings of `counts`. **`refusal` and `zoning` are levels and belong there;
> these are occurrences and do not.**

So:

| Channel | Shape | Carries | Survives a reload |
| --- | --- | --- | --- |
| **Occurrences** — `simulation/event` | push, once per event, coalesced by nothing (`event-log.ts:34-51`) | things that happened at a tick | **yes, since ADR 0084 decision 3** (`event-log.ts:73-105`) — see Cost 6 |
| **Levels** — `simulation/status-counts` | snapshot on a cadence, ≤2/s, skipped when unchanged | `counts`, `refusal`, `zoning` (`src/simulation/protocol/types.ts:1359-1361`) | not applicable: recomputed, except `refusal` |
| **Read models** — `simulation/request-projection` | pull, while a panel is showing; **absent is a real state, not a zeroed one** (`src/ui/hud/view-model.ts:1145-1153`) | build queue, room needs, intake pipeline | yes, for free — recomputed from persisted state |

**`refusal` is declared a level and implemented as an occurrence.** That one
sentence is the whole of this ADR's problem. `RefusalLog.record`
(`src/simulation/refusals/refusal-log.ts:139-143`) increments a monotonic
`_sequence` (`:93`), writes one slot, and is called from twelve command
handlers and nothing else. A level does not have an ordinal, does not
increment, and is not written by a handler; it is *read off the prison*.

### 1. The inventory — every producer of a refusal

Two vocabularies, on two sides of `sender.submit`, reaching different
surfaces. Ruling 23 of 2026-08-31 (*"Te same słowa co host"*) made two of the
sentences identical; it did not merge the machinery, and the four columns
below are what still differs.

#### Side A — the host, before the command is sent (`hud.refusal.*`)

| # | Producer | What it knows | What it can say | Answering |
| --- | --- | --- | --- | --- |
| A1 | `src/main.ts:2845` — `purchase-materials` pre-flight, via `judgeAffordability` (`src/ui/affordability.ts:167-189`) | the charge, the last published balance (≤500 ms old), the `'deliveries'` rung floor (`affordability.ts:152`) | `hud.refusal.purchase-materials-past-floor`, or the generic `hud.refusal.purchase-materials` | **your press failed** |
| A2 | `src/main.ts:3067` — `hire-staff` pre-flight, same function | as A1, at the `'hiring'` rung, which shares the `'deliveries'` threshold | `hud.refusal.hire-staff-past-floor` / `hud.refusal.hire-staff` | **your press failed** |
| A3 | `src/ui/hud/hud.ts:1476-1491` — `reportError`, the catch-all for **every** gated command that throws (no session, a rejected submit, a worker fault) | the `actionId` and, since ruling 18, a `HostRefusalReason` | one of twelve authored keys, chosen by `refusalMessageKey` (`src/ui/hud/projection.ts:1356`); `undefined` for a chrome intent | **your press failed** |

All three reach **the band only**. None of them reaches `HudViewModel.alerts`,
and none of them increments any count: `hudAlertsFromWorkerMessage`
(`src/ui/simulation-alerts.ts:287-317`) is the only producer of a
`refusal-`-prefixed row and its sole input is `message.payload.refusal`, which
comes from `RefusalLog`. A host refusal is told once and then is not anywhere.

#### Side B — the worker, at the tick the command runs (`hud.alert.refusal.*`)

Twelve `RefusalLog.record` call sites. The **key width** column is the one
worth reading: it is where the codebase has already, without saying so,
sorted its own refusals into two kinds.

| # | Producer | Reasons | Supersession key | Key width | Answering |
| --- | --- | --- | --- | --- | --- |
| B1 | `session-commands.ts:155` — `ZoneRoom` | 8 | `zone:<type>:<x>:<y>:<w>:<h>` | per-target | your press failed |
| B2 | `session-commands.ts:205` — `UnzoneRoom` | 3 | `unzone:<x>:<y>:<w>:<h>` | per-target | your press failed |
| B3 | `session-commands.ts:284` — `AdmitPrisoner` | 2 | `admit` | **domain-wide** | **the prison is in a state** |
| B4 | `session-commands.ts:365` — `PurchaseMaterials` | 4 | `purchase:<item>:<qty>` | per-target | your press failed (except `insufficient-funds`) |
| B5 | `session-commands.ts:448` — `CancelMaterialPurchase` | 1 | `cancel-purchase:<orderId>` | per-target | your press failed |
| B6 | `session-commands.ts:492` — `HireStaff` | 4 | `hire:<roleId>` | per-role | **mixed — see below** |
| B7 | `session-commands.ts:549` — `PlaceObject` | 7 | `place-object:<def>:<x>:<y>` | per-target | your press failed |
| B8 | `session-commands.ts:599` — `RemoveObject` | 1 | `remove-object:<x>:<y>` | per-target | your press failed |
| B9 | `session-commands.ts:643` — `ReleaseGuard` | 2 | `release-guard:<id>` | per-target | your press failed |
| B10 | `session-commands.ts:689` — `DismissStaff` | 1 | `dismiss:<id>` | per-target | your press failed |
| B11 | `construction/handler.ts:83` — `PlaceBuildOrder` | 7 | `build:<def>:<x>:<y>:<edge>` | per-target | your press failed |
| B12 | `construction/handler.ts:250` — `reportMaterialsFunding`, reached from `handler.ts:89` (a build press) and `session-commands.ts:567` (an object press) | 1, reused: `purchase.insufficient-funds` | `materials-funding` | **domain-wide** | **the prison is in a state** |

And one withdrawal-only producer, which is the shape #640 left behind:

| # | Producer | Behaviour |
| --- | --- | --- |
| B13 | `runtime/new-session.ts:775-779`, the sink `ConstructionSystem.update` calls every scheduled tick (`construction/system.ts:1087`) | **supersedes and never records.** A shortfall that *arises* with no press is silent. |

#### The key width is already the answer, and the code says so in its own words

`refusal-log.ts:430-445` explains why nine of the ten keys are per-target and
one is not:

> Nine of the ten are per-target: their refusal reasons are facts about the
> specific rectangle, tile, order or guard the command named... `admit` is the
> exception and is keyed domain-wide on purpose: both of its reasons
> (`no-accommodation`, `population-full`) are **session-global facts
> re-evaluated identically for every admission** regardless of the prisoner's
> own parameters... a *different* admission succeeding is not a proxy for the
> standing refusal being false — it is the same check, run again, coming back
> the other way.

`materialsFundingSupersessionKey`'s own docblock (`refusal-log.ts:495-519`)
says the same thing about B12, in the same words, and calls the width
*"measured, and it is why this key exists"*:

> "The build queue cannot be paid for" is a statement about the treasury
> against everything queued, not about the wall the player last pressed.

*Session-global fact re-evaluated identically*, and *a statement about the
treasury against everything queued*, are both descriptions of a **condition**.
The repository worked out which of its refusals were conditions in 2026-08 —
it just expressed the finding as a string-key width instead of as a type.

**And the split does not run along producer boundaries.** `refusal-log.ts:448-457`:

> `hire`'s four reasons split unevenly across that boundary — `roster-full` is
> global like `admit`'s pair, while `insufficient-funds` and `no-duty-for-role`
> are per-role facts a different role's successful hire does not disprove — and
> there is no one key that is exactly right for both.

That sentence is a measured refutation of option 3 in issue #657 (*"producers
decide"*), written before the option was proposed. B6 is **one producer with
reasons of both kinds**. A producer cannot declare the kind, because the kind
is a property of the reason.

#### The condition surfaces this repository has already built, one at a time

Three of them, none of them called a condition channel, all of them pulled
read models:

- **`HudIntakePipelineViewModel.waitingWithoutPlace`** (#549,
  `view-model.ts:1200-1218`) — *"Arrivals the prison has no free place for
  right now... It is a statement about the prison **now** and not a
  forecast."* This is exactly *"no bed for a resident"*, and it was built as a
  readout rather than as an eleventh admission refusal.
- **`HudZoningNoticeViewModel`** (`view-model.ts:1228-1241`) — *"It is a
  **readout, not a refusal**, and the distinction is the whole reason this
  field exists rather than a seventh zoning refusal reason."*
- **`BuildQueueMaterialsFundingViewModel.shortfallMinorUnits`** — *"what the
  queue still needs, whole"*
  (`src/simulation/construction/materials-procurement.ts:69-79`), recomputed
  by `projectBuildQueue` from `JustInTimeMaterialsService.lastReport` on every
  pass, which `new-session.ts:770-773` names as the reason the *read model*
  has no gap even though the alert band does.

Every one of these is the right shape and lives behind a fold or a tab. Issue
[#629](https://github.com/matmaxalez/lockstate/issues/629)'s finding is
precisely that: the *"Awaiting Materials"* row was representable and *"lived
inside a fold that starts shut, so it reached nobody"*
(`construction/handler.ts:134-139`). The refusal band was reached for because
it is the surface that needs no gesture — not because a shortfall is a
refusal.

### 2. What the ambiguity costs, measured

Seven assertions were run against this tree as a throwaway `vitest` probe and
all seven pass, which is to say every claim below is true of the code as it
stood at `b04e45f8`. The probe was deleted before commit (`docs/AGENT_WORKFLOW.md`
§2: never leave a scratch file under `tests/`); it is reproduced in full in the
report that accompanies this branch. Costs 1 and 2 — the two the class
`RefusalLog` itself is unaffected by ADR 0084 makes safe to re-check — were
re-run as a second throwaway probe at `a64709f6` after the fast-forward
(Cost 6), against `RefusalLog.record`/`supersede` and the two supersession-key
functions directly: both pass unchanged (`2 passed (2)`), which is expected
since neither `refusal-log.ts` nor `session-commands.ts`'s call sites changed
behaviour, only line numbers. Costs 3 through 6 rest on citation rather than a
probe and were re-verified by re-opening every `file:line` at the new tip
(recorded throughout this document). Run output, first probe:

```
 RUN  v4.1.11 /workspace/lockstate/.claude/worktrees/refusal-ontology
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  697ms
```

#### Cost 1 — a condition cannot be re-announced, because re-announcing it inflates without bound

Driving `reportMaterialsFunding` with an unchanged, still-unfunded report for
240 consecutive ticks yields `log.count === 240`, **240 distinct alert row
ids**, and `last === { sequence: 240, tick: 240, reason:
'purchase.insufficient-funds' }`. Twelve seconds of a stalled queue at the
50 ms tick would be 240 rows for one fact that never changed.

This is not a hypothetical: it is the exact reason `new-session.ts:750-758`
declines to call `reportMaterialsFunding` on the scheduled tick, in those
words — and the same comment now names this ADR directly: *"Whether a refusal
here is an event caused by a press or a condition of the prison is a decision
that outgrew this change; it is filed as its own issue and is not settled
here"* (`new-session.ts:762-765`). The design forced #640 into withdraw-only,
and withdraw-only is what produces cost 2.

#### Cost 2 — a still-true condition can go permanently silent, and this one is new

`RefusalLog` holds **one** record, and `supersede` (`refusal-log.ts:149-153`)
withdraws only when `_currentKey` matches. So:

1. A build order is placed against a short treasury. B12 records
   `purchase.insufficient-funds` under key `materials-funding`. The band says
   so.
2. The player presses *Admit* into a prison with no free bed. B3 records
   `admit.no-accommodation` under key `admit`, **replacing** the shortfall.
3. The player builds a cell. An admission succeeds. `supersede('admit')` fires
   and the line is **empty**.
4. The build queue is still unfunded. Every scheduled pass now runs B13, which
   only supersedes — and `materials-funding` is not the current key, so
   nothing happens.

The prison is in a state it cannot pay its build queue out of, and the alert
channel says nothing at all, **until the next build or object press**. Probe B
asserts each of those four steps. This is strictly worse than the
tick-1-forever staleness #657 opened with: that one was a false sentence, this
one is no sentence.

#### Cost 3 — the count answers a question nobody asked

`count` is `_sequence` and is never rewound (`refusal-log.ts:88-93,170-172`),
so after one shortfall that has since been withdrawn, `last` is `undefined`
and `count` is `1`. It therefore means *"how many presses this session
refused"* — while omitting **every host refusal**, which never touches this
class at all (side A above). It is neither the number of things currently
wrong with the prison nor the number of times the player has been told no.

#### Cost 4 — one reason for two rungs, and the sentence names a third number

Since ruling 19 the floors are three (`treasury.ts:377-382`, verified by
probe): `deliveries` −1,250, `construction` −2,000, `wages` at the treasury's
own floor, which is −2,500 (`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`);
`hiring` shares the first.

`SimulationRefusal` carries `sequence`, `tick` and `reason` and nothing else
(`src/simulation/protocol/types.ts:1570-1574`). There is one money reason per
command namespace, so **the wire cannot name which rung refused**: probe D
asserts that a press-route refusal and a scheduled-construction-route refusal
record byte-identical `reason` values. The shipped sentence for both was
*"Nothing was bought — that would go past what the state will carry."*;
**re-anchored 2026-09-06 and converted to a quotation, per
`docs/AGENT_WORKFLOW.md` §4 — ruling 23 has since replaced it with
`Nothing was bought — deliveries are refused until the prison earns the money.`
(verbatim in `src/content/default-locale-en.ts`), key
`hud.alert.refusal.purchase.insufficient-funds`**, the same clause the host
side already carries — so the specific old sentence this row quotes no longer
ships; the argument that follows (the wire cannot name which rung refused) is
unaffected, because both wordings are one enum member wide.

`default-locale-en.ts:707-724` already records this, in the owner's own frame,
and correctly declines to fix it because the replacement is copy. What that
entry does **not** say, and what this ADR adds, is *why the channel cannot
carry the distinction*: the rung is a property of the prison's balance
relative to a class of spend — a condition — and the channel it is being
reported on carries one enum member per press.

#### Cost 5 — the same words, two lifetimes, and only one of them is logged

Ruling 23 made A1/A2 and B4/B6's money sentences identical. Everything else
about them still differs, in one file:

- `hud.ts:1504-1507` — a **host** refusal clears the moment the same
  `actionId` later succeeds.
- `hud.ts:1543-1559` — a **simulation** refusal is cleared only by a newer
  refusal, by `supersede`, or by the session ending. A later success of the
  same control does not touch it.
- `hud.ts:1428-1430` — three module-level variables (`refusalSource`,
  `refusedAction`, `simulationRefusalSequence`) exist for no other purpose
  than keeping the two producers from clearing each other.
- The host's never reaches the list; the simulation's does.

So two sentences that are word-for-word identical have different lifetimes,
different keyboard affordances (only the host's marks a control with
`data-action` and `aria-describedby`), and different persistence in the log.
Which one a player got is decided by whether their balance moved in the last
500 ms.

#### Cost 6 — the reload, and the ground moving twice under one paragraph

**The brief that commissioned this document said the alerts log *"has just
been made to survive a reload (ADR 0084)"*. This document corrected that
sentence once already, and the correction was itself overtaken before the
file was pushed — both versions are recorded rather than the second silently
replacing the first (`docs/AGENT_WORKFLOW.md` §4).**

When this pass first read the tree (`b04e45f8`, v0.0.319), the brief's claim
was not so: ADR 0084 was `Proposed. Not self-approved`, its decision 3 stated
**"Not decided here"**, and nothing on `main` persisted alerts. Fast-forwarding
this worktree onto `origin/main` picks up `8d04de84` (v0.0.321, merged the same
day this document was drafted), in which **the owner accepted all four of ADR
0084's decisions and the implementation shipped in the same change** (ADR
0084's own Status section, "Accepted, 2026-09-01... the log survives a reload
(decision 3)"). The brief's original sentence is therefore true again — and
the two logs now answer the reload question by **disagreeing**, not by
agreeing, which is the version of "the seam is visible" this document should
have been able to state from the start had it read a settled tree.

What is true of the tree at `a64709f6` (v0.0.321), the tip this document is
actually written against:

- **`SimulationEventLog` — the occurrences channel — is snapshotted.** Its own
  docblock records the change in these words: *"It was not snapshotted, and
  since 2026-09-01 it is"* (`event-log.ts:73`). `save-schema.ts` carries an
  optional `alerts` section (`alertsSectionSchema` at `:622`, wired at
  `:1256`) and `SAVE_SCHEMA_VERSION` stays 5 (`:36`) — an addition under ADR
  0038 §1, not a migration.
- **`RefusalLog` is not.** Unchanged, in the words this document already
  quotes above: *"this holds a notice about an action the player took moments
  ago, **not a condition of the prison**"* (`refusal-log.ts:52-65`). The
  composition root that wires both logs now says so explicitly, in a comment
  added by the very change that persisted the other one: *"Empty for a new
  session and for a restored one alike -- it is not snapshotted. (That is
  still true of *this* log. The events log beside it stopped being
  unsnapshotted on 2026-09-01, ADR 0084; the owner ruled on that one and not
  on this one.)"* (`new-session.ts:688-692`).

**And the reason the two now diverge is not the reason this document is
about.** `event-log.ts:96-104` gives it directly, in the same docblock: *"
`RefusalLog` is **not** followed here: its own docblock prices carrying the
refusal and refuses on what it would buy, the owner has not ruled on it, and a
refusal has no dismissal either (`docs/HUD_PROJECTIONS.md` gap 34). The two
logs stop being siblings in this one respect and that is a decision rather
than an oversight."* What let the occurrences channel persist safely is that
ADR 0084 gave it a **dismissal** in the same change (its decision 2) — a
restored, stale row can be marked read. `RefusalLog` holds one slot and has no
dismissal at all, so a restored stale refusal would sit forever with nothing
on the channel able to clear it. That is an argument from *dismissal*, not
from *kind*: it does not by itself say a refusal is an event rather than a
condition, and it is not evidence for or against decision 1 below.

**It does make decision 2 below cheaper than it looked when this section was
first drafted, though, and that is worth stating rather than losing in the
correction.** A `PrisonCondition` on `status-counts` needs neither persistence
nor a dismissal mechanism, for the same reason the pulled read models it
generalises need neither: it is recomputed from state already in the save, so
there is no stale slot to leave stranded and nothing to dismiss. B3 and B12 —
exactly the two reasons this document argues are conditions rather than
events — are exactly the two a literal persistence of `RefusalLog` would have
been most wrong to restore verbatim, because a stale *domain-wide* notice
misstates something about the whole prison rather than about one wall. Decision
2 sidesteps the question ADR 0084 just had to answer for occurrences, rather
than answering it the same way for a fact of a different kind.

### 3. The one answer already given, in passing, in one file

`src/ui/simulation-alerts.ts:406-407` rules that a refusal appearing in both
the band and the list

> is the intended reading rather than a duplication to be removed: **one is
> what is happening now, the other is the entry it left.**

That sentence is an answer to #657 — *there are two readings of a refusal, a
present-tense one and a historical one* — and it is right. What it cannot do
from where it sits is make the two readings come from different data: both
halves read the same single `RefusalLog` record, so *"what is happening now"*
is in fact the last thing that happened, and *"the entry it left"* is a list
that holds exactly one refusal entry.

## Options

### Option 1 — idempotent `record` under an unchanged key (#657's shape 1)

`record` does not increment `_sequence` when `key` and `reason` both match the
current record. Perhaps five lines.

**What it fixes:** cost 1 alone. B13 could then call `reportMaterialsFunding`
unconditionally and the withdraw-only gap closes.

**What it does not fix, and this is the whole objection:** cost 2 is
untouched, because there is still one slot — probe B's four steps run exactly
as before. Cost 3 gets worse: `count` becomes neither presses-refused nor
conditions-standing. Cost 4 is untouched. Cost 5 is untouched. And it forces a
new decision nobody has taken: `tick` becomes ambiguous between *first seen*
and *last seen*, and whichever is chosen the other reading is unrecoverable —
for a condition, *first seen* is the useful one and *last seen* is what the
snapshot channel's contract implies.

Cheapest to reach; genuinely insufficient.

### Option 2 — producers decide (#657's shape 3)

Refuted above by `refusal-log.ts:448-457`, which was written before the option
existed: B6 is one producer whose four reasons fall on both sides.
Implementing it would put a per-call-site flag on a per-reason fact and
guarantee that the two disagree the first time a reason is reused — which B12
already is, reusing B4's `purchase.insufficient-funds` from a different
producer with a different key width.

### Option 3 — a second channel of its own, `simulation/condition` (#657's shape 2)

A third push channel beside `simulation/event`.

**Rejected**, and by the repository's own rule rather than on cost: a
condition is a **level**, and `event-log.ts:50-51` states that levels belong on
`status-counts` and occurrences do not. A push channel for a level would
re-make, one channel over, the exact mistake this ADR is naming. It also needs
a watermark, a buffer bound and an overflow rule (`MAX_BUFFERED_SIMULATION_EVENTS`
and its trim), all of which are machinery a recomputed set does not need.

### Option 4 — two kinds; the condition kind goes on the levels channel it was always declared to be on (recommended)

Refusals stay exactly as they are. A **standing condition** becomes a distinct,
smaller thing: a member of a closed union, recomputed from live state at every
publication, carried as a bounded set on `simulation/status-counts` beside
`refusal` and `zoning`, with **no ordinal, no monotonic counter, no
supersession key and nothing in the save**. Absence of an id from the set
means the condition is not standing. Several stand at once by construction.

This is the shape the existing pulled read models already have, moved from a
surface that must be opened to one that need not be — which is issue #629's
requirement stated exactly.

### Option 5 — do nothing

Costs 1–6 stand. Cost 2 is the one that makes this uncomfortable: a prison
whose build queue cannot be paid for can currently say nothing about it, for
as long as the player does not press *Build* again.

## Decisions for the owner

### Decision 1 — a refusal is two kinds, and the kind is a property of the *reason*, not of the producer or the command

**Recommended without reservation, and it costs nothing to adopt.** It is a
statement about vocabulary, not code: `RefusalReason` today mixes
*"your press failed"* members (`build.out-of-bounds`,
`cancel-purchase.not-pending`, `place-object.tile-occupied` — 33 of the 39)
with *"the prison is in a state"* members (`admit.no-accommodation`,
`admit.population-full`, `hire.roster-full`, and `purchase.insufficient-funds`
**when B12 produces it**), and the codebase has already sorted them once, as
supersession-key widths, and written down its reasoning.

Adopting this decision alone changes no behaviour and makes three sentences in
`refusal-log.ts` true instead of nearly true. Everything below depends on it.

### Decision 2 — the condition kind is carried as a recomputed set on `simulation/status-counts`, and never enters `RefusalLog`

**Recommended, gated on copy.** Concretely:

- A closed union `PrisonCondition` in `src/simulation/protocol/types.ts`,
  starting with the two the code has already identified —
  the build queue cannot be funded, and an arrival has nowhere to sleep — plus
  whichever of #557's patrol coverage, #552's contraband counter and #478's
  silent relocation the owner wants said out loud.
- An optional `conditions` field on `statusCountsSchema`, an array of that
  union in canonical (ascending id) order, bounded by the union's own size.
  `.strict()` already makes a drift between producer and schema a decoder
  fault rather than a silent stop (`types.ts:643-648`).
- A pure producer in `src/simulation/presentation/`, beside
  `status-strip-projection.ts`, recomputing the set at publication time from
  the same live state the pulled read models already read. It must be a
  **read**: `tests/determinism/status-counts-publication.test.ts` pins that
  publishing changes nothing the kernel can observe (`event-log.ts:57`).
- A `Record<PrisonCondition, LocalizationKey>` in `src/ui/simulation-alerts.ts`
  beside `REFUSAL_LABEL_KEYS`, so a condition added to the protocol **fails to
  compile** until somebody has decided what it says.
- Rows in the alerts list under their own id prefix, which the list already
  supports: three producers share it today and keep each other's rows by
  filtering on prefix (`simulation-alerts.ts:183-184`,
  `simulation-events.ts:208`).

**And the condition kind does not take the refusal band.** The band holds one
sentence and a condition would evict a refusal the player has not read — the
eviction `view-model.ts:1565-1576` refused when it gave discharge notices a
third band rather than the refusal line. Whether conditions eventually earn a
band of their own is ADR 0085's corner-width question and is deliberately not
answered here.

**What gates it:** every condition needs an authored sentence, and
`AGENTS.md`'s fourth exclusion reserves that to the owner. This ADR authors
none.

### Decision 3 — `RefusalLog` stays unsnapshotted; the condition kind never needs the question

**Recommended. Save-format cost: zero.**

**This decision's title changed while this document was being finished, and
both readings are kept rather than one overwriting the other.** It read
*"neither log is snapshotted, and now for a reason rather than an
intuition"* until the owner accepted [ADR 0084](./0084-what-the-alerts-channel-owes-a-player.md)
mid-pass (Cost 6 above): the occurrences channel picked up a save-schema entry
and a dismissal in the same change, so *"neither log"* is no longer a
description of the tree. What survives the correction is the half of the
argument that was never about the occurrences channel:

- An **event** refusal is about a press in the session that made it. It dies
  with the session because its subject does. This is `refusal-log.ts:52-65`'s
  argument, unchanged and still true of `RefusalLog` specifically — and, per
  Cost 6, the composition root now says explicitly that the owner "ruled on
  [the occurrences log] and not on this one" (`new-session.ts:688-692`), so
  `RefusalLog`'s exclusion is not yet a closed question so much as a question
  ADR 0084 deliberately declined to reach.
- A **condition**, under decision 2, needs no persistence *because it is
  recomputed*. The state behind it — the treasury balance, the build queue,
  the room instances — is already in the save. A restored prison whose queue
  is still unfunded publishes the condition on its first `status-counts` after
  load, with no stale-notice problem, because nothing stale was carried. This
  is the same mechanism `event-log.ts:86-88` describes for arrears (*"the
  conditions behind the events do persist and re-announce themselves"*) —
  decision 2 makes it true of these facts too, instead of true only of the
  ones that happen to have an event.

**The two bullets no longer rest on a shared premise, and that is a stronger
position than the one this decision opened with, not a weaker one.** The
occurrences channel needed a save-schema entry *and* a dismissal to persist
safely; `RefusalLog` has priced the first and still lacks the second
(`docs/HUD_PROJECTIONS.md` gap 34) and stays excluded on that basis alone,
independent of anything this ADR argues about kinds. The condition channel
needs **neither**, because it is never a stored record in the first place —
it is read off state that was never going to need a dismissal to begin with.
So this decision no longer claims two logs answer one question the same way;
it claims one log's exclusion is orthogonal to this ADR and one channel's
design makes the question not arise.

This is the strongest single argument for option 4 over option 1: **option 1
creates standing simulation state that a save then has to answer for, and
option 4 creates none.** Now that ADR 0084 decision 3 has been taken for the
occurrences channel, the parallel is worth stating precisely rather than left
implicit: the owner accepted persistence for occurrences once it came bundled
with a dismissal; option 4 needs the owner to accept nothing about persistence
at all, because there is nothing on this channel to persist.

### Decision 4 — the host pre-flight stays an event producer, and gets a row in the alerts list

**Recommended, and it authors no copy.** A1–A3 answer a press and nothing
else; they are events under decision 1 and need no change of kind. What is
worth closing is cost 5's last clause: a host refusal is currently told once
on the band and recorded nowhere, so after ruling 23 two identical sentences
have different afterlives for a reason no player can see.

The list already has the mechanism — the fault rows are keyed by *code* rather
than by occurrence precisely so a repeated fault updates one row
(`simulation-alerts.ts:320-324`). A host refusal keyed by `actionId` behaves
the same way, is bounded by the twelve keys `refusalMessageKey` can return,
needs no wire change, no save change and no new sentence.

**Not recommended for the reverse direction:** making the worker's money
refusal *reference* the host's key. `default-locale-en.ts:395-412` argues that
one out at length and is right — a key here is a call site, not a string pool.

### What this document deliberately does not decide

1. **Any sentence.** Every condition in decision 2 needs one and none is
   written here.
2. **Whether the rungs get sentences of their own.** ADR 0017's
   "Amendment, 2026-09-01" already lists all four money keys as owed one, and
   cost 4 is a reason to want it rather than a new request.
3. **Whether a condition gets a band.** ADR 0085's.
4. **Which conditions to ship.** Decision 2 names five candidates and
   recommends the shape, not the list.

## What it would cost to implement

Priced against this tree, decision by decision. **No `SAVE_SCHEMA_VERSION`
bump is implied by any of the four**, and unlike ADR 0084's decision 3 this is
not a "cheap under the compatibility rule" claim — decision 2 **writes nothing
to the save at all**, so ADR 0038 §1 never comes into it.

| Piece | Size | Risk |
| --- | --- | --- |
| Decision 1 — vocabulary, comments in `refusal-log.ts` and `protocol/types.ts` | tens of lines of prose | none; no behaviour |
| `PrisonCondition` union + `conditions` on `statusCountsSchema` | ~30 lines in `protocol/types.ts` | low; `.strict()` and the existing decoder test catch drift |
| The recomputing producer in `src/simulation/presentation/` | ~80–120 lines for the first two conditions; it reads systems the projections already read | **the real risk**: it runs at publication, so it must be a pure read. `tests/determinism/status-counts-publication.test.ts` is the existing guard and a new case belongs in it. Canonical ascending-id order is `docs/DETERMINISM.md`'s requirement and is one `sort`. |
| `REFUSAL_CONDITION_LABEL_KEYS` + rows in `hudAlertsFromWorkerMessage` | ~40 lines, mirroring the fault branch | low; the `Record` over a closed union is the compile-time gate |
| Host rows (decision 4) | ~25 lines in `src/ui/`, plus a prefix constant | low; `src/main.ts`/`hud.ts` are unreachable from `pnpm test` (`vitest.config.ts` sets `environment: 'node'`), so the decision must be extracted into a pure function the way `judgeAffordability` and `orderPrisonsForDisplay` were, or it is untestable by construction |
| Copy | one sentence per condition | **the gate.** Owner's, `AGENTS.md` exclusion 4 |
| Save format | **nothing** | — |
| Tests | the producer is pure, so unit-testable without a worker or a DOM; one determinism case; one `ui-simulation-alerts` case resolving every new key against the bundled catalog, which is what stops a key shipping as raw dotted text | — |

**What is *not* in that table, and should be said rather than discovered:**
adopting decision 2 makes B13's silence fixable but does not by itself fix it.
`reportMaterialsFunding` would keep recording the *event* refusal on a press,
and the *condition* would be published independently by the recomputing
producer — which means the two would both be true at once on the press tick,
one on the band and one in the list. That is the same double reading
`simulation-alerts.ts:388-389` already calls intended, arrived at deliberately
this time. If the owner would rather a press produce exactly one line, B12
should be deleted rather than kept, and that is a fifth decision this document
does not take because it changes what a player sees.

## Consequences

- **Nothing changes in `src/` until the owner rules.** This document is
  research and a recommendation.
- If decision 1 alone is taken, three docblocks in `refusal-log.ts` get more
  precise and nothing else happens. It is worth taking on its own.
- If decision 2 is taken, `RefusalLog`'s contract is **unchanged** — no
  idempotent `record`, no second slot, no key semantics touched. That is the
  point of preferring it to option 1: the class that eleven producers depend
  on does not move.
- Issue #657's tail — #557's patrol metrics, #552's contraband counter, #478's
  silent relocation — becomes a list of candidate `PrisonCondition` members
  rather than three separate design questions.
- Cost 2 stays open until decision 2 ships. It is the one finding here that is
  a live defect rather than a design smell, and it deserves its own issue
  whatever the owner rules.

## Open questions

1. **Does a condition ever warrant `severity: 'danger'`?** Every refusal is
   `'warning'` uniformly and `simulation-alerts.ts:253-259` argues that grading
   one refusal above another is a balance judgement the UI layer has no basis
   for. A condition may be different — "the prison cannot make payroll" is not
   the same order of thing as "no bed for one arrival" — but the argument
   against grading is the same argument, and this draft does not overturn it.
2. **Should a condition carry a figure?** `shortfallMinorUnits` exists on the
   pulled read model and the band's sentences take no parameters. A condition
   that could say *how much* short would be more useful and would put a number
   on the wire that `SimulationRefusal` deliberately keeps off it
   (`docs/HUD_PROJECTIONS.md` gap 34).
3. **Is `hire.roster-full` worth moving?** It is a condition by decision 1's
   test and `refusal-log.ts:448-457` says its per-role key undersells it. It is
   also the least costly thing in the game to be wrong about, so it may simply
   not be worth a `PrisonCondition` member.

## Weakest claim, and what would change my mind

**The weakest claim in this document is that the recomputing producer in
decision 2 is cheap.** Nothing here measured it. The estimate rests on the
existing pulled projections reading the same state — `projectBuildQueue` off
`JustInTimeMaterialsService.lastReport`, the intake pipeline off
`IntakeSystem` — and on the assumption that a set of two to five booleans can
be derived at publication cadence (≤2/s) without a measurable tick cost. That
is plausible and it is not measured. **What would change my mind is a
benchmark showing the recomputation costs more than a publication can absorb**,
in which case the honest fallback is to let the *systems* maintain the flags
as they already maintain `lastReport` and have the producer merely read them —
which is more code and more state, and would want re-pricing.

Second weakest: the inventory claims twelve `RefusalLog.record` sites and
thirteen worker-side producers. That is a **count**, which
`docs/AGENT_WORKFLOW.md` §4 names as the first kind of sentence to rot. It was
taken by `grep -rn "refusals\.record" src/ --include=*.ts` on `b04e45f8`,
re-run after the fast-forward to `a64709f6` to check ADR 0084's landing had not
added one: the re-run returns **thirteen** matches, but the thirteenth is
`session-commands.ts:714`, a comment referencing the method name in prose, not
a call site — twelve real sites, unchanged. Every line was opened both times.
A call site added on a branch this pass could not see would not touch the
argument — the argument is about the *kinds*, and one more of either kind is
still one of two kinds — but it would falsify the number.

Third: no runtime measurement was taken. Five other agents held `src/` and
another held the browser, so the costs above are established by a unit-level
probe and by citation, not by playing the game. Cost 2's four steps are
asserted at the `RefusalLog` level and each of the four transitions is cited
to the producer that performs it; what is **not** demonstrated is a real
session walking that path end to end.

## Amendment, 2026-09-01: the ruling is both — a standing condition and a crossing event

**Accepted, 2026-09-01, by the repository owner.** Drafted the same day this
document was first proposed, on issue
[#767](https://github.com/matmaxalez/lockstate/issues/767) — found by playing
the pass behind PR #766 — which measured a single automatic payroll tick
taking the treasury from **−1,220 to −2,180**, crossing both the deliveries
rung (−1,250) and the construction rung (−2,000) in one step, while the alerts
log read *"No active alerts"* the same second. Implemented on the same branch
so the ruling could be signed against running code rather than only prose.

### 1. The question this ADR put to the owner, and the ruling in their own words

Decision 2 above recommends option 4 **alone**: a standing indicator on
`simulation/status-counts`, and nothing else. That recommendation was put to
the owner directly, alongside the alternative issue #767 raised — an event
instead — and framed as a genuine either/or. **The owner did not pick either
option. They picked both:**

> A persistent indicator as in option 4 — a closed union recomputed from live
> state, visible without opening anything, not scrolling away, nothing in the
> save — **plus** a one-off notice at the moment of crossing, so a player who
> was looking elsewhere gets a nudge. The accepted cost is more noise on the
> events band.

### 2. This exceeds decision 2's own recommendation, and the cost table below is now incomplete on its own terms

Decision 2's cost table prices four things: the union and schema field, the
recomputing producer, the label-key `Record`, and copy — and its closing
paragraph states outright what it does *not* price: *"adopting decision 2
makes B13's silence fixable but does not by itself fix it… If the owner would
rather a press produce exactly one line, B12 should be deleted rather than
kept, and that is a fifth decision this document does not take because it
changes what a player sees."* The owner's ruling is the fifth decision, taken
the other way from the one that paragraph flagged as the alternative: not
fewer lines, but a second one, deliberately, priced against the same events
band ADR 0084 and ADR 0085 are also spending width and dwell time on.

**What "more noise on the events band" actually costs, named rather than
assumed:**

- **Two rows instead of zero, for a single tick.** The −1,220 → −2,180 case
  produces exactly two crossing events on the same tick (§4 below) — not one
  per condition-check but one per rung genuinely crossed, so a player who
  loses both capabilities at once reads two sentences rather than a single
  combined one. That is a deliberate choice (see `deliveriesRefusedEventSchema`'s
  own comment in `types.ts`): `EVENT_PRESENTATION` grades a sentence by `type`
  alone and "deliveries refused" and "construction halted" are two different
  facts, not one fact with a slot.
- **It interacts with the dwell floor another agent is building
  (`feat/0084-a-terminal-outcome-gets-its-moment`).** Two events landing on
  one tick are two arrivals into whatever minimum-dwell arbitration
  `applyEventNotice` ends up enforcing, and this document does not touch that
  arbitration or assume how it resolves the pair — see §5 below.
- **No new figure and no ordinal enters the save.** The crossing event carries
  only the envelope every event carries (`sequence`, `tick`); the condition
  carries nothing at all into the save (decision 2, unchanged). The cost is
  entirely on the events band's *volume*, not on persistence.

### 3. What was built, where, and how it divides between the two mechanisms

**The condition (decision 2, exactly as recommended, unchanged by this
amendment):**

- `PrisonCondition`, a closed union of four members, authored in
  `src/simulation/protocol/types.ts` (`PRISON_CONDITIONS` /
  `PrisonCondition`, beside `statusCountsSchema`): `'construction.unfunded'`
  and `'intake.no-place'` — the two the code had already built as pulled read
  models (`BuildQueueMaterialsFundingViewModel.shortfallMinorUnits`,
  `PrisonerPopulationCountsViewModel.waitingWithoutPlace`) — plus this
  ruling's two, `'treasury.construction-refused'` and
  `'treasury.deliveries-refused'`. Declared in ascending-id order, which is
  also the canonical order the producer below emits in.
- An optional `conditions` array on `statusCountsSchema`
  (`src/simulation/protocol/types.ts`), bounded by `PRISON_CONDITIONS.length`,
  always published (never absent in practice — only admitted as absent on the
  wire for the same pre-existing-fixture reason `treasuryOverdraftFloorMinorUnits`
  is).
- `computeStandingPrisonConditions`
  (`src/simulation/presentation/status-strip-projection.ts`): a pure function
  of the treasury balance and its overdraft floor (via the existing
  `rungFloorMinorUnits`, so it tracks a reconfigured floor rather than a bare
  constant), the just-in-time materials report's `unfunded` length, and the
  intake pipeline's `waitingWithoutPlace` count — all three already read
  elsewhere in this same projection for other purposes, so nothing new is
  walked to produce it. Wired into the real publication path at
  `src/simulation/worker/status-counts.ts` (`projectStatusCounts`), which now
  also passes `runtime.justInTimeMaterials` as the new `materialsFunding`
  source. **No ordinal, no monotonic counter, no supersession key, nothing in
  the save** — exactly as decision 2 specifies, unamended.

**The crossing event (this ruling's addition):**

- `InsolvencyRungSystem` (`src/simulation/economy/insolvency-rung-system.ts`),
  a new kernel system registered at order 135 — immediately after
  `economy.payroll` (130), before `navigation` (150) — because nothing that
  spends treasury money in this session runs at a later order (`procurement`
  is 110; a command-handler spend is dispatched before any system runs that
  tick; `payroll` is 130), so a system at 135 always reads a tick's *final*
  balance. Pinned in
  `tests/determinism/kernel-system-order.test.ts`.
- It holds a small transient `Set` of which rungs are currently standing —
  memory the condition itself must never have (Cost 1 above), kept here
  instead, exactly as `IncidentLog` keeps "is an incident open" beside the
  pure incident *count* the strip separately recomputes. Never persisted; the
  first `update()` call after a session is built (new or restored) only seeds
  this set from the treasury's actual balance and fires nothing, so a
  restored session that is already below a rung is told by the *condition*
  (immediately, on its first publication) and not re-told by a spurious
  crossing notice for a fact that was already true before this session began.
- On a genuine transition it calls the **existing** event-writing path:
  `SimulationEventLog.recordInsolvencyRungCrossed`
  (`src/simulation/events/event-log.ts`), the same class and the same
  `append`-based mechanism `recordUnpaidWages`, `recordDischarge` and every
  other producer already use. Two new `SimulationEvent` members,
  `'economy.deliveries-refused'` and `'economy.construction-refused'`
  (`src/simulation/protocol/types.ts`), wired through `EVENT_PRESENTATION`,
  `eventParameters` and `eventParameterMessages`
  (`src/ui/simulation-events.ts`) the same way every existing member is.

### 4. Proof: the −1,220 → −2,180 case, reproduced directly

A throwaway probe (deleted before this commit, per
`docs/AGENT_WORKFLOW.md` §2) built a bare `Treasury` at −1,220 with the
shipped overdraft floor (−2,500), ran `InsolvencyRungSystem`'s seeding tick
(confirmed nothing standing), forced the balance to −2,180 exactly as a
payroll tick would, and checked both mechanisms:

```
conditions before:              []
events after seeding tick:      []
conditions after the tick:      ["treasury.construction-refused","treasury.deliveries-refused"]
events after the crossing tick: [{"sequence":1,"tick":101,"type":"economy.deliveries-refused"},
                                  {"sequence":2,"tick":101,"type":"economy.construction-refused"}]
```

Two conditions stand at once, in canonical ascending-id order
(`construction.unfunded` < `intake.no-place` < `treasury.construction-refused`
< `treasury.deliveries-refused`, so the two present here sort
construction-before-deliveries). Two crossing events fire on the same tick, in
`InsolvencyRungSystem`'s own iteration order — deliveries (the shallower rung)
before construction — which is a different, and equally deliberate, ordering
from the condition set's: one is a fixed alphabetical id order for a set with
no meaningful sequence, the other is the order the two facts became true in a
single tick, deliveries first because it is the shallower rung. A second,
full-integration reproduction lives in
`tests/integration/economy-payroll-loop.test.ts`, which a real command-built
prison drives past both rungs on days 7 and 9 — before payroll itself first
fails on day 10 — and asserts the same two event types in the same order.

### 5. The interaction this amendment does not resolve, named rather than guessed at

Another agent is adding a minimum dwell with severity promotion to the events
band's own arbitration (`.hud__event` / `applyEventNotice`,
`feat/0084-a-terminal-outcome-gets-its-moment`). This amendment's crossing
event calls the same `SimulationEventLog` every other event already calls and
touches nothing about how the band chooses what to show — but two crossing
events landing on one tick, plus whatever `PayrollSystem` itself is doing
around the same insolvency ladder, is exactly the kind of burst that dwell
floor exists to arbitrate between. Whether two simultaneous `'warning'`-severity
rows are shown in sequence, coalesced, or raced against a higher-severity
event arriving the same tick is that other change's decision to make, not
this one's — this amendment adds volume to the band and deliberately does not
touch how the band spends it.

### 6. What this amendment does not decide

Same four items decision 2's own "What this document deliberately does not
decide" lists, unchanged: any *other* sentence (the two this amendment does
author are marked owner-pending below, not settled); whether the rungs get
sentences of their own (ADR 0017's amendment already owes those); whether a
condition gets a band of its own (ADR 0085's question); and which of the
*other* three candidate conditions (#557, #552, #478) ship. This amendment
answers only the shape-versus-event question for the two the owner had in
front of them.

**Copy, owner-pending.** The crossing event needed two sentences to exist at
all, and `AGENTS.md`'s fourth exclusion reserves authoring them to the owner —
so, as this Status section already says of `hud.alert.event.economy.wages-unpaid`'s
siblings, these two are written to be the clearest available rather than
presented as decided:

- `hud.alert.event.economy.deliveries-refused`: *"Deliveries refused — the
  treasury cannot cover a purchase right now."*
- `hud.alert.event.economy.construction-refused`: *"Construction halted — the
  treasury cannot fund the build queue right now."*

The second reuses decision 8's own word for this rung ("halted") rather than
"refused", on the reasoning that a purchase is refused and a queue is halted —
two different verbs for two different subjects — but neither has been put to
the owner, and either may come back changed or replaced.

**Assumption recorded rather than silently relied on.** Both `computeStandingPrisonConditions`
and `InsolvencyRungSystem` read the −1,250 / −2,000 split as it stands today,
through `rungFloorMinorUnits` rather than a repeated literal — so a change to
*which* `SpendClass` each condition or rung reads from would need an edit, but
a change to the two constants themselves would not. A separate ruling is
equalising the rung floors and has not yet been dispatched; when it lands,
this amendment's code needs no change on that account alone.
