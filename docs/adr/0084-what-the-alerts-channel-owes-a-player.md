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

**Proposed, 2026-09-01. Not self-approved.**

This document decides nothing. It states four questions the repository has
already framed as decisions rather than details, prices each one in this
codebase's own terms, and stops. `AGENTS.md`'s "Never self-approve an ADR"
instruction in the brief that commissioned this draft is the general rule
`docs/AGENT_WORKFLOW.md` already states for every ADR; this one additionally
recommends **no** default for two of the four (1 and 2, both of which need new
player-facing copy — `AGENTS.md`'s standing mandate's fourth exclusion, "a
player-visible promise the code does not keep," reserves the sentence itself
to the owner even once the mechanism is chosen) and a narrow, reversible
default for the other two (3 and 4) where the cost is architectural rather
than lexical, argued in each decision's own section.

## Context

### The surface, as it exists today, cited rather than summarized

The alerts channel is two bands and one list, all fed by pure translator
functions outside `src/ui/hud/` (`AGENTS.md` boundary 1 — the HUD may not
import `src/simulation/**`):

- **`.hud__refusal`** (`src/ui/hud/hud.ts:978-985`) — the most recent refusal,
  always laid out, never dismissed by a player gesture
  (`docs/HUD_PROJECTIONS.md` gap 34).
- **`.hud__event`** (`src/ui/hud/hud.ts:1040-1067`) — the most recent
  `simulation/event`, replaced unconditionally by whatever arrives next
  (`applyEventNotice`, `hud.ts:1062-1067`, quoted below).
- **The alerts list** (`HudViewModel.alerts`, a flat `HudAlertViewModel[]`) —
  fed by three independent producers that share it without knowing about one
  another: `hudAlertsFromWorkerMessage` for refusals and protocol faults
  (`src/ui/simulation-alerts.ts:269-333`), `hudEventAlertsFromWorkerMessage`
  for domain events (`src/ui/simulation-events.ts:387-445`), and each keeps
  the others' rows untouched by filtering on an id prefix
  (`REFUSAL_ROW_PREFIX` / `FAULT_ROW_PREFIX`, `simulation-alerts.ts:183-184`;
  `EVENT_ROW_PREFIX`, `simulation-events.ts:205`).

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
`gangRetaliationOpenedEventSchema` (`types.ts:1701-1706`),
`assaultOpenedEventSchema` (`types.ts:1708-1713`),
`escapeAttemptOpenedEventSchema` (`types.ts:1715-1720`) and
`incidentsAllClearEventSchema` (`types.ts:1813-1818`) are each `{ ...envelope,
type: literal }` and nothing else, and the schema's own comment says why:
*"No incident id, no sector id: the channel carries no identity"*
(`types.ts:1670-1673`). `incidents.escape-succeeded` is the one member of the
union that does carry a payload (`entityId`, an optional name,
`types.ts:1770-1783`) and is not part of this finding for exactly that
reason — a second escape names a different prisoner and reads differently.
Two occurrences of `incidents.assault-opened` are
therefore byte-identical on the wire, not merely similarly worded — there is
no field this layer is declining to show; there is no field to show.

`MAX_EVENT_ALERT_ROWS = 8` and the eviction rule are exactly where the owner's
ruling 11 (2026-08-31, #703) already changed the cap's behavior once, and the
docblock at `simulation-events.ts:207-333` is the fullest measured account of
why: the old evict-oldest rule let a discharge- and all-clear-heavy prison
evict an escape row after **67 seconds at ×1** in a 289-resident prison, so
`SEVERITY_EVICTION_ORDER` (`simulation-events.ts:344-348`) now evicts `info`
before `warning` before `danger`, oldest-within-band
(`simulation-events.ts:435-441`), which raised the same worst case to 23,390
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

`src/ui/simulation-alerts.ts:227-234`:

> Nothing clears a row: "the last refusal was X" stays true until another
> refusal replaces it or the session ends, and the same holds of a fault --
> "this session has seen an `invalid-message` fault" does not stop being
> true. This channel has no way to say "dismissed" -- that would be a
> main-to-worker message and a piece of simulation state to hold it, which is
> a decision rather than a detail, so it is recorded in
> `docs/HUD_PROJECTIONS.md` instead of guessed at here.

`src/ui/simulation-events.ts:365-382` makes the same claim for the event
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
(`src/simulation/events/event-log.ts:70-84`) argues it at length:

> It is not snapshotted... A restored session starts with an empty log, so it
> announces nothing that happened before the save. That is the honest reading
> rather than a loss: an event is a statement that something happened *now*,
> and a prison that announced last week's discharges on load would be telling
> the player about a tick that is not the one they are looking at. The
> *conditions* behind the events do persist and re-announce themselves --
> arrears are in the save (ADR 0049, "arrears are *history*"), so the next
> failed payday says so again...

`RefusalLog`'s own docblock (`src/simulation/refusals/refusal-log.ts:52-65`)
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
×4** in the largest prison driven for this pass. `applyEventNotice`
(`src/ui/hud/hud.ts:1062-1067`) is unconditional:

```ts
function applyEventNotice(notice: HudEventNoticeViewModel | undefined): void {
  eventNotice.hidden = notice === undefined;
  eventText.textContent = notice === undefined ? '' : t(notice.labelKey, resolveHudLabelParameters(t, notice));
  ...
}
```

and the comment immediately above it (`hud.ts:1053-1061`) says there is
deliberately no arbitration to add one to: *"No arbitration and no source
tracking, unlike `applySimulationRefusal` below: this band has exactly one
producer, so whatever it replaces is always an older event rather than a
sentence of another class."* That was true and sufficient until two events of
the *same* class could collide inside one tick, which #700's own investigation
(issue comment, 2026-08-31) found is exactly what happens for a lapsed escape:

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

`simulation-events.ts:297-304` independently confirms the collision is bounded
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
`simulation-alerts.ts:276-290`). It would need no new field, no new message,
and no new locale string — the sentence painted is one already authored.

