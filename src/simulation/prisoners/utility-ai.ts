import type { ActionDefinition } from './actions';
import { NEED_MAX, type NeedId, NeedsComponent } from './needs';
import type { ActionCategory } from './regime';

export function isActionCategoryAllowed(action: ActionDefinition, allowedCategories: readonly ActionCategory[]): boolean {
  return allowedCategories.includes(action.category);
}

/**
 * Utility = sum over the action's need effects of (how unmet that need
 * currently is) x (how strongly this action addresses it). An action with
 * a large effect on an already-critical need scores far higher than one
 * with a small effect on an already-satisfied need -- the deterministic
 * "highest legal available action" selection issue #24 requires.
 */
export function scoreAction(needs: NeedsComponent, index: number, action: ActionDefinition): number {
  let score = 0;
  for (const needId of Object.keys(action.needEffectsPerTick) as NeedId[]) {
    const effect = action.needEffectsPerTick[needId] ?? 0;
    const deficit = NEED_MAX - needs.get(index, needId);
    score += deficit * effect;
  }
  return score;
}

/**
 * Every candidate, best first: **descending score, ties broken by ascending
 * action id.**
 *
 * A *total* order derived from state and nothing else, which is what
 * [ADR 0029](../../../docs/adr/0029-concurrent-room-use-claims.md) decision 7
 * commitment 3 requires of anything that decides an outcome. Action ids are
 * unique, so the comparator never answers `0` for two distinct candidates and
 * the result therefore does not depend on the sort's stability, on the order
 * `candidates` arrived in, or on anything outside `needs[index]`.
 *
 * This exists for [ADR 0041](../../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * decision 1: `ActionSystem.beginNextAction` walks this list until a candidate
 * resolves a target, instead of taking one answer and giving up. Scoring has no
 * availability term -- it cannot, since it is a pure function of needs -- so the
 * ranking says what the prisoner *wants* and the walk says what they can *have*.
 *
 * Never uses RNG (see classification.ts for where #24's one intentional RNG use
 * lives).
 */
export function rankActions(needs: NeedsComponent, index: number, candidates: readonly ActionDefinition[]): readonly ActionDefinition[] {
  return candidates
    .map((action) => ({ action, score: scoreAction(needs, index, action) }))
    .sort((left, right) => (right.score - left.score) || (left.action.id < right.action.id ? -1 : 1))
    .map((scored) => scored.action);
}

/**
 * `candidates` must already be filtered to legal (regime-allowed,
 * resource-available) actions -- this function only scores and breaks
 * ties, deterministically, by ascending action id. Never uses RNG (see
 * classification.ts for where #24's one intentional RNG use lives).
 *
 * The head of `rankActions`, and derived from it rather than restated, so the
 * single answer and the ranked walk can never disagree about which action a
 * prisoner wants most.
 */
export function selectBestAction(needs: NeedsComponent, index: number, candidates: readonly ActionDefinition[]): ActionDefinition | undefined {
  return rankActions(needs, index, candidates)[0];
}

