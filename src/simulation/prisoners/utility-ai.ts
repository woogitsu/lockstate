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
