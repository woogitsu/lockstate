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
function playRecovery({ candidate, principal, plan, seed = 0x692, horizonDays = 120, useLoan = true }) {
  const terms = useLoan
    ? {
        diversionRateBasisPoints: candidate.diversion,
        feeRateBasisPoints: candidate.fee,
        maximumDurationDays: candidate.durationDays,
        escalatedDiversionRateBasisPoints: candidate.escalated,
      }
    : undefined;
  const session = new Session(seed, terms);
  const { doorway, unfunded } = buildLockedPosition(session);
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
    session.runtime.loans.draw(principal, session.tick);
    drawnFee = session.runtime.loans.outstandingMinorUnits - principal;
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
  for (let bed = 0; bed < plan.beds; bed += 1) {
    const x = CELL_RECT.x + (bed % CELL_RECT.width);
    const y = CELL_RECT.y + Math.floor(bed / CELL_RECT.width);
    const before = session.commands;
    session.send({ type: 'PlaceObject', orderId: session.nextOrderId('bed'), definitionId: 'bed-wooden', x, y });
    const refusal = session.runtime.refusals.last;
    if (refusal !== undefined && refusal.sequence === before) bedsRefused += 1; else bedsPlaced += 1;
  }
  session.step(900);
  const capacity = session.runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)?.residentCapacity ?? 0;

  for (let admit = 0; admit < Math.max(capacity, 1); admit += 1) {
    session.send({ type: 'AdmitPrisoner', ...ARRIVAL, sentenceLengthTicks: 5_000_000, priorIncidents: 0 });
  }
  const commandsSpent = session.commands - commandsIntoTheLock;

  // --- and from here the player presses nothing ---
  const firstDayPressedNothing = session.tick;
  let dayHoused = null;
  let dayDebtCleared = null;
  let dayOutOfTheLock = null;
  let escalationDay = null;
  let peakBalance = session.balance;
  const dailyIncome = [];
  for (let day = 0; day < horizonDays; day += 1) {
    stepDays(session, 1);
    const balance = session.balance;
    peakBalance = Math.max(peakBalance, balance);
    if (dayHoused === null && session.occupancy > 0) dayHoused = dayOf(session.tick);
    if (dayOutOfTheLock === null && balance >= 65 && session.occupancy > 0) dayOutOfTheLock = dayOf(session.tick);
    if (useLoan) {
      if (escalationDay === null && session.runtime.loans.diversionRateBasisPointsAt(session.tick) === candidate.escalated
        && session.runtime.loans.outstandingMinorUnits > 0) {
        escalationDay = dayOf(session.tick);
      }
      if (dayDebtCleared === null && session.runtime.loans.outstandingMinorUnits === 0) dayDebtCleared = dayOf(session.tick);
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
    lockedBalance,
    commandsIntoTheLock,
    cancelPresses,
    fee: drawnFee,
    totalOwed: principal + drawnFee,
    balanceAfterDraw,
    zoneRefused: zoned ? null : (zoneRefusal?.reason ?? 'unknown'),
    bedsPlaced,
    bedsRefused,
    capacity,
    occupancy: session.occupancy,
    commandsSpent,
    dayHoused,
    dayOutOfTheLock,
    dayDebtCleared,
    escalationDay,
    diverted: useLoan ? session.runtime.loans.divertedTotalMinorUnits : 0,
    outstanding: useLoan ? session.runtime.loans.outstandingMinorUnits : 0,
    finalBalance: session.balance,
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
  { label: 'capacity', value: (row) => row.capacity },
  { label: 'occupancy', value: (row) => row.occupancy },
  { label: 'commands', value: (row) => row.commandsSpent },
  { label: 'housed day', value: (row) => row.dayHoused },
  { label: 'debt cleared day', value: (row) => row.dayDebtCleared },
  { label: 'idle days', value: (row) => row.idleDays },
  { label: 'final balance', value: (row) => row.finalBalance },
]);

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
function playStaffedRecovery({ candidate, principal, guards, seed = 0x692, horizonDays = 120 }) {
  const terms = {
    diversionRateBasisPoints: candidate.diversion,
    feeRateBasisPoints: candidate.fee,
    maximumDurationDays: candidate.durationDays,
    escalatedDiversionRateBasisPoints: candidate.escalated,
  };
  const session = new Session(seed, terms);
  const ring = cellRingEdges();
  const doorway = ring[ring.length - 1];
  const order = [...ring.slice(0, ring.length - 1), ...fillerEdges(ring)];
  // Leave exactly one day's wages plus three days of payroll in the bank, so
  // the hire is affordable and the prison walks itself to 40 with no further
  // press -- ADR 0075's payroll route, to the minor unit.
  const reserve = 80 * guards * 4;
  const segments = Math.floor((25_000 - reserve) / 80);
  for (let index = 0; index < segments; index += 1) {
    session.send({ type: 'PlaceBuildOrder', orderId: session.nextOrderId('wall'), definitionId: 'wall-brick', ...order[index] });
  }
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

  session.runtime.loans.draw(principal, session.tick);
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
  let dayDebtCleared = null;
  let escalationDay = null;
  for (let day = 0; day < horizonDays; day += 1) {
    stepDays(session, 1);
    minBalance = Math.min(minBalance, session.balance);
    if (escalationDay === null && session.runtime.loans.outstandingMinorUnits > 0
      && session.runtime.loans.diversionRateBasisPointsAt(session.tick) === candidate.escalated) {
      escalationDay = dayOf(session.tick);
    }
    if (dayDebtCleared === null && session.runtime.loans.outstandingMinorUnits === 0) dayDebtCleared = dayOf(session.tick);
    if (dayDebtCleared !== null && day > 3) break;
  }

  return {
    candidate: candidate.name,
    guards,
    principal,
    beforeHire,
    afterHire,
    walkedTo,
    arrearsBeforeLoan,
    capacity,
    occupancy: session.occupancy,
    wageBill: session.runtime.payroll.dailyWageBillMinorUnits(),
    minBalance,
    dayDebtCleared,
    escalationDay,
    outstanding: session.runtime.loans.outstandingMinorUnits,
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
  { label: 'final balance', value: (row) => row.finalBalance },
]);


console.log('\n## 6. The payroll route: a prison walked under by a charge it cannot decline\n');
const staffedRows = [];
for (const guards of [1, 3, 5]) {
  for (const candidate of [CANDIDATES[0], CANDIDATES[2], CANDIDATES[4]]) {
    staffedRows.push(playStaffedRecovery({ candidate, principal: 1_500, guards }));
  }
}
table(staffedRows, [
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

process.exitCode = 0;
