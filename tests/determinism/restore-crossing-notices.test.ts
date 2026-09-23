import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import { canonicalJson } from '../../src/simulation/determinism/canonical';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A notice that fires on a crossing keeps what it last saw across a save**
 * (issue #1373, the third divergence recorded there).
 *
 * `RoomNeedsClearedNoticeSystem` and `InsolvencyRungSystem` both announce an
 * *edge* -- a room that stopped being short of anything, a treasury that fell
 * past a rung -- by comparing what they read now with what they read last
 * time. Until this file both kept that memory unsaved and re-seeded it,
 * silently, on their first update after a load. So a crossing that happened
 * between the last read before a save and the first read after it was never
 * announced: the restored session read the new state as its baseline.
 *
 * Measured before the fix -- this file run against the tree with the route
 * caches already carried and neither notice's memory saved:
 * - `rooms.needs-cleared`: 8 notices were missing from a 34-prisoner crowded
 *   fixture (#1373), and the 36-prisoner binding-tick scan in
 *   `restore-mid-walk-exactness.test.ts` diverged at its far checkpoint on
 *   `simulation.alerts` for the same reason. The system reads once a day, so
 *   the window is up to a whole day wide. The first case below fails on it.
 * - `economy.*-refused` (the insolvency rungs): the system reads every tick,
 *   so the window is one tick wide -- a save taken on the tick a rung is
 *   crossed. The second case below fails on it.
 *
 * Both are asserted over the **whole** `captureSessionSnapshot`, through the
 * real envelope, against a continuous run that is never saved -- the method
 * of `restore-mid-walk-exactness.test.ts`, whose helpers are restated here
 * rather than shared because that file's fixture is not this one's.
 */

const SEED = 0x586;
const DAY = DAY_LENGTH_TICKS;
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

type Events = ReadonlyMap<number, (runtime: SimulationRuntime) => void>;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/** Queues a command for the tick about to be stepped, without stepping -- for use inside an event. */
function queue(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
}

function stepTo(runtime: SimulationRuntime, tick: number, events?: Events): void {
  while (runtime.kernel.tick < tick) {
    events?.get(runtime.kernel.tick)?.(runtime);
    runtime.kernel.step();
  }
}

function saveAndRestore(saved: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(saved);
  const envelope = createSaveEnvelope({
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'restore-crossing-notices',
    revision: 1,
    createdAt: 1,
    updatedAt: 2,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  if (!decoded.ok) throw new Error(`the save did not decode: ${decoded.error.code} ${decoded.error.message}`);
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
}

function captured(runtime: SimulationRuntime): string {
  return canonicalJson(JSON.parse(JSON.stringify(captureSessionSnapshot(runtime))) as JsonValue);
}

function firstDifferences(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 4 || a === b) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push(`${path}: ${String(JSON.stringify(a)).slice(0, 100)} != ${String(JSON.stringify(b)).slice(0, 100)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) firstDifferences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, out);
  return out;
}

/** Saves at each tick, restores, and compares the fixed point and the state at `checkpoint` against a continuous run. */
function scan(build: () => SimulationRuntime, saveTicks: readonly number[], checkpoint: number, events?: Events): readonly string[] {
  const continuous = build();
  stepTo(continuous, checkpoint, events);
  const expected = captured(continuous);

  const base = build();
  const failures: string[] = [];
  for (const tick of saveTicks) {
    stepTo(base, tick, events);
    const restored = saveAndRestore(base);
    const atSave = captured(base);
    if (captured(restored) !== atSave) {
      failures.push(`save@${String(tick)} not a fixed point: ${firstDifferences(JSON.parse(atSave), JSON.parse(captured(restored))).join(' | ')}`);
      continue;
    }
    stepTo(restored, checkpoint, events);
    const got = captured(restored);
    if (got !== expected) failures.push(`save@${String(tick)} diverged by ${String(checkpoint)}: ${firstDifferences(JSON.parse(expected), JSON.parse(got)).join(' | ')}`);
  }
  return failures;
}

function eventsOfType(runtime: SimulationRuntime, type: string): readonly { readonly tick: number }[] {
  return runtime.events.since(0).filter((event) => event.type === type);
}

describe('rooms.needs-cleared: a room made ready across a save is still announced (#1373)', () => {
  const CELLS = [0, 1, 2, 3].map((index) => ({ x: 1 + index * 3, y: 1, width: 2, height: 3 }));
  /** A cell zoned and furnished only on day 1, after the first daily read has taken its baseline. */
  const LATE_CELL = { x: 1, y: 22, width: 2, height: 3 } as const;
  const FURNISH_AT = DAY + 100;

  function build(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: 20 }));
    submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 20 }));
    for (const rect of [...CELLS, LATE_CELL]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    CELLS.forEach((rect, index) => {
      submit(runtime, `zone${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
      submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
      submit(runtime, `wc${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
    });
    if (runtime.refusals.count !== 0) throw new Error(`the fixture refused ${String(runtime.refusals.count)} commands`);
    return runtime;
  }

  const events: Events = new Map([
    [FURNISH_AT, (runtime: SimulationRuntime) => queue(runtime, 'zone-late', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...LATE_CELL }))],
    [
      FURNISH_AT + 1,
      (runtime: SimulationRuntime) =>
        queue(runtime, 'bed-late', packCommand({ type: 'PlaceObject', orderId: 'bed-late', definitionId: 'bed-wooden', x: LATE_CELL.x, y: LATE_CELL.y })),
    ],
    [
      FURNISH_AT + 2,
      (runtime: SimulationRuntime) =>
        queue(runtime, 'wc-late', packCommand({ type: 'PlaceObject', orderId: 'wc-late', definitionId: 'toilet-brick', x: LATE_CELL.x + 1, y: LATE_CELL.y })),
    ],
  ]);

  it('the continuous run announces the late cell at the end of day 1, and a save taken during day 1 still does', { timeout: 120_000 }, () => {
    const continuous = build();
    stepTo(continuous, 2 * DAY, events);
    expect(continuous.refusals.count, 'the late cell must be zoned and furnished').toBe(0);
    expect(
      eventsOfType(continuous, 'rooms.needs-cleared').map((event) => event.tick),
      'the late cell is announced on the second daily read, or the case is vacuous',
    ).toEqual([2 * DAY - 1]);

    const saveTicks: number[] = [];
    for (let tick = FURNISH_AT + 3; tick < 2 * DAY - 1; tick += 211) saveTicks.push(tick);
    saveTicks.push(2 * DAY - 1);
    expect(scan(build, saveTicks, 2 * DAY + 100, events)).toEqual([]);
  });

  it('a save taken before the first daily read restores to a session that still takes its baseline silently', { timeout: 120_000 }, () => {
    expect(scan(build, [DAY - 1], DAY + 100, events)).toEqual([]);
  });
});

describe('economy rungs: a rung crossed on the tick a save is taken is still announced (#1373)', () => {
  const GUARD = 'staff-role.guard';

  /** `economy-payroll-loop.test.ts`'s overcommitted prison: eight cells, twelve guards, two prisoners and 550 bricks. */
  function build(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(0x9a6e5);
    const rects = Array.from({ length: 8 }, (_unused, index) => ({ x: 1 + index * 3, y: 1, width: 2, height: 3 }));
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: 8 }));
    for (const rect of rects) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    rects.forEach((rect, index) => submit(runtime, `zone${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
    rects.forEach((rect, index) =>
      submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
    );
    stepTo(runtime, 1_000);
    for (let index = 0; index < 12; index += 1) submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
    for (let index = 0; index < 2; index += 1) submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 550 }));
    if (runtime.refusals.count !== 0) throw new Error(`the fixture refused ${String(runtime.refusals.count)} commands`);
    return runtime;
  }

  it('saves around the day-7 crossing, including the crossing tick itself', { timeout: 120_000 }, () => {
    const crossing = 7 * DAY - 1;
    const continuous = build();
    stepTo(continuous, crossing + 1);
    expect(
      continuous.events
        .since(0)
        .filter((event) => event.type.startsWith('economy.'))
        .map((event) => event.tick),
      'the two rungs are crossed together on the day-7 payday, or the case is vacuous',
    ).toEqual([crossing, crossing]);

    expect(scan(build, [crossing - 2, crossing - 1, crossing, crossing + 1], crossing + 200)).toEqual([]);
  });
});
