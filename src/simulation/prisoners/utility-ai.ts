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
 * `candidates` must already be filtered to legal (regime-allowed,
 * resource-available) actions -- this function only scores and breaks
 * ties, deterministically, by ascending action id. Never uses RNG (see
 * classification.ts for where #24's one intentional RNG use lives).
 */
export function selectBestAction(needs: NeedsComponent, index: number, candidates: readonly ActionDefinition[]): ActionDefinition | undefined {
  let best: ActionDefinition | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const action of candidates) {
    const score = scoreAction(needs, index, action);
    if (score > bestScore || (score === bestScore && best !== undefined && action.id < best.id)) {
      bestScore = score;
      best = action;
    }
  }

  return best;
}
