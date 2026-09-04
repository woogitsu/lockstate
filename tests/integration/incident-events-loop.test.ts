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
import {
  hudEventAlertsFromWorkerMessage,
  hudEventNoticeFromWorkerMessage,
} from '../../src/ui/simulation-events';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A riot the player is actually told about** (issue #555).
 *
 * ## What this file is written against
 *
 * The measurement on the issue: a twelve-prisoner prison with one bed and one
 * toilet produced a riot roughly every two in-game days, *"and while an
 * incident was open, the Alerts section read 'No active alerts.'"* The only
 * player-visible sign of the most consequential thing that can happen to a
 * prison was a counter on the status strip.
 *
 * So every assertion here is on something a player could find out by looking
 * at the screen -- a row in the alerts list, a sentence resolved through the
 * shipped catalogue, the colour band that sentence carries -- rather than on
 * the shape of a record. `expect(log.count).toBe(1)` would pass for a channel
 * nobody could read.
 *
 * ## The prison, and why this one
 *
 * The "chronic neglect, fully housed" rung of
 * [ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md)'s ladder,
 * built the way `riot-regime-loop.test.ts` builds it: two furnished cells and
 * a furnished canteen, so both prisoners complete intake and run a full
 * timetable, and **no shower, yard, common room, classroom or laundry**, so
 * the sector's needs pressure climbs until `SectorRiskTracker` has twelve
 * consecutive hot samples. Nothing is hand-fed to the incident systems: the
 * riot is opened by the real trigger system out of real need decay, and the
 * event is written by the real producer on the same tick.
 *
 * **No guards**, which is what makes the second half reachable: with nobody to
 * dispatch, the riot passes `responseDeadlineTicks` and lapses, and a lapse is
 * a terminal transition exactly as a containment is. The all-clear this file
 * asserts is therefore the harder of the two cases -- the prison did not win,
 * it simply has nothing open any more.
 *
 * ## Ticks are searched for, not written down
 *
 * `riot-regime-loop.test.ts` pins `RIOT_TICK = 13_300` deliberately, because
 * the tick *is* its subject. Here it is not: the claim is "a riot opened and
 * the player was told", which is true whichever tick it opens on, and pinning
 * one would make this file fail for a balance change that does not break it.
 * The bound below is a guard against an infinite loop, not a measurement.
 */

/** Distinct from every other seed in the suite, so no shared fixture can make these results true by accident. */
const SEED = 0x5550;

const ARRIVAL = { x: 16, y: 16 } as const;
/** Long enough that `PrisonerDischargeSystem` releases nobody inside the window measured -- a discharge event would be a second producer on the channel this file reads. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

const CELL_A = { x: 4, y: 6, width: 2, height: 3 } as const;
const CELL_B = { x: 8, y: 6, width: 2, height: 3 } as const;
const CANTEEN = { x: 4, y: 12, width: 6, height: 6 } as const;

/** Comfortably past `riot-regime-loop.test.ts`'s measured opening at 13,300 and its lapse at 13,910, and a failed search rather than a hung suite if either moves. */
const SEARCH_LIMIT_TICKS = 40_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Two furnished cells, a furnished canteen, two prisoners and nobody to guard them. */
function neglectedPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 20 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 8 }));
  wallRoomPerimeter(runtime.world, CELL_A, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell-a', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_A }));
  wallRoomPerimeter(runtime.world, CELL_B, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell-b', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_B }));
  wallRoomPerimeter(runtime.world, CANTEEN, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));

  const furnishing = [
    { orderId: 'o-bed-a', definitionId: 'bed-wooden', x: 4, y: 6 },
    { orderId: 'o-wc-a', definitionId: 'toilet-brick', x: 5, y: 6 },
    { orderId: 'o-bed-b', definitionId: 'bed-wooden', x: 8, y: 6 },
    { orderId: 'o-wc-b', definitionId: 'toilet-brick', x: 9, y: 6 },
    { orderId: 'o-dt', definitionId: 'dining-table-wooden', x: 4, y: 12 },
    { orderId: 'o-b1', definitionId: 'bench-wooden', x: 4, y: 14 },
    { orderId: 'o-b2', definitionId: 'bench-wooden', x: 6, y: 14 },
  ] as const;
  for (const order of furnishing) submit(runtime, order.orderId, packCommand({ type: 'PlaceObject', ...order }));
  stepTo(runtime, 900);

  for (let index = 0; index < 2; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }
  return runtime;
}

/**
 * Steps until `done` answers `true`, and fails rather than spinning if it never
 * does. Returns the tick it stopped on, so a caller can carry on from there.
 */
