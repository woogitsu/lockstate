import type { PrisonCondition } from '../simulation/protocol/types';

/**
 * Where each standing `PrisonCondition` is painted, and the compile
 * obligation that keeps a sixth one from shipping unpainted.
 *
 * ## Why this table exists at all
 *
 * `statusCountsSchema.conditions` has carried a closed union of standing
 * facts since [ADR 0087](../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
 * decision 2, and **nothing under `src/ui/` read the field** -- measured again
 * on 2026-09-17 while building this module (`grep -rn 'conditions' src/ui/
 * src/rendering/` returns six hits, every one of them a comment or an
 * unrelated identifier). `tests/unit/simulation-message-keys.test.ts` carries
 * that as a recorded exemption with issue #930's own recommendation not to
 * build a reader, because all four members were already painted somewhere
 * else, each with a figure `conditions` could never carry.
 *
 * [ADR 0117](../../docs/adr/0117-what-happens-when-a-guards-post-is-walled-in.md),
 * accepted by the owner on 2026-09-17, adds the member that is **not** painted
 * anywhere else: `'security.post-unreachable'`. So this module is the reader
 * #930 declined to build, scoped to the one member that needs it, and the
 * four-way `'painted-elsewhere'` column is #930's finding written down where
 * the compiler can hold it rather than in a test's prose.
 *
 * ## The obligation
 *
 * An exhaustive `Record` over `PrisonCondition`, exactly as
 * `REFUSAL_LABEL_KEYS` and `PROTOCOL_FAULT_LABEL_KEYS` in
 * `./simulation-alerts.ts` are over their own unions: a sixth member added to
 * the protocol **fails to compile here** until somebody decides whether the
 * player is told about it and where. That is the price ADR 0117 §3 itemises
 * as *"the `AWAITING_PRODUCER`-style compile obligation ... which is the good
 * kind of cost"*, and it is the whole of what this table buys.
 *
 * `'painted-elsewhere'` is a claim about other code and therefore rots; each
 * row names the surface that makes it true, so a reader can check it rather
 * than trust it.
 */
export type PrisonConditionPresentation =
  /**
   * The always-visible status strip's `COVERAGE` chip carries this one --
   * `projectStatusMetrics` in `./hud/projection.ts`, through
   * `HudCountsViewModel.postUnreachable`.
   */
  | 'coverage-chip'
  /**
   * Already on screen in its own words, with a figure this union could never
   * carry (issue #930's re-measurement of 2026-09-15, re-read 2026-09-17):
   * `construction.unfunded` is the Build panel's `queueShortfall` row,
   * `intake.no-place` is the Intake panel's *"{count} waiting with no bed to
   * sleep in"*, and both `treasury.*-refused` members are the FUNDS chip's
   * `overdraftRemaining` badge and its tooltip sentence. A second, standing
   * rendering of a fact already painted is what #930 recommends against, and
   * this value is that recommendation held by the compiler.
   */
  | 'painted-elsewhere';

const PRISON_CONDITION_PRESENTATION: Readonly<Record<PrisonCondition, PrisonConditionPresentation>> = {
  'construction.unfunded': 'painted-elsewhere',
  'intake.no-place': 'painted-elsewhere',
  'security.post-unreachable': 'coverage-chip',
  'treasury.construction-refused': 'painted-elsewhere',
  'treasury.deliveries-refused': 'painted-elsewhere',
};

/**
 * Whether the published condition set says a sector's post cannot be reached
 * (ADR 0117, accepted 2026-09-17).
 *
 * **Read through the table rather than compared to a literal**, so the one
 * member this module paints cannot drift from the one it declares a
 * presentation for: a rename of the id moves both together or neither
 * compiles.
 *
 * `undefined` -- the field is `.optional()` on the wire -- answers `false`,
 * which is what a publication that named no condition genuinely says.
 */
export function isPostUnreachable(conditions: readonly PrisonCondition[] | undefined): boolean {
  if (conditions === undefined) return false;
  return conditions.some((condition) => PRISON_CONDITION_PRESENTATION[condition] === 'coverage-chip');
}
