import { projectClockPosition } from '../simulation/presentation/clock-projection';
import type { WorkerToMainMessage } from '../simulation/protocol/types';
import { UNKNOWN_HUD_CLOCK, type HudClockViewModel } from './hud/view-model';

/**
 * Turns what the worker said about its clock into what the HUD paints.
 *
 * This is the translation half of `AGENTS.md` boundary 3 -- the main thread
 * orchestrates, and owns no simulation state. Every value it returns comes
 * out of a protocol message the worker sent; nothing is extrapolated from
 * `performance.now()`, nothing is counted up locally between messages, and
 * there is no timer here at all. A HUD clock that ticked on this thread
 * would keep counting through a throttled tab, through a paused simulation
 * it had not heard about yet, and through a worker that had died.
 *
 * It lives outside `src/ui/hud/` on purpose. The HUD is a view over plain
 * data and may not import `src/simulation/**` (boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`); this module is the composition
 * root's helper, so it is allowed to know both sides -- and it is a pure
 * function, so proving it needs neither a worker nor a DOM.
 */
export function hudClockFromWorkerMessage(
  message: WorkerToMainMessage,
  previous: HudClockViewModel,
): HudClockViewModel | undefined {
  switch (message.kind) {
    // `ready` and `clock-state` carry the same two facts -- where the tick
    // is and what the clock is doing -- so they are read identically. A
    // `clock-state` may be the acknowledgement of a transport control or the
    // worker publishing that time has passed; which one it was changes
    // nothing about what the HUD should show.
    case 'simulation/ready':
    case 'simulation/clock-state': {
      const { clock, tick } = message.payload;
      const position = projectClockPosition(tick);
      return {
        day: position.dayNumber,
        tickOfDay: position.tickOfDay,
        dayLengthTicks: position.dayLengthTicks,
        mode: clock.mode,
        // A paused `ClockControl` carries no speed, because a paused clock
        // does not have one. The last speed the simulation actually ran at
        // is kept so the fast-forward control knows where a further tap
        // goes and pausing does not silently reset the player's choice.
        speed: clock.mode === 'running' ? clock.speed : previous.speed,
      };
    }

    // The session is over. Anything still on screen would be the last
    // reading from a simulation that no longer exists, so the clock goes
    // back to saying it does not know.
    case 'simulation/stopped':
      return UNKNOWN_HUD_CLOCK;

    default:
      return undefined;
  }
}
