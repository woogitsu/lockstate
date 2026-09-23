import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { NavigationCacheSnapshot } from '../../src/simulation/navigation/cache-snapshot';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { buildCellBlockFixture, type CellBlockFixture } from '../helpers/navigation-fixture';

/**
 * The codec behind `simulation.inFlight.navigation.caches` -- ADR 0007's
 * amendment of 2026-09-23. `tests/determinism/restore-mid-walk-exactness.test.ts`
 * proves the property that matters through a whole session and a real
 * envelope; this file pins the mechanism piece by piece, where a failure names
 * the piece.
 *
 * Every restored system here is built over a **re-registered** door registry,
 * as `restoreSessionSystems` builds one, with the saved registry's counters
 * deliberately pushed apart from it first -- so a codec that carried raw access
 * versions instead of rebasing them would be caught rather than rescued by the
 * two registries happening to agree.
 */

const OPTIONS = { workBudgetPerTick: 100_000, agingIntervalTicks: 15, flowFieldActivationThreshold: 1_000 } as const;
const PRISONER: RouteContext = { role: 'prisoner', securityClearance: 0 };
/** Two contexts with one fingerprint: permissions order and a `false` override are not part of it. */
const GUARD: RouteContext = { role: 'guard', securityClearance: 5, permissions: ['b', 'a'], emergencyOverride: false };

interface Harness {
  readonly navigation: NavigationSystem;
  readonly kernel: Kernel;
  readonly doors: DoorRegistry;
}

function harness(fixture: CellBlockFixture, doors: DoorRegistry): Harness {
  const navigation = new NavigationSystem(fixture.world, OPTIONS, doors);
  navigation.setLoadedChunks(fixture.chunkPositions);
  const kernel = new Kernel();
  kernel.registerSystem(navigation);
  return { navigation, kernel, doors };
}

/** A registry holding the same doors in the same states, registered afresh -- so its counters are not the original's. */
function reRegistered(doors: DoorRegistry): DoorRegistry {
  const copy = new DoorRegistry();
  for (const door of doors.all()) copy.register({ ...door, position: { ...door.position } });
  return copy;
}

interface Resolved {
  readonly expansions: number;
  readonly result: string;
}

/** Requests every leg, steps once (the budget above never binds), and collects. */
function resolveLegs(system: Harness, legs: readonly (readonly [TilePosition, TilePosition, RouteContext])[]): readonly Resolved[] {
  const tick = system.kernel.tick;
  legs.forEach(([origin, destination, context], index) => system.navigation.requestRoute(`leg-${String(tick)}-${String(index)}`, origin, destination, context, 0, tick));
  system.kernel.step();
  return legs.map((_leg, index) => {
    const id = `leg-${String(tick)}-${String(index)}`;
    const outcome = system.navigation.getResult(id);
    if (outcome === undefined) throw new Error(`${id} did not resolve`);
    system.navigation.clearResult(id);
    return { expansions: outcome.expansions, result: JSON.stringify(outcome.result) };
  });
}

function caches(system: Harness): NavigationCacheSnapshot {
  const snapshot = system.navigation.getInFlightSnapshot().caches;
  if (snapshot === undefined) throw new Error('a live capture always writes the caches');
  return snapshot;
}

function setup() {
  const fixture = buildCellBlockFixture(12);
  const canteen = fixture.canteenTiles[fixture.canteenTiles.length - 1]!;
  const legs = fixture.cellTiles.slice(0, 5).flatMap((cell) => [
    [cell, canteen, PRISONER] as const,
    [cell, canteen, GUARD] as const,
  ]);
  const saved = harness(fixture, fixture.doors);
  return { fixture, canteen, legs, saved };
}

/** Moves the saved registry's counters well away from a fresh registration's, without changing any door's final state. */
function churn(doors: DoorRegistry, doorId: string): void {
  const state = doors.getById(doorId)!.state;
  for (let index = 0; index < 5; index += 1) {
    doors.setState(doorId, 'locked');
    doors.setState(doorId, state);
  }
}

