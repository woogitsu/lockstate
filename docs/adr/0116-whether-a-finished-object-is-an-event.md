# ADR 0116: Whether a finished object is an event, and what the log can afford to say about one

> **The number was swept rather than trusted.** `docs/adr/README.md`'s own
> *Next free number* line read **0116** before this row landed, and the sweep
> agrees: from this worktree at `584f5ca1` (v0.0.622), after
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`,
> `git ls-remote --refs --heads origin` returns **353 heads**, every one read
> with `git ls-tree --name-only <head> docs/adr/` and the four-digit prefixes
> collected. The highest on any head is **0115**; nothing at 0116 or above
> appears anywhere. **0095 remains held and still not on disk**, unchanged by
> this row.
>
> The number is provisional on the terms every ADR since 0080 has set for
> itself: a collision with an ADR landing from a branch cut after this sweep
> renames this file, its index row and every citation together.

## Status

**Accepted, 2026-09-16, by the repository owner: option 2 — a
construction-completion event, graded `'info'`, routed `'log-only'`.** It
reaches the alerts list and never the band, and it is counted rather than
repeated, so twenty-four finished walls are **one row carrying a count of 24**.
**Nothing under `src/` implements it, and the ruling does not by itself change
that** — it settles which rule is right, not that it is built.

*The paragraph replaced here read "**Proposed, 2026-09-15. Not self-approved,
and it implements nothing.** No file under `src/` is changed by the pass that
wrote this document, and none is proposed to change until the owner rules." The
first half is still true and the last clause is what just stopped being true; it
is quoted rather than deleted, because every argument below was written from a
position this document no longer holds.*

**The provenance is the weaker of the two kinds this repository distinguishes,
and it is recorded here rather than left to be inferred.** The owner did not
type a sentence. They were shown four options in a clickable question an agent
session had written, priced by the dossier below, and chose the one labelled:

> Opcja 2 — jeden zliczany wiersz (zalecane, słabo)

("Option 2 — one counted row (recommended, weakly).") That is the same
provenance `CLAUDE.md` flags for the 2026-09-08, -09 and -10 releases inside
reservation 3, and it is weaker than a quoted instruction in exactly one way
that matters here: **the option's own label is the whole of what was agreed.**

**The label says *weakly* because the recommendation is weak, and the owner was
shown why before they chose it.** The dossier's D11 records what did not survive
being measured, and it is recorded here rather than left in a section a reader
may not reach:

- **The constitutional case does not reach a finished wall.** The owner's own
  ruling of 2026-09-15 on `docs/HUD_PROJECTIONS.md` gap 34 partitions
  *ostrzeżenia* into a condition of the prison and the decline of a press, and a
  finished wall is neither; article 6's heading is *Problem prowadzi do
  działania*, and a finished wall is not a problem and has no next step (D9).
  What is left of §3's case is one clause about history standing on its own,
  unsupported by the article around it.
- **The price is wrong by between five and fifteen times.** §5 and the
  Consequences below say *"roughly 40 lines across four files"*. Measured
  against the three commits that have actually added event members to this tree,
  one member cost **635 insertions across 13 files** (`20aa619e`), two cost
  1,288 across 15 (`659a388b`) and three cost 738 across 13 (`eea81acb`) (D7).
- **The save cost is neither bounded nor dull, and no payload shape avoids it.**
  Twenty-four completions occupy **37.5 % of the 64-record persisted buffer**
  and evict **10 records** of a 50-record history — identically for options 2, 3
  and 4, because the counted row is a HUD-side reading and `SimulationEventLog`
  appends every record (D6). No section of this document above the dossier
  prices that at all.

**And the ruling was made over a named counter-argument rather than in the
absence of one.** D11 says in terms that *"if the buffer cost is the one that
matters to the owner, option 1 gets stronger than §6 allows"*, and declines to
argue the owner out of it. They were shown that and chose option 2 anyway. It is
kept here rather than retired with the question, because a ruling recorded
against a live objection is a stronger record than one that reads as unanimous —
and because it is the argument anyone re-opening this will reach for first.

**What is NOT agreed is any of the implementation the dossier prices under this
rule, and the payload's shape before anything else.** The rule is that a
completion is an event, log-only, counted. The "one counted row" figure behind
it was obtained by running the shipped reducer against a **proxy** member —
`economy.construction-restored` for the envelope-only shape and `rooms.zoned`
for the one-identifier shapes — because no completion member exists; what is
proxied is the type string and nothing else (D4, D12). **A completion schema
carrying a field neither proxy has** — a count, a tick-derived figure, anything
that varies between two completions of the same buildable — **would invalidate
the one-row result**, at which point the ruling's own headline figure is a
result about a payload nobody has agreed to. The cheapest settlement is to build
option 2 behind this ruling and re-run D4's four shapes against the real member.

**This ruling authors no player-visible sentence, and option 2 does not author
one by itself.** §6's *"What this document deliberately does not decide"* stands
word for word: the sentence a completion row would carry is still unwritten, and
`AGENTS.md`'s fourth reservation governs its truth rather than its wording. What
the ruling settles about the surface is only *where* such a statement may go —
the alerts list, never the band — which is what the `'log-only'` routing means.

**The three declined options, and what declining each costs.** Option 1 is the
only one that costs the persisted log nothing, and D11 is explicit that it gets
stronger, not weaker, under measurement. Option 3 is the only one whose sentence
could name *what* finished; declining it means the row can say how many things
finished and not what, which §6 names as option 2's own weakness. Option 4 was
rejected in this document rather than offered neutrally, on §4d's 625 ms
cadence — which D3 has since re-measured at 750 ms against the 600 ms dwell
floor, leaving 150 ms of margin where §4d had 25.

**This document is otherwise left in the tense it was written in**, per
`docs/AGENT_WORKFLOW.md` §4: §6 still recommends, the dossier still recommends,
and the ruling is marked beside them rather than written over them. A
recommendation silently rewritten into a ruling destroys the evidence of what
the ruling chose between.

**The three paragraphs below are the proposal's own, kept because they are
what the owner ruled on.**

**This document authors no player-visible string**, and it is careful about
why rather than merely compliant: the sentence a completion event would carry
is a sentence whose truth depends on a mechanism that does not exist yet. §6
names the truth conditions instead, in the shape ADR 0114 §4 uses. *Still true
after the ruling, and the ruling does not license one: see the paragraph above
about `AGENTS.md`'s fourth reservation.*

**Its provenance is the weakest kind this corpus records, and it is weaker
still than the clickable-option rulings `AGENTS.md` discloses from 2026-09-08
onward: there is no ruling behind it at all.** What commissioned it is an
agent brief, written against
[issue #960](https://github.com/woogitsu/lockstate/issues/960) and against
stage 4 of the identity rollout ([#1160](https://github.com/woogitsu/lockstate/issues/1160)),
asking for research first and an ADR after. Nothing here has been put to the
owner. The brief's own instruction was that concluding *no ADR is needed* is a
perfectly good outcome; §1 and §2 below are the part of this document that
takes that instruction seriously, and they refute the finding that
commissioned it in two places before §3 argues anything. *Two of its sentences
stopped being true on 2026-09-16 and are marked rather than cut — "there is no
ruling behind it at all" and "nothing here has been put to the owner". What
replaced them is a clickable-option ruling, which is the very provenance class
this paragraph measures itself against, not a stronger one; the clause about §1
and §2 is unaffected.*

**It deliberately leaves the implementation unbuilt even though §5 prices it
at a few dozen lines.** [ADR 0115](./0115-where-the-prisoner-roster-lives-and-what-the-manage-rail-can-afford.md)
was proposed and not built two days ago for the same reason and that is the
precedent followed here: a player-visible change made in anticipation of a
ruling spends something that may have to be spent back. *The ruling does not
change this either: the implementation is still unbuilt, and D7 has since
priced "a few dozen lines" at 635.*

## 1. The finding that commissioned this, checked rather than repeated — and it has aged

Issue #960's title claims **"twenty event types and not one reports something
going right"**, and its §2 lists the twenty it counted at v0.0.465. **The
surface was 27 members when this section was written and is 28 at
`460ef077`** (`SIMULATION_EVENT_TYPES`,
`src/simulation/protocol/types.ts:2070-2099`; the correction under the table
below names the member that moved it, and it is this document's own),
and #960's own §6 names the one thing that would refute it: *"A shipped event
type that reports a success which the census missed — the census is a read of
one `as const` tuple, so this is falsifiable by opening `types.ts`."*

Opening it refutes it. The seven members added since #960's census are:

| Member | Landed | What it reports |
| --- | --- | --- |
| `rooms.zoned` | `20aa619e`, 2026-09-04T21:20:07Z (#966) | a designation succeeded |
| `construction.undo-refused-newer-action` | `f8c420e3`, 2026-09-09 (ADR 0104, #956) | a refusal that cost nothing |
| `rooms.needs-cleared` | `659a388b`, 2026-09-10T15:22:59Z (#1006) | a room's needs were met |
| `rooms.unzoned` | `659a388b`, 2026-09-10T15:22:59Z (#1006) | a removal the player asked for |
| `economy.construction-restored` | `eea81acb`, 2026-09-11T14:44:49Z (#966) | the queue can be funded again |
| `economy.deliveries-restored` | `eea81acb`, 2026-09-11T14:44:49Z (#966) | purchases are possible again |
| `prisoners.housed` | `eea81acb`, 2026-09-11T14:44:49Z (#966) | an arrival got a bed |

> **Correction, bound to `78cd9d2a` rather than to "today".** The bolded
> sentence above this table read *"**The surface is 27 members today**
> (`src/simulation/protocol/types.ts`, lines 1769-1797)"*. Its count and its
> coordinate went stale for two unrelated reasons, so they are corrected below
> as two things rather than one.
>
> *(The dead coordinate is quoted with its number outside the backticks,
> because a quotation of a dead anchor is still an anchor as far as
> `tests/foundation/documentation-anchor-quotation-contract.test.ts` is
> concerned, and quoting it whole would re-register it as a live one — measured
> here, not assumed: it put the document back to 20 unverified anchors.)*
>
> **The count: 27 → 28, and the eighth member is this ADR's own ruling built.**
> `78cd9d2a` (2026-09-17T15:25:33Z, [#1284](https://github.com/woogitsu/lockstate/pull/1284))
> added `construction.order-completed` — option 2 of §6, graded `'info'` and
> routed `'log-only'`, exactly as the Status block above records. It is
> therefore **not** an eighth row of the table above, whose subject is the
> members added between #960's census and the writing of this section; it
> arrived after, and it arrived because of this document. The read is
> reproducible: `SIMULATION_EVENT_TYPES` opens at
> `src/simulation/protocol/types.ts:2070` and closes `] as const;` at `:2002`,
> 28 string members between them, at `460ef077`.
>
> **The gap is not a census that missed something.** #960's §6 names the
> falsifier as *"opening `types.ts`"*, and opening it is still what settles the
> number — what changed is that §7's proposal stopped being a proposal. A
> reader who finds 29 here should look for a ninth member and a ninth reason,
> not assume this sentence rotted again.
>
> **The coordinate: `:1769-1797` → `:1973-2002`.** D1 below already caught this
> once and re-aimed it to `:1864-1892`, which was right at `ca82e946` and is
> wrong at `460ef077`; the tuple's opening line has moved 1864 → 1973 over nine
> commits to that file, five of them not merges. Every anchor into the tuple in
> this document now quotes `SIMULATION_EVENT_TYPES` beside the number, because
> the symbol moves with the code and the number does not.

**Five of the seven are unambiguously good news**, and every one of them is
graded `'info'` in `EVENT_PRESENTATION` (`src/ui/simulation-events.ts:530-606`)
with the comment at `:524-529` saying so in as many words: *"`'info'` because
it is good news, exactly as `rooms.zoned` and `incidents.all-clear` are."*

**The claim was refuted the same evening it was filed, by two and a half
hours.** #960 was opened at 2026-09-04T18:48:44Z. `20aa619e` — whose subject
line is *"a designated room says so, which is the first thing this game
acknowledges (#966)"* — merged at 2026-09-04T21:20:07Z.

**So #960's headline is history and should be read as such. What survives it
is narrower and is still true**: nothing on this channel reports a *build*
finishing, which is the one thing a player does most and watches most closely.
That narrower claim is what §2 onward is about, and it is worth keeping
separate from the headline, because the wide version invites a wide fix and
the wide fix is the one §4 prices as unaffordable.

## 2. What ADR 0087 decides, and which side this falls on — most of the question is already answered

[ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md) decision 1,
recommended without reservation and costing nothing to adopt, is that **the
kind is a property of the reason, not of the producer or the command**: a
*"your press failed"* fact is an event, a *"the prison is in a state"* fact is
a condition. The test it applies is not invented there either — it quotes
`SimulationEventLog`'s own docblock, which this pass re-read at
`src/simulation/events/event-log.ts:62-65`:

> "Two prisoners finished their sentences" is true once, at a tick; there is
> no current value of it to republish, and re-asserting it twice a second
> would tell the player it had happened again.

**A finished object passes that test with nothing left over.** *This wall
finished* is true at exactly one tick (`src/simulation/construction/system.ts:1746`,
the one `setState(order, 'completed')` in the tree), has no current value, and
would be a lie if republished on a cadence. There is no standing-condition
reading of it to weigh against that, because **the standing residue is already
carried, on the two channels ADR 0087's own taxonomy assigns it to**:

- **the world** — `finalizeConstruction` writes the geometry and
  `markDrawnWorldChanged()` fires on the same line
  (`src/simulation/construction/system.ts:1747`, `:1757`), which is
  [ADR 0099](./0099-how-the-renderer-learns-the-world-changed.md) decision 3's
  second bullet and is why *"a buildable whose finalisation writes no layer
  would otherwise finish invisibly"* is a sentence in that comment rather than
  a defect;
- **the read model** — `PENDING_BUILD_ORDER_STATES`
  (`src/simulation/presentation/construction-projection.ts:87-93`) excludes
  `'completed'` and only `'completed'`, so the row leaves the queue at the same
  tick, deliberately: *"A queue that listed standing walls would be a
  demolition list wearing a queue's label"* (`:83-84`).

**So ADR 0087 settles the question this ADR was commissioned to ask, and the
answer is: an event, unambiguously.** The brief's hypothesis that a finished
object might be *"a transition rather than a standing condition, which is
exactly the distinction that ADR needs to answer"* is right about the
distinction and right about which side this lands on — and 0087 already
answers it.

### What 0087 does not settle, and it is a different question

0087's vocabulary tells you what *kind* of thing a finished object is. It says
nothing about **whether this particular occurrence is worth publishing, and on
which of the channel's two surfaces** — and that second question did not exist
when 0087 was written. `EVENT_PRESENTATION.surfaces`
(`src/ui/simulation-events.ts:464-474`) was added on 2026-09-05, four days
later, by the owner's ruling on #966 site 2, and its docblock is explicit that
the routing *"is now a decision somebody has to take per member"*.

Three members have since been routed `'log-only'`, each by a ruling, and the
reason given for the two most recent (`src/ui/simulation-events.ts:613-617`,
#1006 findings 3 and 5) is the reason that would apply here almost word for
word:

> a player who just fixed or removed a room already knows they did, so the
> confirmation belongs in the historical record beside "{room} designated."
> rather than interrupting the band

**That is the whole of what is open**, and it is why this document exists
rather than being a one-paragraph note saying 0087 covers it. It is also why
the question is genuinely the owner's: the `surfaces` column's three existing
values were each set by a ruling, not by an agent reading the precedent and
extending it.

## 3. The absence is real, and it is the only one of article 3's six states that has it

Stage 4's audit ([#1160](https://github.com/woogitsu/lockstate/issues/1160))
measured constitution article 3's six build states as five distinguishable and
one absent. Article 3's sentence, read verbatim at
`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/konstytucja.md:23` and never
edited there:

> Odróżniaj: wskazanie, podgląd, przyjęte zlecenie, realizację, gotowy obiekt
> i odmowę.

*Distinguish: pointing, preview, accepted order, execution, finished object
and refusal.*

**The word is `odróżniaj` — distinguish — and on that word the finished object
is not absent at all.** §2's two bullets are exactly what makes it
distinguishable: the ghost becomes the finished thing on screen and the row
leaves the queue, both at tick `t`. A player looking at the world or at the
build queue can tell a finished wall from a building one, and article 3 asks
for nothing more than that.

**What is absent is the announcement, and the honest statement of the gap is
narrower than "article 3 is unmet".** The right frame is article 6's
*"Historia zdarzeń pozostaje dostępna"* — the event history stays available —
read against a log in which a session's entire build programme leaves no
trace. A player scrolling the alerts column back through an hour of play can
see every room they designated, every prisoner housed, every payday missed,
and not one of the forty walls they built.

That is a real gap and it is worth saying plainly. It is not the gap #1160
recorded, and this document records the difference rather than inheriting the
stronger reading.

## 4. What it would cost — and the noise number, which is the load-bearing one

### 4a. Determinism: nothing

The completion site is inside `ConstructionSystem.update`, which the kernel
dispatches on the schedule the system declares
(`src/simulation/construction/system.ts:347`, `intervalTicks: 10`,
`phaseTicks: 0`; `src/simulation/kernel/kernel.ts:202` is the dispatch). So:

- **`tick` is in hand** — it is the tick being executed, never a clock reading.
  `docs/DETERMINISM.md:12` reserves wall-clock to `FixedStepClock`'s pacing and
  nothing here reads it.
- **`sequence` is the log's own monotonic counter** (`this._sequence + 1`, the
  shape every `record*` method uses, e.g.
  `src/simulation/events/event-log.ts:798-799`), not an ordering the command
  queue has to supply. `(executeAtTick, sequence)` in `docs/DETERMINISM.md:33-36`
  governs *commands*; a completion is not a command and enters no queue.
- **No RNG stream is needed**, named or otherwise, so
  `docs/DETERMINISM.md:52`'s "adding a named stream is not a save-format
  change" never comes into it — there is no stream to add.
- **Ordering between two completions on one tick is already total.**
  `orderedOrders()` walks `(placementSequence ?? -1, id)` —
  `compareBuildOrderExecution`, ADR 0082 decisions 1 and 2 — so two orders
  finishing in one pass record in that order on every client.

**The determinism cost is zero and it is zero for a structural reason, not by
luck:** the event would be appended from inside a tick, by a system, off state
the tick already holds.

### 4b. Save format: zero version bump, one bounded forward-compatibility cost

`SAVE_SCHEMA_VERSION` is `6` (`src/persistence/save-schema.ts:38`) and does not
move. `alertsSectionSchema` (`:624-630`) stores `records:
z.array(simulationEventSchema).max(MAX_BUFFERED_SIMULATION_EVENTS)` — **the
protocol's own union, not a copy** (`:613-617` argues why), so a new member is
carried with no edit to the persistence layer at all.

The cost that is real and should be named rather than discovered: a save
written by a build that has this member, read by a build that does not, fails
the discriminated union and is refused as `invalid-shape`. That is the same
cost `masterSeed` and the alerts section itself already record
(`src/persistence/save-schema.ts:608-611`), and the corpus has accepted it
twice; it is listed here so a third acceptance is deliberate.

### 4c. Projection vocabulary: no new projection, and one gap that decides the payload

No `PROJECTION_IDS` entry is needed. `simulation/event` is an existing route
with an existing producer, an existing reader and an existing painter.

**What the payload can be is constrained by a gap the repository already
records.** `construction-projection.ts:53-59` states it:

> **No label.** `definitionId` is a stable content id and travels out
> unchanged; what a buildable is *called* is the composition root's answer
> (`buildableLabelKey` in `src/main.ts`), because the buildable registry carries
> a hard-coded English `name` and no `nameKey` at all
> (`docs/HUD_PROJECTIONS.md` gap 32).

So an event that names *what* finished carries `definitionId`, a stable content
id — never `BuildableDefinition.name`, which is English text and which ADR 0011
forbids on a projection outright. That is the same discipline `rooms.zoned`'s
`roomNameKey: identifierSchema` (`src/simulation/protocol/types.ts:2443`) is
under, and `types.ts:1012-1014` already says so: *"A key is not text: ADR 0011 keeps
translated text off the wire, and the HUD still resolves this one."*

**And it has a cost `rooms.zoned` does not pay**: resolving `definitionId` to a
sentence needs `buildableLabelKey`, which lives in `src/main.ts` — unreachable
from `pnpm test`, because `vitest.config.ts` sets `environment: 'node'`. ADR
0087's own cost table (decision 4's row) names this trap already: such a
decision *"must be extracted into a pure function the way `judgeAffordability`
and `orderPrisonsForDisplay` were, or it is untestable by construction."*

### 4d. Noise: measured, and it is the number that should decide this

#960's framing is that *"a prison finishing forty walls should not produce
forty lines a player must dismiss."* That framing is right about the concern
and wrong about the arithmetic in both directions, and both corrections matter.

**It cannot be forty at once.** The crew is one and is serialised:
`crewBusy` is read once before the walk (`src/simulation/construction/system.ts:1611`)
and set by the first order to start (`:1727-1728`), so **at most one order is
`'in-progress'` at any tick**, and therefore **at most one order can complete
per scheduled tick**. A burst is impossible by construction — the same property
`src/ui/simulation-events.ts:643-654` relies on for every other producer on
this channel.

**It is worse than forty at once in the way that actually matters, which is
duration.** Working the constants:

| Quantity | Value | Source |
| --- | --- | --- |
| tick | 50 ms | `src/simulation/clock/fixed-step-clock.ts:29` (`stepMilliseconds = 50`) |
| construction pass | every 10 ticks | `src/simulation/construction/system.ts:347` |
| progress per pass | `+10` | `src/simulation/construction/system.ts:1742` |
| `wall-brick` work | `50` | `src/simulation/construction/definition.ts:88` |
| speeds | 1, 2, 4 | `src/simulation/clock/fixed-step-clock.ts:17` |

A wall is 5 passes = 50 ticks = **2.5 s at x1, 0.625 s at x4**. So a
forty-wall queue is a **sustained stream of one event every 2.5 s for 100
seconds** at x1, and one every 0.625 s for 25 seconds at x4. That is not a
burst; it is a faucet left on.

Against the two surfaces:

- **The band.** Its dwell floor is **600 ms** with severity promotion
  (`src/ui/hud/event-band-dwell.ts`, the owner's ruling on ADR 0084 decision 4,
  described at `src/ui/simulation-events.ts:345-346`). **At x4, 625 ms between
  completions clears that floor by 25 ms**, so a player building continuously
  at x4 would hold the band with completion lines for the whole programme. An
  `'info'` line cannot displace a dwelling `'warning'` or `'danger'` — the
  promotion is one-way — but it can hold the band against every other `'info'`,
  and it makes the band a progress meter, which is not what it is.

  **And 625 ms is not a number this document introduces.** The floor's own
  docblock says it was *"derived against a measured 625 ms shortest real gap
  at x4"* (`src/ui/simulation-events.ts:345-347`), which is the same figure
  the four constants above produce for a wall. That is not a coincidence —
  both are a 50-tick span at 12.5 ms a tick — and it cuts two ways. It means
  the arbitration the owner ruled for was designed against exactly this
  cadence, so nothing here is outside what it anticipated; and it means a
  completion stream sits **25 ms above** the floor rather than comfortably
  inside it, so the floor coalesces none of it.
- **The log.** `MAX_EVENT_ALERT_ROWS` is 8, evicting least-severe-first
  (`src/ui/simulation-events.ts:903-918`, the owner's ruling 11 of
  2026-08-31). A completion at `'info'` is in the first class evicted — which
  protects warnings, and is exactly what article 6's *"Ostrzeżenia nie znikają
  dlatego, że przyszło nowsze zdarzenie"* requires — but it means forty
  completions evict **each other and every other `'info'` row**, including the
  player's own `rooms.zoned` and `prisoners.housed` confirmations, forty times
  over.
- **And the save.** `MAX_BUFFERED_SIMULATION_EVENTS` is 64
  (`src/simulation/events/event-log.ts:33`) and the alerts section is bounded
  by the same constant. A sixty-four-wall programme flushes the entire
  persisted history.

**The mechanism that fixes all three already exists and is the reason this is
affordable.** `simulationEventIdentity` (`src/simulation/protocol/event-identity.ts:49-52`)
drops `sequence` and `tick` and canonicalises the rest, and the alerts list
groups rows by it into `HudAlertOccurrencesViewModel`. The consequence is
stated at `src/ui/simulation-events.ts:448-451`:

> with the payload being the room type alone (see the schema), a run of
> designations of *one* type does not spend rows at all —
> `simulationEventIdentity` collapses it into a single counted row.

So **the payload is the noise decision**, and this is the sharpest finding in
this document:

| Payload | Rows a forty-wall programme spends |
| --- | --- |
| envelope only | **1**, counted 40 |
| `definitionId` | **1 per distinct buildable**, bounded by `BUILDABLE_REGISTRY` |
| an order id, a location, a progress figure | **40**, and the list churns twice over |

The third row is the shape #960 feared, and nothing in this repository would
push anyone toward it — but it is the shape a well-meaning "make it useful"
amendment reaches for, so it is priced here.

## 5. Who would consume it — and the `AWAITING_PRODUCER` shape cannot occur here

The brief asks whether this would be an event nothing reads. **It structurally
cannot be**, and the reason is a compile-time gate rather than a contract test:
`EVENT_PRESENTATION` is a `Record` over the closed `SimulationEventType` union
(`src/ui/simulation-events.ts:458-477`), and its docblock states the property
at `:27-31` — *"an event type added to the protocol fails to compile here until
somebody has decided what it says to a player, how serious it is, and which
surfaces it reaches."*

Adding a 28th member turns the following red until each is answered, which is
the list an implementer should expect rather than discover:

| Gate | Where | What it demands |
| --- | --- | --- |
| `EVENT_PRESENTATION` | `src/ui/simulation-events.ts:477` | a label key, a severity, a surface — compile error, not a test failure |
| locale catalogue | `src/content/default-locale-en.ts` | the `hud.alert.event.*` key must resolve, in every shipped catalogue |
| `tests/unit/ui-simulation-events.test.ts:183` | exhaustive over `SIMULATION_EVENT_TYPES` | every member renders a row |
| `tests/unit/ui-simulation-events.test.ts:349-351` | its own hand-written `LOG_ONLY` set | **a new member routed `'log-only'` fails until this set is edited** |
| `tests/unit/simulation-message-keys.test.ts:164` | the `SIMULATION_EVENT_TYPES` declaration entry | the derived-key exemption must be re-argued |

The fourth row is worth naming precisely because it looks like an obstacle and
is the opposite: the test states the ruling in its own words rather than
reading it off the code under test (`:338-345`), so adding a member to
`LOG_ONLY` is a one-line edit that **someone has to mean**. It is the closest
thing in this repository to a place where a routing decision gets a signature.

**Who reads it in the end**: `hudEventAlertsFromWorkerMessage` (the log) and
`hudEventNoticeFromWorkerMessage` (the band), the same two readings of one
message every other member already reaches.

## 6. The decision, as options, with the recommendation

> **RULED 2026-09-16: OPTION 2, and everything below is left in the tense it
> was written in.** The owner chose option 2 from a clickable question — the
> label was *"Opcja 2 — jeden zliczany wiersz (zalecane, słabo)"*, "one counted
> row (recommended, weakly)" — so the recommendation below is still a
> recommendation and this note is the ruling beside it, per
> `docs/AGENT_WORKFLOW.md` §4's rule about marking both directions rather than
> overwriting. A recommendation rewritten into a ruling destroys the evidence
> of what the ruling chose between, and what it chose between is these four
> options as written, re-priced under **D10** and weakened under **D9**, **D6**
> and **D7**.
>
> **What was ruled is the rule and not the implementation**: a completion is an
> event, `'info'`, `'log-only'`, counted rather than repeated. The payload shape
> below is *not* settled — the one-counted-row figure rests on a proxy member
> (D4, D12). The `## Status` block carries the ruling in full, including the
> counter-argument the owner was shown and ruled against.

