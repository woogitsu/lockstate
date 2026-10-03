import type { ObjectPlacementPreflight, ObjectPlacementPreviewRequest } from '../objects/object-placement-service';

interface ObjectPlacementPreflightSource {
  preflight(request: ObjectPlacementPreviewRequest): ObjectPlacementPreflight;
}

/** The same side-effect-free admission check used immediately before actual place. */
export function projectObjectPlacementPreflight(source: ObjectPlacementPreflightSource,
  request: ObjectPlacementPreviewRequest): ObjectPlacementPreflight {
  return source.preflight(request);
}
