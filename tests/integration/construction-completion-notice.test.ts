import { describe, expect, it } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { MAX_BUFFERED_SIMULATION_EVENTS, SimulationEventLog } from '../../src/simulation/events/event-log';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import type { HudAlertViewModel } from '../../src/ui/hud/view-model';

/**
 * **What a finished build order says** ([ADR
 * 0116](../../docs/adr/0116-whether-a-finished-object-is-an-event.md), the
 * owner's ruling of 2026-09-16: option 2, *"jeden zliczany wiersz"* -- a
 * construction-completion event, graded `'info'`, routed to the log alone, and
 * **counted rather than repeated**, so twenty-four finished walls are one row
 * carrying a count of 24).
 *
 * ## Why this file exists rather than three assertions spread over three others
 *
 * The ruling is one sentence about four things at once -- that a completion is
 * an event, what grade it wears, which surfaces it reaches, and that a
 * programme of them is *one* row -- and the last of those is a property of the
 * whole pipeline rather than of any layer in it. It is produced inside a tick
 * by `ConstructionSystem`, appended by `SimulationEventLog`, canonicalised by
 * `simulationEventIdentity` and grouped by `hudEventAlertsFromWorkerMessage`,
 * and a test that stopped at any one of those would pass while the player read
 * twenty-four rows.
 *
 * So the session here is the real one -- `createNewSimulationRuntime`, the
 * production composition root -- and the walls are really built, tick by tick,
 * rather than being hand-written records fed to the reducer.
 *
 * ## What this replaces: ADR 0116 D4's proxy, which its own D12 names as the
 * dossier's weakest claim
 *
 * Every row figure in the dossier the owner ruled on was measured against a
 * **proxy** member -- `economy.construction-restored` stood in for the
 * envelope-only shape, because no completion member existed. D12 says what
 * would refute it: *"a completion member whose schema carries a field neither
 * proxy has ... at which point the one-row result is a result about a payload
 * nobody has agreed to"*, and names the settlement: *"build option 2 behind the
 * ruling and re-run the same four shapes against the real member."* That is
 * what the second and third cases below do.
 */

const WALL = 'wall-brick';

function createSession(seed = 0x116) {
  const runtime = createNewSimulationRuntime(seed);
  let sequence = 0;

  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };

  const run = (ticks: number): void => {
    for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  };

  const runUntilState = (orderId: string, state: string, limit = 600): void => {
    for (let step = 0; step < limit; step += 1) {
      if (runtime.construction.getOrder(orderId)?.state === state) return;
      runtime.kernel.step();
    }
    throw new Error(`${orderId} never reached ${state}; it is ${String(runtime.construction.getOrder(orderId)?.state)}`);
  };

  return {
    runtime,
    send,
    run,
    runUntilState,
    said: (): readonly SimulationEvent[] => runtime.events.since(0),
    types: (): readonly string[] => runtime.events.since(0).map((event) => event.type),
    stateOf: (orderId: string): string | undefined => runtime.construction.getOrder(orderId)?.state,
  };
}

function placeWall(session: ReturnType<typeof createSession>, orderId: string, x: number): void {
  session.send({ type: 'PlaceBuildOrder', orderId, definitionId: WALL, x, y: 6, edge: 'north' });
}

/** The envelope the worker publishes one event in, exactly as `ui-simulation-events.test.ts` builds it. */
function publication(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000116',
    kind: 'simulation/event',
    payload: { tick: event.tick + 1, event },
  }) as WorkerToMainMessage;
}

/** The rows a run of publications leaves behind, folded through the shipped reducer. */
function rowsFor(events: readonly SimulationEvent[], previous: readonly HudAlertViewModel[] = []): readonly HudAlertViewModel[] {
  let rows = previous;
  for (const event of events) rows = hudEventAlertsFromWorkerMessage(publication(event), rows) ?? rows;
  return rows;
}

