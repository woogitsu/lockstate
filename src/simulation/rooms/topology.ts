import { SparseWorld } from '../world/sparse-world';
import { type ChunkPosition, type TilePosition, chunkCoordinate, tileCoordinate, tileToChunk, chunkKey } from '../world/coordinates';

export type GlobalTopologyId = number;
export type ChunkRegionId = number;

export interface ChunkTopology {
  readonly chunkKey: string;
  readonly position: ChunkPosition;
  readonly revision: number;
  /** Maps local tile index (y * size + x) to ChunkRegionId */
  readonly tileRegions: Uint16Array;
}

/**
 * `GlobalTopologyId` is a **category 2 derived value** under
 * [ADR 0012](../../../docs/adr/0012-derived-identifier-reproducibility.md):
 * a label for a current property of world geometry, recomputed whenever that
 * geometry changes. It is therefore computed as a pure function of the
 * geometry it describes, is never carried in a snapshot, and no consumer may
 * treat it as stable across recomputes, persist it, hash it or compare it
 * across a save boundary.
 *
 * The counter that mints ids is deliberately **local to one recompute**
 * (`recomputeGlobalTopology`) rather than instance state. An instance-level
 * counter is the exact failure ADR 0012 exists to name: it made the id a
 * function of how many times geometry had changed since the manager was
 * constructed, so a manager that had lived through edits and a manager
 * rebuilt over the identical world disagreed -- and disagreed by
 * *association*, not merely by offset, with the same integer naming
 * different regions in the two. Pinned by
 * `tests/determinism/iteration-order.test.ts`.
 *
 * The same argument applies one level up, to *which chunks* contribute nodes
 * at all. `chunkTopologies` used to be append-only -- `update()` skipped a
 * non-loaded chunk rather than dropping it -- so a chunk that had been
 * processed and then unloaded kept contributing regions to the component walk.
 * That made the node set a function of chunk **load** history rather than of
 * what is loaded now, and it was an association defect rather than a numbering
 * one: a retained middle chunk bridges two loaded chunks that are not
 * connected through loaded space, so one id named their union in a manager
 * that had lived through the unload and named only one of them in a manager
 * rebuilt over the identical world. `update()` therefore reconciles
 * `chunkTopologies` against the world's current lifecycles
 * (`evictUnloadedTopologies`) before recomputing.
 */
export class TopologyManager {
  private chunkTopologies = new Map<string, ChunkTopology>();
  
  // Maps a global room ID to the set of chunk regions that compose it
  // This would be used later to query if a global room is enclosed, etc.

  constructor(private readonly world: SparseWorld) {}

  public update(chunks: Iterable<import('../world/sparse-world').ChunkState>): void {
    let globalTopologyDirty = false;
    for (const chunk of chunks) {
      if (chunk.lifecycle !== 'loaded') continue;
      const key = chunkKey(chunk.position);
      const existing = this.chunkTopologies.get(key);
      
      if (!existing || existing.revision !== chunk.geometryRevision) {
        this.processChunk(chunk);
        globalTopologyDirty = true;
      }
    }

    // After the processing loop, not before it: the caller hands us cloned
    // `ChunkState`s, which may be stale relative to the world. Reconciling
    // last makes the world's own lifecycle the authority, so a stale
    // `'loaded'` clone cannot re-admit a chunk the world has since unloaded.
    if (this.evictUnloadedTopologies()) globalTopologyDirty = true;

    if (globalTopologyDirty) {
      this.recomputeGlobalTopology();
    }
  }

  /**
   * Drops the retained topology of every chunk the world no longer has
   * loaded, and reports whether anything was dropped -- an unload changes the
   * component walk's input with no geometry revision moving, so it has to be
   * able to dirty the global topology on its own.
   *
   * No ordering decision lives here, and the sorted key walk is what makes
   * that checkable rather than merely argued. Whether a key is evicted is
   * decided per key from `world.getChunk(...).lifecycle` alone, so the
   * *set* of survivors is the same in any walk order, and deleting from a
   * `Map` leaves the insertion order of the rest untouched. The one
   * order-dependent step downstream -- which node seeds which connected
   * component -- reads `[...allNodes].sort()` in `recomputeGlobalTopology`,
   * so eviction cannot reach it either way.
   */
  private evictUnloadedTopologies(): boolean {
    const stale = [...this.chunkTopologies.keys()]
      .sort()
      .filter((key) => this.world.getChunk(this.chunkTopologies.get(key)!.position)?.lifecycle !== 'loaded');

    for (const key of stale) this.chunkTopologies.delete(key);
    return stale.length > 0;
  }

