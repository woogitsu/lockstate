# ADR 0094: Which names a prison draws from

> **The number is provisional and this document pre-commits to renumbering**,
> on the terms every ADR from 0031 on has set for itself: if another branch
> lands 0094 first, this file, its row in `docs/adr/README.md` and every
> citation of it get renumbered without argument.
>
> **The sweep was performed, not asserted.** `git fetch origin
> '+refs/heads/*:refs/remotes/origin/*' --prune`, then `git ls-tree
> --name-only <ref> -- docs/adr/` read out of all **481** heads `git ls-remote
> --refs --heads origin` returns, branch cut from `origin/main` at `98e05058`
> (v0.0.388). Highest four-digit prefix found anywhere: **0093**, on
> `origin/docs/a-carry-is-an-action` (`0093-a-carry-is-an-action.md`). Nothing
> at 0094 or above appeared on any head. `docs/adr/README.md`'s stated **Next
> free number: 0094** therefore agrees with the sweep, which is the first time
> in the chain `STATUS-QUEUE.md` records that the stated line and the remote
> ceiling have agreed rather than the line being stale behind a held number.
> That agreement is reported rather than relied on: the sweep is the authority
> either way.

## Status

**Proposed, 2026-09-02. Not self-approved.**

Three decisions. **Nothing under `src/` reads any of them**, and that is
deliberate rather than incidental: this branch ships the authored name data
and its gates, and leaves the one line that would put it into a session
(`src/simulation/runtime/new-session.ts:487`) exactly as it is. Decision 2
reaches the save envelope and decision 3 changes a validator that guards it,
so neither is an agent's to take.

## Context

### The mechanism was built and left without content

A prisoner reads as `Prisoner 4` today. The message key is
`hud.regime.roster-unnamed` (`src/content/default-locale-en.ts:2235`), which
the HUD uses for a prisoner with no name at all.

Everything under the name is already built and argued. ADR 0012 and ADR 0015
put a name in the **allocated identity** category — minted once, snapshotted,
only ever carried — and `src/simulation/identity/actor-identity.ts` states the
case at length, including the three facts about `EntityStore` that rule out
deriving a name from an entity id. Names are minted from a dedicated
`identity.actor-name` stream in canonical entity order and snapshotted into
the save's `identity` field (`src/persistence/save-schema.ts:1691`).

What was never built is the content. `src/simulation/identity/name-pool.ts`
ships `PLACEHOLDER_ACTOR_NAME_POOL` — 32 given names by 32 family names — and
says of itself, in its own docblock, *"This is not a content deliverable"* and
that it is *"expected to be replaced wholesale by authored content later"*.

### The owner's decision of 2026-09-02

Verbatim: *"oddzielne bazy dla każdego języka, 120x160 na język"* — separate
pools per language, 120 given names by 160 family names per language.

`src/simulation/identity/name-pools/` is that data: nine pools, each
`120 × 160`, each with its own stable id (`authored.en.v1` and so on).

### Finding 1 — "per language" cannot mean "per interface locale"

This is settled before anything else because it changes what the rest of the
document is about.

`actor-identity.ts` already decided, and implemented, that a name is **not
localizable content**: ADR 0011 names three namespaces — stable id, message
key, translated text — and a proper name is none of them. The module says a
name is *"never authored into a catalog, never translated, identical in every
locale"*, carries no `nameKey`, and gets no entry in `src/content/`. A pool
keyed to the player's interface language would contradict an implemented
decision, not extend one.

It would also have nothing to key to. The repository ships one real locale
(`en`) plus a pseudo-locale; `tests/foundation/second-locale-contract.test.ts`
exists precisely because there is no second one yet, and is written against
#664's rule: *"Do not make a gate that can only pass by having a
complete translation, and then complete the translation to make the gate
pass."*

So a pool's language is the **naming tradition of the population**, not the
language of the interface. `authored.pl.v1` means "the names a prison in that
place gives its prisoners", and it reads identically to every player in every
locale. That is what makes decision 2 a real question: if the pool were the
locale, there would be nothing to choose.

### Finding 2 — the ASCII invariant is real, and two of the three reasons given for it are not

