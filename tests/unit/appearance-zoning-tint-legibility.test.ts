import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { ENVIRONMENT_SPRITES } from '../../src/rendering/assets/environment-sprites';
import {
  INSTITUTIONAL_FLOOR_ART_BASE_FOR_DRIFT_GATE,
  ZONING_TINT_ALPHA,
  ZONING_TINT_ALPHA_OVER_ART,
  zoningTint,
  zoningTintAlphaOverArt,
} from '../../src/rendering/world/appearance';
import { LFS_POINTER_PREFIX } from '../../tooling/source-art-lfs-guard.mjs';

/**
 * ADR 0101 (accepted 2026-09-07, option 1): eight of the eighteen shipped
 * room tints blend to *less* colour, over floor art, than painting no tint at
 * all -- `env.floor.institutional` leans blue by ~26.5 units of its own, and
 * a partial-alpha blend of a hue near that lean's complement desaturates the
 * result toward the floor rather than shifting it toward the tint. Issue
 * #1061 found the worst case by playing: Holding Cell drew its name on the
 * map over a plainly grey floor.
 *
 * This is a test over what actually reaches the pixels, not over the tint
 * table -- `tests/unit/appearance-zoning-tint.test.ts` already proves
 * `zoningTint` resolves a distinct colour per room, and that table was always
 * correct, which is exactly why that test could not have caught this. Every
 * blend below is computed independently of `appearance.ts`'s own internal
 * helpers -- this file writes its own `blend`/`spread`, deliberately not
 * importing `blendOverInstitutionalFloor` or `channelSpread` -- so that a bug
 * in the production arithmetic and a bug in a shared helper cannot cancel
 * each other out.
 */

const INSTITUTIONAL_FLOOR_ART_BASE: readonly [number, number, number] = [116.396, 128.916, 142.908];
const FLOOR_SPREAD = spread(INSTITUTIONAL_FLOOR_ART_BASE);

