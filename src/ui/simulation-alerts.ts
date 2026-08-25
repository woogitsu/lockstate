import type { LocalizationKey } from '../content/localization';
import type { RefusalReason, WorkerToMainMessage } from '../simulation/protocol/types';
import type { HudAlertViewModel } from './hud/view-model';

/**
 * What the player is told about each refusal the simulation can report.
 *
 * ADR 0011's three namespaces, kept apart at exactly this line: the
 * simulation sends a stable id, this table turns it into a *message key*, and
 * the HUD resolves the key to text at render time. No sentence ever crosses
 * the worker boundary and no translated string ever travels back toward the
 * simulation.
 *
 * The keys are HUD-namespaced (`hud.alert.refusal.*`) and authored, rather
 * than derived through `src/content/simulation-message-keys.ts` the way every
 * other projected simulation enum's key is. That module labels an id a panel
 * renders **as a label** -- a cell reading "Awaiting Materials", a badge
 * reading "High Risk" -- and it says so: "short, neutral, HUD-appropriate:
 * these are dense panel labels, not prose". A refusal is not a label. It is a
 * sentence saying what did not happen and why, and a derived
 * `refusal-reason.build.unowned-land.name` reading "Unowned Land" would have
 * nowhere to be rendered. `tests/unit/simulation-message-keys.test.ts` carries
 * the exemption and this reason with it.
 *
 * A `Record` over the closed `RefusalReason` union, so a reason added to the
 * protocol fails to compile here until it has something to say.
 * `tests/unit/ui-simulation-alerts.test.ts` resolves every one of these
 * against the bundled default catalog, which is what stops a key from
 * shipping as its own raw dotted text --
 * `tests/foundation/localization-key-completeness.test.ts` cannot: it scans
 * for `labelKey: '...'` literals, and these are `Record` values.
 */
const REFUSAL_LABEL_KEYS: Readonly<Record<RefusalReason, LocalizationKey>> = {
  'admit.no-accommodation': 'hud.alert.refusal.admit.no-accommodation',
  'admit.population-full': 'hud.alert.refusal.admit.population-full',
  'build.out-of-bounds': 'hud.alert.refusal.build.out-of-bounds',
  'build.unbuildable': 'hud.alert.refusal.build.unbuildable',
  'build.unbuildable-terrain': 'hud.alert.refusal.build.unbuildable-terrain',
  'build.unowned-land': 'hud.alert.refusal.build.unowned-land',
  'build.water-blocked': 'hud.alert.refusal.build.water-blocked',
  'purchase.duplicate-order': 'hud.alert.refusal.purchase.duplicate-order',
  'purchase.insufficient-funds': 'hud.alert.refusal.purchase.insufficient-funds',
  'purchase.invalid-quantity': 'hud.alert.refusal.purchase.invalid-quantity',
  'purchase.unknown-material': 'hud.alert.refusal.purchase.unknown-material',
  'zone.duplicate-instance-id': 'hud.alert.refusal.zone.duplicate-instance-id',
  'zone.invalid-area': 'hud.alert.refusal.zone.invalid-area',
  'zone.out-of-bounds': 'hud.alert.refusal.zone.out-of-bounds',
  'zone.overlaps-existing-room': 'hud.alert.refusal.zone.overlaps-existing-room',
  'zone.unknown-room-type': 'hud.alert.refusal.zone.unknown-room-type',
  'zone.unowned-land': 'hud.alert.refusal.zone.unowned-land',
};

/**
 * Turns what the worker said it refused into the rows the HUD's alerts list
 * paints.
 *
 * The third of the translators outside `src/ui/hud/` -- beside
 * `hudClockFromWorkerMessage` and `hudCountsFromWorkerMessage` -- and it
 * lives here for the same reason they do: the HUD is a view over plain data
 * and may not import `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so the module that has to know both
 * a protocol message and a view model sits outside it. Pure, so proving it
 * needs neither a worker nor a DOM.
 *
 * `HudViewModel.alerts` had **no producer** before this. The list, the
 * severity badges, the folding section, the empty-state row and the insertion
 * ordering #209 measured in a real browser were all implemented; `src/main.ts`
 * wrote only `clock` and `counts` into the view model, and between #220 --
 * which moved the one message ever routed there, "simulation unavailable", to
 * `.hud__unavailable` -- and #261 the only assignment to the field anywhere in
 * `src/` was the literal `[]` in `EMPTY_HUD_VIEW_MODEL`.
 *
 * ## Why a list of at most one
 *
 * The channel is a snapshot on a cadence and carries the *last* refusal, so
 * there is exactly one row to paint or none -- see `RefusalLog` for why a
 * queue could not be carried honestly here. The return type is still a list
 * because `HudViewModel.alerts` is one and the HUD orders what it is given;
 * a second producer of alerts merges into this list rather than replacing it.
 *
 * ## Why it stays up
 *
 * Nothing clears the row: "the last refusal was X" stays true until another
 * refusal replaces it or the session ends. This channel has no way to say
 * "dismissed" -- that would be a main-to-worker message and a piece of
 * simulation state to hold it, which is a decision rather than a detail, so
 * it is recorded in `docs/HUD_PROJECTIONS.md` instead of guessed at here.
 *
 * `severity` is `'warning'` for every reason, and uniformly rather than
 * arbitrarily: each of these says the same thing -- the player asked for
 * something and the prison is not doing it -- and grading one refusal above
 * another would be a balance judgement this layer has no basis for, exactly
 * as `docs/HUD_PROJECTIONS.md` contract 4 refuses to band a need bar.
 *
 * Note that `build.out-of-bounds` and `zone.out-of-bounds` are separate
 * entries with separate sentences, and that is the point of the namespace:
 * the same condition refuses a wall and a room, and a player reading "the
 * build order failed" after zoning a canteen would go and look at the wrong
 * control.
 */
export function hudAlertsFromWorkerMessage(
  message: WorkerToMainMessage,
): readonly HudAlertViewModel[] | undefined {
  switch (message.kind) {
    case 'simulation/status-counts': {
      const { refusal } = message.payload;
      if (refusal === undefined) return [];
      return [
        {
          // The refusal's own ordinal, so a readout that repeats an
          // unchanged refusal beside a changed count updates the row the
          // player is looking at instead of rebuilding it -- which is what
          // `HudAlertViewModel.id` exists for -- while a *new* refusal is a
          // new row rather than the old one silently rewritten.
          id: `refusal-${refusal.sequence}`,
          labelKey: REFUSAL_LABEL_KEYS[refusal.reason],
          severity: 'warning',
        },
      ];
    }

    // The session is over. A refusal by a simulation that no longer exists is
    // not something the player can act on, so the list empties -- the same
    // thing the counts do with `EMPTY_HUD_VIEW_MODEL.counts` and the clock
    // does with `UNKNOWN_HUD_CLOCK`.
    case 'simulation/stopped':
      return [];

    default:
      return undefined;
  }
}
