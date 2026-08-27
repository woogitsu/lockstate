import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '../../src/simulation/prisoners/actions';
import { NeedsComponent } from '../../src/simulation/prisoners/needs';
import { isActionCategoryAllowed, rankActions, scoreAction, selectBestAction } from '../../src/simulation/prisoners/utility-ai';

const SLEEP: ActionDefinition = { id: 'z-sleep', category: 'sleep', target: { kind: 'own-accommodation' }, needEffectsPerTick: { sleep: 2 }, minDurationTicks: 10 };
const EAT: ActionDefinition = { id: 'a-eat', category: 'meal', target: { kind: 'own-accommodation' }, needEffectsPerTick: { hunger: 4 }, minDurationTicks: 10 };
const RECREATE: ActionDefinition = { id: 'm-recreate', category: 'recreation', target: { kind: 'own-accommodation' }, needEffectsPerTick: { recreation: 1 }, minDurationTicks: 10 };

describe('scoreAction', () => {
  it('is higher for an action addressing a more depleted need', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'sleep', 250); // barely depleted
    needs.set(0, 'hunger', 10); // very depleted
    expect(scoreAction(needs, 0, EAT)).toBeGreaterThan(scoreAction(needs, 0, SLEEP));
  });

  it('scales with the action need effect magnitude, holding deficit equal', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'sleep', 0);
    needs.set(0, 'hunger', 0);
    // SLEEP effect=2, EAT effect=4, both need at 0 (deficit=255): EAT must score higher.
    expect(scoreAction(needs, 0, EAT)).toBeGreaterThan(scoreAction(needs, 0, SLEEP));
  });

  it('scores 0 for a fully-satisfied need with no other effects', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'recreation', 255);
    expect(scoreAction(needs, 0, RECREATE)).toBe(0);
  });
});

describe('selectBestAction', () => {
  it('selects the highest-scoring legal action', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'hunger', 0);
    needs.set(0, 'sleep', 255);
    needs.set(0, 'recreation', 255);
    expect(selectBestAction(needs, 0, [SLEEP, EAT, RECREATE])?.id).toBe('a-eat');
  });

  it('breaks an exact tie deterministically by ascending action id', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'sleep', 0);
    needs.set(0, 'hunger', 0);
    const sleepEquivalent: ActionDefinition = { ...SLEEP, needEffectsPerTick: { sleep: 4 } }; // same magnitude as EAT's hunger effect
    // Both now score identically (255 deficit x 4 effect); 'a-eat' < 'z-sleep' alphabetically.
    expect(selectBestAction(needs, 0, [sleepEquivalent, EAT])?.id).toBe('a-eat');
    expect(selectBestAction(needs, 0, [EAT, sleepEquivalent])?.id).toBe('a-eat'); // order-independent
  });

  it('returns undefined for an empty candidate list', () => {
    const needs = new NeedsComponent(1);
    expect(selectBestAction(needs, 0, [])).toBeUndefined();
  });
});

describe('rankActions', () => {
  /**
   * The order [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
   * decision 1's candidate walk consumes, and therefore the order that decides
   * which action a prisoner starts when their first choice cannot resolve a
   * target. ADR 0029 decision 7 commitment 3 requires it to be a **total order
   * derived from state**, so these assert the whole sequence rather than its
   * head.
   */
  it('returns every candidate, best first, by descending score', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'hunger', 0); // EAT:   deficit 255 x effect 4 = 1,020
    needs.set(0, 'sleep', 128); // SLEEP: deficit 127 x effect 2 =   254
    needs.set(0, 'recreation', 255); // RECREATE: deficit 0        =     0
    expect(rankActions(needs, 0, [RECREATE, SLEEP, EAT]).map((action) => action.id)).toEqual(['a-eat', 'z-sleep', 'm-recreate']);
  });

  it('breaks every tie by ascending action id, whatever order the candidates arrive in', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'sleep', 0);
    needs.set(0, 'hunger', 0);
    needs.set(0, 'recreation', 0);
    // Three actions scoring identically (255 x 4), so nothing but the id can
    // separate them -- and a stable sort over a comparator that answered `0`
    // would hand back the input order instead.
    const tiedSleep: ActionDefinition = { ...SLEEP, needEffectsPerTick: { sleep: 4 } };
    const tiedRecreate: ActionDefinition = { ...RECREATE, needEffectsPerTick: { recreation: 4 } };
    const expected = ['a-eat', 'm-recreate', 'z-sleep'];
    expect(rankActions(needs, 0, [tiedSleep, EAT, tiedRecreate]).map((action) => action.id)).toEqual(expected);
    expect(rankActions(needs, 0, [tiedRecreate, tiedSleep, EAT]).map((action) => action.id)).toEqual(expected);
    expect(rankActions(needs, 0, [EAT, tiedSleep, tiedRecreate]).map((action) => action.id)).toEqual(expected);
  });

  it('drops nothing: a fallback can only reach a candidate the ranking still carries', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'recreation', 255); // scores 0, and must still be offered last
    const ranked = rankActions(needs, 0, [SLEEP, EAT, RECREATE]);
    expect(ranked).toHaveLength(3);
    expect([...ranked].map((action) => action.id).sort()).toEqual(['a-eat', 'm-recreate', 'z-sleep']);
    expect(rankActions(needs, 0, [])).toEqual([]);
  });

  it('agrees with selectBestAction at the head, so the walk and the single answer cannot diverge', () => {
    // Swept over need levels rather than asserted once: `selectBestAction` is
    // the head of this list by construction, and this is the assertion that
    // would go red if either were ever restated separately again.
    for (let hunger = 0; hunger <= 255; hunger += 17) {
      for (let sleep = 0; sleep <= 255; sleep += 51) {
        const needs = new NeedsComponent(1);
        needs.set(0, 'hunger', hunger);
        needs.set(0, 'sleep', sleep);
        needs.set(0, 'recreation', 255 - sleep);
        const candidates = [SLEEP, EAT, RECREATE];
        expect(rankActions(needs, 0, candidates)[0]).toBe(selectBestAction(needs, 0, candidates));
      }
    }
  });
});

describe('isActionCategoryAllowed', () => {
  it('checks category membership in the allowed list', () => {
    expect(isActionCategoryAllowed(SLEEP, ['sleep', 'meal'])).toBe(true);
    expect(isActionCategoryAllowed(SLEEP, ['meal'])).toBe(false);
  });
});
