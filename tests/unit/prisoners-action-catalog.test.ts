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
 * rather than inserted, and appended is why 0–7 still read as they did. Index 9
 * is `action.laundry-work` ([ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)),
 * appended for the same reason and behind the same gate. Index 10 is
 * `action.kitchen-work` (#532), appended for the same reason again -- the
 * third entry in a row to arrive at the end, which is what this table exists
 * to keep true.
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
  [9, 'action.laundry-work'],
  [10, 'action.kitchen-work'],
  [11, 'action.carry'],
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

  it('put each new entry at the end rather than beside its category siblings', () => {
    // The instances, stated separately from the rule. `action.free-association`
    // reads naturally next to the two recreation entries, `action.laundry-work`
    // next to `action.shower`, whose need it shares, `action.kitchen-work`
    // next to `action.eat-meal`, whose need it shares, and `action.carry` next
    // to the other two `work` entries -- and all four are precisely where they
    // must not go: indices 1, 4, 5, 6, 9 and 10 already mean something on disk.
    expect(DEFAULT_ACTIONS[DEFAULT_ACTIONS.length - 1]!.id).toBe('action.carry');
    expect(DEFAULT_ACTIONS[DEFAULT_ACTIONS.length - 2]!.id).toBe('action.kitchen-work');
    expect(DEFAULT_ACTIONS[DEFAULT_ACTIONS.length - 3]!.id).toBe('action.laundry-work');
    expect(DEFAULT_ACTIONS[DEFAULT_ACTIONS.length - 4]!.id).toBe('action.free-association');
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
  /*
   * **Empty, and an empty list is the assertion rather than the absence of
   * one.** `work` was the last entry and it went with `action.laundry-work`
   * ([ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md));
   * `free-association` went with `action.free-association` before it (ADR 0042
   * decision 1). The three assertions below all still run against it: the first
   * fails if a category is ever added to `ACTION_CATEGORIES` without content
   * and without a reason written here, and the other two fail if an entry
   * outlives the fact it records. Deleting the map would delete all three.
   */
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
     * **The number this change exists to move, and it is now zero for all
     * three.**
     *
     * `GENERAL_POPULATION_REGIME` was 1,200 of 2,400 -- its two
     * `work`/`education` blocks (1,000) and its one `recreation`-only block
     * (200), every category in all three being served only by an action that
     * names a zoned room. `HIGH_RISK_REGIME` was 200, its supervised-yard
     * block. The riot schedule was 2,400 until ADR 0042 decision 1 appended
     * `action.free-association`, and has been 0 since.
     *
     * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
     * adds `'free-association'` to those four blocks, which is what takes the
     * other two to zero. It is not the same fix as authoring `work`:
     * `action.laundry-work` names `room.laundry` and so moves none of these
     * numbers, because this function counts blocks with no
     * `own-accommodation` candidate and a work action in a room is not one.
     * Both landed together and only one of them is measured here.
     */
    const general = DEFAULT_REGIME_SCHEDULES.find((schedule) => schedule.classificationGroupId === 'general-population')!;
    const highRisk = DEFAULT_REGIME_SCHEDULES.find((schedule) => schedule.classificationGroupId === 'high-risk')!;

    expect({
      generalPopulation: idleTicksPerDayInACellOnlyPrison(general),
      highRisk: idleTicksPerDayInACellOnlyPrison(highRisk),
      riot: idleTicksPerDayInACellOnlyPrison(buildRiotRegimeSchedule('general-population')),
      dayLengthTicks: DAY_LENGTH_TICKS,
    }).toEqual({
      generalPopulation: 0,
      highRisk: 0,
      riot: 0,
      dayLengthTicks: 2_400,
    });
  });

  it('names the individual block if one is ever authored with nowhere for a housed prisoner to go', () => {
    /*
     * **The class, not the instance.** The measurement above is a total, and a
     * total goes back up by 200 without saying which of thirteen blocks did
     * it. This one fails with the block's own bounds and categories in the
     * message, and it is the assertion a *future* schedule has to satisfy --
     * the failure mode ADR 0054 exists to close is a block authored out of
     * room-gated categories alone, which reads perfectly well until a player
     * has not built the room.
     *
     * Deliberately phrased over every schedule this repository ships or builds
     * at runtime, including the riot one, rather than over the two the module
     * checks for gaplessness at load: `buildRiotRegimeSchedule` is exactly the
     * schedule that had this defect and exactly the one `assertGaplessSchedule`
     * never sees.
     */
    const schedules = [...DEFAULT_REGIME_SCHEDULES, buildRiotRegimeSchedule('general-population')];
    const strandingBlocks: string[] = [];

    for (const schedule of schedules) {
      for (const block of schedule.blocks) {
        const terminal = DEFAULT_ACTIONS.filter(
          (action) => block.allowedCategories.includes(action.category) && action.target.kind === 'own-accommodation',
        );
        if (terminal.length === 0) {
          strandingBlocks.push(`${schedule.classificationGroupId} [${block.startTickOfDay},${block.endTickOfDay}) allows ${block.allowedCategories.join('+')}`);
        }
      }
    }

    expect(
      strandingBlocks,
      'this block allows only categories whose every action names a zoned room, so a housed prisoner in a prison that has not built one stands through the whole of it and beginNextAction counts an unmet demand cycle for every reconsideration. Give the block a category with an own-accommodation action -- free-association is the one authored for this -- or author the roomless action the block needs',
    ).toEqual([]);
  });

  it('cannot pass by there being no room-gated action left to strand anybody', () => {
    /*
     * The vacuity guard for the assertion above, and it is not a formality:
     * if every action in the catalogue targeted `own-accommodation` the check
     * would be unfailable and would still read as a strong statement. Six of
     * the eleven name a room, so the property being asserted is a real one
     * about how the blocks are composed.
     */
    const roomGated = DEFAULT_ACTIONS.filter((action) => action.target.kind === 'room-catalog-id');
    expect(roomGated.length).toBeGreaterThan(0);
    expect(roomGated.map((action) => action.id)).toContain('action.laundry-work');
  });

  it('gives the work category a room a player can zone and furnish, and exactly one entry that is an errand instead', () => {
    /*
     * What ADR 0054 decided about `work`, stated where a future edit would
     * trip over it. The measurement it rests on is that no block anywhere
     * allows `work` alone -- so an `own-accommodation` work action would have
     * closed no gap and would only have duplicated `action.free-association`,
     * which is the "author it badly" ADR 0042 step 6 warned against.
     *
     * **`action.carry` is the one entry that is neither, and that is
     * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decision 1.**
     * This assertion read *"a work action must name a room"* over the whole
     * category, and the sentence is kept for the two room shifts and
     * deliberately not extended to the errand: a carry has no room to gate on
     * and no ceiling to read, because the job's `available -> assigned`
     * transition *is* the claim and the ceiling on how many prisoners carry is
     * how many jobs are on the board. It is still not an `own-accommodation`
     * terminal either -- which is the property ADR 0054's argument above is
     * actually about -- so the `job-board` kind is asserted by name rather
     * than by exclusion.
     */
    const work = DEFAULT_ACTIONS.filter((action) => action.category === 'work');
    expect(work.map((action) => action.id)).toEqual(['action.laundry-work', 'action.kitchen-work', 'action.carry']);

    const errands = work.filter((entry) => entry.target.kind === 'job-board');
    expect(errands.map((entry) => entry.id)).toEqual(['action.carry']);
    for (const entry of errands) {
      expect(entry.requiredObjectCapability, `${entry.id} targets a job, so there is no room capability to consume`).toBeUndefined();
      expect(entry.needEffectsPerTick, `${entry.id} serves the institution, not a need`).toEqual({});
    }

    const shifts = work.filter((entry) => entry.target.kind !== 'job-board');
    for (const entry of shifts) {
      expect(entry.target.kind, `${entry.id} is a work shift, so it must name a room`).toBe('room-catalog-id');
      expect(entry.requiredObjectCapability, `${entry.id} must consume an object capability, or its room admits everyone`).toBeDefined();
    }
    expect(shifts.map((entry) => (entry.target as { readonly roomCatalogId: string }).roomCatalogId)).toEqual(['room.laundry', 'room.kitchen']);
    expect(shifts.map((entry) => entry.requiredObjectCapability)).toEqual(['laundry', 'food-preparation']);

    const workOnlyBlocks = [...DEFAULT_REGIME_SCHEDULES, buildRiotRegimeSchedule('general-population')]
      .flatMap((schedule) => schedule.blocks)
      .filter((block) => block.allowedCategories.length === 1 && block.allowedCategories[0] === 'work');
    expect(workOnlyBlocks, 'a block allowing work alone would make this a room-gated block with no terminal').toEqual([]);
  });

  it('keeps the second route to a need slower than the first, as the catalogue already does', () => {
    /*
     * The convention `action.eat-in-cell` (3) against `action.eat-meal` (4)
     * and `action.common-room-recreation` (2) against `action.yard-recreation`
     * (3) set, stated over the pairs rather than about the new one, so it is a
     * property of the catalogue and not a restatement of one row.
     */
    const rateOf = (id: string, need: 'hunger' | 'hygiene' | 'recreation'): number =>
      DEFAULT_ACTIONS.find((action) => action.id === id)!.needEffectsPerTick[need]!;

    expect(rateOf('action.eat-in-cell', 'hunger')).toBeLessThan(rateOf('action.eat-meal', 'hunger'));
    expect(rateOf('action.common-room-recreation', 'recreation')).toBeLessThan(rateOf('action.yard-recreation', 'recreation'));
    expect(rateOf('action.laundry-work', 'hygiene')).toBeLessThan(rateOf('action.shower', 'hygiene'));
    expect(rateOf('action.kitchen-work', 'hunger')).toBeLessThan(rateOf('action.eat-meal', 'hunger'));
    expect(rateOf('action.kitchen-work', 'hunger')).toBeLessThan(rateOf('action.eat-in-cell', 'hunger'));
  });
});
