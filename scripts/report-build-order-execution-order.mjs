// Measures **what order build orders actually execute in**, and what the id
// scheme decides about it, through the real kernel and the real command router.
//
// NOT a gate and not collected by anything. `vitest.config.ts` includes
// `tests/**/*.test.ts`; this is a `.mjs` under `scripts/`, the same shape as
// `scripts/report-loan-recovery-pricing.mjs` and for the same stated reason: a
// measurement that has to be re-runnable rather than re-argued. Its findings
// live in ADR 0082.
//
// Run it with:
//   node --experimental-transform-types scripts/report-build-order-execution-order.mjs
//
// ## What it measures
//
// 1. A cell's perimeter placed as four real drags. The order the ten segments
//    *complete* in, against the order they were placed in -- once with ids as
//    `src/main.ts:2208` mints them (`order-${crypto.randomUUID()}`), once with
//    a monotonic zero-padded id as a control.
// 2. The locked position `docs/research/2026-08-30-pricing-the-way-out.md` §1
//    established, rebuilt three ways: with that record's own `wall-N` ids, with
//    real UUID ids, and with a monotonic id. Which orders end up unfunded, and
//    whether the cell's own perimeter is among them.
// 3. What a credit into the locked prison buys, with the backlog standing and
//    with it cancelled -- the two thresholds ADR 0081's Consequences compares.
//
// Every figure is a tick, an order state or a treasury value, all of which come
// from the simulation and are identical across runs. Nothing here is a
// wall-clock millisecond, so it is safe to run beside another agent's suite.
import process from 'node:process';
import { loadSimulationRuntimeModules } from '../benchmarks/production-modules.mjs';

/** The 2x3 rectangle every object fixture in this repository zones. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 };
/** `wall-brick` needs two bricks and a brick is 40, so one segment is 80. */
const SEGMENT_COST_MINOR_UNITS = 80;

const SECTIONS = (process.env.LOCKSTATE_ORDER_SECTIONS ?? '1,2,3').split(',').map((part) => part.trim());
const wanted = (section) => SECTIONS.includes(section);

const modules = await loadSimulationRuntimeModules();
const { createNewSimulationRuntime, packCommand, CONSTRUCTION_MATERIALS_CONTAINER_ID } = modules;

/** The ten edges that enclose `CELL_RECT`, in the fixed order the pricing script uses. */
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

/**
 * The same ten edges grouped into the four drags a player draws them with.
 * `edgeRunBetween` (`src/rendering/build/edge-picking.ts`) is always ascending
 * along its axis and one drag is one straight run, so a perimeter is four
 * ascending runs and placement order is exactly this.
 */
function cellRingDrags() {
  const north = [];
  const south = [];
  const west = [];
  const east = [];
  for (let x = CELL_RECT.x; x < CELL_RECT.x + CELL_RECT.width; x += 1) {
    north.push({ x, y: CELL_RECT.y, edge: 'north' });
    south.push({ x, y: CELL_RECT.y + CELL_RECT.height, edge: 'north' });
  }
  for (let y = CELL_RECT.y; y < CELL_RECT.y + CELL_RECT.height; y += 1) {
    west.push({ x: CELL_RECT.x, y, edge: 'west' });
    east.push({ x: CELL_RECT.x + CELL_RECT.width, y, edge: 'west' });
  }
  return [north, south, west, east];
}

/** Every other tile edge in the one 32x32 chunk a new session owns. */
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
  constructor(seed) {
    this.runtime = createNewSimulationRuntime(seed, {});
  }
  get tick() { return this.runtime.kernel.tick; }
  get balance() { return this.runtime.treasury.balanceMinorUnits; }
  get bricks() { return this.runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick'); }
  /** One command through the real packer and the real router, exactly as a press does. */
  send(command) {
    const sequence = this.runtime.kernel.expectedSequence;
    this.runtime.kernel.submitCommand(`c${sequence}`, sequence, this.tick, packCommand(command));
    this.runtime.kernel.step();
  }
  step(ticks) { for (let index = 0; index < ticks; index += 1) this.runtime.kernel.step(); }
  orders() { return this.runtime.construction.allOrders(); }
}

