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
 * **That measurement is history as of the commit that created this file, and
 * it is corrected here rather than deleted** (`docs/AGENT_WORKFLOW.md` §4:
 * mark both directions). Re-measured 2026-09-19 on `main` at v0.0.695, the
 * same grep returns a *code* hit: `isPostUnreachable(counts.conditions)` at
 * `src/ui/simulation-counts.ts:152`, which is this module's only caller. The
 * paragraph above describes the tree this module was written into, not the
 * one it now sits in, and issue #930's remaining half -- *"paint it or delete
 * it"* -- is answered by that line plus the table below.
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
  | 'painted-elsewhere'
  /**
   * The `COVERAGE` chip carries this one too, under a word and a sentence of
   * its own -- `hud.security.coverage-overcrowded` and its hint, through
   * `HudCountsViewModel.overcrowded` (issue #586). A separate value from
   * `'coverage-chip'` rather than a second member under it, for the reason
   * claim 1 below gives: `isPostUnreachable` collapses its whole class to one
   * sentence about a post, and crowding is not that sentence.
   */
  | 'coverage-chip-crowding'
  /**
   * The `COVERAGE` chip carries this one as well, under
   * `hud.security.coverage-reserve-short` -- the word the Staff panel's coverage
   * block uses for the same rung -- and its description, through
   * `HudCountsViewModel.responseReserveShort`
   * ([ADR 0095](../../docs/adr/0095-what-the-guard-requirement-is-a-requirement-for.md)
   * decision 1). Its own value for claim 1's reason: its sentence is about the
   * free pool, not a post and not a bed.
   */
  | 'coverage-chip-reserve';

/**
 * **Exported for `tests/unit/ui-simulation-conditions.test.ts` and read
 * nowhere else in `src/`.** The compiler holds this table's *exhaustiveness*;
 * it cannot hold the two claims below it that decide what a player is told,
 * and neither can `tests/foundation/unconsumed-status-count-contract.test.ts`,
 * whose floor is a *mention* of `conditions` under `src/ui/` -- satisfied by
 * a comment, and satisfied by this table whether or not anything renders it
 * (issue #930's *"a gate whose unit is an id cannot see an orphan inside an
 * object that has a reader"*, one level further in). The two claims:
 *
 * 1. **Exactly one member may carry `'coverage-chip'`, and it must be
 *    `'security.post-unreachable'`.** `isPostUnreachable` below collapses the
 *    whole class to one boolean, and the sentence that boolean paints --
 *    `hud.security.post-unreachable`, through `HudCountsViewModel.postUnreachable`
 *    and `projectStatusMetrics` -- names *that member* and no other. A sixth
 *    condition about guard coverage, filed under the same presentation because
 *    the coverage chip is plainly where it belongs, would therefore make the
 *    chip assert that a sector's post cannot be reached about a prison whose
 *    post is perfectly reachable. `tsc` stays green, because the value is a
 *    legal member of the union; every existing test stays green, because none
 *    of them publishes a condition other than the one. That is a player-facing
 *    sentence the code does not keep, which is `AGENTS.md`'s fourth
 *    reservation, reached by an edit that looks obviously right.
 * 2. **The table's keys are exactly `PRISON_CONDITIONS`, in its order.**
 *    `tsc` already refuses a missing or unknown key; the test states it in
 *    the vocabulary's own terms so the failure names the member.
 */
export const PRISON_CONDITION_PRESENTATION: Readonly<Record<PrisonCondition, PrisonConditionPresentation>> = {
  'construction.unfunded': 'painted-elsewhere',
  'intake.no-place': 'painted-elsewhere',
  'prisoners.overcrowded': 'coverage-chip-crowding',
  'security.post-unreachable': 'coverage-chip',
  'security.response-reserve-short': 'coverage-chip-reserve',
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

/**
 * Whether the published condition set says crowding is accelerating needs
 * decay (issue #586) -- `'prisoners.overcrowded'`, read through the table for
 * `isPostUnreachable`'s reason: the id is spelled once.
 *
 * `undefined` answers `false`, which is what a publication naming no
 * condition says.
 */
export function isOvercrowded(conditions: readonly PrisonCondition[] | undefined): boolean {
  if (conditions === undefined) return false;
  return conditions.some((condition) => PRISON_CONDITION_PRESENTATION[condition] === 'coverage-chip-crowding');
}

/**
 * Whether the published condition set says every post is filled and fewer
 * guards are free than the worst incident needs (ADR 0095 decision 1) --
 * `'security.response-reserve-short'`, read through the table for
 * `isPostUnreachable`'s reason: the id is spelled once.
 *
 * `undefined` answers `false`, which is what a publication naming no
 * condition says.
 */
export function isReserveShort(conditions: readonly PrisonCondition[] | undefined): boolean {
  if (conditions === undefined) return false;
  return conditions.some((condition) => PRISON_CONDITION_PRESENTATION[condition] === 'coverage-chip-reserve');
}
