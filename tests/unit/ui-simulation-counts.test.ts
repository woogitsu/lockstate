import { describe, expect, it } from 'vitest';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { EMPTY_HUD_VIEW_MODEL } from '../../src/ui/hud/view-model';
import { hudCountsFromWorkerMessage } from '../../src/ui/simulation-counts';

/**
 * The main thread's counts translation: the whole of what the HUD strip
 * knows about how big the prison is.
 *
 * The property that matters is that every figure comes out of a worker
 * message. Before this existed the strip's metrics were the literal
 * zeros of `EMPTY_HUD_VIEW_MODEL` for the entire session, and the read-model
 * layer that computes them (`src/simulation/presentation/`) had no route to
 * the interface at all (issue #104).
 */

const COUNTS = {
  prisoners: 42,
  prisonersInIntake: 3,
  prisonersHighRisk: 7,
  staff: 11,
  staffUnassigned: 2,
  rooms: 9,
  roomCapacity: 60,
  // Deliberately smaller than `roomCapacity`, and deliberately not a round
  // fraction of it: the two are different sums over the same registry, and a
  // mapping that reached for the wrong one would still look plausible. Read as
  // a prison whose nine rooms hold 60 sleep surfaces between them, 44 of which
  // stand in rooms intake will house somebody in.
  accommodationCapacity: 44,
  roomOccupants: 31,
  activeIncidents: 1,
  // Agrees with `activeIncidents: 1` above -- one incident open, one kind to
  // name (issue #506 finding 2). `'riot'` rather than a lower-severity type on
  // no particular grounds beyond needing one real `IncidentType` member.
  activeIncidentType: 'riot',
  contrabandDiscovered: 5,
  treasuryMinorUnits: 24_920,
  // Deliberately a different figure from the balance beside it, and not a
  // round fraction of it (#29): two count fields in the same minor units are
  // exactly where an adapter that read the wrong one would still look
  // plausible.
  stateIncomeAccruedTodayMinorUnits: 9_300,
} as const;

function statusCounts(counts: Record<string, number | string | undefined> = { ...COUNTS }): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-1',
    kind: 'simulation/status-counts',
    payload: { tick: 1_234, schemaVersion: 1, counts },
  } as WorkerToMainMessage;
}

