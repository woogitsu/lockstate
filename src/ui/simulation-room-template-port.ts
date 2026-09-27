import type { SimulationMessageChannel } from '../simulation/worker/worker-channel';
import type { SimulationCommandSender } from './simulation-commands';
import { SimulationProjectionRequester } from './simulation-projections';
import type { RoomTemplatePlacementPort, RoomTemplatePlacementRequest, RoomTemplatePreflight } from './room-template-tool';

/** Keeps worker protocol details outside the Build panel. Every preview reads current worker state. */
export function createSimulationRoomTemplatePort(
  channel: SimulationMessageChannel,
  commands: SimulationCommandSender,
): RoomTemplatePlacementPort {
  const projections = new SimulationProjectionRequester(channel);
  return {
    async preflight(request: RoomTemplatePlacementRequest): Promise<RoomTemplatePreflight> {
      const reply = await projections.request<RoomTemplatePreflight>('world/room-template-preflight', {
        target: { kind: 'room-template', ...request },
      });
      if (reply.view === undefined) throw new Error('The worker returned no room template preflight.');
      return reply.view;
    },
    async place(request: RoomTemplatePlacementRequest): Promise<void> {
      // Submission only queues the command. The worker checks again atomically;
      // a later refusal uses the HUD's existing simulation notice route.
      commands.submit({ type: 'PlaceRoomTemplate', ...request });
    },
  };
}
