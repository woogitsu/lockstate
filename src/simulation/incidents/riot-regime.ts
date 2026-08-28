import {
  DAY_LENGTH_TICKS,
  type ActionCategory,
  type PrisonerRegimeOverrideResolver,
  type RegimeSchedule,
} from '../prisoners/regime';
import type { IncidentLog } from './incident';

/**
 * The categories a rioting prisoner is restricted to. Issue #28 requires
 * "riot-specific candidate actions/regime override using the existing
 * utility/action framework" -- so a riot is expressed as an ordinary
 * `RegimeSchedule` swapped in for its participants, *not* as a new branch
 * in `ActionSystem`/`utility-ai.ts`. `'free-association'` (unstructured
 * milling about) and `'recreation'` are what remains legal: work,
 * education, meals, scheduled hygiene and sleep all stop.
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
 * **The two things below this line that could not happen can now happen, and
 * this paragraph records both directions rather than overwriting one.** Until
 * [ADR 0057](../../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md)
 * this module's `applyRiotRegimeOverride` had no caller in `src/` and
 * `ActionSystem` took its schedule array as a `readonly` constructor field with
 * no setter, so a live session had no way to enter the regime this module
 * builds. Neither is true now, and neither was fixed the way that sentence
 * implied: `applyRiotRegimeOverride` swapped whole *classification groups* and
 * has been deleted, the schedule array is still `readonly` and still has no
 * setter, and what a session enters instead is a per-participant override
 * resolved at the point of use by `createRiotRegimeOverride` below.
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
 * The regime override a live session runs: **while a riot naming this prisoner
 * is still open, their classification group's timetable is replaced by
 * `buildRiotRegimeSchedule`; the moment it closes, the timetable stands again**
 * ([ADR 0057](../../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md),
 * answering [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * open question 1).
 *
 * ## Derived, never stored, and that is the whole of the persistence argument
 *
 * Nothing here holds state. The answer is a pure function of `IncidentLog`,
 * which the save already carries in full (`save-schema.ts`'s `incidents`
 * section), so a session restored mid-riot recomputes the same override without
 * a new payload key, a `SAVE_SCHEMA_VERSION` bump or a migration --
 * `IncidentLog.loadSnapshot` rebuilds the participant index the same way it
 * rebuilds `openIdsBySectorId`. It is the same reasoning ADR 0028 decision 6
 * applied to concurrent-use claims and ADR 0029 to their rebuild: a value that
 * is a function of state already in the payload must not be a second copy of it
 * in the payload, because the two can then disagree.
 *
 * ## There is no lift step, by construction
 *
 * The alternative -- a setter on `ActionSystem.regimeSchedules`, written when a
 * riot opens and rewritten when it closes -- needs every exit from an incident
 * to remember to undo it. `IncidentResponseSystem` has three (`resolved`,
 * `lapsed`, and `lapsed` for a response a save interrupted), and the care its
 * `liftLockdownNoOpenIncidentJustifies` already takes over exactly this
 * question is the argument against adding a second thing to lift down the same
 * three paths. Here the override ends because the incident is no longer open,
 * which is a fact `transition` establishes once for every reader.
 *
 * ## Per participant, not per classification group
 *
 * `IncidentRecord.participantIds` is the list the trigger resolved and recorded
 * (`trigger-system.ts`'s `openRiot`), so the prisoners whose day changes are
 * exactly the prisoners the record says rioted. The deleted
 * `applyRiotRegimeOverride` swapped by classification group instead, which with
 * one derived sector is the same set today and is the wrong set as soon as a
 * second sector exists: a riot in one wing would have restricted every
 * general-population prisoner in the prison, including those nowhere near it.
 * A participant id carries its `EntityStore` generation, so a record naming a
 * prisoner who has since been released cannot match the next occupant of that
 * index.
 *
 * ## The one schedule per group is built once
 *
 * `buildRiotRegimeSchedule` allocates, and this resolver is called once per
 * idle prisoner per reconsideration cycle. The schedule for a given
 * classification group is a constant, so it is memoised per group id rather
 * than rebuilt -- the map holds one entry per group that has ever rioted, which
 * is bounded by the classification groups that exist.
 */
export function createRiotRegimeOverride(incidents: IncidentLog): PrisonerRegimeOverrideResolver {
  const byClassificationGroupId = new Map<string, RegimeSchedule>();
  return (entityId, classificationGroupId) => {
    if (!incidents.isOpenRiotParticipant(entityId)) return undefined;
    let schedule = byClassificationGroupId.get(classificationGroupId);
    if (schedule === undefined) {
      schedule = buildRiotRegimeSchedule(classificationGroupId);
      byClassificationGroupId.set(classificationGroupId, schedule);
    }
    return schedule;
  };
}