### Option 1 — do nothing

Free. §1's correction stands, §2 says the kind is settled, §3 says article 3's
*distinguish* is met. What remains unmet is article 6's history for the one
activity a player does most. **This is a genuinely defensible option** and it
is the one the owner should be able to choose without the document arguing them
out of it.

### Option 2 — publish `construction.order-completed`, envelope only, `'info'`, `'log-only'` (recommended)

One counted row per programme, never on the band, never displacing anything.
Follows the #1006 precedent verbatim: a player who ordered a wall and watched
it build already knows, so the confirmation belongs in the record.

Its weakness is that the counted row can only say *how many things finished*,
not *what*. That may be the right amount for a log the player scrolls back
through a little.

### Option 3 — as option 2, but carrying `definitionId`

One counted row **per buildable type**, still bounded, and the sentence can
name the thing. Costs the `buildableLabelKey` extraction §4c names, and its
sentence takes a parameter, which is a second thing for the owner's copy ruling
to cover.

### Option 4 — publish it to the band as well

Rejected here rather than offered neutrally, on §4d's 625 ms measurement: at x4
this makes the band a progress meter. If the owner wants a build to announce
itself on the band, the honest shape is an event for the *programme* finishing
— the queue going empty — which is a different event with a different schema
and is not proposed here.

