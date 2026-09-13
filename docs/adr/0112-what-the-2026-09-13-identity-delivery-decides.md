# ADR 0112: What the 2026-09-13 identity delivery decides

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0112, this file, its row and
> every citation of it get renumbered without argument, exactly as ADRs 0110 and
> 0111 each pre-committed.
>
> **The arithmetic, performed rather than trusted.** `docs/adr/README.md`'s own
> **Next free number** line reads 0112. Swept 2026-09-13 from `origin/main` at
> `e5628369`: every fetched remote head read with
> `git ls-tree --name-only <head> -- docs/adr/`, **320 heads**. The highest
> four-digit prefix on any of them is **0111**, and nothing at 0112 or above
> appears on any.

## Status

**Proposed, 2026-09-13. Not self-approved.**

What follows is a reading of an owner delivery, a recommendation, and the
decisions the delivery forces. The delivery itself is not in question: the owner
made it, it is theirs, and it is vendored verbatim under
[`docs/design/2026-09-13-identity-v5/`](../design/2026-09-13-identity-v5/). What
is in question is what this repository binds itself to as a result, and that is
the owner's to settle.

**The provenance of the delivery, stated exactly, because this repository has
been burned by paraphrase.** It arrived as a ZIP in a working session with the
message *"z gpt 6 wygenerowałem nowy styl, wygląd, sposób komunikacji,
przedstawiania, nowa identyfikacja wizualna, itp itd, wyślij plik na repo,
zapoznaj się z nim, napisz kompletny rozbudowany plan wdrożenia, zmodyfikuj
wszystkie pliki bazowe repo, żeby nigdy nie zaginęło po zakończeniu tej sesji"*
("with gpt 6 I generated a new style, look, way of communicating, of presenting,
a new visual identity, etc. etc., put the file on the repo, read it, write a
complete extensive implementation plan, modify all the base repo files so it is
never lost after this session ends"). That instruction is why the tree is
vendored, why `docs/VISUAL_IDENTITY.md` and `docs/IDENTITY_V5_ROLLOUT.md` exist,
and why this ADR exists. **It is not an acceptance of anything in this
document**: "put it on the repo and write a plan" is a different sentence from
"adopt these twenty articles as product rules".

## Context

This repository has an interface that works and was never designed. Its tokens
are a deliberate cold institutional set with one interactive hue; its type scale
is 13 px body and 11 px labels; it has five HUD tabs, two collapsible panels and
no theme switch. The delivery is the first time a *whole* direction — palette,
type, rhythm, navigation, voice, device behaviour and a twenty-article product
constitution — has existed for it in one place.

The delivery is also unusually honest about its own limits, and that honesty is
what makes it usable here. It states that its sample prices, roles, prisoner
counts and campus layout are demonstration; that its build loop validates
nothing; that its `localStorage` save has a known two-tab overwrite hole; that
its map is one illustration and not an atlas; that its own logic tests prove
nothing about layout, touch or accessibility; and that browser QA was never run.
An outside brief that lists what it did not verify is rarer than one that is
right.

`docs/VISUAL_IDENTITY.md` is the repository-side reading of the direction and
carries the measured gap against today's code.
`docs/IDENTITY_V5_ROLLOUT.md` is the nine-stage plan.

## The decisions

Each is stated so the owner can answer yes or no. None is taken here.

### Decision 1 — Does the twenty-article constitution bind this repository?

**Recommendation: yes, as a product contract subordinate to `AGENTS.md`.**

Six of the twenty articles (1, 2, 4, 7, 10, 13) restate constraints this
repository already holds — the map is the game, projections are the single
source, the UI does not recompute simulation state, touch is first-class, input
stays remappable, preferences are not world state. Adopting those costs nothing
and makes them legible to a designer rather than only to an agent reading
`AGENTS.md`.

The other fourteen are new, and article 5 is the expensive one: *every sentence
is true*. It is expensive because this repository already has open issues about
sentences that are not — a state grant withheld silently, a refusal still on
screen days later, a cost note that disagrees with the cost. Adopting article 5
converts those from defects somebody might fix into a standing contract.

**What would change my mind:** if the owner wants the constitution to remain
design material rather than a contract, it stays where it is, quoted and not
binding, and `docs/VISUAL_IDENTITY.md` says so in one sentence.

### Decision 2 — Does the light palette become the default theme?

**Recommendation: yes, with the dark theme kept and both gated on contrast.**

The delivery designs the day palette as the primary surface and the night
palette as a real alternative, switchable, system-following and remembered. This
repository has only the dark one and no switch.

The cost is not the colours; it is that `src/ui/tokens.css` has one palette by
construction and every semantic alias resolves into it. Stage 1 of the rollout
is that restructuring, and it is the largest single piece of work in the whole
direction.

**The constraint that is not negotiable either way:** three owner rulings of
2026-09-02 on issue #788 are recorded in that file with the exact contrast
ratios they were chosen to clear, and `tests/unit/ui-design-tokens.test.ts`
computes those ratios rather than pinning them. Both themes clear them, or the
change does not land.

### Decision 3 — Does the navigation move to the delivery's five sections?

**Recommendation: not until the stage 0 inventory exists.**

The direction's five (Overview, Build, Zones, Manage, Day plan) are not this
repository's five (`overview`, `build`, `rooms`, `security`, `regime`), and the
prototype is narrower than the game — it shows no intake, contraband, incident
or save surface. The delivery itself puts this first: *"Zanotuj brakujące
powierzchnie, zanim zaczniesz usuwać stary UI."*

Moving staff from Security to Manage is a UI grouping the delivery explicitly
marks as a naming proposal rather than a module move. That much is ours.

### Decision 4 — Does the type scale move to 16 / 14 / 12?

**Recommendation: yes, surface by surface, with the default flipped last.**

The honest risk is that some panels do not have the room, and the honest outcome
may be that a few keep a denser step with the reason written down. Saying that
now is cheaper than discovering it after every panel has been rebuilt.

### Decision 5 — What happens to the world illustration?

**Recommendation: it is a reference, and nothing is cut out of it.**

The delivery says so, `docs/ART_PIPELINE.md` says how production art is made
here, and the mechanical trap is worth restating because it costs a CI cycle
every time it is forgotten: the `git lfs pull --include=` list in
`.github/workflows/ci.yml` is a literal list of globs, not a pattern, and that
file is owner-reserved. **Every batch of new art needs a release from the owner
before CI can go green on it.**

## Consequences

**If accepted**, the rollout in `docs/IDENTITY_V5_ROLLOUT.md` becomes the work
order, `docs/VISUAL_IDENTITY.md` becomes the reference every UI change is
checked against, and the constitution's article 5 becomes a gate that several
open issues are already failing.

**If rejected in whole or in part**, nothing is lost: the delivery is vendored,
the reading is written down, and the parts that are not adopted are marked as
not adopted rather than deleted — which is the rule `docs/AGENT_WORKFLOW.md` §4
applies to corrections generally.

**In either case** the delivery does not move a single line of simulation,
persistence, protocol or deploy configuration, and this ADR does not ask to.

## The weakest claim in this document

That the delivery's own account of what it verified is accurate. It says its
nine logic tests passed and that no browser QA was ever run; the tests are
present as `AKTUALNY_PROTOTYP/tests/audit.cjs` and were not re-run here, and the
absence of browser QA cannot be checked at all. Nothing in this ADR depends on
either — the delivery is treated as a *direction*, whose value does not rest on
its mock's test results — but an agent quoting *"9/9 PASS"* as evidence about
anything in this repository would be quoting a claim nobody here has checked.

## References

- [`docs/design/2026-09-13-identity-v5/`](../design/2026-09-13-identity-v5/) — the delivery, verbatim
- [`docs/VISUAL_IDENTITY.md`](../VISUAL_IDENTITY.md) — the repository-side reading
- [`docs/IDENTITY_V5_ROLLOUT.md`](../IDENTITY_V5_ROLLOUT.md) — the nine-stage plan
- [ADR 0097](./0097-what-the-world-view-is-required-to-communicate.md) and [ADR 0111](./0111-how-a-room-instances-rectangle-reaches-the-render-side.md) — the room-identity transport this direction's inspector will need
