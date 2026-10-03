import type { ObjectPlacementPreflight } from '../simulation/objects/object-placement-service';
import type { SimulationMessageChannel } from '../simulation/worker/worker-channel';
import { SimulationProjectionRequester } from './simulation-projections';

export interface ObjectPlacementPreviewTarget {
  readonly definitionId: string;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly quarterTurns?: 0 | 1 | 2 | 3;
}

/** Uses the existing correlated read channel; the caller owns selection/session validity. */
export function createSimulationObjectPlacementPreflight(channel: SimulationMessageChannel):
  (target: ObjectPlacementPreviewTarget) => Promise<ObjectPlacementPreflight> {
  const projections = new SimulationProjectionRequester(channel);
  return async target => {
    const reply = await projections.request<ObjectPlacementPreflight>('world/object-placement-preflight', {
      target: { kind: 'object-placement', ...target },
    });
    if (reply.view === undefined) throw new Error('The worker returned no object placement preflight.');
    return reply.view;
  };
}
