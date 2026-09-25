import { createHistoricalOpeningRuntime } from '../helpers/historical-opening-treasury';
import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import type { JsonValue } from '../../src/shared/json';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, type LoanTerms } from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { hashFullRuntime, toJsonValue } from '../helpers/determinism-state';

/**
 * **What a save carries of ADR 0075 decision 2, measured rather than argued.**
 *
 * Decision 2 has two halves and a save treats them differently, which is the
 * whole subject of this file:
 *
 * - **The negative balance survives.** `treasury.balanceMinorUnits` is a
 *   required field whose accepted range widened, so a prison that saved under
 *   water loads under water. Pinned below, and the value bound it kept is
 *   pinned in `tests/migrations/save-v5-negative-balance.test.ts`.
 * - **The ledger does not.** There is no loan section in `EncodedEconomy`
 *   (`src/simulation/runtime/session-systems.ts`) and none in
 *   `economySectionSchema` (`src/persistence/save-schema.ts`), so an
 *   outstanding debt is dropped by a round trip and the overdraft floor that
 *   let the prison spend it goes with it.
 *
 * `src/simulation/economy/loans.ts` says the second half itself, and this file
 * is the executable form of that paragraph rather than a discovery:
 *
 * > **No persistence yet, and this one is a gap rather than a boundary.**
 * > ADR 0075's consequences say it plainly — *"outstanding principal has to
 * > survive a save or a player reloads out of their debt"* — and `snapshot`
 * > and `restore` below exist so that whoever adds the save section has
 * > something to call.
 *
 * ## Why this is pinned as a gap rather than reported as a live defect
 *
 * No player can reach it. `createNewSimulationRuntime` builds a `LoanBook`
 * only when `SimulationRuntimeOptions.loanTerms` is supplied, nothing in
 * `src/` supplies it, and `restoreSimulationRuntime` has no channel through
 * which it could: it calls `createHistoricalOpeningRuntime(seed, { world })` and
 * nothing else. So the sessions this file builds are reachable from a test and
 * from `scripts/report-loan-recovery-pricing.mjs`, and from nothing a player
 * touches. Both facts are asserted below rather than cited, because the
 * distinction between "gap" and "defect" rests entirely on them.
 *
 * **What would make this a defect is a single line elsewhere** -- any `src/`
 * caller passing `loanTerms`, or any command that draws. The failing
 * assertions here are the ones that should stop that from landing without the
 * save section beside it, so the tests below are deliberately written to break
 * in the direction of "somebody wired the loan up": three of them assert that
 * a debt is *lost*, and each says in its message what to do when it starts
 * surviving instead.
 *
 * ## No magnitude is chosen here
 *
 * `PROBE_TERMS` is a probe, exactly as
 * `tests/integration/economy-loan-recovery.test.ts` names its own: the
 * diversion share, the fee and the duration belong to
 * [#29](https://github.com/matmaxalez/lockstate/issues/29) under ADR 0017
 * decision 5, and the candidates priced against a real prison are in
 * `docs/research/2026-08-30-pricing-the-way-out.md`. Nothing below is a
 * recommendation, and no assertion here would become wrong if #29 chose
 * differently -- every figure is derived from the probe rather than from a
 * catalogue.
 */

/** A probe, and nothing here is a recommendation. A quarter of each inflow, a tenth as the fee, a duration no case below reaches. */
const PROBE_TERMS: LoanTerms = {
  diversionRateBasisPoints: 2_500,
  feeRateBasisPoints: 1_000,
  maximumDurationDays: 90,
  escalatedDiversionRateBasisPoints: 5_000,
};

const SEED = 0x694;
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** The tile `src/main.ts` admits at. */
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
/** Written out rather than read from the catalogue, exactly as `docs/TESTING.md` asks: two `item.brick` at 40. */
const WALL_COST = 80;

interface Edge {
  readonly x: number;
  readonly y: number;
  readonly edge: 'north' | 'west';
}

