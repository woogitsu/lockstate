import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { actionIndexOf } from '../../src/simulation/prisoners/components';
import {
  ACTION_CATEGORIES,
  DEFAULT_REGIME_SCHEDULES,
  DAY_LENGTH_TICKS,
  type ActionCategory,
  type RegimeSchedule,
} from '../../src/simulation/prisoners/regime';
import { buildRiotRegimeSchedule } from '../../src/simulation/incidents/riot-regime';

/**
 * # `DEFAULT_ACTIONS` is a save format, and nothing else in the repository says so
 *
 * `CurrentActionComponent.actionIndex` is a **positional** index into
 * `DEFAULT_ACTIONS` — `actionIndexOf` is `findIndex` over the array
 * (`src/simulation/prisoners/components.ts`) — and the save carries that
 * integer verbatim. `src/persistence/save-schema.ts` declares it as
 * `actionIndex: z.array(z.number().int().min(-0x8000).max(0x7fff))`, and
 * `src/simulation/runtime/session-systems.ts` slices it out of the component on
 * capture and `set`s it straight back on restore, with no id in between.
 *
 * The contrast is in that schema's own file. Six lines above `actionIndex`, the
 * `needs` object is keyed **by name**, and its comment says exactly why:
 *
 * > *Named, not positional: reordering `NEED_IDS` in the simulation must not
 * > silently reinterpret an existing save's levels as a different need.*
 *
 * Nothing gives `DEFAULT_ACTIONS` that protection. An entry inserted anywhere
 * but the end shifts every index above it, and a prisoner who was showering
 * when the save was written resumes doing something else at the same phase and
 * the same `phaseStartedAtTick` — no decode failure, no `SAVE_SCHEMA_VERSION`
 * mismatch, nothing to notice it by. Appending moves no existing index, which
 * is the whole reason adding a catalogue entry is a content change here rather
 * than a migration ([ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * decision 1 corrects issue #440, which had put the save schema out of scope on
 * the grounds that *"adding a catalogue action is content data"*).
 *
 * **A comment cannot stop an insertion; this file can.** It is deliberately not
 * in `tests/unit/prisoners-action-system.test.ts` — that file tests a system's
 * behaviour, and this tests a data module's compatibility with bytes already on
 * a player's disk.
 */

/**
 * What a saved `actionIndex` means, written out as a save holds it.
 *
 * **Hand-authored from the released catalogue, never derived from
 * `DEFAULT_ACTIONS`** — a table computed from the array under test would agree
 * with any arrangement of it, including the one this file exists to reject.
 * Indices 0–7 are the eight actions every save written before
 * `action.free-association` existed could name; index 8 is that entry, appended
 * rather than inserted, and appended is why 0–7 still read as they did.
 *
 * Extending this list is what adding an action looks like: put the new id at
 * the **end**, next index, same commit. Editing any line above the last one is
 * a save migration and `SAVE_SCHEMA_VERSION` has to move with it
 * ([ADR 0038](../../docs/adr/0038-what-makes-a-save-compatible.md)).
 */
const SAVED_ACTION_INDEX_MEANS: readonly (readonly [index: number, actionId: string])[] = [
  [0, 'action.sleep'],
  [1, 'action.eat-meal'],
  [2, 'action.eat-in-cell'],
  [3, 'action.use-toilet'],
  [4, 'action.shower'],
  [5, 'action.yard-recreation'],
  [6, 'action.common-room-recreation'],
  [7, 'action.classroom-education'],
  [8, 'action.free-association'],
];

