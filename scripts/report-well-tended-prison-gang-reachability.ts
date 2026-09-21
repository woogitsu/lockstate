/**
 * Re-measures the finding behind issue #979's "0/8" table (comment
 * https://github.com/woogitsu/lockstate/issues/979#issuecomment-5679194909,
 * row "cells + toilets + amenities, 1 guard") at twelve seeds instead of
 * eight, on the tree after #1322 (the gang-membership-split and
 * retaliation-cadence amendment of 2026-09-19).
 *
 * Builds the exact "well-run" prison shape
 * `tests/integration/risk-tier-neglect-reachability.test.ts`'s
 * `buildWellRunPrison` uses (fully furnished cells, shower, canteen, yard,
 * one guard, eight prisoners admitted at the interface's own
 * `priorIncidents: 0`), and steps it 90 in-game days instead of that file's
 * 50,000 ticks, over the same twelve seeds
 * `src/simulation/incidents/default-gangs.ts`'s own neglected-prison sweep
 * uses (`0x0cc0`-`0x0ccb`).
 *
 * Run with: npx tsx scripts/report-well-tended-prison-gang-reachability.ts
 *
 * Not wired into CI or `pnpm verify` -- this is a one-off measurement script
 * for a research question, not a regression gate. If this finding is worth
 * guarding against regressing silently, that is a decision for whoever reads
 * the report this script produced, not for this file.
 *
 * **`finalRiskTier` and `peakRiskTier` can differ, and the gap is a fixture
 * wrinkle rather than a finding.** `ADMISSION.sentenceLengthTicks` is
 * 400,000 -- above `LONG_SENTENCE_THRESHOLD_TICKS` (200,000) -- because a
 * 90-in-game-day run needs a sentence that does not end mid-run, unlike
 * `risk-tier-neglect-reachability.test.ts`'s 60,000-tick admission over its
 * shorter 50,000-tick window. That trips `reviewClassification`'s `sentence`
 * term on its own, and `ClassificationEarlyWarningSystem` (which only ever
 * raises a tier) writes it once before enough clean-conduct credit accrues
 * to bring the *next* authoritative review back down -- so `earlyWarnings`
 * is non-zero and `peakRiskTier` briefly touches 2 (`Medium`) in every seed,
 * capped there by `EARLY_WARNING_TIER_CEILING`, while `finalRiskTier` settles
 * back to 0. None of it is incident-driven and none of it reaches tier 3,
 * which is the only tier gangs read.
 */
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
import { packCommand } from '../src/simulation/protocol/commands';
import { wallRoomPerimeter } from '../tests/helpers/room-walls';

const DAY = 2_400;
const RUN_TICKS = 1_000 + 90 * DAY;
const CELL_COUNT = 8;
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

function buildWellRunPrison(seed: number, prisonerCount: number): SimulationRuntime {
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
rows.push('seed | assaults | riots | escapeAttempts | gangRetaliations | gangMembers | grudges | finalRiskTier | peakRiskTier | earlyWarnings');
for (const seed of SEEDS) {
  const runtime = buildWellRunPrison(seed, 8);
  let peakTier = 0;
  while (runtime.kernel.tick < RUN_TICKS) {
    runtime.kernel.step();
    const store = runtime.prisoners.entityStore;
    for (let index = 0; index <= store.maxActiveIndex; index += 1) {
      if (!store.isIndexAlive(index)) continue;
      peakTier = Math.max(peakTier, runtime.prisoners.records.riskTier[index]!);
    }
  }
  const incidents = runtime.incidents.all();
  const assaults = incidents.filter((incident) => incident.type === 'assault').length;
  const riots = incidents.filter((incident) => incident.type === 'riot').length;
  const escapes = incidents.filter((incident) => incident.type === 'escape-attempt').length;
  const retaliations = incidents.filter((incident) => incident.type === 'gang-retaliation').length;
  const members = runtime.gangs.all().reduce((sum, gang) => sum + runtime.gangs.membersOf(gang.id).length, 0);
  const grudges = runtime.gangs.allGrudges().length;
  let finalTier = 0;
  const finalStore = runtime.prisoners.entityStore;
  for (let index = 0; index <= finalStore.maxActiveIndex; index += 1) {
    if (!finalStore.isIndexAlive(index)) continue;
    finalTier = Math.max(finalTier, runtime.prisoners.records.riskTier[index]!);
  }
  const earlyWarnings = runtime.prisoners.classificationEarlyWarningSystem.getMetrics().warningsIssued;
  rows.push(`0x${seed.toString(16)} | ${String(assaults)} | ${String(riots)} | ${String(escapes)} | ${String(retaliations)} | ${String(members)} | ${String(grudges)} | ${String(finalTier)} | ${String(peakTier)} | ${String(earlyWarnings)}`);
}
// eslint-disable-next-line no-console
console.log(rows.join('\n'));
