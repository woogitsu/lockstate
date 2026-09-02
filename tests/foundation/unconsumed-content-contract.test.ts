import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { defaultContrabandRegistry } from '../../src/content/contraband-catalog';
import { defaultItemRegistry } from '../../src/content/item-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import type { ContentEntry, ContentRegistry } from '../../src/content/registry';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { defaultSecurityGradeRegistry } from '../../src/content/security-grade-catalog';
import { defaultStaffRoleRegistry } from '../../src/content/staff-role-catalog';

/**
 * A declared content id that nothing references cannot be removed without
 * someone reading why it is there.
 *
 * That is the point, and it is not the same as finding dead content. Issue
 * #141 opens with a warning that `room.delivery-bay`, `room.storage-room`
 * and `object.loading-dock-door` are all unreferenced *and* load-bearing --
 * ADR 0017 names them as the intended physical route for material
 * procurement and #99 makes the storeroom the salvage destination -- so
 * deleting them as dead content would remove what two decisions rest on.
 * Until now that warning lived only in an issue body. This makes it fail a
 * gate.
 *
 * **Two of those three are still here; the dock door graduated.** ADR 0028
 * phase 4 gave `object.loading-dock-door` a buildable, so it has a consumer and
 * the stale-entry gate below required its entry to go. Its protection is
 * *stronger* without the entry, not weaker: `validateBuildableObjectReferences`
 * throws at import if the id leaves the catalogue while a buildable names it,
 * which is a louder failure than a list with a reason on it. That is the
 * intended exit from this file -- an id leaves because something started using
 * it -- and it is worth recording that the first id to take it was one of the
 * three #141 was worried about.
 *
 * The measurement it also delivers is #141's own recommendation 1: turn
 * "declared but unconsumed" from something four agents rediscover into a
 * line of output. `#97`'s `'brick'`/`'item.brick'` split went unnoticed for
 * exactly this reason -- two vocabularies that had never met, because
 * nothing had ever supplied a material through the catalog.
 *
 * ## What counts as a consumer
 *
 * A reference to the id as a single-quoted literal, in any `.ts` file under
 * `src/` or `tests/`, **excluding `src/content/` itself**. Content
 * referencing content is not consumption: 19 of the 20 object ids appear in
 * some room's `requirements`, which says the catalogs agree with each other
 * and nothing about whether the game uses them.
 *
 * Counting `tests/` is a deliberate weakening. The stricter measure -- no
 * consumer in `src/` outside the catalogs -- is the honest answer to "does
 * the game use this", and it covers 52 of the 62 declared ids. Gating that
 * would mean 52 allowlist entries whose reason is uniformly "the system that
 * would use it is not wired yet", edited on every feature that wires one.
 * (Both figures are computed and asserted in the first case below, because
 * this sentence carried 58 for as long as it did without anything
 * recomputing it -- nine ids already had a `src/` consumer when it was
 * written.)
 * `tests/helpers/simulation-enum-source.ts` already argues this trade-off for enum
 * discovery, and its conclusion applies here: "a list nobody reads enforces
 * nothing". So the gate is the narrower set, and the wider number is a
 * measurement reported in #141 rather than a list maintained here.
 */

const ROOT = join(__dirname, '../..');

/**
 * Ids an accepted or merged decision depends on. **Deleting one of these is
 * a defect**, not a cleanup -- which is what separates this list from the
 * one below it.
 *
 * **One entry, and the sentence above it used to say two.** Both corrections
 * are marked rather than overwritten (`docs/AGENT_WORKFLOW.md` §4: *"a sentence
 * asserting an absence or a count rots first"*), because each records a
 * graduation that really happened:
 *
 * - *"Two entries, not three: `object.loading-dock-door` left with ADR 0028
 *   phase 4, which made it placeable."* Still true. See the file docblock for
 *   why that strengthens rather than weakens what #141 asked for.
 * - `room.delivery-bay` left on 2026-08-30, in commit `71617799` (#610/#585),
 *   by the weakened measure this file gates on: it gained a *test* consumer and
 *   no `src/` consumer, so the stale-entry gate below required its row to go.
 *   The count and the sentence *"Both survivors are **rooms**"* were not
 *   updated with it, which is what this paragraph fixes -- and the id is
 *   materially less protected than the sentence claimed for the two days that
 *   followed, since a test naming a room is all that now stands between it and
 *   a sweep. Its reason had read: *"ADR 0017 names it the intended physical
 *   route for material procurement; #141 flags it explicitly as not to be
 *   removed as dead content."* Every word of that is still true of ADR 0017
 *   decision 4, and `tests/foundation/job-production-contract.test.ts`
 *   measures how far the route is from existing.
 *
 * The survivor is a **room**, and that is not a coincidence -- a room id has no
 * import-time validator behind it the way an object id named by a buildable now
 * does, so this list is the only thing standing between it and a sweep.
 */
