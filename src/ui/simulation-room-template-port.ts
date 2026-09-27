import type { SimulationMessageChannel } from '../simulation/worker/worker-channel';
import { SimulationProjectionRequester } from './simulation-projections';
import type { RoomTemplatePlacementRequest, RoomTemplatePreflight } from './room-template-tool';

/** Keeps worker protocol details outside the Build panel. Every preview reads current worker state. */
export function createSimulationRoomTemplatePreflight(channel: SimulationMessageChannel):
  (request: RoomTemplatePlacementRequest) => Promise<RoomTemplatePreflight> {
  const projections = new SimulationProjectionRequester(channel);
  return async (request: RoomTemplatePlacementRequest): Promise<RoomTemplatePreflight> => {
      const reply = await projections.request<RoomTemplatePreflight>('world/room-template-preflight', {
        target: { kind: 'room-template', ...request },
      });
      if (reply.view === undefined) throw new Error('The worker returned no room template preflight.');
      return reply.view;
  };
}
