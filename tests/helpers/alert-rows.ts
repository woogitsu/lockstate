import type { HudAlertViewModel } from '../../src/ui/hud/view-model';

/**
 * The rows `hudAlertsFromWorkerMessage` answered, for a caller that knows its
 * message carries some.
 *
 * That translator became tri-state in issue #1184: a list, `'none'` for
 * `simulation/stopped` -- which takes the log off the view model rather than
 * emptying it, so "no prison is reporting" and "this prison reports nothing
 * wrong" stop being one sentence -- and `undefined` for a message that says
 * nothing about alerts. Every caller here drives a *publication*, which is
 * neither of the last two.
 *
 * It **throws** rather than coercing, and that is the point of having it: a
 * test that quietly read `[]` out of `'none'` would assert something about an
 * empty log that the code never said, which is one level up the same defect
 * #1184 is about.
 */
export function alertRows(
  result: readonly HudAlertViewModel[] | 'none' | undefined,
): readonly HudAlertViewModel[] {
  if (result === undefined) throw new Error('the message said nothing about alerts');
  if (result === 'none') throw new Error("the message was a stop, which takes the log off rather than emptying it");
  return result;
}
