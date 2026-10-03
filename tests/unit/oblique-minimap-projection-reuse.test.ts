import { expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { MinimapView } from '../../src/shared/minimap-view';

// The real scene publisher and projection execute. Only GPU construction is
// absent; no fake minimap pixels or replaced projection are supplied.
vi.mock('phaser', () => ({ default: { Scene: class {} } }));

function setup() {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true);
  let current: RenderFrame = { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures: [], rooms: [], roomConditions: [], actors: [] };
  const scene = new ObliqueWorldScene({ feed: { readFrame: () => current },
    keyValueStore: { getItem: () => null, setItem: () => undefined } });
  const pose = { target: { x: 8 * 64, y: 8 * 64 }, viewport: { width: 1920, height: 1080 },
    zoom: 1.25, yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4 };
  Reflect.set(scene, 'pose', pose);
  const views: Array<MinimapView | undefined> = [];
  Reflect.set(scene, 'minimapSink', (view: MinimapView | undefined) => views.push(view));
  const publish = () => {
    Reflect.set(scene, 'lastFrame', current);
    (Reflect.get(scene, 'publishMinimap') as () => void).call(scene);
  };
  return { world, chunk, scene, pose, views, publish, frame: () => current,
    setFrame: (frame: RenderFrame) => { current = frame; } };
}

it('reuses exact pixels and performs no tile reads for unchanged world/revision', () => {
  const probe = setup(); const reads = vi.spyOn(probe.frame().world, 'readTile');
  probe.publish(); const firstReads = reads.mock.calls.length;
  expect(firstReads).toBe(256);
  for (let frame = 0; frame < 120; frame++) probe.publish();
  expect(reads.mock.calls.length).toBe(firstReads);
  expect(probe.views).toHaveLength(121);
  for (const view of probe.views) expect(view!.pixels).toBe(probe.views[0]!.pixels);
});

it('invalidates on a new actual world identity with the same revision', () => {
  const probe = setup(); probe.publish();
  probe.world.setOwned(probe.chunk, false);
  const nextWorld = WorldRenderView.fromSnapshot(probe.world.snapshot());
  const reads = vi.spyOn(nextWorld, 'readTile');
  probe.setFrame({ ...probe.frame(), world: nextWorld }); probe.publish();
  expect(reads.mock.calls.length).toBe(256);
  expect(probe.views[1]!.pixels).not.toBe(probe.views[0]!.pixels);
  expect(Array.from(probe.views[1]!.pixels)).toEqual(Array(256).fill(1));
  expect(Array.from(probe.views[0]!.pixels)).toEqual(Array(256).fill(2));
});

it('invalidates on changed revision even when world identity stays the same', () => {
  const probe = setup(); const reads = vi.spyOn(probe.frame().world, 'readTile');
  probe.publish(); reads.mockClear();
  probe.setFrame({ ...probe.frame(), revision: 2 }); probe.publish();
  expect(reads.mock.calls.length).toBe(256);
  expect(probe.views[1]!.pixels).not.toBe(probe.views[0]!.pixels);
  expect(probe.views[1]!.pixels).toEqual(probe.views[0]!.pixels);
});

it('recalculates camera viewport while retaining unchanged physical pixels', () => {
  const probe = setup(); probe.publish();
  Reflect.set(probe.scene, 'pose', { ...probe.pose, target: { x: 10 * 64, y: 11 * 64 }, zoom: 2 });
  probe.publish();
  expect(probe.views[1]!.pixels).toBe(probe.views[0]!.pixels);
  expect(probe.views[1]!.viewport).not.toEqual(probe.views[0]!.viewport);
  expect(probe.views[1]!.viewport.width).toBeCloseTo(probe.views[0]!.viewport.width * 1.25 / 2);
  expect(probe.views[1]!.viewport.height).toBeCloseTo(probe.views[0]!.viewport.height * 1.25 / 2);
});

it('publishes empty then recovers from a replacement world with loaded bounds', () => {
  const probe = setup(); probe.publish();
  const loaded = probe.frame().world;
  probe.setFrame({ ...probe.frame(), world: WorldRenderView.fromSnapshot(new SparseWorld(16).snapshot()) });
  probe.publish(); expect(probe.views[1]).toBeUndefined();
  probe.setFrame({ ...probe.frame(), world: loaded }); probe.publish();
  expect(probe.views[2]!.pixels).toEqual(probe.views[0]!.pixels);
  expect(probe.views[2]!.pixels).not.toBe(probe.views[0]!.pixels);
});
