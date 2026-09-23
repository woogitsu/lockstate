import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRST_CELL_ROOM_ID, defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';

/**
 * **The one instruction a newcomer is given for a first cell, pinned against
 * the requirement list it describes (#933).**
 *
 * `hud.regime.roster-empty` is the sentence an empty Regime roster draws, and
 * it is the only thing in the game that tells a player who has never built
 * anything what to build. Until 2026-09-19 it named **one** of `room.cell`'s
 * four authored requirements -- the bed -- and #933 measured what that costs:
 * a player who follows it literally builds a room that is short a toilet, and
 * the panel that would say so arrives selected on a different room type.
 *
 * The owner ruled on 2026-09-19 that their 2026-09-03 sentence be corrected in
 * place rather than supplemented. `AGENTS.md`'s fourth reservation, as narrowed
 * on 2026-09-04, makes the **choice of words** ours and leaves the requirement
 * that the sentence be **true** with the owner -- so the wording is a decision
 * and its completeness is a contract, which is what this file is.
 *
 * ## What it asserts, and why it is a set comparison rather than four `toContain`s
 *
 * Four `expect(sentence).toContain(...)` calls would go green for ever if a
 * fifth requirement were authored on `room.cell` tomorrow: nothing would be
 * watching the *catalogue* side. So the table below is keyed by requirement
 * identity and compared against the shipped definition as a **set**, in both
 * directions:
 *
 * - a requirement authored with no phrase registered here fails, because the
 *   sentence has stopped being complete;
 * - a phrase registered here for a requirement the catalogue no longer carries
 *   fails, because the sentence has started naming something the code does not
 *   enforce -- the reservation-4 defect in the other direction.
 *
 * **The mutation to watch it on** (stated per `AGENTS.md`, and run): delete
 * `{ type: 'object', objectId: 'object.toilet', minQuantity: 1 }` from
 * `room.cell` in `src/content/room-catalog.ts` and the set comparison goes red.
 *
 * ## The enforcement sites, checked rather than cited
 *
 * A sentence is true of a requirement only because something refuses or reports
 * on it, and `docs/AGENT_WORKFLOW.md` §4 is about citations that rot. So the
 * second `describe` opens each enforcement site and requires the call that does
 * the work to still be there. The four are not enforced in one place and that
 * asymmetry is the point:
 *
 * - `minimum-size` and `enclosed` are **refusals at designation time**, in
 *   `RoomZoningService.zone` (`refuse('below-minimum-size', ...)` and
 *   `refuse('not-enclosed', ...)`);
 * - the two `object` requirements are **advisory at designation time** and are
 *   evaluated afterwards by `room-projection.ts`, which is why a cell can be
 *   zoned with neither a bed nor a toilet in it (#938 §5).
 *
 * No figure from the catalogue is quoted in the sentence -- not `2 x 3`, not
 * `6` tiles -- because those are content and a hard-coded sentence drifts the
 * moment the content moves. The Rooms panel states them from the catalogue
 * (`hud.rooms.minimum`), and this file only requires that the *kind* of each
 * requirement be named.
 */

const SRC_ROOT = join(__dirname, '../../src');

const ROSTER_EMPTY_KEY = 'hud.regime.roster-empty';

/**
 * The identity of one authored requirement, as this file keys its table by:
 * the requirement kind, and for `object` the object it names.
 *
 * `minQuantity` is deliberately not part of the key. The sentence says "a bed
 * and a toilet" without a count, so a catalogue that raised a cell to two beds
 * would not falsify it, and a key carrying the quantity would fail a test whose
 * subject had not changed.
 */
function requirementKey(requirement: { readonly type: string; readonly objectId?: string }): string {
  return requirement.type === 'object' ? `object:${requirement.objectId ?? ''}` : requirement.type;
}

/**
 * The phrase each requirement must appear as, in each shipped catalogue.
 *
 * Regular expressions rather than substrings so a rewording that keeps the
 * fact -- "walled all round" to "walled in on every side" -- is not a false
 * failure, while dropping the fact is a real one.
 */