/**
 * How badly a prisoner wants the thing they are about to ask for this cycle:
 * the score of the **highest-ranked candidate the prison can actually
 * provide**, or `0` when it can provide none of them.
 *
 * This is the key `ActionSystem.update` orders the contended scan by, and the
 * decision is
 * [ADR 0062](../../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
 * (issue #434, taking
 * [ADR 0041](../../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * decision 2 and the fairness half of
 * [ADR 0029](../../../docs/adr/0029-concurrent-room-use-claims.md) decision 5).
 * **This paragraph said the ADR was "owed a centrally-assigned number and is
 * not written yet" and told the reader to treat the choice as open. It is
 * written**, it carries the rejected alternatives and the measurements, and a
 * reader who wants the argument rather than the mechanism should start there.
 *
 * It is deliberately the same number `rankActions` already sorts one prisoner's
 * own options with rather than a second, parallel notion of urgency. Two
 * consequences follow from that reuse, and both are the reason for it:
 *
 * - **Restricted to the prisoners contending for one room, this is exactly the
 *   deficit of the need that room serves.** Everyone whose best providable
 *   candidate is `action.eat-meal` is scored `hungerDeficit x 4`, so ordering
 *   them by this orders them by hunger and by nothing else. Contention is always
 *   per room and per capability, so that restriction is the case that matters.
 * - **It is regime-aware for free.** A prisoner cannot be ranked urgent for a
 *   need no block on their timetable currently offers a route to, because the
 *   candidates handed in here are already filtered by the active block.
 *
 * What it deliberately is **not** is an aggregate of the prisoner's misery.
 * `needsPressure` ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md))
 * is the mean deficit over all six needs and is the right number for "is this
 * prison about to riot"; it is the wrong one for "who gets this seat", because
 * it lets four moderate deficits outrank one crisis. A prisoner at hunger 0 and
 * a prisoner at forty on four needs are not equally entitled to the canteen,
 * and this function says the starving one goes first.
 *
 * ## Why `provided` exists, and why it must not know about contention
 *
 * Taking the head of `rankedCandidates` unconditionally makes the key
 * degenerate wherever a need has no route. A prison with no yard, no common
 * room and no classroom leaves every prisoner's `recreation` unserved for ever,
 * so `action.yard-recreation` ranks first for all of them at the same maxed-out
 * deficit -- and an urgency read off a want the prison cannot serve is
 * **identical for everybody**, which collapses straight back onto the tie-break
 * and reinstates the index order the whole change exists to remove. That
 * degeneracy is not hypothetical: ADR 0054 decision 1 keeps `recreation`
 * room-gated on purpose, so an early prison is exactly the case.
 *
 * **Reported rather than claimed: no integration fixture in this repository
 * kills this branch** (ADR 0062 open question 2 carries it and three more). Bypassing the filter leaves
 * `tests/integration/contended-shower-fairness.test.ts` green to the tick,
 * because in that prison the prisoners the plateau flattens are the ones with
 * no shower claim to press anyway, and the arrival gate -- keyed on the action
 * a traveller is already committed to, where no such plateau exists -- is doing
 * the visible half of the fairness work. Its guard is therefore the unit case
 * in `tests/unit/prisoners-utility-ai.test.ts`, "separates two prisoners whose
 * unservable first choice is identically maxed out", which is red without it.
 * Issue #375 is why the survivor is written down here instead of being left to
 * look guarded.
 *
 * `provided` therefore answers **"could this prisoner take this action in an
 * empty prison"** -- is there an instance of the room with a non-zero ceiling
 * for the capability, or does this prisoner hold an accommodation -- and must
 * **never** consult a use claim. An ordering key that depended on who had
 * already been served this cycle would be a function of the scan position it is
 * supposed to be deciding, and the sort would no longer be a function of state.
 *
 * Pure: needs, the candidate list, `DEFAULT_ACTIONS`' authored effects and
 * `provided`'s own answer. No RNG, no clock, no iteration of any `Map` or `Set`.
 */
export function needUrgency(
  needs: NeedsComponent,
  index: number,
  rankedCandidates: readonly ActionDefinition[],
  provided: (action: ActionDefinition) => boolean,
): number {
  return urgencyOfProvidedCandidate(needs, index, rankedCandidates, firstProvidedCandidateIndex(rankedCandidates, provided));
}

/**
 * Where in the ranked list the prison's answer starts: the position of the
 * **highest-ranked candidate the prison can provide**, or `-1` when it can
 * provide none of them.
 *
 * `needUrgency`'s first half, split out for issue #435 rather than duplicated
 * there, because the position and the score are two readings of one fact and a
 * second copy of the walk could disagree with this one. The doc above is the
 * argument for what `provided` may and may not ask; this is the loop that asks
 * it.
 *
 * **The position is what separates two kinds of "served worse".** Everything
 * ranked above the answer is a want this prison has nowhere to satisfy -- no
 * canteen has been built, no shower room stands -- and everything between the
 * answer and the action a prisoner actually starts is a place that exists and
 * that somebody else is in. `ActionSystem.beginNextAction` counts those two as
 * different numbers on exactly this boundary, and neither is visible without
 * it. See `SubstitutionRecordComponent`.
 *
 * Pure, and evaluated **once** per idle prisoner per cycle: `provided` reaches
 * `RoomInstanceRegistry.hasPlaceForUse`, so the caller keeps this answer rather
 * than asking again for the score.
 */
export function firstProvidedCandidateIndex(
  rankedCandidates: readonly ActionDefinition[],
  provided: (action: ActionDefinition) => boolean,
): number {
  // An indexed loop rather than `entries()`: this runs once per idle prisoner
  // per reconsideration cycle, and `entries()` allocates a two-element tuple
  // per candidate for a position a counter already has.
  for (let position = 0; position < rankedCandidates.length; position += 1) {
    if (provided(rankedCandidates[position]!)) return position;
  }
  return -1;
}

/**
 * `needUrgency`'s second half: the score of the candidate
 * `firstProvidedCandidateIndex` found, or `0` for a prisoner whose every want
 * is unprovidable.
 *
 * Taking the position rather than re-walking the list is what makes the two
 * halves cost one pass over `provided` between them.
 */
export function urgencyOfProvidedCandidate(
  needs: NeedsComponent,
  index: number,
  rankedCandidates: readonly ActionDefinition[],
  providedIndex: number,
): number {
  const action = providedIndex < 0 ? undefined : rankedCandidates[providedIndex];
  return action === undefined ? 0 : scoreAction(needs, index, action);
}