function cellRingEdges(): Edge[] {
  const ring: Edge[] = [];
  for (let x = CELL_RECT.x; x < CELL_RECT.x + CELL_RECT.width; x += 1) {
    ring.push({ x, y: CELL_RECT.y, edge: 'north' });
    ring.push({ x, y: CELL_RECT.y + CELL_RECT.height, edge: 'north' });
  }
  for (let y = CELL_RECT.y; y < CELL_RECT.y + CELL_RECT.height; y += 1) {
    ring.push({ x: CELL_RECT.x, y, edge: 'west' });
    ring.push({ x: CELL_RECT.x + CELL_RECT.width, y, edge: 'west' });
  }
  return ring;
}

function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`c${String(sequence)}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function step(runtime: SimulationRuntime, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) runtime.kernel.step();
}

/**
 * A prison that earns, reached only through commands a player has.
 *
 * Ten perimeter edges -- nine walls and the door -- then the designation, a
 * bed and one admission. The occupancy this produces is what
 * `StateIncomeSystem` pays for, and it is what makes the diversion below a
 * measurement of a repayment rather than of a method call.
 */
function earningSession(options: { readonly loanTerms?: LoanTerms } = {}): SimulationRuntime {
  const runtime = createHistoricalOpeningRuntime(SEED, options);
  const ring = cellRingEdges();
  const doorway = ring[ring.length - 1] as Edge;
  ring.slice(0, ring.length - 1).forEach((edge, index) => {
    send(runtime, { type: 'PlaceBuildOrder', orderId: `wall-${String(index)}`, definitionId: 'wall-brick', ...edge });
  });
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'door', definitionId: 'door-wooden', ...doorway });
  step(runtime, DAY_LENGTH_TICKS);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
  send(runtime, { type: 'PlaceObject', orderId: 'bed-0', definitionId: 'bed-wooden', x: CELL_RECT.x, y: CELL_RECT.y });
  step(runtime, 900);
  send(runtime, { type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL });
  step(runtime, 600);
  expect(runtime.refusals.count, 'the fixture must afford and be allowed everything it does').toBe(0);
  expect(runtime.prisoners.roomInstances.totalOccupancy, 'without an occupied place there is no inflow to divert').toBe(1);
  return runtime;
}

/** Steps to the next day boundary and returns what the balance gained across it. */
function earnOneDay(runtime: SimulationRuntime): number {
  const before = runtime.treasury.balanceMinorUnits;
  const boundary = (Math.floor(runtime.kernel.tick / DAY_LENGTH_TICKS) + 1) * DAY_LENGTH_TICKS;
  while (runtime.kernel.tick < boundary) runtime.kernel.step();
  return runtime.treasury.balanceMinorUnits - before;
}

function roundTrip(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
  // Through JSON, which is how a bundle actually reaches a restore from
  // storage and which destroys every object identity a same-process test
  // could otherwise accidentally rely on.
  const throughStorage = JSON.parse(JSON.stringify(bundle)) as SessionSnapshotBundle;
  return restoreSimulationRuntime(throughStorage).runtime;
}

describe('the loan is unreachable without terms, which is what makes the gap below a gap', () => {
  it('gives a default session no ledger at all, and a restore no way to ask for one', () => {
    expect(createHistoricalOpeningRuntime(SEED).loans, 'no `src/` caller supplies `loanTerms`').toBeUndefined();

    // The structural half: even a session that *had* a book comes back
    // without one, because `restoreSimulationRuntime` builds its runtime with
    // `{ world }` and nothing else. Adding the save section is therefore not
    // sufficient on its own -- the terms need a route through a restore too.
    const borrowed = earningSession({ loanTerms: PROBE_TERMS });
    expect(borrowed.loans, 'the fixture must have a book for this assertion to mean anything').toBeDefined();
    expect(roundTrip(borrowed).loans, 'a restored session has no book to restore a ledger into').toBeUndefined();
  }, 30_000);
});

describe('a negative balance survives a save, and the debt that produced it does not', () => {
  it('loads a prison under water exactly as far under as it saved', () => {
    const runtime = earningSession({ loanTerms: PROBE_TERMS });
    const floor = -10 * WALL_COST;
    runtime.treasury.setOverdraftFloor(floor);
    // Spent through the real command path, so the negative balance is one a
    // session reached rather than one assigned to it.
    const spendable = runtime.treasury.balanceMinorUnits - floor;
    const walls = Math.floor(spendable / WALL_COST);
    const edges: Edge[] = [];
    for (let y = 12; y < 32 && edges.length < walls; y += 1) {
      for (let x = 1; x < 32 && edges.length < walls; x += 1) edges.push({ x, y, edge: 'north' });
    }
    expect(edges.length, 'the sweep must be able to place every wall the money reaches').toBe(walls);
    edges.forEach((edge, index) => {
      send(runtime, { type: 'PlaceBuildOrder', orderId: `under-${String(index)}`, definitionId: 'wall-brick', ...edge });
    });
    step(runtime, DAY_LENGTH_TICKS);

    const underWater = runtime.treasury.balanceMinorUnits;
    expect(underWater, 'the fixture must actually be under water').toBeLessThan(0);

    const restored = roundTrip(runtime);
    expect(restored.treasury.balanceMinorUnits, 'a reload is not a way out of the overdraft').toBe(underWater);
  }, 30_000);

  it('drops the outstanding principal, so the same save is worth more after a reload than before', () => {
    /*
     * The behavioural form, and the one ADR 0075's consequence sentence is
     * about: *"outstanding principal has to survive a save or a player
     * reloads out of their debt."*
     *
     * Two sessions, one save, one in-game day each. The original hands the
     * debt its share of the day's income; the restored one has no debt to
     * hand it to and keeps the lot. The difference is the diversion, and it
     * is money a reload created.
     */
    const runtime = earningSession({ loanTerms: PROBE_TERMS });
    const book = runtime.loans;
    if (book === undefined) throw new Error('the fixture must carry a loan book');

    const principal = 4_000;
    expect(book.draw(principal, runtime.kernel.tick), 'the drawdown must succeed').toBe(true);
    // Written out rather than taken from `feeFor`, which is the code under
    // test: 4,000 at the probe's 1,000 basis points is 400.
    expect(book.outstandingMinorUnits, 'principal plus the probe fee, and nothing else touches it upward').toBe(4_400);

    const restored = roundTrip(runtime);

    const keptByTheOriginal = earnOneDay(runtime);
    const keptByTheReload = earnOneDay(restored);

    expect(book.divertedTotalMinorUnits, 'the original really did repay something').toBeGreaterThan(0);
    expect(keptByTheOriginal + book.divertedTotalMinorUnits).toBe(keptByTheReload);
    expect(
      keptByTheReload,
      'when this starts failing because the two are equal, the loan section has landed and this test should assert the debt survived instead',
    ).toBeGreaterThan(keptByTheOriginal);
    expect(book.outstandingMinorUnits, 'the original still owes it').toBeGreaterThan(0);
  }, 30_000);

  it('carries no trace of the ledger in the payload, by any of its three figures', () => {
    const runtime = earningSession({ loanTerms: PROBE_TERMS });
    const book = runtime.loans;
    if (book === undefined) throw new Error('the fixture must carry a loan book');
    const drawnAt = runtime.kernel.tick;
    expect(book.draw(4_000, drawnAt)).toBe(true);
    const snapshot = book.snapshot();
    expect(snapshot, 'the positive control: the ledger has something to lose').toEqual({
      outstandingMinorUnits: 4_400,
      principalMinorUnits: 4_000,
      drawnAtTick: drawnAt,
    });

    // Searched rather than read off a named key, because the point is that
    // there is no key to name. `outstandingMinorUnits` and
    // `principalMinorUnits` are the two figures `LoanSnapshot` holds that
    // nothing else in the payload could plausibly be; `drawnAtTick` equals a
    // real kernel tick and is deliberately not searched for.
    const payload = JSON.stringify(toJsonValue(captureSessionSnapshot(runtime)));
    expect(payload.includes('outstandingMinorUnits')).toBe(false);
    expect(payload.includes('principalMinorUnits')).toBe(false);
    expect(payload.includes('4400'), 'the outstanding figure is nowhere in the save').toBe(false);
  }, 30_000);

  it('drops the room a loan opened and restores the standing overdraft instead', () => {
    /*
     * `TreasurySnapshot` is `{ balanceMinorUnits }` and nothing else, so the
     * floor a session is running with is not in the file. The consequence is
     * sharper than "a field is missing": the restored prison holds the
     * borrowed money and has lost the permission that made borrowing usable,
     * so a spend the pre-save session allowed is refused after a reload.
     *
     * **This case asserted the restored floor was `0`, and it was, and the
     * sentence beside it was *"when this starts failing, the floor became part
     * of the save and this test should assert it came back"*. It started failing
     * for the other reason.** #703 ruling A made the floor a standing facility
     * applied where the `Treasury` is built
     * (`createNewSimulationRuntime`), and `restoreSimulationRuntime` builds
     * through that function -- so a restored prison comes back with
     * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` and *nothing was persisted*
     * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
     * §(e)). The finding is unchanged and is still the one worth pinning: the
     * room a *loan* opened does not survive, because no loan state does. The
     * probe floor is therefore deeper than the standing one, so the loss is
     * still observable.
     */
    const runtime = earningSession({ loanTerms: PROBE_TERMS });
    const floor = TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS - 20 * WALL_COST;
    runtime.treasury.setOverdraftFloor(floor);
    // Spend to exactly the standing floor, so what remains affordable is only
    // the extra room the loan's own floor opened.
    expect(runtime.treasury.spend(runtime.treasury.balanceMinorUnits - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, 'wages')).toBe(true);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(runtime.treasury.canAfford(WALL_COST, 'wages'), 'the pre-save session can spend into the overdraft').toBe(true);

    const restored = roundTrip(runtime);
    expect(restored.treasury.balanceMinorUnits).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(
      restored.treasury.overdraftFloorMinorUnits,
      'the composition root applied it; the save carries no floor at all',
    ).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(
      restored.treasury.canAfford(WALL_COST, 'wages'),
      'when this starts failing, the floor became part of the save and this test should assert it came back',
    ).toBe(false);
  }, 30_000);
});

