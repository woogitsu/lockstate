import { expect, test } from './network-changed-fixture';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import type { SaveEnvelopeV6 } from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';
import { openApp } from './playtest-harness';

const SEED = 0x586;
const ARRIVAL = { x: 16, y: 16 } as const;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function buildWalkingPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: 12 }, (_unused, index) => index < 6
    ? { x: 1 + index * 3, y: 1, width: 2, height: 3 }
    : { x: 1 + (index - 6) * 3, y: 14, width: 2, height: 3 });
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: 26 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 14 }));
  for (const rect of [...cells, SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `cell-${index}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  submit(runtime, 'shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
  submit(runtime, 'canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
  submit(runtime, 'yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
  cells.forEach((rect, index) => {
    submit(runtime, `bed-${index}`, packCommand({ type: 'PlaceObject', orderId: `bed-${index}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `toilet-${index}`, packCommand({ type: 'PlaceObject', orderId: `toilet-${index}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  for (let index = 0; index < 2; index += 1) {
    submit(runtime, `head-${index}`, packCommand({ type: 'PlaceObject', orderId: `head-${index}`, definitionId: 'shower-head-brick', x: SHOWER.x + index, y: SHOWER.y }));
    submit(runtime, `table-${index}`, packCommand({ type: 'PlaceObject', orderId: `table-${index}`, definitionId: 'dining-table-wooden', x: CANTEEN.x + index * 3, y: CANTEEN.y }));
  }
  for (let index = 0; index < 4; index += 1) {
    submit(runtime, `bench-${index}`, packCommand({ type: 'PlaceObject', orderId: `bench-${index}`, definitionId: 'bench-wooden', x: CANTEEN.x + (index % 2) * 2, y: CANTEEN.y + 2 + Math.floor(index / 2) }));
  }
  while (runtime.kernel.tick < 1_000) runtime.kernel.step();
  for (let index = 0; index < 2; index += 1) submit(runtime, `guard-${index}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  for (let index = 0; index < 12; index += 1) submit(runtime, `prisoner-${index}`, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 400_000, priorIncidents: 0, ...ARRIVAL }));
  expect(runtime.refusals.count).toBe(0);
  while (runtime.kernel.tick < 2_401) runtime.kernel.step();
  while (runtime.prisoners.locomotion.walkingCount === 0) {
    if (runtime.kernel.tick > 4_800) throw new Error('the fixture never produced a walk');
    runtime.kernel.step();
  }
  return runtime;
}

/** A V6 save may carry `inFlight`, while its V7-only room and candidate sections are absent. */
function v6MidWalkSave(runtime: SimulationRuntime): SaveEnvelopeV6 {
  const bundle = captureSessionSnapshot(runtime);
  const {
    roomFilth: _roomFilth, labourCredit: _labourCredit, workOutput: _workOutput,
    delayedIntake: _delayedIntake, pendingCandidateProfiles: _pendingCandidateProfiles,
    intakeCandidates: _intakeCandidates, holdingStays: _holdingStays,
    ...simulation
  } = bundle.simulation!;
  const payload = {
    ...bundle,
    kernel: { ...bundle.kernel, rngStates: bundle.kernel.rngStates.filter((entry) => entry.name !== 'prisoners.candidates') },
    simulation,
  } as unknown as SessionSnapshotBundle;
  expect(payload.simulation?.inFlight?.prisoners.locomotion.walks.length).toBeGreaterThan(0);
  return {
    saveSchemaVersion: 6, gameVersion: 'lockstate-0.0.0', prisonId: 'browser-mid-walk',
    revision: 1, createdAt: 1, updatedAt: 2,
    checksum: computeSaveChecksum(payload as unknown as JsonValue), payload,
  } as SaveEnvelopeV6;
}

test('a real browser loads a V6 save mid-walk and keeps the prisoner moving', async ({ page }) => {
  const continuous = buildWalkingPrison();
  const save = v6MidWalkSave(continuous);
  const savedTick = continuous.kernel.tick;
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles({
    name: 'browser-mid-walk.lockstate.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save), 'utf8'),
  });
  await expect(page.locator('.save-panel__status')).toContainText('Imported a save from an older version');
  await expect(page.locator('[data-metric="prisoners"] .ui-stat__value')).toHaveText('12');
  await expect(page.getByRole('group', { name: 'Time controls' })).toBeVisible();
  // The migrated save is playable: the player can advance beyond its saved tick.
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.waitForTimeout(1_000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { readonly payload: SessionSnapshotBundle };
  const exportedTick = exported.payload.kernel.tick;
  expect(exportedTick).toBeGreaterThan(savedTick);
  while (continuous.kernel.tick < exportedTick) continuous.kernel.step();
  const expected = captureSessionSnapshot(continuous);
  expect(exported.payload.simulation?.inFlight?.prisoners.locomotion).toEqual(expected.simulation?.inFlight?.prisoners.locomotion);
  expect(exported.payload.simulation?.prisoners.components.tileX).toEqual(expected.simulation?.prisoners.components.tileX);
  expect(exported.payload.simulation?.prisoners.components.tileY).toEqual(expected.simulation?.prisoners.components.tileY);
});
