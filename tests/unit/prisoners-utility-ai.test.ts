import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '../../src/simulation/prisoners/actions';
import { NeedsComponent } from '../../src/simulation/prisoners/needs';
import { isActionCategoryAllowed, scoreAction, selectBestAction } from '../../src/simulation/prisoners/utility-ai';

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

describe('isActionCategoryAllowed', () => {
  it('checks category membership in the allowed list', () => {
    expect(isActionCategoryAllowed(SLEEP, ['sleep', 'meal'])).toBe(true);
    expect(isActionCategoryAllowed(SLEEP, ['meal'])).toBe(false);
  });
});
