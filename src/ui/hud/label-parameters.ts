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

/**
 * The localization surface a rendered label needs: a lookup, and a
 * plural-aware lookup.
 *
 * A structural port rather than `HudLocalizer` itself, for the reason
 * `hudAlertRowLabel` exists at all -- `vitest.config.ts` sets
 * `environment: 'node'`, so these decisions are asserted against a spy, and a
 * spy should not have to implement `formatNumber` to be handed to a function
 * that never calls it. `HudLocalizer` (`./view-model`) satisfies this as
 * written, which is what `hud.ts` relies on.
 */
export interface HudLabelLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
  formatPlural(key: LocalizationKey, count: number, parameters?: MessageParameters): string;
}

/** A view model that names a message key and may carry parameters for it. */
export interface HudRenderableLabelViewModel extends HudLabelParametersViewModel {
  readonly labelKey: LocalizationKey;
}

/**
 * The sentence one alerts row or one event-band notice paints.
 *
 * ## The blocker this answers
 *
 * Both call sites used to read `t(label.labelKey,
 * resolveHudLabelParameters(t, label))`, and `t` is `Localizer.format`, which
 * reads a plural entry's `other` and stops. So an alert key given
 * `one`/`few`/`many` would have carried forms that nothing on its own render
 * path ever selected between -- the third mechanical blocker on Polish plural
 * agreement, after the catalogue type (`LocalizationPluralForms`) and the HUD
 * port (`HudLocalizer.formatPlural`), and the one that kept the two counted
 * alert sentences out of the change that removed the other two.
 *
 * ## How it selects, and why on `count`
 *
 * **`count` is the selector, by name.** When the resolved parameters carry a
 * finite `number` under that name, the sentence is rendered with
 * `formatPlural`; otherwise with `format`. That convention is not invented
 * here -- it is what ICU MessageFormat, i18next and Fluent all do, it is the
 * name `Localizer.formatPlural` already injects into every template it
 * renders, and it is the name every one of this tree's counted messages
 * already uses. `docs/adr/0123-what-selects-a-plural-form-on-the-alerts-path.md`
 * records the decision and the alternatives weighed.
 *
 * **It changes nothing until a key grows forms.** A flat string is its own
 * `other` form (`Localizer.formatPlural`), so every unmigrated key renders the
 * byte-identical sentence it rendered before, with the byte-identical
 * parameters -- which is what `tests/unit/ui-simulation-events.test.ts`
 * asserts over every event type in the shipped catalogue.
 *
 * **A message-valued `count` does not select.** `resolveHudLabelParameters`
 * writes a `string` for every name in `labelParameterMessages`, and a string
 * fails the `typeof` test here, so a label whose `{count}` is itself a message
 * takes the `format` path rather than being coerced to a number. Nothing in
 * `src/` produces one; the rule is stated so the outcome is decided rather
 * than discovered.
 */
export function renderHudLabel(localizer: HudLabelLocalizer, label: HudRenderableLabelViewModel): string {
  const parameters = resolveHudLabelParameters((key, values) => localizer.format(key, values), label);
  const count = parameters?.['count'];
  if (typeof count === 'number' && Number.isFinite(count)) {
    return localizer.formatPlural(label.labelKey, count, parameters);
  }
  return localizer.format(label.labelKey, parameters);
}