describe('a restored route cache answers what the saved one would, at the same cost', () => {
  it('serves the legs the saved cache held as hits, costing nothing against the budget', () => {
    const { fixture, legs, saved } = setup();
    const cold = resolveLegs(saved, legs);
    expect(cold.every((leg) => leg.expansions > 0), 'the first resolution must search, or nothing was cached').toBe(true);
    const warm = resolveLegs(saved, legs);
    expect(warm.map((leg) => leg.expansions)).toEqual(legs.map(() => 0));

    const snapshot = caches(saved);
    // A door the legs do not depend on, churned so that no counter survives by
    // coincidence: the re-registered registry below starts every door at 0.
    const unrelated = fixture.doors.all().find((door) => door.id !== fixture.canteenEntranceDoorId)!;
    churn(fixture.doors, unrelated.id);

    const restored = harness(fixture, reRegistered(fixture.doors));
    restored.navigation.loadCacheSnapshot(snapshot);
    expect(caches(restored), 'the restore is a fixed point').toEqual(snapshot);

    const afterRestore = resolveLegs(restored, legs);
    expect(afterRestore).toEqual(warm);
  });

  it('carries one context per fingerprint, in canonical form', () => {
    const { legs, saved } = setup();
    resolveLegs(saved, legs);
    expect(caches(saved).contexts).toEqual([
      { role: 'guard', securityClearance: 5, permissions: ['a', 'b'] },
      { role: 'prisoner', securityClearance: 0 },
    ]);
  });

  /**
   * The case ADR 0007's amendment chooses entries over keys for: a lockdown
   * invalidates an entry, and lifting it makes the entry answer again,
   * unrecomputed. A save taken during the lockdown must carry the entry.
   */
  it('an entry a locked door invalidated answers again when it reopens, in the restored cache as in the saved one', () => {
    const { fixture, canteen, legs, saved } = setup();
    const leg = legs.slice(0, 1);
    resolveLegs(saved, leg);

    const doorId = fixture.canteenEntranceDoorId;
    const baseline = fixture.doors.getById(doorId)!.state;
    fixture.doors.setState(doorId, 'locked');
    const snapshot = caches(saved);
    const entry = snapshot.routes.find((route) => route.destination.x === canteen.x && route.destination.y === canteen.y);
    expect(entry?.dependencies.changed, 'the entry must carry the verdict it was computed under for the door that changed').toEqual([
      [snapshot.doorIds.indexOf(doorId), true, expect.any(Number) as number],
    ]);
    expect(entry?.dependencies.revisionUnchanged).toBe(false);

    const restoredDoors = reRegistered(fixture.doors);
    const restored = harness(fixture, restoredDoors);
    restored.navigation.loadCacheSnapshot(snapshot);
    expect(caches(restored)).toEqual(snapshot);

    const cold = harness(fixture, reRegistered(fixture.doors));

    fixture.doors.setState(doorId, baseline);
    restoredDoors.setState(doorId, baseline);
    cold.doors.setState(doorId, baseline);

    const continuing = resolveLegs(saved, leg);
    expect(continuing.map((outcome) => outcome.expansions), 'the saved session revives the entry').toEqual([0]);
    expect(resolveLegs(restored, leg)).toEqual(continuing);
    expect(resolveLegs(cold, leg)[0]!.expansions, 'a cold cache has to search, or this case proves nothing').toBeGreaterThan(0);
  });

  it('an entry whose door is still changed when the restored session asks misses, in both', () => {
    const { fixture, legs, saved } = setup();
    const leg = legs.slice(0, 1);
    resolveLegs(saved, leg);
    fixture.doors.setState(fixture.canteenEntranceDoorId, 'locked');
    const snapshot = caches(saved);
    const restored = harness(fixture, reRegistered(fixture.doors));
    restored.navigation.loadCacheSnapshot(snapshot);

    const continuing = resolveLegs(saved, leg);
    expect(continuing[0]!.expansions).toBeGreaterThan(0);
    expect(resolveLegs(restored, leg)).toEqual(continuing);
  });

  it('leaves out every entry computed against geometry the world has since changed', () => {
    const { fixture, legs, saved } = setup();
    resolveLegs(saved, legs);
    expect(caches(saved).routes.length).toBe(legs.length);

    // Any geometry write in a loaded chunk moves the signature; the entries
    // computed before it are deleted on their next read and never answer again.
    const tile = fixture.canteenTiles[0]!;
    fixture.world.setLeftEdge(tile, fixture.world.getLeftEdge(tile) === 0 ? 7 : 0);
    expect(caches(saved)).toEqual({ doorIds: [], contexts: [], routes: [], flowFields: [] });
  });
});

