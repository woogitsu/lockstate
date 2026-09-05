# Lockstate Agent Operating Contract

This file is the canonical operating contract for AI coding agents working in this repository. `CLAUDE.md` and `.agents/rules/` must point back to these rules instead of diverging from them.

## Product principle
Lockstate.io is a long-lived browser simulation project. Optimize for architectural correctness, maintainability, determinism, testability, performance headroom and player experience. Do not choose a shortcut merely because it is faster, cheaper, or easier for an agent.

## Mandatory stack
- TypeScript in strict mode from the first implementation.
- Phaser 4 for world rendering.
- Vite 8 for local development and production builds.
- Cloudflare Workers Static Assets for production delivery.
- Supabase for auth, metadata, cloud persistence and future trusted services.
- IndexedDB for local-first persistence and recovery.
- Dedicated Web Worker for the simulation kernel once simulation work begins.
- No PHP backend and no server-authoritative simulation in the MVP architecture.

## Architectural boundaries
1. Rendering is not simulation. Phaser must never become the source of truth for game state.
2. Simulation state must be serializable, versioned and deterministic.
3. The main thread owns rendering, browser UI and input orchestration.
4. The simulation worker owns simulation ticks and authoritative in-session game state.
5. Persistence consumes explicit snapshots; persistence code must not reach into renderer internals.
6. Content definitions belong in data modules, not hard-coded condition chains.
7. Every persistent format must have a version and migration strategy before release.
8. World storage is chunked. Never introduce a giant monolithic map matrix as the long-term representation.
9. Pathfinding must be budgeted and hierarchical. Never run unrestricted full-map A* per agent per frame.
10. Input must support remapping, QWERTY/AZERTY and touch/pointer interaction.

## How this work is carried out
`docs/AGENT_WORKFLOW.md` is the operating *method* that accompanies this
contract: how work is picked up between sessions, how it is split across several
agents at once, and what evidence a finding needs before it is reported. This
file governs what an agent may do; that one governs how. Where they disagree,
this file wins.

The parts of it that are rules rather than advice:
- An implementing agent takes its own git worktree before it touches anything.
- Parallelise across unrelated surfaces, serialise within one. Name each agent's
  surface, and the others', in its brief.
- **Nothing may exist only in the container.** A session dies without warning
  and takes every unpushed change with it, so every agent commits *and pushes*
  after its first coherent chunk rather than at the end, and a coordinator runs
  `scripts/wip-sweep.sh` beside them instead of relying on them to. See
  `docs/AGENT_WORKFLOW.md` §2.
- ADR numbers are assigned centrally, after drafts return. A number is not
  reserved until it appears in `docs/adr/README.md`.
- A test proves nothing until the production code has been mutated and that test
  watched going red. Report both outputs.
- Never report a result you did not obtain, and open every `file:line` you cite.
- Correcting the brief you were given is expected. "Already fixed, here are the
  numbers" is doing the job.

## The owner's standing mandate, and the four things it does not cover

Recorded 2026-08-27, in the owner's own words: *"pracuj autonomicznie cały czas
… jak potrzebujesz decyzji to rób research i wybieraj jakościowo, nie tanio.
Żeby gra była fajna i super, a nie po taniości zrobiona. Cena nie gra roli."*

So, unless a rule below says otherwise:

- **Decide rather than ask.** Where a choice is genuinely open, research it,
  choose, and record why — in an ADR when it is architecture, in the commit
  message when it is not. Coming back with a question you could have answered
  by reading the code is not caution, it is the work undone.
- **Cost is not a constraint, and quality is the deliverable.** Token use, API
  spend and elapsed time do not justify a worse answer. The Product principle
  above already said this about shortcuts; this says it about effort.
- **Playability counts as correctness here.** A change that is right in every
  test and makes the game duller has not succeeded. Say so when you see it.

**Four things stay the owner's, and no mandate above reaches them.** Each is
outward-facing or unrevertable, which is the whole reason:

