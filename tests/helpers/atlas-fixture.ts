import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

/**
 * Builds a tiny, entirely synthetic runtime atlas batch so the validation gate
 * can be tested without Git LFS content and without shipping art into the test
 * suite.
 *
 * This is a test fixture, not content: the images are blank, the frame size is
 * deliberately unlike the production contract, and the batch carries its own
 * contract file. That is what lets a test assert "the validator reads the
 * contract" rather than "the validator happens to agree with the production
 * numbers".
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A real, decodable, fully transparent 8-bit RGBA PNG of the requested size. */
export function encodeBlankPng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;

  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export const FIXTURE_DIRECTIONS = [
  'south',
  'southWest',
  'west',
  'northWest',
  'north',
  'northEast',
  'east',
  'southEast',
] as const;

export const FIXTURE_ASSET_ID = 'actor.fixture.base';
export const FIXTURE_FRAME = { widthPx: 8, heightPx: 12 } as const;
export const FIXTURE_EXTRUDE = 1;
export const FIXTURE_PIVOT = { x: 4, y: 11 } as const;
export const FIXTURE_WALK_FRAMES = 4;

export interface FixtureContract {
  schemaVersion: number;
  kind: string;
  coordinateSystem: { clockwiseDirectionOrder: string[] };
  frame: { widthPx: number; heightPx: number; footPivotPx: { x: number; y: number } };
  clips: Record<string, { framesPerDirection: number; fps: number; loop: boolean }>;
  naming: { assetIdPattern: string };
  atlas: { extrudePx: number; maxDimensionPx: number };
}

export function buildFixtureContract(): FixtureContract {
  return {
    schemaVersion: 1,
    kind: 'lockstate.character-directional-sprite-contract',
    coordinateSystem: { clockwiseDirectionOrder: [...FIXTURE_DIRECTIONS] },
    frame: { ...FIXTURE_FRAME, footPivotPx: { ...FIXTURE_PIVOT } },
    clips: {
      idle: { framesPerDirection: 1, fps: 1, loop: true },
      walk: { framesPerDirection: FIXTURE_WALK_FRAMES, fps: 10, loop: true },
    },
    naming: { assetIdPattern: '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$' },
    atlas: { extrudePx: FIXTURE_EXTRUDE, maxDimensionPx: 128 },
  };
}

interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FixtureClipManifest {
  schemaVersion: number;
  assetId: string;
  image: string;
  widthPx: number;
  heightPx: number;
  frame: { widthPx: number; heightPx: number; footPivotPx: { x: number; y: number }; extrudePx: number };
  directions: string[];
  clips: Record<string, { fps: number; loop: boolean; frames: Record<string, FrameRect[]> }>;
}

function buildClipManifest(clipName: 'idle' | 'walk'): FixtureClipManifest {
  const columns = clipName === 'walk' ? FIXTURE_WALK_FRAMES : 1;
  const cellWidth = FIXTURE_FRAME.widthPx + FIXTURE_EXTRUDE * 2;
  const cellHeight = FIXTURE_FRAME.heightPx + FIXTURE_EXTRUDE * 2;
  const frames: Record<string, FrameRect[]> = {};

  FIXTURE_DIRECTIONS.forEach((direction, row) => {
    frames[direction] = Array.from({ length: columns }, (_unused, column) => ({
      x: column * cellWidth + FIXTURE_EXTRUDE,
      y: row * cellHeight + FIXTURE_EXTRUDE,
      width: FIXTURE_FRAME.widthPx,
      height: FIXTURE_FRAME.heightPx,
    }));
  });

  return {
    schemaVersion: 1,
    assetId: FIXTURE_ASSET_ID,
    image: `${FIXTURE_ASSET_ID}.${clipName}.png`,
    widthPx: columns * cellWidth,
    heightPx: FIXTURE_DIRECTIONS.length * cellHeight,
    frame: { ...FIXTURE_FRAME, footPivotPx: { ...FIXTURE_PIVOT }, extrudePx: FIXTURE_EXTRUDE },
    directions: [...FIXTURE_DIRECTIONS],
    clips: {
      [clipName]: {
        fps: clipName === 'walk' ? 10 : 1,
        loop: true,
        frames,
      },
    },
  };
}

export interface AtlasFixture {
  manifests: FixtureClipManifest[];
  registry: { schemaVersion: number; assets: Array<{ assetId: string; manifest: string; clips: string[] }> };
  contract: FixtureContract;
  /** Extra manifest files keyed by filename, for duplicate-id cases. */
  extraManifests: Record<string, FixtureClipManifest[]>;
}

export function buildAtlasFixture(): AtlasFixture {
  return {
    manifests: [buildClipManifest('idle'), buildClipManifest('walk')],
    registry: {
      schemaVersion: 1,
      assets: [{ assetId: FIXTURE_ASSET_ID, manifest: `${FIXTURE_ASSET_ID}.atlas-manifests.json`, clips: ['idle', 'walk'] }],
    },
    contract: buildFixtureContract(),
    extraManifests: {},
  };
}

/**
 * Writes a fixture to disk, deriving each PNG's real dimensions from its
 * manifest unless the caller deliberately broke that agreement.
 */
export async function writeAtlasFixture(directory: string, fixture: AtlasFixture): Promise<{ contractPath: string }> {
  await mkdir(directory, { recursive: true });

  const allManifests: Array<[string, FixtureClipManifest[]]> = [
    [`${FIXTURE_ASSET_ID}.atlas-manifests.json`, fixture.manifests],
    ...Object.entries(fixture.extraManifests),
  ];

  const written = new Set<string>();
  for (const [filename, manifests] of allManifests) {
    await writeFile(path.join(directory, filename), JSON.stringify(manifests, undefined, 2));
    for (const manifest of manifests) {
      if (typeof manifest.image !== 'string' || written.has(manifest.image)) continue;
      written.add(manifest.image);
      await writeFile(path.join(directory, manifest.image), encodeBlankPng(manifest.widthPx, manifest.heightPx));
    }
  }

  await writeFile(path.join(directory, 'asset-registry.json'), JSON.stringify(fixture.registry, undefined, 2));
  const contractPath = path.join(directory, 'fixture.contract.json');
  await writeFile(contractPath, JSON.stringify(fixture.contract, undefined, 2));
  return { contractPath };
}