describe('the HUD counts are read from the worker', () => {
  it('maps every metric the strip renders onto the count the simulation published', () => {
    expect(hudCountsFromWorkerMessage(statusCounts())).toEqual({
      prisoners: 42,
      // The accommodation capacity, not the room capacity beside it -- see
      // the case below for which is which and why it took a new field.
      prisonerCapacity: 44,
      staff: 11,
      rooms: 9,
      activeIncidents: 1,
      // Derived, not read straight through: `deriveSimulationMessageKey`
      // composed from the worker's stable `'riot'` id (issue #506 finding 2).
      activeIncidentTypeLabelKey: 'incident-type.riot.name',
      // The publication names this `contrabandDiscovered`, because that is
      // what the search system counts; the HUD field is `contrabandFound`.
      contrabandFound: 5,
      // Straight through, in minor units, and that is the whole mapping:
      // the strip formats it for display and nothing upstream of the
      // formatter knows what a major unit is (#96). A conversion here would
      // put a currency decision in a message adapter.
      treasuryMinorUnits: 24_920,
      // Straight through as well, and for the stronger reason: the HUD may
      // not derive this figure. It is `300 x occupied places x ticks served
      // / day length`, and a main thread that recomputed it from a tick it
      // happens to hold would be a second authority on what the prison has
      // earned (#29).
      stateIncomeAccruedTodayMinorUnits: 9_300,
    });
  });

  it('takes the occupancy denominator from the accommodation capacity, never from total room capacity', () => {
    /*
     * ## What this case used to assert, and why it was wrong when it was
     * written
     *
     * It was `leaves the occupancy denominator unknown rather than reusing
     * total room capacity`, it asserted `prisonerCapacity` was `0`, and it
     * justified that with:
     *
     * > "`roomCapacity` is every registered room instance's capacity summed --
     * > canteens, yards and shower rooms included -- while the HUD field it
     * > would land in is documented as total *cell* capacity and drives an
     * > over-capacity warning. A prison with a 40-seat canteen is not a prison
     * > with 40 beds, and `prisonerCapacity: 0` makes the HUD omit the
     * > occupancy bar instead of drawing a wrong one."
     *
     * **Both directions, because they point opposite ways.**
     *
     * The *reason* was false on the day it was written, not made false by this
     * change. `deriveRoomCapacity` (`src/simulation/objects/room-capacity.ts`)
     * adds an object's footprint width to `residentCapacity` only when its
     * catalogue capabilities include `'sleep-surface'`, and
     * `object.dining-table`, `object.bench` and `object.shower-head` declare
     * none of it -- so a 40-seat canteen contributed exactly 0 to
     * `roomCapacity`, and always had. It was measured all along and nobody
     * read it: `tests/unit/worker-status-counts.test.ts` asserts
     * `roomCapacity: 4` for a published scenario of six rooms whose yard holds
     * a bench and whose canteen holds a dining table -- four beds, four
     * places, the furniture contributing nothing -- while this comment three
     * files away said that furniture was the reason the field could not be
     * mapped.
     *
     * The *conclusion* was right, for the reason the comment's own last
     * sentence named and then did not follow: "the simulation has no cell-only
     * capacity total to send yet". Two catalogue objects carry
     * `'sleep-surface'` -- `object.bed` and `object.medical-bed` -- so
     * `roomCapacity` counts a furnished infirmary's beds, and
     * `src/simulation/construction/definition.ts` says so outright beside the
     * buildable `medical-bed-wooden` row: an infirmary "derives a residency it
     * has no intake route to use". Mapping `roomCapacity` through would have
     * overstated the denominator by every medical bed a player had built.
     *
     * ## What resolves it
     *
     * A thirteenth published count, `accommodationCapacity`, computed in the
     * projection over the room types the session's `AccommodationPolicy`
     * names. The HUD reads it and derives nothing.
     */
    const counts = hudCountsFromWorkerMessage(
      statusCounts({ ...COUNTS, roomCapacity: 500, accommodationCapacity: 44 }),
    );

    expect(counts?.prisonerCapacity).toBe(44);
  });

  it('reports zero counts as zero, so an empty prison is not mistaken for an unknown one', () => {
    // A new session genuinely has nothing in it. This is the case that makes
    // the channel's value hard to see on screen today (issue #104's
    // sequencing note) and it must still be reported rather than skipped.
    //
    // `activeIncidentType` is the one key this blanket zero-fill cannot cover
    // sensibly: `0` is not a member of `IncidentType`, and "nothing open" is
    // `undefined`, not a numeric zero (issue #506 finding 2).
    const empty = {
      ...Object.fromEntries(Object.keys(COUNTS).map((key) => [key, 0])),
      activeIncidentType: undefined,
    };

    expect(hudCountsFromWorkerMessage(statusCounts(empty))).toEqual(EMPTY_HUD_VIEW_MODEL.counts);
  });

  it('forgets the counts when the session stops', () => {
    // What is on screen would otherwise be the last reading from a
    // simulation that no longer exists -- the same thing the clock does with
    // `UNKNOWN_HUD_CLOCK`.
    const stopped: WorkerToMainMessage = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'stopped-1',
      replyTo: 'shutdown-1',
      kind: 'simulation/stopped',
      payload: { tick: 5_000, reason: 'shutdown-requested' },
    };

    expect(hudCountsFromWorkerMessage(stopped)).toEqual(EMPTY_HUD_VIEW_MODEL.counts);
  });

  it('says nothing about the counts for a message that is not about the counts', () => {
    // `undefined` means "no repaint": a clock publication, a snapshot reply
    // or a command result must not redraw the metrics.
    const clock: WorkerToMainMessage = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'clock-1',
      kind: 'simulation/clock-state',
      payload: { tick: 600, clock: { mode: 'running', speed: 2 } },
    };

    expect(hudCountsFromWorkerMessage(clock)).toBeUndefined();
  });

  it('carries integers only, aside from the one labelled exception, so a bounded value cannot reach the HUD unnoticed', () => {
    // The status-strip projection also computes `BoundedValue`s
    // (`clock.dayProgress`, `regime[].blockProgress`); this channel drops
    // them. It used to be the thing keeping issue #123 item 1 from being
    // decided by accident -- the projection's fill and the HUD primitive's
    // disagreed for every small-but-nonzero value -- and that is now one rule
    // pinned by `tests/unit/segment-fill-agreement.test.ts`. What this still
    // asserts is the narrower and durable fact: the payload is flat scalars,
    // so widening it to carry a structured value (an object or an array) is a
    // visible change to this test rather than a field that quietly appears.
    //
    // **This used to say "carries integers only" with no exception, full
    // stop.** `activeIncidentTypeLabelKey` (issue #506 finding 2) is a message
    // key -- a string, or `undefined` when nothing names a single kind -- and
    // it is named explicitly below rather than silently exempted, so a
    // second non-integer field arriving later still fails this test until it
    // is named here too.
    const counts = hudCountsFromWorkerMessage(statusCounts());

    expect(counts).toBeDefined();
    for (const [key, value] of Object.entries(counts ?? {})) {
      if (key === 'activeIncidentTypeLabelKey') {
        expect(typeof value === 'string' || value === undefined, `counts.${key} is not a string or undefined`).toBe(
          true,
        );
        continue;
      }
      expect(Number.isInteger(value), `counts.${key} is not an integer`).toBe(true);
    }
  });
});
