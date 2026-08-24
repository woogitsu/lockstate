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
  Supabase cloud sync (contract and SQL only — not reachable from the app)
  immutable save versions (payloads are not compressed)
```

## Core rules

### Simulation is authoritative in-session
Phaser objects are views. Their position, animation and visual state are derived from simulation data. A sprite must never become authoritative game state.

The same rule applies to the browser UI: HUD panels read *projections* of authoritative state from `src/simulation/presentation/`, never simulation internals. The view-model, ordering, localization, bounded-value and paging contracts those projections guarantee — and the list of fields a panel would want that the simulation does not yet have — are defined in [HUD_PROJECTIONS.md](./HUD_PROJECTIONS.md).

Two of them reach the status strip today, both over a worker-to-main publication rather than a snapshot poll. The worker publishes the tick (`simulation/clock-state`) and the composition root runs `projectClockPosition` on it; the worker runs `projectStatusStrip` itself and publishes its counts (`simulation/status-counts`). The remaining projections are computed and nothing carries them yet — HUD_PROJECTIONS.md section 8 says which, and what a row-carrying projection needs before it can be published on a cadence.

### Fixed-step simulation
Simulation time advances in deterministic fixed ticks independent of rendering FPS. Systems run at explicit frequencies; expensive low-frequency systems must not run every tick merely for convenience.
The `Kernel` orchestrates this logic using a strict 50ms tick interval and deterministic system ordering. See [DETERMINISM.md](./DETERMINISM.md) for full details on tick semantics, command ordering, and RNG ownership.

### Worker boundary
The simulation is designed to execute in a Dedicated Web Worker. The only supported main-thread/worker boundary is the versioned protocol under `src/simulation/protocol/`, defined by [ADR-0003](./adr/0003-simulation-worker-protocol.md). The worker lifecycle and state machine are governed by [ADR-0006](./adr/0006-simulation-worker-adapter.md).

Boundary rules:
- every received value is decoded through the direction-specific runtime validator before dispatch;
- the main thread sends lifecycle requests, semantic clock controls and ordered commands, but never render-frame deltas or direct state mutations;
- the worker publishes snapshots, deltas, projection readouts and domain events; renderer or Phaser objects never cross the boundary;
- request/response operations use stable message IDs and explicit correlation;
- malformed, wrong-direction or incompatible messages fail closed before simulation state is touched;
- domain payload schemas evolve independently from the envelope protocol version;
- normal control traffic uses structured clone with finite, acyclic JSON-compatible values;
- an `ArrayBuffer` may be transferred only through an explicit versioned payload and transfer list, and the sender must treat it as detached after posting;
- `SharedArrayBuffer` is not approved without a separate concurrency, cross-origin-isolation and benchmark decision.

The current protocol is intentionally strict during pre-alpha. Wire-contract changes require tests and ADR review rather than silent widening.

### Chunked world
The world is sparse and chunk-addressed. Land ownership determines buildable regions. Unpurchased land can exist as cheap metadata without fully materializing all gameplay layers.

The production default chunk size is 32x32 logical tiles. That was a candidate until it was benchmarked against 16x16 and 64x64 workloads (`world.chunk-size-sparse-edge`, `world.chunk-size-dense-prison`) and settled by [ADR-0004](./adr/0004-chunk-size-selection.md), which carries the measurements. Changing it requires what settled it: an ADR backed by measurements.

### Entity representation
Public domain concepts may expose typed objects, but hot-path simulation data should avoid thousands of allocation-heavy class instances. Prefer stable numeric/entity IDs, dense component storage where useful, pooled transient structures and explicit ownership.

### Navigation
Navigation is hierarchical and budgeted:
1. sector/chunk-level connectivity,
2. portal/door graph,
3. local grid search,
4. path cache with geometry-version invalidation,
5. flow fields or shared route structures for high-volume common destinations where benchmarks justify them.

A full-map A* per actor per frame is forbidden. The region/portal graph, door/permission model, route format and cache invalidation are defined in [NAVIGATION.md](./NAVIGATION.md); flow fields, shared-route optimization and CPU budgets are separate work (#22), decided by [ADR-0007](./adr/0007-navigation-work-budgets-and-flow-fields.md) and implemented in `src/simulation/navigation/` (`flow-field.ts`, `path-request-queue.ts`) — see NAVIGATION.md's own section on them.

### Saves
Local-first persistence uses IndexedDB, and it is the only persistence the running app reaches: nothing under `src/` reads `VITE_SUPABASE_*` or imports `src/persistence/cloud/`, so the cloud client, sync engine and their SQL are a specified contract with no caller yet — see [CLOUD_SAVE.md](./CLOUD_SAVE.md). Cloud persistence is specified as Supabase Auth + Postgres metadata; moving large payloads into Supabase Storage is a candidate, not a decision, and no payload is compressed anywhere in `src/`. The versioned save envelope, its runtime schema, checksum and forward-migration framework are defined in [PERSISTENCE.md](./PERSISTENCE.md) independently of which storage backend consumes it.

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

Boundary rules. The first two, and half of the third, are statically enforced by `tests/unit/services-layer-boundaries.test.ts`; the rest are design constraints no static check can express, and are asserted only where a concrete behaviour makes them testable (the projection's expiry and clamping, in `tests/unit/services-entitlements.test.ts`):
- no module under `src/simulation/` or `src/persistence/` may import this layer;
- the layer imports no Phaser and touches no DOM globals, so the same modules run in a tab, a worker and a trusted server function;
- no module in this layer may be called from the simulation tick loop, and anything that leaves the device — a telemetry send, an entitlement read, a challenge submission — is asynchronous, failable and optional. **Nothing here leaves the device yet**, and that half is now enforced: `services-layer-boundaries.test.ts` refuses `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`, `indexedDB`, `sessionStorage` and the Cache API anywhere under `src/services/`, with an allow-list that is empty. Storage reaches the layer only through the injected `KeyValueStore`. Wiring the first send is the moment this rule starts having content, so it has to be written down rather than merely called — and the asynchronous/failable/optional half then needs its own assertion against that entry point, which no pattern over source text can supply. The layer also holds pure synchronous logic, and the localization runtime is the deliberate exception to "asynchronous": `Localizer.format`/`formatNumber` are synchronous in-process calls made from the HUD's repaint path (`src/ui/hud/status-strip.ts`) and, since #208, from the save panel as well (`src/ui/save-panel.ts`), so they must perform no I/O and must stay allocation-cheap. `formatNumber`, `formatDate` and `selectPluralForm` used to construct a fresh `Intl` formatter on every call, which is the cost this constraint is about; since #136 `src/services/localization/format.ts` memoizes each formatter per `(locale, options)` in a bounded `Map`, and one status-strip repaint — 11 formatted values, counted — builds no formatter at all once the entries are warm. The *formatter-construction* count is asserted (`tests/unit/services-localization.test.ts`, `tests/browser/ui-shell.spec.ts`); the number of values formatted is reported in the failure message and not asserted; the cost is reported, not asserted, in `tests/perf/localization-format-cache.perf.ts`;
- a client cache of server-authoritative state is a projection that expires and may only ever reduce what the client believes it may do.

### Localization
Stable content/simulation identifiers, message keys and translated text are three separate namespaces. Simulation code may branch on a stable id; it may never read translated text, and no translated string may be persisted, hashed, checksummed or compared. Locale catalogs are versioned data with a per-key fallback chain; the default locale is bundled and must be complete.

### Input
Input actions are abstract commands, not hard-coded characters. Keyboard defaults use physical `KeyboardEvent.code` semantics, with user-visible labels adapted where browser layout APIs are available. All actions are remappable. Touch/pointer interactions have first-class equivalents.

### Rendering and assets
Source art may be authored in Blender. Runtime game assets are pre-rendered 2D sprites/atlases. Characters target eight directional views. Assets must be atlas-packed, versioned and budgeted for CDN/static-asset limits.

How the world and its actors are actually drawn — layer ownership, depth rules for a top-down view with visible object sides, the sprite pooling/culling budget, and where render frames come from — is defined in [RENDERING.md](./RENDERING.md).

## Performance philosophy
Performance budgets are contracts, not cleanup tasks. Every subsystem capable of scaling with actor count, tile count or path requests requires synthetic benchmarks before content growth hides architectural problems.

Initial stress tiers:
- 250 actors: development baseline,
- 1,000 actors: expected large prison,
- 2,500 actors: high-load target,
- 5,000 actors: stretch/engineering stress case.

Exact frame/tick budgets will be set after representative benchmark scenarios exist.