  private processChunk(chunk: import('../world/sparse-world').ChunkState): void {
    const size = this.world.tileChunkSize;
    const tileRegions = new Uint16Array(size * size);
    let nextLocalRegionId = 1;

    // We can fetch the raw edges to avoid calling getLeftEdge thousands of times
    // But for simplicity, we'll use getLeftEdge/getTopEdge initially
    
    // Iterative flood fill
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        if (tileRegions[index] !== 0) continue; // Already visited
        
        const regionId = nextLocalRegionId++;
        const stack: {lx: number, ly: number}[] = [{lx: x, ly: y}];
        
        while (stack.length > 0) {
          const {lx, ly} = stack.pop()!;
          const i = ly * size + lx;
          if (tileRegions[i] !== 0) continue;
          tileRegions[i] = regionId;
          
          const globalX = chunk.position.x * size + lx;
          const globalY = chunk.position.y * size + ly;
          
          // Check right: (lx+1, ly). Separated by (lx+1, ly)'s leftEdge
          if (lx + 1 < size) {
            const edge = this.world.getLeftEdge({ x: tileCoordinate(globalX + 1), y: tileCoordinate(globalY) });
            if (edge === 0 && tileRegions[ly * size + (lx + 1)] === 0) stack.push({lx: lx + 1, ly});
          }
          // Check left: (lx-1, ly). Separated by (lx, ly)'s leftEdge
          if (lx - 1 >= 0) {
            const edge = this.world.getLeftEdge({ x: tileCoordinate(globalX), y: tileCoordinate(globalY) });
            if (edge === 0 && tileRegions[ly * size + (lx - 1)] === 0) stack.push({lx: lx - 1, ly});
          }
          // Check down: (lx, ly+1). Separated by (lx, ly+1)'s topEdge
          if (ly + 1 < size) {
            const edge = this.world.getTopEdge({ x: tileCoordinate(globalX), y: tileCoordinate(globalY + 1) });
            if (edge === 0 && tileRegions[(ly + 1) * size + lx] === 0) stack.push({lx, ly: ly + 1});
          }
          // Check up: (lx, ly-1). Separated by (lx, ly)'s topEdge
          if (ly - 1 >= 0) {
            const edge = this.world.getTopEdge({ x: tileCoordinate(globalX), y: tileCoordinate(globalY) });
            if (edge === 0 && tileRegions[(ly - 1) * size + lx] === 0) stack.push({lx, ly: ly - 1});
          }
        }
      }
    }
    
    this.chunkTopologies.set(chunkKey(chunk.position), {
      chunkKey: chunkKey(chunk.position),
      position: { ...chunk.position },
      revision: chunk.geometryRevision,
      tileRegions
    });
  }

  private tileToGlobalId = new Map<string, GlobalTopologyId>();

  private recomputeGlobalTopology(): void {
    const size = this.world.tileChunkSize;
    // Build region adjacency graph
    // Node ID: `${chunkKey}:${localRegionId}`
    const adj = new Map<string, Set<string>>();
    const allNodes = new Set<string>();

    const addEdge = (nodeA: string, nodeB: string) => {
      let setA = adj.get(nodeA);
      if (!setA) { setA = new Set(); adj.set(nodeA, setA); }
      setA.add(nodeB);
      
      let setB = adj.get(nodeB);
      if (!setB) { setB = new Set(); adj.set(nodeB, setB); }
      setB.add(nodeA);
    };

    for (const [key, topology] of this.chunkTopologies.entries()) {
      const { x: cx, y: cy } = topology.position;
      
      // Add all non-zero local regions to the node set
      for (const region of topology.tileRegions) {
        if (region !== 0) {
          allNodes.add(`${key}:${region}`);
        }
      }

      // Check right boundary (lx = size - 1)
      const rightChunkPos = { x: chunkCoordinate(cx + 1), y: chunkCoordinate(cy) };
      const rightKey = chunkKey(rightChunkPos);
      const rightTopology = this.chunkTopologies.get(rightKey);
      
      if (rightTopology) {
        for (let ly = 0; ly < size; ly++) {
          const regionA = topology.tileRegions[ly * size + (size - 1)];
          const regionB = rightTopology.tileRegions[ly * size + 0];
          
          if (regionA !== 0 && regionB !== 0) {
            // Check edge between them: The leftEdge of the right tile
            const globalX = (cx + 1) * size;
            const globalY = cy * size + ly;
            const edge = this.world.getLeftEdge({ x: tileCoordinate(globalX), y: tileCoordinate(globalY) });
            if (edge === 0) {
              addEdge(`${key}:${regionA}`, `${rightKey}:${regionB}`);
            }
          }
        }
      }

      // Check bottom boundary (ly = size - 1)
      const bottomChunkPos = { x: chunkCoordinate(cx), y: chunkCoordinate(cy + 1) };
      const bottomKey = chunkKey(bottomChunkPos);
      const bottomTopology = this.chunkTopologies.get(bottomKey);
      
      if (bottomTopology) {
        for (let lx = 0; lx < size; lx++) {
          const regionA = topology.tileRegions[(size - 1) * size + lx];
          const regionB = bottomTopology.tileRegions[0 * size + lx];
          
          if (regionA !== 0 && regionB !== 0) {
            // Check edge between them: The topEdge of the bottom tile
            const globalX = cx * size + lx;
            const globalY = (cy + 1) * size;
            const edge = this.world.getTopEdge({ x: tileCoordinate(globalX), y: tileCoordinate(globalY) });
            if (edge === 0) {
              addEdge(`${key}:${regionA}`, `${bottomKey}:${regionB}`);
            }
          }
        }
      }
    }

    // Now find connected components
    this.tileToGlobalId.clear();
    const visited = new Set<string>();

    // The counter is scoped to this recompute, never to the manager. Two
    // things have to hold together for an id to be a function of geometry
    // rather than of history, and each covers a failure the other does not:
    //
    // 1. Canonical seed order (sorted `chunkKey:localRegionId`), never `Set`
    //    insertion order. `allNodes` is populated by walking
    //    `this.chunkTopologies`, whose insertion order is the order chunks
    //    happened to be processed -- so without this sort the values handed
    //    out below would depend on chunk-processing order within a single
    //    recompute.
    // 2. Starting from 1 every time. An instance-level counter survived the
    //    recompute that used it, so the ids a world ended up with depended on
    //    how many times its geometry had changed. Mirrors the sibling
    //    connectivity subsystem, whose `nextRegionId` is function-local for
    //    the same reason (`../navigation/region-graph.ts`).
    //
    // Both are pinned by `tests/determinism/iteration-order.test.ts`.
    let nextGlobalId: GlobalTopologyId = 1;

    for (const node of [...allNodes].sort()) {
      if (visited.has(node)) continue;

      const globalId = nextGlobalId;
      nextGlobalId += 1;
      const stack = [node];
      
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        
        // Split node ID to chunkKey and regionId
        const sepIndex = current.lastIndexOf(':');
        const cKey = current.substring(0, sepIndex);
        const rId = parseInt(current.substring(sepIndex + 1), 10);
        
        // Map this globalId to the chunk region
        // We will store it in tileToGlobalId by iterating over the chunk's tiles
        // OR we can just store the mapping from `chunkKey:regionId` -> globalId
        // Let's use a simpler mapping for O(1) tile lookup
        this.tileToGlobalId.set(current, globalId);
        
        const neighbors = adj.get(current);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) stack.push(neighbor);
          }
        }
      }
    }
  }

  public getTopologyId(tile: TilePosition): GlobalTopologyId {
    const { chunk, local } = tileToChunk(tile, this.world.tileChunkSize);
    const key = chunkKey(chunk);
    const topology = this.chunkTopologies.get(key);
    if (!topology) return 0;
    
    const regionId = topology.tileRegions[local.y * this.world.tileChunkSize + local.x];
    if (regionId === 0) return 0;
    
    return this.tileToGlobalId.get(`${key}:${regionId}`) ?? 0;
  }
}