function stepUntil(runtime: SimulationRuntime, what: string, done: () => boolean): number {
  const deadline = runtime.kernel.tick + SEARCH_LIMIT_TICKS;
  while (!done()) {
    if (runtime.kernel.tick >= deadline) throw new Error(`${what} did not happen within ${String(SEARCH_LIMIT_TICKS)} ticks`);
    runtime.kernel.step();
  }
  return runtime.kernel.tick;
}

/**
 * The event as it reaches the main thread: through the protocol schema rather
 * than handed over as an object, so a payload the boundary would reject cannot
 * reach an assertion here.
 */
function publication(event: SimulationEvent, tick: number): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000555',
    kind: 'simulation/event',
    payload: { tick, event },
  }) as WorkerToMainMessage;
}

/** Only the rows this file is about: another producer's discharge or payday is not what is being counted. */
function incidentEventsOf(runtime: SimulationRuntime): readonly SimulationEvent[] {
  return runtime.events.since(0).filter((event) => event.type.startsWith('incidents.'));
}

function sentenceFor(event: SimulationEvent, tick: number): { readonly text: string; readonly severity: string } {
  const notice = hudEventNoticeFromWorkerMessage(publication(event, tick));
  if (notice === undefined || notice === 'none') throw new Error('the band must be given something to say');
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
  return { text: localizer.format(notice.labelKey, notice.labelParameters), severity: notice.severity };
}