describe('why no determinism fingerprint could have moved when the balance stopped being non-negative', () => {
  it('hashes two sessions that differ only in their balance to the same runtime fingerprint, and to different save checksums', () => {
    /*
     * ADR 0075 decision 2 was reported as moving no fingerprint. It did not,
     * and this is the reason rather than a coincidence: `fullRuntimeState`
     * (`tests/helpers/determinism-state.ts`) reads the kernel, world,
     * construction, prisoners, security, contraband, incidents and navigation
     * surfaces and no economy surface at all, so **no** change to the money
     * could move the runtime hash. The claim is therefore true and carries no
     * information about the change.
     *
     * `computeSaveChecksum` is the hash that does see the money, and the pair
     * below is what makes this a measurement instead of an absence: the same
     * two sessions that hash identically as runtimes checksum differently as
     * saves.
     *
     * A pin rather than an observation. If the treasury is ever added to the
     * runtime fingerprint -- which `src/simulation/economy/treasury.ts`
     * already tells a reader it is part of -- the first assertion fails, and
     * whoever adds it has to re-derive "no fingerprint moves" instead of
     * inheriting it.
     */
    const left = earningSession();
    const right = earningSession();
    expect(right.treasury.spend(WALL_COST, 'deliveries'), 'the two sessions must actually differ').toBe(true);
    expect(left.treasury.balanceMinorUnits).not.toBe(right.treasury.balanceMinorUnits);

    expect(hashFullRuntime(right), 'the runtime fingerprint does not read the treasury').toBe(hashFullRuntime(left));

    const checksumOf = (runtime: SimulationRuntime): string =>
      computeSaveChecksum(toJsonValue(captureSessionSnapshot(runtime)) as JsonValue);
    expect(checksumOf(right), 'the save checksum does').not.toBe(checksumOf(left));
  }, 30_000);
});
