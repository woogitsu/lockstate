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

/**
 * Something a case does to the prison from outside the timetable, keyed by the
 * tick it happens on: applied just before that tick is stepped, so a save taken
 * *at* that tick has not seen it and the restored runtime applies it itself --
 * exactly where the continuous run does.
 */
type Events = ReadonlyMap<number, (runtime: SimulationRuntime) => void>;

function stepTo(runtime: SimulationRuntime, tick: number, events?: Events): void {
  while (runtime.kernel.tick < tick) {
    events?.get(runtime.kernel.tick)?.(runtime);
    runtime.kernel.step();
  }
}

interface Staffing {
  readonly guards: number;
  readonly hiredAt: { readonly x: number; readonly y: number };
  /** Cells, one prisoner each. Twelve unless a case says otherwise. */
  readonly cells?: number;
  /** Ticks stepped between one admission and the next, which staggers when each prisoner's day begins. */
  readonly admissionGapTicks?: number;
}

/** Six rows of six cells, for the crowded case: `cellRect`'s two rows hold only twelve. */
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
function scan(staffing: Staffing, saveTicks: readonly number[], checkpoint: number, events?: Events): ScanResult {
  const continuous = buildPrison(staffing);
  const expectedSoon = new Map<number, string>();
  for (const tick of saveTicks) {
    const soon = tick + SOON_AFTER_THE_SAVE;
    if (soon >= checkpoint) throw new Error(`save@${String(tick)} is too close to the checkpoint to be compared soon after`);
    stepTo(continuous, soon, events);
    expectedSoon.set(soon, captured(continuous));
  }
  stepTo(continuous, checkpoint, events);
  const expected = captured(continuous);

  const base = buildPrison(staffing);
  let withWalker = 0;
  let withSearchInFlight = 0;
  let withPendingRequest = 0;
  let withGuardWalking = 0;
  const failures: string[] = [];
  for (const tick of saveTicks) {
    stepTo(base, tick, events);
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
      stepTo(restored, at, events);
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
 * **FORMERLY A KNOWN DIVERGENCE, AND INVERTED THE DAY IT WAS FIXED.** The case
 * below used to assert that the save does *not* restore to the same prison,
 * and said so in capitals. It read, in part:
 *
 * > `workBudgetPerTick` (2,000 expanded nodes) binds when enough prisoners ask
 * > for a route on the same tick. Here that is 24 prisoners in six rows of
 * > cells, admitted 7 ticks apart, all re-targeting at the tick-3461 regime
 * > block change. A `RouteCache` or `FlowFieldCache` hit costs 0 against the
 * > budget. A restore starts both caches empty. So a restored session pays for
 * > searches the saved one had already paid for, and on a binding tick it
 * > stops serving at a different request.
 * >
 * > Measured through a real save and restore: every save taken 1 to 40 ticks
 * > before the block change served a different set by tick 3463. With 36
 * > prisoners admitted 7 apart, the same happened for every save taken 1 to
 * > 600 ticks before tick 5801.
 *
 * The owner then ruled *"Zapisywać pamięć tras (zalecane)"* (an option label,
 * the weaker provenance) and ADR 0007's amendment of 2026-09-23 carries the
 * design: a save carries both caches' warmth, in
 * `simulation.inFlight.navigation.caches`. The case went red on that change
 * with its own message -- *"the divergence this case pins has gone: invert it
 * to require equality"* -- and is inverted here as it asked.
 *
 * The cases after it widen the one save to the windows the quotation
 * measured, and then to a save before **every** tick on which the budget
 * deferred work, found by scanning rather than chosen: a binding tick is where
 * the fix matters, so it is where the comparison has to be made.
 */
function deferredRequests(runtime: SimulationRuntime): number {
  // After `step()` the kernel is on the next tick, so `NavigationSystem` last
  // ran on `tick - 1`. A request enqueued before that and still waiting was
  // left over by a budget that ran out.
  const lastServed = runtime.kernel.tick - 1;
  return runtime.navigation.getInFlightSnapshot().pending.filter((request) => request.enqueuedAtTick < lastServed).length;
}

/** Every tick in `[from, to)` on which the navigation budget left work waiting, stepping a fresh prison. */
function bindingTicks(staffing: Staffing, from: number, to: number): number[] {
  const runtime = buildPrison(staffing);
  stepTo(runtime, from);
  const ticks: number[] = [];
  while (runtime.kernel.tick < to) {
    runtime.kernel.step();
    if (deferredRequests(runtime) > 0) ticks.push(runtime.kernel.tick - 1);
  }
  return ticks;
}

const TWENTY_FOUR: Staffing = { ...PRISONERS_ONLY, cells: 24, admissionGapTicks: 7 };
const THIRTY_SIX: Staffing = { ...PRISONERS_ONLY, cells: 36, admissionGapTicks: 7 };

describe('a save taken before the navigation budget binds restores to the same prison (#1373, formerly a KNOWN DIVERGENCE)', () => {
  it('24 prisoners at the tick-3461 block change: a save 1 tick before it serves the same set', { timeout: 120_000 }, () => {
    const binds = 3_461;
    const continuous = buildPrison(TWENTY_FOUR);
    stepTo(continuous, binds + 1);
    expect(deferredRequests(continuous), 'the budget must defer work on this tick, or the case is vacuous').toBeGreaterThan(0);
    stepTo(continuous, binds + 2);

    const base = buildPrison(TWENTY_FOUR);
    stepTo(base, binds - 1);
    const restored = saveAndRestore(base);
    expect(captured(restored), 'the restore itself is still a fixed point').toBe(captured(base));
    stepTo(restored, binds + 2);
    expect(firstDifferences(JSON.parse(captured(continuous)), JSON.parse(captured(restored)))).toEqual([]);
  });

  it('24 prisoners: every save in the 40 ticks before the block change, the window that used to diverge', { timeout: 300_000 }, () => {
    const saveTicks: number[] = [];
    for (let tick = 3_421; tick <= 3_460; tick += 1) saveTicks.push(tick);
    const result = scan(TWENTY_FOUR, saveTicks, 3_461 + 600);

    expect(result.saves).toBe(40);
    expect(result.withPendingRequest).toBeGreaterThan(0);
    expect(result.failures).toEqual([]);
  });

  it('36 prisoners: saves across the 600 ticks before tick 5801 that used to diverge', { timeout: 300_000 }, () => {
    const saveTicks: number[] = [];
    for (let tick = 5_201; tick <= 5_800; tick += 23) saveTicks.push(tick);
    saveTicks.push(5_800);
    const result = scan(THIRTY_SIX, saveTicks, 5_801 + 600);

    expect(result.saves).toBe(saveTicks.length);
    expect(result.withWalker).toBeGreaterThan(0);
    expect(result.failures).toEqual([]);
  });

  it('a save one tick before every binding tick of a day, at 24 and at 36 prisoners', { timeout: 600_000 }, () => {
    for (const staffing of [TWENTY_FOUR, THIRTY_SIX]) {
      const binding = bindingTicks(staffing, DAY, 3 * DAY);
      // Measured when this case was written: the budget defers work on a
      // handful of ticks a day here, clustered at block changes. A day with
      // none would make this case vacuous rather than green.
      expect(binding.length, `cells=${String(staffing.cells)}: the budget must bind somewhere in the day`).toBeGreaterThan(0);
      const saveTicks = [...new Set(binding.map((tick) => tick - 1))].sort((a, b) => a - b);
      const last = saveTicks[saveTicks.length - 1]!;
      const result = scan(staffing, saveTicks, last + SOON_AFTER_THE_SAVE + 400);
      expect(result.failures, `cells=${String(staffing.cells)}, binding ticks ${binding.join(',')}`).toEqual([]);
    }
  });
});

/**
 * **The case a key-and-rebuild save could not carry**, which is why ADR 0007's
 * 2026-09-23 amendment carries the entries themselves.
 *
 * A cached route is valid while every door it depends on gives the traversal
 * verdict it was computed under (`doorDependenciesStillHold`). Locking the
 * canteen invalidates every cached leg into it -- and unlocking it makes them
 * answer again, unrecomputed and unpaid for, because the verdict is back. A
 * save taken *during* the lockdown has to carry those entries for the restored
 * session to have them after the lift; rebuilding at load would search against
 * a locked door and could only produce the refusal.
 *
 * The door is set through the registry directly, identically in both runs and
 * at the same ticks, because that is all a sector lockdown does to a door
 * (`SecuritySectorRegistry.setControlState`), and this fixture's doors belong
 * to no sector. The non-vacuity floor counts saves that carried an entry whose
 * door had changed since it was computed -- the thing under test.
 */
describe('a save taken during a lockdown restores the routes the lift revives (#1373)', () => {
  it('locking the canteen and yard mid-morning and lifting it after the saves', { timeout: 300_000 }, () => {
    const lockAt = DAY + 300;
    const liftAt = DAY + 700;
    const doorIds = ['door:top:19:12', 'door:top:20:28'] as const;
    const setAll = (state: 'locked' | 'open') => (runtime: SimulationRuntime) => {
      for (const id of doorIds) runtime.navigation.doors.setState(id, state);
    };
    const events: Events = new Map([
      [lockAt, setAll('locked')],
      [liftAt, setAll('open')],
    ]);

    const saveTicks: number[] = [];
    for (let tick = lockAt + 1; tick < liftAt; tick += 19) saveTicks.push(tick);

    const probe = buildPrison(PRISONERS_ONLY);
    for (const id of doorIds) expect(probe.navigation.doors.getById(id), `${id} is the door this case locks`).toBeDefined();
    let carriedAChangedDoor = 0;
    for (const tick of saveTicks) {
      stepTo(probe, tick, events);
      const caches = probe.navigation.getInFlightSnapshot().caches;
      if (caches?.routes.some((entry) => entry.dependencies.changed !== undefined)) carriedAChangedDoor += 1;
    }
    expect(carriedAChangedDoor, 'saves must carry entries the lockdown invalidated, or the case is vacuous').toBeGreaterThan(0);

    const result = scan(PRISONERS_ONLY, saveTicks, liftAt + 600, events);
    expect(result.failures).toEqual([]);
  });

  /**
   * A lockdown lifted **just before the budget binds**, arranged so the entries
   * it invalidated are still cached when it lifts -- the case that
   * distinguishes carrying entries from carrying keys.
   *
   * The case above does not bind the budget, and in it most legs the lockdown
   * invalidates are asked for again *during* it (the prisoners still want
   * their meal), which evicts each stale entry and caches the refusal in its
   * place. Here only the yard is locked, from after the day-2 yard block to
   * before the day-3 one, once the fixture has finished building (its
   * geometry changes until about tick 3600, and each change retires every
   * entry). Nobody asks for the yard while it is shut, so its legs stay cached
   * and invalid; measured, 9 of them at the lift. On the day-3 block the
   * budget binds on ticks 8241 and 8242, which it does not on day 3 without
   * the lockdown.
   *
   * **Measured against the design ADR 0007's amendment rejects**: carrying only
   * the entries valid at the save, with this case's non-vacuity floor off,
   * makes this case fail and leaves every other case in the file green.
   */
  it('24 prisoners: the yard locked between two yard blocks and lifted before the binding one', { timeout: 300_000 }, () => {
    const lockAt = 6_400;
    const liftAt = 8_150;
    const yardDoor = 'door:top:20:28';
    const events: Events = new Map([
      [lockAt, (runtime: SimulationRuntime) => runtime.navigation.doors.setState(yardDoor, 'locked')],
      [liftAt, (runtime: SimulationRuntime) => runtime.navigation.doors.setState(yardDoor, 'open')],
    ]);
    const saveTicks: number[] = [];
    for (let tick = lockAt + 1; tick < liftAt; tick += 149) saveTicks.push(tick);
    saveTicks.push(liftAt - 1, liftAt);

    const continuous = buildPrison(TWENTY_FOUR);
    stepTo(continuous, liftAt, events);
    const stale = continuous.navigation.getInFlightSnapshot().caches?.routes.filter((entry) => entry.dependencies.changed !== undefined).length ?? 0;
    expect(stale, 'the save must carry legs the lockdown invalidated, or the case is vacuous').toBeGreaterThan(0);
    let binds = 0;
    while (continuous.kernel.tick < 8_300) {
      stepTo(continuous, continuous.kernel.tick + 1, events);
      if (deferredRequests(continuous) > 0) binds += 1;
    }
    expect(binds, 'the budget must bind after the lift, or the case is vacuous').toBeGreaterThan(0);

    const result = scan(TWENTY_FOUR, saveTicks, 8_300 + 400, events);
    expect(result.failures).toEqual([]);
  });
});