const PROTECTED_BY_DECISION: Readonly<Record<string, string>> = {
  'room.storage-room': 'ADR 0017 (destination for procured materials) and #99 (destination for dismantle salvage) both depend on it; #141 flags it explicitly.',
};

/**
 * Declared, referenced by nothing, and named by no decision. Inert rather
 * than protected -- but still not removable without a reader, because the
 * distinction between these two lists is a judgement the owner makes and not
 * one a sweep can make for them (#141: *"'has no consumer' and 'is dead' are
 * not the same statement"*).
 *
 * The reasons are deliberately not roadmaps. Each states what is verifiably
 * true about the id today; inventing a plan for it would be the
 * invented-consequence defect this repository spends the most effort on.
 */
const AWAITING_CONSUMER: Readonly<Record<string, string>> = {
  // Rooms. No room id is referenced from anywhere at all -- not from another
  // catalog, not from a test -- so these are the rooms with no reader of any
  // kind.
  //
  // `room.holding-cell` left this list with the Rooms tab, and by the narrow
  // route ADR 0022 predicted for exactly this gate: *"a producer that projects
  // the catalog generically names no room id, so it moves nothing by itself; a
  // test that zones a particular room type moves that one id."* That is what
  // happened. `roomCatalogue()` in `src/main.ts` projects all 18 rooms without
  // naming one, and `tests/unit/rooms-zoning.test.ts` names this one because it
  // is the room whose authored 2x2 minimum makes a rectangle `room.cell`
  // refuses legal -- which is how that test proves the minimum comes from
  // content rather than from a constant the service holds.
  'room.garbage-room': 'Declared with no reader anywhere; no build order, job, need or regime action names it.',
  // `room.kitchen` left this list at #532, and by the wide route rather than
  // the narrow one: `action.kitchen-work` names it in
  // `src/simulation/prisoners/actions.ts`, so both measures move. Its entry is
  // removed rather than reworded, which is what the stale-entry gate below
  // asks for. Its read was: *"Declared with no reader anywhere."*
  // `room.reception` and `room.security-office` left this list at #528, and
  // their entries are gone rather than reworded, which is what the stale-entry
  // gate below asks for. **Both directions, because the reason one of them gave
  // has not been falsified.** `room.reception`'s read: *"Declared with no reader
  // anywhere. Intake has an admission path now (#261), but it names no reception
  // room: `IntakeSystem`'s `'reception'` stage is a stage of the arrival record
  // rather than a place, and the only room ids the pipeline names are the
  // accommodation targets `room.cell` and `room.solitary-cell`."* Every word of
  // that is still true -- no `src/` file names either room, which is why
  // `unconsumedBySrcOnly` does not move -- and its own preamble, kept below,
  // records that the entry had already survived one wrong reason.
  //
  // What gained them a consumer is `tests/unit/hud-projections.test.ts`, which
  // furnishes one of each to pin the requirement rule #528 made countable: a
  // reception holding a security console reads its **desk** requirement
  // satisfied, because a console declares everything a desk does; a security
  // office holding two desks reads its console requirement missing, for want of
  // `'surveillance'`. The pair are the only two rooms in the catalogue that can
  // state that asymmetry -- `object.security-console` is required by
  // `room.security-office` alone -- so the test could not be written without
  // naming them. Same graduation route as `room.infirmary` and
  // `object.storage-rack` above: a test that stands a particular object in a
  // particular room type moves `unconsumedBySrcAndTests` and nothing else.
  //
  // The preamble `room.reception` carried, kept because it is the record of a
  // reason that expired without the id moving: it read "intake has no admission
  // path yet (#89)" until an admission path arrived -- `src/main.ts` handles an
  // `admit-prisoner` command (#261 step 4) and the HUD has a control that
  // produces it. That closed the stated reason without touching the id, which is
  // why a wrong reason is as much a defect here as a missing entry -- the next
  // reader would have deleted that line on the strength of the admission path
  // alone.
  'room.staff-room': 'Declared with no reader anywhere.',
  'room.utility-room': 'Declared with no reader anywhere.',

  // Objects. All but one of these is required by some room definition, so
  // the catalogs agree; nothing places, builds or reads the object.
  //
  // `object.bench` and `object.dining-table` left this list with ADR 0028 phase
  // 1, and by the narrow route this gate's own docblock describes: the
  // placement mechanism it added names no object id, so it moves nothing by
  // itself, and `tests/helpers/determinism-scenario.ts` names those two because
  // they are what give a yard and a canteen a *concurrent-use* capacity that
  // survives a snapshot round trip -- a bed would have made them sleepable. So
  // both are now placed by something, in a test, which is consumption by this
  // gate's deliberately weakened measure. Neither has a `src/` consumer and
  // neither is a buildable: phase 4 is what offers them to a player.
  // `object.bed` did not move either list -- three test files already named it,
  // and its new `src/` consumer moves `unconsumedBySrcOnly` instead.


  // **No object ids left.** `object.sink` was the last, and it graduated the
  // same way `object.loading-dock-door` did: something started naming it.
  // `src/rendering/world/environment-art.ts` lists every catalogued object the
  // renderer draws as a coloured block rather than as artwork, and the sink is
  // on that list. The reason its old entry gave -- "required by NO room
  // definition, so nothing references it at all" -- is still true of the room
  // catalogue and is now beside the point here, because the reference the gate
  // measures exists. Its protection is stronger without the entry:
  // `tests/unit/environment-art.test.ts` asserts that the renderer's drawn and
  // fallback lists together are exactly the object registry's ids, so deleting
  // the sink from the catalogue fails a named test rather than passing quietly.

  // **No staff-role ids left, and all five graduated in one change.** ADR 0053
  // gave the security tier a post-eligibility rule, and
  // `tests/integration/security-post-eligibility.test.ts` asserts it against
  // the whole catalogue by name -- so `administrator`, `doctor`,
  // `kitchen-staff`, `maintenance-worker` and `security-chief` all gained a
  // single-quoted literal at once. That is the intended exit from this list:
  // an id leaves because something started using it.
  //
  // The entry that stood here for `staff-role.administrator` is worth quoting,
  // because it named its own exit condition and the exit condition was met:
  // *"The command itself accepts any declared role, so this id needs no code
  // change to become reachable -- it needs a system that reads its
  // department."* One reads it now (`POST_ELIGIBLE_STAFF_DEPARTMENTS`), and
  // what it decides for the six non-security roles is a refusal
  // (`hire.no-duty-for-role`) rather than a job. So these ids are *consumed*
  // by this gate's measure and still have no duty in the game, which is a
  // distinction this file cannot see and ADR 0053's Consequences record
  // instead.
  //
  // `unconsumedBySrcOnly` did not move with them: the rule reads a role's
  // `department` field and names no id, so `src/` still contains no literal
  // for any of the five. A rule over a *field* is invisible to a gate that
  // measures id literals, and that is the honest limit of the measure rather
  // than a hole in it.
};

