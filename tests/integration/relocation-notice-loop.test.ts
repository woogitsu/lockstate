import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { resolveHudLabelParameters } from '../../src/ui/hud/label-parameters';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **The player is told when a prisoner changes cell without being asked**
 * ([ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(i)).
 *
 * ## What this file is written against
 *
 * PR #637 implemented A(i) and shipped it **silent**, and said so: *"Owed: a
 * notice that a named prisoner has been moved from one cell to another without
 * the player asking."* ADR 0076's Status had reserved the wording to the owner
 * -- *"whoever implements relocation must put the question rather than invent
 * the string"* -- and under issue #629 the silence was a defect rather than a
 * nicety. The question was put; the wording was approved on 2026-08-30 and is
 * in `src/content/default-locale-en.ts`.
 *
 * So every assertion here is on a **sentence a player could read**, resolved
 * through the shipped catalogue exactly as `incident-events-loop.test.ts`
 * resolves a riot's. `expect(runtime.events.count).toBe(1)` would pass for a
 * channel nobody can read, and an assertion on `notice.labelKey` would pass
 * for a sentence whose `{name}` never got filled in.
 *
 * ## Both removal routes, because the two disagree about everything else
 *
 * `RemoveObject` and the `Undo` of a completed object order are separate
 * wirings into `ObjectPlacementService` -- one refunds nothing and one refunds
 * the plank (decision B, still outstanding), one is handed the tick and one is
 * not -- and both take the same bed out of the same room.
 *
 * **The materials half of that sentence is false since the owner's ruling of
 * 2026-09-01 and is kept because it is what the two routes used to disagree
 * about.** *"Taking a finished object away returns nothing. Not its materials,
 * not its money."* -- ADR 0076's amendment of that date -- reverses decision B,
 * so neither route refunds anything. They are still separate wirings, still
 * differ over the tick, and still both have to announce, which is what this
 * file measures; the heading above it is now one word too strong and the
 * sentence says why. It is the **undo**
 * route that `economy-bed-recycling.test.ts` drives the recycling loop
 * through, so a notice wired to the press alone would be silent exactly where
 * it matters most. Each route is driven end to end below.
 *
 * ## What is *not* here
 *
 * **A sentence for the resident the prison could not move.**
 * `relocateExcessResidentsOf` reports them as `stranded`, ADR 0028 decision 2
 * leaves them where they are, and the owner has approved no wording for it.
 * The last test in this file pins that silence as a deliberate state rather
 * than an accident, so that adding copy for it is a decision somebody makes on
 * purpose.
 */

const SEED = 0x0b1ec7;
const CELL = 'room.cell';

/** `room.cell`'s authored minimum, and the same rectangle `object-removal-loop.test.ts` measures. */
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

/**
 * The event as it reaches the main thread: through the protocol schema rather
 * than handed over as an object, so a payload the worker boundary would reject
 * cannot reach an assertion here. That is not decoration -- the name and the
 * room key this notice carries are the first identity on this channel, and a
 * schema that refused them would refuse them in production too.
 */
function publication(event: SimulationEvent, tick: number): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000076',
    kind: 'simulation/event',
    payload: { tick, event },
  }) as WorkerToMainMessage;
}

/**
 * The whole main-thread chain, in production order: the real translator, then
 * the real nested-parameter resolution `hud.ts` renders with, then the real
 * localizer over the shipped catalogue.
 *
 * `onMissingKey` is collected rather than ignored, because the two failures
 * this notice can have are both *silent* ones that leave a plausible string
 * on screen: a key that resolves to itself, and a placeholder nothing filled
 * in. `Localizer` reports both, and reporting neither is part of the pass.
 */
function bandSentence(event: SimulationEvent, tick: number): {
  readonly text: string;
  readonly severity: string;
  readonly missing: readonly string[];
} {
  const notice = hudEventNoticeFromWorkerMessage(publication(event, tick));
  if (notice === undefined || notice === 'none') throw new Error('the band must be given something to say');
  const missing: string[] = [];
  const localizer = new Localizer({
    locale: DEFAULT_LOCALE,
    catalogs: [defaultMessageCatalogEn],
    onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
  });
  const t = (key: Parameters<typeof localizer.format>[0], parameters?: Parameters<typeof localizer.format>[1]): string =>
    localizer.format(key, parameters);
  return {
    text: localizer.format(notice.labelKey, resolveHudLabelParameters(t, notice)),
    severity: notice.severity,
    missing,
  };
}

/** Only this file's rows: a discharge or a payday on the same channel is not what is being counted. */
function relocationEventsOf(runtime: SimulationRuntime): readonly SimulationEvent[] {
  return runtime.events.since(0).filter((event) => event.type === 'prisoners.relocated');
}

/** The name the prison actually minted for them, read from the identity registry rather than written down here. */
function nameOf(runtime: SimulationRuntime, prisoner: number): string {
  const name = runtime.actorIdentity.getName('prisoner', prisoner);
  if (name === undefined) throw new Error('a housed prisoner has been through reception and has a name');
  return `${name.givenName} ${name.familyName}`;
}

/**
 * Two walled and zoned cells, one bed in each, one prisoner housed in the
 * first. Adapted from `object-removal-loop.test.ts`'s
 * `prisonWithHousedPrisoner`, which is where the same prison is measured
 * without the HUD.
 */
