# Lockstate.io Architecture

## Status
Foundation architecture, pre-alpha. Architectural contracts in this file are binding unless superseded by an accepted ADR.

## Goals
Lockstate is a browser-first prison management simulation intended to scale to very large facilities and several thousand active simulated actors. The architecture must support long sessions, large saves, deterministic simulation, multiple devices, desktop/tablet/mobile interaction, and incremental expansion without replacing the core runtime later.

## Runtime topology

```text
Browser main thread
  UI / DOM overlay
  Input abstraction
  Phaser 4 renderer
  Camera / visual effects / animation
          |
          | versioned typed commands + snapshots/deltas/events
          v
Dedicated Simulation Worker
  fixed-step scheduler
  world/chunk state
  entity store
  AI / needs / jobs / regime
  navigation / path budgets
  economy / logistics / security
  deterministic RNG
          |
          | versioned snapshots
          v
Persistence layer
  IndexedDB local-first
  Supabase cloud sync
  compressed immutable save versions
```

## Core rules

### Simulation is authoritative in-session
Phaser objects are views. Their position, animation and visual state are derived from simulation data. A sprite must never become authoritative game state.

### Fixed-step simulation
Simulation time advances in deterministic fixed ticks independent of rendering FPS. Systems run at explicit frequencies; expensive low-frequency systems must not run every tick merely for convenience.
The `Kernel` orchestrates this logic using a strict 50ms tick interval and deterministic system ordering. See [DETERMINISM.md](./DETERMINISM.md) for full details on tick semantics, command ordering, and RNG ownership.

### Worker boundary
The simulation is designed to execute in a Dedicated Web Worker. The only supported main-thread/worker boundary is the versioned protocol under `src/simulation/protocol/`, defined by [ADR-0003](./adr/0003-simulation-worker-protocol.md). The worker lifecycle and state machine are governed by [ADR-0006](./adr/0006-simulation-worker-adapter.md).

Boundary rules:
- every received value is decoded through the direction-specific runtime validator before dispatch;
- the main thread sends lifecycle requests, semantic clock controls and ordered commands, but never render-frame deltas or direct state mutations;
- the worker publishes snapshots, deltas and domain events; renderer or Phaser objects never cross the boundary;
- request/response operations use stable message IDs and explicit correlation;
- malformed, wrong-direction or incompatible messages fail closed before simulation state is touched;
- domain payload schemas evolve independently from the envelope protocol version;
- normal control traffic uses structured clone with finite, acyclic JSON-compatible values;
- an `ArrayBuffer` may be transferred only through an explicit versioned payload and transfer list, and the sender must treat it as detached after posting;
- `SharedArrayBuffer` is not approved without a separate concurrency, cross-origin-isolation and benchmark decision.

The current protocol is intentionally strict during pre-alpha. Wire-contract changes require tests and ADR review rather than silent widening.

### Chunked world
The world is sparse and chunk-addressed. Land ownership determines buildable regions. Unpurchased land can exist as cheap metadata without fully materializing all gameplay layers.

A candidate chunk size is 32x32 logical tiles, but this is not final until benchmarked against 16x16 and 64x64 workloads. The final choice requires an ADR backed by measurements.

### Entity representation
Public domain concepts may expose typed objects, but hot-path simulation data should avoid thousands of allocation-heavy class instances. Prefer stable numeric/entity IDs, dense component storage where useful, pooled transient structures and explicit ownership.

### Navigation
Navigation is hierarchical and budgeted:
1. sector/chunk-level connectivity,
2. portal/door graph,
3. local grid search,
4. path cache with geometry-version invalidation,
5. flow fields or shared route structures for high-volume common destinations where benchmarks justify them.

