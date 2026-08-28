import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../src/simulation/construction/definition';
import { DEFAULT_TERRAIN_DEFINITIONS } from '../../src/simulation/world/terrain';
import {
  ENVIRONMENT_ATLAS_GUTTER_PX,
  ENVIRONMENT_ATLAS_WIDTH_PX,
  planEnvironmentAtlas,
} from '../../src/rendering/assets/environment-atlas-plan';
import {
  ENVIRONMENT_SPRITES,
  ENVIRONMENT_SPRITE_IDS,
  environmentFrameSize,
  environmentSourceAssetIds,
  type EnvironmentSpriteDefinition,
  type EnvironmentSpriteId,
} from '../../src/rendering/assets/environment-sprites';
import {
  SOURCE_ART_BASE_PATH,
  SourceArtCatalog,
  sourceArtCatalogSchema,
} from '../../src/rendering/assets/source-art-catalog';
import { edgeAppearance } from '../../src/rendering/world/appearance';
import { slabFaces } from '../../src/rendering/world/structure-geometry';
import { isDrawnAsWorldEdge, type RenderStructure } from '../../src/rendering/world/structures';
import { mergeFloorRects, mergeTopEdgeRuns } from '../../src/rendering/world/tile-art-runs';
import {
  OBJECTS_ON_COLOUR_FALLBACK,
  TERRAIN_ON_COLOUR_FALLBACK,
  edgeArt,
  edgeArtCoverage,
  objectArtCoverage,
  terrainArtCoverage,
  zonedFloorSprite,
} from '../../src/rendering/world/environment-art';

/**
 * The decisions behind the environment artwork, all of which are reachable
 * from the default Node environment because none of them touches a canvas.
 *
 * That split is the point. `vitest.config.ts` runs in `environment: 'node'`
 * with no jsdom, so the *drawing* is unreachable here entirely
 * (`docs/AGENT_WORKFLOW.md` §"What the 2026-08-27 session cost"): a mutation
 * inside the painter survives because nothing could observe it. So which sheet,
 * which rectangle, which frame, how the frames pack and what happens when there
 * is no art are all pure functions, and they are what this file holds. What is
 * genuinely browser-only -- decoding a real PNG and putting real pixels on a
 * real canvas -- is `tests/browser/environment-art.spec.ts`.
 *
 * The catalog it reads is the committed one, not a fixture. It is plain JSON
 * rather than Git LFS content, so it is readable on a pointer-only checkout,
 * and reading it is what makes "this rectangle is inside that sheet" a claim
 * about the shipped art rather than about a number copied twice.
 */

const catalogPath = join(import.meta.dirname, '../../public/game-content/source-art.v1.json');
const committedCatalog = sourceArtCatalogSchema.parse(JSON.parse(readFileSync(catalogPath, 'utf8')));
const catalog = SourceArtCatalog.fromParsed(SOURCE_ART_BASE_PATH, committedCatalog);

describe('source-art catalog', () => {
  it('parses the committed catalog the generator writes', () => {
    expect(committedCatalog.entries.length).toBeGreaterThan(0);
    expect(catalog.assetIds()).toEqual([...committedCatalog.entries.map((entry) => entry.assetId)].sort());
  });

  it('accepts the underscored ids the batch really contains, which the actor pattern rejects', () => {
    // Three of the sheets carry an underscore. If this schema had reused
    // `atlas-manifest.ts`'s stricter id pattern, loading would have thrown on
    // real content at runtime rather than failing here.
    const underscored = catalog.assetIds().filter((id) => id.includes('_'));
    expect(underscored.length).toBeGreaterThan(0);
  });

  it('builds a sheet URL from the catalog rather than from a filename', () => {
    const [first] = committedCatalog.entries;
    expect(first).toBeDefined();
    expect(catalog.imageUrl(first!.assetId)).toBe(`${SOURCE_ART_BASE_PATH}/${first!.image}`);
  });

  it('refuses an id it does not hold instead of answering with a broken URL', () => {
    expect(() => catalog.imageUrl('no.such.sheet')).toThrow(/Unknown source-art asset id/);
  });

  it('rejects a catalog whose entries are not what the generator writes', () => {
    expect(() => sourceArtCatalogSchema.parse({ ...committedCatalog, kind: 'something-else' })).toThrow();
  });
});