interface Catalog {
  readonly label: string;
  readonly registry: ContentRegistry<ContentEntry>;
}

const CATALOGS: readonly Catalog[] = [
  { label: 'room', registry: defaultRoomContentRegistry },
  { label: 'object', registry: defaultObjectRegistry },
  { label: 'staff-role', registry: defaultStaffRoleRegistry },
  { label: 'item', registry: defaultItemRegistry },
  { label: 'contraband', registry: defaultContrabandRegistry },
  { label: 'security-grade', registry: defaultSecurityGradeRegistry },
];

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

/**
 * Files that enumerate content ids **in order to say nothing uses them**, and
 * therefore cannot count as a consumer of the ids they list.
 *
 * This file has always excluded itself, one line down, for exactly this reason.
 * It became a list when `room-routing-contract.test.ts` arrived: that file asks
 * the sibling question -- which catalogue rooms a *prisoner* can be routed into
 * -- and its allowlist necessarily names every room with no route, which is a
 * superset of the room ids this file lists. Scanned as an ordinary consumer, it
 * turned all five surviving room entries stale in one go
 * (`room.delivery-bay`, `room.storage-room`, `room.garbage-room`,
 * `room.staff-room`, `room.utility-room`), and the stale-entry gate below then
 * demanded their deletion.
 *
 * **That would have been a false graduation in the shape #188 already fixed
 * once.** There, a *comment* saying an id was wired nowhere counted as wiring
 * it, and the answer was to strip comments rather than to accept the reading.
 * Here the sentence is a `Record` key rather than a comment, so stripping
 * cannot see it, and the answer is the same in substance: the intended exit
 * from these lists is what this file's docblock says it is -- something starts
 * *using* the id -- and a file whose subject is the absence is not something
 * using it.
 *
 * Matched by suffix, not by path, so moving either file between directories
 * does not silently re-admit it.
 */
