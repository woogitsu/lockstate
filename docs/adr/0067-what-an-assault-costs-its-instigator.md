# ADR 0067: What an assault costs its instigator

- Status: Proposed, 2026-08-28 — closes the sanction half of issue #80. Related: [ADR 0032](./0032-incident-consequences-and-classification-review.md), [ADR 0038](./0038-what-makes-a-save-compatible.md), [ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md), [ADR 0061](./0061-what-the-prison-produces-on-its-own.md), [ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md).
- **The number was assigned centrally**, after this draft returned, once ADR 0066 was confirmed on `main` — `docs/AGENT_WORKFLOW.md`'s practice for exactly this reason: the draft came back unnumbered while a sibling number was still in flight on an unmerged branch, and the owner assigned 0067 only after recomputing `max + 1` off disk with that branch's ADR present. This document renumbers without argument — file, index row and every citation together — if an unmerged branch is ever found to hold 0067 after all.

## Context

Issue #80 and ADR 0032 (accepted) share one seam: ADR 0032 built the
*classification* consequence of an incident (a finding moves `riskTier`, which
moves the regime and the housing group) and named the **sanction** half
unbuilt, in its own words:

> "Solitary is the sharpest: it is an intake *destination* and not a sanction
> destination — `IntakeSystem` routes high-risk *arrivals* to
> `room.solitary-cell`, and **nothing moves an already-placed prisoner
> anywhere.** That operation does not exist in `src/`, in either direction,
> and a sanction that expires needs both."

Verified against this branch's base (`origin/main`) before writing anything:
that sentence was still true. `grep -rn "relocat\|imposeSolitary" src/`
returned nothing; `IntakeSystem`'s only accommodation write is at admission
(`intake-system.ts:485`); no command, system or runtime method moved a housed
prisoner into or out of `room.solitary-cell`.

ADR 0061 (the assault producer) opened the other half of the gap the same
day: it built the trigger and, in its own open question 3, declined to answer
who a sanction should name:

> "An assault charges both participants. `IncidentRecord` has no culprit
> field, so `buildDisciplinaryIndex` credits the pair. Issue #80 owns
> adjudication and it needs a command type."

This ADR answers that question for the sanction this issue asks for. It does
**not** reopen ADR 0032's classification-points crediting, which stays
symmetric and unchanged — see decision 1.

`docs/PRISONER_OPERATIONS.md`'s own paragraph carrying the same claim as ADR
0032's has been corrected in place (marked both directions, not overwritten),
citing this document.

## Decision

### 1. The record still credits both participants; the sanction charges one

Two different consequences read the same incident, and they answer "who" two
different ways, deliberately.

**ADR 0032's disciplinary points (unchanged).** `buildDisciplinaryIndex`
credits every `participantIds` entry, because a riot's and a
gang-retaliation's participant list is "who was there," not "who did it" —
ADR 0032 is explicit that identifying a culprit is adjudication, and it
declines to invent one. That reasoning is sound for those two types and is
left exactly as it stands.

**The new sanction is different, because an assault is different from a
riot.** `tryOpenAssault` (`src/simulation/incidents/trigger-system.ts:373`)
does not name "who was in the sector"; it *ranks* the sector's flashpoints by
`scoreAssaultPressure` — each prisoner's own need deficit, contraband and the
sector's staffing shortfall — and takes the worst two. That ranking is thrown
away the moment `participantIds` is built, because that array is sorted
ascending by entity id for every other reader's canonical order. Before this
branch, the ranking existed for one tick and then vanished; nothing recorded
which of the two was the trigger's "worst."

This branch keeps it. `IncidentRecord` gains one optional field,
`instigatorId?: EntityId` (`src/simulation/incidents/incident.ts:102`), set
only by `tryOpenAssault` (`trigger-system.ts:421`) to `worst.entityId` — the
flashpoint `scoreAssaultPressure` found a reason for. A riot, a
gang-retaliation and an escape-attempt never set it (a riot's list is
occupants, an escape attempt already names one person). The new sanction
(decision 2) reads only `instigatorId`, so it charges exactly one of the two,
never both, and never the party this data cannot say anything about.