describe('a saved actionIndex still names the action it named when it was written', () => {
  it('cannot pass vacuously: the table is non-empty, densely indexed and free of duplicates', () => {
    // Three ways this file could assert nothing while looking busy: an empty
    // table, a table whose indices skip or repeat, and a table naming one
    // action twice. Each would make the loop below iterate over something that
    // is not the catalogue's index space.
    expect(SAVED_ACTION_INDEX_MEANS.length).toBeGreaterThan(1);
    expect(SAVED_ACTION_INDEX_MEANS.map(([index]) => index)).toEqual(SAVED_ACTION_INDEX_MEANS.map((_, position) => position));
    expect(new Set(SAVED_ACTION_INDEX_MEANS.map(([, id]) => id)).size).toBe(SAVED_ACTION_INDEX_MEANS.length);
  });

  it('resolves every index a save can hold to the same action id it meant', () => {
    /*
     * The exact operation a restore performs. `session-systems.ts` writes the
     * saved integers back into `CurrentActionComponent.actionIndex`, and from
     * then on `ActionSystem.continuePerforming`, `ActionSystem.reinstateUseClaims`
     * and `projectPrisonerDetail` all read `DEFAULT_ACTIONS[actionIndex]` —
     * three readers, one subscript, no id check anywhere.
     */
    for (const [index, actionId] of SAVED_ACTION_INDEX_MEANS) {
      expect(
        DEFAULT_ACTIONS[index]?.id,
        `a save holding actionIndex ${index} means "${actionId}". DEFAULT_ACTIONS was reordered or an entry was inserted before this position, so every existing save now reinterprets that prisoner's in-flight action. Append instead, and add the new id to the END of SAVED_ACTION_INDEX_MEANS in the same commit`,
      ).toBe(actionId);
    }
  });

  it('agrees with actionIndexOf in the other direction, so a rename cannot pass either', () => {
    // `beginNextAction` writes the index through `actionIndexOf(chosen.id)`, so
    // the pair (id -> index) is the write side of the same contract the read
    // side above checks. Renaming an id keeps both sides of the array
    // consistent with each other and breaks only the saves — which is exactly
    // the failure a test written only against the array cannot see.
    for (const [index, actionId] of SAVED_ACTION_INDEX_MEANS) {
      expect(actionIndexOf(actionId), `"${actionId}" is no longer declared, or no longer at index ${index}`).toBe(index);
    }
  });

  it('accounts for every entry in the catalogue, so a new action cannot arrive unrecorded', () => {
    // Without this, appending is free *and unrecorded*: the assertions above
    // are all prefix checks and would stay green while the array grew entries
    // nobody had thought about the index of. The message names the only safe
    // remedy so that the next reader does not reach for the other one.
    expect(
      DEFAULT_ACTIONS.length,
      'DEFAULT_ACTIONS has an entry SAVED_ACTION_INDEX_MEANS does not account for. If you appended, add it to the end of that table. If you inserted, do not: every save on disk is now misreading its prisoners',
    ).toBe(SAVED_ACTION_INDEX_MEANS.length);
  });

  it('put the new entry at the end rather than beside its category siblings', () => {
    // The instance, stated separately from the rule. `action.free-association`
    // reads naturally next to the two recreation entries and that is precisely
    // where it must not go: index 5 and 6 already mean something on disk.
    expect(DEFAULT_ACTIONS[DEFAULT_ACTIONS.length - 1]!.id).toBe('action.free-association');
  });
});

/**
 * # Which categories have content, and how much of a day the ones without cost
 *
 * A census in the shape `tests/foundation/unconsumed-action-contract.test.ts`
 * uses for input actions: state the fact, gate the direction that is a defect,
 * and make the record fail rather than rot when the fact changes.
 *
 * `free-association` was declared in `ACTION_CATEGORIES` at issue #24, allowed
 * by two of `GENERAL_POPULATION_REGIME`'s ten blocks and by half of
 * `RIOT_ALLOWED_CATEGORIES`, and had no action for the whole of that time. No
 * test could see it, because every test that touched the catalogue started from
 * the catalogue. This one starts from the *schedules*.
 */

const CATEGORIES_WITH_NO_ACTION: Readonly<Record<string, string>> = {
  work: 'Declared in `ACTION_CATEGORIES` and allotted 1,000 of `GENERAL_POPULATION_REGIME`\'s 2,400 daily ticks across two blocks, with nothing authored under it. Deliberate and deferred rather than overlooked: a `work` action needs somewhere to work and something to be worth, which is [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md) step 6 and `docs/ROADMAP.md` phase 9. Both blocks also allow `education`, so they are not empty — they resolve for a prison that has zoned and furnished a classroom, and for no other. ADR 0042 records the cheaper interim if step 6 slips: drop `work` from the two schedules rather than author it badly.',
};

/** Every category any shipped or runtime-built schedule can put in front of `beginNextAction`. */
function categoriesReachableFromSchedules(schedules: readonly RegimeSchedule[]): readonly ActionCategory[] {
  const seen = new Set<ActionCategory>();
  for (const schedule of schedules) {
    for (const block of schedule.blocks) {
      for (const category of block.allowedCategories) seen.add(category);
    }
  }
  return [...seen].sort();
}

/**
 * Ticks of one day this schedule leaves a **housed prisoner in a prison with
 * nothing zoned but cells** with no action that can resolve.
 *
 * `resolveTargetInstance` answers an `own-accommodation` target from the
 * prisoner's own instance id and a `room-catalog-id` target from the registry,
 * so in a cell-only prison the second kind resolves to nothing whatever the
 * catalogue says. That makes "has an authored action" the wrong question and
 * this the right one: a block whose only authored actions all name a room the
 * player has not built is a block the prisoner stands through.
 */
