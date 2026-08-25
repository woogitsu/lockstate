# Research records

Dated evidence gathered to answer a specific open decision, kept because the
decision cites it.

These are **not** architecture decisions and they are not documentation of how
the code works. An ADR records what was decided; a file here records what was
known at the time it was decided, including what could not be established. They
are read-only history: when the code moves on, a record here does not become
wrong, it becomes older. Do not update one to match current `main` — write a new
one and let the ADR cite that instead.

## What makes a record trustworthy here

Each report labels every factual claim with how it was obtained, and the tiers
are not decoration:

- **VERIFIED** — a source was opened and read. In this repository's network
  environment that mostly means a shipped game data file or decompilation
  mirrored on `raw.githubusercontent.com`, which is reachable, and quoted
  verbatim.
- **SEARCH-SUMMARY** — a real page exists and a search tool summarised it, but
  the page itself was never opened. Weaker than VERIFIED and deliberately kept
  as its own tier rather than folded into it.
- **FROM MEMORY** — believed, not checked. Useful, and honest about being the
  weakest kind of claim.
- **UNKNOWN** — could not be established.

The tiers exist because of a specific failure. An earlier research round
produced roughly two hundred citations, and spot-checking twelve of the specific
factual claims found: two refuted outright (a keybinding attributed to a base
game that belongs to a mod, and one that does not exist at all), a starting
balance wrong by more than an order of magnitude, a currency range that silently
depended on a DLC nobody mentioned, and **a design opinion attributed by name to
a real developer that could not be sourced anywhere**. The claims that failed
were disproportionately the confidently precise ones.

So the standing rules for anything added here:

- Never invent a patch number, version, date, price or quote.
- Never average two figures you are unsure of into a range described as version
  variance. Say you are unsure of both.
- A forum post, a video tutorial or a search snippet is not a source for what a
  designer intended.
- Currency figures from other games are unusable for balancing this one unless
  genuinely sourced. Derive from this game's own costs instead.
- Name your own weakest claim, and say what would change your mind.

## Records

| Record | Question it answered | Decision it fed |
| --- | --- | --- |
| [2026-08-25 room zoning gesture](./2026-08-25-room-zoning-gesture.md) | What gesture designates a room, and where does the control live? | ADR 0022 |
| [2026-08-25 room occupancy](./2026-08-25-room-occupancy.md) | Where does a room's occupancy capacity come from? | ADR 0023 |
| [2026-08-25 economy rate](./2026-08-25-economy-rate.md) | What does the state pay per prisoner-day, on what cadence, from what balance? | [#29](https://github.com/matmaxalez/lockstate/issues/29), within ADR 0017 |

### Findings from these three that changed a decision

Recorded here because each contradicted something the project believed, and a
reader who only sees the resulting ADR will not know the belief was ever held.

- **Authoring one occupancy number per room type is a no-op.** `findAvailable`
  gates on capacity *and* on a `'sleep-surface'` capability, so a capacity
  number alone unblocks nothing. The minimum content change is two fields, not
  one.
- **Four of six comparable games have no room-capacity concept at all.**
  Prison Architect is the exception, and it uses a *different rule per
  designation* rather than one model.
- **"Prisoners would starve in an abstract box" is false.** Accommodation
  actions never check capability, so five of six needs become serviceable
  without any object; only hygiene requires one.
- **No game in the sample designates a nameless area and labels it later** —
  the shape the zoning question implicitly floated is genre-unattested. The
  real split is purpose-first painting versus fully derived rooms.
- **A mis-drag is currently permanent.** No command removes a zone, `Undo`
  reaches only the construction system, and re-zoning is blocked by
  `overlaps-existing-room` — so one stray drag creates unremovable room for the
  session, with no recovery at all on touch, where there is no undo key.
- **"Pack the prison" is not the reachable failure mode.** Occupancy is
  hard-gated, so overcrowding is unrepresentable; the strategy the economy has
  to price against is sprawl.
- **Construction is effectively instantaneous** — a wall completes in about
  2.5 seconds, with no labour cap and every order in parallel. Money, not
  time, is the only constraint on building today.