**Is `instigatorId` a culprit field, in the sense ADR 0032 declined to
build one?** No, and the distinction is worth stating precisely rather than
asserted. `scoreAssaultPressure` ranks by *whose conditions are worst* — high
need deficit, contraband on hand, an understaffed sector — not by who swung
first. Reading "worst-served" as "instigator" is a design choice, not a fact
the simulation observes, and it is defensible for the reason real
disciplinary practice already gives the mechanic its name: a person who is
failing on every measured axis is the person a real institution's incident
reports are written about, whether the fight found them or they found it.
**The alternative — naming *neither* participant, and sanctioning nobody —
was rejected because it leaves exactly the counter-behind-glass shape ADR
0064 spent an ADR removing from unmet needs: an incident type with a real
trigger and a real cost that attaches to nobody.** Charging the *target* (the
other participant) was never considered a live option: nothing in the score
says the second-worst flashpoint did anything, and issue #80 itself calls
charging a bystander a "design statement, not a detail."

**What this leaves open, honestly, and is not built here — see "What the
player must be told."** A player cannot see *why* the simulation picked one
of the two over the other, or that it picked one at all.

### 2. The sanction is a real, physically-enforced relocation, and it is what makes ADR 0064's grant move

**What it does.** `PrisonerOperationsRuntime.imposeSolitarySanction(entityId,
tick)` (`prisoner-operations-runtime.ts:368`) — called once, from
`IncidentResponseSystem`'s new `onAssaultAdjudicated` port
(`response-system.ts:170`, called at both terminal-transition sites,
`response-system.ts:501,681`), the moment an `'assault'` incident carrying an
`instigatorId` reaches either terminal state (`resolved` or `lapsed`) —
writes one field: `PrisonerRecordComponent.solitarySanctionEndTick[index] =
max(existing, tick) + sanctionPolicy.solitaryTermTicks`. A new system,
`SanctionSystem` (`src/simulation/prisoners/sanction-system.ts`, order 300,
scheduled every 5 ticks, registered by `PrisonerOperationsRuntime.registerOn`),
is the only thing that acts on it: while the term has not ended, it retries
`RoomInstanceRegistry.findBestAvailable('room.solitary-cell', …)` every
scheduled tick until the prisoner is physically moved (`release` from
wherever they were, `assign` into the solitary cell) — the identical
`findBestAvailable` question `IntakeSystem`'s `accommodation-assignment`
stage already asks, so a solitary cell that is full is a **backlog**, counted
(`relocationBacklogTicks`), not a silent failure. When the term ends, the
mirror operation runs: `firstAvailableAccommodationTarget` (extracted from
`IntakeSystem.resolveExistingTarget`, now shared,
`src/simulation/prisoners/intake-system.ts`) asks what the prisoner's
**current** classification group's accommodation policy says today, and
places them there — which is why a high-risk prisoner's "release" can
legitimately land them back in `room.solitary-cell`: that is what their
classification already says, sanction or not, and this system does not
special-case it.

**Why this, and not a bare relocation with no other effect.** A
`room.solitary-cell` instance carries the identical `object.bed` +
`object.toilet` requirement an ordinary `room.cell` does
(`src/content/room-catalog.ts`), so moving a prisoner's *bed* changes nothing
about which needs they can serve. The only thing that gives the mechanic
teeth is what a prisoner is *allowed to do with their day* — and that is
regime, not room. So the sanction also substitutes `HIGH_RISK_REGIME`
(`src/simulation/prisoners/regime.ts`) — the same schedule a tier-3
classification already imposes, reused rather than re-authored — for the
sanctioned prisoner's own timetable, through a new
`combineRegimeOverrides(first, second)` combinator: the caller's override (a
live riot, ADR 0057) is tried first, and this runtime's own sanction check
underneath it, so an open riot still wins over a standing sanction rather
than the two fighting over one prisoner's day.