function idleTicksPerDayInACellOnlyPrison(schedule: RegimeSchedule): number {
  let ticks = 0;
  for (const block of schedule.blocks) {
    const resolvable = DEFAULT_ACTIONS.some(
      (action) => block.allowedCategories.includes(action.category) && action.target.kind === 'own-accommodation',
    );
    if (!resolvable) ticks += block.endTickOfDay - block.startTickOfDay;
  }
  return ticks;
}

describe('every action category a schedule can allow, measured against the catalogue', () => {
  it('accounts for each category with no action at all, with a reason', () => {
    const covered = new Set(DEFAULT_ACTIONS.map((action) => action.category));
    const uncovered = ACTION_CATEGORIES.filter((category) => !covered.has(category));

    expect(
      uncovered.filter((category) => CATEGORIES_WITH_NO_ACTION[category] === undefined),
      'a regime category with no entry in DEFAULT_ACTIONS. A schedule block allowing only this category leaves beginNextAction with an empty candidate list and increments unmetDemandCycles for the whole block: author an action, or record the category here with what is true about it today',
    ).toEqual([]);

    for (const [category, reason] of Object.entries(CATEGORIES_WITH_NO_ACTION)) {
      expect(reason.trim().length, `${category} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('holds no entry for a category that has since gained an action', () => {
    // The direction that makes the list a gate rather than a note, copied from
    // `unconsumed-action-contract.test.ts`. Authoring `work` fails here until
    // its entry goes, so the record cannot outlive the fact — which is the
    // failure mode that let `free-association` sit uncovered for as long as it
    // did, with `riot-regime.ts`'s header describing it as though it existed.
    const covered = new Set<string>(DEFAULT_ACTIONS.map((action) => action.category));
    expect(
      Object.keys(CATEGORIES_WITH_NO_ACTION).filter((category) => covered.has(category)),
      'these categories now have an action: delete their CATEGORIES_WITH_NO_ACTION entries in the same change',
    ).toEqual([]);
  });

  it('still declares every category the list names', () => {
    const declared = new Set<string>(ACTION_CATEGORIES);
    expect(
      Object.keys(CATEGORIES_WITH_NO_ACTION).filter((category) => !declared.has(category)),
      'a category this list accounts for is no longer in ACTION_CATEGORIES: delete the entry in the same change, and its message key with it',
    ).toEqual([]);
  });

  it('reaches every category it declares from a schedule, so none is vocabulary alone', () => {
    // Vacuity guard and a fact worth stating: the categories are not a list
    // somebody might one day schedule. Every one of the seven is allowed by a
    // block of a schedule this repository ships or builds at runtime, so an
    // uncovered category is time a prisoner really spends.
    const reachable = categoriesReachableFromSchedules([...DEFAULT_REGIME_SCHEDULES, buildRiotRegimeSchedule('general-population')]);
    expect(reachable).toEqual([...ACTION_CATEGORIES].sort());
  });

  it('measures how much of each schedule a cell-only prison cannot serve', () => {
    /*
     * **The number this change exists to move, and the two it does not.**
     *
     * The riot schedule was 2,400 of 2,400 — a full day, every day the riot
     * lasted, with `beginNextAction` reaching its empty-candidate path at
     * `action-system.ts:427` on every one of the 120 reconsiderations. Both
     * `RIOT_ALLOWED_CATEGORIES` are authored, so a catalogue-only reading said
     * the riot was covered; both recreation actions target a zoned room, so in
     * a prison with no yard and no common room it was not.
     *
     * The other two do not move, and saying so is the honest half of the
     * report. `GENERAL_POPULATION_REGIME`'s 1,200 is its two `work`/`education`
     * blocks (1,000) and its one `recreation`-only block (200); the two blocks
     * that allow `free-association` also allow `hygiene`, and
     * `action.use-toilet` is an `own-accommodation` action, so those 400 ticks
     * were already served. `HIGH_RISK_REGIME`'s 200 is its supervised-yard
     * block. Both are ADR 0042's later steps, not this one.
     */
    const general = DEFAULT_REGIME_SCHEDULES.find((schedule) => schedule.classificationGroupId === 'general-population')!;
    const highRisk = DEFAULT_REGIME_SCHEDULES.find((schedule) => schedule.classificationGroupId === 'high-risk')!;

    expect({
      generalPopulation: idleTicksPerDayInACellOnlyPrison(general),
      highRisk: idleTicksPerDayInACellOnlyPrison(highRisk),
      riot: idleTicksPerDayInACellOnlyPrison(buildRiotRegimeSchedule('general-population')),
      dayLengthTicks: DAY_LENGTH_TICKS,
    }).toEqual({
      generalPopulation: 1_200,
      highRisk: 200,
      riot: 0,
      dayLengthTicks: 2_400,
    });
  });
});