describe('environment extraction manifest', () => {
  it('names only sheets the committed catalog holds', () => {
    for (const assetId of environmentSourceAssetIds()) {
      expect(catalog.has(assetId), `no catalog entry for "${assetId}"`).toBe(true);
    }
  });

  it('reads only rectangles that lie inside the sheet they come from', () => {
    for (const spriteId of ENVIRONMENT_SPRITE_IDS) {
      const definition = ENVIRONMENT_SPRITES[spriteId];
      const sheet = catalog.dimensions(definition.assetId);
      const rect = definition.sourceRectPx;
      expect(rect.x + rect.width, `${spriteId} runs off the east edge of ${definition.assetId}`).toBeLessThanOrEqual(sheet.width);
      expect(rect.y + rect.height, `${spriteId} runs off the south edge of ${definition.assetId}`).toBeLessThanOrEqual(sheet.height);
    }
  });

  it('turns a frame size with its quarter-turn', () => {
    const upright: EnvironmentSpriteDefinition = {
      assetId: 'floor.linoleum.institutional',
      sourceRectPx: { x: 0, y: 0, width: 10, height: 20 },
      runtimeSizePx: { width: 30, height: 40 },
      quarterTurns: 0,
      note: 'fixture',
    };
    expect(environmentFrameSize(upright)).toEqual({ width: 30, height: 40 });
    expect(environmentFrameSize({ ...upright, quarterTurns: 1 })).toEqual({ width: 40, height: 30 });
  });

  it('downloads each sheet once however many sprites come out of it', () => {
    const assetIds = environmentSourceAssetIds();
    expect(new Set(assetIds).size).toBe(assetIds.length);
    expect(assetIds.length).toBeLessThan(ENVIRONMENT_SPRITE_IDS.length);
  });
});

describe('environment atlas plan', () => {
  const plan = planEnvironmentAtlas(catalog);

  it('places every declared sprite', () => {
    expect(plan.frames.map((frame) => frame.spriteId).sort()).toEqual([...ENVIRONMENT_SPRITE_IDS].sort());
  });

  it('is identical on every run, so a packed rectangle is a fact about the packer', () => {
    expect(planEnvironmentAtlas(catalog)).toEqual(plan);
  });

  it('keeps every frame, and its gutter, inside the atlas', () => {
    for (const frame of plan.frames) {
      const rect = frame.atlasRectPx;
      expect(rect.x - plan.gutterPx).toBeGreaterThanOrEqual(0);
      expect(rect.y - plan.gutterPx).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width + plan.gutterPx).toBeLessThanOrEqual(plan.widthPx);
      expect(rect.y + rect.height + plan.gutterPx).toBeLessThanOrEqual(plan.heightPx);
    }
  });

  it('never overlaps two frames, gutters included', () => {
    const grown = plan.frames.map((frame) => ({
      id: frame.spriteId,
      x0: frame.atlasRectPx.x - plan.gutterPx,
      y0: frame.atlasRectPx.y - plan.gutterPx,
      x1: frame.atlasRectPx.x + frame.atlasRectPx.width + plan.gutterPx,
      y1: frame.atlasRectPx.y + frame.atlasRectPx.height + plan.gutterPx,
    }));
    for (let i = 0; i < grown.length; i += 1) {
      for (let j = i + 1; j < grown.length; j += 1) {
        const a = grown[i]!;
        const b = grown[j]!;
        const overlaps = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlaps, `${a.id} and ${b.id} overlap in the atlas`).toBe(false);
      }
    }
  });

  it('names one sheet per distinct source asset, with a key that changes when the art does', () => {
    expect(plan.sheets.map((sheet) => sheet.assetId)).toEqual([...environmentSourceAssetIds()]);
    for (const sheet of plan.sheets) expect(plan.textureKey).toContain(sheet.imageUrl);
  });

  it('refuses a rectangle that runs off its sheet, naming the sprite', () => {
    const first = [...ENVIRONMENT_SPRITE_IDS].sort()[0]!;
    const broken = {
      ...ENVIRONMENT_SPRITES,
      [first]: { ...ENVIRONMENT_SPRITES[first], sourceRectPx: { x: 1_400, y: 1_000, width: 400, height: 400 } },
    } as Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>>;
    expect(() => planEnvironmentAtlas(catalog, broken)).toThrow(new RegExp(first.replace(/\./gu, '\\.')));
  });

  it('refuses a sprite naming a sheet the catalog does not hold', () => {
    const first = [...ENVIRONMENT_SPRITE_IDS].sort()[0]!;
    const broken = {
      ...ENVIRONMENT_SPRITES,
      [first]: { ...ENVIRONMENT_SPRITES[first], assetId: 'no.such.sheet' },
    } as Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>>;
    expect(() => planEnvironmentAtlas(catalog, broken)).toThrow(/no\.such\.sheet/);
  });

  it('uses the declared gutter and width rather than numbers of its own', () => {
    expect(plan.gutterPx).toBe(ENVIRONMENT_ATLAS_GUTTER_PX);
    expect(plan.widthPx).toBe(ENVIRONMENT_ATLAS_WIDTH_PX);
  });
});

