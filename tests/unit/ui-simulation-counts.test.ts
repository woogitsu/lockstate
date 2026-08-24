import { describe, expect, it } from 'vitest';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { EMPTY_HUD_VIEW_MODEL } from '../../src/ui/hud/view-model';
import { hudCountsFromWorkerMessage } from '../../src/ui/simulation-counts';

/**
 * The main thread's counts translation: the whole of what the HUD strip
 * knows about how big the prison is.
 *
 * The property that matters is that every figure comes out of a worker
 * message. Before this existed the strip's five metrics were the literal
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
  roomOccupants: 31,
  activeIncidents: 1,
  contrabandDiscovered: 5,
} as const;

function statusCounts(counts: Record<string, number> = { ...COUNTS }): WorkerToMainMessage {
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
      // Unknown, deliberately -- see below.
      prisonerCapacity: 0,
      staff: 11,
      rooms: 9,
      activeIncidents: 1,
      // The publication names this `contrabandDiscovered`, because that is
      // what the search system counts; the HUD field is `contrabandFound`.
      contrabandFound: 5,
    });
  });

  it('leaves the occupancy denominator unknown rather than reusing total room capacity', () => {
    // `roomCapacity` is every registered room instance's capacity summed --
    // canteens, yards and shower rooms included -- while the HUD field it
    // would land in is documented as total *cell* capacity and drives an
    // over-capacity warning. A prison with a 40-seat canteen is not a prison
    // with 40 beds, and `prisonerCapacity: 0` makes the HUD omit the
    // occupancy bar instead of drawing a wrong one.
    const counts = hudCountsFromWorkerMessage(statusCounts({ ...COUNTS, roomCapacity: 500 }));

    expect(counts?.prisonerCapacity).toBe(0);
  });

  it('reports zero counts as zero, so an empty prison is not mistaken for an unknown one', () => {
    // A new session genuinely has nothing in it. This is the case that makes
    // the channel's value hard to see on screen today (issue #104's
    // sequencing note) and it must still be reported rather than skipped.
    const empty = Object.fromEntries(Object.keys(COUNTS).map((key) => [key, 0]));

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

  it('carries integers only, so a bounded value cannot reach the HUD unnoticed', () => {
    // The status-strip projection also computes `BoundedValue`s
    // (`clock.dayProgress`, `regime[].blockProgress`); this channel drops
    // them. It used to be the thing keeping issue #123 item 1 from being
    // decided by accident -- the projection's fill and the HUD primitive's
    // disagreed for every small-but-nonzero value -- and that is now one rule
    // pinned by `tests/unit/segment-fill-agreement.test.ts`. What this still
    // asserts is the narrower and durable fact: the payload is flat integers,
    // so widening it to carry a structured value is a visible change to this
    // test rather than a field that quietly appears.
    const counts = hudCountsFromWorkerMessage(statusCounts());

    expect(counts).toBeDefined();
    for (const value of Object.values(counts ?? {})) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
