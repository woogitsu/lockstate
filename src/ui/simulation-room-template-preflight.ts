import type { RoomTemplateId, TemplateSquare } from '../content/room-template-catalog';
import type { RoomTemplatePlacement } from '../simulation/construction/room-template-placement';
import { SimulationProjectionRequester, type ProjectionMessageChannel, type ProjectionRequesterOptions } from './simulation-projections';

/** Pulls the authoritative whole-template preflight for the Build HUD preview. */
export class RoomTemplatePreflightReader {
  private readonly requester: SimulationProjectionRequester;
  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }
  public async read(templateId: RoomTemplateId, origin: TemplateSquare, mirrorX = false): Promise<RoomTemplatePlacement | undefined> {
    const reply = await this.requester.request<RoomTemplatePlacement>('world/room-template-preflight', {
      target: { kind: 'room-template', templateId, origin, ...(mirrorX ? { mirrorX: true } : {}) },
    });
    return reply.view;
  }
  public dispose(): void { this.requester.dispose(); }
}