`name-pool.ts:19` states the constraint and its justification in one bullet:

> - **ASCII only.** Names are compared and sorted with code-unit ordering
>   (`docs/DETERMINISM.md` forbids `localeCompare`) and they are hashed
>   into determinism state. ASCII keeps that trivially reproducible and
>   stops a Unicode normalisation form becoming load-bearing.

Three claims. They were opened rather than accepted, and they do not stand
equally.

**"sorted" — no. There is no call site.** A name is never sorted anywhere
under `src/`. `ActorIdentityRegistry`'s two orderings are numeric:
`entries()` sorts ascending entity id (`actor-identity.ts:311`) and
`reconcile` does the same (`:301`). The one code-unit string comparator in the
presentation layer is `compareStableIds`
(`src/simulation/presentation/view-model.ts:253`), and every one of its
callers passes an `orderId`, an `instanceId`, a permission id, a
`classificationGroupId`, an `objectCapabilities` entry or a door id — never a
`givenName` or a `familyName`. `canonicalJson`
(`src/simulation/determinism/canonical.ts:13`) sorts object **keys**; a name
is a value. So the sorting half of the invariant protects nothing that exists.

**"compared" — yes, but equality only, and non-ASCII does not weaken it.**
Two comparisons are real. `fullNameKey` (`actor-identity.ts:167`) builds a
composite `Map` key for the live-collision multiset, read at `:394` and
written at `:374` and `:379`; that is code-unit string equality. And
`simulationEventIdentity` (`src/simulation/protocol/event-identity.ts:49`)
canonicalises an event that may carry a `name`
(`src/simulation/events/event-log.ts:355`, `:398`), a string the worker and
the main thread then compare to resolve a dismissal. Code-unit **equality** is
spec-defined and locale-independent, with no ICU anywhere near it — it behaves
identically for `Wiśniewski` and for `Wisniewski`. `docs/DETERMINISM.md:61`
forbids `localeCompare` because *collation* varies with ICU data; nothing
here collates.

**"hashed into determinism state" — yes, and this one is load-bearing.** The
save payload carries `identity` (`src/persistence/save-schema.ts:1691`, and
`:1297`/`:1327` for the earlier envelopes) and its checksum is
`computeSaveChecksum(payload)` (`:1765`), which is `deterministicStateHash`
(`src/persistence/checksum.ts:10`) — FNV-1a over
`new TextEncoder().encode(canonicalJson(value))`
(`src/simulation/determinism/canonical.ts:19`). So every prisoner's name is in
the save checksum. But UTF-8 encoding of a JS string is also spec-defined and
engine-independent, so a non-ASCII name hashes reproducibly too.

**Which leaves the clause the bullet puts last, and that clause is the whole
invariant.** Normalisation form is genuinely load-bearing, and it was
measured rather than reasoned about. `Wiśniewski` written NFC (s-with-acute as
one code point, 10 code units) and NFD (`s` plus a combining acute, 11 code
units) are indistinguishable on screen and:

| | NFC | NFD | ASCII `Wisniewski` |
| --- | --- | --- | --- |
| save checksum of `{familyName}` | `hash cdceca3d2d02efaa` | `hash a683780f4fb2919e` | `hash 65414b36779d6373` |
| `===` against the NFC form | — | `false` | `false` |
| hit in a `fullNameCounts` map keyed NFC | — | `false` | `false` |

The three checksums carry a `hash` word inside the code span rather than
standing alone in one, and that is not decoration.
`tests/foundation/documentation-commit-citation-contract.test.ts` reads a code
span whose whole content is 7 to 40 hex digits as a commit sha and resolves
it; `deterministicStateHash` output is 16 lowercase hex digits, which is
exactly the shape of an abbreviated sha, so the gate flagged all three as
commits that do not exist -- correctly, since nothing distinguishes the two
shapes. The gate is not loosened for this: adding a 16-hex class to its
`NOT_A_COMMIT` map would exempt real abbreviated shas of that length too, and
that map's own rule is that an entry must be *true as written*. The document
works around the collision instead, which costs a word.

