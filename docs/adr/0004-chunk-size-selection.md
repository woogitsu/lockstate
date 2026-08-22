# ADR-0004: Chunk size selection and parcel decoupling

- Status: Accepted
- Date: 2026-08-22

## Context

Lockstate is a browser-first prison management simulation designed to scale across a chunked world. Chunks are an internal storage, spatial partitioning and culling unit; purchased parcels are a gameplay and economy unit.

Prior to Issue #13, `32` was used as a candidate chunk size without comparative benchmark evidence against `16` and `64`. Architecture rules also require that parcels remain decoupled from chunk boundaries, so players can own arbitrary tile regions without forcing `parcel === chunk`.

## Decision

1. **Production Default Chunk Size**: Set the production default chunk size to `32×32` logical tiles (`1024` tiles per chunk layer).
2. **Explicit Decoupling**: Keep parcel land ownership and chunk boundaries strictly independent:
   - Parcels define arbitrary bounding rectangles or composite shapes.
   - A parcel may span multiple chunks or partial chunks.
   - Land ownership checks (`isTileOwned`) query parcel ownership or direct chunk ownership without assuming 1:1 chunk alignment.
3. **Data-Driven Terrain and Packed Layers**:
   - Terrain definitions use stable string IDs and packed numeric IDs (0..255).
   - Loaded chunks store terrain in dense `Uint8Array` buffers.
   - Snapshot serialization encodes uniform terrain using Run-Length Encoding (RLE) to minimize save sizes.
4. **Parameterization**: `SparseWorld` retains `tileChunkSize` as an explicit parameter in snapshots and constructors, preserving testability and migration flexibility.

## Benchmark Evidence and Tradeoffs

We compared candidate sizes `16×16`, `32×32`, and `64×64` across two repeatable benchmark workloads (`world.chunk-size-sparse-edge` and `world.chunk-size-dense-prison`):

| Metric / Dimension | 16×16 Chunks | 32×32 Chunks (Selected) | 64×64 Chunks |
| :--- | :--- | :--- | :--- |
| **Tiles per Chunk** | 256 tiles | 1,024 tiles | 4,096 tiles |
| **Dense Memory per Chunk (Uint8)** | 256 B | 1,024 B (1 KiB) | 4,096 B (4 KiB) |
| **Active Chunk Overhead in Dense 128×128** | 64 chunks (high bookkeeping) | 16 chunks (balanced) | 4 chunks (low chunk count) |
| **Sparse Edge Allocation Waste** | Minimal wasted unowned padding | Balanced (max padding 31 tiles) | High (up to 63 tiles padding allocated) |
| **Viewport Culling Match (1080p Viewport)** | Requires many chunk draw calls | Clean 3×2 to 4×3 grid intersection | Too coarse, culls excessive off-screen area |
| **Navigation Portal Density** | Very high edge graph node count | Optimal hierarchical portal density | Coarse paths, large local A* searches |

### Tradeoff Summary

- **16×16**: Reduces waste on sparse parcel edges, but quadruples chunk metadata count, map lookups, and hierarchical portal graph density.
- **64×64**: Minimizes chunk instances in large open maps, but allocates 4 KiB per chunk on sparse single-tile touches and causes coarse viewport culling and oversized local search spaces.
- **32×32**: Achieves the sweet spot between spatial culling granularity, cache locality for dense 1 KiB typed arrays, and bounded sparse edge overhead.

## Consequences

### Positive
- Predictable 1 KiB typed array allocations per chunk layer for fast cache access and zero-copy worker transfers.
- Standardized coordinate mathematics using fast integer divisions and modulo arithmetic.
- Clean RLE compression for uniform terrain regions in save snapshots.
- Gameplay parcels can expand naturally without tying game designers to chunk grid constraints.

### Negative / Costs
- Tile lookups on parcel boundaries must check spatial rect containment before chunk-level assumptions.
- Any future save format must store the chunk size to allow backward-compatible migrations.

## Follow-up boundaries

- Final economy balance, land prices, and dynamic pricing formulas belong to Phase 9.
- Final rendering textures and terrain auto-tiling belong to Phase 10.