describe('a build order that finishes says so', () => {
  it('records one completion when a wall finishes, through the production composition root', () => {
    /*
     * **The whole claim of ADR 0116 option 2's first half, measured rather
     * than asserted about a mock.** `createNewSimulationRuntime` is what a
     * session is; the wall is placed through the real command boundary and
     * built by `ConstructionSystem.update` on its own 10-tick schedule.
     *
     * **`toEqual` on the whole list rather than `toContain`**, and that is the
     * half a reader should check. The call site sits inside
     * `if (order.progress >= def.workRequired)` and the arm around it runs on
     * every scheduled pass of an unfinished order -- five passes for a wall --
     * so a call one line further out would record five completions for one
     * wall and a `toContain` would be green for it.
     */
    const session = createSession();
    placeWall(session, 'order-1', 4);
    expect(session.types(), 'nothing is said before the crew finishes').toEqual([]);

    session.runUntilState('order-1', 'completed');
    expect(session.types()).toEqual(['construction.order-completed']);

    /*
     * And it does not say it again on the passes after. The order stays
     * `'completed'` in the book and the walk keeps reaching it; `case
     * 'completed'` has no arm that records anything, and this is what pins
     * that.
     */
    session.run(60);
    expect(session.types(), 'a finished order is announced once, not once per pass').toEqual([
      'construction.order-completed',
    ]);
  });

  it('turns twenty-four finished walls into one row counted 24 (ADR 0116 D4, against the real member)', () => {
    /*
     * **The ruling's headline figure, re-measured against the member that now
     * exists.** ADR 0116 D4 obtained "1 row, count 24" by running the shipped
     * reducer against `economy.construction-restored` as a stand-in, and its
     * D12 calls that the dossier's weakest claim. The events folded in here are
     * produced by twenty-four walls really being built.
     *
     * **What makes it one row is the payload being empty**, and nothing else:
     * `simulationEventIdentity` drops `sequence` and `tick` and canonicalises
     * the rest, so twenty-four records that differ in no other field are one
     * statement. Put an order id, a tile or a count on the schema and this
     * becomes eight rows and sixteen statements the player never sees -- which
     * is D4's own fourth line, and the reason the schema's docblock says the
     * emptiness is load-bearing.
     */
    const session = createSession();
    for (let index = 0; index < 24; index += 1) placeWall(session, `order-${index}`, 4 + index);
    for (let index = 0; index < 24; index += 1) session.runUntilState(`order-${index}`, 'completed', 2_000);

    const completions = session.said().filter((event) => event.type === 'construction.order-completed');
    expect(completions, 'twenty-four walls, twenty-four records').toHaveLength(24);

    const rows = rowsFor(completions);
    expect(rows, 'and one row for the player to read').toHaveLength(1);
    expect(rows[0]?.occurrences?.count).toBe(24);
  });

  it('is graded info and reaches the log alone, so a building programme cannot displace a riot', () => {
    /*
     * The grade and the routing, and they are asserted through what they *do*
     * rather than by reading the table back: a `severity` equality would pass
     * against a table nothing consults, and a `surfaces` equality likewise.
     *
     * - **`'info'`** is checked on the row the reducer built, and then by
     *   driving a full list: `SEVERITY_EVICTION_ORDER` drops `'info'` first,
     *   so a riot and an unpaid payday survive a programme of completions.
     *   Graded `'warning'` the completion would tie with the payday and the
     *   older row -- the payday -- would go instead.
     * - **`'log-only'`** is checked by asking for the band's notice and
     *   getting `undefined`. `'none'` would be the worse wrong answer:
     *   `src/main.ts` deletes `HudViewModel.event` on it, so a finished wall
     *   would *empty* the band and delete an unread escape-attempt sentence.
     */
    const session = createSession();
    placeWall(session, 'order-1', 4);
    session.runUntilState('order-1', 'completed');
    const [completion] = session.said().filter((event) => event.type === 'construction.order-completed');
    expect(completion).toBeDefined();
    if (completion === undefined) return;

    expect(rowsFor([completion])[0]?.severity).toBe('info');
    expect(hudEventNoticeFromWorkerMessage(publication(completion))).toBeUndefined();

    /*
     * D5, re-run against the real member: a list that already holds a prison
     * in trouble loses nothing to a building programme.
     */
    const inTrouble = rowsFor([
      { sequence: 1, tick: 10, type: 'economy.wages-unpaid', unpaidWagesMinorUnits: 4_200 },
      { sequence: 2, tick: 11, type: 'incidents.riot-opened', participantCount: 5 },
      { sequence: 3, tick: 12, type: 'rooms.zoned', roomNameKey: 'room.yard.name' },
    ]);
    expect(inTrouble).toHaveLength(3);

    const after = rowsFor(
      Array.from({ length: 24 }, (_unused, index) => ({
        sequence: 100 + index,
        tick: 100 + index,
        type: 'construction.order-completed' as const,
      })),
      inTrouble,
    );
    expect(after, 'three rows that were there, plus one counted row of completions').toHaveLength(4);
    expect(after.map((row) => row.severity)).toEqual(['warning', 'danger', 'info', 'info']);
  });

  it('costs the persisted buffer ten history records for twenty-four walls, which is what the dossier priced', () => {
    /*
     * **ADR 0116 D6, re-measured against the real member rather than against a
     * proxy**, and it is the figure the owner was shown before ruling:
     * *"twenty-four completions occupy 37.5 % of the 64-record persisted buffer
     * and evict 10 records of a 50-record history"*.
     *
     * **`SimulationEventLog` collapses nothing**, and that is the point of
     * measuring it separately from the rows above: `simulationEventIdentity` is
     * a HUD-side reading and `append` pushes every record. The counted-row
     * trick that makes this cheap on screen does not reach the save at all.
     *
     * The history is built from `recordRoomZoned` rather than from
     * completions, so what is evicted is a prison's own past.
     */
    const log = new SimulationEventLog();
    for (let index = 0; index < 50; index += 1) log.recordRoomZoned('room.yard.name', index);
    const oldestBefore = log.since(0)[0]?.sequence;

    for (let index = 0; index < 24; index += 1) log.recordBuildOrderCompleted(100 + index);

    const buffered = log.since(0);
    const completions = buffered.filter((event) => event.type === 'construction.order-completed');
    const oldestAfter = buffered[0]?.sequence;

    expect(buffered).toHaveLength(MAX_BUFFERED_SIMULATION_EVENTS);
    expect(completions, 'every completion is retained; the history is what leaves').toHaveLength(24);
    expect(completions.length / MAX_BUFFERED_SIMULATION_EVENTS, '37.5% of everything the save remembers').toBe(0.375);
    expect(oldestBefore).toBe(1);
    expect(oldestAfter, 'ten records of history evicted').toBe(11);
  });
});
