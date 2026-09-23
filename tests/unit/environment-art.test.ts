import { readFileSync, readdirSync } from 'node:fs';
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
  environmentRenderedArtIds,
  environmentSourceAssetIds,
  type EnvironmentSpriteDefinition,
  type EnvironmentSpriteId,
} from '../../src/rendering/assets/environment-sprites';
import {
  RENDERED_ART_BASE_PATH,
  RenderedArtCatalog,
  renderedArtCatalogSchema,
} from '../../src/rendering/assets/rendered-art-catalog';
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
  objectSprite,
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

/**
 * The second catalog ADR 0100 added, read the same way and for the same
 * reason: a claim about "this rectangle is inside that sheet" should be a
 * claim about the shipped, committed art rather than about a fixture typed
 * twice, and that is equally true of "this frame is the render's own size".
 */
const renderedCatalogPath = join(import.meta.dirname, '../../public/game-content/rendered-art.v1.json');
const committedRenderedCatalog = renderedArtCatalogSchema.parse(JSON.parse(readFileSync(renderedCatalogPath, 'utf8')));
const renderedCatalog = RenderedArtCatalog.fromParsed(RENDERED_ART_BASE_PATH, committedRenderedCatalog);

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
      if (definition.kind !== 'source-art') continue;
      const sheet = catalog.dimensions(definition.assetId);
      const rect = definition.sourceRectPx;
      expect(rect.x + rect.width, `${spriteId} runs off the east edge of ${definition.assetId}`).toBeLessThanOrEqual(sheet.width);
      expect(rect.y + rect.height, `${spriteId} runs off the south edge of ${definition.assetId}`).toBeLessThanOrEqual(sheet.height);
    }
  });

  it('names only rendered-art ids the committed catalog holds', () => {
    for (const assetId of environmentRenderedArtIds()) {
      expect(renderedCatalog.has(assetId), `no rendered-art catalog entry for "${assetId}"`).toBe(true);
    }
  });

  it('loads the cell bed from its full Blender render instead of the older owner-sheet crop', () => {
    const sprite = ENVIRONMENT_SPRITES['env.object.bed'];
    expect(sprite.kind).toBe('rendered-art');
    expect(environmentSourceAssetIds()).not.toContain('furniture.cell.bed.single.variants');
    const frame = planEnvironmentAtlas(catalog, ENVIRONMENT_SPRITES, renderedCatalog).frames.find((item) => item.spriteId === 'env.object.bed');
    expect(frame?.sheetKey).toBe('rendered-art:furniture.cell.bed.single.variants');
    expect(frame?.sourceRectPx).toEqual({ x: 0, y: 0, width: 256, height: 512 });
    expect(frame?.atlasRectPx.width).toBe(128);
    expect(frame?.atlasRectPx.height).toBe(256);
  });

  it('turns a frame size with its quarter-turn', () => {
    const upright: EnvironmentSpriteDefinition = {
      kind: 'source-art',
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
  const plan = planEnvironmentAtlas(catalog, ENVIRONMENT_SPRITES, renderedCatalog);

  it('places every declared sprite', () => {
    expect(plan.frames.map((frame) => frame.spriteId).sort()).toEqual([...ENVIRONMENT_SPRITE_IDS].sort());
  });

  it('is identical on every run, so a packed rectangle is a fact about the packer', () => {
    expect(planEnvironmentAtlas(catalog, ENVIRONMENT_SPRITES, renderedCatalog)).toEqual(plan);
  });

  it('refuses a rendered-art sprite when no rendered-art catalog is supplied', () => {
    // Not pinned to a specific asset id: `planEnvironmentAtlas` walks sprite
    // ids sorted alphabetically, so *which* rendered-art sprite is the first
    // to fail depends on what else is declared -- `env.object.bench` overtook
    // `env.object.toilet` the moment a `b` id joined it (#1020). The property
    // under test is "a rendered-art sprite with no catalog supplied throws",
    // not "which one happens to sort first", so the pattern matches either.
    expect(() => planEnvironmentAtlas(catalog)).toThrow(/names rendered-art asset "[^"]+", but no rendered-art catalog was supplied/);
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

  it('names one sheet per distinct asset across both catalogs, with a key that changes when the art does', () => {
    // Both catalogs' declared ids should appear, sorted by `sheetKey` rather
    // than by the raw id -- `environmentSourceAssetIds()` and
    // `environmentRenderedArtIds()` on their own would collide if the two
    // catalogs ever shared a raw id (they do, for `fixture.cell.toilet_sink`,
    // just not on the same sprite), which is exactly why `sheetKey` and not
    // `assetId` is the plan's own uniqueness guarantee.
    expect([...plan.sheets.map((sheet) => sheet.assetId)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
      [...environmentSourceAssetIds(), ...environmentRenderedArtIds()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(new Set(plan.sheets.map((sheet) => sheet.sheetKey)).size).toBe(plan.sheets.length);
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

/**
 * The floor #1020 asks for, and the hole underneath it that it does not close.
 *
 * #1020 asks for "a non-regression floor on `objectArtCoverage().drawn.length`"
 * so that "a later atlas change can[not] silently return an object to the
 * fallback and every existing test stay green". **Half of that gate was already
 * here**, and it was verified by mutation rather than read: adding
 * `'object.bed': 'env.floor.institutional'` to `SPRITE_BY_OBJECT_ID` fails
 * `describe('declared fallback')`'s first case above with *"expected
 * [ 'object.bench', ...(18) ] to deeply equal [ 'object.bed', 'object.bench',
 * ...(18) ]"*, because that case pins `onFallback` against
 * `OBJECTS_ON_COLOUR_FALLBACK` exactly and `drawn` is its complement. A row
 * that vanishes is therefore not silent today.
 *
 * **What is silent is the row landing in the first place.** Completing the same
 * mutation the way #1020 prescribes -- add the row, strike `'object.bed'` from
 * `OBJECTS_ON_COLOUR_FALLBACK` -- was measured on `bd6fa32` (v0.0.499) at
 * **229 files / 3344 passed, `tsc -b` exit 0**, with the bed still drawn as the
 * same slate-blue slab as every other object. Nothing observed the difference
 * because there is nothing to observe: `objectSprite`'s only caller in `src/`
 * is `objectArtCoverage`, and the loop that draws objects
 * (`tile-layer.ts:481-498`, as it stood that day) calls `structureAppearance`
 * and `paintSlab` and never asks this module anything. So the coverage number
 * the floor would defend can be raised without a pixel changing, which makes
 * the floor alone a gate on a claim rather than on the screen.
 *
 * This file cannot watch a pixel -- `vitest.config.ts` runs `environment:
 * 'node'` and the module docblock above says a mutation inside the painter is
 * unobservable here. What it can do is refuse to let the two get out of step,
 * by reading the Phaser-facing sources for the call that would make the mapping
 * matter. That is the same kind of check
 * `tests/unit/rendering-module-boundaries.test.ts` already makes over this
 * tree, for the same reason: the property is about which module reads which,
 * and it is cheaper to read the source than to boot a canvas.
 *
 * ## What changed later on 2026-09-05, and what this block is for now
 *
 * **The painter path landed, so the everything above describes a state that no
 * longer exists** -- it is kept because it is the measurement that decided the
 * order of two commits, and because the source-reading check below only makes
 * sense if a reader can see what it was built to catch. `tile-layer.ts`'s
 * structure loop now calls `acquireObjectSprite`, which reads `objectSprite`,
 * so the first case below can no longer fail the way it was designed to. Its
 * author named that as the weakest claim in the change that added it: *"the
 * gate's detector is a regex, so it proves a reference, not a draw call"*.
 *
 * **The draw call is now proved where a draw call can be proved: in a browser.**
 * `tests/browser/environment-art.spec.ts` places a finished `bed-wooden` order
 * in the harness prison, reads the pixel at the middle of the bed, removes the
 * artwork, reads the same pixel again, and requires the two to differ -- the
 * same instrument the floor art and the door already answer to. That test is
 * the replacement for the claim this describe used to carry alone.
 *
 * **The source-reading case is kept anyway, and its job has reversed.** It used
 * to say "do not add a row before the painter reads this module"; what it says
 * now is "do not delete the painter path while rows remain", which is the same
 * assertion pointing the other way and costs nothing to keep. It is *not* the
 * evidence that an object is drawn. The two cases below it are, in the two
 * halves this environment can reach: the mapping resolves to a declared sprite
 * shaped like the footprint the simulation reserved, and the count never falls.
 */
describe('object art reaching the screen', () => {
  /**
   * The directories whose whole job is to drive Phaser -- the only ones that
   * can put a pixel anywhere. The same two `rendering-module-boundaries.test.ts`
   * calls `PHASER_FACING`, and for the same reason.
   */
  const PAINTER_DIRECTORIES = ['src/rendering/phaser', 'src/rendering/scene'] as const;

  function painterSources(): readonly string[] {
    const found: string[] = [];
    for (const directory of PAINTER_DIRECTORIES) {
      const root = join(import.meta.dirname, '../..', directory);
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.ts')) found.push(readFileSync(join(root, entry.name), 'utf8'));
      }
    }
    // A directory that has stopped holding sources would make the check below
    // pass vacuously -- "nothing reads objectSprite" and "there is nothing to
    // read" are the same answer from a regex and opposite answers from a
    // reviewer. Thrown rather than asserted because this runs while the suite
    // is being collected, not inside a test.
    if (found.length === 0) throw new Error(`No painter sources under ${PAINTER_DIRECTORIES.join(' or ')}; this check would pass vacuously.`);
    return found;
  }

  /**
   * Named rather than inlined so the failure message can say which of the two
   * halves is missing, and so that wiring the painter up flips this without
   * anyone editing the assertion.
   */
  const painterReadsObjectSprite = painterSources().some((source) => /\bobjectSprite\b/.test(source));

  it('keeps a painter reading objectSprite for as long as any object is mapped', () => {
    const drawn = [...objectArtCoverage().drawn];
    expect(
      drawn.length === 0 || painterReadsObjectSprite,
      `SPRITE_BY_OBJECT_ID maps ${drawn.join(', ')} to artwork, but nothing under ${PAINTER_DIRECTORIES.join(' or ')} reads objectSprite. ` +
        'objectArtCoverage() would report those ids as drawn while the painter still fills a coloured slab for them, ' +
        'which is a claim about the screen the screen does not honour. Add the painter path before the row.',
    ).toBe(true);
  });

  /**
   * The half of "is it really drawn" that this environment *can* settle.
   *
   * A row here names a sprite id, and `tsc` proves that id is declared -- but
   * not that its rectangle is the right shape for the object it is mapped to.
   * That gap is a real one and it is the one the painter path opened: an
   * object frame fills its footprint exactly once (`acquireObjectSprite`), so a
   * frame whose proportions disagree with the footprint is drawn *stretched*,
   * and nothing else in the repository would say so. A 1x2 bed cut from a
   * square crop is a bed squashed to two-thirds of its length, on every screen,
   * silently.
   *
   * **Two ratios, because there are two places an object can be stretched and
   * they are independent.** The crop is resampled into `runtimeSizePx` when it
   * is packed, and the packed frame is then drawn into the footprint -- so a
   * rectangle measured tightly round the bed (428x197, 2.172:1) resampled into
   * a 2:1 frame is stretched at *pack* time and would leave the second ratio
   * perfect, and a correct crop packed into a frame the footprint does not
   * match is stretched at *draw* time and would leave the first perfect. Both
   * are checked, both pre-turn where the source is measured and post-turn
   * where it is drawn.
   *
   * This applies to objects only, and deliberately: `env.wall.interior.cap` is
   * a 290x30 coping band resampled to 128x28, which is a distortion of more
   * than a factor of two and is the whole point of that frame. A surface is
   * cut to be repeated; an object is cut to be looked at.
   *
   * Three percent, because that is the tolerance `acquireSprite`'s docblock
   * already argues for on the tiling path and there is no reason for an object
   * to be looser. `env.object.bed` is exact on both: a 460x230 crop into a
   * 256x128 frame, turned to 128x256, drawn into a 1x2 footprint.
   */
  const MAX_ASPECT_DRIFT = 0.03;

  const driftBetween = (
    left: { readonly width: number; readonly height: number },
    right: { readonly width: number; readonly height: number },
  ): number => {
    const target = right.width / right.height;
    return Math.abs(left.width / left.height - target) / target;
  };

  it('gives every mapped object a frame shaped like the footprint the simulation reserved', () => {
    const drawn = objectArtCoverage().drawn;
    expect(drawn.length, 'no object is mapped, so this case would pass vacuously').toBeGreaterThan(0);

    for (const objectId of drawn) {
      const definition = defaultObjectRegistry.getById(objectId);
      expect(definition, `${objectId} is reported as drawn but the object catalog does not hold it`).toBeDefined();

      const spriteId = objectSprite(objectId);
      expect(spriteId, `${objectId} is reported as drawn with no sprite id`).toBeDefined();
      expect(
        (ENVIRONMENT_SPRITE_IDS as readonly string[]).includes(spriteId!),
        `${objectId} is mapped to "${spriteId}", which the manifest does not declare`,
      ).toBe(true);

      const sprite = ENVIRONMENT_SPRITES[spriteId!];
      // A source-art sprite reviews its own crop rectangle; a rendered-art
      // sprite has none to review -- the whole render is the crop, at the
      // size the rendered-art catalog itself declares for that entry
      // (`planEnvironmentAtlas` derives the identical rectangle at plan-build
      // time rather than one being written in `environment-sprites.ts`).
      const crop = sprite.kind === 'source-art' ? sprite.sourceRectPx : renderedCatalog.dimensions(sprite.renderedArtId);
      expect(
        driftBetween(crop, sprite.runtimeSizePx),
        `${objectId} reads a ${crop.width}x${crop.height} crop and packs it into ` +
          `${sprite.runtimeSizePx.width}x${sprite.runtimeSizePx.height}, so the art is stretched when it is cut. ` +
          'Pad the crop outwards with transparent sheet rather than resampling it into a different shape.',
      ).toBeLessThanOrEqual(MAX_ASPECT_DRIFT);

      const frame = environmentFrameSize(sprite);
      const footprint = definition!.footprint;
      expect(
        driftBetween(frame, footprint),
        `${objectId} is drawn from a ${frame.width}x${frame.height} frame into a ` +
          `${footprint.width}x${footprint.height}-tile footprint, so the art is stretched when it is drawn. ` +
          'Give the frame the footprint\'s proportions.',
      ).toBeLessThanOrEqual(MAX_ASPECT_DRIFT);
    }
  });

  /**
   * The floor itself. **It was inert at zero and said so; it is load-bearing
   * from `object.bed` onwards.** Raise it with each object that starts being
   * drawn. Never lower it: an object that stops being drawn is the regression
   * this exists to name.
   */
  const OBJECT_ART_DRAWN_FLOOR = 1;

  it('never draws fewer objects as art than it did before', () => {
    expect(objectArtCoverage().drawn.length).toBeGreaterThanOrEqual(OBJECT_ART_DRAWN_FLOOR);
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
