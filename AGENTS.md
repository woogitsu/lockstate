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
2. **`supabase/migrations/`.** An applied migration is history. Propose new
   migration content in an ADR or an issue instead. Rollback is not automated.
3. **Deploy configuration** — `public/_headers`, `.github/workflows/deploy.yml`,
   the Cloudflare or Supabase dashboards. Nothing in this repository can read
   back what those dashboards hold, so a change there cannot be verified here.
4. **Anything that reaches a player as a promise the code does not keep.** A
   locale key with no implementation behind it is the defect that forced the
   telemetry decision; do not add one, in any tree.

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
