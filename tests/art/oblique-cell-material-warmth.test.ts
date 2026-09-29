import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

type Manifest = {
  source: string;
  frames: Array<{ yawDegrees: number; elevationDegrees: number; image: string }>;
};

const root = resolve(import.meta.dirname, '../..');

function pngPixels(buffer: Buffer): { pixels: Buffer; channels: number } {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('Expected 8-bit RGBA PNG');
      channels = 4;
    }
    if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let source = 0;
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const differences = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return differences[0]! <= differences[1]! && differences[0]! <= differences[2]!
      ? a : differences[1]! <= differences[2]! ? b : c;
  };
  for (let row = 0; row < height; row += 1) {
    const filter = raw[source++]!;
    for (let col = 0; col < stride; col += 1) {
      const index = row * stride + col;
      const a = col >= channels ? pixels[index - channels]! : 0;
      const b = row > 0 ? pixels[index - stride]! : 0;
      const c = row > 0 && col >= channels ? pixels[index - stride - channels]! : 0;
      const value = raw[source++]!;
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b
        : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c)
          : (() => { throw new Error(`Unsupported PNG filter ${filter}`); })();
      pixels[index] = (value + predictor) & 0xff;
    }
  }
  return { pixels, channels };
}

async function opaqueColorBalance(manifestName: string): Promise<number> {
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/game-content', manifestName), 'utf8')) as Manifest;
  const frame = manifest.frames.find((item) => item.yawDegrees === 0 && item.elevationDegrees === 45);
  expect(frame, `${manifestName} has the canonical 0/45 pose`).toBeDefined();
  const { pixels: data, channels } = pngPixels(readFileSync(resolve(root, 'public', frame!.image.slice(1))));
  let red = 0;
  let blue = 0;
  let weight = 0;
  for (let index = 0; index < data.length; index += channels) {
    const alpha = data[index + 3]! / 255;
    red += data[index]! * alpha;
    blue += data[index + 2]! * alpha;
    weight += alpha;
  }
  return (red - blue) / weight;
}

describe('warm oblique cell materials', () => {
  it('keeps the cell floor warmer than neutral grey at game texture scale', async () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/game-content/oblique-floor-cell.v1.json'), 'utf8')) as Manifest;
    expect(manifest.source).toBe('floor.cell.warm-concrete.blend');
    expect(await opaqueColorBalance('oblique-floor-cell.v1.json')).toBeGreaterThan(10);
  });

  it('keeps the visible wall material warm without moving its frame pivot', async () => {
    expect(await opaqueColorBalance('oblique-modules.v1.json')).toBeGreaterThan(10);
  });
});