describe('what a player is told when the prison stops being under control', () => {
  it('does not leave the alerts list empty while a riot is running', () => {
    const runtime = neglectedPrison();

    /*
     * **Nothing is said before anything happens.** Asserted first and over
     * thousands of real ticks, because it is the half of the claim a broken
     * producer passes most easily: one that announced on every sampling point,
     * or on every tick a sector was hot, would satisfy every assertion below
     * and fail here.
     */
    stepTo(runtime, 3_000);
    expect(
      incidentEventsOf(runtime),
      'a prison with nothing open has nothing to say about incidents',
    ).toEqual([]);
    expect(runtime.incidents.all(), 'and it must genuinely have had nothing open, not merely said nothing').toEqual([]);

    const riotTick = stepUntil(runtime, 'a riot', () =>
      runtime.incidents.openIncidents().some((incident) => incident.type === 'riot'),
    );
    const riot = runtime.incidents.openIncidents().find((incident) => incident.type === 'riot')!;

    /*
     * The defect on the issue, in the terms the player met it in: an incident
     * is open, and the alerts list is what the HUD paints from. Fed the
     * publication, starting from the empty list a fresh session holds.
     */
    const riotEvents = incidentEventsOf(runtime).filter((event) => event.type === 'incidents.riot-opened');
    expect(riotEvents.length, 'one riot is one thing to say').toBe(1);
    const opening = riotEvents[0]!;
    const alerts = hudEventAlertsFromWorkerMessage(publication(opening, riotTick), []);
    expect(alerts, 'a riot must put a row in the list that used to read "No active alerts"').toBeDefined();
    expect(alerts!.length).toBe(1);

    /*
     * `'danger'`, and it is the first event in the repository to carry it.
     * `hud.css` wrote `.hud__event[data-severity='danger']` ahead of any
     * producer precisely so this row could not be painted in the `'info'`
     * blue and read as good news.
     */
    const { text, severity } = sentenceFor(opening, riotTick);
    expect(severity, 'a riot is not a warning -- the prison is not doing what the player told it to').toBe('danger');
    expect(text, 'the player must not be shown a raw message key').not.toContain('hud.alert.event');

    /*
     * The figure in the sentence is the riot's own participant list, read off
     * the incident record rather than off the event -- so a producer that
     * carried some other count, or a constant, fails here. Both prisoners are
     * in it, which is also `DEFAULT_MINIMUM_RIOT_PARTICIPANTS`, so the
     * sentence's plural is correct.
     */
    expect(opening).toMatchObject({ type: 'incidents.riot-opened', participantCount: riot.participantIds.length });
    expect(text, 'and the sentence says how many prisoners it is').toContain(String(riot.participantIds.length));
  });

  it('does not leave a red line standing over a prison that is calm again', () => {
    const runtime = neglectedPrison();
    stepUntil(runtime, 'a riot', () => runtime.incidents.openIncidents().some((incident) => incident.type === 'riot'));

    /*
     * With no guards the riot cannot be contained, so it lapses at its
     * response deadline -- the harder of the two terminal cases, because the
     * prison did not win it.
     */
    const clearTick = stepUntil(runtime, 'the riot to end', () => runtime.incidents.openIncidentCount === 0);

    /*
     * **The riot is not the first incident this prison has**, which the first
     * draft of this file assumed and the run corrected: `IncidentTriggerSystem`
     * opens an assault long before the sector has twelve consecutive hot
     * samples, so the channel already carries an opening and an all-clear by
     * the time the riot arrives. The claim is about the *last two* entries --
     * the riot, and the sentence that ends it -- and asserting the whole
     * sequence would have been asserting the balance of ADR 0061's triggers
     * rather than anything this issue changed.
     */
    const incidentEvents = incidentEventsOf(runtime);
    /*
     * **`-after-lapse`, and the suffix is the assertion** (issue #914's
     * finding 4). This prison has no guards, so the comment above is right
     * that it "did not win it" -- and until this change the row it got was
     * `incidents.all-clear`, the same row a prison that contained fifteen
     * incidents with nobody hurt gets. Measured over two full acts in
     * `docs/research/2026-09-04-does-anyone-answer-an-incident.md`: 15/15
     * resolved with zero injuries against 19/19 lapsed with 114
     * prisoner-injuries, and byte-for-byte identical alert columns. The
     * counterpart this test exists to demand is still demanded; what is
     * demanded as well is that it be the counterpart for *this* ending.
     */
    expect(
      incidentEvents.slice(-2).map((event) => event.type),
      'the prison says the riot opened and then says how it ended -- nothing on this channel is ever retracted',
    ).toEqual(['incidents.riot-opened', 'incidents.all-clear-after-lapse']);

    const { text, severity } = sentenceFor(incidentEvents.at(-1)!, clearTick);
    /*
     * Not `'info'`: every participant of a lapsed incident is injured by
     * `IncidentResponseSystem.lapse`, so something did go wrong here and
     * `'info'` was the grade that said otherwise. Still not `'danger'` --
     * nothing is running any more, which is the rest of this test's subject.
     */
    expect(severity, 'a prison that was hurt is not calm news').toBe('warning');
    expect(text).not.toContain('hud.alert.event');
    expect(text, 'and the row says which of the two endings it was').toContain('ran out of time');

    /*
     * **The band is what this is really about.** It holds the newest event
     * until another arrives, so an opening with no counterpart would leave
     * "A riot has broken out" red across the top of a calm prison for the rest
     * of the session. Replaying both publications in order is how a player's
     * screen actually gets there.
     */
    let band = hudEventNoticeFromWorkerMessage(publication(incidentEvents.at(-2)!, clearTick));
    expect(band).toMatchObject({ severity: 'danger' });
    band = hudEventNoticeFromWorkerMessage(publication(incidentEvents.at(-1)!, clearTick));
    expect(band, 'the last word on a calm prison must not be the riot').toMatchObject({ severity: 'warning' });
  });

  it('says it once per incident however long the prison is left in trouble', () => {
    const runtime = neglectedPrison();

    /*
     * **The volume rule, measured rather than described.** A neglected prison
     * riots again every quiet period for as long as nobody fixes it, so the
     * question is whether the channel keeps pace with the *incidents* or with
     * the *ticks*. The two logs are compared against each other: every riot
     * that is in the auditable incident log is announced exactly once, and
     * every return to calm is announced at most once, over a run long enough
     * to contain several of both.
     */
    stepTo(runtime, 40_000);

    const incidentsInLog = runtime.incidents.all();
    const riotsInLog = incidentsInLog.filter((incident) => incident.type === 'riot').length;
    expect(riotsInLog, 'this run has to contain several riots for the comparison to mean anything').toBeGreaterThan(1);

    const incidentEvents = incidentEventsOf(runtime);
    const openings = incidentEvents.filter((event) => event.type.endsWith('-opened'));
    // Both endings count as a return to calm here: the volume rule this test
    // is about is one row per *return*, and which of the two rows it is is
    // finding 4's subject and the previous case's.
    const allClears = incidentEvents.filter(
      (event) => event.type === 'incidents.all-clear' || event.type === 'incidents.all-clear-after-lapse',
    ).length;

    expect(
      openings.filter((event) => event.type === 'incidents.riot-opened').length,
      'one sentence per riot, not one per sampling point',
    ).toBe(riotsInLog);
    expect(openings.length, 'and one per incident of any kind').toBe(incidentsInLog.length);
    expect(
      allClears,
      'the prison cannot become calm more often than it stops being calm',
    ).toBeLessThanOrEqual(openings.length);
  });
});
