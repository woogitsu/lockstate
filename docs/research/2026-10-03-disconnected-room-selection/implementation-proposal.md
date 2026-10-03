# Concrete draft, production unchanged

Scope proposed: src/simulation/navigation/navigation-system.ts and regular room selection in src/simulation/prisoners/action-system.ts only.

NavigationSystem already owns the current graph and rebuilds it when geometrySignature/doorStructuralRevision/loaded area changes. Add a private cached graph reference plus region→physical-component Map. Lazily build all labels on the first physical-connectivity query for a new graph. Reuse the exact physical portal walk semantics already present in rooms/reachability.ts::walkPortals: a registered door connects its two regions regardless of its current lock/access state. Labels are internal, never serialized, observed or minted as game IDs. A graph reference change invalidates the whole derived map. Door permission-only mutations do not change physical topology; the existing queued permission-aware router remains authoritative.

Draft method body (not applied production):

```ts
public sharesPhysicalComponent(origin: TilePosition, destination: TilePosition): boolean {
  const graph = this.ensureGraph();
  const from = graph.tileToRegion.get(tileKey(origin));
  const to = graph.tileToRegion.get(tileKey(destination));
  if (from === undefined || to === undefined) return false;
  if (from === to) return true;
  if (this.physicalComponentGraph !== graph) {
    const components = new Map<RegionId, RegionId>();
    for (const seed of graph.regionTiles.keys()) {
      if (components.has(seed)) continue;
      components.set(seed, seed);
      const pending = [seed];
      while (pending.length > 0) {
        const region = pending.pop()!;
        for (const portal of graph.regionPortals.get(region) ?? []) {
          const other = portal.regionA === region ? portal.regionB : portal.regionA;
          if (components.has(other)) continue;
          components.set(other, seed);
          pending.push(other);
        }
      }
    }
    this.physicalComponents = components;
    this.physicalComponentGraph = graph;
  }
  return this.physicalComponents.get(from) === this.physicalComponents.get(to);
}
```

Fields: private physicalComponentGraph: NavigationGraph | undefined; private physicalComponents: ReadonlyMap<RegionId, RegionId> = new Map(); Import existing tileKey/RegionId only.

ActionSystem already derives currentTile from the real actor position in beginNextAction. Pass that value into the private resolveTargetInstance call; only its regular-room branch supplies `(candidate) => this.navigation.sharesPhysicalComponent(currentTile, candidate.anchorTile)` to the existing registry predicate. Keep own-accommodation and job-board paths unchanged. No changes to ranking, capacity, claims, permissions, queue, path budget, route cache or save format.

Cost: one O(regions+portals) labeling walk per graph generation, O(regions) derived memory, then O(1) tile/label lookup per candidate; same-region queries need no labeling. No tile search, Dijkstra or A* is added. This is a rejection of proved physical disconnection, NOT a promise that an actor has access through every door. Physically connected but locked/permission-denied targets continue through existing queued route failure semantics. Existing route failures caused by future geometry changes remain possible.

ADR0007 budgets completed route requests, not all derived graph construction/readout work; the existing region graph rebuild and physical room-readout portal walk are outside the request queue already. This proposal adds no route computation outside that queue. ADR0041's next legal action fallback and #2013's deterministic first eligible room selection remain intact. No explicit owner reservation for this ephemeral query was found in those ADRs. Parent review/lease is still required before source edits.

Coverage proposed: actual4 live/V8 disconnected/legal-gap kernel regressions; existing8 #2013/#2008 controls; pure NavigationSystem existing fixture tests for same/different components, invalid endpoints, doors physically joining despite locked/access-denied router result, graph rebuild on open/closed ordinary gap and loaded chunks, unchanged queue metrics on repeated queries. Genuine producer negatives: omit physical rejection in query; separately omit actual ActionSystem consumer retaining old membership condition; detach fixed SHA first, finally exact bytes and named branch restore. Bounded navigation-budget/determinism/capacity/action neighbors. No broad catalog matrix or native run.
