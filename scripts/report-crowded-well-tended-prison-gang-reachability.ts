/**
 * The second prison shape named as owed by
 * `docs/adr/0121-what-decides-whether-a-prison-ever-meets-its-gangs.md`
 * §5's weakest claim: the same fully furnished, one-guard shape
 * `report-well-tended-prison-gang-reachability.ts` measures at zero
 * incidents in twelve of twelve seeds, but with **sixteen** prisoners
 * admitted into its **eight** single-bed cells instead of eight -- same
 * amenities, same staffing, same commands, twice the population the rooms
 * were built for.
 *
 * Run with: npx tsx scripts/report-crowded-well-tended-prison-gang-reachability.ts
 *
 * Not wired into CI or `pnpm verify` -- a one-off measurement script for a
 * research question, not a regression gate.
 */
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
import { packCommand } from '../src/simulation/protocol/commands';
import { wallRoomPerimeter } from '../tests/helpers/room-walls';

const DAY = 2_400;
const RUN_TICKS = 1_000 + 90 * DAY;
const CELL_COUNT = 8;
const PRISONER_COUNT = 16;
const ARRIVAL = { x: 16, y: 16 } as const;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

function cellRect(index: number) {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}
function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}
function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Identical to `report-well-tended-prison-gang-reachability.ts`'s fixture, except `prisonerCount` may now exceed the eight single-occupant beds this prison places. */
function buildCrowdedWellRunPrison(seed: number, prisonerCount: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => cellRect(index));

  const planks = CELL_COUNT + 6 + 8;
  const bricks = CELL_COUNT + 2;
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: planks }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: bricks }));
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
  submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
  submit(runtime, 'sh2', packCommand({ type: 'PlaceObject', orderId: 'sh2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
  submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
  submit(runtime, 'dt2', packCommand({ type: 'PlaceObject', orderId: 'dt2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
  for (let index = 0; index < 4; index += 1) {
    submit(runtime, `bench${String(index)}`, packCommand({
      type: 'PlaceObject',
      orderId: `bench${String(index)}`,
      definitionId: 'bench-wooden',
      x: CANTEEN.x + (index % 2) * 2,
      y: CANTEEN.y + 2 + Math.floor(index / 2),
    }));
  }

  stepTo(runtime, 1_000);
  submit(runtime, 'hire0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  for (let index = 0; index < prisonerCount; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  if (runtime.refusals.count !== 0) throw new Error(`fixture refused ${String(runtime.refusals.count)} commands for seed 0x${seed.toString(16)}`);
  return runtime;
}

const SEEDS = Array.from({ length: 12 }, (_unused, i) => 0x0cc0 + i);

const rows: string[] = [];
rows.push('seed | assaults | riots | escapeAttempts | gangRetaliations | gangMembers | grudges | maxRiskTier | earlyWarnings');
for (const seed of SEEDS) {
  const runtime = buildCrowdedWellRunPrison(seed, PRISONER_COUNT);
  stepTo(runtime, RUN_TICKS);
  const incidents = runtime.incidents.all();
  const assaults = incidents.filter((incident) => incident.type === 'assault').length;
  const riots = incidents.filter((incident) => incident.type === 'riot').length;
  const escapes = incidents.filter((incident) => incident.type === 'escape-attempt').length;
  const retaliations = incidents.filter((incident) => incident.type === 'gang-retaliation').length;
  const members = runtime.gangs.all().reduce((sum, gang) => sum + runtime.gangs.membersOf(gang.id).length, 0);
  const grudges = runtime.gangs.allGrudges().length;
  let maxTier = 0;
  const store = runtime.prisoners.entityStore;
  for (let index = 0; index <= store.maxActiveIndex; index += 1) {
    if (!store.isIndexAlive(index)) continue;
    maxTier = Math.max(maxTier, runtime.prisoners.records.riskTier[index]!);
  }
  const earlyWarnings = runtime.prisoners.classificationEarlyWarningSystem.getMetrics().warningsIssued;
  rows.push(`0x${seed.toString(16)} | ${String(assaults)} | ${String(riots)} | ${String(escapes)} | ${String(retaliations)} | ${String(members)} | ${String(grudges)} | ${String(maxTier)} | ${String(earlyWarnings)}`);
}
// eslint-disable-next-line no-console
console.log(rows.join('\n'));
