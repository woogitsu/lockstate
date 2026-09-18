import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { DEFAULT_ACCOMMODATION_POLICY, resolveAccommodationTargets } from '../../src/simulation/prisoners/intake-system';

/**
 * **The resident ceilings the owner ruled for on 2026-09-17**
 * ([issue #961](https://github.com/woogitsu/lockstate/issues/961)), which are
 * the only authored numbers in a derivation that had none.
 *
 * The ruling chose *"Sufit mieszkańców na typ pomieszczenia w katalogu"* -- a
 * resident ceiling per room type in the catalogue -- over a tiles-per-occupant
 * term and over leaving the game a dormitory. It authorises the **mechanism**;
 * the two numbers are this repository's, derived below rather than chosen, and
 * this file is where a change to either is noticed.
 *
 * ## What is asserted, and why each case is not a restatement
 *
 * 1. **The values**, as literals. A test that read them from the catalogue and
 *    compared them with the catalogue would hold for any content
 *    (`docs/TESTING.md`).
 * 2. **That they are the only ones.** A ceiling authored onto a third room type
 *    is a balance decision, and the ruling covers the mechanism rather than
 *    every future use of it, so it should be made deliberately and fail here
 *    first.
 * 3. **That every room type an arrival can be housed in has one.** This is the
 *    half that would rot silently: a new accommodation target with no ceiling
 *    reopens #961 for that room type and nothing else in the repository would
 *    say so.
 * 4. **The derivation**, against the rest of the content. Each ceiling is how
 *    many `'sleep-surface'` objects the type's own authored `minimum-size`
 *    rectangle holds beside the other objects it requires -- so a ceiling and
 *    the minimum rectangle it was read off cannot drift apart without this
 *    failing.
 */

/** `object.bed` is `{ width: 1, height: 2 }`, so a sleep surface costs two tiles. Read here, asserted below. */
const SLEEP_SURFACE_CAPABILITY = 'sleep-surface';

describe("the room catalogue's authored resident ceilings (#961)", () => {
  it('are two for a cell and one for a solitary cell, and nothing else authors one', () => {
    expect(defaultRoomContentRegistry.getById('room.cell')?.maxResidents).toBe(2);
    expect(defaultRoomContentRegistry.getById('room.solitary-cell')?.maxResidents).toBe(1);

    expect(
      defaultRoomContentRegistry.all().filter((room) => room.maxResidents !== undefined).map((room) => room.id),
      'a third ceiling is a balance decision and should be taken deliberately',
    ).toEqual(['room.cell', 'room.solitary-cell']);
  });

  it('cover every room type an arrival can be housed in', () => {
    const targets = resolveAccommodationTargets(DEFAULT_ACCOMMODATION_POLICY);
    expect(targets.length, 'both housing types, under the shipped policy').toBe(2);

    for (const target of targets) {
      const definition = defaultRoomContentRegistry.getById(target.roomCatalogId);
      expect(definition, `${target.roomCatalogId} is in the catalogue`).toBeDefined();
      expect(
        definition?.maxResidents,
        `${target.roomCatalogId} houses arrivals and must author a ceiling, or #961 is open again for it`,
      ).toBeGreaterThan(0);
    }
  });

  it('are what the room type\'s own authored minimum rectangle holds, beside the objects it also requires', () => {
    // A sleep surface is two tiles: `object.bed` and `object.medical-bed` are
    // both 1x2, read off the object catalogue rather than restated.
    const sleepSurfaceTiles = defaultObjectRegistry
      .all()
      .filter((object) => object.capabilities.includes(SLEEP_SURFACE_CAPABILITY))
      .map((object) => object.footprint.width * object.footprint.height);
    expect(sleepSurfaceTiles, 'every sleep surface in the catalogue costs two tiles').toEqual([2, 2]);

    for (const roomId of ['room.cell', 'room.solitary-cell'] as const) {
      const definition = defaultRoomContentRegistry.getById(roomId)!;
      const minimum = definition.requirements.find((requirement) => requirement.type === 'minimum-size');
      if (minimum?.type !== 'minimum-size') throw new Error(`${roomId} authors no minimum size`);

      // Everything the room requires that is not a sleep surface, in tiles.
      const otherObjectTiles = definition.requirements
        .filter((requirement) => requirement.type === 'object')
        .reduce((tiles, requirement) => {
          if (requirement.type !== 'object') return tiles;
          const object = defaultObjectRegistry.getById(requirement.objectId);
          if (object === undefined || object.capabilities.includes(SLEEP_SURFACE_CAPABILITY)) return tiles;
          return tiles + object.footprint.width * object.footprint.height * requirement.minQuantity;
        }, 0);

      expect(
        Math.floor((minimum.minTiles - otherObjectTiles) / 2),
        `${roomId}: ${String(minimum.minTiles)} tiles less ${String(otherObjectTiles)} for what else it requires, two tiles a bed`,
      ).toBe(definition.maxResidents);
    }
  });
});