function spread(rgb: readonly [number, number, number]): number {
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

function blend(tint: number, alpha: number): readonly [number, number, number] {
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  return [
    INSTITUTIONAL_FLOOR_ART_BASE[0] * (1 - alpha) + r * alpha,
    INSTITUTIONAL_FLOOR_ART_BASE[1] * (1 - alpha) + g * alpha,
    INSTITUTIONAL_FLOOR_ART_BASE[2] * (1 - alpha) + b * alpha,
  ];
}

const rooms = [...defaultRoomContentRegistry.all()];

/**
 * Reproduced from ADR 0101 Context §1's re-derivation (itself independent of
 * the issue and of the unmerged branch): the eight rooms whose blend at the
 * flat `ZONING_TINT_ALPHA_OVER_ART` (0.14) reads *less* coloured than the
 * bare floor's own 26.5-unit spread. Two of them -- `room.holding-cell` and
 * `room.solitary-cell` -- are the pair issue #1061 actually screenshotted;
 * the other six rest on the same arithmetic applied further from the point
 * it was validated against a person's eye (ADR 0101's own weakest-claim
 * section says the same).
 */
const RAISED_ROOM_IDS = [
  'room.solitary-cell',
  'room.holding-cell',
  'room.reception',
  'room.cell',
  'room.kitchen',
  'room.utility-room',
  'room.canteen',
  'room.garbage-room',
] as const;

/**
 * Of the eight raised rooms, these four sit close enough to the floor's own
 * complement that even the `ZONING_TINT_ALPHA` cap does not fully clear
 * `FLOOR_SPREAD` -- their own uncapped minimum sits a little above 0.28
 * (`room.holding-cell` and `room.solitary-cell` need ~0.339, `room.reception`
 * and `room.kitchen` need ~0.281), so all four land exactly at the cap
 * instead. See `minimumLegibleAlphaOverArt`'s own docblock in `appearance.ts`
 * for why the cap stops there rather than going higher.
 */
const RAISED_BUT_NOT_FULLY_CLEARED_ROOM_IDS = [
  'room.solitary-cell',
  'room.holding-cell',
  'room.reception',
  'room.kitchen',
] as const;

describe('zoning tint legibility over floor art', () => {
  it('has the untinted floor at the spread this whole file is testing against', () => {
    // A canary on the shared constant above, so a typo in it fails here
    // rather than silently changing every assertion below.
    expect(FLOOR_SPREAD).toBeCloseTo(26.51, 1);
  });

  it('resolves a tint and an alpha for every catalogued room', () => {
    for (const room of rooms) {
      expect(zoningTint(room.numericId), room.id).not.toBeUndefined();
      expect(zoningTintAlphaOverArt(room.numericId), room.id).toBeGreaterThanOrEqual(ZONING_TINT_ALPHA_OVER_ART);
      expect(zoningTintAlphaOverArt(room.numericId), room.id).toBeLessThanOrEqual(ZONING_TINT_ALPHA);
    }
  });

  it('never raises a room the flat alpha already clears', () => {
    for (const room of rooms) {
      if (RAISED_ROOM_IDS.includes(room.id as (typeof RAISED_ROOM_IDS)[number])) continue;
      expect(zoningTintAlphaOverArt(room.numericId), room.id).toBe(ZONING_TINT_ALPHA_OVER_ART);

      const tint = zoningTint(room.numericId);
      if (tint === undefined) continue;
      expect(spread(blend(tint, ZONING_TINT_ALPHA_OVER_ART)), room.id).toBeGreaterThanOrEqual(FLOOR_SPREAD);
    }
  });

  it('raises exactly the eight rooms ADR 0101 names, each above the flat alpha', () => {
    for (const id of RAISED_ROOM_IDS) {
      const room = rooms.find((candidate) => candidate.id === id);
      expect(room, id).not.toBeUndefined();
      const alpha = zoningTintAlphaOverArt(room!.numericId);
      expect(alpha, id).toBeGreaterThan(ZONING_TINT_ALPHA_OVER_ART);
    }
  });

  it('clears the untinted floor for the four raised rooms the ZONING_TINT_ALPHA cap is enough for', () => {
    for (const id of RAISED_ROOM_IDS) {
      if (RAISED_BUT_NOT_FULLY_CLEARED_ROOM_IDS.includes(id as (typeof RAISED_BUT_NOT_FULLY_CLEARED_ROOM_IDS)[number])) {
        continue;
      }
      const room = rooms.find((candidate) => candidate.id === id)!;
      const tint = zoningTint(room.numericId)!;
      const alpha = zoningTintAlphaOverArt(room.numericId);
      expect(spread(blend(tint, alpha)), id).toBeGreaterThanOrEqual(FLOOR_SPREAD - 1e-6);
    }
  });

  /**
   * `room.holding-cell`, `room.solitary-cell`, `room.reception` and
   * `room.kitchen` sit close enough to the floor's own complement that even
   * the `ZONING_TINT_ALPHA` cap cannot fully clear `FLOOR_SPREAD` -- their own
   * uncapped minimum is ~0.339 for the first two and ~0.281 for the second
   * two, all a little above the 0.28 cap (ADR 0101 Context §4's own sweep,
   * and `minimumLegibleAlphaOverArt`'s docblock reproduces the arithmetic).
   * What this test pins instead: the alpha lands exactly at the cap, and the
   * result is a real, substantial improvement over the flat 0.14 rather than
   * the flat value with no effect. The margin is stated as an absolute delta
   * rather than a ratio because the four rooms start from very different
   * flat-alpha spreads (4.7 to 16.8) and a single ratio threshold that held
   * for the smallest would be vacuous for the largest.
   */
  it('raises the four hardest rooms to the ZONING_TINT_ALPHA cap and well above their flat-alpha spread', () => {
    for (const id of RAISED_BUT_NOT_FULLY_CLEARED_ROOM_IDS) {
      const room = rooms.find((candidate) => candidate.id === id)!;
      const tint = zoningTint(room.numericId)!;
      const alpha = zoningTintAlphaOverArt(room.numericId);
      expect(alpha, id).toBeCloseTo(ZONING_TINT_ALPHA, 6);

      const atFlat = spread(blend(tint, ZONING_TINT_ALPHA_OVER_ART));
      const atRaised = spread(blend(tint, alpha));
      expect(atRaised - atFlat, id).toBeGreaterThan(8);
      expect(atRaised, id).toBeLessThan(FLOOR_SPREAD); // confirms the cap, not a coincidence, is what stops it short
    }
  });

  it('never lets a per-room alpha exceed ZONING_TINT_ALPHA, the no-art wash', () => {
    // The invariant `minimumLegibleAlphaOverArt`'s docblock states: a tile
    // with floor art under it must never be painted at least as strongly as
    // one with none. If this ever failed it would mean the per-room search
    // escaped its own cap.
    for (const room of rooms) {
      expect(zoningTintAlphaOverArt(room.numericId), room.id).toBeLessThanOrEqual(ZONING_TINT_ALPHA);
    }
  });

  /**
   * Holding Cell, specifically, is the tile #1061 screenshotted as plain
   * grey. This asserts the direction a player would actually see: red
   * leading blue in the raised blend, and blue leading red in the untinted
   * floor -- i.e. the fix does not merely change a number, it flips which
   * channel leads toward the tint's own assigned hue (`0xd17b4f`, R-forward).
   */
  it('room.holding-cell: the raised blend leans warm where the untinted floor leans blue', () => {
    const room = rooms.find((candidate) => candidate.id === 'room.holding-cell')!;
    const tint = zoningTint(room.numericId)!;
    const alpha = zoningTintAlphaOverArt(room.numericId);
    const [r, , b] = blend(tint, alpha);
    expect(r, 'raised red channel').toBeGreaterThan(b);
    expect(INSTITUTIONAL_FLOOR_ART_BASE[2] - INSTITUTIONAL_FLOOR_ART_BASE[0], 'untinted floor leans blue').toBeGreaterThan(20);
  });
});

/**
 * The substrate-drift gate. `INSTITUTIONAL_FLOOR_ART_BASE` in `appearance.ts`
 * is a MEASURED constant -- appearance.ts is a data module and must not gain
 * a PNG decoder of its own -- so if the floor art or its crop rectangle ever
 * changes, every per-room alpha computed from it goes stale **silently**:
 * nothing at runtime would notice. This is the one thing that does: it
 * decodes the real PNG at test time, independently of `appearance.ts`, and
 * fails loudly the moment the hardcoded constant stops matching the art.
 *
 * Skips, visibly (in vitest's own skip count, never silently passing), when
 * Git LFS content is not materialised -- the same `it.skipIf` idiom
 * `tests/determinism/environment-render-determinism.test.ts` uses for a
 * different missing dependency. `git lfs checkout` is free wherever the
 * objects are already local (`docs/AGENT_WORKFLOW.md` §2's LFS chain), which
 * this session verified directly before writing this file.
 */
describe('the substrate the per-room alpha table assumes, checked against the art on disk', () => {
  const REPOSITORY_ROOT = resolve(__dirname, '../..');
  const floorSprite = ENVIRONMENT_SPRITES['env.floor.institutional'];

  function resolveFloorArtPath(): string {
    if (floorSprite.kind !== 'source-art') throw new Error('env.floor.institutional is no longer source-art');
    const catalogPath = join(REPOSITORY_ROOT, 'public/game-content/source-art.v1.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      entries: readonly { assetId: string; image: string }[];
    };
    const entry = catalog.entries.find((candidate) => candidate.assetId === floorSprite.assetId);
    if (entry === undefined) {
      throw new Error(`${floorSprite.assetId} has no entry in ${catalogPath}`);
    }
    return join(REPOSITORY_ROOT, 'public/game-content', entry.image);
  }

  const floorArtPath = resolveFloorArtPath();
  const head = readFileSync(floorArtPath).subarray(0, LFS_POINTER_PREFIX.length).toString('utf8');
  const isLfsPointer = head === LFS_POINTER_PREFIX;

  it.skipIf(isLfsPointer)(
    'decodes to the mean colour INSTITUTIONAL_FLOOR_ART_BASE assumes, at the crop the painter actually draws',
    () => {
      if (floorSprite.kind !== 'source-art') throw new Error('unreachable: guarded by resolveFloorArtPath');
      const decoded = decodePng(readFileSync(floorArtPath));
      const crop = floorSprite.sourceRectPx;
      const mean = meanColorOver(decoded, crop.x, crop.y, crop.width, crop.height);

      // A tight tolerance: this is a deterministic decode of an immutable,
      // checked-in file, so anything beyond rounding drift means the art (or
      // the crop rectangle) actually moved and the alpha table is stale.
      expect(mean[0], 'red').toBeCloseTo(INSTITUTIONAL_FLOOR_ART_BASE_FOR_DRIFT_GATE[0], 1);
      expect(mean[1], 'green').toBeCloseTo(INSTITUTIONAL_FLOOR_ART_BASE_FOR_DRIFT_GATE[1], 1);
      expect(mean[2], 'blue').toBeCloseTo(INSTITUTIONAL_FLOOR_ART_BASE_FOR_DRIFT_GATE[2], 1);
    },
  );
});

/** A decoded 8-bit RGB(A) raster: raw scanline bytes, filters already undone. */
interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly channels: 3 | 4;
  readonly pixels: Buffer;
}

