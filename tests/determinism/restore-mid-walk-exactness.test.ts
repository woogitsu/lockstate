import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import { canonicalJson } from '../../src/simulation/determinism/canonical';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Save, restore, continue is the same game as continue** -- issue #1373, and
 * the owner's ruling of 2026-09-23 on
 * [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
 * open question 3 (option 5, *"Zapisuj marsz (zalecane)"*).
 *
 * ## What was measured before this file existed
 *
 * On `main` at `ceb6865e`, with this fixture, saves taken every 37 ticks
 * through day 2: **41 of the 41 saves taken while any prisoner was walking
 * diverged permanently, and 0 of the 24 taken while nobody was walking did**.
 * The first difference was at the restore tick itself --
 * `PrisonerOperationsRuntime.loadSnapshot` dropped every walker to `idle`, so a
 * capture of the freshly restored runtime was not the capture it had been
 * restored from.
 *
 * ## What is asserted, and why it is the whole snapshot
 *
 * Two properties per save tick, both over the **entire**
 * `captureSessionSnapshot`, serialised the way the save's checksum sees it
 * (see `captured`), rather than over a chosen subset of fields:
 *
 * 1. **The restore is a fixed point.** Capturing the restored runtime gives
 *    back exactly what it was restored from. A field a restore drops or
 *    rewrites fails this on the restore tick, which is the earliest a
 *    divergence can be seen and the cheapest place to diagnose it.
 * 2. **The future is the same.** The restored runtime, stepped fifty ticks
 *    on and then to a far checkpoint, captures exactly what the continuous
 *    run captured at each.
 *    This is the property the ruling asks for, and (1) does not imply it: a
 *    state the capture does not carry -- a counter, a queue, a walk -- can
 *    agree at the restore tick and still steer the next thousand ticks
 *    differently.
 *
 * Neither side of either comparison is computed by the code under test: the
 * expected value is the continuous run's own capture, produced by a runtime
 * that was never saved.
 *
 * The save goes through `createSaveEnvelope` -> JSON -> `decodeSaveEnvelope`,
 * the real persistence boundary, so a new field that the `.strict()` schema
 * does not declare fails here as `invalid-shape` rather than passing on a path
 * no player takes.
 *
 * ## Why the non-vacuity floors
 *
 * A scan whose save ticks all happened to fall where nobody was walking would
 * pass on the code this file exists to reject. So the test counts the saves
 * taken with a prisoner walking, with a path request still unresolved, and --
 * in the second case -- with a guard walking, and requires each count to be
 * non-zero before it trusts the comparison.
 */

const SEED = 0x586;
const DAY = 2_400;
const START = 1_000;
const CELL_COUNT = 12;
const ARRIVAL = { x: 16, y: 16 } as const;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
const TRAVELLING = ACTION_PHASES.indexOf('travelling');

function cellRect(index: number) {
  return index < 6 ? { x: 1 + index * 3, y: 1, width: 2, height: 3 } : { x: 1 + (index - 6) * 3, y: 14, width: 2, height: 3 };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

interface Staffing {
  readonly guards: number;
  readonly hiredAt: { readonly x: number; readonly y: number };
  /** Cells, one prisoner each. Twelve unless a case says otherwise. */
  readonly cells?: number;
  /** Ticks stepped between one admission and the next, which staggers when each prisoner's day begins. */
  readonly admissionGapTicks?: number;
}

/** Six rows of six cells, for the crowded cases: `cellRect`'s two rows hold only twelve. */
const CROWDED_ROWS = [1, 5, 9, 14, 18, 22] as const;

function crowdedCellRect(index: number) {
  return { x: 1 + (index % 6) * 3, y: CROWDED_ROWS[Math.floor(index / 6)]!, width: 2, height: 3 };
}

/** #1373's staffing: two guards hired on the post tile, so neither ever walks. */
const PRISONERS_ONLY: Staffing = { guards: 2, hiredAt: ARRIVAL };
/**
 * Six guards hired six tiles from the post. Two walk to it; the other four are
 * the spare pool `SectorSearchDutySystem` staffs standing sweeps from, so
 * `SearchSystem` has jobs in flight for much of the day.
 */
const GUARDS_WALKING_AND_SEARCHING: Staffing = { guards: 6, hiredAt: { x: 10, y: 10 } };

/**
 * Twelve cells with a bed and a toilet each, a shower room, a canteen and a
 * yard, all built through the real command router; twelve prisoners admitted
 * at one arrival tile, so the timetable sends them walking in crowds. With
 * `PRISONERS_ONLY` it is the fixture #1373 measured.
 */
function buildPrison(staffing: Staffing): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cellCount = staffing.cells ?? CELL_COUNT;
  const cells = Array.from({ length: cellCount }, (_unused, index) => (cellCount > CELL_COUNT ? crowdedCellRect(index) : cellRect(index)));
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: cellCount + 14 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: cellCount + 2 }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  for (const rect of [SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
  submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
  cells.forEach((rect, index) => {
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  submit(runtime, 'sh0', packCommand({ type: 'PlaceObject', orderId: 'sh0', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
  submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
  submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
  submit(runtime, 'dt2', packCommand({ type: 'PlaceObject', orderId: 'dt2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
  for (let index = 0; index < 4; index += 1) {
    submit(
      runtime,
      `bench${String(index)}`,
      packCommand({
        type: 'PlaceObject',
        orderId: `bench${String(index)}`,
        definitionId: 'bench-wooden',
        x: CANTEEN.x + (index % 2) * 2,
        y: CANTEEN.y + 2 + Math.floor(index / 2),
      }),
    );
  }
  stepTo(runtime, START);
  for (let guard = 0; guard < staffing.guards; guard += 1) {
    submit(runtime, `hire${String(guard)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...staffing.hiredAt }));
  }
  for (let index = 0; index < cellCount; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    for (let gap = 0; gap < (staffing.admissionGapTicks ?? 0); gap += 1) runtime.kernel.step();
  }
  if (runtime.refusals.count !== 0) throw new Error(`the fixture refused ${String(runtime.refusals.count)} commands`);
  return runtime;
}

/** Through the real save boundary: envelope, JSON text, schema validation, decode. */
function saveAndRestore(saved: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(saved);
  const envelope = createSaveEnvelope({
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'restore-mid-walk',
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

/**
 * The capture as the save identifies it: through JSON (what storage keeps) and
 * then in canonical key order, which is what `computeSaveChecksum` hashes.
 *
 * Canonical rather than `JSON.stringify` alone because object key *insertion
 * order* is not state -- a guard record whose `pathRequestId` was assigned
 * after its `patrolWaypointIndex` serialises the two in that order live and in
 * the payload's order once restored -- and the checksum is already
 * insensitive to it (`deterministicStateHash`). Everything else, array order
 * included, is compared exactly.
 */
function captured(runtime: SimulationRuntime): string {
  return canonicalJson(JSON.parse(JSON.stringify(captureSessionSnapshot(runtime))) as JsonValue);
}

/** The first few paths at which two captures differ, so a red run names the field rather than printing two megabytes of JSON. */
function firstDifferences(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 6 || a === b) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    out.push(`${path}: ${String(JSON.stringify(a)).slice(0, 120)} != ${String(JSON.stringify(b)).slice(0, 120)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) firstDifferences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, out);
  return out;
}

function walkingPrisoners(runtime: SimulationRuntime): number {
  let count = 0;
  const store = runtime.prisoners.entityStore;
  for (let index = 0; index <= store.maxActiveIndex; index += 1) {
    if (store.isIndexAlive(index) && runtime.prisoners.currentAction.phase[index] === TRAVELLING) count += 1;
  }
  return count;
}

interface ScanResult {
  readonly saves: number;
  readonly withWalker: number;
  readonly withPendingRequest: number;
  readonly withGuardWalking: number;
  readonly withSearchInFlight: number;
  readonly failures: readonly string[];
}

/**
 * How long after each save the first comparison is made. Short on purpose: a
 * restore that loses a *delay* -- a dwell timer restarted, a request served a
 * cycle late -- can reconverge by the far checkpoint once the late work
 * catches up, and would pass a comparison made only there. Fifty ticks is
 * longer than every dwell and cadence the fixture exercises (a sweep target's
 * 15-tick dwell, the 20-tick reconsideration) and shorter than any of them
 * twice over.
 */
const SOON_AFTER_THE_SAVE = 50;

/**
 * Saves at each of `saveTicks` from one run, restores each, and compares the
 * fixed point at the save tick and the future at two ticks after it. The
 * continuous run is a separate runtime that is never saved, so it cannot be
 * perturbed by a capture.
 */
function scan(staffing: Staffing, saveTicks: readonly number[], checkpoint: number): ScanResult {
  const continuous = buildPrison(staffing);
  const expectedSoon = new Map<number, string>();
  for (const tick of saveTicks) {
    const soon = tick + SOON_AFTER_THE_SAVE;
    if (soon >= checkpoint) throw new Error(`save@${String(tick)} is too close to the checkpoint to be compared soon after`);
    stepTo(continuous, soon);
    expectedSoon.set(soon, captured(continuous));
  }
  stepTo(continuous, checkpoint);
  const expected = captured(continuous);

  const base = buildPrison(staffing);
  let withWalker = 0;
  let withSearchInFlight = 0;
  let withPendingRequest = 0;
  let withGuardWalking = 0;
  const failures: string[] = [];
  for (const tick of saveTicks) {
    stepTo(base, tick);
    if (walkingPrisoners(base) > 0) withWalker += 1;
    if (base.navigation.pendingCount() + base.navigation.resultCount() > 0) withPendingRequest += 1;
    if (base.securityGuards.locomotion.walkingCount > 0) withGuardWalking += 1;
    if (base.searchSystem.getSnapshot().active.length > 0) withSearchInFlight += 1;

    const restored = saveAndRestore(base);
    const atSave = captured(base);
    const atRestore = captured(restored);
    if (atRestore !== atSave) {
      failures.push(`save@${String(tick)} not a fixed point: ${firstDifferences(JSON.parse(atSave), JSON.parse(atRestore)).join(' | ')}`);
      continue;
    }
    for (const [at, want] of [
      [tick + SOON_AFTER_THE_SAVE, expectedSoon.get(tick + SOON_AFTER_THE_SAVE)!],
      [checkpoint, expected],
    ] as const) {
      stepTo(restored, at);
      const got = captured(restored);
      if (got !== want) {
        failures.push(`save@${String(tick)} diverged by ${String(at)}: ${firstDifferences(JSON.parse(want), JSON.parse(got)).join(' | ')}`);
        break;
      }
    }
  }
  return { saves: saveTicks.length, withWalker, withPendingRequest, withGuardWalking, withSearchInFlight, failures };
}

describe('a save taken while somebody is walking restores to the same prison (#1373)', () => {
  it('every save across a day of the timetable is a fixed point and continues to the same state', { timeout: 120_000 }, () => {
    const saveTicks: number[] = [];
    for (let tick = DAY + 1; tick < 2 * DAY; tick += 37) saveTicks.push(tick);
    const result = scan(PRISONERS_ONLY, saveTicks, 2 * DAY + 600);

    expect(result.saves).toBe(65);
    expect(result.withWalker).toBeGreaterThanOrEqual(20);
    expect(result.withPendingRequest).toBeGreaterThan(0);
    expect(result.failures).toEqual([]);
  });

  it('a save taken while guards walk to their posts and search the cells', { timeout: 120_000 }, () => {
    // Dense over the first minute, where the guards are walking to the post,
    // then every 13 ticks through the rest of the day, where the spare guards
    // are staffing sweeps.
    const saveTicks: number[] = [];
    for (let tick = START + 1; tick < START + 60; tick += 2) saveTicks.push(tick);
    for (let tick = START + 60; tick < DAY; tick += 13) saveTicks.push(tick);
    const result = scan(GUARDS_WALKING_AND_SEARCHING, saveTicks, DAY + 600);

    expect(result.withGuardWalking).toBeGreaterThanOrEqual(10);
    expect(result.withSearchInFlight).toBeGreaterThanOrEqual(10);
    expect(result.withWalker).toBeGreaterThan(0);
    expect(result.withPendingRequest).toBeGreaterThan(0);
    expect(result.failures).toEqual([]);
  });
});

/**
 * The older-save half of the compatibility rule (ADR 0038 decision 1): a save
 * written before issue #1373 has no `simulation.inFlight` section, and it must
 * still decode through the real boundary and restore exactly as those builds
 * restored it -- walks cleared, travellers idle, the navigation queue empty.
 * The expected values are the old reset's own outcome read off the saved
 * runtime, not a restore of it.
 */
describe('a save written before the walk was saved (#1373 compatibility)', () => {
  function savedWithWalkers(): SimulationRuntime {
    const base = buildPrison(PRISONERS_ONLY);
    // The first save tick of case 1 that has walkers, found rather than chosen.
    for (let tick = DAY + 1; tick < 2 * DAY; tick += 37) {
      stepTo(base, tick);
      if (walkingPrisoners(base) > 0 && base.prisoners.locomotion.walkingCount > 0) return base;
    }
    throw new Error('no save tick in the day had a prisoner walking');
  }

  function envelopeWithout(saved: SimulationRuntime, drop: boolean): unknown {
    const bundle = captureSessionSnapshot(saved);
    if (bundle.simulation === undefined) throw new Error('a captured session must carry a simulation section');
    const { inFlight: _inFlight, ...older } = bundle.simulation;
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'before-1373',
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      simulation: drop ? older : bundle.simulation,
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    return JSON.parse(JSON.stringify(envelope)) as unknown;
  }

  it('decodes and restores with the old reset: nobody walking, nobody travelling, nothing queued', () => {
    const saved = savedWithWalkers();
    const walkersAtSave = walkingPrisoners(saved);
    expect(walkersAtSave).toBeGreaterThan(0);

    const decoded = decodeSaveEnvelope(envelopeWithout(saved, true));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect((decoded.value.payload as { simulation?: { inFlight?: unknown } }).simulation?.inFlight).toBeUndefined();
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    expect(walkingPrisoners(restored)).toBe(0);
    expect(restored.prisoners.locomotion.walkingCount).toBe(0);
    expect(restored.navigation.pendingCount() + restored.navigation.resultCount()).toBe(0);
    // Every prisoner who was travelling is idle on the tile they had reached.
    const store = saved.prisoners.entityStore;
    for (let index = 0; index <= store.maxActiveIndex; index += 1) {
      if (!store.isIndexAlive(index) || saved.prisoners.currentAction.phase[index] !== TRAVELLING) continue;
      expect(restored.prisoners.currentAction.phase[index]).toBe(ACTION_PHASES.indexOf('idle'));
      expect(restored.prisoners.position.tileX[index]).toBe(saved.prisoners.position.tileX[index]);
      expect(restored.prisoners.position.tileY[index]).toBe(saved.prisoners.position.tileY[index]);
    }

    // And it plays on: a restored older save is a session, not a dead end.
    stepTo(restored, restored.kernel.tick + 400);
    let alive = 0;
    for (let index = 0; index <= restored.prisoners.entityStore.maxActiveIndex; index += 1) if (restored.prisoners.entityStore.isIndexAlive(index)) alive += 1;
    expect(alive).toBe(CELL_COUNT);
  });

  it('decodes the same save with the section present, which is the shape this build writes', () => {
    const decoded = decodeSaveEnvelope(envelopeWithout(savedWithWalkers(), false));
    expect(decoded.ok).toBe(true);
  });

  it('resets only the traveller whose carried request the restored queue does not hold', () => {
    // A tick where somebody holds an outstanding request *and* somebody else is
    // mid-walk, found by stepping rather than chosen.
    const saved = buildPrison(PRISONERS_ONLY);
    stepTo(saved, DAY + 1);
    while (saved.prisoners.coldState.getPathRequestSnapshot().length === 0 || saved.prisoners.locomotion.walkingCount === 0) {
      if (saved.kernel.tick > 2 * DAY) throw new Error('no tick had both a request outstanding and a walk in progress');
      saved.kernel.step();
    }
    const bundle = JSON.parse(JSON.stringify(captureSessionSnapshot(saved))) as SessionSnapshotBundle;
    const inFlight = bundle.simulation!.inFlight!;
    // A hand-edited save: one waiting-or-resolved request removed from the
    // queue while its owner still names it. No writer produces this.
    const [victim] = inFlight.prisoners.pathRequestIds;
    if (victim === undefined) throw new Error('the save had no outstanding prisoner request to remove');
    const [entityId, requestId] = victim;
    const edited: SessionSnapshotBundle = {
      ...bundle,
      simulation: {
        ...bundle.simulation!,
        inFlight: {
          ...inFlight,
          navigation: {
            pending: inFlight.navigation.pending.filter((entry) => entry.id !== requestId),
            results: inFlight.navigation.results.filter((entry) => entry.id !== requestId),
          },
        },
      },
    };
    const restored = restoreSimulationRuntime(edited, SEED).runtime;
    const index = restored.prisoners.entityStore.getIndex(entityId);
    expect(restored.prisoners.currentAction.phase[index]).toBe(ACTION_PHASES.indexOf('idle'));
    expect(restored.prisoners.coldState.getPathRequestId(entityId)).toBeUndefined();
    // Everyone else's walk came back untouched.
    expect(restored.prisoners.locomotion.walkingCount).toBe(saved.prisoners.locomotion.walkingCount);
  });
});

/**
 * **The work budget binds, and a restore must not change who it serves** -- the
 * weakest claim of the first #1373 landing, measured rather than argued.
 *
 * `workBudgetPerTick` (2,000 expanded nodes) binds only when enough prisoners
 * ask for a route on the same tick: here, 24 and 34 prisoners in six rows of
 * cells all re-targeting at a regime block change. On the tick it binds, the
 * queue serves requests in order until the spend reaches the budget and defers
 * the rest to the next tick.
 *
 * **What the spend used to depend on.** A `RouteCache` or `FlowFieldCache` hit
 * cost 0 expansions, and a restore starts both caches empty, so a restored
 * session paid for searches the saved one had already paid for before the
 * save. Replayed on the pending queue of the binding tick, a warm and a cold
 * cache served different sets on 13 of 331 binding ticks across populations
 * of 18 to 36. Through a real save and restore, the two populations below
 * diverged: 24 prisoners (admitted 7 ticks apart) on every save taken 1 to 40
 * ticks before the tick-3461 block change, and 36 (7 apart) on every save
 * taken 1 to 600 ticks before the tick-5801 one, on day 3.
 *
 * Each case asserts that the budget really binds on the continuous run, so it
 * cannot pass on a population too small to reach it.
 */
describe('a save taken before the navigation budget binds restores to the same prison (#1373)', () => {
  const deferredPastOneTick = (runtime: SimulationRuntime): number =>
    runtime.navigation.getInFlightSnapshot().pending.filter((request) => request.enqueuedAtTick < runtime.kernel.tick - 1).length;

  for (const [cells, admissionGapTicks, binds] of [
    [24, 7, 3_461],
    [36, 7, 5_801],
  ] as const) {
    it(`${String(cells)} prisoners, the budget binding at tick ${String(binds)}`, { timeout: 120_000 }, () => {
      const staffing: Staffing = { ...PRISONERS_ONLY, cells, admissionGapTicks };
      const continuous = buildPrison(staffing);
      stepTo(continuous, binds + 1);
      expect(deferredPastOneTick(continuous), 'the budget must defer work on this tick, or the case is vacuous').toBeGreaterThan(0);
      stepTo(continuous, binds + 2);
      const soon = captured(continuous);
      stepTo(continuous, binds + 600);
      const far = captured(continuous);

      const failures: string[] = [];
      for (const back of [1, 3, 10, 20, 40, 150, 600]) {
        const base = buildPrison(staffing);
        stepTo(base, binds - back);
        const restored = saveAndRestore(base);
        stepTo(restored, binds + 2);
        const got = captured(restored);
        if (got !== soon) {
          failures.push(`save@${String(binds - back)} diverged by ${String(binds + 2)}: ${firstDifferences(JSON.parse(soon), JSON.parse(got)).join(' | ')}`);
          continue;
        }
        stepTo(restored, binds + 600);
        const later = captured(restored);
        if (later !== far) failures.push(`save@${String(binds - back)} diverged by ${String(binds + 600)}: ${firstDifferences(JSON.parse(far), JSON.parse(later)).join(' | ')}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
