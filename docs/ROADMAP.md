# Lockstate development roadmap

This roadmap defines execution order. Epics may be refined, but lower layers must be stabilized before upper-layer content depends on them.

## Cross-cutting: the 2026-09-13 identity direction

The visual identity / HUD direction the owner delivered on 2026-09-13 is not a
phase of its own — it is a cross-cutting interface programme that reaches into
phase 1, phase 10 and phase 11 below, and the Release gate's "coherent original
visual/gameplay identity" line is exactly what it is meant to supply.
`docs/VISUAL_IDENTITY.md` is the repository-side reading against today's code,
`docs/IDENTITY_V5_ROLLOUT.md` is the nine-stage rollout plan, and
[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) is the
decision record. **It was Proposed when this paragraph was written and the
owner accepted it the same day, in five rulings, two of which went against its
recommendations** — so the phases below are committed to the direction, with the
scale being 15 / 13 / 11 rather than the delivery's 16 / 14 / 12 and the
navigation moving without waiting for the inventory. ADR 0112's Status block
carries each ruling and its provenance.

## Phase 0 — Repository and engineering foundation
- toolchain, strict typing, test/build CI (there is no linter or formatter in this repository)
- architecture contracts and ADR process
- benchmark harness skeleton
- Cloudflare deployment configuration
- environment/secrets policy
- issue templates

## Phase 1 — Rendering shell and input
- Phaser boot scene
- camera pan/zoom
- grid visualization
- input action abstraction
- QWERTY/AZERTY-aware labels
- touch/pointer gestures
- accessibility baseline
- identity rollout stages 1–3: theme token architecture, type scale, and the
  resizable/collapsible HUD shell (`docs/IDENTITY_V5_ROLLOUT.md`) — stage 3
  explicitly binds the resize handle into this phase's input abstraction
  rather than beside it

## Phase 2 — World/chunk model and land ownership
- sparse chunk coordinates
- chunk lifecycle and serialization
- terrain layers
- purchased parcel model
- world expansion pricing hooks
- culling/streaming benchmarks

## Phase 3 — Deterministic simulation kernel
- dedicated worker
- fixed timestep scheduler
- deterministic RNG
- typed command/event protocol
- snapshot/delta protocol
- headless simulation test harness

## Phase 4 — Construction and room topology
- floors, walls, doors, fences
- build jobs and cancellation
- room enclosure/topology
- zoning and validation
- undo/redo command model
- blueprint/copy concepts

## Phase 5 — Persistence
- IndexedDB local saves
- save schema/versioning/migrations
- compressed snapshots/checksums
- Supabase anonymous auth
- cloud sync
- optimistic concurrency/conflict UI
- backup generations and recovery

## Phase 6 — Navigation and entities
- entity IDs/storage
- local nav grid
- hierarchical connectivity
- door/security permissions
- path budget scheduler
- cache invalidation
- 250/1000/2500/5000 actor benchmarks

## Phase 7 — Prison operations foundation
- prisoner intake/classification
- cells/holding/reception
- staff hiring and assignment
- regime/schedules
- needs
- jobs/tasks
- food/logistics
- utilities

## Phase 8 — Security and emergent behavior
- deployment/patrols
- access control
- intelligence/contraband
- searches and inspections
- violence/incidents
- escape planning/tunnels
- gangs/social systems
- lockdown/roll call/emergency response

## Phase 9 — Economy, progression and rehabilitation
- grants, operating costs and procurement
- research/administration unlocks
- education/work/therapy programs
- parole/release/reoffending systems
- reputation, inspectors and external pressure

## Phase 10 — Content depth and presentation
- high-quality Blender-to-sprite pipeline
- 8-direction character animation sets
- audio/music/ambience
- reports/overlays/tutorials
- weather/environmental systems
- scenarios/challenges
- identity rollout stage 7: world art against the delivery's reference
  illustration, through the existing pipeline (`docs/IDENTITY_V5_ROLLOUT.md`,
  `docs/ART_PIPELINE.md`)

## Phase 11 — Product systems
- multi-device UX
- social sharing/read-only inspector links
- verified leaderboards/challenges where appropriate
- account entitlements and paid save-slot expansion
- telemetry/crash diagnostics with privacy controls
- localization
- identity rollout stages 5–6: operations surfaces kept at full function
  across the new navigation, and language/locale work under the existing
  localization machinery (`docs/IDENTITY_V5_ROLLOUT.md`)

## Release gate
No public launch solely because the feature list is large. Release requires stability, migration-tested saves, acceptable stress-test results, complete onboarding, recovery paths, production monitoring, accessibility review and a coherent original visual/gameplay identity.

The 2026-09-13 identity direction is what this gate's "coherent original
visual/gameplay identity" line is meant to be satisfied by, once carried out —
and [ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) was
ruled on by the owner on 2026-09-13, which settles what to build rather than
that it is built: vendoring the delivery, writing the rollout plan and adopting
the constitution do not move this gate. The nine stages, carried out and
accepted, are what moves it.
