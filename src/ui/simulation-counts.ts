import type { WorkerToMainMessage } from '../simulation/protocol/types';
import { EMPTY_HUD_VIEW_MODEL, type HudCountsViewModel } from './hud/view-model';

/**
 * Turns what the worker said about its population into what the HUD paints.
 *
 * The counterpart of `hudClockFromWorkerMessage` (`./simulation-clock.ts`),
 * and it lives beside it for the same reason: the HUD is a view over plain
 * data and may not import `src/simulation/**` (`AGENTS.md` boundary 1,
 * enforced by `tests/unit/ui-hud-messages.test.ts`), so the module that has
 * to know both a protocol message and a view model sits outside
 * `src/ui/hud/`. It is a pure function, so proving it needs neither a worker
 * nor a DOM.
 *
 * Every value it returns comes out of a `simulation/status-counts`
 * publication the worker sent. Nothing is derived, extrapolated or
 * remembered between messages: before this existed the HUD's counts were the
 * literal zeros of `EMPTY_HUD_VIEW_MODEL` for the whole session, however
 * many prisoners the simulation held (issue #104).
 */
export function hudCountsFromWorkerMessage(message: WorkerToMainMessage): HudCountsViewModel | undefined {
  switch (message.kind) {
    case 'simulation/status-counts': {
      const { counts } = message.payload;
      return {
        prisoners: counts.prisoners,
        /**
         * Left unknown on purpose, which the HUD renders as *no occupancy
         * bar* rather than as "capacity zero".
         *
         * The publication does carry a `roomCapacity`, and it is not this:
         * it is the summed capacity of every registered room instance --
         * canteens, yards and shower rooms included -- while this field is
         * documented as total *cell* capacity and drives an
         * over-capacity warning. Mapping one onto the other would put a
         * plausible, wrong denominator on screen; the simulation has no
         * cell-only capacity total to send yet.
         */
        prisonerCapacity: 0,
        staff: counts.staff,
        rooms: counts.rooms,
        activeIncidents: counts.activeIncidents,
        contrabandFound: counts.contrabandDiscovered,
      };
    }

    // The session is over. Anything still on screen would be the last
    // reading from a simulation that no longer exists, so the counts go back
    // to the empty prison -- the same thing the clock does with
    // `UNKNOWN_HUD_CLOCK`.
    case 'simulation/stopped':
      return EMPTY_HUD_VIEW_MODEL.counts;

    default:
      return undefined;
  }
}
