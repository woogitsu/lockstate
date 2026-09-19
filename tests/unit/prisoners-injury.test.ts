import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { PrisonerRecordComponent } from '../../src/simulation/prisoners/components';
import {
  INFIRMARY_TREATMENT_ACTION_ID,
  MEDICAL_SUPPLY_CAPABILITY,
  MEDICAL_SUPPLY_SPEEDUP,
  TREATMENT_TICKS,
  treatmentTicksFor,
} from '../../src/simulation/prisoners/injury';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';

/**
 * The one number issue #589 owes, and the content it is a number *about*.
 *
 * Nothing here runs a kernel -- `tests/integration/incident-injury-loop.test.ts`
 * is where the mechanic is played end to end. This file pins the arithmetic and
 * the catalogue agreement, which are the two things a reader of `injury.ts`
 * would otherwise have to take on the docblock's word.
 */
describe('how long a course of treatment takes, and what decides it', () => {
  it('is one whole in-game day on a bare medical bed', () => {
    // The corpus figure (#589's own body: "one source gives 2,400 ticks") and
    // this tree's day length are the same number, which is the sanity check
    // `injury.ts` says it is. Asserted against `DAY_LENGTH_TICKS` rather than
    // against the literal so that a day of a different length moves both.
    expect(TREATMENT_TICKS).toBe(DAY_LENGTH_TICKS);
    expect(TREATMENT_TICKS).toBe(2_400);
    expect(treatmentTicksFor(TREATMENT_TICKS, [])).toBe(2_400);
    expect(treatmentTicksFor(TREATMENT_TICKS, ['medical-treatment', 'sleep-surface'])).toBe(2_400);
  });

  it('is halved by a medical-supply object in the same room, which is that capability\'s only reader', () => {
    expect(MEDICAL_SUPPLY_SPEEDUP).toBe(2);
    expect(treatmentTicksFor(TREATMENT_TICKS, [MEDICAL_SUPPLY_CAPABILITY])).toBe(1_200);
    expect(treatmentTicksFor(TREATMENT_TICKS, ['medical-supply', 'medical-treatment', 'sleep-surface'])).toBe(1_200);
  });

  it('needs no rounding rule, because the halved figure is a whole number of ticks', () => {
    // A fractional duration would be compared against an integer tick delta
    // and would silently round one way or the other. `injury.ts` says no
    // rounding rule is written; this is what makes that safe rather than lucky.
    expect(Number.isInteger(treatmentTicksFor(TREATMENT_TICKS, [MEDICAL_SUPPLY_CAPABILITY]))).toBe(true);
    expect(TREATMENT_TICKS % MEDICAL_SUPPLY_SPEEDUP).toBe(0);
  });

  it('reads the base from the catalogue entry rather than from the constant a second time', () => {
    // The property that keeps `actions.ts` the one place the number is
    // authored: hand this function a different base and it uses it.
    expect(treatmentTicksFor(100, [])).toBe(100);
    expect(treatmentTicksFor(100, [MEDICAL_SUPPLY_CAPABILITY])).toBe(50);
  });
});

describe('the treatment action names content that exists', () => {
  const treatment = DEFAULT_ACTIONS.find((action) => action.id === INFIRMARY_TREATMENT_ACTION_ID);

  it('is in the catalogue, targets room.infirmary, and gates on the bed rather than on the cabinet', () => {
    // `ActionSystem`'s `TREATMENT_ACTION` is `find`-by-id and has an
    // `undefined` arm it can never take; this is what makes that true.
    expect(treatment).toBeDefined();
    expect(treatment!.target).toEqual({ kind: 'room-catalog-id', roomCatalogId: 'room.infirmary' });
    // One action consumes one capability (#326). The beds bound how many may
    // be treated at once; the cabinet is read by `requiredDurationOf` instead.
    expect(treatment!.requiredObjectCapability).toBe('medical-treatment');
    expect(treatment!.requiredObjectCapability).not.toBe(MEDICAL_SUPPLY_CAPABILITY);
    expect(treatment!.minDurationTicks).toBe(TREATMENT_TICKS);
  });

  it('serves no need, which is why a rule and not a score decides when it is chosen', () => {
    // `scoreAction` sums `deficit x effect`, so an action with no effects
    // scores exactly 0 -- the floor. `ActionSystem.planIdleSelection` promotes
    // it on the flag for exactly this reason.
    expect(treatment!.needEffectsPerTick).toEqual({});
  });

  it('is in a category both shipped schedules allow, and is not allowed during a riot', () => {
    // The choice `actions.ts` argues: `hygiene` is allowed for 2,200 of
    // `HIGH_RISK_REGIME`'s 2,400 ticks against `free-association`'s 200, and
    // `RIOT_ALLOWED_CATEGORIES` excludes it -- the prison does not walk the
    // injured across a live riot to a bed.
    expect(treatment!.category).toBe('hygiene');
  });

  it('names a capability the room it targets actually requires, so it can never match no room', () => {
    // The failure `content-vocabulary-contract.test.ts` calls silent: a
    // requirement no object declares matches no instance for ever and nothing
    // reports why. Derived from both catalogues rather than restated.
    const infirmary = defaultRoomContentRegistry.getById('room.infirmary')!;
    const declaredByRequirements = infirmary.requirements.flatMap((requirement) =>
      requirement.type === 'object' ? (defaultObjectRegistry.getById(requirement.objectId)?.capabilities ?? []) : [],
    );
    expect(declaredByRequirements).toContain(treatment!.requiredObjectCapability);
    expect(declaredByRequirements).toContain(MEDICAL_SUPPLY_CAPABILITY);
  });
});

describe('the flag itself', () => {
  it('starts clear in every slot and clears again on reset, so a recycled index inherits no injury', () => {
    const records = new PrisonerRecordComponent(4);
    expect([...records.injured]).toEqual([0, 0, 0, 0]);
    records.injured[2] = 1;
    records.reset(2);
    expect([...records.injured]).toEqual([0, 0, 0, 0]);
  });

  it('survives its own component snapshot round trip', () => {
    const records = new PrisonerRecordComponent(4);
    records.injured[1] = 1;
    const restored = new PrisonerRecordComponent(4);
    restored.loadSnapshot(records.getSnapshot());
    expect([...restored.injured]).toEqual([0, 1, 0, 0]);
  });
});
