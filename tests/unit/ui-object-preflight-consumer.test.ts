import { expect, it } from 'vitest';
import { ObjectTool } from '../../src/ui/object-tool';
import type { ObjectPlacementPreflight } from '../../src/simulation/objects/object-placement-service';
import type { ObjectPlacementPreviewTarget } from '../../src/ui/simulation-object-placement-port';
import type { BuildPanelTarget } from '../../src/ui/hud';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

function fixture() {
  let revision = 1;
  const pending: { target: ObjectPlacementPreviewTarget; resolve: (verdict: ObjectPlacementPreflight) => void }[] = [];
  const tool = new ObjectTool({ preflight: (target: ObjectPlacementPreviewTarget) =>
    new Promise<ObjectPlacementPreflight>(resolve => pending.push({ target, resolve })), worldRevision: () => revision });
  const targets: (BuildPanelTarget | undefined)[] = [];
  tool.attachReadout(target => targets.push(target));
  const arm = (definitionId = 'desk-wooden') => tool.setArmed(true, { definitionId, footprint: { width: 2, height: 1 }, removing: false });
  const aim = (x = 7, y = 6) => tool.target({ tileX: x, tileY: y, width: 2, height: 1 });
  const status = () => tool.previewVerdict();
  return { tool, pending, targets, arm, aim, status, changeWorld: () => { revision++; } };
}
const accepted: ObjectPlacementPreflight = { ok: true, roomInstanceId: 'room.yard:4:4',
  footprint: [{ x: tileCoordinate(7), y: tileCoordinate(6) }, { x: tileCoordinate(8), y: tileCoordinate(6) }], catalogueCostMinorUnits: 130 };
const blocked: ObjectPlacementPreflight = { ok: false, reason: 'tile-occupied', tile: { x: tileCoordinate(8), y: tileCoordinate(6) },
  footprint: accepted.footprint, catalogueCostMinorUnits: 130 };
async function resolve(pending: ReturnType<typeof fixture>['pending'][number], verdict: ObjectPlacementPreflight) {
  pending.resolve(verdict); await Promise.resolve(); await Promise.resolve();
}

it('requests once for a stationary owned aim, reports only actual verdict, and re-reads a changed world', async () => {
  const f = fixture(); f.arm(); f.aim(); f.aim();
  expect(f.pending).toHaveLength(1);
  expect(f.pending[0]!.target).toEqual({ definitionId: 'desk-wooden', anchor: { x: 7, y: 6 } });
  expect(f.status()).toBeUndefined();
  await resolve(f.pending[0]!, blocked);
  expect(f.status()).toBe('blocked');
  expect(f.targets.at(-1)).toMatchObject({ x: 7, y: 6, catalogueCostMinorUnits: 130, objectFootprint: { width: 2, height: 1 } });
  f.changeWorld(); expect(f.status()).toBeUndefined(); f.aim();
  expect(f.pending).toHaveLength(2); await resolve(f.pending[1]!, accepted);
  expect(f.status()).toBe('allowed');
});

it('drops replies from an older anchor, selection, removal, disarm and replacement session', async () => {
  const f = fixture(); f.arm(); f.aim(); f.aim(9, 6);
  await resolve(f.pending[0]!, blocked); expect(f.status()).toBeUndefined();
  f.arm('bed-wooden'); f.aim(9, 6);
  await resolve(f.pending[1]!, blocked); expect(f.status()).toBeUndefined();
  f.tool.setArmed(true, { removing: true });
  await resolve(f.pending[2]!, blocked); expect(f.status()).toBeUndefined();
  f.arm(); f.aim(); f.tool.setArmed(false);
  await resolve(f.pending[3]!, blocked); expect(f.status()).toBeUndefined();
  f.arm(); f.aim(); f.changeWorld();
  await resolve(f.pending[4]!, blocked); expect(f.status()).toBeUndefined();
  f.tool.setArmed(false); f.arm(); f.aim();
  await resolve(f.pending[5]!, accepted); expect(f.status()).toBe('allowed');
});

it('never lets a stale preview suppress authoritative actual placement or change the removal gesture', async () => {
  const f = fixture(), gestures: unknown[] = []; f.tool.attachGestures(gesture => gestures.push(gesture));
  f.arm(); f.aim(); await resolve(f.pending[0]!, blocked);
  f.tool.place({ tileX: 7, tileY: 6 });
  expect(gestures).toEqual([{ kind: 'place', definitionId: 'desk-wooden', x: 7, y: 6 }]);
  f.tool.setArmed(true, { removing: true }); f.aim();
  expect(f.pending).toHaveLength(1);
  f.tool.place({ tileX: 7, tileY: 6 });
  expect(gestures.at(-1)).toEqual({ kind: 'remove', x: 7, y: 6 });
});
