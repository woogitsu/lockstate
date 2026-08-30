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

## Where to start

Find the subsystem before reading anything else. Each line is *first code path;
tests that already cover it; the document that governs it.* If a change spans
two lines, it probably crosses a boundary listed above — say so in the PR.

- **Simulation kernel, tick order, RNG streams** — `src/simulation/kernel/`, `src/simulation/rng/`; `tests/determinism/`; `docs/DETERMINISM.md`, `docs/ARCHITECTURE.md`.
- **Clock, day length, speed** — `src/simulation/clock/`; `tests/determinism/`; `docs/DETERMINISM.md`.
- **Prisoners, needs, jobs, regime** — `src/simulation/prisoners/`, `src/simulation/operations/`; `tests/integration/`; `docs/PRISONER_OPERATIONS.md`.
- **Staff, wages, payroll** — `src/simulation/staff/`, `src/simulation/economy/`; `tests/integration/economy-*.test.ts`; `docs/OPERATIONS.md`.
- **Economy, procurement, build orders** — `src/simulation/economy/`, `src/simulation/construction/`; `tests/integration/economy-*.test.ts`; ADR 0017, ADR 0075.
- **Incidents, escapes, contraband, security** — `src/simulation/incidents/`, `src/simulation/security/`, `src/simulation/contraband/`; `tests/integration/incident*.test.ts`; `docs/INCIDENTS.md`, `docs/SECURITY.md`, `docs/CONTRABAND.md`.
- **World, rooms, objects** — `src/simulation/world/`, `src/simulation/rooms/`, `src/simulation/objects/`; `tests/integration/`; `docs/WORLD.md`.
- **Pathfinding and movement** — `src/simulation/navigation/`, `src/simulation/locomotion/`; `benchmarks/scenarios/`; `docs/NAVIGATION.md`.
- **Worker messaging and protocol** — `src/simulation/protocol/`, `src/simulation/worker/`; `tests/contract/`; `docs/ARCHITECTURE.md`, ADR 0006, ADR 0024.
- **Persistence and save format** — `src/persistence/`; `tests/migrations/`, `tests/contract/`; `docs/PERSISTENCE.md`, ADR 0038.
- **Cloud save and SQL** — `src/persistence/cloud/`, `supabase/`; `pnpm verify:sql`; `docs/CLOUD_SAVE.md`, `docs/TRUSTED_SERVICES.md`. `supabase/migrations/` is the owner's.
- **Rendering** — `src/rendering/`; `tests/browser/`; `docs/RENDERING.md`.
- **HUD, panels, projections** — `src/ui/`, `src/simulation/presentation/`; `tests/unit/ui-*.test.ts`, `tests/browser/`; `docs/HUD_PROJECTIONS.md`.
- **Input and controls** — `src/input/`; `tests/browser/`; `docs/INPUT.md`.
- **Player-visible text** — `src/content/`, `src/services/localization/`; `tests/foundation/localization-*.test.ts`; `docs/CONTENT.md`, `docs/LOCALIZATION.md`. New player-facing wording is the owner's (see below).
- **Performance** — `benchmarks/`, `tests/perf/`; `pnpm verify:benchmark`; `docs/BENCHMARKING.md`. Record before *and* after.
- **Deployment and hosting** — `docs/DEPLOYMENT.md`; `pnpm verify:deployment`. Configuration there is the owner's.

Repository-wide rules that no single subsystem owns live in `tests/foundation/`;
that directory is where a gate goes when the invariant is about the repository
rather than the game.

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

## Reading the repository

Search first, read narrowly second, read a whole large file only when the
evidence asks for it. The order that works here: find the symbol, open the
source file around it, open the test that already pins it, widen only when what
you found does not explain what you are seeing.

None of this licenses a shallow answer. Architecture work legitimately reads
whole files and whole subsystems, and the mandate above is explicit that cost is
not a constraint. The rule is against reading that buys nothing: opening a large
file to "get oriented" rather than to answer a question, pasting a whole log or
a generated artifact when the failing lines would do, scanning a subsystem the
change does not touch, or walking git history with no claim to establish. Every
one of those is answerable with a search.

## Running the checks while you work

`pnpm verify` — typecheck, the full suite and the production build — is the
gate at completion and is not negotiable. It is not the command to run after
every edit, and the ladder below is measured on this repository, at v0.0.262:

- **One test file** — `pnpm exec vitest run tests/unit/<file>.test.ts` — 0.8 s.
- **One directory** — `pnpm exec vitest run tests/determinism` — 7.5 s.
- **The suite** — `pnpm test` — 62 s over 349 files.
- **The gate** — `pnpm verify`, plus whatever the changed subsystem requires:
  `pnpm test:browser` for anything a player clicks, `pnpm verify:benchmark` for
  a performance-sensitive path, `pnpm verify:sql` for `supabase/`,
  `pnpm verify:assets` for the runtime atlases.

Work at the smallest rung that can fail for the reason you care about, and climb
when the change stops being local. A full run after a two-line edit is 80 times
the wait for the same information.

**Mutation proof sits on the bottom rung, not the top.** "A green suite is not a
guarded suite" (`docs/AGENT_WORKFLOW.md` §3) requires the production code to be
mutated and the test watched going red — against the *targeted* test, not the
suite. The cycle is: write the test, break the production code, watch that one
file go red, restore the code by hand, watch it go green, then climb. Restoring
by hand rather than with `git checkout`/`stash`/`restore` is what keeps the rest
of your working tree; a mutation that survives is reported, never quietly
covered.

**Do not reach for `--reporter=dot`.** Measured on this repository: the default
reporter prints **9 lines / 231 bytes** on a clean full run, and `--reporter=dot`
prints **147 lines / 17,888 bytes** for the same run — 77 times the output, no
extra information. `pnpm typecheck` is 6 lines and `pnpm build` is 29 when they
pass. Every one of these is already terse on success and verbose on failure,
which is the behaviour worth keeping; do not add flags that undo it.

## Prohibited behavior
- Do not replace approved technologies without an ADR and explicit human approval.
- Do not add a dependency for trivial functionality.
- Do not put secrets, service-role keys or production credentials in client code.
- Do not disable TypeScript strictness to make errors disappear.
- Do not mark an issue complete while acceptance criteria remain unverified.
- Do not copy Prison Architect code, assets, text, UI layouts or protected content. Research may inform mechanics, but Lockstate must have its own implementation and identity.
- Do not optimize for token use, API cost or shortest implementation when doing so reduces engineering quality.

## What belongs in this file

This file and `CLAUDE.md` carry project-wide rules and navigation. They are not
a changelog, a post-mortem archive or a bug diary, and the way they turn into
one is a paragraph at a time. When something is learned, file it where it will
still be found:

- A rule that binds every agent → here.
- A rule that binds one subsystem → that subsystem's document under `docs/`.
- A decision with alternatives and consequences → an ADR.
- A bug that must never return → **a regression test**, which is the only form
  that fails when it is violated.
- A repository-wide invariant → a gate in `tests/foundation/`.
- Why something is the way it is → the ADR, the issue, or the commit message.
- An investigation still in progress → an issue, not a permanent instruction.

The reusable rule belongs here; the forensic story does not. *"Regime
transitions must stay deterministic across tick boundaries — see
`tests/determinism/`"* is a rule. Four paragraphs about the session that
discovered it are history, and history goes in the issue that recorded it.

## Definition of done
A change is done only when it is correct, typed, tested, documented where necessary, buildable, reviewable and consistent with the architecture.