### What this document deliberately does not decide

1. **Any sentence.** Options 2 and 3 each need one; neither is written here.
   What a sentence would have to be true of: that at least one build order
   reached `'completed'` at the tick reported, that the geometry or object it
   writes is in the world at that tick, and — for option 3 — that
   `definitionId` names the buildable that finished. All three are properties
   `ConstructionSystem` holds at `system.ts:1746`; none needs a mechanism that
   does not exist.
2. **Whether a *cancelled-into-completed* order should say anything different.**
   `recordBuildOrderCancelled` (`src/simulation/events/event-log.ts:798-815`)
   already routes `'completed'` to `construction.order-cancelled-underway`, so
   taking a finished wall down is spoken for. Nothing here touches it.
3. **Whether the queue going empty is its own event.** Named in option 4 and
   left there.
4. **Whether `docs/HUD_PROJECTIONS.md` gap 32 should close.** Option 3 needs
   `buildableLabelKey` extracted; whether the registry gains a real `nameKey`
   is a content question this does not reach.

## The 2026-09-16 dossier — every figure above re-priced by running it

**This section decides nothing.** No `Status` line moves, no option is chosen,
no file under `src/` changes and no player-visible sentence is authored here.
It is filed inside this ADR rather than beside it for the reason ADR 0091's
dossier gives for doing the same: a second document restating the question is
how this corpus grows contradictions. It is dated because three of its findings
correct figures §4 states above, and a reader must be able to tell which
paragraph is which.

