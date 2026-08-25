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
 */
const PROTECTED_BY_DECISION: Readonly<Record<string, string>> = {
  'room.delivery-bay': 'ADR 0017 names it the intended physical route for material procurement; #141 flags it explicitly as not to be removed as dead content.',
  'room.storage-room': 'ADR 0017 (destination for procured materials) and #99 (destination for dismantle salvage) both depend on it; #141 flags it explicitly.',
  'object.loading-dock-door': 'ADR 0017 names it as part of the procurement route; #141 flags it explicitly.',
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
  'room.infirmary': 'Declared with no reader anywhere.',
  'room.kitchen': 'Declared with no reader anywhere.',
  'room.laundry': 'Declared with no reader anywhere.',
  'room.reception': 'Declared with no reader anywhere; intake has no admission path yet (#89).',
  'room.security-office': 'Declared with no reader anywhere.',
  'room.staff-room': 'Declared with no reader anywhere.',
  'room.utility-room': 'Declared with no reader anywhere.',

  // Objects. All but one of these is required by some room definition, so
  // the catalogs agree; nothing places, builds or reads the object.
  'object.bench': "Required by a room definition; no code places or reads it.",
  'object.bookshelf': "Required by a room definition; no code places or reads it.",
  'object.chair': "Required by a room definition; no code places or reads it.",
  'object.desk': "Required by a room definition; no code places or reads it.",
  'object.dining-table': "Required by a room definition; no code places or reads it.",
  'object.fridge': "Required by a room definition; no code places or reads it.",
  'object.medical-bed': "Required by a room definition; no code places or reads it.",
  'object.medicine-cabinet': "Required by a room definition; no code places or reads it.",
  'object.prep-counter': "Required by a room definition; no code places or reads it.",
  'object.security-console': "Required by a room definition; no code places or reads it.",
  'object.shower-head': "Required by a room definition; no code places or reads it.",
  'object.storage-rack': "Required by a room definition; no code places or reads it.",
  'object.stove': "Required by a room definition; no code places or reads it.",
  'object.utility-panel': "Required by a room definition; no code places or reads it.",
  'object.washing-machine': "Required by a room definition; no code places or reads it.",
  'object.waste-bin': "Required by a room definition; no code places or reads it.",
  // The exception, and the more interesting entry: no room requires a sink.
  // `validateRoomObjectReferences` checks room -> object and not the reverse,
  // so an object no room asks for is unchecked by design. Which room should
  // require it -- shower room, canteen, kitchen, infirmary, all of them -- is
  // a content decision, so it is reported in #141 rather than guessed at here.
  'object.sink': 'Required by NO room definition, so nothing references it at all. The room-to-object validator does not check this direction.',

  // Staff roles. Three of the eight (guard, nurse, warden) are referenced
  // outside the catalogue -- and since ADR 0025 the guard is the one of those
  // three with a reader in `src/`, because it is the only role the Staff panel
  // offers. These five are referenced by nothing.
  'staff-role.administrator': 'Declared with no reader anywhere. Hiring exists since ADR 0025 and does not reach it: the Staff panel offers `staff-role.guard` alone, because every system that reads `GuardRoster` claims from `unassignedGuardIds()` without filtering on role, so anyone else hired into it would be sent to a patrol post. The command itself accepts any declared role, so this id needs no code change to become reachable -- it needs a system that reads its department.',
  'staff-role.doctor': 'Declared with no reader anywhere.',
  'staff-role.kitchen-staff': 'Declared with no reader anywhere.',
  'staff-role.maintenance-worker': 'Declared with no reader anywhere.',
  'staff-role.security-chief': 'Declared with no reader anywhere.',
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

const consumerSources = [...collectTypeScriptFiles(join(ROOT, 'src')), ...collectTypeScriptFiles(join(ROOT, 'tests'))]
  // Comments are stripped so an id discussed in prose does not read as a
  // reference. `stripComments` is the shared one: it removes a trailing `//`
  // comment as well as a whole-line one, which a local copy did not -- so a
  // comment saying an id is *not* wired anywhere used to count as wiring it
  // (#188).
  .map((path) => ({ where: relative(ROOT, path), text: stripComments(readFileSync(path, 'utf8')) }))
  // The catalogs declare the ids; they cannot be their own consumers. This
  // file is excluded for the same reason -- its allowlists name every id it
  // is asserting about, so leaving it in would make every entry consumed.
  .filter((source) => !source.where.startsWith(join('src', 'content')) && !source.where.endsWith('unconsumed-content-contract.test.ts'));

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
     */
    expect({
      declared: declaredIds.length,
      unconsumedBySrcAndTests: unconsumedIds.length,
      unconsumedBySrcOnly: unconsumedBySrcOnly.length,
      // 33, not 34: `room.holding-cell` gained a single-quoted literal in
      // `tests/unit/rooms-zoning.test.ts` with the Rooms tab. That change left
      // `unconsumedBySrcOnly` alone -- the producer projects the catalogue
      // generically and names no room id, so nothing moved in `src/` -- and the
      // 53 -> 52 below is ADR 0025's alone, for the reason above. The two
      // measures moved on different changes and each is stated where it moved.
    }).toEqual({ declared: 62, unconsumedBySrcAndTests: 33, unconsumedBySrcOnly: 52 });
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
