import { createRequire } from 'node:module';

// Use the decoder shipped by the declared Playwright dependency, as in the
// accepted captured-actor reader. No new package or browser work is needed.
const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer, options: { checkCRC: boolean }): {
    width: number; height: number; data: Buffer;
  } } };
};

export interface CapturedPaletteSample {
  /** Existing canvas getImageData rectangle: x, y, width, height. */
  readonly rect: readonly [number, number, number, number];
  readonly colour: readonly [number, number, number];
}

/** The current Chromium screenshots are untagged 8-bit RGB PNGs. Reject
 * profiles/gamma, transparency and other encodings rather than silently
 * substituting raw PNG channels for browser colour conversion/compositing. */
function validateCaptureEncoding(png: Buffer): void {
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR' ||
      png[24] !== 8 || ![2, 6].includes(png[25]!) ||
      png[26] !== 0 || png[27] !== 0 || png[28] !== 0) {
    throw new Error('Expected an untagged noninterlaced 8-bit RGB/RGBA screenshot PNG');
  }
  let offset = 8;
  let ended = false;
  while (offset < png.length) {
    if (png.length - offset < 12) throw new Error('Truncated screenshot PNG chunk');
    const length = png.readUInt32BE(offset);
    if (length > png.length - offset - 12) throw new Error('Truncated screenshot PNG data');
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (!['IHDR', 'IDAT', 'IEND'].includes(type)) throw new Error(`Unsupported screenshot PNG metadata: ${type}`);
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== png.length) throw new Error('Invalid screenshot PNG ending');
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error('Missing screenshot PNG ending');
}

/** Count exact RGB matches in the SAME captured buffers and caller regions.
 * Opaque, untagged captures require no colour conversion or alpha compositing.
 * This helper does not choose regions, palettes or acceptance thresholds. */
export function countCapturedPalettePixels(png: Buffer, samples: readonly CapturedPaletteSample[]): number[] {
  validateCaptureEncoding(png);
  const image = PNG.sync.read(png, { checkCRC: true });
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0 ||
      image.data.length !== image.width * image.height * 4) throw new Error('Invalid screenshot PNG dimensions');
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] !== 255) throw new Error('Screenshot PNG must contain opaque captured pixels');
  }
  if (samples.length === 0) throw new Error('At least one captured palette sample is required');
  return samples.map(({ rect, colour }) => {
    const [x, y, width, height] = rect;
    if (rect.length !== 4 || !rect.every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x + width > image.width || y + height > image.height) throw new Error('Palette rectangle is outside the captured PNG');
    if (colour.length !== 3 || !colour.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      throw new Error('Palette colour must contain three RGB bytes');
    }
    let count = 0;
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        const offset = (row * image.width + column) * 4;
        if (image.data[offset] === colour[0] && image.data[offset + 1] === colour[1] && image.data[offset + 2] === colour[2]) count += 1;
      }
    }
    return count;
  });
}
