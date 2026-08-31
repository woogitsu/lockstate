// Prices ADR 0075 decision 2's loan terms by **playing out of the locked
// position** -- 40 in the bank, 312 wall segments standing, no prisoners, no
// staff, a 65 plank needed -- through the real kernel and the real command
// router.
//
// NOT a gate and not collected by anything. `vitest.config.ts` includes
// `tests/**/*.test.ts`, this is a `.mjs` under `scripts/`, and it is the same
// shape as `scripts/report-tick-system-cost.mjs`: a measurement that has to be
// re-runnable rather than re-argued. Its output is the deliverable and the
// findings live in `docs/research/2026-08-30-pricing-the-way-out.md`.
//
// Run it with:
//   node --experimental-transform-types scripts/report-loan-recovery-pricing.mjs
//
// ## What is measured, and what is deliberately not decided
//
// The diversion percentage, the fixed fee and the maximum duration are
// [#29](https://github.com/matmaxalez/lockstate/issues/29)'s under ADR 0017
// decision 5. **Nothing here chooses one.** Every triple in `CANDIDATES` is a
// probe: five points spanning cautious to generous, priced so the owner can
// choose with the costs on the table. The same is true of `PRINCIPALS`.
//
// ## Why this plays rather than computes
//
// Three things a spreadsheet gets wrong about this prison, each measured
// below rather than assumed:
//
//  1. **A prisoner-day is not 300.** `stateIncomeForPrisonerDay` withholds 40
//     for each of six needs the prison leaves unmet (ADR 0064), and a cell
//     with a bed and nothing else leaves three of them unmet for ever.
//  2. **The locked prison owes money to its own build queue.** The playtest
//     that established this position read *"Waiting for 1,040 to buy
//     materials."* at the bottom -- a drag's worth of wall orders that were
//     never funded and that take the first 1,040 of anything that arrives,
//     before the player can buy a plank.
//  3. **Capacity, not cash, is what a recovering prison runs out of.** A
//     `room.cell` at its authored 2x3 minimum holds four beds, and the fourth
//     is refused for a reason that has nothing to do with money.
import process from 'node:process';
import { loadSimulationRuntimeModules } from '../benchmarks/production-modules.mjs';

/** The 2x3 rectangle every object fixture in this repository zones. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 };
/** The tile `src/main.ts` admits at. */
const ARRIVAL = { x: 16, y: 16 };
const CELL_INSTANCE_ID = `room.cell:${CELL_RECT.x}:${CELL_RECT.y}`;

/**
 * The five candidate triples, cautious to generous.
 *
 * `escalated` is what the diversion rises to once `durationDays` have passed
 * since drawdown -- ADR 0075 decision 2's second named mitigation. Rates are
 * basis points because the simulation's money is integer minor units.
 */
const CANDIDATES = [
  { name: 'A bank',      diversion: 5_000, fee: 2_500, durationDays: 20, escalated: 7_500 },
  { name: 'B prudent',   diversion: 3_500, fee: 2_000, durationDays: 30, escalated: 6_000 },
  { name: 'C middle',    diversion: 2_500, fee: 1_500, durationDays: 45, escalated: 4_500 },
  { name: 'D generous',  diversion: 1_500, fee: 1_000, durationDays: 60, escalated: 3_000 },
  { name: 'E soft',      diversion: 1_000, fee:   500, durationDays: 90, escalated: 2_000 },
];

/** Principals to price each candidate at. Whether a ceiling exists, and where, is #29's too. */
const PRINCIPALS = [200, 500, 1_000, 1_500, 2_000];

/**
 * Which sections to run, as a comma-separated list in
 * `LOCKSTATE_PRICING_SECTIONS`. All of them by default; a whole run is several
 * minutes of real kernel ticks, and re-checking one table should not cost the
 * other six.
 */
const SECTIONS = (process.env.LOCKSTATE_PRICING_SECTIONS ?? '1,2,3,4,5,6,7,8,9,10,10c').split(',').map((part) => part.trim());
const wanted = (section) => SECTIONS.includes(section);

const modules = await loadSimulationRuntimeModules();
const { createNewSimulationRuntime, packCommand, DAY_LENGTH_TICKS, CONSTRUCTION_MATERIALS_CONTAINER_ID } = modules;