describe('simulation identity to artwork', () => {
  it('draws a wall and a door with different art', () => {
    const wall = edgeArt(WALL_EDGE_NUMERIC_ID);
    const door = edgeArt(DOOR_EDGE_NUMERIC_ID);
    expect(wall).toBeDefined();
    expect(door).toBeDefined();
    expect(wall).not.toEqual(door);
  });

  it('draws a wall and a door in different colours when there is no art at all', () => {
    // The same defect from the other side: `tile-layer.ts` used to paint every
    // non-zero edge with one appearance, so a finished door looked like a wall
    // whether or not any sheet had loaded.
    expect(edgeAppearance(DOOR_EDGE_NUMERIC_ID)).not.toEqual(edgeAppearance(WALL_EDGE_NUMERIC_ID));
  });

  it('has no art for an empty edge or for a value nothing writes', () => {
    expect(edgeArt(0)).toBeUndefined();
    expect(edgeArt(200)).toBeUndefined();
  });

  it('gives a zoned tile a floor and an unzoned one nothing', () => {
    const [room] = defaultRoomContentRegistry.all();
    expect(room).toBeDefined();
    expect(zonedFloorSprite(room!.numericId)).toBe('env.floor.institutional');
    expect(zonedFloorSprite(0)).toBeUndefined();
    expect(zonedFloorSprite(60_000)).toBeUndefined();
  });

  it('resolves every mapped identity to a sprite the manifest declares', () => {
    const declared = new Set<string>(ENVIRONMENT_SPRITE_IDS);
    for (const value of [WALL_EDGE_NUMERIC_ID, DOOR_EDGE_NUMERIC_ID]) {
      const art = edgeArt(value);
      expect(art).toBeDefined();
      expect(declared.has(art!.face)).toBe(true);
      expect(declared.has(art!.cap)).toBe(true);
    }
    for (const room of defaultRoomContentRegistry.all()) {
      const sprite = zonedFloorSprite(room.numericId);
      expect(sprite).toBeDefined();
      expect(declared.has(sprite!)).toBe(true);
    }
  });
});

describe('declared fallback', () => {
  /**
   * The property that makes the fallback honest: every identity the simulation
   * can produce is in exactly one of the two lists, and the "no art" list is
   * written down rather than inferred. Cataloguing an object with no artwork
   * fails here, naming it, instead of drawing nothing.
   */
  it('accounts for every catalogued object exactly once', () => {
    const coverage = objectArtCoverage();
    expect([...coverage.onFallback]).toEqual([...OBJECTS_ON_COLOUR_FALLBACK]);
    expect([...coverage.drawn, ...coverage.onFallback].sort()).toEqual(
      defaultObjectRegistry.all().map((definition) => definition.id).sort(),
    );
  });

  it('accounts for every terrain exactly once', () => {
    const coverage = terrainArtCoverage();
    expect([...coverage.onFallback]).toEqual([...TERRAIN_ON_COLOUR_FALLBACK]);
    expect([...coverage.drawn, ...coverage.onFallback].sort()).toEqual(
      DEFAULT_TERRAIN_DEFINITIONS.map((definition) => definition.id).sort(),
    );
  });

  it('draws both edge values rather than leaving one on colour', () => {
    expect(edgeArtCoverage()).toEqual({ drawn: ['wall', 'door'], onFallback: [] });
  });
});

