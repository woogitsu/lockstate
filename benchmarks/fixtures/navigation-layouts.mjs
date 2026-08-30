/**
 * World layouts for the production-code navigation benchmarks (#410),
 * built out of the **real** `SparseWorld`, `DoorRegistry` and
 * `buildNavigationGraph` rather than a model of them.
 *
 * A fixture here supplies *inputs only* -- geometry, doors, and which tiles
 * an actor starts and ends on. It never computes a route, a cost or a work
 * count, so nothing a scenario measures can be produced by the fixture and
 * compared against itself; every number a scenario reports comes out of
 * `src/simulation/navigation/`.
 *
 * ## Why these are not `tests/helpers/navigation-fixture.ts`
 *
 * That helper builds the same *shape* (cells off a corridor, one shared
 * canteen) and is the right thing for a unit test, but it is built at
 * `CELL_BLOCK_CHUNK_SIZE = 3` -- three tiles to a chunk, chosen so a test's
 * loaded chunks contain exactly the layout and no padding. Production runs at
 * `32` ([ADR 0004](../../docs/adr/0004-chunk-size-selection.md), and
 * `createNewSimulationRuntime`), and chunk size is an input to
 * `buildNavigationGraph`'s flood fill and to how many chunk states a graph
 * rebuild walks. A performance benchmark measured at a chunk size the game
 * never uses is a model of production wearing production's clothes, which is
 * the defect #410 exists to remove -- so these layouts are built at 32.
 *
 * The second reason is ownership: a CI-gating counted-work ceiling must not
 * move because a unit-test helper was edited for a test's convenience.
 */
import { loadNavigationModules } from '../production-modules.mjs';

/** ADR 0004's production chunk size; `createNewSimulationRuntime` uses the same value. */
export const PRODUCTION_CHUNK_SIZE = 32;

const CELL_WIDTH = 3;
const CELL_HEIGHT = 3;

/*
 * One cache per layout shape rather than one shared `Map` (#602). An untyped
 * `Map.get` returns `any`, and `any` on a cache-hit branch makes the whole
 * builder's inferred return type `any` -- so every scenario reading
 * `layout.world` or `layout.graph` stops being typechecked, silently. Typing
 * each cache off its own uncached creator is what keeps that from happening,
 * and two creators cannot share one typed cache without a union that no
 * caller could narrow.
 */

/** @type {Map<string, Awaited<ReturnType<typeof createPrisonBlockLayout>>>} */
const prisonBlockLayoutCache = new Map();

/** @type {Map<string, Awaited<ReturnType<typeof createOpenRegionLayout>>>} */
const openRegionLayoutCache = new Map();

function loadChunks(nav, world, tileWidth, tileHeight) {
  const chunkColumns = Math.ceil(tileWidth / PRODUCTION_CHUNK_SIZE);
  const chunkRows = Math.ceil(tileHeight / PRODUCTION_CHUNK_SIZE);
  const chunkPositions = [];

  for (let cy = 0; cy < chunkRows; cy += 1) {
    for (let cx = 0; cx < chunkColumns; cx += 1) {
      const position = { x: nav.chunkCoordinate(cx), y: nav.chunkCoordinate(cy) };
      world.load(position);
      // A prison block is by construction land the player owns; a
      // loaded-but-unowned chunk is not a state a session reaches.
      world.setOwned(position, true);
      chunkPositions.push(position);
    }
  }

  return {
    chunkPositions,
    loadedWidth: chunkColumns * PRODUCTION_CHUNK_SIZE,
    loadedHeight: chunkRows * PRODUCTION_CHUNK_SIZE,
  };
}

function buildGraph(nav, world, doors, chunkPositions) {
  const chunkStates = chunkPositions.map((position) => {
    const state = world.getChunk(position);
    if (state === undefined) throw new Error('Benchmark layout chunk must be loaded.');
    return state;
  });
  return nav.buildNavigationGraph(world, doors, chunkStates);
}

/**
 * A cell block: `cellCount` three-by-three cells alternating north and south
 * of a one-tile corridor, each reached through exactly one door whose
 * state/clearance/permission profile cycles by index, plus one open canteen
 * region at the east end behind a single entrance door.
 *
 * That is the shape ADR 0007's flow-field sharing targets (many actors, one
 * destination region) and the shape its work budget was written for. The
 * door profile cycle (`% 7` closed, `% 4` clearance, `% 5` medical) matches
 * the one `tests/helpers/navigation-fixture.ts` uses, so a route that fails
 * here fails for a reason the unit tests already characterise.
 *
 * `cellDoorSideTiles[i]` is the tile of cell `i` **furthest** from the
 * corridor, so a route into or out of a cell always crosses the whole cell
 * plus its door rather than stopping on the threshold.
 */
export async function buildPrisonBlockLayout(cellCount, canteenWidth) {
  const key = `prison:${cellCount}:${canteenWidth}`;
  const cached = prisonBlockLayoutCache.get(key);
  if (cached !== undefined) return cached;

  const layout = await createPrisonBlockLayout(cellCount, canteenWidth);
  prisonBlockLayoutCache.set(key, layout);
  return layout;
}