**The question, quoted rather than restated** — it is this document's own
title:

> Whether a finished object is an event, and what the log can afford to say
> about one

### D1. Still unbuilt, read out of the code rather than off the Status line

The census in [#1236](https://github.com/woogitsu/lockstate/issues/1236) claims
thirty of forty-four `Proposed` ADRs are already implemented in full, so
`Proposed` is not evidence of anything. Checked at `ca82e946`:

| Check | Result |
| --- | --- |
| `SIMULATION_EVENT_TYPES` (`src/simulation/protocol/types.ts:2070-2099`) | **27 members at `ca82e946`**, six of them `construction.*`: `order-cancelled`, `order-cancelled-underway`, `redone`, `undo-refused-newer-action`, `undone`, `undone-spend-destroyed` — every one a cancellation, an undo or a refusal of an undo. **28 at `460ef077`**, the seventh `construction.*` being `order-completed`, which is the absence this row measures, filled by `78cd9d2a` |
| `EVENT_PRESENTATION` (`src/ui/simulation-events.ts:458`) | a `Record` over that closed union, so a member cannot exist unrouted and cannot be hiding |
| `src/content/default-locale-en.ts` | 37 `hud.alert.event*` occurrences and no completion key among them |
| `src/simulation/events/event-log.ts` | twenty `public record*` methods, none for a completion |

So the absence was structural and nothing about it had been built **at
`ca82e946`**. `78cd9d2a` built it; the four rows above are kept as the check
they were rather than restated, because D1's claim is about that commit.

**The paragraph that stood here has been replaced, and what was wrong with it
is worth more than what it was trying to say.** It read: *"The line numbers §1
and §4 cite for `SIMULATION_EVENT_TYPES` (`:1769-1797`) have moved since this
document was written; the list is at `:1864-1892` today and is the same list
one member longer than §1 counted."* Three separate things in one sentence:

- **`:1864-1892` was right at `ca82e946` and is wrong at `460ef077`.** The
  tuple's opening line has moved 1864 → 1973 over nine commits to
  `src/simulation/protocol/types.ts`, five of them not merges, and none of the
  nine touched this document. A coordinate re-aimed against *today* rots on the
  next insertion above it, which is why every anchor into the tuple here now
  reads `src/simulation/protocol/types.ts:2070-2099` with
  `SIMULATION_EVENT_TYPES` quoted beside it.
- **The first row of the table above disagreed with it by 28 lines**, citing
  `:1892-1920` for the same tuple in the same subsection. At `ca82e946`,
  `:1892` was the closing `] as const;` — so the row cited the 28 lines
  *following* the list it was counting, while the paragraph under the table
  cited the list itself. A correction written in the same pass as the thing it
  corrects can still miss it.
- **"one member longer than §1 counted" was never true of anything.** §1
  counted 27 and this table counts 27, and both were reads of the same
  27-member tuple at commits between which it did not move. The sentence
  invented a discrepancy to explain a coordinate difference that had a
  different cause — the two anchors were simply aimed at different places in
  the same file.

And §4, which that sentence names alongside §1, cites no line number for the
tuple at all — only §1 and this subsection ever did.

### D2. The measurement that arrived after this document was written

[PR #1255](https://github.com/woogitsu/lockstate/pull/1255) (open, not merged,
so cited by pull request rather than by path — a rooted path to a file not on
`main` fails `documentation-links-contract`) drove twenty-four walls to
completion with the Build section held open, so the page diff is not
confounded by a section change, and diffed every laid-out text node:

> **GAINED 1** (`53%`, the day clock) · **LOST 4** (`24%`, *"An order is queued
> now and built while the clock runs."*, `Queued`, `6 waiting · 0 being built`)

**The game marks twenty-four finished walls by deleting the block that was
talking about them.** That is stronger than §3's claim, which is about the
alerts column: nothing *anywhere on the screen* marks the completion, and the
only net gain is the clock advancing. Its own stated limit is worth carrying:
it is a text-node diff at one viewport, blind to a node that stays present and
changes meaning.

### D3. §4d's cadence is wrong by 20%, and the direction of its error is the opposite of the one it names

**MEASURED**, by running twenty-four `wall-brick` orders through a real
`createNewSimulationRuntime` kernel and reading the tick each order reached
`'completed'` on:

```
COMPLETION_TICKS [70,130,190,250,310,370,430,490,550,610,670,730,790,850,
                  910,970,1030,1090,1150,1210,1270,1330,1390,1450]
GAPS_TICKS       [60 ×23]
```

**The steady-state gap is 60 ticks, not 50.** §4d derives 50 from
`workRequired: 50` at `+10` a pass, and drops the pass that takes the crew —
which `tests/unit/construction-crew-capacity.test.ts` states as a literal in
its own header (*"each further wall in the queue costs one tick to take the
crew and five to work, so **+60** each"*). So:

| Figure | §4d says | Measured |
| --- | --- | --- |
| gap between completions | 50 ticks | **60 ticks** |
| at x1 | 2.5 s | **3.0 s** |
| at x4 | 625 ms | **750 ms** |
| twenty-four walls, wall-clock at x1 | — | **69 s** (1,380 ticks, 0.58 in-game days) |
| twenty-four walls, wall-clock at x4 | — | **17.3 s** |

**And the uncertainty §4d ends on is refuted rather than merely resolved.** It
says the 625 ms is a lower bound because *"a queue that is buying as it goes
would produce completions further apart"*. Re-run with **no bricks stocked at
all**, so every order goes through `'materials-pending'` and the procurement
delay: the gaps are **identical — 60 ticks, all twenty-three of them**. Only
the first completion moves, from tick 70 to tick 170. Procurement pipelines
*behind* the single crew and never becomes the constraint, so 750 ms is the
steady-state gap and not a floor with slack above it.

**What this does to §4d's band argument: it survives, with six times the
margin it claims.** `EVENT_BAND_DWELL_FLOOR_MS` is 600 ms
(`src/ui/hud/event-band-dwell.ts:52`). §4d says completions clear it by 25 ms;
they clear it by **150 ms**. The floor still coalesces none of a completion
stream, so a band-routed completion still holds the band for a whole building
programme — the conclusion is unchanged and the number under it was wrong.

**And one coincidence §4d leans on dissolves.** It reads the dwell floor's own
*"measured 625 ms shortest real gap at x4"* as *"the same figure the four
constants above produce for a wall"* and concludes the arbitration was designed
against exactly this cadence. A wall's real cadence is 750 ms. Whatever the
floor's 625 ms was measured against, it was not a queued wall.

### D4. The row cost, measured by running the real reducer rather than by multiplying

**MEASURED, with one proxy named.** Twenty-four `simulation/event` messages
were fed through `hudEventAlertsFromWorkerMessage` — the shipped function, at
the shipped `MAX_EVENT_ALERT_ROWS = 8` — at the measured 60-tick spacing. **The
proxy**: no completion member exists, so each candidate *payload shape* is
carried by an existing `'info'` member of the same shape —
`economy.construction-restored` for the envelope-only case (its schema is the
envelope and nothing else) and `rooms.zoned` for the one-identifier cases (its
schema is the envelope plus one `identifierSchema`). What is measured is
therefore the **grouping and eviction behaviour of the real list against the
real payload shapes**; what is proxied is the type string and nothing else, and
`simulationEventIdentity` canonicalises the whole statement, so the type string
is inert to every result below except as a discriminator.

| Payload shape | Modelled as | Rows after 24 completions | Counts |
| --- | --- | --- | --- |
| envelope only (**option 2**) | `economy.construction-restored` ×24 | **1** | `[24]` |
| one `definitionId`, one buildable (**option 3**) | `rooms.zoned`, same key ×24 | **1** | `[24]` |
| one `definitionId`, three buildables (**option 3**) | `rooms.zoned`, 3 keys | **3** | `[8,8,8]` |
| an order id or a location (the shape §4d prices as unaffordable) | `rooms.zoned`, 24 keys | **8** — the cap | `[1 ×8]` |

§4d's table predicted 1, 1-per-buildable and 40-for-forty from reading the
code. The first two reproduce exactly. The third does **not** reproduce as
stated: twenty-four distinct completions do not produce twenty-four rows, they
produce **eight rows and sixteen statements the player never sees at all**,
because the cap evicts as it goes. That is worse than the table says, not
better — the failure mode is silent loss, not a long list.

### D5. What twenty-four completions evict from a list that already has something in it

**MEASURED.** The list was pre-loaded with six rows standing for a prison in
trouble — `economy.wages-unpaid`, `incidents.riot-opened`,
`incidents.assault-opened`, `rooms.zoned`, `prisoners.housed`,
`rooms.needs-cleared` — and then run through the twenty-four completions:

| Completion payload | Event rows after | Pre-loaded rows lost |
| --- | --- | --- |
| collapsing (envelope only, or one buildable) | 7 | **none** |
| distinct per order | 8 | **three** — `rooms.zoned`, `prisoners.housed`, `rooms.needs-cleared` |

The three lost are exactly the player's own acknowledgements, and the
`'warning'` and `'danger'` rows survive untouched, which is
`SEVERITY_EVICTION_ORDER` doing what ruling 11 of 2026-08-31 asks of it. So
§4d's *"forty completions evict each other and every other `'info'` row"* is
**confirmed at twenty-four**, and a collapsing payload costs the existing list
nothing at all.

### D6. The cost no payload shape avoids, which no section above prices at twenty-four

**MEASURED.** `SimulationEventLog` collapses nothing — `simulationEventIdentity`
is a HUD-side reading and the log appends every record. Fifty records of prior
history plus twenty-four completions, against
`MAX_BUFFERED_SIMULATION_EVENTS = 64` (`src/simulation/events/event-log.ts:33`):

```
BUFFER cap 64 length 64
BUFFER oldest sequence before 1 after 11
BUFFER history rows lost 10
BUFFER completions retained 24 of 24 = 37.5% of the buffer
```

**Twenty-four walls take 37.5% of everything the save remembers, and this is
identical for option 2, option 3 and option 4.** §4b is right that the save
*format* costs nothing and §4d prices the buffer only at sixty-four walls; the
figure a ruling needs is that a single ordinary building session evicts ten
records of a prison's history from the persisted log, and that the HUD's
counted-row trick — the whole reason options 2 and 3 are cheap on screen — does
not reach this at all.

### D7. What building it costs, measured against the closest landed analogue rather than estimated

The Consequences section prices option 2 at *"roughly 40 lines across four
files"*. **MEASURED** against `20aa619e`, the commit that added exactly one
event member (`rooms.zoned`) to this tree:

| | `20aa619e`, one member | This document's estimate |
| --- | --- | --- |
| the four files it names (`types.ts`, `event-log.ts`, `simulation-events.ts`, `default-locale-en.ts`) | **213 insertions** | ~40 lines |
| producer call sites (`zoning.ts`, `session-commands.ts`) | 64 insertions | not counted |
| tests | ~358 insertions across 7 files | not counted |
| **total** | **635 insertions, 13 files** | — |

Two further members landed the same way: `659a388b` (two members) at 1,288
insertions across 15 files, `eea81acb` (three members) at 738 across 13. **So
the honest price of option 2 is between five and fifteen times what this
document estimates**, most of it the doc-comment prose this repository requires
and the five gates §5 enumerates. That does not make it expensive — 635 lines
is a day — but *"roughly 40 lines"* would mislead an owner weighing it against
anything else on the board. The estimate was made by counting the places that
must change; the measurement counts what changing them has actually cost, three
times.

### D8. The interaction with what shipped today

ADR 0091 decision 2 was ruled option F
([#1253](https://github.com/woogitsu/lockstate/pull/1253)) and built
([#1261](https://github.com/woogitsu/lockstate/pull/1261), merged `b289599e`).
Read out of the code rather than the ruling:

- **It is the refusal band, not the events band.** `applySimulationRefusal`
  (`src/ui/hud/hud.ts`) now treats a notice carrying `routeDecidedSince` as no
  notice at all. `hudEventNoticeFromWorkerMessage` — the events band a
  completion would reach — is untouched by it. **The two surfaces do not
  collide**, and nothing in this ADR's option 4 is made cheaper or dearer by
  what landed.
- **A completion is not a route decision, and could not become one cheaply.**
  `routeDecidedSince` is set by `RefusalLog.supersede` → `noteRouteDecided`
  (`src/simulation/refusals/refusal-log.ts:247-283`), which compares the route
  prefix of a **supersession key built at command-acceptance time**. A wall
  finishing at tick 1,450 calls nothing there. So a standing
  `build.unbuildable` refusal is retired by the player's *next build press* and
  not by the wall they ordered actually going up — which is defensible under
  option F's own argument (the hand is the clock) but is worth the owner
  knowing, because "the thing I asked for is finished" is the strongest
  possible evidence that a refusal about that route is stale.
- **What it does give this ADR is precedent.** Option F is the first *ruled*
  instance of the band and the list deliberately disagreeing about one fact:
  the band retires the sentence, `hudAlertsFromWorkerMessage` never reads the
  flag and the row stays. §2's `'log-only'` routing for a completion is the
  same split, taken on the type instead of on a flag, and it is now a shape the
  owner has ruled on rather than one three agents inferred from #1006.
  **MEASURED**: `hudEventNoticeFromWorkerMessage` returns `undefined` for a
  `'log-only'` member and a notice for a `'band-and-log'` one, so the routing
  is a real gate and not a label.

### D9. Whether the ruling of 2026-09-15 reaches a finished wall — it does not, and the reasoning around it cuts against §3

`docs/HUD_PROJECTIONS.md` gap 34 carries the owner's ruling of 2026-09-15
(landed `5e045c3c`): article 6 governs *"arrears, missing beds, an open
incident — the state of the prison — and **not** the decline of a press. That
is article 3's* odmowa*."*

**It does not reach a finished wall**, and saying so plainly is the honest
answer: the ruling partitions *ostrzeżenia* — warnings — into a condition of
the prison and the decline of a press, and a finished wall is neither. Article
6's other sentence, *"Historia zdarzeń pozostaje dostępna"*, is what §3 rests
on and the ruling leaves it exactly where it was.

**Two things around the ruling nonetheless weaken §3's framing, and both are
checkable rather than argued:**

1. **`gotowy obiekt` is an article 3 term, sitting one word before `odmowę` in
   the same sentence** (`konstytucja.md:23`). The ruling's move is to send an
   outcome of a press to article 3's vocabulary; a finished object is already
   *in* that vocabulary, by name, beside the term the ruling sent there. Read
   for parity, a finished wall is article 3's business and §3 already finds
   article 3 satisfied — the ghost becomes the thing and the row leaves the
   queue.
2. **Article 6's heading is `Problem prowadzi do działania`** — a problem leads
   to action — and its first sentence is *"Komunikat podaje fakt, lokalizację i
   następny krok"*: a message states the fact, the location and the next step. A
   finished wall is not a problem and has no next step. **§3 chose the one
   article in the constitution whose subject is trouble as the home for an
   announcement of something going right**, on the strength of a single clause
   inside it.

So the constitutional case for option 2 is **weaker than §3 argues**, and what
is left of it is the clause about history standing on its own, unsupported by
the article around it. That is not an argument for option 1 — it is an argument
that the case for building this is a *design* case about what a player deserves
to be told, which is the owner's to make, and not a compliance case the code
can be held to.

### D10. The options, re-priced

Each row marks whether its figures are **measured** (run in this pass) or
**proxied** (derived from a mechanism measured on something else).

| | Rows, 24 walls | Persisted-log cost | Band | Build cost | Evidence |
| --- | --- | --- | --- | --- | --- |
| **1. Leave it** | 0 | 0 | none | 0 | measured (D2: the page gains nothing) |
| **2. Envelope only, `'info'`, `'log-only'`** | **1 row, counted 24** | **24 of 64 records, 10 history records evicted** | never | **~635 lines / 13 files** | rows and buffer measured; payload type proxied (D4); build cost measured on `20aa619e` |
| **3. Carrying `definitionId`** | **1 row per buildable** (3 buildables → 3 rows, `[8,8,8]`) | same as option 2 | never | option 2 **plus** the `buildableLabelKey` extraction §4c names | rows measured; the extraction cost is **not measured** — no analogue was priced |
| **4. Also to the band** | as 2 or 3 | same | **holds the band for the whole programme**; 750 ms against a 600 ms floor | as 2 or 3 | cadence measured (D3); the band arithmetic is now 150 ms of margin, not 25 |
| **(the shape nobody proposes)** an order id or a location | **8 rows, 16 statements silently lost**, and three of the player's own `'info'` rows evicted | same | — | — | measured (D4, D5) |

### D11. The recommendation, unchanged in direction and weaker in its reasons

**Option 2 remains the recommendation**, and this pass narrows why. What
survives measurement: it costs one counted row, it evicts nothing from a
working list, it never touches the band, and it follows the #1006 precedent
that #1261 has now made a ruled shape rather than an inferred one. What does
**not** survive: the constitutional argument (D9), the *"roughly 40 lines"*
price (D7), and the claim that the save cost is bounded and dull (D6 —
twenty-four walls is 37.5% of everything the save remembers, and no payload
shape avoids it).

**If the buffer cost is the one that matters to the owner, option 1 gets
stronger than §6 allows**, and this pass will not argue them out of it: option
1 is the only option that costs the persisted history nothing, and D2 is the
whole of the case against it.

### D12. The weakest claim in this dossier, and what would change my mind

**The weakest claim is D4's and D5's proxy.** Every row figure was obtained by
running the shipped reducer against an existing event member chosen to have the
same *schema shape* as the proposed one — `economy.construction-restored` for
the envelope, `rooms.zoned` for one identifier — never against a
`construction.order-completed` that does not exist. The reasoning is that
`simulationEventIdentity` canonicalises the whole statement and
`SEVERITY_EVICTION_ORDER` reads only `severity`, so the type string is inert to
grouping and to eviction alike; both proxies are `'info'`, which is the grade
options 2 and 3 propose. **What would refute it**: a completion member whose
schema carries a field neither proxy has — a count, a tick-derived figure,
anything that varies between two completions of the same buildable — at which
point the one-row result is a result about a payload nobody has agreed to.
The cheapest way to settle it is to build option 2 behind the ruling and re-run
the same four shapes against the real member.

**Second, smaller**: D7's build cost is measured on commits that also carried
documentation and, in two cases, a producer module of their own. 635 lines is
the cost of *how this repository adds an event member*, not a lower bound on
the smallest possible diff. An implementer who wrote no prose could do it in
far less, and would be doing something this repository does not do.

**And one thing this dossier did not settle that §"weakest claim" above names**:
it did settle the re-sort question, and the answer is the one that
weakens option 2 slightly. **MEASURED**: a counted row keeps the index its
first arrival earned and does **not** re-sort to the top as its count climbs —
five older rows, then the completion row at index 5 of 6, still at index 5 of 6
after twenty-four increments with `count: 24`. It does not age out while
building continues, because eviction within a band compares `lastSequence` and
every completion refreshes it; it ages out normally once building stops. So a
completions row is genuinely one row, and it is one row **where it first
appeared**, not at the top of the list.

## Consequences

- **Nothing changes in `src/` until the owner rules**, including under option
  2, which §5 prices at roughly 40 lines across four files plus one authored
  sentence. *Marked rather than rewritten, 2026-09-16: the owner has now ruled
  (option 2) and nothing under `src/` has changed, so the bullet's condition is
  spent while its conclusion holds; D7 prices the same work at 635 insertions
  across 13 files.* **The implementation being small and obvious is not a reason to
  build it**: the smallness is entirely in the plumbing, and the part that is
  not small is the sentence and the surface, which are the owner's.
- **Issue #960's title should be corrected or the issue closed and re-filed.**
  Its headline is refuted (§1) and the live remainder is one sentence long. An
  issue whose title is false is worse than no issue, because the census it
  invites is the census that has already been run twice.
- **Stage 4's audit row should read "one of six has no event" rather than "one
  of six is absent"** (§3). The distinction is the difference between an unmet
  constitutional article and a thin log.
- If option 2 or 3 is taken, `SIMULATION_EVENT_TYPES` goes to 28 and #960's
  narrow remainder closes. `SAVE_SCHEMA_VERSION` does not move (§4b).
- If option 1 is taken, this document is still worth its cost for §4d: the
  625 ms measurement and the payload/rows table are facts about the channel
  that the next person to propose an event on it will need.

## The weakest claim in this document, and what would change my mind

**The weakest claim is §4d's band arithmetic**, and specifically the 625 ms
figure. It is computed from four constants read off disk — 50 ms tick, 10-tick
pass, `+10` progress, `workRequired: 50` — and **not measured in a running
session.** What it assumes is that a queue of walls is serviced back-to-back
with no idle pass between them, which is true only while materials are already
allocated: an order that waits in `'materials-pending'` for the procurement
delay — *"ten more scheduled ticks"*, `PROCUREMENT_DELIVERY_DELAY_TICKS` at
`src/simulation/construction/system.ts:1700-1705` — stretches the gap, and a
queue that is buying as it goes would produce completions further apart than
the floor rather than closer.

So the direction of the error is known and it is the safe one: **625 ms is a
lower bound on the gap, so the band claim is the strongest form of the concern
rather than an average case.** What would settle it is driving a real
forty-wall queue at x4 through the browser harness and reading the actual
inter-completion interval off the event stream. That was not done, and nothing
here should be read as though it were.

**A second, smaller thing that would change the recommendation**: if the
occurrences grouping in the alerts list turns out not to re-sort a counted row
to the top when its count increments, then a completions row would settle to
the bottom of an eight-row list and the "one counted row" argument for option 2
weakens considerably. This pass read `simulationEventIdentity` and the grouping
docblock but did not verify the re-sort behaviour against a driven list.

## References

- [ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md) — the
  event-versus-condition ruling, and its amendment of 2026-09-01.
- [ADR 0084](./0084-what-the-alerts-channel-owes-a-player.md) — what the alerts
  channel owes a player; the dwell floor and the eviction order.
- [ADR 0099](./0099-how-the-renderer-learns-the-world-changed.md) — why
  `markDrawnWorldChanged()` fires on completion.
- [ADR 0082](./0082-what-order-build-orders-are-carried-out-in.md) — the walk
  that makes two completions on one tick totally ordered.
- [ADR 0011](./0011-localization-architecture.md) — why a payload carries a key
  and never text.
- [ADR 0038](./0038-what-makes-a-save-compatible.md) §1 — why no version bump.
- [Issue #960](https://github.com/woogitsu/lockstate/issues/960),
  [#966](https://github.com/woogitsu/lockstate/issues/966),
  [#1006](https://github.com/woogitsu/lockstate/issues/1006),
  [#1160](https://github.com/woogitsu/lockstate/issues/1160).