describe('merging tiles into drawable pieces', () => {
  const grid = (rows: readonly string[]): ((x: number, y: number) => 'a' | 'b' | undefined) =>
    (x, y) => {
      const cell = rows[y]?.[x];
      return cell === 'a' || cell === 'b' ? cell : undefined;
    };

  it('collapses a solid room into one rectangle rather than one sprite per tile', () => {
    const rects = mergeFloorRects(4, grid(['....', '.aa.', '.aa.', '....']));
    expect(rects).toEqual([{ spriteId: 'a', localX: 1, localY: 1, widthTiles: 2, heightTiles: 2 }]);
  });

  it('never merges two different sprites into one rectangle', () => {
    expect(mergeFloorRects(2, grid(['ab', 'ab']))).toEqual([
      { spriteId: 'a', localX: 0, localY: 0, widthTiles: 1, heightTiles: 2 },
      { spriteId: 'b', localX: 1, localY: 0, widthTiles: 1, heightTiles: 2 },
    ]);
  });

  it('stops a rectangle where the row below is a different width', () => {
    // The greedy merge only absorbs a run whose span matches exactly, so an
    // L shape is two rectangles and every tile is covered once.
    const rects = mergeFloorRects(3, grid(['aa.', 'aaa', '...']));
    expect(rects).toEqual([
      { spriteId: 'a', localX: 0, localY: 0, widthTiles: 2, heightTiles: 1 },
      { spriteId: 'a', localX: 0, localY: 1, widthTiles: 3, heightTiles: 1 },
    ]);
  });

  it('covers exactly the tiles that asked for art, and covers none of them twice', () => {
    const rows = ['a.aa', '.aab', 'aaab', '..b.'];
    const covered = new Map<string, number>();
    for (const rect of mergeFloorRects(4, grid(rows))) {
      for (let y = rect.localY; y < rect.localY + rect.heightTiles; y += 1) {
        for (let x = rect.localX; x < rect.localX + rect.widthTiles; x += 1) {
          expect(rows[y]?.[x], `rect ${rect.spriteId} covers the wrong tile`).toBe(rect.spriteId);
          covered.set(`${x},${y}`, (covered.get(`${x},${y}`) ?? 0) + 1);
        }
      }
    }
    const wanted = rows.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '.' ? [] : [`${x},${y}`])));
    expect([...covered.keys()].sort()).toEqual([...wanted].sort());
    expect([...covered.values()].filter((count) => count !== 1)).toEqual([]);
  });

  it('returns nothing for a chunk with no floor art, and refuses a nonsense size', () => {
    expect(mergeFloorRects(4, () => undefined)).toEqual([]);
    expect(() => mergeFloorRects(-1, () => undefined)).toThrow(RangeError);
  });

  it('merges a row of identical north edges and breaks the run where a door interrupts it', () => {
    expect(
      mergeTopEdgeRuns([
        { tileX: 2, top: 1, left: 0 },
        { tileX: 3, top: 1, left: 0 },
        { tileX: 4, top: 2, left: 0 },
        { tileX: 5, top: 1, left: 0 },
      ]),
    ).toEqual([
      { value: 1, startTileX: 2, lengthTiles: 2 },
      { value: 2, startTileX: 4, lengthTiles: 1 },
      { value: 1, startTileX: 5, lengthTiles: 1 },
    ]);
  });

  it('breaks a run across a gap in the wall', () => {
    expect(
      mergeTopEdgeRuns([
        { tileX: 1, top: 1, left: 0 },
        { tileX: 3, top: 1, left: 0 },
      ]),
    ).toEqual([
      { value: 1, startTileX: 1, lengthTiles: 1 },
      { value: 1, startTileX: 3, lengthTiles: 1 },
    ]);
  });

  it('ignores west edges entirely, because two of them are two bars rather than one', () => {
    expect(
      mergeTopEdgeRuns([
        { tileX: 1, top: 0, left: 1 },
        { tileX: 2, top: 0, left: 1 },
      ]),
    ).toEqual([]);
  });
});

describe('where a raised thing lands on screen', () => {
  it('bounds a slab by the union of its two faces, whatever the proportions', () => {
    for (const [width, depth, height] of [
      [64, 14, 48],
      [14, 64, 48],
      [192, 64, 26],
      [64, 64, 0],
    ] as const) {
      const faces = slabFaces(100, 200, width, depth, height);
      const minY = Math.min(faces.top.y, faces.side.y);
      const maxY = Math.max(faces.top.y + faces.top.height, faces.side.y + faces.side.height);
      expect(faces.bounds).toEqual({ x: 100, y: minY, width, height: maxY - minY });
    }
  });

  it('lifts the top face north by the apparent height and stands the side on the southern edge', () => {
    const faces = slabFaces(0, 640, 64, 14, 48);
    expect(faces.top).toEqual({ x: 0, y: 592, width: 64, height: 14 });
    expect(faces.side).toEqual({ x: 0, y: 606, width: 64, height: 48 });
    expect(faces.bounds).toEqual({ x: 0, y: 592, width: 64, height: 62 });
  });
});

describe('a finished wall drawn twice', () => {
  const structure = (definitionId: string, phase: 'planned' | 'building' | 'built'): RenderStructure => ({
    id: 'order-1',
    definitionId,
    tileX: 3,
    tileY: 4,
    phase,
  });

  it('recognises a finished wall and a finished door as already drawn from the world edges', () => {
    expect(isDrawnAsWorldEdge(structure('wall-brick', 'built'))).toBe(true);
    expect(isDrawnAsWorldEdge(structure('door-wooden', 'built'))).toBe(true);
  });

  it('leaves an unfinished order alone, because the world carries no edge for it yet', () => {
    expect(isDrawnAsWorldEdge(structure('wall-brick', 'planned'))).toBe(false);
    expect(isDrawnAsWorldEdge(structure('wall-brick', 'building'))).toBe(false);
  });

  it('leaves anything that is not edge geometry alone', () => {
    expect(isDrawnAsWorldEdge(structure('bed-wooden', 'built'))).toBe(false);
    expect(isDrawnAsWorldEdge(structure('no-such-buildable', 'built'))).toBe(false);
  });
});