**What it costs, measured, not asserted.**
`tests/integration/assault-sanction-loop.test.ts` drives a real prison (eight
prisoners, one guard, eight ordinary cells and one solitary cell, built
entirely from `AdmitPrisoner`/`HireStaff`/`ZoneRoom`/`PlaceObject` commands)
to a real, organic assault — this fixture's own first terminal assault opens
at tick 13,200, lapses at 13,810, names participants `[2, 7]` and instigator
`2`. Sampled at tick 10,000 (before the assault), entity 2's six needs were
all served and the state's grant for their place read `unmetNeedCount: 0`,
`stateIncomeForPrisonerDay: 300`. Sampled 500 ticks before the sanction's own
end tick (21,010 = 13,811 + 3 × 2,400), physically confined throughout:
`unmetNeedCount: 2` (`hygiene` and `recreation`, both starved by
`HIGH_RISK_REGIME` restricting the day to sleep/meal/hygiene for all but a
200-tick window), `stateIncomeForPrisonerDay: 220` — the state's grant for
this one occupied place down by 80 minor units a day, exactly `40 × 2`, for
exactly the reason ADR 0064 declared the schedule:
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` × the count.
`tests/unit/prisoners-sanction-system.test.ts` measures the same shape again
on a second, unrelated fixture (a fully served prisoner directly sanctioned,
not through an organic assault) and gets the same qualitative result:
`unmetNeedCount` rises, `stateIncomeForPrisonerDay` falls, from a served
baseline of 300.

**Nothing in `DEFAULT_SECTOR_RISK_POLICY`, `DEFAULT_ASSAULT_POLICY` or
`income.ts`'s own declared figures moved.** The grant impact is the existing
ADR 0064 mechanism reading a real change in the same needs it always read; no
weight, threshold or rate was retuned to produce it.

### 3. Confinement is physical, and that is the reason four pre-existing fixtures still pass unedited

This decision earns its own section rather than a caveat inside decision 2,
because it is the more interesting half of the design and the next person to
attach a consequence to an incident will hit the same wall.

`PrisonerOperationsRuntime.isServingSolitarySanction(entityId)` — the one
predicate the regime override reads — is true only when **both**
`solitarySanctionEndTick` is non-zero **and** the prisoner is currently
housed in a `room.solitary-cell` instance (checked through
`PrisonerColdState.getAccommodation` and `RoomInstanceRegistry.getById`). A
sanction whose prison never zoned `room.solitary-cell` is still *recorded* —
the field is written, and it will still lift on schedule — and it costs the
state **nothing**, because there is nowhere to physically carry it out: the
same honesty `SanctionSystem`'s own never-relocated-before-the-term-ends
branch already gives the mirror case, read here from the other side.

**This was discovered as a correctness bug, not designed in from the start,
and the discovery is the part worth recording.** An earlier version of this
branch applied `HIGH_RISK_REGIME` the instant a sanction was *recorded*, on
the reasoning that a `PrisonerRegimeOverrideResolver` may not read the clock
(true, and still true here) and that "sanctioned" was therefore "the flag is
non-zero." Running the full suite against that version broke four
pre-existing, heavily-measured, unrelated fixtures —
`tests/integration/riot-regime-loop.test.ts`,
`tests/integration/contended-canteen-meal-fallback.test.ts`,
`tests/integration/contended-canteen-substitution-cost.test.ts` and
`tests/integration/contended-shower-fairness.test.ts` — none of which builds
a `room.solitary-cell`, and all of which already produce assaults **today**,
on `main`, before this issue: verified directly by running each fixture's
prison against unmodified `origin/main` and reading `runtime.incidents.all()`
back — assaults have always fired in a two-prisoner chronically-neglected
cell block and in a twenty-four-prisoner canteen queue, silently, because an
assault had no consequence before this issue existed. The moment it gained
one, every fixture in this repository that happens to run long enough for an
unguarded or under-served population to produce a terminal assault started
applying that consequence too — including fixtures about canteen contention
and shower fairness that have nothing to do with sanctions and pin exact
per-tick action censuses.

**Gating the regime effect on physical confinement resolved all four,
unedited, because none of them ever builds a solitary cell to be confined
in.** This is not a coincidence bought by choosing convenient fixtures to fix:
it is the general answer. A sanction's behavioural cost is real exactly to
the degree a prison has built the capacity to carry it out, and a prison that
never zones `room.solitary-cell` cannot enforce solitary confinement any more
than a real institution without a segregation unit could — so it is correct,
not merely convenient, that the consequence is silent there. **The lesson for
the next person who attaches a new consequence to an incident**: if the
consequence needs a room, a role or any other capacity the player builds,
gate its *behavioural* effect on that capacity actually being present, not on
the record of the finding alone — a recorded-but-unenforceable consequence is
free to keep (it costs one field and answers nothing false), but an enforced
one that outruns the capacity to enforce it will retroactively change the
behaviour of every existing fixture that happens to trigger the underlying
incident, whether or not that fixture has anything to do with the new
mechanic.

Verified after the fix: `pnpm test`'s full suite passes with all four files
unedited (see Consequences).

### 4. The sanction expires, and the term is state that survives a reload

Issue #80 asks explicitly that a sanction expire, and names the implied
release path as work that does not exist. Both now do.

**One new field, and no others.**
`PrisonerRecordComponent.solitarySanctionEndTick` (a `Uint32Array`, the
nineteenth persisted per-prisoner array) is the *only* new persisted state
this consequence adds. Whether a sanctioned prisoner is *currently* relocated
is not stored — it is asked of `PrisonerColdState` and `RoomInstanceRegistry`
every time (decision 3), because a second flag for "currently confined"
would be a fact that could disagree with the room registry it is about.

**ADR 0038's rule decides the save-format question, and it is unambiguous
here.** A save written before this branch never carried
`solitarySanctionEndTick`; absence means exactly what every earlier build
already meant — "nobody has ever been sanctioned in this session" — which is
also the value a fresh `PrisonerRecordComponent` slot already holds by
construction. `EncodedPrisonerComponents.solitarySanctionEndTick` is optional
on decode (the same shape `intelligenceSequence` already uses,
`src/simulation/runtime/session-systems.ts`), the save schema's field is
`.optional()` (`src/persistence/save-schema.ts:379`), and
`decodePrisonerComponents` only `.set()`s it when present — leaving the
fresh, every-slot-zero default standing otherwise. **`SAVE_SCHEMA_VERSION`
stays at 5.** ADR 0038 §1's own rule is the reason, restated for this field
rather than assumed: the field is optional, absent already means what an
older build meant, and no existing field changes meaning or units. The same
reasoning gives `IncidentRecord.instigatorId` its own optional schema field
(`save-schema.ts:869`).

**Verified with a real save, not a snapshot-to-itself comparison.**
`tests/integration/assault-sanction-loop.test.ts`'s third case relocates a
real instigator into solitary, saves through `createSaveEnvelope` (Zod
validation, checksum) and `decodeSaveEnvelope` (re-validated as a bundle of
unknown provenance, round-tripped through `JSON.stringify`/`JSON.parse` the
way IndexedDB would), restores through `restoreSimulationRuntime`, and
asserts the restored session agrees about the sanction's own state — the
field, the physical accommodation and `isServingSolitarySanction` — then
keeps ticking it forward and watches the term lift at the same tick a
continuous session would.

### 5. No new named RNG stream

Issue #479 (every prison plays at `masterSeed` 0 today) and ADR 0038's
stream-merge rule were both read before deciding this, because a new stream
changes what a recorded command stream reproduces (ADR 0009) and interacts
with the save format in the way #415 had to fix once (merge onto the
runtime's own derived streams rather than replace them, ADR 0038 §2).

**The decision: none was needed, and none was added.** The sanction's term
(`SanctionPolicy.solitaryTermTicks`, defaulted to three in-game days —
`3 × DAY_LENGTH_TICKS`, a directional constant in the same standing
`DEFAULT_ASSAULT_POLICY` and `DEFAULT_INCIDENT_RESPONSE_POLICY` carry, not a
locked balance decision) is authored data, not a draw.
`imposeSolitarySanction` is a pure function of the current tick, the
existing end tick and that one constant — no `Xoshiro128StarStar`, no
`NamedRngStreams.get` call anywhere in `sanction-system.ts` or the new
methods on `PrisonerOperationsRuntime`. This was a deliberate design choice
rather than an oversight: a randomised term would have needed exactly the
#479/#415 interaction this issue's brief warned about, for no player-facing
benefit an authored constant does not already give.

### 6. The emergent loop this creates, measured rather than asserted in the abstract

`HIGH_RISK_REGIME` degrades exactly the two needs (`hygiene`, `recreation`)
that `scoreAssaultPressure`'s `needDeficit` term also reads. Measured on the
same fixture as decision 2: entity 2, released from their first sanction at
tick 21,011, is named the instigator of a **second** assault at tick 22,350 —
roughly half an in-game day later, before `hygiene` and `recreation` have
recovered — and it **extends** their existing sanction
(`max(existingEnd, tick) + solitaryTermTicks`, giving 30,160) rather than
starting a fresh one. `tests/integration/assault-sanction-loop.test.ts`'s
second case pins this, deliberately, as ADR 0061 decision 4 already did for
the escape-attempt producer's own feedback loop: *"a prison that riots and
brawls for ten in-game days manufactures its own escape risks out of
prisoners who arrived as nobody in particular."* This one manufactures its
own repeat offenders out of the sanction meant to correct them. It is not
asserted here as a defect — a real disciplinary-segregation regime plausibly
does exactly this to a person it degrades — but it is exactly the kind of
consequence "What would change my mind," below, asks the owner to weigh in
on.

## What the player must be told for this to be fair

**This ADR does not decide any of the three below, and must not — each is a
player-visible promise, which `AGENTS.md`'s fourth exclusion reserves to the
owner.** They are named as precisely as this document can manage, the way
ADR 0064's own equivalent section does for its subject, and none of the
three is built here.

1. **Which of the two participants was sanctioned, and why.** The incidents
   panel (ADR 0057 open question 1, widened by ADR 0061 open question 2 to
   assaults and escape attempts) still says nothing about who is involved in
   an incident at all. Adding `instigatorId` to the record makes this
   *answerable* for the first time — the data now exists — but nothing
   projects it. A player watching a prisoner vanish into solitary with no
   incident visible has no way to connect the two.
2. **That a prisoner is on a different timetable than their classification
   group says.** `src/ui/hud/regime-panel.ts` renders the regime *per
   classification group* (general-population / high-risk), driven by
   `PrisonerRecordComponent.classificationGroupIndex`. A sanctioned
   general-population prisoner runs `HIGH_RISK_REGIME` while their own record
   still reads `general-population` — so the panel is not wrong, it is
   answering a question that is no longer the only one that matters for this
   person's day. This is the same shape ADR 0032's own gap names for
   `prisonersHighRisk` never separating "arrived high-risk" from
   "reclassified for cause," widened by this branch to a third reason a
   prisoner's day might not match their label: sanctioned for cause,
   temporarily.
3. **That a sanction was recorded but could not be carried out.** Decision
   3's physical-confinement gate is correct and is also invisible: a prison
   with no `room.solitary-cell` pays nothing for an assault's instigator, and
   nothing on screen says a sanction exists, is pending, or expired unserved.
   A player who never builds a solitary cell is, in effect, told nothing
   about a consequence this ADR gives real teeth everywhere else.

Until at least (1) exists, the honest description of what shipped is the
same shape ADR 0064 used for its own mechanic: **a correct consequence with
an incomplete explanation.**

## What this branch verified was wrong, and corrected

`docs/PRISONER_OPERATIONS.md`'s classification-review section carried ADR
0032's own sentence almost verbatim: *"nothing relocates a prisoner...
Moving an already-placed prisoner does not exist in `src/` in either
direction."* Verified false as of this branch (both directions of the
operation now exist); corrected in place with a dated note rather than
deleted, per `docs/AGENT_WORKFLOW.md` §4's "mark both directions" rule. ADR
0032 itself is left untouched — it is a historical record of what was true
when it was written, and this ADR is the forward-pointing correction, the
same relationship ADR 0064 has to ADR 0043.

## Consequences

- **The consequence loop issue #80 opened closes for assaults specifically.**
  Riots and gang-retaliation still have no sanction of their own (gang
  retaliation still has no producer at all — ADR 0061 open question 5);
  escape attempts remove the prisoner from the prison entirely, which is
  already the largest consequence available and needs no sanction layered
  under it.
- **One new `IncidentRecord` field, a nineteenth persisted prisoner array,
  one new system, one new combinator — no new save version, no new RNG
  stream.** Full accounting is in decisions 4-5.
- **#477's protected numbers are unchanged, measured.**
  `tests/integration/room-gated-needs.test.ts` still reads 0.4824 (one guard,
  zero riots) and 0.7981 (no guards, three riots); `tests/integration/needs-state-grant-loop.test.ts`
  (ADR 0064's own fixture) is untouched. Neither fixture's population ever
  produces a terminal, adjudicated assault within its own tick budget on this
  branch's seed, so decision 3's gate was not what protected them — its
  absence would not have moved either number, and this is recorded rather
  than assumed.
- **Four other pre-existing fixtures were broken by an earlier, ungated
  version of this branch and pass unedited on the version this document
  describes** — decision 3 is the reason why, written as the reason for the
  design rather than as a test-repair note, because it is the part of this
  ADR most likely to matter again the next time an incident gains a
  consequence.

## Open questions

1. **Should the target ever get anything?** Today the other participant of
   an assault is untouched — no protection, no transfer, no record. Real
   practice sometimes separates both parties pending investigation; this
   ADR's own decision 1 argument (the data supports naming an instigator,
   not a victim) is also the argument against inventing a symmetric
   consequence for the other side.
2. **Should repeated re-sanctioning cap?** Decision 6's loop has no ceiling:
   `max(existingEnd, tick) + solitaryTermTicks` can in principle chain
   indefinitely for a prisoner whose needs never recover. Whether that is
   the intended shape or wants a cap is a balance question, not an
   architectural one, and #29/#28 already own balance figures of this kind.
3. **Should the sanction reach riots and gang-retaliation, not only
   assaults?** Both still credit disciplinary points symmetrically (ADR
   0032, unchanged) and neither has a ranked, single-culprit shape the way
   an assault does — a riot's participant list is "who was there." Extending
   the sanction to them would need the same adjudication command surface ADR
   0032 and ADR 0061 both deferred, not a data change.
4. **The three player-visibility items in the section above, all the
   owner's.** None is built here, by design.
5. **Everything ADR 0032 already left open, still open**: adjudication as a
   player decision or a staff-role task (with player override), tier names
   and bands, and whether a review should be visible before it happens. This
   ADR does not touch any of them.

## What would change my mind

- **A player finding the emergent re-sanctioning loop (decision 6) punishing
  rather than legible.** It was measured, not designed, and if the owner
  reads it as a trap rather than a consequence, a cooldown or a cap belongs
  in `SanctionPolicy` and is a small change.
- **The owner deciding physical-confinement gating (decision 3) is the
  wrong call**, and that a sanction should cost something even where a
  prison has built nowhere to enforce it. The alternative was tried (regime
  override keyed to the recorded field alone) and is fully described in
  decision 3, including the four fixtures it moved — reverting to it is a
  small, precisely-scoped change if that argument wins.
- **A second seed or a larger population showing the ADR 0064 grant impact
  (300 -> 220) does not hold up.** Measured once, on one seed, in two
  independently-built fixtures that agree qualitatively; a reader who finds
  a furnished, staffed prison where a sanctioned prisoner's grant does *not*
  fall should treat that as a real finding against this document.
