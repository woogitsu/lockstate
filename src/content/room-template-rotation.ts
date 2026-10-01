import type { RoomTemplatePlan, TemplateSquare } from './room-template-catalog';

type QuarterTurns = 0 | 1 | 2 | 3;
type ObjectPlan = RoomTemplatePlan['objects'][number];
interface Size { readonly width: number; readonly height: number }
export interface RotatedRoomTemplateGeometry extends Omit<RoomTemplatePlan, 'objects'> {
  /** Geometry-only orientation; this is not a save or placement protocol field. */
  readonly quarterTurns: QuarterTurns;
  readonly objects: readonly (ObjectPlan & Size & { readonly quarterTurns: QuarterTurns })[];
}

/** Dormant, pure clockwise rotation around the unchanged top-left world origin. */
export function rotateRoomTemplateGeometry(
  plan: RoomTemplatePlan | RotatedRoomTemplateGeometry,
  turns: number,
  footprintOf: (id: ObjectPlan['buildableId']) => Size,
): RotatedRoomTemplateGeometry {
  if (!Number.isSafeInteger(turns)) throw new RangeError('Quarter turns must be a safe integer.');
  const normalized = ((turns % 4 + 4) % 4) as QuarterTurns;
  const prior = 'quarterTurns' in plan ? plan.quarterTurns : 0;
  let geometry: RotatedRoomTemplateGeometry = {
    ...plan, origin: { ...plan.origin }, quarterTurns: prior,
    objects: plan.objects.map(object => ({ ...object,
      ...('width' in object && 'height' in object ? {width: object.width, height: object.height} : footprintOf(object.buildableId)),
      quarterTurns: 'quarterTurns' in object ? object.quarterTurns : 0,
    })),
  };
  for (let turn = 0; turn < normalized; turn += 1) {
    const current = geometry;
    const { origin, width, height } = current;
    if (origin.x > Number.MAX_SAFE_INTEGER - height || origin.y > Number.MAX_SAFE_INTEGER - width) throw new RangeError('Rotated footprint exceeds safe tile coordinates.');
    const square = (p: TemplateSquare): TemplateSquare => ({ x: origin.x + height - 1 - (p.y - origin.y), y: origin.y + (p.x - origin.x) });
    const rectangle = (r: TemplateSquare & Size) => ({ x: origin.x + height - (r.y - origin.y) - r.height, y: origin.y + (r.x - origin.x), width: r.height, height: r.width });
    const zones = current.zones.map(zone => ({ ...zone, ...rectangle(zone) }));
    geometry = { ...current, width: height, height: width, quarterTurns: ((current.quarterTurns + 1) % 4) as QuarterTurns,
      wallSquares: current.wallSquares.map(square),
      doorSquares: current.doorSquares.map(door => ({ ...square(door), ...(door.orderTile === undefined ? {} : {orderTile: square(door.orderTile)}) })),
      zone: zones[0]!, zones,
      objects: current.objects.map(object => ({ ...object, ...rectangle(object), quarterTurns: ((object.quarterTurns + 1) % 4) as QuarterTurns })),
    };
  }
  return geometry;
}
