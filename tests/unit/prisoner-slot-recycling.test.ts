import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import {
  ACTION_PHASES,
  CurrentActionComponent,
  PositionComponent,
  PrisonerRecordComponent,
  SubstitutionRecordComponent,
  intakeStageIndex,
} from '../../src/simulation/prisoners/components';
import { NEED_IDS, NEED_MAX_SCALED, NeedsComponent } from '../../src/simulation/prisoners/needs';
import type { PrisonerOperationsRuntime } from '../../src/simulation/prisoners/prisoner-operations-runtime';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { buildPrisonerScenarioFixture, type PrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

/**
 * `EntityStore.spawn` recycles a freed index and nothing clears a component
 * array on destroy, so an admission can land on an index still holding the
 * previous occupant's state (#111).
 *
 * Reaching that state is deliberate here. `PrisonerOperationsRuntime` exposes
 * `entityStore` and `admitPrisoner` publicly, so these tests use nothing but
 * the public surface -- the same surface
 * `tests/determinism/snapshot-restore-fidelity.test.ts` already recycles an
 * index through.
 *
 * **These cases have stopped being anticipatory.** They used to close with
 * "the situation cannot occur in a session today and becomes reachable only
 * with the first release/parole path (#31) ... so that the day it does, a
 * recycled slot behaves like a fresh one". That day is #441: a prisoner whose
 * sentence ends is released, their index goes back on the free list, and the
 * next admission lands on it. What these cases pin is now ordinary gameplay,
 * and it is deliberately still driven through `entityStore.destroy` rather than
 * through `releasePrisoner` -- destroy alone is the *harsher* input, because it
 * leaves behind exactly the cold state and occupancy a real release drops, so a
 * component reset that only worked alongside a full release would fail here.
 */

interface SlotArrayLike {
  readonly length: number;
  [index: number]: number;
}

/**
 * Every per-slot typed array a component owns, keyed by a readable path.
 *
 * Discovered by reflection rather than listed, which is the point: #111 was
 * thirteen arrays initialised at construction and forgotten on recycle, and a
 * hand-written list here would have exactly the same blind spot as the
 * hand-written initialisation did. Descends one level into plain-object
 * properties so `NeedsComponent.levels` is covered; skips arrays, so a
 * component's internal `SlotDefault` tuple list is not mistaken for
 * per-slot data.
 */
function slotArraysOf(component: object): Map<string, SlotArrayLike> {
  const found = new Map<string, SlotArrayLike>();
  for (const [key, value] of Object.entries(component)) {
    if (ArrayBuffer.isView(value)) {
      found.set(key, value as unknown as SlotArrayLike);
      continue;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [innerKey, innerValue] of Object.entries(value as object)) {
      if (ArrayBuffer.isView(innerValue)) found.set(`${key}.${innerKey}`, innerValue as unknown as SlotArrayLike);
    }
  }
  return found;
}

/** A value guaranteed to differ from `current`, so a missed reset cannot coincidentally look correct. */
function dirtyValueFor(current: number): number {
  return current === 0 ? 1 : 0;
}

const CAPACITY = 4;

function componentsUnderTest(): readonly {
  readonly name: string;
  /** The `PrisonerOperationsRuntime` property this component is exposed as, so a default can be named by the path the runtime-level tests below read it at. */
  readonly runtimeKey: string;
  readonly make: () => { reset(index: number): void };
}[] {
  return [
    { name: 'PrisonerRecordComponent', runtimeKey: 'records', make: () => new PrisonerRecordComponent(CAPACITY) },
    { name: 'NeedsComponent', runtimeKey: 'needs', make: () => new NeedsComponent(CAPACITY) },
    { name: 'CurrentActionComponent', runtimeKey: 'currentAction', make: () => new CurrentActionComponent(CAPACITY) },
    { name: 'PositionComponent', runtimeKey: 'position', make: () => new PositionComponent(CAPACITY) },
    { name: 'SubstitutionRecordComponent', runtimeKey: 'substitutions', make: () => new SubstitutionRecordComponent(CAPACITY) },
  ];
}

/**
 * What each per-slot default *is*, stated here independently of the
 * `SlotDefault` lists that produce it.
 *
 * The tests below compare a reset slot against a freshly constructed
 * component, which cannot tell whether the value the two agree on is the
 * right one: a component states each default once and drives both its
 * constructor `fill` and its `reset` from that statement, so changing it
 * changes both sides of that comparison at once and both stay green. Two
 * such changes survived the entire suite while this list was absent --
 * `currentAction.actionIndex` from -1 to 0, and `currentAction.phase` from
 * 'idle' to 'performing' -- and both are visible to a player before the
 * first action tick: `prisoner-projection.ts` decides whether a prisoner is
 * doing anything at all with `actionIndex >= 0`, and reports the room a
 * prisoner occupies only while the phase is 'performing'.
 */
const SLOT_DEFAULTS: Readonly<Record<string, number>> = {
  'records.sentenceLengthTicks': 0,
  'records.priorIncidentsAtIntake': 0,
  'records.sentenceEndTick': 0,
  // RiskTier 0 is 'minimal' and CLASSIFICATION_GROUP_IDS[0] is
  // 'general-population'; both are recomputed at the classification stage.
  'records.riskTier': 0,
  'records.classificationGroupIndex': 0,
  'records.intakeStage': intakeStageIndex('queued'),
  // `0` -- not sanctioned. Issue #80, ADR 00XX.
  'records.solitarySanctionEndTick': 0,
  // Stated once for every need, the way `NeedsComponent.reset` itself loops
  // `NEED_IDS`: a seventh need is covered here with no second edit. The value
  // is `NEED_MAX` expressed in the units `levels` actually stores -- scaled by
  // `NEED_SCALE` since #259 -- because this list pins the *array* contents.
  ...Object.fromEntries(NEED_IDS.map((needId) => [`needs.levels.${needId}`, NEED_MAX_SCALED])),
  // The component's own documented "no action selected" sentinel, and the
  // phase that pairs with it.
  'currentAction.actionIndex': -1,
  'currentAction.phase': ACTION_PHASES.indexOf('idle'),
  'currentAction.phaseStartedAtTick': 0,
  'currentAction.needFulfilledLastTick': 0,
  'position.tileX': 0,
  'position.tileY': 0,
  // Nobody has been served worse than they asked for in a slot nobody has
  // occupied, and a prisoner admitted into a recycled one starts their own
  // sentence with their own count (#435).
  'substitutions.substitutionCycles': 0,
  'substitutions.contendedSubstitutionCycles': 0,
};

describe('per-prisoner component slot defaults', () => {
  it('counts twenty-one per-slot arrays across the five index-keyed components', () => {
    const perComponent = componentsUnderTest().map((entry) => [entry.name, slotArraysOf(entry.make()).size] as const);

    // **The two numbers here are no longer one number, and that is the point.**
    // `admitPrisoner` has to reset every array below -- twenty-one since #80
    // added `solitarySanctionEndTick` (ADR 00XX) to the twenty #435 left --
    // while `session-systems.ts` and `docs/PERSISTENCE.md` say "nineteen
    // per-prisoner component arrays" about the *payload*, which is the same
    // list minus `SubstitutionRecordComponent`'s two: they are diagnostics, no
    // save carries them, and a restore clears them rather than migrating them
    // (see that component). This assertion used to read eighteen persisted
    // across four components and pinned both facts at once; it now pins the
    // reset's total and names the persisted subset, so a twenty-second array
    // still fails here and the prompt is to say which of the two lists it
    // joins.
    expect(perComponent).toEqual([
      ['PrisonerRecordComponent', 7],
      ['NeedsComponent', 6],
      ['CurrentActionComponent', 4],
      ['PositionComponent', 2],
      ['SubstitutionRecordComponent', 2],
    ]);
    expect(perComponent.reduce((total, [, count]) => total + count, 0)).toBe(21);
    const persisted = perComponent.filter(([name]) => name !== 'SubstitutionRecordComponent');
    expect(persisted.reduce((total, [, count]) => total + count, 0)).toBe(19);
  });

  it('pins the value of every default, not only that reset agrees with construction', () => {
    const fresh = new Map<string, number>();
    const afterReset = new Map<string, number>();
    const slot = 2;

    for (const { runtimeKey, make } of componentsUnderTest()) {
      for (const [path, array] of slotArraysOf(make())) fresh.set(`${runtimeKey}.${path}`, array[0]!);

      const dirtied = make();
      const dirtiedArrays = slotArraysOf(dirtied);
      for (const [path, array] of dirtiedArrays) array[slot] = dirtyValueFor(fresh.get(`${runtimeKey}.${path}`)!);
      dirtied.reset(slot);
      for (const [path, array] of dirtiedArrays) afterReset.set(`${runtimeKey}.${path}`, array[slot]!);
    }

    // A twenty-second array has to state its default here as well as in its
    // component's list -- the count assertion above says an array was added,
    // this one says nobody decided what it should read as when unoccupied.
    expect([...fresh.keys()].sort()).toEqual(Object.keys(SLOT_DEFAULTS).sort());
    expect(Object.fromEntries(fresh)).toEqual(SLOT_DEFAULTS);
    expect(Object.fromEntries(afterReset)).toEqual(SLOT_DEFAULTS);
  });

  for (const { name, make } of componentsUnderTest()) {
    it(`${name}.reset restores every one of its arrays for one slot`, () => {
      const fresh = make();
      const dirty = make();
      const freshArrays = slotArraysOf(fresh);
      const dirtyArrays = slotArraysOf(dirty);
      expect([...dirtyArrays.keys()]).toEqual([...freshArrays.keys()]);
      expect(dirtyArrays.size).toBeGreaterThan(0);

      const slot = 1;
      for (const [path, array] of dirtyArrays) {
        const freshValue = freshArrays.get(path)![slot]!;
        array[slot] = dirtyValueFor(freshValue);
        expect(array[slot]).not.toBe(freshValue);
      }

      dirty.reset(slot);

      for (const [path, array] of dirtyArrays) {
        // An array added to the component but not to its `SlotDefault` list
        // fails here, naming itself in the assertion message.
        expect({ path, value: array[slot] }).toEqual({ path, value: freshArrays.get(path)![slot] });
      }
    });

    it(`${name}.reset touches only the slot it is given`, () => {
      const component = make();
      const arrays = slotArraysOf(component);
      for (const array of arrays.values()) array[0] = 42;

      component.reset(1);

      for (const [path, array] of arrays) {
        expect({ path, value: array[0] }).toEqual({ path, value: 42 });
      }
    });
  }
});

/** Runtime properties whose value exposes a one-argument `reset` -- the established shape of an index-keyed prisoner component. */
function resettableComponentsOf(runtime: PrisonerOperationsRuntime): Map<string, { reset(index: number): void }> {
  const found = new Map<string, { reset(index: number): void }>();
  for (const [key, value] of Object.entries(runtime)) {
    if (value === null || typeof value !== 'object') continue;
    const reset = (value as { reset?: unknown }).reset;
    if (typeof reset === 'function' && reset.length === 1) found.set(key, value as { reset(index: number): void });
  }
  return found;
}

function makeKernel(seed: number): Kernel {
  return new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(seed, RNG_STREAM) }]));
}

