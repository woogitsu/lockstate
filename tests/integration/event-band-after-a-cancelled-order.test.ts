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
  EMPTY_EVENT_BAND_DWELL_STATE,
  EVENT_BAND_DWELL_FLOOR_MS,
  admitToEventBand,
  releaseEventBandFloor,
  type EventBandDwellState,
} from '../../src/ui/hud/event-band-dwell';
import { resolveHudLabelParameters } from '../../src/ui/hud/label-parameters';
import type { HudEventNoticeViewModel } from '../../src/ui/hud/view-model';
import { hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A press that says nothing must not be read as the previous press's
 * sentence** ([#988](https://github.com/matmaxalez/lockstate/issues/988)).
 *
 * ## What was measured, and why it is a defect rather than a nicety
 *
 * With the clock paused, so no tick could pass between them, a play-tester
 * removed a standing bed with Build → `Remove` and read *"The object was
 * removed -- the money it cost does not come back."* -- true of that press.
 * They then pressed the same control on a bed **still being built**, which
 * cancels the order and **refunds**, and the band said nothing new: the
 * removal's sentence was still on the line, now standing over a press that had
 * just given their money back. The band holds exactly one sentence, and
 * `src/main.ts` replaces `HudViewModel.event` on a newer event and on nothing
 * else -- `refusals.supersede` supersedes a *refusal*, not an event -- so a
 * silent press inherits whatever the last loud one left there.
 *
 * That makes silence a false statement rather than an absent one, which is
 * `AGENTS.md`'s fourth exclusion arriving by the back door: the player is
 * reading a promise the code does not keep, about money, over a control they
 * are deciding whether to trust.
 *
 * ## Why this file drives the whole chain
 *
 * `tests/integration/command-success-notices.test.ts` gates the simulation half
 * -- that the press records the right event -- and it cannot see this defect at
 * all, because the defect is about what is on the band **after** a press that
 * records nothing. The claim here is about a *sentence a player reads across
 * two presses*, so it runs the real kernel and command router, the real
 * protocol schema, the real translator, the real dwell arbitration
 * (`admitToEventBand`) and the shipped catalogue, in that order.
 *
 * `expect(runtime.events.count).toBe(2)` would pass for a band nobody can read,
 * and an assertion on `labelKey` would pass for a key with no sentence behind
 * it. Every assertion below is on text.
 */

const SEED = 0x3dc;
const CELL = 'room.cell';
/** `room.cell`'s authored minimum, and the same rectangle `object-removal-loop.test.ts` measures. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** The first of the cell's two 1x2 columns: the bed that gets built and then taken away. */
const STANDING_BED_TILE = { x: 4, y: 6 } as const;
/** The second column: the bed that is still in flight when the player presses `Remove` on it. */
const PENDING_BED_TILE = { x: 5, y: 6 } as const;

/**
 * The sentences, quoted from `src/content/default-locale-en.ts` rather than
 * read back off it. A test that resolved the expected text through the same
 * catalogue the code resolves it through would pass for an empty catalogue and
 * for a catalogue that had swapped the two (`docs/TESTING.md`).
 */
const REMOVED = 'The object was removed — the money it cost does not come back.';
const CANCELLED = 'The order was cancelled — the money it cost is refunded.';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/** Steps until the order reaches `state`, failing on the budget rather than hanging. */
function runUntilState(runtime: SimulationRuntime, orderId: string, state: string, limit = 600): void {
  for (let step = 0; step < limit; step += 1) {
    if (runtime.construction.getOrder(orderId)?.state === state) return;
    runtime.kernel.step();
  }
  throw new Error(`${orderId} never reached ${state}; it is ${String(runtime.construction.getOrder(orderId)?.state)}`);
}

/**
 * The event as it reaches the main thread: through the protocol schema, so a
 * payload the worker boundary would reject cannot reach an assertion here.
 */
function publication(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000988',
    kind: 'simulation/event',
    payload: { tick: event.tick, event },
  }) as WorkerToMainMessage;
}

/**
 * `src/main.ts`'s three-state rule for `HudViewModel.event`, as a function.
 *
 * `undefined` is *this message said nothing about the band* and the field is
 * left exactly as it was -- which is the whole mechanism under test, so it is
 * reproduced rather than approximated. `'none'` empties it.
 */
function nextBandField(
  current: HudEventNoticeViewModel | undefined,
  message: WorkerToMainMessage,
): HudEventNoticeViewModel | undefined {
  const notice = hudEventNoticeFromWorkerMessage(message);
  if (notice === undefined) return current;
  if (notice === 'none') return undefined;
  return notice;
}

/**
 * What `paintEventNotice` would write, given the notice `admitToEventBand`
 * chose to paint.
 *
 * `onMissingKey` is collected rather than ignored, because both ways this can
 * fail leave a plausible string on screen: a key that resolves to itself, and a
 * placeholder nothing filled in.
 */
function painted(notice: HudEventNoticeViewModel | undefined): { readonly text: string; readonly severity: string } {
  if (notice === undefined) return { text: '', severity: '' };
  const missing: string[] = [];
  const localizer = new Localizer({
    locale: DEFAULT_LOCALE,
    catalogs: [defaultMessageCatalogEn],
    onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
  });
  const t = (key: Parameters<typeof localizer.format>[0], parameters?: Parameters<typeof localizer.format>[1]): string =>
    localizer.format(key, parameters);
  const text = localizer.format(notice.labelKey, resolveHudLabelParameters(t, notice));
  expect(missing, 'the band resolved every key and every placeholder it was given').toEqual([]);
  return { text, severity: notice.severity };
}

/**
 * A cell with one bed standing in it and a second bed still being built.
 *
 * Both tiles are inside one `room.cell`, which has exactly two 1x2 columns, so
 * the two presses under test are the same control aimed one tile apart -- which
 * is what the play-tester did. **Nobody lives here**: a resident would make the
 * first press raise `prisoners.relocated` as well (ADR 0076 decision A(i)) and
 * this file's subject is what one sentence does to the *next* press, not what
 * two sentences do to each other.
 */
function cellWithOneBedStandingAndOneInFlight(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(
    runtime,
    'place-standing',
    packCommand({ type: 'PlaceObject', orderId: 'bed-standing', definitionId: 'bed-wooden', ...STANDING_BED_TILE }),
  );
  runUntilState(runtime, 'bed-standing', 'completed');
  submit(
    runtime,
    'place-pending',
    packCommand({ type: 'PlaceObject', orderId: 'bed-pending', definitionId: 'bed-wooden', ...PENDING_BED_TILE }),
  );
  /*
   * One step, so the order is in the window between the press and the object
   * existing and the crew has not started on it.
   *
   * **Asserted as a member of the four pre-crew states rather than as one of
   * them**, because which one a single step lands on is the construction
   * cadence's business and not this file's, while *the crew has not started* is
   * the property the refund sentence rests on: `destroysSpendOnCancel` holds
   * `'in-progress'` and `'completed'` and nothing else. The list is written out
   * rather than imported, so a fifth state joining the refund arm does not
   * silently widen what this fixture claims, and
   * `tests/integration/command-success-notices.test.ts` pins the sentence for
   * each state one at a time.
   */
  runtime.kernel.step();
  expect(
    ['planned', 'approved', 'materials-pending', 'assigned'],
    'the second bed is in flight and the crew has not started on it',
  ).toContain(runtime.construction.getOrder('bed-pending')?.state);
  expect(runtime.placedObjects.size, 'exactly one bed is standing').toBe(1);
  return runtime;
}

describe('the band after a press that used to say nothing (#988)', () => {
  it('reads the refund sentence after the cancellation, not the removal sentence it stood under', () => {
    const runtime = cellWithOneBedStandingAndOneInFlight();
    const before = runtime.events.since(0).length;

    /*
     * **No tick passes that could put anything else on the band.** The player
     * measured this with the clock paused; here the two presses are dispatched
     * into a kernel nothing else is driving, and the delta below is asserted to
     * be exactly the two events -- which is the same guarantee pausing buys.
     */
    submit(runtime, 'remove-standing', packCommand({ type: 'RemoveObject', ...STANDING_BED_TILE }));
    submit(runtime, 'remove-pending', packCommand({ type: 'RemoveObject', ...PENDING_BED_TILE }));

    const said = runtime.events.since(0).slice(before);
    expect(said.map((event) => event.type), 'one sentence per press, and the second is about a refund').toEqual([
      'objects.removed-spend-destroyed',
      'construction.order-cancelled',
    ]);
    expect(runtime.construction.getOrder('bed-pending')?.state, 'the second press really did cancel the order').toBe(
      'cancelled',
    );
    expect(runtime.placedObjects.size, 'and the first press really did take the standing bed out').toBe(0);

    /*
     * The main-thread chain, one message at a time, with the presses more than
     * the dwell floor apart -- which is what two deliberate presses are. The
     * case below drives the other side of that floor.
     */
    let field: HudEventNoticeViewModel | undefined;
    let dwell: EventBandDwellState = EMPTY_EVENT_BAND_DWELL_STATE;
    let now = 1_000;

    field = nextBandField(field, publication(said[0]!));
    let decision = admitToEventBand(dwell, field, now);
    dwell = decision.state;
    expect(painted(decision.paint), '#945 still says what the first press cost').toEqual({
      text: REMOVED,
      severity: 'warning',
    });

    now += EVENT_BAND_DWELL_FLOOR_MS + 1;
    field = nextBandField(field, publication(said[1]!));
    decision = admitToEventBand(dwell, field, now);
    dwell = decision.state;
    const after = painted(decision.paint);
    expect(after.text, 'the band says what the press it is standing over actually did').toBe(CANCELLED);
    expect(after.text, 'and no longer claims the money was destroyed').not.toBe(REMOVED);
    expect(after.severity, 'a refund is not a loss').toBe('info');
  });

  it('holds the true sentence for the dwell floor rather than dropping it, when the two presses land inside 600 ms', () => {
    /*
     * The other side of ADR 0084 decision 4, asserted rather than assumed. The
     * refund is `'info'` and the removal is `'warning'`, so a cancellation
     * pressed inside the floor does **not** outrank the sentence on the line:
     * it waits, and `releaseEventBandFloor` puts it up when the floor lapses.
     *
     * That is the arbitration working as designed and not a hole in this fix --
     * but it is worth pinning, because the failure it would degrade into is
     * exactly the defect: a true sentence discarded instead of queued would
     * leave the false one on the band for good.
     */
    const runtime = cellWithOneBedStandingAndOneInFlight();
    const before = runtime.events.since(0).length;
    submit(runtime, 'remove-standing', packCommand({ type: 'RemoveObject', ...STANDING_BED_TILE }));
    submit(runtime, 'remove-pending', packCommand({ type: 'RemoveObject', ...PENDING_BED_TILE }));
    const said = runtime.events.since(0).slice(before);

    let field: HudEventNoticeViewModel | undefined;
    let dwell: EventBandDwellState = EMPTY_EVENT_BAND_DWELL_STATE;

    field = nextBandField(field, publication(said[0]!));
    let decision = admitToEventBand(dwell, field, 1_000);
    dwell = decision.state;

    field = nextBandField(field, publication(said[1]!));
    decision = admitToEventBand(dwell, field, 1_000 + EVENT_BAND_DWELL_FLOOR_MS - 1);
    dwell = decision.state;
    expect(painted(decision.paint).text, 'inside the floor the incumbent keeps the line').toBe(REMOVED);
    expect(decision.wakeInMs, 'and the band asks to be woken so the waiting sentence is not lost').toBe(1);

    decision = releaseEventBandFloor(dwell, 1_000 + EVENT_BAND_DWELL_FLOOR_MS);
    expect(painted(decision.paint).text, 'and the floor hands the line to the sentence that waited').toBe(CANCELLED);
  });

  it('says the refund sentence on a cancellation with no removal before it, so the fix is not the removal being undone', () => {
    /*
     * The press on its own. Without this, both cases above would pass for a
     * change that merely *cleared* the band on the second press -- which would
     * leave the cancellation silent again, and silent is what put a false
     * sentence over it in the first place.
     */
    const runtime = cellWithOneBedStandingAndOneInFlight();
    const before = runtime.events.since(0).length;
    submit(runtime, 'remove-pending', packCommand({ type: 'RemoveObject', ...PENDING_BED_TILE }));
    const said = runtime.events.since(0).slice(before);
    expect(said.map((event) => event.type)).toEqual(['construction.order-cancelled']);

    const field = nextBandField(undefined, publication(said[0]!));
    const decision = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, field, 1_000);
    expect(painted(decision.paint).text).toBe(CANCELLED);
  });
});
