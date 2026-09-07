import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { zoningTint, zoningTintAlphaOverArt } from '../../src/rendering/world/appearance';

/**
 * Issue #1061: a Holding Cell drew its name on the map but no zoning tint.
 *
 * `tests/unit/appearance-zoning-tint.test.ts` already pins that
 * `ZONING_TINT_BY_ROOM_ID` gives every room a distinct, defined colour --
 * and that table was never the defect. Playing found a room whose tile
 * genuinely painted `zoningTint`'s own colour (confirmed by instrumenting
 * `TileLayer.paintChunk`'s exact `graphics.fillStyle` call against a real
 * browser session) and still read as a plain grey floor once composited over
 * `env.floor.institutional` at `ZONING_TINT_ALPHA_OVER_ART`. So a test over
 * the table proves nothing here; this one is over the composite a player
 * actually sees -- the same alpha-blend `TileLayer.paintChunk` performs,
 * reproduced independently below rather than imported, so this cannot pass
 * merely because it shares a bug with the code it checks.
 *
 * **The mechanism, measured rather than assumed.** `env.floor.institutional`
 * (`public/game-content/source-art/floor.linoleum.institutional.788e81d4e081.png`,
 * the exact crop its own `sourceRectPx` names) box-averages to
 * `rgb(116.4, 128.9, 142.9)` -- a real, fairly strong blue-over-red lean of its
 * own (26.5 units), present before any tint is painted. Blending a *partial*
 * alpha of a colour close to this base's own complement does not shift the
 * result toward that colour's hue; it desaturates the base toward neutral
 * grey, because the two are pulling the channel spread toward each other
 * rather than in the same direction. `room.holding-cell` (`0xd17b4f`, an
 * orange whose R-forward, B-weak character opposes the base's own R-weak,
 * B-forward lean almost directly) is exactly that case at the pre-fix
 * `ZONING_TINT_ALPHA_OVER_ART = 0.14`: the blended average is
 * `rgb(129.4, 128.1, 134.0)`, a spread of 5.9 -- *less* colourful than the
 * untinted floor's own 26.5, which is the "no tint at all" reading the
 * playtest's screenshots showed. `room.solitary-cell` (`0xd1a64f`) shares the
 * same near-complementary hue and the same failure (spread 4.7); six more
 * rooms fall short of the untinted floor by smaller margins.
 *
 * The fix (`zoningTintAlphaOverArt` in `src/rendering/world/appearance.ts`)
 * raises the over-art alpha per room, but only up to the smallest value that
 * clears the untinted floor's own spread, and only for the rooms whose
 * default 0.14 blend does not already clear it -- every other room keeps
 * `ZONING_TINT_ALPHA_OVER_ART` exactly as ADR 0098 left it.
 */

/** Same crop `env.floor.institutional` names in `environment-sprites.ts`, same measurement this file's docblock describes. */
const INSTITUTIONAL_FLOOR_ART_BASE: readonly [number, number, number] = [116.396, 128.916, 142.908];

function spread(rgb: readonly [number, number, number]): number {
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

function blendOverInstitutionalFloor(tint: number, alpha: number): readonly [number, number, number] {
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  return [
    INSTITUTIONAL_FLOOR_ART_BASE[0] * (1 - alpha) + r * alpha,
    INSTITUTIONAL_FLOOR_ART_BASE[1] * (1 - alpha) + g * alpha,
    INSTITUTIONAL_FLOOR_ART_BASE[2] * (1 - alpha) + b * alpha,
  ];
}

const UNTINTED_FLOOR_SPREAD = spread(INSTITUTIONAL_FLOOR_ART_BASE);

describe('zoning tint over floor art: the actual composite, not just the table', () => {
  const rooms = [...defaultRoomContentRegistry.all()];

  it('has more than zero rooms to check (a fixture regression would hide everything below)', () => {
    expect(rooms.length).toBeGreaterThan(0);
  });

  it('the untinted floor is not itself neutral (26.5 units, R furthest behind B) -- the premise every case below depends on', () => {
    expect(UNTINTED_FLOOR_SPREAD).toBeGreaterThan(20);
  });

  it.each(rooms.map((room) => [room.id, room.numericId] as const))(
    "%s's tint, composited over env.floor.institutional at its own alpha, reads at least as coloured as the untinted floor",
    (roomId, numericId) => {
      const tint = zoningTint(numericId);
      expect(tint, `${roomId} must resolve a tint at all`).not.toBeUndefined();
      const alpha = zoningTintAlphaOverArt(numericId);
      const blended = blendOverInstitutionalFloor(tint as number, alpha);
      expect(
        spread(blended),
        `${roomId}: 0x${(tint as number).toString(16)} at alpha ${alpha} blends to ` +
          `rgb(${blended.map((c) => c.toFixed(1)).join(',')}), spread ${spread(blended).toFixed(1)} ` +
          `-- must be >= the untinted floor's own ${UNTINTED_FLOOR_SPREAD.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(UNTINTED_FLOOR_SPREAD - 0.05);
    },
  );

  it('room.holding-cell in particular needs a raised alpha to clear the bar (the room #1061 filed)', () => {
    const holdingCell = defaultRoomContentRegistry.getById('room.holding-cell');
    expect(holdingCell).not.toBeUndefined();
    const alpha = zoningTintAlphaOverArt(holdingCell!.numericId);
    // 0.14 was measured (this file's docblock) to leave holding-cell at a
    // spread of 5.9 -- so clearing 26.5 is only possible above that alpha.
    expect(alpha).toBeGreaterThan(0.14);
  });

  it('a room whose blend already cleared the bar keeps the original alpha unchanged (room.staff-room)', () => {
    const staffRoom = defaultRoomContentRegistry.getById('room.staff-room');
    expect(staffRoom).not.toBeUndefined();
    expect(zoningTintAlphaOverArt(staffRoom!.numericId)).toBeCloseTo(0.14, 5);
  });
});