A full-map A* per actor per frame is forbidden. The region/portal graph, door/permission model, route format and cache invalidation are defined in [NAVIGATION.md](./NAVIGATION.md); flow fields, shared-route optimization and CPU budgets are separate, not-yet-implemented work (#22).

### Saves
Local-first persistence uses IndexedDB. Cloud persistence uses Supabase Auth + Postgres metadata and, when snapshots become large enough, Supabase Storage for compressed payloads. The versioned save envelope, its runtime schema, checksum and forward-migration framework are defined in [PERSISTENCE.md](./PERSISTENCE.md) independently of which storage backend consumes it.

Every save contains at minimum:
- save schema version,
- game build/version,
- prison ID,
- monotonically increasing revision,
- simulation tick,
- deterministic RNG state/seed,
- timestamps,
- checksum,
- chunk/world data,
- entity/system state.

Save migrations are forward-only, explicit and tested against fixture saves.

### Multi-device conflicts
Cloud writes use optimistic concurrency. A client may only advance revision N to N+1 if N is still current. If another client has advanced the save, the user receives a conflict workflow instead of silent last-write-wins data loss. The schema, RPC and client-side sync/conflict policy implementing this are defined in [CLOUD_SAVE.md](./CLOUD_SAVE.md).

### Authentication
Players may start without registration. Anonymous/local play can later be upgraded to a durable Supabase identity using supported linking flows. Entitlements such as additional save slots belong to account metadata, not the simulation save payload. The entitlement ledger, its derived projection and the offline degradation policy are defined in [TRUSTED_SERVICES.md](./TRUSTED_SERVICES.md).

### Security
Only the Supabase anon/publishable client key may appear in frontend configuration. RLS is mandatory for user data. Service-role credentials are never shipped to the browser. Trusted features (payments, verified leaderboards, entitlement mutation, anti-abuse checks) use Supabase Edge Functions or Cloudflare Workers server logic without moving the simulation server-side. The trust zones, the required shape of every trusted entry point and the threat model are defined by [ADR-0008](./adr/0008-trusted-service-boundary.md).

### Trusted services layer
`src/services/` is a separate layer from the simulation, holding the contracts and pure logic for product features that cross a trust boundary or leave the device: verified challenges ([ADR-0009](./adr/0009-challenge-verification-strategy.md)), account entitlements, privacy-controlled telemetry ([ADR-0010](./adr/0010-telemetry-and-diagnostics-privacy.md)) and the localization runtime ([ADR-0011](./adr/0011-localization-architecture.md)). See [TRUSTED_SERVICES.md](./TRUSTED_SERVICES.md), [TELEMETRY.md](./TELEMETRY.md) and [LOCALIZATION.md](./LOCALIZATION.md).

Boundary rules, enforced by `tests/unit/services-layer-boundaries.test.ts`:
- no module under `src/simulation/` or `src/persistence/` may import this layer;
- the layer imports no Phaser and touches no DOM globals, so the same modules run in a tab, a worker and a trusted server function;
- nothing in it runs on the tick or frame path; every call is asynchronous, failable and optional;
- a client cache of server-authoritative state is a projection that expires and may only ever reduce what the client believes it may do.

### Localization
Stable content/simulation identifiers, message keys and translated text are three separate namespaces. Simulation code may branch on a stable id; it may never read translated text, and no translated string may be persisted, hashed, checksummed or compared. Locale catalogs are versioned data with a per-key fallback chain; the default locale is bundled and must be complete.

### Input
Input actions are abstract commands, not hard-coded characters. Keyboard defaults use physical `KeyboardEvent.code` semantics, with user-visible labels adapted where browser layout APIs are available. All actions are remappable. Touch/pointer interactions have first-class equivalents.

### Rendering and assets
Source art may be authored in Blender. Runtime game assets are pre-rendered 2D sprites/atlases. Characters target eight directional views. Assets must be atlas-packed, versioned and budgeted for CDN/static-asset limits.

## Performance philosophy
Performance budgets are contracts, not cleanup tasks. Every subsystem capable of scaling with actor count, tile count or path requests requires synthetic benchmarks before content growth hides architectural problems.

Initial stress tiers:
- 250 actors: development baseline,
- 1,000 actors: expected large prison,
- 2,500 actors: high-load target,
- 5,000 actors: stretch/engineering stress case.

Exact frame/tick budgets will be set after representative benchmark scenarios exist.
