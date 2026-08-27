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
         * Straight through, and for the same reason
         * `stateIncomeAccruedTodayMinorUnits` below is: the HUD may not derive
         * a simulation figure. `accommodationCapacity` is the summed
         * `residentCapacity` of the rooms `IntakeSystem` would house an
         * arrival in, computed in the projection
         * (`src/simulation/presentation/status-strip-projection.ts`).
         *
         * **This read `prisonerCapacity: 0` until the field existed**, which
         * switched off the strip's only overcrowding signal: `occupancyTone`
         * (`src/ui/hud/projection.ts`) returns `undefined` for a capacity
         * `<= 0`, so the `> 1` danger badge and the `>= 0.9` warning could not
         * fire in any session, and the occupancy bar was omitted entirely.
         * ADR 0048 made overcrowding the thing a prison riots over, so the
         * cause was on screen and the warning was not.
         *
         * The comment that stood here gave a **false** reason for a correct
         * refusal: it said `roomCapacity` includes "canteens, yards and shower
         * rooms", and it does not -- `deriveRoomCapacity` credits
         * `residentCapacity` only for an object declaring `'sleep-surface'`,
         * and a bench, a dining table and a shower head declare none, so a
         * 40-seat canteen adds 0. Its last sentence named the real one: two
         * objects carry that capability, `object.bed` and
         * `object.medical-bed`, so `roomCapacity` counts an infirmary's beds
         * while intake will never house anybody in one. That is the gap the
         * new field closes, and it is why this is not simply
         * `counts.roomCapacity`.
         */
        prisonerCapacity: counts.accommodationCapacity,
        staff: counts.staff,
        rooms: counts.rooms,
        activeIncidents: counts.activeIncidents,
        contrabandFound: counts.contrabandDiscovered,
        treasuryMinorUnits: counts.treasuryMinorUnits,
        stateIncomeAccruedTodayMinorUnits: counts.stateIncomeAccruedTodayMinorUnits,
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
