# ADR 0084: What the alerts channel owes a player

> **0084 was assigned centrally**: `docs/adr/README.md`'s own **Next free
> number: 0084** line (`:240`, unchanged by this draft's own header note) and
> `max + 1` recomputed off disk (highest on disk is 0083, one file per number,
> `ls docs/adr/*.md`) agree. **The remote sweep was performed rather than
> asserted**, per this corpus's own standing practice
> ([ADR 0082](./0082-what-order-build-orders-are-carried-out-in.md)'s header,
> [ADR 0083](./0083-what-opens-the-negative-balance-and-what-bounds-it.md)):
> `git ls-remote --refs --heads origin` returned every head on the remote (383
> at the time this was run), and `git ls-tree -r --name-only <head> --
> docs/adr/` was read out of each one, grepped for a `0084-` or `0085-`
> filename. **Neither number appears on any remote head.** The one `adr/*`
> branch in the set, `adr/0082-build-order-execution-order`, holds 0082 and
> nothing above it — 0082 has since landed on `main`, so that branch is stale
> rather than in flight. No collision to report for 0084. The brief that
> commissioned this document names 0085 as already assigned to a different
> agent working elsewhere; that agent's branch was not visible to this sweep
> (nothing under `docs/adr/` names 0085 on any of the 383 heads), so either it
> has not pushed yet or it has not written the file yet. Resolving that, if it
> resolves to a collision, is the integrator's job per the brief, not this
> draft's.

## Status

**Accepted, 2026-09-01, by the repository owner — all four decisions, taken on
the day this was drafted.**

**This clause read `Proposed, 2026-09-01. Not self-approved.` until the owner
took the four decisions later the same day.** The paragraph that stood under it
is kept below, unedited, because it is an accurate description of what this
document *was* and of why it recommended no default for two of the four. What
had not happened was the signature, and it has now happened.

**What the owner decided, in the order the brief carrying the decisions put
them.** All four of this document's "Decisions for the owner" are taken, and
decision 1 was answered with **both** of the two units it offered rather than
one:

1. **A repeated sentence says how many times** — the `×3` case.
2. **A repeated sentence says when it happened** — a time on the row. The owner
   chose this *and* the count, so a row carries both.
3. **A player can dismiss a row.**
4. **The log survives a reload.**

**Decision 4 of this document — the dwell floor on `.hud__event` — is *not*
among them, and the numbering is the trap.** The four the owner took are this
document's decision 1 (answered in two halves, the count and the time),
decision 2 (dismissal) and decision 3 (the reload). The band's minimum dwell,
which this document numbers 4 and which came from
[#700](https://github.com/matmaxalez/lockstate/issues/700), is **still open**
and nothing in the implementing change touches the band's arbitration. It is
recorded here rather than left to be inferred, because "all four decisions were
taken" and "decision 4 was taken" are both sentences a later reader could
reasonably form from the same commit, and only the first is true.

**That last sentence stopped being true later the same day.** Decision 4 was
also taken on 2026-09-01, by a separate ruling put to the owner after this
document had already been accepted on the strength of the other three — see
**"Amendment, 2026-09-01: decision 4 is taken"** below in this document.
The paragraph above is kept rather than corrected in place, because it is an
accurate description of a real, if brief, state this document was in, and
because the trap it names — treating "3 of 4" and "4 of 4" as interchangeable —
is exactly the failure a silent edit here would risk reintroducing.

**Whether the count and the time are one change or two: they are one, and the
implementation says so in one field.** A count with no time leaves a row that
recurs sitting at the position its *first* arrival earned while a number grows
on it, with nothing to say the newest of them was a moment ago; a time with no
count answers "when" for a row whose whole problem is that the player cannot
tell how many there were. `HudAlertViewModel.occurrences` carries both, and
carries the two ordinals decision 2's dismissal needs, for the same reason: a
row has stopped being an arrival and become a **run** of them, and a run has a
size, a most-recent moment and two ends.

**What implementing them cost, recorded because this document priced them and a
price is checkable.** The four were built as one shape rather than four
bolt-ons, and two of this document's own claims did not survive contact:

- **The channel keeps publishing every occurrence and the collapse happens
  where the rows are built**, on the main thread, in
  `hudEventAlertsFromWorkerMessage`. Collapsing inside `SimulationEventLog`
  would have broken the band, which must still light for the third fight, and
  the publisher's watermark, which assumes ordinals only ever grow.
- **The persistence claim held.** No `SAVE_SCHEMA_VERSION` bump: `alerts` is an
  optional section on `simulation`, absent on every save written before the
  change, and absence means the empty log those saves restored to. Re-checked
  against [ADR 0038](./0038-what-makes-a-save-compatible.md) §1 and
  `docs/PERSISTENCE.md`'s "Adding an optional field without a version bump"
  rather than taken from this document.
- **The claim in "Investigated and rejected" that a collapse "would only ever
  fire for the four incident types" is false, and the counter-example was
  already in the suite.** Two contraband finds of the same category in one
  played prison are byte-identical apart from their ordinals and ticks —
  `tests/integration/contraband-search-duty.test.ts` measured two phones — so
  the rule fires there too. That is the *uniformity* this document asked for
  rather than a family being privileged: the rule asks every member the same
  question and the answers differ because the data differs.
- **The dismissal had to be a piece of simulation state, exactly as Finding 2
  predicted**, and not because a client-side suppression could not hide a row:
  because decision 3 puts the log in the save, and the save is
  `SessionRuntimeHost.capture()`'s alone. A dismissal only the main thread knew
  about would be undone by the next load, so decisions 2 and 3 could not have
  been built separately even if they had been taken separately.

**Acceptance closes none of the three open questions at the foot of this
document.** Two of them are answered *by the implementation* rather than by the
acceptance, and the answers are recorded there rather than here: the count is
exposed uniformly for every event type rather than for the four zero-payload
ones (`simulationEventIdentity`), and a dismissal names the arrivals a player
had read rather than the sentence, so the same fact recurring is a new row
counting from one (`SimulationEventLog.dismiss`). The third — whether a dwell
floor should reach `.hud__refusal` — is untouched, because the floor itself is
untaken.

**Every sentence a player reads here is the owner's own, all three of them.** The mechanism was built with the keys declared and the
catalog deliberately empty, so the suite failed by name until the words
existed -- `AGENTS.md`'s fourth exclusion held to rather than worked around.
What the owner then supplied, and what they chose it against, because the
alternatives are what a later pass would otherwise re-propose:

- **`hud.alert.occurrences` is `{count}×`** — the multiplier after the figure,
  over `×{count}` and over `{count} times`. The reason to prefer a short form
  at all is the column: the label in this list measures 88px (#720).
- **`hud.alert.time` is `Day {day}`** — the day alone. `Day {day}, {progress}%`
  was shown and rejected, on the grounds that a percentage of a day is a
  strange unit to put in front of a player. **`{progress}` is still produced
  and passed and is deliberately not rendered**, so a locale that has a use for
  it has it; and what tells two events on the same day apart is the count
  beside them, which is the owner's own answer to that gap rather than a
  property the sentence claims.
- **`hud.alert.dismiss` is `Clear this alert`** — the name of the `×` control,
  supplied last of the three. Chosen over "Dismiss this notice", and
  `hud.security.roster-dismiss` ("Dismiss") is not reused: that word ends a
  staff member's employment, one key meaning both that and "I have read this
  notice" is two answers to one question, and a second sentence built on the
  same verb would have left *dismiss* meaning two different things in one
  interface. The sentence avoids the verb instead of reusing it.

**And the owner ruled on the *shape* of the dismissal control on the same day,
against this implementation's first reading of it.** It was built as the whole
row, on `createListRow`'s own rule that *"a row is the tap target on a touch
screen"*; the owner overrode that for this row with the cost of the
alternative in front of them — a press writes a mark into the save and there is
no undo, so a mis-tap that cannot be reversed is worse than a smaller target.
The control is its own element, and **what that costs the sentence beside it was
recorded rather than absorbed**: the label falls from 88px to about 36px, which
is roughly five characters a line. The arithmetic and the three things that
could give are in `src/ui/hud/hud.css` above `.hud-alerts__list > .ui-row`, and
it was handed back as a finding rather than shrunk around.

**The owner answered that too, on the same day, and answered it a level up:
nothing in the row gives way and the rail widens.** The severity badge stays —
it is how ruling 11 reaches a player — the control stays on the row's line, and
the label keeps its subject; the corner is what moves, on **ADR 0085 decision
1**, which already recommends widening it for reasons of its own. This
measurement is a second and independent argument for the same change, and it is
left in three places (`hud.css`, `docs/HUD_PROJECTIONS.md` gap 34, and here) so
the pass that settles the corner's width does not have to re-derive it: the
label needs its 88px back *and* the 52px the control takes, so 226px is short by
about 52px before any other claim on that width is counted.

**Until it lands, this list is knowingly over-subscribed, which is a stated cost
rather than a defect to file.** A long sentence with a control beside it wraps
past the list's box at the present width; the list scrolls, so nothing is
clipped and nothing is unreachable, and what a player gets is a log they scroll
further through. Narrowing the control, dropping the badge or stacking the row
would each undo a decision the owner has taken.

The paragraph this clause replaced, kept:

> This document decides nothing. It states four questions the repository has
> already framed as decisions rather than details, prices each one in this
> codebase's own terms, and stops. `AGENTS.md`'s "Never self-approve an ADR"
> instruction in the brief that commissioned this draft is the general rule
> `docs/AGENT_WORKFLOW.md` already states for every ADR; this one additionally
> recommends **no** default for two of the four (1 and 2, both of which need new
> player-facing copy — `AGENTS.md`'s standing mandate's fourth exclusion, "a
> player-visible promise the code does not keep," reserves the sentence itself
> to the owner even once the mechanism is chosen) and a narrow, reversible
> default for the other two (3 and 4) where the cost is architectural rather
> than lexical, argued in each decision's own section.

## Context

### The surface, as it exists today, cited rather than summarized

The alerts channel is two bands and one list, all fed by pure translator
functions outside `src/ui/hud/` (`AGENTS.md` boundary 1 — the HUD may not
import `src/simulation/**`):

- **`.hud__refusal`** (`src/ui/hud/hud.ts:1298-1305`) — the most recent refusal,
  always laid out, never dismissed by a player gesture
  (`docs/HUD_PROJECTIONS.md` gap 34).
- **`.hud__event`** (`src/ui/hud/hud.ts:1265-1272`) — the most recent
  `simulation/event`. **Re-anchored 2026-09-06: "replaced unconditionally by
  whatever arrives next" is the pre-amendment behavior this section describes
  before the 2026-09-05 Amendment below reversed it** — `applyEventNotice`
  is no longer the ~26-line function this row quotes; it is a two-line
  delegate to a dwell/hold-ceiling state machine (`hud.ts:1468-1470`,
  `event-band-dwell.ts`) that the Amendment's §1 already marks and explains.
  This row is left as the historical record the Amendment points back to
  rather than rewritten a second time.
- **The alerts list** (`HudViewModel.alerts`, a flat `HudAlertViewModel[]`) —
  fed by three independent producers that share it without knowing about one
  another: `hudAlertsFromWorkerMessage` for refusals and protocol faults
  (`src/ui/simulation-alerts.ts:318-391`), `hudEventAlertsFromWorkerMessage`
  for domain events (`src/ui/simulation-events.ts:861-943`), and each keeps
  the others' rows untouched by filtering on an id prefix
  (`REFUSAL_ROW_PREFIX` / `FAULT_ROW_PREFIX`, `simulation-alerts.ts:191-192`;
  `EVENT_ROW_PREFIX`, `simulation-events.ts:638`).

Both issues under this ADR (#741, #700) are about the list and the event band
respectively; neither touches the refusal band, which has its own dismissal
story (ADR-adjacent gap 34, `RefusalLog.supersede`, #492) that this document
does not reopen.

### Finding 1 — identical rows, and why ruling 11 makes it worse rather than better

**Measured** (issue #741, quoting `docs/research/2026-09-01-playing-after-the-rulings.md`
§D10): by in-game day 7 the list held *"A fight has broken out between two
prisoners."* three times and *"The prison is under control again — no
incident is still open."* three times, interleaved, in an eight-row list, with
no tick, no in-game time and no `×3`.

This is not a capacity accident. The four incident-opening event types that
can repeat verbatim carry **no distinguishing payload at all** —
`gangRetaliationOpenedEventSchema` (`types.ts:2362-2367`),
`assaultOpenedEventSchema` (`types.ts:2369-2374`),
`escapeAttemptOpenedEventSchema` (`types.ts:2376-2381`) and
`incidentsAllClearEventSchema` (`types.ts:2490-2495`) are each `{ ...envelope,
type: literal }` and nothing else, and the schema's own comment says why:
*"No incident id, no sector id: the channel carries no identity"*
(`types.ts:2331-2334`). `incidents.escape-succeeded` is the one member of the
union that does carry a payload (`entityId`, an optional name,
`types.ts:2431-2444`) and is not part of this finding for exactly that
reason — a second escape names a different prisoner and reads differently.
Two occurrences of `incidents.assault-opened` are
therefore byte-identical on the wire, not merely similarly worded — there is
no field this layer is declining to show; there is no field to show.

`MAX_EVENT_ALERT_ROWS = 8` and the eviction rule are exactly where the owner's
ruling 11 (2026-08-31, #703) already changed the cap's behavior once, and the
docblock at `simulation-events.ts:640-767` is the fullest measured account of
why: the old evict-oldest rule let a discharge- and all-clear-heavy prison
evict an escape row after **67 seconds at ×1** in a 289-resident prison, so
`SEVERITY_EVICTION_ORDER` now evicts `info`
before `warning` before `danger`, oldest-within-band
(`simulation-events.ts:921-923`)  — **that constant left this file on 2026-09-01**
and is declared at `src/ui/hud/view-model.ts:466-470` beside `HudSeverity`, because
the event band arbitrates a dwell floor by the same map (decision 4's ruling,
*"one game, one ordering"*); `simulation-events.ts:12-19` records the move, which raised the same worst case to 23,390
ticks. **That fix is what #741 says makes repetition more likely, not less**:
the eight rows a player keeps are now the eight *most severe* standing, and a
prison in enough trouble to fill the cap with `danger` and `warning` rows is
also the prison in which the same handful of event types (fights, all-clears)
recur fastest — so the eight-row window increasingly holds several copies of
the same two or three sentences rather than a spread of different ones. Ruling
11 traded "which row survives" for "the survivors are more likely to repeat
each other," correctly, on the evidence it had; #741 is the cost of that trade
becoming visible in play.

### Finding 2 — no dismissal, in the module's own words

`src/ui/simulation-alerts.ts:235-242` — **that docblock now carries a marked
correction of its own beside the passage (`:244-252`), because the list's rows
can be dismissed since this ADR's decision 2; the bands still cannot**:

> Nothing clears a row: "the last refusal was X" stays true until another
> refusal replaces it or the session ends, and the same holds of a fault --
> "this session has seen an `invalid-message` fault" does not stop being
> true. This channel has no way to say "dismissed" -- that would be a
> main-to-worker message and a piece of simulation state to hold it, which is
> a decision rather than a detail, so it is recorded in
> `docs/HUD_PROJECTIONS.md` instead of guessed at here.

`src/ui/simulation-events.ts:785-812` makes the same claim for the event
family, on a different and stronger argument: a refusal is at least a fact
about a control (*"the build order failed" stops being the current answer
about that control*), so a *later* answer can retire it; an event has no
control and no current answer at all — *"two prisoners finished their
sentences at tick 40,000" does not become untrue"* — so the module states
**exactly two** reasons a row ever leaves: the cap, and `simulation/stopped`.
Both modules already name the missing piece precisely: a player gesture that
dismisses one row needs a main-to-worker message the protocol does not have,
and something on either side of the wire to hold "this one is acknowledged" —
a queued command shape, a session-scoped acknowledgement set, or a client-only
suppression list keyed by row id, each with a different answer to "does an
acknowledged row's *return* (the same fact recurring) need acknowledging
again?" That question is exactly what "a decision rather than a detail" means
here, and this document does not answer it either.

### Finding 3 — a reload empties the log, and the codebase already argued why on purpose

**Measured** (#741 quoting §D11): eight rows before a save, `["No active
alerts"]` after a real page navigation and *Load*, with the rest of the prison
restored counter for counter.

This is not an omission. `SimulationEventLog`'s own docblock
(`src/simulation/events/event-log.ts:97-109`) argues it at length — **that docblock now
keeps the passage as a quotation and opens with *"It was not snapshotted, and since
2026-09-01 it is"* (`:90`), which is this ADR's decision 3 having shipped**:

> It is not snapshotted... A restored session starts with an empty log, so it
> announces nothing that happened before the save. That is the honest reading
> rather than a loss: an event is a statement that something happened *now*,
> and a prison that announced last week's discharges on load would be telling
> the player about a tick that is not the one they are looking at. The
> *conditions* behind the events do persist and re-announce themselves --
> arrears are in the save (ADR 0049, "arrears are *history*"), so the next
> failed payday says so again...

`RefusalLog`'s own docblock (`src/simulation/refusals/refusal-log.ts:55-67`)
makes the identical case for the refusal row and prices it explicitly:

> It is not snapshotted... That is a decision, not an oversight, and not a
> difficulty either -- an optional field added to the bundle and to
> `save-schema.ts` needs no version bump, which is exactly how `simulation`
> and `identity` arrived. **What it would buy is the problem**: this holds a
> notice about an action the player took moments ago, not a condition of the
> prison, so restoring it means a loaded prison raising an alert about a wall
> somebody failed to place last week, with nothing on this channel able to
> dismiss it.

Both citations are recorded a third time, together, as `docs/HUD_PROJECTIONS.md`
gap 33 (`:1611-1632`) and under "What is deliberately excluded from the
payload" in `docs/PERSISTENCE.md` (`:617-663`), which states the save-format
cost plainly: **cheap, mechanically** — ADR 0038 §1's compatibility rule
(`docs/adr/0038-what-makes-a-save-compatible.md:176-188`) is *"absence is a
fact about the save's age and is honoured with the value the writing build
would have held"*, and an absent alerts section on an old save unambiguously
means "nothing to show," exactly the reading `docs/PERSISTENCE.md`'s "Adding
an optional field without a version bump" section (`:69-92`) already
generalizes from seven other additions, none of which bumped
`SAVE_SCHEMA_VERSION`. **So the reload finding does not cost a schema
version.** What it costs is the thing both docblocks name and price
separately from the schema: a persisted alerts list is a persisted claim about
*when* something is true, and every producer on this channel was built on the
opposite claim — that these rows say "now" and stop being trustworthy the
moment "now" has passed. Reversing that for the sake of D11 has to say what a
restored, stale "A fight has broken out between two prisoners" now means to a
player who was not there for the tick it happened on, and nothing in this
codebase has decided that a stale notice is preferable to none.

### Finding 4 — no dwell floor, and the mechanism is not a race

**Measured** (issue #700, this brief): a terminal outcome on `.hud__event`
stands only until the next event of any kind, about **6.3 s at ×1 and 1.6 s at
×4** in the largest prison driven for this pass. `applyEventNotice` was
unconditional, at the coordinate and in the shape this finding is about:

```ts
function applyEventNotice(notice: HudEventNoticeViewModel | undefined): void {
  eventNotice.hidden = notice === undefined;
  eventText.textContent = notice === undefined ? '' : t(notice.labelKey, resolveHudLabelParameters(t, notice));
  ...
}
```

**Re-anchored 2026-09-06: this is Finding 4's own diagnosis, kept as the
historical record of the defect the 2026-09-05 Amendment below fixed — the
function this fenced block quotes no longer exists in this shape**
(`applyEventNotice` is now the two-line delegate at `hud.ts:1468-1470`; the
dwell/hold-ceiling arbitration this finding says is missing is
`event-band-dwell.ts`'s subject). The comment that used to stand immediately
above it (previously `hud.ts:1053-1061`) said there was
deliberately no arbitration to add one to: *"No arbitration and no source
tracking, unlike `applySimulationRefusal` below: this band has exactly one
producer, so whatever it replaces is always an older event rather than a
sentence of another class."* That was true and sufficient until two events of
the *same* class could collide inside one tick, which #700's own investigation
(issue comment, 2026-08-31) found is exactly what happens for a lapsed escape
(**the quoted comment's `EventLog` is this repository's `SimulationEventLog`** —
`src/simulation/events/event-log.ts:201`, the method at `:825`, and
`src/ui/hud/hud.ts:1434` is the same citation spelled right. The quotation
below is left exactly as it was written, because a quotation of somebody
else's sentence is not ours to correct; there is no `EventLog`, and there
never was one):

> `EventLog.recordIncidentsAllClear`... is deliberately unguarded... it
> records [an all-clear] only on a terminal transition that leaves
> `IncidentLog.openIncidentCount` at zero. A lapse that lets a prisoner out is
> exactly such a terminal transition. So... `incidents.escape-succeeded` and
> `incidents.all-clear` are appended at the same `tick`, with consecutive
> `sequence` numbers, and the band renders the newer of the two... **What
> this rules out: any fix that assumes the escape is emitted before the
> all-clear and merely needs longer on screen. A dwell time on the `danger`
> band would work only if it also stopped the same-tick all-clear from
> replacing it, which is a decision about what the band does with two events
> in one tick — and that reaches every alert, not just this one.**

`simulation-events.ts:733-737` independently confirms the collision is bounded
rather than freak: a tick carries an opening or a closing and never both for
one sector, the measured maximum on one tick across 2,433 events is two, and
the escape row is therefore always the newer of its own tick — so any rule
that makes a `danger` row survive its own tick necessarily has to say what
happens when the *next* tick's row is a different kind again. A tick is 50 ms
(`src/simulation/clock/fixed-step-clock.ts:29`, `stepMilliseconds = 50`
default), which is the arithmetic behind the ×1/×4 figures above (126–128
ticks either way) and is cited here so the two numbers can be checked against
the code rather than taken on faith.

### What is common to all four

Each finding names a real player-facing gap, and each gap's own cure is
already argued, in this codebase, to be a decision rather than an
implementation detail:

1. A count or timestamp on a row is **new state on a list that is rebuilt on
   every publication** (`simulation-events.ts`'s translators return a fresh
   array every call; nothing here currently outlives one call) — and the
   digit or clock face itself is new player-facing copy, which is the
   owner's per `AGENTS.md`'s fourth exclusion regardless of what carries it.
2. A dismissal is **a main-to-worker message plus simulation state to hold
   it** — a new protocol surface, argued above and already flagged in two
   places in the tree.
3. Surviving a reload is **persistence for a channel built, twice, on the
   premise that it should not survive one** — cheap against `SAVE_SCHEMA_VERSION`
   (ADR 0038 §1), expensive against the meaning of "now" the channel's own
   docblocks argue for.
4. A dwell floor **changes what every alert does**, per #700's own comment:
   it cannot be scoped to the one collision that motivated it without a rule
   for every other collision the same mechanism can produce, and that rule
   trades every alert's immediacy for every other alert's visibility.

That is one question asked four ways: **is this channel a live notice — true
only of the instant it names, replaced without ceremony, gone on reload — or a
durable, countable, dismissable record?** Every current line of code answers
"a live notice." Every one of the four findings is a player wanting the other
answer at least once. The repository has never put that question to the
owner as one question; #741 files two of its four shapes together for
exactly this reason ("Why one issue and not a patch"), and this ADR is the
larger frame the third and fourth shapes belong in beside them.

## Investigated and rejected: collapsing identical rows at the projection

The brief commissioning this draft asked whether the D10 case — the same
rendered sentence occupying several of the eight slots — could be collapsed
inside `hudEventAlertsFromWorkerMessage` with no new state and no new copy:
when a new event's `labelKey` and resolved parameters exactly match a row
already in the list, retire that row and append the new occurrence in its
place, the same shape `hudAlertsFromWorkerMessage`'s refusal branch already
uses (filter the old copy out, append the new one at the end,
`simulation-alerts.ts:325-334`). It would need no new field, no new message,
and no new locale string — the sentence painted is one already authored.

**It is rejected, for reasons internal to the module rather than external
policy:**

- **It contradicts the exhaustive rule the module already states.**
  `simulation-events.ts:785-812` does not merely fail to mention a
  content-based retirement; it states there are **exactly two** reasons a row
  leaves — the cap, and `simulation/stopped` — and argues why an event
  specifically cannot be retired the way a refusal can (no control, no
  current answer, "does not become untrue"). Making three genuinely separate
  fights collapse into one row because their sentences happen to be
  identical is retiring a row for a reason the module's own argument says
  does not apply to this family, not for a reason it forgot to list.
- **It would make the list quieter without making it truer**, which is
  exactly the failure mode the brief warns against by name. Today three
  fights read as three identical rows; a player who cannot tell *when* they
  happened can still, crudely, count that there were three. Collapsing them
  to one row removes that count along with the confusion, and gives back
  nothing in its place — no `×3`, no timestamp, because either of those is
  decision 1, gated above. The player who currently sees three identical
  lines and (correctly) suspects three fights happened would see one line and
  have no way to suspect anything at all. That is a partial cure that makes
  the symptom quieter, not a fix.
- **It is not actually free of new state**, on inspection: "the same
  rendered sentence" is well-defined only for the four incident-opening
  events that carry zero payload fields (`types.ts:2362-2495`, Finding 1
  above). `prisoners.discharged` carries `count`, `economy.wages-unpaid`
  carries a sum, `incidents.riot-opened` carries `participantCount` — two
  occurrences of any of those are almost never byte-identical, so the
  collapse rule would only ever fire for the four incident types and leave
  discharges and paydays stacking as they do today. A player would then
  experience the list treating one class of event specially with no signal
  as to why, which is a second, unauthored thing for the list to say about
  itself — again touching decision 1's territory rather than avoiding it.

So the honest finding is: **nothing is implemented in code by this
change.** All four decisions gate the whole surface, including the one
candidate the brief floated as a possible exception; shipping the collapse
anyway would be exactly "a partial cure that makes the symptom quieter,"
which the brief asked not to ship.

## Decisions for the owner

None of the four below is decided by this document. Each is priced in this
codebase's own terms, with the cheapest technically-correct shape named where
one exists, and left there.

### Decision 1 — does a repeated sentence say how many times, or when?

**What it would take:** `HudAlertViewModel` gains one field (a `count` on the
row, or a `firstTick`/`lastTick` pair, or both), populated by extending
`eventAlertRow` (`simulation-events.ts:1043-1080`) to look up and increment a
match in `previous` instead of always appending, mirroring the shape already
used at `simulation-alerts.ts:325-334` for the refusal row. New state on a projection
that has never carried per-row history before; a rendered digit or clock
reading is new player-facing text regardless of which locale key holds it —
`AGENTS.md`'s fourth exclusion. **Not decided here**, including whether the
right unit is a count, an in-game time, or both, and whether it privileges the
four zero-payload incident types alone or every event type.

**Decided on 2026-09-01: both units, and every event type.** The owner took the
count and the time together, so a row carries `count`, and `lastAt` as a day
and a position within it — this game has no hour of the day to render
(`docs/HUD_PROJECTIONS.md` gap 5) and the day is what the status strip already
counts. The open question this section left about *which* types is answered
uniformly and by construction rather than by a rule per family:
`simulationEventIdentity` asks every member the same question — is this the
same statement, envelope aside — and the four zero-payload types simply answer
"yes" more often, because they have nothing to differ in. Two identical
contraband finds collapse on the same rule, which is measured rather than
argued (`tests/integration/contraband-search-duty.test.ts`).

### Decision 2 — can a player dismiss a row, and what does "dismissed" survive?

**What it would take:** a new command in the worker protocol
(`src/simulation/protocol/commands.ts`), a route that records "row N is
acknowledged" somewhere the events channel can read back — session-only
state, since the channel itself is unsnapshotted (Finding 3) — and an answer
to the question this draft raised above: if the *same fact* recurs (a fourth
fight after the third was dismissed), is that a new row or a return of the
dismissed one? `RefusalLog.supersede` (#492, gap 34) already answers a
narrower version of this for refusals — dismissal-by-success, not
dismissal-by-gesture — and is the nearest precedent rather than a template.
**Not decided here.**

**Decided on 2026-09-01: a player can dismiss a row, and a recurrence is a new
row.** The command is `DismissAlert`, carrying two ordinals — the arrival the
row began with and the newest one the player had seen — and
`SimulationEventLog.dismiss` resolves the run between them by the same identity
the list groups rows by. So what a dismissal retires is *the arrivals that were
read*, not the sentence: a fourth fight after the third was dismissed is a new
row counting from one, and an arrival that lands between the press and the tick
is above the far end and survives. The state is session state in the worker and
is snapshotted, which is not a free choice — see decision 3, and the Status
section on why the two could not have been built separately. **The refusal and
protocol-fault rows are not dismissable**: gap 34 is untouched.

**Not** answered here, and left open: whether "acknowledged" should differ from
"resolved" for the incident types that have a natural resolution event, which
is this document's third open question and is unchanged by the ruling.

### Decision 3 — does the log survive a reload?

**What it would take, priced rather than guessed:** technically small. ADR
0038 §1's rule and `docs/PERSISTENCE.md`'s seven-precedent pattern both say an
optional `alerts` section on the save, absent on every save written before
this change, needs **no `SAVE_SCHEMA_VERSION` bump** — absence would mean
exactly what a restored session gives today, "nothing to show," which is
unambiguous under the rule quoted in Finding 3. What is not small is what
persisting it commits to semantically: every current producer treats "now"
as the whole of what a row can honestly assert (`event-log.ts:97-109`,
`refusal-log.ts:55-67`, both quoted above, both independently reasoned), and
a restored row is a row about a tick the player was not looking at when it
happened. **A narrower, reversible option exists and is named here without
being adopted:** persist only the row *shape* the two docblocks already treat
as safe to re-announce — the ones ADR 0076's relocation notice and #703
ruling 13's contraband notice already handle by carrying the *outcome* in the
save rather than the notice (gap 33, `HUD_PROJECTIONS.md:1878-1946`) — rather
than the raw notice queue, which would require deciding what a stale `danger`
row is allowed to keep saying. **Not decided here**, including which of the
two shapes, or neither.

**Decided on 2026-09-01: the log survives a reload, in the raw-record shape
rather than the outcome-only one.** `simulation.alerts` carries the retained
buffer, the dismissals against it and the ordinal counter, and no
`SAVE_SCHEMA_VERSION` bump was needed — the pricing above held when it was
re-checked against ADR 0038 §1 rather than assumed. What answers the semantic
objection this section raised is not a new argument but a **separation of two
surfaces that had been treated as one**: a restored record is republished with
`restored: true`, which rebuilds the *log* the player scrolls back through and
is ignored by the *band*, so nothing announces a tick the player was not
looking at. The docblocks in `event-log.ts` and `refusal-log.ts` were right
about the band and are quoted rather than deleted where they are corrected.

**`RefusalLog` is unchanged and stays out of the save.** Its own docblock
prices carrying the refusal and refuses on what it would buy; no ruling touched
it, and the two logs stop being siblings in this one respect.

### Decision 4 — does a terminal outcome get a minimum dwell, and at whose expense?

**What it would take:** per #700's own comment (quoted above), a dwell floor
that actually closes the escape/all-clear collision has to say what the band
does when a *second* event arrives inside the floor — hold the first and drop
the second, queue the second behind the first, or promote by severity the
way the list's cap already does (`SEVERITY_EVICTION_ORDER`,
now `src/ui/hud/view-model.ts:466-470`) — and whichever answer is chosen slows down
*every* other event's arrival on the one band a player watches without
opening anything, which is the property #507 and #220 built that band to
have in the first place (`hud.ts:1308-1400`, re-anchored and now the larger
docblock the 2026-09-05 Amendment grew around the same rationale). This is
squarely the
"playability" territory the standing mandate would otherwise leave to an
agent's judgement, and this draft still declines it, on the brief's own
instruction that this decision be put to the owner alongside the other three
rather than resolved by ADR fiat — the four are one question, and answering
one quietly while gating the other three would understate how connected they
are. **Not decided here.**

**Still not decided, as of 2026-09-01.** The owner took the other three
decisions and this one was not among them; the band's arbitration is untouched
by the change that implements them, and `applyEventNotice` is still
unconditional. The one thing that change adds to the band is a rule about a
*restored* record — it announces none — which is deliberately not a dwell floor
and answers none of the question above: it says what the band does with a
record that did not just happen, not what it does with two that did.

**Decided, later the same day.** The two paragraphs above are kept, unedited,
as an accurate record of what was and was not true of this document until the
ruling arrived — see **"Amendment, 2026-09-01: decision 4 is taken"** below in
this document for the ruling itself, the reasoning behind it, and what
it does and does not settle.

## Consequences

- **Nothing in `src/` changes as a result of this document.** All four
  decisions gate the surface these findings are about, including the one
  candidate — collapsing identical rows at the projection — this draft was
  asked to check and found still gated, for reasons argued above rather than
  asserted.

  **That sentence was true of the document and stopped being true of the day.**
  The owner took three of the four decisions on 2026-09-01 and `src/` changed
  in consequence: the alerts list collapses repeats and counts them, a row
  carries the day it happened on, a press retires a row, a `DismissAlert`
  command and an `alerts` section on the save hold that, and a restored session
  republishes its log without announcing it. The sentence is kept because it
  records what this document itself did, which is still nothing — the change
  came from the ruling, not from the draft.
- **No `SAVE_SCHEMA_VERSION` bump is implied by any of the four**, should the
  owner take decisions 1 or 3: ADR 0038 §1's rule covers an optional `alerts`
  section the same way it already covers `masterSeed`, `placementSequence`
  and six other additions (`docs/PERSISTENCE.md:91-105`). This is recorded so
  a future implementer does not re-litigate the schema question the owner
  did not actually need to answer.
- **No player-visible copy is authored here.** Every sentence quoted above
  already exists in `src/content/default-locale-en.ts`; nothing new is
  proposed to say.
- **What is left open for a future implementer, per decision:** decision 1
  needs the shape of the new field and its sentence; decision 2 needs the
  protocol message and the recurrence rule; decision 3 needs the choice
  between the outcome-only shape and the raw-notice shape (or neither);
  decision 4 needs the collision rule for a second event inside the floor.
  None of the four blocks any other — the owner can rule on one, several, or
  none, in any order, and this document is written so that each ruling reads
  as a single answer rather than as unlocking a chain.

## Open questions

- Whether decision 4's dwell floor, if granted, should apply to the
  `.hud__refusal` band as well — that band has its own arbitration
  (`applySimulationRefusal`) and its own dismissal story (gap 34) and was
  deliberately out of scope for this draft, but a floor reasoned for one
  band and silent about the other would leave the question half-answered.
- Whether decision 1's count, if granted, should be exposed only for the
  four zero-payload incident types this draft found are the only ones that
  can render byte-identical twice, or uniformly for every event type for
  consistency's sake even where two occurrences already differ by a figure.
- Whether decision 2's dismissal, if granted, needs to distinguish
  "acknowledged" from "resolved" for the four incident-opening types that
  already have a natural resolution event (`incidents.all-clear`,
  `incidents.escape-succeeded`) — a fight a player dismissed and a fight
  that ended might be the same gesture from two different sources on the
  same row.
- ~~Whether decision 4's dwell floor, if granted, should apply to the
  `.hud__refusal` band as well~~ — decision 4 is granted (see the amendment
  below), and this question is **not** answered by that ruling. The owner was
  asked about `.hud__event` alone; nothing in the ruling or in the brief that
  carried it says anything about `applySimulationRefusal`, and extending the
  floor there is exactly the kind of architectural call `AGENTS.md`'s fourth
  exclusion reserves to the owner. So this stays open, now for a sharper
  reason than "out of scope for this draft": a second band has its own
  arbitration and its own dismissal story (gap 34), and nothing about *this*
  amendment's reasoning — the events list's `SEVERITY_EVICTION_ORDER` — carries
  over to it, because the refusal band's collisions are not decided by that
  ordering today. Struck through rather than deleted, so that a later reader
  can see the question was carried across the ruling rather than quietly
  dropped by it.
- **New, closed by construction rather than by ruling: does the floor need a
  rule for the restored-record case?** No. Decision 3 already settled that a
  restored record announces nothing to the band —
  `hudEventNoticeFromWorkerMessage` returns `undefined` (not a notice) for a
  `simulation/event` message whose payload carries `restored: true`
  (`src/ui/simulation-events.ts`, the "A restored record is not an
  announcement" docblock), and `undefined` there means "the view model is left
  exactly as it is," never a new value. `admitToEventBand` — the function
  decision 4's amendment below adds — only ever sees an `arriving` argument
  that the caller believes is a notice; a restored record never produces one,
  so it never reaches the floor's arbitration at all, favorable or not. The
  floor and decision 3's silence on reload therefore do not interact, and
  nothing had to be decided to make that true: it falls out of the two
  decisions being about different messages. (What *does* still reach
  `admitToEventBand` on a page that is restoring a session is the same
  `HudEventNoticeViewModel` value as before, repainted because some other
  field in the same worker message changed — `hud.ts`'s render pass calls
  `applyEventNotice(next.event)` on every message, restored or not. That case
  is not new either: it is caught by the ordinal guard `admitToEventBand`
  already needs for a busy live session, `arriving.sequence ===
  state.showing.sequence`, which repaints without restarting the floor.)

## Amendment, 2026-09-01: decision 4 is taken — a dwell floor on `.hud__event`, arbitrated by severity promotion

> **Accepted, 2026-09-01, by the repository owner.** This is a record of a
> decision the owner made, not a decision made here: nothing in this amendment
> is self-approved, and none of the reasoning below is offered as a substitute
> for the ruling — it exists to carry the ruling's *"one game, one ordering"*
> ("§2" below) into the one place in the tree that can enforce it.
>
> *This amends **Decision 4 alone**, the Status clause's account of which
> decisions were taken (the paragraph beginning "Decision 4 of this document —
> the dwell floor on `.hud__event` — is *not* among them"), and the first
> bullet of Open Questions. Decisions 1 through 3 are untouched, the second and
> third Open Questions bullets are untouched, and `Status` remains
> **Accepted**. The form is the "Amendment, 2026-09-01" sections above in this
> corpus's sibling ADRs, [0017's](./0017-money-primary-resource-model.md) and
> [0076's](./0076-what-happens-to-a-resident-whose-bed-is-taken-away.md): the
> old wording is quoted and pointed to rather than overwritten.*

### 1. The ruling, in the owner's words

The owner was asked, alongside the collision this document's Finding 4 and
decision 4 describe, whether `.hud__event` should get a minimum dwell and, if
so, what a second event arriving inside it should do. The answer, given as one
ruling covering both halves of the question:

> A terminal outcome does get a minimum dwell on `.hud__event`. When a second
> event arrives inside the floor, the more severe one wins the band
> immediately; an equal or less severe one waits.

### 2. The reason the owner gave, and why it is the whole of the collision rule

**The owner's own reason:** the alerts list already evicts by severity —
`SEVERITY_EVICTION_ORDER`, cited by the owner at
`simulation-events.ts:344-348`, its location in the tree the ruling was shown
against — so the band must not acquire a *second, different* arbitration rule.
**One game, one ordering.**

That sentence is the whole of decision 4's collision rule, and it is why this
amendment introduces no new comparison. Finding 4 posed three shapes for what
a second event does inside the floor — hold the first and drop the second,
queue the second behind the first, or promote by severity — and the owner did
not merely pick the third; the reason given rules out inventing any *fourth*
shape for a future collision this ruling did not anticipate, because the
reason is general (one ordering, not one outcome) rather than local to the
escape/all-clear pair that motivated it. That is also why `SEVERITY_EVICTION_ORDER`
moved rather than being reimplemented: a second copy of the same three numbers
would satisfy the letter of "promote by severity" while failing the reason
behind it, since two copies can drift and one drifting would be exactly the
second ordering the owner ruled out. It is now declared once, beside
`HudSeverity` in `src/ui/hud/view-model.ts`, and read by both
`src/ui/simulation-events.ts` (the list's cap, unchanged in behavior) and
`src/ui/hud/event-band-dwell.ts` (the band's floor, new).

### 3. What was built, and where

`src/ui/hud/event-band-dwell.ts` holds the decision as a pure function,
`admitToEventBand`, of the band's own held state and a caller-supplied clock
reading — no DOM, no timer, no simulation access. Its rule, in the order the
function takes it, is:

- No notice at all (the session ended) empties the band, including anything
  waiting.
- Nothing currently on the line: a first event is never delayed, at any
  severity.
- The same event repainted (recognised by `HudEventNoticeViewModel.sequence`,
  which cannot collide across a session boundary because `simulation/stopped`
  clears this state first): repainted, not treated as a new arrival, so a busy
  render loop cannot extend the floor by re-triggering it.
- The floor has lapsed: the newest event takes the line, exactly as before
  this change, releasing anything that was waiting first so an older sentence
  is never shown after a newer one.
- Inside the floor and **more severe**: takes the line immediately — the half
  of the ruling that keeps the band readable without a floor-induced lag on
  the event that most needs to be seen at once.
- Inside the floor and **equal or less severe**: waits in the one slot
  `EventBandDwellState.waiting` provides, arbitrated against whatever is
  already waiting by the same `SEVERITY_EVICTION_ORDER` comparison
  (`moreImportant`), and the band keeps showing what it was already showing.

`src/ui/hud/hud.ts`'s `applyEventNotice` calls `admitToEventBand`, paints what
the decision returns, and arms or clears the one `setTimeout` a waiting
sentence needs to release itself without depending on the next worker
message. `performance.now()` — monotonic, so a system clock change mid-session
cannot desynchronize the floor — is read in exactly one place, `hudNowMs()`,
and passed in; nothing in `event-band-dwell.ts` reads a clock itself, which is
what keeps this presentational rather than a second source of time (§5 below).

### 4. The floor's duration: 600 ms, and where the number comes from

**Not measured today, on this machine, under today's load — derived from two
bounds already in the tree, per the brief's own instruction that the number
must not rest on a latency reading taken while several agents share this
box.**

- **Lower bound — what this repository already calls "seen."**
  `tests/browser/ui-escape-sentence-survival.spec.ts` defines `SEEN_MS = 250`
  and documents it as *"what this file is willing to call 'a player could have
  read it.' Roughly fifteen frames at 60 Hz."* A floor shorter than that
  guarantees nothing a player would notice, so 600 ms — 2.4× `SEEN_MS`, about
  36 frames — clears it with room rather than by a hair.
- **Upper bound — the tick rate, and the spacing of real events at the
  fastest speed the game offers.** A tick is 50 ms
  (`src/simulation/clock/fixed-step-clock.ts`, `stepMilliseconds`), so ×4 —
  the speed #700's own playtest ran at — is 12.5 ms of wall clock per tick.
  Two prisons driven through the real kernel for this decision, every event's
  tick recorded rather than its wall-clock arrival timed:

  | prison | ticks run | events | shortest gap between distinct events | pairs under 600 ms at ×4 |
  | --- | --- | --- | --- | --- |
  | 48 cells, 120 admitted | 200,000 (83 in-game days) | 64 | 50 ticks | 0 of 63 |
  | 24 cells, 40 admitted | 90,000 (37 in-game days) | 54 | 10 ticks | 1 of 53 |

  The shortest gap in the larger run is 625 ms at ×4, and 600 ms is the
  largest round number under it. **One consecutive pair in 116 across both
  runs is delayed at all, and none at ×1.** That is the cost decision 4's own
  text warned a floor would impose on *every* event, priced rather than
  asserted, and it is a single-digit fraction of one percent.

  The one figure already in this document agrees: Finding 4 measured a
  terminal outcome standing *"about 6.3 s at ×1 and 1.6 s at ×4"* before the
  next event of any kind, and the 2026-08-31 playtest's shortest observed gap
  between two *different* band sentences was 70 ticks — 875 ms at ×4
  (`docs/research/2026-08-31-playing-the-nine-changes.md` §2e). Both clear 600
  ms.

**What 600 ms is not:** the time it takes to read the sentence. *"A riot has
broken out — {count} prisoners have stopped taking orders"* is not read by any
plausible player in 600 ms; reading is the alerts list's job, which is why
decisions 1 through 3 gave that list a count, a time and permanence across a
reload. The band's job, and the one this floor closes, is narrower: that a
player looking at it **sees the sentence exist** — exactly what the escape
sentence in #700 did not do, written three times and painted zero.

### 5. Determinism: presentational, checked rather than assumed

`EventBandDwellState` is declared, in its own docblock, as read by nothing in
`src/simulation/**`, published to no worker message, and absent from
`SessionRuntimeHost.capture()`. The wall-clock reading it is compared against
is a parameter (`now`) supplied by the caller on every call, never a value
`event-band-dwell.ts` reads for itself — `docs/DETERMINISM.md` and
[ADR 0020](./0020-deterministic-kernel.md) are the reason that separation is
load-bearing rather than tidy: a dwell floor that could reach simulation state
would be a determinism defect regardless of how the collision rule reads.
`tests/determinism/ambient-nondeterminism-contract.test.ts` is the existing
gate that keeps a wall-clock read from crossing into `src/simulation/**`, and
it passes unchanged by this amendment's implementation (§6 below), which is
the check rather than the assumption.

### 6. What was proven, and how

Two behaviors, each with a test added under `tests/`:

- **The escape/all-clear collision from Finding 4 no longer loses the first
  message.** Two events at the same tick, the second no more severe than the
  first (the escape/all-clear shape #700 found), and the band shows the first
  one rather than jumping straight to the second.
- **A more severe event still reaches the band with no added delay.** An event
  arriving inside another one's floor, strictly more severe by
  `SEVERITY_EVICTION_ORDER`, takes the line immediately rather than waiting
  for the floor to lapse.

Both are reported, with the exact test names, the confirmation that each goes
red on the code from before this amendment, the `tests/determinism` result,
and what a manual playthrough of an escape-then-all-clear sequence showed, in
the report handed over for the branch this amendment ships on
(`feat/0084-a-terminal-outcome-gets-its-moment`) rather than duplicated into
this document, which is a record of the decision and not of the branch's test
run.

### 7. What this amendment does not decide

- **Whether the floor reaches `.hud__refusal`.** Struck through rather than
  answered in the Open Questions entry above, for the reason given there: the
  owner was asked about `.hud__event`, and nothing in the ruling reaches the
  refusal band's own arbitration.
- **The restored-record case**, which the Open Questions entry above resolves
  — but by construction from decision 3's existing behavior, not by anything
  this ruling added. It is recorded there rather than here because it needed
  no ruling to close, and this section exists to be honest about which of the
  two nearby questions the owner actually answered.

## Amendment, 2026-09-05: the band lets go of its grid row — a hold ceiling above decision 4's floor

> **Accepted, 2026-09-05, by the repository owner.** Asked, in these terms,
> whether the reversal recorded below wanted a new ADR, an amendment here, or
> nothing, the owner ruled: **an amendment to this document.** As with the
> amendment above, nothing here is self-approved; the reasoning exists to carry
> the ruling into the one place that can enforce it, not to stand in for it.
>
> *This amends the **"Amendment, 2026-09-01"** section's §7 — "What this
> amendment does not decide" — by naming a third thing it did not decide and
> deciding it. Decision 4's floor is untouched and still binding, decisions 1
> through 3 are untouched, both live Open Questions bullets are untouched, and
> `Status` remains **Accepted**. Old wording is quoted and pointed to rather
> than overwritten, the form this corpus already uses.*
>
> **Two words were edited above, and this is the whole of it.** The Status
> clause and the Decisions section each pointed at the 2026-09-01 amendment as
> being *"at the foot of this document"*. Appending below it made that false,
> so both now read *"below in this document"*. No record was altered — a
> pointer that has stopped pointing is not a record of a past state, it is a
> broken cross-reference, and this document's own discipline about staleness is
> the reason to fix it rather than to leave it.

### 1. The sentence that was reversed is not in this document

It is in `src/ui/hud/hud.ts`, in the `.hud__event` docblock:

> *"It does **not** auto-dismiss, for the reason the refusal band does not: a
> message that clears itself on a timer is a race against how fast the player
> reads. It is replaced by the next event or emptied when the session ends, and
> it is in the log either way."*

That paragraph now stands in the file **in the past tense and marked as the
decision that was reversed** (`docs/AGENT_WORKFLOW.md` section 4), rather than
rewritten out. It was written before this document had anything to say about
the band's lifetime, and it is the only place in the tree that had.

### 2. The gap this document had, and it is worth naming rather than papering over

**This document reasons about the sentence throughout and never once about the
row the band occupies.** That is checkable and was checked: of the 64
occurrences of "row" in the 857 lines preceding this amendment, every one is a
row of the alerts *list* — `createListRow`, the 88px label, the tap target, the
eight-row cap, `SEVERITY_EVICTION_ORDER`. The strings `grid-area`, `hud__rail`
and `hud__side` do not appear at all.

So decision 4's amendment could set a **floor** — the shortest time a sentence
may hold the line — and list two things it did not decide, without the
**ceiling** being among them. Nobody had yet measured that holding the line
costs anything. It does:

| state, measured on the assembled page at 900×600 | `.hud__rail` | `.hud-rooms` body | `.hud-build` panel |
|---|---|---|---|
| no band | 482.8 | 291 | 336 (flush) |
| one event band | 450.8 | 267 | 312 in a 336 fold |

**32px off the rail and 24px off the panel in `.hud__side`, at every viewport**
(410→386 at 1280×800, 350→326 at 1280×720, 394→370 at 375×812). The bands are
three separate grid rows — `grid-template-areas: 'strip' 'unavailable' 'notice'
'event' 'middle' 'tabs'` — so their cost is **additive**: a refusal and an event
together take 64px, and the Rooms panel then clips on a prison with no rooms in
it. Before this amendment there was exactly one path in `event-band-dwell.ts`
to a released band, `simulation/stopped`; and above it `src/main.ts` republishes
`HudViewModel.event` on every snapshot, so a release would have been undone up
to twice a second anyway. **The band did not hold the row for a long time. It
held it for the session.**

### 3. The decision

The band releases its row after **`EVENT_BAND_HOLD_CEILING_MS`**, and the
number is derived rather than chosen. The longest sentence the band can carry is
`'hud.alert.event.economy.construction-refused'`, twelve words; at 100 words per
minute — half an ordinary silent reading rate, and the right half for a player
whose eyes are on the prison — that is 7.2s, plus the 250ms this repository
already calls seen (`SEEN_MS`) is 7.45s, and **8000 ms is the round number above
it**. The constant's own docblock in `src/ui/hud/event-band-dwell.ts` carries
the derivation, not this document.

Floor and ceiling are two bounds on one object and are enforced at one entry
point: `advanceEventBand` **releases a waiter before it expires an incumbent**,
so a sentence that has been waiting for the line is never dropped by the same
call that frees it. An ordinal guard (`EventBandDwellState.retired`) is what
makes the release survive `main.ts`'s sticky republication; a timer alone would
not have been enough, and that is a fact about this codebase rather than about
the ruling.

### 4. Why a reversal is admissible here at all, on this document's own terms

The reversed paragraph's last clause is the reason: *"it is in the log either
way"*. Decisions 1 through 3 are what made that clause load-bearing — the log
counts repeats, dates them, and survives a reload. And the 2026-09-01 amendment
already narrowed what the band is for: *"the band's job … is narrower: that a
player looking at it sees the sentence exist"*. **Reading is the list's job.**
A band that never lets go was buying a second reading surface with layout the
list did not need it to spend.

This is the whole of the argument, and it is offered as a record of why the
owner's ruling is coherent with decisions 1 to 3 — not as the ruling.

### 5. What it costs, and the owner ruled on the cost separately

Below 720px `.hud__corner` is `display: none` (`hud.css`, the
`@media (max-width: 720px)` block). **On a phone the alerts list is not on
screen, so the band is the only surface an event has**, and a phone player who
looks up more than eight seconds later now sees nothing where they used to see
the last event.

That was put to the owner on 2026-09-05 as a decision of its own, against two
alternatives — a **width-gated expiry** (no ceiling below 720px) and **unhiding
`.hud__corner` on phones**. **Ruling: leave it; the deferred mobile layout pass
is the repair.** Recorded here so that a later reader finds a decision rather
than an oversight.

One thing that reader will also find, and it predates this amendment rather
than being created by it: **`hud.css` contradicts itself about the phone three
times.** Three docblocks in that file state that `.hud__corner` *"is no longer
hidden below 720px"*, while the same file's `@media (max-width: 720px)` block
still carries `display: none` — and that rule's own comment records the removal
being **reverted** (#703 ruling 5, deferred to the mobile layout pass). **The
rule is what ships.** It is named here because §5's cost is only true while the
rule is what ships, and a reader who believed the docblocks would conclude this
section is wrong.

### 6. What this amendment does not decide

- **Whether the ceiling reaches `.hud__refusal` or `.hud__unavailable`.** It
  does not, and for the same reason §7 of the amendment above gives about the
  floor: the owner was asked about `.hud__event`. Both other bands keep their
  own lifetimes — a host refusal until the same action succeeds, a simulation
  refusal until another replaces it or the session ends — and nothing in this
  ruling reaches them.

  > **THE SECOND HALF OF THAT SENTENCE STOPPED BEING TRUE ON 2026-09-20, AND
  > THE FIRST HALF DID NOT.** It is kept rather than rewritten, per
  > `docs/AGENT_WORKFLOW.md` §4's rule that both directions are marked: the
  > paragraph above is the state this document described for fifteen days, and
  > a reader has to be able to see what it said before deciding whether the
  > amendment below is coherent with it.
  >
  > **What still holds.** *This* ceiling — `EVENT_BAND_HOLD_CEILING_MS`, 8,000
  > milliseconds of wall clock — still does not reach `.hud__refusal`, and is
  > untouched. So is `.hud__unavailable`, which has no tick to be counted from
  > at all: *"this browser cannot start a worker"* is a fact about the page,
  > not about anything the simulation decided. So is the host-refusal half of
  > `.hud__refusal`, cleared when that action later succeeds and likewise
  > never entered the simulation.
  >
  > **What moved.** *"A simulation refusal until another replaces it or the
  > session ends"* is no longer the whole of that band's lifetime. It now has
  > two further ways to end, both of them about the refusal ceasing to be the
  > thing the player is looking at rather than ceasing to be true: a decided
  > outcome of the same command route (ADR 0091 decision 2, option F, ruled
  > 2026-09-16), and — ruled by the owner on 2026-09-20 — **a count of
  > simulation ticks elapsed since the refusal, with nothing further having
  > happened.**
  >
  > **The unit is the whole of the second ruling and is why it is not simply
  > this ceiling extended.** The owner was asked whether the band should retire
  > when nothing further happens and chose, from four clickable options, the
  > one labelled *"Tak, ale liczony w tikach"* ("Yes, but counted in ticks").
  > A wall-clock ceiling would take the sentence down while the game is
  > **paused**, which is the one state in which a player is most likely reading
  > it and least likely to have caused anything that would replace it. Counted
  > in ticks, a paused prison never ages the sentence and a slow one ages it
  > slowly.
  >
  > **The provenance is the weaker of the two kinds this repository
  > distinguishes, and it is stated rather than left to be inferred.** The
  > owner did not type a sentence; they chose the label of an option the
  > session that then implemented it had written — the same provenance ADR 0091
  > records for option F and `CLAUDE.md` records for the 2026-09-08, -09 and
  > -10 releases inside reservation 3. What was agreed is the **rule and the
  > unit**. The number is not part of it: `REFUSAL_BAND_TICK_CEILING` is 300
  > ticks and is this repository's measurement, recorded in
  > `src/simulation/refusals/refusal-band-lifetime.ts` and changeable there
  > when the measurement moves.
  >
  > **What the ruling explicitly did not authorise**, because it was put to the
  > owner in those terms: a wall-clock ceiling on this band; any change to
  > `EVENT_BAND_HOLD_CEILING_MS`; and gap 34, the dismiss button this document
  > declined below, which stays the owner's and is not reopened here.
  >
  > **The cost was disclosed before the choice and is therefore authorised
  > rather than discovered.** This region now has a *second* lifetime
  > vocabulary — milliseconds for the events band, ticks for the refusal band —
  > in a place that already had three lifetimes. That is more to explain and
  > more to test, and the explaining is the deliverable rather than an optional
  > extra: it is why this block is long. `docs/adr/0091-what-clears-the-refusal-band.md`
  > carries the amendment in full. Note for anyone tempted to carry it across: **an ordinary
  refusal does not raise the events band at all.** *"A wall on an occupied
  tile"* raises `.hud__refusal` through `applySimulationRefusal`; only
  `economy.construction-refused` and `economy.deliveries-refused` are events.
- **Whether the mobile layout pass unhides `.hud__corner`.** §5 records that the
  owner deferred the phone cost to that pass; the pass's own content is not
  ruled on, here or anywhere.
- **Anything about the alerts list.** The cap, the ordering, the acknowledgement
  gesture and the dismissal story are exactly as decisions 1 to 3 left them.