Two spellings of one name give two save checksums and count as two different
people in the uniqueness multiset. Nothing in the repository normalises:
`grep -rn '\.normalize(' src/` returns no match, so there is no choke point
where the two forms could be made one.

**But no name can enter in two forms today, and that is why non-ASCII in a
pool is not itself the hazard.** A name reaches the registry by exactly three
routes. From a pool literal — fixed in the bundle at build time, so every
client holds the identical code-unit sequence. From `loadSnapshot`
(`actor-identity.ts:330`), which carries back what was minted. And from
`rename` (`:268`), whose own docblock says *"No command is wired to this yet"*
(`:264`). The second form arrives only when a name comes from **outside** —
player text, or an authored scenario — and that path does not exist.

So the honest statement of the constraint is narrower and sharper than the one
in the docblock: **ASCII is not what makes names reproducible; a single
normalisation form is, and ASCII is one way of guaranteeing one form for free.**

That distinction has a price this branch can point at. `src/simulation/identity/name-pools/pl.ts`
ships `Wisniewski`, `Malgorzata` and `Krol` — spellings a Polish reader calls
wrong — and `./sw.ts` records the sharper cost: the ASCII rule **chose the
language**. The placeholder deliberately carried West African forms (`Abara`,
`Okafor`); Yoruba writes with subdotted vowels and Hausa with hooked
consonants, neither of which ASCII can represent, so the African tradition in
this tranche is Swahili — the one written in plain Latin letters, where
nothing is romanized and nothing is misspelled. Only `de` (via `ae`/`oe`/`ue`)
and `it` (natively unaccented) escape the cost entirely; `tr` pays the most
per entry, folding two distinct Turkish letters, dotted and dotless I, onto
one ASCII `i` — the fold `PLACEHOLDER_ACTOR_NAME_POOL` already shipped as
`Yilmaz`.

## Decisions

### Decision 1 — the pools are versioned content, and a pool is immutable once it ships

Every id ends in `v1` and a correction ships as `v2` beside it rather than as
an edit. This is not new policy; it is `name-pool.ts`'s own rule made
concrete. That docblock states that a pool's declared order is *"half of the
seed-to-name mapping"*: reordering a list changes which name a **future** draw
produces, so two players on different builds disagree about a brand-new
arrival. Nobody already named is renamed — a name is stored state, which is
exactly what the allocated-identity category buys — but the disagreement about
the next arrival is real, and an id that did not move would make it silent.

`AUTHORED_ACTOR_NAME_POOLS` is declared in a fixed order and
`authored-name-pools.test.ts` pins both that order and the exact id strings,
so a reorder or a rename fails a gate rather than shipping.

### Decision 2 — a prison's naming is an allocated choice, snapshotted; it is a plan, not a pool; and it is defaulted rather than prompted

The open half. `ActorNamePool.id` exists *"so a save or a log can say which
one produced a name"*, and the snapshot already carries `poolId`
(`actor-identity.ts:138`, written at `:321`) — so the *carrying* half is
built. What does not exist is the *choosing*, and it reaches the save.

