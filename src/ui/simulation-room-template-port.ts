import type { SimulationMessageChannel } from '../simulation/worker/worker-channel';
import { SimulationProjectionRequester } from './simulation-projections';
import type { RoomTemplatePlacementRequest, RoomTemplatePreflight } from './room-template-tool';
import type { RoomTemplateCostQuote } from './room-template-tool';
import type { RoomTemplateId } from '../content/room-template-catalog';

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

/** Reads the current catalogue quote through the same worker boundary as placement. */
export function createSimulationRoomTemplateQuote(channel: SimulationMessageChannel):
  (templateId: RoomTemplateId) => Promise<RoomTemplateCostQuote> {
  const projections = new SimulationProjectionRequester(channel);
  return async (templateId: RoomTemplateId): Promise<RoomTemplateCostQuote> => {
    const reply = await projections.request<RoomTemplateCostQuote>('world/room-template-cost', {
      target: { kind: 'room-template', templateId, origin: { x: 0, y: 0 } },
    });
    if (reply.view === undefined) throw new Error('The worker returned no room template cost.');
    return reply.view;
  };
}
