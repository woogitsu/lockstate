# Architecture pattern audit decisions

This record distils the user-supplied audit dated 2026-08-22 into decisions
that can guide Lockstate implementation. It is not a specification and does
not override `AGENTS.md`, accepted ADRs, or individual issue acceptance
criteria.

## Provenance and licensing

- GPLv3 sources (including Project Porcupine, FyWorld and OpenWorldBuilder)
  are conceptual references only. Lockstate must use an independently written,
  clean-room implementation with its own tests and names.
- Prison Architect modding material is research only. Do not copy code, assets,
  text, UI, dumps, or data definitions into Lockstate.
- Apache-2.0 or MIT-family code may be adapted only after an explicit technical
  decision. The implementation must preserve required notices and add an entry
  to `THIRD_PARTY_NOTICES.md` with source, commit, licence and modifications.
- Do not add Grid Engine as a runtime dependency. Its Phaser-coupled state model
  is incompatible with the Simulation Worker's authority.

## Adopted architectural direction

- Phaser is a renderer only; all authoritative state, decisions and movement
  remain in the deterministic Simulation Worker.
- The topology layer is below gameplay zoning. `TopologyRegion` describes
  physical connectivity, while `RoomZone` and security policy describe
  gameplay meaning and access. They are separate references.
- Navigation will use an affected-region/portal graph for coarse routing and a
  bounded local solver for segments. Work budgets use deterministic work units
  such as node expansions, not wall-clock milliseconds.
- Before construction, needs and logistics grow separate executors, introduce a
  serializable `ActionPlan`/`ActionRunner` and an explicit reservation model.
  Item, destination-capacity and interaction claims need ownership and release
  semantics.
- Jobs use cheap eligibility filtering before cost ranking and route queries.
  Candidate lookup must be indexed; every-worker by every-job scans are not an
  acceptable scaling strategy.
- Simulation hot paths favour compact numeric IDs, deterministic ordering and
  data-oriented storage. Reference implementations may be kept in tests as
  correctness oracles for incremental topology and hierarchical navigation.

## Follow-up placement

These decisions refine, but do not expand, the existing roadmap:

- #16 establishes the first shared action/reservation primitives.
- #17 defines incremental topology, explicit outside connectivity and portal
  invalidation; it must not conflate topology with room zoning.
- #21 defines correctness contracts for hierarchical navigation and a local
  reference solver.
- #22 benchmarks A*, JPS candidates and other routing approaches on identical
  Lockstate fixtures before enabling optimizations.
- #24 and #25 consume the shared action/reservation substrate rather than
  introducing separate execution engines.

## Reference material

The source audit cited Grid Engine, Project Porcupine, DwarfCorp, FyWorld,
OpenWorldBuilder and public Prison Architect modding material. Consult the
original sources only under the licensing constraints above; this repository
record intentionally contains no copied implementation or game content.