describe('a navigation cache snapshot no build could have written is refused', () => {
  function valid(): { readonly snapshot: NavigationCacheSnapshot; readonly load: (snapshot: NavigationCacheSnapshot) => void } {
    const { fixture, legs, saved } = setup();
    resolveLegs(saved, legs);
    fixture.doors.setState(fixture.canteenEntranceDoorId, 'locked');
    const snapshot = caches(saved);
    expect(snapshot.routes.some((route) => route.dependencies.changed !== undefined)).toBe(true);
    return {
      snapshot,
      load: (candidate) => harness(fixture, reRegistered(fixture.doors)).navigation.loadCacheSnapshot(candidate),
    };
  }

  type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
  function mutated(recipe: (snapshot: Mutable<NavigationCacheSnapshot>) => void): { readonly snapshot: NavigationCacheSnapshot; readonly load: (snapshot: NavigationCacheSnapshot) => void } {
    const { snapshot, load } = valid();
    const copy = JSON.parse(JSON.stringify(snapshot)) as Mutable<NavigationCacheSnapshot>;
    recipe(copy);
    return { snapshot: copy as unknown as NavigationCacheSnapshot, load };
  }

  const firstOk = (snapshot: Mutable<NavigationCacheSnapshot>) => {
    const route = snapshot.routes.find((candidate) => candidate.result.ok);
    if (route === undefined || !route.result.ok) throw new Error('the fixture must cache a route');
    return { route, result: route.result };
  };

  it('accepts the unmutated snapshot, so each refusal below is the mutation\'s', () => {
    const { snapshot, load } = valid();
    expect(() => load(snapshot)).not.toThrow();
  });

  it.each([
    ['door ids out of order', (s: Mutable<NavigationCacheSnapshot>) => void s.doorIds.reverse()],
    ['a context index out of range', (s: Mutable<NavigationCacheSnapshot>) => void (s.routes[0]!.context = s.contexts.length)],
    ['a context not in canonical form', (s: Mutable<NavigationCacheSnapshot>) => void (s.contexts[0] = { ...s.contexts[0]!, permissions: ['b', 'a'] })],
    ['a step that is not a compass letter', (s: Mutable<NavigationCacheSnapshot>) => void (firstOk(s).result.path = `${firstOk(s).result.path}X`)],
    ['a route that does not end at its destination', (s: Mutable<NavigationCacheSnapshot>) => void (firstOk(s).route.destination = { x: tileCoordinate(999), y: tileCoordinate(999) })],
    ['segments that do not hold the path', (s: Mutable<NavigationCacheSnapshot>) => void ((firstOk(s).result.segments[0] as [number, number])[1] += 1)],
    ['a door index out of range', (s: Mutable<NavigationCacheSnapshot>) => void s.routes[0]!.dependencies.unchanged.push(s.doorIds.length)],
    ['an empty changed list rather than none', (s: Mutable<NavigationCacheSnapshot>) => void (s.routes[0]!.dependencies.changed = [])],
    [
      'a door both unchanged and changed',
      (s: Mutable<NavigationCacheSnapshot>) => {
        const route = s.routes.find((candidate) => candidate.dependencies.changed !== undefined)!;
        route.dependencies.unchanged.push(route.dependencies.changed![0]![0]);
        route.dependencies.unchanged.sort((a, b) => a - b);
      },
    ],
    [
      'nothing changed anywhere, and a door changed',
      (s: Mutable<NavigationCacheSnapshot>) => void (s.routes.find((candidate) => candidate.dependencies.changed !== undefined)!.dependencies.revisionUnchanged = true),
    ],
    ['the same entry twice', (s: Mutable<NavigationCacheSnapshot>) => void s.routes.push(s.routes[0]!)],
  ])('%s', (_name, recipe) => {
    const { snapshot, load } = mutated(recipe);
    expect(() => load(snapshot)).toThrow(RangeError);
  });
});

/**
 * **The premise that lets a capture leave out an entry computed against old
 * geometry.** A geometry signature is every *loaded* chunk's
 * `geometryRevision`, which only rises, so a signature the world has moved
 * past cannot come back -- unless a chunk leaves the loaded set and returns,
 * which removes and restores its term. `SparseWorld.unload` does exactly that,
 * and nothing in `src/` calls it. If something starts to, a save could drop an
 * entry the continuous session would answer from again, and ADR 0007's
 * 2026-09-23 amendment has to be revisited before this test is changed.
 */
describe('the premise the carried cache rests on', () => {
  it('no production code unloads a chunk', () => {
    const root = resolvePath(__dirname, '../../src');
    const callers: string[] = [];
    const walk = (directory: string): void => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && readFileSync(path, 'utf8').includes('.unload(')) callers.push(relative(root, path));
      }
    };
    walk(root);
    expect(callers).toEqual([]);
  });
});
