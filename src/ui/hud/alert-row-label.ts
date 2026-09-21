import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { type HudLabelLocalizer, renderHudLabel } from './label-parameters';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudAlertViewModel } from './view-model';

/**
 * The whole line a row of the alerts list paints: the sentence, and what the
 * owner's decisions 1 and 2 of 2026-09-01 on
 * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)
 * add to it.
 *
 * ## Why this is a function outside the HUD's DOM code
 *
 * Because `vitest.config.ts` sets `environment: 'node'` and there is no jsdom,
 * so anything decided inside `mountHud` is unreachable from `pnpm test` -- not
 * merely untested. `docs/AGENT_WORKFLOW.md` names the answer: *"extract the
 * decision into a pure function"*, which is how `orderPrisonsForDisplay` came
 * to exist. The decisions here are which fragments a row shows and in what
 * order; `hud.ts` does the painting and decides nothing.
 *
 * ## What it shows, and when
 *
 * - **The sentence**, always, exactly as it was painted before this existed.
 * - **The count**, only above one. A row that has arrived once says so by
 *   being a row: `×1` on every line would be noise on the many to serve the
 *   few, and the count exists to answer *"did that happen three times or am I
 *   reading the same line three times?"*, which a one cannot raise.
 * - **The time**, whenever the row has one. Absent only before any session has
 *   reported a clock, in which case there is no day to name and the row says
 *   nothing about when rather than guessing.
 *
 * ## The one piece of formatting this decides
 *
 * The fragments are joined with a single space, and that is a deliberate floor
 * rather than a layout: the two keys are whole fragments, so a locale that
 * wants a separator, a bracket or a middle dot puts it inside its own
 * sentence, where a translator can move it. Both keys are unauthored -- see
 * `HUD_MESSAGE_KEY.alertsOccurrences` for why, and for what the owner is being
 * asked for.
 *
 * ## Why the first argument is a localizer and not a `t`
 *
 * Because the row's *sentence* may now inflect and the two fragments after it
 * may not. `renderHudLabel` selects a plural form when the sentence's
 * parameters carry a count -- which is what lets
 * `hud.alert.event.incidents.riot-opened` say *"1 prisoner has"* and
 * *"3 prisoners have"* from one key -- and it needs `formatPlural` to do it.
 * The occurrences multiplier and the timestamp keep calling `format`
 * deliberately: `{count}x` and `Day {day}` carry no word that agrees with a
 * number, in either shipped locale, and giving them forms would be four
 * identical strings wearing a costume.
 */
export function hudAlertRowLabel(localizer: HudLabelLocalizer, alert: HudAlertViewModel): string {
  const fragments = [renderHudLabel(localizer, alert)];
  const occurrences = alert.occurrences;
  if (occurrences !== undefined) {
    if (occurrences.count > 1)
      fragments.push(localizer.format(HUD_MESSAGE_KEY.alertsOccurrences, { count: occurrences.count }));
    const at = occurrences.lastAt;
    if (at !== undefined)
      fragments.push(localizer.format(HUD_MESSAGE_KEY.alertsTime, { day: at.day, progress: at.progressPercent }));
  }
  return fragments.join(' ');
}

/**
 * What the `×` control on a dismissable row is called.
 *
 * One line, and it exists rather than being inlined at the call site for two
 * reasons. It is the only place that decides *which key* names that control,
 * so `tests/unit/ui-hud-alert-row-label.test.ts` can assert the decision in
 * `node` where the HUD's DOM code is unreachable; and if the owner's sentence
 * turns out to want the row's own subject in it -- "dismiss the fight notice"
 * rather than "dismiss" -- this is the signature that gains the parameter, and
 * `hud.ts` does not change.
 *
 * The key is unauthored on purpose. `HUD_MESSAGE_KEY.alertsDismiss` carries the
 * brief; the suite fails by name until the word exists.
 */
export function hudAlertDismissLabel(
  t: (key: LocalizationKey, parameters?: MessageParameters) => string,
): string {
  return t(HUD_MESSAGE_KEY.alertsDismiss);
}
