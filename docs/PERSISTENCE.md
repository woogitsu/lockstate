# Save schema and migration contract

This document covers `src/persistence/`: the canonical save envelope, its
runtime validation, checksum and forward-migration framework. It does not
select a storage backend — IndexedDB (#19) and Supabase sync (#20) are
separate issues that consume the envelope this module produces.

## Envelope shape (`SaveEnvelopeV1`)

```
{
  saveSchemaVersion: 1,
  gameVersion: string,     // build/version identifier, e.g. "lockstate-0.0.0"
  prisonId: string,
  revision: number,        // caller-managed monotonic counter; optimistic-concurrency
                            // enforcement belongs to the storage backend (#20), not this schema
  createdAt: number,       // unix ms
  updatedAt: number,       // unix ms, must not precede createdAt
  checksum: string,        // 16 hex chars, see "Checksum" below
  payload: {
    kernel: { tick, expectedSequence, rngStates, commands },  // Kernel.snapshot()
    world: { ... },                                           // SparseWorld.snapshot()
    construction: { orders, undoStack, redoStack },           // ConstructionSystem.snapshot()
    entities?: { capacity, nextAvailableIndex, maxActiveIndex, freeCount, generations, freeIndices, alive },
  },
}
```

`payload` is exactly the union of the existing per-subsystem snapshot
contracts (Issues #5, #12, #16/#17), re-validated at the save boundary with
Zod (`src/persistence/save-schema.ts`), not a new shape invented for this
issue.

### What is deliberately excluded from V1

- **Per-component entity state** (`ComponentBitset`, `TransformComponent`,
  future components). `entities` covers only `EntityStore`'s own ID-liveness
  ledger. No runtime currently attaches components to an `EntityStore` — the
  first real consumer (prisoner/staff entities, Phase 7) should introduce a
  component registry and extend the payload deliberately, rather than this
  issue inventing an open-ended generic serialization format nothing yet
  needs. `entities` is optional for the same reason: a fresh prison has none.
- **Room/topology state.** `TopologyManager` and `RoomSystem` hold no
  independent state — they are pure caches recomputed from `SparseWorld`
  geometry (`TopologyManager.update`) — so nothing to persist exists there.
- **Storage backend, compression algorithm, encryption.** Out of scope per
  the issue; see "Size hook" below for the one hook this schema does provide.

## Checksum

`computeSaveChecksum` (`src/persistence/checksum.ts`) reuses
`deterministicStateHash` from `src/simulation/determinism/canonical.ts` — the
same canonical-JSON FNV-1a-style hash the simulation already uses for state
diagnostics — rather than a new algorithm. Canonicalization sorts object keys,
so the checksum is stable across equivalent key insertion order. It detects
corruption/accidental mismatch; it is **not** a cryptographic signature.

## Migration framework

`src/persistence/migration.ts` exports a generic `MigrationChain`:

- Each supported save-schema version registers exactly one `VersionSchema`
  (a `parse` function; `zod-version-schema.ts` adapts a Zod schema to this).
- Each `Vn -> Vn+1` transition registers exactly one `MigrationStep`. Steps
  must advance exactly one version; registration fails loudly otherwise.
- `chain.migrate(input, declaredVersion)` validates `input` against its
  declared version's schema, then walks every migration required to reach
  `latestVersion`, re-validating the output of every step before trusting it.
  A step never receives or returns the caller's original object reference in
  a way that lets it mutate the source fixture.

Only V1 exists today, so `saveMigrationChain` has zero registered migrations
— `decodeSaveEnvelope` still routes through the same dispatcher a future V2
will use. The chain-walking, per-step validation and immutability guarantees
are exercised against a synthetic multi-version fixture in
`tests/unit/persistence-migration.test.ts`, independent of whether a second
real save-schema version exists yet.

### Adding a V2 later

1. Add the new interface/type and a `.strict()` Zod schema for it, alongside
   V1's — never edit the V1 schema to match new code.
2. `saveMigrationChain.registerSchema(zodVersionSchema(2, v2Schema))`.
3. `saveMigrationChain.registerMigration({ fromVersion: 1, toVersion: 2, migrate })`,
   pure and side-effect-free.
4. Bump `SAVE_SCHEMA_VERSION` to `2` and update `SaveEnvelopeV1`-typed call
   sites to the new type.
5. Keep the V1 fixtures in `tests/fixtures/persistence/` checked in unchanged,
   and add a test asserting they migrate to the new shape correctly.

## Error taxonomy

`decodeSaveEnvelope` returns a distinct, actionable error code rather than a
single generic failure:

| Code | Meaning |
| --- | --- |
| `invalid-shape` | Not an object, missing/non-numeric `saveSchemaVersion`, or fails its declared version's schema (includes malformed/truncated saves and `updatedAt < createdAt`). |
| `unsupported-version` | `saveSchemaVersion` is newer than the latest version this build knows about. |
| `no-migration-path` | A declared or intermediate version has no registered schema/migration (e.g. version `0`, or a gap in the chain). |
| `migration-produced-invalid-output` | A migration step ran but its output failed the destination version's schema — a bug in the migration, not the input. |
| `checksum-mismatch` | The envelope parses and migrates cleanly, but its checksum does not match its payload — corruption, not a shape problem. |

## Size hook

`estimateSaveEnvelopeByteSize` (`src/persistence/size.ts`) reports the
canonical-JSON byte size of an envelope. This is the "size/version hook for
future compression/storage selection" the issue calls for: a storage backend
can decide when compression is worth it without this module picking an
algorithm.

## Performance

Directional-only measurement (not a committed benchmark or a threshold —
`docs/BENCHMARKING.md` explicitly defers "save serialization, compression,
checksum and migration cost" to its own future benchmark scenario family):
encoding+validating a synthetic 400-chunk / 2,000-build-order save
(~390 KB canonical JSON) took ~122 ms to encode/validate and ~62 ms to
decode/validate on this development container; `JSON.stringify`/`parse`
themselves were a few milliseconds. Zod validation cost scales with world
size, so it should be profiled against representative content before it
gates a pull request, per the referenced benchmark policy.