const SELF_DESCRIBING_ALLOWLISTS: readonly string[] = [
  'unconsumed-content-contract.test.ts',
  'room-routing-contract.test.ts',
];

const consumerSources = [...collectTypeScriptFiles(join(ROOT, 'src')), ...collectTypeScriptFiles(join(ROOT, 'tests'))]
  // Comments are stripped so an id discussed in prose does not read as a
  // reference. `stripComments` is the shared one: it removes a trailing `//`
  // comment as well as a whole-line one, which a local copy did not -- so a
  // comment saying an id is *not* wired anywhere used to count as wiring it
  // (#188).
  .map((path) => ({ where: relative(ROOT, path), text: stripComments(readFileSync(path, 'utf8')) }))
  // The catalogs declare the ids; they cannot be their own consumers. A file
  // whose *subject* is which ids nothing uses is excluded for the same reason:
  // its allowlist names every id it asserts about, so leaving it in would make
  // every entry consumed.
  .filter(
    (source) =>
      !source.where.startsWith(join('src', 'content')) &&
      !SELF_DESCRIBING_ALLOWLISTS.some((name) => source.where.endsWith(name)),
  );

const declaredIds = CATALOGS.flatMap((catalog) => catalog.registry.all().map((entry) => entry.id));
const unconsumedIds = declaredIds.filter((id) => !consumerSources.some((source) => source.text.includes(`'${id}'`)));

/**
 * The stricter measure the docblock above declines to gate: ids with no
 * consumer in `src/` at all, ignoring `tests/`.
 *
 * Computed rather than written down. The prose used to carry this as a hand
 * counted figure and it was wrong by five from the day it was written -- the
 * seven room ids `src/simulation/prisoners/actions.ts` and `intake-system.ts`
 * name, plus the two `src/simulation/construction/definition.ts` requires,
 * were already there when the sentence was typed (#141). A number in a comment
 * that nothing recomputes is exactly the kind of claim this directory exists
 * to stop.
 */
const unconsumedBySrcOnly = declaredIds.filter(
  (id) => !consumerSources.some((source) => source.where.startsWith(`src${sep}`) && source.text.includes(`'${id}'`)),
);