/** The ten edges that enclose `CELL_RECT`, in a fixed order. The last is left for the door. */
function cellRingEdges() {
  const ring = [];
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

/** Every other tile edge in the one 32x32 chunk a new session owns, so the wall route has somewhere to go. */
function fillerEdges(ring) {
  const taken = new Set(ring.map((edge) => `${edge.x}:${edge.y}:${edge.edge}`));
  const edges = [];
  for (let y = 1; y < 32; y += 1) {
    for (let x = 1; x < 32; x += 1) {
      for (const edge of ['north', 'west']) {
        if (!taken.has(`${x}:${y}:${edge}`)) edges.push({ x, y, edge });
      }
    }
  }
  return edges;
}

class Session {
  constructor(seed, loanTerms) {
    this.runtime = createNewSimulationRuntime(seed, loanTerms === undefined ? {} : { loanTerms });
    this.commands = 0;
    this.orderSequence = 0;
  }

  get tick() { return this.runtime.kernel.tick; }
  get day() { return this.tick / DAY_LENGTH_TICKS; }
  get balance() { return this.runtime.treasury.balanceMinorUnits; }
  get occupancy() { return this.runtime.prisoners.roomInstances.totalOccupancy; }
  get bricks() { return this.runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick'); }

  /**
   * The loan ledger this run was built with.
   *
   * `runtime.loans` is optional because **nothing in `src/` supplies
   * `loanTerms`** (`SimulationRuntimeOptions.loanTerms`), so the type is
   * honest and the narrowing belongs here rather than at each of the twelve
   * read sites. Every run that reaches this getter passed `loanTerms` to the
   * constructor; a throw is the right answer for one that did not, because the
   * alternative is a table of zeroes that looks like a measurement.
   *
   * **This said the optionality was there "because a session restored from a
   * snapshot that predates ADR 0075 decision 2 has none", and that reason is
   * wrong in a way worth marking rather than overwriting**: it reads as though
   * a *later* snapshot would carry one. None does. There is no loan section in
   * the save payload at all, so a restored session has no ledger whatever the
   * save's age -- `restoreSimulationRuntime` builds its runtime with
   * `{ world }` and has no channel for terms.
   * `tests/determinism/loan-ledger-restore-boundary.test.ts` measures both
   * halves, and `src/simulation/economy/loans.ts` names the missing section a
   * gap.
   */
  get loans() {
    const ledger = this.runtime.loans;
    if (ledger === undefined) throw new Error('this session was built without loan terms, so it has no ledger to read');
    return ledger;
  }

  /** One command through the real packer and the real router, exactly as a press does. */
  send(command) {
    const sequence = this.runtime.kernel.expectedSequence;
    this.runtime.kernel.submitCommand(`c${sequence}`, sequence, this.tick, packCommand(command));
    this.runtime.kernel.step();
    this.commands += 1;
    return this.runtime.refusals.last;
  }

  step(ticks) { for (let index = 0; index < ticks; index += 1) this.runtime.kernel.step(); }

  nextOrderId(prefix) { this.orderSequence += 1; return `${prefix}-${String(this.orderSequence)}`; }
}

/**
 * Builds the locked position by playing into it: wall orders until the
 * treasury cannot fund the next one.
 *
 * `unfundedTail` is the drag's worth of orders the player had already placed
 * when the money ran out. The playtest that established this position read
 * *"Waiting for 1,040 to buy materials."* on the screen at the bottom, which
 * is thirteen of them at 80 a segment.
 */
function buildLockedPosition(session, { fundedSegments = 312, unfundedTail = 13 } = {}) {
  const ring = cellRingEdges();
  const doorway = ring[ring.length - 1];
  const order = [...ring.slice(0, ring.length - 1), ...fillerEdges(ring)];
  let placed = 0;
  let index = 0;
  while (placed < fundedSegments) {
    const edge = order[index];
    index += 1;
    session.send({ type: 'PlaceBuildOrder', orderId: session.nextOrderId('wall'), definitionId: 'wall-brick', ...edge });
    placed += 1;
  }
  const unfunded = [];
  for (let extra = 0; extra < unfundedTail; extra += 1) {
    const edge = order[index];
    index += 1;
    const orderId = session.nextOrderId('wall');
    session.send({ type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', ...edge });
    unfunded.push(orderId);
  }
  return { doorway, unfunded };
}

/** Runs the clock to the end of the in-game day `days` after the current one. */
function stepDays(session, days) { session.step(DAY_LENGTH_TICKS * days); }

/**
 * Plays one recovery attempt and reports what it cost in in-game days.
 *
 * `plan.beds` is how many sleep surfaces the player builds before admitting;
 * `plan.cancelTail` is whether they first cancel the wall orders that would
 * otherwise eat the money. Both are player choices and both are measured.
 */
function playRecovery({ candidate, principal, plan, seed = 0x692, horizonDays = 120, useLoan = true, unfundedTail = 13 }) {
  const terms = useLoan
    ? {
        diversionRateBasisPoints: candidate.diversion,
        feeRateBasisPoints: candidate.fee,
        maximumDurationDays: candidate.durationDays,
        escalatedDiversionRateBasisPoints: candidate.escalated,
      }
    : undefined;
  const session = new Session(seed, terms);
  const { doorway, unfunded } = buildLockedPosition(session, { unfundedTail });
  // Let the standing queue build itself out, exactly as the playtest watched
  // it do for three minutes while the band said there was not enough money.
  stepDays(session, 20);
  const lockedBalance = session.balance;
  const commandsIntoTheLock = session.commands;

  const startTick = session.tick;
  const dayOf = (tick) => (tick - startTick) / DAY_LENGTH_TICKS;

  // --- the way out begins here ---
  let cancelPresses = 0;
  if (plan.cancelTail) {
    for (const orderId of unfunded) {
      session.send({ type: 'CancelBuildOrder', orderId });
      cancelPresses += 1;
    }
  }

  let drawnFee = 0;
  if (useLoan) {
    session.loans.draw(principal, session.tick);
    drawnFee = session.loans.outstandingMinorUnits - principal;
  } else {
    // The control: no loan at all, only ADR 0075 decision 2's other half --
    // the balance may go negative, as far as the facility the owner opens.
    session.runtime.treasury.setOverdraftFloor(-principal);
  }
  const balanceAfterDraw = session.balance;

  session.send({ type: 'PlaceBuildOrder', orderId: 'door', definitionId: 'door-wooden', ...doorway });
  // The door has to stand before the rectangle is enclosed, and enclosure is
  // what `ZoneRoom` requires.
  session.step(600);
  const zoneRefusal = session.send({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
  const zoned = session.runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID) !== undefined;

  let bedsPlaced = 0;
  let bedsRefused = 0;
  const bedRefusals = new Set();
  for (let bed = 0; bed < plan.beds; bed += 1) {
    const x = CELL_RECT.x + (bed % CELL_RECT.width);
    const y = CELL_RECT.y + Math.floor(bed / CELL_RECT.width);
    // Reference identity, not a sequence comparison: `RefusalLog` numbers its
    // own entries, so `refusals.last.sequence` is not the command's. An
    // earlier version of this line compared the two and reported every bed as
    // placed, including the ones the cell refused.
    const before = session.runtime.refusals.last;
    session.send({ type: 'PlaceObject', orderId: session.nextOrderId('bed'), definitionId: 'bed-wooden', x, y });
    const refusal = session.runtime.refusals.last;
    if (refusal !== before) { bedsRefused += 1; bedRefusals.add(refusal?.reason ?? 'unknown'); } else bedsPlaced += 1;
  }
  session.step(900);
  const capacity = session.runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)?.residentCapacity ?? 0;

  for (let admit = 0; admit < Math.max(capacity, 1); admit += 1) {
    session.send({ type: 'AdmitPrisoner', ...ARRIVAL, sentenceLengthTicks: 5_000_000, priorIncidents: 0 });
  }
  const commandsSpent = session.commands - commandsIntoTheLock;

  // --- and from here the player presses nothing ---
  const firstDayPressedNothing = session.tick;
  /** @type {number | null} */
  let dayHoused = null;
  /** @type {number | null} */
  let dayDebtCleared = null;
  /** @type {number | null} */
  let dayOutOfTheLock = null;
  /** @type {number | null} */
  let escalationDay = null;
  let peakBalance = session.balance;
  let minBalance = session.balance;
  /*
   * The four boundedness observations section 10 exists to make, sampled once
   * per in-game day exactly as `minBalance` is.
   *
   * `floorBreaches` is the one that would be a defect rather than a
   * magnitude: `Treasury.canAfford` is a single comparison against the floor,
   * so no route through `spend` can pass it -- and a non-zero count would say
   * some route does not go through `spend`. It is measured rather than
   * asserted because "structurally impossible" is what the schema comment
   * said about a negative balance.
   */
  let floorBreaches = 0;
  let deepestArrears = 0;
  let deepestUnfunded = 0;
  let peakPendingDeliveries = 0;
  const floorMinorUnits = useLoan ? 0 : -principal;
  const observe = () => {
    const balance = session.balance;
    if (balance < floorMinorUnits) floorBreaches += 1;
    deepestArrears = Math.max(deepestArrears, session.runtime.payroll.unpaidWagesMinorUnits);
    const unfunded = session.runtime.justInTimeMaterials.lastReport.unfunded
      .reduce((total, item) => total + item.costMinorUnits, 0);
    deepestUnfunded = Math.max(deepestUnfunded, unfunded);
    peakPendingDeliveries = Math.max(peakPendingDeliveries, session.runtime.procurement.pendingDeliveries.length);
  };
  observe();
  const dailyIncome = [];
  for (let day = 0; day < horizonDays; day += 1) {
    stepDays(session, 1);
    observe();
    const balance = session.balance;
    peakBalance = Math.max(peakBalance, balance);
    minBalance = Math.min(minBalance, balance);
    if (dayHoused === null && session.occupancy > 0) dayHoused = dayOf(session.tick);
    if (dayOutOfTheLock === null && balance >= 65 && session.occupancy > 0) dayOutOfTheLock = dayOf(session.tick);
    if (useLoan) {
      if (escalationDay === null && session.loans.diversionRateBasisPointsAt(session.tick) === candidate.escalated
        && session.loans.outstandingMinorUnits > 0) {
        escalationDay = dayOf(session.tick);
      }
      if (dayDebtCleared === null && session.loans.outstandingMinorUnits === 0) dayDebtCleared = dayOf(session.tick);
    }
    if (day < 12) dailyIncome.push(balance);
    if (dayDebtCleared !== null && dayOutOfTheLock !== null && day > 2) break;
    /*
     * A prison whose cell never got enclosed cannot house anybody and cannot
     * earn, so nothing after this point can change: the debt is never repaid
     * and the balance never moves. Stopping is the measurement, not a
     * shortcut -- but it is only taken once the escalation has been given a
     * chance to fire, so the "does the duration bite" column is still answered.
     */
    if (capacity === 0 && dayOf(session.tick) > candidate.durationDays + 1) break;
  }

  return {
    candidate: candidate.name,
    principal,
    plan: plan.name,
    useLoan,
    unfundedTail,
    lockedBalance,
    commandsIntoTheLock,
    cancelPresses,
    fee: drawnFee,
    totalOwed: principal + drawnFee,
    balanceAfterDraw,
    zoneRefused: zoned ? null : (zoneRefusal?.reason ?? 'unknown'),
    bedsPlaced,
    bedsRefused,
    bedRefusals: [...bedRefusals].join(','),
    capacity,
    occupancy: session.occupancy,
    commandsSpent,
    dayHoused,
    dayOutOfTheLock,
    dayDebtCleared,
    escalationDay,
    diverted: useLoan ? session.loans.divertedTotalMinorUnits : 0,
    outstanding: useLoan ? session.loans.outstandingMinorUnits : 0,
    finalBalance: session.balance,
    minBalance,
    peakBalance,
    floorMinorUnits,
    floorBreaches,
    /** The room the prison actually used, against the room it was offered. */
    roomUsed: useLoan ? null : Math.max(0, -minBalance),
    deepestArrears,
    deepestUnfunded,
    peakPendingDeliveries,
    /*
     * Orders that are still *waiting* -- `'cancelled'` excluded as well as
     * `'completed'` and `'failed'`. An earlier version of this line excluded
     * only the latter two and reported 13 standing orders for exactly the runs
     * that had cancelled 13, which read as the opposite of what happened.
     */
    ordersStanding: session.runtime.construction.snapshot().orders
      .filter((order) => order.state !== 'completed' && order.state !== 'failed' && order.state !== 'cancelled').length,
    finalDay: dayOf(session.tick),
    idleDays: dayOf(session.tick) - dayOf(firstDayPressedNothing),
    dailyIncome,
  };
}

function table(rows, columns) {
  const header = columns.map((column) => column.label);
  const body = rows.map((row) => columns.map((column) => {
    const value = column.value(row);
    if (value === null || value === undefined) return '—';
    return typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : String(value);
  }));
  const widths = header.map((label, index) => Math.max(label.length, ...body.map((line) => line[index].length)));
  const render = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  console.log(render(header));
  console.log(render(widths.map((width) => '-'.repeat(width))));
  for (const line of body) console.log(render(line));
}

const PLANS = {
  minimum: { name: 'minimum', beds: 1, cancelTail: false },
  minimumCancelled: { name: 'minimum+cancel', beds: 1, cancelTail: true },
  capacity: { name: 'capacity', beds: 6, cancelTail: true },
};

console.log('ADR 0075 decision 2 -- pricing the loan by playing out of the locked position');
console.log('One in-game day is 2,400 ticks. Every figure below comes from a real kernel run.\n');

/**
 * The other reachable position ADR 0075 names, and the one its fear is about:
 * a prison walked below a plank by **a charge it cannot decline**.
 *
 * Built exactly as `tests/integration/economy-liquidity-hard-lock.test.ts`
 * builds it -- walls, then hire, then let payroll do the rest -- and then
 * given the same way out. The question this answers and section 2 cannot is
 * ADR 0075's own: *"wages exceed every income line, the balance falls for
 * ever … a hard-lock again, only slower, and dressed as a mechanic."*
 */
function playStaffedRecovery({ candidate, principal, guards, drainFirst, cancelBacklog = false, seed = 0x692, horizonDays = 120, useLoan = true }) {
  const terms = useLoan
    ? {
        diversionRateBasisPoints: candidate.diversion,
        feeRateBasisPoints: candidate.fee,
        maximumDurationDays: candidate.durationDays,
        escalatedDiversionRateBasisPoints: candidate.escalated,
      }
    : undefined;
  const session = new Session(seed, terms);
  const ring = cellRingEdges();
  const doorway = ring[ring.length - 1];
  const order = [...ring.slice(0, ring.length - 1), ...fillerEdges(ring)];
  // Leave exactly one day's wages plus three days of payroll in the bank, so
  // the hire is affordable and the prison walks itself to 40 with no further
  // press -- ADR 0075's payroll route, to the minor unit.
  const reserve = 80 * guards * 4;
  const segments = Math.floor((25_000 - reserve) / 80);
  /*
   * The nine orders that are the cell's own perimeter are remembered, because
   * `cancelBacklog` below must not sweep them away. **An earlier version of
   * this function did**, and the four rows it produced said every candidate
   * failed: construction does not work the queue strictly in order, so only
   * three of the nine ring segments had been built when the sweep ran and the
   * other six were cancelled with the rest -- leaving a rectangle that could
   * never be enclosed however much money arrived. That was the instrument and
   * not the game, and it is recorded here rather than quietly fixed.
   */
  const ringOrderIds = new Set();
  for (let index = 0; index < segments; index += 1) {
    const orderId = session.nextOrderId('wall');
    if (index < ring.length - 1) ringOrderIds.add(orderId);
    session.send({ type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', ...order[index] });
  }
  /*
   * `drainFirst` decides whether the 300-odd wall orders are standing when the
   * rescue is attempted, and it turns out to be the whole difference between
   * the two halves of section 6. `ConstructionSystem` builds one order at a
   * time, so a door placed behind a full backlog does not reach the head of
   * the queue for about thirteen in-game days -- by which time the wages have
   * spent the loan.
   */
  if (drainFirst) stepDays(session, 20);
  const beforeHire = session.balance;
  for (let guard = 0; guard < guards; guard += 1) {
    session.send({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL });
  }
  const afterHire = session.balance;
  stepDays(session, 3);
  const walkedTo = session.balance;
  const arrearsBeforeLoan = session.runtime.payroll.unpaidWagesMinorUnits;

  const startTick = session.tick;
  const dayOf = (tick) => (tick - startTick) / DAY_LENGTH_TICKS;

  /*
   * The press a player has that the plan above does not use, measured because
   * a position is only unrecoverable once the controls the game *does* offer
   * have been tried: `CancelBuildOrder` clears the backlog the rescue order
   * would otherwise queue behind.
   */
  let backlogCancelled = 0;
  if (cancelBacklog) {
    for (const order of session.runtime.construction.snapshot().orders) {
      if (order.state === 'completed' || order.state === 'failed') continue;
      if (ringOrderIds.has(order.id)) continue;
      session.send({ type: 'CancelBuildOrder', orderId: order.id });
      backlogCancelled += 1;
    }
  }
  /*
   * `useLoan: false` is the reading-A control: no loan of any kind, only a
   * standing overdraft of `principal`. It is the only shape in this file in
   * which `PayrollSystem` runs against an open floor, which is what makes it
   * the answer to *"does payroll stay bounded"* rather than a restatement of
   * section 9's staffless sweep.
   */
  if (useLoan) session.loans.draw(principal, session.tick);
  else session.runtime.treasury.setOverdraftFloor(-principal);
  session.send({ type: 'PlaceBuildOrder', orderId: 'door', definitionId: 'door-wooden', ...doorway });
  session.step(600);
  session.send({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
  for (let bed = 0; bed < 6; bed += 1) {
    const x = CELL_RECT.x + (bed % CELL_RECT.width);
    const y = CELL_RECT.y + Math.floor(bed / CELL_RECT.width);
    session.send({ type: 'PlaceObject', orderId: session.nextOrderId('bed'), definitionId: 'bed-wooden', x, y });
  }
  session.step(900);
  const capacity = session.runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)?.residentCapacity ?? 0;
  for (let admit = 0; admit < Math.max(capacity, 1); admit += 1) {
    session.send({ type: 'AdmitPrisoner', ...ARRIVAL, sentenceLengthTicks: 5_000_000, priorIncidents: 0 });
  }

  let minBalance = session.balance;
  const floorMinorUnits = useLoan ? 0 : -principal;
  let floorBreaches = 0;
  let deepestArrears = session.runtime.payroll.unpaidWagesMinorUnits;
  let peakPendingDeliveries = session.runtime.procurement.pendingDeliveries.length;
  /** @type {number | null} */
  let dayDebtCleared = null;
  /** @type {number | null} */
  let escalationDay = null;
  for (let day = 0; day < horizonDays; day += 1) {
    stepDays(session, 1);
    minBalance = Math.min(minBalance, session.balance);
    if (session.balance < floorMinorUnits) floorBreaches += 1;
    deepestArrears = Math.max(deepestArrears, session.runtime.payroll.unpaidWagesMinorUnits);
    peakPendingDeliveries = Math.max(peakPendingDeliveries, session.runtime.procurement.pendingDeliveries.length);
    if (!useLoan) continue;
    if (escalationDay === null && session.loans.outstandingMinorUnits > 0
      && session.loans.diversionRateBasisPointsAt(session.tick) === candidate.escalated) {
      escalationDay = dayOf(session.tick);
    }
    if (dayDebtCleared === null && session.loans.outstandingMinorUnits === 0) dayDebtCleared = dayOf(session.tick);
    if (dayDebtCleared !== null && day > 3) break;
  }

  return {
    candidate: candidate.name,
    guards,
    drainFirst,
    backlogCancelled,
    principal,
    beforeHire,
    afterHire,
    walkedTo,
    arrearsBeforeLoan,
    capacity,
    occupancy: session.occupancy,
    wageBill: session.runtime.payroll.dailyWageBillMinorUnits(),
    minBalance,
    floorMinorUnits,
    floorBreaches,
    roomUsed: useLoan ? null : Math.max(0, -minBalance),
    deepestArrears,
    peakPendingDeliveries,
    dayDebtCleared,
    escalationDay,
    outstanding: useLoan ? session.loans.outstandingMinorUnits : 0,
    arrears: session.runtime.payroll.unpaidWagesMinorUnits,
    finalBalance: session.balance,
    finalDay: dayOf(session.tick),
  };
}

/**
 * The prison that borrows and then does **not** build capacity: one bed, one
 * prisoner, and the debt held long enough for the maximum duration to bite.
 * This is the only shape in which the second mitigation can fire at all, so
 * it gets its own section rather than a column.
 */
function playStalledRecovery({ candidate, principal, seed = 0x692, horizonDays = 200 }) {
  return { ...playRecovery({ candidate, principal, plan: PLANS.minimumCancelled, seed, horizonDays }), durationDays: candidate.durationDays };
}

if (wanted('1')) {
  console.log('## 1. The locked position, reproduced\n');
  {
    const probe = new Session(0x692, undefined);
    const { unfunded } = buildLockedPosition(probe);
    const atTheBottom = probe.balance;
    stepDays(probe, 20);
    console.log(`  312 wall orders funded, ${String(unfunded.length)} left unfunded behind them.`);
    console.log(`  balance at the last funded segment: ${String(atTheBottom)}`);
    console.log(`  balance twenty in-game days later, nothing pressed: ${String(probe.balance)}`);
    console.log(`  bricks in the container: ${String(probe.bricks)}`);
    const states = {};
    for (const order of probe.runtime.construction.snapshot().orders) states[order.state] = (states[order.state] ?? 0) + 1;
    console.log(`  build order states: ${JSON.stringify(states)}`);
    const plank = probe.send({ type: 'PurchaseMaterials', orderId: 'plank', itemId: 'item.wood-plank', quantity: 1 });
    console.log(`  buying one plank: ${String(plank?.reason)}; balance ${String(probe.balance)}\n`);
  }
}

if (wanted('2')) {
  console.log('## 2. Every candidate, minimum plan (one bed, the wall queue left standing)\n');
  const minimumRows = [];
  for (const candidate of CANDIDATES) {
    for (const principal of PRINCIPALS) {
      minimumRows.push(playRecovery({ candidate, principal, plan: PLANS.minimum }));
    }
  }
  table(minimumRows, [
    { label: 'candidate', value: (row) => row.candidate },
    { label: 'principal', value: (row) => row.principal },
    { label: 'fee', value: (row) => row.fee },
    { label: 'owed', value: (row) => row.totalOwed },
    { label: 'cash after draw', value: (row) => row.balanceAfterDraw },
    { label: 'zone refused', value: (row) => row.zoneRefused },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'out of lock day', value: (row) => row.dayOutOfTheLock },
    { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
    { label: 'escalated day', value: (row) => row.escalationDay },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

if (wanted('3')) {
  console.log('\n## 3. Every candidate, cancelling the unfunded tail first\n');
  const cancelledRows = [];
  for (const candidate of CANDIDATES) {
    for (const principal of PRINCIPALS) {
      cancelledRows.push(playRecovery({ candidate, principal, plan: PLANS.minimumCancelled }));
    }
  }
  table(cancelledRows, [
    { label: 'candidate', value: (row) => row.candidate },
    { label: 'principal', value: (row) => row.principal },
    { label: 'cancels', value: (row) => row.cancelPresses },
    { label: 'owed', value: (row) => row.totalOwed },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'out of lock day', value: (row) => row.dayOutOfTheLock },
    { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
    { label: 'escalated day', value: (row) => row.escalationDay },
    { label: 'diverted', value: (row) => row.diverted },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

if (wanted('4')) {
  console.log('\n## 4. The capacity plan: the player fills the cell rather than putting one bed in it\n');
  const capacityRows = [];
  for (const candidate of CANDIDATES) {
    capacityRows.push(playRecovery({ candidate, principal: 1_500, plan: PLANS.capacity }));
  }
  table(capacityRows, [
    { label: 'candidate', value: (row) => row.candidate },
    { label: 'principal', value: (row) => row.principal },
    { label: 'owed', value: (row) => row.totalOwed },
    { label: 'beds placed', value: (row) => row.bedsPlaced },
    { label: 'beds refused', value: (row) => row.bedsRefused },
    { label: 'why refused', value: (row) => row.bedRefusals },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'occupancy', value: (row) => row.occupancy },
    { label: 'commands', value: (row) => row.commandsSpent },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
    { label: 'idle days', value: (row) => row.idleDays },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);

}

if (wanted('5')) {
  console.log('\n## 5. The control: no loan at all, only a balance allowed to go negative\n');
  const controlRows = [];
  for (const principal of [200, 1_500]) {
    controlRows.push(playRecovery({ candidate: CANDIDATES[2], principal, plan: PLANS.capacity, useLoan: false }));
  }
  table(controlRows, [
    { label: 'overdraft room', value: (row) => row.principal },
    { label: 'cash after', value: (row) => row.balanceAfterDraw },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'out of lock day', value: (row) => row.dayOutOfTheLock },
    { label: 'lowest balance', value: (row) => row.minBalance },
    { label: 'beds refused', value: (row) => row.bedRefusals },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

if (wanted('6')) {
  console.log('\n## 6. The payroll route: a prison walked under by a charge it cannot decline\n');
  const staffedRows = [];
  for (const drainFirst of [false, true]) {
    for (const guards of [1, 3, 5]) {
      for (const candidate of [CANDIDATES[0], CANDIDATES[2], CANDIDATES[4]]) {
        staffedRows.push(playStaffedRecovery({ candidate, principal: 1_500, guards, drainFirst }));
      }
    }
  }
  table(staffedRows, [
    { label: 'backlog drained', value: (row) => row.drainFirst },
    { label: 'candidate', value: (row) => row.candidate },
    { label: 'guards', value: (row) => row.guards },
    { label: 'wage bill/day', value: (row) => row.wageBill },
    { label: 'walked to', value: (row) => row.walkedTo },
    { label: 'arrears before loan', value: (row) => row.arrearsBeforeLoan },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'occupancy', value: (row) => row.occupancy },
    { label: 'min balance', value: (row) => row.minBalance },
    { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
    { label: 'escalated day', value: (row) => row.escalationDay },
    { label: 'arrears after', value: (row) => row.arrears },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

if (wanted('8')) {
  console.log('\n## 8. The payroll route again, with the backlog cancelled first\n');
  const rescuedRows = [];
  for (const guards of [1, 5]) {
    for (const candidate of [CANDIDATES[0], CANDIDATES[4]]) {
      rescuedRows.push(playStaffedRecovery({ candidate, principal: 1_500, guards, drainFirst: false, cancelBacklog: true }));
    }
  }
  table(rescuedRows, [
    { label: 'candidate', value: (row) => row.candidate },
    { label: 'guards', value: (row) => row.guards },
    { label: 'orders cancelled', value: (row) => row.backlogCancelled },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'occupancy', value: (row) => row.occupancy },
    { label: 'min balance', value: (row) => row.minBalance },
    { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
    { label: 'arrears after', value: (row) => row.arrears },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

if (wanted('7')) {
  console.log('\n## 7. Does the maximum duration ever bite? The prison that borrows big and builds one bed\n');
  const stalledRows = [];
  for (const candidate of CANDIDATES) {
    stalledRows.push(playStalledRecovery({ candidate, principal: 5_000 }));
  }
  table(stalledRows, [
    { label: 'candidate', value: (row) => row.candidate },
    { label: 'principal', value: (row) => row.principal },
    { label: 'owed', value: (row) => row.totalOwed },
    { label: 'duration (days)', value: (row) => row.durationDays },
    { label: 'escalated day', value: (row) => row.escalationDay },
    { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}


/*
 * ## 9. How much room below zero does the way out actually need?
 *
 * ADR 0075 decision 2 says the balance may go negative and bounds it with an
 * *"accrual cap"*; `Treasury.overdraftFloorMinorUnits` is the one number that
 * expresses how far. **Nothing had measured what that number has to be**, and
 * section 5 measured only two values of it. This sweep is the derivation: the
 * same control -- no loan of any kind, only the floor open -- at every room
 * size around the boundary, with and without the thirteen `CancelBuildOrder`
 * presses that clear the queue the lock leaves standing.
 *
 * Read `min balance` against `overdraft room`: the room the prison *uses* is
 * what the way out costs, and every value above it buys nothing.
 */
if (wanted('9')) {
  console.log('\n## 9. The smallest overdraft that dissolves the lock, with and without the queue cancelled\n');
  const floorRows = [];
  for (const plan of [PLANS.capacity, PLANS.minimum]) {
    for (const room of [0, 65, 89, 90, 91, 130, 155, 219, 220, 285, 400, 1_040, 1_129, 1_130, 1_131, 1_500]) {
      floorRows.push(playRecovery({ candidate: CANDIDATES[2], principal: room, plan, useLoan: false }));
    }
  }
  table(floorRows, [
    { label: 'queue cancelled', value: (row) => row.plan === PLANS.capacity.name },
    { label: 'overdraft room', value: (row) => row.principal },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'out of lock day', value: (row) => row.dayOutOfTheLock },
    { label: 'min balance', value: (row) => row.minBalance },
    { label: 'zone refused', value: (row) => row.zoneRefused },
    { label: 'beds refused', value: (row) => row.bedRefusals },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

/*
 * ## 10. Is the standing overdraft bounded above the room section 9 measured?
 *
 * #703 ruling A (2026-08-31) makes the floor a **standing** overdraft every
 * prison has, and
 * `docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md` §2
 * proposes `-2_500` -- one tenth of `TREASURY_STARTING_BALANCE_MINOR_UNITS` --
 * while saying in the same paragraph that the figure is **unmeasured above
 * −1,500**, because section 9's sweep stops there. This section is that
 * measurement, and it exists so the constant ships on a number rather than on
 * a paragraph.
 *
 * Four things have to stay bounded for `-2_500` to be safe, and each has its
 * own column rather than being asserted:
 *
 *  - **`Treasury`**: `room used` against `overdraft room`. If the two track
 *    each other the floor is what a prison spends to; if `room used`
 *    saturates, offering more room buys nothing and the magnitude is free.
 *  - **`floor breaches`** must be 0 everywhere. `Treasury.canAfford` is one
 *    comparison, so any route that got under the floor would be a route that
 *    does not go through `spend`.
 *  - **`ConstructionSystem.procureQueuedMaterials` / `JustInTimeMaterials`**:
 *    `deepest unfunded` and `orders standing`. The queue is the one thing that
 *    spends with no press, so it is the runaway candidate.
 *    **Measured on 2026-08-31 and it is not: the scheduled pass spends 0 in
 *    every run of 10c, and every minor unit of the drain is a `PlaceBuildOrder`
 *    press buying the increment its own order adds** -- 27,440 over 343
 *    purchases against the scheduled pass's 0, tagged by caller. So the queue
 *    is the runaway candidate for the right magnitude and the wrong reason: a
 *    drag spends 40 times in one gesture, which the player cannot see, rather
 *    than a queue spending while nobody is looking. The clause above is kept
 *    because the table it explains is unchanged.
 *  - **`PayrollSystem`**: `deepest arrears`. Section 9 has no staff at all, so
 *    the staffed control below is the only place in this file where payroll
 *    meets an open floor.
 */
if (wanted('10')) {
  console.log('\n## 10a. Staffless: the same sweep as section 9, carried past −1,500 to the opening grant\n');
  const deepRows = [];
  for (const plan of [PLANS.capacity, PLANS.minimum]) {
    for (const room of [1_500, 2_000, 2_500, 3_000, 5_000, 12_500, 25_000]) {
      deepRows.push(playRecovery({ candidate: CANDIDATES[2], principal: room, plan, useLoan: false }));
    }
  }
  table(deepRows, [
    { label: 'queue cancelled', value: (row) => row.plan === PLANS.capacity.name },
    { label: 'overdraft room', value: (row) => row.principal },
    { label: 'room used', value: (row) => row.roomUsed },
    { label: 'floor breaches', value: (row) => row.floorBreaches },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'min balance', value: (row) => row.minBalance },
    { label: 'deepest arrears', value: (row) => row.deepestArrears },
    { label: 'deepest unfunded', value: (row) => row.deepestUnfunded },
    { label: 'peak deliveries', value: (row) => row.peakPendingDeliveries },
    { label: 'orders standing', value: (row) => row.ordersStanding },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);

  console.log('\n## 10b. Staffed, no loan: the only shape in this file where payroll meets an open floor\n');
  const staffedFloorRows = [];
  for (const guards of [1, 5]) {
    for (const room of [0, 1_500, 2_500, 5_000, 25_000]) {
      staffedFloorRows.push(playStaffedRecovery({
        candidate: CANDIDATES[2], principal: room, guards, drainFirst: false, cancelBacklog: true, useLoan: false,
      }));
    }
  }
  table(staffedFloorRows, [
    { label: 'guards', value: (row) => row.guards },
    { label: 'overdraft room', value: (row) => row.principal },
    { label: 'room used', value: (row) => row.roomUsed },
    { label: 'floor breaches', value: (row) => row.floorBreaches },
    { label: 'wage bill/day', value: (row) => row.wageBill },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'occupancy', value: (row) => row.occupancy },
    { label: 'min balance', value: (row) => row.minBalance },
    { label: 'deepest arrears', value: (row) => row.deepestArrears },
    { label: 'arrears after', value: (row) => row.arrears },
    { label: 'peak deliveries', value: (row) => row.peakPendingDeliveries },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

/*
 * ## 10c. The one thing that does scale with the room: an unfunded build queue
 *
 * 10a and 10b both saturate, and both do it because the *player's* queue is
 * fixed at the thirteen orders the locked position leaves standing. The
 * queue is the only thing in this runtime that spends with no press --
 * `ConstructionSystem.procureQueuedMaterials`
 * (`src/simulation/construction/system.ts:988`), from its own scheduled
 * `update` -- so the honest question is not "does 2,500 run away" but "what
 * does a *bigger* standing queue do with 2,500 of room".
 *
 * **The premise in that sentence was measured on 2026-08-31 and is false; the
 * question it asks is still the right one and the table still answers it.**
 * `procureQueuedMaterials` has two callers and the scheduled one spends
 * nothing: tagging every call across this sweep gives 0 spent from
 * `ConstructionSystem.update` and 27,440 from the `PlaceBuildOrder` command
 * handler, over 343 purchases, in all five runs. What a bigger standing queue
 * does with 2,500 of room, it does at the presses that place it.
 *
 * **Re-run after #703 rulings 9 and 12 landed per-order partial fill: every
 * figure in this table is identical**, including `floor breaches` of 0 and the
 * scheduled pass's 0. A residual of 60 is short of the 80 a wall costs, and an
 * order is funded whole or not at all.
 *
 * The room is held at the proposed −2,500 and the standing tail is swept.
 * `room used` against `overdraft room` is the answer: if it tracks the tail
 * the queue will spend the whole facility on wall nobody is watching, and the
 * floor's magnitude is the bound on how much of that a player can suffer in
 * one go.
 */
if (wanted('10c')) {
  console.log('\n## 10c. A standing overdraft of 2,500 against a growing unfunded build queue\n');
  const tailRows = [];
  for (const unfundedTail of [13, 20, 26, 31, 40, 60]) {
    tailRows.push(playRecovery({
      candidate: CANDIDATES[2], principal: 2_500, plan: PLANS.minimum, useLoan: false, unfundedTail,
    }));
  }
  table(tailRows, [
    { label: 'unfunded tail', value: (row) => row.unfundedTail },
    { label: 'tail cost', value: (row) => row.unfundedTail * 80 },
    { label: 'overdraft room', value: (row) => row.principal },
    { label: 'room used', value: (row) => row.roomUsed },
    { label: 'floor breaches', value: (row) => row.floorBreaches },
    { label: 'capacity', value: (row) => row.capacity },
    { label: 'housed day', value: (row) => row.dayHoused },
    { label: 'min balance', value: (row) => row.minBalance },
    { label: 'deepest unfunded', value: (row) => row.deepestUnfunded },
    { label: 'orders standing', value: (row) => row.ordersStanding },
    { label: 'final balance', value: (row) => row.finalBalance },
  ]);
}

process.exitCode = 0;
