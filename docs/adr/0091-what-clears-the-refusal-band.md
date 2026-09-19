# ADR 0091: What clears the refusal band

> **The number is provisional and this document pre-commits to renumbering**,
> on the terms every ADR from 0031 on has set for itself: if another branch
> lands 0091 first, this file, its row in `docs/adr/README.md` and every
> citation of it get renumbered without argument.
>
> **The sweep was performed, not asserted.** `git fetch origin
> '+refs/heads/*:refs/remotes/origin/*' --prune`, then `git ls-tree --name-only
> <ref> -- docs/adr/` read out of all **431** heads `git ls-remote --refs
> --heads origin` returns, branch cut from `origin/main` at `2025f7d7`
> (v0.0.349). Highest four-digit prefix found anywhere: **0090**, on
> `origin/fix/788-medium-is-a-warning-not-a-skipped-step` alone
> (`0090-medium-as-a-warning-not-a-skipped-step.md`) — the risk-tier-ladder
> agent named as live and off-limits in this branch's own brief — and
> **0089**, on `origin/docs/791-how-a-host-refusal-reaches-the-player`
> (`0089-how-a-host-refusal-names-its-reason.md`), also named in the brief as
> adjacent work not to be touched. `docs/adr/README.md`'s stated **Next free
> number: 0089** is therefore stale in exactly the way this repository's own
> history says it will be — disk (and the stated line) see only what has
> merged, and 0090 is a held, unmerged number the sweep can see and the
> README cannot. This document takes **0091**, one past the held ceiling,
> exactly as 0073, 0082 and 0087 each did before it.

## Status

**Accepted, 2026-09-16, by the repository owner, for decision 2 (option F: a
decided outcome of the SAME route retires the band).** Decision 1 shipped
2026-09-02 and needed no ADR.

**The provenance is the weaker of the two kinds this repository
distinguishes, and it is recorded here rather than left to be inferred.** The
owner did not type a sentence. They were shown four options in a clickable
question an agent session had written, priced by the dossier below, and chose
the one that session recommended -- *"F -- ta sama trasa (zalecane)"*. That is
the same provenance `CLAUDE.md` flags for the 2026-09-08, -09 and -10
releases inside reservation 3, and it is weaker than a quoted instruction in
exactly one way that matters here: **the option's own label is the whole of
what was agreed.** What was agreed is the RULE -- the band retires on a
decided outcome of the route the standing refusal names -- and not any of the
implementation the dossier prices under it. The recommendation the owner
agreed with also carried its own weakest claim, which they were shown: the
600 ms yardstick that argues against option D is borrowed from the EVENT
band's ADR 0084 ruling, and the refusal band has no dwell floor at all today.
So a reader who later finds that argument unsound has not found a ruling
unsound; they have found the reason offered for it unsound, and the ruling
stands until the owner says otherwise.

**The third option they declined is the one to read before re-opening this.**
It was D again, under a different reading -- that the corner is a last-press
indicator rather than a message, which would make the measured 2 ms lifetime
the specification rather than the defect. Declining it is a product position
about what the corner IS, and it is the position anyone proposing D again has
to overturn.

**Nothing under `src/` implements decision 2 yet**, and the ruling does not
by itself change that: it settles which rule is right, not that the rule is
built. Decision 1 is already implemented — it is a correction of an existing,
accepted mechanism's own stated test, not a new architectural choice; see
below.

*The sentence replaced here read "Nothing under `src/` on this branch depends
on decision 2, and nothing should until the owner has read it." It was true
for fourteen days and is quoted rather than deleted, because the condition it
names is the one that just ended.*

## Context

### Two issues, one mechanism, and a refutation already on record

