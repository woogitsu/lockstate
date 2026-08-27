import type { WorkerToMainMessage } from '../simulation/protocol/types';
import type { HudZoningNoticeViewModel } from './hud/view-model';

/**
 * Turns what the worker said about the last room the player designated into
 * what the Rooms panel reads out.
 *
 * The fourth of the translators outside `src/ui/hud/` -- beside
 * `hudClockFromWorkerMessage`, `hudCountsFromWorkerMessage` and
 * `hudAlertsFromWorkerMessage` -- and it lives here for the same reason they
 * do: the HUD may not import `src/simulation/**` (`AGENTS.md` boundary 1,
 * enforced by `tests/unit/ui-hud-messages.test.ts`), so the module that has to
 * know both a protocol message and a view model sits outside it. Pure, so
 * proving it needs neither a worker nor a DOM.
 *
 * ## Why this is a readout and not an alert
 *
 * It would have been less code to route the enclosure answer through
 * `hudAlertsFromWorkerMessage` as a fifth kind of warning row, and it would
 * have been wrong. The alerts list carries **refusals**: things the player
 * asked for that the prison declined to do. An accepted designation of an
 * open-sided cell is not a refusal -- the room exists, it is painted on the
 * map and it is in the `Rooms` count -- it is a *fact about* the room the
 * player just made, and it belongs beside the control that made it.
 *
 * That distinction is not cosmetic: the alerts section starts folded
 * (`INITIAL_HUD_SHELL_STATE`), so a warning routed there after a designation
 * would be in the DOM and painted at no viewport, which is exactly the defect
 * #220 moved "simulation unavailable" out of the alerts list to fix.
 *
 * ## Three fields out of four, and no room id
 *
 * The notice carries two enums and two integers and no room id at all, so this
 * function invents nothing and looks nothing up. `requirement` says what the
 * room definition asked for and `enclosure` says what the world answered, which
 * is enough for the panel to render the one combination worth flagging --
 * `'enclosed'` asked for, `'open'` found -- without having to remember which
 * room type the player had selected when they released the pointer. `tick` is
 * dropped here rather than carried: the panel has nowhere to show a tick, and
 * `sequence` is what tells a republished notice from a new one.
 */
export function hudZoningFromWorkerMessage(
  message: WorkerToMainMessage,
): HudZoningNoticeViewModel | 'none' | undefined {
  switch (message.kind) {
    case 'simulation/status-counts': {
      const { zoning } = message.payload;
      // `'none'` rather than `undefined`, because the two mean different
      // things to the caller: `undefined` is "this message says nothing about
      // zoning, leave the view model alone", and `'none'` is "this message
      // does say, and the answer is that no room has been designated". A
      // single `undefined` would make a session that has designated nothing
      // indistinguishable from a `simulation/delta`, and the panel would keep
      // reading out a notice from a session that had ended.
      if (zoning === undefined) return 'none';
      return {
        sequence: zoning.sequence,
        enclosure: zoning.enclosure,
        requirement: zoning.requirement,
      };
    }

    // The session is over. A statement about the last room designated by a
    // simulation that no longer exists is not something the player can act on,
    // so the readout empties -- the same thing the counts do with
    // `EMPTY_HUD_VIEW_MODEL.counts` and the clock does with `UNKNOWN_HUD_CLOCK`.
    case 'simulation/stopped':
      return 'none';

    default:
      return undefined;
  }
}