describe('every unconsumed content id is accounted for', () => {
  it('reports both measures, so the narrower gate below is read against a number', () => {
    /*
     * The denominator, exact in every direction. The docblock's argument for
     * gating the narrower set only holds against real numbers, and it was
     * made against a wrong one: it said the stricter measure "covers 58 of
     * the 62 declared ids" when it covered 53, because nine ids already had a
     * `src/` consumer when that sentence was written.
     *
     * Exact rather than `toBeGreaterThan`, because the failure mode this
     * guards is a number drifting quietly. A catalog gaining an id, or an id
     * gaining its first consumer, should be a visible change here.
     *
     * `unconsumedBySrcOnly` moved 53 -> 52 when ADR 0025 gave
     * `staff-role.guard` its first `src/` consumer: the Staff panel's
     * projection at the composition root names the one role a hire can
     * usefully create, because every system that reads the roster claims from
     * it without filtering on role. `unconsumedBySrcAndTests` did not move --
     * the id already had test consumers, so it is in neither allowlist and no
     * entry was added or deleted with it.
     *
     * It moved 52 -> 51 the same way when ADR 0028 phase 1 gave `object.bed`
     * its first `src/` consumer: `BUILDABLE_REGISTRY`'s `bed-wooden` row names
     * it as the object a completed order places, which is the first time any
     * `object.*` id is read by anything outside `src/content/`. And
     * `unconsumedBySrcAndTests` again did not move -- three test files already
     * named the bed, which is why it was in neither allowlist and why no entry
     * is added or deleted here either. That is the shape ADR 0028 predicted for
     * this gate: "`object.bed` holds no `AWAITING_CONSUMER` entry to delete, so
     * what moves is `unconsumedBySrcOnly` as it gains its first `src/`
     * consumer."
     *
     * It moved 51 -> 50 again, and for the same reason one phase later: ADR
     * 0028 phase 2's `toilet-brick` row names `object.toilet` as the object a
     * completed order places, which is that id's first `src/` consumer. Phase 2
     * predicted exactly this and nothing else -- "**Save:** no change.
     * **Gates:** `unconsumed-content-contract` counts only" -- and this line is
     * the whole of it. `unconsumedBySrcAndTests` again did not move, because
     * three test files already named the toilet, which is why it appears in
     * neither allowlist.
     *
     * It moved 50 -> 49 for a fourth time, on the change that made a completed
     * `door-wooden` order register a real door: `BUILDABLE_REGISTRY`'s
     * `door-wooden` row now names `'grade.general'` as the security grade the
     * door's clearance and permission come from, which is that id's first
     * `src/` consumer. The grade is named rather than a clearance number
     * because `createGradedDoor` requires it -- "a door gating entry into a
     * sector should be authored through this, not with hand-picked
     * `requiredSecurityClearance`/`requiredPermission` values that could
     * silently drift from the sector's own stated grade" -- so a door
     * buildable naming a grade is the shape that file asks for.
     * `unconsumedBySrcAndTests` again did not move: four test files already
     * name `grade.general`, which is why it appears in neither allowlist.
         *
     * **And then it moved a long way, on ADR 0028 phase 4.** That phase gives
     * every object id the room catalogue requires a `BUILDABLE_REGISTRY` row
     * that names it through `placesObjectId`, so seventeen `object.*` ids gain
     * their first `src/` consumer in one change -- which is why this triple
     * moves further here than on any change before it, and why the ADR
     * predicted the counts would "move substantially".
     *
     * The two measures move by **different amounts**, and the difference is the
     * whole reason this file reports both:
     *
     *   - `unconsumedBySrcOnly` falls by all seventeen, because every one of
     *     them is named in `src/simulation/construction/definition.ts` for the
     *     first time.
     *   - `unconsumedBySrcAndTests` falls by only fourteen. `object.bench`,
     *     `object.dining-table` and `object.storage-rack` were already named by
     *     a test -- `tests/helpers/determinism-scenario.ts` places the first two
     *     and `tests/unit/objects-room-capacity.test.ts` stands the third in a
     *     canteen -- so they were in neither allowlist and there is no entry to
     *     delete for them, exactly as `object.bed` and `object.toilet` had none
     *     in phases 1 and 2.
     *
     * `object.loading-dock-door` is the one id that leaves
     * `PROTECTED_BY_DECISION` rather than `AWAITING_CONSUMER`, and the stale
     * gate below is what requires that: it is now placeable, so it has a
     * consumer, so its entry is stale whatever the entry said. Nothing about
     * #141's warning is lost by the deletion -- the protection is *stronger*
     * afterwards, because `validateBuildableObjectReferences` throws at import
     * if the id is deleted from the catalogue, which is a louder failure than a
     * test listing a reason.
     *
     * `object.sink` was the one object id that stayed, and it has since gone
     * too. **Both directions are marked rather than overwritten**: the sentence
     * this replaces read *"`object.sink` is the one object id that stays, and
     * its entry is unchanged"*, and the ADR reason it gave -- "`object.sink` is
     * the one entry a room requirement does not reach, so it moves only if
     * something places it" -- has not been falsified. Nothing places a sink.
     * What changed is that something *names* it:
     * `src/rendering/world/environment-art.ts` declares which catalogued
     * objects the renderer has no artwork for, and the gate measures a
     * single-quoted literal rather than a placement
     */
    expect({
      declared: declaredIds.length,
      unconsumedBySrcAndTests: unconsumedIds.length,
      unconsumedBySrcOnly: unconsumedBySrcOnly.length,
      // 30, not 31: `object.storage-rack` gained a test consumer in
      // `tests/unit/objects-room-capacity.test.ts` and `tests/unit/prisoners-room-instance-registry.test.ts`,
      // which stand one in a canteen alongside four toilets -- the clutter issue
      // #326 measured admitting diners. Its entry is removed from the list above
      // rather than kept with a new reason, which is what this file's stale-entry
      // gate asks for. `unconsumedBySrcOnly` did not move: no `src/` file names
      // the rack, and a capability-scoped ceiling reads capabilities rather than
      // object ids.
      //
      // 16, not 15: `room.infirmary` gained a test consumer in
      // `tests/unit/hud-projections.test.ts`, which stands two `object.medical-bed`s
      // in one to prove that `accommodationCapacity` excludes the residency an
      // infirmary derives and `roomCapacity` includes it. Its entry is removed
      // from the list above rather than kept with a new reason, which is what
      // this file's stale-entry gate asks for. `unconsumedBySrcOnly` did not
      // move: no `src/` file names the room, because the projection reads the
      // room types out of an `AccommodationPolicy` rather than naming any.
      //
      // 31, not 33: `object.bench` and `object.dining-table` gained one in
      // `tests/helpers/determinism-scenario.ts`, which places both so a yard and
      // a canteen have a derived concurrent-use capacity (see their note in the
      // list above). It was 33, not 34, because `room.holding-cell` gained a single-quoted literal in
      // `tests/unit/rooms-zoning.test.ts` with the Rooms tab. That change left
      // `unconsumedBySrcOnly` alone -- the producer projects the catalogue
      // generically and names no room id, so nothing moved in `src/` -- and the
      // 53 -> 52 below is ADR 0025's alone, for the reason above. The two
      // measures moved on different changes and each is stated where it moved.
      //
      // 14 and 31, not 15 and 32: `object.sink` gained a `src/` consumer in
      // `src/rendering/world/environment-art.ts` (ADR 0052), which is the first
      // change to move *both* measures at once -- every previous graduation was
      // a test-only consumer. Its entry is removed from the list above rather
      // than kept with a new reason, which is what this file's stale-entry gate
      // asks for.
      //
      // 8 and 30, from a base of 14 and 31, because two changes landed in the
      // same window and each moved it differently.
      //
      // ADR 0053's integration test names five staff-role ids that nothing
      // outside the catalogue had named before, so `unconsumedBySrcAndTests`
      // falls by five while `unconsumedBySrcOnly` does not move at all -- the
      // rule those five feed reads their `department` and writes no id literal
      // into `src/`.
      //
      // ADR 0054 moves both by one: `action.laundry-work` names `room.laundry`
      // in `src/simulation/prisoners/actions.ts`, so the room a player could
      // zone and furnish to no effect now puts prisoners to work. Its entry is
      // removed above rather than reworded.
      //
      // Between them that is the pair ADR 0052's `object.sink` and ADR 0053's
      // staff roles illustrate: a consumer in `src/` moves both counts, a
      // consumer that only reads a field moves one.
      //
      // 6, not 8: `room.reception` and `room.security-office` gained test
      // consumers in `tests/unit/hud-projections.test.ts` at #528, where one of
      // each is furnished to pin that a security console satisfies a desk
      // requirement and a desk does not satisfy a console requirement. Their
      // entries are removed from the list above rather than kept with a new
      // reason. `unconsumedBySrcOnly` does not move: no `src/` file names either
      // room, because `requirementStatus` counts objects against whatever room
      // the instance says it is and writes no room id literal.
      //
      // 5 and 29, from 6 and 30: #532 moves both by one for ADR 0054's exact
      // reason one paragraph up. `action.kitchen-work` names `room.kitchen` in
      // `src/simulation/prisoners/actions.ts`, so the second room a player
      // could zone and furnish to no effect now puts prisoners to work.
      //
      // 4, not 5: `room.delivery-bay` gained a test consumer in
      // `tests/unit/content-catalogs.test.ts`, which names all three room types
      // the owner's ruling of 2026-08-29 (#585) tags as open areas so that a
      // *fourth* acquiring the tag fails. Its entry is removed from the list
      // above rather than kept with a new reason, which is what this file's
      // stale-entry gate asks for -- and the reason it carried is worth keeping
      // visible because nothing about it has been falsified: *"ADR 0017 names
      // it the intended physical route for material procurement; #141 flags it
      // explicitly as not to be removed as dead content."* Still true. Nothing
      // routes a delivery through it. What changed is that something *names*
      // it, which is the same graduation `object.sink` made through
      // `environment-art.ts` and the same caveat: this gate measures a
      // single-quoted literal, not a use.
      //
      // `unconsumedBySrcOnly` does not move, and `room.yard` and
      // `room.holding-cell` do not move at all: neither had an entry (both are
      // named in `src/`), and no `src/` file gained a `'room.delivery-bay'`
      // literal -- `isOpenAreaRoom` reads an authored field off whatever id it
      // is handed and writes no id of its own.
    }).toEqual({ declared: 62, unconsumedBySrcAndTests: 4, unconsumedBySrcOnly: 29 });
  });

  it('scans a non-trivial catalog and a non-trivial consumer set, so this cannot pass vacuously', () => {
    // Both halves can fail open: an empty consumer pool would make every id
    // unconsumed (loud), but a registry that silently returned nothing would
    // make the gate assert about nothing at all (silent). This is the second.
    expect(declaredIds.length).toBeGreaterThan(50);
    expect(new Set(declaredIds).size).toBe(declaredIds.length);
    expect(consumerSources.length).toBeGreaterThan(100);
  });

  it('lists every unconsumed id in exactly one of the two lists', () => {
    const unlisted = unconsumedIds.filter(
      (id) => PROTECTED_BY_DECISION[id] === undefined && AWAITING_CONSUMER[id] === undefined,
    );
    expect(
      unlisted,
      'a newly unconsumed id: add it to PROTECTED_BY_DECISION if a decision names it, otherwise to AWAITING_CONSUMER, with the reason',
    ).toEqual([]);

    const inBoth = Object.keys(PROTECTED_BY_DECISION).filter((id) => AWAITING_CONSUMER[id] !== undefined);
    expect(inBoth, 'an id is either named by a decision or it is not').toEqual([]);
  });

  it('gives every listed id a non-empty reason', () => {
    // A list of bare ids would record that they are unconsumed and lose the
    // only thing that makes it safe to read: why each one is still there.
    for (const [id, reason] of [...Object.entries(PROTECTED_BY_DECISION), ...Object.entries(AWAITING_CONSUMER)]) {
      expect(reason.trim().length, `${id} needs a reason`).toBeGreaterThan(20);
    }
  });

  /**
   * This is the assertion that protects the delivery bay, the dock door and
   * the storeroom. Removing one from its catalog fails here, with the reason
   * it was listed for in the failure message.
   */
  it('still declares every id either list names', () => {
    const declared = new Set(declaredIds);
    const removed = [...Object.keys(PROTECTED_BY_DECISION), ...Object.keys(AWAITING_CONSUMER)].filter(
      (id) => !declared.has(id),
    );
    expect(
      removed.map((id) => `${id}: ${PROTECTED_BY_DECISION[id] ?? AWAITING_CONSUMER[id]}`),
      'an id these lists account for is no longer declared -- if the removal is deliberate, delete its entry in the same change',
    ).toEqual([]);
  });

  it('holds no entry for an id that has since gained a consumer', () => {
    // Without this the lists only grow, and would eventually describe a state
    // the repository left behind -- the "allow-list that fails when an entry
    // goes stale" shape `tests/determinism/ambient-nondeterminism-contract.test.ts`
    // and `validateSimulationEnumGroupSource` both use.
    // Restricted to ids the catalogs still declare, so a *removed* id fails the
    // assertion above with its reason and does not also fail here claiming it
    // gained a consumer -- two failures, one of them a wrong diagnosis.
    const declared = new Set(declaredIds);
    const stale = [...Object.keys(PROTECTED_BY_DECISION), ...Object.keys(AWAITING_CONSUMER)].filter(
      (id) => declared.has(id) && !unconsumedIds.includes(id),
    );
    expect(stale, 'these ids now have a consumer: remove their entries').toEqual([]);
  });
});
