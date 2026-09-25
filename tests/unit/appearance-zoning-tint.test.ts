import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { ZONING_TINT_ALPHA_OVER_ART, zoningTint } from '../../src/rendering/world/appearance';

/**
 * ADR 0098, option A: `zoningTint` is keyed by the room's own catalogue id,
 * not by its category, so two different room *types* never resolve to the
 * same tint.
 *
 * Before this table existed, `zoningTint` looked up a table keyed by category
 * -- `ZONING_TINT_BY_CATEGORY`, which no longer exists; `ZONING_TINT_BY_ROOM_ID`
 * replaced it -- and eighteen room types collapsed onto eleven tints -- seven pairs
 * (Kitchen/Canteen among them) were pixel-identical on the map. This file
 * pins the defect that fix closes: run every catalogued room's `numericId`
 * through `zoningTint` and fail if two distinct room ids ever produce the
 * same colour again. Nothing before this file asserted that, which is why
 * the collision shipped unnoticed.
 */
describe('zoningTint: one tint per room type', () => {
  const rooms = [...defaultRoomContentRegistry.all()];

  it('has more than one room to test against (the collision needs two)', () => {
    expect(rooms.length).toBeGreaterThan(1);
  });

  it('resolves a tint for every catalogued room', () => {
    for (const room of rooms) {
      expect(zoningTint(room.numericId), `${room.id} (numericId ${room.numericId})`).not.toBeUndefined();
    }
  });

  it('never gives two distinct room types the same tint', () => {
    const tintToRoomIds = new Map<number, string[]>();
    for (const room of rooms) {
      const tint = zoningTint(room.numericId);
      if (tint === undefined) continue; // covered, and failed, by the test above
      const existing = tintToRoomIds.get(tint) ?? [];
      existing.push(room.id);
      tintToRoomIds.set(tint, existing);
    }

    const collisions = [...tintToRoomIds.entries()].filter(([, ids]) => ids.length > 1);
    expect(collisions, `colliding tints: ${JSON.stringify(collisions)}`).toEqual([]);
  });

  it('is undefined for an unzoned tile and for an id no room claims', () => {
    expect(zoningTint(0)).toBeUndefined();
    const highestNumericId = Math.max(...rooms.map((room) => room.numericId));
    expect(zoningTint(highestNumericId + 1)).toBeUndefined();
  });

  /**
   * ADR 0098 Context §2's identity: both tints are painted over the same
   * floor at the same alpha, so the perceptible difference between two tinted
   * tiles is exactly `ZONING_TINT_ALPHA_OVER_ART * |t1 - t2|` per channel. This
   * reproduces that arithmetic over every pair of catalogued rooms and pins
   * the worst (most easily confused) pair the shipped palette produces, so a
   * future edit to the table cannot quietly re-crowd the hues without this
   * test moving.
   *
   * **Marked, not overwritten, per `docs/AGENT_WORKFLOW.md` §4: the premise
   * of this test -- "both tints are painted over the same floor at the same
   * alpha" -- is no longer true of what `TileLayer` actually paints, for any
   * pair naming one of eight rooms.** ADR 0101 (accepted 2026-09-07, option
   * 1) raises `room.cell`, `room.holding-cell`, `room.solitary-cell`,
   * `room.reception`, `room.kitchen`, `room.canteen`, `room.garbage-room` and
   * `room.utility-room` to a room-specific alpha via
   * `zoningTintAlphaOverArt` (`src/rendering/world/appearance.ts`), over
   * floor art specifically. This test still deliberately reads
   * `ZONING_TINT_ALPHA_OVER_ART` -- the flat constant -- because its subject
   * is the *palette's own minimum pair separation*, not what reaches the
   * screen. `tests/unit/appearance-zoning-tint-legibility.test.ts` and
   * `docs/adr/0098-what-says-which-room-this-is.md`'s amendment are what
   * cover the real, per-room-alpha paint step and its cost to this test's
   * own 108-of-153-pairs coverage.
   *
   * 2026-09-24: Kitchen now has a distinct Blender floor and an owner-approved
   * blue-grey tint. Neither equal substrate nor equal 20-degree hue spacing
   * holds for every pair. The threshold below remains a minimum-distance
   * guard over the tint values; it cannot assert either property of the map.
   */
  it('pins the owner-approved Yard tint and remaining palette separation', () => {
    const channel = (rgb: number, shift: number): number => (rgb >> shift) & 0xff;
    const effectiveDistance = (a: number, b: number): number => {
      const perChannel = [16, 8, 0].map(
        (shift) => ZONING_TINT_ALPHA_OVER_ART * Math.abs(channel(a, shift) - channel(b, shift)),
      );
      return Math.sqrt(perChannel.reduce((sumOfSquares, value) => sumOfSquares + value ** 2, 0));
    };

    const yard = rooms.find((room) => room.id === 'room.yard')!;
    const yardTint = zoningTint(yard.numericId)!;
    expect(yardTint).toBe(0xddb35a);
    const tints = rooms.filter((room) => room.id !== 'room.yard')
      .map((room) => zoningTint(room.numericId)).filter((tint): tint is number => tint !== undefined);

    let worst = Infinity;
    for (const [i, tintA] of tints.entries()) {
      for (const tintB of tints.slice(i + 1)) {
        worst = Math.min(worst, effectiveDistance(tintA, tintB));
      }
    }

    expect(worst).toBeCloseTo(6.02, 2);
    const nearestToYard = Math.min(...tints.map((tint) => effectiveDistance(yardTint, tint)));
    // Explicitly record the palette-separation cost accepted for outdoor readability.
    expect(nearestToYard).toBeCloseTo(2.9166, 3);
  });
});