1. **A server-side execution surface.** Do not add `main` to `wrangler.jsonc`
   and do not create a Worker. This project has never run server code; ADR 0002
   rejected an entry point deliberately, and ADR 0046's telemetry ingest is the
   first thing that would need one. `docs/DEPLOYMENT.md` carries the nine-item
   pre-merge checklist that has to be worked and approved first.

   **Released by the owner on 2026-09-03, for ADR 0046's ingest and for
   nothing else.** The paragraph above is left as it stands rather than
   rewritten, because it is the reservation that was released and a reader
   needs to see what was given up. The decision was put to the owner as three
   options — prepare the change for review without merging it, leave the
   surface blocked, or build it and merge it — and they answered:

   > Zbuduj i zmerguj

   ("Build it and merge it.") **That is the owner's decision and not a
   recommendation of this repository's**, which is why it is recorded here in
   their words with the date on it, per `docs/AGENT_WORKFLOW.md` §3's rule that
   an implementing agent does not approve its own work.

   **What the release covers, exactly.** One `main` in `wrangler.jsonc` and the
   Worker module it names, carrying the telemetry ingest ADR 0046 describes.
   It is not a general licence to run server code: a second route, a second
   handler, or any server-side behaviour that is not that ingest is back inside
   this reservation and comes to the owner on its own terms. `src/worker/`'s
   entry point states the same limit in its own docblock, with the threat model
   for what it accepts from the open internet.

   **What was not released, and is still owed.** Items 2 and 3 below are
   untouched, and the ingest needs both before it stores anything: the
   `telemetry_events` table, its insert function and the dedicated
   least-privilege database role are `supabase/migrations/`, and the two Worker
   variables that would configure a destination are deploy configuration. Until
   those land the endpoint refuses every batch, which is why merging the entry
   point changes no behaviour on `lockstate.io`.

   **HALF OF THAT IS NO LONGER OWED, AND THE PARAGRAPH ABOVE IS KEPT RATHER
   THAN REWRITTEN BECAUSE IT IS THE STATE THIS DOCUMENT DESCRIBED FOR A DAY.**
   The migration landed on 2026-09-04 in
   `supabase/migrations/20260904090000_create_telemetry_events.sql`, authorised
   by the owner as four objects plus retention: the `telemetry_ingest` role
   (`:152`), the `telemetry_events` table (`:203`),
   `record_telemetry_events(p_events jsonb)` (`:568`) and the retention pair
   (`telemetry_retention_runs` at `:759`, `enforce_telemetry_retention()` at
   `:951`). **Item 2 was not thereby released** — a further migration is still
   the owner's, and this one was authorised individually.

   **The conclusion still holds and now holds for a different reason, which is
   why a reader must not stop at the premise.** The endpoint still refuses every
   batch, but because `LOCKSTATE_TELEMETRY_INGEST_PATH` is unbound — the Worker
   reads it at `src/worker/telemetry-ingest-route.ts:12`, and that binding is
   deploy configuration, item 3, untouched. **So an agent who checks the
   sentence above, finds the migration present, and infers the endpoint is live
   would be wrong.** Retention additionally needs `pg_cron` enabled from the
   Supabase panel and the scheduled call made there; until that happens
   `enforce_telemetry_retention()` is a function nothing invokes.
2. **`supabase/migrations/`.** An applied migration is history. Propose new
   migration content in an ADR or an issue instead. Rollback is not automated.
3. **Deploy configuration** — `public/_headers`, `.github/workflows/deploy.yml`,
   the Cloudflare or Supabase dashboards. Nothing in this repository can read
   back what those dashboards hold, so a change there cannot be verified here.
4. **Anything that reaches a player as a promise the code does not keep.** A
   locale key with no implementation behind it is the defect that forced the
   telemetry decision; do not add one, in any tree.

   **Partly released by the owner on 2026-09-04: the CHOICE OF WORDS is ours
   now; the requirement that a sentence be TRUE is not.** Until that date this
   reservation was read strictly, and the reading was wider than the words
   above: agents and the integrator reported *what a sentence must convey* and
   authored none, so every player-visible string waited on the owner. Four such
   sentences were waiting when the release came (#901, #903, #904, #893), and
   two more had just been found by playing — a FUNDS badge asserting the state
   owed a prison money it did not owe (#913), and one all-clear sentence
   serving both a handled incident and an expired one.

   Asked which words each should carry, the owner answered twice, to two
   different questions, in the same direction:

   > Sam decyduj zawsze, jak zacznę grać to ujednolicimy

   ("Decide yourself, always; when I start playing we will unify them.")

   > Wybierz sam a potem się ujednolici sposób pisania

   ("Choose yourself, and afterwards the way it is written will be unified.")

   **What the release covers, exactly: choosing the wording.** It does not
   touch the reservation's actual subject, which is the *promise*. A sentence
   we now write ourselves must still be true of the code that renders it, and
   the way to establish that is to open that code — the two findings that
   prompted the release were both false sentences, not badly worded ones. So
   the rule that replaces "ask the owner" is **verify, then write**, and a
   string whose truth cannot be established still does not ship.

   **What we owe the owner in exchange.** They said the wording will be
   *unified* once they play, which is only possible if they can find what we
   wrote. Every string authored under this release is therefore recorded — in
   the commit that lands it and in the pull request body, quoted verbatim
   alongside the code opened to prove it true — so the harmonising pass is one
   reading rather than an excavation.

   The paragraph above this release is left exactly as it stood, for the same
   reason reservation 1's is: it is the rule that was relaxed, and a reader
   needs to see what was given up.

**Merging publishes.** `deploy.yml` fires on CI completion and its `staging` job
publishes on every merge to `main`, and `lockstate.io` is attached by hand to
that Worker — so a merge updates the public site with no further approval gate
(`docs/DEPLOYMENT.md`, "What currently serves lockstate.io"). Merge green,
ordinary increments under the mandate. Anything touching the four above goes to
the owner with the evidence, not to `main`.

## Required workflow for every issue
Before coding:
- Read the issue, linked ADRs and relevant docs.
- Inspect existing implementation before proposing a new abstraction.
- State assumptions in the PR when requirements are underspecified.

Before completion:
- Run typecheck, tests and production build.
- Add or update tests for behavior introduced.
- Update docs/ADRs when a contract changes.
- Include performance evidence for performance-sensitive systems.
- Do not silently broaden scope.

## Prohibited behavior
- Do not replace approved technologies without an ADR and explicit human approval.
- Do not add a dependency for trivial functionality.
- Do not put secrets, service-role keys or production credentials in client code.
- Do not disable TypeScript strictness to make errors disappear.
- Do not mark an issue complete while acceptance criteria remain unverified.
- Do not copy Prison Architect code, assets, text, UI layouts or protected content. Research may inform mechanics, but Lockstate must have its own implementation and identity.
- Do not optimize for token use, API cost or shortest implementation when doing so reduces engineering quality.

## Definition of done
A change is done only when it is correct, typed, tested, documented where necessary, buildable, reviewable and consistent with the architecture.
