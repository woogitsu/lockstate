import { obliqueAssetIdForActor } from '../assets/oblique-actor-mapping';
import type { RenderActor, RenderFrame } from '../feed/render-feed';
import {
  BUILDING_ALPHA,
  EDGE_WALL_THICKNESS_TILES,
  PLANNED_ALPHA,
  edgeAppearance,
  structureAppearance,
  terrainAppearance,
  zoningTint,
} from '../world/appearance';
import { catalogueObjectId, isDrawnAsWorldEdge, squareWallStructure, type RenderStructure } from '../world/structures';
import { obliqueCanonicalAssetIdForObject } from '../assets/oblique-object-mapping';
import { DOOR_EDGE_NUMERIC_ID } from '../../simulation/construction/definition';
import { createTileSample } from '../world/world-view';
import { TILE_SIZE_PX, tileRangeContains, visibleTileRange } from '../tile-metrics';
import { groundToScreen, visibleGroundBounds, type ObliqueCameraState } from './oblique-projection';
import { obliqueDepthForAnchor, projectedRectPrism, projectedTileQuad, type TileQuad } from './oblique-geometry';
import type { Point } from './coordinates';
import { terrainFloorSpriteByNumericId, zonedFloorSprite } from '../world/environment-art';
import type { EnvironmentSpriteId } from '../assets/environment-sprites';
import { zoningTintAlphaOverArt } from '../world/appearance';

export interface ObliqueGroundTile {
  readonly tileX: number;
  readonly tileY: number;
  readonly quad: TileQuad;
  readonly fill: number;
  readonly zoningTint: number | undefined;
  readonly owned: boolean;
  readonly floorSprite?: EnvironmentSpriteId;
  readonly zoningArtAlpha?: number;
}

export interface ObliqueSolid {
  readonly kind: 'north-edge' | 'west-edge' | 'structure';
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly footprint: TileQuad;
  readonly top: TileQuad;
  readonly topFill: number;
  readonly sideFill: number;
  readonly alpha: number;
  readonly viewDepth: number;
  /** Canonical rendered-art id, when this solid has an authored PNG. */
  readonly assetId?: string;
}

export interface ObliqueActorPoint {
  readonly kind: 'actor';
  readonly tileX: number;
  readonly tileY: number;
  readonly assetId?: string;
  readonly id: number;
  readonly foot: Point;
  readonly head: Point;
  readonly viewDepth: number;
}

export interface ObliqueWorldProjection {
  readonly ground: readonly ObliqueGroundTile[];
  /** Sort together with actors before painting so turning the view changes occlusion. */
  readonly raised: readonly (ObliqueSolid | ObliqueActorPoint)[];
  readonly loadedTilesVisited: number;
}

export function projectObliqueActors(actors: readonly RenderActor[], camera: ObliqueCameraState): ObliqueActorPoint[] {
  const range = visibleTileRange(visibleGroundBounds(camera), 3);
  const projected: ObliqueActorPoint[] = [];
  for (const actor of actors) {
    if (!tileRangeContains(range, actor.tileX, actor.tileY)) continue;
    const x = (actor.tileX + 0.5) * TILE_SIZE_PX;
    const y = (actor.tileY + 0.5) * TILE_SIZE_PX;
    const assetId = obliqueAssetIdForActor(actor.assetId);
    projected.push({
      kind: 'actor', id: actor.id, tileX: actor.tileX + 0.5, tileY: actor.tileY + 0.5,
      ...(assetId === undefined ? {} : { assetId }),
      foot: groundToScreen({ x, y }, camera),
      head: groundToScreen({ x, y, z: 0.8 * TILE_SIZE_PX }, camera),
      viewDepth: obliqueDepthForAnchor({ x, y }, camera.yawRadians),
    });
  }
  return projected;
}

