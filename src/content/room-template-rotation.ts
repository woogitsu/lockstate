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
  const { origin, width, height } = plan;
  const finalWidth = normalized % 2 === 0 ? width : height;
  const finalHeight = normalized % 2 === 0 ? height : width;
  if (!Number.isSafeInteger(origin.x) || !Number.isSafeInteger(origin.y)
    || origin.x > Number.MAX_SAFE_INTEGER - finalWidth
    || origin.y > Number.MAX_SAFE_INTEGER - finalHeight) {
    throw new RangeError('Rotated footprint exceeds safe tile coordinates.');
  }
  // Rotate local coordinates first: transient world sums must not overflow near
  // the signed tile limits, and only the requested final footprint matters.
  const rectangle = (r: TemplateSquare & Size) => {
    const x = r.x - origin.x, y = r.y - origin.y;
    const local = normalized === 0 ? {x,y,width:r.width,height:r.height}
      : normalized === 1 ? {x:height-y-r.height,y:x,width:r.height,height:r.width}
      : normalized === 2 ? {x:width-x-r.width,y:height-y-r.height,width:r.width,height:r.height}
      : {x:y,y:width-x-r.width,width:r.height,height:r.width};
    return {...local,x:origin.x+local.x,y:origin.y+local.y};
  };
  const square = (p: TemplateSquare): TemplateSquare => {
    const {x,y} = rectangle({...p,width:1,height:1});
    return {x,y};
  };
  const zones = plan.zones.map(zone => ({...zone,...rectangle(zone)}));
  return {
    ...plan, origin:{...origin}, width:finalWidth, height:finalHeight,
    quarterTurns:((prior+normalized)%4) as QuarterTurns,
    wallSquares:plan.wallSquares.map(square),
    doorSquares:plan.doorSquares.map(door => ({...square(door),
      ...(door.orderTile === undefined ? {} : {orderTile:square(door.orderTile)})})),
    zone:zones[0]!, zones,
    objects:plan.objects.map(object => ({...object,
      ...rectangle({...object,...('width' in object && 'height' in object
        ? {width:object.width,height:object.height} : footprintOf(object.buildableId))}),
      quarterTurns:(((('quarterTurns' in object ? object.quarterTurns : 0)+normalized)%4)) as QuarterTurns,
    })),
  };
}
