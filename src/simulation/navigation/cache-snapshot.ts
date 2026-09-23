import { tileCoordinate, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import type { FlowFieldCache, RegionFlowField, RegionFlowFieldStep } from './flow-field';
import type { RegionId } from './region-graph';
import type { RouteFailure, RouteResult, RouteSegment } from './route';
import type { RouteCache } from './route-cache';
import { canonicalRouteContext, routeContextFingerprint, type RouteContext } from './route-context';
import {
  rebaseDoorDependencies,
  snapshotDoorDependencies,
  type DoorDependencies,
  type DoorDependenciesSnapshot,
  type DoorDependencySnapshot,
} from './route-dependencies';

/**
 * The route and flow-field caches as a save carries them -- ADR 0007's
 * amendment of 2026-09-23, which records the owner's ruling (*"Zapisywać
 * pamięć tras (zalecane)"*, an option label and so the weaker provenance) and
 * every choice below with its measurement.
 *
 * ## Why a save carries caches at all
 *
 * A hit costs no expansions against `workBudgetPerTick`; a search does. A
 * restore that starts both caches empty therefore spends the budget
 * differently on the first ticks where it binds, and serves a different set
 * of requests there than the session it was saved from (13 of 331 binding
 * ticks on #1373's fixtures). The answers were never the problem -- the
 * accounting was.
 *
 * ## Why the entries and not their keys
 *
 * An entry a lockdown invalidated answers again once the lockdown lifts,
 * because validity is a comparison of traversal *verdicts*
 * (`doorDependenciesStillHold`). A rebuild at load can only compute what is
 * valid now, so a save taken during a lockdown could not reproduce the entry
 * the continuous session revives after it. Carrying the entry needs no
 * argument that a rebuild would agree, either.
 *
 * ## The shape, and what each choice buys
 *
 * - Only entries computed against the world's **current** geometry; the rest
 *   are never answered again (`RouteCache.entriesComputedAgainst`). No
 *   signature is written, since it is by construction the world's own -- and
 *   one is a term per loaded chunk.
 * - Door versions as "still the one captured", rebased on load
 *   (`rebaseDoorDependencies`), because a restore does not reproduce the
 *   counters.
 * - Door ids and contexts written once, in tables, and referenced by index.
 * - A route as the moves from its origin, one letter per step, plus each
 *   segment's region, length and entering door: a route is origin to
 *   destination one orthogonal step at a time (`routeWaypoints`), so this is
 *   the whole of it, and it is what makes the carried cache a fraction of the
 *   size a tile object per waypoint would.
 * - Everything in canonical order. Neither cache is iterated to decide
 *   anything, so insertion order is history rather than state and must not
 *   reach a checksum.
 *
 * `src/persistence/save-schema.ts` validates this structurally; the semantic
 * rules (indices in range, tables sorted, a route that is a walk from its
 * origin to its destination) are refused here, by `loadNavigationCacheSnapshot`.
 */
export interface NavigationCacheSnapshot {
  /** Every door id any entry below names, ascending and unique. */
  readonly doorIds: readonly string[];
  /** One context per fingerprint, in `canonicalRouteContext`'s shape, ascending by fingerprint. */
  readonly contexts: readonly RouteContext[];
  /** Ascending by `(origin, destination, context)` cache key. */
  readonly routes: readonly RouteCacheEntrySnapshot[];
  /** Ascending by `(destination region, context)` cache key. */
  readonly flowFields: readonly FlowFieldSnapshot[];
}

/** A step of a carried route: `E` is x+1, `W` x-1, `S` y+1, `N` y-1. */
export type RouteStepLetter = 'E' | 'W' | 'S' | 'N';

/** `[regionId, waypointCount]`, or with the index of the door crossed to enter it. */
export type RouteSegmentSnapshot = readonly [number, number] | readonly [number, number, number];

export type RouteResultSnapshot =
  | {
      readonly ok: true;
      /** One `RouteStepLetter` per step from the entry's origin; the route's waypoint count is one more than its length. */
      readonly path: string;
      readonly totalCost: number;
      readonly segments: readonly RouteSegmentSnapshot[];
    }
  | { readonly ok: false; readonly failure: RouteFailure };

/**
 * A dependency list: the doors whose version was still the one captured, by
 * index, and the doors whose version had moved, by index with the verdict the
 * answer was computed under. Both ascending; `changed` is absent when empty,
 * so "no changed door" has one spelling.
 */
export interface DoorDependenciesEncoded {
  readonly revisionUnchanged: boolean;
  readonly unchanged: readonly number[];
  /** `[doorIndex, allowed, traversalCost]`. */
  readonly changed?: readonly (readonly [number, boolean, number])[];
}

export interface RouteCacheEntrySnapshot {
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  /** Index into `NavigationCacheSnapshot.contexts`. */
  readonly context: number;
  readonly result: RouteResultSnapshot;
  readonly dependencies: DoorDependenciesEncoded;
}

/**
 * `[region, portalDoorIndex, portalRegionA, portalRegionB, tileAX, tileAY,
 * tileBX, tileBY, costToDestination]` -- a `RegionFlowFieldStep` whose portal
 * is written out in full rather than looked up in the restored graph, since a
 * field is carried exactly as it was computed.
 */
export type FlowFieldStepSnapshot = readonly [number, number, number, number, number, number, number, number, number];

export interface FlowFieldSnapshot {
  readonly destinationRegion: number;
  readonly context: number;
  /** Ascending by region. */
  readonly steps: readonly FlowFieldStepSnapshot[];
  readonly dependencies: DoorDependenciesEncoded;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function letterFor(from: TilePosition, to: TilePosition): RouteStepLetter {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  throw new Error(`Invariant violated: a cached route steps from ${String(from.x)},${String(from.y)} to ${String(to.x)},${String(to.y)}, which is not one orthogonal step.`);
}

function samePosition(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

class Tables {
  private readonly doorIds = new Set<string>();
  private readonly contexts = new Map<string, RouteContext>();
  private doorIndex = new Map<string, number>();
  private contextIndex = new Map<string, number>();

  public addDoor(doorId: string): void {
    this.doorIds.add(doorId);
  }

  public addContext(context: RouteContext): void {
    const fingerprint = routeContextFingerprint(context);
    if (!this.contexts.has(fingerprint)) this.contexts.set(fingerprint, canonicalRouteContext(context));
  }

  public addDependencies(dependencies: DoorDependencies): void {
    for (const doorId of [...dependencies.perDoor.keys()].sort(compareStrings)) this.addDoor(doorId);
  }

  public freeze(): { readonly doorIds: readonly string[]; readonly contexts: readonly RouteContext[] } {
    const doorIds = [...this.doorIds].sort(compareStrings);
    const fingerprints = [...this.contexts.keys()].sort(compareStrings);
    this.doorIndex = new Map(doorIds.map((doorId, index) => [doorId, index]));
    this.contextIndex = new Map(fingerprints.map((fingerprint, index) => [fingerprint, index]));
    return { doorIds, contexts: fingerprints.map((fingerprint) => this.contexts.get(fingerprint)!) };
  }

  public door(doorId: string): number {
    const index = this.doorIndex.get(doorId);
    if (index === undefined) throw new Error(`Invariant violated: door "${doorId}" is not in the snapshot's table.`);
    return index;
  }

  public context(context: RouteContext): number {
    const index = this.contextIndex.get(routeContextFingerprint(context));
    if (index === undefined) throw new Error('Invariant violated: a context is not in the snapshot\'s table.');
    return index;
  }
}

function encodeDependencies(dependencies: DoorDependencies, doors: DoorRegistry, tables: Tables): DoorDependenciesEncoded {
  const snapshot = snapshotDoorDependencies(dependencies, doors);
  const unchanged: number[] = [];
  const changed: [number, boolean, number][] = [];
  for (const dependency of snapshot.doors) {
    const index = tables.door(dependency.doorId);
    if (dependency.unchanged) unchanged.push(index);
    else changed.push([index, dependency.verdict!.allowed, dependency.verdict!.traversalCost]);
  }
  // The table is ascending by id, so ascending by index is ascending by id --
  // the order `captureDoorDependencies` holds them in.
  unchanged.sort((a, b) => a - b);
  changed.sort((a, b) => a[0] - b[0]);
  return { revisionUnchanged: snapshot.revisionUnchanged, unchanged, ...(changed.length === 0 ? {} : { changed }) };
}

function encodeResult(result: RouteResult, origin: TilePosition, destination: TilePosition, tables: Tables): RouteResultSnapshot {
  if (!result.ok) {
    const { failure } = result;
    return {
      ok: false,
      failure: {
        reason: failure.reason,
        ...(failure.blockedBy === undefined ? {} : { blockedBy: { doorId: failure.blockedBy.doorId, reason: failure.blockedBy.reason } }),
      },
    };
  }
  let previous: TilePosition | undefined;
  let path = '';
  const segments: RouteSegmentSnapshot[] = [];
  for (const segment of result.route.segments) {
    for (const waypoint of segment.waypoints) {
      if (previous === undefined) {
        if (!samePosition(waypoint, origin)) throw new Error('Invariant violated: a cached route does not start at its origin.');
      } else {
        path += letterFor(previous, waypoint);
      }
      previous = waypoint;
    }
    segments.push(
      segment.enteredViaDoorId === undefined
        ? [segment.regionId, segment.waypoints.length]
        : [segment.regionId, segment.waypoints.length, tables.door(segment.enteredViaDoorId)],
    );
  }
  if (previous === undefined || !samePosition(previous, destination)) throw new Error('Invariant violated: a cached route does not end at its destination.');
  return { ok: true, path, totalCost: result.route.totalCost, segments };
}

/**
 * What a save carries of the two caches, read against the registry and the
 * geometry as they stand now. Pure: it reads the caches and changes nothing,
 * not even when the graph is next rebuilt.
 */
export function captureNavigationCacheSnapshot(
  routeCache: RouteCache,
  flowFieldCache: FlowFieldCache,
  doors: DoorRegistry,
  geometrySignature: string,
): NavigationCacheSnapshot {
  const routes = routeCache.entriesComputedAgainst(geometrySignature);
  const fields = flowFieldCache.fieldsComputedAgainst(geometrySignature);

  const tables = new Tables();
  for (const entry of routes) {
    tables.addContext(entry.context);
    tables.addDependencies(entry.dependencies);
    if (entry.result.ok) {
      for (const segment of entry.result.route.segments) if (segment.enteredViaDoorId !== undefined) tables.addDoor(segment.enteredViaDoorId);
    }
  }
  for (const field of fields) {
    tables.addContext(field.context);
    tables.addDependencies(field.doorDependencies);
    for (const [, step] of [...field.steps].sort(([a], [b]) => a - b)) tables.addDoor(step.nextPortal.doorId);
  }
  const { doorIds, contexts } = tables.freeze();

  return {
    doorIds,
    contexts,
    routes: routes.map((entry) => ({
      origin: { x: entry.origin.x, y: entry.origin.y },
      destination: { x: entry.destination.x, y: entry.destination.y },
      context: tables.context(entry.context),
      result: encodeResult(entry.result, entry.origin, entry.destination, tables),
      dependencies: encodeDependencies(entry.dependencies, doors, tables),
    })),
    flowFields: fields.map((field) => ({
      destinationRegion: field.destinationRegion,
      context: tables.context(field.context),
      steps: [...field.steps]
        .sort(([a], [b]) => a - b)
        .map(([region, { nextPortal, costToDestination }]): FlowFieldStepSnapshot => [
          region,
          tables.door(nextPortal.doorId),
          nextPortal.regionA,
          nextPortal.regionB,
          nextPortal.tileA.x,
          nextPortal.tileA.y,
          nextPortal.tileB.x,
          nextPortal.tileB.y,
          costToDestination,
        ]),
      dependencies: encodeDependencies(field.doorDependencies, doors, tables),
    })),
  };
}

// --- Load ---------------------------------------------------------------

function refuse(message: string): never {
  throw new RangeError(`Navigation cache snapshot: ${message}`);
}

function indexInto<T>(table: readonly T[], index: number, what: string): T {
  if (!Number.isInteger(index) || index < 0 || index >= table.length) refuse(`${what} index ${String(index)} is out of range.`);
  return table[index]!;
}

function decodeDependencies(encoded: DoorDependenciesEncoded, doorIds: readonly string[]): DoorDependenciesSnapshot {
  const doors: DoorDependencySnapshot[] = [];
  for (const index of encoded.unchanged) doors.push({ doorId: indexInto(doorIds, index, 'door'), unchanged: true });
  for (const [index, allowed, traversalCost] of encoded.changed ?? []) {
    doors.push({ doorId: indexInto(doorIds, index, 'door'), unchanged: false, verdict: { allowed, traversalCost } });
  }
  if (encoded.changed !== undefined && encoded.changed.length === 0) refuse('an empty `changed` list is written as no list.');
  const ascending = (values: readonly number[]): boolean => values.every((value, at) => at === 0 || values[at - 1]! < value);
  if (!ascending(encoded.unchanged) || !ascending((encoded.changed ?? []).map(([index]) => index))) refuse('dependency lists are not ascending.');
  // `rebaseDoorDependencies` refuses a door named twice, which is how a door in
  // both lists is caught.
  return { revisionUnchanged: encoded.revisionUnchanged, doors: doors.sort((a, b) => compareStrings(a.doorId, b.doorId)) };
}

const STEP_OFFSETS: Readonly<Record<string, readonly [number, number]>> = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };

function decodeResult(encoded: RouteResultSnapshot, origin: TilePosition, destination: TilePosition, doorIds: readonly string[]): RouteResult {
  if (!encoded.ok) {
    const { failure } = encoded;
    return {
      ok: false,
      failure: {
        reason: failure.reason,
        ...(failure.blockedBy === undefined ? {} : { blockedBy: { doorId: failure.blockedBy.doorId, reason: failure.blockedBy.reason } }),
      },
    };
  }
  if (!Number.isFinite(encoded.totalCost) || encoded.totalCost < 0) refuse('a route has an invalid cost.');
  const waypoints: TilePosition[] = [{ x: tileCoordinate(origin.x), y: tileCoordinate(origin.y) }];
  for (const letter of encoded.path) {
    const offset = STEP_OFFSETS[letter];
    if (offset === undefined) refuse(`a route step "${letter}" is not one of E, W, S, N.`);
    const last = waypoints[waypoints.length - 1]!;
    waypoints.push({ x: tileCoordinate(last.x + offset[0]), y: tileCoordinate(last.y + offset[1]) });
  }
  if (!samePosition(waypoints[waypoints.length - 1]!, destination)) refuse('a route does not end at its destination.');
  if (encoded.segments.length === 0) refuse('a route has no segments.');
  const segments: RouteSegment[] = [];
  let at = 0;
  encoded.segments.forEach((segment, index) => {
    const [regionId, count, doorIndex] = segment;
    if (!Number.isInteger(count) || count < 1) refuse('a route segment has no waypoints.');
    // A later segment without a door is not refused: `sliceIntoSegments`
    // leaves `enteredViaDoorId` absent whenever no door separates the two
    // regions, so it is a shape the router produces.
    if (index === 0 && doorIndex !== undefined) refuse('a route\'s first segment names a door it was entered by.');
    segments.push({
      regionId: regionId as RegionId,
      waypoints: waypoints.slice(at, at + count),
      ...(doorIndex === undefined ? {} : { enteredViaDoorId: indexInto(doorIds, doorIndex, 'door') }),
    });
    at += count;
  });
  if (at !== waypoints.length) refuse(`a route's segments hold ${String(at)} waypoints and its path ${String(waypoints.length)}.`);
  return { ok: true, route: { segments, totalCost: encoded.totalCost } };
}

/**
 * Replaces both caches' entries with `snapshot`'s, against the **restored**
 * registry and world. Call it after the restore's last door mutation: it is
 * what the door versions are rebased onto (`rebaseDoorDependencies`).
 *
 * Throws `RangeError` on a snapshot whose tables are unsorted or duplicated,
 * whose indices are out of range, or whose route is not a walk from its origin
 * to its destination -- a save no build of this code could have written.
 */
export function loadNavigationCacheSnapshot(
  snapshot: NavigationCacheSnapshot,
  routeCache: RouteCache,
  flowFieldCache: FlowFieldCache,
  doors: DoorRegistry,
  geometrySignature: string,
): void {
  const { doorIds, contexts } = snapshot;
  doorIds.forEach((doorId, index) => {
    if (index > 0 && !(doorIds[index - 1]! < doorId)) refuse(`door ids are not ascending and unique at "${doorId}".`);
  });
  const fingerprints = contexts.map((context) => routeContextFingerprint(context));
  contexts.forEach((context, index) => {
    if (index > 0 && !(fingerprints[index - 1]! < fingerprints[index]!)) refuse('contexts are not ascending and unique by fingerprint.');
    const canonical = canonicalRouteContext(context);
    if (JSON.stringify(canonical) !== JSON.stringify(context)) refuse(`context "${fingerprints[index]!}" is not in canonical form.`);
  });

  routeCache.loadEntries(
    snapshot.routes.map((entry) => {
      const context = indexInto(contexts, entry.context, 'context');
      return {
        origin: entry.origin,
        destination: entry.destination,
        context,
        result: decodeResult(entry.result, entry.origin, entry.destination, doorIds),
        dependencies: rebaseDoorDependencies(decodeDependencies(entry.dependencies, doorIds), doors, context),
      };
    }),
    geometrySignature,
  );

  flowFieldCache.loadFields(
    snapshot.flowFields.map((field): Omit<RegionFlowField, 'geometrySignature'> => {
      const context = indexInto(contexts, field.context, 'context');
      const steps = new Map<RegionId, RegionFlowFieldStep>();
      let lastRegion = Number.NEGATIVE_INFINITY;
      for (const [region, doorIndex, regionA, regionB, ax, ay, bx, by, costToDestination] of field.steps) {
        if (!(lastRegion < region)) refuse('a flow field\'s steps are not ascending by region.');
        lastRegion = region;
        if (!Number.isFinite(costToDestination) || costToDestination < 0) refuse('a flow field step has an invalid cost.');
        steps.set(region as RegionId, {
          nextPortal: {
            doorId: indexInto(doorIds, doorIndex, 'door'),
            regionA: regionA as RegionId,
            regionB: regionB as RegionId,
            tileA: { x: tileCoordinate(ax), y: tileCoordinate(ay) },
            tileB: { x: tileCoordinate(bx), y: tileCoordinate(by) },
          },
          costToDestination,
        });
      }
      return {
        destinationRegion: field.destinationRegion as RegionId,
        contextFingerprint: routeContextFingerprint(context),
        context,
        steps,
        doorDependencies: rebaseDoorDependencies(decodeDependencies(field.dependencies, doorIds), doors, context),
      };
    }),
    geometrySignature,
  );
}