const REQUIRED_PHRASES: Readonly<Record<string, { readonly en: RegExp; readonly pl: RegExp }>> = {
  enclosed: { en: /\bwalled\b/i, pl: /ścian/i },
  'minimum-size': { en: /\bbig enough\b/i, pl: /dość dużą/i },
  'object:object.bed': { en: /\bbed\b/i, pl: /łóżk/i },
  'object:object.toilet': { en: /\btoilet\b/i, pl: /toalet/i },
};

function cellRequirementKeys(): readonly string[] {
  // `FIRST_CELL_ROOM_ID` and not a literal (#935): the Rooms panel opens on
  // the same id, so the room this sentence is checked against and the room the
  // panel teaches first are one declaration.
  const definition = defaultRoomContentRegistry.getById(FIRST_CELL_ROOM_ID);
  expect(definition, `the shipped catalogue no longer declares \`${FIRST_CELL_ROOM_ID}\``).toBeDefined();
  return definition!.requirements.map((requirement) => requirementKey(requirement)).sort();
}

describe('the first-cell instruction names every requirement a cell has', () => {
  it('registers a phrase for exactly the requirements `room.cell` authors', () => {
    expect(cellRequirementKeys()).toEqual(Object.keys(REQUIRED_PHRASES).sort());
  });

  it('names each of them in the English sentence a new prison draws', () => {
    const sentence = defaultMessageCatalogEn.messages[ROSTER_EMPTY_KEY];
    expect(sentence, `${ROSTER_EMPTY_KEY} is not in the English catalogue`).toBeTypeOf('string');
    for (const key of cellRequirementKeys()) {
      const phrase = REQUIRED_PHRASES[key];
      expect(phrase, `no English phrase is registered for the requirement \`${key}\``).toBeDefined();
      expect(
        sentence,
        `the only instruction a newcomer gets does not name \`${key}\`: ${String(sentence)}`,
      ).toMatch(phrase!.en);
    }
  });

  it('names each of them in the Polish counterpart, which must not drift from it', () => {
    // #890 and #1309 are the live failure mode this case exists against: an
    // English string corrected and its Polish counterpart left saying the old
    // thing. A key absent from `locale-pl.ts` falls back to English and is a
    // valid shipping state (`second-locale-contract.test.ts`); a key that is
    // *present* and incomplete is not.
    const sentence = messageCatalogPl.messages[ROSTER_EMPTY_KEY];
    expect(sentence, `${ROSTER_EMPTY_KEY} is not in the Polish catalogue`).toBeTypeOf('string');
    for (const key of cellRequirementKeys()) {
      expect(
        sentence,
        `the Polish instruction does not name \`${key}\`: ${String(sentence)}`,
      ).toMatch(REQUIRED_PHRASES[key]!.pl);
    }
  });
});

describe('the four requirements are still enforced where the sentence assumes', () => {
  const zoning = readFileSync(join(SRC_ROOT, 'simulation/rooms/zoning.ts'), 'utf8');
  const projection = readFileSync(join(SRC_ROOT, 'simulation/presentation/room-projection.ts'), 'utf8');

  it('refuses a rectangle under the authored minimum, at designation time', () => {
    expect(zoning).toContain("refuse('below-minimum-size', request, tick)");
    expect(zoning).toContain('minimumSizeRequirement(definition)');
  });

  it('refuses a room whose own perimeter is open, at designation time', () => {
    expect(zoning).toContain("refuse('not-enclosed', request, tick");
    expect(zoning).toContain('roomPerimeterEnclosure(this.world, request)');
  });

  it('evaluates the object requirements after designation rather than refusing on them', () => {
    // The asymmetry #938 §5 measured: a `room.cell` with no bed and no toilet
    // is accepted. So the sentence's bed and toilet are reported by the
    // projection, and `zone` must not have grown a refusal for them.
    expect(projection).toContain("requirement.type === 'object'");
    expect(zoning).not.toMatch(/refuse\('missing-object'/);
  });
});