/** The uncached builder; split out only so the cache above can be typed by it. */
async function createPrisonBlockLayout(cellCount, canteenWidth) {
  const nav = await loadNavigationModules();
  const t = (x, y) => ({ x: nav.tileCoordinate(x), y: nav.tileCoordinate(y) });

  const columns = Math.ceil(cellCount / 2);
  const blockWidth = columns * CELL_WIDTH;
  const tileWidth = blockWidth + canteenWidth;
  const tileHeight = CELL_HEIGHT + 1 + CELL_HEIGHT;
  const corridorY = CELL_HEIGHT;

  const world = new nav.SparseWorld(PRODUCTION_CHUNK_SIZE);
  const doors = new nav.DoorRegistry();
  const { chunkPositions, loadedWidth, loadedHeight } = loadChunks(nav, world, tileWidth, tileHeight);

  // Every internal edge of the block is walled by default and then
  // selectively opened, so the block contains exactly this layout. The chunk
  // padding around it (a 108x7 block does not fill 128x32 at chunk size 32)
  // is left as open ground and sealed off below -- undeveloped land beside
  // the prison, which is what a real session's loaded chunks hold. Walling
  // it tile by tile instead would make `buildNavigationGraph` mint one
  // single-tile region per padding tile -- 3,340 of them here against the
  // block's 66 -- and a graph that shape is an artefact of the fixture.
  for (let x = 0; x < tileWidth; x += 1) {
    for (let y = 0; y < tileHeight; y += 1) {
      if (x > 0) world.setLeftEdge(t(x, y), 1);
      if (y > 0) world.setTopEdge(t(x, y), 1);
    }
  }

  for (let x = 1; x < tileWidth; x += 1) world.setLeftEdge(t(x, corridorY), 0);

  const cellDoorSideTiles = [];
  for (let index = 0; index < cellCount; index += 1) {
    const column = Math.floor(index / 2);
    const northSide = index % 2 === 0;
    const originX = column * CELL_WIDTH;
    const originY = northSide ? 0 : corridorY + 1;

    for (let dx = 0; dx < CELL_WIDTH; dx += 1) {
      for (let dy = 0; dy < CELL_HEIGHT; dy += 1) {
        if (dx > 0) world.setLeftEdge(t(originX + dx, originY + dy), 0);
        if (dy > 0) world.setTopEdge(t(originX + dx, originY + dy), 0);
      }
    }

    const doorX = originX + 1;
    doors.register({
      id: `cell-door-${index}`,
      position: northSide ? t(doorX, corridorY) : t(doorX, corridorY + 1),
      side: 'top',
      state: index % 7 === 0 ? 'closed' : 'open',
      requiredSecurityClearance: index % 4,
      ...(index % 5 === 0 ? { requiredPermission: 'medical-wing' } : {}),
      costMultiplier: 1,
    });

    cellDoorSideTiles.push(t(doorX, northSide ? originY : originY + CELL_HEIGHT - 1));
  }

  const canteenTiles = [];
  for (let x = blockWidth; x < tileWidth; x += 1) {
    for (let y = 0; y < tileHeight; y += 1) {
      canteenTiles.push(t(x, y));
      if (y > 0) world.setTopEdge(t(x, y), 0);
      if (x > blockWidth) world.setLeftEdge(t(x, y), 0);
    }
  }
  doors.register({
    id: 'canteen-entrance',
    position: t(blockWidth, corridorY),
    side: 'left',
    state: 'open',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  // Seal the chunk padding east of and below the used layout.
  if (loadedWidth > tileWidth) {
    for (let y = 0; y < loadedHeight; y += 1) world.setLeftEdge(t(tileWidth, y), 1);
  }
  if (loadedHeight > tileHeight) {
    for (let x = 0; x < loadedWidth; x += 1) world.setTopEdge(t(x, tileHeight), 1);
  }

  const graph = buildGraph(nav, world, doors, chunkPositions);
  const layout = Object.freeze({
    nav,
    world,
    doors,
    graph,
    chunkPositions,
    cellDoorSideTiles,
    canteenTiles,
    tileWidth,
    tileHeight,
    regionCount: graph.regionTiles.size,
  });

  return layout;
}

/**
 * One open region `side` tiles square with no doors at all -- an exercise
 * yard, or an unfurnished plot before any interior wall is built.
 *
 * This is the shape that makes ADR 0007's per-tick budget observable in the
 * one direction the budget cannot bound: `PathRequestQueue.processTick`
 * checks `usedBudget >= workBudget` *before* starting a request and never
 * during it, so a single `boundedLocalSearch` whose bound is one huge region
 * charges its full cost whatever the budget says. The layout carries no
 * opinion about how large that cost is; the scenario reads it out of the real
 * `SearchStats`.
 */
export async function buildOpenRegionLayout(side) {
  const key = `open:${side}`;
  const cached = openRegionLayoutCache.get(key);
  if (cached !== undefined) return cached;

  const layout = await createOpenRegionLayout(side);
  openRegionLayoutCache.set(key, layout);
  return layout;
}

/** The uncached builder; split out only so the cache above can be typed by it. */
async function createOpenRegionLayout(side) {
  const nav = await loadNavigationModules();
  const t = (x, y) => ({ x: nav.tileCoordinate(x), y: nav.tileCoordinate(y) });

  const world = new nav.SparseWorld(PRODUCTION_CHUNK_SIZE);
  const doors = new nav.DoorRegistry();
  const { chunkPositions, loadedWidth, loadedHeight } = loadChunks(nav, world, side, side);
  const graph = buildGraph(nav, world, doors, chunkPositions);

  const layout = Object.freeze({
    nav,
    world,
    doors,
    graph,
    chunkPositions,
    origin: t(0, 0),
    /** Diagonally opposite: the worst case for a Manhattan heuristic, whose every route of equal length ties. */
    diagonalDestination: t(loadedWidth - 1, loadedHeight - 1),
    /** Same row, far side: the best case, where an admissible heuristic has no ties to break and expands one tile per step. */
    straightDestination: t(loadedWidth - 1, 0),
    tileWidth: loadedWidth,
    tileHeight: loadedHeight,
    regionCount: graph.regionTiles.size,
  });

  return layout;
}
