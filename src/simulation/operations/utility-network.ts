export type UtilityType = 'electricity' | 'water';
export type UtilityNodeKind = 'producer' | 'consumer';
export type UtilityNodeState = 'powered' | 'disabled-no-supply' | 'disabled-failure';

export interface UtilityNodeDefinition {
  readonly id: string;
  readonly kind: UtilityNodeKind;
  /** For a producer: maximum output. For a consumer: demand. Same unit within one network -- no cross-network conversion. */
  readonly capacityOrDemand: number;
}

/**
 * A capacity-bounded utility network (issue #25: "initial utility
 * networks/capacity for electricity and water with producers, consumers,
 * connections, load and disabled/failure states"). Deliberately not a
 * detailed electrical/hydraulic simulation -- one network is one or more
 * connected components; within each component, aggregate producer
 * capacity is allocated to consumers deterministically (ascending node
 * id) until exhausted. A node explicitly marked failed can supply or
 * receive nothing regardless of connectivity.
 *
 * Evaluation is invalidated (and only recomputed) on structural change --
 * `addNode`/`connect`/`setFailed` bump a revision counter checked by
 * `evaluate`, never a per-tick whole-network rescan when nothing changed
 * (issue #25: "capacity networks operate on explicit graphs/regions and
 * invalidation, not whole-world scans").
 */
export class UtilityNetwork {
  private readonly nodes = new Map<string, UtilityNodeDefinition>();
  private readonly adjacency = new Map<string, Set<string>>();
  private readonly failedNodeIds = new Set<string>();

  private revision = 0;
  private cachedAtRevision = -1;
  private cachedStates = new Map<string, UtilityNodeState>();
  private cachedLoad = new Map<string, number>();

  public constructor(public readonly type: UtilityType) {}

  public addNode(node: UtilityNodeDefinition): void {
    if (this.nodes.has(node.id)) throw new RangeError(`Duplicate utility node id "${node.id}".`);
    this.nodes.set(node.id, node);
    this.adjacency.set(node.id, new Set());
    this.revision += 1;
  }

  public connect(nodeIdA: string, nodeIdB: string): void {
    const a = this.adjacency.get(nodeIdA);
    const b = this.adjacency.get(nodeIdB);
    if (a === undefined) throw new RangeError(`Unknown utility node id "${nodeIdA}".`);
    if (b === undefined) throw new RangeError(`Unknown utility node id "${nodeIdB}".`);
    a.add(nodeIdB);
    b.add(nodeIdA);
    this.revision += 1;
  }

  public setFailed(nodeId: string, failed: boolean): void {
    if (!this.nodes.has(nodeId)) throw new RangeError(`Unknown utility node id "${nodeId}".`);
    const wasFailed = this.failedNodeIds.has(nodeId);
    if (failed === wasFailed) return;
    if (failed) this.failedNodeIds.add(nodeId);
    else this.failedNodeIds.delete(nodeId);
    this.revision += 1;
  }

  public isFailed(nodeId: string): boolean {
    return this.failedNodeIds.has(nodeId);
  }

  private connectedComponents(): readonly (readonly string[])[] {
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const nodeId of [...this.nodes.keys()].sort()) {
      if (visited.has(nodeId)) continue;
      const component: string[] = [];
      const stack = [nodeId];
      visited.add(nodeId);
      while (stack.length > 0) {
        const current = stack.pop()!;
        component.push(current);
        for (const neighbor of [...(this.adjacency.get(current) ?? [])].sort()) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
      components.push(component.sort());
    }
    return components;
  }

  /**
   * Recomputes (if the graph/failure state changed since the last call)
   * every node's state and, for consumers, the load actually served.
   * Within a connected component, a failed node contributes neither
   * capacity nor demand; available producer capacity is allocated to
   * consumers in ascending node-id order until exhausted -- deterministic,
   * not proportional/fair-share, so identical network state always
   * produces an identical allocation.
   */
  public evaluate(): { readonly states: ReadonlyMap<string, UtilityNodeState>; readonly load: ReadonlyMap<string, number> } {
    if (this.cachedAtRevision === this.revision) {
      return { states: this.cachedStates, load: this.cachedLoad };
    }

    const states = new Map<string, UtilityNodeState>();
    const load = new Map<string, number>();

    for (const component of this.connectedComponents()) {
      let availableCapacity = 0;
      for (const nodeId of component) {
        const node = this.nodes.get(nodeId)!;
        if (this.failedNodeIds.has(nodeId)) {
          states.set(nodeId, 'disabled-failure');
          continue;
        }
        if (node.kind === 'producer') availableCapacity += node.capacityOrDemand;
      }

      for (const nodeId of component) {
        const node = this.nodes.get(nodeId)!;
        if (node.kind !== 'consumer' || this.failedNodeIds.has(nodeId)) continue;
        if (availableCapacity >= node.capacityOrDemand) {
          availableCapacity -= node.capacityOrDemand;
          states.set(nodeId, 'powered');
          load.set(nodeId, node.capacityOrDemand);
        } else {
          states.set(nodeId, 'disabled-no-supply');
          load.set(nodeId, 0);
        }
      }

      for (const nodeId of component) {
        if (!states.has(nodeId)) states.set(nodeId, 'powered'); // a non-failed producer, or a producer with no consumers to serve
      }
    }

    this.cachedStates = states;
    this.cachedLoad = load;
    this.cachedAtRevision = this.revision;
    return { states, load };
  }

  public getSnapshot(): {
    readonly type: UtilityType;
    readonly nodes: readonly UtilityNodeDefinition[];
    readonly connections: readonly (readonly [string, string])[];
    readonly failedNodeIds: readonly string[];
  } {
    const connections: (readonly [string, string])[] = [];
    for (const nodeId of [...this.adjacency.keys()].sort()) {
      for (const neighbor of [...(this.adjacency.get(nodeId) ?? [])].sort()) {
        if (neighbor > nodeId) connections.push([nodeId, neighbor]);
      }
    }

    return {
      type: this.type,
      nodes: [...this.nodes.keys()].sort().map((id) => this.nodes.get(id)!),
      connections,
      failedNodeIds: [...this.failedNodeIds].sort(),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    if (snapshot.type !== this.type) throw new RangeError(`Cannot load a "${snapshot.type}" snapshot into a "${this.type}" network.`);
    this.nodes.clear();
    this.adjacency.clear();
    this.failedNodeIds.clear();

    for (const node of snapshot.nodes) {
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, new Set());
    }
    for (const [a, b] of snapshot.connections) {
      this.adjacency.get(a)?.add(b);
      this.adjacency.get(b)?.add(a);
    }
    for (const nodeId of snapshot.failedNodeIds) this.failedNodeIds.add(nodeId);

    this.revision += 1;
  }
}
