import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';

/**
 * A label parameter whose value is itself a message.
 *
 * ## Why a sentence sometimes needs one
 *
 * `MessageParameters` carries strings, numbers and booleans, and every
 * producer before this one had only figures to substitute -- a headcount, a
 * sum of money. ADR 0076's relocation notice has two parameters that are
 * neither: **`{room}`** is a room type, whose word lives in the catalog under
 * a `nameKey`, and **`{name}`** is a person, whose two halves are state but
 * whose *order* is a locale decision (`hud.regime.roster-name`, and see
 * `formatPrisonerName`). Both are text only a localizer can produce.
 *
 * The view model may not carry that text: `HudAlertViewModel.labelKey` says
 * "a message key, never text", and the reason is not ceremony -- the view
 * model outlives a repaint, so a locale switched between two repaints would
 * leave a baked parameter in the old language while the sentence around it
 * moved. So the parameter travels as a key and is resolved at render time,
 * beside the sentence it goes into.
 *
 * ## Why it is a key *and* parameters rather than a bare key
 *
 * Because one of the two needs them: a name is `t('hud.regime.roster-name',
 * { given, family })`. A shape that carried only a key would cover `{room}`
 * and force a second mechanism for `{name}`, and two mechanisms for "a
 * parameter that is a message" is how they come to disagree.
 *
 * This is the same nesting the panels already do inline -- `t(securityHeldRow,
 * { name: t(guard.roleLabelKey) })` in `staff-panel.ts`, `t(intakePipelineStage,
 * { count, stage: t(stage.labelKey) })` in `intake-panel.ts`. What is new is
 * only that the alerts list and the event band render *whatever they are
 * handed*, so the nesting has to be data rather than a call site.
 */
export interface HudMessageParameterViewModel {
  readonly key: LocalizationKey;
  readonly parameters?: MessageParameters;
}

/** The two parameter fields every rendered label may carry. */
export interface HudLabelParametersViewModel {
  readonly labelParameters?: MessageParameters;
  readonly labelParameterMessages?: Readonly<Record<string, HudMessageParameterViewModel>>;
}

/**
 * The parameters a label is rendered with, message-valued ones resolved.
 *
 * Returns `undefined` when there is nothing to substitute, so a caller that
 * passes the result straight to `t(key, parameters)` behaves exactly as it did
 * before this existed.
 *
 * **A message-valued parameter wins over a plain one of the same name**, and
 * nothing in `src/` produces both: the rule exists so the outcome is stated
 * rather than left to object-spread order, and a producer that collided would
 * be resolving one name two ways, which is a bug in the producer.
 *
 * Exported rather than kept private to `hud.ts` because it is the only thing
 * that knows how a sentence with a nested message is assembled, and three
 * callers need that answer: the events band, the alerts list, and
 * `tests/unit/ui-simulation-events.test.ts`, which resolves every event type's
 * sentence against the shipped catalog and would otherwise assemble a second,
 * drifting copy of this rule.
 */
export function resolveHudLabelParameters(
  t: (key: LocalizationKey, parameters?: MessageParameters) => string,
  label: HudLabelParametersViewModel,
): MessageParameters | undefined {
  const { labelParameters, labelParameterMessages } = label;
  if (labelParameterMessages === undefined) return labelParameters;
  const resolved: Record<string, string | number | boolean> = { ...labelParameters };
  for (const [name, message] of Object.entries(labelParameterMessages)) {
    resolved[name] = t(message.key, message.parameters);
  }
  return resolved;
}
