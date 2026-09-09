import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import type { HudAlertViewModel, HudEventNoticeViewModel, HudViewModel } from '../../src/ui/hud';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { wallRoomPerimeter } from '../helpers/room-walls';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **ADR 0076's relocation notice, on the screen** -- the sentence the owner
 * approved on 2026-08-30, painted by the real HUD out of an event a real
 * prison produced.
 *
 * ## Why a browser is required and `pnpm test` cannot cover this
 *
 * `tests/integration/relocation-notice-loop.test.ts` proves the whole
 * main-thread chain headlessly: the simulation emits the event, the protocol
 * schema accepts it, the translator produces a notice, and the localizer
 * resolves it to the finished sentence. What that cannot reach is the DOM
 * around it. `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `hud.ts` -- the module that turns a notice into an element, and the module
 * where `resolveHudLabelParameters` is actually *called* -- is not merely
 * untested there, it is **unreachable**. A notice the translator describes
 * perfectly and the band never paints would pass every unit test in the
 * repository, and so would one painted with `{name}` still in it.
 *
 * That failure is not hypothetical: this notice is the first sentence in the
 * repository whose parameters are themselves messages, and the mechanism that
 * fills them in is a line in `hud.ts` that nothing headless executes.
 *
 * ## The prison is real, and it is built in this process
 *
 * A Playwright spec runs in Node and may import `src/**` (`app-shell.spec.ts`
 * already does). So the fixture below is not a hand-written view model: it
 * builds a prison with `createNewSimulationRuntime`, houses a prisoner, takes
 * their bed away through a real command, reads the event off the session's own
 * `SimulationEventLog`, parses it with the production wire schema and runs the
 * production translator. Only the finished `HudEventNoticeViewModel` crosses
 * into the page -- which is exactly what `src/main.ts` puts there.
 *
 * **What is therefore not covered here** is the worker `postMessage` itself:
 * the event is carried into the browser by Playwright rather than by a
 * `Worker`. `workerToMainMessageSchema.parse` is what stands in for it, and it
 * is the same guard `incident-events-loop.test.ts` uses for the same reason.
 *
 * ## And why the geometry is asserted rather than the text alone
 *
 * Issue #629: information that exists and reaches nobody does not count. The
 * band is the surface that is laid out at every viewport with nothing opened
 * -- that is the whole reason it exists (`HudEventNoticeViewModel`) -- so this
 * asserts it has a real box on the narrow viewport where `.hud__corner` and
 * its alerts list are gone entirely.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

const SEED = 0x0b1ec7;
const CELL = 'room.cell';
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const SECOND_CELL_RECT = { x: 7, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
const SECOND_BED_TILE = { x: 7, y: 6 } as const;
const ARRIVAL = { x: 16, y: 16 };
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 };
const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
const secondCellInstanceId = `${CELL}:${SECOND_CELL_RECT.x}:${SECOND_CELL_RECT.y}`;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function publication(event: SimulationEvent, tick: number): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000076',
    kind: 'simulation/event',
    payload: { tick, event },
  }) as WorkerToMainMessage;
}

interface Relocation {
  /** The name the prison minted, read from the identity registry rather than written down here. */
  readonly who: string;
  readonly notice: HudEventNoticeViewModel;
  /** The alerts row for the same event, so the log can be checked beside the band. */
  readonly row: { readonly id: string; readonly labelKey: string };
}

/**
 * Plays a prison up to the moment a resident is rehoused, by one of the two
 * routes that can take a standing object out of a room, and returns what the
 * main thread would hold.
 *
 * The undo fixture places its two beds the other way round because `Undo` pops
 * the *last* transaction; that is the only difference between the two, and it
 * is `object-removal-loop.test.ts`'s difference, kept.
 */
function relocationThrough(route: 'remove-object' | 'undo'): Relocation {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }));
  const order: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] =
    route === 'undo' ? [SECOND_CELL_RECT, CELL_RECT] : [CELL_RECT, SECOND_CELL_RECT];
  for (const [index, rect] of order.entries()) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: CELL, ...rect }));
    submit(
      runtime,
      `bed-${String(index)}`,
      packCommand({
        type: 'PlaceObject',
        orderId: `bed-${String(index)}`,
        definitionId: 'bed-wooden',
        ...(rect.x === CELL_RECT.x ? BED_TILE : SECOND_BED_TILE),
      }),
    );
  }
  stepTo(runtime, 600);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  stepTo(runtime, 700);
  const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
  expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'housed on the bed about to be taken').toBe(cellInstanceId);
  const name = runtime.actorIdentity.getName('prisoner', prisoner);
  if (name === undefined) throw new Error('a housed prisoner has been through reception and has a name');

  if (route === 'undo') {
    // Called on the system rather than submitted as a command. ADR 0104 option
    // 2 ([#956](https://github.com/woogitsu/lockstate/issues/956), accepted by
    // the owner on 2026-09-09) refuses a router-level `Undo` whose newest
    // transaction is not the player's own latest action, and the admission
    // above is a later one -- so the press this line used to model now answers
    // a refusal and reaches no order. The refusal itself is covered in
    // `tests/integration/undo-refuses-a-transaction-the-player-did-not-just-create.test.ts`;
    // what this file is about is the sentence the relocation puts on screen,
    // which is the same call on the same order either way.
    runtime.construction.undo();
  } else {
    submit(runtime, 'take-the-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));
  }
  expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'rehoused, which is what there is to say').toBe(
    secondCellInstanceId,
  );

  const events = runtime.events.since(0).filter((event) => event.type === 'prisoners.relocated');
  expect(events.length, `the ${route} route produced no relocation event to paint`).toBe(1);
  const message = publication(events[0]!, runtime.kernel.tick);
  const notice = hudEventNoticeFromWorkerMessage(message);
  if (notice === undefined || notice === 'none') throw new Error('the band was given nothing to say');
  const rows = hudEventAlertsFromWorkerMessage(message, []);
  if (rows === undefined || rows.length !== 1) throw new Error('the alerts list was given nothing to show');
  return {
    who: `${name.givenName} ${name.familyName}`,
    notice,
    row: { id: rows[0]!.id, labelKey: rows[0]!.labelKey },
  };
}