function runFixture(seed: number): { fixture: PrisonerScenarioFixture; kernel: Kernel } {
  const fixture = buildPrisonerScenarioFixture({ cellCount: 40, capacity: 8 });
  const kernel = makeKernel(seed);
  fixture.registerOn(kernel);
  return { fixture, kernel };
}

function step(kernel: Kernel, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) kernel.step();
}

describe('admitting a prisoner into a recycled index', () => {
  it('resets every index-keyed component the runtime owns', () => {
    const { fixture, kernel } = runFixture(0xc0ffee);
    const runtime = fixture.prisoners;

    const resettable = resettableComponentsOf(runtime);
    // Pinned so that a **sixth** index-keyed component added to the runtime
    // shows up here rather than being silently left out of `admitPrisoner` --
    // the component-level twin of the array-level count assertion above. Once
    // listed, the loop below covers it with no further edit. The fifth arrived
    // with #435 and was added by extending this list, which is what the
    // assertion is for.
    expect([...resettable.keys()].sort()).toEqual(['currentAction', 'needs', 'position', 'records', 'substitutions']);

    const first = runtime.admitPrisoner({ sentenceLengthTicks: 400_000, priorIncidents: 3 }, fixture.originTile);
    const index = runtime.entityStore.getIndex(first);
    // Long enough for intake to complete and for the action system to pick,
    // travel to and perform an action, so the slot holds a full spread of
    // occupied-prisoner state rather than just intake fields.
    step(kernel, 600);

    const occupied = new Map<string, number>();
    for (const [name, component] of resettable) {
      for (const [path, array] of slotArraysOf(component)) occupied.set(`${name}.${path}`, array[index]!);
    }

    runtime.entityStore.destroy(first);
    const second = runtime.admitPrisoner({ sentenceLengthTicks: 400_000, priorIncidents: 3 }, fixture.originTile);
    expect(runtime.entityStore.getIndex(second)).toBe(index);
    expect(second).not.toBe(first);

    const freshDefaults = new Map<string, number>();
    for (const [name, component] of [
      ['records', new PrisonerRecordComponent(CAPACITY)],
      ['needs', new NeedsComponent(CAPACITY)],
      ['currentAction', new CurrentActionComponent(CAPACITY)],
      ['position', new PositionComponent(CAPACITY)],
      ['substitutions', new SubstitutionRecordComponent(CAPACITY)],
    ] as const) {
      for (const [path, array] of slotArraysOf(component)) freshDefaults.set(`${name}.${path}`, array[0]!);
    }

    // Fields the admission itself writes: everything else must read exactly
    // as a never-occupied slot does.
    const writtenByAdmission = new Map<string, number>([
      ['records.sentenceLengthTicks', 400_000],
      ['records.priorIncidentsAtIntake', 3],
      ['position.tileX', fixture.originTile.x],
      ['position.tileY', fixture.originTile.y],
    ]);

    for (const [name, component] of resettable) {
      for (const [path, array] of slotArraysOf(component)) {
        const key = `${name}.${path}`;
        const expected = writtenByAdmission.get(key) ?? freshDefaults.get(key)!;
        expect({ key, value: array[index]! }).toEqual({ key, value: expected });
      }
    }

    // The residue really was there to inherit, so the assertions above are
    // pinning a reset that had something to do. Not every array differs --
    // `applyNeedEffects` can leave an individual need back at its maximum --
    // so this asserts the shape of the residue rather than a count: it spanned
    // both the needs and the action plan, the two families #111 named.
    const changed = [...occupied.entries()]
      .filter(([key, value]) => value !== (writtenByAdmission.get(key) ?? freshDefaults.get(key)))
      .map(([key]) => key);
    expect(changed.some((key) => key.startsWith('needs.levels.'))).toBe(true);
    expect(changed.some((key) => key.startsWith('currentAction.'))).toBe(true);
  });

  it('produces the same trajectory as an admission into a never-occupied index', () => {
    // Two arms of the same fixture and seed, kept symmetric in every respect
    // except which index the prisoner under comparison lands on. Both admit a
    // first prisoner at tick 0, run 900 ticks, then admit a second with
    // identical input at the same tick -- the recycled arm having destroyed
    // the first, so its second prisoner takes index 0 back, and the fresh arm
    // leaving the first alive, so its second prisoner takes never-occupied
    // index 1.
    //
    // The symmetry matters: absolute tick stamps (`sentenceEndTick`,
    // `phaseStartedAtTick`) and the one named RNG draw per classification
    // would both differ if the two arms admitted at different ticks or made a
    // different number of draws, and the comparison would be meaningless
    // rather than merely failing. Occupancy stays symmetric too, and since
    // #441 that is a property of what this test calls rather than of the
    // codebase: `entityStore.destroy` releases nothing, so the recycled arm's
    // first prisoner holds its cell exactly as the fresh arm's does.
    // `releasePrisoner` would free it and the two arms would then differ in
    // occupancy for a reason that has nothing to do with slot recycling.
    const admit = (fixture: PrisonerScenarioFixture) =>
      fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 90_000, priorIncidents: 1 }, fixture.originTile);

    const recycled = runFixture(0xbeef);
    const destroyed = admit(recycled.fixture);
    step(recycled.kernel, 900);
    recycled.fixture.prisoners.entityStore.destroy(destroyed);
    const recycledId = admit(recycled.fixture);
    expect(recycled.fixture.prisoners.entityStore.getIndex(recycledId)).toBe(0);

    const fresh = runFixture(0xbeef);
    admit(fresh.fixture);
    step(fresh.kernel, 900);
    const freshId = admit(fresh.fixture);
    expect(fresh.fixture.prisoners.entityStore.getIndex(freshId)).toBe(1);

    step(recycled.kernel, 1_200);
    step(fresh.kernel, 1_200);

    const describeSlot = (runtime: PrisonerOperationsRuntime, index: number): Record<string, number> => {
      const state: Record<string, number> = {};
      for (const [name, component] of resettableComponentsOf(runtime)) {
        for (const [path, array] of slotArraysOf(component)) state[`${name}.${path}`] = array[index]!;
      }
      return state;
    };

    expect(describeSlot(recycled.fixture.prisoners, 0)).toEqual(describeSlot(fresh.fixture.prisoners, 1));
  });
});