function prisonWithHousedPrisoner(): { readonly runtime: SimulationRuntime; readonly prisoner: number } {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
  submit(runtime, 'place-bed-2', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
  stepTo(runtime, 400);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  stepTo(runtime, 460);
  const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
  expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'housed in the cell whose bed is about to go').toBe(
    cellInstanceId,
  );
  expect(relocationEventsOf(runtime), 'and nothing has been said yet').toEqual([]);
  return { runtime, prisoner };
}

describe('what the player is told when a removal moves somebody (ADR 0076 A(i))', () => {
  it('names the prisoner and the room they were moved to, on the RemoveObject press', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    const who = nameOf(runtime, prisoner);

    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // The move itself, so a passing sentence is never a sentence about a move
    // that did not happen.
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'rehoused next door').toBe(secondCellInstanceId);

    const events = relocationEventsOf(runtime);
    expect(events.length, 'one resident moved, so the prison says so once').toBe(1);
    const { text, severity, missing } = bandSentence(events[0]!, runtime.kernel.tick);

    // **The sentence, whole.** The prisoner's half is read out of the identity
    // registry -- which is not what is under test here -- and the rest is the
    // literal wording the owner approved, so this fails if a word of it moves.
    expect(text).toBe(`${who} had nowhere to sleep and moved to Cell.`);
    expect(text, 'no placeholder may reach the player').not.toContain('{');
    expect(missing, 'no unresolved key and no unfilled parameter').toEqual([]);
    expect(severity, 'nothing is wrong any more: they sleep on a bed that exists').toBe('info');
  });

  it('says the same thing on the undo route, which is the one the recycling loop uses', () => {
    // `Undo` pops the *last* transaction, so the two beds are placed the other
    // way round here -- the spare cell first, the cell that will be occupied
    // last -- and one press reaches the bed the resident is sleeping on. The
    // fixture is `object-removal-loop.test.ts`'s undo fixture; only the
    // assertions are this file's.
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }));
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'bed-2', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'bed-1', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    stepTo(runtime, 600);
    expect(runtime.construction.getOrder('bed-1')?.state, 'the bed is a completed order').toBe('completed');
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 700);
    const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'housed on the bed the undo will take').toBe(
      cellInstanceId,
    );
    expect(relocationEventsOf(runtime), 'and nothing has been said yet').toEqual([]);
    const who = nameOf(runtime, prisoner);

    submit(runtime, 'undo', packCommand({ type: 'Undo' }));

    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'rehoused, not left').toBe(secondCellInstanceId);
    const events = relocationEventsOf(runtime);
    expect(events.length, 'the undo route says it too, or it is silent where it matters most').toBe(1);
    const { text, severity, missing } = bandSentence(events[0]!, runtime.kernel.tick);
    expect(text).toBe(`${who} had nowhere to sleep and moved to Cell.`);
    expect(text).not.toContain('{');
    expect(missing).toEqual([]);
    expect(severity).toBe('info');

    // **And it reaches the log as well as the band**, which is the other
    // surface `src/ui/simulation-events.ts` produces. Both are painted from
    // the same event and the row's text goes through the same resolution, so
    // a nested parameter resolved in one place and not the other would show
    // up here.
    const alerts = hudEventAlertsFromWorkerMessage(publication(events[0]!, runtime.kernel.tick), []);
    expect(alerts?.length).toBe(1);
    expect(alerts![0]!.labelParameterMessages?.['room'], 'the row carries the room as a key, never as text').toEqual({
      key: 'room.cell.name',
    });
  });

  it('says nothing about a resident it could not move, because no wording for that exists', () => {
    // The one-cell prison: the branch ADR 0076 says the recycling loop runs
    // through by construction, and the branch decision A(ii) is unconditional
    // for. The resident stays where ADR 0028 decision 2 put them.
    //
    // **This is a gap held open on purpose, not a proof that silence is
    // right.** A prisoner sleeping in a room with no bed in it is arguably
    // exactly what issue #629 says a player must be told; what stops this
    // change from saying it is that new player-facing copy is the owner's
    // alone (`AGENTS.md`), and only the *relocated* sentence was approved.
    // This test exists so that filling the gap is a decision rather than a
    // discovery.
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    stepTo(runtime, 400);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 460);
    const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(prisoner)).toBe(cellInstanceId);

    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'stranded, and not evicted').toBe(cellInstanceId);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity, 'in a cell with no bed').toBe(0);
    expect(relocationEventsOf(runtime), 'and the prison says nothing, because nobody moved').toEqual([]);
    expect(runtime.events.since(0), 'nothing else is announced either').toEqual([]);
  });

  it('says nothing when the removal moved nobody, so the band is not noise', () => {
    // The half a broken producer passes most easily: one that announced on
    // every removal would satisfy both tests above and fail here.
    const { runtime } = prisonWithHousedPrisoner();
    submit(runtime, 'remove-second-bed', packCommand({ type: 'RemoveObject', ...SECOND_BED_TILE }));
    expect(runtime.prisoners.roomInstances.getById(secondCellInstanceId)?.residentCapacity, 'the empty cell lost its bed').toBe(
      0,
    );
    expect(relocationEventsOf(runtime), 'nobody lived there, so there is nothing to say').toEqual([]);
  });
});