/** Ids exactly as `src/main.ts:2208` mints them. */
const uuidId = () => `order-${crypto.randomUUID()}`;
/** Ids as the pricing script's fixture mints them: decimal, unpadded, so `wall-9 > wall-100`. */
const decimalId = (ordinal) => `wall-${String(ordinal)}`;
/** A lexicographically sortable monotonic id -- one of the candidate fixes. */
const paddedId = (ordinal) => `order-${String(ordinal).padStart(10, '0')}`;

// ---------------------------------------------------------------------------
// 1. Placement order against completion order.
// ---------------------------------------------------------------------------
function completionOrder(mintId, label, seed) {
  const session = new Session(seed);
  const placed = [];
  let ordinal = 0;
  for (const drag of cellRingDrags()) {
    // One transaction per drag, exactly as `src/main.ts:2198` mints one.
    const transactionId = `build-${String(ordinal)}`;
    for (const edge of drag) {
      ordinal += 1;
      const orderId = mintId(ordinal);
      placed.push(orderId);
      session.send({ type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', transactionId, ...edge });
    }
  }
  const placementIndexOf = new Map(placed.map((id, index) => [id, index]));
  const completedAt = new Map();
  for (let pass = 0; pass < 4_000 && completedAt.size < placed.length; pass += 1) {
    session.step(1);
    for (const order of session.orders()) {
      if (order.state === 'completed' && !completedAt.has(order.id)) completedAt.set(order.id, session.tick);
    }
  }
  const sequence = [...completedAt.entries()].sort((left, right) => left[1] - right[1]).map(([id]) => placementIndexOf.get(id));
  let inversions = 0;
  for (let i = 0; i < sequence.length; i += 1) {
    for (let j = i + 1; j < sequence.length; j += 1) if ((sequence[i] ?? 0) > (sequence[j] ?? 0)) inversions += 1;
  }
  const maximum = (sequence.length * (sequence.length - 1)) / 2;
  console.log(`  ${label} seed=0x${seed.toString(16)}: completion order by placement index [${sequence.join(', ')}]`);
  console.log(`      inversions ${inversions}/${maximum}; the first segment drawn finished ${(sequence.indexOf(0) + 1)} of ${sequence.length}`);
}

// ---------------------------------------------------------------------------
// 2/3. The locked position.
// ---------------------------------------------------------------------------
/**
 * Plays into the lock exactly as `buildLockedPosition` in
 * `scripts/report-loan-recovery-pricing.mjs` does: nine of the cell's ten
 * perimeter edges, the tenth left for a door, then filler wall until the
 * treasury cannot fund the next segment, then the drag's worth of orders that
 * arrive after the money has gone.
 */
function lockedPosition(mintId, seed) {
  const session = new Session(seed);
  const ring = cellRingEdges();
  const placement = [...ring.slice(0, ring.length - 1), ...fillerEdges(ring)];
  const ringOrderIds = new Set();
  for (let placed = 0; placed < 325; placed += 1) {
    const orderId = mintId(placed + 1);
    if (placed < ring.length - 1) ringOrderIds.add(orderId);
    session.send({ type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', ...placement[placed] });
  }
  // Twenty in-game days, exactly as the pricing script lets the queue drain.
  session.step(20_000);
  const states = {};
  const pending = [];
  for (const order of session.orders()) {
    states[order.state] = (states[order.state] ?? 0) + 1;
    if (order.state !== 'completed') pending.push(order.id);
  }
  return { session, states, pending, ringOrderIds, ringPending: pending.filter((id) => ringOrderIds.has(id)) };
}

/**
 * Credits `principal` into a locked prison and reports what the nine perimeter
 * segments do. `cancelBacklog` first cancels every pending order that is not
 * part of the cell's own perimeter -- the `Cancel` presses §7 of the pricing
 * record counts, minus the one the player actually wants.
 */
function creditIntoTheLock(mintId, seed, principal, cancelBacklog) {
  const { session, pending, ringOrderIds, ringPending } = lockedPosition(mintId, seed);
  if (cancelBacklog) {
    for (const id of pending) if (!ringOrderIds.has(id)) session.send({ type: 'CancelBuildOrder', orderId: id });
  }
  session.runtime.treasury.credit(principal);
  session.step(3_000);
  const after = session.orders().filter((order) => order.state !== 'completed' && ringOrderIds.has(order.id));
  return { before: ringPending.length, after: after.length, balance: session.balance };
}

if (wanted('1')) {
  console.log('## 1. A cell perimeter placed as four drags: placement order against completion order');
  console.log(`   (ten segments at ${SEGMENT_COST_MINOR_UNITS} each; nothing else in the prison, so money is never the constraint)`);
  for (const seed of [0x1, 0x2, 0x3, 0xbeef, 0x692]) completionOrder(uuidId, 'uuid  ', seed);
  console.log('   Control -- the same gesture with a monotonic zero-padded id:');
  for (const seed of [0x1, 0x2, 0x3]) completionOrder(paddedId, 'padded', seed);
  console.log('');
}

if (wanted('2')) {
  console.log('## 2. The locked position, and which orders are left unfunded');
  {
    const { states, pending, ringPending } = lockedPosition(decimalId, 0x692);
    console.log(`   a) the pricing record's own \`wall-N\` ids: ${JSON.stringify(states)}`);
    console.log(`      pending, ascending code-unit: [${[...pending].sort().join(', ')}]`);
    console.log(`      of those, cell-perimeter segments: [${ringPending.join(', ')}]`);
  }
  {
    const histogram = new Map();
    for (let trial = 0; trial < 25; trial += 1) {
      const { ringPending } = lockedPosition(uuidId, 0x692 + trial);
      histogram.set(ringPending.length, (histogram.get(ringPending.length) ?? 0) + 1);
    }
    const rows = [...histogram.entries()].sort((left, right) => left[0] - right[0]);
    console.log(`   b) real UUID ids, 25 trials -- perimeter segments left unfunded: ${rows.map(([n, count]) => `${count} trials x ${n}`).join(', ')}`);
  }
  {
    let locked = 0;
    for (let trial = 0; trial < 5; trial += 1) if (lockedPosition(paddedId, 0x692 + trial).ringPending.length > 0) locked += 1;
    console.log(`   c) monotonic zero-padded ids, 5 trials -- trials with a perimeter segment unfunded: ${locked}`);
  }
  console.log('');
}

if (wanted('3')) {
  console.log('## 3. What a credit into the locked prison buys');
  console.log('   a) backlog standing, `wall-N` ids (perimeter segment `wall-9` unfunded):');
  for (const principal of [65, 500, 999, 1_000, 1_040, 1_065]) {
    const result = creditIntoTheLock(decimalId, 0x692, principal, false);
    console.log(`      credit ${String(principal).padStart(5)}: perimeter unfunded ${result.before} -> ${result.after}; balance after ${result.balance}`);
  }
  console.log('   b) the twelve non-perimeter pending orders cancelled first:');
  for (const principal of [0, 39, 40, 65, 105]) {
    const result = creditIntoTheLock(decimalId, 0x692, principal, true);
    console.log(`      credit ${String(principal).padStart(5)}: perimeter unfunded ${result.before} -> ${result.after}; balance after ${result.balance}`);
  }
  console.log('   c) monotonic ids, backlog standing -- nothing to free:');
  for (const principal of [0, 65]) {
    const result = creditIntoTheLock(paddedId, 0x692, principal, false);
    console.log(`      credit ${String(principal).padStart(5)}: perimeter unfunded ${result.before} -> ${result.after}; balance after ${result.balance}`);
  }
}
