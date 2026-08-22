# Lockstate development roadmap

This roadmap defines execution order. Epics may be refined, but lower layers must be stabilized before upper-layer content depends on them.

## Phase 0 — Repository and engineering foundation
- toolchain, strict typing, lint/format/test/build CI
- architecture contracts and ADR process
- benchmark harness skeleton
- Cloudflare deployment configuration
- environment/secrets policy
- issue and PR templates

## Phase 1 — Rendering shell and input
- Phaser boot scene
- camera pan/zoom
- grid visualization
- input action abstraction
- QWERTY/AZERTY-aware labels
- touch/pointer gestures
- accessibility baseline

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

## Phase 11 — Product systems
- multi-device UX
- social sharing/read-only inspector links
- verified leaderboards/challenges where appropriate
- account entitlements and paid save-slot expansion
- telemetry/crash diagnostics with privacy controls
- localization

## Release gate
No public launch solely because the feature list is large. Release requires stability, migration-tested saves, acceptable stress-test results, complete onboarding, recovery paths, production monitoring, accessibility review and a coherent original visual/gameplay identity.
