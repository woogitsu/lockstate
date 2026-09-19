import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * The instrument behind [#1022](https://github.com/woogitsu/lockstate/issues/1022),
 * committed so the number stops being prose.
 *
 * `docs/research/2026-09-05-what-the-world-shows.md` §4 measured a sealed cell
 * against a working one -- same tiles, same crop, same population, same
 * `roomCapacity` -- at **6,061 differing pixels of 147,456 (4.11%)**, and the
 * whole 4.11% is the door the player built plus four prisoner sprites
 * overlapping differently in one corner. That figure is the load-bearing
 * premise of [ADR 0097](../../docs/adr/0097-what-the-world-view-is-required-to-communicate.md),
 * which the owner accepted on 2026-09-05 together with its option A.
 *
 * The record said the measurement was "reproducible from the committed files:
 * decode `act3-working.png` and `act3-sealed.png` and compare pixel by pixel",
 * and then nothing in the repository ever did. Re-running it by hand on
 * 2026-09-19 reproduced the pixel count and the per-tile map digit for digit --
 * and refuted the *tile count* stated beside them in four places: six of the
 * thirty-six tiles differ, not four, so **thirty** are pixel-identical rather
 * than thirty-two. The per-tile map in that same section always said so; the
 * sentence beside it disagreed with the table above it for a fortnight.
 *
 * So this file pins two things that were only ever prose:
 *
 * 1. the measurement itself, off the two committed screenshots; and
 * 2. that every document stating the tile count states the measured one.
 *
 * The two sides are independent on purpose (`docs/AGENT_WORKFLOW.md` §3: never
 * write a fixture that supplies both sides of a comparison) -- one side is a
 * decode of a PNG, the other is a sentence in a Markdown file, and neither is
 * derived from the other.
 *
 * **What this file does NOT assert**, because it is not true yet: that the
 * world view carries room condition. It does not, at `68976de0`. ADR 0097's
 * accepted option A is unimplemented, and the transport it assumed and did not
 * have --
 * [ADR 0111](../../docs/adr/0111-how-a-room-instances-rectangle-reaches-the-render-side.md)
 * -- is the thing that had been missing. This is the measurement, kept honest
 * and kept runnable, not the fix.
 *
 * **This paragraph was written while that transport was unaccepted, and it
 * said so; it no longer may.** The owner accepted ADR 0111 on 2026-09-19 --
 * Option A, extend the geometry snapshot's `world` section -- and PR #1319
 * carried that into its Status block, so the clause naming it unaccepted
 * became false between this file being written and being merged. The number
 * it was wrong about is left out of backticks here on purpose:
 * `tests/foundation/adr-status-reference-contract.test.ts` reads a quoted
 * status as a live claim and would count a verbatim requote as a second one.
 * It caught this, which is the whole reason that gate exists.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SCREENSHOT_DIR = join(
  REPOSITORY_ROOT,
  'docs/research/2026-09-05-what-the-world-shows',
);
const RESEARCH_RECORD = join(
  REPOSITORY_ROOT,
  'docs/research/2026-09-05-what-the-world-shows.md',
);

/** The crop is the 6x6 cell at 64 px a tile: 384 x 384 = 147,456 pixels. */
const TILE_PX = 64;
const ROOM_TILES = 6;

/**
 * A minimal PNG decoder for exactly the form these two files take: 8-bit
 * truecolour, no interlace. Anything else throws rather than guessing, because
 * a decoder that silently accepts a different colour type would compare two
 * different pixel layouts and report a difference that is its own.
 */
function decodeRgb8Png(path: string): { width: number; height: number; rgb: Buffer } {
  const file = readFileSync(path);
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${path}: not a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colourType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colourType !== 2 || interlace !== 0) {
    throw new Error(
      `${path}: expected 8-bit truecolour, non-interlaced; got bitDepth=${bitDepth} colourType=${colourType} interlace=${interlace}`,
    );
  }

  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  const rgb = Buffer.alloc(height * stride);

  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[read]!;
    read += 1;
    const line = raw.subarray(read, read + stride);
    read += stride;
    const current = rgb.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? rgb.subarray((y - 1) * stride, y * stride) : undefined;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bytesPerPixel ? current[x - bytesPerPixel]! : 0;
      const b = previous ? previous[x]! : 0;
      const c = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel]! : 0;
      const value = line[x]!;
      let restored: number;
      switch (filterType) {
        case 0:
          restored = value;
          break;
        case 1:
          restored = value + a;
          break;
        case 2:
          restored = value + b;
          break;
        case 3:
          restored = value + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          restored = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`${path}: unsupported row filter ${filterType}`);
      }
      current[x] = restored & 0xff;
    }
  }

  return { width, height, rgb };
}

interface Comparison {
  readonly totalPixels: number;
  readonly differingPixels: number;
  /** Differing pixels per tile, `[row][column]`, row 0 being world row y=12. */
  readonly perTile: readonly (readonly number[])[];
}