export function sortObliqueRaised(items: (ObliqueSolid | ObliqueActorPoint)[]): void {
  items.sort((a, b) => a.viewDepth - b.viewDepth || a.kind.localeCompare(b.kind) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Projects a real immutable render frame without changing the simulation grid.
 * Legacy edges retain their narrow prisms. Occupied wall squares draw full-tile
 * prisms from the saved world layer, independently of construction history.
 */
export function projectObliqueWorldFrame(frame: RenderFrame, camera: ObliqueCameraState): ObliqueWorldProjection {
  const range = visibleTileRange(visibleGroundBounds(camera), 3);
  const ground: ObliqueGroundTile[] = [];
  const raised: (ObliqueSolid | ObliqueActorPoint)[] = [];
  const world = frame.world;
  const size = world.chunkSize;
  const sample = createTileSample();
  const neighborSample = createTileSample();
  let loadedTilesVisited = 0;

  // Near perimeter walls hide the room behind them in an angled view. Lower
  // their painted height, leaving the occupied square/edge and worker world
  // entirely untouched. A zoned floor behind the wall is direct evidence of
  // an interior; yaw decides which side is behind, not a fixed south row.
  const cutawayHeight = (heightTiles: number): number => Math.min(heightTiles, 0.34);
  const isInteriorTile = (x: number, y: number): boolean => {
    world.readTile(x, y, neighborSample);
    if (!neighborSample.loaded || world.getSquareStructureAt(x, y) !== 0) return false;
    if (neighborSample.zoning !== 0) return true;
    return frame.rooms.some((room) => x >= room.anchorTileX && y >= room.anchorTileY &&
      x < room.anchorTileX + room.width && y < room.anchorTileY + room.height);
  };
  const behind = (wallX: number, wallY: number, neighbors: readonly (readonly [number, number])[]): boolean => {
    const wallDepth = obliqueDepthForAnchor({ x: (wallX + 0.5) * TILE_SIZE_PX, y: (wallY + 0.5) * TILE_SIZE_PX }, camera.yawRadians);
    for (const [neighborX, neighborY] of neighbors) {
      const neighborDepth = obliqueDepthForAnchor({ x: (neighborX + 0.5) * TILE_SIZE_PX, y: (neighborY + 0.5) * TILE_SIZE_PX }, camera.yawRadians);
      if (neighborDepth >= wallDepth - 0.001) continue;
      if (isInteriorTile(neighborX, neighborY)) return true;
    }
    return false;
  };
  const squareNeedsCutaway = (tileX: number, tileY: number): boolean => behind(tileX, tileY, [
    [tileX - 1, tileY], [tileX + 1, tileY], [tileX, tileY - 1], [tileX, tileY + 1],
    [tileX - 1, tileY - 1], [tileX + 1, tileY - 1], [tileX - 1, tileY + 1], [tileX + 1, tileY + 1],
  ]);
  // A low wall can still cover a sink or machine immediately behind it.
  // Hide only the near wall squares whose projected volume overlaps a built
  // interior fixture. The wall remains in the world, navigation and save.
  const interiorFixtures = frame.structures.flatMap((structure) => {
    if (structure.phase !== 'built') return [];
    const appearance = structureAppearance(structure.definitionId);
    if (appearance.kind !== 'object' || !isInteriorTile(structure.tileX, structure.tileY)) return [];
    const x = structure.tileX * TILE_SIZE_PX;
    const y = structure.tileY * TILE_SIZE_PX;
    const prism = projectedRectPrism(x, y, appearance.footprintTiles.width * TILE_SIZE_PX,
      appearance.footprintTiles.height * TILE_SIZE_PX, appearance.heightTiles * TILE_SIZE_PX, camera);
    const points = [...prism.footprint, ...prism.top];
    return [{
      tileX: structure.tileX, tileY: structure.tileY,
      viewDepth: obliqueDepthForAnchor({ x: x + appearance.footprintTiles.width * TILE_SIZE_PX / 2,
        y: y + appearance.footprintTiles.height * TILE_SIZE_PX / 2 }, camera.yawRadians),
      minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
      minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y)),
    }];
  });
  const obscuresFixture = (tileX: number, tileY: number): boolean => {
    const x = tileX * TILE_SIZE_PX;
    const y = tileY * TILE_SIZE_PX;
    const prism = projectedRectPrism(x, y, TILE_SIZE_PX, TILE_SIZE_PX,
      cutawayHeight(structureAppearance('wall-brick').heightTiles) * TILE_SIZE_PX, camera);
    const points = [...prism.footprint, ...prism.top];
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    const wallDepth = obliqueDepthForAnchor({ x: x + TILE_SIZE_PX / 2, y: y + TILE_SIZE_PX / 2 }, camera.yawRadians);
    return interiorFixtures.some(fixture => Math.abs(fixture.tileX - tileX) <= 3 && Math.abs(fixture.tileY - tileY) <= 3 &&
      fixture.viewDepth < wallDepth - 0.001 &&
      Math.min(maxX, fixture.maxX) - Math.max(minX, fixture.minX) > 2 &&
      Math.min(maxY, fixture.maxY) - Math.max(minY, fixture.minY) > 2);
  };
  const edgeNeedsCutaway = (kind: 'north-edge' | 'west-edge', tileX: number, tileY: number): boolean => {
    const sides: readonly (readonly [number, number])[] = kind === 'north-edge'
      ? [[tileX, tileY - 1], [tileX, tileY]]
      : [[tileX - 1, tileY], [tileX, tileY]];
    // Compare side centres to the actual boundary rather than the tile centre.
    const boundaryX = kind === 'west-edge' ? tileX : tileX + 0.5;
    const boundaryY = kind === 'north-edge' ? tileY : tileY + 0.5;
    return behind(boundaryX - 0.5, boundaryY - 0.5, sides);
  };

  const edge = (kind: 'north-edge' | 'west-edge', tileX: number, tileY: number, value: number): void => {
    const appearance = edgeAppearance(value);
    const cutaway = value !== DOOR_EDGE_NUMERIC_ID && edgeNeedsCutaway(kind, tileX, tileY);
    const x = tileX * TILE_SIZE_PX;
    const y = tileY * TILE_SIZE_PX;
    const thickness = EDGE_WALL_THICKNESS_TILES * TILE_SIZE_PX;
    const width = kind === 'north-edge' ? TILE_SIZE_PX : thickness;
    const depth = kind === 'north-edge' ? thickness : TILE_SIZE_PX;
    const geometry = projectedRectPrism(x, y, width, depth, (cutaway ? cutawayHeight(appearance.heightTiles) : appearance.heightTiles) * TILE_SIZE_PX, camera);
    const assetId = obliqueCanonicalAssetIdForObject(value === DOOR_EDGE_NUMERIC_ID ? 'door.interior' : 'wall.interior.module', { edge: kind === 'west-edge' ? 'west' : 'north', cutaway });
    raised.push({
      kind, id: `${kind}:${tileX}:${tileY}`, tileX, tileY,
      ...geometry, topFill: appearance.topFill, sideFill: appearance.sideFill, alpha: 1,
      viewDepth: obliqueDepthForAnchor({ x: x + width / 2, y: y + depth / 2 }, camera.yawRadians),
      ...(assetId === undefined ? {} : { assetId }),
    });
  };

  const squareOrders = new Map(frame.structures.filter((entry) => entry.phase === 'built' && entry.footprint === 'square')
    .map((entry) => [`${entry.tileX}:${entry.tileY}`, entry]));
  const structureSolid = (structure: RenderStructure): void => {
    const appearance = structureAppearance(structure.definitionId);
    const cutaway = structure.phase === 'built' && appearance.kind === 'wall' && squareNeedsCutaway(structure.tileX, structure.tileY);
    if (cutaway && obscuresFixture(structure.tileX, structure.tileY)) return;
    const x = structure.tileX * TILE_SIZE_PX;
    const y = structure.tileY * TILE_SIZE_PX;
    const width = appearance.footprintTiles.width * TILE_SIZE_PX;
    const depth = appearance.footprintTiles.height * TILE_SIZE_PX;
    const geometry = projectedRectPrism(x, y, width, depth, (cutaway ? cutawayHeight(appearance.heightTiles) : appearance.heightTiles) * TILE_SIZE_PX, camera);
    const assetId = structure.phase === 'built' && appearance.kind === 'wall'
      ? cutaway ? 'wall.square.brick.low' : 'wall.square.brick.full'
      : obliqueCanonicalAssetIdForObject(catalogueObjectId(structure.definitionId) ?? structure.definitionId);
    raised.push({
      kind: 'structure', id: structure.id, tileX: structure.tileX, tileY: structure.tileY,
      ...geometry, topFill: appearance.topFill, sideFill: appearance.sideFill,
      alpha: structure.phase === 'planned' ? PLANNED_ALPHA : structure.phase === 'building' ? BUILDING_ALPHA : 1,
      viewDepth: obliqueDepthForAnchor({ x: x + width / 2, y: y + depth / 2 }, camera.yawRadians),
      ...(assetId === undefined ? {} : { assetId }),
    });
  };

  // Visit only materialised chunks intersecting the inverse-projected view.
  // A sparse world with two far-apart chunks never scans the gap between them.
  for (const position of world.loadedChunkPositions) {
    const minX = Math.max(range.minTileX, position.chunkX * size);
    const maxX = Math.min(range.maxTileX, (position.chunkX + 1) * size - 1);
    const minY = Math.max(range.minTileY, position.chunkY * size);
    const maxY = Math.min(range.maxTileY, (position.chunkY + 1) * size - 1);
    for (let tileY = minY; tileY <= maxY; tileY += 1) {
      for (let tileX = minX; tileX <= maxX; tileX += 1) {
        world.readTile(tileX, tileY, sample);
        loadedTilesVisited += 1;
        const terrain = terrainAppearance(sample.terrainNumericId);
        const floorSprite = zonedFloorSprite(sample.zoning) ?? terrainFloorSpriteByNumericId(sample.terrainNumericId);
        ground.push({
          tileX, tileY, quad: projectedTileQuad(tileX, tileY, camera),
          fill: (tileX + tileY) % 2 === 0 ? terrain.fill : terrain.fillAlternate,
          zoningTint: zoningTint(sample.zoning), owned: sample.owned,
          ...(floorSprite === undefined ? {} : { floorSprite }),
          zoningArtAlpha: zoningTintAlphaOverArt(sample.zoning),
        });
        if (world.getSquareStructureAt(tileX, tileY) === 1) {
          structureSolid(squareOrders.get(`${tileX}:${tileY}`) ?? squareWallStructure(tileX, tileY));
        }
        if (sample.topEdge !== 0) edge('north-edge', tileX, tileY, sample.topEdge);
        if (sample.leftEdge !== 0) edge('west-edge', tileX, tileY, sample.leftEdge);
      }
    }
  }

  for (const structure of frame.structures) {
    if (!tileRangeContains(range, structure.tileX, structure.tileY)) continue;
    if (structure.phase === 'built' && structure.footprint === 'square' && world.getSquareStructureAt(structure.tileX, structure.tileY) === 1) continue;
    world.readTile(structure.tileX, structure.tileY, sample);
    if (isDrawnAsWorldEdge(structure) && (sample.topEdge !== 0 || sample.leftEdge !== 0)) continue;
    structureSolid(structure);
  }

  raised.push(...projectObliqueActors(frame.actors, camera));
  sortObliqueRaised(raised);
  return { ground, raised, loadedTilesVisited };
}