**It is rejected, for reasons internal to the module rather than external
policy:**

- **It contradicts the exhaustive rule the module already states.**
  `simulation-events.ts:372-382` does not merely fail to mention a
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
  events that carry zero payload fields (`types.ts:1701-1818`, Finding 1
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
`eventAlertRow` (`simulation-events.ts:496-511`) to look up and increment a
match in `previous` instead of always appending, mirroring the shape already
used at `simulation-alerts.ts:276-290` for the refusal row. New state on a projection
that has never carried per-row history before; a rendered digit or clock
reading is new player-facing text regardless of which locale key holds it —
`AGENTS.md`'s fourth exclusion. **Not decided here**, including whether the
right unit is a count, an in-game time, or both, and whether it privileges the
four zero-payload incident types alone or every event type.

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

### Decision 3 — does the log survive a reload?

**What it would take, priced rather than guessed:** technically small. ADR
0038 §1's rule and `docs/PERSISTENCE.md`'s seven-precedent pattern both say an
optional `alerts` section on the save, absent on every save written before
this change, needs **no `SAVE_SCHEMA_VERSION` bump** — absence would mean
exactly what a restored session gives today, "nothing to show," which is
unambiguous under the rule quoted in Finding 3. What is not small is what
persisting it commits to semantically: every current producer treats "now"
as the whole of what a row can honestly assert (`event-log.ts:70-84`,
`refusal-log.ts:52-65`, both quoted above, both independently reasoned), and
a restored row is a row about a tick the player was not looking at when it
happened. **A narrower, reversible option exists and is named here without
being adopted:** persist only the row *shape* the two docblocks already treat
as safe to re-announce — the ones ADR 0076's relocation notice and #703
ruling 13's contraband notice already handle by carrying the *outcome* in the
save rather than the notice (gap 33, `HUD_PROJECTIONS.md:1611-1632`) — rather
than the raw notice queue, which would require deciding what a stale `danger`
row is allowed to keep saying. **Not decided here**, including which of the
two shapes, or neither.

### Decision 4 — does a terminal outcome get a minimum dwell, and at whose expense?

**What it would take:** per #700's own comment (quoted above), a dwell floor
that actually closes the escape/all-clear collision has to say what the band
does when a *second* event arrives inside the floor — hold the first and drop
the second, queue the second behind the first, or promote by severity the
way the list's cap already does (`SEVERITY_EVICTION_ORDER`,
`simulation-events.ts:344-348`) — and whichever answer is chosen slows down
*every* other event's arrival on the one band a player watches without
opening anything, which is the property #507 and #220 built that band to
have in the first place (`hud.ts:987-1019`). This is squarely the
"playability" territory the standing mandate would otherwise leave to an
agent's judgement, and this draft still declines it, on the brief's own
instruction that this decision be put to the owner alongside the other three
rather than resolved by ADR fiat — the four are one question, and answering
one quietly while gating the other three would understate how connected they
are. **Not decided here.**

## Consequences

- **Nothing in `src/` changes as a result of this document.** All four
  decisions gate the surface these findings are about, including the one
  candidate — collapsing identical rows at the projection — this draft was
  asked to check and found still gated, for reasons argued above rather than
  asserted.
- **No `SAVE_SCHEMA_VERSION` bump is implied by any of the four**, should the
  owner take decisions 1 or 3: ADR 0038 §1's rule covers an optional `alerts`
  section the same way it already covers `masterSeed`, `placementSequence`
  and five other additions (`docs/PERSISTENCE.md:69-92`). This is recorded so
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