interface BandReading {
  readonly text: string | null;
  readonly severity: string | null;
  readonly hidden: boolean;
  readonly onScreen: boolean;
  readonly width: number;
  readonly height: number;
}

/** A prison's worth of view model around the one field this file is about. */
function viewModelWith(parts: {
  readonly event?: HudEventNoticeViewModel;
  readonly alerts?: readonly HudAlertViewModel[];
}): HudViewModel {
  return {
    counts: {
      prisoners: 1,
      prisonerCapacity: 2,
      occupiedPlaces: 1,
      staff: 0,
      staffUnassigned: 0,
      rooms: 2,
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 1,
      prisonersHighRisk: 0,
      activeIncidents: 0,
      contrabandFound: 0,
      treasuryMinorUnits: 24_870,
      stateIncomeAccruedTodayMinorUnits: 0,
    },
    clock: { day: 1, tickOfDay: 700, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: parts.alerts ?? [],
    ...(parts.event === undefined ? {} : { event: parts.event }),
  };
}

async function showBand(page: Page, notice: HudEventNoticeViewModel): Promise<BandReading> {
  await page.evaluate((model) => {
    window.lockstateUiHarness.setHudViewModel(model);
  }, viewModelWith({ event: notice }));

  return page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('.hud__event');
    if (band === null) throw new Error('the mounted HUD has no events band');
    const box = band.getBoundingClientRect();
    return {
      text: band.textContent,
      severity: band.dataset['severity'] ?? null,
      hidden: band.hidden === true,
      // `offsetParent === null` is the check issue #220 was measured with: a
      // node inside a `display: none` ancestor is in the DOM and on nobody's
      // screen.
      onScreen: band.offsetParent !== null,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
    };
  });
}

test.describe('a prisoner moved by a removal is named on screen (ADR 0076 A(i))', () => {
  // 375x812, where `.hud__corner` and the alerts list inside it do not exist
  // at all (`hud.css` drops the corner at 720px and below). If the sentence
  // reaches the player here, it reaches them everywhere.
  test.use({ viewport: { width: 375, height: 812 } });

  for (const route of ['remove-object', 'undo'] as const) {
    test(`says who moved and where to, through the ${route} route`, async ({ page }) => {
      const { who, notice, row } = relocationThrough(route);

      await page.goto(HARNESS_URL);
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      const band = await showBand(page, notice);

      // **The sentence, whole, off the production DOM.** The prisoner's half
      // is the name the prison minted; the rest is the wording the owner
      // approved, and this fails if a word of it moves.
      expect(band.text).toBe(`${who} had nowhere to sleep and moved to Cell.`);
      expect(band.text, 'an unfilled placeholder is what a nested parameter fails as').not.toContain('{');
      expect(band.severity).toBe('info');

      // The assertions the DOM alone cannot make.
      expect(band.hidden, 'the band was left hidden, so the sentence is in the page and on nobody`s screen').toBe(false);
      expect(band.onScreen, 'the band has no offset parent: it is inside something that is not displayed').toBe(true);
      expect(band.width, 'the band measured zero width').toBeGreaterThan(0);
      expect(band.height, 'the band measured zero height').toBeGreaterThan(0);

      // And the row the same event puts in the log carries the same key, so
      // the two surfaces are painted from one sentence rather than two.
      expect(row.labelKey).toBe('hud.alert.event.prisoners.relocated');
    });
  }

  test('paints the same sentence in the alerts list, which is a second call site', async ({ page }) => {
    // The wide viewport, where the event appears twice by design -- "one is
    // what is happening now, the other is the entry it left"
    // (`src/ui/simulation-alerts.ts`). The list matters here because it is a
    // *second* place `hud.ts` resolves a label's parameters, and a nested
    // parameter filled in for the band and not for the row would put
    // "{name} had nowhere to sleep" into the log alone.
    await page.setViewportSize({ width: 1280, height: 800 });
    const { who, notice, row } = relocationThrough('remove-object');

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(
      (model) => window.lockstateUiHarness.setHudViewModel(model),
      viewModelWith({ alerts: [{ ...notice, id: row.id }] }),
    );
    const probe = await page.evaluate(() => window.lockstateUiHarness.alertProbe());

    expect(probe.order, 'the event must reach the alerts list as well as the band').toEqual([row.id]);
    // `textContent` runs the row's label and its severity badge together with
    // no separator, which is why this contains rather than equals.
    expect(probe.texts[0]).toContain(`${who} had nowhere to sleep and moved to Cell.`);
    expect(probe.texts[0]).not.toContain('{');
  });
});
