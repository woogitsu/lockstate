import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { hudClockFromWorkerMessage } from '../../src/ui/simulation-clock';
import { UNKNOWN_HUD_CLOCK, type HudClockViewModel } from '../../src/ui/hud/view-model';

/**
 * The main thread's clock translation, which is the whole of what the HUD
 * knows about time.
 *
 * The property that matters is that *every* field comes out of a worker
 * message. Before this existed the HUD painted `EMPTY_HUD_VIEW_MODEL`'s
 * clock forever while the simulation ran on into day four, and the obvious
 * fix -- counting ticks on this thread from `performance.now()` -- would
 * have been worse: a second clock, on the wrong side of the boundary, that
 * keeps counting through a throttled tab and through a dead worker.
 */

function clockState(
  tick: number,
  clock: { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: 1 | 2 | 4 },
  replyTo?: string,
): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `clock-${tick}`,
    ...(replyTo === undefined ? {} : { replyTo }),
    kind: 'simulation/clock-state',
    payload: { tick, clock },
  };
}

function ready(tick: number): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'ready-1',
    replyTo: 'init-1',
    kind: 'simulation/ready',
    payload: { sessionId: 'session-1', tick, clock: { mode: 'paused' } },
  };
}

const PREVIOUS: HudClockViewModel = {
  day: 1,
  tickOfDay: 0,
  dayLengthTicks: DAY_LENGTH_TICKS,
  mode: 'running',
  speed: 4,
};

describe('the HUD clock is read from the worker', () => {
  it('derives the day and the position within it from the reported tick', () => {
    // Two and a half days in.
    const tick = DAY_LENGTH_TICKS * 2 + DAY_LENGTH_TICKS / 2;
    const clock = hudClockFromWorkerMessage(clockState(tick, { mode: 'running', speed: 2 }), PREVIOUS);

    expect(clock).toEqual({
      day: 3,
      tickOfDay: DAY_LENGTH_TICKS / 2,
      dayLengthTicks: DAY_LENGTH_TICKS,
      mode: 'running',
      speed: 2,
    });
  });

  it('reads an unsolicited publication exactly as it reads an acknowledgement', () => {
    // The worker sends one with `replyTo` when the player pressed a control
    // and one without while the clock simply runs. The HUD must not care.
    const solicited = hudClockFromWorkerMessage(clockState(600, { mode: 'running', speed: 1 }, 'set-clock-1'), PREVIOUS);
    const published = hudClockFromWorkerMessage(clockState(600, { mode: 'running', speed: 1 }), PREVIOUS);

    expect(published).toEqual(solicited);
    expect(published?.tickOfDay).toBe(600);
  });

  it('starts the day count at one, so tick zero is day one', () => {
    expect(hudClockFromWorkerMessage(ready(0), PREVIOUS)?.day).toBe(1);
    expect(hudClockFromWorkerMessage(ready(DAY_LENGTH_TICKS - 1), PREVIOUS)?.day).toBe(1);
    expect(hudClockFromWorkerMessage(ready(DAY_LENGTH_TICKS), PREVIOUS)?.day).toBe(2);
  });

  it('keeps the last speed the simulation ran at while it is paused', () => {
    // A paused `ClockControl` carries no speed, because a paused clock does
    // not have one. Resetting to x1 here would silently undo the player's
    // choice every time they paused.
    const clock = hudClockFromWorkerMessage(clockState(1_200, { mode: 'paused' }), PREVIOUS);

    expect(clock?.mode).toBe('paused');
    expect(clock?.speed).toBe(4);
  });

  it('takes the running speed from the worker, never from the previous view model', () => {
    const clock = hudClockFromWorkerMessage(clockState(10, { mode: 'running', speed: 1 }), PREVIOUS);
    expect(clock?.speed).toBe(1);
  });

  it('forgets the clock when the session stops', () => {
    // What is on screen would otherwise be the last reading from a
    // simulation that no longer exists.
    const stopped: WorkerToMainMessage = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'stopped-1',
      replyTo: 'shutdown-1',
      kind: 'simulation/stopped',
      payload: { tick: 5_000, reason: 'shutdown-requested' },
    };

    expect(hudClockFromWorkerMessage(stopped, PREVIOUS)).toEqual(UNKNOWN_HUD_CLOCK);
  });

  it('says nothing about the clock for a message that is not about the clock', () => {
    // `undefined` means "no repaint", which is what keeps a snapshot reply or
    // a command result from redrawing the strip for no reason.
    const snapshotReply: WorkerToMainMessage = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'snap-1',
      replyTo: 'ask-1',
      kind: 'simulation/snapshot',
      payload: {
        tick: 4_000,
        reason: 'consistency-check',
        snapshot: { transport: 'structured-clone', schemaId: 'simulation-save-payload', schemaVersion: 3, data: null },
      },
    };

    expect(hudClockFromWorkerMessage(snapshotReply, PREVIOUS)).toBeUndefined();
  });
});
