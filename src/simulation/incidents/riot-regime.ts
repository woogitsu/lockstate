import { DAY_LENGTH_TICKS, type ActionCategory, type RegimeSchedule } from '../prisoners/regime';

/**
 * The categories a rioting prisoner is restricted to. Issue #28 requires
 * "riot-specific candidate actions/regime override using the existing
 * utility/action framework" -- so a riot is expressed as an ordinary
 * `RegimeSchedule` swapped in for the sector's participants, *not* as a
 * new branch in `ActionSystem`/`utility-ai.ts`. `'free-association'`
 * (unstructured milling about) and `'recreation'` are what remains legal:
 * work, education, meals and scheduled hygiene all stop.
 *
 * **`'free-association'` named content that did not exist when this comment
 * was written, and now names `action.free-association`**
 * (`../prisoners/actions.ts`). Both `'recreation'` actions target a zoned
 * room, so until that entry was appended a rioting prisoner in a prison with
 * no yard and no common room had no candidate at all: `beginNextAction`
 * filtered the catalogue to two entries, resolved neither, and counted an
 * unmet demand cycle for every reconsideration of every day the riot lasted
 * ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * decision 1, which lists this comment as one of three describing behaviour
 * that could not happen).
 *
 * **Two things below this line still cannot happen, and this comment says so
 * rather than implying otherwise.** `applyRiotRegimeOverride` has no caller in
 * `src/`, and `ActionSystem` takes its schedule array as a `readonly`
 * constructor field with no setter -- so a live session has no way to enter
 * the regime this module builds. Both are ADR 0042 step 2's, not step 1's.
 */
export const RIOT_ALLOWED_CATEGORIES: readonly ActionCategory[] = ['free-association', 'recreation'];

/**
 * A full-day, single-block schedule -- every tick of the day allows only
 * the riot categories, so `resolveActiveRegimeBlock` finds a covering
 * block whatever the tick, exactly like the two default schedules'
 * gapless requirement.
 */
export function buildRiotRegimeSchedule(classificationGroupId: string): RegimeSchedule {
  return {
    classificationGroupId,
    blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: RIOT_ALLOWED_CATEGORIES }],
  };
}

/**
 * Swaps the riot schedule in for the named classification groups,
 * returning a *new* schedule array (the caller's original stays
 * untouched, so lifting the override is just going back to it). This is
 * the whole "regime override" mechanism -- `ActionSystem` needs no
 * changes at all, because it already resolves its schedule from whatever
 * array it was constructed with via `findRegimeSchedule`.
 */
export function applyRiotRegimeOverride(baseSchedules: readonly RegimeSchedule[], overriddenGroupIds: readonly string[]): readonly RegimeSchedule[] {
  return baseSchedules.map((schedule) =>
    overriddenGroupIds.includes(schedule.classificationGroupId) ? buildRiotRegimeSchedule(schedule.classificationGroupId) : schedule,
  );
}
