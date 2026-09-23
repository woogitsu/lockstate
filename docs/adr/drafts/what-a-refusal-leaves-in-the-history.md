# ADR draft: what a refusal leaves in the history

> **This draft has no number, on purpose.** ADR numbers are assigned centrally
> after drafts return (`AGENTS.md`). It agrees in advance to be renumbered, along
> with every citation of it the same branch adds. Each of those citations names
> this file by path for that reason, so
> `grep -rn "what-a-refusal-leaves-in-the-history" src/ docs/ tests/` finds all
> of them.

## Status

**Proposed. It is implemented on the branch that carries it.** That follows the
precedent of `what-a-second-tab-follows.md`: the owner has already ruled the
product question, and the behaviour is the answer to it.

**The ruling this implements is the owner's. The design below is not.** On
2026-09-23 the owner ruled that constitution article 6 covers refusals
(`AGENTS.md` ruling 26, the comment on
[#985](https://github.com/matmaxalez/lockstate/issues/985)). They chose the
option labelled *"Tak, odmowy do historii"* ("Yes, refusals into the
history"). That is the weaker provenance: an option label, not a sentence they
typed. What the label agreed to is two things:

- each refusal leaves a row in the message history instead of being lost when
  the next one replaces it;
- the band still shows only the current refusal, under ADR 0091's lifetime
  rules.

Ruling 26 also says that *"the design is owed against ADR 0084, ADR 0091 and
`docs/HUD_PROJECTIONS.md` gap 34 before the code is written"*. This document is
that design. **Its choices were made under the standing mandate and are not
self-approved.** The section *"Choices the owner may want the other way"* lists
the choices that were closest to even. For each it says what reversing it would
cost.

## Context

### What was lost, measured before this change

`docs/HUD_PROJECTIONS.md` gap 34's *"third half"* measured three reductions,
and each one loses a refusal:

1. `RefusalLog.record` **replaces**. After two refusals `count` is 2 and `last`
   holds only the second one. Nothing can reach the first.
2. The alerts list holds **exactly one refusal row**. `hudAlertsFromWorkerMessage`
   filters out the previous refusal row before it appends the new one.
3. **Eleven of twelve refusals from one wall drag never cross the worker
   boundary.** The publisher reads `refusals.last` once per wake. A burst decided
   inside one dispatch pass is therefore reduced to its last member before
   anything is posted.

On 2026-09-15 the owner ruled that article 6 does not reach a refusal, which
turned these three from a defect into a description. Ruling 26 reverses that
reading, so they are a defect again.

### Why a main-thread fix alone is not enough

Point 3 settles this. If the main thread simply stopped removing old refusal
rows, it would keep every refusal that *reaches it*. Most of a drag's refusals
never reach it. So the history has to start in the worker, where every `record`
call happens.

### The two channels, and why the event log is not where this goes

The obvious alternative is to record each refusal as a `SimulationEvent`. That
gives the history `SimulationEventLog`'s buffer, its save section and its
dismissal for free. It was considered and rejected, for three reasons. Each one
collides with a ruling that is already in force:

- **It would take the press away from every refusal row.** Every row
  `src/ui/simulation-events.ts` builds carries `occurrences`, and a row with
  `occurrences` can be dismissed. `hud.ts` makes dismissal and the
  press-to-place mutually exclusive: *"the dismissable row keeps its control
  and gives up the press"*. The owner ruled on 2026-09-22 that a refusal row
  carrying a tile is the press (ADR 0122, *"Naciskany wiersz, bez
  czasownika"*). A refusal that became an event row would lose it.
- **It would compete for the event list's eight rows.** `MAX_EVENT_ALERT_ROWS`
  evicts by `SEVERITY_EVICTION_ORDER` (ADR 0084 ruling 11). A twelve-edge drag
  over water would add twelve `'warning'` rows, and those would push every
  `'info'` row out of the log.
- **It would make refusal rows dismissable.** ADR 0084 decision 2 says in terms
  that *"the refusal and protocol-fault rows are not dismissable: gap 34 is
  untouched"*. Ruling 26 did not reopen that.

So a refusal stays on the channel it already uses, `simulation/status-counts`,
and the history is a second reading of `RefusalLog`, next to the one the band
already takes.

## Decision

### 1. `RefusalLog` keeps a bounded history beside the standing record

`RefusalLog` gains a history of the most recent refusals, oldest first, at most
`MAX_REFUSAL_HISTORY_RECORDS` (8) of them. Every `record` call appends to it.
When it is full, the oldest entry is dropped. `last`, `count`, `supersede`'s
withdrawal of the standing record and option F's `routeDecidedSince` mark all
work exactly as before. The band reads `last`, so nothing it shows changes.

**An entry is the record as it was decided.** It holds `sequence`, `tick`,
`reason` and `tile` where the domain has one. It never holds
`routeDecidedSince`: that mark is a fact about the band (ADR 0091 decision 2),
and the history is not the band.

### 2. A refusal withdrawn by #492 leaves the history too

`supersede(key)` removes every history entry filed under exactly that key, as
well as withdrawing the standing record. That is the #492 rule, and only the
#492 rule. A *different* success, a near miss on the same route, or a newer
refusal removes nothing.

**Why this is not what article 6 forbids.** Article 6's clause is *"Ostrzeżenia
nie znikają dlatego, że przyszło nowsze zdarzenie"* ("warnings do not disappear
because a newer event arrived"). A #492 withdrawal is not "a newer event". It
is the exact command that was refused, succeeding at the same target, so the
refusal is no longer true. Keeping the row would leave a sentence such as
*"The room was not zoned — this room type needs a finished wall or door along
every side, and yours has a gap."* under a room that has just been zoned. That
would break article 5, and the list's own empty state, *"No active alerts"*,
would be describing a list of resolved problems. This is also the rule the list
followed before the change, for the one row it held.

### 3. The history crosses on `simulation/status-counts`, as a level

The payload gains an optional `refusalHistory`: an array of `refusalSchema`
records, one to `MAX_REFUSAL_HISTORY_RECORDS` long. It is absent when the
history is empty. It is republished with every readout, as `refusal` is.

**Why this is honest on a snapshot channel.** `RefusalLog`'s own docblock
argues that a *queue* cannot be carried here: a reader cannot tell a drained
queue from one that was never sent, and a queue grows with the session. This is
not a queue. "The last eight refusals that still stand in the history are
these" is a true reading of the session at any tick, in the same way that "the
last refusal is X" is. It survives a publication that is late, repeated,
coalesced or dropped. It is fixed-width, so `docs/HUD_PROJECTIONS.md` contract 5
has nothing to page.

**The array reuses `refusalSchema` instead of declaring a narrower shape.** A
second object schema carrying `refusalSchema`'s keys minus `routeDecidedSince`
would make every documented three-member enumeration of `refusal` under
`docs/` ambiguous to
`tests/foundation/documented-wire-schema-membership-contract.test.ts`, which
resolves an enumeration by key set. (This paragraph names the keys in prose on
purpose, so that it is not itself one of the enumerations that contract
resolves.) The producer never sets
`routeDecidedSince` on an entry. Decision 1 says why, and the worker's
publication test pins it.

**The publisher opens its gate on a history change.** `RefusalLog` counts every
change to the history in `historyRevision`, and the worker compares that count
as it already compares `sequence`. Without it, a #492 withdrawal of an *older*
entry would move no ordinal and no count, and the list would keep a row the
worker had dropped until something else changed.

### 4. The list's refusal rows are the history, one row per entry

`hudAlertsFromWorkerMessage` builds one refusal row per history entry, keyed
`refusal-<sequence>` exactly as the single row was. Each row keeps its tile, so
each one is still the press ADR 0122 made it. None of them carries
`occurrences`, so none of them can be dismissed, which leaves gap 34's
dismissal half as it was.

**When a publisher carries `refusal` but no `refusalHistory`, the translator
treats the refusal as a history of one.** That is exactly what the payload
meant before this change. It keeps an older producer, or a test fixture, meaning
what it meant. The real worker always sends the history whenever it sends a
refusal, and `tests/unit/worker-status-counts.test.ts`
pins that. Without that test, a worker that stopped sending the history would
fall back to one row without anyone noticing.

### 5. What bounds it, and why eight

**Eight, the same as `MAX_EVENT_ALERT_ROWS`.** The event history keeps eight
rows in the same list, and a refusal history longer than that would make the
refusal family the list's largest. The refusal family has its own bound, as the
fault family is bounded by its twelve codes. So a refusal never evicts an event
row, and an event row never evicts a refusal.

**What the bound costs, stated rather than hidden.** A burst of more than eight
refusals keeps its newest eight. A twelve-edge drag over water keeps eight of
twelve rows. Before this change it kept one. That is a limit of the same kind the
event log's 64-record buffer and eight-row list already have. It is not the
replacement article 6 names: a refusal now leaves the history because eight
newer ones have been recorded, not because one newer one arrived.

### 6. Derived rows, in-session state, not saved

- **The rows are derived.** On the main thread they are a pure function of the
  latest payload. Nothing is remembered across messages except the non-refusal
  rows the function passes through.
- **The history is worker state, and it is deterministic.** It is written only
  from the command handler, at the tick the command executes. It is trimmed at
  the append and withdrawn in `supersede`, both on the same handler path. Two
  runs of the same commands therefore hold the same history.
  `docs/DETERMINISM.md`'s canonical-order rule is met by the array being in
  record order, which is `sequence` order.
- **It is not in the save, and `SAVE_SCHEMA_VERSION` does not move.**
  `RefusalLog` has never been snapshotted (`docs/HUD_PROJECTIONS.md` gap 33,
  `docs/PERSISTENCE.md`), and ruling 26 did not rule on the save. The reason
  gap 33 gives still holds for these rows. No gesture can dismiss one. A
  restored prison would therefore show up to eight notices about presses from
  a session that has ended, and only eight fresh refusals could remove them.
  The event log escaped that argument because ADR 0084 gave its rows a
  dismissal and a `restored: true` replay. Refusal rows have neither.

## Choices the owner may want the other way

1. **A #492 withdrawal removes the history row (decision 2).** The literal
   reading of *"each refusal leaves a row"* keeps it. Reversing this is one
   filter in `RefusalLog.supersede`. It would also need a way to mark a row as
   resolved, because the sentences are phrased as the present state of that
   tile.
2. **Not saved (decision 6).** Saving the history would be an optional
   `simulation.refusals` section and needs no version bump, on the same pricing
   ADR 0084 decision 3 used. What it needs first is a dismissal or a
   restored-row rule, for the reason decision 6 gives.
3. **No time and no count on a refusal row.** ADR 0084 decision 1 gave event
   rows both. On a refusal row either one would come with `occurrences`, and
   `occurrences` makes a row dismissable and takes the press away (Context).
   Separating those three properties is a HUD decision that this document does
   not make.

## Consequences

- No player-visible string is added or changed. Every row uses a
  `hud.alert.refusal.*` sentence that already ships.
- The band, its three lifetime rules (ADR 0091 decisions 1 and 2, and the
  2026-09-20 tick ceiling) and ADR 0091's 2026-09-23 one-route amendment are
  untouched.
- `docs/HUD_PROJECTIONS.md` gap 34's third half, and the "The refusal it also
  carries" section, are corrected in the same change.

## Weakest claim, named

**That eight is the right bound.** It is chosen to match the event list, and it
has not been measured against the rail. A refusal family of eight rows plus the
event family's eight could make the list's scroll container sixteen rows tall
where it was nine. The unit tests pin the row count. What the row count costs
the rail's vertical budget at 900×600 was not measured here. The browser specs
this change runs place at most two refusals.

**What would change my mind:** a measurement showing that a full refusal
history pushes a panel past its own fold (issue #985's own subject). The answer
then is a smaller constant, not a different design.