/**
 * A minimal PNG decoder written for this gate -- zlib inflate (Node's own
 * `node:zlib`, not a new dependency) plus the five PNG filter types, no
 * reuse of anything under `src/`. This is deliberate, the same choice ADR
 * 0101 Context §1 made for the same reason: a decoded pixel average is
 * exactly the kind of number this repository's method requires opening
 * rather than carrying forward (`docs/AGENT_WORKFLOW.md` §3), and importing
 * a decoder the production code already trusted would not be independent of
 * anything.
 *
 * Only 8-bit-depth truecolour (`colorType` 2) and truecolour-with-alpha
 * (`colorType` 6) are handled, which is what every source-art sheet in this
 * repository ships as; anything else throws rather than silently
 * misreading.
 */
function decodePng(buffer: Buffer): DecodedPng {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('not a PNG (bad signature)');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // skip the trailing CRC
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : undefined;
  if (channels === undefined) throw new Error(`unsupported colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset]!;
    rawOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rawOffset + x]!;
      const a = x >= channels ? pixels[rowStart + x - channels]! : 0;
      const b = y > 0 ? pixels[prevRowStart + x]! : 0;
      const c = y > 0 && x >= channels ? pixels[prevRowStart + x - channels]! : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + Math.floor((a + b) / 2);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`unsupported PNG filter type ${filterType}`);
      }
      pixels[rowStart + x] = value & 0xff;
    }
    rawOffset += stride;
  }

  return { width, height, channels, pixels };
}

/** Mean RGB over a rectangle, treating any non-zero alpha as opaque (matches ADR 0101's whole-sheet method). */
function meanColorOver(
  decoded: DecodedPng,
  xMin: number,
  yMin: number,
  regionWidth: number,
  regionHeight: number,
): readonly [number, number, number] {
  const { channels, pixels, width } = decoded;
  const stride = width * channels;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let n = 0;
  for (let y = yMin; y < yMin + regionHeight; y += 1) {
    for (let x = xMin; x < xMin + regionWidth; x += 1) {
      const index = y * stride + x * channels;
      const alpha = channels === 4 ? pixels[index + 3]! : 255;
      if (alpha === 0) continue;
      rSum += pixels[index]!;
      gSum += pixels[index + 1]!;
      bSum += pixels[index + 2]!;
      n += 1;
    }
  }
  return [rSum / n, gSum / n, bSum / n];
}
