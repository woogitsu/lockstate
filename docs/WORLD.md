# World chunk contract

`src/simulation/world` owns the authoritative sparse chunk metadata used by
future simulation systems. It imports no renderer, browser persistence or cloud
code.

## Coordinates

Tile and chunk coordinates are safe integers. Tile-to-chunk conversion uses
mathematical floor division, so tile `-1` in a 32-tile chunk is chunk `-1`,
local tile `31`. Chunk keys use the stable, locale-independent `x,y` format.

`32` is only the current candidate passed to `SparseWorld`; the module does not
freeze a global chunk-size decision. Issue #13 must supply benchmark evidence
and an ADR before one becomes product policy.

## Lifecycle and projections

An untouched coordinate is absent and allocates no record. An owned coordinate
may have cheap `metadata-only` state; loaded chunks have simulation data
available for mutation. Geometry and content revisions are independent and a
mutation makes a loaded chunk dirty.

Land ownership is persistent world state. Renderer visibility and simulation
activity are separate, non-persistent projections owned by later systems; they
are intentionally not fields of `SparseWorld`.

## Snapshot schema

`WorldSnapshotV1` contains the candidate chunk size, sorted owned chunk
positions and sorted chunk records. Deserialization rejects unknown versions,
duplicate chunk references, unknown fields and invalid revisions. This is a
module-level snapshot contract, not an IndexedDB or cloud save adapter.