[#777](https://github.com/matmaxalez/lockstate/issues/777) and
[#780](https://github.com/matmaxalez/lockstate/issues/780) were both filed
2026-09-01 with a shared guess: that ADR 0087's standing-condition mechanism,
once built, would make them "largely dissolve." **PR #784, which built that
mechanism, checked the guess and refuted it in its own report**:

> **#777 and #780 -- a different code path** (`RefusalLog` / `.hud__refusal`).
> This branch neither makes them testable nor dissolves them; they remain
> open, contrary to the guess in the issues.

This document confirms that refutation independently before doing anything
else, because the brief that commissioned it said to. ADR 0087 decision 1
(recommended without reservation, unaffected by the 2026-09-01 amendment)
sorts every `RefusalLog` reason into exactly two kinds by **what the
supersession key already is**: a *condition* is keyed domain-wide because its
truth is "a session-global fact re-evaluated identically" (`admit`,
`materials-funding` — B3 and B12 in ADR 0087's own inventory table); an
*event* is keyed per-target because it is "a fact about the specific
rectangle, tile, order or guard the command named" (the other ten). Every
reason `#777` and `#780` are about — `zone.*`, `unzone.*`,
`remove-object.nothing-to-remove` — is squarely in the second group. ADR
0087's amendment built the condition mechanism for exactly two of the
domain-wide facts (`construction.unfunded`, `intake.no-place`, plus the two
new insolvency-rung members); it was never proposed for, and does not reach,
a per-target "your press failed" refusal. Recomputing "is this specific,
possibly-abandoned rectangle currently enclosed" as a standing condition of
the *prison* makes no sense the way "is the treasury short" does — the
rectangle is not a durable feature of the prison once the player has moved
on, it is the subject of one gesture. So decision 1's own classification is
the refutation, independent of PR #784's citation of it: these are events,
and the condition channel was never going to reach them.

### Every cited `file:line` re-opened, at `2025f7d7`

The integrator's brief cited `src/ui/hud/hud.ts:1244-1256` and `:1220-1223`
for #777, and `src/ui/hud/hud.ts:1211-1259`,
`src/simulation/runtime/session-commands.ts:137-166` and `:571-604` for #780.
Re-opened at this branch's own cut:

- `hud.ts`'s `applySimulationRefusal` was at **1346-1361** at this branch's
  cut (`2025f7d7`), not 1211-1259 or 1244-1256 — both issues were filed
  against an earlier revision and the surrounding comments have grown since;
  the *function* and its bug are exactly where both issues say, the *line
  numbers* had drifted by about 100-130 lines each. This branch's own edit
  moves it again, to 1361-1375.
- `session-commands.ts`'s `ZoneRoom` branch was at **133-177** and its
  `RemoveObject` branch at **624-658** at the same cut, not 137-166/571-604 —
  the same drift, larger for the second citation because `PlaceObject`'s
  branch (not cited, and not touched here) sits between them and has grown.
  This branch's own edit moves `ZoneRoom` to 135-194 and `RemoveObject`,
  untouched in content, to 641-675.

Every citation resolves to the code the issues describe; only the line
numbers needed correcting, and they are corrected here per
`docs/AGENT_WORKFLOW.md`'s "open every `file:line` you cite."

### #492: what the exact-target key was solving, in its own words and in a test that still guards it

[#492](https://github.com/matmaxalez/lockstate/issues/492) closed a real
silence: a refusal that outlived the very command whose later success made
it false (wall a room, re-zone the identical rectangle, and the "must be
enclosed" sentence never went away). Its fix — `RefusalLog.supersede(key)`,
called on every success with a key built from the same arguments a refusal
under that route would have used — chose the **narrow** reading of "how wide
is a supersession" over the wide one, and said why in its own words
(`refusal-log.ts:456-472`, at this branch's line numbers): a successful zoning
of room B must not silence a still-standing refusal about room A, because a
different target succeeding is not a proxy for the first target's refusal
being false.

**That choice is not merely documented, it is pinned by two tests that would
go red under the wide reading**, `tests/unit/simulation-refusals.test.ts`:

- `'leaves the line alone when a different rectangle is what got walled and
  zoned -- the narrow reading, not the wide one'` (issue #492 describe block)
  — zones an unenclosed `room.cell` at `(2,2)`, then walls and successfully
  zones a *different* `room.cell` at `(10,10)`, and asserts the first
  rectangle's `not-enclosed` refusal is **still standing**.
- `'generalises to a build order, narrowly: a different tile succeeding does
  not clear the standing one'` — the same assertion for `build.unowned-land`.

**This is the finding that reshaped this document while it was being
written.** The playtest research this branch's brief cites
(`docs/research/2026-09-01-playing-the-rooms-surface.md`, act 3) measured
`#780`'s sharpest reproduction as exactly the shape these two tests protect:
an unrelated `room.yard` at `(2,2)` succeeding while an unrelated `room.cell`
refusal stands at `(20,20)`. **Widening `supersede` to clear on any success
in the same namespace — the research note's own candidate (a), "clearing on
any success regardless of key" — would turn both of the tests above red.**
They are not incidental coverage found along the way; they are the
executable form of #492's own stated requirement ("does not withdraw a
refusal that is still true"), and an implementing agent flipping them to
green the defect's way, without the owner having said the requirement should
change, would be re-deciding #492 inside implementation code — exactly what
`CLAUDE.md` reserves for an ADR.

So #492's reasoning was not wrong for what it solved, and is not being
overturned here. What follows is what its own test actually leaves open, and
what it does not.

## Decision 1: a refusal's key names the subject its *own reason* is actually about — implemented, no ADR needed

### The gap #492's implementation left inside its own rule

`RoomZoningService.zone` (`src/simulation/rooms/zoning.ts:450-576`) refuses
eight ways. Reading the function rather than assuming a route's own key shape
covers every reason it can produce: five of the eight reasons are decided
from the rectangle and the world alone, with `definition` — the room type —
never consulted.

| Reason | Decided from | Room type is read? |
| --- | --- | --- |
| `invalid-area` | width/height bounds | no |
| `out-of-bounds` | is the chunk materialised | no |
| `unowned-land` | `canBuildAt` on the tile | no |
| `overlaps-existing-room` | `world.getZoning(tile)` | no |
| `not-enclosed` | `roomPerimeterEnclosure` | no (only *whether* enclosure is required reads the type; *is it enclosed* does not) |
| `below-minimum-size` | `definition`'s own authored minimum | **yes** |
| `duplicate-instance-id` | `roomInstanceIdFor(definition.id, anchor)` | **yes** |
| `unknown-room-type` | the definition lookup itself | **yes** (it *is* the type) |

`zoneSupersessionKey(roomCatalogId, x, y, width, height)` folded the type into
every one of the eight regardless, because #492 was answered once, at the
route's own width, rather than once per reason. That is not the "how wide"
question #492's own text flagged as open ("does a successful `zone` withdraw
every standing `zone.*` refusal, or only one about the same rectangle") — it
answered that question correctly, narrowly, for the *target* a reason is
about. What it did not ask is a second, narrower question: **is the target a
reason is about the rectangle, or the rectangle-and-type?** For five of the
eight the answer is "the rectangle alone", and keying them by type anyway
made a `room.cell` attempt's `not-enclosed` refusal immune to being cleared by
anything except another `room.cell` attempt at the identical rectangle —
including a `room.yard` succeeding at that same rectangle a moment later,
which is a **direct, positive answer** to "is this rectangle enclosed" (a
yard needs no enclosure, so its success is not silent about the question the
way an unrelated room elsewhere is).

### Why this is a correction, not #492's wide reading revisited

The two guarding tests above are about a rectangle at a **different
location**. This decision changes nothing about a different location: `(2,2)`
and `(10,10)` produce different `zoneAreaSupersessionKey` values exactly as
they produce different `zoneSupersessionKey` values, so both tests are
unaffected — verified by running them, unchanged, after this decision
shipped. What changes is the **same rectangle, a different type**, which
neither guarding test exercises and which #492's own stated test —
"does not withdraw a refusal that is still true" — does not protect, because
the refusal (about that rectangle's enclosure) is no longer true the moment
any type succeeds there without needing walls.

### What shipped

- `zoneAreaSupersessionKey(x, y, width, height)` (`src/simulation/refusals/refusal-log.ts`)
  — the rectangle alone, for the five type-independent reasons.
- `zoneRefusalSupersessionKey(reason, roomCatalogId, x, y, width, height)` — a
  `switch` exhaustive over `ZoneRoomRefusalReason` (no `default`, so a ninth
  reason fails to compile here until it is classified) that picks the area key
  for the five and `zoneSupersessionKey` for the three type-dependent ones.
  `record` now files a refusal under whichever key its own reason is about.
- `session-commands.ts`'s `ZoneRoom` success branch calls **both**
  `refusals.supersede(zoneSupersessionKey(...))` and
  `refusals.supersede(zoneAreaSupersessionKey(...))` unconditionally, because
  a success carries no reason to compare against — it does not know which
  key shape a standing refusal, if any, was filed under — and `supersede`'s
  own contract makes a miss on either "silent and cheap."

### Why this needed no ADR

It changes no test's expectation and reverses no accepted decision; it
applies #492's own stated test — "does the key correctly identify the target
this refusal reason is actually about" — more precisely than the original
implementation did, per reason rather than uniformly per route. `CLAUDE.md`'s
"making an existing sentence appear or disappear correctly is yours; new
wording is not" names exactly this class of change.

### What this decision does not reach

- **`RemoveObjectRefusalReason` has one member, keyed by the tile alone
  already** (`removeObjectSupersessionKey(x, y)`) — there is no type
  dimension to split, so #780's own "it recurs for RemoveObject too" is
  **not** fixed by this decision. Its reproduction (`calibrate()`'s
  diagnostic presses at empty tiles staying on screen through a real room,
  wall and bed all succeeding elsewhere) is the plain different-location
  case the two guarding tests protect, and decision 2 below is where it is
  named rather than guessed at.
- **`PlaceObjectRefusalReason` has the same shape of conflation this
  decision fixes for `zone.*`**: `tile-occupied`, `outside-room`,
  `out-of-bounds` and `unowned-land` are decided from the tile and the world,
  never from `definitionId`, while `placeObjectSupersessionKey(definitionId,
  x, y)` folds the buildable in regardless. Neither #777 nor #780 cites
  `PlaceObject`, and it is named here as a candidate follow-up under this same
  reasoning rather than fixed on this branch, on the scope-discipline grounds
  `AGENTS.md` states ("do not silently broaden scope").

## Decision 2: the corner's own lifetime, when the standing subject is genuinely elsewhere — Proposed, not decided here

### The gap decision 1 cannot close

`RemoveObject`'s recurrence, and the "sharpest version" read as a *different
rectangle entirely* rather than a same-rectangle type mismatch, are both the
plain case the guarding tests protect: a refusal about a target the player
has moved on from, left standing while the player succeeds at something else.
Per #492's own requirement this is **not a false statement of fact** — the
first target may genuinely still refuse exactly as it did — but it is a
**confusingly juxtaposed** one: `.hud__refusal` names no location and no
room, so a player reading it beside a room they just successfully zoned has
no way to tell "this is about what you just did" from "this is about
something you tried five minutes ago and never returned to." ADR 0087 §3
named this tension without resolving it, reading the codebase's own comment
in `src/ui/simulation-alerts.ts`:

> is the intended reading rather than a duplication to be removed: one is
> what is happening now, the other is the entry it left.

and then immediately: "What it cannot do from where it sits is make the two
readings come from different data: both halves read the same single
`RefusalLog` record." That sentence is the architectural question this
decision is about, restated as a question with options rather than left as an
observation.

### Options

**A — do nothing further.** The status quo, protected by the two guarding
tests, decision 1 above narrowed but did not remove. Cost: `#780`'s
`RemoveObject` recurrence and its own different-location zoning case both
stay exactly as measured. Free, and leaves the finding open.

**B — widen `supersede` to the whole namespace** (any `zone.*` success clears
any standing `zone.*` refusal; any `RemoveObject` success clears any standing
`remove-object.*` refusal). **Rejected.** This is the research note's own
candidate (a) read narrowly-by-namespace rather than fully-widely, and it
still turns both guarding tests red — a `room.yard` at `(2,2)` would silence a
still-standing `room.cell` refusal at `(10,10)`, which is precisely what
#492's own test exists to catch.

**C — widen `supersede` to any success of any of the ten routes,
unconditionally**, mirroring the refusal band's own already-accepted rule
that a **new refusal** of any subject evicts whatever the band is showing
(`takeRefusalLine`, unconditional on subject match). **Rejected, for the same
reason as B, more broadly**: it too turns the guarding tests red, and it adds
a second way — Hire success clearing a standing Zone refusal — that #492's
issue never considered and this document has not measured a cost for.

**D — split the *notice* from the *log*.** Leave `RefusalLog` and the alerts
list exactly as decision 1 leaves them — the precise, narrow, tested record
of "what the simulation most recently refused and has not itself withdrawn."
Give `.hud__refusal` its own, separate, shorter-lived state: any subsequent
*decided outcome* of a player command — success or refusal, any route —
retires whatever the band is currently showing, the same "newest decided
thing wins" rule the band already applies to refusal-versus-refusal, now
applied to success-versus-refusal too. The list keeps the full, precise
record; the band becomes a true "right now" surface, exactly what ADR 0087
§3's uncredited half of the intended reading describes. Cost, priced rather
than assumed: the band and the list would **deliberately** disagree in
exactly the case this document is about — a refusal about an abandoned
target would vanish from the corner (nothing to glance at) while remaining
visible in the alerts list once opened (the log, unchanged). That is a
different shape of disagreement from #777's — #777's was a bug producing an
*accidental* mismatch about the *same currently-relevant fact*; this is a
*deliberate* mismatch between "what just happened" and "what is still on
record", which is the split the codebase's own comment already claims to be
making and is not yet built to make. It needs the owner's judgement on
whether that is the right shape for "the two screens must agree" to mean
going forward, and it is real new state (`hud.ts` currently derives the band
entirely from `RefusalLog`'s own notice; this needs a second, band-only
"last decided outcome" alongside it) rather than a key correction.

**E — a staleness affordance on the existing sentence**, with no clearing at
all: a fade, a tick-stamp, an icon meaning "this may no longer be about what
you are looking at." Cost: this is closer to new visual content than to
"making an existing sentence appear or disappear correctly" — it does not
invent a *sentence*, but it does invent a *treatment*, and `AGENTS.md`'s
fourth exclusion is conservative about exactly this boundary. Not
recommended for that reason alone, independent of its own design cost
(ADR 0085 already prices this band's width as tight).

### Recommendation

**D**, gated on the owner's reading of the cost named above. It is the only
option that resolves the tension without reopening #492's own guarded
question, and it is the shape the codebase's existing comments already
describe as the intended one without having built. It is not implemented on
this branch: it is new state, on a surface (`hud.ts`) `docs/AGENT_WORKFLOW.md`
notes is unreachable from `pnpm test` and would need its own extraction and
its own tests before it could be verified at all, and — more to the point —
it changes what "the corner and the list agree" means, which this document
is not the place to decide unilaterally.

### 2026-09-16 — decision 2 made answerable: re-measured, re-priced, and why it stood thirteen days

**Nothing below decides anything.** The Status block above is untouched, no
option is chosen, no `src/` file moves, and no sentence is authored. This
section exists because decision 2 has been `Proposed` since 2026-09-02 — the
longest-standing open decision on the board — and yesterday's queue census
found the reason, in its own words
(`docs/adr/STATUS-QUEUE.md`, the `9b8c8e85` anchor):

> *"Nothing was filed and nothing was deleted: **0091 arrived `Proposed` with
> no §2 row**, and it is the window's only arrival, so there was no exemption
> to distinguish from a delinquency this time."*

**Not slowness and not difficulty. No mechanism carried it.** §2 prices
outstanding decisions; the bookkeeping saw the gap, called it a delinquency
and filed nothing, four anchors running. What follows is the shape three
dossiers landed in yesterday (**PR #1242**, *"three decisions that have been
waiting on the owner"*, whose research note is not yet on `main` and is
therefore cited by pull request rather than by path): one question, options with **measured** costs, and a
recommendation.

#### The question, in one sentence

**Does the corner's sentence retire on any decided outcome of a later player
command, or only on another refusal — and if neither, on what?**

#### Verified first: decision 2 is genuinely unimplemented

Read at `e044a3e8`, not inferred:

- `applySimulationRefusal` (`const applySimulationRefusal = (notice:`,
  `src/ui/hud/hud.ts:1798-1813`; the anchor read `:1678-1693` and was re-aimed
  on 2026-09-19 after #1292 added the Security section above it, by `grep -n`
  rather than by arithmetic) clears the band on
  exactly one condition — `notice === undefined`, i.e. the worker stopped
  publishing a refusal — and otherwise only *replaces* it with a newer one.
- `clearRefusal` (`const clearRefusal = (actionId: string)`, `:1723-1726`; the
  anchor read `:1639-1642`) returns immediately unless
  `refusalSource === 'host'`, so no success of any kind touches a simulation
  refusal from the HUD side.
- The only thing that can make `notice` go `undefined` is
  `RefusalLog.supersede` (`src/simulation/refusals/refusal-log.ts:152-156`),
  which returns without acting unless the standing refusal's own key matches —
  decision 1's narrow key, exactly as shipped.
- There is **no second, band-only "last decided outcome" state** in `hud.ts`.
  Option D's cost line above ("real new state") is still true as written.

And the status-quo rule is stated verbatim in the code, twice:

> *"so a host refusal stays until the same action later succeeds, and a
> simulation refusal **until another replaces it or the session ends**, which
> are the first moments each sentence stops being true."*
> — `src/ui/hud/hud.ts:1292-1296`

> *"What clears a simulation refusal is another one, or the session ending;
> see `applySimulationRefusal`."* — `src/ui/hud/hud.ts:1636-1637`

#### Measured, 2026-09-16, on `e044a3e8`

A throwaway Playwright spec on the `browser` suite, port 45251, real Chromium,
fresh prison, 1440x900. Git LFS is unprovisioned in this container, so
`World renderer: InvalidStateError: The source image could not be decoded.`
appears in every run; every figure here is DOM text and `performance.now()`,
none of it the canvas. A 20 ms recorder logged every change of
`.hud__refusal`'s text for the whole run, and a wrapped `Worker` timestamped
every message in both directions.

**M1 — the status quo, reproduced independently of the cold-start pass.** A
`RemoveWall` press at tile `(18,19)` with nothing on it put this on the band:

> `Nothing was removed — there is no object on that tile, none being built
> there, and no finished wall there either.`

Then a single wall drag: **8 `PlaceBuildOrder` commands, all accepted** — the
Build panel read back `QUEUED / 8 waiting · 0 being built` — and the band was
**byte-identical after**. The 20 ms recorder logged **exactly two transitions
in the entire test** (`<hidden>` → the refusal) and never a third. **21
`simulation/status-counts` publications and 0 `simulation/event` messages
arrived after the refusal**, so nothing on any channel withdrew it. Repeated
in a second run, same result.

**M2 — how long the band would live under option D, measured.** The eight
commands of that one drag were submitted **2 ms apart end to end** (per-command
gaps `[2,0,0,0,0,0,0]`; 3 ms and `[0,3,0,0,0,0,0]` on the first run). Under D —
"any subsequent decided outcome retires the band" — a refusal decided at the
first press of a gesture is retired by the second press **of the same
gesture**, 2 ms later.

The yardstick is already in the tree and is the owner's own:
`EVENT_BAND_DWELL_FLOOR_MS = 600` (`src/ui/hud/event-band-dwell.ts`, the ADR
0084 ruling, *"derived against a measured 625 ms shortest real gap at x4"*).
**D gives a refusal about 1/300th of the minimum the owner ruled an ordinary
event needs in order to be readable.** `hud.ts:1292-1293` states the same worry in
its own words — *"a message that clears itself on a timer is a race against
how fast the player reads"* — and under D the timer is the player's own next
press.

**M3 — a removal gesture is one command, not a run.** The same drag with
removal armed produced **1** command, not 8. So the "drag that refuses eight
times" case does not exist: refusal-versus-refusal at gesture speed is not
what is being priced here.

**M4 — what a decided *success* looks like on the main thread today: nothing.**
Measured over a 22-command session: 22 `simulation/command-result` messages and
**0** `simulation/event`. And `command-result` is not a decision —
`handleSubmitCommand` (`src/simulation/worker/state-machine.ts:1122-1151`)
answers `status: 'queued'` at receipt, which ADR 0003 decision 9 says is
receipt and not effect, *before* the tick that decides anything. So **no
existing channel tells the HUD that a command succeeded**, which is the
measured form of option D's "real new state".

**M5 — what that new signal would cost, measured against the two of its shape
already in the tree.** The publisher-side watermark pattern is three lines
each, twice over: `_publishedRefusalSequence` (`state-machine.ts:275`, `:581`,
`:600`) and `_publishedZoningSequence` (`:290`, `:591`, `:601`). A third would
be the same three lines plus one member on the counts payload. The counter
itself needs **no new call sites**: `session-commands.ts` carries **18**
`refusals.supersede` calls against 18 command types, and its own docblock at
`:111` states the rule — *"Every branch below also calls `refusals.supersede`
on its success path"* — so incrementing inside `supersede` and `record`
(`refusal-log.ts:119`, `:152`) is two lines that reach every success and every
refusal in the game. **And the route comes free**: the band already knows the
standing refusal's route, because `REFUSAL_LABEL_KEYS`
(`src/ui/simulation-alerts.ts:35+`) is keyed by a reason whose own prefix is
the route (`remove-wall.*`, `build.*`, `admit.*`).

#### The two figures this section did not re-derive, checked rather than assumed

- **ADR 0087 cost 1 reproduces as cited**: *"240 consecutive ticks yields
  `log.count === 240`, 240 distinct alert row ids … twelve seconds of a
  stalled queue at the 50 ms tick"*
  (`docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md:264-269`).
  So re-announcing a standing refusal is priced and the price is 240 rows in
  12 s.
- **The constitutional argument for accumulating refusals is closed**, by the
  owner and not by us. `docs/HUD_PROJECTIONS.md` gap 34 carries the ruling,
  dated 2026-09-15 and landed in `5e045c3c`: article 6's *ostrzeżenia* governs
  *"arrears, missing beds, an open incident — the state of the prison — and
  **not** the decline of a press. That is article 3's odmowa."* So *"Historia
  zdarzeń pozostaje dostępna"* does not require a refusal to stay on the band,
  and the measurements that were filed as a constitutional conflict are now
  the **cost side** of this decision rather than a defect report.

#### The options, each with what it costs, measured

Lettered to match this document's own list above. **B and C stay rejected for
the reason already given** — they turn the two guarding tests in
`tests/unit/simulation-refusals.test.ts` red, and those tests are about
`RefusalLog`, which none of the three live options touches. **E is dropped
from the live list**: its cost was never measured, it invents a *treatment*
rather than a rule, and pricing it needs design work no pass has done.

**Option A — leave it. Cost: zero code, and the following, measured.**

The refusal stands until another refusal replaces it or the session ends. What
that has been measured to mean, on two independent trees eleven days apart:

- **This pass**: survives 8 accepted build orders, 21 counts publications, and
  every gesture of a wall run, with 2 band transitions logged in the whole
  session.
- **The 2026-09-15 cold-start pass** (acts 3-5 of the cold-start record on
  branch `agent/cold-start-measurement`, **PR #1243** — also not yet on
  `main`, so cited by pull request rather than by path): a probe refusal survived
  **24 walls, a zoned Cell, two beds and a toilet, two admits, a hire and
  eight in-game days** — 5.9 minutes of play — and the alerts list
  **re-sorts it below each new arrival**, so it ends the run sitting under
  three dated, dismissible `Info` acknowledgements while carrying **neither a
  `Day` stamp nor a `Clear this alert`**.
- **And once, two adjacent grid rows made opposite claims about one press**:
  the event band said `The order was cancelled. Anything already spent past
  the point of no return stays spent.` while the refusal band beside it still
  read `Nothing was removed`, for the same successful press (act 3 step E).

That last item is the whole of A's cost, and it is not a wording problem: the
sentence is in the present tense about a tile the player has since built on.

**Option D — any decided outcome of any route retires the band (this document's
own recommendation, now priced).**

- **Fixes**: everything measured under A. The band becomes a true "right now"
  surface and the alerts list keeps the full record, which is the split
  `src/ui/simulation-alerts.ts`'s own comment already claims to be making.
- **Costs, measured**: the band's lifetime becomes **2-3 ms** inside a drag
  (M2), against the **600 ms** floor the owner ruled an event needs (ADR
  0084). A player who refuses a press and then does anything at all never
  reads the sentence. Plus the new signal: three watermark lines, one payload
  member, two counter lines, and a band rule in `hud.ts` (M4, M5).
- **Deliberate disagreement**: the band and the list part company in exactly
  the case this decision is about, as the option's original cost line says.

**Option F — retire the band on a decided outcome of the *same route*.** New
here, and it is D with one comparison added.

- **Costs the same signal as D** (M5) and **no extra payload**, because the
  route is already derivable from the standing refusal's own reason prefix
  (M5, last clause).
- **Measured lifetime**: in M1's own session the standing refusal is
  `remove-wall.*` and the 8 commands are `PlaceBuildOrder`, so **F leaves the
  sentence up through the entire drag** — the band survives unrelated
  gestures, which is the readability D loses. It is retired by the player's
  next *removal*, whatever tile it names.
- **Kills the measured contradiction**: act 3 step E was a **successful
  `RemoveWall`** while a `remove-wall.nothing-to-remove` refusal stood. Same
  route, so F retires it — the two bands stop disagreeing about one press.
- **What it does not fix, stated plainly**: #780's plain different-location
  case for a route the player never repeats. A `zone.not-enclosed` refusal
  about a rectangle the player abandons stands until they zone something else
  or refuse something else.
- **Cost, the honest one**: F applies to the band the wide, per-namespace
  reading #492 rejected — but **for the log**. The two guarding tests assert
  on `RefusalLog` (`tests/unit/simulation-refusals.test.ts:838` and the
  `build.unowned-land` case beside it), and F touches neither `RefusalLog` nor
  `supersede`, so both stay green as written. A reader who reads F as
  overturning #492 is reading a band rule as a log rule.

#### Recommendation — and the ruling it received

**Ruled on 2026-09-16: the owner chose F.** The paragraphs below are left
exactly as they were written, in the tense they were written in, because a
recommendation that is silently rewritten into a ruling destroys the only
evidence of what the ruling was a choice BETWEEN. The Status block at the top
of this document carries the ruling, its provenance and its limits; this
section carries the argument that was put.


**F.** Not D, which is this document's own earlier recommendation, and the
reason is one measurement: **D's band lifetime is 2 ms inside an ordinary wall
drag**, and the owner has already ruled that 600 ms is the floor below which an
*event* is not readable. A rule that retires a sentence before the same gesture
finishes is not "newest decided thing wins"; it is the timer `hud.ts:1292-1293`
declines to have, with the player's own hand as the clock. A is measured to
produce a screen that contradicts itself about one press, which is the one
outcome nothing here defends.

F retires the sentence at the moment the player demonstrates, by doing that
same kind of thing again, that the subject is behind them — and it leaves the
sentence alone while they are doing something else, which is when they are most
likely to be reading it. It costs what D costs and no more.

**Weakest claim, named.** That the 600 ms event-band floor is the right
yardstick for the refusal band. It was ruled for a different band, and the
refusal band has **no dwell floor at all** today — a second refusal replaces
the first immediately, at whatever speed they arrive. So the comparison is an
argument by analogy, not a rule being broken.

**What would change my mind:** a ruling that the corner is a *last-press
indicator* rather than a *message* — that it is meant to mirror the newest
press the way a cursor mirrors a pointer. Under that reading 2 ms is not a
defect, it is the specification, and **D becomes correct immediately**, with F
the fussier of the two for no gain. That is a product position and not a
measurement, which is why it is the owner's.

## What this document does not decide

1. **`PlaceObject`'s analogous key conflation** (named above, not fixed).
2. **Whether decision 2 ships as D, or some option this document did not
   enumerate.** The owner's to choose.
3. **Any new sentence.** Decision 2, whichever shape it takes, authors no
   sentence — a corner that stops showing something needs none, and a
   staleness affordance (E, not recommended) would need design work this
   document does not do.
4. **Whether the guarding tests' own framing ("the narrow reading, not the
   wide one") should be renamed** if decision 2 ships as D — they would
   remain exactly as correct about `RefusalLog`, and decision D does not
   touch `RefusalLog` at all.

## Consequences

- Decision 1 ships in this same branch (`src/simulation/refusals/refusal-log.ts`,
  `src/simulation/runtime/session-commands.ts`) and needs no further
  approval; it is a narrower, more correct application of #492's own rule.
- #780's `RemoveObject` recurrence, and its different-location zoning
  reproduction, remain open pending decision 2.
- `#777` is a separate, unrelated bug (a HUD-side caching error, not a
  supersession-key question) and is fixed independently on this branch; see
  the commit that touches `src/ui/hud/hud.ts`'s `applySimulationRefusal`.
