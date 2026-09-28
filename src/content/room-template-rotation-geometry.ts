import type { RoomTemplatePlan, TemplateSquare } from './room-template-catalog';

/** Clockwise quarter turns from the authored, unrotated room plan. */
export type TemplateQuarterTurns = 0 | 1 | 2 | 3;

export interface TemplateFootprint extends TemplateSquare {
  readonly width: number;
  readonly height: number;
}

/** World edges have only north and west canonical storage slots. */
export interface TemplateCanonicalEdge extends TemplateSquare {
  readonly edge: 'north' | 'west';
}

/** Transform one occupied tile within an authored width-by-height plan. */
export function rotateTemplateSquare(
  tile: TemplateSquare, width: number, height: number, turns: TemplateQuarterTurns,
): TemplateSquare {
  switch (turns) {
    case 0: return { x: tile.x, y: tile.y };
    case 1: return { x: height - 1 - tile.y, y: tile.x };
    case 2: return { x: width - 1 - tile.x, y: height - 1 - tile.y };
    case 3: return { x: tile.y, y: width - 1 - tile.x };
  }
}

/** Rotate the whole occupied rectangle, keeping its new top-left anchor. */
export function rotateTemplateFootprint(
  footprint: TemplateFootprint, width: number, height: number, turns: TemplateQuarterTurns,
): TemplateFootprint {
  switch (turns) {
    case 0: return { ...footprint };
    case 1: return { x: height - footprint.y - footprint.height, y: footprint.x,
      width: footprint.height, height: footprint.width };
    case 2: return { x: width - footprint.x - footprint.width, y: height - footprint.y - footprint.height,
      width: footprint.width, height: footprint.height };
    case 3: return { x: footprint.y, y: width - footprint.x - footprint.width,
      width: footprint.height, height: footprint.width };
  }
}

/** Rotate a boundary segment by its vertices, then normalize to north/west. */
export function rotateTemplateEdge(
  edge: TemplateCanonicalEdge, width: number, height: number, turns: TemplateQuarterTurns,
): TemplateCanonicalEdge {
  const rotateVertex = (x: number, y: number): TemplateSquare => {
    switch (turns) {
      case 0: return { x, y };
      case 1: return { x: height - y, y: x };
      case 2: return { x: width - x, y: height - y };
      case 3: return { x: y, y: width - x };
    }
  };
  const a = rotateVertex(edge.x, edge.y);
  const b = rotateVertex(edge.x + (edge.edge === 'north' ? 1 : 0), edge.y + (edge.edge === 'west' ? 1 : 0));
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), edge: a.y === b.y ? 'north' : 'west' };
}

export interface RotatedRoomTemplateLayout {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly TemplateSquare[];
  readonly doors: readonly { readonly square: TemplateSquare; readonly orderEdge: TemplateCanonicalEdge }[];
  readonly zones: readonly RoomTemplatePlan['zone'][];
  readonly objects: readonly {
    readonly buildableId: RoomTemplatePlan['objects'][number]['buildableId'];
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly orientation: TemplateQuarterTurns;
  }[];
}

/**
 * Prepare the entire authored plan for a future rotated command. This has no
 * side effects and does not change today's unrotated command or save format.
 * The caller supplies catalogue footprints so anchors move with all occupied
 * furniture tiles; rotating only the anchor would clip wide objects.
 */
export function rotateRoomTemplateLayout(
  plan: RoomTemplatePlan,
  turns: TemplateQuarterTurns,
  footprintOf: (buildableId: RoomTemplatePlan['objects'][number]['buildableId']) =>
    Pick<TemplateFootprint, 'width' | 'height'>,
): RotatedRoomTemplateLayout {
  const { width, height, origin } = plan;
  const local = (point: TemplateSquare): TemplateSquare => ({ x: point.x - origin.x, y: point.y - origin.y });
  const world = (point: TemplateSquare): TemplateSquare => ({ x: point.x + origin.x, y: point.y + origin.y });
  const rotatedSquare = (point: TemplateSquare): TemplateSquare => world(rotateTemplateSquare(local(point), width, height, turns));
  const rotatedFootprint = (rectangle: TemplateFootprint): TemplateFootprint => {
    const result = rotateTemplateFootprint({ ...local(rectangle), width: rectangle.width, height: rectangle.height }, width, height, turns);
    return { ...world(result), width: result.width, height: result.height };
  };
  const rotatedEdge = (edge: TemplateCanonicalEdge): TemplateCanonicalEdge => {
    const result = rotateTemplateEdge({ ...local(edge), edge: edge.edge }, width, height, turns);
    return { ...world(result), edge: result.edge };
  };
  return {
    width: turns % 2 === 0 ? width : height,
    height: turns % 2 === 0 ? height : width,
    walls: plan.wallSquares.map(rotatedSquare),
    doors: plan.doorSquares.map((door) => ({
      square: rotatedSquare(door),
      orderEdge: rotatedEdge({ ...(door.orderTile ?? door), edge: 'north' }),
    })),
    zones: plan.zones.map((zone) => ({
      roomId: zone.roomId,
      ...rotatedFootprint(zone),
    })),
    objects: plan.objects.map((object) => ({
      buildableId: object.buildableId,
      ...rotatedFootprint({ ...object, ...footprintOf(object.buildableId) }),
      orientation: turns,
    })),
  };
}