**(a) It must be allocated, not derived from the master seed.** The tempting
option is `masterSeed % pools.length`: nothing stored, the same prison always
naming the same way. It fails on this repository's own facts, and it fails the
same way deriving a *name* from an entity id failed. `masterSeed` is
**optional** in the save schema (`src/persistence/save-schema.ts:1685`, added
by #412 after V5 shipped), so a save written before that has no seed to
re-derive from. Restoring one is safe for the existing population — stored
names win, and `loadSnapshot` tolerates a `poolId` it disagrees with by
design (`actor-identity.ts:325`) — but the **next** admission in that restored
session would draw from whatever pool the fallback picked, giving one prison a
population named half from one tradition and half from another, with nothing
recording that it happened. ADR 0012's rule settles it without needing the
edge case: the pool choice can influence state and crosses a save boundary,
so it declares itself allocated or derived, and a derived one must be
recomputable from the state it describes. This one is not.

**(b) It should be a plan over pools, not one pool.** A single pool per prison
makes every prisoner in a session share one tradition, which is duller than
the placeholder it replaces — the placeholder mixed its 32 names across four
regions on purpose. So the snapshotted choice is an ordered, weighted list of
pool ids: a *naming plan*, shipped as content with its own id, with the
default plan being a mix. `poolId` on the snapshot then carries the **plan's**
id, which needs no schema change and no version bump, because that field is
already declared *"Diagnostic only"* and already tolerates disagreement.

**(c) It is defaulted at new-game, not prompted.** A new-game prompt is a
player-visible surface, and `AGENTS.md` reserves *"anything that reaches a
player as a promise the code does not keep"* to the owner. The plan is
therefore a session parameter with a default, reachable by a scenario author
before it is reachable by a player.

**The cost, stated because it is the part an implementation cannot avoid.**
Choosing a pool per actor needs a third draw per mint, on top of the two in
`drawOnce` (`actor-identity.ts:401`). That changes the drawn sequence for any
given seed, which makes it a **save-visible constant** rather than a tuning
knob — precisely the status `uniquenessAttempts` already documents for itself
(`:146`). Every determinism test that pins minted names against literals
re-baselines once, and only once.

### Decision 3 — keep ASCII for `v1`, and widen the pattern only behind a normalisation choke point

`NAME_PATTERN` (`name-pool.ts:47`) stays `/^[A-Za-z][A-Za-z'-]*$/` and this
branch changes no production code. Widening it to a defined Unicode subset is
a real improvement — nine pools currently misspell names on purpose — and
Finding 2 shows the determinism objection to it is mostly not what the
docblock says it is. But it is not a data change, and it carries one
precondition that must land in the same commit as the widening:

**A single normalisation choke point, applied wherever a name enters from
outside the pool.** Today that is `validated()` (`actor-identity.ts:365`),
which both `rename` and `loadSnapshot` already pass through — so the
choke point has one location and already has two callers. Widening the pattern
without it converts a hazard that cannot fire (no external name source exists)
into one that can, the day a rename command is wired.

Also required, and cheap: a gate that a pool contains exactly one
normalisation form, and the ASCII-fold entries kept as `v1` pools rather than
edited, so a save that names its plan by a `v1` id keeps meaning what it said.

The reason this is a separate decision rather than folded into decision 1 is
that it is the only one of the three that changes behaviour the save boundary
depends on, and it is the only one where an agent proposing it would be
loosening a gate that currently passes.

## Consequences

- Nine pools, 2,520 authored names, `120 × 160` each, asserted valid by
  `tests/unit/authored-name-pools.test.ts`; a malformed or duplicate-bearing
  pool fails there.
- `19,200` distinct full names per tradition against the placeholder's
  `1,024`. This matters to `uniquenessAttempts` (default 8,
  `actor-identity.ts:158`): at 1,024 pairs a 200-prisoner prison exhausts
  eight re-draws often enough for repeats to be routine, and at 19,200 a
  repeated full name reads as the coincidence a real prison contains.
- No behaviour changes. `new ActorIdentityRegistry()`
  (`src/simulation/runtime/new-session.ts:487`) still takes the placeholder by
  default (`actor-identity.ts:205`), so a save written before this branch and
  a save written after it are byte-identical.
- **Zero bundle cost while unwired**, measured on the production build rather
  than assumed: the simulation-worker chunk contains `placeholder.v1` and
  `Lindqvist` once each and contains no authored pool id and no authored name
  at all, so the 2,520 names are tree-shaken out entirely. They begin costing
  bytes on the day decision 2 gives them a reader, which is the right time for
  a reviewer to weigh it and not now.
- Nothing here gives the simulation a gender model, and the pools have one
  flat `givenNames` list each, because the simulation has nothing to attach
  one to — the placeholder's docblock said so and it is still true.

## Weakest claim in this document

Decision 2(b) — that a prison should mix traditions rather than hold one — is
a **judgement about what makes the game better**, argued from the
placeholder's own deliberate mix and from nothing measured. A player might
well find a prison whose population reads as one place more legible than one
that reads as nowhere. It is also the one part of decision 2 that could be
reversed later at no cost to a save, since a one-pool plan is a plan with one
entry.
