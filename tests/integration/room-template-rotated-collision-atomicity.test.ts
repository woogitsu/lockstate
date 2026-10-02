import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'rotated-collision', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Fixture save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function command(runtime: Runtime, id: string, value: SimulationCommand) {
  runtime.kernel.submitCommand(id, runtime.kernel.snapshot().expectedSequence, runtime.kernel.tick, packCommand(value));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 10_000 && !predicate(); tick += 1) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

// The command queue and refusal notice necessarily change when a command is
// dispatched; every authoritative saved gameplay/economy/history field must not.
function gameplaySnapshot(runtime: Runtime) {
  const { kernel: _kernel, ...gameplay } = captureSessionSnapshot(runtime);
  return gameplay;
}

it.each(['live pending', 'saved partial', 'saved partial undone and redone', 'saved completed undone and redone'] as const)
  ('atomically refuses a second-tile-only rotated fixture collision at the command boundary: %s', (stage) => {
    let runtime = createNewSimulationRuntime(73);
    // Anchor membership permits a fixture's far tile outside its room. Yard is
    // open: no wall or zoning at (9,10) can conceal a missing object-claim check.
    expect(runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 2, y: 2, width: 8, height: 8 }, 0).kind).toBe('zoned');
    expect(runtime.objectPlacement.place({
      orderId: 'source-desk', definitionId: 'desk-wooden', x: 9, y: 9, objectOrientation: 1,
    }, 0)).toMatchObject({ kind: 'ordered' });
    expect(runtime.construction.getOrder('source-desk')).toMatchObject({ objectOrientation: 1 });
    if (stage !== 'live pending') {
      until(runtime, () => {
        const order = runtime.construction.getOrder('source-desk');
        return order !== undefined && order.progress > 0 && order.state !== 'completed';
      });
      runtime = reload(runtime);
      expect(runtime.construction.getOrder('source-desk')).toMatchObject({ state: 'in-progress', objectOrientation: 1 });
    }
    if (stage === 'saved completed undone and redone') {
      until(runtime, () => runtime.construction.getOrder('source-desk')?.state === 'completed');
      runtime = reload(runtime);
    }
    if (stage.includes('undone and redone')) {
      command(runtime, 'undo-source', { type: 'Undo' });
      expect(runtime.construction.getOrder('source-desk')?.state).toBe('cancelled');
      expect(runtime.placedObjects.isTileOccupied(tile(9, 10))).toBe(false);
      runtime = reload(runtime);
      command(runtime, 'redo-source', { type: 'Redo' });
      expect(runtime.construction.getOrder('source-desk')).toMatchObject({ objectOrientation: 1 });
      expect(runtime.construction.getOrder('source-desk')?.state).not.toBe('cancelled');
      if (stage === 'saved completed undone and redone') {
        until(runtime, () => runtime.construction.getOrder('source-desk')?.state === 'completed');
      }
      runtime = reload(runtime);
    }
    const second = tile(9, 10);
    expect(runtime.world.getZoning(second)).toBe(0);
    expect(runtime.world.getSquareStructure(second)).toBe(0);
    expect(runtime.world.getTopEdge(second)).toBe(0);
    expect(runtime.world.getLeftEdge(second)).toBe(0);
    expect(runtime.construction.allOrders()).toHaveLength(1);
    const before = gameplaySnapshot(runtime);
    const money = runtime.treasury.snapshot();
    const history = runtime.construction.snapshot();
    const tick = runtime.kernel.tick;
    const target = { kind: 'room-template' as const, templateId: 'cell-basic' as const, origin: { x: 9, y: 10 }, quarterTurns: 1 as const };
    expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, tick, { target }).view)
      .toEqual({ ok: false, reason: 'object-occupied', tile: second });
    expect(gameplaySnapshot(runtime)).toEqual(before);

    command(runtime, 'colliding-template', { type: 'PlaceRoomTemplate',
      templateId: target.templateId, origin: target.origin, quarterTurns: target.quarterTurns,
    });
    expect(runtime.kernel.tick).toBe(tick);
    expect(runtime.treasury.snapshot()).toEqual(money);
    expect(runtime.construction.snapshot()).toEqual(history);
    expect(runtime.construction.allOrders()).toHaveLength(1);
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(gameplaySnapshot(runtime)).toEqual(before);
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: second });
  });
