export {
  isObjectOrientation,
  objectFootprintTiles,
  orientedFootprint,
  placedObjectIdFor,
  tileKey,
  type ObjectFootprint,
  type ObjectOrientation,
  type PlacedObject,
} from './placed-object';
export { PlacedObjectRegistry, placedObjectAt } from './placed-object-registry';
export {
  MAX_RECORDED_PLACEMENT_REFUSALS,
  ObjectPlacementService,
  placedObjectIdForBuildable,
  type ObjectOrderSink,
  type PlaceObjectAccepted,
  type PlaceObjectOutcome,
  type PlaceObjectRefusal,
  type PlaceObjectRefusalReason,
  type PlaceObjectRequest,
  type RemoveObjectOrderCancelled,
  type RemoveObjectOutcome,
  type RemoveObjectRefusal,
  type RemoveObjectRefusalReason,
  type RemoveObjectRemoved,
  type RemoveObjectRequest,
} from './object-placement-service';
export {
  deriveRoomCapacity,
  roomBoundsOf,
  roomContains,
  roomInstanceContaining,
  RoomCapacityResolver,
  SLEEP_SURFACE_CAPABILITY,
} from './room-capacity';
