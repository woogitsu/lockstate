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

**Proposed, 2026-09-15. Not self-approved, and it implements nothing.** No
file under `src/` is changed by the pass that wrote this document, and none is
proposed to change until the owner rules.

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
commissioned it in two places before §3 argues anything.

**This document authors no player-visible string**, and it is careful about
why rather than merely compliant: the sentence a completion event would carry
is a sentence whose truth depends on a mechanism that does not exist yet. §6
names the truth conditions instead, in the shape ADR 0114 §4 uses.

**It deliberately leaves the implementation unbuilt even though §5 prices it
at a few dozen lines.** [ADR 0115](./0115-where-the-prisoner-roster-lives-and-what-the-manage-rail-can-afford.md)
was proposed and not built two days ago for the same reason and that is the
precedent followed here: a player-visible change made in anticipation of a
ruling spends something that may have to be spent back.

## 1. The finding that commissioned this, checked rather than repeated — and it has aged

Issue #960's title claims **"twenty event types and not one reports something
going right"**, and its §2 lists the twenty it counted at v0.0.465. **The
surface is 27 members today** (`src/simulation/protocol/types.ts:1769-1797`),
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
reason given for the two most recent (`src/ui/simulation-events.ts:611-617`,
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
`roomNameKey: identifierSchema` (`src/simulation/protocol/types.ts:1889`) is
under, and `types.ts:994-996` already says so: *"A key is not text: ADR 0011 keeps
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

## Consequences

- **Nothing changes in `src/` until the owner rules**, including under option
  2, which §5 prices at roughly 40 lines across four files plus one authored
  sentence. **The implementation being small and obvious is not a reason to
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