function compareRoomCrops(): Comparison {
  const working = decodeRgb8Png(join(SCREENSHOT_DIR, 'act3-working.png'));
  const sealed = decodeRgb8Png(join(SCREENSHOT_DIR, 'act3-sealed.png'));

  expect(
    [working.width, working.height],
    'the working-cell crop is the 6x6 room at 64 px a tile',
  ).toEqual([TILE_PX * ROOM_TILES, TILE_PX * ROOM_TILES]);
  expect(
    [sealed.width, sealed.height],
    'the sealed-cell crop is the same rectangle -- a comparison of two different crops measures the crop',
  ).toEqual([working.width, working.height]);

  const perTile = Array.from({ length: ROOM_TILES }, () =>
    Array.from({ length: ROOM_TILES }, () => 0),
  );
  let differingPixels = 0;

  for (let y = 0; y < working.height; y += 1) {
    for (let x = 0; x < working.width; x += 1) {
      const i = (y * working.width + x) * 3;
      if (
        working.rgb[i] !== sealed.rgb[i] ||
        working.rgb[i + 1] !== sealed.rgb[i + 1] ||
        working.rgb[i + 2] !== sealed.rgb[i + 2]
      ) {
        differingPixels += 1;
        const row = perTile[Math.floor(y / TILE_PX)]!;
        row[Math.floor(x / TILE_PX)]! += 1;
      }
    }
  }

  return { totalPixels: working.width * working.height, differingPixels, perTile };
}

/**
 * The per-tile map as `docs/research/2026-09-05-what-the-world-shows.md` §4
 * prints it. Transcribed from the record rather than computed, so that a
 * regression in the decoder cannot quietly rewrite what it is checked against.
 */
const RECORDED_PER_TILE: readonly (readonly number[])[] = [
  [385, 798, 896, 896, 14, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 3072, 0, 0, 0],
];

/** `thirty` .. `thirty-six`, the only counts a 36-tile map can state in words. */
const TILE_COUNT_WORDS = new Map<string, number>([
  ['thirty', 30],
  ['thirty-one', 31],
  ['thirty-two', 32],
  ['thirty-three', 33],
  ['thirty-four', 34],
  ['thirty-five', 35],
  ['thirty-six', 36],
]);

const TILE_COUNT_CLAIM =
  /\b(thirty(?:-(?:one|two|three|four|five|six))?)\s+of\s+(?:the\s+)?thirty-six\b/gi;

function markdownFilesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.md')) found.push(full);
    }
  };
  walk(root);
  return found;
}

describe("#1022's pixel measurement, taken rather than quoted", () => {
  it('reproduces 6,061 differing pixels of 147,456 -- 4.11% -- off the two committed screenshots', () => {
    const { totalPixels, differingPixels } = compareRoomCrops();

    expect(totalPixels).toBe(147_456);
    expect(differingPixels).toBe(6_061);
    expect(((differingPixels / totalPixels) * 100).toFixed(2)).toBe('4.11');
  });

  it('reproduces the per-tile map digit for digit, including the 3,072 at (14,17) that are the door', () => {
    const { perTile } = compareRoomCrops();

    expect(perTile).toEqual(RECORDED_PER_TILE);
    expect(
      perTile[5]![2],
      'the door at tile (14,17) is the only difference anywhere below row y=12',
    ).toBe(3_072);
    expect(
      perTile.slice(1, 5).flat().reduce((a, b) => a + b, 0),
      'rows y=13 through y=16 are pixel-identical in both cells',
    ).toBe(0);
  });

  it('counts thirty of the thirty-six tiles pixel-identical, and every document that states the count agrees', () => {
    const { perTile } = compareRoomCrops();
    const identical = perTile.flat().filter((count) => count === 0).length;

    expect(
      identical,
      'six tiles differ -- five across row y=12 and the door tile -- so 36 - 6 = 30',
    ).toBe(30);

    const disagreeing: string[] = [];
    for (const file of markdownFilesUnder(join(REPOSITORY_ROOT, 'docs'))) {
      const text = readFileSync(file, 'utf8');
      // Scoped to documents that carry this pair's own pixel total, because
      // "thirty-one of the thirty-six" is a sentence other documents write
      // about other sets of thirty-six things.
      if (!text.includes('147,456')) continue;
      for (const match of text.matchAll(TILE_COUNT_CLAIM)) {
        const stated = TILE_COUNT_WORDS.get(match[1]!.toLowerCase());
        if (stated !== undefined && stated !== identical) {
          disagreeing.push(`${relative(REPOSITORY_ROOT, file)}: "${match[0]}"`);
        }
      }
    }

    expect(
      disagreeing,
      `these documents state a tile count for #1022's pair that the screenshots refute; the measured count is ${identical}`,
    ).toEqual([]);
  });

  it('is checked against the map the research record itself prints, not only against its own decode', () => {
    const record = readFileSync(RESEARCH_RECORD, 'utf8');
    const block = /y12:\s*([\s\S]*?)y17:[^\n]*\n/.exec(record);
    expect(block, 'the per-tile map is still a fenced block in §4 of the record').not.toBeNull();

    const printed = /```\n((?:\s*(?:x\d+\s*)+\n)?(?:\s*y1[2-7]:[^\n]*\n)+)```/.exec(record);
    expect(printed, 'the fenced per-tile map is readable from the record').not.toBeNull();

    const rows = printed![1]!
      .split('\n')
      .filter((line) => /^\s*y1[2-7]:/.test(line))
      .map((line) => line.replace(/^\s*y1[2-7]:\s*/, '').trim().split(/\s+/).map(Number));

    expect(rows, 'the record prints six rows of six').toEqual(RECORDED_PER_TILE);
  });
});
