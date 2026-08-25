import { describe, expect, it } from 'vitest';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { hudZoningFromWorkerMessage } from '../../src/ui/simulation-zoning';

/**
 * What the Rooms panel is told about the last room the player designated.
 *
 * The route the enclosure answer needed and did not have.
 * `RoomZoningService.zone` evaluates the room definition's
 * `enclosed`/`outdoors` requirement and *accepts the room either way* -- see
 * `src/simulation/rooms/enclosure.ts` for why refusing would be dishonest --
 * so the answer has to reach the player some other way, and a command reply is
 * not one: the worker has already answered `status: 'queued'`, which ADR 0003
 * decision 9 says is receipt and not effect.
 *
 * Pure, so proving it needs neither a worker nor a DOM.
 */

const EMPTY_COUNTS = {
  prisoners: 0,
  staff: 0,
  rooms: 0,
  roomCapacity: 0,
  activeIncidents: 0,
  contrabandDiscovered: 0,
  treasuryMinorUnits: 0,
  jobsQueued: 0,
  jobsInProgress: 0,
  buildOrdersPending: 0,
  buildOrdersInProgress: 0,
} as const;

type StatusCountsPayload = Extract<WorkerToMainMessage, { kind: 'simulation/status-counts' }>['payload'];

function statusCounts(payload: Partial<StatusCountsPayload> = {}): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'message-1',
    kind: 'simulation/status-counts',
    payload: {
      tick: 12,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: EMPTY_COUNTS,
      ...payload,
    },
  } as WorkerToMainMessage;
}

describe('the zoning notice reaches the view model unchanged', () => {
  it('carries the sequence, the answer and the requirement, and drops the tick', () => {
    // Three fields, and no room id: the notice is self-describing, so the panel
    // does not have to remember which room type was selected when the player
    // released the pointer. The tick is dropped because the panel has nowhere
    // to show one, and `sequence` is what tells a republished notice from a new
    // one.
    const view = hudZoningFromWorkerMessage(
      statusCounts({ zoning: { sequence: 3, tick: 40, enclosure: 'open', requirement: 'enclosed' } }),
    );

    expect(view).toEqual({ sequence: 3, enclosure: 'open', requirement: 'enclosed' });
  });

  it('passes an outdoors room through without judging it', () => {
    // `room.yard` is authored `outdoors` and is *correct* when it is open, so
    // nothing here may treat `'open'` as the bad answer. Which pair deserves a
    // warning is the panel's decision, and it is about the pair rather than
    // about either member.
    expect(
      hudZoningFromWorkerMessage(
        statusCounts({ zoning: { sequence: 1, tick: 0, enclosure: 'open', requirement: 'outdoors' } }),
      ),
    ).toEqual({ sequence: 1, enclosure: 'open', requirement: 'outdoors' });
  });

  it("answers 'none' for a session that has designated nothing, not undefined", () => {
    // Three states, not two, and this is the one that is easy to collapse.
    // `undefined` means "this message said nothing about zoning, leave the view
    // model alone"; `'none'` means "this message did say, and the answer is
    // that no room has been designated". Collapsing them would make a session
    // that has zoned nothing indistinguishable from a `simulation/delta`, and a
    // readout from an ended session would stay on screen.
    expect(hudZoningFromWorkerMessage(statusCounts())).toBe('none');
  });

  it("empties on 'simulation/stopped', because a statement about a dead session is not actionable", () => {
    expect(
      hudZoningFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'message-2',
        replyTo: 'request-1',
        kind: 'simulation/stopped',
        payload: { tick: 12, reason: 'shutdown-requested' },
      } as WorkerToMainMessage),
    ).toBe('none');
  });

  it('says nothing at all about a message that is not about zoning', () => {
    expect(
      hudZoningFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'message-3',
        kind: 'simulation/clock-state',
        payload: { tick: 1, clock: { mode: 'paused' } },
      } as WorkerToMainMessage),
    ).toBeUndefined();
  });
});
