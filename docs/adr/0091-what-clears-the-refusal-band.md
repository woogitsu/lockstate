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

**Proposed, 2026-09-02, for decision 2. Not self-approved.** Decision 1 needed no ADR and is already implemented on this branch — it is a correction of an existing, accepted mechanism's own stated test, not a new architectural choice; see below. Nothing under `src/` on this branch depends on decision 2, and nothing should until the owner has read it.

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

- `hud.ts`'s `applySimulationRefusal` is at **1346-1361** before this
  branch's edit (not 1211-1259 or 1244-1256) — both issues were filed against
  an earlier revision and the surrounding comments have grown since; the
  *function* and its bug are exactly where both issues say, the *line
  numbers* had drifted by about 100-130 lines each.
- `session-commands.ts`'s `ZoneRoom` branch is at **133-177** and its
  `RemoveObject` branch is at **624-658**, not 137-166/571-604 — the same
  drift, larger for the second citation because `PlaceObject`'s branch (not
  cited, and not touched here) sits between them and has grown.

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
